/**
 * Infinite Garble Extension, over whatever performs the block cipher.
 *
 * IGE is the block mode MTProto encrypts with, and it is in no standard
 * library — not in `node:crypto`, not in WebCrypto, and not in OpenSSL's public
 * interface. So it is built here, from its definition:
 *
 * ```
 * encrypt block i:  c[i] = E(m[i] XOR c[i-1]) XOR m[i-1]
 * decrypt block i:  m[i] = D(c[i] XOR m[i-1]) XOR c[i-1]
 *
 * c[-1] = iv[0..16]      m[-1] = iv[16..32]
 * ```
 *
 * The two directions read the same halves of the IV for the same roles, which
 * is what makes them inverses under one IV.
 *
 * The mode is not a property of the runtime — only the block cipher underneath
 * it is — so it lives here once and both backends pass their own block function
 * in. Getting this wrong is the failure a round-trip test cannot see: a mode
 * that chains incorrectly in both directions still decrypts what it encrypted,
 * and agrees with nothing else in the world.
 */

import { ValidationError } from '@yuigram/core'

/** AES block size, in bytes. */
const BLOCK = 16

/** AES-256 key size, in bytes. */
const KEY_SIZE = 32

/** IGE carries two chaining blocks, so the IV is twice a block. */
const IV_SIZE = 32

/** One block in, one block out. Whether it encrypts or decrypts is the caller's business. */
export type BlockCipher = (block: Uint8Array) => Uint8Array

/**
 * A block cipher, made only once the inputs are known to be usable.
 *
 * Taken lazily rather than ready-made because building one is the first thing
 * that touches key material, and a malformed key has to be reported as such
 * rather than as whatever the platform says when it is handed sixteen bytes
 * where it wanted thirty-two.
 */
export type BlockCipherFactory = () => BlockCipher

/** Reject inputs the mode cannot express before touching any key material. */
export function checkIge(key: Uint8Array, iv: Uint8Array, data: Uint8Array): void {
  if (key.length !== KEY_SIZE) {
    throw new ValidationError(`an AES-IGE key must be ${KEY_SIZE} bytes, received ${key.length}`)
  }
  if (iv.length !== IV_SIZE) {
    throw new ValidationError(`an AES-IGE iv must be ${IV_SIZE} bytes, received ${iv.length}`)
  }
  if (data.length === 0) throw new ValidationError('AES-IGE data must not be empty')
  if (data.length % BLOCK !== 0) {
    throw new ValidationError(
      `AES-IGE data must be a multiple of ${BLOCK} bytes, received ${data.length}`,
    )
  }
}

/** XOR a block of `a` and `b` into a fresh block. */
function xorBlock(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOCK)
  for (let index = 0; index < BLOCK; index += 1) out[index] = (a[index] ?? 0) ^ (b[index] ?? 0)

  return out
}

/** Encrypt with AES-256-IGE, using the block cipher given. */
export function igeEncryptOver(
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

/** Decrypt with AES-256-IGE, using the block cipher given. */
export function igeDecryptOver(
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
