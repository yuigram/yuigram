/**
 * The filter namespace.
 *
 * One import, one letter, and autocomplete does the rest:
 *
 * ```ts
 * import { and, f } from 'yuigram'
 *
 * bot.on(f.media.photo, (message) => message.react('👍'))
 *
 * const fromStaff = f.sender.id(...STAFF)
 * const staffPhoto = and(fromStaff, f.media.photo)
 * ```
 *
 * Two halves, for two reasons:
 *
 * - **`f.has.*` is generated**, one filter per optional field the schema
 *   declares — 116 on a message alone. Mechanical, complete by construction,
 *   and a field Telegram adds appears the day the schema is regenerated.
 * - **everything else is curated**, because it needs a judgement a schema
 *   cannot make: that a group and a supergroup are both "a group", that a link
 *   in a caption is still a link, that a command has a particular shape.
 *
 * `f` is a namespace object rather than a hundred exports so that a wildcard
 * import stays one name, and so a filter is discovered by typing `f.` rather
 * than by reading a list.
 */

import {
  anyText,
  callback,
  caption,
  chat,
  command,
  entity,
  forward,
  media,
  reply,
  sender,
  type TextMatch,
  text,
  topic,
} from './families.js'
import { has, hasQuery, MESSAGE_BEARING_KINDS, type PresenceFilters } from './presence.js'

export type { PresenceFilters, TextMatch }
export { has, hasQuery, MESSAGE_BEARING_KINDS }

/** Every built-in filter, under one name. */
export const f = Object.freeze({
  /** Presence of an optional field. Generated from the schema. */
  has,
  /** Presence of an optional field on a callback query. */
  hasQuery,
  text,
  caption,
  anyText,
  command,
  chat,
  sender,
  media,
  callback,
  reply,
  forward,
  entity,
  topic,
})
