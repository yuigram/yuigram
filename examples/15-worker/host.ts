/**
 * The worker half of 15 — where the account actually lives.
 *
 * This file runs on its own thread. It owns the account: the connection, the
 * keys, the session string and the store are all here, and none of them ever
 * cross to the thread that attached. What crosses is calls, their answers and
 * the updates the account receives.
 *
 * The same file would serve a browser `SharedWorker` with one change: leave
 * out `parentPort`, and `serveAccounts` accepts every page that connects.
 */

import { parentPort } from 'node:worker_threads'
import { Account, ConfigError, memory } from 'yuigram'
import { serveAccounts } from 'yuigram/worker'

const apiId = Number(process.env['API_ID'])
const apiHash = process.env['API_HASH']
const session = process.env['SESSION']

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

serveAccounts(
  {
    // The factory runs once per account name, however many callers attach to
    // it. A caller names an account; it never supplies one.
    create: (name) => {
      if (!Number.isInteger(apiId) || apiHash === undefined || session === undefined) {
        // Refused here, and rebuilt on the caller's side as the same class.
        throw new ConfigError(
          'Set API_ID, API_HASH and SESSION. 03-basic-userbot prints a SESSION on its first run.',
        )
      }

      return Account.fromString(session, {
        name,
        apiId,
        apiHash,
        // Telegram's published server keys go here, as in 03.
        keys: [],
        bootstrap,
        storage: memory(),
      })
    },
    // When the last caller leaves, stop the account rather than keep it
    // connected for nobody.
    onLastDetached: 'stop',
  },
  parentPort,
)
