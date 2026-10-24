// SPDX-License-Identifier: MIT

/**
 * 20 — A bot that reports what an account sees of a user's status.
 *
 * ```sh
 * pnpm tsx examples/20-presence-watch/keys.ts production   # once, Telegram's server keys
 * pnpm tsx examples/20-presence-watch/login.ts             # once, to sign the account in
 * pnpm tsx examples/20-presence-watch/index.ts             # the watch itself
 * ```
 *
 * One `App` holds a `Bot` and an `Account`. The operator talks to the bot; the
 * account resolves the names the operator gives and observes what Telegram
 * reports of those users; the bot reports it back. `watch.ts` is the whole of
 * the logic and `rehearse.ts` runs it with no network at all. `README.ru.md`
 * says how to configure it and what it can and cannot know.
 *
 * This file reaches Telegram. It is for a session a person starts themselves,
 * with their own credentials, to watch somebody who has agreed to it.
 */

import { App } from 'yuigram'
import { configure, openAccount, openBot, openRecords } from './config.js'
import { reportBotErrors } from './errors.js'
import { presenceWatch } from './watch.js'

const config = configure()

const bot = openBot(config)
const account = openAccount(config)

const app = new App()
app.add(bot)
app.add(account)
// A client that fails to start or to keep running.
app.onError(({ client, error }) => {
  console.error(`${client.name} failed:`, error instanceof Error ? error.message : error)
})
// A bot handler that throws while answering an update: a separate matter.
reportBotErrors(bot, (line) => console.error(line))

// The account has to be signed in already: this process asks nobody anything.
await account.connect()
const notSignedIn = (): never => {
  throw new Error('the account is not signed in')
}
try {
  await account.signIn({ phone: notSignedIn, code: notSignedIn })
} catch (error) {
  await account.stop()
  if (error instanceof Error && error.message === 'the account is not signed in') {
    console.error('Аккаунт не вошёл. Сначала: pnpm tsx examples/20-presence-watch/login.ts')
    process.exit(1)
  }
  throw error
}

const watch = presenceWatch({
  bot,
  account,
  store: openRecords(config),
  operatorId: config.operatorId,
  pollSeconds: config.pollSeconds,
  limit: config.limit,
  ...(config.timeZone === undefined ? {} : { timeZone: config.timeZone }),
  log: (line) => console.log(`[watch] ${line}`),
})

let stopping = false
async function shutdown(): Promise<void> {
  if (stopping) return
  stopping = true
  // The watch first — its timer and its handlers — then the clients it ran on.
  await watch.stop()
  await app.stop({ timeout: 10_000 })
  process.exit(0)
}
process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())

await app.start()
await watch.start()
console.log(
  `Наблюдение запущено (${config.environment}). Команды боту — в личном чате оператора. Ctrl+C — остановка.`,
)
