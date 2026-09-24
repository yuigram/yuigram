/**
 * The account-handlers example, run against the mock datacenter.
 *
 * `examples/18-account-handlers` is written against the published entry
 * points, as an application is. Here the same `install` is given an account
 * from that build whose connections reach a datacenter in this process, and
 * every message arrives over the encrypted connection. What the account sends
 * back is read where the datacenter received it. Nothing reaches Telegram.
 */

import { memory } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { install } from '../../../examples/18-account-handlers/handlers.js'
// The facade's build, by path: the file the example's own `yuigram` import
// resolves to, so the account and the example's router are one program.
import { Account as PublishedAccount } from '../../yuigram/dist/index.js'
import type { Account } from '../src/account.js'
import type { TlValue } from '../src/tl/index.js'
import type { MockConnection } from './server/datacenter.js'
import { type MockAccount, type MockAccountOptions, mockAccount } from './support/mock-account.js'

async function push(instance: MockAccount, value: TlValue): Promise<void> {
  const deadline = Date.now() + 5000

  for (;;) {
    const connections: readonly MockConnection[] = instance.datacenter(2).connections
    for (const connection of [...connections].reverse()) {
      if (!connection.open()) continue
      const bytes = connection.peer.push(value)
      if (bytes !== undefined) {
        connection.push(bytes)

        return
      }
    }
    if (Date.now() > deadline) throw new Error('no connection could carry the update')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** A private message from user 5, in the compact form a datacenter sends one. */
function message(pts: number, text: string): TlValue {
  return {
    _: 'updateShortMessage',
    id: pts,
    user_id: 5n,
    message: text,
    pts,
    pts_count: 1,
    date: 1_700_000_000,
  }
}

/** An account built from the published entry point, answering sends as a datacenter does. */
async function started(sent: TlValue[], options: MockAccountOptions = {}): Promise<MockAccount> {
  let id = 100
  const instance = mockAccount({
    ...options,
    make: (settings) => new PublishedAccount(settings as never) as unknown as Account,
    api: (query) => {
      if (query._ !== 'messages.sendMessage') return undefined
      sent.push(query)
      id += 1

      return {
        _: 'updates',
        updates: [{ _: 'updateMessageID', id, random_id: query['random_id'] }],
        users: [],
        chats: [],
        date: 1_700_000_000,
        seq: 0,
      }
    },
  })

  await instance.account.connect()
  // A call first, so a connection exists and is carrying the session.
  await instance.account.api.call({ _: 'help.getConfig' })
  await instance.account.peers.save({
    kind: 'user',
    id: 5n,
    accessHash: 55n,
    min: false,
    usernames: [],
  })

  return instance
}

const texts = (sent: readonly TlValue[]) => sent.map((query) => query['message'])

describe('the account-handlers example', () => {
  it('answers commands in their group, counts in the next, and replies to the message', async () => {
    const sent: TlValue[] = []
    const instance = await started(sent)

    try {
      install(instance.account as never)

      await push(instance, message(2, 'hello'))
      await push(instance, message(3, '.ping'))
      await until(() => sent.length === 1, 'the answer to .ping')
      await push(instance, message(4, '.count'))
      await until(() => sent.length === 2, 'the answer to .count')

      expect(texts(sent)).toEqual(['pong', 'You have sent 2 messages.'])
      // A reply, to the message that asked, in the chat it came from.
      expect(sent[0]).toMatchObject({
        peer: { _: 'inputPeerUser', user_id: 5n, access_hash: 55n },
        reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: 3 },
      })
      // The counter ran after the commands too: three messages by now.
      const counts = (instance.account.deps as unknown as { counts: Map<bigint, number> }).counts
      expect(counts.get(5n)).toBe(3)
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('carries a form across a stop and a start, with its answer formatted', async () => {
    const sent: TlValue[] = []
    const runs = memory()
    const instance = await started(sent)

    try {
      install(instance.account as never, { runs: runs as never })

      await push(instance, message(2, '/signup'))
      await until(() => sent.length === 1, 'the question')
      expect(texts(sent)).toEqual(['What should I call you?'])

      // The question is waiting for its answer when the account stops.
      const clean = await instance.account.stop({ timeout: 5000 })
      expect(clean).toBe(true)

      await instance.account.connect()
      await instance.account.api.call({ _: 'help.getConfig' })
      await push(instance, message(3, 'Ada'))
      await until(() => sent.length === 2, 'the confirmation')

      expect(sent[1]).toMatchObject({
        message: 'Welcome, Ada.',
        entities: [{ _: 'messageEntityBold', offset: 9, length: 3 }],
      })
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})
