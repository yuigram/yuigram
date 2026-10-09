// SPDX-License-Identifier: MPL-2.0

/**
 * The protocol's key schedules.
 *
 * Two derivations, both pure byte slicing over hashes, both easy to get subtly
 * wrong and impossible to debug from the server's response — a misplaced offset
 * produces a message the server discards without saying why.
 *
 * They are gathered here, away from the code that uses them, so each schedule
 * reads next to the specification it transcribes.
 */

import { ValidationError } from '@yuigram/core'
import { assertLength, concatBytes, xorBytes } from './bytes.js'
import { sha1, sha256 } from './hash.js'

/** Auth keys are 2048 bits. */
const AUTH_KEY_SIZE = 256
/** `new_nonce` is 256 bits. */
const NEW_NONCE_SIZE = 32
/** `server_nonce` is 128 bits. */
const SERVER_NONCE_SIZE = 16

/** An AES-IGE key and IV pair. */
export interface AesParameters {
  /** 32-byte AES-256 key. */
  readonly key: Uint8Array
  /** 32-byte IGE initialization vector. */
  readonly iv: Uint8Array
}

/**
 * The temporary key protecting the second half of the DH exchange.
 *
 * ```
 * key = SHA1(new_nonce ‖ server_nonce) ‖ SHA1(server_nonce ‖ new_nonce)[0..12]
 * iv  = SHA1(server_nonce ‖ new_nonce)[12..20] ‖ SHA1(new_nonce ‖ new_nonce)
 *       ‖ new_nonce[0..4]
 * ```
 *
 * Both come out at 32 bytes, which is what makes them usable as an AES-256 key
 * and an IGE IV without further adjustment.
 */
export function deriveHandshakeKeys(newNonce: Uint8Array, serverNonce: Uint8Array): AesParameters {
  assertLength(newNonce, NEW_NONCE_SIZE, 'new_nonce')
  assertLength(serverNonce, SERVER_NONCE_SIZE, 'server_nonce')

  const newServer = sha1(newNonce, serverNonce)
  const serverNew = sha1(serverNonce, newNonce)
  const newNew = sha1(newNonce, newNonce)

  return {
    key: concatBytes(newServer, serverNew.subarray(0, 12)),
    iv: concatBytes(serverNew.subarray(12, 20), newNew, newNonce.subarray(0, 4)),
  }
}

/** Which end of the connection produced the message being keyed. */
export type MessageDirection = 'client' | 'server'

/** The auth key offset each direction reads from. */
function offsetFor(direction: MessageDirection): number {
  return direction === 'client' ? 0 : 8
}

/**
 * The `msg_key` for a plaintext, MTProto 2.0.
 *
 * The middle 128 bits of a hash over a slice of the auth key and the whole
 * plaintext, which is what binds the key to both the session and the content.
 */
export function messageKey(
  authKey: Uint8Array,
  plaintext: Uint8Array,
  direction: MessageDirection,
): Uint8Array {
  assertLength(authKey, AUTH_KEY_SIZE, 'auth key')

  const x = offsetFor(direction)
  return sha256(authKey.subarray(88 + x, 120 + x), plaintext).subarray(8, 24)
}

/**
 * The AES key and IV for one message.
 *
 * ```
 * a   = SHA256(msg_key ‖ auth_key[x .. x+36])
 * b   = SHA256(auth_key[40+x .. 76+x] ‖ msg_key)
 * key = a[0..8] ‖ b[8..24] ‖ a[24..32]
 * iv  = b[0..8] ‖ a[8..24] ‖ b[24..32]
 * ```
 *
 * The interleaving is the specification's, not a simplification of it. Both
 * ends of a client-to-server message derive with `direction: 'client'`, so a
 * sender and a receiver arrive at the same pair.
 */
export function deriveMessageKeys(
  authKey: Uint8Array,
  msgKey: Uint8Array,
  direction: MessageDirection,
): AesParameters {
  assertLength(authKey, AUTH_KEY_SIZE, 'auth key')
  assertLength(msgKey, 16, 'msg_key')

  const x = offsetFor(direction)
  const a = sha256(msgKey, authKey.subarray(x, x + 36))
  const b = sha256(authKey.subarray(40 + x, 76 + x), msgKey)

  return {
    key: concatBytes(a.subarray(0, 8), b.subarray(8, 24), a.subarray(24, 32)),
    iv: concatBytes(b.subarray(0, 8), a.subarray(8, 24), b.subarray(24, 32)),
  }
}

