/**
 * A worker-thread host, for the Node worker suite.
 *
 * Runs in a real `worker_threads` worker: its own thread, its own event loop,
 * and nothing shared with the test that started it except the two ports.
 * `parentPort` carries the protocol; a second port, handed over in
 * `workerData`, carries the test's instructions to the datacenters — pushing
 * an update, or reporting what they saw — so that control traffic never
 * shares a channel with the thing being tested.
 */

import { parentPort, workerData } from 'node:worker_threads'
import { TelegramError } from '@yuigram/core'
import type { Account } from '../../src/account.js'
import type { TlValue } from '../../src/tl/index.js'
import { serveAccounts } from '../../src/worker/index.js'
import type { MockConnection } from '../server/datacenter.js'
import { type MockAccount, mockAccount } from './mock-account.js'

const control = (workerData as { control: import('node:worker_threads').MessagePort }).control
const made = new Map<string, MockAccount>()

/** What the datacenters answer. Enough for the cases in the suite, and no more. */
function answer(query: TlValue): TlValue | undefined {
  if (query._ === 'help.getNearestDc') {
    return { _: 'nearestDc', country: 'NL', this_dc: 2, nearest_dc: 2 }
  }
  if (query._ === 'help.getAppConfig') throw new TelegramError('FLOOD_WAIT_7 (420)')
  if (query._ === 'upload.getFile') {
    const offset = Number(query['offset'])
    const size = 4096 * 5
    const end = Math.min(offset + Number(query['limit']), size)
    const bytes = new Uint8Array(Math.max(0, end - offset))
    for (let at = 0; at < bytes.length; at += 1) bytes[at] = (offset + at) % 251

    return { _: 'upload.file', type: { _: 'storage.filePartial' }, bytes, mtime: 0 }
  }

  return undefined
}

const host = serveAccounts(
  {
    create: (name) => {
      const mock = mockAccount({ name, api: answer } as never)
      made.set(name, mock)

      return mock.account as Account
    },
  },
  parentPort,
)

control.on(
  'message',
  async (message: { readonly type: string; readonly account?: string; readonly user?: bigint }) => {
    if (message.type === 'push') {
      const mock = made.get(message.account ?? 'main')
      const datacenter = mock?.datacenter(2)
      for (const connection of [...(datacenter?.connections ?? [])].reverse() as MockConnection[]) {
        if (!connection.open()) continue
        const bytes = connection.peer.push({
          _: 'updateShort',
          update: {
            _: 'updateUserTyping',
            user_id: message.user ?? 1n,
            action: { _: 'sendMessageTypingAction' },
          },
          date: 1_700_000_000,
        })
        if (bytes === undefined) continue
        connection.push(bytes)
        control.postMessage({ type: 'pushed' })

        return
      }
      control.postMessage({ type: 'not-pushed' })
    }

    if (message.type === 'info') {
      control.postMessage({
        type: 'info',
        info: host.info(),
        connections: [...made].map(([name, mock]) => [name, mock.datacenter(2).connections.length]),
      })
    }
  },
)
