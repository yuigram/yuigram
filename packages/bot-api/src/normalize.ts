/**
 * Update normalization.
 *
 * Turns a raw Bot API `Update` into the shape dispatch consumes: a `kind`, the
 * common fields filters and handlers read, and the untouched payload.
 *
 * Two behaviours carry most of the value:
 *
 * - **Service-message promotion.** The Bot API delivers a member join as a
 *   `message` with `new_chat_members` set. Raised to its own kind, applications
 *   stop writing the same defensive branching inside a message handler — and
 *   stop occasionally getting it wrong, since a service message has no text and
 *   no author intent.
 * - **Unknown kinds survive.** Telegram ships new update types before a client
 *   regenerates. Discarding them would make the framework lose data it was
 *   trusted to deliver, so they arrive as `unknown` with the payload intact.
 */

import type { Logger } from '@yuigram/core'
import { MESSAGE_FIELDS, SERVICE_EVENTS, UPDATE_EVENTS } from './generated/events.js'
import type { Chat, Message, Update, User } from './generated/types/index.js'

/** The kind given to an update this build does not recognise. */
export const UNKNOWN_KIND = 'unknown'

/** A normalized update, ready for dispatch. */
export interface NormalizedUpdate {
  /** Event kind, or `unknown` for an update newer than the installed schema. */
  readonly kind: string
  /** Telegram's update identifier, used for deduplication. */
  readonly updateId: number
  /** The `Update` field that carried the payload. */
  readonly field: string
  /** The payload itself. */
  readonly payload: unknown
  /** The chat this concerns, where there is one. */
  readonly chat: Chat | undefined
  /** Who caused it, where that is known. */
  readonly sender: User | undefined
  /**
   * Message text or caption.
   *
   * Never callback data or an inline query. Those are separate fields below:
   * callback data is an opaque payload the bot itself authored, and treating it
   * as text would make a text filter match button presses.
   */
  readonly text: string | undefined
  /** Callback data, for a callback query. */
  readonly data: string | undefined
  /** The typed query, for an inline query. */
  readonly query: string | undefined
  /** When it happened. */
  readonly date: Date
  /** The untouched update. */
  readonly raw: Update
}

/** Find the single populated field of an update. */
function payloadField(update: Update): { field: string; payload: unknown } | undefined {
  for (const [field, payload] of Object.entries(update)) {
    if (field === 'update_id') continue
    // `null` is not a payload: a field explicitly nulled is absent, and
    // treating it as present would misidentify the update kind.
    if (payload === undefined || payload === null) continue
    return { field, payload }
  }
  return undefined
}

/**
 * Find the service marker on a message, if any.
 *
 * Scans the fields the message actually has rather than all 54 known markers:
 * a typical message carries under a dozen keys, so this is the cheaper
 * direction and it stays cheap as Telegram adds more markers.
 *
 * The Bot API guarantees at most one marker per message. A message carrying
 * none is an ordinary message.
 */
function serviceKind(message: Message): string | undefined {
  const markers = SERVICE_EVENTS as Record<string, string | undefined>

  for (const [field, value] of Object.entries(message)) {
    if (value === undefined || value === null) continue
    const kind = markers[field]
    if (kind !== undefined) return kind
  }

  return undefined
}

/** Read the sender from any payload shape that has one. */
function readSender(payload: unknown): User | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const record = payload as Record<string, unknown>

  // `from` on most payloads; `user` on chat-member and boost updates.
  return (record['from'] ?? record['user']) as User | undefined
}

/** Read the chat from any payload shape that has one. */
function readChat(payload: unknown): Chat | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const record = payload as Record<string, unknown>

  if (record['chat'] !== undefined) return record['chat'] as Chat

  // A callback query carries its chat on the attached message.
  const message = record['message'] as Record<string, unknown> | undefined
  return message?.['chat'] as Chat | undefined
}

/** Read a string field from a payload, if present. */
function readString(payload: unknown, key: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Read message text.
 *
 * Caption counts as text — it is authored by the same person in the same place
 * — but callback data and inline queries deliberately do not. Callback data is
 * a payload the bot wrote to its own button, and matching a text filter against
 * it would fire handlers on button presses.
 */
function readText(payload: unknown): string | undefined {
  return readString(payload, 'text') ?? readString(payload, 'caption')
}

/** Read the timestamp, falling back to now when the payload carries none. */
function readDate(payload: unknown): Date {
  if (typeof payload === 'object' && payload !== null) {
    const seconds = (payload as Record<string, unknown>)['date']
    if (typeof seconds === 'number') return new Date(seconds * 1000)
  }

  // Several update kinds carry no timestamp at all — a callback query, for one.
  return new Date()
}

/** Normalize one raw update. */
export function normalizeUpdate(update: Update, log?: Logger): NormalizedUpdate {
  const found = payloadField(update)

  if (found === undefined) {
    log?.warn('update carried no payload field', { updateId: update.update_id })
    return {
      kind: UNKNOWN_KIND,
      updateId: update.update_id,
      field: '',
      payload: undefined,
      chat: undefined,
      sender: undefined,
      text: undefined,
      data: undefined,
      query: undefined,
      date: new Date(),
      raw: update,
    }
  }

  const { field, payload } = found
  const mapped = (UPDATE_EVENTS as Record<string, string | undefined>)[field]

  if (mapped === undefined) {
    // Newer than the installed schema. Carried through rather than dropped, so
    // a forward-compatible handler or an ingestion pipeline still sees it.
    log?.debug('unrecognised update kind', { field, updateId: update.update_id })
  }

  const promoted =
    mapped !== undefined && MESSAGE_FIELDS.has(field) ? serviceKind(payload as Message) : undefined

  return {
    kind: promoted ?? mapped ?? UNKNOWN_KIND,
    updateId: update.update_id,
    field,
    payload,
    chat: readChat(payload),
    sender: readSender(payload),
    text: readText(payload),
    data: readString(payload, 'data'),
    query: readString(payload, 'query'),
    date: readDate(payload),
    raw: update,
  }
}
