/**
 * AES-256, and the two modes MTProto needs, without the platform.
 *
 * Every runtime Yuigram runs on today provides AES through `node:crypto`, and
 * the modules beside this one use it. A browser provides no such thing: the web
 * platform's cryptography has no ECB — which is what IGE is built from — and no
 * stateful cipher object, which is what the transport obfuscation is. Its whole
 * interface is asynchronous, and the protocol's hot paths are not.
 *
 * So a runtime without `node:crypto` needs the cipher itself. This is it.
 *
 * ```
 *   aes.ts  (here, portable)          crypto/ige.ts, crypto/ctr.ts
 *     └─ block cipher, IGE, CTR         └─ the same modes, over node:crypto
 * ```
 *
 * **On speed.** The round function is table-driven, which is the ordinary way
 * to write AES in a language without an AES instruction. Measured against the
 * platform's hardware-accelerated implementation it is an order of magnitude
 * slower, not two — fast enough that a message costs a fraction of a
 * millisecond and a large transfer stays bound by the network rather than by
 * this.
 *
 * **On timing.** This is *not* constant-time, and nothing here should be
 * described as though it were. Table lookups indexed by key-dependent bytes are
 * the classic cache-timing side channel, and a table-driven cipher in a garbage
 * collected language offers no defence against it. That is an accepted cost of
 * running where the platform provides nothing: the alternative on such a
 * runtime is not a better cipher, it is no connection at all. Where
 * `node:crypto` is present it is used instead, and there the work happens in
 * hardware.
 */

import { assertLength, checkIge as checkIgeInputs } from './backend-types.js'

/** AES block size, in bytes. */
const BLOCK = 16
/** The only key size MTProto uses. */
const KEY_SIZE = 32
/** Rounds for a 256-bit key. */
const ROUNDS = 14
/** IGE carries two chaining blocks, so its IV is twice a block. */
const IGE_IV = 32

/** The substitution box, and its inverse, derived from the field rather than listed. */
const SBOX = new Uint8Array(256)
const INV_SBOX = new Uint8Array(256)

/** Round constants, one per key-schedule expansion step. */
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c] as const

/** Multiply in GF(2^8) with the AES polynomial. */
function xmul(a: number, b: number): number {
  let result = 0
  let left = a
  let right = b

  while (right !== 0) {
    if ((right & 1) !== 0) result ^= left
    left = ((left << 1) ^ ((left & 0x80) !== 0 ? 0x1b : 0)) & 0xff
    right >>= 1
  }

  return result
}

{
  // A log/antilog pair on generator 3 gives the multiplicative inverse, and the
  // affine transform over it gives the box. Built rather than listed so the
  // construction is checkable.
  const alog = new Uint8Array(256)
  const log = new Uint8Array(256)
  let value = 1

  for (let index = 0; index < 255; index += 1) {
    alog[index] = value
    log[value] = index
    value ^= ((value << 1) ^ ((value & 0x80) !== 0 ? 0x11b : 0)) & 0xff
  }

  for (let index = 0; index < 256; index += 1) {
    const inverse = index === 0 ? 0 : (alog[(255 - (log[index] as number)) % 255] as number)
    let substituted = inverse
    let rotated = inverse

    for (let step = 0; step < 4; step += 1) {
      rotated = ((rotated << 1) | (rotated >>> 7)) & 0xff
      substituted ^= rotated
    }

    SBOX[index] = substituted ^ 0x63
  }

  for (let index = 0; index < 256; index += 1) INV_SBOX[SBOX[index] as number] = index
}

/** Forward round tables: substitution, shift and mix folded into one lookup. */
const T0 = new Uint32Array(256)
const T1 = new Uint32Array(256)
const T2 = new Uint32Array(256)
const T3 = new Uint32Array(256)

/** Inverse round tables, the same folding for the other direction. */
const D0 = new Uint32Array(256)
const D1 = new Uint32Array(256)
const D2 = new Uint32Array(256)
const D3 = new Uint32Array(256)

/** The inverse mix applied to a plain byte, for turning a key schedule around. */
const MIX = new Uint32Array(256)

// Built rather than listed, for the same reason the boxes above are.
for (let index = 0; index < 256; index += 1) {
  const forward = SBOX[index] as number
  const word =
    ((xmul(forward, 2) << 24) | (forward << 16) | (forward << 8) | xmul(forward, 3)) >>> 0

  T0[index] = word
  T1[index] = ((word >>> 8) | (word << 24)) >>> 0
  T2[index] = ((word >>> 16) | (word << 16)) >>> 0
  T3[index] = ((word >>> 24) | (word << 8)) >>> 0

  const back = INV_SBOX[index] as number
  const inverse =
    ((xmul(back, 0x0e) << 24) |
      (xmul(back, 0x09) << 16) |
      (xmul(back, 0x0d) << 8) |
      xmul(back, 0x0b)) >>>
    0

  D0[index] = inverse
  D1[index] = ((inverse >>> 8) | (inverse << 24)) >>> 0
  D2[index] = ((inverse >>> 16) | (inverse << 16)) >>> 0
  D3[index] = ((inverse >>> 24) | (inverse << 8)) >>> 0

  MIX[index] =
    ((xmul(index, 0x0e) << 24) |
      (xmul(index, 0x09) << 16) |
      (xmul(index, 0x0d) << 8) |
      xmul(index, 0x0b)) >>>
    0
}

