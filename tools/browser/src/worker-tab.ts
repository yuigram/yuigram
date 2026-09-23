/**
 * A second tab, attached to the same `SharedWorker` as the check page.
 *
 * Embedded as a frame: a separate browsing context of the same origin, with
 * its own memory and module graph, which is what two tabs are. It attaches to
 * the shared host named in its address, reports every update it receives to
 * the page that embedded it, and does what that page asks.
 */

import {
  type AttachedAccount,
  attachAccount,
  openSharedWorker,
} from '../../../packages/yuigram/src/worker.js'

const page = globalThis as unknown as {
  readonly location: { readonly search: string }
  readonly parent: { postMessage(message: unknown, origin: string): void }
  addEventListener(kind: string, handler: (event: { data: unknown }) => void): void
}

const query = new URLSearchParams(page.location.search)
const workerName = query.get('worker') ?? 'yuigram-check'
const accountName = query.get('account') ?? 'shared'

const tell = (message: Record<string, unknown>): void => {
  page.parent.postMessage({ yuigram: 'worker-tab', ...message }, '*')
}

let account: AttachedAccount | undefined

async function start(): Promise<void> {
  account = await attachAccount(
    openSharedWorker('/worker-host.js', { type: 'module', name: workerName }),
    {
      account: accountName,
    },
  )
  account.on('mtproto:typing', (event) => {
    tell({ kind: 'update', user: String(event.sender?.id) })
  })

  page.addEventListener('message', (event) => {
    const message = event.data as { yuigram?: string; id?: number; act?: string } | null
    if (message?.yuigram !== 'worker-tab-ask' || account === undefined) return

    const current = account
    const act = async (): Promise<unknown> => {
      switch (message.act) {
        case 'connect':
          await current.connect()

          return 'connected'
        case 'call':
          return ((await current.api.help.getNearestDc()) as { _: string })._
        case 'state':
          return await current.read('state')
        default:
          return undefined
      }
    }

    act().then(
      (value) => tell({ kind: 'answer', id: message.id, ok: true, value }),
      (error: unknown) =>
        tell({
          kind: 'answer',
          id: message.id,
          ok: false,
          value: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        }),
    )
  })

  tell({ kind: 'ready', connection: account.connection })
}

start().catch((error: unknown) => {
  tell({
    kind: 'failed',
    value: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  })
})
