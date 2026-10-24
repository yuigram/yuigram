// SPDX-License-Identifier: MIT

/**
 * AES-256-IGE.
 *
 * A round-trip test proves the two directions agree with each other, which a
 * consistently wrong implementation also does. So the expected ciphertext here
 * is built independently: the IGE recurrence is driven directly by the
 * platform's raw AES-ECB, and the implementation is checked against that.
 *
 * The IV halves are checked separately, because swapping them is invisible to a
 * round trip and fatal on the wire.
 */

import { createCipheriv, createDecipheriv } from 'node:crypto'
import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { igeDecrypt, igeEncrypt } from '../src/crypto/ige.js'

const BLOCK = 16

const key: Uint8Array = Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1)
const iv: Uint8Array = Uint8Array.from({ length: 32 }, (_, index) => 255 - index * 3)

/** One raw ECB block, straight from the platform. */
function ecb(block: Uint8Array, direction: 'encrypt' | 'decrypt'): Uint8Array {
  const cipher =
    direction === 'encrypt'
      ? createCipheriv('aes-256-ecb', key, null)
      : createDecipheriv('aes-256-ecb', key, null)
  cipher.setAutoPadding(false)

  return new Uint8Array(Buffer.concat([cipher.update(block), cipher.final()]))
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  return Uint8Array.from(a, (value, index) => value ^ (b[index] ?? 0))
}

/**
 * The IGE recurrence, spelled out over raw ECB.
 *
 * This is the oracle. It follows the published definition rather than the
 * implementation's structure, so agreement between the two is evidence about
 * the definition and not only about internal consistency.
 */
function igeReference(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length)
  let previousCipher = iv.subarray(0, BLOCK)
  let previousPlain = iv.subarray(BLOCK, 32)

  for (let offset = 0; offset < data.length; offset += BLOCK) {
    const plain = data.subarray(offset, offset + BLOCK)
    const encrypted = xor(ecb(xor(plain, previousCipher), 'encrypt'), previousPlain)

    out.set(encrypted, offset)
    previousCipher = encrypted
    previousPlain = plain
  }

  return out
}

function pattern(blocks: number): Uint8Array {
  return Uint8Array.from({ length: blocks * BLOCK }, (_, index) => (index * 31 + 17) & 0xff)
}

describe('the ECB primitive underneath', () => {
  it('is used with padding disabled', () => {
    // The default applies PKCS#7, which turns 16 bytes into 32 and corrupts
    // every IGE operation built on it — symmetrically, so a round-trip test
    // would still pass. This is the assertion that catches it.
    const withPadding = createCipheriv('aes-256-ecb', key, null)
    const padded = Buffer.concat([withPadding.update(Buffer.alloc(BLOCK)), withPadding.final()])
    expect(padded.length).toBe(32)

    expect(ecb(new Uint8Array(BLOCK), 'encrypt').length).toBe(BLOCK)
  })
})

describe('igeEncrypt against an independent oracle', () => {
  for (const blocks of [1, 2, 4, 16]) {
    it(`matches the recurrence over ${blocks} block(s)`, () => {
      const data = pattern(blocks)

      expect([...igeEncrypt(data, key, iv)]).toEqual([...igeReference(data)])
    })
  }

  it('produces a different result when the IV halves are swapped', () => {
    // The halves carry distinct roles. Swapping them is invisible to a round
    // trip and rejected by every server, so it is pinned here.
    const swapped = new Uint8Array(32)
    swapped.set(iv.subarray(BLOCK, 32), 0)
    swapped.set(iv.subarray(0, BLOCK), BLOCK)

    const data = pattern(2)
    expect([...igeEncrypt(data, key, swapped)]).not.toEqual([...igeEncrypt(data, key, iv)])
  })

  it('propagates a change in one block to every later block', () => {
    const original = pattern(4)
    const altered = Uint8Array.from(original)
    altered[0] = (altered[0] ?? 0) ^ 0x01

    const a = igeEncrypt(original, key, iv)
    const b = igeEncrypt(altered, key, iv)

    for (let offset = 0; offset < a.length; offset += BLOCK) {
      expect([...a.subarray(offset, offset + BLOCK)]).not.toEqual([
        ...b.subarray(offset, offset + BLOCK),
      ])
    }
  })
})

describe('igeDecrypt', () => {
  it('inverts encryption under the same key and IV', () => {
    for (const blocks of [1, 2, 4, 16]) {
      const data = pattern(blocks)
      expect([...igeDecrypt(igeEncrypt(data, key, iv), key, iv)]).toEqual([...data])
    }
  })

  it('recovers a plaintext the oracle produced', () => {
    const data = pattern(3)
    expect([...igeDecrypt(igeReference(data), key, iv)]).toEqual([...data])
  })

  it('yields the wrong plaintext under a different IV, rather than throwing', () => {
    const data = pattern(2)
    const other = Uint8Array.from(iv, (value) => value ^ 0xff)

    expect([...igeDecrypt(igeEncrypt(data, key, iv), key, other)]).not.toEqual([...data])
  })
})

describe('malformed input', () => {
  const data = pattern(1)

  it('rejects a key that is not 32 bytes', () => {
    expect(() => igeEncrypt(data, new Uint8Array(16), iv)).toThrow(/key must be 32 bytes/)
    expect(() => igeDecrypt(data, new Uint8Array(33), iv)).toThrow(ValidationError)
  })

  it('rejects an IV that is not 32 bytes', () => {
    expect(() => igeEncrypt(data, key, new Uint8Array(16))).toThrow(/iv must be 32 bytes/)
  })

  it('rejects data that is not a whole number of blocks', () => {
    expect(() => igeEncrypt(new Uint8Array(17), key, iv)).toThrow(/multiple of 16 bytes/)
    expect(() => igeDecrypt(new Uint8Array(1), key, iv)).toThrow(ValidationError)
  })

  it('rejects empty data', () => {
    expect(() => igeEncrypt(new Uint8Array(0), key, iv)).toThrow(/must not be empty/)
  })

  it('never puts key or data bytes in the message', () => {
    let message = ''
    try {
      igeEncrypt(data, new Uint8Array(16).fill(0xab), iv)
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).not.toContain('ab')
    expect(message).not.toContain('171')
  })
})
