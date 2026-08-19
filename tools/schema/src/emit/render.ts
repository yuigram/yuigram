/**
 * Shared rendering helpers for the emitters.
 *
 * Everything here is deterministic: identical input must produce byte-identical
 * output on any machine, or drift detection becomes noise and stops being read.
 * That means stable ordering everywhere and no timestamps in the output body.
 */

import type { Field, TypeRef } from '../bot-api/ir.js'

/** Names that would collide with a TypeScript or global identifier. */
const RESERVED = new Set(['function', 'default', 'new', 'delete', 'class', 'return', 'void'])

/** Convert `snake_case` to `PascalCase`. */
export function pascalCase(name: string): string {
  return name
    .split(/[_\s]+/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** Convert a documentation section heading to a file slug. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Render a type reference as TypeScript.
 *
 * `true` stays `true` rather than becoming `boolean`: Telegram only ever sends
 * the field when it is true, so widening it would make an absent field
 * indistinguishable from an explicit false.
 */
export function renderType(type: TypeRef): string {
  switch (type.kind) {
    case 'string':
      return 'string'
    case 'integer':
    case 'float':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'true':
      return 'true'
    case 'file':
      return 'InputFile'
    case 'literal':
      return JSON.stringify(type.value)
    case 'array': {
      const inner = renderType(type.of)
      // Unions need parentheses inside an array, or `A | B[]` parses wrongly.
      return type.of.kind === 'union' ? `Array<${inner}>` : `${inner}[]`
    }
    case 'union':
      return type.of.map(renderType).join(' | ')
    case 'reference':
      return type.name
  }
}

/** Quote a property name only when it is not a plain identifier. */
export function propertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !RESERVED.has(name)
    ? name
    : JSON.stringify(name)
}

/** Escape a description so it is safe inside a block comment. */
function escapeComment(text: string): string {
  return text.replace(/\*\//g, '*\\/')
}

/** Wrap text to a column width, for readable generated comments. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter((word) => word !== '')
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    if (line === '') {
      line = word
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`
    } else {
      lines.push(line)
      line = word
    }
  }

  if (line !== '') lines.push(line)
  return lines
}

/** Render a JSDoc block, or nothing when there is no content. */
export function renderDoc(description: string, link?: string, indent = ''): string {
  const body = escapeComment(description).trim()
  if (body === '' && link === undefined) return ''

  const lines = wrap(body, 76)
  const out: string[] = [`${indent}/**`]

  for (const line of lines) out.push(`${indent} * ${line}`)
  if (link !== undefined) {
    if (lines.length > 0) out.push(`${indent} *`)
    out.push(`${indent} * @see ${link}`)
  }

  out.push(`${indent} */`)
  return `${out.join('\n')}\n`
}

/** Render one interface member. */
export function renderField(field: Field, indent = '  '): string {
  const doc = renderDoc(field.description, undefined, indent)
  const optional = field.required ? '' : '?'
  const type = renderType(field.type)

  // `exactOptionalPropertyTypes` is on, so an optional field that may also be
  // sent as undefined has to say so explicitly.
  const value = field.required ? type : `${type} | undefined`

  return `${doc}${indent}readonly ${propertyName(field.name)}${optional}: ${value}\n`
}

/** Render a parameter member, which callers construct rather than receive. */
export function renderParameter(field: Field, indent = '  '): string {
  const doc = renderDoc(field.description, undefined, indent)
  const optional = field.required ? '' : '?'
  const type = renderType(field.type)
  const value = field.required ? type : `${type} | undefined`

  return `${doc}${indent}${propertyName(field.name)}${optional}: ${value}\n`
}

/** Standard header for every generated file. */
export function header(sourceVersion: string, description: string): string {
  return [
    '// GENERATED FILE — do not edit.',
    `// ${description}`,
    `// Source: Telegram Bot API ${sourceVersion}, schemas/bot-api/${sourceVersion}.json`,
    '',
    '',
  ].join('\n')
}
