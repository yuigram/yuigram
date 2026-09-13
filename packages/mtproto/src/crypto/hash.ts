/**
 * Hashes, from whichever backend this runtime resolved to.
 *
 * Thin wrappers rather than backend calls at every site: the protocol names
 * these constantly, and a named function keeps the call sites readable against
 * the specification they transcribe. Which implementation answers is settled in
 * `crypto/backend.ts` and is not a question any caller asks.
 */

import { backend } from './backend.js'

/** SHA-1. Used by the handshake key schedule and the auth key identifiers. */

export function sha1(...parts: readonly Uint8Array[]): Uint8Array {
  return backend.sha1(...parts)
}

/** SHA-256. Used by the message key schedule, `rsa_pad` and SRP. */

export function sha256(...parts: readonly Uint8Array[]): Uint8Array {
  return backend.sha256(...parts)
}

/**
 * MD5, as an upload checksum.
 *
 * Not a security primitive and never used as one. The protocol defines a field
 * on a small-file upload carrying this over the file's contents, and the server
 * checks what it was sent against what arrived — so it is an integrity check on
 * a transfer, in the one place the protocol asks for it.
 */

export function md5(...parts: readonly Uint8Array[]): Uint8Array {
  return backend.md5(...parts)
}
