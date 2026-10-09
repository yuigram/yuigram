// SPDX-License-Identifier: MIT

/**
 * 12 — One application, several identities.
 *
 * A bot and two accounts in one program, each with its own credentials, its own
 * store and its own connections. The container decides which clients exist,
 * what surrounds them and when they come up and go down; it owns nothing any
 * client owns.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… API_ID=12345 API_HASH=abc… \
 *   SESSION_A=… SESSION_B=… pnpm tsx examples/12-multiple-clients/index.ts
 * ```
 *
 * Each `SESSION_*` **is a logged-in account**. See `03-basic-userbot` for what
 * that means and how to treat one.
 *
 * The second account is optional: leave `SESSION_B` unset and the application
 * runs with one. That is the point of a container — how many clients there are
 * is a deployment decision rather than a shape the program is written around.
 */

import {
  Account,
  type AnyEventContext,
  App,
  Bot,
  bootstrapAt,
  type MtprotoContext,
  memory,
  type UnifiedContext,
} from 'yuigram'

const token = process.env['BOT_TOKEN']
const apiId = Number(process.env['API_ID'])
const apiHash = process.env['API_HASH']

if (token === undefined || !Number.isInteger(apiId) || apiHash === undefined) {
  throw new Error('Set BOT_TOKEN, API_ID and API_HASH.')
}

const bootstrap = bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 })

const app = new App<AnyEventContext | MtprotoContext>({ storage: memory() })

/**
 * An account, named and given a store of its own.
 *
 * **The name is what keeps two accounts apart.** Everything an account keeps —
 * the keys it authorizes with, the peers it has learned, how far it has read
 * the update stream — goes under `accounts:<name>:` in whatever store it was
 * given, so accounts with different names can share one store safely and two
 * with the same name are refused rather than silently merged. A store each, as
 * below, is still the clearest arrangement when there is no reason to share
 * one; a browser, where an origin has a single store, is the case where sharing
 * is not optional.
 *
 * The container does not hand one out, because what it keeps for a client is
 * framework state rather than protocol state: `app.storageFor(client)` is that
 * area, and an account's credentials never pass through it.
 */
const accountNamed = (name: string, session: string) =>
  Account.fromString(session, {
    apiId,
    apiHash,
    keys: [],
    bootstrap,
    storage: memory(),
    name,
  })

const bot = app.add(Bot.fromToken(token, { name: 'bot' }))

const accounts: Account[] = []

for (const [name, variable] of [
  ['first', 'SESSION_A'],
  ['second', 'SESSION_B'],
]) {
  const session = process.env[variable as string]
  if (session !== undefined) accounts.push(app.add(accountNamed(name as string, session)))
}

if (accounts.length === 0) {
  throw new Error('Set SESSION_A, and optionally SESSION_B, to strings exported from accounts.')
}

/**
 * Middleware here wraps every client.
 *
 * Which one produced an update is on the event, so one line covers all of them
 * and still says which identity it is talking about.
 */
app.use(async (event, next) => {
  const started = Date.now()
  await next()
  console.log(`${event.client.name}/${event.kind} in ${Date.now() - started}ms`)
})

/**
 * One handler across every client.
 *
 * Nothing here branches on which identity received the update, because the
 * operations it uses mean the same thing on both transports. What differs is
 * who the reply comes from, and that is decided by which client was told.
 */
app.on<UnifiedContext>('message', async (event) => {
  if (event.text !== 'who') return

  await event.reply(`${event.client.name}, over ${event.transport}`)
})

/**
 * What only one identity can do stays on that identity.
 *
 * A callback query is a Bot API idea with no MTProto counterpart, so it is
 * registered on the bot and the compiler knows it is available there.
 */
bot.onCallbackQuery((query) => query.answer('noted'))

/**
 * Each account addresses Telegram as itself.
 *
 * An access hash is issued per account and cannot be worked out, so the peer
 * one account has learned means nothing to another. `here` is the surface for
 * the conversation an update arrived in, with that account's own reference
 * already filled in — which is why the same line means something different
 * depending on which client ran it.
 */
for (const account of accounts) {
  account.on('message', async (event) => {
    if (event.text !== 'read') return

    await event.here.messages.readHistory({ max_id: 0 })
    console.log(`  ${account.name} marked ${event.chat?.kind ?? 'a conversation'} read`)
  })
}

/** Failures from any client, and from the shared handler, arrive here. */
app.onError(({ client, error }) => {
  console.error(`${client.name} failed:`, error)
})

await app.start()

console.log(`Running ${app.clients.length} clients: ${app.clients.map((c) => c.name).join(', ')}`)
console.log('Send any of them "who", or "read" to an account.')

/**
 * One client can go down without the others.
 *
 * Stopping takes down the connections that client holds, and another client's
 * are not among them. The container stops them all in the order they were
 * added, and a client that fails to stop does not keep the rest running.
 */
process.on('SIGINT', () => {
  void app.stop({ timeout: 10_000 }).then(() => process.exit(0))
})
