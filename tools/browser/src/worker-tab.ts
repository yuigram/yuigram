// SPDX-License-Identifier: MPL-2.0

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
// `never`: this tab says nothing when it goes, the way a crashed or killed tab
// says nothing, so the host has only the platform to learn it from.
const releases = query.get('release') !== 'never'
const script = query.get('script') ?? '/worker-host.js'

const locks = (
  globalThis as unknown as {
    navigator: {
      locks: {
        query(): Promise<{
          held: readonly { name: string }[]
          pending: readonly { name: string }[]
        }>
      }
    }
  }
).navigator.locks

const tell = (message: Record<string, unknown>): void => {
  page.parent.postMessage({ yuigram: 'worker-tab', ...message }, '*')
}

let account: AttachedAccount | undefined

async function start(): Promise<void> {
  account = await attachAccount(openSharedWorker(script, { type: 'module', name: workerName }), {
    account: accountName,
    releaseOnPageHide: releases,
  })
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
        case 'status':
          return current.connectionStatus
        case 'hold':
          await current.stayOnline()

          return 'holding'
        case 'lock': {
          // Which requests for this caller's lock the platform knows of: this
          // tab holding it, and the host waiting on it.
          const name = `yuigram-caller:${current.connection}`
          const state = await locks.query()

          return {
            held: state.held.filter((one) => one.name === name).length,
            pending: state.pending.filter((one) => one.name === name).length,
          }
        }
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
