// SPDX-License-Identifier: MIT

/**
 * Modular arithmetic over native `BigInt`.
 *
 * `BigInt` carries the protocol's 2048-bit values without a bignum dependency,
 * which is the whole reason the subsystem needs no third-party arithmetic. What
 * it does not carry is modular exponentiation, so that is here.
 *
 * **Timing.** `BigInt` operations in V8 are variable-time, so `modPow` runs in
 * time that depends on its exponent. Exponentiations with a secret exponent —
 * the DH secret and SRP's — are therefore not constant-time. The exponents are
 * single-use and freshly generated, which bounds the exposure but does not
 * remove it. See `docs/mtproto-crypto.md` §6.
 */

import { ValidationError } from '@yuigram/core'

/** Modular exponentiation, `base^exponent mod modulus`. */
export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus <= 0n) throw new ValidationError('modulus must be positive')
  if (exponent < 0n) throw new ValidationError('exponent must not be negative')
  if (modulus === 1n) return 0n

  let result = 1n
  let factor = mod(base, modulus)
  let remaining = exponent

  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) result = (result * factor) % modulus
    factor = (factor * factor) % modulus
    remaining >>= 1n
  }

  return result
}

/**
 * Remainder in `[0, modulus)`.
 *
 * JavaScript's `%` keeps the sign of the dividend, so a subtraction that goes
 * below zero — SRP's `g_b - k·v` is the one that matters — needs correcting
 * before the value is used as a base or hashed.
 */
export function mod(value: bigint, modulus: bigint): bigint {
  if (modulus <= 0n) throw new ValidationError('modulus must be positive')

  const remainder = value % modulus
  return remainder < 0n ? remainder + modulus : remainder
}

/** Position of the highest set bit; zero for zero. */
export function bitLength(value: bigint): number {
  if (value < 0n) throw new ValidationError('bit length is undefined for a negative integer')
  if (value === 0n) return 0

  return value.toString(2).length
}
