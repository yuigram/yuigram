// SPDX-License-Identifier: MPL-2.0

/**
 * Decompression, without the platform.
 *
 * Telegram wraps a large answer in `gzip_packed`, so a client that cannot
 * decompress cannot read half of what it is sent. `node:zlib` does it where
 * there is a `node:zlib`; a browser has `DecompressionStream`, which is
 * asynchronous, and the message layer that needs this is not — a compressed
 * answer is unwrapped in the middle of flattening a container, several frames
 * below anything that could await.
 *
 * So this is DEFLATE as RFC 1951 defines it, under the gzip wrapper of RFC
 * 1952. Only the decompressing half: nothing in the protocol asks a client to
 * compress, and a compressor that is never exercised is a liability rather than
 * a feature.
 *
 * ```
 *   gzip header ──> deflate blocks ──┬── stored     literal bytes
 *                                    ├── fixed      the built-in code
 *                                    └── dynamic    a code the block carries
 *                                                        │
 *                          output <── back-references ───┘
 * ```
 *
 * **The output bound is enforced as it is produced**, not checked afterwards,
 * so a payload that would exceed it costs the limit rather than the ratio. A
 * few hundred bytes can expand to gigabytes, and a client that allocated first
 * and complained second would be a way to exhaust it with one message.
 */

import { ValidationError } from '@yuigram/core'

/** The two bytes every gzip member begins with. */
const MAGIC = [0x1f, 0x8b] as const

/** The only compression method gzip defines. */
const DEFLATE = 8

/** Header flags, in the order RFC 1952 gives them. */
const FTEXT = 1
const FHCRC = 2
const FEXTRA = 4
const FNAME = 8
const FCOMMENT = 16

/** How many bits of extra length each length code carries, from the standard's table. */
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
] as const

/** The base length each length code stands for. */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
] as const

/** How many bits of extra distance each distance code carries. */
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
] as const

/** The base distance each distance code stands for. */
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12_289, 16_385, 24_577,
] as const

/** The order the code-length code's own lengths arrive in. */
const LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15] as const

/**
 * A canonical Huffman code, as a table that can be walked bit by bit.
 *
 * Held as counts per length and symbols in order, which is the whole of what a
 * canonical code is: the standard says the lengths determine the codes, so the
 * codes themselves are never built.
 */
interface Huffman {
  readonly counts: Uint16Array
  readonly symbols: Uint16Array
}

/** Build a canonical code from the length assigned to each symbol. */
function huffman(lengths: Uint8Array): Huffman {
  const counts = new Uint16Array(16)
  for (const length of lengths) counts[length] = (counts[length] as number) + 1
  counts[0] = 0

  const offsets = new Uint16Array(16)
  for (let length = 1; length < 16; length += 1) {
    offsets[length] = (offsets[length - 1] as number) + (counts[length - 1] as number)
  }

  const symbols = new Uint16Array(lengths.length)
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol] as number
    if (length === 0) continue

    symbols[offsets[length] as number] = symbol
    offsets[length] = (offsets[length] as number) + 1
  }

  return { counts, symbols }
}

/** The fixed literal/length code every DEFLATE implementation carries. */
const FIXED_LITERALS = huffman(
  Uint8Array.from({ length: 288 }, (_, symbol) => {
    if (symbol < 144) return 8
    if (symbol < 256) return 9
    if (symbol < 280) return 7

    return 8
  }),
)

/** The fixed distance code: thirty-two symbols of five bits each. */
const FIXED_DISTANCES = huffman(new Uint8Array(32).fill(5))

/** Reading a compressed stream one bit at a time, least significant first. */
class BitReader {
  readonly #data: Uint8Array
  #at = 0
  #bits = 0
  #held = 0

  constructor(data: Uint8Array) {
    this.#data = data
  }

  /** The next `count` bits, as a number. */
  take(count: number): number {
    while (this.#bits < count) {
      if (this.#at >= this.#data.length) {
        throw new ValidationError('a compressed payload ended in the middle of a code')
      }
      this.#held |= (this.#data[this.#at] as number) << this.#bits
      this.#at += 1
      this.#bits += 8
    }

    const value = this.#held & ((1 << count) - 1)
    this.#held >>>= count
    this.#bits -= count

    return value
  }

  /** Discard what is left of the current byte. */
  align(): void {
    this.#held = 0
    this.#bits = 0
  }

  /** Where the next whole byte starts, once aligned. */
  get position(): number {
    return this.#at
  }

  /** Move to a byte position, discarding any held bits. */
  seek(at: number): void {
    this.align()
    this.#at = at
  }

