// SPDX-License-Identifier: MIT

/**
 * The server side of Telegram's RSA step.
 *
 * A real server holds the private half of the key whose fingerprint the client
 * matched, and undoes the padding to recover the client's inner data. The
 * client never performs either operation, so none of it belongs in the package
 * — it exists here so a handshake can be exercised against a peer that
 * genuinely decrypts what the client sent rather than one that trusts it.
 *
 * The modular exponentiation is the platform's, not the package's own
 * arithmetic, so a fault in that arithmetic cannot cancel out against itself.
 */

import type { KeyObject } from 'node:crypto'
import { constants, createHash, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { igeDecrypt } from '../../src/crypto/ige.js'

/** Bytes the padded payload occupies before it is reversed. */
const PADDED_SIZE = 192
/** Width of the RSA operation. */
const KEY_BYTES = 256
/** The legacy scheme fills one byte short of the modulus width. */
const LEGACY_SIZE = 255
/** Width of the SHA-1 the legacy scheme prefixes. */
const HASH_SIZE = 20

/**
 * A recovered payload, and what still has to be checked about it.
 *
 * The two schemes differ in where their integrity check lives. `rsa_pad` hashes
 * the whole padded block, so it verifies itself here. The legacy scheme hashes
 * only the payload, whose length is decided by the TL value inside it — a
 * length this module cannot know. That check therefore belongs to the caller
 * that decodes the value, and the hash is handed over for it to perform.
 */
export type RsaPlaintext =
  | { readonly scheme: 'rsa_pad'; readonly data: Uint8Array }
  | { readonly scheme: 'legacy'; readonly data: Uint8Array; readonly hash: Uint8Array }

/** A server key pair, with the public half in the form the client consumes. */
export interface ServerKey {
  /** Modulus. */
  readonly n: bigint
  /** Public exponent. */
  readonly e: bigint
  /** The fingerprint the client selects the key by. */
  readonly fingerprint: bigint
  /** Undo whichever padding the client used. */
  decrypt(cipher: Uint8Array): RsaPlaintext
}

/**
 * Generate a key pair for a test peer.
 *
 * Generated rather than committed: a private key checked into a repository is a
 * secret-scanning finding even when it protects nothing.
 */
export function createServerKey(): ServerKey {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = pair.publicKey.export({ format: 'jwk' })

  return fromKeyObject(
    pair.privateKey,
    base64UrlToBigInt(jwk.n ?? ''),
    base64UrlToBigInt(jwk.e ?? ''),
  )
}

function fromKeyObject(key: KeyObject, n: bigint, e: bigint): ServerKey {
  return {
    n,
    e,
    fingerprint: fingerprintOf(n, e),
    decrypt: (cipher) => unpad(rawDecrypt(key, cipher)),
  }
}

/**
 * The identifier a client uses to choose between the server's keys.
 *
 * The low 64 bits of the SHA-1 over the key serialized as two TL byte strings,
 * modulus first.
 */
function fingerprintOf(n: bigint, e: bigint): bigint {
  const digest = createHash('sha1')
    .update(tlBytes(toBytes(n)))
    .update(tlBytes(toBytes(e)))
    .digest()

  return digest.readBigInt64LE(12)
}

/** The platform's own private-key operation, with no padding of its own. */
function rawDecrypt(key: KeyObject, cipher: Uint8Array): Uint8Array {
  if (cipher.length !== KEY_BYTES) {
    throw new Error(`an RSA block must be ${KEY_BYTES} bytes, received ${cipher.length}`)
  }

  return new Uint8Array(
    privateDecrypt({ key, padding: constants.RSA_NO_PADDING }, Buffer.from(cipher)),
  )
}

/**
 * Strip whichever padding scheme produced the block.
 *
 * Which one a client used is decided by the key fingerprint it matched, and a
 * peer cannot tell from the ciphertext alone. `rsa_pad` carries an integrity
 * check over its whole block, so it is tried first and its failure is what
 * selects the legacy interpretation.
 */
function unpad(block: Uint8Array): RsaPlaintext {
  const padded = tryRsaPad(block)
  if (padded !== undefined) return { scheme: 'rsa_pad', data: padded }

  // The legacy block is one byte narrower than the modulus, so the leading byte
  // of the fixed-width result is padding introduced by the encoding.
  if (block[0] !== 0) {
    throw new Error('the RSA block matches neither padding scheme')
  }

  const body = block.subarray(KEY_BYTES - LEGACY_SIZE)
  return {
    scheme: 'legacy',
    hash: body.subarray(0, HASH_SIZE),
    data: body.subarray(HASH_SIZE),
  }
}

/**
 * Recover the payload from `rsa_pad`, or report that this is not one.
 *
 * The construction masks a temporary AES key with a hash of the ciphertext it
 * produced, so the steps have to be undone in the order opposite to the one the
 * client applied them in. The trailing hash is what says the result is real.
 */
function tryRsaPad(block: Uint8Array): Uint8Array | undefined {
  const maskedKey = block.subarray(0, 32)
  const encrypted = block.subarray(32)

  const mask = sha256(encrypted)
  const tempKey = Uint8Array.from(maskedKey, (byte, index) => byte ^ (mask[index] ?? 0))

  const withHash = igeDecrypt(encrypted, tempKey, new Uint8Array(32))
  const padded = Uint8Array.from(withHash.subarray(0, PADDED_SIZE)).reverse()

  const expected = withHash.subarray(PADDED_SIZE)
  const actual = sha256(tempKey, padded)

  return Buffer.compare(Buffer.from(expected), Buffer.from(actual)) === 0 ? padded : undefined
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

function base64UrlToBigInt(value: string): bigint {
  return BigInt(`0x${Buffer.from(value, 'base64url').toString('hex')}`)
}

/** Big-endian bytes of the number itself, with no sign byte in front. */
function toBytes(value: bigint): Uint8Array {
  let hex = value.toString(16)
  if (hex.length % 2 === 1) hex = `0${hex}`

  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

/** A TL byte string: length prefix, payload, padding to a four-byte boundary. */
function tlBytes(value: Uint8Array): Uint8Array {
  if (value.length <= 253) {
    const padding = (4 - ((1 + value.length) % 4)) % 4
    return concat(Uint8Array.of(value.length), value, new Uint8Array(padding))
  }

  const padding = (4 - ((4 + value.length) % 4)) % 4
  const header = Uint8Array.of(
    0xfe,
    value.length & 0xff,
    (value.length >>> 8) & 0xff,
    (value.length >>> 16) & 0xff,
  )
  return concat(header, value, new Uint8Array(padding))
}
