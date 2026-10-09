// SPDX-License-Identifier: MIT

/**
 * Byte and integer handling.
 *
 * Unglamorous, and the layer everything else miscounts through. A big-endian
 * conversion that drops a leading zero, or a fixed-width encoding that
 * truncates instead of refusing, produces a handshake the server rejects with
 * no diagnostic beyond silence.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  assertLength,
  bigIntToBytesBE,
  bytesToBigIntBE,
  concatBytes,
  equalBytes,
  xorBytes,
} from '../src/crypto/bytes.js'

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)

describe('concatBytes', () => {
  it('joins in order', () => {
    expect([...concatBytes(bytes(1, 2), bytes(3), bytes(4, 5))]).toEqual([1, 2, 3, 4, 5])
  })

  it('handles no parts and empty parts', () => {
    expect(concatBytes().length).toBe(0)
    expect([...concatBytes(bytes(), bytes(7), bytes())]).toEqual([7])
  })
})

describe('xorBytes', () => {
  it('combines byte by byte', () => {
    expect([...xorBytes(bytes(0xff, 0x00, 0xaa), bytes(0x0f, 0xff, 0xaa))]).toEqual([
      0xf0, 0xff, 0x00,
    ])
  })

  it('is its own inverse', () => {
    const a = bytes(1, 2, 3, 4)
    const b = bytes(9, 8, 7, 6)

    expect([...xorBytes(xorBytes(a, b), b)]).toEqual([...a])
  })

  it('refuses operands of different lengths', () => {
    expect(() => xorBytes(bytes(1, 2), bytes(1))).toThrow(ValidationError)
  })
})

describe('equalBytes', () => {
  it('recognises equal and unequal content', () => {
    expect(equalBytes(bytes(1, 2, 3), bytes(1, 2, 3))).toBe(true)
    expect(equalBytes(bytes(1, 2, 3), bytes(1, 2, 4))).toBe(false)
  })

  it('answers false for different lengths rather than throwing', () => {
    // The platform comparison throws on a length mismatch. Throwing on a
    // comparison path is itself an oracle, so this answers instead.
    expect(() => equalBytes(bytes(1, 2), bytes(1, 2, 3))).not.toThrow()
    expect(equalBytes(bytes(1, 2), bytes(1, 2, 3))).toBe(false)
  })

  it('treats two empty strings as equal', () => {
    expect(equalBytes(bytes(), bytes())).toBe(true)
  })
})

describe('big-endian integers', () => {
  it('reads unsigned, most significant byte first', () => {
    expect(bytesToBigIntBE(bytes(0x01, 0x00))).toBe(256n)
    expect(bytesToBigIntBE(bytes(0xff, 0xff))).toBe(65535n)
    expect(bytesToBigIntBE(bytes())).toBe(0n)
  })

  it('round-trips at a fixed width', () => {
    const value = 0x0102030405060708n
    expect(bytesToBigIntBE(bigIntToBytesBE(value, 32))).toBe(value)
  })

  it('left-pads to the requested width', () => {
    const out = bigIntToBytesBE(3n, 4)

    expect(out.length).toBe(4)
    expect([...out]).toEqual([0, 0, 0, 3])
  })

  it('keeps the natural width when none is requested', () => {
    expect([...bigIntToBytesBE(256n)]).toEqual([1, 0])
    expect([...bigIntToBytesBE(0n)]).toEqual([0])
  })

  it('refuses a value wider than the requested width', () => {
    // Truncating here would silently corrupt a modulus or a public key.
    expect(() => bigIntToBytesBE(65536n, 2)).toThrow(ValidationError)
  })

  it('refuses a negative value', () => {
    expect(() => bigIntToBytesBE(-1n)).toThrow(ValidationError)
  })
})

describe('assertLength', () => {
  it('names the parameter and both lengths, and nothing else', () => {
    let message = ''
    try {
      assertLength(bytes(1, 2), 32, 'auth key')
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toBe('auth key must be 32 bytes, received 2')
    // The value must never appear in the message.
    expect(message).not.toContain('1,2')
  })

  it('accepts the exact length', () => {
    expect(() => assertLength(bytes(1, 2), 2, 'nonce')).not.toThrow()
  })
})
