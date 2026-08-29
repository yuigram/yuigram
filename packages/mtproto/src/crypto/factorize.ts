/**
 * Factorization of the handshake's proof-of-work value.
 *
 * The server sends `pq`, a semiprime below 2^63, and the client must return its
 * two factors in ascending order. The work is deliberately small — it exists to
 * cost a client something before the server allocates state, not to be hard.
 *
 * Pollard's rho, with trial division by small primes first because a small
 * factor is common and costs nothing to find.
 */

import { ValidationError } from '@yuigram/core'
import { isProbablePrime } from './primes.js'
import { randomBigIntBelow } from './random.js'

/** Attempts with fresh parameters before giving up. */
const MAX_ATTEMPTS = 32

/** Small factors are worth a division each before any cycle search. */
const SMALL_PRIMES: readonly bigint[] = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]

/** The two prime factors of `pq`, ascending. */
export interface PqFactors {
  /** The smaller factor. */
  readonly p: bigint
  /** The larger factor. */
  readonly q: bigint
}

function gcd(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a
  let right = b < 0n ? -b : b

  while (right !== 0n) {
    const next = left % right
    left = right
    right = next
  }

  return left
}

/**
 * One Pollard-rho attempt, with Floyd cycle detection.
 *
 * Returns a non-trivial factor, or `undefined` when this polynomial constant
 * leads to a degenerate cycle — which is what the caller's retry loop exists
 * for. For a semiprime with 31-bit factors the expected work is on the order of
 * the square root of the smaller factor, a few tens of thousands of steps.
 */
function rho(n: bigint, c: bigint): bigint | undefined {
  const step = (value: bigint): bigint => (value * value + c) % n

  let slow = 2n
  let fast = 2n
  let factor = 1n

  while (factor === 1n) {
    slow = step(slow)
    fast = step(step(fast))

    if (slow === fast) return undefined

    factor = gcd(slow > fast ? slow - fast : fast - slow, n)
  }

  return factor === n ? undefined : factor
}

/**
 * Split `pq` into its two prime factors.
 *
 * The ascending order is part of the contract: the handshake serializes `p`
 * before `q`, and a server that receives them the other way rejects the
 * exchange. Both factors are verified prime — a `pq` that is not a semiprime is
 * refused rather than split into whatever divides it.
 *
 * A prime `pq` is rejected rather than returned as `1 × pq`. The protocol never
 * sends one, so receiving one means something upstream is wrong, and a caller
 * that is handed a trivial factorization has no way to notice.
 */
export function factorizePq(pq: bigint): PqFactors {
  if (pq < 4n) throw new ValidationError('pq must be at least 4')

  for (const small of SMALL_PRIMES) {
    if (pq % small === 0n) {
      const other = pq / small
      if (other === 1n) throw new ValidationError('pq must be composite')
      return checked(small, other)
    }
  }

  if (isProbablePrime(pq)) throw new ValidationError('pq must be composite')

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // A fresh constant each time: the polynomial decides whether the cycle
    // closes on a factor or on the modulus, and one that fails will keep
    // failing.
    const factor = rho(pq, randomBigIntBelow(pq - 1n) + 1n)
    if (factor !== undefined && factor !== 1n && factor !== pq) {
      return checked(factor, pq / factor)
    }
  }

  throw new ValidationError('failed to factorize pq')
}

/**
 * Order the factors, and refuse a split that is not into two primes.
 *
 * Dividing out a small factor leaves a cofactor that has not been examined:
 * `2^62` divides by two and leaves `2^61`, which is not prime. The protocol
 * only ever sends a semiprime, but `pq` arrives from the server, so a value
 * that is not one is rejected rather than answered with a factorization that
 * does not satisfy the contract.
 */
function checked(a: bigint, b: bigint): PqFactors {
  if (!isProbablePrime(a) || !isProbablePrime(b)) {
    throw new ValidationError('pq is not a product of two primes')
  }

  return a < b ? { p: a, q: b } : { p: b, q: a }
}
