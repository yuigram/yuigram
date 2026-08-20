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
 * const bot = new Bot(process.env.BOT_TOKEN!)
 *
 * bot.command('start', (ctx) => ctx.reply('Hello.'))
 *
 * await bot.start()
 * ```
 *
 * **What is here today:** the Bot API subsystem, complete — clients, polling,
 * webhooks, routing, sessions, storage, files, errors and the testing harness.
 *
 * Both layers export a `Context`. Core's is transport-agnostic and the Bot API
 * subsystem's adds what a bot handler reaches for, so the specific one is
 * re-exported explicitly and wins over the star exports; the transport-agnostic
 * one stays available as `AnyContext`.
 *
 * Extensions ride on a type parameter rather than a globally merged interface,
 * so an application names the context it wants once:
 *
 * ```ts
 * type MyContext = Context & SessionFlavor<Cart>
 *
 * const bot = new Bot<MyContext>(token)
 * ```
 *
 * **What is not:** the MTProto subsystem, and the `App` container that will
 * hold several clients at once. Both are planned rather than stubbed; see
 * `docs/roadmap.md`. Nothing exported here is a placeholder.
 */

export type { Context } from '@yuigram/bot-api'
export * from '@yuigram/bot-api'
export type { Context as AnyContext } from '@yuigram/core'
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
