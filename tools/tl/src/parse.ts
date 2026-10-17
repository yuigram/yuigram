// SPDX-License-Identifier: MIT

/**
 * The TL grammar parser.
 *
 * ```
 * name#id {G:Type} field:Type opt:flags.3?Type = ResultType;
 * ```
 *
 * The parse is **total**. Every non-blank line of a schema is either recognised
 * and represented, or it raises. There is no permissive mode and no bucket for
 * lines the parser does not understand: a parser that skips what it cannot read
 * produces a codec that is correct for everything it knows about and silently
 * absent for the rest, and nothing downstream can tell the difference.
 *
 * Diagnostics name the document, the line number and the construct, because a
 * schema is 2,300 lines and "parse error" is not a starting point.
 */

import { canonicalizable, computeId } from './crc.js'
import {
  TL_PRIMITIVE_NAMES,
  type TlCombinator,
  type TlIdOrigin,
  type TlParam,
  type TlSchema,
  type TlTable,
  type TlType,
} from './ir.js'

/** A schema the parser refused, with the position that caused it. */
export class TlParseError extends Error {
  /** The document being read. */
  readonly document: string
  /** One-based line number. */
  readonly line: number

  constructor(document: string, line: number, message: string) {
    super(`${document}:${line}: ${message}`)
    this.name = 'TlParseError'
    this.document = document
    this.line = line
  }
}

/** Where a schema came from, and which table it becomes. */
export interface ParseOptions {
  /** Name used in diagnostics — the file the text was read from. */
  readonly document: string
  /** Which table these definitions belong to. */
  readonly table: TlTable
  /** Layer number, for the versioned API schema. */
  readonly layer?: number
}

/**
 * The only anonymous body elements the language uses.
 *
 * An opaque builtin body, a bare natural, or a repetition. Anything else
 * without a name is a malformed parameter rather than a positional field.
 */
const ANONYMOUS = /^(?:\?|#|(?:\d+\s*\*\s*)?\[.*\])$/

/**
 * Field names a decoded value cannot carry.
 *
 * A decoded value is a plain object whose keys are field names, with the
 * constructor's own name under `_`. Two names collide with that representation
 * and both fail silently rather than loudly:
 *
 * - `_` overwrites the constructor discriminator, so the value loses the one
 *   property that says what it is. The writer then cannot dispatch it and the
 *   reader's output is indistinguishable from a different constructor's.
 * - `__proto__` sets the prototype instead of becoming a property, so the field
 *   disappears with no error anywhere.
 *
 * Neither appears in any published schema. Rejecting them here means a schema
 * that introduced one fails at the fetch that introduced it, rather than
 * decoding incorrectly in a running client. The alternative — guarding every
 * assignment in the reader — would put a check on the hot path for a condition
 * the schema can be proven not to contain.
 */
const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set(['_', '__proto__'])

/** Marks the start of the method section. */
const FUNCTIONS_MARKER = '---functions---'
/** Marks a return to the constructor section. */
const TYPES_MARKER = '---types---'

/**
 * Parse a `.tl` document.
 *
 * Blank lines and `//` comments are skipped; everything else must be a section
 * marker or a combinator.
 */
export function parseSchema(text: string, options: ParseOptions): TlSchema {
  const constructors: TlCombinator[] = []
  const methods: TlCombinator[] = []
  let section: 'types' | 'functions' = 'types'

  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const line = index + 1
    const trimmed = stripComment(raw).trim()

    if (trimmed.length === 0) continue

    if (trimmed === FUNCTIONS_MARKER) {
      section = 'functions'
      continue
    }
    if (trimmed === TYPES_MARKER) {
      section = 'types'
      continue
    }
    if (trimmed.startsWith('---')) {
      throw new TlParseError(options.document, line, `unrecognised section marker '${trimmed}'`)
    }

    const combinator = parseCombinator(trimmed, options.document, line)
    if (section === 'types') constructors.push(combinator)
    else methods.push(combinator)
  }

  rejectDuplicates(constructors, methods, options.document)

  return {
    table: options.table,
    layer: options.layer ?? null,
    constructors,
    methods,
  }
}

