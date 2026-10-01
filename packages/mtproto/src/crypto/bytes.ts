/**
 * Byte handling shared by every cryptographic primitive.
 *
 * MTProto moves between byte strings and integers constantly — a nonce is
 * bytes, the same value inside an exponentiation is a number, and the result
 * goes back to bytes at a fixed width. Doing that conversion in one place, in
 * one byte order, removes a class of defect that is otherwise invisible until
 * a server rejects a handshake without saying why.
 *
 * Every integer conversion here is **big-endian and unsigned**, because that is
 * how the protocol serializes the values that reach a hash or a modular
 * exponentiation.
 */

import { ValidationError } from '../core.js'
import { backend } from './backend.js'
import { assertLength } from './backend-types.js'

export { assertLength }

/** Join byte strings. */
export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  let total = 0
  for (const part of parts) total += part.length

  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }

  return out
}

/** XOR two equal-length byte strings. */
export function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new ValidationError(
      `xor operands must be the same length, received ${a.length} and ${b.length}`,
    )
  }

  const out = new Uint8Array(a.length)
  // Indexes are in range by the length check above; the fallback satisfies
  // `noUncheckedIndexedAccess` without a non-null assertion.
  for (let index = 0; index < a.length; index += 1) out[index] = (a[index] ?? 0) ^ (b[index] ?? 0)

  return out
}

/**
 * Compare in time that does not depend on the contents.
 *
 * A length mismatch returns `false` immediately: lengths are not secret, and
 * the platform comparison throws on unequal lengths rather than answering. This
 * never throws, so it is safe to use on a comparison path where an exception
 * would itself be an oracle.
 */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return backend.constantTimeEqual(a, b)
}

/** Read a byte string as an unsigned big-endian integer. */
export function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)

  return value
}

/**
 * Write an unsigned integer as big-endian bytes.
 *
 * With `length`, the result is left-padded with zeros to exactly that width —
 * which is what the protocol requires wherever a number is concatenated into a
 * hash. A value too large for the requested width is rejected rather than
 * truncated, because a silently truncated modulus or public key produces a
 * failure with no diagnostic trail.
 */
export function bigIntToBytesBE(value: bigint, length?: number): Uint8Array {
  if (value < 0n) throw new ValidationError('cannot encode a negative integer as unsigned bytes')

  const digits: number[] = []
  let remaining = value
  while (remaining > 0n) {
    digits.push(Number(remaining & 0xffn))
    remaining >>= 8n
  }
  if (digits.length === 0) digits.push(0)
  digits.reverse()

  if (length === undefined) return Uint8Array.from(digits)

  if (digits.length > length) {
    // A leading zero byte is padding, not magnitude, so trim it before
    // declaring the value too wide.
    let start = 0
    while (start < digits.length - length && digits[start] === 0) start += 1

    const trimmed = digits.slice(start)
    if (trimmed.length > length) {
      throw new ValidationError(`integer does not fit in ${length} bytes`)
    }

    const padded = new Uint8Array(length)
    padded.set(trimmed, length - trimmed.length)
    return padded
  }

  const out = new Uint8Array(length)
  out.set(digits, length - digits.length)
  return out
}

/** Reject a byte string that is not exactly `length` bytes. */
