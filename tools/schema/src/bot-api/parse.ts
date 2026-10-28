// SPDX-License-Identifier: MIT

/**
 * Parses the Bot API documentation into the IR.
 *
 * The documentation is a flat sequence of `<h4>` headings, each followed by
 * prose and optionally a table. Methods start with a lowercase letter and
 * objects with an uppercase one — a convention Telegram has never broken, and
 * one the parser asserts rather than assumes, since the counts are verified
 * against the release notes.
 *
 * Tables are matched by their header row rather than by position. A global
 * scan for `<td>` pairs also picks up unrelated tables in the guide sections
 * (the profile-colour table, for one), which is exactly the kind of quiet
 * corruption a committed schema is meant to make visible.
 */

import type { HTMLElement } from 'node-html-parser'
import { parse as parseHtml } from 'node-html-parser'
import type { BotApiSchema, Field, Method, ObjectType, TypeRef } from './ir.js'
import { containsFile, parseTypeExpression } from './type-expression.js'

/** Header cells identifying a field table on an object. */
const OBJECT_HEADERS = ['Field', 'Type', 'Description']

/** Header cells identifying a parameter table on a method. */
const METHOD_HEADERS = ['Parameter', 'Type', 'Required', 'Description']

/** A single `<h4>` section with the nodes that follow it. */
interface Section {
  readonly anchor: string
  readonly title: string
  /** The `<h3>` heading this falls under, used to group generated output. */
  readonly group: string
  readonly description: string
  readonly table: HTMLElement | undefined
  readonly subtypes: readonly string[]
}

/** Collapse whitespace and trim. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** What a section has read so far, below its heading. */
interface SectionBody {
  readonly paragraphs: string[]
  table: HTMLElement | undefined
  subtypes: readonly string[]
}

/** Read one node below a section's heading into the section. */
function readBodyNode(node: HTMLElement, body: SectionBody): void {
  if (node.tagName === 'TABLE') {
    body.table ??= node
    return
  }

  // Prose after the table belongs to the next topic, not this one.
  if (body.table !== undefined) return

  if (node.tagName === 'P') {
    body.paragraphs.push(normalize(node.textContent))
  } else if (node.tagName === 'UL') {
    // A list of type names is an abstract type's variants. Any other list is
    // part of the prose, and is read into it in place: the staging
    // documentation turns the "- " lines of a paragraph into lists, and moves
    // the sentence that states the return type into the last item.
    const variants = readSubtypes(node)
    if (variants !== undefined) body.subtypes = variants
    else body.paragraphs.push(readProseList(node))
  }
}

/** Split the document into `<h4>` sections. */
function collectSections(root: HTMLElement): Section[] {
  const sections: Section[] = []
  const children = root.querySelectorAll('h3, h4, p, table, ul')

  let current: { anchor: string; title: string; group: string } | undefined
  let group = 'General'
  let body: SectionBody = { paragraphs: [], table: undefined, subtypes: [] }

  const flush = (): void => {
    if (current === undefined) return
    sections.push({
      anchor: current.anchor,
      title: current.title,
      group: current.group,
      description: normalize(body.paragraphs.join(' ')),
      table: body.table,
      subtypes: body.subtypes,
    })
  }

  for (const node of children) {
    if (node.tagName === 'H3') {
      flush()
      current = undefined
      group = normalize(node.textContent)
    } else if (node.tagName === 'H4') {
      flush()
      const anchor = node.querySelector('a.anchor')?.getAttribute('name') ?? ''
      current = { anchor, title: normalize(node.textContent), group }
      body = { paragraphs: [], table: undefined, subtypes: [] }
    } else if (current !== undefined) {
      readBodyNode(node, body)
    }
  }

  flush()
  return sections
}

/**
 * Read the variant list of an abstract type.
 *
 * Abstract types are documented as "It should be one of" followed by a list of
 * type names. Any other list is prose and is ignored.
 */
function readSubtypes(node: HTMLElement): string[] | undefined {
  const items = node.querySelectorAll('li').map((li) => normalize(li.textContent))
  if (items.length === 0) return undefined
  return items.every((item) => /^[A-Z][A-Za-z0-9]*$/.test(item)) ? items : undefined
}

/** A list in the prose, as the "- " lines the stable documentation writes it in. */
function readProseList(node: HTMLElement): string {
  return node
    .querySelectorAll('li')
    .map((li) => `- ${normalize(li.textContent)}`)
    .join(' ')
}

