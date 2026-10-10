// SPDX-License-Identifier: MIT

/**
 * Keeping an account's view of what has happened in step with Telegram's.
 *
 * The stream is not reliable in the way a socket is. Updates arrive reordered,
 * arrive twice, arrive with earlier ones missing, and sometimes stop arriving
 * because the server gave up queueing them. What makes a client correct is not
 * reading the stream but noticing when the stream has stopped being enough, and
 * asking.
 *
 * ```
 *   stream ──> judge ──┬── apply ──> dispatch
 *                      ├── seen  ──> drop
 *                      └── gap   ──> wait ──> catch up ──> drain ──> resume
 * ```
 *
 * The wait is deliberate. The documentation notes that the server may simply
 * have reordered, and the missing update usually arrives on its own moments
 * later — so a catch-up on the first sign of trouble spends a round trip on
 * almost every reorder. When what was missing arrives inside the wait, what
 * was held behind it is applied in order and nothing is asked at all.
 *
 * While a box is catching up, everything for that box is held rather than
 * judged: the sequence is about to be told what it really is, and judging
 * against a number that is about to change produces gaps that were never real.
 * Boxes catch up independently, because they are independent — a channel that
 * has fallen behind is no reason to hold up anything else.
 *
 * Nothing is dispatched twice. A catch-up legitimately returns messages the
 * ordinary stream already delivered, so what has been handed out is remembered
 * and consulted before anything is handed out again.
 *
 * The answers to this account's own calls go into the same sequences, because
 * they move them: a send consumes a step of the box it was sent in. What an
 * answer reports about what the call acted on is applied and withheld from the
 * handlers — the caller holds it already — and remembered, so a catch-up that
 * mentions it later does not hand it out either. `local.ts` says which part of
 * an answer that is.
 *
 * A position is something Telegram reported, never something assumed. An
 * account that has never had one asks for it with `updates.getState` when its
 * first update arrives, and holds what arrives meanwhile; judging against a
 * number nobody reported would make every update a gap and fetch the account's
 * whole history as though it had just been missed.
 */

import { PeerError, TelegramError } from '@yuigram/core'
import type { TypeInputChannel } from '../generated/api/types/index.js'
import { harvest, inputChannel } from '../network/peers.js'
import type { PeerStore } from '../storage/peers.js'
import type { TlValue } from '../tl/index.js'
import {
  answeredPosition,
  carriedUpdates,
  ownEffects,
  positionChannel,
  scopeOf,
  updatesIn,
  widenedBy,
} from './local.js'
import type { BoxKind, UpdateState } from './state.js'

/** Milliseconds a gap is given to resolve itself before it is chased. */
const REORDER_WINDOW = 500

/**
 * How many pages one catch-up attempt follows.
 *
 * A bound on one attempt, not on how far behind a box may be: an attempt that
 * reaches it having moved the position on writes the position down and is
 * followed by another, while one that moved nothing is a failure.
 */
const MAX_PAGES = 100

/** The longest wait before trying a failed catch-up or starting position again. */
const RETRY_CAP = 60_000

/**
 * Updates held while the starting position is being asked for.
 *
 * Bounded, because the question can fail for as long as the network does. What
 * falls out is reported, never dropped silently.
 */
const MAX_EARLY = 1000

/**
 * Calls awaiting their answers whose messages are watched for in the stream.
 *
 * Bounded, because an answer can fail to come for as long as the network
 * fails. The oldest beyond the bound is treated as a call that failed: whatever
 * was held for it is handed out rather than kept.
 */
const MAX_EXPECTED = 256

/**
 * What an answer that is only a position becomes, for the sequence to judge.
 *
 * Not a TL constructor, and never handed out: it carries a box, a position and
 * a count, and nothing to report. A deletion, a read or a cleared badge is
 * answered this way rather than with the updates that describe it.
 */
const POSITION = 'yuigram.position'

/**
 * How long to wait before asking a followed channel again, absent an answer.
 *
 * Only a fallback. Telegram names the interval in every difference it sends,
 * and that is what is used; this is the number for an answer that did not say,
 * chosen to be the same order as the ones Telegram does send rather than to be
 * conservative — a client asking much more often would be refused.
 */
const WATCH_INTERVAL = 60

/** How the manager is built. */
export interface UpdatesOptions {
  /** Where the sequences live. */
  readonly state: UpdateState
  /** Where peers learned along the way are written down. */
  readonly peers: PeerStore
  /** How a catch-up request is made. */
  readonly invoke: (query: TlValue) => Promise<TlValue>
  /** Somewhere to hand an update that is this account's to see. */
  readonly onUpdate: (update: TlValue) => void
  /** Anything that went wrong while catching up. */
  readonly onFailure?: (error: Error) => void
  /**
   * Whether `state` holds a position Telegram reported, as one written down by
   * an earlier run does. When false, the first update waits for
   * `updates.getState` instead of being judged. True unless given.
   */
  readonly established?: boolean
  /**
   * Write the position down. Called once a starting position has been taken,
   * and between the attempts of a catch-up too long for one.
   */
  readonly onPosition?: () => Promise<void> | void
  /** Something an operator may want to know that is not a failure. */
  readonly onProgress?: (report: UpdatesProgress) => void
  /** Milliseconds to let a gap resolve itself. Defaults to 500. */
  readonly reorderWindow?: number
  /** Run something later, and return the way to cancel it. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
  /** Who this account is, for a call that names it as `inputPeerSelf`. */
  readonly self?: () => bigint | undefined
}

/** A call awaiting its answer, whose messages the stream may report first. */
export interface Expectation {
  /**
   * Say how the call ended.
   *
   * Answered: whatever the stream reported of it is dropped, because the answer
   * is the caller's report. Failed: it is handed out, because the stream is
   * then the only report there is.
   */
  settle(answered: boolean): void
}

