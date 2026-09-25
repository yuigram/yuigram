/**
 * Reading the people and conversations an answer names, and joining them to
 * what a message says.
 *
 * The cases that matter are the ones where a number is not enough: a user and a
 * group that happen to number the same, a basic group and a channel likewise, a
 * partial record whose access hash does not work, and a reference the answer
 * simply did not describe.
 */

import { describe, expect, it } from 'vitest'
import {
  ChatView,
  PeerIndex,
  readChat,
  readPeers,
  readUser,
  UserView,
} from '../src/entities/peer.js'
import type {
  Channel,
  ChannelForbidden,
  Chat,
  ChatEmpty,
  ChatForbidden,
  User,
  UserEmpty,
} from '../src/generated/api/types/index.js'

const PERSON: User = {
  _: 'user',
  id: 5n,
  access_hash: 900n,
  first_name: 'Ada',
  last_name: 'Lovelace',
  username: 'ada',
  phone: '15551234',
  premium: true,
  contact: true,
  mutual_contact: true,
  lang_code: 'en',
  stories_max_id: { _: 'recentStory', max_id: 12, live: true },
}

const BOT: User = {
  _: 'user',
  id: 6n,
  access_hash: 901n,
  first_name: 'Helper',
  username: 'helper_bot',
  bot: true,
  bot_info_version: 3,
  bot_inline_placeholder: 'Search…',
  bot_chat_history: true,
  bot_active_users: 4200,
}

const NOBODY: UserEmpty = { _: 'userEmpty', id: 7n }

const GROUP: Chat = {
  _: 'chat',
  id: 11n,
  title: 'Basic group',
  photo: { _: 'chatPhotoEmpty' },
  participants_count: 4,
  date: 1_600_000_000,
  version: 9,
  creator: true,
}

const SUPERGROUP: Channel = {
  _: 'channel',
  id: 12n,
  access_hash: 950n,
  title: 'Supergroup',
  photo: { _: 'chatPhotoEmpty' },
  date: 1_600_000_100,
  megagroup: true,
  username: 'the_group',
  forum: true,
  participants_count: 400,
}

const BROADCAST: Channel = {
  _: 'channel',
  id: 13n,
  access_hash: 951n,
  title: 'Channel',
  photo: { _: 'chatPhotoEmpty' },
  date: 1_600_000_200,
  broadcast: true,
  signatures: true,
  verified: true,
  level: 3,
  stories_max_id: { _: 'recentStory', max_id: 40 },
}

describe('a person, read', () => {
  const user = new UserView(PERSON)

  it('answers the questions a name and a handle are', () => {
    expect(user.id).toBe(5n)
    expect(user.firstName).toBe('Ada')
    expect(user.lastName).toBe('Lovelace')
    expect(user.username).toBe('ada')
    expect(user.phone).toBe('15551234')
    expect(user.langCode).toBe('en')
  })

  it('reads the flags as booleans', () => {
    expect(user.isPremium).toBe(true)
    expect(user.isContact).toBe(true)
    expect(user.isMutualContact).toBe(true)
    expect(user.isBot).toBe(false)
    expect(user.isDeleted).toBe(false)
    expect(user.isSelf).toBe(false)
    expect(user.isPartial).toBe(false)
  })

  it('unpacks the recent-story marker rather than handing back the wrapper', () => {
    // The schema wraps this in a structure carrying the newest story and
    // whether one is live, which are two separate questions.
    expect(user.storiesMaxId).toBe(12)
    expect(user.hasLiveStory).toBe(true)
  })

  it('offers itself as a reference, so it can be matched against a message', () => {
    expect(user.ref).toEqual({ kind: 'user', id: 5n })
  })

  it('hands back the value it was given', () => {
    expect(user.raw).toBe(PERSON)
    expect(user.toJSON()).toBe(PERSON)
  })
})

