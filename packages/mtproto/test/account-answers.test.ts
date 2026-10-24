// SPDX-License-Identifier: MIT

/**
 * What an account does with the answers to its own calls, end to end.
 *
 * Against datacenters that keep a position the way Telegram does: a send takes
 * a step of the box it was sent in, and a catch-up from a position behind it
 * returns the message the send created. So an account that does not count its
 * own sends takes its next update for a gap, asks for a difference, and is
 * handed its own message back as news — which is what these cases rule out.
 *
 * The connection is the real one; only the socket is replaced. Waiting is real
 * too, because the reorder window is the account's own clock: a case that
 * proves nothing was asked waits past the window first.
 */

import { describe, expect, it } from 'vitest'
import type { TlValue } from '../src/tl/index.js'
import { createServerKey } from './server/keys.js'
import { mockAccount } from './support/mock-account.js'

const KEY = createServerKey()

/** Longer than the reorder window, so a catch-up that was going to happen has. */
const PAST_THE_WINDOW = 800

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const START = { _: 'updates.state', pts: 10, qts: 0, date: 1_700_000_000, seq: 0, unread_count: 0 }

function message(id: number, options: { readonly out?: boolean; readonly from?: bigint } = {}) {
  return {
    _: 'message',
    id,
    ...(options.out === true ? { out: true } : {}),
    peer_id: { _: 'peerUser', user_id: 9n },
    from_id: { _: 'peerUser', user_id: options.from ?? 9n },
    date: 1_700_000_000 + id,
    message: `message ${id}`,
  }
}

/**
 * An account at a known position, answering from `script`, recording which
 * methods it was asked and which message identifiers its handlers saw.
 */
async function ready(script: (query: TlValue) => TlValue | undefined = () => undefined) {
  const asked: string[] = []
  const instance = mockAccount({
    key: KEY,
    api: (query) => {
      if (query._.startsWith('updates.') || query._.startsWith('messages.')) asked.push(query._)
      if (query._ === 'updates.getState') return START
      return script(query)
    },
  })
  const handled: { id: unknown; out: unknown; kind: string }[] = []
  instance.account.on('message', (event) => {
    const value = (event as unknown as { message?: { id?: unknown; out?: unknown } }).message
    handled.push({ id: value?.id, out: value?.out, kind: 'message' })
  })
  instance.account.on('message_edited', (event) => {
    const value = (event as unknown as { message?: { id?: unknown } }).message
    handled.push({ id: value?.id, out: undefined, kind: 'edited' })
  })
  await instance.account.connect()
  await instance.account.peers.save({
    kind: 'user',
    id: 9n,
    accessHash: 11n,
    min: false,
    usernames: [],
  })

  // The first update takes the starting position (10) from Telegram.
  await instance.account.feed({
    _: 'updateNewMessage',
    message: message(50),
    pts: 10,
    pts_count: 1,
  })
  asked.length = 0
  handled.length = 0

  return { instance, asked, handled }
}

