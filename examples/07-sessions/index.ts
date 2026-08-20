/**
 * 07 — Sessions.
 *
 * Per-user state that survives between updates. Declaration merging gives the
 * session a shape, so `ctx.session` is typed rather than a bag of `unknown`.
 *
 * Two things are worth knowing before using this:
 *
 * - The session loads on first access, not on every update. A handler that
 *   never touches it costs nothing.
 * - Work for one key is serialized. Two messages arriving together cannot both
 *   read `count: 0` and both write `1` — the classic lost update, and one users
 *   hit immediately by sending two messages quickly.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/07-sessions/index.ts
 * ```
 */

import { Bot, type Context, createSession, memory, userChatKey } from 'yuigram'

// Declaring the shape here types `ctx.session` everywhere.
declare module '@yuigram/core' {
  interface SessionData {
    count: number
    name?: string
  }
  interface ContextExtensions {
    session: SessionData
  }
}

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const bot = new Bot(token)

bot.use(
  createSession<Context>({
    storage: memory(),
    // Per user, per chat. The scope is passed explicitly rather than defaulted,
    // because getting it wrong is the most common session bug: a chat-wide key
    // lets one member read another's state, and a user-wide key leaks a group
    // conversation into a direct message.
    key: userChatKey,
    initial: () => ({ count: 0 }),
  }),
)

bot.command('start', async (ctx) => {
  await ctx.reply('Send me anything and I will count it. /count shows the total, /reset clears.')
})

bot.on('message', async (ctx) => {
  if (ctx.text === undefined || ctx.text.startsWith('/')) return

  // Mutating the session marks it dirty; it is written back once the handler
  // finishes. An untouched session is never written.
  ctx.session.count += 1
})

bot.command('count', async (ctx) => {
  await ctx.reply(`I have seen ${ctx.session.count} message(s) from you here.`)
})

bot.command('name', async (ctx) => {
  if (ctx.command.rest === '') {
    await ctx.reply(ctx.session.name ?? 'I do not know your name. Try /name Alice.')
    return
  }

  ctx.session.name = ctx.command.rest
  await ctx.reply(`I will call you ${ctx.session.name}.`)
})

bot.command('reset', async (ctx) => {
  // Replacing the value wholesale also marks it dirty.
  ctx.session = { count: 0 }
  await ctx.reply('Forgotten.')
})

bot.catch((error, ctx) => {
  ctx.log.error('handler failed', { kind: ctx.kind, error })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.start()

console.log('Session example running. State is in memory and vanishes on restart.')
console.log('Swap memory() for file("./state") to keep it — see 08-storage.')
