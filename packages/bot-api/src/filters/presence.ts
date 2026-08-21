/**
 * "Does this update carry X?" — one filter per optional field.
 *
 * The most common question a bot asks about an update, and the answer is
 * mechanical: a field the schema marks optional either arrived or did not.
 * There are 122 such fields, so this is generated — but as a **list of names**
 * rather than as 122 declarations. The types below compute the rest from the
 * context shapes, which are generated already.
 *
 * What each filter buys is the narrowing. `has.photo` proves `photo` is a
 * `PhotoSize[]`, so the handler it registers reads `message.photo[0]` without a
 * guard the dispatcher already made unnecessary.
 */

import type { Filter } from '@yuigram/core'
import type { CallbackQueryContext, MessageContext } from '../events/index.js'
import { filter } from '../filter.js'
import type { CallbackQueryEventFields, MessageEventFields } from '../generated/contexts.js'
import { MESSAGE_KINDS, SERVICE_EVENTS } from '../generated/events.js'
import { CALLBACK_QUERY_FIELDS, MESSAGE_FIELDS } from '../generated/field-lists.js'

/**
 * Every kind whose payload is a message.
 *
 * The seven message kinds plus the service kinds promoted out of them — a
 * member joining is delivered as a message, so `has.new_chat_members` has to
 * reach it. Restricting the hint to `MESSAGE_KINDS` would make exactly the
 * service-message filters match nothing, silently.
 */
export const MESSAGE_BEARING_KINDS: readonly string[] = [
  ...MESSAGE_KINDS,
  ...Object.values(SERVICE_EVENTS),
]

/** A filter proving one field of `Fields` is present. */
type Presence<Base, Fields, K extends keyof Fields> = Filter<
  Base,
  { [P in K]-?: NonNullable<Fields[P]> }
>

/** The filters a list of field names describes. */
export type PresenceFilters<Base, Fields, Names extends readonly (keyof Fields & string)[]> = {
  readonly [K in Names[number]]: Presence<Base, Fields, K>
}

/** Build one filter per name, all sharing a kind hint. */
function build(names: readonly string[], kinds: readonly string[], prefix: string): unknown {
  const out: Record<string, unknown> = {}

  for (const name of names) {
    out[name] = filter(
      `${prefix}.${name}`,
      (context) => (context as unknown as Record<string, unknown>)[name] !== undefined,
      { kinds },
    )
  }

  return Object.freeze(out)
}

/**
 * Presence filters over a message.
 *
 * ```ts
 * bot.on(has.photo, (message) => message.reply(`${message.photo.length} sizes`))
 * ```
 */
export const has = build(MESSAGE_FIELDS, MESSAGE_BEARING_KINDS, 'has') as PresenceFilters<
  MessageContext,
  MessageEventFields,
  typeof MESSAGE_FIELDS
>

/** Presence filters over a callback query. */
export const hasQuery = build(
  CALLBACK_QUERY_FIELDS,
  ['callback_query'],
  'hasQuery',
) as PresenceFilters<CallbackQueryContext, CallbackQueryEventFields, typeof CALLBACK_QUERY_FIELDS>