/** Remove a trailing `//` comment, which the published schemas do use. */
function stripComment(line: string): string {
  const marker = line.indexOf('//')
  return marker === -1 ? line : line.slice(0, marker)
}

/**
 * Two combinators sharing an id or a name inside one table.
 *
 * The registry is keyed by both, so either duplicate would silently lose one of
 * them. Checked here rather than only at registry construction, because the
 * schema and its intermediate representation are committed: a duplicate that
 * slipped through would be reviewed, merged, and fail later at import time
 * instead of at the fetch that introduced it.
 *
 * Constructors and methods are checked together because both are dispatched
 * from the same table.
 */
function rejectDuplicates(
  constructors: readonly TlCombinator[],
  methods: readonly TlCombinator[],
  document: string,
): void {
  const byId = new Map<number, string>()
  const byName = new Map<string, number>()

  for (const combinator of [...constructors, ...methods]) {
    const previousName = byName.get(combinator.name)
    if (previousName !== undefined) {
      throw new TlParseError(
        document,
        combinator.line,
        `'${combinator.name}' is already defined on line ${previousName}`,
      )
    }
    byName.set(combinator.name, combinator.line)

    // Builtins share the placeholder id 0 because none of them has one.
    if (combinator.idOrigin === 'builtin') continue

    const previousId = byId.get(combinator.id)
    if (previousId !== undefined) {
      throw new TlParseError(
        document,
        combinator.line,
        `id 0x${combinator.id.toString(16)} is already used by '${previousId}'`,
      )
    }
    byId.set(combinator.id, combinator.name)
  }
}

/** Parse one `name#id args = Result;` definition. */
function parseCombinator(definition: string, document: string, line: number): TlCombinator {
  if (!definition.endsWith(';')) {
    throw new TlParseError(document, line, 'definition does not end with ";"')
  }

  const body = definition.slice(0, -1).trim()
  const equals = splitOnResult(body)
  if (equals === null) {
    throw new TlParseError(document, line, 'definition has no "= ResultType" part')
  }

  const [head, resultText] = equals
  const tokens = tokenizeHead(head)
  const nameToken = tokens.shift()
  if (nameToken === undefined) {
    throw new TlParseError(document, line, 'definition has no name')
  }

  const { name, declaredId } = parseName(nameToken, document, line)
  const namespaceSplit = name.lastIndexOf('.')
  const generics: string[] = []
  const params: TlParam[] = []
  const bitfields = new Set<string>()

  for (const token of tokens) {
    const generic = /^\{(\w+):Type\}$/.exec(token)
    if (generic !== null) {
      generics.push(generic[1] ?? '')
      continue
    }

    // An anonymous positional element, which only the language's own builtin
    // declarations use: `int ? = Int;`, `int128 4*[ int ] = Int128;`, and the
    // polymorphic vector's `# [ t ]`. Restricted to those three shapes so that
    // a mistyped parameter — `a:int b = Sample;` — is still rejected instead of
    // being read as an anonymous field of type `b`.
    if (!token.includes(':')) {
      if (!ANONYMOUS.test(token)) {
        throw new TlParseError(document, line, `parameter '${token}' has no ":"`)
      }

      params.push({
        kind: 'field',
        name: `_${params.length}`,
        type: parseType(token, generics, document, line),
        conditional: null,
      })
      continue
    }

    params.push(parseParam(token, bitfields, generics, document, line))
  }

  const result = parseType(resultText, generics, document, line)
  const id = resolveId(definition, declaredId, document, line)

  return {
    name,
    namespace: namespaceSplit === -1 ? null : name.slice(0, namespaceSplit),
    shortName: namespaceSplit === -1 ? name : name.slice(namespaceSplit + 1),
    id: id.value,
    idOrigin: id.origin,
    generics,
    params,
    result,
    line,
  }
}