describe('a name to show', () => {
  it('joins both names where there are two', () => {
    expect(new UserView(PERSON).displayName).toBe('Ada Lovelace')
  })

  it('uses whichever exists where there is one', () => {
    // Absent, not present-and-empty: the schema makes these optional, so a
    // record without them omits the field rather than carrying nothing in it.
    const { first_name: _first, ...noFirst } = PERSON
    const { last_name: _last, ...noLast } = PERSON

    expect(new UserView(noLast).displayName).toBe('Ada')
    expect(new UserView(noFirst).displayName).toBe('Lovelace')
  })

  it('falls back to the handle for an account with no name', () => {
    const { first_name: _first, last_name: _last, ...anonymous } = PERSON

    expect(new UserView(anonymous).displayName).toBe('ada')
  })

  it('falls back to the number rather than to an empty string', () => {
    // A caller putting this on screen has nothing of its own to fall back to,
    // so an empty answer would be worse than an unhelpful one.
    expect(new UserView(NOBODY).displayName).toBe('7')
  })
})

describe('a bot, read', () => {
  const bot = new UserView(BOT)

  it('is a bot, and says what the bot is configured to do', () => {
    expect(bot.isBot).toBe(true)
    expect(bot.botInfoVersion).toBe(3)
    expect(bot.botInlinePlaceholder).toBe('Search…')
    expect(bot.botReadsAllGroupMessages).toBe(true)
    expect(bot.botActiveUsers).toBe(4200)
  })

  it('answers no to the bot questions for a person', () => {
    const person = new UserView(PERSON)

    expect(person.botReadsAllGroupMessages).toBe(false)
    expect(person.botInfoVersion).toBeUndefined()
    expect(person.botActiveUsers).toBeUndefined()
  })
})

describe('a person the answer named but did not describe', () => {
  const nobody = new UserView(NOBODY)

  it('has a number and nothing else', () => {
    expect(nobody.isEmpty).toBe(true)
    expect(nobody.id).toBe(7n)
    expect(nobody.firstName).toBeUndefined()
    expect(nobody.username).toBeUndefined()
    expect(nobody.accessHash).toBeUndefined()
  })

  it('answers the flags as no rather than reading a field that is not there', () => {
    expect(nobody.isBot).toBe(false)
    expect(nobody.isPremium).toBe(false)
    expect(nobody.isPartial).toBe(false)
    expect(nobody.hasLiveStory).toBe(false)
  })
})

describe('a record that is only an outline', () => {
  it('says so, because its access hash will not address anything', () => {
    // A partial record arrives as a side effect of something else. Storing it
    // over a full one loses the hash that worked.
    const outline: User = { ...PERSON, min: true }

    expect(new UserView(outline).isPartial).toBe(true)
    expect(new UserView(PERSON).isPartial).toBe(false)
  })

  it('withholds a channel flag the record does not populate', () => {
    // The companion flag says this one carries no answer, and reading `false`
    // off an absent flag turns "not told" into "no".
    const partial: Channel = { ...SUPERGROUP, min: true, stories_hidden_min: true }

    expect(new ChatView(partial).storiesHidden).toBeUndefined()
    expect(new ChatView(SUPERGROUP).storiesHidden).toBe(false)
    expect(new ChatView({ ...SUPERGROUP, stories_hidden: true }).storiesHidden).toBe(true)
  })
})

