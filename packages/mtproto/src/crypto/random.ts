// SPDX-License-Identifier: MPL-2.0

/**
 * The subsystem's only source of randomness.
 *
 * Every nonce, DH secret, padding block and temporary key comes from here, and
 * here comes from the backend this runtime resolved to. Routing them through
 * one module is what makes "no `Math.random` anywhere in the protocol stack" a
 * property that can be checked by reading one file.
 */

import { ValidationError } from '../core.js'
import { backend } from './backend.js'
import { bytesToBigIntBE } from './bytes.js'

/** Smallest padding MTProto 2.0 permits. */
const MIN_PADDING = 12
/** Largest padding MTProto 2.0 permits. */
const MAX_PADDING = 1024
/** Encrypted payloads are a whole number of AES blocks. */
const BLOCK_SIZE = 16

/** Cryptographically secure random bytes. */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 0) {
    throw new ValidationError('random byte length must be a non-negative integer')
  }

  return backend.randomBytes(length)
}

/** A uniform integer in `[0, 2^bits)`. */
export function randomBigInt(bits: number): bigint {
  if (!Number.isInteger(bits) || bits <= 0) {
    throw new ValidationError('bit count must be a positive integer')
  }

  const bytes = randomBytes(Math.ceil(bits / 8))
  const excess = BigInt(bytes.length * 8 - bits)

  return bytesToBigIntBE(bytes) >> excess
}

/**
 * A uniform integer in `[0, limit)`.
 *
 * Rejection sampling rather than a modular reduction of a wider draw: reduction
 * is biased towards the low end of the range whenever the draw's span is not a
 * multiple of the limit, and the bias is largest exactly where these values are
 * used as secret exponents.
 */
export function randomBigIntBelow(limit: bigint): bigint {
  if (limit <= 0n) throw new ValidationError('limit must be positive')

  const bits = limit.toString(2).length
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const candidate = randomBigInt(bits)
    if (candidate < limit) return candidate
  }

  // Each draw rejects with probability below one half, so reaching here means
  // the platform CSPRNG is not behaving. Failing beats returning a biased value.
  throw new ValidationError('failed to draw a uniform value in range')
}

/**
 * Padding for an encrypted MTProto payload.
 *
 * Between 12 and 1024 random bytes, chosen so the padded length is a whole
 * number of AES blocks. Both bounds come from the protocol; the block alignment
 * is what lets the receiver decrypt without knowing the padding size in advance.
 */
export function messagePadding(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 0) {
    throw new ValidationError('payload length must be a non-negative integer')
  }

  const smallest = MIN_PADDING + ((BLOCK_SIZE - ((length + MIN_PADDING) % BLOCK_SIZE)) % BLOCK_SIZE)
  const spare = Math.floor((MAX_PADDING - smallest) / BLOCK_SIZE)
  const extra = spare > 0 ? Number(randomBigIntBelow(BigInt(spare + 1))) * BLOCK_SIZE : 0

  return randomBytes(smallest + extra)
}
