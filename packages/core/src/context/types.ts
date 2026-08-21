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
 * Extensions are carried by a type parameter rather than merged into a global
 * interface. A plugin publishes a *flavour* — an interface describing what it
 * adds — and an application intersects the flavours it uses into one context
 * type, which it names once when constructing the client:
 *
 * ```ts
 * const bot = Bot.fromToken<SessionFlavor<{ count: number }>>(token)
 * ```
 *
 * The alternative, declaration merging on a shared interface, was tried first
 * and rejected for two reasons that only appear in practice:
 *
 * - **It is process-global.** One `SessionData` per program means two bots in
 *   one repository cannot hold different state, and neither can two tenants in
 *   one process. Flavours are per client.
 * - **It cannot cross a façade.** The interface would live in this package,
 *   while applications install `yuigram`. `declare module 'yuigram'` silently
 *   creates a *new* interface rather than merging, so the augmentation compiles
 *   and does nothing — and the working form names an internal package the
 *   framework promises users will never have to think about.
 *
 * A flavour also says something merging cannot: `ctx.session` exists exactly
 * where the middleware providing it is installed, rather than on every context
 * in the program because some file imported the plugin.
 */
export type Flavor<C, F> = C & F

/** What every context carries, whatever produced it. */
export interface BaseContext {
  /** Discriminator used by dispatch and by the filter fast path. */
  readonly kind: string
  /**
   * Which subsystem produced this event.
   *
   * The discriminant a handler installed on more than one client branches on.
   * Bot API and MTProto model the same conversation differently, and code that
   * sees both needs to know which one it is holding before it reads anything
   * else.
   */
  readonly transport: string
  /** Logger scoped to this update. */
  readonly log: Logger
  /** The untouched payload, for anything the framework has not modelled. */
  readonly raw: unknown
}

/**
 * The transport-agnostic context.
 *
 * Transport packages intersect their own members onto this, and applications
 * intersect the flavours of whatever plugins they install.
 */
export type Context = BaseContext
