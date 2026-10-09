// SPDX-License-Identifier: MIT

/**
 * 18 — An account's handlers: filters, groups, a router, a dependency and a
 * form that survives a restart.
 *
 * ```sh
 * API_ID=12345 API_HASH=abc… SESSION=… pnpm tsx examples/18-account-handlers/index.ts
 * ```
 *
 * `SESSION` is what example 03 prints after signing in. **It is a logged-in
 * account**: keep it out of repositories and out of messages to anyone.
 *
 * Then, from another account, send this one:
 *
 * - `.ping` — answered with `pong`.
 * - anything, then `.count` — how many private messages you have sent.
 * - `/signup` — a question; answer it, and the confirmation arrives. Stop the
 *   program between the two and start it again: the form carries on, because
 *   its place is kept in `./forms`, beside the session rather than inside it.
 *
 * What each handler does is in `handlers.ts`.
 */

import { Account, bootstrapAt, type ConversationFlavour, type FlowRecord, file } from 'yuigram'
import { install } from './handlers.js'

const apiId = Number(process.env['API_ID'])
const apiHash = process.env['API_HASH']
const session = process.env['SESSION']

if (!Number.isInteger(apiId) || apiHash === undefined || session === undefined) {
  throw new Error('Set API_ID, API_HASH and SESSION. See the comment at the top of this file.')
}

/** Where Telegram is first reached; example 03 says more about both of these. */
const bootstrap = bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 })

const account = Account.fromString<ConversationFlavour>(session, {
  apiId,
  apiHash,
  keys: [],
  bootstrap,
  storage: file('./account'),
  name: 'me',
})

// The form's runs in a store of their own: they are this program's state, not
// the account's authorization, and are never mixed with it.
install(account, { runs: file<FlowRecord>('./forms') })

await account.start()
console.log('Running. Send .ping, .count or /signup from another account.')

process.once('SIGINT', () => {
  // Stopping cancels anything waiting in memory and stops acting on the form's
  // deadlines; the form itself is kept, and carries on after a restart.
  void account.stop().then((clean) => {
    console.log(clean ? 'Stopped.' : 'Stopped, with work left unfinished.')
  })
})
