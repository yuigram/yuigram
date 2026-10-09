// SPDX-License-Identifier: MPL-2.0

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
  /**
   * The client this event arrived on.
   *
   * Structural, and deliberately thin: an application holding more than one
   * client needs to know which one is speaking before it reads anything else,
   * and naming the client's own type here would make the shared layer depend on
   * whichever subsystem produced it. A transport narrows this to its own client
   * type, so a handler registered on one client sees that client and a handler
   * registered across several sees what they have in common.
   */
  readonly client: { readonly name: string }
  /** Logger scoped to this update. */
  readonly log: Logger
  /** The untouched payload, for anything the framework has not modelled. */
  readonly raw: unknown
}

/**
 * What a handler can do with an event, whatever produced it.
 *
 * The unified surface is an action surface rather than a second entity model.
 * Both subsystems model peers, messages and timestamps differently, and a
 * shared type for any of those would be a union pretending to be a product
 * type — so entities stay in the package that models them and are reached by
 * narrowing on `transport`, or through `raw`.
 *
 * These two are different. They address the peer the update came from, which
 * both subsystems already know: a bot replies to the chat the message arrived
 * in, and an account replies to the peer it heard from, whose reference it
 * already holds. That is what makes them safe to share, and it is what lets a
 * handler installed across several clients answer any of them without first
 * asking which one it is holding.
 *
 * The signatures are the smallest both can satisfy. Each subsystem offers more
 * than this on its own contexts — the Bot API takes every option its schema
 * accepts, and returns the message it sent — and a wider signature here would
 * either promise one subsystem's options on the other or return a type only one
 * of them has.
 */
export interface ContextActions {
  /** Answer the message this event carries, in the conversation it arrived in. */
  reply(text: string): Promise<unknown>
  /** React to the message this event carries. */
  react(emoji: string): Promise<unknown>
}

/**
 * The transport-agnostic context.
 *
 * Transport packages intersect their own members onto this, and applications
 * intersect the flavours of whatever plugins they install.
 */
export type Context = BaseContext

/**
 * What a handler installed across several clients is written against.
 *
 * `BaseContext` and nothing else that is not true of every event: what the
 * event is, which client and subsystem it came from, what it said where both
 * agree on the meaning, and the two operations that address the peer it came
 * from. An application names this when it holds clients of more than one kind.
 *
 * ```ts
 * const app = new App<UnifiedContext>()
 *
 * app.on('message', (event) => event.reply(`heard on ${event.transport}`))
 * ```
 */
export interface UnifiedContext extends BaseContext, ContextActions {
  /**
   * Message text, where the event carries a message with any.
   *
   * Optional rather than `string | undefined`, because the two subsystems
   * declare it differently — one omits the property where a payload has no
   * text, the other carries it as absent — and only the looser of the two
   * accepts both.
   */
  readonly text?: string | undefined
}
