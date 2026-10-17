// SPDX-License-Identifier: MIT

/**
 * TypeScript declarations for a TL table.
 *
 * One interface per constructor and one union per boxed type, split into a
 * module per TL namespace. The namespace is the boundary the schema already
 * draws and the one a developer navigates by; a split chosen purely to hit a
 * byte target would cut across concepts and make every import arbitrary.
 *
 * One namespace is too large for that alone. The root namespace holds twelve
 * hundred constructors and would emit a declaration file past the 300 KB budget
 * on its own, so it is divided again — alphabetically, into a directory of
 * modules behind a barrel. Alphabetical is not arbitrary here: TL names a
 * constructor after the type it builds, so a type and its constructors land
 * together, and a name only moves between files if it is renamed.
 *
 * Modules reference each other with `import type` only. Those imports are
 * erased, so the cycles TL's cross-namespace references produce are legal and
 * intended — the acyclic constraint applies to the runtime tables, which carry
 * no imports between namespaces at all.
 */

import type { TlCombinator, TlSchema, TlType } from '../ir.js'
import {
  byName,
  constructorTypeName,
  doc,
  type EmittedFile,
  header,
  hexId,
  moduleFor,
  pascalCase,
  unionTypeName,
} from './render.js'

/**
 * Rendered bytes above which a namespace is divided alphabetically.
 *
 * Below the 300 KB declaration budget with room for the doc comments the
 * compiler carries through into the `.d.ts`.
 */
const SPLIT_BYTES = 200_000

/** A collision between two TL names that case to the same TypeScript name. */
export class EmitCollisionError extends Error {
  override readonly name = 'EmitCollisionError'
}

/** One declaration, before it knows which file it lands in. */
interface Declaration {
  /** The TypeScript name it declares. */
  readonly tsName: string
  /** The TL name it came from, for diagnostics. */
  readonly tlName: string
  /** Render the body, resolving references through `resolve`. */
  render(resolve: Resolver): string
}

/** Turns a reference into either a local name or an imported one. */
export type Resolver = (module: string, tsName: string) => string

/** Emit the type modules for one table. */
export function emitTypes(
  schema: TlSchema,
  source: string,
  directory: string,
): readonly EmittedFile[] {
  const namespaces = plan(schema)
  const placement = new Map<string, string>()
  const layout = new Map<string, Map<string, readonly Declaration[]>>()

  // Two passes: decide where everything lives, then render, so a declaration
  // can reference one the renderer has not reached yet.
  for (const [namespace, declarations] of namespaces) {
    const module = moduleFor(namespace)
    const files = assign(module, declarations)
    layout.set(module, files)

    for (const [path, contents] of files) {
      for (const declaration of contents) placement.set(key(module, declaration.tsName), path)
    }
  }

  const files: EmittedFile[] = []
  for (const [module, contents] of layout) {
    for (const [path, declarations] of contents) {
      files.push(render(path, module, declarations, placement, source, directory))
    }

    // A divided namespace keeps a module at its original path, so importers see
    // one name whether or not the division happened.
    if (contents.size > 1) files.push(barrel(module, [...contents.keys()], source, directory))
  }

  files.push(rootBarrel([...layout.keys()], source, directory))
  return files
}

/** `module:Name`, the key a reference resolves through. */
function key(module: string, tsName: string): string {
  return `${module}:${tsName}`
}

