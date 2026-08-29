/**
 * Primality and Diffie-Hellman parameter validation.
 *
 * The server chooses these parameters, so every condition is adversarial input
 * and each one gets a test that violates exactly it. Asserting only that
 * "something threw" would pass an implementation whose checks all collapse into
 * the first one.
 *
 * The primality expectations are mathematical facts rather than values borrowed
 * from anywhere: known primes, known composites, and the Carmichael numbers
 * that defeat a naive Fermat test.
 */

import { getDiffieHellman } from 'node:crypto'
import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { bytesToBigIntBE } from '../src/crypto/bytes.js'
import {
  isProbablePrime,
  isSafePrime,
  isValidDhPublicKey,
  validateDhParameters,
  validateDhPublicKey,
} from '../src/crypto/primes.js'

/**
 * A real 2048-bit safe prime, from the platform.
 *
 * RFC 3526 group 14, which `node:crypto` ships. Taking it from there rather
 * than writing the digits out keeps a 512-character constant out of the
 * repository and still exercises the full-size path.
 */
const MODP14 = bytesToBigIntBE(new Uint8Array(getDiffieHellman('modp14').getPrime()))

describe('isProbablePrime', () => {
  it('accepts small primes', () => {
    for (const prime of [2n, 3n, 5n, 7n, 11n, 13n, 97n, 101n, 8191n, 65_537n, 1_000_003n]) {
      expect(isProbablePrime(prime)).toBe(true)
    }
  })

  it('rejects small composites and values below two', () => {
    for (const composite of [0n, 1n, 4n, 9n, 15n, 100n, 1_000_000n]) {
      expect(isProbablePrime(composite)).toBe(false)
    }

    expect(isProbablePrime(-7n)).toBe(false)
  })

  it('rejects Carmichael numbers', () => {
    // These pass a Fermat test for every base coprime to them, so they are the
    // cases that separate Miller-Rabin from the naive version of the idea.
    for (const carmichael of [561n, 1105n, 1729n, 2465n, 2821n, 6601n, 8911n]) {
      expect(isProbablePrime(carmichael)).toBe(false)
    }
  })

  it('accepts large Mersenne primes', () => {
    expect(isProbablePrime((1n << 521n) - 1n, 8)).toBe(true)
    expect(isProbablePrime((1n << 607n) - 1n, 8)).toBe(true)
  })

  it('rejects a large composite of the same shape', () => {
    expect(isProbablePrime((1n << 521n) - 3n, 8)).toBe(false)
  })
})

describe('isSafePrime', () => {
  it('accepts primes p where (p-1)/2 is also prime', () => {
    for (const safe of [
      5n,
      7n,
      11n,
      23n,
      47n,
      59n,
      83n,
      107n,
      167n,
      179n,
      227n,
      263n,
      347n,
      359n,
      383n,
      467n,
      479n,
      503n,
    ]) {
      expect(isSafePrime(safe)).toBe(true)
    }
  })

  it('rejects primes that are not safe', () => {
    for (const unsafe of [13n, 17n, 19n, 29n, 31n, 37n, 41n, 43n]) {
      expect(isSafePrime(unsafe)).toBe(false)
    }
  })

  it('rejects composites and values below five', () => {
    expect(isSafePrime(9n)).toBe(false)
    expect(isSafePrime(4n)).toBe(false)
    expect(isSafePrime(3n)).toBe(false)
    expect(isSafePrime(0n)).toBe(false)
  })
})

describe('validateDhParameters', () => {
  it('accepts a real 2048-bit safe prime with generator 2', { timeout: 60_000 }, () => {
    expect(() => validateDhParameters({ p: MODP14, g: 2n })).not.toThrow()
  })

  it('reuses the outcome for a prime it has already validated', { timeout: 60_000 }, () => {
    // The first call above paid for the full check. This one must agree, and
    // must not be reachable for a prime that was never checked.
    const started = Date.now()
    validateDhParameters({ p: MODP14, g: 2n })

    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('rejects a prime that is not 2048 bits', () => {
    expect(() => validateDhParameters({ p: 23n, g: 2n })).toThrow(/must be 2048 bits/)
    expect(() => validateDhParameters({ p: MODP14 << 1n, g: 2n })).toThrow(/must be 2048 bits/)
  })

  it('rejects an unsupported generator', () => {
    for (const g of [0n, 1n, 8n, 9n, 100n]) {
      expect(() => validateDhParameters({ p: MODP14, g })).toThrow(
        /must be one of 2, 3, 4, 5, 6, 7/,
      )
    }
  })

  it('rejects a generator whose congruence the prime fails', () => {
    // modp14 happens to satisfy every generator's congruence, so the failing
    // case is built rather than found: subtracting 2 moves p from 7 to 5 mod 8,
    // which is what generator 2 requires it not to be.
    const wrongClass = MODP14 - 2n
    expect(wrongClass.toString(2).length).toBe(2048)
    expect(wrongClass % 8n).toBe(5n)

    expect(() => validateDhParameters({ p: wrongClass, g: 2n })).toThrow(
      /congruence required for generator 2/,
    )
  })

  it('checks the congruence before paying for primality', () => {
    // Ordering matters: the cheap structural check must come first, or every
    // malformed parameter set costs a full Miller-Rabin sweep.
    const started = Date.now()
    expect(() => validateDhParameters({ p: MODP14 - 2n, g: 2n })).toThrow(ValidationError)

    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('rejects a 2048-bit value in the right congruence class that is not prime', () => {
    // Subtracting 8 keeps p at 7 mod 8, so it clears the generator condition,
    // and moves it to 0 mod 3, so it is divisible by three and cannot be prime.
    const composite = MODP14 - 8n
    expect(composite.toString(2).length).toBe(2048)
    expect(composite % 8n).toBe(7n)
    expect(composite % 3n).toBe(0n)

    expect(() => validateDhParameters({ p: composite, g: 2n })).toThrow(/not a safe prime/)
  })
})

describe('validateDhPublicKey', () => {
  const p = MODP14
  const margin = 1n << 1984n

  it('accepts a value comfortably inside the window', () => {
    expect(() => validateDhPublicKey(p >> 1n, p)).not.toThrow()
    expect(isValidDhPublicKey(p >> 1n, p)).toBe(true)
  })

  it('rejects the plain range endpoints', () => {
    for (const value of [0n, 1n, p - 1n, p]) {
      expect(() => validateDhPublicKey(value, p)).toThrow(ValidationError)
      expect(isValidDhPublicKey(value, p)).toBe(false)
    }
  })

  it('rejects values inside the 2^1984 margin at either end', () => {
    expect(() => validateDhPublicKey(margin, p)).toThrow(/within 2\^1984/)
    expect(() => validateDhPublicKey(margin - 1n, p)).toThrow(/within 2\^1984/)
    expect(() => validateDhPublicKey(p - margin, p)).toThrow(/within 2\^1984/)
  })

  it('accepts values just outside the margin', () => {
    expect(() => validateDhPublicKey(margin + 1n, p)).not.toThrow()
    expect(() => validateDhPublicKey(p - margin - 1n, p)).not.toThrow()
  })
})
