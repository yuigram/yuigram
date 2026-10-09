// SPDX-License-Identifier: MPL-2.0

/**
 * The callable surface for a TL table's methods.
 *
 * `docs/architecture.md` §7 gives MTProto two forms: `user.api.call({ _: … })`
 * for anything the build has never heard of, and a typed surface for everything
 * the schema does carry. This emits the second. It is an ergonomic layer over
 * the first rather than a replacement — the escape hatch is what keeps a
 * Telegram release from blocking whoever needed the new method, so it stays.
 *
 * The declarations are types and nothing else. A method is reached at run time
 * by naming it, so there is no generated code per method, no table to load, and
 * nothing for a bundler to shake out: the entire cost of this surface is paid by
 * the compiler, which is the cost `docs/performance.md` §5 is about.
 *
 * One module rather than one per namespace. It declares no types of its own —
 * every name in it is a reference into the type modules, which are already split
 * by namespace and, where a namespace is too large, again by letter. What lands
 * here is a signature per method, which is small enough that splitting it would
 * cost an import decision without saving anything.
 */

import type { TlCombinator, TlParam, TlSchema } from '../ir.js'
import {
  byName,
  constructorTypeName,
  doc,
  type EmittedFile,
  header,
  hexId,
  moduleFor,
  pascalCase,
} from './render.js'
import { type Resolver, renderType } from './types.js'

/**
 * Reach a type through the barrel rather than through its own module.
 *
 * The barrel re-exports each namespace under its own name, so one import gives
 * this module every type it names. The alternative is a specifier per namespace
 * and a rule for ordering them, which buys nothing here: nothing in this file is
 * imported by anything the runtime loads.
 */
const resolve: Resolver = (module, tsName) =>
  module === 'root' ? `types.${tsName}` : `types.${module}.${tsName}`

/** A parameter a caller supplies. A bitfield is computed by the writer. */
type Field = Extract<TlParam, { readonly kind: 'field' }>

/** Params that reach the caller. */
function visible(combinator: TlCombinator): readonly Field[] {
  return combinator.params.filter((param): param is Field => param.kind === 'field')
}

/** One method's signature. */
function renderMethod(combinator: TlCombinator, indent: string): string {
  const params = visible(combinator)
  const request = resolve(moduleFor(combinator.namespace), constructorTypeName(combinator))
  const result = renderType(combinator.result, resolve)

  // Omitting the constructor leaves exactly the fields a caller supplies, so
  // the signature and the wire shape cannot drift apart: they are one
  // declaration. A method that takes nothing takes nothing.
  const argument =
    params.length === 0
      ? ''
      : params.every((param) => param.conditional !== null)
        ? `params?: Omit<${request}, '_'>`
        : `params: Omit<${request}, '_'>`

  return (
    doc(`\`${combinator.name}#${hexId(combinator.id).slice(2)}\``, indent) +
    `${indent}${combinator.shortName}(${argument}): Promise<${result}>\n`
  )
}

/** The interface for one namespace's methods. */
function renderNamespace(namespace: string, methods: readonly TlCombinator[]): string {
  const name = `${pascalCase(namespace)}Methods`
  const body = byName(methods)
    .map((combinator) => renderMethod(combinator, '  '))
    .join('\n')

  return `${doc(`Methods in the \`${namespace}\` namespace.`)}export interface ${name} {\n${body}}\n\n`
}

/**
 * Emit the method surface for one table.
 *
 * Namespaces become properties; the root namespace's methods sit directly on
 * the surface, which is where TL puts them.
 */
export function emitMethods(
  schema: TlSchema,
  source: string,
  directory: string,
): readonly EmittedFile[] {
  if (schema.methods.length === 0) return []

  const byNamespace = new Map<string, TlCombinator[]>()
  const root: TlCombinator[] = []

  for (const combinator of schema.methods) {
    if (combinator.namespace === null) {
      root.push(combinator)
      continue
    }
    const list = byNamespace.get(combinator.namespace) ?? []
    list.push(combinator)
    byNamespace.set(combinator.namespace, list)
  }

  const namespaces = [...byNamespace.keys()].sort()

  const declarations = namespaces
    .map((namespace) => renderNamespace(namespace, byNamespace.get(namespace) ?? []))
    .join('')

  const members = [
    ...namespaces.map(
      (namespace) =>
        `${doc(`The \`${namespace}\` namespace.`, '  ')}  readonly ${namespace}: ${pascalCase(namespace)}Methods\n`,
    ),
    ...byName(root).map((combinator) => renderMethod(combinator, '  ')),
  ].join('\n')

  const text =
    header(`TL methods (${schema.methods.length})`, source) +
    "\nimport type { TlObject } from '../../tl/object.js'\n" +
    "import type * as types from './types/index.js'\n\n" +
    declarations +
    [
      '/**',
      ' * Every method the schema declares, addressed the way TL names it.',
      ' *',
      ' * The typed half of `docs/architecture.md` §7. A method newer than this',
      ' * build is not here, and is reached by naming it — which is what `call`',
      ' * is for.',
      ' */',
      '',
    ].join('\n') +
    `export interface ${pascalCase(directory)}Methods {\n${members}}\n`

  return [{ path: `${directory}/methods.ts`, text }]
}