/** Apply the inverse mix to one round-key word. */
function mixWord(word: number): number {
  return (
    ((MIX[(word >>> 24) & 0xff] as number) ^
      (((MIX[(word >>> 16) & 0xff] as number) >>> 8) |
        ((MIX[(word >>> 16) & 0xff] as number) << 24)) ^
      (((MIX[(word >>> 8) & 0xff] as number) >>> 16) |
        ((MIX[(word >>> 8) & 0xff] as number) << 16)) ^
      (((MIX[word & 0xff] as number) >>> 24) | ((MIX[word & 0xff] as number) << 8))) >>>
    0
  )
}

/** A key, expanded once for both directions. */
export interface AesKey {
  /** Round keys for encryption. */
  readonly forward: Uint32Array
  /** Round keys for decryption, already inverse-mixed. */
  readonly backward: Uint32Array
}

/**
 * Expand a 256-bit key into the round keys both directions need.
 *
 * Worth doing once and keeping: the schedule costs about as much as encrypting
 * a block, and a mode that expanded per block would spend most of its time
 * here.
 */
export function expandKey(key: Uint8Array): AesKey {
  assertLength(key, KEY_SIZE, 'AES-256 key')

  const words = 4 * (ROUNDS + 1)
  const forward = new Uint32Array(words)

  for (let index = 0; index < 8; index += 1) {
    forward[index] =
      (((key[4 * index] as number) << 24) |
        ((key[4 * index + 1] as number) << 16) |
        ((key[4 * index + 2] as number) << 8) |
        (key[4 * index + 3] as number)) >>>
      0
  }

  for (let index = 8; index < words; index += 1) {
    let carried = forward[index - 1] as number

    if (index % 8 === 0) {
      carried = ((carried << 8) | (carried >>> 24)) >>> 0
      carried = substituteWord(carried) ^ ((RCON[index / 8 - 1] as number) << 24)
    } else if (index % 8 === 4) {
      carried = substituteWord(carried)
    }

    forward[index] = ((forward[index - 8] as number) ^ carried) >>> 0
  }

  // The decryption schedule is the encryption one in reverse, with every round
  // key but the first and last put through the inverse mix.
  const backward = new Uint32Array(words)

  for (let round = 0; round <= ROUNDS; round += 1) {
    for (let column = 0; column < 4; column += 1) {
      backward[round * 4 + column] = forward[(ROUNDS - round) * 4 + column] as number
    }
  }

  for (let index = 4; index < words - 4; index += 1) {
    backward[index] = mixWord(backward[index] as number)
  }

  return { forward, backward }
}

/** Substitute all four bytes of a word. */
function substituteWord(word: number): number {
  return (
    (((SBOX[(word >>> 24) & 0xff] as number) << 24) |
      ((SBOX[(word >>> 16) & 0xff] as number) << 16) |
      ((SBOX[(word >>> 8) & 0xff] as number) << 8) |
      (SBOX[word & 0xff] as number)) >>>
    0
  )
}

/** Read four big-endian words out of a block. */
function readState(input: Uint8Array, at: number, keys: Uint32Array): Int32Array {
  const state = new Int32Array(4)

  for (let column = 0; column < 4; column += 1) {
    const offset = at + column * 4

    state[column] =
      ((((input[offset] as number) << 24) |
        ((input[offset + 1] as number) << 16) |
        ((input[offset + 2] as number) << 8) |
        (input[offset + 3] as number)) ^
        (keys[column] as number)) >>>
      0
  }

  return state
}

/** Write four words back out as big-endian bytes. */
function writeState(state: Int32Array, out: Uint8Array, at: number): void {
  for (let column = 0; column < 4; column += 1) {
    const word = state[column] as number

    out[at + column * 4] = (word >>> 24) & 0xff
    out[at + column * 4 + 1] = (word >>> 16) & 0xff
    out[at + column * 4 + 2] = (word >>> 8) & 0xff
    out[at + column * 4 + 3] = word & 0xff
  }
}

