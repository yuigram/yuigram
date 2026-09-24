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

import type { TypeMessageEntity } from '../generated/api/types/index.js'

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
 * Assemble a template call, escaping what was interpolated.
 *
 * The literal parts are markup the developer wrote and are left alone; the
 * values came from somewhere else and are escaped. That is the right way round,
 * and the reverse is the bug this exists to prevent.
 */
export function assemble(
  input: Markup,
  values: readonly unknown[],
  escapeText: (text: string) => string,
): string {
  if (typeof input === 'string') return input

  let out = input[0] ?? ''

  for (let index = 0; index < values.length; index += 1) {
    out += escapeText(String(values[index]))
    out += input[index + 1] ?? ''
  }

  return out
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