/** Whether a table's header row matches the expected columns. */
function hasHeaders(table: HTMLElement, expected: readonly string[]): boolean {
  const headers = table.querySelectorAll('th').map((th) => normalize(th.textContent))
  return (
    headers.length === expected.length && expected.every((name, index) => headers[index] === name)
  )
}

/** Read a table's body rows as arrays of cell text. */
function readRows(table: HTMLElement): string[][] {
  return table
    .querySelectorAll('tbody tr')
    .map((tr) => tr.querySelectorAll('td').map((td) => normalize(td.textContent)))
}

/**
 * Parse an object's field table.
 *
 * Optionality lives in the description, which begins with `Optional.` — there
 * is no dedicated column as there is for method parameters.
 */
function parseObjectFields(table: HTMLElement): Field[] {
  return readRows(table).flatMap((cells): Field[] => {
    const [name, typeText, description = ''] = cells
    if (name === undefined || typeText === undefined) return []

    const optional = /^Optional\b/i.test(description)

    return [
      {
        name,
        type: parseTypeExpression(typeText),
        required: !optional,
        description: optional ? description.replace(/^Optional\.\s*/i, '') : description,
      },
    ]
  })
}

/** Parse a method's parameter table, where optionality has its own column. */
function parseMethodParameters(table: HTMLElement): Field[] {
  return readRows(table).flatMap((cells): Field[] => {
    const [name, typeText, required, description = ''] = cells
    if (name === undefined || typeText === undefined) return []

    return [
      {
        name,
        type: parseTypeExpression(typeText),
        required: /^Yes$/i.test(required ?? ''),
        description,
      },
    ]
  })
}

/** Callback used by the return-type collectors. */
type AddReturn = (type: TypeRef, key: string) => void

/** Collect `Array of X` returns. */
function collectArrayReturns(sentence: string, add: AddReturn): void {
  for (const match of sentence.matchAll(/\bArray of ([A-Z][A-Za-z0-9]*)\b/g)) {
    const name = match[1]
    if (name !== undefined) add({ kind: 'array', of: { kind: 'reference', name } }, `[]${name}`)
  }
}

/**
 * Collect scalar returns.
 *
 * Claimed before the reference scan, or `String` and `Integer` are emitted as
 * references to objects that do not exist.
 */
function collectScalarReturns(sentence: string, add: AddReturn): void {
  if (/\bTrue\b/.test(sentence)) add({ kind: 'true' }, 'True')
  if (/\bString\b/.test(sentence)) add({ kind: 'string' }, 'String')
  if (/\bInteger\b/.test(sentence)) add({ kind: 'integer' }, 'Integer')
}

/** Collect object returns, skipping prose nouns and sentence-initial words. */
function collectReferenceReturns(
  sentence: string,
  seen: ReadonlySet<string>,
  objects: ReadonlySet<string>,
  add: AddReturn,
): void {
  for (const match of sentence.matchAll(/\b([A-Z][A-Za-z0-9]*)\b/g)) {
    const name = match[1]
    if (name === undefined) continue
    if (SCALAR_RETURN_NAMES.has(name)) continue
    // An internal capital marks a type name. A single word is one only where
    // the page defines an object by it, or the known list names it.
    if (!/^[A-Z][a-z]*[A-Z]/.test(name) && !objects.has(name) && !KNOWN_RETURN_NAMES.has(name)) {
      continue
    }
    if (seen.has(`[]${name}`)) continue
    add({ kind: 'reference', name }, name)
  }
}

/**
 * Infer a method's return type from its description.
 *
 * Telegram states returns in prose, in a handful of recurring shapes:
 *
 * - "On success, the sent Message is returned."
 * - "Returns True on success."
 * - "Returns an Array of Update objects."
 * - "... the edited Message is returned, otherwise True is returned."
 *
 * Sentences mentioning a return are scanned for type names, and several
 * distinct results become a union — which is the honest reading of the last
 * shape above.
 *
 * `objects` is every object the page defines. A single-word name such as
 * `Gifts` has no internal capital to mark it as a type, and without the set
 * it falls through to a boolean.
 */
