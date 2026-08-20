/**
 * 05 — Middleware.
 *
 * Middleware wraps handlers as an onion: everything before `await next()` runs
 * on the way in, everything after runs on the way out. That shape is what makes
 * timing, error handling and cleanup expressible at all — a plain "before"
 * hook cannot measure how long the work took.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/05-middleware/index.ts
 * ```
 */

import { Bot, type BotContext, type Middleware } from 'yuigram'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const bot = new Bot(token)

/** Time every update and log the result on the way out. */
const timing: Middleware<BotContext> = async (ctx, next) => {
  const began = performance.now()

  await next()

  ctx.log.info('handled', {
    kind: ctx.kind,
    ms: Math.round(performance.now() - began),
  })
}

/**
 * Turn a failure into a reply the user can act on.
 *
 * Rethrowing matters: the framework error handler still needs to see this, and
 * swallowing it here would hide the failure from the logs.
 */
const friendlyErrors: Middleware<BotContext> = async (ctx, next) => {
  try {
    await next()
  } catch (error) {
    await ctx.reply('Something went wrong. It has been logged.').catch(() => undefined)
    throw error
  }
}

/** A crude per-user gate, to show middleware deciding not to continue. */
const ignoreBots: Middleware<BotContext> = async (ctx, next) => {
  // Not calling `next()` ends the chain: no handler runs for this update.
  if (ctx.sender?.is_bot === true) return

  await next()
}

// Registration order is execution order within a band. `priority: 'high'` runs
// a middleware before every normal one regardless of when it was registered,
// which is how cross-cutting concerns stay in front of application logic.
bot.use(timing, { priority: 'high' })
bot.use(friendlyErrors)
bot.use(ignoreBots)

bot.command('slow', async (ctx) => {
  await new Promise((resolve) => setTimeout(resolve, 500))
  await ctx.reply('That took a moment. Check the log for the timing.')
})

bot.command('boom', () => {
  throw new Error('deliberate failure, to show the error path')
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

console.log('Try /slow and /boom.')
