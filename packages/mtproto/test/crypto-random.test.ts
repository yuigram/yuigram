// SPDX-License-Identifier: MPL-2.0

/**
 * Randomness and modular arithmetic.
 *
 * Randomness is asserted by property rather than by value, because a value
 * assertion over a CSPRNG is either vacuous or flaky. What is checked is what
 * the protocol depends on: the ranges hold, the padding rules hold, and
 * successive draws differ.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { bitLength, mod, modPow } from '../src/crypto/bigint.js'
import {
  messagePadding,
  randomBigInt,
  randomBigIntBelow,
  randomBytes,
} from '../src/crypto/random.js'

describe('randomBytes', () => {
  it('returns the requested length', () => {
    for (const length of [0, 1, 16, 32, 256, 1024]) {
      expect(randomBytes(length).length).toBe(length)
    }
  })

  it('differs between calls', () => {
    expect([...randomBytes(32)]).not.toEqual([...randomBytes(32)])
  })

  it('rejects a negative or fractional length', () => {
    expect(() => randomBytes(-1)).toThrow(ValidationError)
    expect(() => randomBytes(1.5)).toThrow(ValidationError)
  })
})

describe('randomBigInt', () => {
  it('stays within the requested bit width', () => {
    for (const bits of [1, 8, 64, 256, 2048]) {
      for (let draw = 0; draw < 20; draw += 1) {
        const value = randomBigInt(bits)

        expect(value).toBeGreaterThanOrEqual(0n)
        expect(value).toBeLessThan(1n << BigInt(bits))
      }
    }
  })

  it('uses the full width often enough to show it is not truncating', () => {
    // A draw that always cleared its top bits would still satisfy the bound
    // above, so this checks the width is actually reached.
    let sawHighBit = false
    for (let draw = 0; draw < 64 && !sawHighBit; draw += 1) {
      sawHighBit = randomBigInt(64) >= 1n << 62n
    }

    expect(sawHighBit).toBe(true)
  })

  it('rejects a non-positive width', () => {
    expect(() => randomBigInt(0)).toThrow(ValidationError)
    expect(() => randomBigInt(-8)).toThrow(ValidationError)
  })
})

describe('randomBigIntBelow', () => {
  it('stays below the limit', () => {
    for (const limit of [1n, 2n, 3n, 255n, 256n, 1_000_003n, 1n << 200n]) {
      for (let draw = 0; draw < 40; draw += 1) {
        const value = randomBigIntBelow(limit)

        expect(value).toBeGreaterThanOrEqual(0n)
        expect(value).toBeLessThan(limit)
      }
    }
  })

  it('covers the range rather than clustering', () => {
    // Rejection sampling is used specifically to avoid the low-end bias a
    // modular reduction would introduce, so both halves must be reachable.
    const seen = new Set<bigint>()
    for (let draw = 0; draw < 200; draw += 1) seen.add(randomBigIntBelow(3n))

    expect([...seen].sort()).toEqual([0n, 1n, 2n])
  })

  it('rejects a non-positive limit', () => {
    expect(() => randomBigIntBelow(0n)).toThrow(ValidationError)
    expect(() => randomBigIntBelow(-5n)).toThrow(ValidationError)
  })
})

describe('messagePadding', () => {
  it('keeps the padded length a whole number of AES blocks', () => {
    for (let length = 0; length < 200; length += 1) {
      const padding = messagePadding(length)

      expect((length + padding.length) % 16).toBe(0)
    }
  })

  it('stays within the 12 to 1024 byte bounds', () => {
    for (let draw = 0; draw < 200; draw += 1) {
      const padding = messagePadding(draw)

      expect(padding.length).toBeGreaterThanOrEqual(12)
      expect(padding.length).toBeLessThanOrEqual(1024)
    }
  })

  it('varies its length, not only its content', () => {
    const lengths = new Set<number>()
    for (let draw = 0; draw < 100; draw += 1) lengths.add(messagePadding(40).length)

    expect(lengths.size).toBeGreaterThan(1)
  })

  it('rejects a negative or fractional payload length', () => {
    expect(() => messagePadding(-1)).toThrow(ValidationError)
    expect(() => messagePadding(2.5)).toThrow(ValidationError)
  })
})

describe('modPow', () => {
  it('agrees with direct exponentiation where that is tractable', () => {
    for (const [base, exponent, modulus] of [
      [2n, 10n, 1000n],
      [7n, 13n, 97n],
      [123n, 45n, 1_000_003n],
      [5n, 0n, 7n],
      [5n, 1n, 7n],
    ] as const) {
      expect(modPow(base, exponent, modulus)).toBe(base ** exponent % modulus)
    }
  })

  it('holds Fermat’s little theorem for a known prime', () => {
    // a^(p-1) = 1 mod p for prime p and a not divisible by p. An independent
    // property, so it checks the routine rather than restating it.
    const p = 1_000_003n
    for (const a of [2n, 3n, 5n, 999_983n]) {
      expect(modPow(a, p - 1n, p)).toBe(1n)
    }
  })

  it('handles a negative base by reducing first', () => {
    expect(modPow(-3n, 3n, 7n)).toBe(mod(-27n, 7n))
  })

  it('returns zero for a modulus of one', () => {
    expect(modPow(5n, 3n, 1n)).toBe(0n)
  })

  it('rejects a non-positive modulus and a negative exponent', () => {
    expect(() => modPow(2n, 3n, 0n)).toThrow(/modulus must be positive/)
    expect(() => modPow(2n, 3n, -7n)).toThrow(/modulus must be positive/)
    expect(() => modPow(2n, -1n, 7n)).toThrow(/exponent must not be negative/)
  })
})

describe('mod', () => {
  it('always returns a non-negative remainder', () => {
    expect(mod(-1n, 7n)).toBe(6n)
    expect(mod(-8n, 7n)).toBe(6n)
    expect(mod(8n, 7n)).toBe(1n)
    expect(mod(0n, 7n)).toBe(0n)
  })

  it('rejects a non-positive modulus', () => {
    expect(() => mod(1n, 0n)).toThrow(ValidationError)
  })
})

describe('bitLength', () => {
  it('counts to the highest set bit', () => {
    expect(bitLength(0n)).toBe(0)
    expect(bitLength(1n)).toBe(1)
    expect(bitLength(255n)).toBe(8)
    expect(bitLength(256n)).toBe(9)
    expect(bitLength((1n << 2047n) + 1n)).toBe(2048)
  })

  it('rejects a negative value', () => {
    expect(() => bitLength(-1n)).toThrow(ValidationError)
  })
})
