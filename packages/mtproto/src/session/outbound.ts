// SPDX-License-Identifier: MPL-2.0

/**
 * What has been sent and not yet answered for.
 *
 * The server acknowledges what it has processed and silently drops what it has
 * not, so a message is delivered only once something says so. This is the
 * record that makes that knowable: what went out, when, whether it came back,
 * and how many times it has been tried.
 *
 * It deliberately holds no request state. A message identifier is the whole of
 * what the protocol knows about an outgoing message; what that message *was* —
 * a call, its arguments, the promise waiting on it — belongs to the layer that
 * created it, and putting the two together here would make the protocol record
 * depend on the shape of the caller above it.
 *
 * Nothing here sends anything. It answers which messages are eligible to be
 * sent again; the layer that owns the transport decides when.
 */

import { ValidationError } from '@yuigram/core'

/** Messages tracked before the caller is told it has too many in flight. */
const DEFAULT_CAPACITY = 2000

/**
 * Attempts a single message is given.
 *
 * The protocol names no limit, and without one a message the server will never
 * accept is sent forever. The bound converts that into a failure the caller can
 * report.
 */
const DEFAULT_MAX_ATTEMPTS = 5

/** What an acknowledgement referred to. */
export type AckOutcome =
  /** A message that was outstanding. It is now acknowledged. */
  | 'acknowledged'
  /** A message already acknowledged. The repeat changes nothing. */
  | 'already-acknowledged'
  /** No message this record knows about. Nothing changed. */
  | 'unknown'

/** What is known about one message that was sent. */
export interface TrackedMessage {
  readonly msgId: bigint
  readonly seqNo: number
  /** The server-clock second it was sent. */
  readonly sentAt: number
  readonly acknowledged: boolean
  /** How many times it has been sent, including the first. */
  readonly attempts: number
}

/** How the record is bounded. */
export interface OutboundOptions {
  /** Messages that may be outstanding at once. Defaults to 2000. */
  readonly capacity?: number
  /** Attempts a message is given before it is abandoned. Defaults to 5. */
  readonly maxAttempts?: number
}

/** A message that was sent, as it is handed to the record. */
export interface SentMessage {
  readonly msgId: bigint
  readonly seqNo: number
  /** The server-clock second it was sent. */
  readonly sentAt: number
  /**
   * The messages a container carries.
   *
   * Acknowledging a container acknowledges everything inside it, because the
   * server acknowledges what it read and it read them together.
   */
  readonly contains?: readonly bigint[]
  /**
   * The message this one is sent in place of.
   *
   * An identifier is used once: the server ignores a repeat as a duplicate, so
   * sending something again means sending a *new* message carrying the same
   * payload. The attempt count therefore belongs to the succession rather than
   * to any one identifier — without this the count would restart at every
   * resend and the limit would never bind.
   */
  readonly replaces?: bigint
}

interface Entry {
  readonly msgId: bigint
  readonly seqNo: number
  readonly sentAt: number
  acknowledged: boolean
  attempts: number
  readonly contains: readonly bigint[]
}

export class OutboundTracker {
  readonly #entries = new Map<bigint, Entry>()
  readonly #capacity: number
  readonly #maxAttempts: number

  constructor(options: OutboundOptions = {}) {
    this.#capacity = positive(options.capacity ?? DEFAULT_CAPACITY, 'capacity')
    this.#maxAttempts = positive(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 'maxAttempts')
  }

  /** How many messages are outstanding or awaiting cleanup. */
  get size(): number {
    return this.#entries.size
  }

