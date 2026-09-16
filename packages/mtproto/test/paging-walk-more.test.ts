/**
 * Walking the lists that are not paged by a message number.
 *
 * `paging-walk.test.ts` covers the first five walks and the three cursor
 * policies they use. These are the rest, and between them they use five more:
 * a cursor the server chooses and a client cannot derive, a count into a live
 * list, three fields that have to agree, an identifier that has to keep moving
 * backwards, and a state string sent back with a flag saying it is a
 * continuation.
 *
 * Each of those has its own way of being the end, and getting it wrong is not
 * visible in what a walk yields — an implementation that never terminates
 * yields exactly the right items first. So every case here judges the requests
 * as well as the output: what the second one carried, and how many were made.
 *
 * Driven by a fake client rather than a connection, which is what the
 * structural `Paging` interface is for.
 */

import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import { photoFile, photoMedia } from '../src/files/media.js'
import type { Photo, TypeInputPeer } from '../src/generated/api/types/index.js'
import { peerRefOf } from '../src/normalize/normalize.js'
import {
  type Paging,
  walkAllStories,
  walkBoosts,
  walkChatEvents,
  walkForumTopics,
  walkHashtagSearch,
  walkInviteLinks,
  walkInviteMembers,
  walkProfilePhotos,
  walkProfileStories,
  walkReactions,
  walkSavedGifts,
  walkStarsTransactions,
  walkStoryViewers,
} from '../src/paging/walk.js'

/** A channel, for the walks that insist on one. */
const CHANNEL: TypeInputPeer = { _: 'inputPeerChannel', channel_id: 10n, access_hash: 99n }

/** A user, for the walks that insist on one. */
const USER: TypeInputPeer = { _: 'inputPeerUser', user_id: 7n, access_hash: 77n }

/**
 * A client answering from a script, recording what it was asked.
 *
 * Every method it answers goes through the same recorder, so a case reads the
 * requests in the order they were made without caring which method carried
 * them — which is the point when what is being judged is the progression.
 */
function fake(
  answers: readonly unknown[],
  as: TypeInputPeer = { _: 'inputPeerSelf' },
): Paging & { readonly asked: unknown[]; readonly resolved: unknown[] } {
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
    channels: { getAdminLog: next, searchPosts: next },
    messages: {
      getChatInviteImporters: next,
      getExportedChatInvites: next,
      getForumTopics: next,
      getMessageReactionsList: next,
    },
    payments: { getSavedStarGifts: next, getStarsTransactions: next },
    photos: { getUserPhotos: next },
    premium: { getBoostsList: next },
    stories: {
      getAllStories: next,
      getPinnedStories: next,
      getStoriesArchive: next,
      getStoryViewsList: next,
    },
  } as unknown as MtprotoApi

  return {
    api,
    asked,
    resolved,
    resolve(peer) {
      resolved.push(peer)

      return Promise.resolve(as)
    },
  }
}

/** Walk to the end and hand back what was yielded. */
async function drain<T>(walk: AsyncGenerator<T, void, undefined>): Promise<T[]> {
  const seen: T[] = []
  for await (const item of walk) seen.push(item)

  return seen
}

/** One reaction, by the account that made it. */
const reactionBy = (id: bigint) => ({
  _: 'messagePeerReaction' as const,
  peer_id: { _: 'peerUser' as const, user_id: id },
  date: 1_700_000_000,
  reaction: { _: 'reactionEmoji' as const, emoticon: '👍' },
})

