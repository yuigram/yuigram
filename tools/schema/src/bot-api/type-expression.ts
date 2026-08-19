/**
 * Parses Telegram's prose type expressions into the IR.
 *
 * The grammar the documentation actually uses is small, but it has two
 * spellings for a union and lets `Array of` wrap one:
 *
 * ```
 * type   := 'Array of ' type | union
 * union  := atom (' or ' atom)*             -- "A or B or C"
 *         | atom (', ' atom)* ' and ' atom  -- "A, B, C and D"
 * atom   := 'String' | 'Integer' | 'Float' | 'Float number'
 *         | 'Boolean' | 'True' | 'False' | 'InputFile' | Reference
 * ```
 *
 * The comma spelling appears exactly once in Bot API 10.2, nested inside an
 * array — `sendMediaGroup`'s `media` parameter. It was missed by a first survey
 * and caught only because an unrecognised atom throws rather than degrading to
 * `unknown`. Failing loudly on an unhandled form is what makes a schema
 * regeneration reviewable instead of quietly wrong.
 *
 * Surveying every field and parameter table in Bot API 10.2 produced 218
 * distinct type strings, all of which this grammar covers.
 */

import type { TypeRef } from './ir.js'

/** Scalars Telegram writes by name, with the spellings it actually uses. */
const SCALARS: ReadonlyMap<string, TypeRef> = new Map<string, TypeRef>([
  ['String', { kind: 'string' }],
  ['Integer', { kind: 'integer' }],
  ['Int', { kind: 'integer' }],
  ['Float', { kind: 'float' }],
  ['Float number', { kind: 'float' }],
  ['Boolean', { kind: 'boolean' }],
  // Distinct from Boolean: the field is present only when true, never false.
  ['True', { kind: 'true' }],
  ['False', { kind: 'boolean' }],
  ['InputFile', { kind: 'file' }],
])

/** Raised when a type expression falls outside the documented grammar. */
export class TypeExpressionError extends Error {
  override readonly name = 'TypeExpressionError'

  constructor(expression: string, reason: string) {
    super(`cannot parse type expression '${expression}': ${reason}`)
  }
}

/** Parse a type expression such as `Array of Integer` or `Integer or String`. */
export function parseTypeExpression(raw: string): TypeRef {
  const expression = raw.replace(/\s+/g, ' ').trim()

  if (expression === '') {
    throw new TypeExpressionError(raw, 'empty')
  }

  return parseType(expression, raw)
}

/**
 * `Array of` is matched before any union split, so it applies to the whole
 * remaining expression: `Array of A, B and C` is an array of a union, not a
 * union whose first member is an array.
 *
 * This precedence was checked against the corpus rather than assumed. In Bot
 * API 10.2 no expression combines `Array of` with ` or `, and the single
 * comma-spelled union appears only inside an array, so there is no case where
 * the two readings differ observably beyond this one.
 */
function parseType(expression: string, raw: string): TypeRef {
  const arrayPrefix = 'Array of '

  if (expression.startsWith(arrayPrefix)) {
    return { kind: 'array', of: parseType(expression.slice(arrayPrefix.length).trim(), raw) }
  }

  return parseUnion(expression, raw)
}

/** Parse a union, or fall through to a single atom. */
function parseUnion(expression: string, raw: string): TypeRef {
  const branches = splitUnion(expression)

  if (branches.length > 1) {
    return { kind: 'union', of: branches.map((branch) => parseType(branch, raw)) }
  }

  return parseAtom(expression, raw)
}

/**
 * Split a union written in either of Telegram's two spellings.
 *
 * A flat split is correct because `Array of` has already been stripped by the
 * caller and no documented expression mixes the two separators. A parenthesised
 * form would need real precedence handling; none exists.
 */
function splitUnion(expression: string): string[] {
  if (expression.includes(', ')) {
    // "A, B, C and D" — the final separator is spelled out.
    return expression
      .split(', ')
      .flatMap((part) => part.split(' and '))
      .map((part) => part.trim())
      .filter((part) => part !== '')
  }

  return expression.split(' or ').map((part) => part.trim())
}

/** Parse a scalar or a reference. */
function parseAtom(expression: string, raw: string): TypeRef {
  const scalar = SCALARS.get(expression)
  if (scalar !== undefined) return scalar

  if (/^[A-Z][A-Za-z0-9]*$/.test(expression)) {
    return { kind: 'reference', name: expression }
  }

  throw new TypeExpressionError(raw, `unrecognised atom '${expression}'`)
}

/** Whether a type can carry an uploadable file, at any depth. */
export function containsFile(type: TypeRef): boolean {
  switch (type.kind) {
    case 'file':
      return true
    case 'array':
      return containsFile(type.of)
    case 'union':
      return type.of.some(containsFile)
    default:
      return false
  }
}

/** Reference names appearing anywhere in a type, for dependency analysis. */
export function referencedNames(type: TypeRef, into = new Set<string>()): Set<string> {
  switch (type.kind) {
    case 'reference':
      into.add(type.name)
      break
    case 'array':
      referencedNames(type.of, into)
      break
    case 'union':
      for (const member of type.of) referencedNames(member, into)
      break
    default:
      break
  }
  return into
}
