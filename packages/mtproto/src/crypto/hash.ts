/**
 * Hashes, from the platform.
 *
 * Thin wrappers rather than direct `createHash` calls at every site: the
 * protocol names these two constantly, and a named function keeps the call
 * sites readable against the specification they transcribe.
 */

import { createHash } from 'node:crypto'

/** SHA-1. Used by the handshake key schedule and the auth key identifiers. */
export function sha1(...parts: readonly Uint8Array[]): Uint8Array {
  const hash = createHash('sha1')
  for (const part of parts) hash.update(part)

  return new Uint8Array(hash.digest())
}

/** SHA-256. Used by the message key schedule, `rsa_pad` and SRP. */
export function sha256(...parts: readonly Uint8Array[]): Uint8Array {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part)

  return new Uint8Array(hash.digest())
}
