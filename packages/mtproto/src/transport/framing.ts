/**
 * Transport framing.
 *
 * MTProto payloads travel inside one of four envelopes, chosen when the
 * connection opens and never changed. The envelope carries no meaning of its
 * own — it delimits payloads on a byte stream — so everything here is about
 * getting boundaries exactly right under fragmentation.
 *
 * ```
 * abridged             0xef        [len/4:1]              [payload]
 *                                  [0x7f][len/4:3]        [payload]
 * intermediate         0xeeeeeeee  [len:4]                [payload]
 * padded intermediate  0xdddddddd  [len:4]                [payload][pad:0..15]
 * full                 —           [len:4][seq:4]         [payload][crc32:4]
 * ```
 *
 * Two properties decide whether this layer is correct, and neither is visible
 * in a single-frame test:
 *
 * - **A frame is emitted only when it is complete.** TCP delivers arbitrary
 *   splits, so a decoder that reads a length and then assumes the body arrived
 *   works in testing and corrupts the stream in production.
 * - **The buffer is left untouched when a frame is incomplete.** Consuming a
 *   length prefix and then failing would desynchronise the stream permanently.
 */

import { YuigramError } from '@yuigram/core'
import { crc32 } from './crc32.js'

/** A framing envelope the connection speaks. */
export type FramingName = 'abridged' | 'intermediate' | 'padded-intermediate' | 'full'

/**
 * What a decoder produced.
 *
 * A transport error is framed exactly like a payload, so it is recognised here
 * rather than left for a layer that would try to decrypt it.
 */
export type Frame =
  | { readonly kind: 'payload'; readonly bytes: Uint8Array }
  | { readonly kind: 'error'; readonly code: number }

/** A framing that can be written and read. */
export interface Framing {
  readonly name: FramingName
  /**
   * Bytes that precede every frame on a new connection.
   *
   * Empty for the full framing, which announces itself by having no tag.
   */
  tag(): Uint8Array
  /** Wrap one payload. */
  encode(payload: Uint8Array): Uint8Array
  /**
   * Take the next complete frame.
   *
   * Returns `undefined` when the buffer does not yet hold one, leaving it
   * exactly as it was so the caller can append more bytes and retry.
   */
  decode(buffer: FrameBuffer): Frame | undefined
}

/**
 * A frame the decoder refused.
 *
 * Raised where the bytes themselves are wrong — a length that cannot be right,
 * a failed checksum, an init packet of the wrong size. It says nothing about
 * what the far end meant, only that what arrived is not this framing. A refusal
 * the far end *chose* to send is a different thing and is reported as one.
 */
export class FramingError extends YuigramError {
  override readonly name = 'FramingError'
}

/**
 * An MTProto payload is never four bytes.
 *
 * The smallest encrypted message is 40 bytes and the smallest plaintext one is
 * 20, so a four-byte frame is unambiguously the transport's own error report.
 */
const ERROR_FRAME_SIZE = 4

/** Abridged switches to its long form at this many four-byte words. */
const ABRIDGED_ESCAPE = 0x7f

/** Largest payload the abridged long form can express, in bytes. */
const ABRIDGED_MAX = 0xff_ffff * 4

/**
 * Largest frame any framing will accept.
 *
 * Every framing takes its length from the stream before it has the bytes that
 * length describes, so the value is chosen by whoever is on the other end. A
 * decoder that trusted it would buffer toward four gigabytes on a single
 * corrupted or hostile length field, having emitted nothing and reported
 * nothing. The cap turns that into an immediate error on a connection that is
 * already unusable.
 *
 * Sixteen megabytes is far above anything MTProto sends — the largest single
 * message is a file part of at most one megabyte plus its envelope — and far
 * below what it costs to hold.
 */
const MAX_FRAME_SIZE = 16 * 1024 * 1024

/** Refuse a length the connection could not legitimately be carrying. */
function checkFrameSize(length: number, framing: FramingName): number {
  if (length > MAX_FRAME_SIZE) {
    throw new FramingError(
      `${framing} frame of ${length} bytes exceeds the ${MAX_FRAME_SIZE}-byte maximum`,
    )
  }
  return length
}

/**
 * A growing view over bytes arriving from a stream.
 *
 * Reads are bounded and rewindable, because a decoder that discovers a frame is
 * incomplete must be able to put back everything it consumed.
 */