/** What the manager reports along the way, for a log. Counters only, never content. */
export type UpdatesProgress =
  /** A starting position was taken from Telegram; `early` updates had arrived meanwhile. */
  | {
      readonly kind: 'baseline'
      readonly pts: number
      readonly qts: number
      readonly seq: number
      readonly date: number
      readonly early: number
    }
  /** A catch-up used up one attempt's pages, moved the position on, and goes on. */
  | {
      readonly kind: 'continuing'
      readonly box: string
      readonly pages: number
      readonly pts: number
    }
  /** Something failed and will be tried again; `held` updates wait for it. */
  | {
      readonly kind: 'retrying'
      readonly box: string
      readonly delayMs: number
      readonly held: number
    }

/** Which sequence a box belongs to, and which channel when it is one. */
interface Box {
  readonly kind: BoxKind
  readonly channelId?: bigint
}

/** The manager's view of the stream. */
export interface Updates {
  /**
   * Take whatever the connection reported.
   *
   * Accepts a container, a single update, or the answer that says the queue
   * overflowed — the stream carries all three and a caller should not have to
   * tell them apart.
   */
  feed(value: TlValue): Promise<void>
  /**
   * Take the answer to a call this account made.
   *
   * Applied to the sequences as the stream's updates are, so the next update
   * finds the position where Telegram has it. What it reports about what the
   * call acted on is not handed out, and is remembered so that a catch-up
   * mentioning it later does not hand it out either; anything else it carries
   * is handed out as the stream would hand it out.
   *
   * Answers whether the position may have moved, so a caller knows to write it
   * down. An account with no position yet does not ask for one for the sake of
   * an answer that reports only what the call did: the position it will be
   * given already counts that.
   */
  absorb(answer: unknown, query: TlValue): Promise<boolean>
  /**
   * Note a call about to be made, when it draws deduplication keys.
   *
   * The stream, or a catch-up, can report what the call created before its
   * answer arrives. Telegram names the key it matched in such a report, and
   * that is how it is recognised as this call's. Nothing when the call draws
   * no key.
   */
  expect(query: TlValue): Expectation | undefined
  /**
   * Catch a box up now, without waiting for a gap to be noticed.
   *
   * For an account with no position yet this takes the starting position
   * instead: there is nothing behind a position that does not exist.
   */
  recover(box?: Box): Promise<void>
  /** Whether a position Telegram reported is held, so that a catch-up means something. */
  readonly established: boolean
  /**
   * Follow a channel's own sequence, until told to stop.
   *
   * Telegram does not push a channel's updates to an account that is not
   * looking at it. What it offers instead is the channel's difference, on
   * request, with the answer saying how long to wait before asking again — so
   * following a channel means asking repeatedly, and the interval is the
   * server's rather than a number chosen here.
   *
   * Counted, because two parts of a program may be looking at one channel and
   * neither should end the other's subscription. Answers whether this was the
   * one that began it.
   *
   * @param pts Where to start from, when the caller has just read it from a
   *   dialog. Otherwise the stored position is used, and a channel with no
   *   stored position cannot be followed until one arrives.
   */
  watchChannel(channelId: bigint, pts?: number): boolean
  /** Stop following a channel. Answers whether that was the last watcher. */
  unwatchChannel(channelId: bigint): boolean
  /** Which channels are being followed, for a caller that has to know. */
  watched(): readonly bigint[]
  /** Stop. Anything waiting to be chased is dropped. */
  close(): void
}

