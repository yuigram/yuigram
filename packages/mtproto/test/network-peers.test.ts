/**
 * Learning how to name a peer.
 *
 * An access hash cannot be worked out, so the only way an account learns one is
 * by reading it out of an answer that happened to mention the peer. The cases
 * here are about that: what is read out of an answer, what a reduced peer may
 * and may not be used for, and what happens when a name resolves to nothing
 * usable.
 */

import { PeerError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  harvest,
  inputPeer,
  inputPeerFromMessage,
  readPeerReference,
  readPeers,
  resolveUsername,
} from '../src/network/peers.js'
import { type PeerRecord, peerStore } from '../src/storage/peers.js'
import type { TlValue } from '../src/tl/index.js'

/** A store that keeps what it is given. */
function memory() {
  const values = new Map<string, unknown>()

  return peerStore({
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value)
    },
    delete: async (key: string) => {
      values.delete(key)
    },
  })
}

/** A datacenter answering from a script, recording what it was asked. */
function peer(answer: (query: TlValue) => TlValue | Promise<TlValue>) {
  const asked: TlValue[] = []

  return {
    asked,
    invoke: async (query: TlValue) => {
      asked.push(query)

      return answer(query)
    },
  }
}

const USER: TlValue = {
  _: 'user',
  id: 100n,
  access_hash: 0x1122_3344_5566_7788n,
  username: 'Durov',
  phone: '79001234567',
}

const CHANNEL: TlValue = {
  _: 'channel',
  id: 200n,
  access_hash: 0x99n,
  title: 'News',
  username: 'telegram',
}

describe('reading the peers an answer mentions', () => {
  it('reads a user, its hash and the ways to reach it', () => {
    expect(readPeers({ _: 'x', users: [USER] })).toEqual([
      {
        kind: 'user',
        id: 100n,
        accessHash: 0x1122_3344_5566_7788n,
        min: false,
        usernames: ['durov'],
        phone: '79001234567',
      },
    ])
  })

  it('reads a channel from the same array as a basic group', () => {
    const found = readPeers({
      _: 'x',
      chats: [CHANNEL, { _: 'chat', id: 300n, title: 'Group' }],
    })

    expect(found).toEqual([
      { kind: 'channel', id: 200n, accessHash: 0x99n, min: false, usernames: ['telegram'] },
      { kind: 'chat', id: 300n, min: false, usernames: [] },
    ])
  })

  it('gives a basic group no hash, because it is named without one', () => {
    const [group] = readPeers({ _: 'x', chats: [{ _: 'chat', id: 300n, access_hash: 5n }] })

    expect(group?.accessHash).toBeUndefined()
  })

  it('reads a forbidden channel, which is still reachable', () => {
    expect(
      readPeers({ _: 'x', chats: [{ _: 'channelForbidden', id: 7n, access_hash: 8n }] }),
    ).toEqual([{ kind: 'channel', id: 7n, accessHash: 8n, min: false, usernames: [] }])
  })

  it('reads every active name a peer publishes', () => {
    const [found] = readPeers({
      _: 'x',
      users: [
        {
          ...USER,
          usernames: [
            { _: 'username', username: 'Second', active: true },
            { _: 'username', username: 'retired' },
          ],
        },
      ],
    })

    // A name that is not active does not resolve, so pointing at the peer with
    // it would answer for a name Telegram does not.
    expect(found?.usernames).toEqual(['durov', 'second'])
  })

  it('marks a peer that arrived in passing', () => {
    const [found] = readPeers({ _: 'x', users: [{ ...USER, min: true }] })

    expect(found?.min).toBe(true)
  })

  it('skips a peer it cannot name rather than refusing the answer', () => {
    // An answer mentioning something this client cannot describe is an answer
    // about something else, and refusing it would lose the peers beside it.
    const found = readPeers({
      _: 'x',
      users: [{ _: 'userEmpty', id: 1n }, USER],
      chats: [{ _: 'chatEmpty', id: 2n }],
    })

    expect(found).toHaveLength(1)
    expect(found[0]?.id).toBe(100n)
  })

  it('reads nothing from an answer that mentions nobody', () => {
    expect(readPeers({ _: 'boolTrue' })).toEqual([])
    expect(readPeers({ _: 'x', users: 'not an array', chats: 7 })).toEqual([])
  })

  it('writes down everything it read', async () => {
    const store = memory()

    await harvest(store, { _: 'x', users: [USER], chats: [CHANNEL] })

    expect(await store.byUsername('durov')).toMatchObject({ id: 100n })
    expect(await store.byId('channel', 200n)).toMatchObject({ accessHash: 0x99n })
  })

  it('does not let a peer seen in passing undo one known in full', async () => {
    const store = memory()
    await harvest(store, { _: 'x', users: [USER] })

    await harvest(store, { _: 'x', users: [{ _: 'user', id: 100n, access_hash: 1n, min: true }] })

    expect(await store.byId('user', 100n)).toMatchObject({
      accessHash: 0x1122_3344_5566_7788n,
      min: false,
    })
  })
})

