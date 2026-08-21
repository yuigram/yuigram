/**
 * Type-level checks against the installed packages.
 *
 * Copied into a throwaway project by `scripts/smoke-package.mjs` and compiled
 * under each module resolution a consumer might use. It must not import
 * anything from this repository.
 *
 * What this is for is not the compilation but the *inference*: a published
 * build whose declarations resolve through the façade but lose their narrowing
 * compiles here and disappoints every user. So each line below asserts a type
 * the surface is supposed to produce, by using it.
 */

import { Bot, memory, Router, type SessionFlavor, session, userChatKey } from 'yuigram'
import { mockBot } from 'yuigram/testing'
import { nodeWebhook } from 'yuigram/webhook'

interface Cart {
  items: string[]
}

/** What the session plugin adds. The parameter carries extensions, not the whole context. */
type WithCart = SessionFlavor<Cart>

const bot = Bot.fromToken<WithCart>('1:x').extend(
  session<Cart>({
    storage: memory<Cart>(),
    key: userChatKey,
    initial: () => ({ items: [] }),
  }),
)

bot.onCommand('buy', (message) => {
  message.session.items.push(message.command.rest)
  return message.reply(`${message.session.items.length} items`)
})

bot.onMessage((message) => {
  // Guaranteed on a message, so no `?.` is needed and none is written: if the
  // published build widened this, the line stops compiling.
  const chatId: number = message.chat.id
  const text: string | undefined = message.text
  return message.reply(`${chatId} ${text}`)
})

// A named registration, generated per event kind.
bot.onChatMemberJoined((event) => event.reply('welcome'))

// A bound method: the chat came with the update, so only the person is named.
bot.onMessage((message) => message.banChatMember({ user_id: 1 }))

// Supplied parameters stay overridable.
bot.onMessage((message) => message.sendMessage({ chat_id: 2, text: 'elsewhere' }))

// A router declares what it needs, and this client provides it.
const cart = new Router<WithCart>()
cart.onCommand('cart', (message) => message.reply(`${message.session.items.length} items`))
bot.extend(cart)

export const listener = nodeWebhook(bot.webhook())
export const harness = mockBot()
