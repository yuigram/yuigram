// SPDX-License-Identifier: MPL-2.0

/**
 * Adversarial input.
 *
 * The inputs here are what a hostile server can send, or what a caller can pass
 * by mistake — not what a well-behaved encoder produces. Each case names the
 * one path it constrains, because a test that would pass whether or not the
 * guard exists constrains nothing.
 */

import { describe, expect, it } from 'vitest'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { ENTRIES as API_ENTRIES } from '../src/generated/api/tables/index.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { ENTRIES as CORE_ENTRIES } from '../src/generated/core/tables/index.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { ENTRIES as MTPROTO_ENTRIES } from '../src/generated/mtproto/tables/index.js'
import { readObject, TlReadError, TlReader } from '../src/tl/reader.js'
import { createRegistry, TlScope } from '../src/tl/registry.js'
import type { TlEntry } from '../src/tl/schema.js'
import { TlWriteError, TlWriter } from '../src/tl/writer.js'

const SESSION = new TlScope('api', [CORE, API])

function scope(...entries: TlEntry[]): TlScope {
  return new TlScope('test', [createRegistry(entries)])
}

function encode(value: unknown, on: TlScope = SESSION): Uint8Array {
  const writer = new TlWriter(on)
  writer.object(value)
  return writer.finish()
}

/** A placeholder for every unconditional field, so only the flag varies. */
function requiredFieldsOf(entry: TlEntry): Record<string, unknown> {
  const filled: Record<string, unknown> = {}

  for (const field of entry.f) {
    if (field.b === 1 || field.c !== undefined) continue
    filled[field.n] = placeholderFor(field.t)
  }

  return filled
}

function placeholderFor(spec: TlEntry['f'][number]['t']): unknown {
  if (spec === 'long') return 0n
  if (spec === 'int') return 0
  if (spec === 'string') return ''

  return new Uint8Array(0)
}

describe('a conditional Bool carrying false', () => {
  /**
   * The flag bit is the value only for a conditional `true`. For every other
   * type the bit says whether the field follows, and a `Bool` that follows can
   * itself be false — so `false` there is a value to send, not an absence.
   * Treating it as "not supplied" would put "unspecified" on the wire where the
   * caller asked for "off", with nothing to show the difference.
   */
  const carriers = API_ENTRIES.filter((entry) =>
    entry.f.some((field) => field.t === 'bool' && field.c !== undefined),
  )

  it('is a shape the schema really uses', () => {
    // Twenty-two API constructors carry one, across privacy, payment, business
    // and community settings — every one of which is a field whose whole
    // purpose is to say "off" explicitly.
    expect(carriers.length).toBe(22)
  })

  it('is written, not dropped', () => {
    const entry = carriers[0]
    if (entry === undefined) throw new Error('the schema carries no conditional Bool')

    const field = entry.f.find((f) => f.t === 'bool' && f.c !== undefined)?.n ?? ''
    const required = requiredFieldsOf(entry)

    const off = readObject(encode({ _: entry.n, ...required, [field]: false }), SESSION)
    const on = readObject(encode({ _: entry.n, ...required, [field]: true }), SESSION)

    expect(off[field]).toBe(false)
    expect(on[field]).toBe(true)
  })

  it('sets the flag bit for false as well as for true', () => {
    const entry: TlEntry = {
      id: 0x0100_0001,
      n: 'sample',
      f: [
        { n: 'flags', b: 1 },
        { n: 'toggle', t: 'bool', c: 'flags', i: 0 },
      ],
    }
    const table = scope(entry)

    for (const value of [true, false]) {
      const reader = new TlReader(encode({ _: 'sample', toggle: value }, table), table)
      reader.uint()

      expect(reader.uint()).toBe(0b1)
    }
  })

  it('still treats false on a conditional `true` as absent', () => {
    // Here the bit genuinely is the value, so `false` must clear it and write
    // nothing — the opposite of the case above.
    const entry: TlEntry = {
      id: 0x0100_0002,
      n: 'marked',
      f: [
        { n: 'flags', b: 1 },
        { n: 'marker', t: 'true', c: 'flags', i: 0 },
      ],
    }
    const table = scope(entry)
    const reader = new TlReader(encode({ _: 'marked', marker: false }, table), table)
    reader.uint()

    expect(reader.uint()).toBe(0)
  })
})