export function inferReturnType(
  description: string,
  objects: ReadonlySet<string> = new Set(),
): TypeRef {
  const sentences = description
    .split(/(?<=\.)\s+/)
    .filter((sentence) => /\breturn(s|ed|ing)?\b/i.test(sentence))

  if (sentences.length === 0) return { kind: 'boolean' }

  const found: TypeRef[] = []
  const seen = new Set<string>()

  const add = (type: TypeRef, key: string): void => {
    if (seen.has(key)) return
    seen.add(key)
    found.push(type)
  }

  for (const sentence of sentences) {
    collectArrayReturns(sentence, add)
    collectScalarReturns(sentence, add)
    collectReferenceReturns(sentence, seen, objects, add)
  }

  if (found.length === 0) return { kind: 'boolean' }
  if (found.length === 1) return found[0] as TypeRef

  // Put the substantive type first: `Message | true` reads better than
  // `true | Message`, and the object is what callers care about.
  const rank = (type: TypeRef): number => (type.kind === 'true' || type.kind === 'boolean' ? 1 : 0)
  return { kind: 'union', of: [...found].sort((a, b) => rank(a) - rank(b)) }
}

/**
 * Single-word type names that appear in return prose.
 *
 * The general heuristic requires an internal capital (`ChatMember`), which
 * would otherwise miss these. Listing them explicitly keeps ordinary sentence
 * nouns from being mistaken for types.
 */
const KNOWN_RETURN_NAMES: ReadonlySet<string> = new Set([
  'Message',
  'User',
  'Chat',
  'File',
  'Poll',
  'Update',
  'Sticker',
  'Gift',
  'Story',
])

/** Scalar names that must never be treated as object references. */
const SCALAR_RETURN_NAMES: ReadonlySet<string> = new Set([
  'True',
  'False',
  'String',
  'Integer',
  'Float',
  'Boolean',
])

/**
 * The groups that describe how the API is used rather than what it is.
 *
 * Their sections are prose, and a one-word heading among them reads like an
 * object's name: the staging documentation added `Errors` under `Making
 * requests`, which became an object with no fields and a type nothing used.
 * Nothing the API defines has ever been documented under these.
 */
const PROSE_GROUPS: ReadonlySet<string> = new Set([
  'Recent changes',
  'Authorizing your bot',
  'Making requests',
  'Using a Local Bot API Server',
])

/** Parse the full documentation page. */
export function parseBotApi(html: string, sourceUrl: string): BotApiSchema {
  const root = parseHtml(html)
  const sections = collectSections(root).filter((section) => !PROSE_GROUPS.has(section.group))
  // Every object the page defines, known before any method is read, so a
  // return that names one is recognised wherever on the page it is declared.
  const objectNames = new Set(
    sections.map((section) => section.title).filter((title) => /^[A-Z][A-Za-z0-9]*$/.test(title)),
  )

  const methods: Method[] = []
  const objects: ObjectType[] = []

  for (const section of sections) {
    const { title } = section
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(title)) continue

    const documentationLink = `${sourceUrl}#${section.anchor}`
    const isMethod = /^[a-z]/.test(title)

    if (isMethod) {
      const table =
        section.table !== undefined && hasHeaders(section.table, METHOD_HEADERS)
          ? section.table
          : undefined

      const parameters = table === undefined ? [] : parseMethodParameters(table)

      methods.push({
        name: title,
        group: section.group,
        description: section.description,
        documentationLink,
        parameters,
        returns: inferReturnType(section.description, objectNames),
        hasFileParameter: parameters.some((parameter) => containsFile(parameter.type)),
      })
      continue
    }

    const table =
      section.table !== undefined && hasHeaders(section.table, OBJECT_HEADERS)
        ? section.table
        : undefined

    objects.push({
      name: title,
      group: section.group,
      description: section.description,
      documentationLink,
      fields: table === undefined ? [] : parseObjectFields(table),
      ...(section.subtypes.length > 0 ? { subtypes: section.subtypes } : {}),
    })
  }

  return {
    version: extractVersion(root),
    releasedAt: extractReleaseDate(root),
    source: { url: sourceUrl, fetchedAt: new Date().toISOString() },
    methods,
    objects,
  }
}

/** Read the Bot API version from the recent-changes heading. */
function extractVersion(root: HTMLElement): string {
  const match = /Bot API (\d+\.\d+)/.exec(root.textContent)
  return match?.[1] ?? 'unknown'
}

/** Read the release date of the most recent change. */
function extractReleaseDate(root: HTMLElement): string | null {
  const heading = root.querySelector('h4 a.anchor')?.getAttribute('name') ?? ''
  return /^[a-z]+-\d{1,2}-\d{4}$/.test(heading) ? heading : null
}
