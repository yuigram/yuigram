/**
 * 03 — A basic userbot.
 *
 * An account is you, not a bot. It signs in with an application's credentials
 * rather than a token, it sees what you see, and it acts as you — so the things
 * it can do are the things you can do, and so are the consequences.
 *
 * ```sh
 * API_ID=12345 API_HASH=abc… SESSION=… pnpm tsx examples/03-basic-userbot/index.ts
 * ```
 *
 * `SESSION` is a string an account was exported from. **It is a logged-in
 * account** — anyone holding it is signed in as you until you revoke it in
 * Telegram's own "Active sessions". Keep it out of repositories, out of bug
 * reports, and out of messages to people helping you with a problem.
 *
 * Get `API_ID` and `API_HASH` from https://my.telegram.org. They belong to the
 * application rather than to the account, so they never go in the session.
 */

import { Account, memory } from 'yuigram'

const apiId = Number(process.env['API_ID'])
const apiHash = process.env['API_HASH']
const session = process.env['SESSION']

if (!Number.isInteger(apiId) || apiHash === undefined || session === undefined) {
  throw new Error('Set API_ID, API_HASH and SESSION. See the comment at the top of this file.')
}

/**
 * Where Telegram is reached and which keys it may be reached with.
 *
 * Both come from Telegram's published MTProto documentation. The addresses are
 * only a starting point: the server publishes its own list on the first call,
 * and that list is what gets used from then on.
 */
const bootstrap = {
  thisDc: 2,
  testMode: false,
  options: [
    {
      id: 2,
      host: '149.154.167.50',
      port: 443,
      ipv6: false,
      mediaOnly: false,
      cdn: false,
      secret: undefined,
      tcpoOnly: false,
      thisPortOnly: false,
      static: false,
    },
  ],
}

/**
 * An account carried in a string.
 *
 * The store is given rather than made for you. An account needs one while it
 * runs — a key with a lifetime, the peers it learns, the addresses it is told —
 * and `memory()` says out loud that none of it survives the process. That is
 * the right answer when the session is what you re-supply on every start;
 * `Account.fromSession('./me.session', …)` is the one for a machine with a disk.
 */
const me = Account.fromString(session, {
  apiId,
  apiHash,
  // Telegram's server keys go here. They are published rather than secret, and
  // an account refuses a key exchange whose fingerprint is not among them.
  keys: [],
  bootstrap,
  storage: memory(),
  name: 'me',
})

me.on('message', async (event) => {
  // `text` is what both subsystems agree a message said; everything an account
  // knows beyond that is on the event, and the untouched update is on `raw`.
  if (event.text === undefined) return

  console.log(`${event.chat?.kind ?? 'somewhere'}: ${event.text}`)

  // The payload is the schema's own `Message`, so reading it is narrowing a
  // union rather than walking an untyped object. What each variant carries is
  // Telegram's own optionality: an ordinary message has text, a service message
  // has an action instead, and an empty one is a hole where a message used to
  // be.
  if (event.message?._ === 'message' && event.message.media !== undefined) {
    console.log(`  …with ${event.message.media._}`)
  }

  // Seconds, as Telegram sends them. A handler that wants a `Date` builds one,
  // which is cheaper than every handler paying for one it did not ask for.
  if (event.date !== undefined) {
    console.log(`  sent ${new Date(event.date * 1000).toISOString()}`)
  }

  // Safe because the peer came from the update — an account already holds a
  // reference to somebody it just heard from. Answering a peer it has never met
  // is a different problem, and it fails saying so rather than silently.
  if (event.text === 'ping') await event.reply('pong')

  // Anything beyond replying is a Telegram method, and `here` is the schema's
  // own surface with one difference: the conversation this event arrived in is
  // already filled in, so it is not asked for and cannot be changed.
  //
  // Without it the same call is written by hand:
  //
  //   const peer = await me.resolve(event.chat)
  //   await me.api.messages.readHistory({ peer, max_id: 0 })
  //
  // which is the same request, plus the step of naming a peer the update
  // already named. Reaching somebody the event did not mention still goes
  // through `me.resolve('@name')`, because that one can hit the network.
  if (event.text === 'read') await event.here.messages.readHistory({ max_id: 0 })
})

me.catch((error) => {
  console.error('handler failed:', error)
})

await me.start()

console.log('Signed in. Send yourself "ping" from another device.')

process.on('SIGINT', () => {
  void me.stop().then(() => process.exit(0))
})
