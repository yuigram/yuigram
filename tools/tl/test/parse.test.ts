// SPDX-License-Identifier: MIT

/**
 * The TL parser.
 *
 * Every construct the published schemas use is exercised against a fixture
 * grammar first, so a failure names the construct rather than a line number in
 * a 2,300-line document. Then the real schemas are parsed, where the constructor
 * identifiers act as a checksum over the parser's own reading: 2,291 of 2,303
 * API combinators verify by recomputation, and a misplaced field or misread type
 * would break that agreement.
 *
 * The rejection cases matter as much as the acceptances. A parser that skips
 * what it does not understand produces a codec that is silently incomplete, so
 * each malformed input asserts its specific error rather than that something
 * threw.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalizable, canonicalSignature, computeId, crc32String } from '../src/crc.js'
import { allCombinators } from '../src/ir.js'
import { parseSchema, TlParseError } from '../src/parse.js'

const SCHEMA_DIR = join(import.meta.dirname, '..', '..', '..', 'schemas', 'tl')

function parse(text: string) {
  return parseSchema(text, { document: 'fixture.tl', table: 'api' })
}

describe('primitives and plain fields', () => {
  it('reads a constructor with no parameters', () => {
    const schema = parse('boolTrue#997275b5 = Bool;')
    const [combinator] = schema.constructors

    expect(schema.constructors).toHaveLength(1)
    expect(combinator?.name).toBe('boolTrue')
    expect(combinator?.id).toBe(0x997275b5)
    expect(combinator?.idOrigin).toBe('verified')
    expect(combinator?.params).toEqual([])
  })

  it('reads each primitive type', () => {
    const schema = parse(
      'sample a:int b:long c:double d:string e:bytes f:int128 g:int256 h:Bool = Sample;',
    )
    const kinds = schema.constructors[0]?.params.map((param) =>
      param.kind === 'field' ? param.type : null,
    )

    expect(kinds).toEqual([
      { kind: 'primitive', name: 'int' },
      { kind: 'primitive', name: 'long' },
      { kind: 'primitive', name: 'double' },
      { kind: 'primitive', name: 'string' },
      { kind: 'primitive', name: 'bytes' },
      { kind: 'primitive', name: 'int128' },
      { kind: 'primitive', name: 'int256' },
      { kind: 'primitive', name: 'bool' },
    ])
  })

  it('computes an identifier when the schema declares none', () => {
    const [combinator] = parse('sample a:int = Sample;').constructors

    expect(combinator?.idOrigin).toBe('computed')
    expect(combinator?.id).toBe(crc32String('sample a:int = Sample'))
  })
})

describe('bitfields and conditional fields', () => {
  it('records a bitfield and the fields that test it', () => {
    const [combinator] = parse(
      'sample flags:# a:flags.0?int b:flags.31?string c:int = Sample;',
    ).constructors

    expect(combinator?.params[0]).toEqual({ kind: 'bitfield', name: 'flags' })
    expect(combinator?.params[1]).toMatchObject({ conditional: { field: 'flags', bit: 0 } })
    expect(combinator?.params[2]).toMatchObject({ conditional: { field: 'flags', bit: 31 } })
    expect(combinator?.params[3]).toMatchObject({ conditional: null })
  })

  it('supports a second bitfield, which five API constructors declare', () => {
    const [combinator] = parse(
      'sample flags:# flags2:# a:flags.1?int b:flags2.2?int = Sample;',
    ).constructors

    expect(combinator?.params[2]).toMatchObject({ conditional: { field: 'flags', bit: 1 } })
    expect(combinator?.params[3]).toMatchObject({ conditional: { field: 'flags2', bit: 2 } })
  })

  it('reads a conditional `true`, which occupies no bytes', () => {
    const [combinator] = parse('sample flags:# a:flags.3?true = Sample;').constructors
    const field = combinator?.params[1]

    expect(field).toMatchObject({
      type: { kind: 'primitive', name: 'true' },
      conditional: { field: 'flags', bit: 3 },
    })
  })

  it('rejects a conditional on a bitfield that was never declared', () => {
    expect(() => parse('sample a:flags.0?int = Sample;')).toThrow(/not a declared bitfield/)
  })

  it('rejects a bit index outside 0..31', () => {
    expect(() => parse('sample flags:# a:flags.32?int = Sample;')).toThrow(/outside 0\.\.31/)
  })
})

describe('vectors', () => {
  it('distinguishes a boxed vector from a bare one', () => {
    const [combinator] = parse('sample a:Vector<int> b:vector<int> = Sample;').constructors
    const params = combinator?.params.map((param) => (param.kind === 'field' ? param.type : null))

    expect(params?.[0]).toEqual({
      kind: 'vector',
      item: { kind: 'primitive', name: 'int' },
      bare: false,
    })
    expect(params?.[1]).toEqual({
      kind: 'vector',
      item: { kind: 'primitive', name: 'int' },
      bare: true,
    })
  })

  it('reads a nested vector', () => {
    const [combinator] = parse('sample a:Vector<Vector<long>> = Sample;').constructors
    const field = combinator?.params[0]

    expect(field).toMatchObject({
      type: { kind: 'vector', item: { kind: 'vector', item: { kind: 'primitive', name: 'long' } } },
    })
  })

  it('reads a vector of a bare reference, as the message container declares', () => {
    const [combinator] = parse('sample messages:vector<%Message> = Sample;').constructors

    expect(combinator?.params[0]).toMatchObject({
      type: { kind: 'vector', bare: true, item: { kind: 'named', name: 'Message', bare: true } },
    })
  })
})

describe('bare and boxed references', () => {
  it('marks `%Type` bare', () => {
    const [combinator] = parse('sample a:%Message = Sample;').constructors

    expect(combinator?.params[0]).toMatchObject({
      type: { kind: 'named', name: 'Message', bare: true },
    })
  })

  it('marks a capitalised reference boxed', () => {
    const [combinator] = parse('sample a:Message = Sample;').constructors

    expect(combinator?.params[0]).toMatchObject({
      type: { kind: 'named', name: 'Message', bare: false },
    })
  })

  it('marks a lowercase reference bare, because it names a constructor', () => {
    const [combinator] = parse('sample a:vector<future_salt> = Sample;').constructors

    expect(combinator?.params[0]).toMatchObject({
      type: { item: { kind: 'named', name: 'future_salt', bare: true } },
    })
  })
})

describe('generic methods', () => {
  it('records the parameter and the wrapped call', () => {
    const schema = parse(
      '---functions---\ninvokeWithLayer#da9b0d0d {X:Type} layer:int query:!X = X;',
    )
    const [method] = schema.methods

    expect(method?.generics).toEqual(['X'])
    expect(method?.params[1]).toMatchObject({ type: { kind: 'generic', name: 'X' } })
    expect(method?.result).toEqual({ kind: 'generic', name: 'X' })
    // The canonicalization does not cover generics, so the schema's id stands.
    expect(method?.idOrigin).toBe('declared')
  })

  it('rejects a reference to an undeclared generic', () => {
    expect(() => parse('sample query:!X = Sample;')).toThrow(/undeclared generic/)
  })
})

describe('builtin declarations', () => {
  it('reads an opaque body', () => {
    const [combinator] = parse('int ? = Int;').constructors

    expect(combinator?.idOrigin).toBe('builtin')
    expect(combinator?.params[0]).toMatchObject({ type: { kind: 'opaque' } })
  })

  it('reads a fixed repetition', () => {
    const [combinator] = parse('int128 4*[ int ] = Int128;').constructors

    expect(combinator?.params[0]).toMatchObject({
      type: { kind: 'repeat', count: 4, item: { kind: 'primitive', name: 'int' } },
    })
  })

  it('reads the polymorphic vector', () => {
    const [combinator] = parse('vector {t:Type} # [ t ] = Vector t;').constructors

    expect(combinator?.generics).toEqual(['t'])
    expect(combinator?.params[0]).toMatchObject({ type: { kind: 'primitive', name: 'nat' } })
    expect(combinator?.params[1]).toMatchObject({ type: { kind: 'repeat', count: null } })
  })
})

describe('sections and comments', () => {
  it('splits constructors from methods', () => {
    const schema = parse('a = A;\n---functions---\nb = B;')

    expect(schema.constructors.map((c) => c.name)).toEqual(['a'])
    expect(schema.methods.map((c) => c.name)).toEqual(['b'])
  })

  it('returns to constructors on an explicit marker', () => {
    const schema = parse('---functions---\nb = B;\n---types---\na = A;')

    expect(schema.constructors.map((c) => c.name)).toEqual(['a'])
    expect(schema.methods.map((c) => c.name)).toEqual(['b'])
  })

  it('skips comments and blank lines', () => {
    const schema = parse('// a comment\n\nsample = Sample; // trailing\n')

    expect(schema.constructors).toHaveLength(1)
  })

  it('rejects an unrecognised marker rather than ignoring it', () => {
    expect(() => parse('---something---')).toThrow(/unrecognised section marker/)
  })

  it('reads a namespaced name', () => {
    const [combinator] = parse('messages.sample = messages.Sample;').constructors

    expect(combinator).toMatchObject({
      name: 'messages.sample',
      namespace: 'messages',
      shortName: 'sample',
    })
  })
})

describe('malformed input', () => {
  const cases: ReadonlyArray<[string, string, RegExp]> = [
    ['no terminator', 'sample = Sample', /does not end with ";"/],
    ['no result', 'sample a:int;', /no "= ResultType" part/],
    ['parameter without a colon', 'sample oops = Sample;', /has no ":"/],
    ['invalid name', 'sam ple!1 = Sample;', /has no ":"/],
    ['empty type', 'sample a: = Sample;', /empty type expression/],
    ['unparsable type', 'sample a:<> = Sample;', /not a valid type expression/],
  ]

  for (const [label, text, pattern] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => parse(text)).toThrow(pattern)
    })
  }

  it('rejects a declared id that disagrees with the computed one', () => {
    // The wrong id here is the parser's own checksum failing: either the
    // canonicalization or the reading of the line is wrong.
    expect(() => parse('boolTrue#deadbeef = Bool;')).toThrow(/does not match the computed/)
  })

  it('rejects a combinator defined twice', () => {
    // Identical signatures share both a name and an identifier. The name check
    // reports first; the identifier check remains behind it as a second guard,
    // for a schema where two different names collided under CRC32.
    expect(() => parse('a x:int = A;\na x:int = A;')).toThrow(/'a' is already defined/)
  })

  it('names the document and the line', () => {
    try {
      parse('good = A;\n\nbad = ;')
      expect.unreachable('the parse should have failed')
    } catch (error) {
      expect(error).toBeInstanceOf(TlParseError)
      expect((error as TlParseError).line).toBe(3)
      expect((error as TlParseError).message).toMatch(/^fixture\.tl:3: /)
    }
  })
})

describe('constructor identifiers', () => {
  it('drops zero-byte conditional fields from the signature', () => {
    const definition =
      'inputMediaUploadedPhoto#1e287d04 flags:# spoiler:flags.2?true file:InputFile ' +
      'stickers:flags.0?Vector<InputDocument> ttl_seconds:flags.1?int = InputMedia'

    expect(canonicalSignature(definition)).not.toContain('spoiler')
    expect(computeId(definition)).toBe(0x1e287d04)
  })

  it('writes `bytes` as `string` in a field type but not inside a vector', () => {
    expect(canonicalSignature('a b:bytes = A')).toBe('a b:string = A')
    expect(canonicalSignature('a b:Vector<bytes> = A')).toBe('a b:Vector bytes = A')
  })

  it('recognises the constructs the canonicalization does not cover', () => {
    expect(canonicalizable('invokeWithLayer#da9b0d0d {X:Type} layer:int query:!X = X;')).toBe(false)
    expect(
      canonicalizable('msg_container#73f1f8dc messages:vector<%Message> = MessageContainer;'),
    ).toBe(false)
    expect(canonicalizable('int ? = Int;')).toBe(false)
    expect(canonicalizable('int128 4*[ int ] = Int128;')).toBe(false)
    expect(canonicalizable('boolTrue#997275b5 = Bool;')).toBe(true)
  })
})

describe('the committed schemas', () => {
  const layer = (
    JSON.parse(readFileSync(join(SCHEMA_DIR, 'layer.json'), 'utf8')) as { layer: number }
  ).layer

  const api = parseSchema(readFileSync(join(SCHEMA_DIR, `api.${layer}.tl`), 'utf8'), {
    document: `api.${layer}.tl`,
    table: 'api',
    layer,
  })
  const mtproto = parseSchema(readFileSync(join(SCHEMA_DIR, 'mtproto.tl'), 'utf8'), {
    document: 'mtproto.tl',
    table: 'mtproto',
  })

  it('parses the whole API schema', () => {
    expect(api.constructors.length + api.methods.length).toBe(2471)
    expect(api.layer).toBe(layer)
  })

  it('parses the whole service schema', () => {
    expect(mtproto.constructors.length + mtproto.methods.length).toBeGreaterThan(50)
    expect(mtproto.layer).toBeNull()
  })

  it('verifies almost every API identifier by recomputation', () => {
    const origins = allCombinators(api).reduce<Record<string, number>>((counts, combinator) => {
      counts[combinator.idOrigin] = (counts[combinator.idOrigin] ?? 0) + 1
      return counts
    }, {})

    // The twelve exceptions are the generic methods, whose signatures the
    // canonicalization does not describe.
    expect(origins['verified']).toBe(2459)
    expect(origins['declared']).toBe(12)
    expect(origins['computed']).toBeUndefined()
  })

  it('gives every combinator in a table a distinct identifier', () => {
    for (const schema of [api, mtproto]) {
      const ids = allCombinators(schema)
        .filter((combinator) => combinator.idOrigin !== 'builtin')
        .map((combinator) => combinator.id)

      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('declares the bitfield of every conditional field before it', () => {
    for (const schema of [api, mtproto]) {
      for (const combinator of allCombinators(schema)) {
        const seen = new Set<string>()
        for (const param of combinator.params) {
          if (param.kind === 'bitfield') seen.add(param.name)
          else if (param.conditional !== null) expect(seen).toContain(param.conditional.field)
        }
      }
    }
  })
})

describe('duplicates the committed schema must not carry', () => {
  /**
   * The registry rejects a duplicate name when it is constructed, which is at
   * import time in a running client. The schema and its intermediate
   * representation are committed, so a duplicate that reached them would be
   * reviewed and merged before anything noticed. It fails at the fetch that
   * introduced it instead.
   */
  it('rejects two combinators sharing a name', () => {
    expect(() => parse('a x:int = A;\na y:long = A;')).toThrow(/'a' is already defined/)
  })

  it('rejects a name reused across the type and function sections', () => {
    expect(() => parse('a x:int = A;\n---functions---\na y:long = B;')).toThrow(
      /'a' is already defined/,
    )
  })

  it('rejects the field names a decoded value cannot carry', () => {
    // A decoded value is a plain object keyed by field name, with the
    // constructor under `_`. `__proto__` sets the prototype instead of becoming
    // a property, and `_` overwrites the discriminator; both lose data with no
    // error anywhere.
    expect(() => parse('a __proto__:int = A;')).toThrow(
      /'__proto__' cannot be used as a field name/,
    )
    expect(() => parse('a _:int = A;')).toThrow(/'_' cannot be used as a field name/)
  })

  it('rejects a reserved name in a conditional field and a bitfield too', () => {
    expect(() => parse('a flags:# _:flags.0?int = A;')).toThrow(/cannot be used as a field name/)
    expect(() => parse('a _:# b:_.0?int = A;')).toThrow(/cannot be used as a field name/)
  })

  it('leaves every neighbouring name valid', () => {
    // Only the two colliding names are reserved. Names that merely shadow a
    // prototype member become ordinary own properties and are fine.
    for (const name of ['_a', 'a_', '__', 'constructor', 'prototype', 'toString', 'valueOf']) {
      expect(() => parse(`a ${name}:int = A;`)).not.toThrow()
    }
  })
})
