// SPDX-License-Identifier: MIT

/**
 * What the markup parsers share.
 *
 * Each dialect reads its own syntax and hands this builder the text it
 * produces and the ranges it opens and closes. The builder keeps the text,
 * finishes ranges as they close, and knows two things a stream needs:
 *
 * - **where to stop.** Given a length in UTF-16 code units, it refuses the first
 *   piece of text that would pass it and records where in the source that
 *   piece began — never inside a character, an escape or a tag, because those
 *   are handed over whole.
 * - **what was open.** The ranges open at that point can be handed back to a
 *   later parse, which then continues them from offset zero: a bold phrase cut
 *   between two messages is bold in both.
 *
 * Three modes decide what malformed markup does. `strict` refuses it the way
 * Telegram would. `lenient` keeps every range that is well formed and turns the
 * rest into literal text — so a stray `*` shows as `*` rather than taking the
 * formatting of the whole message with it. `partial` is lenient about the end
 * of the input: a token that has not finished arriving is held back rather than
 * shown, and ranges still open are closed where the text currently ends.
 */

import { MarkupParseError, ValidationError } from '../errors/errors.js'
import type { Entity, EntityType } from './entities.js'
import { isHighSurrogate, isLowSurrogate } from './entities.js'
import { Formatted } from './formatted.js'

// Defined with the other errors, so a formatter outside this entry point — an
// account's, on the eager path — raises the same class a caller catches here.
export { MarkupParseError }

/** How a parse treats markup that is not well formed. */
export type ParseMode = 'strict' | 'lenient' | 'partial'

/** The details a range carries besides its kind and position. */
export type EntityDetails = Omit<Entity, 'type' | 'offset' | 'length'>

/** A range that has opened and not yet closed. */
export interface OpenRange {
  readonly type: EntityType
  readonly start: number
  readonly details: EntityDetails
  /** What opened it, in the dialect's terms: a tag name or a marker. */
  readonly marker: string
  /**
   * Whether it produces a range when it closes.
   *
   * A tag a lenient parse recognised but could not use — a link with no
   * address — still has to be matched by its closing tag, so it is kept on the
   * stack without producing anything.
   */
  readonly produces: boolean
}

/** Where a parse stopped, and what to continue with. */
export interface ParseResult<State> {
  /** The text and the ranges, with those still open closed where the text ends. */
  readonly formatted: Formatted
  /** Where in the source the parse stopped: its length when it read everything. */
  readonly consumed: number
  /** Whether it stopped because it reached a requested length. */
  readonly stopped: boolean
  /** Whether it held back an unfinished token at the end, in partial mode. */
  readonly heldBack: boolean
  /** What was open where it stopped, for a parse that continues from there. */
  readonly state: State
}

/** What a parse starts from and stops at. */
export interface ParseOptions<State> {
  readonly mode?: ParseMode
  /** Stop before the text would pass this many UTF-16 code units. */
  readonly stopAt?: number
  /** Continue ranges left open by an earlier parse. */
  readonly resume?: State
}

/** Collects text and ranges for one parse. */
export class Builder {
  text = ''
  readonly entities: Entity[] = []
  readonly stack: OpenRange[] = []
  /** Where the source stood when the builder refused text. */
  stoppedAt: number | undefined

  constructor(
    readonly stopAt: number | undefined,
    resume: readonly OpenRange[] = [],
  ) {
    for (const open of resume) this.stack.push({ ...open, start: 0 })
  }

  /**
   * Add text that came from the source at `from`.
   *
   * Returns false, having recorded where, when this text would pass the
   * requested length. The caller stops there.
   */
  add(value: string, from: number): boolean {
    if (this.stoppedAt !== undefined) return false
    if (this.stopAt !== undefined && this.text.length + value.length > this.stopAt) {
      this.stoppedAt = from

      return false
    }

    this.text += value

    return true
  }

  /** Add formatted text wholesale — an interpolated value. */
  addFormatted(value: Formatted, from: number): boolean {
    const start = this.text.length
    if (!this.add(value.text, from)) return false

    for (const entity of value.entities)
      this.entities.push({ ...entity, offset: entity.offset + start })

    return true
  }

