/**
 * The context an account's events arrive as.
 *
 * Core owns the contract and the transports own the construction, so this is
 * where the MTProto side satisfies `BaseContext`: a kind to dispatch on, the
 * transport that produced it, a scoped logger, and the untouched update.
 *
 * What it deliberately does not carry is a way to answer. Replying means
 * addressing a peer, addressing a peer means the hash that goes with it, and
 * both belong to the client — which is a layer above this one and does not
 * exist yet. A context with a `reply` that could not send would be worse than
 * one without: the absence is a compile error, the hollow method is a runtime
 * surprise.
 */

import type { BaseContext, Logger } from '@yuigram/core'
import type { TlValue } from '../tl/index.js'
import type { MtprotoEventKind } from './events.js'
import { type NormalizedUpdate, normalizeUpdate, type PeerRef } from './normalize.js'

/** One event from an account, ready for dispatch. */
export interface MtprotoContext extends BaseContext {
  /** Which event this is. A literal type, so it discriminates. */
  readonly kind: MtprotoEventKind
  /**
   * Always `'mtproto'` here.
   *
   * What a handler installed on more than one client branches on before it
   * reads anything else, because the two transports model the same
   * conversation differently.
   */
  readonly transport: 'mtproto'
  /** The conversation this concerns, as the update named it. */
  readonly chat: PeerRef | undefined
  /** Who caused it, where the update says. */
  readonly sender: PeerRef | undefined
  /** The message, for the kinds that carry a whole one. */
  readonly message: TlValue | undefined
  /** The messages a deletion names. */
  readonly messageIds: readonly number[] | undefined
  /** Message text, where there is any. */
  readonly text: string | undefined
  /** When it happened, where the update says. */
  readonly date: Date | undefined
  /** The untouched update, for everything this does not model. */
  readonly raw: TlValue
}

/** What building a context needs beyond the update itself. */
export interface ContextOptions {
  /** Logger scoped to this update. */
  readonly log: Logger
}

/** Build the context for one update, normalizing it on the way. */
export function mtprotoContext(update: TlValue, options: ContextOptions): MtprotoContext {
  return contextFor(normalizeUpdate(update), options)
}

/** Build the context for an update that has already been normalized. */
export function contextFor(normalized: NormalizedUpdate, options: ContextOptions): MtprotoContext {
  return {
    kind: normalized.kind,
    transport: 'mtproto',
    chat: normalized.chat,
    sender: normalized.sender,
    message: normalized.message,
    messageIds: normalized.messageIds,
    text: normalized.text,
    date: normalized.date,
    raw: normalized.raw,
    log: options.log,
  }
}
