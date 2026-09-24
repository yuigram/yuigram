/**
 * Text with formatting, as MTProto carries it.
 *
 * The Bot API takes markup and a `parse_mode` and does the parsing on the
 * server. MTProto has no such field: a message is plain text plus a list of
 * ranges, and producing those ranges is the client's job. Anything that wants
 * bold text over MTProto has to parse markup itself.
 *
 * ```
 *   "<b>Hello</b> there"  ──>  text:     "Hello there"
 *                              entities: [bold @0 length 5]
 * ```
 *
 * Offsets are counted in UTF-16 code units, which is exactly what a JavaScript
 * string index is. `text.slice(offset, offset + length)` therefore selects the
 * range an entity covers with no conversion — a coincidence worth relying on,
 * and worth stating, because it is not true of every language a client is
 * written in.
 */

import { MarkupParseError, ValidationError } from '@yuigram/core'
import type { TypeMessageEntity } from '../generated/api/types/index.js'
import { toTlEntities } from './neutral.js'

/**
 * A message's text and the ranges formatted within it.
 *
 * The shape a sending call wants: `messages.sendMessage` takes `message` and
 * `entities` as separate fields, so this spreads straight into one.
 */
export interface FormattedText {
  /** The text, with no markup left in it. */
  readonly text: string
  /** The ranges formatted within it, in the order they open. */
  readonly entities: readonly TypeMessageEntity[]
}

/**
 * What a formatting function accepts.
 *
 * Either a string of markup written by the developer, or a template literal
 * whose interpolated values are escaped on the way in. The second is the one to
 * reach for whenever a value came from someone else: a user called `<b>` breaks
 * markup assembled by concatenation, and the failure is a rejected call rather
 * than a cosmetic one.
 */
export type Markup = string | TemplateStringsArray

/**
 * How a parse treats markup that is not well formed.
 *
 * The names and meanings are the ones `@yuigram/core/format` uses, so the two
 * formatters agree on what each promises:
 *
 * - `lenient` keeps every range that is well formed and shows the rest as it
 *   was written. The default, because this is markup a developer typed rather
 *   than a document from the network.
 * - `strict` refuses what is not well formed with a {@link MarkupParseError}
 *   naming where.
 * - `partial` is lenient about the end: markup cut off there is held back
 *   rather than shown, and ranges still open run to the end — for text that is
 *   still arriving.
 */
export type MarkupMode = 'strict' | 'lenient' | 'partial'

/** What a parse is told besides the markup. */
export interface ParseSettings {
  readonly mode: MarkupMode
}

/**
 * Refuse, or let the caller recover.
 *
 * Returns only in the modes that recover, so a reader writes the recovery
 * after it.
 */
export function refuse(
  settings: ParseSettings,
  message: string,
  offset: number,
  source: string,
): void {
  if (settings.mode === 'strict') throw new MarkupParseError(message, offset, source)
}

/** Check a mode given by a caller, which may not have been typed. */
export function checkMode(mode: unknown): MarkupMode {
  if (mode === undefined) return 'lenient'
  if (mode === 'strict' || mode === 'lenient' || mode === 'partial') return mode

  throw new ValidationError(`'${String(mode)}' is not a markup mode: strict, lenient, partial`)
}

/**
 * Remove the indentation every line shares, as a template written inside
 * indented code carries it.
 *
 * Over the literal parts only: an interpolated value is kept as it is. The
 * first line is not counted, since it follows the backtick; a first line that
 * is empty and a last line that is only indentation are dropped, so
 *
 * ```ts
 * fromHtml.with({ whitespace: 'dedent' })`
 *   <b>Hello</b>
 *   there
 * `
 * ```
 *
 * reads as two lines with nothing around them.
 */
export function dedent(parts: readonly string[]): string[] {
  let indent = Number.POSITIVE_INFINITY

  // A value cannot break a line of the literal, so the lines are counted as
  // the literal parts have them, a value standing in for one character.
  const lines = parts.join('\u0000').split('\n')
  for (const line of lines.slice(1)) {
    const found = /^([ \t]*)[^ \t]/.exec(line)
    if (found !== null) indent = Math.min(indent, (found[1] as string).length)
  }
  if (indent === Number.POSITIVE_INFINITY) indent = 0

  const out = parts.map((part) =>
    part
      .split('\n')
      .map((line, row) => (row === 0 ? line : stripIndent(line, indent)))
      .join('\n'),
  )

  const first = out[0] ?? ''
  if (first.startsWith('\n')) out[0] = first.slice(1)
  const last = out.length - 1
  out[last] = (out[last] ?? '').replace(/\n[ \t]*$/, '')

  return out
}

/** Take up to `indent` spaces or tabs off the start of one line. */
function stripIndent(line: string, indent: number): string {
  let at = 0
  while (at < indent && (line[at] === ' ' || line[at] === '\t')) at += 1

  return line.slice(at)
}

