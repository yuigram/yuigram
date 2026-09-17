/**
 * One page of a list, and everything the answer said about the rest of it.
 *
 * Driven by a scripted client that records every request, because what these
 * reads promise is mostly about requests: that a cursor produces exactly the
 * request that continues the list, that a total is the number the answer gave
 * and nothing else, and that a cursor handed to the wrong list is refused
 * before anything is sent.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import {
  allStoriesPage,
  boostsPage,
  CursorError,
  chatEventsPage,
  dialogsPage,
  forumTopicsPage,
  hashtagPage,
  historyPage,
  inviteLinksPage,
  inviteMembersPage,
  membersPage,
  type Paging,
  postSearchPage,
  profilePhotosPage,
  profileStoriesPage,
  reactionsPage,
  savedGiftsPage,
  savedMusicPage,
  searchGlobalPage,
  searchPage,
  similarChannelsPage,
  starsTransactionsPage,
  storyViewersPage,
  walkBoosts,
  walkDialogs,
  walkHistory,
  walkReactions,
} from '../src/paging/walk.js'

const CHANNEL: TypeInputPeer = { _: 'inputPeerChannel', channel_id: 10n, access_hash: 99n }
const GROUP: TypeInputPeer = { _: 'inputPeerChat', chat_id: 3n }
const USER: TypeInputPeer = { _: 'inputPeerUser', user_id: 7n, access_hash: 77n }

/** A message the history and search answers carry. */
const message = (id: number, extra: Record<string, unknown> = {}) => ({
  _: 'message',
  id,
  date: 1_700_000_000 + id,
  peer_id: { _: 'peerChannel', channel_id: 10n },
  message: `m${id}`,
  ...extra,
})

/** The peer fields every list answer carries. */
const peers = { chats: [], users: [] }

/**
 * A client that answers each method from its own script and records requests.
 *
 * Scripts are per method so a case that reads two lists cannot have their
 * answers cross. Asking for more than a script holds fails the case rather than
 * hanging, which is what makes "stops here" assertions meaningful.
 */
function scripted(
  scripts: Record<string, readonly unknown[]>,
  resolveTo: (peer: string | PeerRef) => TypeInputPeer = () => CHANNEL,
) {
  const asked: { method: string; params: Record<string, unknown> }[] = []
  const resolved: (string | PeerRef)[] = []
  const at: Record<string, number> = {}

  const handler =
    (method: string) =>
    (params: Record<string, unknown> = {}) => {
      asked.push({ method, params })
      const script = scripts[method] ?? []
      const index = at[method] ?? 0
      at[method] = index + 1
      const answer = script[index]
      if (answer === undefined)
        throw new Error(`the script for ${method} has no answer ${index + 1}`)

      return Promise.resolve(answer)
    }

  const api = new Proxy(
    {},
    {
      get: (_target, namespace: string) =>
        new Proxy({}, { get: (_inner, name: string) => handler(`${namespace}.${name}`) }),
    },
  ) as MtprotoApi

  const client: Paging & { asked: typeof asked; resolved: typeof resolved } = {
    api,
    asked,
    resolved,
    resolve(peer) {
      resolved.push(peer)

      return Promise.resolve(resolveTo(peer))
    },
  }

  return client
}

const sent = (client: ReturnType<typeof scripted>, index = 0) => client.asked[index]?.params

describe('totals are what the answer said, and only that', () => {
  it('reports a slice count as exact unless the answer flags it inexact', async () => {
    const exact = scripted({
      'messages.getHistory': [
        { _: 'messages.messagesSlice', count: 1873, messages: [message(5)], topics: [], ...peers },
      ],
    })
    expect((await historyPage(exact, '@c')).total).toEqual({ count: 1873, precision: 'exact' })

    const rough = scripted({
      'messages.search': [
        {
          _: 'messages.messagesSlice',
          inexact: true,
          count: 50_000,
          messages: [message(5)],
          topics: [],
          ...peers,
        },
      ],
    })
    expect((await searchPage(rough, '@c', 'x')).total).toEqual({
      count: 50_000,
      precision: 'approximate',
    })
  })

  it('takes the length of a complete answer as exact, on a first request only', async () => {
    // The complete form is the whole list on a first request. The same form
    // answering a continuation is the rest of the list, and its length is not
    // the total — so there it is reported as unknown, not guessed.
    const client = scripted({
      'messages.getHistory': [
        {
          _: 'messages.messagesSlice',
          count: 3,
          messages: [message(3), message(2)],
          topics: [],
          ...peers,
        },
        { _: 'messages.messages', messages: [message(1)], topics: [], ...peers },
      ],
    })

    const first = await historyPage(client, '@c', { size: 2 })
    const second = await historyPage(client, '@c', { cursor: first.next as string, size: 2 })

    expect(second.items.map((m) => m.id)).toEqual([1])
    expect(second.total).toBeUndefined()
    expect(second.next).toBeUndefined()

    const whole = scripted({
      'messages.getHistory': [
        { _: 'messages.messages', messages: [message(2), message(1)], topics: [], ...peers },
      ],
    })
    expect((await historyPage(whole, '@c')).total).toEqual({ count: 2, precision: 'exact' })
  })

  it('reports a count with no precision flag as reported', async () => {
    const client = scripted({
      'channels.getParticipants': [
        {
          _: 'channels.channelParticipants',
          count: 812,
          participants: [{ _: 'channelParticipant', user_id: 1n, date: 0 }],
          ...peers,
        },
      ],
    })

    expect((await membersPage(client, '@c')).total).toEqual({ count: 812, precision: 'reported' })
  })

  it('reports no total where the answer carries no count, never zero', async () => {
    const events = scripted({
      'channels.getAdminLog': [{ _: 'channels.adminLogResults', events: [], ...peers }],
    })
    expect((await chatEventsPage(events, '@c')).total).toBeUndefined()

    const stars = scripted({
      'payments.getStarsTransactions': [
        {
          _: 'payments.starsStatus',
          balance: { _: 'starsAmount', amount: 5n, nanos: 0 },
          history: [],
          ...peers,
        },
      ],
    })
    const page = await starsTransactionsPage(stars, 'me')
    expect(page.total).toBeUndefined()
    expect(page.balance).toEqual({ _: 'starsAmount', amount: 5n, nanos: 0 })
  })

  it('never takes a total from a short page', async () => {
    // One item in the answer and a count of 812: the total is 812, not one.
    const client = scripted({
      'premium.getBoostsList': [
        {
          _: 'premium.boostsList',
          count: 812,
          boosts: [{ _: 'boost', id: 'a', date: 0, expires: 0 }],
          next_offset: 'n1',
          ...peers,
        },
      ],
    })

    expect((await boostsPage(client, '@c')).total).toEqual({ count: 812, precision: 'reported' })
  })
})

