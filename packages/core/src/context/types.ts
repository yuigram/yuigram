/**
 * The context contract.
 *
 * Core owns the *contract*; the transports own the *construction*. A context
 * only becomes meaningful once an update has been decoded, and decoding is
 * exactly the part the two transports cannot share — so `BaseContext` carries
 * only what is true regardless of where the update came from.
 *
 * Telegram entities (chats, senders, messages) are added by the transport
 * packages, which are the layers that know what those are. Nothing here
 * mentions Telegram.
 */

import type { Logger } from '../log/logger.js'

/**
 * Extension point for plugins.
 *
 * Plugins add their members here through declaration merging on Yuigram's own
 * interface, rather than merging into a dependency's types:
 *
 * ```ts
 * declare module '@yuigram/core' {
 *   interface ContextExtensions {
 *     session: SessionData
 *   }
 * }
 * ```
 *
 * Each plugin owns one named key, so two plugins cannot silently claim the
 * same field — the failure mode of bolting cross-cutting properties directly
 * onto update types.
 */
// biome-ignore lint/suspicious/noEmptyInterface: this is the declaration-merging surface
export interface ContextExtensions {}

/** What every context carries, whatever produced it. */
export interface BaseContext {
  /** Discriminator used by dispatch and by the filter fast path. */
  readonly kind: string
  /** When the originating event happened. */
  readonly date: Date
  /** Logger scoped to this update. */
  readonly log: Logger
  /** The untouched payload, for anything the framework has not modelled. */
  readonly raw: unknown
}

/**
 * A full context: the base contract plus whatever plugins have declared.
 *
 * Transport packages intersect their own members onto this.
 */
export type Context = BaseContext & ContextExtensions