/**
 * The `msg_key` for a plaintext, MTProto 1.0.
 *
 * The low 128 bits of a SHA-1 over the plaintext alone — the auth key is not
 * mixed in, and neither is the padding, which is appended after this is taken.
 *
 * The older schedule survives in exactly one place: the message that binds a
 * temporary authorization key to a permanent one, which the protocol specifies
 * in these terms and not in the current ones. It is not an alternative for
 * anything else, and nothing else should reach for it.
 */
export function messageKeyLegacy(plaintext: Uint8Array): Uint8Array {
  return sha1(plaintext).subarray(4, 20)
}

/**
 * The AES key and IV for one message, MTProto 1.0.
 *
 * ```
 * a   = SHA1(msg_key ‖ auth_key[x .. x+32])
 * b   = SHA1(auth_key[32+x .. 48+x] ‖ msg_key ‖ auth_key[48+x .. 64+x])
 * c   = SHA1(auth_key[64+x .. 96+x] ‖ msg_key)
 * d   = SHA1(msg_key ‖ auth_key[96+x .. 128+x])
 * key = a[0..8] ‖ b[8..20] ‖ c[4..16]
 * iv  = a[8..20] ‖ b[0..8] ‖ c[16..20] ‖ d[0..8]
 * ```
 *
 * Four hashes rather than two, and the slices interleave differently. Both are
 * the specification's; neither is a simplification of the other, and a schedule
 * that mixed them produces a message the far end discards without saying why.
 */
export function deriveMessageKeysLegacy(
  authKey: Uint8Array,
  msgKey: Uint8Array,
  direction: MessageDirection,
): AesParameters {
  assertLength(authKey, AUTH_KEY_SIZE, 'auth key')
  assertLength(msgKey, 16, 'msg_key')

  const x = offsetFor(direction)
  const a = sha1(msgKey, authKey.subarray(x, x + 32))
  const b = sha1(authKey.subarray(32 + x, 48 + x), msgKey, authKey.subarray(48 + x, 64 + x))
  const c = sha1(authKey.subarray(64 + x, 96 + x), msgKey)
  const d = sha1(msgKey, authKey.subarray(96 + x, 128 + x))

  return {
    key: concatBytes(a.subarray(0, 8), b.subarray(8, 20), c.subarray(4, 16)),
    iv: concatBytes(a.subarray(8, 20), b.subarray(0, 8), c.subarray(16, 20), d.subarray(0, 8)),
  }
}

/** The 64-bit identifier every encrypted message carries in the clear. */
export function authKeyId(authKey: Uint8Array): Uint8Array {
  assertLength(authKey, AUTH_KEY_SIZE, 'auth key')

  return sha1(authKey).subarray(12, 20)
}

/** The auxiliary hash the handshake's completion messages are built from. */
export function authKeyAuxHash(authKey: Uint8Array): Uint8Array {
  assertLength(authKey, AUTH_KEY_SIZE, 'auth key')

  return sha1(authKey).subarray(0, 8)
}

/**
 * `new_nonce_hash{n}`, the handshake's three completion acknowledgements.
 *
 * The variant distinguishes success from the two retry outcomes, so it is part
 * of the hashed input rather than a wrapper around it.
 */
export function newNonceHash(
  newNonce: Uint8Array,
  variant: 1 | 2 | 3,
  authKey: Uint8Array,
): Uint8Array {
  assertLength(newNonce, NEW_NONCE_SIZE, 'new_nonce')

  return sha1(newNonce, Uint8Array.of(variant), authKeyAuxHash(authKey)).subarray(4, 20)
}

/**
 * The first server salt, derived rather than sent.
 *
 * Both ends compute it from nonces they already hold, so the handshake ends
 * with a usable salt without another round trip.
 */
export function initialServerSalt(newNonce: Uint8Array, serverNonce: Uint8Array): Uint8Array {
  assertLength(newNonce, NEW_NONCE_SIZE, 'new_nonce')
  assertLength(serverNonce, SERVER_NONCE_SIZE, 'server_nonce')

  return xorBytes(newNonce.subarray(0, 8), serverNonce.subarray(0, 8))
}

/** Reject a variant outside the three the protocol defines. */
export function assertNonceVariant(variant: number): asserts variant is 1 | 2 | 3 {
  if (variant !== 1 && variant !== 2 && variant !== 3) {
    throw new ValidationError(`new_nonce_hash variant must be 1, 2 or 3, received ${variant}`)
  }
}
