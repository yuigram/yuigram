/**
 * Reading who peers are, and finding conversations an account has not named.
 *
 * Three things are judged, and none of them is the return value alone:
 *
 * - **how many requests travelled**, because the point of reading several peers
 *   at once is that it is one request per family rather than one per peer, and
 *   a version that loops would pass every assertion about the answer;
 * - **which family each went to**, because people, basic groups and channels
 *   are three different bulk reads and mixing them up is the easy mistake;
 * - **where the answers landed**, because these are positional and an answer in
 *   the wrong slot describes the wrong peer with complete confidence.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import {
  fetchPeer,
  fetchPeers,
  fetchUser,
  findDialogs,
  findFolder,
  type PeerReading,
} from '../src/chats/peers.js'
import { DialogView } from '../src/entities/dialog.js'
import { ChatView, UserView } from '../src/entities/peer.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import type { PeerRecord } from '../src/storage/peers.js'
import type { TlValue } from '../src/tl/index.js'

/** A person record, as Telegram describes one. */
const person = (id: bigint, first = `user-${id}`) => ({
  _: 'user' as const,
  id,
  first_name: first,
})

/** A basic group record. */
const group = (id: bigint, title = `group-${id}`) => ({
  _: 'chat' as const,
  id,
  title,
  participants_count: 2,
  date: 0,
  version: 1,
})

/** A channel record. */
const channel = (id: bigint, title = `channel-${id}`) => ({
  _: 'channel' as const,
  id,
  title,
  date: 0,
  access_hash: id * 10n,
})

/** A conversation-list row for a peer. */
const row = (peer: TlValue, topMessage = 1): TlValue => ({
  _: 'dialog',
  peer,
  top_message: topMessage,
  read_inbox_max_id: 0,
  read_outbox_max_id: 0,
  unread_count: 0,
  unread_mentions_count: 0,
  unread_reactions_count: 0,
  notify_settings: { _: 'peerNotifySettings' },
})

/** How a name or reference is addressed, for the fake to answer with. */
interface Addressing {
  readonly [name: string]: TypeInputPeer | undefined
}

/**
 * A client answering from a script, recording what it was asked.
 *
 * The three bulk reads are scripted separately rather than from one queue,
 * because the whole question is which of them a request went to.
 */
function fake(options: {
  readonly addressing?: Addressing
  readonly users?: readonly TlValue[]
  readonly chats?: readonly TlValue[]
  readonly channels?: readonly TlValue[]
  readonly dialogs?: readonly TlValue[]
  readonly walk?: readonly TlValue[]
  readonly folders?: readonly TlValue[]
  readonly stored?: readonly PeerRecord[]
}) {
  const asked: { method: string; params: unknown }[] = []

  const named =
    (method: string, answer: (params: Record<string, unknown>) => unknown) =>
    (params: Record<string, unknown> = {}) => {
      asked.push({ method, params })

      return Promise.resolve(answer(params))
    }

  const api = {
    users: {
      getUsers: named('users.getUsers', () => options.users ?? []),
    },
    messages: {
      getChats: named('messages.getChats', () => ({
        _: 'messages.chats',
        chats: options.chats ?? [],
      })),
      getPeerDialogs: named('messages.getPeerDialogs', () => ({
        _: 'messages.peerDialogs',
        dialogs: options.dialogs ?? [],
        messages: [],
        chats: [],
        users: [],
        state: { _: 'updates.state', pts: 0, qts: 0, date: 0, seq: 0, unread_count: 0 },
      })),
      getDialogFilters: named('messages.getDialogFilters', () => ({
        _: 'messages.dialogFilters',
        filters: options.folders ?? [],
      })),
    },
    channels: {
      getChannels: named('channels.getChannels', () => ({
        _: 'messages.chats',
        chats: options.channels ?? [],
      })),
    },
  } as unknown as MtprotoApi

  const stored = new Map<string, PeerRecord>()
  for (const record of options.stored ?? []) stored.set(`${record.kind}:${record.id}`, record)

  const client: PeerReading & { readonly asked: typeof asked } = {
    api,
    asked,
    peers: {
      byId: (kind, id) => Promise.resolve(stored.get(`${kind}:${id}`)),
      byUsername: () => Promise.resolve(undefined),
      byPhone: () => Promise.resolve(undefined),
      save: () => Promise.resolve(true),
      forget: () => Promise.resolve(),
    },
    resolve: (peer) => {
      const found = address(options.addressing, peer)
      if (found === undefined) throw new PeerError(`cannot name ${String(peer)}`)

      return Promise.resolve(found)
    },
    resolveMany: (peers) => Promise.resolve(peers.map((peer) => address(options.addressing, peer))),
    async *dialogs() {
      for (const one of options.walk ?? []) {
        asked.push({ method: 'walk', params: one })
        yield new DialogView(one as never)
      }
    },
    feed: () => Promise.resolve(),
  }

  return client
}