/** Build every declaration, grouped by namespace. */
function plan(schema: TlSchema): Map<string | null, readonly Declaration[]> {
  const constructorsBy = new Map<string | null, TlCombinator[]>()
  const unionsBy = new Map<string | null, Map<string, TlCombinator[]>>()

  group(schema.methods, constructorsBy)

  for (const combinator of schema.constructors) {
    const list = constructorsBy.get(combinator.namespace) ?? []
    list.push(combinator)
    constructorsBy.set(combinator.namespace, list)

    if (combinator.result.kind !== 'named') continue

    const dot = combinator.result.name.lastIndexOf('.')
    const resultNamespace = dot === -1 ? null : combinator.result.name.slice(0, dot)
    const shortName = dot === -1 ? combinator.result.name : combinator.result.name.slice(dot + 1)

    const unions = unionsBy.get(resultNamespace) ?? new Map<string, TlCombinator[]>()
    const members = unions.get(shortName) ?? []
    members.push(combinator)
    unions.set(shortName, members)
    unionsBy.set(resultNamespace, unions)
  }

  const namespaces = new Set<string | null>([...constructorsBy.keys(), ...unionsBy.keys()])
  const planned = new Map<string | null, readonly Declaration[]>()

  for (const namespace of [...namespaces].sort(compareNamespaces)) {
    const declared = new Map<string, string>()
    const declarations: Declaration[] = []

    const claim = (tsName: string, tlName: string): void => {
      const previous = declared.get(tsName)
      if (previous !== undefined) {
        throw new EmitCollisionError(
          `'${tlName}' and '${previous}' both render as '${tsName}' in '${moduleFor(namespace)}'`,
        )
      }
      declared.set(tsName, tlName)
    }

    for (const combinator of byName(constructorsBy.get(namespace) ?? [])) {
      const tsName = constructorTypeName(combinator)
      claim(tsName, combinator.name)
      declarations.push({
        tsName,
        tlName: combinator.name,
        render: (resolve) => renderInterface(combinator, tsName, resolve),
      })
    }

    for (const [shortName, members] of [...(unionsBy.get(namespace) ?? new Map()).entries()].sort(
      ([a], [b]) => (a < b ? -1 : 1),
    )) {
      const tsName = unionTypeName(shortName)
      const qualified = namespace === null ? shortName : `${namespace}.${shortName}`
      claim(tsName, qualified)
      declarations.push({
        tsName,
        tlName: qualified,
        render: (resolve) => renderUnion(tsName, qualified, members, resolve),
      })
    }

    planned.set(namespace, byTsName(declarations))
  }

  return planned
}

/**
 * Collect combinators by the namespace they are declared in.
 *
 * Used for methods as well as constructors: a method's request is an interface
 * like any other combinator's — an identifier, fields in wire order, and a
 * caller that has to build one. It is not a member of the union its result
 * names, because a method constructs a request rather than the type it returns,
 * so only the interface is planned for it.
 */
function group(
  combinators: readonly TlCombinator[],
  into: Map<string | null, TlCombinator[]>,
): void {
  for (const combinator of combinators) {
    const list = into.get(combinator.namespace) ?? []
    list.push(combinator)
    into.set(combinator.namespace, list)
  }
}

/** Namespaces sort with the root first, then alphabetically. */
function compareNamespaces(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a < b ? -1 : 1
}

function byTsName(declarations: readonly Declaration[]): readonly Declaration[] {
  return [...declarations].sort((a, b) => (a.tsName < b.tsName ? -1 : a.tsName > b.tsName ? 1 : 0))
}

/**
 * Decide which file each declaration lands in.
 *
 * One file per namespace until the rendered size passes the threshold, then one
 * per initial letter. The decision is a function of the schema alone, so it is
 * the same on every machine and stable across regenerations.
 */
function assign(
  module: string,
  declarations: readonly Declaration[],
): Map<string, readonly Declaration[]> {
  const measured = declarations.reduce((total, d) => total + d.render(() => 'X').length, 0)

  if (measured <= SPLIT_BYTES) return new Map([[module, declarations]])

  const buckets = new Map<string, Declaration[]>()
  for (const declaration of declarations) {
    const letter = declaration.tsName.replace(/^Type/, '').charAt(0).toLowerCase() || '_'
    const bucket = buckets.get(letter) ?? []
    bucket.push(declaration)
    buckets.set(letter, bucket)
  }

  const files = new Map<string, readonly Declaration[]>()
  for (const letter of [...buckets.keys()].sort()) {
    files.set(`${module}/${letter}`, buckets.get(letter) ?? [])
  }

  return files
}

/** Render one file. */
function render(
  path: string,
  module: string,
  declarations: readonly Declaration[],
  placement: ReadonlyMap<string, string>,
  source: string,
  directory: string,
): EmittedFile {
  const depth = path.split('/').length - 1
  const up = '../'.repeat(depth)
  const imports = new Set<string>()

  const resolve: Resolver = (targetModule, tsName) => {
    const target = placement.get(key(targetModule, tsName))
    if (target === undefined || target === path) return tsName

    const specifier = relative(path, target)
    imports.add(`import type * as ${alias(target)} from '${specifier}'`)
    return `${alias(target)}.${tsName}`
  }

  const body = declarations.map((declaration) => declaration.render(resolve)).join('')

  // Every module names `TlObject` somewhere: the `Object` pseudo-type, a
  // generic method's wrapped call, or a bare value whose shape TL leaves open.
  imports.add(`import type { TlObject } from '${up}../../../tl/object.js'`)

  return {
    path: `${directory}/types/${path}.ts`,
    text:
      header(`TL types for ${module === 'root' ? 'the root namespace' : module}`, source) +
      `\n${[...imports].sort().join('\n')}\n\n` +
      body.trimEnd() +
      '\n',
  }
}

