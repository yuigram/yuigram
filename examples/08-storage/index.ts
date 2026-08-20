/**
 * 08 — Storage.
 *
 * Sessions need somewhere to live. Storage is a three-method contract, so the
 * built-in adapters and anything you write are interchangeable — the framework
 * core never depends on a database driver.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/08-storage/index.ts
 * ```
 */

import type { KV } from '@yuigram/core'
import {
  Bot,
  type Context,
  createSession,
  file,
  memory,
  type SessionFlavor,
  userChatKey,
} from 'yuigram'

/** This bot remembers one number per person. */
interface Seen {
  seen: number
}

type MyContext = Context & SessionFlavor<Seen>

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

// --- The built-in adapters ---------------------------------------------------

// In memory: fastest, and gone when the process exits. Right for tests and for
// state that is genuinely disposable.
const inMemory = memory()

// On disk: survives a restart. One file per key, written atomically.
const onDisk = file('./state')

// Both report what they are, which is how a startup check can refuse to run a
// production bot on a store that forgets everything.
console.log('memory:', inMemory.info, '| file:', onDisk.info)

// --- A custom adapter --------------------------------------------------------

/**
 * Any object satisfying the contract works.
 *
 * This one wraps another store and counts reads, which is all an instrumenting
 * or caching layer has to do. A Redis or Postgres adapter is the same shape.
 */
function counting<V>(inner: KV<V>): KV<V> & { reads: number } {
  const wrapper = {
    reads: 0,
    async get(key: string) {
      wrapper.reads += 1
      return inner.get(key)
    },
    set: (key: string, value: V, options?: Parameters<KV<V>['set']>[2]) =>
      inner.set(key, value, options),
    delete: (key: string) => inner.delete(key),
  }

  return wrapper
}

const storage = counting(file<Seen>('./state'))

// --- Using it ----------------------------------------------------------------

const bot = new Bot<MyContext>(token)

bot.use(
  createSession<MyContext, Seen>({
    storage,
    key: userChatKey,
    initial: () => ({ seen: 0 }),
    // Expire state a month after its last write. Without a TTL, a store grows
    // by one entry per user who ever messaged the bot and never shrinks.
    ttl: 60 * 60 * 24 * 30,
  }),
)

bot.command('start', (ctx) => ctx.reply('Send me anything. I remember across restarts.'))

bot.on('message', async (ctx) => {
  if (ctx.text === undefined || ctx.text.startsWith('/')) return

  ctx.session.seen += 1
  await ctx.reply(`That is message ${ctx.session.seen}. Restart me and try again.`)
})

bot.command('stats', (ctx) => ctx.reply(`Store reads so far: ${storage.reads}`))

bot.catch((error, ctx) => {
  ctx.log.error('handler failed', { kind: ctx.kind, error })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.start()

console.log('Storage example running. State is under ./state.')