describe('numbers outside their wire range', () => {
  /**
   * `setInt32` and `BigInt.asIntN` keep the low bits of a wider value rather
   * than refusing it. Both writers therefore range-check before encoding, so an
   * overflowing caller is told rather than sending a number it never asked for.
   */
  it('refuses an int beyond 32 bits instead of truncating', () => {
    expect(() => new TlWriter(SESSION).int(2 ** 40)).toThrow(/out of range/)
    expect(() => new TlWriter(SESSION).int(-(2 ** 40))).toThrow(/out of range/)
  })

  it('refuses a long beyond 64 bits instead of wrapping', () => {
    expect(() => new TlWriter(SESSION).long(2n ** 70n)).toThrow(/out of range/)
    expect(() => new TlWriter(SESSION).long(-(2n ** 70n))).toThrow(/out of range/)
  })

  it('still accepts both extremes of each range', () => {
    for (const value of [-0x8000_0000, 0x7fff_ffff]) {
      const writer = new TlWriter(SESSION)
      writer.int(value)
      expect(new TlReader(writer.finish(), SESSION).int()).toBe(value)
    }

    for (const value of [-(2n ** 63n), 2n ** 63n - 1n]) {
      const writer = new TlWriter(SESSION)
      writer.long(value)
      expect(new TlReader(writer.finish(), SESSION).long()).toBe(value)
    }
  })
})

describe('a payload that decodes but does not account for itself', () => {
  /**
   * `readObject` reads one value from a buffer that holds exactly that.
   * Trailing bytes mean the sender and this table disagree about the shape, and
   * returning the prefix would hide the disagreement.
   */
  it('refuses trailing bytes', () => {
    const complete = encode({ _: 'boolTrue' })
    const extended = new Uint8Array([...complete, 0xde, 0xad, 0xbe, 0xef])

    expect(readObject(complete, SESSION)).toEqual({ _: 'boolTrue' })
    expect(() => readObject(extended, SESSION)).toThrow(/4 bytes remain/)
  })

  it('leaves a streaming reader free to continue', () => {
    // The bound is on `readObject`, which promises a complete buffer. A reader
    // walking a container has more to do and must not be stopped by it.
    const two = new Uint8Array([...encode({ _: 'boolTrue' }), ...encode({ _: 'boolFalse' })])
    const reader = new TlReader(two, SESSION)

    expect(reader.object()).toEqual({ _: 'boolTrue' })
    expect(reader.object()).toEqual({ _: 'boolFalse' })
    expect(reader.remaining).toBe(0)
  })
})

describe('hostile lengths and counts', () => {
  it('refuses a vector claiming more elements than the buffer can hold', () => {
    const hostile = new Uint8Array(12)
    const view = new DataView(hostile.buffer)
    view.setUint32(0, 0x1cb5c415, true)
    view.setUint32(4, 0x7fff_ffff, true)

    expect(() => new TlReader(hostile, SESSION).value({ v: 'int' })).toThrow(/cannot fit in/)
  })

  it('refuses a vector of zero-byte elements from claiming the heap', () => {
    // Without the bound, a count of two billion over an empty element type
    // would allocate two billion objects from eight bytes of input.
    const empty: TlEntry = { id: 0x0100_0003, n: 'empty', f: [] }
    const holder: TlEntry = {
      id: 0x0100_0004,
      n: 'holder',
      f: [{ n: 'items', t: { v: { p: 'empty' }, bare: 1 } }],
    }
    const table = scope(empty, holder)

    const hostile = new Uint8Array(12)
    const view = new DataView(hostile.buffer)
    view.setUint32(0, holder.id, true)
    view.setUint32(4, 0x7fff_ffff, true)

    expect(() => new TlReader(hostile, table).object()).toThrow(/cannot fit in/)
  })

  it('refuses a string announcing more bytes than remain', () => {
    expect(() => new TlReader(Uint8Array.of(200, 1, 2), SESSION).bytes()).toThrow(
      /200 bytes, 2 remain/,
    )
  })

  it('refuses a truncated constructor rather than filling in zeros', () => {
    const entry: TlEntry = {
      id: 0x0100_0005,
      n: 'three',
      f: [
        { n: 'a', t: 'int' },
        { n: 'b', t: 'int' },
        { n: 'c', t: 'int' },
      ],
    }
    const table = scope(entry)
    const full = encode({ _: 'three', a: 1, b: 2, c: 3 }, table)

    for (let cut = 1; cut < full.length; cut += 1) {
      expect(() => new TlReader(full.subarray(0, cut), table).object()).toThrow(TlReadError)
    }
  })

  it('bounds nesting rather than following it to a stack overflow', () => {
    const recursive: TlEntry = { id: 0x0100_0006, n: 'deep', f: [{ n: 'inner', t: 'obj' }] }
    const table = scope(recursive)
    const payload = new Uint8Array(4 * 500)
    for (let offset = 0; offset < payload.length; offset += 4) {
      new DataView(payload.buffer).setUint32(offset, recursive.id, true)
    }

    expect(() => new TlReader(payload, table).object()).toThrow(/nesting deeper than/)
  })
})