describe('a cursor continues the list that produced it', () => {
  it('produces exactly the request that continues the list', async () => {
    const client = scripted({
      'messages.getHistory': [
        {
          _: 'messages.messagesSlice',
          count: 4,
          messages: [message(4), message(3)],
          topics: [],
          ...peers,
        },
        {
          _: 'messages.messagesSlice',
          count: 4,
          messages: [message(2), message(1)],
          topics: [],
          ...peers,
        },
      ],
    })

    const first = await historyPage(client, '@c', { size: 2 })
    await historyPage(client, '@c', { cursor: first.next as string, size: 2 })

    expect(sent(client, 0)).toMatchObject({ offset_id: 0, limit: 2 })
    expect(sent(client, 1)).toMatchObject({ offset_id: 3, limit: 2 })
  })

  it('keeps 64-bit positions exact', async () => {
    // An event identifier above 2^53 would round as a number, and a rounded
    // cursor asks for a different stretch of the log.
    const huge = 9_223_372_036_854_775_000n
    const client = scripted({
      'channels.getAdminLog': [
        {
          _: 'channels.adminLogResults',
          events: [
            {
              _: 'channelAdminLogEvent',
              id: huge,
              date: 0,
              user_id: 1n,
              action: {
                _: 'channelAdminLogEventActionChangeTitle',
                prev_value: 'a',
                new_value: 'b',
              },
            },
          ],
          ...peers,
        },
        { _: 'channels.adminLogResults', events: [], ...peers },
      ],
    })

    const first = await chatEventsPage(client, '@c')
    await chatEventsPage(client, '@c', { cursor: first.next as string })

    expect(sent(client, 1)).toMatchObject({ max_id: huge })
  })

  it('keeps a peer in a cursor as a reference and resolves it through the account', async () => {
    // A cursor never carries an access hash: the next page names the peer
    // through the account reading it.
    const client = scripted(
      {
        'messages.searchGlobal': [
          {
            _: 'messages.messagesSlice',
            count: 9,
            next_rate: 55,
            messages: [message(4)],
            topics: [],
            ...peers,
          },
          { _: 'messages.messagesSlice', count: 9, messages: [], topics: [], ...peers },
        ],
      },
      (peer) =>
        typeof peer === 'string'
          ? CHANNEL
          : { _: 'inputPeerChannel', channel_id: peer.id, access_hash: 4242n },
    )

    const first = await searchGlobalPage(client, 'q')
    const decoded = Buffer.from(
      (first.next as string).replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8')
    expect(decoded).not.toContain('4242')
    expect(decoded).not.toContain('99')

    await searchGlobalPage(client, 'q', { cursor: first.next as string })

    expect(client.resolved).toContainEqual({ kind: 'channel', id: 10n })
    expect(sent(client, 1)).toMatchObject({
      offset_rate: 55,
      offset_id: 4,
      offset_peer: { _: 'inputPeerChannel', channel_id: 10n, access_hash: 4242n },
    })
  })

  it('ends where the answer described nowhere further', async () => {
    const client = scripted({
      'messages.getMessageReactionsList': [
        { _: 'messages.messageReactionsList', count: 1, reactions: [], ...peers },
      ],
    })

    expect((await reactionsPage(client, '@c', 5)).next).toBeUndefined()
  })

  it('treats a cursor that would ask for the page just read as the end', async () => {
    const client = scripted({
      'premium.getBoostsList': [
        { _: 'premium.boostsList', count: 5, boosts: [], next_offset: 'same', ...peers },
        { _: 'premium.boostsList', count: 5, boosts: [], next_offset: 'same', ...peers },
      ],
    })

    const first = await boostsPage(client, '@c')
    const second = await boostsPage(client, '@c', { cursor: first.next as string })

    expect(first.next).toBeDefined()
    expect(second.next).toBeUndefined()
  })

  it('continues past an empty page that names a new cursor', async () => {
    // A pause, not an end: the server filtered a stretch out and says where to
    // carry on.
    const client = scripted({
      'premium.getBoostsList': [
        { _: 'premium.boostsList', count: 5, boosts: [], next_offset: 'n1', ...peers },
        {
          _: 'premium.boostsList',
          count: 5,
          boosts: [{ _: 'boost', id: 'b', date: 0, expires: 0 }],
          ...peers,
        },
      ],
    })

    const seen = []
    for await (const boost of walkBoosts(client, '@c')) seen.push(boost.id)

    expect(seen).toEqual(['b'])
    expect(sent(client, 1)).toMatchObject({ offset: 'n1' })
  })

  it('ends at an empty page whose own answer counts nothing', async () => {
    const client = scripted({
      'premium.getBoostsList': [
        { _: 'premium.boostsList', count: 0, boosts: [], next_offset: 'n1', ...peers },
      ],
    })

    expect((await boostsPage(client, '@c')).next).toBeUndefined()
  })

  it('reports overlapping pages as the server sent them, and still moves on', async () => {
    // A live list read by message number can hand the same message back on the
    // next page. No deduplication is claimed; what is guaranteed is that the
    // position moves to the new oldest, so the walk is not caught in a loop.
    const client = scripted({
      'messages.getHistory': [
        {
          _: 'messages.messagesSlice',
          count: 5,
          messages: [message(5), message(4)],
          topics: [],
          ...peers,
        },
        {
          _: 'messages.messagesSlice',
          count: 5,
          messages: [message(4), message(3)],
          topics: [],
          ...peers,
        },
        { _: 'messages.messagesSlice', count: 5, messages: [], topics: [], ...peers },
      ],
    })

    const seen = []
    for await (const m of walkHistory(client, '@c', { pageSize: 2 })) seen.push(m.id)

    expect(seen).toEqual([5, 4, 4, 3])
    expect(sent(client, 2)).toMatchObject({ offset_id: 3 })
  })
})

describe('a cursor handed to the wrong place is refused before anything is sent', () => {
  it('refuses a cursor from a different list', async () => {
    const client = scripted({
      'premium.getBoostsList': [
        { _: 'premium.boostsList', count: 5, boosts: [], next_offset: 'n1', ...peers },
      ],
    })
    const cursor = (await boostsPage(client, '@c')).next as string

    await expect(reactionsPage(client, '@c', 5, { cursor })).rejects.toThrow(CursorError)
    await expect(reactionsPage(client, '@c', 5, { cursor })).rejects.toThrow(
      /continues a boosts list/,
    )
    expect(client.asked.filter((one) => one.method !== 'premium.getBoostsList')).toHaveLength(0)
  })

  it('refuses a cursor from the same list read with different filters', async () => {
    const client = scripted({
      'premium.getBoostsList': [
        { _: 'premium.boostsList', count: 5, boosts: [], next_offset: 'n1', ...peers },
      ],
    })
    const cursor = (await boostsPage(client, '@c', { giftsOnly: true })).next as string

    await expect(boostsPage(client, '@c', { cursor })).rejects.toThrow(/different boosts query/)
    expect(client.asked).toHaveLength(1)
  })

  it('refuses a cursor from the same list of a different conversation', async () => {
    const client = scripted(
      {
        'messages.getHistory': [
          { _: 'messages.messagesSlice', count: 4, messages: [message(4)], topics: [], ...peers },
        ],
      },
      (peer) =>
        peer === '@a' ? CHANNEL : { _: 'inputPeerChannel', channel_id: 11n, access_hash: 1n },
    )
    const cursor = (await historyPage(client, '@a')).next as string

    await expect(historyPage(client, '@b', { cursor })).rejects.toThrow(CursorError)
  })

  it('does not mistake a size or a signal for a different query', async () => {
    // Page size is how much to read, not which list. A cursor stays valid when
    // it changes.
    const client = scripted({
      'premium.getBoostsList': [
        { _: 'premium.boostsList', count: 5, boosts: [], next_offset: 'n1', ...peers },
        { _: 'premium.boostsList', count: 5, boosts: [], ...peers },
      ],
    })
    const cursor = (await boostsPage(client, '@c', { size: 10 })).next as string

    await expect(boostsPage(client, '@c', { cursor, size: 50 })).resolves.toBeDefined()
  })

  it('refuses something that is not a cursor at all', async () => {
    const client = scripted({})

    await expect(boostsPage(client, '@c', { cursor: 'not a cursor!!' })).rejects.toThrow(/not one/)
    await expect(boostsPage(client, '@c', { cursor: 'e30' })).rejects.toThrow(CursorError)
    expect(client.asked).toHaveLength(0)
  })

  it('refuses a cursor from a newer format', async () => {
    const forged = Buffer.from(JSON.stringify({ v: 9, k: 'boosts', f: 'x', o: {} }))
      .toString('base64')
      .replace(/=+$/, '')

    await expect(boostsPage(scripted({}), '@c', { cursor: forged })).rejects.toThrow(/format 9/)
  })

  it('refuses a cursor whose position fields are the wrong shape', async () => {
    // A forged position is refused by its shape rather than sent, which is all
    // a cursor claims: it is not tamper-proof, and does not say it is.
    const client = scripted({
      'messages.getHistory': [
        { _: 'messages.messagesSlice', count: 4, messages: [message(4)], topics: [], ...peers },
      ],
    })
    const real = (await historyPage(client, '@c')).next as string
    const record = JSON.parse(Buffer.from(real, 'base64').toString('utf8'))
    record.o.id = 'four'
    const forged = Buffer.from(JSON.stringify(record)).toString('base64').replace(/=+$/, '')

    await expect(historyPage(client, '@c', { cursor: forged })).rejects.toThrow(
      /'id' is not a whole number/,
    )
  })

  it('is a validation failure, so existing handling of bad input applies', async () => {
    await expect(boostsPage(scripted({}), '@c', { cursor: '!!' })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('refuses a page size that is not a positive whole number', async () => {
    await expect(boostsPage(scripted({}), '@c', { size: 0 })).rejects.toThrow(/page size/)
  })
})

describe('cancellation and stopping early', () => {
  it('makes no request once the signal is aborted', async () => {
    const client = scripted({})
    const controller = new AbortController()
    controller.abort(new Error('gave up'))

    await expect(boostsPage(client, '@c', { signal: controller.signal })).rejects.toThrow('gave up')
    expect(client.asked).toHaveLength(0)
  })

  it('stops a walk between pages when the signal is aborted', async () => {
    const controller = new AbortController()
    const client = scripted({
      'premium.getBoostsList': [
        {
          _: 'premium.boostsList',
          count: 2,
          boosts: [{ _: 'boost', id: 'a', date: 0, expires: 0 }],
          next_offset: 'n1',
          ...peers,
        },
        {
          _: 'premium.boostsList',
          count: 2,
          boosts: [{ _: 'boost', id: 'b', date: 0, expires: 0 }],
          ...peers,
        },
      ],
    })

    const seen: string[] = []
    await expect(async () => {
      for await (const boost of walkBoosts(client, '@c', { signal: controller.signal })) {
        seen.push(boost.id)
        controller.abort(new Error('enough'))
      }
    }).rejects.toThrow('enough')

    expect(seen).toEqual(['a'])
    expect(client.asked).toHaveLength(1)
  })

  it('asks for nothing further once the caller stops iterating', async () => {
    const client = scripted({
      'messages.getMessageReactionsList': [
        {
          _: 'messages.messageReactionsList',
          count: 3,
          reactions: [
            {
              _: 'messagePeerReaction',
              peer_id: { _: 'peerUser', user_id: 1n },
              date: 0,
              reaction: { _: 'reactionEmoji', emoticon: 'x' },
            },
          ],
          next_offset: 'n1',
          ...peers,
        },
      ],
    })

    for await (const _ of walkReactions(client, '@c', 5)) break

    expect(client.asked).toHaveLength(1)
  })

  it('starts a walk from a cursor a page read produced', async () => {
    const client = scripted({
      'messages.getHistory': [
        {
          _: 'messages.messagesSlice',
          count: 4,
          messages: [message(4), message(3)],
          topics: [],
          ...peers,
        },
        {
          _: 'messages.messagesSlice',
          count: 4,
          messages: [message(2), message(1)],
          topics: [],
          ...peers,
        },
        { _: 'messages.messagesSlice', count: 4, messages: [], topics: [], ...peers },
      ],
    })

    const first = await historyPage(client, '@c', { size: 2 })
    const rest = []
    for await (const m of walkHistory(client, '@c', { cursor: first.next as string, pageSize: 2 }))
      rest.push(m.id)

    expect(rest).toEqual([2, 1])
  })
})

describe('what each list carries beside its items', () => {
  it('reads history oldest first when asked, in ascending order', async () => {
    const client = scripted({
      'messages.getHistory': [
        {
          _: 'messages.messagesSlice',
          count: 4,
          messages: [message(2), message(1)],
          topics: [],
          ...peers,
        },
        {
          _: 'messages.messagesSlice',
          count: 4,
          messages: [message(4), message(3)],
          topics: [],
          ...peers,
        },
      ],
    })

    const first = await historyPage(client, '@c', { size: 2, reverse: true })
    expect(first.items.map((m) => m.id)).toEqual([1, 2])
    expect(sent(client, 0)).toMatchObject({ offset_id: 1, add_offset: -2 })

    await historyPage(client, '@c', { size: 2, reverse: true, cursor: first.next as string })
    expect(sent(client, 1)).toMatchObject({ offset_id: 3, add_offset: -2 })
  })

  it('sends history and search bounds', async () => {
    const client = scripted({
      'messages.getHistory': [{ _: 'messages.messages', messages: [], topics: [], ...peers }],
      'messages.search': [{ _: 'messages.messages', messages: [], topics: [], ...peers }],
    })

    await historyPage(client, '@c', { minId: 10, maxId: 90 })
    await searchPage(client, '@c', 'q', { minId: 5, maxId: 6 })

    expect(sent(client, 0)).toMatchObject({ min_id: 10, max_id: 90 })
    expect(sent(client, 1)).toMatchObject({ min_id: 5, max_id: 6 })
  })

  it('narrows a global search to one kind of conversation and one folder', async () => {
    const client = scripted({
      'messages.searchGlobal': [{ _: 'messages.messages', messages: [], topics: [], ...peers }],
    })

    await searchGlobalPage(client, 'q', { only: 'channels', peerFolder: 1 })

    expect(sent(client)).toMatchObject({ broadcasts_only: true, folder_id: 1 })
    expect(sent(client)).not.toHaveProperty('users_only')
  })

  it('reads a basic group’s members out of its full description, with an exact total', async () => {
    const client = scripted(
      {
        'messages.getFullChat': [
          {
            _: 'messages.chatFull',
            full_chat: {
              _: 'chatFull',
              id: 3n,
              participants: {
                _: 'chatParticipants',
                chat_id: 3n,
                version: 1,
                participants: [
                  { _: 'chatParticipantCreator', user_id: 1n },
                  { _: 'chatParticipantAdmin', user_id: 2n, inviter_id: 1n, date: 5 },
                  { _: 'chatParticipant', user_id: 3n, inviter_id: 1n, date: 6 },
                ],
              },
            },
            ...peers,
          },
          'unused',
        ],
      },
      () => GROUP,
    )

    const first = await membersPage(client, '@g', { size: 2 })
    expect(first.items.map((m) => m.standing)).toEqual(['creator', 'administrator'])
    expect(first.items[0]?.inBasicGroup).toBe(true)
    expect(first.total).toEqual({ count: 3, precision: 'exact' })
    expect(first.next).toBeDefined()
  })

  it('refuses member filters for a basic group, which has none', async () => {
    const client = scripted({}, () => GROUP)

    await expect(
      membersPage(client, '@g', { filter: { _: 'channelParticipantsAdmins' } }),
    ).rejects.toThrow(/no member filters/)
  })

  it('reads public post search with its allowance and an agreed spend', async () => {
    const flood = { _: 'searchPostsFlood', total_daily: 10, remains: 0, stars_amount: 5n }
    const client = scripted({
      'channels.searchPosts': [
        {
          _: 'messages.messagesSlice',
          count: 20,
          search_flood: flood,
          messages: [message(1)],
          topics: [],
          ...peers,
        },
      ],
    })

    const page = await postSearchPage(client, 'news', { payStars: 5n })

    expect(sent(client)).toMatchObject({ query: 'news', allow_paid_stars: 5n })
    expect(sent(client)).not.toHaveProperty('hashtag')
    expect(page.searchFlood).toEqual(flood)
  })

  it('searches by hashtag through the same request, named differently', async () => {
    const client = scripted({
      'channels.searchPosts': [{ _: 'messages.messages', messages: [], topics: [], ...peers }],
    })

    await hashtagPage(client, 'telegram')

    expect(sent(client)).toMatchObject({ hashtag: 'telegram' })
    expect(sent(client)).not.toHaveProperty('query')
  })

  it('carries a forum’s ordering and position', async () => {
    const client = scripted({
      'messages.getForumTopics': [
        {
          _: 'messages.forumTopics',
          order_by_create_date: true,
          count: 7,
          topics: [],
          messages: [],
          pts: 41,
          ...peers,
        },
      ],
    })

    const page = await forumTopicsPage(client, '@f')
    expect(page).toMatchObject({
      orderedByCreation: true,
      pts: 41,
      total: { count: 7, precision: 'reported' },
    })
  })

  it('carries the pinned-to-top list with profile stories', async () => {
    const client = scripted({
      'stories.getPinnedStories': [
        { _: 'stories.stories', count: 3, stories: [], pinned_to_top: [9, 8], ...peers },
      ],
    })

    expect((await profileStoriesPage(client, '@u')).pinnedToTop).toEqual([9, 8])
  })

  it('carries stealth mode with all stories, and continues only while the answer says there is more', async () => {
    const stealth = { _: 'storiesStealthMode', active_until_date: 99 }
    const client = scripted({
      'stories.getAllStories': [
        {
          _: 'stories.allStories',
          has_more: true,
          count: 4,
          state: 's1',
          peer_stories: [],
          stealth_mode: stealth,
          ...peers,
        },
        {
          _: 'stories.allStories',
          count: 4,
          state: 's2',
          peer_stories: [],
          stealth_mode: stealth,
          ...peers,
        },
      ],
    })

    const first = await allStoriesPage(client)
    const second = await allStoriesPage(client, { cursor: first.next as string })

    expect(first.stealthMode).toEqual(stealth)
    expect(sent(client, 1)).toMatchObject({ state: 's1', next: true })
    // The last page carries a state too; continuing from it would start over.
    expect(second.next).toBeUndefined()
  })

  it('carries a story’s view, forward and reaction counts, and orders by forwards', async () => {
    const client = scripted({
      'stories.getStoryViewsList': [
        {
          _: 'stories.storyViewsList',
          count: 30,
          views_count: 30,
          forwards_count: 4,
          reactions_count: 9,
          views: [],
          ...peers,
        },
      ],
    })

    const page = await storyViewersPage(client, 'me', 7, { forwardsFirst: true })

    expect(page.counts).toEqual({ views: 30, forwards: 4, reactions: 9 })
    expect(sent(client)).toMatchObject({ forwards_first: true })
    expect(sent(client)).not.toHaveProperty('reactions_first')
    await expect(
      storyViewersPage(client, 'me', 7, { forwardsFirst: true, reactionsFirst: true }),
    ).rejects.toThrow(/not both/)
  })

  it('sends every gift filter the schema has, as true-or-absent flags', async () => {
    const client = scripted({
      'payments.getSavedStarGifts': [
        {
          _: 'payments.savedStarGifts',
          count: 2,
          gifts: [],
          chat_notifications_enabled: false,
          ...peers,
        },
      ],
    })

    const page = await savedGiftsPage(client, '@c', {
      excludeUnlimited: true,
      excludeUnique: true,
      excludeUpgradable: true,
      excludeUnupgradable: false,
      excludeHosted: true,
      peerColorAvailable: true,
      collectionId: 3,
    })

    expect(sent(client)).toMatchObject({
      exclude_unlimited: true,
      exclude_unique: true,
      exclude_upgradable: true,
      exclude_hosted: true,
      peer_color_available: true,
      collection_id: 3,
    })
    expect(sent(client)).not.toHaveProperty('exclude_unupgradable')
    // `false` is an answer, distinct from the field being absent.
    expect(page.notificationsEnabled).toBe(false)
  })

  it('reads TON transactions when asked', async () => {
    const client = scripted({
      'payments.getStarsTransactions': [
        {
          _: 'payments.starsStatus',
          balance: { _: 'starsAmount', amount: 0n, nanos: 0 },
          history: [],
          ...peers,
        },
      ],
    })

    await starsTransactionsPage(client, 'me', { ton: true })

    expect(sent(client)).toMatchObject({ ton: true })
  })

  it('reads the conversation list from one peer folder', async () => {
    const client = scripted({
      'messages.getDialogs': [
        { _: 'messages.dialogsSlice', count: 40, dialogs: [], messages: [], ...peers },
      ],
    })

    const page = await dialogsPage(client, { archived: 'only', pinned: 'exclude' })

    expect(sent(client)).toMatchObject({ folder_id: 1, exclude_pinned: true })
    expect(page.total).toEqual({ count: 40, precision: 'reported' })
  })

  it('reads the music on a profile with its total, and ends once all of it is read', async () => {
    const client = scripted(
      {
        'users.getSavedMusic': [
          {
            _: 'users.savedMusic',
            count: 3,
            documents: [
              { _: 'document', id: 1n },
              { _: 'document', id: 2n },
            ],
          },
          { _: 'users.savedMusic', count: 3, documents: [{ _: 'document', id: 3n }] },
        ],
      },
      () => USER,
    )

    const first = await savedMusicPage(client, '@u', { size: 2 })
    const second = await savedMusicPage(client, '@u', { cursor: first.next as string, size: 2 })

    expect(first.total).toEqual({ count: 3, precision: 'reported' })
    expect(sent(client, 1)).toMatchObject({ offset: 2 })
    expect(second.next).toBeUndefined()
  })

  it('reads recommended channels with the count Telegram gave, not the length of the list', async () => {
    const client = scripted({
      'channels.getChannelRecommendations': [
        {
          _: 'messages.chatsSlice',
          count: 60,
          chats: [{ _: 'channel', id: 1n, title: 'a', date: 0, access_hash: 1n }],
        },
      ],
    })

    const page = await similarChannelsPage(client, '@c')

    expect(page.items).toHaveLength(1)
    expect(page.total).toEqual({ count: 60, precision: 'reported' })
    expect(page.next).toBeUndefined()
  })

  it('counts a hidden profile photo toward the next position without handing it over', async () => {
    const client = scripted(
      {
        'photos.getUserPhotos': [
          {
            _: 'photos.photosSlice',
            count: 5,
            photos: [
              { _: 'photo', id: 1n },
              { _: 'photoEmpty', id: 2n },
            ],
            ...peers,
          },
          { _: 'photos.photosSlice', count: 5, photos: [], ...peers },
        ],
      },
      () => USER,
    )

    const first = await profilePhotosPage(client, '@u')
    await profilePhotosPage(client, '@u', { cursor: first.next as string })

    expect(first.items).toHaveLength(1)
    expect(sent(client, 1)).toMatchObject({ offset: 2 })
  })

  it('continues invite links from the last link’s date and text', async () => {
    const client = scripted(
      {
        'messages.getExportedChatInvites': [
          {
            _: 'messages.exportedChatInvites',
            count: 9,
            invites: [
              { _: 'chatInviteExported', link: 'https://t.me/+abc', date: 77, admin_id: 1n },
            ],
            ...peers,
          },
          { _: 'messages.exportedChatInvites', count: 9, invites: [], ...peers },
        ],
      },
      () => CHANNEL,
    )

    const first = await inviteLinksPage(client, '@c')
    await inviteLinksPage(client, '@c', { cursor: first.next as string })

    expect(sent(client, 1)).toMatchObject({ offset_date: 77, offset_link: 'https://t.me/+abc' })
  })

  it('refuses to continue invite members from somebody the account names as someone else', async () => {
    const client = scripted(
      {
        'messages.getChatInviteImporters': [
          {
            _: 'messages.chatInviteImporters',
            count: 3,
            importers: [{ _: 'chatInviteImporter', user_id: 5n, date: 1 }],
            ...peers,
          },
        ],
      },
      (peer) => (typeof peer === 'string' ? CHANNEL : USER),
    )

    const first = await inviteMembersPage(client, '@c')

    await expect(
      inviteMembersPage(client, '@c', { cursor: first.next as string }),
    ).rejects.toBeInstanceOf(PeerError)
  })
})

describe('where a message list begins', () => {
  it('starts history at a message and a date, shifting only the first window', async () => {
    const client = scripted({
      'messages.getHistory': [
        {
          _: 'messages.messagesSlice',
          count: 900,
          messages: [message(520), message(510)],
          topics: [],
          ...peers,
        },
        { _: 'messages.messagesSlice', count: 900, messages: [message(500)], topics: [], ...peers },
      ],
    })

    const first = await historyPage(client, '@c', {
      startId: 500,
      startDate: 1_700_000_000,
      shift: -20,
      size: 20,
    })
    await historyPage(client, '@c', {
      cursor: first.next as string,
      startId: 500,
      shift: -20,
      size: 20,
    })

    expect(sent(client, 0)).toMatchObject({
      offset_id: 500,
      offset_date: 1_700_000_000,
      add_offset: -20,
    })
    // A cursor says where to go; the start and the shift belong to the first page.
    expect(sent(client, 1)).toMatchObject({ offset_id: 510, offset_date: 0, add_offset: 0 })
  })

  it('does not treat a different start as a different list', async () => {
    const client = scripted({
      'messages.search': [
        { _: 'messages.messagesSlice', count: 9, messages: [message(9)], topics: [], ...peers },
        { _: 'messages.messagesSlice', count: 9, messages: [], topics: [], ...peers },
      ],
    })

    const first = await searchPage(client, '@c', 'q', { startId: 50, shift: 3 })
    await expect(
      searchPage(client, '@c', 'q', { cursor: first.next as string }),
    ).resolves.toBeDefined()
    expect(sent(client, 0)).toMatchObject({ offset_id: 50, add_offset: 3 })
  })
})

describe('the conversations a chat folder holds', () => {
  /** A conversation-list row. */
  const row = (peer: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    _: 'dialog',
    peer,
    top_message: 1,
    read_inbox_max_id: 0,
    read_outbox_max_id: 0,
    unread_count: 0,
    unread_mentions_count: 0,
    unread_reactions_count: 0,
    notify_settings: { _: 'peerNotifySettings' },
    ...extra,
  })
  const user = (id: bigint, extra: Record<string, unknown> = {}) => ({
    _: 'user',
    id,
    access_hash: 1n,
    ...extra,
  })
  const group = (id: bigint) => ({
    _: 'chat',
    id,
    title: 'g',
    participants_count: 2,
    date: 0,
    version: 1,
  })
  const channel = (id: bigint, extra: Record<string, unknown> = {}) => ({
    _: 'channel',
    id,
    title: 'c',
    date: 0,
    access_hash: 1n,
    ...extra,
  })
  const state = { _: 'updates.state', pts: 0, qts: 0, date: 0, seq: 0, unread_count: 0 }

  const folder = (extra: Record<string, unknown>) => ({
    _: 'dialogFilter' as const,
    id: 5,
    title: { _: 'textWithEntities' as const, text: 'Work', entities: [] },
    pinned_peers: [],
    include_peers: [],
    exclude_peers: [],
    ...extra,
  })

  const drain = async <T>(walk: AsyncGenerator<T, void, undefined>) => {
    const out: T[] = []
    for await (const item of walk) out.push(item)

    return out
  }

  it('reads pinned conversations first, then the list with the rules applied', async () => {
    const client = scripted({
      'messages.getPeerDialogs': [
        {
          _: 'messages.peerDialogs',
          dialogs: [row({ _: 'peerUser', user_id: 9n })],
          messages: [],
          state,
          ...peers,
        },
      ],
      'messages.getDialogs': [
        {
          _: 'messages.dialogs',
          dialogs: [
            row({ _: 'peerUser', user_id: 9n }),
            row({ _: 'peerUser', user_id: 1n }),
            row({ _: 'peerUser', user_id: 2n }),
            row({ _: 'peerUser', user_id: 3n }),
            row({ _: 'peerChat', chat_id: 4n }),
            row({ _: 'peerChannel', channel_id: 5n }),
          ],
          messages: [],
          chats: [group(4n), channel(5n, { broadcast: true })],
          users: [
            user(9n, { contact: true }),
            user(1n, { contact: true }),
            user(2n),
            user(3n, { bot: true }),
          ],
        },
      ],
    })

    const rule = folder({
      contacts: true,
      groups: true,
      pinned_peers: [{ _: 'inputPeerUser', user_id: 9n, access_hash: 1n }],
    })
    const seen = await drain(walkDialogs(client, { folder: rule }))

    // The pinned contact first and once; then the contact and the group. The
    // non-contact, the bot and the broadcast channel match no rule of the folder.
    expect(seen.map((d) => d.peer?.id)).toEqual([9n, 1n, 4n])
    expect(seen[0]?.isPinned).toBe(true)
  })

  it('matches a bot only as a bot, and this account as a contact', async () => {
    const client = scripted({
      'messages.getDialogs': [
        {
          _: 'messages.dialogs',
          dialogs: [row({ _: 'peerUser', user_id: 3n }), row({ _: 'peerUser', user_id: 8n })],
          messages: [],
          chats: [],
          users: [user(3n, { bot: true }), user(8n, { self: true })],
        },
      ],
    })

    const seen = await drain(
      walkDialogs(client, { folder: folder({ non_contacts: true, contacts: true }) }),
    )

    expect(seen.map((d) => d.peer?.id)).toEqual([8n])
  })

  it('lets an always-included conversation past every exclusion, and a never-included one past none', async () => {
    const now = Math.floor(Date.now() / 1000)
    const client = scripted({
      'messages.getDialogs': [
        {
          _: 'messages.dialogs',
          dialogs: [
            row(
              { _: 'peerUser', user_id: 1n },
              { notify_settings: { _: 'peerNotifySettings', mute_until: now + 999 } },
            ),
            row({ _: 'peerUser', user_id: 2n }, { unread_count: 3 }),
            row({ _: 'peerUser', user_id: 3n }, { unread_count: 3 }),
            row({ _: 'peerUser', user_id: 4n }),
          ],
          messages: [],
          chats: [],
          users: [1n, 2n, 3n, 4n].map((id) => user(id, { contact: true })),
        },
      ],
    })

    const rule = folder({
      contacts: true,
      exclude_muted: true,
      exclude_read: true,
      include_peers: [{ _: 'inputPeerUser', user_id: 1n, access_hash: 1n }],
      exclude_peers: [{ _: 'inputPeerUser', user_id: 3n, access_hash: 1n }],
    })

    // 1 is muted and read but always included; 2 is unread; 3 is never
    // included; 4 is read and excluded by that.
    expect((await drain(walkDialogs(client, { folder: rule }))).map((d) => d.peer?.id)).toEqual([
      1n,
      2n,
    ])
  })

  it('asks for the main list only when the folder excludes archived conversations', async () => {
    const client = scripted({
      'messages.getDialogs': [{ _: 'messages.dialogs', dialogs: [], messages: [], ...peers }],
    })

    await drain(walkDialogs(client, { folder: folder({ contacts: true, exclude_archived: true }) }))

    expect(sent(client)).toMatchObject({ folder_id: 0 })
  })

  it('reads a shared folder as its fixed list, and refuses a cursor for it', async () => {
    const client = scripted({
      'messages.getPeerDialogs': [
        {
          _: 'messages.peerDialogs',
          dialogs: [row({ _: 'peerChannel', channel_id: 7n })],
          messages: [],
          state,
          ...peers,
        },
      ],
    })
    const shared = {
      _: 'dialogFilterChatlist' as const,
      id: 6,
      title: { _: 'textWithEntities' as const, text: 'Shared', entities: [] },
      pinned_peers: [],
      include_peers: [{ _: 'inputPeerChannel' as const, channel_id: 7n, access_hash: 1n }],
    }

    expect((await drain(walkDialogs(client, { folder: shared }))).map((d) => d.peer?.id)).toEqual([
      7n,
    ])
    expect(client.asked.map((one) => one.method)).toEqual(['messages.getPeerDialogs'])
    await expect(drain(walkDialogs(client, { folder: shared, cursor: 'x' }))).rejects.toThrow(
      /no cursor/,
    )
  })

  it('reads the pinned conversations through the request that lists them', async () => {
    const client = scripted({
      'messages.getPinnedDialogs': [
        {
          _: 'messages.peerDialogs',
          dialogs: [row({ _: 'peerUser', user_id: 1n }, { pinned: true })],
          messages: [],
          state,
          ...peers,
        },
      ],
    })

    const page = await dialogsPage(client, { pinned: 'only', archived: 'only' })

    expect(sent(client)).toEqual({ folder_id: 1 })
    expect(page.total).toEqual({ count: 1, precision: 'exact' })
    expect(page.next).toBeUndefined()
  })
})
