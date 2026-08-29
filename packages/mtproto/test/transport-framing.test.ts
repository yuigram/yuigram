/**
 * Transport framing.
 *
 * Expected bytes are written out from the published envelope layouts rather
 * than produced by the encoder, so an encoder that agrees with its own decoder
 * about the wrong layout still fails here.
 *
 * The fragmentation cases matter most. A decoder is exercised one byte at a
 * time, because that is the split TCP is free to deliver and the one a
 * whole-frame test never produces.
 */

import { describe, expect, it } from 'vitest'
import { crc32 } from '../src/transport/crc32.js'
import {
  AbridgedFraming,
  type Frame,
  FrameBuffer,
  type Framing,
  FullFraming,
  IntermediateFraming,
  PaddedIntermediateFraming,
  TransportError,
} from '../src/transport/framing.js'

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

/** A payload of `length` bytes with a recognisable pattern. */
function payload(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 7 + 1) & 0xff)
}

/** Feed a framed stream one byte at a time, collecting whatever emerges. */
function decodeByteByByte(framing: Framing, stream: Uint8Array): Frame[] {
  const buffer = new FrameBuffer(8)
  const frames: Frame[] = []

  for (const byte of stream) {
    buffer.push(Uint8Array.of(byte))

    let frame = framing.decode(buffer)
    while (frame !== undefined) {
      frames.push(frame)
      frame = framing.decode(buffer)
    }
  }

  return frames
}

describe('abridged', () => {
  const framing = new AbridgedFraming()

  it('announces itself with a single byte', () => {
    expect(hex(framing.tag())).toBe('ef')
  })

  it('writes the length as four-byte words', () => {
    // 8 bytes is 2 words, so the header is the single byte 0x02.
    expect(hex(framing.encode(bytes(1, 2, 3, 4, 5, 6, 7, 8)))).toBe('020102030405060708')
  })

  it('escapes at 127 words, not at 127 bytes', () => {
    // 126 words fits the short form; 127 must use the escape, and the length
    // that follows is little-endian over three bytes.
    const short = framing.encode(payload(126 * 4))
    const long = framing.encode(payload(127 * 4))

    expect(short[0]).toBe(126)
    expect(short.length).toBe(1 + 126 * 4)

    expect(long[0]).toBe(0x7f)
    expect([long[1], long[2], long[3]]).toEqual([127, 0, 0])
    expect(long.length).toBe(4 + 127 * 4)
  })

  it('writes a three-byte length little-endian', () => {
    const framed = framing.encode(payload(0x01_0002 * 4))

    expect([framed[1], framed[2], framed[3]]).toEqual([0x02, 0x00, 0x01])
  })

  it('refuses a payload that is not word-aligned', () => {
    expect(() => framing.encode(bytes(1, 2, 3))).toThrow(/multiple of 4 bytes/)
  })

  it('round-trips across the escape boundary, one byte at a time', () => {
    for (const words of [0, 1, 125, 126, 127, 128, 300]) {
      const value = payload(words * 4)
      const frames = decodeByteByByte(new AbridgedFraming(), framing.encode(value))

      expect(frames).toHaveLength(1)
      expect(frames[0]?.kind).toBe('payload')
      if (frames[0]?.kind === 'payload') expect(hex(frames[0].bytes)).toBe(hex(value))
    }
  })
})

