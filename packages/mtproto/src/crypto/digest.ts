// SPDX-License-Identifier: MIT

/**
 * SHA-1, SHA-256 and MD5, without the platform.
 *
 * The companion to `crypto/aes.ts`, and there for the same reason: a runtime
 * that provides no `node:crypto` still has to speak the protocol, and the
 * protocol names these constantly. `crypto.subtle.digest` exists everywhere
 * these would be needed, but it is asynchronous, and the places that call these
 * are not — a message key is derived in the middle of building a message, and
 * making that await would turn every send and every receive into a promise
 * chain for no benefit on any runtime that has the platform anyway.
 *
 * All three are the same construction with different constants: the input is
 * padded to a multiple of 64 bytes with a one bit, zeros, and the length in
 * bits; the blocks are then folded one at a time into a small state. They
 * differ in what that state is, how a block expands into a message schedule,
 * and whether words are read big-endian (the SHA family) or little-endian
 * (MD5).
 *
 * ```
 *   parts ──> length-padded blocks ──> compress ──> state ──> digest
 * ```
 *
 * **Not a drop-in for secrecy.** A digest has no key, so there is nothing here
 * for a timing side channel to leak. That is a property of hashing rather than
 * of this code, and it does not extend to anything built on top: HMAC and the
 * key derivations that use it compare and combine secrets, and those comparisons
 * belong to the code doing them.
 */

import { ValidationError } from '@yuigram/core'

/** The block size all three share, in bytes. */
const BLOCK = 64

/** How many bytes of length the padding carries. */
const LENGTH_BYTES = 8

/**
 * Concatenate the parts and append the padding all three specify.
 *
 * The parts are joined rather than streamed. The protocol hashes keys, nonces
 * and message bodies — kilobytes at most, and already in memory — so a
 * streaming interface would add state to maintain for inputs that never need
 * it.
 */
function padded(parts: readonly Uint8Array[], littleEndian: boolean): Uint8Array {
  let length = 0
  for (const part of parts) length += part.length

  // One byte for the terminator, eight for the length, then as many zeros as it
  // takes to land on a boundary — none at all where the two already fill the
  // last block exactly, which is the case an off-by-one here gets wrong while
  // every other length still passes.
  const total = Math.ceil((length + 1 + LENGTH_BYTES) / BLOCK) * BLOCK
  const out = new Uint8Array(total)

  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  out[at] = 0x80

  // The length in bits. A `number` is exact to 2^53, which is 1 PiB of input —
  // more than anything that arrives in memory, so the high word is written as
  // the shift rather than through a bigint.
  const bits = length * 8
  const low = bits >>> 0
  const high = Math.floor(bits / 0x1_0000_0000)

  const view = new DataView(out.buffer)
  if (littleEndian) {
    view.setUint32(total - 8, low, true)
    view.setUint32(total - 4, high, true)
  } else {
    view.setUint32(total - 8, high, false)
    view.setUint32(total - 4, low, false)
  }

  return out
}

const rotl = (value: number, by: number): number => ((value << by) | (value >>> (32 - by))) >>> 0

const rotr = (value: number, by: number): number => ((value >>> by) | (value << (32 - by))) >>> 0

/** SHA-1's initial state, from the standard. */
const SHA1_INIT = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0] as const

/** SHA-1's four round constants, one per twenty rounds. */
const SHA1_K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6] as const

/** SHA-1. Used by the handshake key schedule and the auth key identifiers. */
export function sha1Portable(...parts: readonly Uint8Array[]): Uint8Array {
  const data = padded(parts, false)
  const view = new DataView(data.buffer)
  const state = Int32Array.from(SHA1_INIT)
  const schedule = new Int32Array(80)

  for (let block = 0; block < data.length; block += BLOCK) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getInt32(block + index * 4, false)
    }

    for (let index = 16; index < 80; index += 1) {
      schedule[index] =
        rotl(
          (schedule[index - 3] as number) ^
            (schedule[index - 8] as number) ^
            (schedule[index - 14] as number) ^
            (schedule[index - 16] as number),
          1,
        ) | 0
    }

    let a = state[0] as number
    let b = state[1] as number
    let c = state[2] as number
    let d = state[3] as number
    let e = state[4] as number

    for (let index = 0; index < 80; index += 1) {
      const round = (index / 20) | 0
      let mixed: number

      if (round === 0) mixed = (b & c) | (~b & d)
      else if (round === 2) mixed = (b & c) | (b & d) | (c & d)
      else mixed = b ^ c ^ d

      const next =
        (rotl(a, 5) +
          (mixed >>> 0) +
          (e >>> 0) +
          (SHA1_K[round] as number) +
          (schedule[index] as number)) >>>
        0

      e = d
      d = c
      c = rotl(b, 30) | 0
      b = a
      a = next | 0
    }

    state[0] = ((state[0] as number) + a) | 0
    state[1] = ((state[1] as number) + b) | 0
    state[2] = ((state[2] as number) + c) | 0
    state[3] = ((state[3] as number) + d) | 0
    state[4] = ((state[4] as number) + e) | 0
  }

  const out = new Uint8Array(20)
  const outView = new DataView(out.buffer)
  for (let index = 0; index < 5; index += 1) {
    outView.setInt32(index * 4, state[index] as number, false)
  }

  return out
}

/** SHA-256's initial state: the fractional parts of the roots of the first eight primes. */
const SHA256_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const

/** SHA-256's sixty-four round constants, from the cube roots of the first sixty-four primes. */
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