/** Encrypt one block in place from `input[at]` into `out[outAt]`. */
export function encryptBlock(
  key: AesKey,
  input: Uint8Array,
  at: number,
  out: Uint8Array,
  outAt: number,
): void {
  const keys = key.forward
  const state = readState(input, at, keys)
  let s0 = state[0] as number
  let s1 = state[1] as number
  let s2 = state[2] as number
  let s3 = state[3] as number
  let offset = 4

  for (let round = 1; round < ROUNDS; round += 1) {
    const t0 =
      ((T0[(s0 >>> 24) & 0xff] as number) ^
        (T1[(s1 >>> 16) & 0xff] as number) ^
        (T2[(s2 >>> 8) & 0xff] as number) ^
        (T3[s3 & 0xff] as number) ^
        (keys[offset] as number)) >>>
      0
    const t1 =
      ((T0[(s1 >>> 24) & 0xff] as number) ^
        (T1[(s2 >>> 16) & 0xff] as number) ^
        (T2[(s3 >>> 8) & 0xff] as number) ^
        (T3[s0 & 0xff] as number) ^
        (keys[offset + 1] as number)) >>>
      0
    const t2 =
      ((T0[(s2 >>> 24) & 0xff] as number) ^
        (T1[(s3 >>> 16) & 0xff] as number) ^
        (T2[(s0 >>> 8) & 0xff] as number) ^
        (T3[s1 & 0xff] as number) ^
        (keys[offset + 2] as number)) >>>
      0
    const t3 =
      ((T0[(s3 >>> 24) & 0xff] as number) ^
        (T1[(s0 >>> 16) & 0xff] as number) ^
        (T2[(s1 >>> 8) & 0xff] as number) ^
        (T3[s2 & 0xff] as number) ^
        (keys[offset + 3] as number)) >>>
      0

    s0 = t0
    s1 = t1
    s2 = t2
    s3 = t3
    offset += 4
  }

  // The last round substitutes and shifts without mixing, so it cannot use the
  // folded tables.
  const columns = [s0, s1, s2, s3]
  const final = new Int32Array(4)

  for (let column = 0; column < 4; column += 1) {
    final[column] =
      ((((SBOX[((columns[column] as number) >>> 24) & 0xff] as number) << 24) |
        ((SBOX[((columns[(column + 1) & 3] as number) >>> 16) & 0xff] as number) << 16) |
        ((SBOX[((columns[(column + 2) & 3] as number) >>> 8) & 0xff] as number) << 8) |
        (SBOX[(columns[(column + 3) & 3] as number) & 0xff] as number)) ^
        (keys[offset + column] as number)) >>>
      0
  }

  writeState(final, out, outAt)
}

/** Decrypt one block in place from `input[at]` into `out[outAt]`. */
export function decryptBlock(
  key: AesKey,
  input: Uint8Array,
  at: number,
  out: Uint8Array,
  outAt: number,
): void {
  const keys = key.backward
  const state = readState(input, at, keys)
  let s0 = state[0] as number
  let s1 = state[1] as number
  let s2 = state[2] as number
  let s3 = state[3] as number
  let offset = 4

  for (let round = 1; round < ROUNDS; round += 1) {
    // Inverse shift rows runs the other way round, so the column indices
    // descend where the forward direction's ascend.
    const t0 =
      ((D0[(s0 >>> 24) & 0xff] as number) ^
        (D1[(s3 >>> 16) & 0xff] as number) ^
        (D2[(s2 >>> 8) & 0xff] as number) ^
        (D3[s1 & 0xff] as number) ^
        (keys[offset] as number)) >>>
      0
    const t1 =
      ((D0[(s1 >>> 24) & 0xff] as number) ^
        (D1[(s0 >>> 16) & 0xff] as number) ^
        (D2[(s3 >>> 8) & 0xff] as number) ^
        (D3[s2 & 0xff] as number) ^
        (keys[offset + 1] as number)) >>>
      0
    const t2 =
      ((D0[(s2 >>> 24) & 0xff] as number) ^
        (D1[(s1 >>> 16) & 0xff] as number) ^
        (D2[(s0 >>> 8) & 0xff] as number) ^
        (D3[s3 & 0xff] as number) ^
        (keys[offset + 2] as number)) >>>
      0
    const t3 =
      ((D0[(s3 >>> 24) & 0xff] as number) ^
        (D1[(s2 >>> 16) & 0xff] as number) ^
        (D2[(s1 >>> 8) & 0xff] as number) ^
        (D3[s0 & 0xff] as number) ^
        (keys[offset + 3] as number)) >>>
      0

    s0 = t0
    s1 = t1
    s2 = t2
    s3 = t3
    offset += 4
  }

  const columns = [s0, s1, s2, s3]
  const final = new Int32Array(4)

  for (let column = 0; column < 4; column += 1) {
    final[column] =
      ((((INV_SBOX[((columns[column] as number) >>> 24) & 0xff] as number) << 24) |
        ((INV_SBOX[((columns[(column + 3) & 3] as number) >>> 16) & 0xff] as number) << 16) |
        ((INV_SBOX[((columns[(column + 2) & 3] as number) >>> 8) & 0xff] as number) << 8) |
        (INV_SBOX[(columns[(column + 1) & 3] as number) & 0xff] as number)) ^
        (keys[offset + column] as number)) >>>
      0
  }

  writeState(final, out, outAt)
}

