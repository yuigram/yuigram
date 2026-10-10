// SPDX-License-Identifier: MIT

/**
 * Walking a list that arrives one page at a time.
 *
 * Driven by a fake client rather than a connection, which is what the
 * structural `Paging` interface is for. The cases that matter are the ones a
 * caller writing the loop by hand gets wrong: an offset assembled from the
 * wrong dialog, a page that does not advance, a limit that should stop mid-page,
 * and the laziness — a generator that fetched ahead would make `limit` a lie and
 * turn breaking out of a loop into wasted requests against an account Telegram
 * is willing to limit.
 */

import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import {
  type Paging,
  walkDialogs,
  walkGlobalSearch,
  walkHistory,
  walkMembers,
  walkSearch,
} from '../src/paging/walk.js'

/** One dialog row, and the message that dates it. */
function pageOf(ids: readonly number[], channel = 55n) {
  return {
    dialogs: ids.map((id) => ({
      _: 'dialog' as const,
      peer: { _: 'peerChannel' as const, channel_id: channel + BigInt(id) },
      top_message: id,
      read_inbox_max_id: 0,
      read_outbox_max_id: 0,
      unread_count: id,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      notify_settings: { _: 'peerNotifySettings' as const },
    })),
    messages: ids.map((id) => ({
      _: 'message' as const,
      id,
      peer_id: { _: 'peerChannel' as const, channel_id: channel + BigInt(id) },
      message: `m${id}`,
      date: 1_700_000_000 + id,
    })),
    chats: [],
    users: [],
  }
}

/** A client answering from a script, recording what it was asked. */
function fake(
  answers: readonly unknown[],
  as?: TypeInputPeer,
): Paging & {
  readonly asked: unknown[]
  readonly resolved: unknown[]
} {
  const asked: unknown[] = []
  const resolved: unknown[] = []
  let at = 0

  const next = (params: unknown) => {
    asked.push(params)

    const answer = answers[at]
    at += 1

    if (answer === undefined) throw new Error('asked for more pages than the script has')

    return Promise.resolve(answer)
  }

  const api = {
    messages: { getDialogs: next, getHistory: next, search: next, searchGlobal: next },
    channels: { getParticipants: next },
  } as unknown as MtprotoApi

  return {
    api,
    asked,
    resolved,
    resolve(peer) {
      resolved.push(peer)

      return Promise.resolve(as ?? ({ _: 'inputPeerSelf' } as TypeInputPeer))
    },
  }
}

/** The same, resolving every peer to one the caller chose. */
function fakeWith(
  as: TypeInputPeer,
  answers: readonly unknown[],
): Paging & { readonly asked: unknown[]; readonly resolved: unknown[] } {
  return fake(answers, as)
}

