// SPDX-License-Identifier: MPL-2.0

/**
 * The shop, without Telegram.
 *
 * ```sh
 * pnpm tsx examples/19-shop/rehearse.ts
 * ```
 *
 * Telegram is the in-process harness from `yuigram/testing`, which drives the
 * real update pipeline and records every request instead of sending it; the
 * database is SQLite in memory. The run prints what the bot asked Telegram to
 * do and stops with an error if any of it is not what the shop promises.
 */

import { openDatabase } from '@yuigram/sqlite'
import type { Bot, Message } from 'yuigram'
import { messageUpdate, mockBot, ok, privateChat, user } from 'yuigram/testing'
import { DEFAULTS, orderPaid, type ShopBot, shop } from './shop.js'

const ada = user({ id: 7, first_name: 'Ada' })
const eve = user({ id: 8, first_name: 'Eve' })
const chat = privateChat({ id: 7 })
/** The message the catalogue's buttons sit under. */
const shown = messageUpdate({ chat }).message as Message

const database = await openDatabase(':memory:')
const mock = mockBot({ defaults: DEFAULTS, chat })
const bot = mock.bot as unknown as ShopBot

let uploads = 0
mock.on('sendDocument', (request) => {
  const document = request.params['document']
  const id = typeof document === 'string' ? document : `sheet-${++uploads}`
  return ok({
    message_id: 9200,
    date: 0,
    chat: { id: 7, type: 'private' },
    document: { file_id: id, file_unique_id: 'u' },
  })
})
mock.on('editMessageText', ok(true))

shop(bot, database)

function check(condition: boolean, what: string): void {
  if (!condition) throw new Error(`rehearsal: expected ${what}`)
  console.log(`  ok  ${what}`)
}

const last = (method: string) => mock.calls.last(method)?.params ?? {}
const buttonsOf = (params: Record<string, unknown>) =>
  (
    params['reply_markup'] as {
      inline_keyboard: Array<Array<{ text: string; callback_data?: string }>>
    }
  ).inline_keyboard.flat()

console.log('/catalogue, twice')
await mock.send.command('/catalogue', { from: ada })
check(
  last('sendMessage')['parse_mode'] === 'HTML',
  'the catalogue went out as HTML, from the defaults',
)
check(typeof last('sendDocument')['document'] === 'object', 'the sheet was uploaded the first time')
check(last('sendDocument')['disable_notification'] === true, 'the sheet went out silently')
await mock.send.command('/catalogue', { from: ada })
check(
  last('sendDocument')['document'] === 'sheet-1',
  'the sheet was sent by identifier the second time',
)

console.log('paging')
const forward = buttonsOf(last('sendMessage')).find((button) => button.text === '›')
await mock.send.callback(forward?.callback_data ?? '', {
  from: eve,
  message: shown,
})
check(mock.calls.count('editMessageText') === 0, 'somebody else’s press changed nothing')
await mock.send.callback(forward?.callback_data ?? '', {
  from: ada,
  message: shown,
})
check(
  String(last('editMessageText')['text']).includes('Matcha'),
  'Ada’s press showed the next page',
)

console.log('the cart')
const adds = buttonsOf(last('editMessageText')).filter((button) => button.text.startsWith('+'))
for (const button of adds) {
  await mock.send.callback(button.callback_data ?? '', {
    from: ada,
    message: shown,
  })
}
await mock.send.command('/cart', { from: ada })
check(
  String(last('sendMessage')['text']).includes('THIRD10'),
  'a third item brought a discount code',
)

console.log('a payment, from outside Telegram')
await (bot as unknown as Bot).emit(
  orderPaid,
  { orderId: 'A-17', total: 150 },
  { chat: { id: 7 }, sender: { id: 7 } },
)
check(
  String(last('sendMessage')['text']).includes('A-17'),
  'the paid order was confirmed to the customer',
)
await mock.send.command('/cart', { from: ada })
check(String(last('sendMessage')['text']).includes('empty'), 'the cart was emptied by the payment')

await mock.dispose()
database.close?.()
console.log('the shop behaves as it says')
