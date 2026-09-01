/**
 * When a connection should do the things it does periodically.
 *
 * A connection has standing obligations that nothing in particular triggers: it
 * must notice that a request's deadline has passed, ask for salts before it runs
 * out, find out whether the server received what it sent, prove it is still
 * there, and put queued messages on the wire. Each is a question of *when*, and
 * answering each with its own timer produces a component that cannot be tested
 * without waiting and cannot be reasoned about without enumerating the
 * interleavings.
 *
 * So there are no timers here. The schedule holds the moment each duty next
 * falls due and answers, for a moment the caller supplies, which duties have
 * arrived. The caller — the layer that owns the connection and its I/O — keeps
 * one real timer, set to {@link ConnectionSchedule.nextWakeup}. That keeps every
 * timing rule in one place, makes the whole of it decidable from a number, and
 * keeps this layer free of any dependency on a runtime's clock.
 *
 * It also holds no requests, no messages and no salts. Deciding *what* to expire
 * or *which* messages to ask about belongs to the records that own them; this
 * decides only that the moment to ask has come.
 *
 * Two consequences worth stating. Because there are no callbacks, there is no
 * such thing as a stale callback firing into a replaced connection — but work
 * *derived* from a decision can still outlive the connection it was decided
 * for, so every answer carries the epoch it was decided in and
 * {@link ConnectionSchedule.current} says whether that epoch is still the one
 * running. And because duties are moments rather than loops, starting twice
 * cannot produce two of anything.
 */

import { ValidationError } from '@yuigram/core'

/**
 * Something the connection owes.
 *
 * Named for the decision rather than the action: `salts` means the moment to
 * consider asking has come, not that salts are needed — how much reserve is
 * left is the reservoir's to say, and it is not this layer's to hold.
 */
export type Duty =
  /** Requests whose deadline has passed should be given up on. */
  | 'expiry'
  /** The salt reserve should be checked, and refilled if it is low. */
  | 'salts'
  /** Delivery of what was sent and not acknowledged should be reconciled. */
  | 'state'
  /** Liveness should be proven. */
  | 'ping'
  /** What is queued should be composed and sent. */
  | 'flush'

/**
 * The order duties are reported in when several fall due together.
 *
 * Expiry first: a request that has already timed out should not then be asked
 * about, waited on, or sent. Flush last, so anything the duties before it
 * queued travels in the same batch rather than waiting for the next one.
 */
const ORDER: readonly Duty[] = ['expiry', 'salts', 'state', 'ping', 'flush']

/** Duties that recur, as opposed to being armed for a particular moment. */
const PERIODIC: readonly Duty[] = ['salts', 'state', 'ping']

/**
 * How often liveness is proven, in milliseconds.
 *
 * The protocol documents a client pinging once a minute and asking the server to
 * hold the connection open for seventy-five seconds as its own example, so the
 * default follows it. Nothing requires this interval; it is the rate at which a
 * dead connection is noticed.
 */
const DEFAULT_PING_INTERVAL = 60_000

/**
 * How often the salt reserve is considered, in milliseconds.
 *
 * **Policy, not protocol.** A salt lasts thirty minutes, so checking three times
 * within one salt's life means a refill that fails still has two more chances
 * before the reserve could matter.
 */
const DEFAULT_SALT_INTERVAL = 600_000

/**
 * How often delivery is reconciled, in milliseconds.
 *
 * **Policy, not protocol.** The protocol provides the query and says nothing
 * about how often to send it. Half a minute is short enough that a dropped
 * message is noticed while the caller still cares and long enough that a healthy
 * connection spends almost nothing on it.
 */
const DEFAULT_STATE_INTERVAL = 30_000

/**
 * How long queued work waits for company, in milliseconds.
 *
 * Zero by default: a batch is due as soon as anything is queued. Batching still
 * happens, because everything queued before the caller next acts travels
 * together. A caller that would rather wait for a fuller container than send
 * promptly can raise it — that is a latency decision, not a protocol one.
 */
const DEFAULT_FLUSH_DELAY = 0

/**
 * Pings that may be outstanding at once.
 *
 * A ping is answered within a round trip, so more than a couple outstanding
 * means the connection is already gone. The bound exists so that a connection
 * that is never answered does not accumulate a record per ping for as long as it
 * stays open.
 */
const DEFAULT_MAX_OUTSTANDING_PINGS = 8

/** What was decided, and the connection it was decided for. */
export interface ScheduledWork {
  /**
   * The connection this was decided in.
   *
   * Work derived from a decision may be carried across a reconnect by a caller
   * that was already acting on it. Checking the epoch before applying it is what
   * stops the old connection's conclusions reaching the new one.
   */
  readonly epoch: number
  /** In {@link ORDER}. */
  readonly duties: readonly Duty[]
}