export class FrameBuffer {
  #bytes: Uint8Array
  #length = 0
  #offset = 0

  constructor(initialCapacity = 4096) {
    this.#bytes = new Uint8Array(initialCapacity)
  }

  /** Bytes available to read. */
  get available(): number {
    return this.#length - this.#offset
  }

  /** Append bytes received from the stream. */
  push(chunk: Uint8Array): void {
    this.#compact()

    if (this.#length + chunk.length > this.#bytes.length) {
      const grown = new Uint8Array(Math.max(this.#bytes.length * 2, this.#length + chunk.length))
      grown.set(this.#bytes.subarray(0, this.#length))
      this.#bytes = grown
    }

    this.#bytes.set(chunk, this.#length)
    this.#length += chunk.length
  }

  /** Read `count` bytes, or `undefined` when they have not all arrived. */
  take(count: number): Uint8Array | undefined {
    if (count < 0) throw new FramingError('negative frame length')
    if (this.available < count) return undefined

    const value = this.#bytes.slice(this.#offset, this.#offset + count)
    this.#offset += count
    return value
  }

  /** Read a little-endian unsigned 32-bit value without consuming it. */
  peekUint32(at = 0): number | undefined {
    if (this.available < at + 4) return undefined

    return new DataView(this.#bytes.buffer, this.#bytes.byteOffset).getUint32(
      this.#offset + at,
      true,
    )
  }

  /** Read one byte without consuming it. */
  peekByte(at = 0): number | undefined {
    if (this.available < at + 1) return undefined

    return this.#bytes[this.#offset + at]
  }

  /** Discard `count` bytes that have already been inspected. */
  skip(count: number): void {
    if (count > this.available) throw new FramingError('cannot skip past the buffered bytes')
    this.#offset += count
  }

  /** Drop the consumed prefix so the buffer does not grow without bound. */
  #compact(): void {
    if (this.#offset === 0) return

    this.#bytes.copyWithin(0, this.#offset, this.#length)
    this.#length -= this.#offset
    this.#offset = 0
  }
}

/**
 * Recognise the transport's own error report.
 *
 * Applied to every framing, because the error is delivered inside whatever
 * envelope the connection negotiated. The code is sent negative and reported
 * as its absolute value, which is how Telegram documents it.
 */
function asFrame(payload: Uint8Array): Frame {
  if (payload.length !== ERROR_FRAME_SIZE) return { kind: 'payload', bytes: payload }

  const value = new DataView(payload.buffer, payload.byteOffset).getInt32(0, true)
  if (value >= 0) return { kind: 'payload', bytes: payload }

  return { kind: 'error', code: -value }
}

/** Reject a payload the framing cannot express. */
function checkAligned(payload: Uint8Array, framing: FramingName): void {
  if (payload.length % 4 !== 0) {
    throw new FramingError(
      `${framing} payloads must be a multiple of 4 bytes, received ${payload.length}`,
    )
  }
}

/**
 * The abridged framing: one byte of overhead for most payloads.
 *
 * Lengths are counted in four-byte words, which is why the payload has to be
 * aligned. The single-byte form covers 126 words; `0x7f` escapes to a
 * three-byte length.
 */
export class AbridgedFraming implements Framing {
  readonly name = 'abridged' as const

  tag(): Uint8Array {
    return Uint8Array.of(0xef)
  }

  encode(payload: Uint8Array): Uint8Array {
    checkAligned(payload, this.name)
    if (payload.length > ABRIDGED_MAX) {
      throw new FramingError(`abridged payload of ${payload.length} bytes exceeds the length field`)
    }

    const words = payload.length / 4

    if (words < ABRIDGED_ESCAPE) {
      const out = new Uint8Array(1 + payload.length)
      out[0] = words
      out.set(payload, 1)
      return out
    }

    const out = new Uint8Array(4 + payload.length)
    out[0] = ABRIDGED_ESCAPE
    out[1] = words & 0xff
    out[2] = (words >>> 8) & 0xff
    out[3] = (words >>> 16) & 0xff
    out.set(payload, 4)
    return out
  }

  decode(buffer: FrameBuffer): Frame | undefined {
    const first = buffer.peekByte()
    if (first === undefined) return undefined

    if (first !== ABRIDGED_ESCAPE) {
      const length = checkFrameSize(first * 4, this.name)
      if (buffer.available < 1 + length) return undefined

      buffer.skip(1)
      return asFrame(buffer.take(length) ?? new Uint8Array(0))
    }

    if (buffer.available < 4) return undefined

    const words =
      (buffer.peekByte(1) ?? 0) |
      ((buffer.peekByte(2) ?? 0) << 8) |
      ((buffer.peekByte(3) ?? 0) << 16)
    const length = checkFrameSize(words * 4, this.name)
    if (buffer.available < 4 + length) return undefined

    buffer.skip(4)
    return asFrame(buffer.take(length) ?? new Uint8Array(0))
  }
}

/** The intermediate framing: a four-byte length and nothing else. */
export class IntermediateFraming implements Framing {
  readonly name: FramingName = 'intermediate'

  tag(): Uint8Array {
    return Uint8Array.of(0xee, 0xee, 0xee, 0xee)
  }

  encode(payload: Uint8Array): Uint8Array {
    const out = new Uint8Array(4 + payload.length)
    new DataView(out.buffer).setUint32(0, payload.length, true)
    out.set(payload, 4)
    return out
  }

  decode(buffer: FrameBuffer): Frame | undefined {
    const length = buffer.peekUint32()
    if (length === undefined) return undefined

    checkFrameSize(length, this.name)
    if (buffer.available < 4 + length) return undefined

    buffer.skip(4)
    return asFrame(buffer.take(length) ?? new Uint8Array(0))
  }
}

/**
 * The intermediate framing with 0 to 15 random trailing bytes.
 *
 * The length covers the padding, and the transport cannot tell where the
 * payload ends — nothing in the envelope says. The padded frame is therefore
 * delivered whole, and the message layer trims it using the length its own
 * header carries. Decoding is inherited unchanged for exactly that reason.
 */
export class PaddedIntermediateFraming extends IntermediateFraming {
  override readonly name: FramingName = 'padded-intermediate'

  readonly #random: (length: number) => Uint8Array

  constructor(random: (length: number) => Uint8Array) {
    super()
    this.#random = random
  }

  override tag(): Uint8Array {
    return Uint8Array.of(0xdd, 0xdd, 0xdd, 0xdd)
  }

  override encode(payload: Uint8Array): Uint8Array {
    const padding = this.#random(16)[0] ?? 0
    const size = padding % 16

    const out = new Uint8Array(4 + payload.length + size)
    new DataView(out.buffer).setUint32(0, payload.length + size, true)
    out.set(payload, 4)
    out.set(this.#random(size), 4 + payload.length)
    return out
  }
}

/**
 * The full framing: a length, a sequence number and a CRC.
 *
 * The only framing that detects corruption on its own, and the only one with
 * per-direction state. Sequence numbers start at zero and count frames, so a
 * gap means a frame was lost rather than merely delayed.
 */
export class FullFraming implements Framing {
  readonly name = 'full' as const

  #sent = 0
  #received = 0

  /** The full framing announces itself by sending no tag at all. */
  tag(): Uint8Array {
    return new Uint8Array(0)
  }

  encode(payload: Uint8Array): Uint8Array {
    const total = 12 + payload.length
    const out = new Uint8Array(total)
    const view = new DataView(out.buffer)

    view.setUint32(0, total, true)
    view.setUint32(4, this.#sent, true)
    out.set(payload, 8)
    view.setUint32(total - 4, crc32(out.subarray(0, total - 4)), true)

    this.#sent += 1
    return out
  }

  decode(buffer: FrameBuffer): Frame | undefined {
    const total = buffer.peekUint32()
    if (total === undefined) return undefined

    if (total < 12)
      throw new FramingError(`full frame length ${total} is below the 12-byte minimum`)

    checkFrameSize(total, this.name)
    if (buffer.available < total) return undefined

    const frame = buffer.take(total)
    if (frame === undefined) return undefined

    const view = new DataView(frame.buffer, frame.byteOffset)
    const expected = view.getUint32(total - 4, true)
    const actual = crc32(frame.subarray(0, total - 4))

    if (expected !== actual) {
      throw new FramingError('full frame failed its CRC32 check')
    }

    const sequence = view.getUint32(4, true)
    if (sequence !== this.#received) {
      throw new FramingError(`expected full frame ${this.#received}, received ${sequence}`)
    }
    this.#received += 1

    return asFrame(frame.slice(8, total - 4))
  }
}