  /**
   * Record a message that has gone out.
   *
   * Refuses rather than evicts once full. Every entry here was put there by
   * this client sending something, so a full record means the caller has more
   * in flight than it can account for — and dropping the oldest would lose the
   * knowledge that it was never answered.
   */
  track(sent: SentMessage): void {
    if (this.#entries.has(sent.msgId)) {
      throw new ValidationError(`message ${sent.msgId} is already being tracked`)
    }
    if (this.#entries.size >= this.#capacity) {
      throw new ValidationError(`cannot track more than ${this.#capacity} outstanding messages`)
    }

    this.#entries.set(sent.msgId, {
      msgId: sent.msgId,
      seqNo: sent.seqNo,
      sentAt: sent.sentAt,
      acknowledged: false,
      attempts: this.#inherit(sent.replaces),
      contains: sent.contains ?? [],
    })
  }

  /**
   * Carry the attempt count across a change of identifier.
   *
   * Each refusal is a caller error rather than a condition to absorb: replacing
   * something untracked, already acknowledged, or already exhausted would each
   * reset a count whose only purpose is to stop eventually.
   */
  #inherit(replaces: bigint | undefined): number {
    if (replaces === undefined) return 1

    const previous = this.#entries.get(replaces)
    if (previous === undefined) {
      throw new ValidationError(`message ${replaces} is not being tracked and cannot be replaced`)
    }
    if (previous.acknowledged) {
      throw new ValidationError(`message ${replaces} was acknowledged and must not be sent again`)
    }
    if (previous.attempts >= this.#maxAttempts) {
      throw new ValidationError(`message ${replaces} has been tried ${previous.attempts} times`)
    }

    this.#entries.delete(replaces)
    return previous.attempts + 1
  }

  /**
   * Mark a message acknowledged.
   *
   * An identifier this record does not hold is reported rather than recorded.
   * Acknowledgements arrive from the network, so inventing an entry for one
   * would let the far end decide how much is remembered.
   */
  acknowledge(msgId: bigint): AckOutcome {
    const entry = this.#entries.get(msgId)
    if (entry === undefined) return 'unknown'
    if (entry.acknowledged) return 'already-acknowledged'

    entry.acknowledged = true
    // A container is acknowledged as a unit, so what it carried is too.
    for (const inner of entry.contains) this.acknowledge(inner)

    return 'acknowledged'
  }

  /** What is known about one message. */
  get(msgId: bigint): TrackedMessage | undefined {
    const entry = this.#entries.get(msgId)
    if (entry === undefined) return undefined

    const { contains: _contains, ...tracked } = entry
    return tracked
  }

  /**
   * Messages that were sent before `deadline` and have not been answered for.
   *
   * Ascending by identifier, which is send order: a server that dropped a run
   * of messages should see them again in the order it did not see them.
   */
  due(deadline: number): bigint[] {
    const out: bigint[] = []

    for (const entry of this.#entries.values()) {
      if (entry.acknowledged) continue
      if (entry.attempts >= this.#maxAttempts) continue
      if (entry.sentAt > deadline) continue

      out.push(entry.msgId)
    }

    return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  }

  /**
   * Whether a message may be sent again under a new identifier.
   *
   * A pure question: asking it changes nothing, and the count advances only
   * when a replacement is actually tracked.
   */
  canResend(msgId: bigint): boolean {
    const entry = this.#entries.get(msgId)

    return entry !== undefined && !entry.acknowledged && entry.attempts < this.#maxAttempts
  }

  /** Whether a message has been tried as often as it is allowed to be. */
  exhausted(msgId: bigint): boolean {
    const entry = this.#entries.get(msgId)
    return entry !== undefined && entry.attempts >= this.#maxAttempts
  }

  /** Stop tracking a message, once the caller has finished with it. */
  forget(msgId: bigint): void {
    this.#entries.delete(msgId)
  }

  /** Forget everything, as a replaced session must. */
  clear(): void {
    this.#entries.clear()
  }
}

/**
 * What the server knows about one message it was asked about.
 *
 * The answer to `msgs_state_req` is a byte per identifier: the low three bits
 * say whether it arrived, and the fourth says whether it had already been
 * acknowledged.
 */
export interface MessageStatus {
  /**
   * 1 — nothing is known; the identifier is too old to be remembered.
   * 2 — not received, and within the range the server does remember.
   * 3 — not received, and newer than anything the server has seen.
   * 4 — received.
   */
  readonly state: 1 | 2 | 3 | 4
  /** Whether the server had already acknowledged it. */
  readonly acknowledged: boolean
}

/** Whether a status means the server does not have the message. */
export function needsResend(status: MessageStatus): boolean {
  return status.state !== 4
}

/**
 * Read the status bytes the server answers a state query with.
 *
 * One byte per identifier asked about, in the order they were asked. A byte
 * whose low bits name no defined state is refused: the correspondence between
 * bytes and identifiers is positional, so a byte that cannot be read leaves
 * every one after it meaning something other than what it says.
 */
export function decodeMessageStatuses(info: Uint8Array): MessageStatus[] {
  return [...info].map((byte, index) => {
    const state = byte & 0b111

    if (state < 1 || state > 4) {
      throw new ValidationError(`message state ${state} at position ${index} is not defined`)
    }

    return { state: state as 1 | 2 | 3 | 4, acknowledged: (byte & 0b1000) !== 0 }
  })
}

function positive(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${name} must be a positive integer, received ${value}`)
  }
  return value
}