describe('a list the server continues with a cursor of its own', () => {
  it('sends back exactly what the last page named', async () => {
    // The cursor is opaque: it is not a date, a number or a position, and a
    // client that derived one would be inventing a cursor the server did not
    // give. So the case is that the second request carries the first answer's
    // string unchanged.
    const client = fake([
      {
        _: 'messages.messageReactionsList',
        count: 4,
        reactions: [reactionBy(1n), reactionBy(2n)],
        chats: [],
        users: [],
        next_offset: 'opaque-1',
      },
      {
        _: 'messages.messageReactionsList',
        count: 4,
        reactions: [reactionBy(3n)],
        chats: [],
        users: [],
      },
    ])

    const seen = await drain(walkReactions(client, 'chat', 5))

    expect(seen.map((one) => one.peer?.id)).toEqual([1n, 2n, 3n])
    expect(client.asked).toHaveLength(2)
    // Absent on the first request, because there is nothing to continue from.
    expect(client.asked[0]).not.toHaveProperty('offset')
    expect(client.asked[1]).toMatchObject({ offset: 'opaque-1' })
  })

  it('stops where the server names no cursor', async () => {
    const client = fake([
      {
        _: 'messages.messageReactionsList',
        count: 1,
        reactions: [reactionBy(1n)],
        chats: [],
        users: [],
      },
    ])

    expect(await drain(walkReactions(client, 'chat', 5))).toHaveLength(1)
    expect(client.asked).toHaveLength(1)
  })

  it('stops where the server names one and sends nothing', async () => {
    // The end an implementation without this check never reaches: a cursor and
    // an empty page together are a request that can be repeated forever. The
    // script holds one answer, so a walk that asked twice fails here rather
    // than hanging.
    const client = fake([
      {
        _: 'messages.messageReactionsList',
        count: 0,
        reactions: [],
        chats: [],
        users: [],
        next_offset: 'opaque-1',
      },
    ])

    expect(await drain(walkReactions(client, 'chat', 5))).toEqual([])
    expect(client.asked).toHaveLength(1)
  })

  it('stops where the server names an empty cursor', async () => {
    // An empty string is not a cursor. Sending it back asks for the first page.
    const client = fake([
      {
        _: 'messages.messageReactionsList',
        count: 1,
        reactions: [reactionBy(1n)],
        chats: [],
        users: [],
        next_offset: '',
      },
    ])

    expect(await drain(walkReactions(client, 'chat', 5))).toHaveLength(1)
    expect(client.asked).toHaveLength(1)
  })

  it('stops at a limit inside a page without asking for another', async () => {
    const client = fake([
      {
        _: 'messages.messageReactionsList',
        count: 9,
        reactions: [reactionBy(1n), reactionBy(2n), reactionBy(3n)],
        chats: [],
        users: [],
        next_offset: 'opaque-1',
      },
    ])

    const seen = await drain(walkReactions(client, 'chat', 5, { limit: 2 }))

    expect(seen).toHaveLength(2)
    expect(client.asked).toHaveLength(1)
  })

  it('never asks for more than is still wanted', async () => {
    const client = fake([
      {
        _: 'premium.boostsList',
        count: 9,
        boosts: [boost('a'), boost('b')],
        users: [],
        next_offset: 'opaque-1',
      },
      { _: 'premium.boostsList', count: 9, boosts: [boost('c')], users: [] },
    ])

    const seen = await drain(walkBoosts(client, 'channel', { limit: 3, pageSize: 2 }))

    expect(seen.map((one) => one.id)).toEqual(['a', 'b', 'c'])
    expect((client.asked[0] as { limit: number }).limit).toBe(2)
    expect((client.asked[1] as { limit: number }).limit).toBe(1)
  })

  it('reads the transactions out of the answer that also carries a balance', async () => {
    // The answer is a status rather than a page: the balance is one value that
    // is the same on every page, and the history is the sequence.
    const client = fake([
      {
        _: 'payments.starsStatus',
        balance: { _: 'starsAmount', amount: 500n, nanos: 0 },
        history: [transaction('t1'), transaction('t2')],
        chats: [],
        users: [],
        next_offset: 'opaque-1',
      },
      {
        _: 'payments.starsStatus',
        balance: { _: 'starsAmount', amount: 500n, nanos: 0 },
        history: [transaction('t3')],
        chats: [],
        users: [],
      },
    ])

    const seen = await drain(walkStarsTransactions(client, 'me'))

    expect(seen.map((one) => one.id)).toEqual(['t1', 't2', 't3'])
    expect(client.asked[1]).toMatchObject({ offset: 'opaque-1' })
  })

  it('stops where a status carries no history at all', async () => {
    // The field is optional, and an account with no transactions has none. A
    // walk that read it as an empty page and continued would ask forever.
    const client = fake([
      {
        _: 'payments.starsStatus',
        balance: { _: 'starsAmount', amount: 0n, nanos: 0 },
        chats: [],
        users: [],
        next_offset: 'opaque-1',
      },
    ])

    expect(await drain(walkStarsTransactions(client, 'me'))).toEqual([])
    expect(client.asked).toHaveLength(1)
  })

  it('carries the choices a caller made into the request', async () => {
    const client = fake([
      {
        _: 'payments.starsStatus',
        balance: { _: 'starsAmount', amount: 0n, nanos: 0 },
        history: [],
        chats: [],
        users: [],
      },
    ])

    await drain(walkStarsTransactions(client, 'me', { direction: 'incoming', ascending: true }))

    expect(client.asked[0]).toMatchObject({ inbound: true, ascending: true })
    expect(client.asked[0]).not.toHaveProperty('outbound')
  })

  it('walks the gifts an account keeps', async () => {
    const client = fake([
      {
        _: 'payments.savedStarGifts',
        count: 2,
        gifts: [gift(1), gift(2)],
        chats: [],
        users: [],
        next_offset: 'opaque-1',
      },
      { _: 'payments.savedStarGifts', count: 2, gifts: [], chats: [], users: [] },
    ])

    const seen = await drain(walkSavedGifts(client, 'me'))

    expect(seen).toHaveLength(2)
    expect(client.asked[1]).toMatchObject({ offset: 'opaque-1' })
  })

  it('walks the accounts that saw a story, naming the story on every request', async () => {
    const client = fake([
      {
        _: 'stories.storyViewsList',
        count: 3,
        views_count: 3,
        forwards_count: 0,
        reactions_count: 0,
        views: [viewer(1n), viewer(2n)],
        chats: [],
        users: [],
        next_offset: 'opaque-1',
      },
      {
        _: 'stories.storyViewsList',
        count: 3,
        views_count: 3,
        forwards_count: 0,
        reactions_count: 0,
        views: [viewer(3n)],
        chats: [],
        users: [],
      },
    ])

    const seen = await drain(walkStoryViewers(client, 'me', 7))

    expect(seen.map((one) => one.peer?.id)).toEqual([1n, 2n, 3n])
    expect(client.asked[0]).toMatchObject({ id: 7, offset: '' })
    expect(client.asked[1]).toMatchObject({ id: 7, offset: 'opaque-1' })
  })
})

