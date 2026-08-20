/**
 * 01 — A basic bot.
 *
 * The smallest complete bot: a token, a handler, a start. Everything else in
 * this directory builds on this shape.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/01-basic-bot/index.ts
 * ```
 */

import { Bot } from 'yuigram'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const bot = new Bot(token)

// `command` handles the `@yourbot` suffix for you. In a group, `/start` is
// addressed to every bot present and `/start@otherbot` to exactly one, so a
// bot that compares raw text answers messages meant for someone else.
bot.command('start', (ctx) => ctx.reply('Hello. Send me anything and I will echo it.'))

bot.command('help', (ctx) => ctx.reply('Commands: /start, /help. Any other text is echoed.'))

bot.on('message', async (ctx) => {
  // `ctx.text` is the message text or caption, and nothing else — a button
  // press carries `data`, not text, and must not land here.
  if (ctx.text === undefined) return

  await ctx.reply(ctx.text)
})

// Without a catcher, an error from a handler propagates to whoever is
// dispatching. Registering one keeps a single bad update from affecting the
// conversations running alongside it.
bot.catch((error, ctx) => {
  ctx.log.error('handler failed', { kind: ctx.kind, error })
})

// Stop cleanly on Ctrl-C: `stop` cancels the in-flight long poll and waits for
// handlers already running, so nothing is cut off mid-reply.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.start()

console.log(`@${bot.me?.username} is running. Press Ctrl-C to stop.`)
