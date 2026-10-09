// SPDX-License-Identifier: MPL-2.0

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
/** Parts of a file the datacenters were asked for, so a case can see reading stop. */
let fileReads = 0

/** What the datacenters answer. Enough for the cases in the suite, and no more. */
function answer(query: TlValue): TlValue | undefined {
  if (query._ === 'help.getNearestDc') {
    return { _: 'nearestDc', country: 'NL', this_dc: 2, nearest_dc: 2 }
  }
  if (query._ === 'help.getAppConfig') throw new TelegramError('FLOOD_WAIT_7 (420)')
  if (query._ === 'upload.getFile') {
    fileReads += 1
    const offset = Number(query['offset'])
    const size = Math.max(4096 * 5, Number(query['offset']) + Number(query['limit']))
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

interface Instruction {
  readonly type: string
  readonly account?: string
  readonly user?: bigint
}

/** The open connections to an account's home datacenter, newest first. */
function connectionsOf(account: string | undefined): MockConnection[] {
  const datacenter = made.get(account ?? 'main')?.datacenter(2)

  return [...(datacenter?.connections ?? [])].reverse() as MockConnection[]
}

/** Seal a typing update on the newest connection that can carry one, and send it down. */
function push(message: Instruction): void {
  for (const connection of connectionsOf(message.account)) {
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

/**
 * End every open connection to the account the way a vanished peer ends one,
 * so the account in this thread has to notice and reconnect.
 */
function drop(message: Instruction): void {
  for (const connection of connectionsOf(message.account)) {
    if (connection.open()) connection.fail(new Error('the datacenter dropped the connection'))
  }
  control.postMessage({ type: 'dropped' })
}

function report(): void {
  control.postMessage({
    type: 'info',
    info: host.info(),
    fileReads,
    connections: [...made].map(([name, mock]) => [name, mock.datacenter(2).connections.length]),
  })
}

control.on('message', (message: Instruction) => {
  if (message.type === 'push') push(message)
  if (message.type === 'drop') drop(message)
  if (message.type === 'info') report()
})
