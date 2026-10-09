// SPDX-License-Identifier: MIT

/**
 * Where an account's update stream has got to, and what to do with the next one.
 *
 * Telegram does not send a stream so much as a set of them. Private chats and
 * basic groups share one sequence; every channel keeps its own; secret chats
 * and certain bot events keep a third. Each is a count of how much has
 * happened, and an update carries both the count it arrived at and how much of
 * the count it consumed — which is what lets a client tell "the next one" from
 * "one I have already seen" from "I have missed something".
 *
 * ```
 *   local + count == arrived  ──> apply
 *   local + count >  arrived  ──> already seen
 *   local + count <  arrived  ──> something is missing
 * ```
 *
 * Nothing here talks to anything. It is given an update and answers what should
 * happen to it, which is what makes every branch of the decision reachable in a
 * test — and the branches are the subsystem: a client that gets this wrong
 * loses messages silently and discovers it much later, somewhere else.
 *
 * The containers are counted separately from the updates inside them. A
 * container's own sequence numbers containers, not updates, and treating one as
 * the other drifts on the first container carrying more than one update.
 */

/** Which sequence an update belongs to. */
export type BoxKind = 'common' | 'channel' | 'secret'

/** What should happen to an update that has arrived. */
export type Verdict =
  /** The next one. Apply it and move the sequence on. */
  | { readonly kind: 'apply' }
  /** Already accounted for. Discard it without moving anything. */
  | { readonly kind: 'seen' }
  /**
   * Something between here and there never arrived.
   *
   * The sequence cannot move, because moving it would step over whatever is
   * missing and there would be nothing left to notice it by.
   */
  | { readonly kind: 'gap' }

/** Where a sequence stands. */
export interface Sequence {
  /** How much has happened in this box. */
  readonly pts: number
}

/** What a client resumes from. */
export interface UpdateStateSnapshot {
  readonly pts: number
  readonly qts: number
  readonly seq: number
  readonly date: number
  /** Where each channel stands, by identifier. */
  readonly channels: ReadonlyMap<string, number>
  /**
   * `'telegram'` once the position began at a starting point Telegram
   * reported. Absent for one written by a version that began from an assumed
   * position, which nothing can tell apart from a legitimate one that is far
   * behind.
   */
  readonly basis?: 'telegram'
}

/** How much of the recent past is remembered for the sake of not repeating it. */
const DEFAULT_MEMORY = 1000

/**
 * The sequences an account is following.
 *
 * Deliberately answers rather than acts: `judge` says what should happen and
 * `advance` makes it so, and the two are separate because an update that opens
 * a gap must be judged now and applied only after the gap is closed.
 */
export class UpdateState {
  #pts: number
  #qts: number
  #seq: number
  #date: number
  #basis: 'telegram' | undefined
  readonly #channels = new Map<string, number>()

  /**
   * The messages already handed out.
   *
   * A catch-up legitimately returns messages the ordinary stream already
   * delivered, and a client that dispatches both reports every one of them
   * twice. Bounded, because the point is to recognise the recent past rather
   * than to remember everything: an identity old enough to have fallen out is
   * old enough that no catch-up will mention it again.
   */
  readonly #dispatched = new Set<string>()
  readonly #order: string[] = []
  readonly #memory: number

  constructor(
    initial: Partial<UpdateStateSnapshot> = {},
    options: { readonly memory?: number } = {},
  ) {
    this.#pts = initial.pts ?? 1
    this.#qts = initial.qts ?? 1
    this.#seq = initial.seq ?? 0
    this.#date = initial.date ?? 0
    this.#basis = initial.basis
    this.#memory = options.memory ?? DEFAULT_MEMORY

    for (const [id, pts] of initial.channels ?? []) this.#channels.set(id, pts)
  }

  get pts(): number {
    return this.#pts
  }

  get qts(): number {
    return this.#qts
  }

  get seq(): number {
    return this.#seq
  }

  get date(): number {
    return this.#date
  }

  /** Whether the position began at a starting point Telegram reported. */
  get basis(): 'telegram' | undefined {
    return this.#basis
  }

  /** Record that the position now held is one Telegram reported as a starting point. */
  adoptBaseline(): void {
    this.#basis = 'telegram'
  }

  /** Where a channel stands, or nothing when it has never been followed. */
  channelPts(channelId: bigint): number | undefined {
    return this.#channels.get(channelId.toString())
  }

