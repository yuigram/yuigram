// SPDX-License-Identifier: MIT

/**
 * The generator's output contract.
 *
 * Determinism first: the same schema must produce the same bytes on any
 * machine, or a schema diff cannot be told apart from a generator diff and the
 * review described in `docs/codegen.md` §3.1 stops working.
 *
 * Then the properties that keep the three tables apart, checked on the emitted
 * text rather than on the intent behind it.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosscheck } from '../src/crosscheck.js'
import { emitAll } from '../src/emit/index.js'
import { parseSchema } from '../src/parse.js'
import { serializeSchema } from '../src/serialize.js'

const SCHEMA_DIR = join(import.meta.dirname, '..', '..', '..', 'schemas', 'tl')
const layer = (
  JSON.parse(readFileSync(join(SCHEMA_DIR, 'layer.json'), 'utf8')) as { layer: number }
).layer

function load() {
  return {
    api: parseSchema(readFileSync(join(SCHEMA_DIR, `api.${layer}.tl`), 'utf8'), {
      document: `api.${layer}.tl`,
      table: 'api',
      layer,
    }),
    mtproto: parseSchema(readFileSync(join(SCHEMA_DIR, 'mtproto.tl'), 'utf8'), {
      document: 'mtproto.tl',
      table: 'mtproto',
    }),
    layer,
  }
}

describe('determinism', () => {
  it('emits identical bytes from two independent parses', () => {
    const first = emitAll(load())
    const second = emitAll(load())

    expect(first.map((file) => file.path)).toEqual(second.map((file) => file.path))
    for (let index = 0; index < first.length; index += 1) {
      expect(first[index]?.text).toBe(second[index]?.text)
    }
  })

  it('emits files in a stable order', () => {
    const paths = emitAll(load()).map((file) => file.path)

    expect(paths).toEqual(emitAll(load()).map((file) => file.path))
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('serializes the intermediate representation identically twice', () => {
    const { api } = load()

    expect(serializeSchema(api)).toBe(serializeSchema(load().api))
  })

  it('puts nothing machine-specific in the output', () => {
    for (const file of emitAll(load())) {
      expect(file.text).not.toMatch(/[A-Za-z]:\\|\/home\/|\/Users\//)
      expect(file.text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/)
      expect(file.text).not.toMatch(/node_modules/)
    }
  })

  it('matches what is committed', () => {
    // The committed tree is what CI regenerates against, so a difference here
    // means the checked-in output no longer follows from the checked-in schema.
    const generatedRoot = join(SCHEMA_DIR, '..', '..', 'packages', 'mtproto', 'src', 'generated')

    for (const file of emitAll(load())) {
      const committed = readFileSync(join(generatedRoot, file.path), 'utf8')
      expect(committed.replace(/\r\n/g, '\n')).toBe(file.text)
    }
  })
})

describe('the three tables', () => {
  const files = emitAll(load())
  const at = (path: string): string => files.find((file) => file.path === path)?.text ?? ''

  it('emits a directory per table', () => {
    for (const directory of ['core', 'mtproto', 'api']) {
      expect(files.some((file) => file.path.startsWith(`${directory}/`))).toBe(true)
    }
  })

  it('never imports one table from another', () => {
    for (const file of files) {
      const table = file.path.split('/')[0]
      if (table === undefined) continue

      for (const other of ['core', 'mtproto', 'api'].filter((name) => name !== table)) {
        expect(file.text).not.toContain(`/${other}/`)
        expect(file.text).not.toContain(`'./${other}/`)
      }
    }
  })

  it('gives each table its own branded identifier', () => {
    expect(at('core/registry.ts')).toContain("readonly __table: 'core'")
    expect(at('mtproto/registry.ts')).toContain("readonly __table: 'mtproto'")
    expect(at('api/registry.ts')).toContain("readonly __table: 'api'")
  })

  it('puts the language primitives in core, and nowhere else', () => {
    const core = at('core/tables/root.ts')

    for (const name of ['boolTrue', 'boolFalse', 'vector', 'error', 'null']) {
      expect(core).toContain(`n: '${name}'`)
    }
    expect(at('mtproto/tables/root.ts')).not.toContain("n: 'vector'")
  })

  it('records the pinned layer once', () => {
    expect(at('schema-info.ts')).toContain(`export const TL_LAYER = ${layer}`)
    expect(files.filter((file) => file.text.includes('TL_LAYER ='))).toHaveLength(1)
  })
})

describe('declaration splitting', () => {
  const files = emitAll(load())

  it('divides the root namespace, which is too large for one file', () => {
    const parts = files.filter((file) => file.path.startsWith('api/types/root/'))

    expect(parts.length).toBeGreaterThan(1)
    expect(files.some((file) => file.path === 'api/types/root.ts')).toBe(true)
  })

  it('keeps every emitted module under the declaration budget', () => {
    // The source is larger than the declaration it produces, so holding the
    // source under budget holds the declaration under it too.
    for (const file of files) {
      expect(file.text.length).toBeLessThan(300 * 1024)
    }
  })

  it('leaves a small namespace undivided', () => {
    expect(files.some((file) => file.path === 'api/types/storage.ts')).toBe(true)
    expect(files.some((file) => file.path.startsWith('api/types/storage/'))).toBe(false)
  })
})

describe('the first-party JSON oracle', () => {
  it('reports agreement when the reference matches', () => {
    const schema = parseSchema('a x:int = A;\nb y:long = B;', { document: 'f.tl', table: 'api' })
    const reference = {
      constructors: [
        { id: String(schema.constructors[0]?.id), predicate: 'a' },
        { id: String(schema.constructors[1]?.id), predicate: 'b' },
      ],
    }

    expect(crosscheck(schema, reference).agrees).toBe(true)
  })

  it('reports a disagreeing identifier', () => {
    const schema = parseSchema('a x:int = A;', { document: 'f.tl', table: 'api' })
    const result = crosscheck(schema, { constructors: [{ id: '1', predicate: 'a' }] })

    expect(result.agrees).toBe(false)
    expect(result.idMismatches).toHaveLength(1)
  })

  it('reports a constructor the reference does not list', () => {
    const schema = parseSchema('a x:int = A;', { document: 'f.tl', table: 'api' })
    const result = crosscheck(schema, { constructors: [] })

    expect(result.agrees).toBe(false)
    expect(result.missingFromReference).toEqual(['a'])
  })

  it('reports a constructor the parse missed', () => {
    const schema = parseSchema('a x:int = A;', { document: 'f.tl', table: 'api' })
    const result = crosscheck(schema, {
      constructors: [
        { id: String(schema.constructors[0]?.id), predicate: 'a' },
        { id: '7', predicate: 'ghost' },
      ],
    })

    expect(result.agrees).toBe(false)
    expect(result.missingFromParse).toEqual(['ghost'])
  })

  it('reads the reference identifiers as signed 32-bit decimals', () => {
    // The published JSON writes ids that way, so a high identifier arrives
    // negative and has to be reinterpreted rather than compared as written.
    const schema = parseSchema('boolTrue#997275b5 = Bool;', { document: 'f.tl', table: 'core' })
    const result = crosscheck(schema, {
      constructors: [{ id: String(0x997275b5 | 0), predicate: 'boolTrue' }],
    })

    expect(result.agrees).toBe(true)
  })

  it('does not compare the language primitives', () => {
    // They describe what TL is rather than what travels on it, so the published
    // constructor list does not carry them and neither does any table.
    const schema = parseSchema('int ? = Int;', { document: 'f.tl', table: 'mtproto' })

    expect(crosscheck(schema, { constructors: [] }).agrees).toBe(true)
  })
})