/** How the fake decides what a name or reference resolves to. */
function address(
  addressing: Addressing | undefined,
  peer: string | { kind: string; id: bigint },
): TypeInputPeer | undefined {
  const key = typeof peer === 'string' ? peer : `${peer.kind}:${peer.id}`

  return addressing?.[key]
}

/** Every request that went to one method. */
const went = (client: ReturnType<typeof fake>, method: string) =>
  client.asked.filter((one) => one.method === method)

const USER_A: TypeInputPeer = { _: 'inputPeerUser', user_id: 1n, access_hash: 11n }
const USER_B: TypeInputPeer = { _: 'inputPeerUser', user_id: 2n, access_hash: 22n }
const GROUP_A: TypeInputPeer = { _: 'inputPeerChat', chat_id: 3n }
const CHANNEL_A: TypeInputPeer = { _: 'inputPeerChannel', channel_id: 4n, access_hash: 40n }

describe('reading who peers are', () => {
  it('asks one request per family rather than one per peer', async () => {
    // The whole reason this exists. Six peers across three families is three
    // requests; a version that looped would answer correctly and cost six.
    const client = fake({
      addressing: {
        '@a': USER_A,
        '@b': USER_B,
        '@g': GROUP_A,
        '@c': CHANNEL_A,
      },
      users: [person(1n), person(2n)],
      chats: [group(3n)],
      channels: [channel(4n)],
    })

    const found = await fetchPeers(client, ['@a', '@b', '@g', '@c'])

    expect(went(client, 'users.getUsers')).toHaveLength(1)
    expect(went(client, 'messages.getChats')).toHaveLength(1)
    expect(went(client, 'channels.getChannels')).toHaveLength(1)
    expect(found).toHaveLength(4)
  })

  it('sends each peer to the read its family has', async () => {
    const client = fake({
      addressing: { '@a': USER_A, '@g': GROUP_A, '@c': CHANNEL_A },
      users: [person(1n)],
      chats: [group(3n)],
      channels: [channel(4n)],
    })

    await fetchPeers(client, ['@a', '@g', '@c'])

    expect(went(client, 'users.getUsers')[0]?.params).toMatchObject({
      id: [{ _: 'inputUser', user_id: 1n, access_hash: 11n }],
    })
    // A basic group is a bare number, which is the difference between the two
    // conversation families and the reason they are separate calls.
    expect(went(client, 'messages.getChats')[0]?.params).toEqual({ id: [3n] })
    expect(went(client, 'channels.getChannels')[0]?.params).toMatchObject({
      id: [{ _: 'inputChannel', channel_id: 4n, access_hash: 40n }],
    })
  })

  it('answers in the order it was asked, across families', async () => {
    // Positional across three requests that complete in any order, which is
    // the part a naive implementation gets wrong.
    const client = fake({
      addressing: { '@c': CHANNEL_A, '@a': USER_A, '@g': GROUP_A },
      users: [person(1n, 'ann')],
      chats: [group(3n, 'the group')],
      channels: [channel(4n, 'the channel')],
    })

    const [first, second, third] = await fetchPeers(client, ['@c', '@a', '@g'])

    expect((first as ChatView).title).toBe('the channel')
    expect((second as UserView).firstName).toBe('ann')
    expect((third as ChatView).title).toBe('the group')
  })

  it('leaves a gap where a peer could not be named', async () => {
    const client = fake({
      addressing: { '@a': USER_A },
      users: [person(1n)],
    })

    const found = await fetchPeers(client, ['@a', '@nobody'])

    expect(found[0]).toBeInstanceOf(UserView)
    expect(found[1]).toBeUndefined()
  })

  it('leaves a gap where Telegram would not describe the peer', async () => {
    // `userEmpty` names an identifier and nothing else. Reported as absent
    // rather than as a record, because that is what it means.
    const client = fake({
      addressing: { '@a': USER_A, '@b': USER_B },
      users: [person(1n), { _: 'userEmpty', id: 2n }],
    })

    const found = await fetchPeers(client, ['@a', '@b'])

    expect(found[0]).toBeInstanceOf(UserView)
    expect(found[1]).toBeUndefined()
  })

  it('answers both places when one peer is asked for twice', async () => {
    const client = fake({
      addressing: { '@a': USER_A },
      users: [person(1n, 'ann')],
    })

    const found = await fetchPeers(client, ['@a', '@a'])

    expect((found[0] as UserView).firstName).toBe('ann')
    expect((found[1] as UserView).firstName).toBe('ann')
  })

  it('asks nothing at all for an empty list', async () => {
    const client = fake({})

    expect(await fetchPeers(client, [])).toEqual([])
    expect(client.asked).toHaveLength(0)
  })

  it('splits a family larger than one request into pages', async () => {
    // Fifty-one people is two requests, and both of them people.
    const addressing: Record<string, TypeInputPeer> = {}
    const names: string[] = []
    const users: TlValue[] = []
    for (let id = 1; id <= 51; id += 1) {
      addressing[`@u${id}`] = { _: 'inputPeerUser', user_id: BigInt(id), access_hash: 1n }
      names.push(`@u${id}`)
      users.push(person(BigInt(id)))
    }

    const client = fake({ addressing, users })
    const found = await fetchPeers(client, names)

    const sizes = went(client, 'users.getUsers').map(
      (one) => (one.params as { id: unknown[] }).id.length,
    )
    expect(sizes).toEqual([50, 1])
    expect(found.filter((one) => one !== undefined)).toHaveLength(51)
  })

  it('reads one peer as whichever kind it is', async () => {
    const asUser = fake({ addressing: { '@a': USER_A }, users: [person(1n)] })
    const asChannel = fake({ addressing: { '@c': CHANNEL_A }, channels: [channel(4n)] })

    expect(await fetchPeer(asUser, '@a')).toBeInstanceOf(UserView)
    expect(await fetchPeer(asChannel, '@c')).toBeInstanceOf(ChatView)
  })

  it('refuses a single read that found nothing', async () => {
    // A gap is the right answer for a list, where the caller can see which
    // index it was. For one peer it would only move the question one line on.
    const client = fake({ addressing: { '@a': USER_A }, users: [] })

    await expect(fetchPeer(client, '@a')).rejects.toThrow(PeerError)
    await expect(fetchPeer(client, '@a')).rejects.toThrow(/nothing was found for '@a'/)
  })

  it('names a reference it could not read, without assuming it has a name', async () => {
    const client = fake({})

    await expect(fetchPeer(client, { kind: 'channel', id: 9n })).rejects.toThrow(/the channel 9/)
  })

  it('narrows to a person, and refuses a conversation', async () => {
    const client = fake({
      addressing: { '@a': USER_A, '@c': CHANNEL_A },
      users: [person(1n, 'ann')],
      channels: [channel(4n)],
    })

    expect((await fetchUser(client, '@a')).firstName).toBe('ann')
    await expect(fetchUser(client, '@c')).rejects.toThrow(
      /names a conversation rather than a person/,
    )
  })
})