describe('walking conversations', () => {
  it('yields a complete list and then stops', async () => {
    // `messages.dialogs` is the whole list. Asking again would fetch its first
    // page a second time.
    const client = fake([{ _: 'messages.dialogs', ...pageOf([3, 2, 1]) }])
    const seen = []

    for await (const dialog of walkDialogs(client)) seen.push(dialog.topMessageId)

    expect(seen).toEqual([3, 2, 1])
    expect(client.asked).toHaveLength(1)
  })

  it('continues a slice from the offset the last page implies', async () => {
    const client = fake([
      { _: 'messages.dialogsSlice', count: 5, ...pageOf([5, 4]) },
      { _: 'messages.dialogsSlice', count: 5, ...pageOf([3, 2]) },
      { _: 'messages.dialogs', ...pageOf([1]) },
    ])
    const seen = []

    for await (const dialog of walkDialogs(client)) seen.push(dialog.topMessageId)

    expect(seen).toEqual([5, 4, 3, 2, 1])
    expect(client.asked).toHaveLength(3)

    // The offset belongs to the last row of the page, dated by its message —
    // not by the page, and not by the first row.
    const second = client.asked[1] as { offset_id: number; offset_date: number }

    expect(second.offset_id).toBe(4)
    expect(second.offset_date).toBe(1_700_000_004)
  })

  it('starts from the beginning of the list rather than from anywhere in it', async () => {
    // The first request carries no offset at all. Starting from the account
    // itself, or from any peer, would begin part-way down somebody's list.
    const client = fake([{ _: 'messages.dialogs', ...pageOf([1]) }])

    for await (const _ of walkDialogs(client)) {
      // walked for the side effect on the fake
    }

    expect(client.asked[0]).toMatchObject({
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
    })
  })

  it('stops where a page carries no rows', async () => {
    const client = fake([{ _: 'messages.dialogsSlice', count: 0, ...pageOf([]) }])
    const seen = []

    for await (const dialog of walkDialogs(client)) seen.push(dialog.topMessageId)

    expect(seen).toEqual([])
    expect(client.asked).toHaveLength(1)
  })

  it('stops on an answer saying nothing has changed', async () => {
    const client = fake([{ _: 'messages.dialogsNotModified', count: 0 }])
    const seen = []

    for await (const dialog of walkDialogs(client)) seen.push(dialog.topMessageId)

    expect(seen).toEqual([])
  })

  it('stops at a limit that falls inside a page', async () => {
    const client = fake([{ _: 'messages.dialogsSlice', count: 9, ...pageOf([9, 8, 7]) }])
    const seen = []

    for await (const dialog of walkDialogs(client, { limit: 2 })) seen.push(dialog.topMessageId)

    expect(seen).toEqual([9, 8])
    expect(client.asked).toHaveLength(1)
  })

  it('never asks for more than is still wanted', async () => {
    const client = fake([
      { _: 'messages.dialogsSlice', count: 9, ...pageOf([9, 8]) },
      { _: 'messages.dialogsSlice', count: 9, ...pageOf([7, 6]) },
    ])
    const seen = []

    for await (const dialog of walkDialogs(client, { limit: 3, pageSize: 2 })) {
      seen.push(dialog.topMessageId)
    }

    expect(seen).toEqual([9, 8, 7])
    expect((client.asked[0] as { limit: number }).limit).toBe(2)
    // Two are already in hand, so the second request asks for the one that is
    // left rather than for another pageful.
    expect((client.asked[1] as { limit: number }).limit).toBe(1)
  })

  it('fetches only when asked, so breaking out stops the requests', async () => {
    // The reason this is a generator. A version that gathered pages up front
    // would make `limit` a lie and spend requests a caller had decided against.
    const client = fake([
      { _: 'messages.dialogsSlice', count: 9, ...pageOf([9, 8]) },
      { _: 'messages.dialogsSlice', count: 9, ...pageOf([7, 6]) },
    ])

    const walk = walkDialogs(client, { pageSize: 2 })

    expect(client.asked).toHaveLength(0)

    await walk.next()

    expect(client.asked).toHaveLength(1)

    await walk.return()

    expect(client.asked).toHaveLength(1)
  })

  it('resolves the peer an offset names, because a call cannot carry a reference', async () => {
    const client = fake([
      { _: 'messages.dialogsSlice', count: 3, ...pageOf([3, 2]) },
      { _: 'messages.dialogs', ...pageOf([1]) },
    ])

    for await (const _ of walkDialogs(client)) {
      // walked for the side effect on the fake
    }

    expect(client.resolved).toEqual([{ kind: 'channel', id: 57n }])
  })
})

describe('walking a conversation', () => {
  const history = (ids: readonly number[]) => ({
    messages: ids.map((id) => ({
      _: 'message' as const,
      id,
      peer_id: { _: 'peerUser' as const, user_id: 7n },
      message: `m${id}`,
      date: 1_700_000_000 + id,
    })),
    chats: [],
    users: [],
    topics: [],
  })

  it('resolves the peer once, not once per page', async () => {
    const client = fake([
      { _: 'messages.messagesSlice', count: 4, ...history([4, 3]) },
      { _: 'messages.messagesSlice', count: 4, ...history([2, 1]) },
      { _: 'messages.messages', ...history([]) },
    ])
    const seen = []

    for await (const message of walkHistory(client, '@someone', { pageSize: 2 })) {
      seen.push(message.id)
    }

    expect(seen).toEqual([4, 3, 2, 1])
    expect(client.resolved).toEqual(['@someone'])
  })

  it('asks for what sits before the oldest message of the last page', async () => {
    const client = fake([
      { _: 'messages.messagesSlice', count: 4, ...history([4, 3]) },
      { _: 'messages.messages', ...history([]) },
    ])

    for await (const _ of walkHistory(client, '@someone', { pageSize: 2 })) {
      // walked for the side effect on the fake
    }

    expect((client.asked[0] as { offset_id: number }).offset_id).toBe(0)
    expect((client.asked[1] as { offset_id: number }).offset_id).toBe(3)
  })

  it('stops when a page does not reach further back than the last one', async () => {
    // A conversation whose oldest message keeps coming back would otherwise be
    // walked forever.
    const client = fake([
      { _: 'messages.messagesSlice', count: 2, ...history([2, 1]) },
      { _: 'messages.messagesSlice', count: 2, ...history([2, 1]) },
    ])
    const seen = []

    for await (const message of walkHistory(client, '@someone', { pageSize: 2 })) {
      seen.push(message.id)
    }

    expect(seen).toEqual([2, 1, 2, 1])
    expect(client.asked).toHaveLength(2)
  })

  it('stops on an empty page and on one saying nothing has changed', async () => {
    const empty = fake([{ _: 'messages.messages', ...history([]) }])
    const unchanged = fake([{ _: 'messages.messagesNotModified', count: 0 }])

    for await (const _ of walkHistory(empty, '@someone')) throw new Error('yielded something')
    for await (const _ of walkHistory(unchanged, '@someone')) throw new Error('yielded something')

    expect(empty.asked).toHaveLength(1)
    expect(unchanged.asked).toHaveLength(1)
  })

  it('stops at a limit that falls inside a page', async () => {
    const client = fake([{ _: 'messages.messagesSlice', count: 9, ...history([9, 8, 7]) }])
    const seen = []

    for await (const message of walkHistory(client, '@someone', { limit: 2 })) {
      seen.push(message.id)
    }

    expect(seen).toEqual([9, 8])
    expect(client.asked).toHaveLength(1)
  })

  it('yields messages read, not raw values', async () => {
    const client = fake([{ _: 'messages.messages', ...history([1]) }])

    for await (const message of walkHistory(client, '@someone')) {
      expect(message.text).toBe('m1')
      expect(message.chat).toEqual({ kind: 'user', id: 7n })
      expect(message.isService).toBe(false)
    }
  })
})