/**
 * Split a definition at the `=` that introduces its result type.
 *
 * Not simply the last `=`: nothing else in the grammar uses one, but splitting
 * on the first keeps the failure mode obvious if that ever stops being true.
 */
function splitOnResult(body: string): [string, string] | null {
  const equals = body.indexOf('=')
  if (equals === -1) return null

  return [body.slice(0, equals).trim(), body.slice(equals + 1).trim()]
}

/**
 * Split a definition's head into tokens.
 *
 * Whitespace separates tokens except inside brackets: the builtin declarations
 * write repetitions as `[ t ]` and `4*[ int ]`, which a plain whitespace split
 * would tear into pieces that mean nothing on their own.
 */
function tokenizeHead(head: string): string[] {
  const tokens: string[] = []
  let current = ''
  let depth = 0

  for (const character of head) {
    if (character === '[') depth += 1
    if (character === ']') depth -= 1

    if (/\s/.test(character) && depth === 0) {
      if (current.length > 0) tokens.push(current)
      current = ''
      continue
    }

    current += character
  }

  if (current.length > 0) tokens.push(current)
  return tokens
}

/** Read `name` or `name#deadbeef`. */
function parseName(
  token: string,
  document: string,
  line: number,
): { name: string; declaredId: number | null } {
  const withId = /^([\w.]+)#([0-9a-fA-F]{1,8})$/.exec(token)
  if (withId !== null) {
    return { name: withId[1] ?? '', declaredId: Number.parseInt(withId[2] ?? '', 16) }
  }

  if (/^[\w.]+$/.test(token)) return { name: token, declaredId: null }

  throw new TlParseError(document, line, `'${token}' is not a valid combinator name`)
}

/**
 * Establish the combinator's id, preferring computation over declaration.
 *
 * Where the signature is canonicalizable, the id is computed and the declared
 * value must agree — that comparison is the parser's own correctness check, and
 * a disagreement means either the canonicalization or the reading is wrong.
 * Where it is not, the schema's value stands and the origin records why.
 */
function resolveId(
  definition: string,
  declaredId: number | null,
  document: string,
  line: number,
): { value: number; origin: TlIdOrigin } {
  if (!canonicalizable(definition)) {
    // A builtin declares neither an id nor a wire form: it names a primitive
    // the codec implements directly. Anything else outside the canonicalization
    // must declare its id, because there is no other way to learn it.
    if (declaredId === null) return { value: 0, origin: 'builtin' }

    return { value: declaredId, origin: 'declared' }
  }

  const computed = computeId(definition)
  if (declaredId === null) return { value: computed, origin: 'computed' }

  if (computed !== declaredId) {
    throw new TlParseError(
      document,
      line,
      `declared id 0x${declaredId.toString(16).padStart(8, '0')} does not match the computed ` +
        `0x${computed.toString(16).padStart(8, '0')}`,
    )
  }

  return { value: declaredId, origin: 'verified' }
}

/** Read `name:Type`, `flags:#` or `name:flags.3?Type`. */
function parseParam(
  token: string,
  bitfields: Set<string>,
  generics: readonly string[],
  document: string,
  line: number,
): TlParam {
  const colon = token.indexOf(':')
  if (colon === -1) {
    throw new TlParseError(document, line, `parameter '${token}' has no ":"`)
  }

  const name = token.slice(0, colon)
  const typeText = token.slice(colon + 1)

  if (!/^\w+$/.test(name)) {
    throw new TlParseError(document, line, `'${name}' is not a valid parameter name`)
  }

  if (RESERVED_FIELD_NAMES.has(name)) {
    throw new TlParseError(document, line, `'${name}' cannot be used as a field name`)
  }

  if (typeText === '#') {
    bitfields.add(name)
    return { kind: 'bitfield', name }
  }

  const conditional = /^(\w+)\.(\d+)\?(.+)$/.exec(typeText)
  if (conditional === null) {
    return {
      kind: 'field',
      name,
      type: parseType(typeText, generics, document, line),
      conditional: null,
    }
  }

  const field = conditional[1] ?? ''
  const bit = Number.parseInt(conditional[2] ?? '', 10)

  if (!bitfields.has(field)) {
    throw new TlParseError(
      document,
      line,
      `parameter '${name}' is conditional on '${field}', which is not a declared bitfield`,
    )
  }
  if (!Number.isInteger(bit) || bit < 0 || bit > 31) {
    throw new TlParseError(document, line, `bit index ${bit} on '${name}' is outside 0..31`)
  }

  return {
    kind: 'field',
    name,
    type: parseType(conditional[3] ?? '', generics, document, line),
    conditional: { field, bit },
  }
}