/** Where in the markup an interpolated value lands, as far as escaping cares. */
export type Placement = 'text' | 'address'

/** What a dialect tells interpolation about itself. */
export interface Dialect {
  /**
   * Where a value placed after this much markup would land.
   *
   * An address or an attribute takes text rather than formatting, so a
   * formatted value there contributes its text alone.
   */
  placement(markupSoFar: string): Placement
  /** Escape text so that it stays text in an address or an attribute. */
  escapeAddress(text: string): string
}

/** Markup with its interpolated values set aside, to be put back after a parse. */
export interface Assembled {
  readonly markup: string
  /** The values the markup stands in for, by the number in each token. */
  readonly slots: readonly FormattedText[]
  /** The characters a token opens and closes with. */
  readonly token: { readonly open: string; readonly close: string }
}

/**
 * Assemble a template call, setting interpolated values aside.
 *
 * The literal parts are markup the developer wrote. A value is not: it is text,
 * or formatted text whose ranges are its own, and in neither case is it read as
 * markup. So in text it is replaced by a token the dialect has no meaning for,
 * the markup is parsed, and the value is put back where the token ended up —
 * with its ranges, where it had any, and inside whatever range the markup put
 * around it. A `<b>` in a user's name is text; a formatted value keeps its
 * bold without its bold being markup anyone could inject.
 *
 * In an attribute or a link's address a value is escaped and written into the
 * markup instead, because an address is not formatted. `null`, `undefined` and
 * booleans contribute nothing, so a condition can be written inline.
 */
export function assemble(
  parts: readonly string[],
  values: readonly unknown[],
  dialect: Dialect,
): Assembled {
  const token = tokenFor(parts, values)
  const slots: FormattedText[] = []
  let markup = parts[0] ?? ''

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]

    if (value !== null && value !== undefined && typeof value !== 'boolean') {
      const formatted = formattedOf(value)

      if (dialect.placement(markup) === 'text') {
        markup += `${token.open}${slots.length}${token.close}`
        slots.push(formatted)
      } else {
        markup += dialect.escapeAddress(formatted.text)
      }
    }

    markup += parts[index + 1] ?? ''
  }

  return { markup, slots, token }
}

/**
 * Two characters to mark a value's place with, that appear nowhere else.
 *
 * Unicode's noncharacters are set aside for exactly this — internal use,
 * never interchanged — and text a person wrote does not contain them. It is
 * still checked, and another pair taken where one appears.
 */
function tokenFor(
  parts: readonly string[],
  values: readonly unknown[],
): { readonly open: string; readonly close: string } {
  const everything = [...parts, ...values.map((value) => (typeof value === 'string' ? value : ''))]

  for (let pair = 0xfdd0; pair < 0xfdef; pair += 2) {
    const open = String.fromCharCode(pair)
    const close = String.fromCharCode(pair + 1)
    if (!everything.some((text) => text.includes(open) || text.includes(close))) {
      return { open, close }
    }
  }

  throw new ValidationError(
    'the markup uses every character set aside for marking values, so none is left to mark them with',
  )
}

/**
 * What an interpolated value contributes.
 *
 * Formatted text of this package's shape; the shared shape `@yuigram/core/format`
 * builds, whose ranges are converted; or anything else as its text.
 */
export function formattedOf(value: unknown): FormattedText {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { readonly text?: unknown; readonly entities?: unknown }

    if (typeof candidate.text === 'string' && Array.isArray(candidate.entities)) {
      const entities = candidate.entities as readonly Record<string, unknown>[]
      const shared = entities.length > 0 && typeof entities[0]?.['type'] === 'string'

      return {
        text: candidate.text,
        entities: shared
          ? toTlEntities(entities as never)
          : (entities as unknown as readonly TypeMessageEntity[]),
      }
    }
  }

  return { text: String(value), entities: [] }
}

/**
 * Put interpolated values back where their tokens ended up.
 *
 * A range the markup put around a token grows to hold the value, a range after
 * it moves, and the value's own ranges are placed at its new position. Nothing
 * else changes.
 */
export function restore(value: FormattedText, assembled: Assembled): FormattedText {
  if (assembled.slots.length === 0) return value

  const { open, close } = assembled.token
  const pattern = new RegExp(`${open}(\\d+)${close}`, 'g')
  const moves: { readonly end: number; readonly delta: number }[] = []
  const added: TypeMessageEntity[] = []
  let text = ''
  let from = 0

  for (const found of value.text.matchAll(pattern)) {
    const slot = assembled.slots[Number(found[1])]
    if (slot === undefined) continue
    const at = found.index
    const end = at + found[0].length

    text += value.text.slice(from, at)
    for (const entity of slot.entities) {
      added.push({ ...entity, offset: entity.offset + text.length })
    }
    text += slot.text

    moves.push({ end, delta: slot.text.length - found[0].length })
    from = end
  }
  text += value.text.slice(from)

  const place = (position: number): number => {
    let moved = position
    for (const move of moves) if (position >= move.end) moved += move.delta

    return moved
  }

  const entities = value.entities.map((entity) => {
    const start = place(entity.offset)
    const end = place(entity.offset + entity.length)

    return { ...entity, offset: start, length: end - start }
  })

  return withinText({ text, entities: sortEntities([...entities, ...added]) })
}

