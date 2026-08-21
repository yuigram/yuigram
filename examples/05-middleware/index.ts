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

import { type AnyEventContext, Bot, type Middleware } from 'yuigram'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const bot = Bot.fromToken(token)

/** Time every update and log the result on the way out. */
const timing: Middleware<AnyEventContext> = async (event, next) => {
  const began = performance.now()

  await next()

  event.log.info('handled', {
    kind: event.kind,
    ms: Math.round(performance.now() - began),
  })
}

/**
 * Turn a failure into a reply the user can act on.
 *
 * Rethrowing matters: the framework error handler still needs to see this, and
 * swallowing it here would hide the failure from the logs.
 */
const friendlyErrors: Middleware<AnyEventContext> = async (event, next) => {
  try {
    await next()
  } catch (error) {
    // Middleware sees every kind, and not every kind can reply — a poll answer
    // has no chat. Narrowing here is the honest form: the alternative, casting
    // to a message context, would compile and then throw on a poll answer.
    if ('reply' in event) {
      await event.reply('Something went wrong. It has been logged.').catch(() => undefined)
    }

    throw error
  }
}

/** A crude per-user gate, to show middleware deciding not to continue. */
const ignoreBots: Middleware<AnyEventContext> = async (event, next) => {
  // Not calling `next()` ends the chain: no handler runs for this update.
  if ('sender' in event && event.sender?.is_bot === true) return

  await next()
}

// Registration order is execution order within a band. `priority: 'high'` runs
// a middleware before every normal one regardless of when it was registered,
// which is how cross-cutting concerns stay in front of application logic.
bot.use(timing, { priority: 'high' })
bot.use(friendlyErrors)
bot.use(ignoreBots)

bot.onCommand('slow', async (ctx) => {
  await new Promise((resolve) => setTimeout(resolve, 500))
  await ctx.reply('That took a moment. Check the log for the timing.')
})

bot.onCommand('boom', () => {
  throw new Error('deliberate failure, to show the error path')
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

console.log('Try /slow and /boom.')