describe('walking somebody’s profile photos', () => {
  it('counts the offset forward by what each page held', async () => {
    const client = fake(
      [
        { _: 'photos.photosSlice', count: 5, photos: [photo(1n), photo(2n)], users: [] },
        { _: 'photos.photosSlice', count: 5, photos: [photo(3n)], users: [] },
        { _: 'photos.photosSlice', count: 5, photos: [], users: [] },
      ],
      USER,
    )

    const seen = await drain(walkProfilePhotos(client, 'someone'))

    expect(seen.map((one) => one.id)).toEqual([1n, 2n, 3n])
    expect((client.asked[0] as { offset: number }).offset).toBe(0)
    expect((client.asked[1] as { offset: number }).offset).toBe(2)
    expect((client.asked[2] as { offset: number }).offset).toBe(3)
  })

  it('counts entries it did not yield, because the offset is into the server’s list', async () => {
    // A photo the account may not see arrives as the empty form. Skipping it
    // without counting it would make every later page start two short and
    // return entries already seen.
    const client = fake(
      [
        {
          _: 'photos.photosSlice',
          count: 4,
          photos: [photo(1n), { _: 'photoEmpty', id: 0n }, photo(2n)],
          users: [],
        },
        { _: 'photos.photosSlice', count: 4, photos: [], users: [] },
      ],
      USER,
    )

    const seen = await drain(walkProfilePhotos(client, 'someone'))

    expect(seen.map((one) => one.id)).toEqual([1n, 2n])
    expect((client.asked[1] as { offset: number }).offset).toBe(3)
  })

  it('stops at the complete form rather than asking again', async () => {
    const client = fake([{ _: 'photos.photos', photos: [photo(1n)], users: [] }], USER)

    expect(await drain(walkProfilePhotos(client, 'someone'))).toHaveLength(1)
    expect(client.asked).toHaveLength(1)
  })

  it('refuses a peer that is not a user', async () => {
    const client = fake([], CHANNEL)

    await expect(drain(walkProfilePhotos(client, 'channel'))).rejects.toThrow(
      /only a user has a list of profile photos/,
    )
    expect(client.asked).toEqual([])
  })
})

describe('walking the topics of a forum', () => {
  it('continues from the last topic’s newest message when ordered by activity', async () => {
    const client = fake([
      {
        _: 'messages.forumTopics',
        count: 3,
        topics: [topic(10, 100), topic(20, 200)],
        messages: [message(100, 1_700_000_100), message(200, 1_700_000_200)],
        chats: [],
        users: [],
        pts: 1,
      },
      {
        _: 'messages.forumTopics',
        count: 3,
        topics: [],
        messages: [],
        chats: [],
        users: [],
        pts: 1,
      },
    ])

    const seen = await drain(walkForumTopics(client, 'forum'))

    expect(seen.map((one) => one.id)).toEqual([10, 20])
    // Three fields, all from the last topic of the page: its newest message's
    // date, that message's number, and the topic's own number.
    expect(client.asked[1]).toMatchObject({
      offset_date: 1_700_000_200,
      offset_id: 200,
      offset_topic: 20,
    })
  })

  it('continues from the topic’s own date when ordered by creation', async () => {
    // Which date applies is in the answer rather than in the request, so a walk
    // that always read the message would page a create-ordered forum wrongly.
    const client = fake([
      {
        _: 'messages.forumTopics',
        order_by_create_date: true,
        count: 3,
        topics: [topic(10, 100, 1_700_000_010)],
        messages: [message(100, 1_700_000_100)],
        chats: [],
        users: [],
        pts: 1,
      },
      {
        _: 'messages.forumTopics',
        order_by_create_date: true,
        count: 3,
        topics: [],
        messages: [],
        chats: [],
        users: [],
        pts: 1,
      },
    ])

    await drain(walkForumTopics(client, 'forum'))

    expect(client.asked[1]).toMatchObject({ offset_date: 1_700_000_010 })
  })

  it('stops where the last topic of a page was deleted', async () => {
    // The deleted form carries a number and nothing else, so there is nothing
    // to continue from. It is still yielded: it is part of the page.
    const client = fake([
      {
        _: 'messages.forumTopics',
        count: 2,
        topics: [topic(10, 100), { _: 'forumTopicDeleted', id: 11 }],
        messages: [message(100, 1_700_000_100)],
        chats: [],
        users: [],
        pts: 1,
      },
    ])

    const seen = await drain(walkForumTopics(client, 'forum'))

    expect(seen.map((one) => one.id)).toEqual([10, 11])
    expect(seen[1]?.isDeleted).toBe(true)
    expect(client.asked).toHaveLength(1)
  })

  it('stops where the cursor did not move', async () => {
    // A forum that keeps returning its last topic would otherwise be walked
    // forever. The script holds two answers, so a third request fails here.
    const page = {
      _: 'messages.forumTopics',
      count: 1,
      topics: [topic(10, 100)],
      messages: [message(100, 1_700_000_100)],
      chats: [],
      users: [],
      pts: 1,
    }
    const client = fake([page, page])

    const seen = await drain(walkForumTopics(client, 'forum'))

    expect(seen.map((one) => one.id)).toEqual([10, 10])
    expect(client.asked).toHaveLength(2)
  })
})

