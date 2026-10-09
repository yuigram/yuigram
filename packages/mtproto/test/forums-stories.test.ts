// SPDX-License-Identifier: MPL-2.0

/**
 * Topics in a forum, and stories that expire.
 *
 * Driven by a fake client rather than a connection, which is what the
 * structural contexts are for. What is judged is what travelled and what came
 * back, not only that a function exists:
 *
 * - **which fields were in the request**, because most of these are one call
 *   whose shape a caller never sees, and the difference between hiding a topic
 *   and closing it is entirely in which flag was set;
 * - **what an omitted field did**, because Telegram's flags are true-or-absent
 *   and "leave it alone" and "set it to nothing" are different requests;
 * - **what reached the account**, because these answer with the updates they
 *   caused and dropping them would leave the account unaware of its own change.
 */

import { TelegramError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import type { Foruming } from '../src/forums/topics.js'
import {
  createTopic,
  deleteTopicHistory,
  editTopic,
  fetchTopics,
  GENERAL_TOPIC,
  reorderPinnedTopics,
  setForumSettings,
  setGeneralTopicHidden,
  setTopicClosed,
  setTopicPinned,
} from '../src/forums/topics.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import {
  canPostStory,
  countStoryViews,
  deleteStories,
  editStory,
  fetchStories,
  hideMyViews,
  markStoriesSeen,
  peerStories,
  postStory,
  reactToStory,
  type Storying,
  setPeerStoriesArchived,
  setStoriesPinned,
  storyInteractions,
  storyLink,
} from '../src/stories/stories.js'
import type { TlValue } from '../src/tl/index.js'

const FORUM: TypeInputPeer = { _: 'inputPeerChannel', channel_id: 10n, access_hash: 99n }

/** The empty container that stands in for "the change happened". */
const NOTHING: TlValue = { _: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0 }

/** A container carrying one update, as an answer that says what it did. */
const carrying = (update: TlValue): TlValue => ({
  _: 'updates',
  updates: [update],
  users: [],
  chats: [],
  date: 0,
  seq: 0,
})

/** A story item, as Telegram describes one. */
const storyItem = (id: number, extra: Record<string, unknown> = {}): TlValue => ({
  _: 'storyItem',
  id,
  date: 1_700_000_000,
  expire_date: 1_700_086_400,
  ...extra,
})

/**
 * A client answering from a script, recording what it was asked.
 *
 * Every method is recorded with its name, because which of two calls was chosen
 * is half of what these cases are about.
 */
function fake(answers: readonly unknown[] = []) {
  const asked: { method: string; params: Record<string, unknown> }[] = []
  const fed: TlValue[] = []
  let at = 0

  const named =
    (method: string) =>
    (params: Record<string, unknown> = {}) => {
      asked.push({ method, params })

      const answer = answers[at]
      at += 1

      if (answer === undefined) throw new Error(`no scripted answer for ${method}`)

      return Promise.resolve(answer)
    }

  const api = {
    channels: { toggleForum: named('channels.toggleForum') },
    messages: {
      createForumTopic: named('messages.createForumTopic'),
      editForumTopic: named('messages.editForumTopic'),
      updatePinnedForumTopic: named('messages.updatePinnedForumTopic'),
      reorderPinnedForumTopics: named('messages.reorderPinnedForumTopics'),
      deleteTopicHistory: named('messages.deleteTopicHistory'),
      getForumTopicsByID: named('messages.getForumTopicsByID'),
    },
    stories: {
      sendStory: named('stories.sendStory'),
      editStory: named('stories.editStory'),
      deleteStories: named('stories.deleteStories'),
      togglePinned: named('stories.togglePinned'),
      togglePeerStoriesHidden: named('stories.togglePeerStoriesHidden'),
      sendReaction: named('stories.sendReaction'),
      readStories: named('stories.readStories'),
      incrementStoryViews: named('stories.incrementStoryViews'),
      activateStealthMode: named('stories.activateStealthMode'),
      getStoriesByID: named('stories.getStoriesByID'),
      getPeerStories: named('stories.getPeerStories'),
      getStoriesViews: named('stories.getStoriesViews'),
      exportStoryLink: named('stories.exportStoryLink'),
      canSendStory: named('stories.canSendStory'),
    },
  } as unknown as MtprotoApi

  const client: Foruming &
    Storying & {
      readonly asked: typeof asked
      readonly fed: TlValue[]
    } = {
    api,
    asked,
    fed,
    resolve: () => Promise.resolve(FORUM),
    feed: (value) => {
      fed.push(value)

      return Promise.resolve()
    },
    // Fixed, so a request carrying a deduplication key is comparable between
    // runs. Nothing here is about the key's randomness.
    random: (length: number) => new Uint8Array(length).fill(7),
  }

  return client
}

