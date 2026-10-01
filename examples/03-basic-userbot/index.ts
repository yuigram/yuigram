/**
 * 03 — A basic userbot.
 *
 * An account is you, not a bot. It signs in with an application's credentials
 * rather than a token, it sees what you see, and it acts as you — so the things
 * it can do are the things you can do, and so are the consequences.
 *
 * ```sh
 * API_ID=12345 API_HASH=abc… SERVER_KEYS=./telegram-keys.pem pnpm tsx examples/03-basic-userbot/index.ts
 * ```
 *
 * The first run signs in and prints a `SESSION` string. Set it for later runs
 * and they start signed in:
 *
 * ```sh
 * API_ID=12345 API_HASH=abc… SERVER_KEYS=./telegram-keys.pem SESSION=… pnpm tsx examples/03-basic-userbot/index.ts
 * ```
 *
 * `SESSION` is a string an account was exported from. **It is a logged-in
 * account** — anyone holding it is signed in as you until you revoke it in
 * Telegram's own "Active sessions". Keep it out of repositories, out of bug
 * reports, and out of messages to people helping you with a problem.
 *
 * Get `API_ID` and `API_HASH` from https://my.telegram.org. They belong to the
 * application rather than to the account, so they never go in the session.
 *
 * `SERVER_KEYS` names a file holding Telegram's server public keys as PEM, as
 * Telegram's MTProto documentation publishes them. They are public rather than
 * secret, and an account refuses a datacenter whose key is not among them.
 *
 * Send yourself `ping`, `read` or `contacts` from another device to exercise
 * the handlers below. A file with the caption `echo` is fetched and sent
 * straight back, without being uploaded again.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import {
  Account,
  bootstrapAt,
  documentMedia,
  memory,
  sentMessage,
  serverKeysFromPem,
} from 'yuigram'

const apiId = Number(process.env['API_ID'])
const apiHash = process.env['API_HASH']
const session = process.env['SESSION']
const serverKeys = process.env['SERVER_KEYS']

if (!Number.isInteger(apiId) || apiHash === undefined || serverKeys === undefined) {
  throw new Error('Set API_ID, API_HASH and SERVER_KEYS. See the comment at the top of this file.')
}

/** Ask the person running this for something only they can supply. */
async function ask(question: string): Promise<string> {
  const input = createInterface({ input: process.stdin, output: process.stdout })

  try {
    return (await input.question(question)).trim()
  } finally {
    input.close()
  }
}

/**
 * Where Telegram is reached and which keys it may be reached with.
 *
 * Both come from Telegram's published MTProto documentation. The addresses are
 * a starting point rather than the whole list, which is enough to reach
 * Telegram and to follow it if it says this account lives at another
 * datacenter.
 */
const bootstrap = bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 })

/**
 * An account carried in a string.
 *
 * The store is given rather than made for you. An account needs one while it
 * runs — a key with a lifetime, the peers it learns, the addresses it is told —
 * and `memory()` says out loud that none of it survives the process. That is
 * the right answer when the session is what you re-supply on every start;
 * `Account.fromSession('./me.session', …)` is the one for a machine with a disk.
 */
const options = {
  apiId,
  apiHash,
  // Checked by fingerprint when a datacenter answers a first key exchange.
  keys: serverKeysFromPem(readFileSync(serverKeys, 'utf8')),
  bootstrap,
  storage: memory(),
  name: 'me',
}

const me = session === undefined ? new Account(options) : Account.fromString(session, options)

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

    // The file the event carried, fetched through the event that carried it.
    // That is what makes an expired file reference invisible here: the token a
    // datacenter checks travels with the media and expires on the server's own
    // schedule, and putting it right means asking for this message again —
    // which only something still holding the message can do.
    //
    // The bytes arrive in ranges asked for several at a time, on connections
    // kept apart from the one ordinary calls travel on.
    const bytes = await event.download()
    console.log(`  …${bytes.length} bytes fetched`)

    // Sending it back needs no upload. A file already on Telegram is addressed
    // by the same three fields either way, so the message that arrived carries
    // everything a send needs.
    //
    // `random_id` is what Telegram deduplicates a send by, so it has to differ
    // between calls and must not restart with the process. Read through the
    // buffer's own accessor rather than through its `ArrayBuffer`: Node hands
    // back a view into a shared pool, and reading the pool from zero is reading
    // somebody else's bytes.
    const { media } = event.message
    if (
      event.text === 'echo' &&
      media._ === 'messageMediaDocument' &&
      media.document?._ === 'document'
    ) {
      const id = randomBytes(8).readBigInt64LE()
      const answer = await event.here.messages.sendMedia({
        media: documentMedia(media.document),
        message: 'here it is again',
        random_id: id,
      })

      // A send is answered with the updates it caused rather than with the
      // message, so which message it produced is read out of them against the
      // identifier this send carried.
      console.log(`  …sent back as message ${sentMessage(answer, id).id}`)
    }
  }

  // Seconds, as Telegram sends them. A handler that wants a `Date` builds one,
  // which is cheaper than every handler paying for one it did not ask for.
  if (event.date !== undefined) {
    console.log(`  sent ${new Date(event.date * 1000).toISOString()}`)
  }

  // Safe because the peer came from the update — an account already holds a
  // reference to somebody it just heard from. Answering a peer it has never met
  // is a different problem, and it fails saying so rather than silently.
  if (event.text === 'ping') {
    const sent = await event.reply('pong')
    console.log(`  replied as message ${sent.id}`)
  }

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

  // An account learns who people are from the answers it receives, not only
  // from updates. Telegram issues an access hash per account and it cannot be
  // worked out, so almost every answer carries the users and chats it mentions
  // — and those are kept as they arrive. That is what makes the last line here
  // work without a lookup: this account has never met these people except in
  // the answer it just read.
  if (event.text === 'contacts') {
    const answer = await me.api.contacts.getContacts({ hash: 0n })
    const [first] = answer._ === 'contacts.contacts' ? answer.users : []

    if (first?._ === 'user') {
      const peer = await me.resolve({ kind: 'user', id: first.id })
      console.log(`  can address ${first.id} as ${peer._}`)
    }
  }
})

me.catch((error) => {
  console.error('handler failed:', error)
})

await me.start()

/**
 * Prove which account these connections belong to.
 *
 * Connecting and signing in are separate things that fail differently, so they
 * are separate calls: the first is about reaching Telegram, the second about
 * who you are. A session carries the second, which is why a run given one does
 * none of this.
 *
 * Each step says how far it got rather than throwing at a fork, so the password
 * is asked for only if the account has one.
 */
if (session === undefined) {
  const phone = await ask('Phone (with country code): ')
  const sent = await me.sendCode(phone)

  if (sent.kind !== 'code-sent') {
    throw new Error(`expected a code to be sent, the account is ${sent.kind}`)
  }

  let state = await me.signInWithCode({
    phone,
    phoneCodeHash: sent.phoneCodeHash,
    code: await ask('Code Telegram sent you: '),
  })

  if (state.kind === 'password-required') {
    state = await me.signInWithPassword(await ask('Two-factor password: '))
  }

  if (state.kind !== 'authorized') {
    throw new Error(`sign-in stopped at '${state.kind}'`)
  }

  // Everything needed to start signed in next time. It is the account itself,
  // so it is printed for you to keep rather than written anywhere.
  console.log(`
SESSION=${await me.exportSession()}
`)
}

console.log('Signed in. Send yourself "ping" from another device.')

process.on('SIGINT', () => {
  void me.stop().then(() => process.exit(0))
})