/** How the schedule is built. */
export interface ScheduleOptions {
  /** Milliseconds between pings. Defaults to 60000. */
  readonly pingInterval?: number
  /** Milliseconds between salt checks. Defaults to 600000. */
  readonly saltInterval?: number
  /** Milliseconds between delivery reconciliations. Defaults to 30000. */
  readonly stateInterval?: number
  /** Milliseconds queued work waits before a flush is due. Defaults to 0. */
  readonly flushDelay?: number
  /** Pings that may be outstanding at once. Defaults to 8. */
  readonly maxOutstandingPings?: number
}

export class ConnectionSchedule {
  readonly #interval: ReadonlyMap<Duty, number>
  readonly #flushDelay: number
  readonly #maxOutstandingPings: number

  /** When each armed duty next falls due. A duty absent from this is not armed. */
  readonly #dueAt = new Map<Duty, number>()

  /** When each outstanding ping was sent, keyed by the identifier it carried. */
  readonly #pings = new Map<bigint, number>()

  #epoch = 0
  #running = false
  #nextPingId = 1n
  #lastRtt: number | undefined

  constructor(options: ScheduleOptions = {}) {
    this.#interval = new Map<Duty, number>([
      ['ping', positive(options.pingInterval ?? DEFAULT_PING_INTERVAL, 'pingInterval')],
      ['salts', positive(options.saltInterval ?? DEFAULT_SALT_INTERVAL, 'saltInterval')],
      ['state', positive(options.stateInterval ?? DEFAULT_STATE_INTERVAL, 'stateInterval')],
    ])

    const delay = options.flushDelay ?? DEFAULT_FLUSH_DELAY
    if (!Number.isInteger(delay) || delay < 0) {
      throw new ValidationError(`flushDelay must be a whole number of milliseconds, got ${delay}`)
    }

    this.#flushDelay = delay
    this.#maxOutstandingPings = positive(
      options.maxOutstandingPings ?? DEFAULT_MAX_OUTSTANDING_PINGS,
      'maxOutstandingPings',
    )
  }

  /** Whether the schedule is running. */
  get running(): boolean {
    return this.#running
  }

  /** Which connection is running, counting from one. Zero before the first. */
  get epoch(): number {
    return this.#epoch
  }

  /** The most recent round trip measured, in milliseconds. */
  get roundTrip(): number | undefined {
    return this.#lastRtt
  }

  /** How many pings have been sent and not answered. */
  get outstandingPings(): number {
    return this.#pings.size
  }

  /** Whether work decided in `epoch` still belongs to the connection running now. */
  current(epoch: number): boolean {
    return this.#running && epoch === this.#epoch
  }

  /**
   * Begin, on a connection that has just been established.
   *
   * A second call while already running changes nothing: the periodic duties
   * are moments rather than loops, so there is nothing a repeat could duplicate,
   * and re-arming them would silently move a schedule the caller believed was
   * already set.
   */
  start(now: number): void {
    if (this.#running) return

    check(now)
    this.#running = true
    this.#epoch += 1

    for (const duty of PERIODIC) {
      this.#dueAt.set(duty, now + this.#intervalOf(duty))
    }
  }

  /**
   * Stop, on a connection that has been lost or closed.
   *
   * Everything armed is disarmed and the liveness record is discarded, both
   * being properties of the connection that ended. What is *not* touched is
   * anything measured against an absolute moment — a request's deadline
   * describes how long its caller will wait, which a reconnect does not change.
   */
  stop(): void {
    this.#running = false
    this.#dueAt.clear()
    this.#pings.clear()
    this.#lastRtt = undefined
  }

  /**
   * Arm the expiry wake for the earliest deadline outstanding.
   *
   * One wake for all of them, rather than a timer each: the first deadline to
   * pass is the only one that can need attention next, and the pass that handles
   * it re-arms from whatever is then earliest. Passing `undefined` disarms,
   * which is the state when nothing is outstanding.
   */
  expireAt(deadline: number | undefined): void {
    if (deadline === undefined) {
      this.#dueAt.delete('expiry')
      return
    }

    check(deadline)
    this.#dueAt.set('expiry', deadline)
  }

  /**
   * Note that something is queued to send.
   *
   * Idempotent while a flush is already pending: the second message joins the
   * batch the first one armed rather than arming a batch of its own, which is
   * what keeps queuing *n* messages from producing *n* flushes.
   */
  queued(now: number): void {
    check(now)
    if (this.#dueAt.has('flush')) return

    this.#dueAt.set('flush', now + this.#flushDelay)
  }

  /** Whether a flush is owed and has not yet happened. */
  get flushPending(): boolean {
    return this.#dueAt.has('flush')
  }

  /**
   * Note that what was queued has gone out.
   *
   * A flush is the one duty that is not discharged by being noticed. The others
   * are moments — the moment to expire, the moment to ping — and taking the
   * moment is the whole of it. A flush is an obligation to put bytes on a wire,
   * which remains owed until that happens, so it is reported for as long as it
   * is outstanding and cleared here.
   *
   * This is also what stops a pass from arming a second flush. Work queued while
   * handling one duty joins the batch the pass is already going to send, because
   * the flush it would have armed is still pending.
   */
  flushed(): void {
    this.#dueAt.delete('flush')
  }

  /** When a duty next falls due, if it is armed. */
  dueAt(duty: Duty): number | undefined {
    return this.#dueAt.get(duty)
  }

  /**
   * The earliest moment anything falls due.
   *
   * What the caller's single timer is set to. `undefined` only while stopped
   * with nothing armed, since a running schedule always has its periodic duties.
   */
  nextWakeup(): number | undefined {
    let earliest: number | undefined

    for (const at of this.#dueAt.values()) {
      if (earliest === undefined || at < earliest) earliest = at
    }

    return earliest
  }

  /**
   * The duties that have fallen due at `now`.
   *
   * Taking them re-arms what recurs and clears what was armed for one moment,
   * so a duty is reported once per time it comes due. A schedule that is not
   * running reports nothing, which is what makes a wake that races a close
   * harmless rather than something the caller has to guard against.
   */
  due(now: number): ScheduledWork {
    if (!this.#running) return { epoch: this.#epoch, duties: [] }

    check(now)
    const duties: Duty[] = []

    for (const duty of ORDER) {
      const at = this.#dueAt.get(duty)
      if (at === undefined || at > now) continue

      duties.push(duty)

      // A duty armed for a single moment is spent; one that recurs moves to its
      // next slot. Both are settled before the caller sees the answer, so a
      // caller that acts and asks again does not receive the same duty twice.
      // The exception is the flush, which stays owed until it has happened.
      if (duty === 'flush') continue

      const interval = this.#interval.get(duty)
      if (interval === undefined) this.#dueAt.delete(duty)
      else this.#dueAt.set(duty, advance(at, now, interval))
    }

    return { epoch: this.#epoch, duties }
  }

  /** The identifier for the next ping. */
  nextPingId(): bigint {
    const id = this.#nextPingId
    this.#nextPingId += 1n

    return id
  }

  /**
   * Record that a ping went out.
   *
   * The oldest outstanding one is dropped once the bound is reached. A ping that
   * far behind will not be answered — the connection carrying it is gone — and
   * keeping it would only mean measuring a round trip against a moment that no
   * longer describes anything.
   */
  pingSent(pingId: bigint, at: number): void {
    check(at)

    if (this.#pings.size >= this.#maxOutstandingPings) {
      const oldest = this.#pings.keys().next()
      if (!oldest.done) this.#pings.delete(oldest.value)
    }

    this.#pings.set(pingId, at)
  }

  /**
   * Record a pong, and report the round trip it measured.
   *
   * `undefined` for a pong naming a ping this connection did not send, or one it
   * has already been answered for. A duplicate is not an error — a server may
   * repeat a message, and the layer that rejects duplicates works on message
   * identifiers rather than on what a message says — but it measures nothing,
   * because the second copy travelled at a time nobody asked about.
   *
   * A pong that claims to have arrived before its ping left measures nothing
   * either. That is a clock moving backwards rather than a fast network, and a
   * negative round trip recorded as a measurement would make the connection look
   * its healthiest at the moment its timekeeping broke.
   */
  pongReceived(pingId: bigint, at: number): number | undefined {
    check(at)

    const sent = this.#pings.get(pingId)
    if (sent === undefined) return undefined

    this.#pings.delete(pingId)
    if (at < sent) return undefined

    this.#lastRtt = at - sent
    return this.#lastRtt
  }

  #intervalOf(duty: Duty): number {
    const interval = this.#interval.get(duty)
    if (interval === undefined) {
      throw new ValidationError(`'${duty}' does not recur`)
    }

    return interval
  }
}

/**
 * The next slot at or after `now`, counting from the slot that was missed.
 *
 * Counted from the scheduled moment rather than from `now`, so a duty handled
 * late does not push every later one later with it — the schedule stays aligned
 * to where it started instead of drifting by however long each pass took.
 *
 * Skipped slots are skipped, not caught up. A connection that was paused for an
 * hour owes one ping, not sixty; delivering the backlog would answer a pause
 * with a burst at the moment the connection is least able to absorb one. The
 * count is arithmetic rather than a loop so that the cost of a long pause does
 * not scale with its length.
 */
function advance(at: number, now: number, interval: number): number {
  const missed = Math.floor((now - at) / interval) + 1

  return at + missed * interval
}

/**
 * Refuse a moment that is not one.
 *
 * A moment that is not a finite number poisons every due time computed from it,
 * and comparisons against the result silently answer `false` rather than
 * failing — so a schedule given one would simply stop reporting anything as due.
 */
function check(now: number): void {
  if (!Number.isFinite(now)) {
    throw new ValidationError(`a moment must be a finite number of milliseconds, got ${now}`)
  }
}

function positive(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${name} must be a positive integer, received ${value}`)
  }

  return value
}
