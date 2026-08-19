/**
 * Schema diffing.
 *
 * A regeneration that only rewrote a JSON file would tell a reviewer nothing
 * useful — the raw diff is thousands of lines of description text. This
 * summarises what actually changed about the *surface*, which is the thing a
 * human needs to judge.
 *
 * Breaking changes are called out separately, because they decide whether a
 * release is minor or major.
 */

import type { BotApiSchema, Field, TypeRef } from './ir.js'

/** What changed between two schema versions. */
export interface SchemaDiff {
  readonly from: string
  readonly to: string
  readonly methodsAdded: readonly string[]
  readonly methodsRemoved: readonly string[]
  readonly methodsChanged: readonly string[]
  readonly objectsAdded: readonly string[]
  readonly objectsRemoved: readonly string[]
  readonly objectsChanged: readonly string[]
  /** Changes that break compilation for an existing user. */
  readonly breaking: readonly string[]
}

/** Render a type as a stable string, for comparison and reporting. */
export function renderType(type: TypeRef): string {
  switch (type.kind) {
    case 'array':
      return `${renderType(type.of)}[]`
    case 'union':
      return type.of.map(renderType).join(' | ')
    case 'reference':
      return type.name
    case 'literal':
      return JSON.stringify(type.value)
    default:
      return type.kind
  }
}

/** A comparable signature for one field, ignoring documentation prose. */
function fieldSignature(field: Field): string {
  return `${field.name}${field.required ? '' : '?'}: ${renderType(field.type)}`
}

/** Compare two field lists, reporting additions, removals and retypes. */
function diffFields(
  owner: string,
  before: readonly Field[],
  after: readonly Field[],
): { changed: boolean; breaking: string[] } {
  const breaking: string[] = []
  const beforeByName = new Map(before.map((field) => [field.name, field]))
  const afterByName = new Map(after.map((field) => [field.name, field]))

  let changed = false

  for (const [name, field] of beforeByName) {
    const next = afterByName.get(name)

    if (next === undefined) {
      changed = true
      breaking.push(`${owner}.${name} removed`)
      continue
    }

    if (fieldSignature(field) !== fieldSignature(next)) {
      changed = true
      // Widening optional to required breaks existing callers; the reverse
      // does not.
      if (!field.required && next.required) {
        breaking.push(`${owner}.${name} became required`)
      } else if (renderType(field.type) !== renderType(next.type)) {
        breaking.push(
          `${owner}.${name} retyped: ${renderType(field.type)} -> ${renderType(next.type)}`,
        )
      }
    }
  }

  for (const name of afterByName.keys()) {
    if (!beforeByName.has(name)) changed = true
  }

  return { changed, breaking }
}

/** Compare two schemas. */
export function diffSchemas(before: BotApiSchema, after: BotApiSchema): SchemaDiff {
  const breaking: string[] = []

  const beforeMethods = new Map(before.methods.map((method) => [method.name, method]))
  const afterMethods = new Map(after.methods.map((method) => [method.name, method]))
  const beforeObjects = new Map(before.objects.map((object) => [object.name, object]))
  const afterObjects = new Map(after.objects.map((object) => [object.name, object]))

  const methodsAdded = [...afterMethods.keys()].filter((name) => !beforeMethods.has(name))
  const methodsRemoved = [...beforeMethods.keys()].filter((name) => !afterMethods.has(name))
  const objectsAdded = [...afterObjects.keys()].filter((name) => !beforeObjects.has(name))
  const objectsRemoved = [...beforeObjects.keys()].filter((name) => !afterObjects.has(name))

  for (const name of methodsRemoved) breaking.push(`method ${name} removed`)
  for (const name of objectsRemoved) breaking.push(`object ${name} removed`)

  const methodsChanged: string[] = []
  for (const [name, method] of beforeMethods) {
    const next = afterMethods.get(name)
    if (next === undefined) continue

    const fields = diffFields(name, method.parameters, next.parameters)
    breaking.push(...fields.breaking)

    const returnsChanged = renderType(method.returns) !== renderType(next.returns)
    if (returnsChanged) {
      breaking.push(
        `${name} return type: ${renderType(method.returns)} -> ${renderType(next.returns)}`,
      )
    }

    if (fields.changed || returnsChanged) methodsChanged.push(name)
  }

  const objectsChanged: string[] = []
  for (const [name, object] of beforeObjects) {
    const next = afterObjects.get(name)
    if (next === undefined) continue

    const fields = diffFields(name, object.fields, next.fields)
    breaking.push(...fields.breaking)
    if (fields.changed) objectsChanged.push(name)
  }

  return {
    from: before.version,
    to: after.version,
    methodsAdded,
    methodsRemoved,
    methodsChanged,
    objectsAdded,
    objectsRemoved,
    objectsChanged,
    breaking,
  }
}

/** Render a diff as the body of a review request. */
export function formatDiff(diff: SchemaDiff): string {
  const lines: string[] = [`Bot API ${diff.from} -> ${diff.to}`, '']

  const section = (label: string, names: readonly string[]): void => {
    if (names.length === 0) return
    lines.push(`${label}: ${names.length}`)
    for (const name of names.slice(0, 30)) lines.push(`  ${name}`)
    if (names.length > 30) lines.push(`  … and ${names.length - 30} more`)
    lines.push('')
  }

  section('Methods added', diff.methodsAdded)
  section('Methods removed', diff.methodsRemoved)
  section('Methods changed', diff.methodsChanged)
  section('Objects added', diff.objectsAdded)
  section('Objects removed', diff.objectsRemoved)
  section('Objects changed', diff.objectsChanged)

  if (diff.breaking.length === 0) {
    lines.push('Breaking: none detected')
  } else {
    lines.push(`Breaking: ${diff.breaking.length}`)
    for (const item of diff.breaking.slice(0, 30)) lines.push(`  ${item}`)
    if (diff.breaking.length > 30) lines.push(`  … and ${diff.breaking.length - 30} more`)
  }

  const unchanged =
    diff.methodsAdded.length === 0 &&
    diff.methodsRemoved.length === 0 &&
    diff.methodsChanged.length === 0 &&
    diff.objectsAdded.length === 0 &&
    diff.objectsRemoved.length === 0 &&
    diff.objectsChanged.length === 0

  return unchanged ? `Bot API ${diff.to}: no surface changes.` : lines.join('\n')
}
