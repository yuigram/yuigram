/**
 * Dispatch overhead, measured.
 *
 * `docs/performance.md` §3 budgets framework overhead at under a millisecond
 * per update. This is what makes that a measurement rather than a hope.
 *
 * It times the whole per-update path — normalization, service promotion, the
 * middleware chain, filter evaluation across several registrations, context
 * construction and handler invocation — with the network replaced by the mock
 * transport. Handler and network time are excluded by construction, since the
 * handlers do nothing.
 *
 * ```sh
 * pnpm bench
 * ```
 *
 * The number is indicative, not a regression gate: it moves with the machine.
 * Run it before and after a change to the dispatch path to see the direction.
 */

import { createLogger, silentSink } from '../packages/core/dist/index.js'
import { Bot } from '../packages/bot-api/dist/bot.js'
import { mockTransport, ok } from '../packages/bot-api/dist/testing/mock-transport.js'

const WARMUP = 2_000
const ITERATIONS = 20_000

const transport = mockTransport()
transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'B', username: 'b' }))

const bot = new Bot('111111111:TESTTESTTESTTESTTESTTESTTESTTESTTES', {
  client: transport,
  log: createLogger({ sink: silentSink() }),
})

// A stack a real bot would have: several middleware, several registrations of
// which one matches, so filtering is exercised rather than skipped.
for (let index = 0; index < 5; index += 1) {
  bot.use(async (_context, next) => next())
}

bot.on('callback_query', () => {})
bot.on('edited_message', () => {})
bot.command('start', () => {})
bot.text('ping', () => {})

let handled = 0
bot.on('message', () => {
  handled += 1
})

const update = (id) => ({
  update_id: id,
  message: { message_id: id, date: 1, chat: { id: 1, type: 'private' }, text: 'hello world' },
})

for (let index = 0; index < WARMUP; index += 1) {
  await bot.handleUpdate(update(index))
}

const began = performance.now()
for (let index = 0; index < ITERATIONS; index += 1) {
  await bot.handleUpdate(update(index))
}
const elapsed = performance.now() - began

const perUpdate = (elapsed / ITERATIONS) * 1000
const throughput = Math.round(ITERATIONS / (elapsed / 1000))

process.stdout.write(`updates handled:  ${handled.toLocaleString()}\n`)
process.stdout.write(`per update:       ${perUpdate.toFixed(1)} microseconds\n`)
process.stdout.write(`throughput:       ${throughput.toLocaleString()} updates/sec\n`)
process.stdout.write(`budget:           1000 microseconds — ${perUpdate < 1000 ? 'within' : 'EXCEEDED'}\n`)

process.exit(perUpdate < 1000 ? 0 : 1)
