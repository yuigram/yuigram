// SPDX-License-Identifier: MPL-2.0

/**
 * The peer's own encrypted message layer.
 *
 * The key schedule is written out again from the specification rather than
 * imported. It is the derivation the entire authenticated layer rests on, and
 * it has no visible failure mode: a misplaced offset produces a key that is
 * simply wrong, and if both ends derived it the same wrong way every message
 * would round-trip perfectly while nothing interoperated with Telegram.
 *
 * ```
 * msg_key  = SHA256(auth_key[88+x .. 120+x] ‖ plaintext)[8..24]
 * sha256_a = SHA256(msg_key ‖ auth_key[x .. x+36])
 * sha256_b = SHA256(auth_key[40+x .. 76+x] ‖ msg_key)
 * aes_key  = a[0..8] ‖ b[8..24] ‖ a[24..32]
 * aes_iv   = b[0..8] ‖ a[8..24] ‖ b[24..32]
 *            x = 0 for a client message, x = 8 for a server message
 * ```
 *
 * AES-IGE and SHA-256 are taken from the package and the platform, because both
 * are already checked against independent implementations and a second copy of
 * either would only be a second thing to maintain.
 */

import { createHash } from 'node:crypto'
import { igeDecrypt, igeEncrypt } from '../../src/crypto/ige.js'

/** `auth_key_id` and `msg_key`. */
const OUTER_SIZE = 24
/** `salt`, `session_id`, `msg_id`, `seq_no`, `length`. */
const INNER_HEADER_SIZE = 32

/** What one encrypted message carries. */
export interface PeerMessage {
  readonly salt: bigint
  readonly sessionId: bigint
  readonly msgId: bigint
  readonly seqNo: number
  readonly body: Uint8Array
}

/** A message the peer could not open. */
export class PeerMessageError extends Error {
  override readonly name = 'PeerMessageError'
}

/** Which end produced the message, which selects the half of the key used. */
export type Origin = 'client' | 'server'

/** Seal a message the way the far end will expect to open it. */
export function seal(
  authKey: Uint8Array,
  message: PeerMessage,
  origin: Origin,
  padding: Uint8Array,
): Uint8Array {
  const plaintext = new Uint8Array(INNER_HEADER_SIZE + message.body.length + padding.length)
  const view = new DataView(plaintext.buffer)

  view.setBigInt64(0, message.salt, true)
  view.setBigInt64(8, message.sessionId, true)
  view.setBigInt64(16, message.msgId, true)
  view.setInt32(24, message.seqNo, true)
  view.setInt32(28, message.body.length, true)
  plaintext.set(message.body, INNER_HEADER_SIZE)
  plaintext.set(padding, INNER_HEADER_SIZE + message.body.length)

  const msgKey = messageKeyOf(authKey, plaintext, origin)
  const { key, iv } = derive(authKey, msgKey, origin)

  const out = new Uint8Array(OUTER_SIZE + plaintext.length)
  out.set(keyId(authKey), 0)
  out.set(msgKey, 8)
  out.set(igeEncrypt(plaintext, key, iv), OUTER_SIZE)

  return out
}

/** Open a message, refusing one whose integrity does not hold. */
export function open(authKey: Uint8Array, bytes: Uint8Array, origin: Origin): PeerMessage {
  if (bytes.length < OUTER_SIZE + INNER_HEADER_SIZE) {
    throw new PeerMessageError(`an encrypted message cannot be ${bytes.length} bytes`)
  }
  if (Buffer.compare(Buffer.from(bytes.subarray(0, 8)), Buffer.from(keyId(authKey))) !== 0) {
    throw new PeerMessageError('the message names a different authorization key')
  }

  // The ciphertext ends at the last whole block: framing padding may follow it
  // and nothing outside the message records where it stops.
  const available = bytes.length - OUTER_SIZE
  const size = available - (available % 16)

  const msgKey = bytes.subarray(8, OUTER_SIZE)
  const { key, iv } = derive(authKey, msgKey, origin)
  const plaintext = igeDecrypt(bytes.subarray(OUTER_SIZE, OUTER_SIZE + size), key, iv)

  const actual = messageKeyOf(authKey, plaintext, origin)
  if (Buffer.compare(Buffer.from(actual), Buffer.from(msgKey)) !== 0) {
    throw new PeerMessageError('the message failed its integrity check')
  }

  const view = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength)
  const length = view.getInt32(28, true)
  if (length < 0 || INNER_HEADER_SIZE + length > plaintext.length) {
    throw new PeerMessageError(`the message declares ${length} bytes of body`)
  }

  return {
    salt: view.getBigInt64(0, true),
    sessionId: view.getBigInt64(8, true),
    msgId: view.getBigInt64(16, true),
    seqNo: view.getInt32(24, true),
    body: plaintext.slice(INNER_HEADER_SIZE, INNER_HEADER_SIZE + length),
  }
}

/** The 64-bit identifier every encrypted message carries in the clear. */
export function keyId(authKey: Uint8Array): Uint8Array {
  return sha1(authKey).subarray(12, 20)
}

/** The offset into the auth key that each direction reads from. */
function offsetOf(origin: Origin): number {
  return origin === 'client' ? 0 : 8
}

function messageKeyOf(authKey: Uint8Array, plaintext: Uint8Array, origin: Origin): Uint8Array {
  const x = offsetOf(origin)
  return sha256(authKey.subarray(88 + x, 120 + x), plaintext).subarray(8, 24)
}

function derive(
  authKey: Uint8Array,
  msgKey: Uint8Array,
  origin: Origin,
): { key: Uint8Array; iv: Uint8Array } {
  const x = offsetOf(origin)
  const a = sha256(msgKey, authKey.subarray(x, x + 36))
  const b = sha256(authKey.subarray(40 + x, 76 + x), msgKey)

  return {
    key: concat(a.subarray(0, 8), b.subarray(8, 24), a.subarray(24, 32)),
    iv: concat(b.subarray(0, 8), a.subarray(8, 24), b.subarray(24, 32)),
  }
}

function sha1(...parts: Uint8Array[]): Uint8Array {
  const hash = createHash('sha1')
  for (const part of parts) hash.update(part)
  return new Uint8Array(hash.digest())
}

function sha256(...parts: Uint8Array[]): Uint8Array {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part)
  return new Uint8Array(hash.digest())
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
