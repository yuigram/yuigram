// SPDX-License-Identifier: MIT

/**
 * The state one authenticated connection carries.
 *
 * A session is what the server uses to tell one client connection from another
 * under the same authorization key. It is not the authorization: the key
 * outlives it, and a new session under the same key is an ordinary event that
 * the server announces with `new_session_created`.
 *
 * Three things live here and nowhere else, because all three are sequences
 * rather than values and a second copy of any of them silently loses messages:
 * the session identifier, the message identifiers, and the sequence numbers.
 */

import { ValidationError } from '@yuigram/core'
import { randomBytes as defaultRandom } from '../crypto/random.js'
import { createMessageIdGenerator } from '../message/plaintext.js'

/** How a session is opened. */
export interface SessionOptions {
  /** The salt the handshake derived. Replaced when the server sends a new one. */
  readonly salt: bigint
  /** Randomness for the session identifier. */
  readonly random?: (length: number) => Uint8Array
  /** Milliseconds since the epoch, for message identifiers. */
  readonly now?: () => number
  /**
   * Correction between the local clock and the server's, in seconds.
   *
   * Learned from the handshake. A message more than 30 seconds ahead of the
   * server's clock or 300 behind is rejected, and a wrong local clock is an
   * ordinary condition rather than an exceptional one.
   *
   * Omitted for a session opened under a stored key, which has no handshake to
   * learn it from. The local clock stands in for the server's until the server
   * sends something under this session, which is when the clock is learned.
   */
  readonly timeOffset?: number
}

/**
 * Constructors that are never content-related.
 *
 * A content-related message is one the receiver must acknowledge, which is
 * almost everything. Containers, acknowledgements and the compression wrapper
 * are the exceptions: acknowledging an acknowledgement does not terminate.
 *
 * The distinction is carried in the low bit of `seq_no`, so getting it wrong
 * does not produce an error — the server simply stops treating the message the
 * way the sender intended.
 *
 * Exported because the layer that builds outgoing messages has to recognise
 * these as the wrappers it constructs itself rather than as queries a caller
 * may supply, and a second list would be a second place for the rule to drift.
 */
export const NEVER_CONTENT_RELATED: ReadonlySet<string> = new Set([
  'msgs_ack',
  'msg_container',
  'msg_copy',
  'gzip_packed',
])

/** Whether a message built from this TL combinator must be acknowledged. */
export function isContentRelated(combinator: string): boolean {
  return !NEVER_CONTENT_RELATED.has(combinator)
}

/**
 * Seconds past its own clock the server accepts a client identifier.
 *
 * One dated further ahead is refused with `bad_msg_notification` code 17.
 */
const SERVER_FUTURE_TOLERANCE = 30

export class Session {
  #id: bigint
  #salt: bigint
  #seqNo = 0
  #timeOffset: number
  #clockMeasured: boolean
  #lastMsgId: bigint | undefined
  readonly #random: (length: number) => Uint8Array
  readonly #now: () => number
  #nextMsgId: () => bigint

  constructor(options: SessionOptions) {
    this.#random = options.random ?? defaultRandom
    this.#now = options.now ?? Date.now
    this.#salt = options.salt
    this.#timeOffset = options.timeOffset ?? 0
    this.#clockMeasured = options.timeOffset !== undefined
    this.#id = drawSessionId(this.#random)
    this.#nextMsgId = this.#identifiers()
  }