/** Build the manager. Nothing happens until something is fed to it. */
export function openUpdates(options: UpdatesOptions): Updates {
  const state = options.state
  const window = options.reorderWindow ?? REORDER_WINDOW
  const later = options.schedule ?? defaultSchedule

  /** Boxes currently catching up, and what arrived for them while they were. */
  const catching = new Map<string, { held: TlValue[]; running: Promise<void> }>()
  /**
   * Gaps waiting out the reorder window, so one box chases at most one.
   *
   * `ordered` while everything held is waiting only for what precedes it in
   * its own box, so that what was missing arriving is enough. A container out
   * of sequence, or a failed catch-up, has to be asked about whatever arrives.
   */
  const pending = new Map<string, { cancel: () => void; held: TlValue[]; ordered: boolean }>()
  /** Channels the account can no longer see, which there is no point chasing. */
  const gone = new Set<string>()
  /**
   * Channels being followed, and how many callers are following each.
   *
   * Counted rather than a set: two parts of a program looking at one channel
   * both stop when they are done, and the first to stop must not end the
   * other's subscription.
   */
  const watching = new Map<bigint, { watchers: number; cancel?: () => void }>()
  let closed = false

  /** Whether the state holds a position Telegram reported. */
  let established = options.established ?? true
  /** What arrived before there was a position to judge it against, in arrival order. */
  const early: TlValue[] = []
  /** The question for the starting position, while it is being asked. */
  let establishing: Promise<void> | undefined
  /** The next attempt at it, after one failed. */
  let establishAgain: (() => void) | undefined
  let establishFailures = 0
  /** Consecutive failed catch-ups, per box, which lengthen the wait before the next. */
  const failuresOf = new Map<string, number>()

  /**
   * Updates an answer to this account's own call reported about what the call
   * did. Applied like any other, never handed out. The same objects travel
   * through holds and catch-ups, so recognising them by identity is exact.
   */
  const local = new WeakSet<TlValue>()

  /** A call awaiting its answer, and what the stream reported of it meanwhile. */
  interface Expected {
    readonly keys: readonly bigint[]
    /** The boxes its messages land in: the common one, or a channel's. */
    readonly boxes: readonly string[]
    /** The identities of messages Telegram matched to its keys so far. */
    readonly identities: Set<string>
    readonly held: TlValue[]
  }
  /** Calls awaiting answers, by key and in the order they were made. */
  const expectedByKey = new Map<bigint, Expected>()
  const expectedOrder: Expected[] = []

  const nameOf = (box: Box) => (box.kind === 'channel' ? `channel:${box.channelId}` : box.kind)

  /**
   * Hand an update out, unless it should not be.
   *
   * Not when it reports what this account's own call did, not when it has been
   * handed out or withheld before, and not yet when it reports what a call
   * still awaiting its answer created — that waits for the call to end.
   */
  const dispatch = (update: TlValue): void => {
    if (update._ === POSITION) return

    const identities = identitiesOf(update)
    if (local.has(update)) {
      for (const identity of identities) state.remember(identity)
      return
    }
    if (identities.some((identity) => state.known(identity))) return

    const waiting = awaiting(update, identities)
    if (waiting !== undefined) {
      waiting.held.push(update)
      return
    }

    for (const identity of identities) state.remember(identity)
    options.onUpdate(update)
  }

  /** The call awaiting its answer that an update reports on, if any. */
  const awaiting = (update: TlValue, identities: readonly string[]): Expected | undefined => {
    if (expectedOrder.length === 0) return undefined

    if (update._ === 'updateMessageID') {
      const key = update['random_id']

      return typeof key === 'bigint' ? expectedByKey.get(key) : undefined
    }

    return expectedOrder.find((record) =>
      identities.some((identity) => record.identities.has(identity)),
    )
  }

  /**
   * Recognise what awaiting calls created, from the keys Telegram matched.
   *
   * Read from a whole batch before any of it is handed out, because a batch
   * need not put the match ahead of the message it names.
   */
  const noteMatches = (updates: readonly unknown[]): void => {
    if (expectedOrder.length === 0) return

    for (const update of updates) {
      if (!isValue(update) || update._ !== 'updateMessageID') continue
      const key = update['random_id']
      const id = update['id']
      if (typeof key !== 'bigint' || typeof id !== 'number') continue

      const record = expectedByKey.get(key)
      if (record === undefined) continue
      for (const box of record.boxes) record.identities.add(`${box}:new:${id}`)
    }
  }

  /** End an awaited call; see {@link Expectation.settle}. */
  const settle = (record: Expected, answered: boolean): void => {
    const index = expectedOrder.indexOf(record)
    if (index < 0) return

    expectedOrder.splice(index, 1)
    for (const key of record.keys) {
      if (expectedByKey.get(key) === record) expectedByKey.delete(key)
    }

    if (answered) {
      // The answer is the report. What the stream said of it is remembered as
      // accounted for, so a catch-up repeating it is recognised too.
      for (const identity of record.identities) state.remember(identity)
      for (const key of record.keys) state.remember(`key:${key}`)
      record.held.length = 0
      return
    }

    if (closed) return
    for (const update of record.held.splice(0)) dispatch(update)
  }

  const fail = (error: unknown): void => {
    options.onFailure?.(error instanceof Error ? error : new Error(String(error)))
  }

  /**
   * Deal with one update, wherever it came from.
   *
   * A box that is catching up holds what arrives instead of judging it: the
   * sequence is about to be replaced by what the server says it is, and judging
   * against a number that is about to change invents gaps.
   */
  const consume = async (update: TlValue): Promise<void> => {
    const box = boxOf(update)
    if (box === undefined) {
      // Not part of any sequence. Nothing can be missing in front of it.
      dispatch(update)
      return
    }

    const name = nameOf(box)
    const holding = catching.get(name)
    if (holding !== undefined) {
      holding.held.push(update)
      return
    }

    const pts = readInt(update, 'pts')
    const count = box.kind === 'secret' ? 1 : (readInt(update, 'pts_count') ?? 1)
    if (pts === undefined) {
      dispatch(update)
      return
    }

    const verdict = state.judge({
      box: box.kind,
      pts,
      count,
      ...(box.channelId === undefined ? {} : { channelId: box.channelId }),
    })

    if (verdict.kind === 'seen') return
    if (verdict.kind === 'apply') {
      state.advance({
        box: box.kind,
        pts,
        ...(box.channelId === undefined ? {} : { channelId: box.channelId }),
      })
      dispatch(update)
      // What was held behind this may follow on from it now.
      closeWindow(box)
      return
    }

    // A gap. Held rather than dropped, because it is real and will be wanted
    // once whatever precedes it has been fetched.
    hold(box, update)
  }

  /** What the sequence makes of one held update, judged now. */
  const judgeHeld = (update: TlValue): 'apply' | 'seen' | 'gap' => {
    const box = boxOf(update)
    const pts = readInt(update, 'pts')
    if (box === undefined || pts === undefined) return 'gap'

    return state.judge({
      box: box.kind,
      pts,
      count: box.kind === 'secret' ? 1 : (readInt(update, 'pts_count') ?? 1),
      ...(box.channelId === undefined ? {} : { channelId: box.channelId }),
    }).kind
  }

  /**
   * Apply what a box's window is holding, as far as the sequence now allows.
   *
   * In order of position, and repeatedly, because applying one can make the
   * next the next. A window left with nothing to wait for is closed without a
   * catch-up: the gap was a reorder, and it is over.
   */
  const closeWindow = (box: Box): boolean => {
    const name = nameOf(box)
    const waiting = pending.get(name)
    if (waiting === undefined || !waiting.ordered) return false

    // Each pass applies what has become next; it ends when one applies nothing.
    let draining = waiting.held.length > 0
    while (draining) draining = drainOnce(waiting.held) && waiting.held.length > 0

    if (waiting.held.length > 0) return false

    waiting.cancel()
    pending.delete(name)

    return true
  }

  /**
   * One pass over held updates in order of position: apply what is next, drop
   * what is already counted, keep what still has something missing before it.
   * Answers whether anything left the list.
   */
  const drainOnce = (held: TlValue[]): boolean => {
    held.sort((left, right) => (readInt(left, 'pts') ?? 0) - (readInt(right, 'pts') ?? 0))

    const before = held.length
    const keep: TlValue[] = []
    for (const update of held) {
      const verdict = judgeHeld(update)
      if (verdict === 'gap') {
        keep.push(update)
        continue
      }
      if (verdict === 'apply') applyHeld(update)
    }
    held.splice(0, held.length, ...keep)

    return held.length < before
  }

  /** Move a box on to where a held update arrived, and hand the update out. */
  const applyHeld = (update: TlValue): void => {
    const box = boxOf(update) as Box
    state.advance({
      box: box.kind,
      pts: readInt(update, 'pts') as number,
      ...(box.channelId === undefined ? {} : { channelId: box.channelId }),
    })
    dispatch(update)
  }

  /**
   * Note a gap and give it the window to resolve itself.
   *
   * One box chases at most one catch-up: everything that arrives for it while
   * the window runs, and while the catch-up runs, joins the same wait. Starting
   * a second would ask the same question twice and drain the answers over each
   * other.
   */
  const hold = (box: Box, update: TlValue): void => {
    queueCatchUp(box, [update], window, true)
  }

  /**
   * Arrange a catch-up after `delay`, with what is waiting for it.
   *
   * Joins a catch-up already running or already arranged rather than starting
   * another, for the same reason a gap does. `ordered` when what waits needs
   * only its own box's missing updates; see {@link pending}.
   */
  const queueCatchUp = (
    box: Box,
    updates: readonly TlValue[],
    delay: number,
    ordered = false,
  ): void => {
    if (closed) return

    const name = nameOf(box)
    if (gone.has(name)) return

    const running = catching.get(name)
    if (running !== undefined) {
      running.held.push(...updates)
      return
    }

    const waiting = pending.get(name)
    if (waiting !== undefined) {
      waiting.held.push(...updates)
      waiting.ordered &&= ordered
      return
    }

    const held: TlValue[] = [...updates]
    const entry = {
      held,
      ordered,
      cancel: () => {},
    }
    entry.cancel = later(() => {
      // Once more before asking: what was missing may have come in a way that
      // did not pass through the box, such as a catch-up of another kind.
      if (closeWindow(box)) return

      pending.delete(name)
      if (closed) return

      const running = { held, running: Promise.resolve() }
      catching.set(name, running)
      running.running = catchUp(box, running).catch(fail)
    }, delay)

    pending.set(name, entry)
  }

  /**
   * Try a box again later, keeping what it held.
   *
   * After a failure the wait doubles from the reorder window up to a minute;
   * a catch-up that only ran out of pages goes on straight away.
   */
  const retryLater = (box: Box, held: readonly TlValue[], failed: boolean): void => {
    const name = nameOf(box)
    const count = failed ? (failuresOf.get(name) ?? 0) + 1 : 0
    if (failed) failuresOf.set(name, count)
    else failuresOf.delete(name)

    const delay = failed ? Math.min(RETRY_CAP, window * 2 ** count) : 0
    if (failed)
      options.onProgress?.({ kind: 'retrying', box: name, delayMs: delay, held: held.length })
    queueCatchUp(box, held, delay)
  }

  /** Where a box stands, as something to compare before and after an attempt. */
  const positionOf = (box: Box): string =>
    box.kind === 'channel' && box.channelId !== undefined
      ? String(state.channelPts(box.channelId))
      : `${state.pts}:${state.qts}:${state.seq}:${state.date}`

  /** The local count a box is judged against. */
  const localOf = (box: Box): number | undefined =>
    box.kind === 'common'
      ? state.pts
      : box.kind === 'secret'
        ? state.qts
        : box.channelId === undefined
          ? undefined
          : state.channelPts(box.channelId)

  // ---- the starting position ------------------------------------------------

  /**
   * Take a starting position from Telegram, then let through what waited for it.
   *
   * One question at a time; everything that arrives meanwhile joins the wait.
   * A failure leaves the account without a position — none is invented — and
   * what was held stays held for the next attempt.
   */
  const establish = (): Promise<void> => {
    establishing ??= (async () => {
      try {
        const answer = await options.invoke({ _: 'updates.getState' })
        if (closed) return
        takeBaseline(answer)

        // In arrival order, and removed only once handled, so a failure part
        // of the way leaves the rest for the next attempt.
        let drained = 0
        while (early.length > 0) {
          await drainEarly(early[0] as TlValue)
          early.shift()
          drained += 1
        }

        established = true
        establishFailures = 0
        options.onProgress?.({
          kind: 'baseline',
          pts: state.pts,
          qts: state.qts,
          seq: state.seq,
          date: state.date,
          early: drained,
        })
        await options.onPosition?.()
      } catch (error) {
        if (closed) return
        fail(error)
        establishLater()
      } finally {
        establishing = undefined
      }
    })()

    return establishing
  }

  /** Ask for the starting position again later, if anything is waiting for it. */
  const establishLater = (): void => {
    if (closed || early.length === 0 || establishAgain !== undefined) return

    establishFailures += 1
    const delay = Math.min(RETRY_CAP, window * 2 ** establishFailures)
    options.onProgress?.({ kind: 'retrying', box: 'baseline', delayMs: delay, held: early.length })
    establishAgain = later(() => {
      establishAgain = undefined
      if (!closed && !established) void establish()
    }, delay)
  }

  /** Read Telegram's answer about where every sequence stands, and take it. */
  const takeBaseline = (answer: TlValue): void => {
    if (answer._ !== 'updates.state') {
      throw new PeerError(`expected the update state, received '${answer._}'`)
    }

    const pts = readInt(answer, 'pts')
    const qts = readInt(answer, 'qts')
    const seq = readInt(answer, 'seq')
    const date = readInt(answer, 'date')
    if (pts === undefined || qts === undefined || seq === undefined || date === undefined) {
      throw new PeerError('the update state did not say where every sequence stands')
    }

    state.reset({ box: 'common', pts })
    state.reset({ box: 'secret', pts: qts })
    state.advanceContainer({ seq, date })
    state.adoptBaseline()
  }

  /**
   * Handle something that arrived before the starting position was known.
   *
   * It arrived live, so whatever the position already covers is handed out
   * rather than treated as old: nothing was dispatched before the position was
   * taken. Whatever lies beyond the position is judged as usual, and a real gap
   * behind it is chased from the position.
   */
  const drainEarly = async (value: TlValue): Promise<void> => {
    // The position was taken after the queue overflowed, so nothing behind it
    // is wanted.
    if (value._ === 'updatesTooLong') return

    if (value._ === 'updates' || value._ === 'updatesCombined') {
      // One the position covers, or one outside the container sequence: its
      // updates are taken one by one. A later one is judged as a container.
      const seq = readInt(value, 'seq') ?? 0
      if (seq === 0 || seq <= state.seq) {
        for (const update of asArray(value['updates'])) await drainOne(update as TlValue)
        return
      }

      await feedContainer(value)
      return
    }

    if (value._ === 'updateShort') {
      const update = value['update']
      if (typeof update === 'object' && update !== null) await drainOne(update as TlValue)
      return
    }

    await drainOne(value)
  }

  /** One early update: handed out when the position covers it, judged when it does not. */
  const drainOne = async (update: TlValue): Promise<void> => {
    const box = boxOf(update)
    const pts = readInt(update, 'pts')
    if (box !== undefined && box.kind !== 'channel' && pts !== undefined) {
      const local = localOf(box)
      if (local !== undefined && pts <= local) {
        dispatch(update)
        return
      }
    }

    await consume(update)
  }

  /**
   * Hand out what a catch-up returned, in the order it returned it.
   *
   * Messages arrive stripped of the update that carried them, so they are put
   * back into one — a caller should not have to tell an update that came from
   * the stream from one that came from a catch-up.
   */
  const dispatchDifference = (answer: TlValue, wrap: (message: TlValue) => TlValue): void => {
    // A send whose answer was lost is in here, matched to its key among the
    // other updates; read before the messages it names are handed out.
    noteMatches(asArray(answer['other_updates']))
    for (const message of asArray(answer['new_messages'])) dispatch(wrap(message as TlValue))
    for (const update of asArray(answer['other_updates'])) dispatch(update as TlValue)
  }

  /** Ask the server where the box really is, and take its word for it. */
  const catchUp = async (box: Box, entry: { held: TlValue[] }): Promise<void> => {
    const name = nameOf(box)
    const before = positionOf(box)

    let outcome: 'complete' | 'budget'
    try {
      outcome =
        box.kind === 'channel' ? await channelDifference(box, entry) : await commonDifference(entry)
    } catch (error) {
      if (box.kind === 'channel' && refusedAs(error, 'CHANNEL_PRIVATE')) {
        // The channel is gone. Chasing it again would fail the same way for as
        // long as the account is not in it.
        gone.add(name)
        catching.delete(name)
        return
      }
      catching.delete(name)
      // What was held is still wanted. It waits for the next attempt instead
      // of being dropped with this one.
      if (entry.held.length > 0) retryLater(box, entry.held.splice(0), true)
      throw error
    }

    if (outcome === 'budget') {
      catching.delete(name)
      // Written down between attempts, so a restart resumes from here rather
      // than paging through the same history again.
      await options.onPosition?.()
      const held = entry.held.splice(0)

      if (positionOf(box) === before) {
        retryLater(box, held, true)
        throw new PeerError(`${describeBox(box)} did not move in ${MAX_PAGES} pages of catching up`)
      }

      options.onProgress?.({
        kind: 'continuing',
        box: name,
        pages: MAX_PAGES,
        pts: localOf(box) ?? 0,
      })
      retryLater(box, held, false)
      return
    }

    failuresOf.delete(name)

    // Drain what was held while catching up. Anything already accounted for by
    // the catch-up is recognised as such rather than dispatched again.
    const held = entry.held.splice(0)
    catching.delete(name)
    for (const update of held) await consume(update)
  }

  /**
   * The answers that end a common-box catch-up rather than continuing it.
   *
   * Being told the box is too far behind is not a failure: it is the server
   * saying the queue it was keeping is gone. Taking the position it names and
   * carrying on is the only honest answer — nothing that was missed can be
   * recovered, and pretending otherwise would dispatch a fiction.
   */
  const finishCommon = (answer: TlValue): boolean => {
    if (answer._ === 'updates.differenceEmpty') {
      const date = readInt(answer, 'date')
      state.advanceContainer({
        seq: readInt(answer, 'seq') ?? 0,
        ...(date === undefined ? {} : { date }),
      })
      return true
    }

    if (answer._ === 'updates.differenceTooLong') {
      state.reset({ box: 'common', pts: readInt(answer, 'pts') ?? state.pts })
      return true
    }

    return false
  }

  const commonDifference = async (entry: { held: TlValue[] }): Promise<'complete' | 'budget'> => {
    void entry

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await options.invoke({
        _: 'updates.getDifference',
        pts: state.pts,
        date: state.date,
        qts: state.qts,
      })

      await harvest(options.peers, answer)

      if (finishCommon(answer)) return 'complete'

      const complete = answer._ === 'updates.difference'
      if (!complete && answer._ !== 'updates.differenceSlice') {
        throw new PeerError(`expected a difference, received '${answer._}'`)
      }

      dispatchDifference(answer, (message) => ({
        _: 'updateNewMessage',
        message,
        pts: 0,
        pts_count: 0,
      }))

      const reported = complete ? answer['state'] : answer['intermediate_state']
      applyState(reported)

      if (complete) return 'complete'
    }

    return 'budget'
  }

  /**
   * The answers that end a channel catch-up rather than continuing it.
   *
   * A channel too far behind to be caught up on is forgotten, so that its next
   * update starts a fresh sequence instead of gapping for ever against a number
   * nothing will reach.
   */
  const finishChannel = (answer: TlValue, channelId: bigint): boolean => {
    if (answer._ === 'updates.channelDifferenceTooLong') {
      state.forgetChannel(channelId)
      return true
    }

    if (answer._ === 'updates.channelDifferenceEmpty') {
      state.reset({ box: 'channel', channelId, pts: readInt(answer, 'pts') ?? 1 })
      return true
    }

    return false
  }

  /**
   * How to refer to a channel in a catch-up request.
   *
   * A channel is named by an access hash the account can only have learned by
   * encountering it. One that has never been encountered cannot be asked about
   * at all, and saying so is better than sending a reference that will be
   * refused for a reason that names the call rather than the channel.
   */
  const nameChannel = async (channelId: bigint): Promise<TypeInputChannel> => {
    const record = await options.peers.byId('channel', channelId)
    if (record === undefined) {
      throw new PeerError(`channel ${channelId} cannot be caught up on: it has never been named`)
    }

    return inputChannel(record)
  }

  /**
   * Ask again for a followed channel, after the interval the server named.
   *
   * The wait comes from the answer rather than from a constant here: Telegram
   * says how stale it is willing to let a client be, and a client that picks
   * its own number is either wasting requests or missing updates. An answer
   * without one is asked again at {@link WATCH_INTERVAL}, which is only the
   * floor for a server that declined to say.
   */
  const followAgain = (channelId: bigint, seconds: number | undefined): void => {
    const entry = watching.get(channelId)
    if (entry === undefined || closed) return

    entry.cancel?.()
    entry.cancel = later(
      () => {
        void refreshChannel(channelId)
      },
      Math.max(seconds ?? WATCH_INTERVAL, 1) * 1000,
    )
  }

  /** Fetch a followed channel's difference now, and arrange the next ask. */
  const refreshChannel = async (channelId: bigint): Promise<void> => {
    if (!watching.has(channelId) || closed) return

    try {
      await api.recover({ kind: 'channel', channelId })
    } catch (error) {
      fail(error)
      // A failed refresh does not end the subscription: the channel is still
      // being looked at, and the next interval may well succeed. Reported so
      // that a caller watching for failures sees it.
      followAgain(channelId, undefined)

      return
    }

    // Unless the account is no longer in the channel, which the catch-up
    // records rather than raising. Asking again would be refused the same way
    // every interval for as long as that is true, so following it stops — and
    // the watcher finds out by its updates ceasing, which is what happened.
    if (gone.has(nameOf({ kind: 'channel', channelId }))) {
      const entry = watching.get(channelId)
      entry?.cancel?.()
      watching.delete(channelId)
    }
  }

  const channelDifference = async (
    box: Box,
    entry: { held: TlValue[] },
  ): Promise<'complete' | 'budget'> => {
    void entry
    const channelId = box.channelId
    if (channelId === undefined) throw new PeerError('a channel box must name its channel')

    const named = await nameChannel(channelId)

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await options.invoke({
        _: 'updates.getChannelDifference',
        channel: named,
        filter: { _: 'channelMessagesFilterEmpty' },
        pts: state.channelPts(channelId) ?? 1,
        limit: 100,
      })

      await harvest(options.peers, answer)

      if (finishChannel(answer, channelId)) {
        followAgain(channelId, readInt(answer, 'timeout'))
        return 'complete'
      }

      if (answer._ !== 'updates.channelDifference') {
        throw new PeerError(`expected a channel difference, received '${answer._}'`)
      }

      dispatchDifference(answer, (message) => ({
        _: 'updateNewChannelMessage',
        message,
        pts: 0,
        pts_count: 0,
      }))

      state.reset({ box: 'channel', channelId, pts: readInt(answer, 'pts') ?? 1 })

      if (answer['final'] === true) {
        followAgain(channelId, readInt(answer, 'timeout'))
        return 'complete'
      }
    }

    return 'budget'
  }

  /** Take a reported position as the truth about where a box stands. */
  const applyState = (reported: unknown): void => {
    if (typeof reported !== 'object' || reported === null) return

    const value = reported as TlValue
    const pts = readInt(value, 'pts')
    if (pts !== undefined) state.reset({ box: 'common', pts })

    const qts = readInt(value, 'qts')
    if (qts !== undefined) state.reset({ box: 'secret', pts: qts })

    const date = readInt(value, 'date')
    state.advanceContainer({
      seq: readInt(value, 'seq') ?? 0,
      ...(date === undefined ? {} : { date }),
    })
  }

  /**
   * Take a container of updates.
   *
   * Peers first, always: what follows may name somebody this account has never
   * seen, and the only description of them is in this same answer.
   */
  const feedContainer = async (value: TlValue): Promise<void> => {
    await harvest(options.peers, value)
    noteMatches(asArray(value['updates']))

    const seq = readInt(value, 'seq') ?? 0
    const seqStart = readInt(value, 'seq_start') ?? seq
    const verdict = state.judgeContainer({ seqStart, seq })

    if (verdict.kind === 'seen') return

    if (verdict.kind === 'gap') {
      // The container itself is out of order. The boxes inside it are chased
      // individually, which is what a catch-up on the common box covers — and
      // only a catch-up can say where the container sequence stands, so this
      // wait ends in one whatever arrives meanwhile.
      queueCatchUp({ kind: 'common' }, asArray(value['updates']) as TlValue[], window, false)
      return
    }

    for (const update of asArray(value['updates'])) await consume(update as TlValue)

    const date = readInt(value, 'date')
    state.advanceContainer({ seq, ...(date === undefined ? {} : { date }) })
  }

  /**
   * Take an answer that is only a position: where a deletion, a read or a
   * cleared badge left a box, and how many steps it took.
   */
  const absorbPosition = async (
    position: { readonly pts: number; readonly count: number },
    channelId: bigint | undefined,
  ): Promise<boolean> => {
    const entry: TlValue = {
      _: POSITION,
      ...(channelId === undefined ? {} : { channel_id: channelId }),
      pts: position.pts,
      pts_count: position.count,
    }
    // Remembered whatever happens next, so the update that describes the same
    // step is withheld when a catch-up returns it.
    for (const identity of identitiesOf(entry)) state.remember(identity)
    if (!established) return false

    await consume(entry)
    return true
  }

  /** Keep something that arrived before there was a position, and ask for one. */
  const holdEarly = async (value: TlValue): Promise<void> => {
    // Peers first, as everywhere: whoever an update names is described in it.
    await harvest(options.peers, value)
    if (early.length >= MAX_EARLY) {
      early.shift()
      fail(
        new PeerError(
          `more than ${MAX_EARLY} updates arrived before the starting position was known, ` +
            'so the oldest of them was dropped',
        ),
      )
    }
    early.push(value)
    await establish()
  }

  /** Catch the common box up after the server said it stopped keeping the stream. */
  const overflowed = async (): Promise<void> => {
    // A catch-up already under way covers it.
    if (catching.has('common')) return

    const entry = { held: [] as TlValue[], running: Promise.resolve() }
    catching.set('common', entry)
    await catchUp({ kind: 'common' }, entry)
  }

  const api: Updates = {
    async feed(value) {
      if (closed) return

      // No position to judge against yet. Held, in order, until Telegram says
      // where the account stands.
      if (!established) {
        await holdEarly(value)
        return
      }

      // The queue overflowed and the server stopped keeping the stream. There
      // is nothing to judge and nothing to hold: everything since is missing.
      if (value._ === 'updatesTooLong') {
        await overflowed()
        return
      }

      if (value._ === 'updateShort') {
        await harvest(options.peers, value)
        const update = value['update']
        noteMatches([update])
        if (typeof update === 'object' && update !== null) await consume(update as TlValue)
        const date = readInt(value, 'date')
        state.advanceContainer({ seq: 0, ...(date === undefined ? {} : { date }) })
        return
      }

      if (value._ !== 'updates' && value._ !== 'updatesCombined') {
        // Anything else in the stream is a single update in its own right.
        await harvest(options.peers, value)
        noteMatches([value])
        await consume(value)
        return
      }

      await feedContainer(value)
    },

    async absorb(answer, query) {
      if (closed) return false

      const scope = scopeOf(query, options.self?.())
      // On behalf of a business connection: what the answer reports belongs to
      // another account's conversations, and moves none of this one's boxes.
      if (scope.delegated) return false

      const position = answeredPosition(answer)
      if (position !== undefined) return await absorbPosition(position, positionChannel(scope))

      // The keys the call drew are accounted for by its answer: a match the
      // stream or a catch-up reports for one of them is the call's, not news.
      for (const key of scope.randomIds) state.remember(`key:${key}`)

      const carried = carriedUpdates(answer)
      if (carried === undefined) return false

      const updates = updatesIn(carried)
      const own = ownEffects(updates, widenedBy(scope, carried))
      for (const update of own) {
        local.add(update)
        for (const identity of identitiesOf(update)) state.remember(identity)
      }

      // With no position yet there is nothing to keep in step: the one Telegram
      // will report already counts what the call did. Anything else the answer
      // carries is still news, though, and goes the way the stream's would —
      // which, without a position, starts by asking for one.
      if (!established && updates.every((update) => own.has(update))) return false

      await api.feed(carried)
      return true
    },

    expect(query) {
      if (closed) return undefined

      const scope = scopeOf(query, options.self?.())
      if (scope.delegated || scope.randomIds.size === 0) return undefined

      const boxes = new Set<string>()
      for (const conversation of scope.conversations) {
        boxes.add(conversation.startsWith('channel:') ? conversation : 'common')
      }
      const record: Expected = {
        keys: [...scope.randomIds],
        boxes: boxes.size === 0 ? ['common'] : [...boxes],
        identities: new Set(),
        held: [],
      }
      for (const key of record.keys) expectedByKey.set(key, record)
      expectedOrder.push(record)

      while (expectedOrder.length > MAX_EXPECTED) settle(expectedOrder[0] as Expected, false)

      return { settle: (answered) => settle(record, answered) }
    },

    async recover(box = { kind: 'common' }) {
      if (!established && box.kind !== 'channel') {
        await establish()
        if (!established) throw new PeerError('the starting position could not be taken')
        return
      }

      const name = nameOf(box)
      const entry = catching.get(name) ?? { held: [] as TlValue[], running: Promise.resolve() }
      catching.set(name, entry)

      await catchUp(box, entry)
    },

    watchChannel(channelId, pts) {
      const existing = watching.get(channelId)

      if (existing !== undefined) {
        existing.watchers += 1

        return false
      }

      watching.set(channelId, { watchers: 1 })

      // A position the caller read from a dialog is better than none: a channel
      // the account has never held a position for cannot be asked for a
      // difference at all, and a caller that has just read the dialog has one.
      if (pts !== undefined && state.channelPts(channelId) === undefined) {
        state.reset({ box: 'channel', channelId, pts })
      }

      // The first fetch happens now rather than after an interval, because the
      // reason a channel was opened is that somebody wants to see it.
      void refreshChannel(channelId)

      return true
    },

    unwatchChannel(channelId) {
      const existing = watching.get(channelId)
      if (existing === undefined) return false

      if (existing.watchers > 1) {
        existing.watchers -= 1

        return false
      }

      existing.cancel?.()
      watching.delete(channelId)

      return true
    },

    watched() {
      return [...watching.keys()]
    },

    get established() {
      return established
    },

    close() {
      closed = true
      establishAgain?.()
      establishAgain = undefined
      early.length = 0
      for (const waiting of pending.values()) waiting.cancel()
      pending.clear()
      catching.clear()
      for (const entry of watching.values()) entry.cancel?.()
      watching.clear()
      expectedByKey.clear()
      expectedOrder.length = 0
    },
  }

  return api
}

