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

const bot = Bot.fromToken(token)

// `onCommand` handles the `@yourbot` suffix for you. In a group, `/start` is
// addressed to every bot present and `/start@otherbot` to exactly one, so a
// bot that compares raw text answers messages meant for someone else.
bot.onCommand('start', (message) => message.reply('Hello. Send me anything and I will echo it.'))

bot.onCommand('help', (message) =>
  message.reply('Commands: /start, /help. Any other text is echoed.'),
)

// `onText` fires only for messages that carry text, so `message.text` is a
// string here rather than something to check first. A button press carries
// `data` instead and never lands here.
bot.onText((message) => message.reply(message.text))

// Without an error handler, a failure from a handler propagates to whoever is
// dispatching. Registering one keeps a single bad update from affecting the
// conversations running alongside it.
bot.onError((error, event) => {
  event.log.error('handler failed', { kind: event.kind, error })
})

// Stop cleanly on Ctrl-C: `stop` cancels the in-flight long poll and waits for
// handlers already running, so nothing is cut off mid-reply.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.poll()

console.log(`@${bot.me?.username} is running. Press Ctrl-C to stop.`)