describe('walking the invite links of a conversation', () => {
  it('asks about this account unless another is named', async () => {
    const client = fake([{ _: 'messages.exportedChatInvites', count: 0, invites: [], users: [] }])

    await drain(walkInviteLinks(client, 'chat'))

    expect(client.asked[0]).toMatchObject({ admin_id: { _: 'inputUserSelf' } })
    // Nothing to continue from on a first request.
    expect(client.asked[0]).not.toHaveProperty('offset_link')
  })

  it('continues from the date and the text of the last link', async () => {
    const client = fake([
      {
        _: 'messages.exportedChatInvites',
        count: 3,
        invites: [link('a', 100), link('b', 200)],
        users: [],
      },
      { _: 'messages.exportedChatInvites', count: 3, invites: [], users: [] },
    ])

    const seen = await drain(walkInviteLinks(client, 'chat'))

    expect(seen.map((one) => one.link)).toEqual(['a', 'b'])
    expect(client.asked[1]).toMatchObject({ offset_date: 200, offset_link: 'b' })
  })

  it('stops where the last entry of a page is not a link', async () => {
    // The other constructor reports pending requests to a public conversation.
    // There is no link on it, so there is nowhere to continue from.
    const client = fake([
      {
        _: 'messages.exportedChatInvites',
        count: 2,
        invites: [link('a', 100), { _: 'chatInvitePublicJoinRequests' }],
        users: [],
      },
    ])

    const seen = await drain(walkInviteLinks(client, 'chat'))

    expect(seen).toHaveLength(2)
    expect(seen[1]?.isLink).toBe(false)
    expect(seen[1]?.link).toBeUndefined()
    expect(client.asked).toHaveLength(1)
  })

  it('refuses to ask about a conversation as though it created links', async () => {
    const client = fake([], CHANNEL)

    await expect(drain(walkInviteLinks(client, 'chat', { createdBy: 'channel' }))).rejects.toThrow(
      /created by a user/,
    )
  })
})

describe('walking the accounts that joined through a link', () => {
  it('continues from the last entry, named with the hash the answer carried', async () => {
    // The page carries the users it describes, so paging past one costs no
    // request of its own.
    const client = fake([
      {
        _: 'messages.chatInviteImporters',
        count: 3,
        importers: [importer(1n, 100), importer(2n, 200)],
        users: [
          { _: 'user', id: 1n, access_hash: 11n },
          { _: 'user', id: 2n, access_hash: 22n },
        ],
      },
      { _: 'messages.chatInviteImporters', count: 3, importers: [], users: [] },
    ])

    const seen = await drain(walkInviteMembers(client, 'chat'))

    expect(seen.map((one) => one.userId)).toEqual([1n, 2n])
    expect(client.asked[1]).toMatchObject({
      offset_date: 200,
      offset_user: { _: 'inputUser', user_id: 2n, access_hash: 22n },
    })
    // Only the peer was resolved: the users came out of the answer.
    expect(client.resolved).toHaveLength(1)
  })

  it('starts from the empty user rather than from anybody', async () => {
    const client = fake([{ _: 'messages.chatInviteImporters', count: 0, importers: [], users: [] }])

    await drain(walkInviteMembers(client, 'chat'))

    expect(client.asked[0]).toMatchObject({
      offset_date: 0,
      offset_user: { _: 'inputUserEmpty' },
    })
  })

  it('stops where the answer did not describe the account it ends with', async () => {
    // Continuing with a reference that names no hash is a request the server
    // refuses, so the walk ends instead of making it.
    const client = fake([
      {
        _: 'messages.chatInviteImporters',
        count: 3,
        importers: [importer(1n, 100)],
        users: [],
      },
    ])

    expect(await drain(walkInviteMembers(client, 'chat'))).toHaveLength(1)
    expect(client.asked).toHaveLength(1)
  })

  it('asks for those waiting when a name is being searched for', async () => {
    const client = fake([{ _: 'messages.chatInviteImporters', count: 0, importers: [], users: [] }])

    await drain(walkInviteMembers(client, 'chat', { query: 'ann' }))

    expect(client.asked[0]).toMatchObject({ q: 'ann', requested: true })
  })
})

