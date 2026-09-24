/**
 * A stream from a real account, with the reader's stop arriving the way a
 * datacenter sends it: sealed, decrypted, sequenced and dispatched as a typing
 * update, matched to the draft by the key the account drew for it.
 *
 * What Telegram's own servers send when a reader presses stop has not been
 * observed here; this holds the account to the schema's description of it.
 */

import { describe, expect, it } from 'vitest'
import { streamTo } from '../src/stream/index.js'
import type { TlValue } from '../src/tl/index.js'
import type { MockConnection } from './server/datacenter.js'
import { type MockAccount, mockAccount } from './support/mock-account.js'

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

/** Text that arrives when a case says, and never ends by itself. */
function feed() {
  const queue: string[] = []
  let wake: (() => void) | undefined

  return {
    push(text: string) {
      queue.push(text)
      wake?.()
    },
    source: {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<string>> => {
          for (;;) {
            const next = queue.shift()
            if (next !== undefined) return { value: next, done: false }
            await new Promise<void>((resolve) => {
              wake = resolve
            })
          }
        },
        return: async (): Promise<IteratorResult<string>> => ({ value: undefined, done: true }),
      }),
    },
  }
}

/** The draft actions the datacenter was sent, with the key each carried. */
function drafts(asked: readonly TlValue[]): { key: bigint; action: string; text?: string }[] {
  return asked
    .filter((query) => query._ === 'messages.setTyping')
    .map((query) => {
      const action = query['action'] as TlValue
      const text = action['text'] as { text?: string } | undefined

      return {
        key: action['random_id'] as bigint,
        action: action._,
        ...(text?.text === undefined ? {} : { text: text.text }),
      }
    })
}

describe('a stream the reader stops', () => {
  it('stops when the datacenter reports its own draft stopped from its own conversation', async () => {
    const asked: TlValue[] = []
    const instance = mockAccount({
      api: (query) => {
        asked.push(query)

        return undefined
      },
    })

    try {
      await instance.account.connect()
      await instance.account.peers.save({
        kind: 'user',
        id: 5n,
        accessHash: 55n,
        min: false,
        usernames: [],
      })

      const text = feed()
      const running = streamTo(instance.account, { kind: 'user', id: 5n }, text.source, {
        canStop: true,
        editInterval: 1,
      })
      text.push('partial answer')
      await until(
        () => drafts(asked).some((draft) => draft.text === 'partial answer'),
        'the draft to be written',
      )
      const key = drafts(asked)[0]?.key as bigint

      // A report about somebody else's draft first, which must change nothing.
      const stop = (userId: bigint, randomId: bigint): TlValue => ({
        _: 'updateShort',
        update: {
          _: 'updateUserTyping',
          user_id: userId,
          action: { _: 'sendMessageStopDraftAction', random_id: randomId },
        },
        date: 1_700_000_000,
      })
      await push(instance, stop(5n, key + 1n))
      await push(instance, stop(6n, key))
      await new Promise((resolve) => setTimeout(resolve, 100))
      // Still running: what arrives next is still drafted.
      text.push(', continued')
      await until(
        () => drafts(asked).some((draft) => draft.text === 'partial answer, continued'),
        'the stream to carry on',
      )
      await push(instance, stop(5n, key))

      const result = await running

      expect(result.stopped).toBe(true)
      // Nothing was sent as a message: the reader stopped it, and the stream
      // was not asked to keep what it had written.
      expect(asked.some((query) => query._ === 'messages.sendMessage')).toBe(false)
      // The draft was opened empty before the first text, then written.
      expect(drafts(asked)[0]).toMatchObject({ action: 'sendMessageTextDraftAction', text: '' })
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})
