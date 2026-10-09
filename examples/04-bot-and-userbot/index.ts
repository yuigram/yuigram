// SPDX-License-Identifier: MPL-2.0

/**
 * 04 — A bot and a userbot, together.
 *
 * The thing no other framework does: one program, one set of handlers, two
 * different identities on Telegram — a bot answering strangers and an account
 * answering as you — with the parts that genuinely differ still visible.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… API_ID=12345 API_HASH=abc… SESSION=… \
 *   pnpm tsx examples/04-bot-and-userbot/index.ts
 * ```
 *
 * `SESSION` **is a logged-in account**. See `03-basic-userbot` for what that
 * means and how to treat it.
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
const session = process.env['SESSION']

if (token === undefined || !Number.isInteger(apiId) || apiHash === undefined) {
  throw new Error('Set BOT_TOKEN, API_ID and API_HASH.')
}
if (session === undefined) {
  throw new Error('Set SESSION to a string exported from an account.')
}

const bootstrap = bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 })

/**
 * The container both clients live in.
 *
 * It owns which clients exist, what surrounds them, bringing them up and down
 * together, and where the application's own state is kept. It owns nothing a
 * client owns — no token, no session, no connection, no protocol state.
 *
 * Its type is every event either client can produce. That is wider than any one
 * registration, which is why a handler says below what the kinds it covers
 * actually carry.
 */
const app = new App<AnyEventContext | MtprotoContext>({ storage: memory() })

const bot = app.add(Bot.fromToken(token, { name: 'bot' }))
const me = app.add(
  Account.fromString(session, {
    apiId,
    apiHash,
    keys: [],
    bootstrap,
    storage: memory(),
    name: 'me',
  }),
)

/** Middleware here wraps both clients, for every update either of them sees. */
app.use(async (event, next) => {
  const started = Date.now()
  await next()
  console.log(`${event.client.name}/${event.kind} in ${Date.now() - started}ms`)
})

/**
 * One handler, both identities.
 *
 * The type parameter says what the kinds this registration covers actually
 * carry: an application's own type has to describe every event any of its
 * clients can produce — including a poll answer, which has no message to answer
 * — so `reply` is promised per registration rather than across all of them.
 *
 * Inside, there is no branch on `transport` anywhere. That is the point: the
 * common operations are the same operation, so code that only needs them does
 * not have to know which identity it is speaking as.
 */
app.on<UnifiedContext>('message', async (event) => {
  if (event.text !== 'ping') return

  await event.react('👀')
  await event.reply(`pong, from ${event.client.name} over ${event.transport}`)
})

/**
 * What each client can do that the other cannot stays on the client.
 *
 * A callback query is a Bot API idea and has no MTProto counterpart, so it is
 * registered on the bot, where its availability is a fact the compiler knows
 * rather than something to check at runtime.
 */
bot.onCallbackQuery((query) => query.answer('noted'))

/**
 * The same on the other side.
 *
 * An account's context carries its own peer reference — a kind and a numeric
 * id, which is what MTProto actually has — rather than the Bot API's chat
 * object. The unified surface deliberately carries neither, because they are
 * different models and pretending otherwise would misrepresent both.
 */
me.on('message_deleted', (event) => {
  console.log(`deleted in ${event.chat?.kind ?? 'unknown'} ${event.chat?.id ?? ''}`)
})

/** Failures from either client, and from the shared handler, arrive here. */
app.onError(({ client, error }) => {
  console.error(`${client.name} failed:`, error)
})

await app.start()

console.log('Bot and account are both running. Send either of them "ping".')

process.on('SIGINT', () => {
  void app.stop({ timeout: 10_000 }).then(() => process.exit(0))
})