describe('walking the stories on a profile', () => {
  it('asks for what sits before the oldest of the last page', async () => {
    const client = fake([
      { _: 'stories.stories', count: 3, stories: [story(30), story(20)], chats: [], users: [] },
      { _: 'stories.stories', count: 3, stories: [story(10)], chats: [], users: [] },
      { _: 'stories.stories', count: 3, stories: [], chats: [], users: [] },
    ])

    const seen = await drain(walkProfileStories(client, 'someone'))

    expect(seen.map((one) => one.id)).toEqual([30, 20, 10])
    expect((client.asked[0] as { offset_id: number }).offset_id).toBe(0)
    expect((client.asked[1] as { offset_id: number }).offset_id).toBe(20)
    expect((client.asked[2] as { offset_id: number }).offset_id).toBe(10)
  })

  it('stops where a page did not reach further back', async () => {
    const page = {
      _: 'stories.stories',
      count: 1,
      stories: [story(10)],
      chats: [],
      users: [],
    }
    const client = fake([page, page])

    await drain(walkProfileStories(client, 'someone'))

    expect(client.asked).toHaveLength(2)
  })

  it('asks the archive for an account’s own hidden stories', async () => {
    const client = fake([{ _: 'stories.stories', count: 0, stories: [], chats: [], users: [] }])

    await drain(walkProfileStories(client, 'me', { archived: true }))

    expect(client.asked).toHaveLength(1)
  })
})

describe('walking the stories of everybody this account follows', () => {
  it('sends the state back with the flag that says it is a continuation', async () => {
    // The same field means "what I had last time" on a first request and
    // "carry on from here" afterwards; the flag is what separates them.
    const client = fake([
      {
        _: 'stories.allStories',
        has_more: true,
        count: 2,
        state: 'state-1',
        peer_stories: [peerStories(1n)],
        chats: [],
        users: [],
        stealth_mode: { _: 'storiesStealthMode' },
      },
      {
        _: 'stories.allStories',
        count: 2,
        state: 'state-2',
        peer_stories: [peerStories(2n)],
        chats: [],
        users: [],
        stealth_mode: { _: 'storiesStealthMode' },
      },
    ])

    const seen = await drain(walkAllStories(client))

    expect(seen.map((one) => one.peer?.id)).toEqual([1n, 2n])
    expect(client.asked[0]).not.toHaveProperty('next')
    expect(client.asked[1]).toMatchObject({ state: 'state-1', next: true })
  })

  it('stops where the server says there is no more, cursor or not', async () => {
    // A last page carries a state as well, so a walk that stopped at a missing
    // cursor would ask for the list again from where it ended.
    const client = fake([
      {
        _: 'stories.allStories',
        count: 1,
        state: 'state-1',
        peer_stories: [peerStories(1n)],
        chats: [],
        users: [],
        stealth_mode: { _: 'storiesStealthMode' },
      },
    ])

    expect(await drain(walkAllStories(client))).toHaveLength(1)
    expect(client.asked).toHaveLength(1)
  })

  it('stops on an answer saying nothing has changed', async () => {
    const client = fake([
      {
        _: 'stories.allStoriesNotModified',
        state: 'state-1',
        stealth_mode: { _: 'storiesStealthMode' },
      },
    ])

    expect(await drain(walkAllStories(client))).toEqual([])
  })

  it('counts the accounts rather than their stories', async () => {
    const client = fake([
      {
        _: 'stories.allStories',
        has_more: true,
        count: 9,
        state: 'state-1',
        peer_stories: [peerStories(1n), peerStories(2n), peerStories(3n)],
        chats: [],
        users: [],
        stealth_mode: { _: 'storiesStealthMode' },
      },
    ])

    const seen = await drain(walkAllStories(client, { limit: 2 }))

    expect(seen).toHaveLength(2)
    expect(client.asked).toHaveLength(1)
  })
})

describe('walking a channel’s administration log', () => {
  it('asks for what sits before the oldest entry of the last page', async () => {
    const client = fake(
      [
        { _: 'channels.adminLogResults', events: [event(30n), event(20n)], chats: [], users: [] },
        { _: 'channels.adminLogResults', events: [event(10n)], chats: [], users: [] },
        { _: 'channels.adminLogResults', events: [], chats: [], users: [] },
      ],
      CHANNEL,
    )

    const seen = await drain(walkChatEvents(client, 'channel'))

    expect(seen.map((one) => one.id)).toEqual([30n, 20n, 10n])
    expect((client.asked[0] as { max_id: bigint }).max_id).toBe(0n)
    expect((client.asked[1] as { max_id: bigint }).max_id).toBe(20n)
    expect((client.asked[2] as { max_id: bigint }).max_id).toBe(10n)
  })

  it('keeps the cursor a 64-bit integer', async () => {
    // A channel's log outgrows what a number holds exactly, and a cursor that
    // lost precision would page in circles.
    const huge = 9_007_199_254_740_993n
    const client = fake(
      [
        { _: 'channels.adminLogResults', events: [event(huge)], chats: [], users: [] },
        { _: 'channels.adminLogResults', events: [], chats: [], users: [] },
      ],
      CHANNEL,
    )

    await drain(walkChatEvents(client, 'channel'))

    expect((client.asked[1] as { max_id: bigint }).max_id).toBe(huge)
  })

  it('stops where a page did not reach further back', async () => {
    const page = { _: 'channels.adminLogResults', events: [event(10n)], chats: [], users: [] }
    const client = fake([page, page], CHANNEL)

    await drain(walkChatEvents(client, 'channel'))

    expect(client.asked).toHaveLength(2)
  })

  it('names the action without its prefix', async () => {
    const client = fake(
      [
        { _: 'channels.adminLogResults', events: [event(1n)], chats: [], users: [] },
        { _: 'channels.adminLogResults', events: [], chats: [], users: [] },
      ],
      CHANNEL,
    )

    const seen = await drain(walkChatEvents(client, 'channel'))

    expect(seen[0]?.kind).toBe('changeTitle')
    expect(seen[0]?.action._).toBe('channelAdminLogEventActionChangeTitle')
  })

  it('carries the filters a caller asked for', async () => {
    const filter = { _: 'channelAdminLogEventsFilter' as const, ban: true as const }
    const client = fake(
      [{ _: 'channels.adminLogResults', events: [], chats: [], users: [] }],
      CHANNEL,
    )

    await drain(walkChatEvents(client, 'channel', { filter, query: 'spam' }))

    expect(client.asked[0]).toMatchObject({ events_filter: filter, q: 'spam' })
  })

  it('refuses an administrator filter that does not name a user', async () => {
    // Everything here resolves to a channel, which is what the log belongs to
    // and what an administrator cannot be.
    const client = fake(
      [{ _: 'channels.adminLogResults', events: [], chats: [], users: [] }],
      CHANNEL,
    )

    await expect(drain(walkChatEvents(client, 'channel', { by: ['someone'] }))).rejects.toThrow(
      /an administrator is a user/,
    )
    // Refused before anything travelled.
    expect(client.asked).toEqual([])
  })

  it('refuses a peer that keeps no log', async () => {
    const client = fake([], USER)

    await expect(drain(walkChatEvents(client, 'someone'))).rejects.toThrow(
      /only a channel or supergroup keeps an administration log/,
    )
    expect(client.asked).toEqual([])
  })
})

