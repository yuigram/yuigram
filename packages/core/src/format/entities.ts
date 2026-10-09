// SPDX-License-Identifier: MPL-2.0

/**
 * Formatting ranges, in the shape both Telegram transports agree on.
 *
 * A formatted message is plain text plus a list of ranges. The Bot API names
 * them `MessageEntity` and MTProto spells each kind as its own constructor, but
 * what a range *means* is the same on both, so this module states it once, as
 * plain data in the Bot API's spelling. The Bot API sends these as they are;
 * MTProto maps each to its constructor at the edge.
 *
 * Offsets and lengths count UTF-16 code units. That is what both transports
 * count, and it is exactly what a JavaScript string index is, so
 * `text.slice(offset, offset + length)` selects a range with no conversion.
 */

/** Every kind of range Telegram defines. */
export type EntityType =
  | 'mention'
  | 'hashtag'
  | 'cashtag'
  | 'bot_command'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'spoiler'
  | 'blockquote'
  | 'expandable_blockquote'
  | 'code'
  | 'pre'
  | 'text_link'
  | 'text_mention'
  | 'custom_emoji'
  | 'date_time'

/** The person a `text_mention` names: enough to address them without a username. */
export interface EntityUser {
  readonly id: number
  readonly is_bot: boolean
  readonly first_name: string
  readonly last_name?: string | undefined
  readonly username?: string | undefined
}

/** One formatted range. */
export interface Entity {
  readonly type: EntityType
  /** Where it starts, in UTF-16 code units. */
  readonly offset: number
  /** How long it is, in UTF-16 code units. */
  readonly length: number
  /** For `text_link`: where it goes. */
  readonly url?: string | undefined
  /** For `text_mention`: who it names. */
  readonly user?: EntityUser | undefined
  /** For `pre`: the language to highlight as. */
  readonly language?: string | undefined
  /** For `custom_emoji`: which one. */
  readonly custom_emoji_id?: string | undefined
  /** For `date_time`: the moment, in seconds since the epoch. */
  readonly unix_time?: number | undefined
  /** For `date_time`: how to show it — `r`, or `w`, `d`/`D` and `t`/`T` together. */
  readonly date_time_format?: string | undefined
}

/**
 * Kinds Telegram recognises in text by itself.
 *
 * A mention, a hashtag or a URL is found by the server in plain text; sending
 * one as an entity is allowed but carries nothing markup would add, so the
 * serializers write them as plain text.
 */
export const DETECTED: ReadonlySet<EntityType> = new Set([
  'mention',
  'hashtag',
  'cashtag',
  'bot_command',
  'url',
  'email',
  'phone_number',
])

/** Kinds whose text is literal: nothing else may be formatted inside them. */
export const VERBATIM: ReadonlySet<EntityType> = new Set(['code', 'pre'])

/** Kinds that are quotations, which Telegram does not nest. */
export const QUOTES: ReadonlySet<EntityType> = new Set(['blockquote', 'expandable_blockquote'])

/**
 * The order two ranges starting at the same place open in.
 *
 * Outer before inner: a quotation holds formatting, and formatting holds a
 * link, never the other way round. Among ranges of equal standing the longer
 * one opens first, so it closes last and the two nest.
 */
const STANDING: Readonly<Record<EntityType, number>> = {
  blockquote: 0,
  expandable_blockquote: 0,
  pre: 1,
  text_link: 2,
  text_mention: 2,
  bold: 3,
  italic: 3,
  underline: 3,
  strikethrough: 3,
  spoiler: 3,
  code: 4,
  custom_emoji: 5,
  date_time: 5,
  mention: 6,
  hashtag: 6,
  cashtag: 6,
  bot_command: 6,
  url: 6,
  email: 6,
  phone_number: 6,
}

/** Sort ranges into the order they open in. */
export function sortEntities(entities: readonly Entity[]): Entity[] {
  return [...entities].sort(
    (a, b) =>
      a.offset - b.offset ||
      b.length - a.length ||
      STANDING[a.type] - STANDING[b.type] ||
      (a.type < b.type ? -1 : a.type > b.type ? 1 : 0),
  )
}

/** A range moved by `by` code units. */
export function shifted(entity: Entity, by: number): Entity {
  return by === 0 ? entity : { ...entity, offset: entity.offset + by }
}

/**
 * The part of a range inside `[start, end)`, moved so `start` is zero.
 *
 * `undefined` when nothing of it is inside. A range cut in two keeps its kind
 * and its details on both sides, so a link split across two messages is a link
 * in each.
 */
export function clipped(entity: Entity, start: number, end: number): Entity | undefined {
  const from = Math.max(entity.offset, start)
  const to = Math.min(entity.offset + entity.length, end)
  if (to <= from) return undefined

  return { ...entity, offset: from - start, length: to - from }
}

/** Whether a code unit is the first half of a surrogate pair. */
export function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

/** Whether a code unit is the second half of a surrogate pair. */
export function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

/**
 * Whether an index falls between the two halves of one character.
 *
 * Cutting there leaves each half on its own, which is not a character at all
 * and which Telegram replaces or refuses.
 */
export function splitsCharacter(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false

  return isHighSurrogate(text.charCodeAt(index - 1)) && isLowSurrogate(text.charCodeAt(index))
}

/** How many Unicode code points a string holds. */
export function codePoints(text: string): number {
  let count = 0
  for (let index = 0; index < text.length; index += 1) {
    if (
      !(
        isLowSurrogate(text.charCodeAt(index)) &&
        index > 0 &&
        isHighSurrogate(text.charCodeAt(index - 1))
      )
    ) {
      count += 1
    }
  }

  return count
}

/**
 * Two ranges of the same kind that touch or overlap, as one.
 *
 * Composition produces these — `bold('a')` next to `bold('b')` — and Telegram
 * treats them as one range anyway, so they are merged rather than sent twice.
 */
function sameKind(a: Entity, b: Entity): boolean {
  return (
    a.type === b.type &&
    a.url === b.url &&
    a.language === b.language &&
    a.custom_emoji_id === b.custom_emoji_id &&
    a.unix_time === b.unix_time &&
    a.date_time_format === b.date_time_format &&
    a.user?.id === b.user?.id
  )
}

/** Kinds that merge when they touch. A code block or a mention stays two. */
const MERGEABLE: ReadonlySet<EntityType> = new Set([
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'spoiler',
])

/**
 * Tidy a list of ranges: drop empty ones, merge touching ones of the same
 * simple kind, and sort.
 */
export function normalizeEntities(entities: readonly Entity[], textLength: number): Entity[] {
  const kept = sortEntities(
    entities.filter(
      (entity) =>
        entity.length > 0 && entity.offset >= 0 && entity.offset + entity.length <= textLength,
    ),
  )
  const out: Entity[] = []

  for (const entity of kept) {
    const index = out.findIndex(
      (earlier) =>
        MERGEABLE.has(entity.type) &&
        sameKind(earlier, entity) &&
        earlier.offset + earlier.length >= entity.offset,
    )

    if (index === -1) {
      out.push(entity)
      continue
    }

    const earlier = out[index] as Entity
    const end = Math.max(earlier.offset + earlier.length, entity.offset + entity.length)
    out[index] = { ...earlier, length: end - earlier.offset }
  }

  return sortEntities(out)
}
