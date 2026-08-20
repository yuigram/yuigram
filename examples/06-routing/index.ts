/**
 * 06 — Routing and filters.
 *
 * Four ways to select updates, in increasing order of precision: by kind, by
 * command, by shorthand, and by composed filter. A filter is a type guard, so
 * narrowing an update also narrows what the handler can reach on the context.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/06-routing/index.ts
 * ```
 */

import { and, Bot, filter, not } from 'yuigram'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const bot = new Bot(token)

// --- By kind -----------------------------------------------------------------

// A single kind, or several at once.
bot.on('edited_message', (ctx) => ctx.reply('I saw that edit.'))
bot.on(['photo', 'video'], (ctx) => ctx.reply('Nice media.'))

// --- By command --------------------------------------------------------------

bot.command('start', (ctx) => ctx.reply('Try /echo something, or send a photo.'))

// `ctx.command` carries the parsed name, the raw remainder and split arguments.
bot.command('echo', (ctx) =>
  ctx.reply(ctx.command.rest === '' ? 'Give me something to echo.' : ctx.command.rest),
)

// A pattern matches against the command name, so one handler can serve a family.
bot.command(/^admin_/, (ctx) => ctx.reply(`Admin command: ${ctx.command.name}`))

// --- By shorthand ------------------------------------------------------------

// Exact text, and a pattern over text. Neither fires on callback data: a button
// press carries `data`, and letting a text filter see it would route button
// presses into text handlers.
bot.text('ping', (ctx) => ctx.reply('pong'))
bot.text(/^\d+$/, (ctx) => ctx.reply('That is a number.'))

bot.callback(/^buy:/, (ctx) => ctx.reply(`Buying ${ctx.data}`))

// --- By composed filter ------------------------------------------------------

// `filter` is the Bot API subsystem's version of core's `defineFilter`: the
// predicate receives a `BotContext` rather than `unknown`, because a bot only
// ever dispatches one. Reach for `defineFilter` when a filter has to decide
// what sort of context it was handed at all.

/** Messages sent in a private chat. */
const isPrivate = filter('isPrivate', (ctx) => ctx.chat?.type === 'private')

/** Messages carrying at least one entity, such as a link or a mention. */
const hasEntities = filter('hasEntities', (ctx) => (ctx.message?.entities?.length ?? 0) > 0)

// `and`, `or` and `not` compose filters without losing the narrowing each one
// contributes.
bot.on(and(isPrivate, hasEntities), (ctx) =>
  ctx.reply('A private message with formatting or a link.'),
)

bot.on(and(not(isPrivate), hasEntities), (ctx) =>
  ctx.reply('A group message with formatting or a link.'),
)

// --- Ordering ----------------------------------------------------------------

// Every matching handler runs, not only the first. Independent concerns —
// logging a photo, reacting to it, archiving it — compose without knowing about
// each other, which is why this is the default.
bot.on('message', (ctx) => {
  ctx.log.debug('saw a message', { chat: ctx.chat?.id })
})

bot.catch((error, ctx) => {
  ctx.log.error('handler failed', { kind: ctx.kind, error })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.start()

console.log('Routing example running.')