describe('intermediate', () => {
  const framing = new IntermediateFraming()

  it('announces itself with four 0xee bytes', () => {
    expect(hex(framing.tag())).toBe('eeeeeeee')
  })

  it('writes the payload length little-endian, excluding the header', () => {
    expect(hex(framing.encode(bytes(1, 2, 3, 4)))).toBe('0400000001020304')
    expect(hex(framing.encode(new Uint8Array(0)))).toBe('00000000')
  })

  it('round-trips a payload that is not word-aligned', () => {
    // Unlike abridged, the length is in bytes, so alignment is not required.
    const value = payload(7)
    const frames = decodeByteByByte(new IntermediateFraming(), framing.encode(value))

    expect(frames[0]).toEqual({ kind: 'payload', bytes: value })
  })

  it('reassembles several frames from one arbitrary split', () => {
    const first = payload(20)
    const second = payload(64)
    const stream = new Uint8Array([...framing.encode(first), ...framing.encode(second)])

    const frames = decodeByteByByte(new IntermediateFraming(), stream)

    expect(frames).toHaveLength(2)
    expect(frames[0]).toEqual({ kind: 'payload', bytes: first })
    expect(frames[1]).toEqual({ kind: 'payload', bytes: second })
  })

  it('leaves the buffer untouched while a frame is incomplete', () => {
    const framed = framing.encode(payload(40))
    const buffer = new FrameBuffer()

    buffer.push(framed.subarray(0, 30))
    expect(new IntermediateFraming().decode(buffer)).toBeUndefined()
    expect(buffer.available).toBe(30)

    buffer.push(framed.subarray(30))
    expect(new IntermediateFraming().decode(buffer)?.kind).toBe('payload')
  })
})

describe('padded intermediate', () => {
  const fixed = (fill: number) => (length: number) => new Uint8Array(length).fill(fill)

  it('announces itself with four 0xdd bytes', () => {
    expect(hex(new PaddedIntermediateFraming(fixed(0)).tag())).toBe('dddddddd')
  })

  it('counts the padding in the length field', () => {
    // A first random byte of 5 selects five padding bytes, so a 4-byte payload
    // is announced as 9.
    const framing = new PaddedIntermediateFraming(fixed(5))
    const framed = framing.encode(bytes(1, 2, 3, 4))

    expect(new DataView(framed.buffer).getUint32(0, true)).toBe(9)
    expect(framed.length).toBe(4 + 9)
    expect(hex(framed.subarray(4, 8))).toBe('01020304')
  })

  it('keeps the padding within 0 to 15 bytes for every draw', () => {
    for (let value = 0; value < 256; value += 1) {
      const framed = new PaddedIntermediateFraming(fixed(value)).encode(bytes(1, 2, 3, 4))
      const size = framed.length - 8

      expect(size).toBeGreaterThanOrEqual(0)
      expect(size).toBeLessThanOrEqual(15)
    }
  })

  it('delivers the padding to the caller, because the envelope cannot trim it', () => {
    // Nothing in the frame says where the payload ends; the message layer
    // trims using its own header. Decoding therefore returns payload+padding.
    const framing = new PaddedIntermediateFraming(fixed(7))
    const framed = framing.encode(payload(16))
    const frames = decodeByteByByte(new PaddedIntermediateFraming(fixed(0)), framed)

    expect(frames).toHaveLength(1)
    if (frames[0]?.kind === 'payload') {
      expect(frames[0].bytes.length).toBe(16 + 7)
      expect(hex(frames[0].bytes.subarray(0, 16))).toBe(hex(payload(16)))
    }
  })
})

describe('full', () => {
  it('sends no tag', () => {
    expect(new FullFraming().tag()).toHaveLength(0)
  })

  it('builds the frame the specification describes', () => {
    const value = bytes(1, 2, 3, 4)
    const framed = new FullFraming().encode(value)
    const view = new DataView(framed.buffer)

    // Length covers length + seqno + payload + crc.
    expect(view.getUint32(0, true)).toBe(16)
    expect(framed.length).toBe(16)
    // First frame is sequence zero.
    expect(view.getUint32(4, true)).toBe(0)
    expect(hex(framed.subarray(8, 12))).toBe('01020304')
    // The CRC covers everything before itself, computed here independently.
    expect(view.getUint32(12, true)).toBe(crc32(framed.subarray(0, 12)))
  })

  it('numbers frames from zero, upward', () => {
    const framing = new FullFraming()

    for (let index = 0; index < 4; index += 1) {
      const framed = framing.encode(payload(8))
      expect(new DataView(framed.buffer).getUint32(4, true)).toBe(index)
    }
  })

  it('round-trips a sequence one byte at a time', () => {
    const sender = new FullFraming()
    const payloads = [payload(4), payload(40), payload(400)]
    const stream = new Uint8Array(payloads.flatMap((value) => [...sender.encode(value)]))

    const frames = decodeByteByByte(new FullFraming(), stream)

    expect(frames).toHaveLength(3)
    for (let index = 0; index < payloads.length; index += 1) {
      expect(frames[index]).toEqual({ kind: 'payload', bytes: payloads[index] })
    }
  })

  it('refuses a frame whose CRC does not match', () => {
    const framed = new FullFraming().encode(payload(16))
    framed[10] = (framed[10] ?? 0) ^ 0xff

    const buffer = new FrameBuffer()
    buffer.push(framed)

    expect(() => new FullFraming().decode(buffer)).toThrow(/CRC32/)
  })

  it('refuses a frame that arrives out of order', () => {
    const sender = new FullFraming()
    sender.encode(payload(8))
    const second = sender.encode(payload(8))

    const buffer = new FrameBuffer()
    buffer.push(second)

    // A fresh receiver expects sequence zero and is handed one.
    expect(() => new FullFraming().decode(buffer)).toThrow(/expected full frame 0, received 1/)
  })

  it('refuses a length below the minimum frame size', () => {
    const buffer = new FrameBuffer()
    buffer.push(bytes(8, 0, 0, 0, 0, 0, 0, 0))

    expect(() => new FullFraming().decode(buffer)).toThrow(/below the 12-byte minimum/)
  })
})

