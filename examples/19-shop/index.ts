// SPDX-License-Identifier: MIT

/**
 * The shop, against Telegram.
 *
 * ```sh
 * BOT_TOKEN=... pnpm tsx examples/19-shop/index.ts
 * ```
 *
 * State goes to `SHOP_DB` (`./shop.db` unless set), a SQLite file several
 * processes of this bot can share: sessions, the media cache and the rate-limit
 * counts are all kept there.
 *
 * A payment provider would confirm an order by calling a webhook of yours; that
 * webhook is where `bot.emit(orderPaid, …)` goes. `/paid` stands in for it here.
 */

import { openDatabase } from '@yuigram/sqlite'
import { Bot, type SessionFlavor } from 'yuigram'
import { type Cart, DEFAULTS, orderPaid, shop } from './shop.js'

const token = process.env['BOT_TOKEN']
if (token === undefined) throw new Error('Set BOT_TOKEN to a token from @BotFather.')

const database = await openDatabase(process.env['SHOP_DB'] ?? './shop.db')
const bot = Bot.fromToken<SessionFlavor<Cart>>(token, { defaults: DEFAULTS })

shop(bot, database)

bot.onCommand('paid', async (message) => {
  // What the provider's webhook would do: name the order and whose it is.
  await bot.emit(
    orderPaid,
    { orderId: `A-${message.message_id}`, total: message.session.items.length * 50 },
    { chat: message.chat, sender: message.sender },
  )
})

bot.onError((error, event) => {
  console.error(`handling ${event.kind} failed:`, error)
})

process.once('SIGINT', () => void bot.stop({ timeout: 5_000 }).finally(() => database.close?.()))
await bot.start()
