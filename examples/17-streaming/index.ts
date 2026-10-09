// SPDX-License-Identifier: MPL-2.0

/**
 * 17 — Streaming: an answer shown while it is being written.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/17-streaming/index.ts
 * ```
 *
 * Message the bot in a private chat. It answers with a draft that grows as the
 * answer arrives — Telegram's `sendMessageDraft` — and sends the whole answer
 * as a message at the end, with a button to stop it while it is being written.
 * `/rich` streams a rich message instead. `rehearse.ts` shows the same without
 * Telegram.
 *
 * What to know before streaming for real:
 *
 * - **Private chats only.** Drafts exist nowhere else; streaming into a group
 *   is refused before any request is made.
 * - **A stop is honoured only for this stream's own drafts,** in its own chat.
 *   Pressing stop on something that already ended, or in another chat, does
 *   nothing.
 * - **A failed final message is not retried** unless Telegram said to wait: it
 *   may have been delivered without its answer arriving, and sending it again
 *   would say it twice. The stream reports what was sent and what was not.
 */

import { Bot } from 'yuigram'
import { type StreamFlavour, stream } from 'yuigram/stream'
import { answer, richAnswer } from './answer.js'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('set BOT_TOKEN to run this example')
}

const bot = Bot.fromToken<StreamFlavour>(token)
bot.extend(stream({ canStop: true }))

bot.onCommand('rich', async (message) => {
  await message.stream(richAnswer(), { rich: 'markdown' })
})

bot.onMessage(async (message) => {
  if (message.chat.type !== 'private') {
    await message.reply('Message me directly and I will write the answer as you watch.')
    return
  }

  const result = await message.stream(answer(message.text ?? ''), { parseMode: 'MarkdownV2' })
  console.log(
    `sent ${result.messages.length} message(s) after ${result.drafts} drafts` +
      (result.stopped ? ', stopped by the reader' : ''),
  )
})

process.once('SIGINT', () => void bot.stop())

await bot.poll()