describe('flags the sender got wrong', () => {
  const entry: TlEntry = {
    id: 0x0100_0007,
    n: 'flagged',
    f: [
      { n: 'flags', b: 1 },
      { n: 'value', t: 'int', c: 'flags', i: 0 },
    ],
  }
  const table = scope(entry)

  it('ignores a bit no field claims, so a newer layer stays readable', () => {
    const payload = new Uint8Array(8)
    const view = new DataView(payload.buffer)
    view.setUint32(0, entry.id, true)
    view.setUint32(4, 0b1000, true)

    expect(new TlReader(payload, table).object()).toEqual({ _: 'flagged' })
  })

  it('refuses a set bit whose field the buffer does not carry', () => {
    const payload = new Uint8Array(8)
    const view = new DataView(payload.buffer)
    view.setUint32(0, entry.id, true)
    view.setUint32(4, 0b1, true)

    expect(() => new TlReader(payload, table).object()).toThrow(TlReadError)
  })

  it('ignores whatever the caller put in the bitfield itself', () => {
    // The payload is the authority on what is being sent; a caller-supplied
    // flag word that disagreed would produce a message the server discards.
    const reader = new TlReader(encode({ _: 'flagged', flags: 0xffff }, table), table)
    reader.uint()

    expect(reader.uint()).toBe(0)
  })
})

describe('values the writer must not accept', () => {
  it('refuses a required field that is missing', () => {
    const entry: TlEntry = { id: 0x0100_0008, n: 'needs', f: [{ n: 'a', t: 'int' }] }
    const table = scope(entry)

    expect(() => encode({ _: 'needs' }, table)).toThrow(TlWriteError)
  })

  it('refuses a constructor from another table', () => {
    const handshake = new TlScope('handshake', [CORE, MTPROTO])

    expect(() => encode({ _: 'messages.sendMessage' }, handshake)).toThrow(
      /not in the handshake table/,
    )
  })

  it('refuses a string longer than the length field can express', () => {
    expect(() => new TlWriter(SESSION).bytes(new Uint8Array(0x100_0000))).toThrow(
      /exceeds the TL length field/,
    )
  })
})

describe('the constructor discriminator cannot be overwritten', () => {
  /**
   * A decoded value carries its constructor under `_`, and the writer dispatches
   * on it. A field named `_` would replace it with the field's value, leaving a
   * value that cannot say what it is and cannot be re-encoded. The schema is
   * where that is prevented, so the check here is that no table can express it.
   */
  it('is absent from every generated table', () => {
    const offenders = [...CORE_ENTRIES, ...MTPROTO_ENTRIES, ...API_ENTRIES].flatMap((entry) =>
      entry.f
        .filter((field) => field.n === '_' || field.n === '__proto__')
        .map((f) => `${entry.n}.${f.n}`),
    )

    expect(offenders).toEqual([])
  })

  it('would corrupt the value if a table could express it', () => {
    // Built by hand, because the generator cannot produce it. This is what the
    // parser's rejection is protecting against, demonstrated rather than
    // asserted.
    const table = scope({ id: 0x0100_0009, n: 'shadow', f: [{ n: '_', t: 'int' }] })
    const payload = new Uint8Array(8)
    const view = new DataView(payload.buffer)
    view.setUint32(0, 0x0100_0009, true)
    view.setInt32(4, 7, true)

    const decoded = new TlReader(payload, table).object()

    expect(decoded._).toBe(7)
    expect(decoded._).not.toBe('shadow')
    // And a value in that state cannot be written back.
    expect(() => new TlWriter(table).object(decoded)).toThrow(TlWriteError)
  })

  it('decodes normally for every name that only shadows a prototype member', () => {
    for (const name of ['constructor', 'prototype', 'toString']) {
      const table = scope({ id: 0x0100_000a, n: 'plain', f: [{ n: name, t: 'int' }] })
      const payload = new Uint8Array(8)
      const view = new DataView(payload.buffer)
      view.setUint32(0, 0x0100_000a, true)
      view.setInt32(4, 7, true)

      const decoded = new TlReader(payload, table).object()

      expect(decoded._).toBe('plain')
      expect(decoded[name]).toBe(7)
    }
  })
})
