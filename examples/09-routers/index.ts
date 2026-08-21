/**
 * 09 — Routers.
 *
 * One client object collecting every handler is fine at ten and a bottleneck at
 * several hundred. A router carries the same registration surface and installs
 * onto the client, so a feature becomes a module with its own middleware.
 *
 * The property worth having is the scoping: `requireAdmin` below runs for the
 * updates the admin router handles and for nothing else, so it is a real gate
 * rather than a global one that returns early on every message.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… ADMIN_ID=123456789 pnpm tsx examples/09-routers/index.ts
 * ```
 */

import { Bot, Router } from 'yuigram'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const adminId = Number(process.env['ADMIN_ID'] ?? 0)

// --- A feature, as a module --------------------------------------------------

// In a real application this lives in its own file and is exported. Everything
// is registered before the router is installed, which is what lets the client
// subscribe to exactly the kinds this router covers.
const admin = new Router({ name: 'admin' })

// Scoped middleware. It never runs for an update the admin router does not
// handle, so the cost of this feature on an ordinary message is zero.
//
// Middleware sees every kind the router covers, so the narrowing is checked
// rather than asserted: not every event has a sender — a poll answer does, a
// deleted-business-messages notice does not.
admin.use(async (event, next) => {
  const sender = 'sender' in event ? event.sender : undefined

  if (sender?.id !== adminId) {
    event.log.debug('not an admin, skipping the admin router')
    return
  }

  await next()
})

admin.onCommand('stats', (message) =>
  message.reply(`Uptime ${Math.round(process.uptime())}s, memory ${memoryMb()} MB.`),
)

admin.onCommand('kick', async (message) => {
  const target = message.reply_to_message?.from

  if (target === undefined) {
    await message.reply('Reply to someone with /kick.')
    return
  }

  // The chat came with the update, so only the person has to be named.
  await message.banChatMember({ user_id: target.id })
  await message.reply(`Removed ${target.first_name}.`)
})

// A router may handle its own failures. Without this they would travel to the
// client's `onError`, which is where a directly-registered handler's go.
admin.onError((error, event) => {
  event.log.error('admin router failed', { kind: event.kind, error })
})

// --- Another one, for a different concern ------------------------------------

const shop = new Router({ name: 'shop' })

shop.use(async (event, next) => {
  event.log.debug('shop router handling an update', { kind: event.kind })
  await next()
})

shop.onCommand('cart', (message) => message.reply('Your cart is empty.'))
shop.onCallbackQuery(/^add:/, async (query) => {
  await query.answerCallbackQuery({ text: 'Added' })
  await query.edit(`Added ${query.data?.slice(4) ?? 'it'} to your cart.`)
})

// --- The application ---------------------------------------------------------

const bot = Bot.fromToken(token)

// Client middleware wraps every router: client in, router in, handler, router
// out, client out.
bot.use(async (event, next) => {
  const started = performance.now()
  await next()
  event.log.debug('handled', { kind: event.kind, ms: performance.now() - started })
})

bot.onCommand('start', (message) => message.reply('Try /cart, or /stats if you are the admin.'))

// Installing reads which kinds each router covers. Registering a handler on a
// router after this point throws, rather than silently never running.
bot.extend(admin).extend(shop)

bot.onError((error, event) => {
  event.log.error('handler failed', { kind: event.kind, error })
})

/** Resident memory, rounded, for the /stats reply. */
function memoryMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.poll()

console.log('Router example running. Two features, two middleware scopes, one client.')
