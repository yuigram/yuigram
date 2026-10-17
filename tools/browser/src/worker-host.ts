// SPDX-License-Identifier: MIT

/**
 * The host the browser check runs in a worker.
 *
 * The same script serves as a dedicated `Worker` and as a `SharedWorker`: the
 * host tells the two apart by the scope it finds itself in. It uses only the
 * public entry points — `yuigram` for the account and `yuigram/worker` for the
 * host, imported from their sources as the rest of this tool does — so what is
 * exercised is what an application would write.
 *
 * Each account connects over a WebSocket to a datacenter of its own on the
 * server that served this script, named in the query, so two accounts are two
 * datacenters and neither can see the other's traffic.
 *
 * Served as `worker-host.js?signals=locks`, the host ignores a port closing.
 * Chromium reports a closed port when the page holding its other end is
 * destroyed; Firefox and Safari report nothing, and leave a lock as the only
 * sign. Ignoring the port is how this check stands in for them.
 */

import { serverRsaKey } from '../../../packages/mtproto/src/auth/keys.js'
import { connectWebSocket } from '../../../packages/mtproto/src/network/websocket.js'
import { Account, createLogger, memory } from '../../../packages/yuigram/src/index.js'
import {
  acceptSharedConnections,
  type HostOptions,
  WorkerHost,
} from '../../../packages/yuigram/src/worker.js'

interface Config {
  readonly dc: number
  readonly now: number
  readonly key: { readonly n: string; readonly e: string }
}

const scope = globalThis as unknown as {
  readonly location: {
    host: string
    hostname: string
    port: string
    protocol: string
    search: string
  }
}
const configured: Promise<Config> = fetch('/config').then(
  async (response) => (await response.json()) as Config,
)
const startedAt = Date.now()

const hostOptions: HostOptions = {
  // Keep an account running when its last caller leaves: a tab that closes
  // should not take the account from the next one to open.
  onLastDetached: 'keep',
  create: async (name, restore) => {
    const config = await configured
    const clock = (): number => config.now + (Date.now() - startedAt)
    const ws = `${scope.location.protocol === 'https:' ? 'wss' : 'ws'}://${scope.location.host}/mtproto-worker?account=${encodeURIComponent(name)}`

    const options = {
      name,
      apiId: 10_000,
      apiHash: 'browser-check',
      keys: [serverRsaKey({ n: BigInt(config.key.n), e: BigInt(config.key.e) })],
      storage: memory(),
      now: clock,
      log: createLogger({ level: 'warn' }),
      bootstrap: {
        thisDc: config.dc,
        testMode: true,
        options: [
          {
            id: config.dc,
            host: scope.location.hostname,
            port: Number(scope.location.port),
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
      open: (request: Parameters<typeof connectWebSocket>[0]) =>
        connectWebSocket({ ...request, url: () => ws }),
    }

    // A caller that brought a session string restores the account from it; the
    // string is handed to the account and nowhere else.
    return restore === undefined
      ? new Account(options as never)
      : Account.fromString(restore, options as never)
  },
}

const host = new WorkerHost(hostOptions)

if (new URLSearchParams(scope.location.search).get('signals') === 'locks') {
  acceptSharedConnections(globalThis, (endpoint) => {
    host.accept({
      post: (message, transfer) => endpoint.post(message, transfer),
      listen: (handler) => endpoint.listen(handler),
      close: () => endpoint.close(),
      onGone: () => () => {},
    })
  })
} else {
  host.listen()
}
