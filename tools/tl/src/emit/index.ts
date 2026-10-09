// SPDX-License-Identifier: MPL-2.0

/**
 * The emitter that assembles the three tables.
 *
 * `core`, `mtproto` and `api` are produced as separate directories with
 * separate registries, and nothing in the emitted output makes one importable
 * from the other. That separation is the whole reason an API constructor cannot
 * decode on the plaintext handshake channel, so it is established here rather
 * than left to a convention the next change might not follow.
 */

import type { TlCombinator, TlSchema } from '../ir.js'
import { emitMethods } from './methods.js'
import { type EmittedFile, header, hexId } from './render.js'
import { emitTables } from './tables.js'
import { emitTypes } from './types.js'

/** Schemas to generate from. */
export interface EmitInput {
  readonly mtproto: TlSchema
  readonly api: TlSchema
  readonly layer: number
}

/**
 * Constructors the TL language owns rather than either schema.
 *
 * They are declared in `api.tl` and one of them is declared again in
 * `mtproto.tl`. Lifting them into a table both may import defines them once,
 * instead of duplicating them and hoping the two copies stay identical.
 */
const CORE_NAMES: ReadonlySet<string> = new Set([
  'boolFalse',
  'boolTrue',
  'true',
  'vector',
  'error',
  'null',
])

/**
 * Builtins the language defines and no table carries.
 *
 * `int ? = Int;` and its relatives describe the primitives the codec handles
 * directly. They have no constructor id and never appear on the wire as boxed
 * values, so they are not table entries.
 */
const BUILTIN_NAMES: ReadonlySet<string> = new Set([
  'int',
  'long',
  'double',
  'string',
  'bytes',
  'int128',
  'int256',
])

/** Emit every generated file. */
export function emitAll(input: EmitInput): readonly EmittedFile[] {
  const { core, api } = partitionCore(input.api)
  const mtproto = withoutBuiltins(input.mtproto)

  const apiSource = `Telegram TL layer ${input.layer}, schemas/tl/api.${input.layer}.tl`
  const mtprotoSource = 'Telegram MTProto schema, schemas/tl/mtproto.tl'

  return [
    ...emitTypes(core, apiSource, 'core'),
    ...emitTables(core, apiSource, 'core'),
    ...emitRegistry(core, apiSource, 'core', 'CoreId'),

    ...emitTypes(mtproto, mtprotoSource, 'mtproto'),
    ...emitTables(mtproto, mtprotoSource, 'mtproto'),
    ...emitRegistry(mtproto, mtprotoSource, 'mtproto', 'MtprotoId'),

    ...emitTypes(api, apiSource, 'api'),
    ...emitTables(api, apiSource, 'api'),
    ...emitRegistry(api, apiSource, 'api', 'ApiId'),
    // Only the API table gets a callable surface. The service schema's methods
    // — `ping`, `get_future_salts`, the acknowledgements — are the session
    // layer's own traffic, addressed by the code that owns the connection
    // rather than by anyone holding a client.
    ...emitMethods(api, apiSource, 'api'),

    emitSchemaInfo(input.layer, apiSource),
  ]
}

/** Move the language's own constructors out of the API schema. */
function partitionCore(api: TlSchema): { core: TlSchema; api: TlSchema } {
  const coreConstructors: TlCombinator[] = []
  const apiConstructors: TlCombinator[] = []

  for (const combinator of api.constructors) {
    if (CORE_NAMES.has(combinator.name)) coreConstructors.push(combinator)
    else apiConstructors.push(combinator)
  }

  return {
    core: { table: 'core', layer: api.layer, constructors: coreConstructors, methods: [] },
    api: { ...api, constructors: apiConstructors },
  }
}

/** Drop the language builtins from the service schema. */
function withoutBuiltins(schema: TlSchema): TlSchema {
  return {
    ...schema,
    constructors: schema.constructors.filter(
      (combinator) => !BUILTIN_NAMES.has(combinator.name) && !CORE_NAMES.has(combinator.name),
    ),
  }
}

/**
 * The registry module for one table.
 *
 * The branded id type is declared here, so a value from one table cannot be
 * passed where another's is expected. Branding stops a value crossing; the
 * module-boundary invariant stops a module crossing. Both are needed.
 */
function emitRegistry(
  schema: TlSchema,
  source: string,
  directory: string,
  brand: string,
): readonly EmittedFile[] {
  const total = schema.constructors.length + schema.methods.length

  const text =
    header(`${directory} registry (${total} combinators)`, source) +
    "\nimport { type TlRegistry, createRegistry } from '../../tl/registry.js'\n" +
    "import { ENTRIES } from './tables/index.js'\n\n" +
    doc(
      `An identifier belonging to the \`${directory}\` table.`,
      `A value carrying this brand cannot be passed where another table's is`,
      'expected, which is what keeps the two wire vocabularies apart at compile',
      'time.',
    ) +
    `export type ${brand} = number & { readonly __table: '${directory}' }\n\n` +
    doc(`Every \`${directory}\` combinator, keyed by identifier.`) +
    `export const REGISTRY: TlRegistry<${brand}> = createRegistry<${brand}>(ENTRIES)\n\n` +
    doc(`Whether \`id\` names a combinator in this table.`) +
    `export function isKnown(id: number): id is ${brand} {\n` +
    '  return REGISTRY.has(id)\n' +
    '}\n'

  return [{ path: `${directory}/registry.ts`, text }]
}

/** A multi-line doc comment. */
function doc(...lines: readonly string[]): string {
  if (lines.length === 1) return `/** ${lines[0]} */\n`
  return `/**\n${lines.map((line) => ` * ${line}`).join('\n')}\n */\n`
}

/** The one place the pinned layer reaches the runtime. */
function emitSchemaInfo(layer: number, source: string): EmittedFile {
  return {
    path: 'schema-info.ts',
    text:
      header('Pinned protocol layer', source) +
      '\n' +
      doc(
        'The TL layer this build speaks.',
        '',
        'Sent once per connection and never configurable: the codecs were',
        'emitted from this layer, so announcing another would claim a wire',
        'contract the generated types do not implement.',
      ) +
      `export const TL_LAYER = ${layer} as const\n`,
  }
}

export { hexId }