describe('walking the posts carrying a hashtag', () => {
  it('continues from the rate, the conversation and the number', async () => {
    const client = fake(
      [
        {
          _: 'messages.messagesSlice',
          count: 3,
          next_rate: 4242,
          messages: [message(1, 1_700_000_001, 10n), message(2, 1_700_000_002, 20n)],
          chats: [],
          users: [],
        },
        { _: 'messages.messages', messages: [], chats: [], users: [] },
      ],
      CHANNEL,
    )

    const seen = await drain(walkHashtagSearch(client, 'telegram'))

    expect(seen.map((one) => one.id)).toEqual([1, 2])
    expect(client.asked[1]).toMatchObject({ offset_rate: 4242, offset_id: 2 })
  })

  it('continues from the last message’s date where a page carries no rate', async () => {
    // Unlike the global search, a page of this one may name no rate without
    // being the last. Telegram expects the date back instead.
    const client = fake(
      [
        {
          _: 'messages.messagesSlice',
          count: 3,
          messages: [message(1, 1_700_000_001, 10n)],
          chats: [],
          users: [],
        },
        { _: 'messages.messagesSlice', count: 3, messages: [], chats: [], users: [] },
      ],
      CHANNEL,
    )

    await drain(walkHashtagSearch(client, 'telegram'))

    expect(client.asked[1]).toMatchObject({ offset_rate: 1_700_000_001, offset_id: 1 })
  })

  it('stops where the cursor did not move', async () => {
    const page = {
      _: 'messages.messagesSlice',
      count: 1,
      next_rate: 7,
      messages: [message(1, 1_700_000_001, 10n)],
      chats: [],
      users: [],
    }
    const client = fake([page, page], CHANNEL)

    const seen = await drain(walkHashtagSearch(client, 'telegram'))

    expect(seen).toHaveLength(2)
    expect(client.asked).toHaveLength(2)
  })

  it('stops on an answer saying nothing has changed', async () => {
    const client = fake([{ _: 'messages.messagesNotModified', count: 0 }], CHANNEL)

    expect(await drain(walkHashtagSearch(client, 'telegram'))).toEqual([])
  })

  it('sends the hashtag rather than a general query', async () => {
    const client = fake([{ _: 'messages.messages', messages: [], chats: [], users: [] }], CHANNEL)

    await drain(walkHashtagSearch(client, 'telegram'))

    expect(client.asked[0]).toMatchObject({ hashtag: 'telegram' })
    expect(client.asked[0]).not.toHaveProperty('query')
  })
})

describe('what every one of these does when a request fails', () => {
  it('lets the failure out of the loop rather than ending the walk quietly', async () => {
    // A walk that swallowed a refusal would look like the end of a list, and a
    // caller counting what it read would believe a short answer.
    const refusing: Paging = {
      api: {
        premium: {
          getBoostsList: () => Promise.reject(new Error('CHAT_ADMIN_REQUIRED')),
        },
      } as unknown as MtprotoApi,
      resolve: () => Promise.resolve(CHANNEL),
    }

    await expect(drain(walkBoosts(refusing, 'channel'))).rejects.toThrow(/CHAT_ADMIN_REQUIRED/)
  })

  it('stops asking as soon as the caller stops reading', async () => {
    // The reason these are generators. A version that gathered pages up front
    // would spend requests a caller had decided against.
    const client = fake([
      {
        _: 'premium.boostsList',
        count: 9,
        boosts: [boost('a'), boost('b')],
        users: [],
        next_offset: 'opaque-1',
      },
    ])

    for await (const one of walkBoosts(client, 'channel')) {
      if (one.id === 'a') break
    }

    expect(client.asked).toHaveLength(1)
  })
})

