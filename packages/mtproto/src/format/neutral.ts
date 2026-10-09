// SPDX-License-Identifier: MPL-2.0

/**
 * Formatting ranges between the shared shape and MTProto's constructors.
 *
 * `@yuigram/core/format` states what a range means once, in the Bot API's
 * plain spelling. MTProto spells each kind as its own constructor; this is the
 * mapping, both ways, and nothing else — so a module that only moves text
 * between the two loads no protocol code.
 */

import type { Entity, EntityType } from '@yuigram/core/format'
import type { TypeMessageEntity } from '../generated/api/types/index.js'

/** The simple kinds, one constructor each. */
const SIMPLE: Readonly<Partial<Record<EntityType, TypeMessageEntity['_']>>> = {
  mention: 'messageEntityMention',
  hashtag: 'messageEntityHashtag',
  cashtag: 'messageEntityCashtag',
  bot_command: 'messageEntityBotCommand',
  url: 'messageEntityUrl',
  email: 'messageEntityEmail',
  phone_number: 'messageEntityPhone',
  bold: 'messageEntityBold',
  italic: 'messageEntityItalic',
  underline: 'messageEntityUnderline',
  strikethrough: 'messageEntityStrike',
  spoiler: 'messageEntitySpoiler',
  code: 'messageEntityCode',
}

/** The same, the other way. */
const SIMPLE_BACK: Readonly<Record<string, EntityType>> = Object.fromEntries(
  Object.entries(SIMPLE).map(([type, name]) => [name, type as EntityType]),
)

/**
 * A date-time format string as the flags of `messageEntityFormattedDate`.
 *
 * `r` is relative; otherwise `w` the day of the week, `d` or `D` the date and
 * `t` or `T` the time, short or long. `R` and `W` are read as `r` and `w`,
 * since markup written for other clients uses them.
 */
export function dateFlags(format: string | undefined) {
  const flags = format ?? ''

  return {
    ...(/[rR]/.test(flags) ? { relative: true as const } : {}),
    ...(/[wW]/.test(flags) ? { day_of_week: true as const } : {}),
    ...(flags.includes('d') ? { short_date: true as const } : {}),
    ...(flags.includes('D') ? { long_date: true as const } : {}),
    ...(flags.includes('t') ? { short_time: true as const } : {}),
    ...(flags.includes('T') ? { long_time: true as const } : {}),
  }
}

/** The flags back as a format string, in the order Telegram's grammar puts them. */
export function dateFormat(entity: Record<string, unknown>): string {
  if (entity['relative'] === true) return 'r'

  return (
    (entity['day_of_week'] === true ? 'w' : '') +
    (entity['short_date'] === true ? 'd' : entity['long_date'] === true ? 'D' : '') +
    (entity['short_time'] === true ? 't' : entity['long_time'] === true ? 'T' : '')
  )
}

/** A shared range as MTProto's constructor, or `undefined` for one it has no form for. */
export function toTlEntity(entity: Entity): TypeMessageEntity | undefined {
  const at = { offset: entity.offset, length: entity.length }
  const simple = SIMPLE[entity.type]
  if (simple !== undefined) return { _: simple, ...at } as TypeMessageEntity

  switch (entity.type) {
    case 'pre':
      return { _: 'messageEntityPre', ...at, language: entity.language ?? '' }
    case 'text_link':
      return { _: 'messageEntityTextUrl', ...at, url: entity.url ?? '' }
    case 'text_mention':
      return entity.user === undefined
        ? undefined
        : { _: 'messageEntityMentionName', ...at, user_id: BigInt(entity.user.id) }
    case 'custom_emoji':
      return entity.custom_emoji_id === undefined
        ? undefined
        : { _: 'messageEntityCustomEmoji', ...at, document_id: BigInt(entity.custom_emoji_id) }
    case 'date_time':
      return {
        _: 'messageEntityFormattedDate',
        ...at,
        date: entity.unix_time ?? 0,
        ...dateFlags(entity.date_time_format),
      } as TypeMessageEntity
    case 'blockquote':
      return { _: 'messageEntityBlockquote', ...at }
    case 'expandable_blockquote':
      return { _: 'messageEntityBlockquote', ...at, collapsed: true }
    default:
      return undefined
  }
}

/** Shared ranges as MTProto's constructors, leaving out any with no form there. */
export function toTlEntities(entities: readonly Entity[]): TypeMessageEntity[] {
  const out: TypeMessageEntity[] = []
  for (const entity of entities) {
    const converted = toTlEntity(entity)
    if (converted !== undefined) out.push(converted)
  }

  return out
}

/** An MTProto constructor as a shared range, or `undefined` for one with no shared form. */
export function fromTlEntity(entity: TypeMessageEntity): Entity | undefined {
  const at = { offset: entity.offset, length: entity.length }
  const simple = SIMPLE_BACK[entity._]
  if (simple !== undefined) return { type: simple, ...at }

  const fields = entity as unknown as Record<string, unknown>
  switch (entity._) {
    case 'messageEntityPre':
      return entity.language === ''
        ? { type: 'pre', ...at }
        : { type: 'pre', ...at, language: entity.language }
    case 'messageEntityTextUrl':
      return { type: 'text_link', ...at, url: entity.url }
    case 'messageEntityMentionName':
      return {
        type: 'text_mention',
        ...at,
        user: { id: Number(entity.user_id), is_bot: false, first_name: '' },
      }
    case 'messageEntityCustomEmoji':
      return { type: 'custom_emoji', ...at, custom_emoji_id: entity.document_id.toString() }
    case 'messageEntityFormattedDate': {
      const format = dateFormat(fields)

      return {
        type: 'date_time',
        ...at,
        unix_time: Number(fields['date']),
        ...(format === '' ? {} : { date_time_format: format }),
      }
    }
    case 'messageEntityBlockquote':
      return { type: fields['collapsed'] === true ? 'expandable_blockquote' : 'blockquote', ...at }
    default:
      return undefined
  }
}

/** MTProto constructors as shared ranges, leaving out any with no shared form. */
export function fromTlEntities(entities: readonly TypeMessageEntity[]): Entity[] {
  const out: Entity[] = []
  for (const entity of entities) {
    const converted = fromTlEntity(entity)
    if (converted !== undefined) out.push(converted)
  }

  return out
}
