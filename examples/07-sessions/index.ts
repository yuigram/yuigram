/**
 * 07 — Sessions.
 *
 * Per-user state that survives between updates. Naming the flavour once gives
 * the session a shape, so `message.session` is typed rather than a bag of
 * `unknown`.
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

import { Bot, memory, type SessionFlavor, session, userChatKey } from 'yuigram'

/** Whatever this bot needs to remember about someone. */
interface Cart {
  count: number
  name?: string
}

/**
 * What the session plugin adds to this bot's contexts.
 *
 * Naming the flavour is what types `message.session`. It is per bot rather than
 * per program, so a second bot in this repository can remember something else
 * entirely.
 */
type WithCart = SessionFlavor<Cart>

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

// The flavour is named once, on the client. The plugin then needs only the
// value type: repeating the flavour in a second type argument never caught a
// mistake, it only produced one to debug.
const bot = Bot.fromToken<WithCart>(token).extend(
  session<Cart>({
    storage: memory(),
    // Per user, per chat. The scope is passed explicitly rather than defaulted,
    // because getting it wrong is the most common session bug: a chat-wide key
    // lets one member read another's state, and a user-wide key leaks a group
    // conversation into a direct message.
    key: userChatKey,
    initial: () => ({ count: 0 }),
  }),
)

bot.onCommand('start', async (ctx) => {
  await ctx.reply('Send me anything and I will count it. /count shows the total, /reset clears.')
})

bot.on('message', async (ctx) => {
  if (ctx.text === undefined || ctx.text.startsWith('/')) return

  // Changing the session marks it dirty, wherever the change happens — a nested
  // array pushed into counts too — and it is written back once the handler
  // finishes. A session that was only read is never written.
  ctx.session.count += 1
})

bot.onCommand('count', async (ctx) => {
  await ctx.reply(`I have seen ${ctx.session.count} message(s) from you here.`)
})

bot.onCommand('name', async (ctx) => {
  if (ctx.command.rest === '') {
    await ctx.reply(ctx.session.name ?? 'I do not know your name. Try /name Alice.')
    return
  }

  ctx.session.name = ctx.command.rest
  await ctx.reply(`I will call you ${ctx.session.name}.`)
})

bot.onCommand('reset', async (ctx) => {
  // Replacing the value wholesale also marks it dirty.
  ctx.session = { count: 0 }
  await ctx.reply('Forgotten.')
})

bot.onError((error, ctx) => {
  ctx.log.error('handler failed', { kind: ctx.kind, error })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.poll()

console.log('Session example running. State is in memory and vanishes on restart.')
console.log('Swap memory() for file("./state") to keep it — see 08-storage.')