  /** A fresh run of identifiers, each above the last within it. */
  #identifiers(): () => bigint {
    return createMessageIdGenerator({
      origin: 'client',
      now: this.#now,
      timeOffset: () => this.#timeOffset,
    })
  }

  /** The identifier the server uses to recognise this connection. */
  get id(): bigint {
    return this.#id
  }

  /** The salt currently in force. */
  get salt(): bigint {
    return this.#salt
  }

  /** Seconds to add to the local clock to reach the server's. */
  get timeOffset(): number {
    return this.#timeOffset
  }

  /**
   * Whether the server's clock is known here, rather than assumed.
   *
   * True when a handshake measured it or the server has since stated it. A
   * session opened under a stored key starts without either: the offset that
   * key was negotiated with is only true against the clock it was measured on,
   * so it is not kept, and until the server is heard from the local clock is a
   * guess.
   */
  get clockMeasured(): boolean {
    return this.#clockMeasured
  }

  /** The server's clock, in whole seconds. */
  serverNow(): number {
    return Math.floor(this.#now() / 1000) + this.#timeOffset
  }

  /**
   * Adopt the server's clock, reported as whole seconds.
   *
   * The server states its time by rejecting a message, so the offset is learned
   * rather than configured. It is computed here because this is where the local
   * clock lives — a caller subtracting its own `Date.now()` would be measuring
   * against a different one.
   */
  adoptServerTime(seconds: number): void {
    this.#timeOffset = Math.trunc(seconds) - Math.floor(this.#now() / 1000)
    this.#clockMeasured = true
  }

  /**
   * Start again under a new identifier.
   *
   * The server has said something about this connection that cannot be repaired
   * by resending — a sequence number it will not accept, or a container it
   * could not read. Continuing under the same identifier would repeat whatever
   * produced that, so the connection is given a new one and the counter that
   * numbers its messages returns to the beginning. Message identifiers go on
   * rising across it.
   */
  reset(): void {
    this.#id = drawSessionId(this.#random)
    this.#seqNo = 0
  }

  /**
   * Start again under a new identifier, with identifiers from the clock as it is.
   *
   * For the one case an ordinary reset cannot mend: the clock was corrected to
   * below identifiers this session already issued. Identifiers only rise within
   * a session, so every one after those would be dated ahead of the server and
   * refused until the clock caught up — as long as the clock was wrong. The
   * protocol asks identifiers to rise within a session; a new session is where
   * they may start lower, and nowhere else.
   */
  restartFromClock(): void {
    this.reset()
    this.#lastMsgId = undefined
    this.#nextMsgId = this.#identifiers()
  }

  /**
   * Whether an identifier this session issued is dated further ahead of the
   * server's clock than the server accepts.
   *
   * Identifiers only rise within a session, so once one has been issued ahead
   * of the clock — before the clock was corrected — every identifier after it is
   * ahead too, and refused, until the clock catches up with it. That is as long
   * as the clock was wrong, which is how long nothing sent would be answered.
   */
  issuedAhead(): boolean {
    if (this.#lastMsgId === undefined) return false

    const issued = Number(BigInt.asUintN(64, this.#lastMsgId) >> 32n)
    return issued > this.serverNow() + SERVER_FUTURE_TOLERANCE
  }

  /**
   * Adopt a salt the server supplied.
   *
   * Salts expire roughly hourly, and the server's remedy for a stale one is to
   * reject the message and name the replacement.
   */
  adoptSalt(salt: bigint): void {
    this.#salt = salt
  }

  /** How many content-related messages this session has sent. */
  get contentSent(): number {
    return this.#seqNo
  }

  /** The next message identifier. */
  nextMsgId(): bigint {
    const msgId = this.#nextMsgId()
    this.#lastMsgId = msgId

    return msgId
  }

  /**
   * The next sequence number.
   *
   * `2n` for a message that needs no acknowledgement, `2n+1` for one that does,
   * where `n` counts only the content-related messages sent before it. Only a
   * content-related message advances the counter.
   */
  nextSeqNo(contentRelated: boolean): number {
    if (!contentRelated) return this.#seqNo * 2

    const value = this.#seqNo * 2 + 1
    this.#seqNo += 1
    return value
  }
}

/**
 * Draw a session identifier.
 *
 * Zero is the value the field holds before a session exists, so a session that
 * drew it would be indistinguishable from one that was never opened.
 */
function drawSessionId(random: (length: number) => Uint8Array): bigint {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = random(8)
    if (bytes.length !== 8) {
      throw new ValidationError(`a session identifier needs 8 bytes, received ${bytes.length}`)
    }

    const value = new DataView(bytes.buffer, bytes.byteOffset, 8).getBigInt64(0, true)
    if (value !== 0n) return value
  }

  throw new ValidationError('failed to draw a non-zero session identifier')
}