/** SHA-256. Used by the message key schedule, `rsa_pad` and SRP. */
export function sha256Portable(...parts: readonly Uint8Array[]): Uint8Array {
  const data = padded(parts, false)
  const view = new DataView(data.buffer)
  const state = Int32Array.from(SHA256_INIT)
  const schedule = new Int32Array(64)

  for (let block = 0; block < data.length; block += BLOCK) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getInt32(block + index * 4, false)
    }

    for (let index = 16; index < 64; index += 1) {
      const before = schedule[index - 15] as number
      const near = schedule[index - 2] as number
      const s0 = (rotr(before, 7) ^ rotr(before, 18) ^ (before >>> 3)) >>> 0
      const s1 = (rotr(near, 17) ^ rotr(near, 19) ^ (near >>> 10)) >>> 0

      schedule[index] =
        (((schedule[index - 16] as number) >>> 0) +
          s0 +
          ((schedule[index - 7] as number) >>> 0) +
          s1) |
        0
    }

    let a = state[0] as number
    let b = state[1] as number
    let c = state[2] as number
    let d = state[3] as number
    let e = state[4] as number
    let f = state[5] as number
    let g = state[6] as number
    let h = state[7] as number

    for (let index = 0; index < 64; index += 1) {
      const sigma1 = (rotr(e >>> 0, 6) ^ rotr(e >>> 0, 11) ^ rotr(e >>> 0, 25)) >>> 0
      const choose = ((e & f) ^ (~e & g)) >>> 0
      const first =
        ((h >>> 0) +
          sigma1 +
          choose +
          (SHA256_K[index] as number) +
          ((schedule[index] as number) >>> 0)) >>>
        0

      const sigma0 = (rotr(a >>> 0, 2) ^ rotr(a >>> 0, 13) ^ rotr(a >>> 0, 22)) >>> 0
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const second = (sigma0 + majority) >>> 0

      h = g
      g = f
      f = e
      e = ((d >>> 0) + first) | 0
      d = c
      c = b
      b = a
      a = (first + second) | 0
    }

    state[0] = ((state[0] as number) + a) | 0
    state[1] = ((state[1] as number) + b) | 0
    state[2] = ((state[2] as number) + c) | 0
    state[3] = ((state[3] as number) + d) | 0
    state[4] = ((state[4] as number) + e) | 0
    state[5] = ((state[5] as number) + f) | 0
    state[6] = ((state[6] as number) + g) | 0
    state[7] = ((state[7] as number) + h) | 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let index = 0; index < 8; index += 1) {
    outView.setInt32(index * 4, state[index] as number, false)
  }

  return out
}

/** MD5's per-round shift amounts, four groups of four repeated across sixteen rounds each. */
const MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const

/** MD5's additive constants: the integer part of 2^32 times the sine of the round number. */
const MD5_K = new Int32Array(64)
for (let index = 0; index < 64; index += 1) {
  MD5_K[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) | 0
}

/**
 * MD5, as an upload checksum.
 *
 * Not a security primitive and never used as one. The protocol defines a field
 * on a small-file upload carrying this over the file's contents, and the server
 * checks what it was sent against what arrived — so it is an integrity check on
 * a transfer, in the one place the protocol asks for it.
 */
export function md5Portable(...parts: readonly Uint8Array[]): Uint8Array {
  const data = padded(parts, true)
  const view = new DataView(data.buffer)
  const state = Int32Array.from([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476])
  const schedule = new Int32Array(16)

  for (let block = 0; block < data.length; block += BLOCK) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getInt32(block + index * 4, true)
    }

    let a = state[0] as number
    let b = state[1] as number
    let c = state[2] as number
    let d = state[3] as number

    for (let index = 0; index < 64; index += 1) {
      let mixed: number
      let word: number

      if (index < 16) {
        mixed = (b & c) | (~b & d)
        word = index
      } else if (index < 32) {
        mixed = (d & b) | (~d & c)
        word = (5 * index + 1) % 16
      } else if (index < 48) {
        mixed = b ^ c ^ d
        word = (3 * index + 5) % 16
      } else {
        mixed = c ^ (b | ~d)
        word = (7 * index) % 16
      }

      const sum =
        ((a >>> 0) +
          (mixed >>> 0) +
          ((MD5_K[index] as number) >>> 0) +
          ((schedule[word] as number) >>> 0)) >>>
        0

      a = d
      d = c
      c = b
      b = (b + rotl(sum, MD5_SHIFT[index] as number)) | 0
    }

    state[0] = ((state[0] as number) + a) | 0
    state[1] = ((state[1] as number) + b) | 0
    state[2] = ((state[2] as number) + c) | 0
    state[3] = ((state[3] as number) + d) | 0
  }

  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  for (let index = 0; index < 4; index += 1) {
    outView.setInt32(index * 4, state[index] as number, true)
  }

  return out
}

/**
 * HMAC, over whichever of these a caller names.
 *
 * Written here rather than taken from the platform because the one caller that
 * needs it is the key derivation below, and that has to run wherever the rest
 * of this does.
 */
export function hmacPortable(
  digest: (...parts: readonly Uint8Array[]) => Uint8Array,
  blockSize: number,
  key: Uint8Array,
  ...parts: readonly Uint8Array[]
): Uint8Array {
  if (blockSize < 1) throw new ValidationError('an HMAC block size is positive')

  const padded = new Uint8Array(blockSize)
  padded.set(key.length > blockSize ? digest(key) : key)

  const inner = new Uint8Array(blockSize)
  const outer = new Uint8Array(blockSize)
  for (let index = 0; index < blockSize; index += 1) {
    inner[index] = (padded[index] as number) ^ 0x36
    outer[index] = (padded[index] as number) ^ 0x5c
  }

  return digest(outer, digest(inner, ...parts))
}
