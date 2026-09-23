/**
 * 16 — Durable flows: a conversation that survives a restart.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/16-durable-flows/index.ts
 * ```
 *
 * Send `/order`, answer the first question, stop the bot with Ctrl+C, start it
 * again and answer the second. The order finishes where it stopped: nothing is
 * asked twice and nothing is placed twice. `rehearse.ts` does the same without
 * Telegram, across two real processes.
 *
 * Three things are worth knowing before writing a flow:
 *
 * - **The function runs again on every resume**, from the top, with every step
 *   it already took answered from the store. Code between steps must take the
 *   same path every time and must not do anything that matters twice; anything
 *   that reaches outside goes through `flow.effect`.
 * - **An effect interrupted halfway is reported, not repeated**, unless it is
 *   declared safe to repeat. Nothing here makes a Telegram call exactly-once.
 * - **One process per conversation.** Updates for one conversation are handled
 *   one at a time within a process; two processes sharing a store are not
 *   coordinated.
 */

import { Bot } from 'yuigram'
import { install, type WithConversation } from './flow.js'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('set BOT_TOKEN to run this example')
}

const bot = Bot.fromToken<WithConversation>(token)
const flows = install(bot, './state')

// Deadlines that passed while the bot was down are acted on now, and the ones
// still to come are scheduled. Without this they are still noticed — on the
// next message in their conversation.
const found = await flows.resume()
console.log(`${found.active} orders in progress, ${found.expired} timed out while stopped`)

process.once('SIGINT', () => {
  // Stopping is not cancelling: every order in progress stays as stored, and
  // the next start picks it up.
  void flows.shutdown().then(() => bot.stop())
})

await bot.poll()
