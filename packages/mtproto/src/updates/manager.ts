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
 * almost every reorder. Waiting briefly turns most gaps into nothing at all.
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
 */

import { PeerError, TelegramError } from '@yuigram/core'
import { harvest, inputChannel } from '../network/peers.js'
import type { PeerStore } from '../storage/peers.js'
import type { TlValue } from '../tl/index.js'
import type { BoxKind, UpdateState } from './state.js'

/** Milliseconds a gap is given to resolve itself before it is chased. */
const REORDER_WINDOW = 500

/** How many pages of a catch-up will be followed before giving up on it. */
const MAX_PAGES = 100

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
  /** Milliseconds to let a gap resolve itself. Defaults to 500. */
  readonly reorderWindow?: number
  /** Run something later, and return the way to cancel it. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
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
   * Note something already seen as the answer to a call.
   *
   * A catch-up legitimately returns messages the ordinary stream has already
   * delivered, and sending a message hands one back as the answer to the send.
   * Both would otherwise be reported a second time when the stream or a
   * catch-up mentions them, so what has already been accounted for is recorded
   * before it can arrive again.
   */
  observed(update: TlValue): void
  /** Catch a box up now, without waiting for a gap to be noticed. */
  recover(box?: Box): Promise<void>
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
  /** Gaps waiting out the reorder window, so one box chases at most one. */
  const pending = new Map<string, { cancel: () => void; held: TlValue[] }>()
  /** Channels the account can no longer see, which there is no point chasing. */
  const gone = new Set<string>()
  let closed = false

  const nameOf = (box: Box) => (box.kind === 'channel' ? `channel:${box.channelId}` : box.kind)

  /** Hand an update out, unless it has already been handed out. */
  const dispatch = (update: TlValue): void => {
    const identity = identify(update)
    if (identity !== undefined && state.seen(identity)) return

    options.onUpdate(update)
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
      return
    }

    // A gap. Held rather than dropped, because it is real and will be wanted
    // once whatever precedes it has been fetched.
    hold(box, update)
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
    if (closed) return

    const name = nameOf(box)
    if (gone.has(name)) return

    const running = catching.get(name)
    if (running !== undefined) {
      running.held.push(update)
      return
    }

    const waiting = pending.get(name)
    if (waiting !== undefined) {
      waiting.held.push(update)
      return
    }

    const held: TlValue[] = [update]
    const cancel = later(() => {
      pending.delete(name)
      if (closed) return

      const entry = { held, running: Promise.resolve() }
      catching.set(name, entry)
      entry.running = catchUp(box, entry).catch(fail)
    }, window)

    pending.set(name, { cancel, held })
  }

  /**
   * Hand out what a catch-up returned, in the order it returned it.
   *
   * Messages arrive stripped of the update that carried them, so they are put
   * back into one — a caller should not have to tell an update that came from
   * the stream from one that came from a catch-up.
   */
  const dispatchDifference = (answer: TlValue, wrap: (message: TlValue) => TlValue): void => {
    for (const message of asArray(answer['new_messages'])) dispatch(wrap(message as TlValue))
    for (const update of asArray(answer['other_updates'])) dispatch(update as TlValue)
  }

  /** Ask the server where the box really is, and take its word for it. */
  const catchUp = async (box: Box, entry: { held: TlValue[] }): Promise<void> => {
    const name = nameOf(box)

    try {
      if (box.kind === 'channel') await channelDifference(box, entry)
      else await commonDifference(entry)
    } catch (error) {
      if (box.kind === 'channel' && refusedAs(error, 'CHANNEL_PRIVATE')) {
        // The channel is gone. Chasing it again would fail the same way for as
        // long as the account is not in it.
        gone.add(name)
        catching.delete(name)
        return
      }
      catching.delete(name)
      throw error
    }

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

  const commonDifference = async (entry: { held: TlValue[] }): Promise<void> => {
    void entry

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await options.invoke({
        _: 'updates.getDifference',
        pts: state.pts,
        date: state.date,
        qts: state.qts,
      })

      await harvest(options.peers, answer)

      if (finishCommon(answer)) return

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

      if (complete) return
    }

    throw new PeerError('the common box did not finish catching up')
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
  const nameChannel = async (channelId: bigint): Promise<TlValue> => {
    const record = await options.peers.byId('channel', channelId)
    if (record === undefined) {
      throw new PeerError(`channel ${channelId} cannot be caught up on: it has never been named`)
    }

    return inputChannel(record)
  }

  const channelDifference = async (box: Box, entry: { held: TlValue[] }): Promise<void> => {
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

      if (finishChannel(answer, channelId)) return

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

      if (answer['final'] === true) return
    }

    throw new PeerError(`channel ${channelId} did not finish catching up`)
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

    const seq = readInt(value, 'seq') ?? 0
    const seqStart = readInt(value, 'seq_start') ?? seq
    const verdict = state.judgeContainer({ seqStart, seq })

    if (verdict.kind === 'seen') return

    if (verdict.kind === 'gap') {
      // The container itself is out of order. The boxes inside it are chased
      // individually, which is what a catch-up on the common box covers.
      for (const update of asArray(value['updates'])) hold({ kind: 'common' }, update as TlValue)
      return
    }

    for (const update of asArray(value['updates'])) await consume(update as TlValue)

    const date = readInt(value, 'date')
    state.advanceContainer({ seq, ...(date === undefined ? {} : { date }) })
  }

  return {
    async feed(value) {
      if (closed) return

      // The queue overflowed and the server stopped keeping the stream. There
      // is nothing to judge and nothing to hold: everything since is missing.
      if (value._ === 'updatesTooLong') {
        const entry = { held: [] as TlValue[], running: Promise.resolve() }
        catching.set('common', entry)
        try {
          await commonDifference(entry)
        } finally {
          catching.delete('common')
        }
        return
      }

      if (value._ === 'updateShort') {
        await harvest(options.peers, value)
        const update = value['update']
        if (typeof update === 'object' && update !== null) await consume(update as TlValue)
        const date = readInt(value, 'date')
        state.advanceContainer({ seq: 0, ...(date === undefined ? {} : { date }) })
        return
      }

      if (value._ !== 'updates' && value._ !== 'updatesCombined') {
        // Anything else in the stream is a single update in its own right.
        await harvest(options.peers, value)
        await consume(value)
        return
      }

      await feedContainer(value)
    },

    observed(update) {
      const identity = identify(update)
      if (identity !== undefined) state.seen(identity)
    },

    async recover(box = { kind: 'common' }) {
      const name = nameOf(box)
      const entry = catching.get(name) ?? { held: [] as TlValue[], running: Promise.resolve() }
      catching.set(name, entry)

      await catchUp(box, entry)
    },

    close() {
      closed = true
      for (const waiting of pending.values()) waiting.cancel()
      pending.clear()
      catching.clear()
    },
  }
}

/** Which sequence an update belongs to, when it belongs to one. */
function boxOf(update: TlValue): Box | undefined {
  switch (update._) {
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
 * What makes one dispatched thing the same as another.
 *
 * Only messages carry an identity worth remembering: a catch-up returns
 * messages the stream already delivered, and those are what would otherwise be
 * reported twice. Anything without one is dispatched as it arrives.
 */
function identify(update: TlValue): string | undefined {
  const message = update['message']
  if (typeof message !== 'object' || message === null) return undefined

  const id = (message as TlValue)['id']
  if (typeof id !== 'number') return undefined

  const channelId = channelOf(update)

  return channelId === undefined ? `message:${id}` : `channel:${channelId}:${id}`
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