/** Read a type expression. */
export function parseType(
  text: string,
  generics: readonly string[],
  document: string,
  line: number,
): TlType {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    throw new TlParseError(document, line, 'empty type expression')
  }

  return (
    parseMarked(trimmed, generics, document, line) ??
    parseCompound(trimmed, generics, document, line) ??
    parseAtom(trimmed, generics, document, line)
  )
}

/** The forms a leading punctuation mark identifies: `?`, `!X`, `%Type`. */
function parseMarked(
  trimmed: string,
  generics: readonly string[],
  document: string,
  line: number,
): TlType | null {
  if (trimmed === '?') return { kind: 'opaque' }

  if (trimmed.startsWith('!')) {
    const name = trimmed.slice(1)
    if (!generics.includes(name)) {
      throw new TlParseError(document, line, `'!${name}' refers to an undeclared generic parameter`)
    }
    return { kind: 'generic', name }
  }

  if (trimmed.startsWith('%')) {
    const inner = trimmed.slice(1)
    if (!/^[\w.]+$/.test(inner)) {
      throw new TlParseError(document, line, `'${trimmed}' is not a valid bare type reference`)
    }
    return { kind: 'named', name: inner, bare: true }
  }

  return null
}

/** The forms that contain another type: repetitions and vectors. */
function parseCompound(
  trimmed: string,
  generics: readonly string[],
  document: string,
  line: number,
): TlType | null {
  const repeat = /^(?:(\d+)\s*\*\s*)?\[\s*(.+?)\s*\]$/.exec(trimmed)
  if (repeat !== null) {
    const count = repeat[1] === undefined ? null : Number.parseInt(repeat[1], 10)
    return { kind: 'repeat', count, item: parseType(repeat[2] ?? '', generics, document, line) }
  }

  const vector = /^([Vv]ector)<(.+)>$/.exec(trimmed)
  if (vector !== null) {
    // The lowercase spelling is bare: it omits the vector constructor id that
    // the boxed form carries.
    return {
      kind: 'vector',
      item: parseType(vector[2] ?? '', generics, document, line),
      bare: vector[1] === 'vector',
    }
  }

  return null
}

/** A primitive, a reference, or the parameterized result of a builtin. */
function parseAtom(
  trimmed: string,
  generics: readonly string[],
  document: string,
  line: number,
): TlType {
  const primitive = TL_PRIMITIVE_NAMES.get(trimmed)
  if (primitive !== undefined) return { kind: 'primitive', name: primitive }

  if (/^[\w.]+$/.test(trimmed)) {
    // A result type may name a generic parameter without the `!` marker, which
    // is how `invokeWithLayer` says it returns whatever it wrapped.
    if (generics.includes(trimmed)) return { kind: 'generic', name: trimmed }

    // A lowercase reference names a constructor rather than a type, and is
    // therefore bare: the value carries no identifier of its own.
    const bare = /^[a-z]/.test(trimmed) && !trimmed.includes('.')
    return { kind: 'named', name: trimmed, bare }
  }

  // A parameterized result such as `Vector t`, which only the builtin vector
  // declaration uses.
  const parameterized = /^([A-Za-z_][\w.]*)\s+([A-Za-z_]\w*)$/.exec(trimmed)
  if (parameterized !== null) {
    return { kind: 'named', name: parameterized[1] ?? '', bare: false }
  }

  throw new TlParseError(document, line, `'${trimmed}' is not a valid type expression`)
}