  open(type: EntityType, marker: string, details: EntityDetails = {}, produces = true): void {
    this.stack.push({ type, start: this.text.length, details, marker, produces })
  }

  /** Close the range at `index` and everything above it, innermost first. */
  closeFrom(index: number): void {
    for (let at = this.stack.length - 1; at >= index; at -= 1) {
      const open = this.stack[at] as OpenRange
      this.finish(open)
    }
    this.stack.length = index
  }

  /** The innermost open range with this marker, or -1. */
  find(marker: string): number {
    for (let at = this.stack.length - 1; at >= 0; at -= 1) {
      if ((this.stack[at] as OpenRange).marker === marker) return at
    }

    return -1
  }

  /** The innermost open range, if any. */
  get top(): OpenRange | undefined {
    return this.stack[this.stack.length - 1]
  }

  private finish(open: OpenRange): void {
    const length = this.text.length - open.start
    if (!open.produces || length <= 0) return

    this.entities.push({ ...open.details, type: open.type, offset: open.start, length })
  }

  /**
   * The value so far, with whatever is open closed at the end of the text,
   * and the open ranges as they were — for a later parse to continue.
   */
  snapshot(): { formatted: Formatted; open: OpenRange[] } {
    const entities = [...this.entities]
    for (const open of this.stack) {
      const length = this.text.length - open.start
      if (open.produces && length > 0) {
        entities.push({ ...open.details, type: open.type, offset: open.start, length })
      }
    }

    return { formatted: new Formatted(this.text, entities), open: [...this.stack] }
  }
}

/**
 * The character at `index`, whole: a surrogate pair is one character and is
 * returned as one.
 */
export function characterAt(source: string, index: number): string {
  const code = source.charCodeAt(index)
  if (
    isHighSurrogate(code) &&
    index + 1 < source.length &&
    isLowSurrogate(source.charCodeAt(index + 1))
  ) {
    return source.slice(index, index + 2)
  }

  return source[index] as string
}

/* -------------------------------------------------------------------------- */
/* Interpolation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Markers for interpolated values inside markup.
 *
 * A template is joined into one source with each value replaced by a marker,
 * and the parser swaps each marker back for its value *as text* — never as
 * markup. The markers are drawn from Unicode's private use area and a template
 * whose literal parts contain one is refused, so a marker cannot be forged.
 */
export const SLOT_OPEN = ''
export const SLOT_CLOSE = ''
const SLOT_PATTERN = /(\d+)/g

/** A template, joined into one source with markers where the values were. */
export function joinTemplate(
  strings: TemplateStringsArray,
  values: readonly unknown[],
): { source: string; slots: readonly unknown[] } {
  let source = ''

  strings.forEach((literal, index) => {
    if (literal.includes(SLOT_OPEN) || literal.includes(SLOT_CLOSE)) {
      throw new ValidationError('a template cannot contain the private characters U+F8F0 or U+F8F1')
    }
    source += literal
    if (index < values.length) source += `${SLOT_OPEN}${index}${SLOT_CLOSE}`
  })

  return { source, slots: values }
}

/** Read a marker at `index`, returning the slot number and where it ends. */
export function readSlot(source: string, index: number): { slot: number; end: number } | undefined {
  if (source[index] !== SLOT_OPEN) return undefined

  const close = source.indexOf(SLOT_CLOSE, index + 1)
  if (close === -1) return undefined

  const slot = Number(source.slice(index + 1, close))

  return Number.isInteger(slot) ? { slot, end: close + 1 } : undefined
}

/** Replace markers in an attribute value with the values, as text. */
export function resolveSlots(value: string, slots: readonly unknown[] | undefined): string {
  if (slots === undefined || !value.includes(SLOT_OPEN)) return value

  return value.replace(SLOT_PATTERN, (_whole, index: string) => {
    const slot = slots[Number(index)]

    return slot === null || slot === undefined || slot === false ? '' : String(slot)
  })
}

/** Whether a value is a tagged-template call's strings. */
export function isTemplate(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw)
}