/** Order ranges by where they open, the longer first, so the order is not arbitrary. */
export function sortEntities(entities: readonly TypeMessageEntity[]): TypeMessageEntity[] {
  return [...entities].sort(
    (left, right) =>
      left.offset - right.offset ||
      right.length - left.length ||
      (left._ === right._ ? 0 : left._ < right._ ? -1 : 1),
  )
}

/**
 * Join formatted pieces into one, each keeping its ranges.
 *
 * ```ts
 * joinText([fromHtml`<b>${name}</b>`, 'has joined'], ' ')
 * ```
 *
 * A piece or the separator may be plain text. Nothing is parsed: a piece's text
 * is its text, whatever characters it has.
 */
export function joinText(
  pieces: readonly (FormattedText | string)[],
  separator: FormattedText | string = '',
): FormattedText {
  const between = formattedOf(separator)
  let text = ''
  const entities: TypeMessageEntity[] = []

  pieces.forEach((piece, index) => {
    const parts = index === 0 ? [formattedOf(piece)] : [between, formattedOf(piece)]
    for (const part of parts) {
      for (const entity of part.entities) {
        entities.push({ ...entity, offset: entity.offset + text.length })
      }
      text += part.text
    }
  })

  return withinText({ text, entities })
}

/**
 * Whether a value is a range in the text rather than a marker beside it.
 *
 * Every entity has an offset and a length, so this is a shape check rather than
 * a question about which constructor arrived.
 */
export function isEntityWithin(entity: TypeMessageEntity, length: number): boolean {
  return entity.offset >= 0 && entity.length > 0 && entity.offset + entity.length <= length
}

/** What is written at one position: the markers closing there, then those opening. */
export interface MarkerRun {
  readonly close: string
  readonly open: string
}

/** A range placed in the text, with the markers written around it. */
interface Placed {
  readonly end: number
  readonly markers: readonly [string, string]
}

/**
 * The markers to write at each position, nested the way markup must be.
 *
 * Entities need not nest; markup does. A range that crosses another is closed
 * where the other ends and opened again straight after, so every character
 * reads back with the formatting it had — the crossing range as two ranges
 * side by side, which formats the same text the same way.
 */
export function markerRuns(
  value: FormattedText,
  markersFor: (entity: TypeMessageEntity) => readonly [string, string] | undefined,
): ReadonlyMap<number, MarkerRun> {
  const starts = new Map<number, Placed[]>()
  const ends = new Set<number>()

  for (const entity of value.entities) {
    const markers = markersFor(entity)
    if (markers === undefined || !isEntityWithin(entity, value.text.length)) continue

    const end = entity.offset + entity.length
    starts.set(entity.offset, [...(starts.get(entity.offset) ?? []), { end, markers }])
    ends.add(end)
  }

  const runs = new Map<number, MarkerRun>()
  const stack: Placed[] = []
  const positions = [...new Set([...starts.keys(), ...ends])].sort((left, right) => left - right)

  for (const at of positions) {
    const { close, open } = closeAt(stack, at)
    let opening = open

    // What ends later opens first, so it is outside what ends sooner.
    for (const placed of [...(starts.get(at) ?? [])].sort((left, right) => right.end - left.end)) {
      opening += placed.markers[0]
      stack.push(placed)
    }

    runs.set(at, { close, open: opening })
  }

  return runs
}

/**
 * Close whatever ends at `at`, and everything opened inside it that does not;
 * those are opened again at once, in the order they were.
 */
function closeAt(stack: Placed[], at: number): MarkerRun {
  const lowest = stack.findIndex((placed) => placed.end === at)
  if (lowest === -1) return { close: '', open: '' }

  let close = ''
  const reopened: Placed[] = []
  for (let index = stack.length - 1; index >= lowest; index -= 1) {
    const placed = stack[index] as Placed
    close += placed.markers[1]
    if (placed.end !== at) reopened.unshift(placed)
  }

  stack.length = lowest
  stack.push(...reopened)

  return { close, open: reopened.map((placed) => placed.markers[0]).join('') }
}

/**
 * Drop entities that do not describe a range of the text.
 *
 * A zero-length range formats nothing, and one reaching past the end is a
 * request the server refuses for the whole message. Both are produced by markup
 * that opens and closes with nothing between, which is easier to write than to
 * notice.
 */
export function withinText(value: FormattedText): FormattedText {
  const kept = value.entities.filter((entity) => isEntityWithin(entity, value.text.length))

  return kept.length === value.entities.length ? value : { text: value.text, entities: kept }
}
