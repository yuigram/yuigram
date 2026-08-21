/**
 * 10 — A production setup.
 *
 * Everything a bot needs once real people are using it, and nothing that is
 * only interesting in a demo: pacing so Telegram does not refuse the bot,
 * limits so one user cannot occupy it, bounded concurrency so a slow handler
 * does not become the throughput, and a shutdown that finishes what it started.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/10-production/index.ts
 * ```
 */

import { Bot, createLogger, file, rateLimit, retryOnFloodWait, throttle } from 'yuigram'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const log = createLogger({ level: 'info', name: 'bot' })

const bot = Bot.fromToken(token, { log })

// --- Staying inside Telegram's limits -----------------------------------------

// Two halves of one problem. The throttle paces calls so the limits are not
// reached; the retry recovers when an unlucky burst reaches them anyway.
// Registered outermost first, so a retry re-enters the throttle and the second
// attempt is paced too rather than firing straight back into the wall.
const paced = throttle({
  // A little under Telegram's nominal 30/s, for headroom against clock skew
  // and requests already in flight.
  globalPerSecond: 25,
  // A typing indicator is not a message and can pulse faster than one.
  perMethod: { sendChatAction: { chatPerSecond: 5 } },
})

bot.hook(paced.hook)
bot.hook(retryOnFloodWait({ maxWait: 30, log }))

// --- Keeping one user from occupying the bot ----------------------------------

bot.use(
  rateLimit({
    limit: 10,
    windowMs: 10_000,
    // Saying something costs a message per message over the limit, so it is
    // said once per window rather than per update: the count crossing the
    // limit is the first refusal.
    onLimited: async (event, info) => {
      if (info.count === 11 && 'reply' in event) {
        await event.reply(`Too fast — try again in ${Math.ceil(info.resetMs / 1000)}s.`)
      }
    },
  }),
)

// --- Observability -------------------------------------------------------------

// A bot that is constantly pacing is a bot that needs a different plan, and
// that is invisible without looking.
const metrics = setInterval(() => {
  if (paced.handle.pending > 0) {
    log.info('outbound queue', {
      pending: paced.handle.pending,
      chats: paced.handle.chatWindows,
      groups: paced.handle.groupWindows,
    })
  }
}, 30_000)

metrics.unref()

// --- Handlers ------------------------------------------------------------------

bot.onCommand('start', (message) => message.reply('Running. Send me anything.'))

bot.onText(async (message) => {
  // Slow work, with the typing indicator kept alive for as long as it takes.
  await message.reply(message.text)
})

// Every failure reaches here: one bad update must not affect the conversations
// running alongside it.
bot.onError((error, event) => {
  log.error('handler failed', { kind: event.kind, updateId: event.updateId, error })
})

// --- Lifecycle -----------------------------------------------------------------

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info('shutting down')

    // Stops intake, cancels the in-flight long poll, and waits for handlers
    // already running — including the ones the last batch started. A bot killed
    // mid-handler loses that work, and Telegram will not resend it.
    void bot.stop({ timeout: 10_000 }).then(() => {
      clearInterval(metrics)
      process.exit(0)
    })
  })
}

await bot.poll({
  // One chat's updates always run in order; unrelated chats run in parallel up
  // to this bound. Raise it for handlers that mostly wait on the network, lower
  // it for handlers that mostly wait on a database with a small pool.
  concurrency: 16,
  // Subscribe to exactly the kinds this bot registered handlers for. Telegram
  // does not deliver some kinds at all unless asked.
  allowedUpdates: 'auto',
  // Anything queued while the bot was down is stale by definition for a bot
  // that answers conversations. Remove this if missed updates matter more.
  dropPending: true,
})

log.info('polling', { username: bot.me?.username })

// Storage note: `file('./state')` is the built-in durable store, and the `KV`
// contract behind it is four methods — so an adapter for Redis or Postgres is
// written against the client an application already configures.
void file
