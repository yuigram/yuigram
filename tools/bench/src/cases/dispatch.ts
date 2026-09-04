/**
 * What an update costs to get through the framework.
 *
 * `docs/performance.md` §3 budgets framework overhead at under a millisecond per
 * update, excluding handler and network time. These three measure the whole
 * per-update path — normalization, service promotion, the middleware chain,
 * filter evaluation, context construction and handler invocation — with the
 * network replaced by the mock transport and handlers that do nothing, so what
 * is left is the framework.
 *
 * The three differ only in what a bot has registered, which is the shape that
 * actually varies between applications: one handler and no filters, fifty
 * handlers behind filters, and a stack of middleware. Measuring them apart is
 * what makes a regression attributable — a change that slows filtering shows up
 * in one of them rather than being averaged into a single number.
 */

import { Bot } from '../../../../packages/bot-api/dist/bot.js'
import { mockTransport, ok } from '../../../../packages/bot-api/dist/testing/mock-transport.js'
import { createLogger, silentSink } from '../../../../packages/core/dist/index.js'
import type { Benchmark, Measurement } from '../budget.js'

/** Enough to leave the interpreter's early guesses behind. */
const WARMUP = 2_000
const ITERATIONS = 20_000

/** The budget §3 sets for everything the framework does to one update. */
const PER_UPDATE = 1_000
const SOURCE = 'performance.md §3'

/** A bot that answers nothing, so what is timed is the path rather than the work. */
function quiet(): Bot {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'B', username: 'b' }))

  return Bot.fromToken('0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000', {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })
}

/** One update, differing only by identifier so nothing is deduplicated. */
const update = (id: number) => ({
  update_id: id,
  message: {
    message_id: id,
    date: 1_700_000_000,
    chat: { id: 42, type: 'private' as const },
    from: { id: 7, is_bot: false, first_name: 'A' },
    text: 'ping',
  },
})

/** Time one bot over the same traffic, and report the cost of a single update. */
async function measure(name: string, bot: Bot): Promise<Measurement> {
  for (let index = 0; index < WARMUP; index += 1) await bot.handleUpdate(update(index))

  const began = performance.now()
  for (let index = 0; index < ITERATIONS; index += 1) await bot.handleUpdate(update(index))
  const elapsed = performance.now() - began

  const perUpdate = (elapsed / ITERATIONS) * 1000

  return {
    name,
    value: perUpdate,
    unit: 'µs/update',
    note: `${Math.round(ITERATIONS / (elapsed / 1000)).toLocaleString()} updates/sec`,
  }
}

/** The floor: one handler, nothing to select between. */
const simple: Benchmark = {
  name: 'dispatch/simple',
  budget: PER_UPDATE,
  source: SOURCE,
  run: async () => {
    const bot = quiet()
    bot.onMessage(() => {})

    return await measure('dispatch/simple', bot)
  },
}

/** Fifty registrations behind filters, of which one matches. */
const filtered: Benchmark = {
  name: 'dispatch/filtered',
  budget: PER_UPDATE,
  source: SOURCE,
  run: async () => {
    const bot = quiet()
    for (let index = 0; index < 24; index += 1) {
      bot.on('callback_query', () => {})
      bot.on('message_edited', () => {})
    }
    bot.onCommand('start', () => {})
    bot.onText('ping', () => {})

    return await measure('dispatch/filtered', bot)
  },
}

/** The same traffic through a stack of middleware that only continues. */
const middleware: Benchmark = {
  name: 'dispatch/middleware',
  budget: PER_UPDATE,
  source: SOURCE,
  run: async () => {
    const bot = quiet()
    for (let index = 0; index < 10; index += 1) {
      bot.use(async (_context, next) => {
        await next()
      })
    }
    bot.onMessage(() => {})

    return await measure('dispatch/middleware', bot)
  },
}

export const DISPATCH: readonly Benchmark[] = [simple, filtered, middleware]