  /** Read one symbol through a canonical code. */
  symbol(code: Huffman): number {
    let index = 0
    let first = 0
    let count = 0
    let value = 0

    for (let length = 1; length < 16; length += 1) {
      value |= this.take(1)
      count = code.counts[length] as number

      if (value - first < count) return code.symbols[index + (value - first)] as number

      index += count
      first = (first + count) << 1
      value <<= 1
    }

    throw new ValidationError('a compressed payload names a code that is not in its table')
  }
}

/** Somewhere to put the output that refuses to grow past the ceiling. */
class Output {
  readonly #limit: number
  #data: Uint8Array
  #length = 0

  constructor(limit: number) {
    this.#limit = limit
    // Start small. The whole point of the ceiling is that the compressed size
    // says nothing about the decompressed one, so neither can the first guess.
    this.#data = new Uint8Array(Math.min(limit, 1024))
  }

  get length(): number {
    return this.#length
  }

  byteAt(index: number): number {
    return this.#data[index] as number
  }

  push(byte: number): void {
    if (this.#length === this.#limit) {
      throw new ValidationError(`a compressed payload expands past ${this.#limit} bytes`)
    }
    if (this.#length === this.#data.length) this.#grow()

    this.#data[this.#length] = byte
    this.#length += 1
  }

  take(): Uint8Array {
    return this.#data.subarray(0, this.#length)
  }

  #grow(): void {
    const grown = new Uint8Array(Math.min(this.#limit, this.#data.length * 2))
    grown.set(this.#data)
    this.#data = grown
  }
}

/** Read the code lengths a dynamic block carries, and build its two codes. */
function dynamicCodes(bits: BitReader): { literals: Huffman; distances: Huffman } {
  const literalCount = bits.take(5) + 257
  const distanceCount = bits.take(5) + 1
  const orderCount = bits.take(4) + 4

  const orderLengths = new Uint8Array(19)
  for (let index = 0; index < orderCount; index += 1) {
    orderLengths[LENGTH_ORDER[index] as number] = bits.take(3)
  }

  const orderCode = huffman(orderLengths)
  const lengths = new Uint8Array(literalCount + distanceCount)
  let at = 0

  while (at < lengths.length) {
    const symbol = bits.symbol(orderCode)

    if (symbol < 16) {
      lengths[at] = symbol
      at += 1
      continue
    }

    let repeat: number
    let value = 0

    if (symbol === 16) {
      if (at === 0) {
        throw new ValidationError('a compressed payload repeats a code length before there is one')
      }
      value = lengths[at - 1] as number
      repeat = bits.take(2) + 3
    } else if (symbol === 17) {
      repeat = bits.take(3) + 3
    } else {
      repeat = bits.take(7) + 11
    }

    if (at + repeat > lengths.length) {
      throw new ValidationError('a compressed payload declares more code lengths than it has codes')
    }

    lengths.fill(value, at, at + repeat)
    at += repeat
  }

  return {
    literals: huffman(lengths.subarray(0, literalCount)),
    distances: huffman(lengths.subarray(literalCount)),
  }
}

/** Decode one block's worth of literals and back-references. */
function block(bits: BitReader, out: Output, literals: Huffman, distances: Huffman): void {
  for (;;) {
    const symbol = bits.symbol(literals)

    if (symbol < 256) {
      out.push(symbol)
      continue
    }
    if (symbol === 256) return

    const lengthCode = symbol - 257
    if (lengthCode >= LENGTH_BASE.length) {
      throw new ValidationError('a compressed payload names a length code that does not exist')
    }

    const length =
      (LENGTH_BASE[lengthCode] as number) + bits.take(LENGTH_EXTRA[lengthCode] as number)

    const distanceCode = bits.symbol(distances)
    if (distanceCode >= DISTANCE_BASE.length) {
      throw new ValidationError('a compressed payload names a distance code that does not exist')
    }

    const distance =
      (DISTANCE_BASE[distanceCode] as number) + bits.take(DISTANCE_EXTRA[distanceCode] as number)

    if (distance > out.length) {
      throw new ValidationError('a compressed payload refers back past the start of its output')
    }

    // Copied one byte at a time on purpose: a reference may overlap what it is
    // producing — that is how a run of one byte is encoded — so the source
    // advances as the destination does.
    const from = out.length - distance
    for (let index = 0; index < length; index += 1) out.push(out.byteAt(from + index))
  }
}

/**
 * Copy an uncompressed block through.
 *
 * Byte-aligned, and carrying its own length twice with the second copy
 * inverted — so a length damaged on the way is caught here rather than used to
 * read past the end of the payload.
 */
function storedBlock(bits: BitReader, out: Output, data: Uint8Array): void {
  bits.align()
  const at = bits.position

  if (at + 4 > data.length) {
    throw new ValidationError('a compressed payload ended inside a stored block header')
  }

  const length = (data[at] as number) | ((data[at + 1] as number) << 8)
  const inverted = (data[at + 2] as number) | ((data[at + 3] as number) << 8)

  if ((length ^ 0xffff) !== inverted) {
    throw new ValidationError('a stored block disagrees with its own length')
  }
  if (at + 4 + length > data.length) {
    throw new ValidationError('a stored block claims more bytes than the payload has')
  }

  for (let index = 0; index < length; index += 1) out.push(data[at + 4 + index] as number)
  bits.seek(at + 4 + length)
}

/** Decompress a raw DEFLATE stream, stopping at the ceiling. */
export function inflateRaw(data: Uint8Array, limit: number, from = 0): Uint8Array {
  const bits = new BitReader(data)
  bits.seek(from)
  const out = new Output(limit)

  for (;;) {
    const last = bits.take(1)
    const kind = bits.take(2)

    if (kind === 0) storedBlock(bits, out, data)
    else if (kind === 1) block(bits, out, FIXED_LITERALS, FIXED_DISTANCES)
    else if (kind === 2) {
      const { literals, distances } = dynamicCodes(bits)
      block(bits, out, literals, distances)
    } else {
      throw new ValidationError('a compressed payload uses a block type that does not exist')
    }

    if (last === 1) return out.take()
  }
}

/**
 * Decompress a gzip member, stopping at the ceiling.
 *
 * The trailing CRC and length are read and checked. They are the only thing
 * standing between a payload that was damaged in a way the codes happen to
 * accept and a message built out of the damage.
 */
export function gunzipPortable(data: Uint8Array, limit: number): Uint8Array {
  if (data.length < 18) {
    throw new ValidationError('a compressed payload is too short to be a gzip member')
  }
  if (data[0] !== MAGIC[0] || data[1] !== MAGIC[1]) {
    throw new ValidationError('a compressed payload does not begin with the gzip marker')
  }
  if (data[2] !== DEFLATE) {
    throw new ValidationError(`a compressed payload uses compression method ${data[2]}`)
  }

  const flags = data[3] as number
  if ((flags & ~(FTEXT | FHCRC | FEXTRA | FNAME | FCOMMENT)) !== 0) {
    throw new ValidationError(`a compressed payload sets gzip flags this build does not know`)
  }

  // Six bytes of header, then the optional fields the flags announce.
  let at = 10

  if ((flags & FEXTRA) !== 0) {
    if (at + 2 > data.length) {
      throw new ValidationError('a compressed payload ended inside its extra field')
    }
    at += 2 + ((data[at] as number) | ((data[at + 1] as number) << 8))
  }

  for (const flag of [FNAME, FCOMMENT]) {
    if ((flags & flag) === 0) continue

    while (at < data.length && data[at] !== 0) at += 1
    at += 1
  }

  if ((flags & FHCRC) !== 0) at += 2

  if (at >= data.length) {
    throw new ValidationError('a compressed payload has a header but no body')
  }

  const out = inflateRaw(data, limit, at)

  // The trailer is the last eight bytes of the member, whatever the body cost.
  const trailer = data.length - 8
  const view = new DataView(data.buffer, data.byteOffset + trailer, 8)
  const declaredLength = view.getUint32(4, true)

  if (declaredLength !== out.length % 0x1_0000_0000) {
    throw new ValidationError(
      `a compressed payload declared ${declaredLength} bytes and produced ${out.length}`,
    )
  }

  const declaredCrc = view.getUint32(0, true)
  const actualCrc = crc32(out)

  if (declaredCrc !== actualCrc) {
    throw new ValidationError('a compressed payload failed its own checksum')
  }

  return out
}

/**
 * The CRC gzip carries, built from the polynomial rather than listed.
 *
 * A different polynomial and a different bit order from the one the transport
 * uses, so the two cannot be shared: this is the reflected CRC-32 of the gzip
 * specification, and the transport's is the same algorithm run the other way
 * round on different data.
 */
const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1
  }
  CRC_TABLE[index] = value >>> 0
}

function crc32(data: Uint8Array): number {
  let crc = 0xffff_ffff

  for (let index = 0; index < data.length; index += 1) {
    crc = (CRC_TABLE[(crc ^ (data[index] as number)) & 0xff] as number) ^ (crc >>> 8)
  }

  return (crc ^ 0xffff_ffff) >>> 0
}
