// SPDX-License-Identifier: MPL-2.0

// A worker thread hosting an account, written as an application would write
// one: the installed packages only, nothing from this repository's sources.
import { parentPort, workerData } from 'node:worker_threads'
import { Account, memory, serverKeysFromPem } from 'yuigram'
import { serveAccounts } from 'yuigram/worker'

const { pem, tcpPort, origin } = workerData
const started = Date.now()

serveAccounts(
  {
    create: (name) =>
      new Account({
        name,
        apiId: 1,
        apiHash: 'matrix',
        storage: memory(),
        keys: serverKeysFromPem(pem),
        now: () => origin + (Date.now() - started),
        bootstrap: {
          thisDc: 2,
          testMode: true,
          options: [
            {
              id: 2,
              host: '127.0.0.1',
              port: tcpPort,
              ipv6: false,
              mediaOnly: false,
              tcpoOnly: false,
              cdn: false,
              static: true,
              thisPortOnly: true,
              secret: undefined,
            },
          ],
        },
      }),
  },
  parentPort,
)
