// SPDX-License-Identifier: MIT

/**
 * A small shop, as one bot would be put together for production.
 *
 * - **State** in SQLite: each customer's cart is a session that commits only
 *   when a handler finishes, so a failed checkout leaves the cart as it was;
 *   a pending discount code is a field that expires on its own.
 * - **Defaults**: HTML for every method that takes a parse mode, no link
 *   previews, and silent product sheets.
 * - **Caching**: the catalogue sheet is uploaded once and sent by identifier
 *   after that.
 * - **Limits**: twenty updates a minute per customer, counted in the same
 *   database so every process running the bot shares one count.
 * - **Routing**: the catalogue lives in a router of its own, paged through
 *   buttons only the customer who asked can press.
 * - **An event from outside**: a payment provider's confirmation is raised as
 *   `order_paid` and handled like any update, with the customer's session.
 */

import { type SqliteDatabase, sqliteCounter, sqliteStore } from '@yuigram/sqlite'
import {
  type Bot,
  defineCallbackData,
  defineEvent,
  expiring,
  InlineKeyboard,
  limiter,
  type MethodDefaults,
  media,
  mediaCache,
  pager,
  Router,
  type SessionFlavor,
  session,
  userChatKey,
} from 'yuigram'

/** What a customer's session holds. */
export interface Cart {
  items: string[]
  /** A code offered once, good for ten minutes. */
  discount?: string | undefined
}

/** The bot this shop runs on: its contexts carry the cart. */
export type ShopBot = Bot<SessionFlavor<Cart>>

/** What the shop sells. */
export const PRODUCTS = ['Tea', 'Coffee', 'Cocoa', 'Matcha', 'Chai', 'Mate', 'Rooibos'] as const

/** The defaults the shop's bot is built with. */
export const DEFAULTS: MethodDefaults = {
  '*': { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
  sendDocument: { disable_notification: true },
}

/** Raised by the payment provider's webhook, never by Telegram. */
export const orderPaid = defineEvent<{ readonly orderId: string; readonly total: number }>(
  'order_paid',
)

const catalogue = pager('catalogue', { pageSize: 3 })
const add = defineCallbackData('add').literal('item', PRODUCTS)

/** The sheet every customer is sent, the same bytes each time. */
const SHEET = PRODUCTS.map((name, index) => `${index + 1}. ${name}`).join('\n')

/** Put the shop together on a bot, keeping its state in `database`. */
export function shop(
  bot: ShopBot,
  database: SqliteDatabase,
): { readonly cache: ReturnType<typeof mediaCache> } {
  const cache = mediaCache({ storage: sqliteStore<string>(database, { table: 'media' }) })
  const limits = limiter({ counter: sqliteCounter(database) })

  bot.extend(
    session<Cart>({
      storage: sqliteStore<Cart>(database, { table: 'carts' }),
      key: userChatKey,
      initial: () => ({ items: [] }),
      commit: 'success',
      ttl: 30 * 24 * 60 * 60,
    }),
  )
  bot.extend(cache)
  bot.use(
    limits.middleware({
      limit: 20,
      windowMs: 60_000,
      onLimited: async (event, info) => {
        if (event.kind === 'message') {
          await bot.api.sendMessage({
            chat_id: (event as unknown as { chat: { id: number } }).chat.id,
            text: `Slow down — try again in ${Math.ceil(info.resetMs / 1000)} s.`,
          })
        }
      },
    }),
  )

  const shelf = new Router<SessionFlavor<Cart>>()

  shelf.onCommand('catalogue', async (message) => {
    const shown = catalogue.page(PRODUCTS, 0)
    await message.reply(`<b>Catalogue</b>\n${shown.items.join('\n')}`, {
      reply_markup: pageKeyboard(shown.items, catalogue.keyboard(shown, message.sender?.id ?? 0)),
    })
    await message.reply({ document: media.text(SHEET, 'catalogue.txt') })
  })

  shelf.onCallbackQuery(async (query) => {
    if (catalogue.filter(query)) {
      const press = catalogue.read(query)
      if (press === undefined) return void (await query.answer())
      if (press.kind === 'refused') return void (await query.answer('This list is someone else’s.'))

      const shown = catalogue.page(PRODUCTS, press.page)
      await query.edit(`<b>Catalogue</b>\n${shown.items.join('\n')}`, {
        reply_markup: pageKeyboard(shown.items, catalogue.keyboard(shown, press.owner)),
      })
      return void (await query.answer())
    }

    const added = query.data === undefined ? undefined : add.unpack(query.data)
    if (added !== undefined) {
      query.session.items.push(added.item)
      if (query.session.items.length === 3)
        query.session.discount = expiring('THIRD10', 10 * 60_000)
      await query.answer(`${added.item} is in your cart.`)
    }
  })

  bot.extend(shelf)

  bot.onCommand('cart', async (message) => {
    const { items, discount } = message.session
    const lines = items.length === 0 ? ['Your cart is empty.'] : items.map((item) => `• ${item}`)
    if (discount !== undefined) lines.push(`Code <code>${discount}</code> takes 10% off.`)
    await message.reply(lines.join('\n'))
  })

  bot.on(orderPaid, async (event) => {
    await bot.api.sendMessage({
      chat_id: Number(event.chat?.id),
      text: `Order <b>${event.payload.orderId}</b> is paid: ${event.payload.total} ⭐. Thank you.`,
    })
    event.session.items = []
  })

  return { cache }
}

/** A row of add-to-cart buttons over the page's own row. */
function pageKeyboard(items: readonly string[], paging: InlineKeyboard): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  for (const item of items)
    keyboard.add(add.button(`+ ${item}`, { item: item as (typeof PRODUCTS)[number] }))
  keyboard.row()
  for (const button of paging.inline_keyboard.flat()) keyboard.add(button)
  return keyboard
}