/** Which sequence an update belongs to, when it belongs to one. */
function boxOf(update: TlValue): Box | undefined {
  switch (update._) {
    case POSITION: {
      const channelId = update['channel_id']

      return typeof channelId === 'bigint' ? { kind: 'channel', channelId } : { kind: 'common' }
    }

    // The short forms are whole updates of the common box, carrying its count:
    // left unjudged, every one would leave the position a step behind.
    case 'updateShortMessage':
    case 'updateShortChatMessage':
    case 'updateShortSentMessage':
    case 'updateNewMessage':
    case 'updateDeleteMessages':
    case 'updateEditMessage':
    case 'updateReadHistoryInbox':
    case 'updateReadHistoryOutbox':
    case 'updateWebPage':
    case 'updatePinnedMessages':
      return { kind: 'common' }

    case 'updateNewEncryptedMessage':
      return { kind: 'secret' }

    case 'updateNewChannelMessage':
    case 'updateEditChannelMessage':
    case 'updateDeleteChannelMessages':
    case 'updateChannelWebPage':
    case 'updatePinnedChannelMessages': {
      const channelId = channelOf(update)

      return channelId === undefined ? undefined : { kind: 'channel', channelId }
    }

    default:
      return undefined
  }
}

/** Which channel a channel update is about. */
function channelOf(update: TlValue): bigint | undefined {
  const direct = update['channel_id']
  if (typeof direct === 'bigint') return direct

  const message = update['message']
  if (typeof message !== 'object' || message === null) return undefined

  const peer = (message as TlValue)['peer_id']
  if (typeof peer !== 'object' || peer === null) return undefined

  const id = (peer as TlValue)['channel_id']

  return typeof id === 'bigint' ? id : undefined
}

