/**
 * Server RSA keys, as the handshake selects them.
 *
 * A server offers the fingerprints of the keys it holds and the client picks
 * one it also holds. The fingerprint is not a hash of the key's encoded form as
 * a certificate library would produce it — it is a hash of the modulus and
 * exponent serialized as two TL byte strings, which is why it is computed here
 * rather than taken from the platform.
 *
 * No keys are compiled in. The set a client trusts is deployment configuration,
 * and a key list embedded in a protocol module is one that cannot be rotated
 * without a release.
 */

import { createHash } from 'node:crypto'
import { ValidationError } from '@yuigram/core'
import { bigIntToBytesBE } from '../crypto/bytes.js'
import type { RsaPublicKey } from '../crypto/rsa.js'

/** A key the client holds, addressable by the fingerprint a server offers. */
export interface ServerRsaKey extends RsaPublicKey {
  /** The 64-bit identifier the server names this key by. */
  readonly fingerprint: bigint
}

/**
 * The identifier a server uses to name a key.
 *
 * `SHA1(bytes(n) ‖ bytes(e))`, low 64 bits, read little-endian — where each
 * value is a TL byte string: a length prefix, the big-endian magnitude, and
 * padding to a four-byte boundary.
 */
export function rsaKeyFingerprint(key: RsaPublicKey): bigint {
  if (key.n <= 0n || key.e <= 0n) {
    throw new ValidationError('an rsa key needs a positive modulus and exponent')
  }

  const digest = createHash('sha1')
    .update(tlBytes(magnitude(key.n)))
    .update(tlBytes(magnitude(key.e)))
    .digest()

  return digest.readBigInt64LE(12)
}

/** Pair a key with its fingerprint so a handshake can match one by name. */
export function serverRsaKey(key: RsaPublicKey): ServerRsaKey {
  return { n: key.n, e: key.e, fingerprint: rsaKeyFingerprint(key) }
}

/**
 * Big-endian magnitude, with a leading zero where the high bit is set.
 *
 * The serialization is of a signed integer, so a value whose top bit is set
 * needs the extra byte or it would encode as negative.
 */
function magnitude(value: bigint): Uint8Array {
  const bytes = bigIntToBytesBE(value)
  if ((bytes[0] ?? 0) < 0x80) return bytes

  const padded = new Uint8Array(bytes.length + 1)
  padded.set(bytes, 1)
  return padded
}

/** A TL byte string: length prefix, payload, padding to a four-byte boundary. */
function tlBytes(value: Uint8Array): Uint8Array {
  const header = value.length <= 253 ? Uint8Array.of(value.length) : longHeader(value.length)
  const padding = (4 - ((header.length + value.length) % 4)) % 4

  const out = new Uint8Array(header.length + value.length + padding)
  out.set(header, 0)
  out.set(value, header.length)
  return out
}

function longHeader(length: number): Uint8Array {
  if (length > 0xff_ffff) {
    throw new ValidationError('an rsa key is too large to serialize as a TL byte string')
  }

  return Uint8Array.of(0xfe, length & 0xff, (length >>> 8) & 0xff, (length >>> 16) & 0xff)
}
