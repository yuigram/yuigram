// SPDX-License-Identifier: MPL-2.0

/**
 * Text and its formatting, as one value.
 *
 * Markup is a way of writing formatting down; a `Formatted` is the formatting
 * itself. Composing values of this kind never parses anything, so a name a
 * user chose — `<b>` or `*` — is text wherever it goes, and only the ranges the
 * code built are formatting.
 *
 * ```ts
 * const line = format`Hello, ${bold(name)}. You have ${count} new messages.`
 * await bot.api.sendMessage({ chat_id, ...line.toPayload() })
 * ```
 */

import { ValidationError } from '../errors/errors.js'
import {
  clipped,
  type Entity,
  type EntityType,
  normalizeEntities,
  shifted,
  splitsCharacter,
} from './entities.js'
import { toHtml, toMarkdown } from './serialize.js'

/** Anything with text and, perhaps, ranges over it. */
export interface FormattedLike {
  readonly text: string
  readonly entities?: readonly Entity[] | undefined
}

/**
 * What composition accepts.
 *
 * Plain values become plain text. `null`, `undefined` and `false` become
 * nothing, so a part can be left out with `condition && part`.
 */
export type Content =
  | string
  | number
  | bigint
  | Formatted
  | FormattedLike
  | null
  | undefined
  | false

/** A message, or anything carrying its text or caption and their ranges. */
export interface MessageLike {
  readonly text?: string | undefined
  readonly entities?: readonly { readonly type: string }[] | null | undefined
  readonly caption?: string | undefined
  readonly caption_entities?: readonly { readonly type: string }[] | null | undefined
  readonly raw?: MessageLike | undefined
}

/** A text field and the ranges field Telegram pairs it with. */
export type FieldsOf<Field extends string> = { [Key in Field]: string } & (Field extends
  | 'text'
  | 'message_text'
  ? { entities: Entity[] }
  : { [Key in `${Field}_entities`]: Entity[] })

/** The fields a sending method takes the text and its ranges as. */
export interface FormattedPayload {
  readonly text: string
  readonly entities: Entity[]
}

/** Text with formatting ranges over it. Immutable. */
export class Formatted {
  readonly text: string
  readonly entities: readonly Entity[]

  constructor(text: string, entities: readonly Entity[] = []) {
    if (typeof text !== 'string') throw new ValidationError('formatted text must be a string')

    this.text = text
    this.entities = Object.freeze(normalizeEntities(entities, text.length))
  }

  /** A value of this kind from anything composition accepts. */
  static from(value: Content): Formatted {
    if (value instanceof Formatted) return value
    if (value === null || value === undefined || value === false) return EMPTY
    if (typeof value === 'object') return new Formatted(value.text, value.entities ?? [])

    return new Formatted(String(value))
  }

  /**
   * The text of a message as it arrived, formatting included.
   *
   * Takes the text and its ranges, or the caption and its ranges when there is
   * no text. Ranges Telegram found by itself — a URL, a hashtag — come along,
   * since they are part of what the message showed.
   */
  static fromMessage(message: MessageLike): Formatted {
    const source = message.raw ?? message
    if (typeof source.text === 'string') {
      return new Formatted(source.text, (source.entities ?? []) as readonly Entity[])
    }
    if (typeof source.caption === 'string') {
      return new Formatted(source.caption, (source.caption_entities ?? []) as readonly Entity[])
    }

    return EMPTY
  }

  /** Several parts, one after the other. */
  static concat(...parts: readonly Content[]): Formatted {
    let text = ''
    const entities: Entity[] = []

    for (const part of parts) {
      const value = Formatted.from(part)
      for (const entity of value.entities) entities.push(shifted(entity, text.length))
      text += value.text
    }

    return new Formatted(text, entities)
  }

  /** How long the text is, in UTF-16 code units — the unit ranges count in. */
  get length(): number {
    return this.text.length
  }

  /**
   * A part of the text, with the ranges over it.
   *
   * A range that crosses either end is cut to fit and keeps its kind. Refuses
   * to cut between the two halves of a character.
   */
  slice(start = 0, end = this.text.length): Formatted {
    const from = Math.max(0, Math.min(start, this.text.length))
    const to = Math.max(from, Math.min(end, this.text.length))

    if (splitsCharacter(this.text, from) || splitsCharacter(this.text, to)) {
      throw new ValidationError('a slice cannot cut a character in two')
    }

    const entities: Entity[] = []
    for (const entity of this.entities) {
      const part = clipped(entity, from, to)
      if (part !== undefined) entities.push(part)
    }

    return new Formatted(this.text.slice(from, to), entities)
  }

  /** The same text with one more range over all of it. */
  wrap(type: EntityType, details: Omit<Entity, 'type' | 'offset' | 'length'> = {}): Formatted {
    if (this.text.length === 0) return this

    return new Formatted(this.text, [
      { ...details, type, offset: 0, length: this.text.length },
      ...this.entities,
    ])
  }

  /** Whether there is no text. */
  get empty(): boolean {
    return this.text.length === 0
  }

  /**
   * The two fields a method takes this value as.
   *
   * `as('caption')` gives `{ caption, caption_entities }`; `as('text')` and
   * `as('message_text')` pair with plain `entities`, as Telegram names them.
   *
   * ```ts
   * await bot.api.sendPhoto({ chat_id, photo, ...line.as('caption') })
   * ```
   */
  as<Field extends string>(field: Field): FieldsOf<Field> {
    const entities = field === 'text' || field === 'message_text' ? 'entities' : `${field}_entities`

    return {
      [field]: this.text,
      [entities]: this.entities.map((entity) => ({ ...entity })),
    } as FieldsOf<Field>
  }

  /** The fields a sending method takes: `text` and `entities`. */
  toPayload(): FormattedPayload {
    return { text: this.text, entities: this.entities.map((entity) => ({ ...entity })) }
  }

  /** The same, for `JSON.stringify`. */
  toJSON(): FormattedPayload {
    return this.toPayload()
  }

  /** Telegram HTML that parses back into this value. */
  toHtml(): string {
    return toHtml(this)
  }

  /** Telegram MarkdownV2 that parses back into this value. */
  toMarkdown(): string {
    return toMarkdown(this)
  }

  /** The text alone. Formatting is not text, so it is not here. */
  toString(): string {
    return this.text
  }
}

/** The empty value, shared. */
const EMPTY = new Formatted('')

/** Whether a value is text with ranges, of this class or merely of its shape. */
export function isFormattedLike(value: unknown): value is FormattedLike {
  return (
    value instanceof Formatted ||
    (typeof value === 'object' &&
      value !== null &&
      typeof (value as { text?: unknown }).text === 'string' &&
      ((value as { entities?: unknown }).entities === undefined ||
        Array.isArray((value as { entities?: unknown }).entities)))
  )
}