/** The request one method received. */
const sent = (client: ReturnType<typeof fake>, method: string) =>
  client.asked.find((one) => one.method === method)?.params

describe('opening and changing topics', () => {
  it('creates a topic with a title and a deduplication key', async () => {
    const client = fake([carrying({ _: 'updateNewChannelMessage', message: { _: 'message' } })])

    await createTopic(client, '@forum', { title: 'Releases' })

    expect(sent(client, 'messages.createForumTopic')).toMatchObject({
      peer: FORUM,
      title: 'Releases',
    })
    expect(sent(client, 'messages.createForumTopic')?.['random_id']).toEqual(expect.any(BigInt))
  })

  it('sends a colour icon and an emoji icon in different fields', async () => {
    // Telegram takes them separately, and sending a colour where an emoji
    // belongs is accepted and shows the wrong thing.
    const withColour = fake([NOTHING])
    await createTopic(withColour, '@forum', { title: 'a', icon: { colour: 0x6f_b9_f0 } })
    expect(sent(withColour, 'messages.createForumTopic')).toMatchObject({
      icon_color: 0x6f_b9_f0,
    })
    expect(sent(withColour, 'messages.createForumTopic')).not.toHaveProperty('icon_emoji_id')

    const withEmoji = fake([NOTHING])
    await createTopic(withEmoji, '@forum', { title: 'a', icon: { emoji: 5n } })
    expect(sent(withEmoji, 'messages.createForumTopic')).toMatchObject({ icon_emoji_id: 5n })
    expect(sent(withEmoji, 'messages.createForumTopic')).not.toHaveProperty('icon_color')
  })

  it('posts as another peer when told to', async () => {
    const client = fake([NOTHING])

    await createTopic(client, '@forum', { title: 'a', as: '@channel' })

    expect(sent(client, 'messages.createForumTopic')).toHaveProperty('send_as')
  })

  it('refuses a topic with no title', async () => {
    await expect(createTopic(fake([]), '@forum', { title: '' })).rejects.toThrow(ValidationError)
  })

  it('hands the updates a creation carried to the account', async () => {
    const client = fake([NOTHING])

    await createTopic(client, '@forum', { title: 'a' })

    expect(client.fed).toHaveLength(1)
  })

  it('sends only the fields an edit named', async () => {
    // The whole point of the absent-means-unchanged rule. An edit that renames
    // must not also close, and a request carrying `closed: undefined` would.
    const client = fake([NOTHING])

    await editTopic(client, '@forum', 42, { title: 'renamed' })

    const request = sent(client, 'messages.editForumTopic')
    expect(request).toMatchObject({ topic_id: 42, title: 'renamed' })
    expect(request).not.toHaveProperty('closed')
    expect(request).not.toHaveProperty('hidden')
    expect(request).not.toHaveProperty('icon_emoji_id')
  })

  it('clears a custom emoji with zero rather than by leaving it out', async () => {
    // "No emoji" is a value Telegram has to be told; leaving the field out
    // would keep whatever is there.
    const client = fake([NOTHING])

    await editTopic(client, '@forum', 42, { emoji: null })

    expect(sent(client, 'messages.editForumTopic')).toMatchObject({ icon_emoji_id: 0n })
  })

  it('refuses an edit that changes nothing', async () => {
    await expect(editTopic(fake([]), '@forum', 42, {})).rejects.toThrow(ValidationError)
  })

  it('takes a topic by number or as one already read', async () => {
    const client = fake([NOTHING])

    await setTopicClosed(client, '@forum', { id: 91 } as never, true)

    expect(sent(client, 'messages.editForumTopic')).toMatchObject({ topic_id: 91, closed: true })
  })

  it('hides the General topic by naming topic 1', async () => {
    // The only topic that can be hidden, and it is always number one.
    const client = fake([NOTHING])

    await setGeneralTopicHidden(client, '@forum', true)

    expect(sent(client, 'messages.editForumTopic')).toMatchObject({
      topic_id: GENERAL_TOPIC,
      hidden: true,
    })
  })

  it('pins a topic through the pinning call rather than the edit', async () => {
    // Pinning announces nothing in the conversation, which is why it is a
    // different request and answers with nothing.
    const client = fake([true])

    await setTopicPinned(client, '@forum', 42, true)

    expect(sent(client, 'messages.updatePinnedForumTopic')).toMatchObject({
      topic_id: 42,
      pinned: true,
    })
    expect(client.fed).toHaveLength(0)
  })

  it('sends an order as numbers, and asks before unpinning the rest', async () => {
    const gentle = fake([true])
    await reorderPinnedTopics(gentle, '@forum', [42, 91])
    expect(sent(gentle, 'messages.reorderPinnedForumTopics')).toEqual({
      peer: FORUM,
      order: [42, 91],
    })

    const forceful = fake([true])
    await reorderPinnedTopics(forceful, '@forum', [42], { unpinTheRest: true })
    expect(sent(forceful, 'messages.reorderPinnedForumTopics')).toMatchObject({ force: true })
  })

  it('keeps the account’s place in the stream after deleting a thread', async () => {
    // The answer is a position and a count rather than a container, and an
    // account that ignored it would chase a gap it opened itself. A forum is a
    // channel, so the position is the channel's own: applied to the common
    // sequence it would open a gap there instead.
    const client = fake([{ _: 'messages.affectedHistory', pts: 40, pts_count: 3, offset: 0 }])

    expect(await deleteTopicHistory(client, '@forum', 42)).toBe(3)
    expect(sent(client, 'messages.deleteTopicHistory')).toMatchObject({ top_msg_id: 42 })
    expect(client.fed[0]).toMatchObject({
      _: 'updateShort',
      update: { _: 'updateDeleteChannelMessages', pts: 40, pts_count: 3 },
    })
  })

  it('reads topics positionally, with a gap for one that is gone', async () => {
    const client = fake([
      {
        _: 'messages.forumTopics',
        topics: [{ _: 'forumTopic', id: 91, title: 'b' }],
        messages: [],
        chats: [],
        users: [],
        pts: 1,
        count: 1,
      },
    ])

    const found = await fetchTopics(client, '@forum', [42, 91])

    expect(found[0]).toBeUndefined()
    expect(found[1]?.id).toBe(91)
  })

  it('asks nothing for an empty list of topics', async () => {
    const client = fake([])

    expect(await fetchTopics(client, '@forum', [])).toEqual([])
    expect(client.asked).toHaveLength(0)
  })

  it('turns a group into a forum, and always says which layout', async () => {
    // `tabs` is required by the request rather than optional, so something is
    // always sent and the default is the list.
    const client = fake([NOTHING])

    await setForumSettings(client, '@group', { enabled: true })

    expect(sent(client, 'channels.toggleForum')).toMatchObject({ enabled: true, tabs: false })
    expect(client.fed).toHaveLength(1)
  })
})

