/**
 * Emitter behaviour, checked against the committed schema.
 *
 * The determinism and budget cases are the load-bearing ones. Non-deterministic
 * output turns drift detection into noise that stops being read, and an
 * oversized declaration file is a cost every consumer's editor pays on every
 * keystroke.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BotApiSchema } from '../src/bot-api/ir.js'
import { emitAll } from '../src/emit/index.js'
import { pascalCase, renderType, slug } from '../src/emit/render.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const schema = JSON.parse(
  readFileSync(join(ROOT, 'schemas', 'bot-api', '10.2.json'), 'utf8'),
) as BotApiSchema

/** Stable fingerprint of a full emit run. */
function fingerprint(): string {
  const files = emitAll(schema)
  return createHash('sha256')
    .update(files.map((file) => `${file.path}\n${file.contents}`).join('\n'))
    .digest('hex')
}

describe('render helpers', () => {
  it('maps scalars to TypeScript', () => {
    expect(renderType({ kind: 'string' })).toBe('string')
    expect(renderType({ kind: 'integer' })).toBe('number')
    expect(renderType({ kind: 'float' })).toBe('number')
    expect(renderType({ kind: 'boolean' })).toBe('boolean')
  })

  it('keeps True as the literal', () => {
    // Widening to boolean would make an absent field indistinguishable from an
    // explicit false, which is precisely the distinction Telegram encodes.
    expect(renderType({ kind: 'true' })).toBe('true')
  })

  it('parenthesises a union inside an array', () => {
    // `A | B[]` would parse as `A | (B[])`, which is a different type.
    const type = renderType({
      kind: 'array',
      of: { kind: 'union', of: [{ kind: 'string' }, { kind: 'integer' }] },
    })
    expect(type).toBe('Array<string | number>')
  })

  it('uses shorthand for a simple array', () => {
    expect(renderType({ kind: 'array', of: { kind: 'string' } })).toBe('string[]')
  })

  it('converts names', () => {
    expect(pascalCase('sendMessage')).toBe('SendMessage')
    expect(pascalCase('get_updates')).toBe('GetUpdates')
    expect(slug('Available types')).toBe('available-types')
    expect(slug('Telegram Passport')).toBe('telegram-passport')
  })
})

describe('emitted output', () => {
  const files = emitAll(schema)

  it('emits a file per documentation section plus barrels', () => {
    const paths = files.map((file) => file.path)
    expect(paths).toContain('types/index.ts')
    expect(paths).toContain('methods/index.ts')
    expect(paths).toContain('api.ts')
    expect(paths).toContain('types/available-types.ts')
  })

  it('marks every file as generated', () => {
    for (const file of files) {
      expect(file.contents.startsWith('// GENERATED FILE — do not edit.')).toBe(true)
    }
  })

  it('records the source schema version in each header', () => {
    for (const file of files) {
      expect(file.contents).toContain(`Telegram Bot API ${schema.version}`)
    }
  })

  it('does not generate hand-written types', () => {
    // `InputFile` is documented as an object with no fields because Telegram
    // leaves its shape to the client. Generating it would shadow the real one.
    const types = files.filter((file) => file.path.startsWith('types/'))
    for (const file of types) {
      expect(file.contents).not.toMatch(/^export interface InputFile \{/m)
    }
  })

  it('keeps snake_case field names', () => {
    // These types describe the wire format and back the raw surface, where
    // mirroring the protocol exactly is the point.
    const available = files.find((file) => file.path === 'types/available-types.ts')
    expect(available?.contents).toMatch(/readonly message_id: number/)
  })

  it('emits a parameter interface per method', () => {
    const methodFiles = files.filter((file) => file.path.startsWith('methods/'))
    const combined = methodFiles.map((file) => file.contents).join('\n')

    for (const method of schema.methods) {
      const name = `${pascalCase(method.name)}Params`
      expect(combined).toContain(`export interface ${name}`)
    }
  })

  it('emits every method on the callable surface', () => {
    const api = files.find((file) => file.path === 'api.ts')
    expect(api).toBeDefined()

    for (const method of schema.methods) {
      expect(api?.contents).toContain(`  ${method.name}(params`)
    }
  })

  it('makes params optional only when every parameter is', () => {
    const api = files.find((file) => file.path === 'api.ts')?.contents ?? ''
    expect(api).toMatch(/getMe\(params\?: GetMeParams\)/)
    expect(api).toMatch(/sendMessage\(params: SendMessageParams\)/)
  })
})

describe('determinism', () => {
  it('produces identical output across runs', () => {
    // Drift detection is only meaningful if identical input yields identical
    // output; otherwise every regeneration reports spurious changes.
    expect(fingerprint()).toBe(fingerprint())
  })

  it('carries no timestamp in the output body', () => {
    // The schema records when it was fetched; the generated files must not, or
    // every regeneration would differ.
    for (const file of emitAll(schema)) {
      expect(file.contents).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
    }
  })
})

describe('size budget', () => {
  it('keeps every generated file under 300 KB', () => {
    const budget = 300 * 1024

    for (const file of emitAll(schema)) {
      const bytes = Buffer.byteLength(file.contents, 'utf8')
      expect(
        bytes,
        `${file.path} is ${(bytes / 1024).toFixed(0)} KB, over the ${budget / 1024} KB budget`,
      ).toBeLessThanOrEqual(budget)
    }
  })
})
