// SPDX-License-Identifier: MIT

/**
 * The TL binary codec.
 *
 * Round-tripping proves the reader and writer agree with each other, which a
 * consistently wrong pair also does. So every primitive is pinned to a fixed
 * byte sequence written out here from the published encoding rules, and the
 * round-trip cases sit on top of that rather than in place of it.
 *
 * The string encoding gets its own attention: the 253/254 length boundary and
 * the four-byte padding are the two places a codec is most often subtly wrong,
 * and the error is invisible until a server rejects a message.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { TlReadError, TlReader, VECTOR_ID } from '../src/tl/reader.js'
import { createRegistry, TlScope } from '../src/tl/registry.js'
import type { TlEntry } from '../src/tl/schema.js'
import { TlWriteError, TlWriter } from '../src/tl/writer.js'

/** A table holding just what a case needs. */
function scope(...entries: TlEntry[]): TlScope {
  return new TlScope('test', [createRegistry(entries)])
}

const EMPTY = scope()

function write(build: (writer: TlWriter) => void, on: TlScope = EMPTY): Uint8Array {
  const writer = new TlWriter(on)
  build(writer)
  return writer.finish()
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('primitive encodings', () => {
  it('writes int little-endian', () => {
    expect(hex(write((w) => w.int(1)))).toBe('01000000')
    expect(hex(write((w) => w.int(-1)))).toBe('ffffffff')
    expect(hex(write((w) => w.int(0x0a0b0c0d)))).toBe('0d0c0b0a')
  })

  it('writes long little-endian', () => {
    expect(hex(write((w) => w.long(1n)))).toBe('0100000000000000')
    expect(hex(write((w) => w.long(-1n)))).toBe('ffffffffffffffff')
    expect(hex(write((w) => w.long(0x0102030405060708n)))).toBe('0807060504030201')
  })

  it('writes double as IEEE-754 little-endian', () => {
    // 1.0 is 0x3ff0000000000000 big-endian.
    expect(hex(write((w) => w.double(1)))).toBe('000000000000f03f')
  })

  it('writes a boxed Bool as its constructor identifier', () => {
    // boolTrue is 0x997275b5 and boolFalse 0xbc799737, both little-endian.
    expect(hex(write((w) => w.bool(true)))).toBe('b5757299')
    expect(hex(write((w) => w.bool(false)))).toBe('379779bc')
  })

  it('reads back every primitive it writes', () => {
    const payload = write((w) => {
      w.int(-42)
      w.long(-42n)
      w.double(0.5)
      w.bool(true)
    })

    const reader = new TlReader(payload, EMPTY)
    expect(reader.int()).toBe(-42)
    expect(reader.long()).toBe(-42n)
    expect(reader.double()).toBe(0.5)
    expect(reader.bool()).toBe(true)
    expect(reader.remaining).toBe(0)
  })
})

describe('string and bytes encoding', () => {
  it('pads a short string to a four-byte boundary', () => {
    // One length byte plus one payload byte needs two bytes of padding.
    expect(hex(write((w) => w.bytes(bytes(0xaa))))).toBe('01aa0000')
    expect(hex(write((w) => w.bytes(bytes(0xaa, 0xbb))))).toBe('01aabb00'.replace('01', '02'))
    expect(hex(write((w) => w.bytes(bytes(0xaa, 0xbb, 0xcc))))).toBe('03aabbcc')
    expect(write((w) => w.bytes(bytes(0xaa, 0xbb, 0xcc, 0xdd))).length).toBe(8)
  })

  it('writes an empty string as a length byte and three pad bytes', () => {
    expect(hex(write((w) => w.bytes(new Uint8Array(0))))).toBe('00000000')
  })

  it('switches to the long form above 253 bytes', () => {
    const short = write((w) => w.bytes(new Uint8Array(253).fill(1)))
    const long = write((w) => w.bytes(new Uint8Array(254).fill(1)))

    // 1 + 253 = 254, padded to 256.
    expect(short.length).toBe(256)
    expect(short[0]).toBe(253)

    // 4 + 254 = 258, padded to 260, and the marker announces the long form.
    expect(long.length).toBe(260)
    expect(long[0]).toBe(0xfe)
    expect([long[1], long[2], long[3]]).toEqual([254, 0, 0])
  })

  it('round-trips across the boundary', () => {
    for (const length of [0, 1, 2, 3, 4, 252, 253, 254, 255, 1000]) {
      const value = Uint8Array.from({ length }, (_, index) => index & 0xff)
      const encoded = write((w) => w.bytes(value))

      expect(encoded.length % 4).toBe(0)
      expect([...new TlReader(encoded, EMPTY).bytes()]).toEqual([...value])
    }
  })

  it('round-trips UTF-8 text, including beyond the basic plane', () => {
    for (const text of ['', 'hello', 'привет', '日本語', '🙂 emoji']) {
      const encoded = write((w) => w.string(text))
      expect(new TlReader(encoded, EMPTY).string()).toBe(text)
    }
  })
})

describe('vectors', () => {
  const spec = { v: 'int' } as const

  it('writes a boxed vector with its constructor identifier and count', () => {
    const encoded = write((w) => w.value(spec, [1, 2], 'test'))

    expect(hex(encoded.subarray(0, 4))).toBe('15c4b51c')
    expect(hex(encoded.subarray(4, 8))).toBe('02000000')
    expect(encoded.length).toBe(16)
  })

  it('omits the identifier for a bare vector', () => {
    const encoded = write((w) => w.value({ v: 'int', bare: 1 }, [1, 2], 'test'))

    expect(encoded.length).toBe(12)
    expect(hex(encoded.subarray(0, 4))).toBe('02000000')
  })

  it('round-trips both forms', () => {
    for (const form of [{ v: 'long' } as const, { v: 'long', bare: 1 } as const]) {
      const encoded = write((w) => w.value(form, [1n, 2n, 3n], 'test'))
      expect(new TlReader(encoded, EMPTY).value(form)).toEqual([1n, 2n, 3n])
    }
  })

  it('writes a fixed-length repetition without a count', () => {
    const form = { v: 'int', bare: 1, len: 4 } as const
    const encoded = write((w) => w.value(form, [1, 2, 3, 4], 'test'))

    expect(encoded.length).toBe(16)
    expect(new TlReader(encoded, EMPTY).value(form)).toEqual([1, 2, 3, 4])
  })

  it('refuses a repetition of the wrong length', () => {
    expect(() => write((w) => w.value({ v: 'int', bare: 1, len: 4 }, [1, 2], 'test'))).toThrow(
      /exactly 4 items/,
    )
  })
})

describe('bitfields and conditional fields', () => {
  const entry: TlEntry = {
    id: 0x1000_0001,
    n: 'sample',
    f: [
      { n: 'flags', b: 1 },
      { n: 'always', t: 'int' },
      { n: 'maybe', t: 'string', c: 'flags', i: 0 },
      { n: 'marker', t: 'true', c: 'flags', i: 1 },
      { n: 'other', t: 'long', c: 'flags', i: 2 },
    ],
  }
  const table = scope(entry)

  it('derives the flag word from the payload rather than trusting the caller', () => {
    // The caller's own `flags` is deliberately wrong; the writer must ignore it.
    const encoded = write(
      (w) => w.object({ _: 'sample', flags: 0xffff, always: 7, maybe: 'x' }),
      table,
    )
    const reader = new TlReader(encoded, table)

    expect(reader.uint()).toBe(entry.id)
    expect(reader.uint()).toBe(0b001)
  })

  it('omits an absent conditional field entirely', () => {
    const withField = write((w) => w.object({ _: 'sample', always: 1, maybe: 'ab' }), table)
    const without = write((w) => w.object({ _: 'sample', always: 1 }), table)

    expect(withField.length).toBeGreaterThan(without.length)
    expect(without.length).toBe(4 + 4 + 4)
  })

  it('spends no bytes on a conditional `true`', () => {
    const set = write((w) => w.object({ _: 'sample', always: 1, marker: true }), table)
    const clear = write((w) => w.object({ _: 'sample', always: 1 }), table)

    expect(set.length).toBe(clear.length)

    const reader = new TlReader(set, table)
    reader.uint()
    expect(reader.uint()).toBe(0b010)
  })

  it('round-trips every combination of the optional fields', () => {
    const cases = [
      { _: 'sample', always: 1 },
      { _: 'sample', always: 2, maybe: 'text' },
      { _: 'sample', always: 3, marker: true },
      { _: 'sample', always: 4, other: 9n },
      { _: 'sample', always: 5, maybe: 'x', marker: true, other: 1n },
    ]

    for (const value of cases) {
      const decoded = new TlReader(
        write((w) => w.object(value), table),
        table,
      ).object()
      expect(decoded).toEqual(value)
    }
  })

  it('treats `false` on a conditional `true` as absent', () => {
    const encoded = write((w) => w.object({ _: 'sample', always: 1, marker: false }), table)
    const reader = new TlReader(encoded, table)
    reader.uint()

    expect(reader.uint()).toBe(0)
  })
})

describe('bare values', () => {
  const message: TlEntry = { id: 0x5bb8e511, n: 'message', f: [{ n: 'id', t: 'long' }] }
  const container: TlEntry = {
    id: 0x73f1f8dc,
    n: 'msg_container',
    f: [{ n: 'messages', t: { v: { p: 'message' }, bare: 1 } }],
  }
  const table = scope(message, container)

  it('writes no identifier for a bare element', () => {
    const encoded = write(
      (w) => w.object({ _: 'msg_container', messages: [{ _: 'message', id: 1n }] }),
      table,
    )

    // Container id, count, then the eight bytes of the bare message.
    expect(encoded.length).toBe(4 + 4 + 8)
  })

  it('round-trips a bare vector of bare values', () => {
    const value = {
      _: 'msg_container',
      messages: [
        { _: 'message', id: 1n },
        { _: 'message', id: 2n },
      ],
    }

    expect(
      new TlReader(
        write((w) => w.object(value), table),
        table,
      ).object(),
    ).toEqual(value)
  })

  it('refuses a bare type the table does not carry', () => {
    expect(() => new TlReader(bytes(1, 0, 0, 0), EMPTY).bare('nope')).toThrow(
      /not in the test table/,
    )
  })
})

describe('malformed input', () => {
  it('refuses to read past the end of the buffer', () => {
    expect(() => new TlReader(bytes(1, 2), EMPTY).int()).toThrow(/needs 4 bytes, 2 remain/)
    expect(() => new TlReader(new Uint8Array(0), EMPTY).long()).toThrow(TlReadError)
  })

  it('refuses a string whose length runs past the buffer', () => {
    // Announces 200 bytes and supplies two.
    expect(() => new TlReader(bytes(200, 1, 2), EMPTY).bytes()).toThrow(/200 bytes, 2 remain/)
  })

  it('refuses an invalid string length marker', () => {
    expect(() => new TlReader(bytes(0xff, 0, 0, 0), EMPTY).bytes()).toThrow(/invalid string length/)
  })

  it('refuses a vector whose count cannot fit in what remains', () => {
    // A hostile count must be rejected before anything is allocated for it.
    const hostile = write((w) => {
      w.uint(VECTOR_ID)
      w.uint(0x7fff_ffff)
    })

    expect(() => new TlReader(hostile, EMPTY).value({ v: 'int' })).toThrow(/cannot fit in/)
  })

  it('refuses an identifier the scope does not carry', () => {
    expect(() => new TlReader(bytes(0xef, 0xbe, 0xad, 0xde), EMPTY).object()).toThrow(
      /0xdeadbeef is not in the test table/,
    )
  })

  it('refuses a bare vector where a boxed value belongs', () => {
    const encoded = write((w) => w.uint(VECTOR_ID))

    expect(() => new TlReader(encoded, EMPTY).object()).toThrow(/bare vector cannot appear/)
  })

  it('refuses a boxed vector missing its identifier', () => {
    expect(() => new TlReader(bytes(1, 0, 0, 0), EMPTY).value({ v: 'int' })).toThrow(
      /expected a boxed vector/,
    )
  })

  it('refuses a Bool that is neither constructor', () => {
    expect(() => new TlReader(bytes(1, 0, 0, 0), EMPTY).bool()).toThrow(/expected a Bool/)
  })

  it('bounds nesting rather than following it forever', () => {
    // A constructor holding one of itself, fed a stream that never ends.
    const recursive: TlEntry = { id: 0x1234_5678, n: 'deep', f: [{ n: 'inner', t: 'obj' }] }
    const table = scope(recursive)
    const payload = new Uint8Array(4 * 200)
    for (let offset = 0; offset < payload.length; offset += 4) {
      new DataView(payload.buffer).setUint32(offset, recursive.id, true)
    }

    expect(() => new TlReader(payload, table).object()).toThrow(/nesting deeper than/)
  })
})

describe('values the writer refuses', () => {
  const table = scope({ id: 1, n: 'sample', f: [{ n: 'a', t: 'int' }] })

  it('refuses a value with no constructor', () => {
    expect(() => write((w) => w.object({ a: 1 }), table)).toThrow(/must carry its constructor/)
  })

  it('refuses a constructor the table does not carry', () => {
    expect(() => write((w) => w.object({ _: 'nope' }), table)).toThrow(/not in the test table/)
  })

  it('refuses a field of the wrong type, naming the field', () => {
    expect(() => write((w) => w.object({ _: 'sample', a: 'text' }), table)).toThrow(
      /sample\.a must be a number/,
    )
  })

  it('refuses a non-integer int and an out-of-range uint', () => {
    expect(() => write((w) => w.int(1.5))).toThrow(/must be an integer/)
    expect(() => write((w) => w.uint(-1))).toThrow(/out of range/)
    expect(() => write((w) => w.uint(0x1_0000_0000))).toThrow(/out of range/)
  })

  it('refuses a fixed-width value of the wrong width', () => {
    expect(() => write((w) => w.value('int128', new Uint8Array(8), 'x'))).toThrow(
      /expected 16 bytes/,
    )
  })

  it('names the type of a rejected value without repeating the value', () => {
    let message = ''
    try {
      write((w) => w.value('string', 12345, 'secret.field'))
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toBe('secret.field must be a string, received number')
    expect(message).not.toContain('12345')
  })

  it('reports write failures as framework errors', () => {
    expect(() => write((w) => w.uint(-1))).toThrow(TlWriteError)
    expect(new TlWriteError('x')).toBeInstanceOf(Error)
    expect(new TlReadError('x')).not.toBeInstanceOf(ValidationError)
  })
})

describe('the registry', () => {
  it('refuses a table with a duplicate identifier', () => {
    expect(() =>
      createRegistry([
        { id: 1, n: 'a', f: [] },
        { id: 1, n: 'b', f: [] },
      ]),
    ).toThrow(/duplicate TL identifier/)
  })

  it('refuses a table with a duplicate name', () => {
    expect(() =>
      createRegistry([
        { id: 1, n: 'a', f: [] },
        { id: 2, n: 'a', f: [] },
      ]),
    ).toThrow(/duplicate TL name/)
  })

  it('narrows an identifier it carries', () => {
    const registry = createRegistry<number & { readonly __table: 'test' }>([
      { id: 7, n: 'a', f: [] },
    ])

    expect(registry.has(7)).toBe(true)
    expect(registry.has(8)).toBe(false)
    expect(registry.size).toBe(1)
  })
})
