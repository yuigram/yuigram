// SPDX-License-Identifier: MPL-2.0

/**
 * Shared rendering for the generated modules.
 *
 * Everything here exists to keep output deterministic: fixed ordering, no
 * timestamps, no paths, no generator version. Regenerating from an unchanged
 * schema must produce byte-identical files, or drift detection reports noise
 * and stops being read.
 */

import type { TlCombinator, TlType } from '../ir.js'

/** One emitted file, relative to the generated root. */
export interface EmittedFile {
  readonly path: string
  readonly text: string
}

/**
 * The licence of a file generated from `source`.
 *
 * A file generated from the API schema is derived from TDLib's copy of it, so
 * TDLib's Boost licence applies beside Yuigram's own; the package ships that
 * notice as `TDLIB-LICENSE.txt`. The service schema and the error database come
 * from Telegram's documentation and carry no licence of their own.
 */
function licence(source: string): readonly string[] {
  if (source.includes('schemas/tl/api.')) {
    return [
      '// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0',
      "// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.",
    ]
  }

  return ['// SPDX-License-Identifier: MPL-2.0']
}

/** The banner every generated file opens with. */
export function header(description: string, source: string): string {
  return [
    '// GENERATED FILE — do not edit.',
    `// ${description}`,
    `// Source: ${source}`,
    ...licence(source),
    '',
  ].join('\n')
}

/** Wrap prose as a doc comment at the given indentation. */
export function doc(text: string, indent = ''): string {
  return `${indent}/** ${text} */\n`
}

/** Sort by name so output order never depends on parse order. */
export function byName<T extends { readonly name: string }>(items: readonly T[]): readonly T[] {
  return [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** `messages.affectedHistory` → `AffectedHistory`. */
export function constructorTypeName(combinator: TlCombinator): string {
  return pascalCase(combinator.shortName)
}

/**
 * The union type a boxed value of `name` can hold.
 *
 * Prefixed rather than bare, because TL names a constructor and its type
 * almost identically — `messages.affectedHistory` constructs
 * `messages.AffectedHistory` — and the two would otherwise collide once cased.
 */
export function unionTypeName(shortName: string): string {
  return `Type${pascalCase(shortName)}`
}

/** Upper-camel, accepting both `camelCase` and `snake_case` inputs. */
export function pascalCase(name: string): string {
  const parts = name.split('_').filter((part) => part.length > 0)
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

/** A TL name split into its namespace and remainder. */
export function namespaceOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? null : name.slice(0, dot)
}

/** The module a namespace's declarations live in. */
export function moduleFor(namespace: string | null): string {
  return namespace ?? 'root'
}

/** Format a 32-bit id the way the schema writes it. */
export function hexId(id: number): string {
  return `0x${id.toString(16).padStart(8, '0')}`
}

/** Whether a type mentions a generic parameter, and so cannot be a plain value. */
export function isGeneric(type: TlType): boolean {
  switch (type.kind) {
    case 'generic':
      return true
    case 'vector':
      return isGeneric(type.item)
    case 'repeat':
      return isGeneric(type.item)
    default:
      return false
  }
}