  /** Everything needed to resume, as a value that can be written down. */
  snapshot(): UpdateStateSnapshot {
    return {
      pts: this.#pts,
      qts: this.#qts,
      seq: this.#seq,
      date: this.#date,
      channels: new Map(this.#channels),
      ...(this.#basis === undefined ? {} : { basis: this.#basis }),
    }
  }

  /**
   * What should happen to an update that arrived at `pts`, consuming `count`.
   *
   * The three answers are the whole algorithm. A channel that has never been
   * followed has no local count to compare against, so its first update is
   * taken as the place to start rather than as a gap — there is nothing behind
   * it that could have been missed.
   */
  judge(options: {
    readonly box: BoxKind
    readonly pts: number
    readonly count: number
    readonly channelId?: bigint
  }): Verdict {
    const local = this.#localFor(options)
    if (local === undefined) return { kind: 'apply' }

    if (local + options.count === options.pts) return { kind: 'apply' }
    if (local + options.count > options.pts) return { kind: 'seen' }

    return { kind: 'gap' }
  }

  /**
   * What should happen to a container carrying a sequence of its own.
   *
   * A container with no start is not part of the sequence at all and is applied
   * as it arrives; the protocol uses that for updates whose order does not
   * matter. Everything else follows the same three answers as a box.
   */
  judgeContainer(options: { readonly seqStart: number; readonly seq: number }): Verdict {
    if (options.seqStart === 0) return { kind: 'apply' }

    if (this.#seq + 1 === options.seqStart) return { kind: 'apply' }
    if (this.#seq + 1 > options.seqStart) return { kind: 'seen' }

    return { kind: 'gap' }
  }

  /** Move a box on to where an applied update arrived. */
  advance(options: {
    readonly box: BoxKind
    readonly pts: number
    readonly channelId?: bigint
  }): void {
    if (options.box === 'secret') {
      this.#qts = Math.max(this.#qts, options.pts)
      return
    }

    if (options.box === 'common') {
      this.#pts = Math.max(this.#pts, options.pts)
      return
    }

    const key = this.#channelKey(options)
    this.#channels.set(key, Math.max(this.#channels.get(key) ?? 0, options.pts))
  }

  /** Move the container sequence on, and the clock with it. */
  advanceContainer(options: { readonly seq: number; readonly date?: number }): void {
    if (options.seq > 0) this.#seq = Math.max(this.#seq, options.seq)
    if (options.date !== undefined) this.#date = Math.max(this.#date, options.date)
  }

  /**
   * Take a box's word for where it is, without judging it.
   *
   * What a catch-up reports is the truth by definition: it is the server saying
   * where the box actually stands, not an update claiming a position in it.
   */
  reset(options: {
    readonly box: BoxKind
    readonly pts: number
    readonly channelId?: bigint
  }): void {
    if (options.box === 'secret') {
      this.#qts = options.pts
      return
    }
    if (options.box === 'common') {
      this.#pts = options.pts
      return
    }

    this.#channels.set(this.#channelKey(options), options.pts)
  }

  /** Stop following a channel, so its next update starts a fresh sequence. */
  forgetChannel(channelId: bigint): void {
    this.#channels.delete(channelId.toString())
  }

  /**
   * Whether something has already been handed out, remembering it if not.
   *
   * Answers for the first sight and every sight after it, so a caller asks once
   * per update and dispatches only when the answer is no.
   */
  seen(identity: string): boolean {
    if (this.#dispatched.has(identity)) return true

    this.#dispatched.add(identity)
    this.#order.push(identity)

    // Bounded from the front: what falls out is the oldest, which is the part a
    // catch-up will not mention again.
    while (this.#order.length > this.#memory) {
      const oldest = this.#order.shift()
      if (oldest !== undefined) this.#dispatched.delete(oldest)
    }

    return false
  }

  /** How much of the recent past is currently remembered. */
  get remembered(): number {
    return this.#order.length
  }

  #localFor(options: { box: BoxKind; channelId?: bigint }): number | undefined {
    if (options.box === 'common') return this.#pts
    if (options.box === 'secret') return this.#qts

    return this.#channels.get(this.#channelKey(options))
  }

  #channelKey(options: { channelId?: bigint }): string {
    if (options.channelId === undefined) {
      throw new TypeError('a channel box must name the channel it belongs to')
    }

    return options.channelId.toString()
  }
}