describe('a send and the update after it', () => {
  it('asks for no catch-up, and does not hand the account its own message', async () => {
    const { instance, asked, handled } = await ready((query) => {
      if (query._ === 'messages.sendMessage') {
        return { _: 'updateShortSentMessage', out: true, id: 55, pts: 11, pts_count: 1, date: 1 }
      }
      if (query._ === 'updates.getDifference') {
        return {
          _: 'updates.difference',
          new_messages: [message(55, { out: true }), message(60)],
          new_encrypted_messages: [],
          other_updates: [],
          chats: [],
          users: [],
          state: { ...START, pts: 12 },
        }
      }
      return undefined
    })

    const sent = await instance.account.sendText({ kind: 'user', id: 9n }, 'hello')
    await instance.account.feed({
      _: 'updateNewMessage',
      message: message(60),
      pts: 12,
      pts_count: 1,
    })
    await pause(PAST_THE_WINDOW)

    expect(sent.id).toBe(55)
    expect(asked).toEqual(['messages.sendMessage'])
    expect(handled.map((one) => one.id)).toEqual([60])
    await instance.dispose()
  })

  it('takes a send made through the escape hatch the same way', async () => {
    const { instance, asked, handled } = await ready((query) =>
      query._ === 'messages.sendMessage'
        ? { _: 'updateShortSentMessage', out: true, id: 56, pts: 11, pts_count: 1, date: 1 }
        : undefined,
    )

    await instance.account.api.messages.sendMessage({
      peer: { _: 'inputPeerUser', user_id: 9n, access_hash: 11n },
      message: 'raw',
      random_id: 123n,
    })
    await instance.account.feed({
      _: 'updateNewMessage',
      message: message(61),
      pts: 12,
      pts_count: 1,
    })
    await pause(PAST_THE_WINDOW)

    expect(asked).toEqual(['messages.sendMessage'])
    expect(handled.map((one) => one.id)).toEqual([61])
    await instance.dispose()
  })

  it('takes the position a deletion was answered with', async () => {
    const { instance, asked, handled } = await ready((query) =>
      query._ === 'messages.deleteMessages'
        ? { _: 'messages.affectedMessages', pts: 12, pts_count: 2 }
        : undefined,
    )

    await instance.account.deleteMessages({ kind: 'user', id: 9n }, [3, 4])
    await instance.account.feed({
      _: 'updateNewMessage',
      message: message(62),
      pts: 13,
      pts_count: 1,
    })
    await pause(PAST_THE_WINDOW)

    expect(asked).toEqual(['messages.deleteMessages'])
    expect(handled.map((one) => one.id)).toEqual([62])
    await instance.dispose()
  })

  it('still asks when something really is missing, and withholds only its own message', async () => {
    const { instance, asked, handled } = await ready((query) => {
      if (query._ === 'messages.sendMessage') {
        return { _: 'updateShortSentMessage', out: true, id: 55, pts: 12, pts_count: 1, date: 1 }
      }
      if (query._ === 'updates.getDifference') {
        return {
          _: 'updates.difference',
          new_messages: [message(54), message(55, { out: true }), message(60)],
          new_encrypted_messages: [],
          other_updates: [],
          chats: [],
          users: [],
          state: { ...START, pts: 13 },
        }
      }
      return undefined
    })

    // Message 54 took step 11 and never arrived; the send took step 12.
    await instance.account.sendText({ kind: 'user', id: 9n }, 'hello')
    await instance.account.feed({
      _: 'updateNewMessage',
      message: message(60),
      pts: 13,
      pts_count: 1,
    })
    await pause(PAST_THE_WINDOW)

    expect(asked).toEqual(['messages.sendMessage', 'updates.getDifference'])
    expect(handled.map((one) => one.id).sort()).toEqual([54, 60])
    await instance.dispose()
  })
})

describe('the stream on its own', () => {
  it('asks for nothing when nothing was missing', async () => {
    const { instance, asked, handled } = await ready()

    await instance.account.feed({
      _: 'updateNewMessage',
      message: message(60),
      pts: 11,
      pts_count: 1,
    })
    await pause(PAST_THE_WINDOW)

    expect(asked).toEqual([])
    expect(handled.map((one) => one.id)).toEqual([60])
    await instance.dispose()
  })

  it('counts a message that came in the short form, and hands it out once', async () => {
    const { instance, asked, handled } = await ready()

    await instance.account.feed({
      _: 'updateShortMessage',
      id: 70,
      user_id: 9n,
      message: 'short',
      pts: 11,
      pts_count: 1,
      date: 1_700_000_070,
    })
    await instance.account.feed({
      _: 'updateNewMessage',
      message: message(71),
      pts: 12,
      pts_count: 1,
    })
    await pause(PAST_THE_WINDOW)

    expect(asked).toEqual([])
    expect(handled).toHaveLength(2)
    await instance.dispose()
  })

  it('hands out an edit of a message it has already handed out', async () => {
    const { instance, handled } = await ready()

    await instance.account.feed({
      _: 'updateNewMessage',
      message: message(72),
      pts: 11,
      pts_count: 1,
    })
    await instance.account.feed({
      _: 'updateEditMessage',
      message: { ...message(72), message: 'changed', edit_date: 1_700_000_100 },
      pts: 12,
      pts_count: 1,
    })
    await instance.account.feed({
      _: 'updateEditMessage',
      message: { ...message(72), message: 'changed again', edit_date: 1_700_000_200 },
      pts: 13,
      pts_count: 1,
    })

    expect(handled.map((one) => one.kind)).toEqual(['message', 'edited', 'edited'])
    await instance.dispose()
  })
})
