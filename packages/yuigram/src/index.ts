/**
 * Yuigram — an independent TypeScript framework for the Telegram Bot API
 * and MTProto.
 *
 * This package is the façade users install. It re-exports the public surface
 * and contains almost no logic of its own: one import path, one thing to learn,
 * and no decision to make about which internal package a symbol lives in.
 *
 * ```ts
 * import { Bot } from 'yuigram'
 *
 * const bot = Bot.fromToken(process.env.BOT_TOKEN!)
 *
 * bot.onCommand('start', (message) => message.reply('Hello.'))
 *
 * await bot.poll()
 * ```
 *
 * **What is here today:** the Bot API subsystem, complete — clients, polling,
 * webhooks, routing, sessions, storage, files, errors and the testing harness.
 *
 * There is no single `Context` type to name, because registration decides what
 * a handler receives: `onCommand` hands you a message whose `text` is a
 * `string`, `onMessage` one whose `text` may be absent, and `on('poll_answer')`
 * something with neither. `Context` here is core's transport-agnostic base,
 * which is what generic middleware is written against.
 *
 * Extensions ride on a type parameter rather than a globally merged interface,
 * so an application names what plugins add, once:
 *
 * ```ts
 * const bot = Bot.fromToken<SessionFlavor<Cart>>(token)
 * ```
 *
 * Two bots in one program can then hold different state, which a merged
 * interface cannot express.
 *
 * **What is not:** the MTProto subsystem, and the `App` container that will
 * hold several clients at once. Both are planned rather than stubbed; see
 * `docs/roadmap.md`. Nothing exported here is a placeholder.
 */

export * from '@yuigram/bot-api'
export * from '@yuigram/core'

/**
 * Schema versions this build was generated against.
 *
 * Exposed because a bot that hits a method Telegram added after this build was
 * cut needs to know which version it is talking to, and `call()` is how it
 * reaches the method meanwhile.
 */
export const schemaInfo = {
  /** Telegram Bot API version the generated surface was emitted from. */
  botApi: '10.2',
  /** Telegram TL schema layer. Populated once the MTProto subsystem lands. */
  tlLayer: null,
} as const
