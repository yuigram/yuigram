/**
 * The wire layout of every constructor, as data.
 *
 * The codec is table-driven: rather than emitting a serializer and a
 * deserializer per constructor, the generator emits a description of each
 * constructor's fields and a hand-written interpreter walks it. Two reasons,
 * both of which outlast the schema:
 *
 * - **One interpreter is verifiable once.** Twenty-three hundred generated
 *   functions can only be checked by round-tripping them; a single reader and
 *   writer can be checked against fixed byte vectors, boundary cases and
 *   malformed input directly.
 * - **A layer bump changes data, not code.** New constructors extend a table.
 *   Nothing about the emitted logic has to be re-reviewed.
 *
 * The table lands in `.ts` rather than `.d.ts` terms — its declaration is one
 * line, so it costs a consumer's editor nothing regardless of length.
 */

import type { TlCombinator, TlSchema, TlType } from '../ir.js'
import { byName, type EmittedFile, header, hexId, moduleFor } from './render.js'

/**
 * A bare type reference names a type; the wire carries one of its constructors.
 *
 * `%Message` says "a bare value of type Message", and the reader has to know
 * which constructor that is, because a bare value carries no identifier to tell
 * it. TL only permits this where the type has exactly one constructor, so the
 * resolution is unambiguous — and a type with more than one is a schema the
 * generator refuses rather than guesses at.
 */
function resolveBareType(name: string, schema: TlSchema): string {
  if (!/^[A-Z]/.test(name.slice(name.lastIndexOf('.') + 1))) return name

  const implementing = schema.constructors.filter(
    (combinator) => combinator.result.kind === 'named' && combinator.result.name === name,
  )

  if (implementing.length === 1) return implementing[0]?.name ?? name

  throw new Error(
    `bare reference to '${name}', which has ${implementing.length} constructors; ` +
      'a bare value carries no identifier, so exactly one is required',
  )
}

/** Emit the codec tables for one schema, split to match the type modules. */
export function emitTables(
  schema: TlSchema,
  source: string,
  directory: string,
): readonly EmittedFile[] {
  const groups = new Map<string, TlCombinator[]>()

  for (const combinator of [...schema.constructors, ...schema.methods]) {
    const module = moduleFor(combinator.namespace)
    const list = groups.get(module) ?? []
    list.push(combinator)
    groups.set(module, list)
  }

  const files: EmittedFile[] = []
  const modules = [...groups.keys()].sort()

  for (const module of modules) {
    const entries = byName(groups.get(module) ?? [])
    const rows = entries.map((entry) => renderEntry(entry, schema)).join(',\n')

    files.push({
      path: `${directory}/tables/${module}.ts`,
      text:
        header(`Wire layout for ${module === 'root' ? 'the root namespace' : module}`, source) +
        "\nimport type { TlEntry } from '../../../tl/schema.js'\n\n" +
        `/** ${entries.length} combinators. */\n` +
        `export const ENTRIES: readonly TlEntry[] = [\n${rows},\n]\n`,
    })
  }

  files.push({
    path: `${directory}/tables/index.ts`,
    text:
      header('Codec table barrel', source) +
      "\nimport type { TlEntry } from '../../../tl/schema.js'\n" +
      modules.map((module) => `import { ENTRIES as ${module}$ } from './${module}.js'`).join('\n') +
      '\n\n' +
      '/** Every combinator in this table, in one flat list. */\n' +
      `export const ENTRIES: readonly TlEntry[] = [\n${modules
        .map((module) => `  ...${module}$,`)
        .join('\n')}\n]\n`,
  })

  return files
}

/** One table row. */
function renderEntry(combinator: TlCombinator, schema: TlSchema): string {
  const fields = combinator.params.map((param) => renderParam(param, schema)).join(', ')
  const method = combinator.result.kind === 'generic' ? ', g: 1' : ''

  return `  { id: ${hexId(combinator.id)}, n: '${combinator.name}', f: [${fields}]${method} }`
}

function renderParam(param: TlCombinator['params'][number], schema: TlSchema): string {
  if (param.kind === 'bitfield') return `{ n: '${param.name}', b: 1 }`

  const conditional =
    param.conditional === null
      ? ''
      : `, c: '${param.conditional.field}', i: ${param.conditional.bit}`

  return `{ n: '${param.name}', t: ${renderTypeSpec(param.type, schema)}${conditional} }`
}

/**
 * The type descriptor the interpreter reads.
 *
 * Boxed references collapse to `'obj'`: the reader learns the constructor from
 * the id on the wire, and the writer learns it from the value's own `_`. The
 * name would only be redundant weight in a table this size. Bare references
 * cannot — a bare value carries no id, so the table must name what to expect.
 */
function renderTypeSpec(type: TlType, schema: TlSchema): string {
  switch (type.kind) {
    case 'primitive':
      // The IR calls the pseudo-type `object`; the table marker is `obj`, which
      // is also what a boxed reference collapses to.
      return type.name === 'object' ? `'obj'` : `'${type.name}'`
    case 'vector':
      return `{ v: ${renderTypeSpec(type.item, schema)}${type.bare ? ', bare: 1' : ''} }`
    case 'repeat':
      return `{ v: ${renderTypeSpec(type.item, schema)}, bare: 1${type.count === null ? '' : `, len: ${type.count}`} }`
    case 'named':
      return type.bare ? `{ p: '${resolveBareType(type.name, schema)}' }` : `'obj'`
    case 'generic':
      return `'obj'`
    case 'opaque':
      return `'opaque'`
  }
}
