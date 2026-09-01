/**
 * The unencrypted message envelope.
 *
 * Before an auth key exists there is nothing to encrypt with, so the messages
 * that negotiate one travel in the clear under a header that says so:
 *
 * ```
 * [auth_key_id = 0 : 8][msg_id : 8][length : 4][body : length]
 * ```
 *
 * A zero `auth_key_id` is the whole signal. Once a key is established every
 * message carries its identifier instead, and a peer that sees zero after the
 * handshake is looking at a message that does not belong to the session.
 *
 * This envelope is used by both ends of the handshake, so it lives here rather
 * than inside either one.
 */

import { YuigramError } from '@yuigram/core'

/** A message the envelope could not carry or recover. */
export class MessageError extends YuigramError {
  override readonly name = 'MessageError'
}

/** Fixed part of the envelope: key identifier, message identifier, length. */
const HEADER_SIZE = 20

/** The identifier that marks a message as unencrypted. */
const UNENCRYPTED_KEY_ID = 0n

/** A decoded unencrypted message. */
export interface PlaintextMessage {
  /** The sender's message identifier. */
  readonly msgId: bigint
  /** The serialized TL body. */
  readonly body: Uint8Array
}

/** Wrap a TL body in the unencrypted envelope. */
export function encodePlaintextMessage(msgId: bigint, body: Uint8Array): Uint8Array {
  if (body.length > 0x7fff_ffff) {
    throw new MessageError(`message body of ${body.length} bytes exceeds the length field`)
  }

  const out = new Uint8Array(HEADER_SIZE + body.length)
  const view = new DataView(out.buffer)

  view.setBigUint64(0, UNENCRYPTED_KEY_ID, true)
  view.setBigInt64(8, msgId, true)
  view.setInt32(16, body.length, true)
  out.set(body, HEADER_SIZE)

  return out
}

/**
 * Recover a TL body from the unencrypted envelope.
 *
 * Every field is checked against the buffer that carried it. A declared length
 * that disagrees with what arrived means the sender and this reader disagree
 * about the message, and continuing would hand a truncated body to a decoder
 * that would read past its end.
 */
export function decodePlaintextMessage(bytes: Uint8Array): PlaintextMessage {
  if (bytes.length < HEADER_SIZE) {
    throw new MessageError(
      `an unencrypted message needs ${HEADER_SIZE} bytes, received ${bytes.length}`,
    )
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const keyId = view.getBigUint64(0, true)

  if (keyId !== UNENCRYPTED_KEY_ID) {
    throw new MessageError(
      `expected an unencrypted message, found auth key 0x${keyId.toString(16)}`,
    )
  }

  const length = view.getInt32(16, true)
  if (length < 0) {
    throw new MessageError(`negative message length ${length}`)
  }
  if (HEADER_SIZE + length > bytes.length) {
    throw new MessageError(
      `message declares ${length} bytes of body, ${bytes.length - HEADER_SIZE} arrived`,
    )
  }

  return {
    msgId: view.getBigInt64(8, true),
    body: bytes.slice(HEADER_SIZE, HEADER_SIZE + length),
  }
}

/** Which end produced a message identifier, which fixes its low two bits. */
export type MessageOrigin = 'client' | 'server-response' | 'server-initiated'

/** The low two bits each origin must set. */
const ORIGIN_BITS: Readonly<Record<MessageOrigin, bigint>> = {
  client: 0n,
  'server-response': 1n,
  'server-initiated': 3n,
}

/** Options for {@link createMessageIdGenerator}. */
export interface MessageIdOptions {
  /** Which end is generating, deciding the identifier's low two bits. */
  readonly origin: MessageOrigin
  /** Milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /**
   * Correction between the local clock and the server's, in seconds.
   *
   * A message more than 30 seconds ahead or 300 behind the server's clock is
   * rejected, and a user's clock being wrong is ordinary. The offset is learned
   * from the server and applied here rather than at each call site.
   *
   * Supplied as a function where it can change while the connection is open:
   * the server corrects it through `bad_msg_notification`, and a generator that
   * captured the value at construction would keep producing identifiers the
   * server has already said are wrong.
   */
  readonly timeOffset?: number | (() => number)
}

/** Low 32 bits: the word carrying the fraction and the origin. */
const LOW_WORD = 0xffff_ffffn
/** Identifiers are `long`, so a value past this is carried as negative. */
const INT64_MAX = (1n << 63n) - 1n
/** Two's-complement wrap for the value the wire actually carries. */
const UINT64 = 1n << 64n

/**
 * Message identifiers for one end of a connection.
 *
 * `msg_id ≈ unixtime · 2^32`: whole seconds in the high 32 bits, the fraction of
 * a second scaled into the low 32, and the low two bits fixed by which end
 * produced it.
 *
 * Two rules the server enforces shape the rest. The low 32 bits of a client
 * identifier **must not be empty**, which they would be for a message created
 * exactly on a second boundary — roughly one message in a thousand, and the
 * server's remedy is to ignore it, leaving a caller waiting for a reply that
 * never comes. And the sequence must strictly increase, because a repeated or
 * lower identifier is treated as a duplicate and dropped, so a collision or a
 * clock that moves backwards advances past it instead.
 *
 * The value is returned in the signed form a `long` carries on the wire, which
 * is what a decoder reads back. The two representations differ only past 2038,
 * but they differ silently, and matching a reply to a pending request compares
 * them directly.
 */
export function createMessageIdGenerator(options: MessageIdOptions): () => bigint {
  const now = options.now ?? Date.now
  const bits = ORIGIN_BITS[options.origin]
  let last = 0n

  return () => {
    const offset =
      typeof options.timeOffset === 'function' ? options.timeOffset() : options.timeOffset
    const milliseconds = BigInt(Math.trunc(now())) + BigInt(Math.trunc(offset ?? 0)) * 1000n
    const seconds = milliseconds / 1000n
    const fraction = ((milliseconds % 1000n) << 32n) / 1000n

    const candidate = (seconds << 32n) | (fraction & 0xffff_fffcn) | bits
    // An empty low word is rejected by the server, so step off the boundary.
    const proposed = (candidate & LOW_WORD) === 0n ? candidate + 4n : candidate

    const value = proposed > last ? proposed : last + 4n
    last = value

    return value > INT64_MAX ? value - UINT64 : value
  }
}
