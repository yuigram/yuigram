/**
 * AES-256 in Infinite Garble Extension mode.
 *
 * IGE is the block mode MTProto encrypts with, and it is in no standard
 * library — not in `node:crypto`, and not in OpenSSL's public interface. It is
 * built here over raw ECB:
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
 * Two properties of this file are load-bearing and are asserted by test rather
 * than left to review:
 *
 * - **Padding is off.** `createCipheriv` applies PKCS#7 by default, which would
 *   corrupt every operation here — and corrupt it symmetrically, so a
 *   round-trip test would still pass.
 * - **One cipher per call, not per block.** IGE cannot be batched, because each
 *   block's cipher input depends on the previous block's output. What can be
 *   avoided is constructing a cipher object per block, which is what dominates
 *   the cost of the naive shape.
 */

import { createCipheriv, createDecipheriv, type Decipheriv } from 'node:crypto'
import { ValidationError } from '@yuigram/core'
import { assertLength } from './bytes.js'

/** AES block size, in bytes. */
const BLOCK = 16
/** AES-256 key size, in bytes. */
const KEY_SIZE = 32
/** IGE carries two chaining blocks, so the IV is twice a block. */
const IV_SIZE = 32

/** Reject inputs the mode cannot express before touching any key material. */
function check(key: Uint8Array, iv: Uint8Array, data: Uint8Array): void {
  assertLength(key, KEY_SIZE, 'AES-IGE key')
  assertLength(iv, IV_SIZE, 'AES-IGE iv')

  if (data.length === 0) throw new ValidationError('AES-IGE data must not be empty')
  if (data.length % BLOCK !== 0) {
    throw new ValidationError(
      `AES-IGE data must be a multiple of ${BLOCK} bytes, received ${data.length}`,
    )
  }
}

/** XOR `length` bytes of `a` and `b` into a fresh block. */
function xorBlock(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOCK)
  for (let index = 0; index < BLOCK; index += 1) out[index] = (a[index] ?? 0) ^ (b[index] ?? 0)

  return out
}

/** Encrypt with AES-256-IGE. */
export function igeEncrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  check(key, iv, data)

  const cipher = createCipheriv('aes-256-ecb', key, null)
  cipher.setAutoPadding(false)

  const out = new Uint8Array(data.length)
  let previousCipher = iv.subarray(0, BLOCK)
  let previousPlain = iv.subarray(BLOCK, IV_SIZE)

  for (let offset = 0; offset < data.length; offset += BLOCK) {
    const plain = data.subarray(offset, offset + BLOCK)
    const block = new Uint8Array(cipher.update(xorBlock(plain, previousCipher)))
    const encrypted = xorBlock(block, previousPlain)

    out.set(encrypted, offset)
    previousCipher = encrypted
    previousPlain = plain
  }

  cipher.final()
  return out
}

/** Decrypt with AES-256-IGE. */
export function igeDecrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  check(key, iv, data)

  const decipher = createDecipheriv('aes-256-ecb', key, null)
  decipher.setAutoPadding(false)

  const out = new Uint8Array(data.length)
  let previousCipher = iv.subarray(0, BLOCK)
  let previousPlain = iv.subarray(BLOCK, IV_SIZE)

  for (let offset = 0; offset < data.length; offset += BLOCK) {
    const encrypted = data.subarray(offset, offset + BLOCK)
    const block = decipherBlock(decipher, xorBlock(encrypted, previousPlain))
    const plain = xorBlock(block, previousCipher)

    out.set(plain, offset)
    previousCipher = encrypted
    previousPlain = plain
  }

  decipher.final()
  return out
}

/**
 * One ECB block through a decipher.
 *
 * With padding disabled the platform returns each block as it is fed, holding
 * nothing back. A short return would shift every subsequent block instead of
 * failing, so it is checked rather than assumed.
 */
function decipherBlock(decipher: Decipheriv, input: Uint8Array): Uint8Array {
  const produced = new Uint8Array(decipher.update(input))
  if (produced.length === BLOCK) return produced

  throw new ValidationError('AES-ECB produced an unexpected block size')
}