describe('naming a peer in a call', () => {
  const record = (overrides: Partial<PeerRecord> = {}): PeerRecord => ({
    kind: 'user',
    id: 100n,
    accessHash: 7n,
    min: false,
    usernames: [],
    ...overrides,
  })

  it('names a user by its identifier and hash', () => {
    expect(inputPeer(record())).toEqual({ _: 'inputPeerUser', user_id: 100n, access_hash: 7n })
  })

  it('names a channel the same way', () => {
    expect(inputPeer(record({ kind: 'channel', id: 200n, accessHash: 9n }))).toEqual({
      _: 'inputPeerChannel',
      channel_id: 200n,
      access_hash: 9n,
    })
  })

  it('names a basic group by its identifier alone', () => {
    expect(inputPeer({ kind: 'chat', id: 300n, min: false, usernames: [] })).toEqual({
      _: 'inputPeerChat',
      chat_id: 300n,
    })
  })

  it('refuses to name a peer only seen in passing', () => {
    // Its hash means something only where it arrived. Building a reference from
    // it would be refused by Telegram as a problem with the call rather than
    // with the peer.
    expect(() => inputPeer(record({ min: true }))).toThrow(PeerError)
    expect(() => inputPeer(record({ min: true }))).toThrow(/only seen in passing/)
  })

  it('refuses to name a peer whose hash was never learned', () => {
    expect(() => inputPeer({ kind: 'user', id: 100n, min: false, usernames: [] })).toThrow(
      /no access hash/,
    )
  })

  it('names a peer seen in passing by where it was seen', () => {
    const context: TlValue = { _: 'inputPeerChannel', channel_id: 5n, access_hash: 6n }

    expect(inputPeerFromMessage({ record: record({ min: true }), context, messageId: 42 })).toEqual(
      {
        _: 'inputPeerUserFromMessage',
        peer: context,
        msg_id: 42,
        user_id: 100n,
      },
    )
  })

  it('names a channel seen in passing the same way', () => {
    const context: TlValue = { _: 'inputPeerSelf' }

    expect(
      inputPeerFromMessage({
        record: record({ kind: 'channel', id: 200n, min: true }),
        context,
        messageId: 1,
      }),
    ).toMatchObject({ _: 'inputPeerChannelFromMessage', channel_id: 200n })
  })

  it('refuses a context for a basic group, which has none', () => {
    expect(() =>
      inputPeerFromMessage({
        record: record({ kind: 'chat' }),
        context: { _: 'inputPeerSelf' },
        messageId: 1,
      }),
    ).toThrow(/identifier alone/)
  })

  it('refuses a message identifier that could not be one', () => {
    expect(() =>
      inputPeerFromMessage({
        record: record({ min: true }),
        context: { _: 'inputPeerSelf' },
        messageId: 1.5,
      }),
    ).toThrow(/whole number/)
  })
})

