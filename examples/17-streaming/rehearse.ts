// SPDX-License-Identifier: MPL-2.0

/**
 * The streaming bot, without Telegram.
 *
 * ```sh
 * pnpm tsx examples/17-streaming/rehearse.ts
 * ```
 *
 * Telegram is replaced by the in-process harness from `yuigram/testing`, which
 * drives the real update pipeline and records every request instead of sending
 * it. Three runs, each printing what the bot asked Telegram to do:
 *
 * 1. A question in a private chat, answered in MarkdownV2: drafts while the
 *    answer is written, then one message with its formatting.
 * 2. The same as a rich message.
 * 3. A stream the reader stops: a stop for a draft that is not this stream's
 *    changes nothing, and the one for its own draft ends it, keeping nothing.
 *
 * Nothing leaves this process, and no model is called.
 */

import { type StreamFlavour, stream } from 'yuigram/stream'
import { messageUpdate, mockBot, ok, privateChat, user } from 'yuigram/testing'
import { answer, richAnswer } from './answer.js'

const person = user({ id: 7, first_name: 'Ada' })
const chat = privateChat({ id: 7 })

/** A bot whose draft and rich methods answer as Telegram would. */
function harness() {
  const mock = mockBot<StreamFlavour>()
  mock.on('sendMessageDraft', ok(true))
  mock.on('sendRichMessageDraft', ok(true))
  mock.on('sendRichMessage', (request) =>
    ok({ message_id: 9100, date: 0, chat: { id: request.params['chat_id'], type: 'private' } }),
  )

  return mock
}

const shorten = (text: unknown): string => {
  const flat = String(text).replace(/\n/g, '⏎')

  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat
}

async function answered(): Promise<void> {
  console.log('1. a question, answered as it is written')
  const { bot, send, calls } = harness()
  const streaming = stream({ editInterval: 60 })
  bot.extend(streaming)
  bot.onMessage(async (message) => {
    const result = await message.stream(answer(message.text ?? '', 15), { parseMode: 'MarkdownV2' })
    console.log(
      `   result: ${result.drafts} drafts, ${result.messages.length} message, ${result.pieces} pieces`,
    )
  })

  await send.update(messageUpdate({ text: 'What does streaming do?', from: person, chat }))

  const drafts = calls.callsTo('sendMessageDraft')
  console.log(
    `   ${drafts.length} drafts, the same draft each time: ${new Set(drafts.map((one) => one.params['draft_id'])).size === 1}`,
  )
  for (const draft of [drafts[1], drafts.at(-1)])
    console.log(`   draft:   ${shorten(draft?.params['text'])}`)
  const [sent] = calls.callsTo('sendMessage')
  console.log(`   message: ${shorten(sent?.params['text'])}`)
  console.log(
    `   formatting kept: ${JSON.stringify((sent?.params['entities'] as { type: string }[] | undefined)?.map((one) => one.type))}`,
  )
}

async function rich(): Promise<void> {
  console.log('2. the same as a rich message')
  const { bot, send, calls } = harness()
  bot.extend(stream({ editInterval: 60 }))
  bot.onMessage(async (message) => {
    await message.stream(richAnswer(15), { rich: 'markdown' })
  })

  await send.update(messageUpdate({ text: 'And richly?', from: person, chat }))

  console.log(`   ${calls.callsTo('sendRichMessageDraft').length} rich drafts`)
  const [sent] = calls.callsTo('sendRichMessage')
  console.log(
    `   message: ${shorten((sent?.params['rich_message'] as { markdown?: string })?.markdown)}`,
  )
}

async function stopped(): Promise<void> {
  console.log('3. a stream the reader stops')
  const { bot, send, calls } = harness()
  const streaming = stream({ editInterval: 20, canStop: true })
  bot.extend(streaming)
  await send.update(messageUpdate({ text: 'hello', from: person, chat }))

  const running = streaming.controls.send({
    chatId: 7,
    source: answer('Stop me', 30),
    parseMode: 'MarkdownV2',
  })
  while (calls.callsTo('sendMessageDraft').length < 3)
    await new Promise((resolve) => setTimeout(resolve, 10))
  const own = calls.callsTo('sendMessageDraft').at(-1)?.params['draft_id'] as number

  const stop = (draft: number, id: number) =>
    send.update({
      update_id: id,
      stopped_message_generation: { chat: { id: 7, type: 'private' }, draft_id: draft },
    } as never)

  await stop(own + 1, 900)
  console.log(
    `   a stop for another draft: still running = ${streaming.controls.active.length === 1}`,
  )
  await stop(own, 901)
  const result = await running
  console.log(
    `   the stop for its own draft: stopped = ${result.stopped}, messages sent = ${result.messages.length}`,
  )
}

await answered()
await rich()
await stopped()
