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

import {
  type Account,
  type AnyEventContext,
  App,
  Bot,
  encrypted,
  type MtprotoContext,
  memory,
  Router,
  type SessionFlavor,
  session,
  userChatKey,
} from 'yuigram'
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

// One application holding both transports, which is the whole point of the
// façade: the two subsystems never import each other, so this is the only way a
// consumer can put them together — and it has to type-check as installed.
const app = new App()
app.add(bot)

declare const user: Account
app.add(user)

// One registration across both transports, typed by the union the application
// was declared with. A published build that lost the discriminant compiles the
// call and silently stops narrowing, which is what this catches.
const cross = new App<AnyEventContext | MtprotoContext>()
cross.on('message', (event) => {
  const transport: 'bot-api' | 'mtproto' = event.transport
  if (event.transport === 'mtproto') {
    const text: string | undefined = event.text
    return [transport, text]
  }
  return [transport, event.updateId]
})

// The discriminant a handler installed on more than one client branches on. A
// published build that widened it to `string` still compiles everywhere else.
declare const context: MtprotoContext
export const transport: 'mtproto' = context.transport

// An encrypted store keeps the value type a caller asked for while the store it
// wraps holds ciphertext. A published build that collapsed either half would
// hand every read back as `unknown`.
const vault = encrypted<Cart>(memory<string>(), 'a-secret-for-the-smoke-test')
export const stored: Promise<Cart | undefined> = vault.get('a')
export const persists: boolean = vault.info.persistent

export const listener = nodeWebhook(bot.webhook())
export const harness = mockBot()