describe('which of the five a conversation is', () => {
  it('separates the three real ones', () => {
    expect(new ChatView(GROUP).form).toBe('group')
    expect(new ChatView(SUPERGROUP).form).toBe('supergroup')
    expect(new ChatView(BROADCAST).form).toBe('broadcast')
  })

  it('separates the two holes', () => {
    const gone: ChatForbidden = { _: 'chatForbidden', id: 14n, title: 'Removed' }
    const shut: ChannelForbidden = {
      _: 'channelForbidden',
      id: 15n,
      access_hash: 952n,
      title: 'Shut',
      broadcast: true,
      until_date: 1_700_000_000,
    }
    const hole: ChatEmpty = { _: 'chatEmpty', id: 16n }

    expect(new ChatView(gone).form).toBe('forbidden')
    expect(new ChatView(shut).form).toBe('forbidden')
    expect(new ChatView(hole).form).toBe('empty')

    expect(new ChatView(gone).isForbidden).toBe(true)
    expect(new ChatView(shut).isForbidden).toBe(true)
    expect(new ChatView(hole).isEmpty).toBe(true)

    // A forbidden conversation carries a title and little else.
    expect(new ChatView(gone).title).toBe('Removed')
    expect(new ChatView(shut).forbiddenUntil).toBe(1_700_000_000)
    expect(new ChatView(hole).title).toBeUndefined()

    // Losing access does not turn a channel into a basic group. It is still
    // addressed as a channel, and its reference has to say so.
    expect(new ChatView(shut).isChannel).toBe(true)
    expect(new ChatView(shut).ref).toEqual({ kind: 'channel', id: 15n })
    expect(new ChatView(shut).accessHash).toBe(952n)
    expect(new ChatView(gone).isChannel).toBe(false)
    expect(new ChatView(gone).ref).toEqual({ kind: 'chat', id: 14n })
    expect(new ChatView(gone).accessHash).toBeUndefined()
  })

  it('knows which family of calls addresses it', () => {
    // A basic group is addressed by number; a channel needs an access hash and
    // its own methods. Getting this wrong is a refused call, not a wrong answer.
    expect(new ChatView(GROUP).isChannel).toBe(false)
    expect(new ChatView(SUPERGROUP).isChannel).toBe(true)
    expect(new ChatView(BROADCAST).isChannel).toBe(true)

    expect(new ChatView(GROUP).accessHash).toBeUndefined()
    expect(new ChatView(SUPERGROUP).accessHash).toBe(950n)
  })

  it('reads a broadcast channel apart from a supergroup', () => {
    expect(new ChatView(BROADCAST).isBroadcast).toBe(true)
    expect(new ChatView(BROADCAST).isSupergroup).toBe(false)
    expect(new ChatView(SUPERGROUP).isSupergroup).toBe(true)
    expect(new ChatView(SUPERGROUP).isBroadcast).toBe(false)
    expect(new ChatView(GROUP).isBroadcast).toBe(false)
    expect(new ChatView(GROUP).isSupergroup).toBe(false)
  })

  it('reads what each kind actually carries', () => {
    expect(new ChatView(GROUP).memberCount).toBe(4)
    expect(new ChatView(GROUP).isCreator).toBe(true)
    expect(new ChatView(GROUP).participantsVersion).toBe(9)
    expect(new ChatView(SUPERGROUP).isForum).toBe(true)
    expect(new ChatView(SUPERGROUP).username).toBe('the_group')
    expect(new ChatView(BROADCAST).signsMessages).toBe(true)
    expect(new ChatView(BROADCAST).isVerified).toBe(true)
    expect(new ChatView(BROADCAST).boostLevel).toBe(3)
    expect(new ChatView(BROADCAST).storiesMaxId).toBe(40)
    expect(new ChatView(BROADCAST).hasLiveStory).toBe(false)
  })

  it('names a conversation as a reference that keeps groups and channels apart', () => {
    expect(new ChatView(GROUP).ref).toEqual({ kind: 'chat', id: 11n })
    expect(new ChatView(SUPERGROUP).ref).toEqual({ kind: 'channel', id: 12n })
  })

  it('names the supergroup a basic group became', () => {
    const upgraded: Chat = {
      ...GROUP,
      deactivated: true,
      migrated_to: { _: 'inputChannel', channel_id: 12n, access_hash: 950n },
    }

    expect(new ChatView(upgraded).isDeactivated).toBe(true)
    expect(new ChatView(upgraded).migratedTo).toBe(12n)
    expect(new ChatView(GROUP).migratedTo).toBeUndefined()
  })
})

describe('building views', () => {
  it('takes what an answer carries, including nothing', () => {
    expect(readUser(undefined)).toBeUndefined()
    expect(readChat(undefined)).toBeUndefined()
    expect(readUser(PERSON)?.id).toBe(5n)
    expect(readChat(GROUP)?.id).toBe(11n)
  })

  it('copies nothing', () => {
    expect(readUser(PERSON)?.raw).toBe(PERSON)
    expect(readChat(GROUP)?.raw).toBe(GROUP)
  })
})

