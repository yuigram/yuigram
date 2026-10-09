// SPDX-License-Identifier: MIT

/**
 * Reading Telegram's published server keys.
 *
 * Telegram publishes the RSA keys its datacenters hold as PEM text. No keys are
 * compiled into this library — the set a client trusts is deployment
 * configuration — so an application reads them from wherever it keeps them:
 *
 * ```ts
 * const keys = serverKeysFromPem(await readFile('./telegram-keys.pem', 'utf8'))
 * for (const key of keys) console.log(key.fingerprint.toString(16))
 * const me = new Account({ apiId, apiHash, keys, bootstrap, storage })
 * ```
 *
 * Both PEM forms an RSA public key comes in are read: `RSA PUBLIC KEY`, the
 * bare modulus and exponent, and `PUBLIC KEY`, the same wrapped with the
 * algorithm it is for. Several keys may be in one text. Each comes back with
 * the fingerprint a datacenter will name it by, for comparing against the
 * fingerprints Telegram publishes beside them.
 */

import { ValidationError } from '../core.js'
import { fromBase64 } from '../crypto/encoding.js'
import { type ServerRsaKey, serverRsaKey } from './keys.js'

/** The object identifier of RSA encryption, as DER encodes it. */
const RSA_ENCRYPTION = '2a864886f70d010101'

/** A DER value: its tag and the bytes it holds. */
interface Der {
  readonly tag: number
  readonly content: Uint8Array
  readonly next: number
}

function readDer(bytes: Uint8Array, at: number): Der {
  const tag = bytes[at]
  const first = bytes[at + 1]
  if (tag === undefined || first === undefined) throw new ValidationError('the key ends early')

  let length = first
  let offset = at + 2
  if (first & 0x80) {
    const count = first & 0x7f
    if (count === 0 || count > 4) throw new ValidationError('the key has a length it cannot have')
    length = 0
    for (let index = 0; index < count; index += 1) {
      const byte = bytes[offset + index]
      if (byte === undefined) throw new ValidationError('the key ends early')
      length = length * 256 + byte
    }
    offset += count
  }
  if (offset + length > bytes.length) throw new ValidationError('the key ends early')

  return { tag, content: bytes.subarray(offset, offset + length), next: offset + length }
}

function integer(value: Der): bigint {
  if (value.tag !== 0x02)
    throw new ValidationError('the key has something other than a number where one belongs')
  let result = 0n
  for (const byte of value.content) result = (result << 8n) | BigInt(byte)
  return result
}

const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/** The modulus and exponent of a bare `RSAPublicKey` sequence. */
function rsaPublicKey(der: Uint8Array): { n: bigint; e: bigint } {
  const sequence = readDer(der, 0)
  if (sequence.tag !== 0x30) throw new ValidationError('the key is not an RSA public key')
  const modulus = readDer(sequence.content, 0)
  const exponent = readDer(sequence.content, modulus.next)
  return { n: integer(modulus), e: integer(exponent) }
}

/** The RSA key inside a `SubjectPublicKeyInfo`, refusing any other algorithm. */
function subjectPublicKey(der: Uint8Array): { n: bigint; e: bigint } {
  const info = readDer(der, 0)
  if (info.tag !== 0x30) throw new ValidationError('the key is not a public key')
  const algorithm = readDer(info.content, 0)
  const identifier = readDer(algorithm.content, 0)
  if (identifier.tag !== 0x06 || hex(identifier.content) !== RSA_ENCRYPTION) {
    throw new ValidationError('the key is not an RSA key')
  }
  const bits = readDer(info.content, algorithm.next)
  if (bits.tag !== 0x03 || bits.content[0] !== 0) {
    throw new ValidationError('the key is not an RSA public key')
  }
  return rsaPublicKey(bits.content.subarray(1))
}

/**
 * Every RSA public key in a PEM text, each with the fingerprint a datacenter
 * names it by.
 *
 * Text outside the `BEGIN`/`END` lines is ignored, so a file with comments
 * beside its keys reads as it is. A text with no key in it is an error rather
 * than an empty list: an account given no keys cannot reach a datacenter it
 * has no authorization for, and would say so much later.
 */
export function serverKeysFromPem(text: string): ServerRsaKey[] {
  const blocks = [
    ...text.matchAll(/-----BEGIN (RSA PUBLIC KEY|PUBLIC KEY)-----([\s\S]*?)-----END \1-----/g),
  ]
  if (blocks.length === 0) throw new ValidationError('the text holds no RSA public key in PEM form')

  return blocks.map(([, kind, body]) => {
    const der = fromBase64((body ?? '').replace(/\s+/g, ''))
    const key = kind === 'RSA PUBLIC KEY' ? rsaPublicKey(der) : subjectPublicKey(der)
    if (key.n.toString(2).length < 1024) {
      throw new ValidationError('the key is shorter than any key a datacenter holds')
    }
    return serverRsaKey(key)
  })
}