// --- the shapes the scripts are built from ---------------------------------

const boost = (id: string) => ({
  _: 'boost' as const,
  id,
  date: 1_700_000_000,
  expires: 1_700_100_000,
})

const transaction = (id: string) => ({
  _: 'starsTransaction' as const,
  id,
  stars: { _: 'starsAmount' as const, amount: 10n, nanos: 0 },
  date: 1_700_000_000,
  peer: { _: 'starsTransactionPeerSelf' as const },
})

const gift = (msgId: number) => ({
  _: 'savedStarGift' as const,
  date: 1_700_000_000,
  gift: { _: 'starGift' as const, id: BigInt(msgId) },
  msg_id: msgId,
})

const viewer = (id: bigint) => ({
  _: 'storyView' as const,
  user_id: id,
  date: 1_700_000_000,
})

const photo = (id: bigint) => ({
  _: 'photo' as const,
  id,
  access_hash: 1n,
  file_reference: Uint8Array.of(1),
  date: 1_700_000_000,
  // A size that has to be fetched, which is what makes a photo downloadable:
  // the stripped and inline forms arrive with the message and name no file.
  sizes: [{ _: 'photoSize' as const, type: 'x', w: 800, h: 600, size: 51_200 }],
  dc_id: 2,
})

const story = (id: number) => ({
  _: 'storyItem' as const,
  id,
  date: 1_700_000_000 + id,
  expire_date: 1_700_100_000,
  media: { _: 'messageMediaEmpty' as const },
})

const peerStories = (id: bigint) => ({
  _: 'peerStories' as const,
  peer: { _: 'peerUser' as const, user_id: id },
  stories: [story(1)],
})

const event = (id: bigint) => ({
  _: 'channelAdminLogEvent' as const,
  id,
  date: 1_700_000_000,
  user_id: 5n,
  action: {
    _: 'channelAdminLogEventActionChangeTitle' as const,
    prev_value: 'before',
    new_value: 'after',
  },
})

const topic = (id: number, top: number, date = 1_700_000_000) => ({
  _: 'forumTopic' as const,
  id,
  date,
  peer: { _: 'peerChannel' as const, channel_id: 10n },
  title: `t${String(id)}`,
  icon_color: 0,
  top_message: top,
  read_inbox_max_id: 0,
  read_outbox_max_id: 0,
  unread_count: 0,
  unread_mentions_count: 0,
  unread_reactions_count: 0,
  from_id: { _: 'peerUser' as const, user_id: 5n },
  notify_settings: { _: 'peerNotifySettings' as const },
})

const message = (id: number, date: number, channel = 10n) => ({
  _: 'message' as const,
  id,
  peer_id: { _: 'peerChannel' as const, channel_id: channel },
  message: `m${String(id)}`,
  date,
})

const link = (text: string, date: number) => ({
  _: 'chatInviteExported' as const,
  link: text,
  admin_id: 5n,
  date,
})

const importer = (id: bigint, date: number) => ({
  _: 'chatInviteImporter' as const,
  user_id: id,
  date,
})

describe('what a caller can do with what a walk yielded', () => {
  it('turns a walked photo into a download and into a resend', async () => {
    // The check behind yielding the schema's own record rather than a view. A
    // raw record is only acceptable while it preserves the capability, and for
    // a photo the capability is these two: fetching the bytes, and sending it
    // somewhere else without uploading it again. Both are one call on the
    // record, so the view would have been a second name for them.
    const client = fake(
      [{ _: 'photos.photosSlice', count: 1, photos: [photo(42n)], users: [] }],
      USER,
    )

    const [first] = await drain(walkProfilePhotos(client, 'someone', { limit: 1 }))
    expect(first).toBeDefined()

    const request = photoFile(first as Photo)
    expect(request.dcId).toBe(2)
    expect(request.location).toMatchObject({ _: 'inputPhotoFileLocation', id: 42n })

    const resend = photoMedia(first as Photo)
    expect(resend).toMatchObject({ _: 'inputMediaPhoto' })
    expect((resend as { id: { id: bigint } }).id.id).toBe(42n)
  })

  it('names the peer of a boost in a form the account can resolve', async () => {
    // The other half of the same question. A boost names a user by number, and
    // the answer that carried it carried the user — which an account harvests
    // on the way through, so the number is enough afterwards.
    const client = fake([
      {
        _: 'premium.boostsList',
        count: 1,
        boosts: [{ ...boost('b1'), user_id: 77n }],
        users: [{ _: 'user', id: 77n, access_hash: 9n }],
      },
      { _: 'premium.boostsList', count: 1, boosts: [], users: [] },
    ])

    const [one] = await drain(walkBoosts(client, 'channel'))

    expect(one?.user_id).toBe(77n)
    // Which is the shape `Account.resolve` takes.
    expect({ kind: 'user' as const, id: one?.user_id }).toEqual({ kind: 'user', id: 77n })
  })
})

