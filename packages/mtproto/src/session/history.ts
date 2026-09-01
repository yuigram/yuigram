/**
 * What the connection has already seen.
 *
 * Two rules decide whether an inbound message is allowed to have an effect, and
 * both need memory that a single message cannot supply.
 *
 * **It must not have arrived before.** The server resends a message it believes
 * was not acknowledged, so the same identifier arriving twice is ordinary rather
 * than hostile — but acting on it twice is not. An acknowledgement replayed by
 * an attacker is the same shape as a resend, and neither may be processed
 * twice.
 *
 * **It must be recent.** An identifier carries the time it was created, so a
 * message far outside the window either predates this connection or was held by
 * someone. The window is the protocol's, and it is deliberately asymmetric:
 * clocks drift backwards more readily than messages arrive from the future.
 *
 * The record is bounded. It is fed by the network, so an unbounded one is a
 * connection that costs memory in proportion to how long it is held open.
 */

import { ValidationError } from '@yuigram/core'

/**
 * Identifiers retained before the oldest is forgotten.
 *
 * Large enough that a burst cannot push a live identifier out of the window,
 * small enough that the record is a fixed cost.
 */
const DEFAULT_CAPACITY = 1000

/** Seconds a message may be dated into the future before it is refused. */
const FUTURE_TOLERANCE = 30

/** Seconds a message may be dated into the past before it is refused. */
const PAST_TOLERANCE = 300

/** How a message identifier was rejected, or that it was accepted. */
export type Admission = 'accepted' | 'duplicate' | 'too-old' | 'outside-window'

/** How the record is sized. */
export interface HistoryOptions {
  /** Identifiers to retain. Defaults to 1000. */
  readonly capacity?: number
}

/**
 * The identifiers this connection has already acted on.
 *
 * Kept in ascending order so the oldest is known without scanning, which is what
 * lets the record answer "older than everything retained" as well as "seen".
 */
export class MessageHistory {
  readonly #seen: bigint[] = []
  readonly #capacity: number

  constructor(options: HistoryOptions = {}) {
    const capacity = options.capacity ?? DEFAULT_CAPACITY
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new ValidationError(`history capacity must be a positive integer, received ${capacity}`)
    }

    this.#capacity = capacity
  }

  /** How many identifiers are retained. */
  get size(): number {
    return this.#seen.length
  }

  /**
   * Record an identifier, reporting whether it may be acted on.
   *
   * An identifier older than everything retained is refused rather than
   * inserted: the record cannot prove it is new, and treating "forgotten" as
   * "unseen" would make a replay succeed by being old enough.
   */
  admit(msgId: bigint): Admission {
    const at = this.#locate(msgId)
    if (at < this.#seen.length && this.#seen[at] === msgId) return 'duplicate'

    if (this.#seen.length >= this.#capacity && at === 0) return 'too-old'

    this.#seen.splice(at, 0, msgId)
    if (this.#seen.length > this.#capacity) this.#seen.shift()

    return 'accepted'
  }

  /** Whether an identifier is currently retained. */
  has(msgId: bigint): boolean {
    const at = this.#locate(msgId)
    return at < this.#seen.length && this.#seen[at] === msgId
  }

  /** Forget everything, as a new session must. */
  clear(): void {
    this.#seen.length = 0
  }

  /** The insertion point that keeps the record ascending. */
  #locate(msgId: bigint): number {
    let low = 0
    let high = this.#seen.length

    while (low < high) {
      const middle = (low + high) >>> 1
      if ((this.#seen[middle] ?? 0n) < msgId) low = middle + 1
      else high = middle
    }

    return low
  }
}

/**
 * Whether an identifier's embedded time is close enough to the server's.
 *
 * The high 32 bits are the second the sender created the message, so the check
 * needs no field of its own. `now` is the server's clock — the local one
 * corrected by the offset the handshake learned — because the window belongs to
 * the server's timeline, not to whatever the local machine believes.
 */
export function withinAcceptanceWindow(msgId: bigint, now: number): boolean {
  const created = Number(BigInt.asUintN(64, msgId) >> 32n)

  return created - now <= FUTURE_TOLERANCE && now - created <= PAST_TOLERANCE
}
