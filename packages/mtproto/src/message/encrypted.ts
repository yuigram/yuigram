// SPDX-License-Identifier: MPL-2.0

/**
 * The encrypted message envelope.
 *
 * Every message after the handshake travels in this form:
 *
 * ```
 * outer:     [auth_key_id:8][msg_key:16][encrypted_data:…]
 * plaintext: [salt:8][session_id:8][msg_id:8][seq_no:4][length:4][body][padding]
 * ```
 *
 * `msg_key` is not a nonce. It is a hash over a slice of the auth key and the
 * whole plaintext, and the AES key and IV are derived from it, so a plaintext
 * that decrypts to different bytes than the sender encrypted produces a
 * different `msg_key` than the one on the wire. Recomputing and comparing it is
 * therefore the integrity check, and it is the reason the comparison happens on
 * every message and cannot be skipped once something else has already failed:
 * a check that stops early is a check that answers questions about the key.
 *
 * The padding is 12 to 1024 bytes and carries no length of its own. The
 * receiver finds the body through the declared length and treats everything
 * after it as padding, which is why that length is validated against the
 * buffer that arrived rather than trusted.
 */

import { equalBytes } from '../crypto/bytes.js'
import { igeDecrypt, igeEncrypt } from '../crypto/ige.js'
import type { MessageDirection } from '../crypto/kdf.js'
import { messagePadding } from '../crypto/random.js'
import type { AuthKey } from './auth-key.js'
import { MessageError } from './plaintext.js'

/** `auth_key_id` and `msg_key`. */
const OUTER_SIZE = 24
/** `salt`, `session_id`, `msg_id`, `seq_no`, `length`. */
const INNER_HEADER_SIZE = 32
/** AES-IGE operates on whole blocks. */
const BLOCK_SIZE = 16
/** Smallest padding the protocol allows. */
const MIN_PADDING = 12
/** Largest padding the protocol allows. */
const MAX_PADDING = 1024

/**
 * Largest encrypted message this codec will assemble.
 *
 * The transport bounds a frame; this bounds what a frame may claim to contain
 * once decrypted, so a body length is never trusted past the buffer that
 * carried it. Exported because the layer that builds a body has to refuse one
 * that could not be sealed, and a second copy of the bound would be a second
 * place for the two to disagree.
 */
export const MAX_BODY_SIZE = 16 * 1024 * 1024

/** What one encrypted message carries. */
export interface EncryptedMessage {
  /** The salt the sender used. */
  readonly salt: bigint
  /** The session the message belongs to. */
  readonly sessionId: bigint
  /** The sender's message identifier. */
  readonly msgId: bigint
  /** The sender's sequence number. */
  readonly seqNo: number
  /** The serialized TL body. */
  readonly body: Uint8Array
}

/** Everything needed to seal one message. */
export interface EncodeOptions extends EncryptedMessage {
  /** The key the message is sealed under. */
  readonly key: AuthKey
  /** Which end is sending, which selects the half of the key used. */
  readonly from: MessageDirection
  /** Padding for this message. Replaced only to make a test deterministic. */
  readonly padding?: (plaintextLength: number) => Uint8Array
}

/** Everything needed to open one message. */
export interface DecodeOptions {
  /** The key the message should be sealed under. */
  readonly key: AuthKey
  /** The bytes that arrived. */
  readonly bytes: Uint8Array
  /** Which end sent it, which selects the half of the key used. */
  readonly from: MessageDirection
  /**
   * The session the receiver believes is active.
   *
   * A message naming another session was not produced for this connection.
   * Omitted only where no session exists yet to compare against.
   */
  readonly sessionId?: bigint
}

