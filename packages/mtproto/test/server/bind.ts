/**
 * Checking a binding the way the far end checks it.
 *
 * Written against the specification rather than against the client's builder,
 * because a peer that verified a binding by reproducing how it was made would
 * accept any binding that module produced — including a wrong one. The slicing
 * below is transcribed from the protocol's own statement of the older key
 * schedule, and the layout is read forward out of the decrypted bytes rather
 * than assumed.
 */

import { createHash } from 'node:crypto'
import { igeDecrypt } from '../../src/crypto/ige.js'

/** What a binding claims. */
export interface Binding {
  readonly nonce: bigint
  readonly tempAuthKeyId: bigint
  readonly permAuthKeyId: bigint
  readonly tempSessionId: bigint
  readonly expiresAt: number
  /** The identifier the binding names, which must be the request's own. */
  readonly msgId: bigint
  /** The sequence number it carries, which the protocol fixes at zero. */
  readonly seqNo: number
}

/** `bind_auth_key_inner#75a3f765` */
const BIND_INNER_ID = 0x75a3_f765

export class BindingRejected extends Error {
  override readonly name = 'BindingRejected'
}

function sha1(...parts: readonly Uint8Array[]): Uint8Array {
  const hash = createHash('sha1')
  for (const part of parts) hash.update(part)

  return new Uint8Array(hash.digest())
}

function join(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  return out
}

/**
 * The MTProto 1.0 schedule, for a message the client sent.
 *
 * ```
 * sha1_a  = SHA1(msg_key + substr(auth_key, x, 32))
 * sha1_b  = SHA1(substr(auth_key, 32+x, 16) + msg_key + substr(auth_key, 48+x, 16))
 * sha1_c  = SHA1(substr(auth_key, 64+x, 32) + msg_key)
 * sha1_d  = SHA1(msg_key + substr(auth_key, 96+x, 32))
 * aes_key = substr(sha1_a, 0, 8) + substr(sha1_b, 8, 12) + substr(sha1_c, 4, 12)
 * aes_iv  = substr(sha1_a, 8, 12) + substr(sha1_b, 0, 8) + substr(sha1_c, 16, 4)
 *           + substr(sha1_d, 0, 8)
 * ```
 */
function schedule(authKey: Uint8Array, msgKey: Uint8Array): { key: Uint8Array; iv: Uint8Array } {
  const x = 0
  const a = sha1(msgKey, authKey.subarray(x, x + 32))
  const b = sha1(authKey.subarray(32 + x, 48 + x), msgKey, authKey.subarray(48 + x, 64 + x))
  const c = sha1(authKey.subarray(64 + x, 96 + x), msgKey)
  const d = sha1(msgKey, authKey.subarray(96 + x, 128 + x))

  return {
    key: join(a.subarray(0, 8), b.subarray(8, 20), c.subarray(4, 16)),
    iv: join(a.subarray(8, 20), b.subarray(0, 8), c.subarray(16, 20), d.subarray(0, 8)),
  }
}

/**
 * Open a binding message and read what it claims.
 *
 * Every check a server would make, in the order a server can make them: the key
 * it names, the integrity of what it carries, the shape of the envelope, then
 * the contents.
 */
export function openBinding(encrypted: Uint8Array, permanentKey: Uint8Array): Binding {
  if (encrypted.length < 24 || (encrypted.length - 24) % 16 !== 0) {
    throw new BindingRejected(`a binding of ${encrypted.length} bytes is not a whole message`)
  }

  const expectedId = sha1(permanentKey).subarray(12, 20)
  const namedId = encrypted.subarray(0, 8)
  if (!namedId.every((byte, index) => byte === expectedId[index])) {
    throw new BindingRejected('the binding names a different permanent key')
  }

  const msgKey = encrypted.subarray(8, 24)
  const aes = schedule(permanentKey, msgKey)
  const plaintext = igeDecrypt(encrypted.subarray(24), aes.key, aes.iv)

  const view = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength)

  // Sixteen bytes of filler stand where a salt and a session identifier would
  // be, then the ordinary header. Read forward rather than assumed, so a
  // message laid out differently is rejected instead of misread.
  const msgId = view.getBigInt64(16, true)
  const seqNo = view.getInt32(24, true)
  const length = view.getInt32(28, true)

  if (length < 0 || 32 + length > plaintext.length) {
    throw new BindingRejected(`the binding declares a body of ${length} bytes`)
  }

  // The integrity check is over the header and body only. Padding is appended
  // after the key is taken and is not covered by it.
  const covered = plaintext.subarray(0, 32 + length)
  const recomputed = sha1(covered).subarray(4, 20)
  if (!recomputed.every((byte, index) => byte === msgKey[index])) {
    throw new BindingRejected('the binding does not match its message key')
  }

  const body = plaintext.subarray(32, 32 + length)
  const bodyView = new DataView(body.buffer, body.byteOffset, body.byteLength)
  if (body.length !== 40) {
    throw new BindingRejected(`a binding body must be 40 bytes, received ${body.length}`)
  }
  if (bodyView.getUint32(0, true) !== BIND_INNER_ID) {
    throw new BindingRejected('the binding does not carry a binding message')
  }

  return {
    nonce: bodyView.getBigInt64(4, true),
    tempAuthKeyId: bodyView.getBigInt64(12, true),
    permAuthKeyId: bodyView.getBigInt64(20, true),
    tempSessionId: bodyView.getBigInt64(28, true),
    expiresAt: bodyView.getInt32(36, true),
    msgId,
    seqNo,
  }
}
