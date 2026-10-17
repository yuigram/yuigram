// SPDX-License-Identifier: MIT

/**
 * The cryptography this runtime provides.
 *
 * `node:crypto` reaches a native implementation — AES with the processor's own
 * instructions, digests likewise — and is an order of magnitude faster than
 * anything JavaScript can do. Node, Bun and Deno all provide it, so this is the
 * backend almost every program gets.
 *
 * A browser and an edge worker do not. The package substitutes
 * `backend.browser.ts` for this module there, through the `browser` field in
 * `package.json`, which every bundler that targets a browser honours. The
 * substitution is a build-time decision rather than a runtime probe: a probe
 * would have to be asynchronous, would leave a `node:crypto` specifier in the
 * bundle for a bundler to fail on, and would put a branch on a path that runs
 * for every message.
 *
 * The two modules export the same binding with the same type, and
 * `crypto-backend.test.ts` runs the same cases against both.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2 as platformPbkdf2,
  randomBytes as platformRandom,
  timingSafeEqual,
} from 'node:crypto'
import { type CryptoBackend, type CtrCipher, checkByteCount, checkIge } from './backend-types.js'

/** AES block size, in bytes. */
const BLOCK = 16

/** IGE carries two chaining blocks, so the IV is twice a block. */
const IV_SIZE = 32

/**
 * A block cipher, made only once the inputs are known to be usable.
 *
 * Taken lazily rather than ready-made because building one is the first thing
 * that touches key material, and a malformed key has to be reported as such
 * rather than as whatever the platform says when it is handed sixteen bytes
 * where it wanted thirty-two.
 */
type BlockCipherFactory = () => (block: Uint8Array) => Uint8Array

/** The digest of the parts joined, without joining them. */
function digest(algorithm: string, parts: readonly Uint8Array[]): Uint8Array {
  const hash = createHash(algorithm)
  for (const part of parts) hash.update(part)

  return new Uint8Array(hash.digest())
}

/**
 * One ECB cipher for a whole IGE operation.
 *
 * IGE cannot be batched — each block's input depends on the previous block's
 * output — but the cipher object can be reused across the blocks, which is what
 * dominates the cost of the naive shape. Padding is off: `createCipheriv`
 * applies PKCS#7 by default, which would corrupt every operation here, and
 * corrupt it symmetrically so that a round trip would still pass.
 */
function ecbBlocks(key: Uint8Array, decrypting: boolean): (block: Uint8Array) => Uint8Array {
  const cipher = decrypting
    ? createDecipheriv('aes-256-ecb', key, null)
    : createCipheriv('aes-256-ecb', key, null)
  cipher.setAutoPadding(false)

  return (block) => new Uint8Array(cipher.update(block))
}

/** Counter mode, with the platform keeping the counter. */
class PlatformCtr implements CtrCipher {
  readonly #cipher: ReturnType<typeof createCipheriv>

  constructor(key: Uint8Array, counter: Uint8Array) {
    this.#cipher = createCipheriv('aes-256-ctr', key, counter)
  }

  process(data: Uint8Array): Uint8Array {
    return new Uint8Array(this.#cipher.update(data))
  }
}

/**
 * Infinite Garble Extension, over the block cipher above.
 *
 * The mode MTProto encrypts with, and it is in no standard library — not in
 * `node:crypto`, not in WebCrypto, and not in OpenSSL's public interface. So it
 * is built here, from its definition:
 *
 * ```
 * encrypt block i:  c[i] = E(m[i] XOR c[i-1]) XOR m[i-1]
 * decrypt block i:  m[i] = D(c[i] XOR m[i-1]) XOR c[i-1]
 *
 * c[-1] = iv[0..16]      m[-1] = iv[16..32]
 * ```
 *
 * The two directions read the same halves of the IV for the same roles, which
 * is what makes them inverses under one IV. Getting this wrong is the failure a
 * round-trip test cannot see: a mode that chains incorrectly in both directions
 * still decrypts what it encrypted, and agrees with nothing else in the world.
 *
 * The cipher is built only once the inputs are known to be usable, because
 * building one is the first thing that touches key material and a malformed key
 * has to be reported as such rather than as whatever the platform says when it
 * is handed sixteen bytes where it wanted thirty-two.
 */
/** XOR a block of `a` and `b` into a fresh block. */
function xorBlock(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOCK)
  for (let index = 0; index < BLOCK; index += 1) out[index] = (a[index] ?? 0) ^ (b[index] ?? 0)

  return out
}

/** Encrypt with AES-256-IGE, over the platform cipher. */
function igeEncryptOver(
  cipher: BlockCipherFactory,
  data: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  checkIge(key, iv, data)

  const encryptBlock = cipher()
  const out = new Uint8Array(data.length)
  let previousCipher = iv.subarray(0, BLOCK)
  let previousPlain = iv.subarray(BLOCK, IV_SIZE)

  for (let offset = 0; offset < data.length; offset += BLOCK) {
    const plain = data.subarray(offset, offset + BLOCK)
    const encrypted = xorBlock(encryptBlock(xorBlock(plain, previousCipher)), previousPlain)

    out.set(encrypted, offset)
    previousCipher = encrypted
    previousPlain = plain
  }

  return out
}

/** Decrypt with AES-256-IGE, over the platform cipher. */
function igeDecryptOver(
  cipher: BlockCipherFactory,
  data: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  checkIge(key, iv, data)

  const decryptBlock = cipher()
  const out = new Uint8Array(data.length)
  let previousCipher = iv.subarray(0, BLOCK)
  let previousPlain = iv.subarray(BLOCK, IV_SIZE)

  for (let offset = 0; offset < data.length; offset += BLOCK) {
    const encrypted = data.subarray(offset, offset + BLOCK)
    const plain = xorBlock(decryptBlock(xorBlock(encrypted, previousPlain)), previousCipher)

    out.set(plain, offset)
    previousCipher = encrypted
    previousPlain = plain
  }

  return out
}

/** The cryptography the protocol needs, from `node:crypto`. */
export const backend: CryptoBackend = {
  name: 'node:crypto',

  sha1: (...parts) => digest('sha1', parts),
  sha256: (...parts) => digest('sha256', parts),
  md5: (...parts) => digest('md5', parts),

  randomBytes: (length) => {
    checkByteCount(length)

    return new Uint8Array(platformRandom(length))
  },

  igeEncrypt: (data, key, iv) => igeEncryptOver(() => ecbBlocks(key, false), data, key, iv),
  igeDecrypt: (data, key, iv) => igeDecryptOver(() => ecbBlocks(key, true), data, key, iv),

  ctr: (key, counter) => new PlatformCtr(key, counter),

  constantTimeEqual: (a, b) => {
    // `timingSafeEqual` rejects a length mismatch rather than reporting one, so
    // the lengths are compared first — which leaks nothing an attacker who
    // chose the input does not already know.
    if (a.length !== b.length) return false
    if (a.length === 0) return true

    return timingSafeEqual(a, b)
  },

  pbkdf2: (password, salt, iterations, length) =>
    new Promise((resolve, reject) => {
      // The callback form deliberately: the synchronous one blocks the thread
      // that called it for the whole derivation, which on a server is every
      // request it was handling.
      platformPbkdf2(password, salt, iterations, length, 'sha512', (error, key) => {
        if (error) reject(error)
        else resolve(new Uint8Array(key))
      })
    }),
}

/** Exported for the shared cases to name the block size without a second constant. */
export { BLOCK as AES_BLOCK_SIZE }
