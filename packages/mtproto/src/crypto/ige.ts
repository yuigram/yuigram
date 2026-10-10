// SPDX-License-Identifier: MIT

/**
 * AES-256 in Infinite Garble Extension mode.
 *
 * IGE is the block mode MTProto encrypts with. The mode itself is in
 * `ige-mode.ts`, written once over an abstract block cipher, because chaining
 * is not a property of the runtime; which block cipher performs it is settled
 * by `crypto/backend.ts`.
 *
 * These two functions are the names the protocol code uses. They exist as a
 * seam rather than as call sites on the backend so that the handshake and the
 * message layer read against the specification they transcribe.
 */

import { backend } from './backend.js'

/** Encrypt with AES-256-IGE. */
export function igeEncrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  return backend.igeEncrypt(data, key, iv)
}

/** Decrypt with AES-256-IGE. */
export function igeDecrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  return backend.igeDecrypt(data, key, iv)
}
