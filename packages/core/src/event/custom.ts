/**
 * Events an application raises itself.
 *
 * A payment provider's webhook says an order was paid; a timer says a
 * reminder is due; another service says a document is ready. None of these is
 * a Telegram update, but each wants what an update gets: the client's
 * middleware, its sessions, its routing and its error handling.
 *
 * ```ts
 * const orderPaid = defineEvent<{ orderId: string; chatId: number }>('order_paid')
 *
 * bot.on(orderPaid, async (event) => {
 *   await bot.api.sendMessage({ chat_id: event.payload.chatId, text: 'Paid, thank you.' })
 * })
 *
 * await bot.emit(orderPaid, { orderId: 'A-17', chatId: 42 }, { sender: { id: 42 } })
 * ```
 *
 * An emitted event is not an update. It has no update identifier, it is never
 * acknowledged to Telegram, and it moves no polling offset or update sequence;
 * its `transport` is `'custom'`, so middleware written for one transport's
 * updates can tell it apart. What it may carry is who it concerns — a `chat`
 * and a `sender` — so a session keyed by them loads for it as it would for an
 * update from that person.
 */

import type { AddressedPeer } from '../conversation/identity.js'
import { ValidationError } from '../errors/errors.js'
import type { Logger } from '../log/logger.js'

/** Marks an event definition, so one can be told from a kind or a filter. */
const DEFINITION = Symbol.for('yuigram.eventDefinition')

/** A kind of event the application raises, and the payload it carries. */
export interface EventDefinition<P> {
  readonly [DEFINITION]: true
  /** The kind the event's context carries. */
  readonly kind: string
  /** Carries the payload type; never set at runtime. */
  readonly payload?: P
}

/** Who an emitted event concerns, for what keys state by chat and sender. */
export interface EventAddress {
  readonly chat?: AddressedPeer | undefined
  readonly sender?: AddressedPeer | undefined
}

/** The context an emitted event is handled with. */
export interface CustomEvent<P> extends EventAddress {
  readonly kind: string
  /** Always `'custom'`: raised by the application, not received from Telegram. */
  readonly transport: 'custom'
  readonly client: { readonly name: string }
  readonly log: Logger
  /** The payload, as emitted. */
  readonly payload: P
  /** The payload again, where every context keeps what it arrived as. */
  readonly raw: P
  /** When it was emitted, in milliseconds since the epoch. */
  readonly emittedAt: number
}

/**
 * Define an event kind the application raises.
 *
 * The kind is a lower-case name — letters, digits, `_`, `.`, `:` and `-`. A
 * client refuses one that names a kind of update it receives from Telegram,
 * since a handler for it would then run for both.
 */
export function defineEvent<P = undefined>(kind: string): EventDefinition<P> {
  if (!/^[a-z][a-z0-9_.:-]{0,63}$/.test(kind)) {
    throw new ValidationError(
      `an event kind is a lower-case name of letters, digits, '_', '.', ':' and '-', not '${kind}'`,
    )
  }

  return Object.freeze({ [DEFINITION]: true as const, kind })
}

/** Whether a value is an event definition. */
export function isEventDefinition(value: unknown): value is EventDefinition<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<EventDefinition<unknown>>)[DEFINITION] === true
  )
}

/** Build the context an emitted event is handled with. */
export function createCustomEvent<P>(
  definition: EventDefinition<P>,
  payload: P,
  origin: { readonly client: { readonly name: string }; readonly log: Logger },
  address: EventAddress = {},
  now: () => number = Date.now,
): CustomEvent<P> {
  return {
    kind: definition.kind,
    transport: 'custom',
    client: origin.client,
    log: origin.log,
    payload,
    raw: payload,
    emittedAt: now(),
    ...(address.chat === undefined ? {} : { chat: address.chat }),
    ...(address.sender === undefined ? {} : { sender: address.sender }),
  }
}