describe('the forms that mean there is no next page', () => {
  it('stops on a complete conversation rather than asking again', async () => {
    // `messages.messages` is the whole conversation. Only the slice forms
    // continue, and asking again would fetch its first page a second time.
    const client = fake([
      {
        _: 'messages.messages',
        messages: [
          {
            _: 'message' as const,
            id: 1,
            peer_id: { _: 'peerUser' as const, user_id: 7n },
            message: 'only',
            date: 1_700_000_000,
          },
        ],
        chats: [],
        users: [],
        topics: [],
      },
    ])
    const seen = []

    for await (const message of walkHistory(client, '@someone')) seen.push(message.id)

    expect(seen).toEqual([1])
    expect(client.asked).toHaveLength(1)
  })
})

describe('searching one conversation', () => {
  const page = (ids: readonly number[]) => ({
    messages: ids.map((id) => ({
      _: 'message' as const,
      id,
      peer_id: { _: 'peerUser' as const, user_id: 7n },
      message: `m${id}`,
      date: 1_700_000_000 + id,
    })),
    chats: [],
    users: [],
    topics: [],
  })

  it('pages by message number, like history over the same conversation', async () => {
    const client = fake([
      { _: 'messages.messagesSlice', count: 4, ...page([9, 7]) },
      { _: 'messages.messages', ...page([4]) },
    ])
    const seen = []

    for await (const found of walkSearch(client, '@someone', 'thing', { pageSize: 2 })) {
      seen.push(found.id)
    }

    expect(seen).toEqual([9, 7, 4])
    expect((client.asked[0] as { q: string; offset_id: number }).q).toBe('thing')
    expect((client.asked[1] as { offset_id: number }).offset_id).toBe(7)
  })

  it('does not treat a short page as the end, because a filter thins pages', async () => {
    // A filtered search returns fewer than asked for without that meaning the
    // conversation ran out. Only a cursor that stops advancing means that.
    const client = fake([
      { _: 'messages.messagesSlice', count: 9, ...page([9]) },
      { _: 'messages.messagesSlice', count: 9, ...page([5]) },
      { _: 'messages.messages', ...page([]) },
    ])
    const seen = []

    for await (const found of walkSearch(client, '@someone', 'q', { pageSize: 5 })) {
      seen.push(found.id)
    }

    expect(seen).toEqual([9, 5])
    expect(client.asked).toHaveLength(3)
  })

  it('resolves a sender filter as well as the conversation', async () => {
    const client = fake([{ _: 'messages.messages', ...page([1]) }])

    for await (const _ of walkSearch(client, '@chat', 'q', { from: '@someone', topicId: 3 })) {
      // walked for the side effect on the fake
    }

    expect(client.resolved).toEqual(['@chat', '@someone'])
    expect(client.asked[0]).toMatchObject({ top_msg_id: 3 })
    expect(client.asked[0]).toHaveProperty('from_id')
  })

  it('leaves the sender and topic off entirely when neither was given', async () => {
    const client = fake([{ _: 'messages.messages', ...page([1]) }])

    for await (const _ of walkSearch(client, '@chat', 'q')) {
      // walked for the side effect on the fake
    }

    expect(client.asked[0]).not.toHaveProperty('from_id')
    expect(client.asked[0]).not.toHaveProperty('top_msg_id')
  })

  it('searches every kind of message unless told to narrow it', () => {
    // A filter nobody asked for would quietly return a different list, and the
    // caller would have no way to tell it was narrowed.
    const client = fake([{ _: 'messages.messages', ...page([1]) }])

    return (async () => {
      for await (const _ of walkSearch(client, '@chat', 'q')) {
        // walked for the side effect on the fake
      }

      expect(client.asked[0]).toMatchObject({ filter: { _: 'inputMessagesFilterEmpty' } })
    })()
  })
})