/** Reject what the modes cannot express, before any key material is touched. */
function checkIge(key: Uint8Array, iv: Uint8Array, data: Uint8Array): void {
  // The same validator the platform path uses. Two implementations of one
  // precondition would eventually disagree, and the one that mattered would be
  // whichever ran where nobody was looking.
  checkIgeInputs(key, iv, data)
}

/**
 * Encrypt with AES-256-IGE, without the platform.
 *
 * The same mode `crypto/ige.ts` performs over `node:crypto`, and the same
 * chaining: each block's cipher input is the previous ciphertext, and its
 * output is masked by the previous plaintext.
 */
export function igeEncryptPortable(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  checkIge(key, iv, data)

  const expanded = expandKey(key)
  const out = new Uint8Array(data.length)
  const scratch = new Uint8Array(BLOCK)
  let previousCipher = iv.subarray(0, BLOCK)
  let previousPlain = iv.subarray(BLOCK, IGE_IV)

  for (let offset = 0; offset < data.length; offset += BLOCK) {
    for (let index = 0; index < BLOCK; index += 1) {
      scratch[index] = (data[offset + index] as number) ^ (previousCipher[index] as number)
    }

    encryptBlock(expanded, scratch, 0, out, offset)

    for (let index = 0; index < BLOCK; index += 1) {
      out[offset + index] = (out[offset + index] as number) ^ (previousPlain[index] as number)
    }

    previousCipher = out.subarray(offset, offset + BLOCK)
    previousPlain = data.subarray(offset, offset + BLOCK)
  }

  return out
}

/** Decrypt with AES-256-IGE, without the platform. */
export function igeDecryptPortable(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  checkIge(key, iv, data)

  const expanded = expandKey(key)
  const out = new Uint8Array(data.length)
  const scratch = new Uint8Array(BLOCK)
  let previousCipher = iv.subarray(0, BLOCK)
  let previousPlain = iv.subarray(BLOCK, IGE_IV)

  for (let offset = 0; offset < data.length; offset += BLOCK) {
    for (let index = 0; index < BLOCK; index += 1) {
      scratch[index] = (data[offset + index] as number) ^ (previousPlain[index] as number)
    }

    decryptBlock(expanded, scratch, 0, out, offset)

    for (let index = 0; index < BLOCK; index += 1) {
      out[offset + index] = (out[offset + index] as number) ^ (previousCipher[index] as number)
    }

    previousCipher = data.subarray(offset, offset + BLOCK)
    previousPlain = out.subarray(offset, offset + BLOCK)
  }

  return out
}

/**
 * A counter-mode stream, without the platform.
 *
 * The transport obfuscation is a stream rather than a series of messages: one
 * of these is opened when a connection is established and fed every packet in
 * one direction for the life of that connection. So the keystream position has
 * to survive between calls, and a call has to be able to stop part-way through
 * a block and resume there — a packet boundary has nothing to do with a block
 * boundary.
 */
export class CtrStream {
  readonly #key: AesKey
  readonly #counter: Uint8Array
  readonly #keystream = new Uint8Array(BLOCK)
  /** How much of the current keystream block has been spent. */
  #used = BLOCK

  constructor(key: Uint8Array, iv: Uint8Array) {
    assertLength(key, KEY_SIZE, 'AES-CTR key')
    assertLength(iv, BLOCK, 'AES-CTR counter')

    this.#key = expandKey(key)
    this.#counter = Uint8Array.from(iv)
  }

  /**
   * Transform the next stretch of the stream.
   *
   * Counter mode is its own inverse, so this both encrypts and decrypts.
   */
  process(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length)

    for (let index = 0; index < data.length; index += 1) {
      if (this.#used === BLOCK) {
        encryptBlock(this.#key, this.#counter, 0, this.#keystream, 0)
        this.#advance()
        this.#used = 0
      }

      out[index] = (data[index] as number) ^ (this.#keystream[this.#used] as number)
      this.#used += 1
    }

    return out
  }

  /**
   * Step the counter by one, as a big-endian integer over the whole block.
   *
   * Carrying through all sixteen bytes rather than only the low word: the
   * protocol's counter is the full block, and a stream long enough to overflow
   * a narrower field would silently repeat keystream.
   */
  #advance(): void {
    for (let index = BLOCK - 1; index >= 0; index -= 1) {
      const next = ((this.#counter[index] as number) + 1) & 0xff

      this.#counter[index] = next
      if (next !== 0) return
    }
  }
}