describe('joining a reference to what the answer described', () => {
  const answer = { users: [PERSON, BOT, NOBODY], chats: [GROUP, SUPERGROUP, BROADCAST] }

  it('finds a person and a conversation by reference', () => {
    const people = readPeers(answer)

    expect(people.user({ kind: 'user', id: 5n })?.displayName).toBe('Ada Lovelace')
    expect(people.chat({ kind: 'chat', id: 11n })?.title).toBe('Basic group')
    expect(people.chat({ kind: 'channel', id: 12n })?.title).toBe('Supergroup')
    expect(people.size).toBe(6)
  })

  it('does not answer a user lookup with a conversation, or the reverse', () => {
    const people = readPeers(answer)

    expect(people.user({ kind: 'chat', id: 11n })).toBeUndefined()
    expect(people.chat({ kind: 'user', id: 5n })).toBeUndefined()
  })

  it('keeps a person and a group that number the same apart', () => {
    // Peer numbers are unique only within their kind, so an index keyed by
    // number alone would answer either lookup with whichever arrived last.
    const colliding = readPeers({
      users: [{ ...PERSON, id: 20n }],
      chats: [
        { ...GROUP, id: 20n },
        { ...SUPERGROUP, id: 20n },
      ],
    })

    expect(colliding.user({ kind: 'user', id: 20n })?.displayName).toBe('Ada Lovelace')
    expect(colliding.chat({ kind: 'chat', id: 20n })?.form).toBe('group')
    expect(colliding.chat({ kind: 'channel', id: 20n })?.form).toBe('supergroup')
    expect(colliding.size).toBe(3)

    // The kind is part of the question, not a hint. Asking for a conversation
    // by a number that also names a person must not answer with the person.
    expect(colliding.user({ kind: 'chat', id: 20n })).toBeUndefined()
    expect(colliding.user({ kind: 'channel', id: 20n })).toBeUndefined()
    expect(colliding.chat({ kind: 'user', id: 20n })).toBeUndefined()
  })

  it('says nothing for a reference the answer did not describe', () => {
    // Not a failed lookup: the answer did not carry it, and finding out means
    // asking, which is a call rather than something an index can do.
    const people = readPeers(answer)

    expect(people.user({ kind: 'user', id: 999n })).toBeUndefined()
    expect(people.get({ kind: 'channel', id: 999n })).toBeUndefined()
    expect(people.name({ kind: 'user', id: 999n })).toBeUndefined()
    expect(people.get(undefined)).toBeUndefined()
    expect(people.name(undefined)).toBeUndefined()
  })

  it('answers without being told which kind the reference is', () => {
    const people = readPeers(answer)

    expect(people.get({ kind: 'user', id: 6n })).toBeInstanceOf(UserView)
    expect(people.get({ kind: 'channel', id: 13n })).toBeInstanceOf(ChatView)
    expect(people.name({ kind: 'user', id: 6n })).toBe('Helper')
    expect(people.name({ kind: 'channel', id: 13n })).toBe('Channel')
  })

  it('is built from an answer that names neither', () => {
    const empty = readPeers({})

    expect(empty.size).toBe(0)
    expect([...empty.users()]).toEqual([])
    expect([...empty.chats()]).toEqual([])
  })

  it('walks everyone and every conversation it holds', () => {
    const people = readPeers(answer)

    expect([...people.users()].map((one) => one.id)).toEqual([5n, 6n, 7n])
    // Groups and channels are held apart internally and come back together.
    expect([...people.chats()].map((one) => one.id).sort()).toEqual([11n, 12n, 13n])
  })

  it('is an index, not a fetch — the same instance answers repeatedly', () => {
    const people = new PeerIndex(answer)
    const once = people.user({ kind: 'user', id: 5n })

    expect(people.user({ kind: 'user', id: 5n })).toBe(once)
  })
})

