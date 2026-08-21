/**
 * Building a context from an update.
 *
 * The payload's own fields are spread onto the context rather than nested under
 * it, so a handler reads `message.text` instead of `message.payload.text`. The
 * whole payload stays available under a domain alias for anything the
 * projection does not cover.
 *
 * Two normalizations, matching what the generator declares:
 *
 * - `sender` reads from `from` or `user`, whichever the payload uses, so one
 *   name means one thing across every event.
 * - the payload is aliased to a domain noun — `message`, `query` — so a handler
 *   can reach the whole object without knowing which field carried it.
 *
 * Spreading rather than wrapping is a deliberate trade. It costs one shallow
 * copy per update, and it buys the reading experience the whole redesign exists
 * for. The copy is shallow: nested objects are shared with the raw update, not
 * cloned.
 */

import type { Logger } from '@yuigram/core'
import type { RawApi } from '../api.js'
import { PAYLOAD_ALIASES } from '../generated/contexts.js'
import { MESSAGE_KINDS } from '../generated/events.js'
import type { CallbackQuery, Message } from '../generated/types/index.js'
import type { NormalizedUpdate } from '../normalize.js'
import { callbackQueryActions, messageActions } from './actions.js'
import type { AnyEventContext, MessageEventKind } from './types.js'

/** What building a context needs. */
export interface CreateEventContextOptions {
  readonly normalized: NormalizedUpdate
  readonly api: RawApi
  readonly log: Logger
}

/** Fields Telegram uses for the sender, in the order they are checked. */
const SENDER_FIELDS = ['from', 'user'] as const

/** Read the sender from a payload, whichever field carries it. */
function senderOf(payload: Record<string, unknown>): unknown {
  for (const field of SENDER_FIELDS) {
    const value = payload[field]
    if (value !== undefined) return value
  }
  return undefined
}

/** The domain name a kind stores its payload under. Generated, so it cannot drift. */
const aliases = PAYLOAD_ALIASES as Readonly<Record<string, string | undefined>>

/**
 * Build the context for one normalized update.
 *
 * Returns a plain object rather than a class instance. Nothing here needs
 * identity or inheritance, and a plain object serializes predictably — which
 * matters, because a context is the thing most likely to be dumped into an
 * error report.
 */
export function createEventContext(options: CreateEventContextOptions): AnyEventContext {
  const { normalized, api, log } = options
  const kind = normalized.kind
  const payload = (normalized.payload ?? {}) as Record<string, unknown>

  const base: Record<string, unknown> = {
    kind,
    transport: 'bot-api',
    updateId: normalized.updateId,
    raw: normalized.raw,
    api,
    log,
  }

  // The payload's own fields, then the normalizations on top. Spreading first
  // means a payload field named `kind` cannot shadow the discriminant.
  const context: Record<string, unknown> = { ...payload, ...base }

  // Whether this update carried a message is decided by the payload, not by
  // the kind. A service message is promoted to its own kind — `chat_member_joined`
  // rather than `message` — while still being a `Message`, so a table keyed by
  // kind would leave exactly those updates without `reply`.
  const carriesMessage = normalized.message !== undefined

  const alias = aliases[kind] ?? (carriesMessage ? 'message' : undefined)
  if (alias !== undefined) context[alias] = payload

  const sender = senderOf(payload)
  if (sender !== undefined) context['sender'] = sender

  if (carriesMessage) {
    Object.assign(context, messageActions({ api, message: payload as unknown as Message }))
  }

  if (kind === 'callback_query') {
    Object.assign(context, callbackQueryActions(api, payload as unknown as CallbackQuery))
  }

  return context as unknown as AnyEventContext
}

/** Kinds that receive the message actions. Exported for tests and diagnostics. */
export function messageBearingKinds(): readonly MessageEventKind[] {
  return MESSAGE_KINDS
}