describe('which peer a reference names', () => {
  it('reads each of the three', () => {
    expect(readPeerReference({ _: 'peerUser', user_id: 1n })).toEqual({ kind: 'user', id: 1n })
    expect(readPeerReference({ _: 'peerChat', chat_id: 2n })).toEqual({ kind: 'chat', id: 2n })
    expect(readPeerReference({ _: 'peerChannel', channel_id: 3n })).toEqual({
      kind: 'channel',
      id: 3n,
    })
  })

  it('refuses something that names no peer', () => {
    expect(() => readPeerReference({ _: 'boolTrue' })).toThrow(/does not name a peer/)
    expect(() => readPeerReference('peerUser')).toThrow(/must be an object/)
    expect(() => readPeerReference({ _: 'peerUser', user_id: 1 })).toThrow(/64-bit/)
  })
})

describe('resolving a name', () => {
  const resolved: TlValue = {
    _: 'contacts.resolvedPeer',
    peer: { _: 'peerUser', user_id: 100n },
    users: [USER],
    chats: [],
  }

  it('asks Telegram and writes down everything the answer mentioned', async () => {
    const store = memory()
    const dc = peer(() => resolved)

    const found = await resolveUsername({ store, peer: dc, username: '@Durov' })

    // The marker is not part of the name Telegram knows.
    expect(dc.asked).toEqual([{ _: 'contacts.resolveUsername', username: 'Durov' }])
    expect(found).toMatchObject({ kind: 'user', id: 100n, accessHash: 0x1122_3344_5566_7788n })
    expect(await store.byId('user', 100n)).toMatchObject({ id: 100n })
  })

  it('keeps the other peers the answer described', async () => {
    const store = memory()
    const dc = peer(() => ({ ...resolved, chats: [CHANNEL] }))

    await resolveUsername({ store, peer: dc, username: 'durov' })

    // A name usually resolves to a peer whose answer names others, and throwing
    // them away means asking again for what has already arrived.
    expect(await store.byId('channel', 200n)).toMatchObject({ accessHash: 0x99n })
  })

  it('does not ask again for a peer already known in full', async () => {
    const store = memory()
    const dc = peer(() => resolved)
    await resolveUsername({ store, peer: dc, username: 'durov' })

    const again = await resolveUsername({ store, peer: dc, username: 'durov' })

    expect(dc.asked).toHaveLength(1)
    expect(again).toMatchObject({ id: 100n })
  })

  it('asks again for a peer only ever seen in passing', async () => {
    const store = memory()
    await store.save({
      kind: 'user',
      id: 100n,
      accessHash: 1n,
      min: true,
      usernames: ['durov'],
    })
    const dc = peer(() => resolved)

    const found = await resolveUsername({ store, peer: dc, username: 'durov' })

    // What was cached cannot be used on its own, so it is no answer at all.
    expect(dc.asked).toHaveLength(1)
    expect(found).toMatchObject({ min: false, accessHash: 0x1122_3344_5566_7788n })
  })

  it('reports a name Telegram does not know as the refusal it is', async () => {
    const store = memory()
    const dc = peer(() => {
      throw new PeerError('USERNAME_NOT_OCCUPIED (400)')
    })

    await expect(resolveUsername({ store, peer: dc, username: 'nobody' })).rejects.toThrow(
      /USERNAME_NOT_OCCUPIED/,
    )
  })

  it('refuses an answer that is not a resolution', async () => {
    const store = memory()
    const dc = peer(() => ({ _: 'boolTrue' }))

    await expect(resolveUsername({ store, peer: dc, username: 'durov' })).rejects.toThrow(
      /expected a resolved peer/,
    )
  })

  it('refuses an answer naming a peer it did not describe', async () => {
    const store = memory()
    const dc = peer(() => ({ ...resolved, users: [] }))

    // Nothing was learned about how to reach it, and inventing a hash is the one
    // thing that must never happen.
    await expect(resolveUsername({ store, peer: dc, username: 'durov' })).rejects.toBeInstanceOf(
      PeerError,
    )
  })

  it('refuses an answer whose named peer is not a peer', async () => {
    const store = memory()
    const dc = peer(() => ({ ...resolved, peer: { _: 'boolTrue' } }))

    await expect(resolveUsername({ store, peer: dc, username: 'durov' })).rejects.toThrow(
      /does not name a peer/,
    )
  })
})
