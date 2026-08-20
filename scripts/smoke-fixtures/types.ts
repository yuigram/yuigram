/**
 * Type-level checks against the installed packages.
 *
 * Copied into a throwaway project by `scripts/smoke-package.mjs` and compiled
 * under each module resolution a consumer might use. It must not import
 * anything from this repository.
 */

import { Bot, type Context, createSession, memory, type SessionFlavor, userChatKey } from 'yuigram'
import { mockBot } from 'yuigram/testing'
import { nodeWebhook } from 'yuigram/webhook'

interface Cart {
  items: string[]
}

type MyContext = Context & SessionFlavor<Cart>

const bot = new Bot<MyContext>('1:x')

bot.use(
  createSession<MyContext, Cart>({
    storage: memory<Cart>(),
    key: userChatKey,
    initial: () => ({ items: [] }),
  }),
)

bot.command('buy', (ctx) => {
  ctx.session.items.push(ctx.command.rest)
  return ctx.reply(`${ctx.session.items.length} items`)
})

bot.on('message', (ctx) => {
  const chatId: number | undefined = ctx.chat?.id
  const text: string | undefined = ctx.text
  return ctx.reply(`${chatId} ${text}`)
})

export const listener = nodeWebhook(bot.webhookHandler())
export const harness = mockBot()