describe('searching everywhere', () => {
  const page = (ids: readonly number[], channel = 55n) => ({
    messages: ids.map((id) => ({
      _: 'message' as const,
      id,
      peer_id: { _: 'peerChannel' as const, channel_id: channel },
      message: `m${id}`,
      date: 1_700_000_000 + id,
    })),
    chats: [],
    users: [],
    topics: [],
  })

  it('carries the rate, the conversation and the number back', async () => {
    // A message number means nothing across conversations, so all three have to
    // agree or the next page starts somewhere else entirely.
    const client = fake([
      { _: 'messages.messagesSlice', count: 4, next_rate: 900, ...page([9, 7]) },
      { _: 'messages.messagesSlice', count: 4, ...page([4]) },
    ])
    const seen = []

    for await (const found of walkGlobalSearch(client, 'thing', { pageSize: 2 })) {
      seen.push(found.id)
    }

    expect(seen).toEqual([9, 7, 4])

    const second = client.asked[1] as { offset_rate: number; offset_id: number }

    expect(second.offset_rate).toBe(900)
    expect(second.offset_id).toBe(7)
    // All three, because all three have to agree: a rate and a number without
    // the conversation they belong to name a position in somebody else's list.
    expect((client.asked[1] as { offset_peer: unknown }).offset_peer).toEqual({
      _: 'inputPeerSelf',
    })
    expect(client.resolved).toEqual([{ kind: 'channel', id: 55n }])
  })

  it('starts from nowhere in particular', async () => {
    const client = fake([{ _: 'messages.messages', ...page([1]) }])

    for await (const _ of walkGlobalSearch(client, 'q')) {
      // walked for the side effect on the fake
    }

    expect(client.asked[0]).toMatchObject({
      offset_rate: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
    })
  })

  it('stops where a page reports no rate to continue from', async () => {
    // Without a rate there is nowhere to go next, however full the page looked.
    const client = fake([{ _: 'messages.messagesSlice', count: 99, ...page([9, 8]) }])
    const seen = []

    for await (const found of walkGlobalSearch(client, 'q', { pageSize: 2 })) {
      seen.push(found.id)
    }

    expect(seen).toEqual([9, 8])
    expect(client.asked).toHaveLength(1)
  })
})

describe('walking the members of a channel', () => {
  const members = (ids: readonly number[]) => ({
    count: 100,
    participants: ids.map((id) => ({
      _: 'channelParticipant' as const,
      user_id: BigInt(id),
      date: 1_700_000_000,
    })),
    chats: [],
    users: [],
  })

  const asChannel = () =>
    fakeWith({ _: 'inputPeerChannel', channel_id: 55n, access_hash: 900n }, [
      { _: 'channels.channelParticipants', ...members([1, 2]) },
      { _: 'channels.channelParticipants', ...members([3]) },
      { _: 'channels.channelParticipants', ...members([]) },
    ])

  it('counts into the list rather than keying it', async () => {
    // A third cursor policy: an offset of how many have been seen, not an
    // identifier. That is what makes this list the least stable of the three.
    const client = asChannel()
    const seen = []

    for await (const member of walkMembers(client, 'somewhere', { pageSize: 2 })) {
      seen.push(member.peer?.id)
    }

    expect(seen).toEqual([1n, 2n, 3n])
    expect((client.asked[0] as { offset: number }).offset).toBe(0)
    expect((client.asked[1] as { offset: number }).offset).toBe(2)
    expect((client.asked[2] as { offset: number }).offset).toBe(3)
  })

  it('asks for everyone recently active unless told otherwise', async () => {
    const client = asChannel()

    for await (const _ of walkMembers(client, 'somewhere', { limit: 1 })) {
      // walked for the side effect on the fake
    }

    expect(client.asked[0]).toMatchObject({ filter: { _: 'channelParticipantsRecent' } })
  })

  it('carries the filter it was given', async () => {
    const client = asChannel()

    for await (const _ of walkMembers(client, 'somewhere', {
      limit: 1,
      filter: { _: 'channelParticipantsAdmins' },
    })) {
      // walked for the side effect on the fake
    }

    expect(client.asked[0]).toMatchObject({ filter: { _: 'channelParticipantsAdmins' } })
  })

  it('refuses a person, who has no members', async () => {
    const client = fake([])

    await expect(async () => {
      for await (const _ of walkMembers(client, '@someone')) {
        // never reached
      }
    }).rejects.toThrow(/group, a supergroup or a channel/)
  })

  it('yields members read, not raw values', async () => {
    const client = asChannel()

    for await (const member of walkMembers(client, 'somewhere', { limit: 1 })) {
      expect(member.standing).toBe('member')
      expect(member.isUser).toBe(true)
      expect(member.joinedAt).toBe(1_700_000_000)
    }
  })
})