/**
 * What makes one handed-out thing the same as another.
 *
 * Two kinds of identity, because a catch-up returns things in two shapes. A
 * message it returns is stripped of the update that carried it, so a new
 * message is known by its box and number. Everything else it returns keeps its
 * update and position, and a position names exactly one step of one box — so
 * an edit, a deletion or a pin is known by that, and two edits of one message
 * are two things rather than one.
 *
 * A match of a deduplication key to a message is known by the key.
 *
 * Only these have an identity. The rest is handed out as it arrives: nothing
 * returns it a second time.
 */
function identitiesOf(update: TlValue): string[] {
  // A match names the key a send drew, and the key is the send's alone.
  if (update._ === 'updateMessageID') {
    const key = update['random_id']

    return typeof key === 'bigint' ? [`key:${key}`] : []
  }

  const box = boxOf(update)
  if (box === undefined || box.kind === 'secret') return []

  const name = box.kind === 'channel' ? `channel:${box.channelId}` : 'common'
  const found: string[] = []

  const created = createdIdOf(update)
  if (created !== undefined) found.push(`${name}:new:${created}`)

  const pts = readInt(update, 'pts')
  if (pts !== undefined && pts > 0) found.push(`${name}:pts:${pts}`)

  return found
}

/** The message an update brings into existence, if it is one that does. */
function createdIdOf(update: TlValue): number | undefined {
  switch (update._) {
    case 'updateNewMessage':
    case 'updateNewChannelMessage': {
      const message = update['message']
      const id = isValue(message) ? message['id'] : undefined

      return typeof id === 'number' ? id : undefined
    }
    case 'updateShortMessage':
    case 'updateShortChatMessage':
    case 'updateShortSentMessage':
      return readInt(update, 'id')
    default:
      return undefined
  }
}

function isValue(value: unknown): value is TlValue {
  return typeof value === 'object' && value !== null && typeof (value as TlValue)._ === 'string'
}

/** A box, in words, for an error about it. */
function describeBox(box: Box): string {
  return box.kind === 'channel' ? `channel ${box.channelId}` : `the ${box.kind} box`
}

function refusedAs(error: unknown, name: string): boolean {
  return error instanceof TelegramError && error.message.startsWith(`${name} (`)
}

function readInt(value: TlValue, field: string): number | undefined {
  const raw = value[field]

  return typeof raw === 'number' && Number.isInteger(raw) ? raw : undefined
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function defaultSchedule(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs)

  return () => clearTimeout(timer)
}
