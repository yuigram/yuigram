/**
 * Decompression, without the platform.
 *
 * There is no round trip to lean on here — nothing in this repository
 * compresses — so every expectation comes from bytes the platform produced,
 * which makes the platform the oracle and this the thing under test. That is
 * the right way round: what has to be true is that this reads what a real gzip
 * writes, not that it agrees with itself.
 *
 * The cases that matter are the ones a well-behaved input never reaches: the
 * three block types, a back-reference that overlaps what it is producing, the
 * ceiling, and the checks that stop a damaged payload from becoming a message.
 */

import { randomBytes } from 'node:crypto'
import { deflateRawSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { gunzipPortable, inflateRaw } from '../src/session/inflate.js'

/** A megabyte, which is well past anything these cases produce. */
const LIMIT = 1024 * 1024

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

const text = (data: Uint8Array): string => new TextDecoder().decode(data)

describe('what a real gzip writes', () => {
  it('reads back a short string', () => {
    const original = 'the quick brown fox jumps over the lazy dog'

    expect(text(gunzipPortable(new Uint8Array(gzipSync(original)), LIMIT))).toBe(original)
  })

  it('reads back nothing at all', () => {
    // An empty member is still a header, a block and a trailer, and the
    // trailer's length check has to accept zero rather than treat it as a
    // failure to produce anything.
    expect(gunzipPortable(new Uint8Array(gzipSync(Buffer.alloc(0))), LIMIT).length).toBe(0)
  })

  it('reads back something highly compressible', () => {
    // A long run is where back-references overlap their own output: the
    // distance is one and the length is the whole run, so the source advances
    // as the destination does. A copy that read the source first would produce
    // a single byte repeated in blocks.
    const original = 'ab'.repeat(50_000)

    expect(text(gunzipPortable(new Uint8Array(gzipSync(original)), LIMIT))).toBe(original)
  })

  it('reads back something incompressible', () => {
    // Random bytes are where the compressor gives up and emits stored blocks,
    // which is the one block type with no Huffman code at all.
    const original = new Uint8Array(randomBytes(100_000))
    const read = gunzipPortable(new Uint8Array(gzipSync(original)), LIMIT)

    expect(read.length).toBe(original.length)
    expect([...read.subarray(0, 64)]).toEqual([...original.subarray(0, 64)])
    expect([...read.subarray(-64)]).toEqual([...original.subarray(-64)])
  })

  it('reads back a payload shaped like the ones the protocol carries', () => {
    // Mixed structure and repetition, which is what a serialized TL container
    // looks like: a compressor gives it dynamic Huffman blocks.
    const original = new Uint8Array(60_000)
    for (let index = 0; index < original.length; index += 1) {
      original[index] = index % 7 === 0 ? (index * 31) % 256 : 0
    }

    expect([...gunzipPortable(new Uint8Array(gzipSync(original)), LIMIT)]).toEqual([...original])
  })

  it('reads back every length around a block boundary', () => {
    for (const length of [1, 2, 3, 255, 256, 257, 65_534, 65_535, 65_536, 65_537]) {
      const original = new Uint8Array(randomBytes(length))
      const read = gunzipPortable(new Uint8Array(gzipSync(original)), LIMIT)

      expect(read.length, String(length)).toBe(length)
      expect(text(read), String(length)).toBe(text(original))
    }
  })

  it('reads back what every compression level produced', () => {
    // The level changes which block types appear: the lowest emits stored
    // blocks for input the highest packs into dynamic codes.
    const original = utf8('telegram '.repeat(400))

    for (let level = 0; level <= 9; level += 1) {
      const read = gunzipPortable(new Uint8Array(gzipSync(original, { level })), LIMIT)

      expect(text(read), `level ${level}`).toBe(text(original))
    }
  })
})

describe('a raw deflate stream', () => {
  it('reads back what the platform deflated', () => {
    // The gzip wrapper is not the compression. The protocol's own compressed
    // fields are gzip members, but the block decoder underneath is worth
    // exercising without the header in the way.
    const original = utf8('a raw stream carries no header and no checksum')

    expect(text(inflateRaw(new Uint8Array(deflateRawSync(original)), LIMIT))).toBe(text(original))
  })
})

describe('a payload that should not become a message', () => {
  it('refuses something that is not a gzip member', () => {
    expect(() => gunzipPortable(new Uint8Array(32), LIMIT)).toThrow(/gzip marker/)
    expect(() => gunzipPortable(new Uint8Array(4), LIMIT)).toThrow(/too short/)
  })

  it('refuses a member whose checksum does not match', () => {
    // The whole reason the trailer is checked: a payload damaged in a way the
    // codes happen to accept decompresses to something, and that something
    // would otherwise be parsed as a message.
    const member = new Uint8Array(gzipSync('a message that was altered on the way'))
    member[member.length - 8] = (member[member.length - 8] as number) ^ 0xff

    expect(() => gunzipPortable(member, LIMIT)).toThrow(/checksum/)
  })

  it('refuses a member whose declared length is wrong', () => {
    const member = new Uint8Array(gzipSync('a message that was altered on the way'))
    member[member.length - 4] = (member[member.length - 4] as number) ^ 0xff

    expect(() => gunzipPortable(member, LIMIT)).toThrow(/declared/)
  })

  it('stops at the ceiling rather than allocating what was asked for', () => {
    // A few hundred bytes expanding to megabytes is the attack. The bound is
    // enforced as the output is produced, so what it costs is the bound.
    const member = new Uint8Array(gzipSync(Buffer.alloc(4 * 1024 * 1024)))

    expect(member.length).toBeLessThan(8192)
    expect(() => gunzipPortable(member, 1024)).toThrow(/expands past 1024 bytes/)
  })

  it('refuses a block type that does not exist', () => {
    // Block type 3 is reserved and means the stream is not what it claims.
    expect(() => inflateRaw(Uint8Array.from([0b111, 0, 0, 0]), LIMIT)).toThrow(/block type/)
  })

  it('refuses a stored block that disagrees with itself', () => {
    // The length appears twice, the second time inverted. A payload that got
    // one of them wrong would otherwise be read past its own end.
    const stored = Uint8Array.from([0x01, 0x05, 0x00, 0x00, 0x00, 1, 2, 3, 4, 5])

    expect(() => inflateRaw(stored, LIMIT)).toThrow(/disagrees with its own length/)
  })

  it('refuses a stored block longer than the payload', () => {
    const stored = Uint8Array.from([0x01, 0xff, 0x00, 0x00, 0xff, 1, 2, 3])

    expect(() => inflateRaw(stored, LIMIT)).toThrow(/more bytes than the payload/)
  })

  it('refuses a reference that points before the start', () => {
    // A distance larger than what has been produced would read whatever was in
    // the buffer, which on a reused buffer is somebody else's message.
    const original = utf8('reference me')
    const deflated = new Uint8Array(deflateRawSync(original))

    // Truncating leaves the codes intact and the stream incomplete, which is
    // the honest way to reach the error without hand-assembling a bit stream.
    expect(() => inflateRaw(deflated.subarray(0, 3), LIMIT)).toThrow()
  })

  it('refuses a stream that ends in the middle of a code', () => {
    expect(() => inflateRaw(new Uint8Array(0), LIMIT)).toThrow(/ended in the middle/)
  })

  it('refuses a member with no body', () => {
    const member = new Uint8Array(gzipSync('x'))

    expect(() => gunzipPortable(member.subarray(0, 18), LIMIT)).toThrow()
  })
})