/** A specifier from one emitted file to another. */
function relative(from: string, to: string): string {
  const fromDepth = from.split('/').length - 1
  // A sibling at the top level still needs the explicit `./`, or the specifier
  // reads as a bare package name.
  const prefix = fromDepth === 0 ? './' : '../'.repeat(fromDepth)

  return `${prefix}${to}.js`
}

/** A stable import alias for a file path. */
function alias(path: string): string {
  return `${path.replace(/[^A-Za-z0-9]/g, '_')}$`
}

/** The module that stands in for a namespace that had to be divided. */
function barrel(
  module: string,
  paths: readonly string[],
  source: string,
  directory: string,
): EmittedFile {
  const lines = [...paths].sort().map((path) => `export type * from './${path}.js'`)

  return {
    path: `${directory}/types/${module}.ts`,
    text:
      header(`TL types for ${module === 'root' ? 'the root namespace' : module}`, source) +
      `\n${lines.join('\n')}\n`,
  }
}

/** The barrel over every namespace. */
function rootBarrel(modules: readonly string[], source: string, directory: string): EmittedFile {
  const lines = [...modules]
    .sort((a, b) => (a === 'root' ? -1 : b === 'root' ? 1 : a < b ? -1 : 1))
    .map((module) =>
      module === 'root'
        ? `export type * from './root.js'`
        : `export type * as ${module} from './${module}.js'`,
    )

  return {
    path: `${directory}/types/index.ts`,
    text:
      header('TL type barrel', source) +
      `\nexport type { TlObject } from '../../../tl/object.js'\n\n` +
      `${lines.join('\n')}\n`,
  }
}

/** One constructor's interface. */
function renderInterface(combinator: TlCombinator, tsName: string, resolve: Resolver): string {
  const lines = [
    doc(`\`${combinator.name}#${hexId(combinator.id).slice(2)}\``),
    `export interface ${tsName} {\n`,
    `  readonly _: '${combinator.name}'\n`,
  ]

  for (const param of combinator.params) {
    if (param.kind === 'bitfield') continue

    if (param.type.kind === 'primitive' && param.type.name === 'true') {
      // A conditional `true` occupies no bytes: presence is the value.
      lines.push(`  readonly ${param.name}?: true\n`)
      continue
    }

    const optional = param.conditional !== null ? '?' : ''
    lines.push(`  readonly ${param.name}${optional}: ${renderType(param.type, resolve)}\n`)
  }

  lines.push('}\n\n')
  return lines.join('')
}

/** One boxed type's union. */
function renderUnion(
  tsName: string,
  qualified: string,
  members: readonly TlCombinator[],
  resolve: Resolver,
): string {
  const alternatives = byName(members).map((member) =>
    resolve(moduleFor(member.namespace), constructorTypeName(member)),
  )

  return (
    doc(`Any \`${qualified}\`.`) +
    `export type ${tsName} =\n${alternatives.map((a) => `  | ${a}`).join('\n')}\n\n`
  )
}

/** Render a TL type as a TypeScript type expression. */
export function renderType(type: TlType, resolve: Resolver): string {
  switch (type.kind) {
    case 'primitive':
      return renderPrimitive(type.name)
    case 'vector':
    case 'repeat':
      return `readonly ${wrap(renderType(type.item, resolve))}[]`
    case 'generic':
      return 'TlObject'
    case 'opaque':
      return 'never'
    case 'named':
      return renderNamed(type.name, resolve)
  }
}

/** Parenthesise a union before applying `[]`. */
function wrap(rendered: string): string {
  return rendered.includes('|') ? `(${rendered})` : rendered
}

function renderPrimitive(name: string): string {
  switch (name) {
    case 'int':
    case 'double':
    case 'nat':
      return 'number'
    case 'long':
      return 'bigint'
    case 'string':
      return 'string'
    case 'bytes':
    case 'int128':
    case 'int256':
      return 'Uint8Array'
    case 'bool':
      return 'boolean'
    case 'true':
      return 'true'
    default:
      return 'TlObject'
  }
}

/** Render a reference to another TL type or constructor. */
function renderNamed(name: string, resolve: Resolver): string {
  if (name === 'Object' || name === 'Type') return 'TlObject'

  const dot = name.lastIndexOf('.')
  const namespace = dot === -1 ? null : name.slice(0, dot)
  const shortName = dot === -1 ? name : name.slice(dot + 1)

  // An initial capital names a boxed type; a lowercase one names a constructor
  // used bare, which still renders as that constructor's own interface.
  const tsName = /^[A-Z]/.test(shortName) ? unionTypeName(shortName) : pascalCase(shortName)

  return resolve(moduleFor(namespace), tsName)
}