/**
 * What a caller can do with the three records the walks hand over raw.
 *
 * A photo's capability was checked separately, and checking one record says
 * nothing about the others: each carries a different shape and loses a
 * different thing if it is wrong. The test for each is the same question —
 * can a caller do what the record exists for, without a second lookup.
 */
describe('what a walked boost, transaction and gift are good for', () => {
  it('names a booster in the form the account resolves, and says where it came from', async () => {
    // A boost is a person and an origin. The person is a bare number on the
    // record and the answer that carried it carried the user, which an account
    // harvests — so the number is enough afterwards.
    const client = fake([
      {
        _: 'premium.boostsList',
        count: 3,
        boosts: [
          { _: 'boost', id: 'plain', user_id: 7n, date: 1, expires: 2 },
          { _: 'boost', id: 'gifted', gift: true, user_id: 8n, date: 1, expires: 2 },
          {
            _: 'boost',
            id: 'won',
            giveaway: true,
            user_id: 9n,
            giveaway_msg_id: 55,
            date: 1,
            expires: 2,
          },
        ],
        users: [
          { _: 'user', id: 7n, access_hash: 1n },
          { _: 'user', id: 8n, access_hash: 2n },
          { _: 'user', id: 9n, access_hash: 3n },
        ],
      },
      { _: 'premium.boostsList', count: 3, boosts: [], users: [] },
    ])

    const boosts = await drain(walkBoosts(client, 'channel'))

    expect(boosts.map((one) => one.user_id)).toEqual([7n, 8n, 9n])
    // Where it came from is two flags, both present and both readable.
    expect(boosts.map((one) => one.gift ?? false)).toEqual([false, true, false])
    expect(boosts.map((one) => one.giveaway ?? false)).toEqual([false, false, true])
    // The giveaway names the message it was won in, which is what a caller
    // would follow to show it.
    expect(boosts[2]?.giveaway_msg_id).toBe(55)
  })

  it('carries a transaction’s direction in its amount, and its kind in its flags', async () => {
    // There is no `direction` field: an outgoing transaction is a negative
    // amount. A reader that assumed a flag would call every transaction
    // incoming.
    const client = fake([
      {
        _: 'payments.starsStatus',
        balance: { _: 'starsAmount', amount: 100n, nanos: 0 },
        history: [
          {
            _: 'starsTransaction',
            id: 'in',
            amount: { _: 'starsAmount', amount: 50n, nanos: 0 },
            date: 1,
            peer: { _: 'starsTransactionPeerFragment' },
          },
          {
            _: 'starsTransaction',
            id: 'out',
            refund: true,
            amount: { _: 'starsAmount', amount: -25n, nanos: 0 },
            date: 2,
            peer: { _: 'starsTransactionPeer', peer: { _: 'peerUser', user_id: 7n } },
          },
        ],
        chats: [],
        users: [{ _: 'user', id: 7n, access_hash: 1n }],
      },
      {
        _: 'payments.starsStatus',
        balance: { _: 'starsAmount', amount: 100n, nanos: 0 },
        history: [],
        chats: [],
        users: [],
      },
    ])

    const [incoming, outgoing] = await drain(walkStarsTransactions(client, 'me'))

    expect(incoming?.amount.amount).toBe(50n)
    expect(outgoing?.amount.amount).toBe(-25n)
    expect(outgoing?.refund).toBe(true)
    // The counterparty is a union: only one of its forms names a peer, and a
    // reader that assumed otherwise would read a fragment withdrawal as a
    // person.
    expect(incoming?.peer._).toBe('starsTransactionPeerFragment')
    expect(peerRefOf((outgoing?.peer as { peer?: unknown }).peer)).toEqual({
      kind: 'user',
      id: 7n,
    })
  })

  it('names a gift’s sender as a peer, because it need not be a person', async () => {
    // `from_id` is a peer union. A channel can send a gift, and reading its
    // number as a user id would name a different account entirely.
    const client = fake([
      {
        _: 'payments.savedStarGifts',
        count: 2,
        gifts: [
          {
            _: 'savedStarGift',
            from_id: { _: 'peerChannel', channel_id: 10n },
            date: 1,
            gift: { _: 'starGift', id: 1n },
            msg_id: 5,
          },
          {
            _: 'savedStarGift',
            name_hidden: true,
            date: 2,
            gift: { _: 'starGift', id: 2n },
          },
        ],
        chats: [{ _: 'channel', id: 10n, access_hash: 4n, title: 'a channel' }],
        users: [],
      },
      { _: 'payments.savedStarGifts', count: 2, gifts: [], chats: [], users: [] },
    ])

    const [fromChannel, anonymous] = await drain(walkSavedGifts(client, 'me'))

    expect(peerRefOf(fromChannel?.from_id)).toEqual({ kind: 'channel', id: 10n })
    expect(fromChannel?.msg_id).toBe(5)
    // An anonymous gift names nobody, which is a state rather than a gap: the
    // sender chose it, and a reader has to be able to tell.
    expect(anonymous?.from_id).toBeUndefined()
    expect(anonymous?.name_hidden).toBe(true)
  })
})