describe('posting and reading stories', () => {
  const MEDIA = { _: 'inputMediaEmpty' } as never

  it('sends everyone as the audience when none is given', async () => {
    // The field is required, and a story whose audience was never decided
    // should not be posted with the field left out.
    const client = fake([carrying({ _: 'updateStory', story: storyItem(7) })])

    await postStory(client, { media: MEDIA })

    expect(sent(client, 'stories.sendStory')).toMatchObject({
      privacy_rules: [{ _: 'inputPrivacyValueAllowAll' }],
    })
  })

  it('sends the audience it was given', async () => {
    const client = fake([carrying({ _: 'updateStory', story: storyItem(7) })])

    await postStory(client, {
      media: MEDIA,
      audience: [{ _: 'inputPrivacyValueAllowCloseFriends' }],
    })

    expect(sent(client, 'stories.sendStory')).toMatchObject({
      privacy_rules: [{ _: 'inputPrivacyValueAllowCloseFriends' }],
    })
  })

  it('writes flags as true-or-absent rather than as false', async () => {
    const plain = fake([carrying({ _: 'updateStory', story: storyItem(7) })])
    await postStory(plain, { media: MEDIA, pinned: false, protectContent: false })
    expect(sent(plain, 'stories.sendStory')).not.toHaveProperty('pinned')
    expect(sent(plain, 'stories.sendStory')).not.toHaveProperty('noforwards')

    const guarded = fake([carrying({ _: 'updateStory', story: storyItem(7) })])
    await postStory(guarded, { media: MEDIA, pinned: true, protectContent: true })
    expect(sent(guarded, 'stories.sendStory')).toMatchObject({ pinned: true, noforwards: true })
  })

  it('answers with the story the post produced', async () => {
    const client = fake([
      carrying({ _: 'updateStory', story: storyItem(7, { expire_date: 1_700_086_400 }) }),
    ])

    const story = await postStory(client, { media: MEDIA })

    expect(story.id).toBe(7)
    expect(story.expiresAt).toBe(1_700_086_400)
    expect(client.fed).toHaveLength(1)
  })

  it('refuses a post whose answer carried no story', async () => {
    // Assembling one from what was sent would invent its number and its
    // expiry, both of which Telegram decides.
    await expect(postStory(fake([NOTHING]), { media: MEDIA })).rejects.toThrow(
      /answered without the story itself/,
    )
  })

  it('leaves the audience alone on an edit that did not mention it', async () => {
    // Unlike posting. An edit that quietly widened who could see a story would
    // be the worst kind of surprise.
    const client = fake([carrying({ _: 'updateStory', story: storyItem(7) })])

    await editStory(client, 7, { caption: 'hello again' })

    expect(sent(client, 'stories.editStory')).toMatchObject({ id: 7, caption: 'hello again' })
    expect(sent(client, 'stories.editStory')).not.toHaveProperty('privacy_rules')
  })

  it('refuses an edit that changes nothing', async () => {
    await expect(editStory(fake([]), 7, {})).rejects.toThrow(ValidationError)
  })

  it('sends a formatted caption as text and entities', async () => {
    const client = fake([carrying({ _: 'updateStory', story: storyItem(7) })])

    await postStory(client, {
      media: MEDIA,
      caption: { text: 'hi', entities: [{ _: 'messageEntityBold', offset: 0, length: 2 }] },
    })

    expect(sent(client, 'stories.sendStory')).toMatchObject({
      caption: 'hi',
      entities: [{ _: 'messageEntityBold' }],
    })
  })

  it('answers with what was actually deleted, not what was asked for', async () => {
    const client = fake([[7]])

    expect(await deleteStories(client, [7, 8])).toEqual([7])
  })

  it('asks nothing to delete nothing', async () => {
    const client = fake([])

    expect(await deleteStories(client, [])).toEqual([])
    expect(client.asked).toHaveLength(0)
  })

  it('pins and unpins through the same call', async () => {
    const client = fake([[7]])

    await setStoriesPinned(client, [7], true)

    expect(sent(client, 'stories.togglePinned')).toMatchObject({ id: [7], pinned: true })
  })

  it('archives and unarchives a peer’s stories through one flag', async () => {
    const client = fake([true, true])
    await setPeerStoriesArchived(client, '@a', true)
    await setPeerStoriesArchived(client, '@a', false)
    expect(client.asked.map((one) => [one.method, one.params['hidden']])).toEqual([
      ['stories.togglePeerStoriesHidden', true],
      ['stories.togglePeerStoriesHidden', false],
    ])
    expect(client.asked[0]?.params['peer']).toBeDefined()
  })

  it('raises when Telegram declines to archive a peer’s stories', async () => {
    // The call answers a plain boolean, and a false that was ignored would
    // read as success.
    await expect(setPeerStoriesArchived(fake([false]), '@a', true)).rejects.toThrow(ValidationError)
  })

  it('sends an empty reaction to take one back', async () => {
    const taking = fake([NOTHING])
    await reactToStory(taking, '@a', 7, undefined)
    expect(sent(taking, 'stories.sendReaction')).toMatchObject({
      reaction: { _: 'reactionEmpty' },
    })

    const emoji = fake([NOTHING])
    await reactToStory(emoji, '@a', 7, '❤️')
    expect(sent(emoji, 'stories.sendReaction')).toMatchObject({
      reaction: { _: 'reactionEmoji', emoticon: '❤️' },
    })

    const custom = fake([NOTHING])
    await reactToStory(custom, '@a', 7, 5n)
    expect(sent(custom, 'stories.sendReaction')).toMatchObject({
      reaction: { _: 'reactionCustomEmoji', document_id: 5n },
    })
  })

  it('keeps the recently-used list opt-in', async () => {
    const quiet = fake([NOTHING])
    await reactToStory(quiet, '@a', 7, '❤️')
    expect(sent(quiet, 'stories.sendReaction')).not.toHaveProperty('add_to_recent')

    const remembering = fake([NOTHING])
    await reactToStory(remembering, '@a', 7, '❤️', { addToRecent: true })
    expect(sent(remembering, 'stories.sendReaction')).toMatchObject({ add_to_recent: true })
  })

  it('reads up to a horizon rather than story by story', async () => {
    const client = fake([[11, 12]])

    expect(await markStoriesSeen(client, '@a', 12)).toEqual([11, 12])
    expect(sent(client, 'stories.readStories')).toMatchObject({ max_id: 12 })
  })

  it('counts views only when asked to', async () => {
    const client = fake([true])

    await countStoryViews(client, '@a', [11, 12])

    expect(sent(client, 'stories.incrementStoryViews')).toMatchObject({ id: [11, 12] })
  })

  it('turns on both halves of stealth mode unless told otherwise', async () => {
    const both = fake([
      carrying({
        _: 'updateStoriesStealthMode',
        stealth_mode: { _: 'storiesStealthMode', active_until_date: 99 },
      }),
    ])
    const mode = await hideMyViews(both)
    expect(sent(both, 'stories.activateStealthMode')).toEqual({ past: true, future: true })
    expect(mode).toMatchObject({ active_until_date: 99 })

    const forward = fake([
      carrying({ _: 'updateStoriesStealthMode', stealth_mode: { _: 'storiesStealthMode' } }),
    ])
    await hideMyViews(forward, { past: false })
    expect(sent(forward, 'stories.activateStealthMode')).toEqual({ future: true })
  })

  it('refuses a stealth answer that did not say what window it settled on', async () => {
    await expect(hideMyViews(fake([NOTHING]))).rejects.toThrow(/what stealth window/)
  })

  it('reads stories positionally, with a gap for one that has gone', async () => {
    // Telegram answers an expired story as a placeholder naming the number and
    // nothing else, which is an absence rather than a story with no content.
    const client = fake([
      {
        _: 'stories.stories',
        count: 2,
        stories: [storyItem(11), { _: 'storyItemDeleted', id: 12 }],
        chats: [],
        users: [],
      },
    ])

    const found = await fetchStories(client, '@a', [11, 12])

    expect(found[0]?.id).toBe(11)
    expect(found[1]).toBeUndefined()
  })

  it('reads a peer’s current stories and how far they have been read', async () => {
    const client = fake([
      {
        _: 'stories.peerStories',
        stories: {
          _: 'peerStories',
          peer: { _: 'peerUser', user_id: 5n },
          stories: [storyItem(11)],
          max_read_id: 10,
        },
        chats: [],
        users: [],
      },
    ])

    const theirs = await peerStories(client, '@a')

    expect(theirs.stories).toHaveLength(1)
    expect(theirs.readUpTo).toBe(10)
  })

  it('reads interactions positionally', async () => {
    const client = fake([
      {
        _: 'stories.storyViews',
        views: [{ _: 'storyViews', views_count: 3 }],
        users: [],
      },
    ])

    const found = await storyInteractions(client, [11, 12])

    expect(found[0]).toMatchObject({ views_count: 3 })
    expect(found[1]).toBeUndefined()
  })

  it('exports a link to a story', async () => {
    const client = fake([{ _: 'exportedStoryLink', link: 'https://t.me/a/s/7' }])

    expect(await storyLink(client, '@a', 7)).toBe('https://t.me/a/s/7')
  })

  it('answers how many stories are left where posting is allowed', async () => {
    const client = fake([{ _: 'stories.canSendStoryCount', count_remains: 2 }])

    expect(await canPostStory(client, '@a')).toEqual({ allowed: true, remaining: 2 })
  })

  it('tells the two refusals apart, because they need different things', async () => {
    // Not being an administrator is a permission problem. A channel short of
    // boosts is a subscriber problem somebody else can solve.
    const noRights = fake([])
    noRights.api.stories.canSendStory = () => {
      throw new TelegramError('CHAT_ADMIN_REQUIRED (400)')
    }
    expect(await canPostStory(noRights, '@a')).toEqual({
      allowed: false,
      because: 'not-an-admin',
    })

    const noBoosts = fake([])
    noBoosts.api.stories.canSendStory = () => {
      throw new TelegramError('BOOSTS_REQUIRED (400)')
    }
    expect(await canPostStory(noBoosts, '@a')).toEqual({
      allowed: false,
      because: 'needs-boosts',
    })
  })

  it('lets anything else travel, because a wait is not a no', async () => {
    const waiting = fake([])
    waiting.api.stories.canSendStory = () => {
      throw new TelegramError('FLOOD_WAIT_30 (420)')
    }

    await expect(canPostStory(waiting, '@a')).rejects.toThrow(TelegramError)
  })
})