describe('what a person’s status and profile say, read', () => {
  const withStatus = (status: User['status']) =>
    new UserView({ ...PERSON, ...(status === undefined ? {} : { status }) })

  it('reads when an account was last seen, and whether it is hidden in return', () => {
    expect(withStatus({ _: 'userStatusOnline', expires: 100 }).presence).toEqual({
      state: 'online',
      onlineUntil: 100,
      lastSeen: undefined,
      hiddenByMe: false,
    })
    expect(withStatus({ _: 'userStatusOffline', was_online: 90 }).presence).toMatchObject({
      state: 'offline',
      lastSeen: 90,
    })
    expect(withStatus({ _: 'userStatusRecently', by_me: true }).presence).toMatchObject({
      state: 'recently',
      hiddenByMe: true,
    })
    expect(withStatus({ _: 'userStatusLastWeek' }).presence).toMatchObject({
      state: 'last-week',
      hiddenByMe: false,
    })
    expect(withStatus({ _: 'userStatusLastMonth', by_me: true }).presence?.state).toBe('last-month')
    expect(withStatus({ _: 'userStatusEmpty' }).presence?.state).toBe('long-ago')
    expect(withStatus(undefined).presence?.state).toBe('long-ago')
    expect(new UserView(BOT).presence?.state).toBe('bot')
    expect(new UserView({ _: 'userEmpty', id: 1n }).presence).toBeUndefined()
  })

  it('reads the newer bot flags, the linked community and where the photo is kept', () => {
    const bot = new UserView({
      ...BOT,
      bot_can_manage_bots: true,
      bot_guestchat: true,
      bot_guard: true,
      linked_community_id: 77n,
      photo: { _: 'userProfilePhoto', photo_id: 1n, dc_id: 4 },
    })

    expect([bot.botManagesBots, bot.botHasGuestChat, bot.botIsGuard]).toEqual([true, true, true])
    // Each flag read from its own field: one set alone answers for itself only.
    const only = (flag: 'bot_can_manage_bots' | 'bot_guestchat' | 'bot_guard') => {
      const view = new UserView({ ...BOT, [flag]: true })
      return [view.botManagesBots, view.botHasGuestChat, view.botIsGuard]
    }
    expect(only('bot_can_manage_bots')).toEqual([true, false, false])
    expect(only('bot_guestchat')).toEqual([false, true, false])
    expect(only('bot_guard')).toEqual([false, false, true])
    expect(bot.linkedCommunityId).toBe(77n)
    expect(bot.photoDcId).toBe(4)
    expect(new UserView(PERSON).photoDcId).toBeUndefined()
    expect([new UserView(PERSON).botManagesBots, new UserView(PERSON).botIsGuard]).toEqual([
      false,
      false,
    ])
  })

  it('mentions an account by its full reference where it has one, and by id where not', () => {
    expect(new UserView(PERSON).mention()).toEqual({
      text: 'Ada Lovelace',
      entities: [
        {
          _: 'inputMessageEntityMentionName',
          offset: 0,
          length: 12,
          user_id: { _: 'inputUser', user_id: 5n, access_hash: 900n },
        },
      ],
    })

    const outline = new UserView({ ...PERSON, access_hash: undefined as never })
    // Code units, not characters: an emoji is two.
    expect(outline.mention('Ada 👋')).toEqual({
      text: 'Ada 👋',
      entities: [{ _: 'messageEntityMentionName', offset: 0, length: 6, user_id: 5n }],
    })
  })

  it('reads a channel’s linked community and where its photo is kept', () => {
    const channel: Channel = {
      _: 'channel',
      id: 3n,
      title: 'News',
      photo: { _: 'chatPhoto', photo_id: 2n, dc_id: 5 },
      date: 1,
      linked_community_id: 9n,
    }

    expect(new ChatView(channel).linkedCommunityId).toBe(9n)
    expect(new ChatView(channel).photoDcId).toBe(5)
    expect(new ChatView({ ...channel, photo: { _: 'chatPhotoEmpty' } }).photoDcId).toBeUndefined()
  })
})