/** Seal one message under an authorization key. */
export function encodeEncryptedMessage(options: EncodeOptions): Uint8Array {
  const { key, from, body } = options

  if (body.length > MAX_BODY_SIZE) {
    throw new MessageError(`message body of ${body.length} bytes is too large to send`)
  }

  const header = new Uint8Array(INNER_HEADER_SIZE)
  const view = new DataView(header.buffer)
  view.setBigInt64(0, options.salt, true)
  view.setBigInt64(8, options.sessionId, true)
  view.setBigInt64(16, options.msgId, true)
  view.setInt32(24, options.seqNo, true)
  view.setInt32(28, body.length, true)

  const pad = (options.padding ?? messagePadding)(INNER_HEADER_SIZE + body.length)
  const plaintext = new Uint8Array(INNER_HEADER_SIZE + body.length + pad.length)
  plaintext.set(header, 0)
  plaintext.set(body, INNER_HEADER_SIZE)
  plaintext.set(pad, INNER_HEADER_SIZE + body.length)

  // The padding is a seam, and a seam that can produce a message the protocol
  // forbids is one that produces a message the server drops without answering.
  // The bounds are the same ones the decoder enforces, checked here so a wrong
  // padding source fails where it is used rather than on a connection.
  if (plaintext.length % BLOCK_SIZE !== 0) {
    throw new MessageError('padding did not align the plaintext to a block boundary')
  }
  if (pad.length < MIN_PADDING || pad.length > MAX_PADDING) {
    throw new MessageError(`padding of ${pad.length} bytes is outside 12 to 1024`)
  }

  const msgKey = key.messageKey(plaintext, from)
  const aes = key.derive(msgKey, from)

  const out = new Uint8Array(OUTER_SIZE + plaintext.length)
  out.set(key.id, 0)
  out.set(msgKey, 8)
  out.set(igeEncrypt(plaintext, aes.key, aes.iv), OUTER_SIZE)

  return out
}

/**
 * Open one message, refusing anything that does not verify.
 *
 * Structure is checked before content and content before meaning, but nothing
 * short-circuits the integrity comparison: `msg_key` is recomputed over the
 * whole decrypted plaintext and compared in constant time before a single
 * field is read out of it.
 */
export function decodeEncryptedMessage(options: DecodeOptions): EncryptedMessage {
  const { key, bytes, from } = options

  if (bytes.length < OUTER_SIZE + INNER_HEADER_SIZE + MIN_PADDING) {
    throw new MessageError(`an encrypted message cannot be ${bytes.length} bytes`)
  }

  if (!equalBytes(bytes.subarray(0, 8), key.id)) {
    throw new MessageError('the message is sealed under a different authorization key')
  }

  // Nothing outside the ciphertext records its length, so the boundary is the
  // last whole block. Padded intermediate framing appends up to fifteen bytes
  // that belong to the envelope rather than the message, and dropping a partial
  // block is what recovers the message from underneath them.
  //
  // Whole blocks appended past the end are not dropped and do not need to be:
  // they are decrypted as part of the message, which changes the plaintext and
  // so changes the message key, and the comparison below refuses it.
  const available = bytes.length - OUTER_SIZE
  const encrypted = bytes.subarray(OUTER_SIZE, OUTER_SIZE + available - (available % BLOCK_SIZE))

  const msgKey = bytes.slice(8, OUTER_SIZE)
  const aes = key.derive(msgKey, from)
  const plaintext = igeDecrypt(encrypted, aes.key, aes.iv)

  // The integrity check. Everything below this line reads bytes that have been
  // proved to be the ones the holder of the key encrypted.
  if (!equalBytes(key.messageKey(plaintext, from), msgKey)) {
    throw new MessageError('the message failed its integrity check')
  }

  const view = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength)
  const length = view.getInt32(28, true)

  if (length < 0) {
    throw new MessageError(`negative message length ${length}`)
  }
  if (length % 4 !== 0) {
    throw new MessageError(`message length ${length} is not a multiple of 4`)
  }
  if (INNER_HEADER_SIZE + length > plaintext.length) {
    throw new MessageError(
      `message declares ${length} bytes of body, ${plaintext.length - INNER_HEADER_SIZE} arrived`,
    )
  }

  const padding = plaintext.length - INNER_HEADER_SIZE - length
  if (padding < MIN_PADDING || padding > MAX_PADDING) {
    throw new MessageError(`padding of ${padding} bytes is outside 12 to 1024`)
  }

  const sessionId = view.getBigInt64(8, true)
  if (options.sessionId !== undefined && sessionId !== options.sessionId) {
    throw new MessageError('the message belongs to another session')
  }

  // Client identifiers are even, server identifiers odd. The remainder is
  // normalised because an identifier past 2038 is carried as a negative long.
  const msgId = view.getBigInt64(16, true)
  const parity = ((msgId % 2n) + 2n) % 2n
  if (parity !== (from === 'client' ? 0n : 1n)) {
    throw new MessageError(`message identifier has the wrong parity for a ${from} message`)
  }

  return {
    salt: view.getBigInt64(0, true),
    sessionId,
    msgId,
    seqNo: view.getInt32(24, true),
    body: plaintext.slice(INNER_HEADER_SIZE, INNER_HEADER_SIZE + length),
  }
}