describe('transport errors', () => {
  /**
   * The server reports a transport failure as a four-byte frame holding the
   * negated code. It arrives in whatever envelope the connection negotiated, so
   * every framing has to recognise it rather than hand four bytes to a layer
   * that would try to decrypt them.
   */
  const cases: ReadonlyArray<[string, Framing]> = [
    ['abridged', new AbridgedFraming()],
    ['intermediate', new IntermediateFraming()],
    ['full', new FullFraming()],
  ]

  for (const [name, framing] of cases) {
    it(`recognises one inside the ${name} envelope`, () => {
      const body = new Uint8Array(4)
      new DataView(body.buffer).setInt32(0, -404, true)

      const frames = decodeByteByByte(
        name === 'abridged'
          ? new AbridgedFraming()
          : name === 'intermediate'
            ? new IntermediateFraming()
            : new FullFraming(),
        framing.encode(body),
      )

      expect(frames[0]).toEqual({ kind: 'error', code: 404 })
    })
  }

  it('reports the documented codes as positive values', () => {
    for (const code of [404, 429, 444]) {
      const body = new Uint8Array(4)
      new DataView(body.buffer).setInt32(0, -code, true)

      const frames = decodeByteByByte(
        new IntermediateFraming(),
        new IntermediateFraming().encode(body),
      )
      expect(frames[0]).toEqual({ kind: 'error', code })
    }
  })

  it('leaves a positive four-byte payload alone', () => {
    // Only a negative value is an error report; four bytes that happen to be
    // positive are still a payload as far as this layer is concerned.
    const body = new Uint8Array(4)
    new DataView(body.buffer).setInt32(0, 404, true)

    const frames = decodeByteByByte(
      new IntermediateFraming(),
      new IntermediateFraming().encode(body),
    )
    expect(frames[0]?.kind).toBe('payload')
  })
})

describe('the frame buffer', () => {
  it('grows past its initial capacity', () => {
    const buffer = new FrameBuffer(4)
    buffer.push(payload(1000))

    expect(buffer.available).toBe(1000)
    expect(buffer.take(1000)).toHaveLength(1000)
  })

  it('reclaims consumed bytes rather than growing forever', () => {
    const buffer = new FrameBuffer(64)

    for (let round = 0; round < 1000; round += 1) {
      buffer.push(payload(32))
      expect(buffer.take(32)).toHaveLength(32)
    }

    expect(buffer.available).toBe(0)
  })

  it('refuses to skip past what it holds', () => {
    const buffer = new FrameBuffer()
    buffer.push(bytes(1, 2))

    expect(() => buffer.skip(3)).toThrow(TransportError)
  })

  it('returns undefined rather than a short read', () => {
    const buffer = new FrameBuffer()
    buffer.push(bytes(1, 2))

    expect(buffer.take(3)).toBeUndefined()
    expect(buffer.available).toBe(2)
  })
})