describe('finding conversations in the list', () => {
  it('asks directly about every peer it can already address', async () => {
    const client = fake({
      addressing: { '@a': USER_A, '@c': CHANNEL_A },
      dialogs: [row({ _: 'peerUser', user_id: 1n }), row({ _: 'peerChannel', channel_id: 4n })],
    })

    const found = await findDialogs(client, ['@a', '@c'])

    expect(went(client, 'messages.getPeerDialogs')).toHaveLength(1)
    expect(went(client, 'walk')).toHaveLength(0)
    expect(found).toHaveLength(2)
    expect(found[0]).toBeInstanceOf(DialogView)
  })

  it('walks the list only for what it could not address', async () => {
    // The part that makes this a search rather than a lookup. One peer is
    // addressable and is asked about; the other is not and drives the walk.
    const client = fake({
      addressing: { '@a': USER_A },
      dialogs: [row({ _: 'peerUser', user_id: 1n })],
      walk: [row({ _: 'peerChannel', channel_id: 9n }, 7)],
    })

    const found = await findDialogs(client, ['@a', { kind: 'channel', id: 9n }])

    expect(found[0]?.topMessageId).toBe(1)
    expect(found[1]?.topMessageId).toBe(7)
  })

  it('stops walking as soon as the last one is found', async () => {
    // A full download for one missing row would make this unusable on an
    // account with thousands of conversations.
    const client = fake({
      walk: [
        row({ _: 'peerChannel', channel_id: 9n }),
        row({ _: 'peerChannel', channel_id: 10n }),
        row({ _: 'peerChannel', channel_id: 11n }),
      ],
    })

    await findDialogs(client, [{ kind: 'channel', id: 9n }])

    expect(went(client, 'walk')).toHaveLength(1)
  })

  it('matches a name against what the walk already wrote down', async () => {
    // Finding by name costs no request: a page of the list carries the peers
    // its rows point at, and those are harvested on the way past.
    const client = fake({
      walk: [row({ _: 'peerChannel', channel_id: 9n }, 4)],
      stored: [{ kind: 'channel', id: 9n, min: false, usernames: ['news'] }],
    })

    const [found] = await findDialogs(client, ['@news'])

    expect(found?.topMessageId).toBe(4)
    expect(went(client, 'users.getUsers')).toHaveLength(0)
    expect(went(client, 'channels.getChannels')).toHaveLength(0)
  })

  it('refuses when a conversation is not in the list at all', async () => {
    const client = fake({ walk: [row({ _: 'peerChannel', channel_id: 10n })] })

    await expect(findDialogs(client, [{ kind: 'channel', id: 9n }])).rejects.toThrow(
      /no conversation in this account's list matches the channel 9/,
    )
  })

  it('refuses when a peer was addressable but has no row', async () => {
    // Addressing a peer says it can be reached, not that there is a
    // conversation with it. An empty answer from the direct ask is that case.
    const client = fake({ addressing: { '@a': USER_A }, dialogs: [] })

    await expect(findDialogs(client, ['@a'])).rejects.toThrow(PeerError)
  })

  it('answers nothing for an empty list, without asking', async () => {
    const client = fake({})

    expect(await findDialogs(client, [])).toEqual([])
    expect(client.asked).toHaveLength(0)
  })
})

