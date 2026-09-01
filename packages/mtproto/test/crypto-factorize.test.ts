/**
 * Factorization of the handshake's proof-of-work value.
 *
 * The expectations are self-verifying: each case is built from two primes the
 * test knows, and the assertion is that the factors multiply back, are prime,
 * and come out in ascending order. Nothing is taken on trust from a table.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { factorizePq } from '../src/crypto/factorize.js'
import { isProbablePrime } from '../src/crypto/primes.js'

/** Assert the contract, whatever the input. */
function expectFactors(pq: bigint): void {
  const { p, q } = factorizePq(pq)

  expect(p * q).toBe(pq)
  expect(p).toBeLessThan(q)
  expect(isProbablePrime(p)).toBe(true)
  expect(isProbablePrime(q)).toBe(true)
}

describe('factorizePq', () => {
  it('factors the value from the published worked example', () => {
    // Taken from the protocol documentation's complete handshake, so the
    // expected factors are not ones this implementation chose.
    expect(factorizePq(3_358_800_871_349_344_843n)).toEqual({
      p: 1_786_331_737n,
      q: 1_880_278_339n,
    })
  })

  it('splits small semiprimes', () => {
    for (const pq of [6n, 15n, 21n, 35n, 77n, 143n, 323n, 1147n]) {
      expectFactors(pq)
    }
  })

  it('splits products of two 31-bit primes', () => {
    // The shape Telegram actually sends: pq is a semiprime just under 2^63.
    const cases: Array<[bigint, bigint]> = [
      [1_294_021n, 1_294_031n],
      [2_147_483_647n, 2_147_483_629n],
      [1_073_741_827n, 2_147_483_647n],
      [999_999_937n, 2_038_074_743n],
    ]

    for (const [a, b] of cases) {
      expect(isProbablePrime(a)).toBe(true)
      expect(isProbablePrime(b)).toBe(true)
      expectFactors(a * b)
    }
  })

  it('handles a 63-bit product', () => {
    const pq = 2_147_483_647n * 2_147_483_629n

    expect(pq.toString(2).length).toBe(62)
    expectFactors(pq)
  })

  it('finds a small factor without a cycle search', () => {
    expectFactors(2n * 2_147_483_647n)
    expectFactors(3n * 1_000_000_007n)
  })

  it('returns the factors ascending even when the larger is found first', () => {
    const { p, q } = factorizePq(1_294_021n * 1_294_031n)

    expect(p).toBe(1_294_021n)
    expect(q).toBe(1_294_031n)
  })
})

describe('malformed input', () => {
  it('refuses a value larger than the protocol can carry', () => {
    // `pq` arrives from an unauthenticated peer before any key exists, and the
    // cost of factoring grows with its size. The field is eight bytes, so a
    // larger value is refused rather than attempted.
    expect(() => factorizePq(1n << 64n)).toThrow(/at most/)
    expect(() => factorizePq((1n << 2048n) - 1n)).toThrow(ValidationError)
  })

  it('accepts the largest value the field can hold', () => {
    // The bound must sit above every legitimate value, not merely above the
    // ones seen in practice.
    const pq = 4_294_967_291n * 4_294_967_279n
    expect(pq).toBeLessThan(1n << 64n)
    expect(factorizePq(pq)).toEqual({ p: 4_294_967_279n, q: 4_294_967_291n })
  })

  it('rejects a prime pq', () => {
    // The protocol never sends one. A caller handed 1 x pq has no way to tell
    // that the factorization is trivial, so this refuses instead.
    expect(() => factorizePq(7n)).toThrow(/must be composite/)
    expect(() => factorizePq(2_147_483_647n)).toThrow(/must be composite/)
  })

  it('rejects values below four', () => {
    for (const value of [0n, 1n, 2n, 3n]) {
      expect(() => factorizePq(value)).toThrow(ValidationError)
    }
  })

  it('rejects a negative value', () => {
    expect(() => factorizePq(-15n)).toThrow(ValidationError)
  })
})

describe('values that are not semiprimes', () => {
  /**
   * `pq` arrives from the server. Dividing out a small factor leaves a cofactor
   * that has not been examined — `2^62` divides by two and leaves `2^61`, which
   * is not prime — so a value that is not a product of two primes has to be
   * refused rather than answered with whatever divides it.
   */
  it('refuses a prime power', () => {
    expect(() => factorizePq(2n ** 62n)).toThrow(/not a product of two primes/)
    expect(() => factorizePq(8n)).toThrow(/not a product of two primes/)
    expect(() => factorizePq(27n)).toThrow(/not a product of two primes/)
  })

  it('refuses a product of three primes', () => {
    expect(() => factorizePq(2n * 3n * 5n)).toThrow(/not a product of two primes/)
    expect(() => factorizePq(1_294_021n * 3n * 5n)).toThrow(/not a product of two primes/)
  })

  it('still accepts a genuine semiprime with a small factor', () => {
    expectFactors(2n * 2_147_483_647n)
    expectFactors(3n * 1_000_000_007n)
  })

  it('accepts the square of a prime, whose factors are equal', () => {
    // `p < q` cannot hold for `p²`. The protocol never sends one, but it is a
    // product of two primes and so is answered rather than refused.
    expect(factorizePq(4n)).toEqual({ p: 2n, q: 2n })
    expect(factorizePq(9n)).toEqual({ p: 3n, q: 3n })
  })
})