describe('finding a folder', () => {
  const folders: TlValue[] = [
    {
      _: 'dialogFilter',
      id: 2,
      title: { _: 'textWithEntities', text: 'Work', entities: [] },
      emoticon: '\u{1f4bc}',
      pinned_peers: [],
      include_peers: [],
      exclude_peers: [],
    },
    {
      _: 'dialogFilter',
      id: 3,
      title: { _: 'textWithEntities', text: 'Friends', entities: [] },
      pinned_peers: [],
      include_peers: [],
      exclude_peers: [],
    },
  ]

  it('finds one by title', async () => {
    const found = await findFolder(fake({ folders }), { title: 'Work' })

    expect(found?.id).toBe(2)
  })

  it('finds one by number', async () => {
    const found = await findFolder(fake({ folders }), { id: 3 })

    expect(found?.title).toBe('Friends')
  })

  it('finds one by emoji', async () => {
    const found = await findFolder(fake({ folders }), { emoji: '\u{1f4bc}' })

    expect(found?.id).toBe(2)
  })

  it('requires every criterion given to match', async () => {
    // Two criteria narrow rather than widen, so a folder matching one of them
    // and not the other is not the answer.
    expect(await findFolder(fake({ folders }), { id: 2, title: 'Friends' })).toBeUndefined()
    expect(await findFolder(fake({ folders }), { id: 2, title: 'Work' })).toBeDefined()
  })

  it('answers nothing where no folder matches', async () => {
    expect(await findFolder(fake({ folders }), { title: 'Nowhere' })).toBeUndefined()
  })

  it('refuses to look with nothing to look for', async () => {
    // Otherwise it would answer with whichever folder came first and look like
    // it had worked.
    await expect(findFolder(fake({ folders }), {})).rejects.toThrow(ValidationError)
  })
})
