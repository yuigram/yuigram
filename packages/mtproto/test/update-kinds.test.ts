/**
 * The update kinds an account handles beyond messages, and what a handler can
 * do about them.
 *
 * Two layers. What each constructor becomes — which kind, which conversation,
 * who acted and whom it is about — is read off the normalizer directly, since
 * it is a table. Whether that reaches a handler, and what a handler's answer
 * puts on the wire, is driven through the mock datacenter: sealed, decrypted,
 * sequenced and dispatched as in production, with every request the answer
 * makes read back where the datacenter received it.
 */

import { describe, expect, it } from 'vitest'
import { fromHtml } from '../src/format/html.js'
import type { MtprotoContext } from '../src/normalize/context.js'
import { normalizeUpdate } from '../src/normalize/normalize.js'
import type { TlValue } from '../src/tl/index.js'
import type { MockConnection } from './server/datacenter.js'
import { type MockAccount, type MockAccountOptions, mockAccount } from './support/mock-account.js'

describe('what each update is about', () => {
  it('reads a vote as the voter acting, in no conversation', () => {
    const vote = normalizeUpdate({
      _: 'updateMessagePollVote',
      poll_id: 1n,
      peer: { _: 'peerUser', user_id: 5n },
      options: [new Uint8Array([0])],
      positions: [0],
      qts: 1,
    })

    expect(vote.kind).toBe('mtproto:poll_vote')
    expect(vote.chat).toBeUndefined()
    expect(vote.sender).toEqual({ kind: 'user', id: 5n })
  })

  it('reads a story as posted by its peer, and a poll’s results as in its chat', () => {
    const story = normalizeUpdate({
      _: 'updateStory',
      peer: { _: 'peerChannel', channel_id: 9n },
      story: { _: 'storyItemDeleted', id: 1 },
    })
    const poll = normalizeUpdate({
      _: 'updateMessagePoll',
      peer: { _: 'peerChat', chat_id: 3n },
      msg_id: 4,
      poll_id: 1n,
      results: { _: 'pollResults' },
    })

    expect([story.kind, story.chat, story.sender]).toEqual([
      'mtproto:story',
      undefined,
      { kind: 'channel', id: 9n },
    ])
    expect([poll.kind, poll.chat, poll.sender]).toEqual([
      'mtproto:poll',
      { kind: 'chat', id: 3n },
      undefined,
    ])
  })

  it('reads a bot being stopped as said in the private chat by that person', () => {
    const stopped = normalizeUpdate({
      _: 'updateBotStopped',
      user_id: 5n,
      date: 1_700_000_000,
      stopped: true,
      qts: 1,
    })

    expect(stopped.kind).toBe('mtproto:bot_stopped')
    expect(stopped.chat).toEqual({ kind: 'user', id: 5n })
    expect(stopped.sender).toEqual({ kind: 'user', id: 5n })
  })

  it('does not take any user_id for a conversation', () => {
    // A name or a status changing is about a user, and is said in no chat. A
    // conversation invented from the id would give it a lock, a session and a
    // scene position under a chat nobody spoke in.
    const renamed = normalizeUpdate({
      _: 'updateUserName',
      user_id: 5n,
      first_name: 'A',
      last_name: '',
      usernames: [],
    })
    const status = normalizeUpdate({
      _: 'updateUserStatus',
      user_id: 6n,
      status: { _: 'userStatusOnline', expires: 1 },
    })
    const bought = normalizeUpdate({
      _: 'updateBotPurchasedPaidMedia',
      user_id: 7n,
      payload: 'p',
      qts: 1,
    })

    expect(renamed.chat).toBeUndefined()
    expect(renamed.target).toEqual({ kind: 'user', id: 5n })
    expect(status.chat).toBeUndefined()
    expect(status.target).toEqual({ kind: 'user', id: 6n })
    expect([bought.kind, bought.chat, bought.sender]).toEqual([
      'mtproto:paid_media_purchased',
      undefined,
      { kind: 'user', id: 7n },
    ])
  })

  it('keeps the member, the admin and the group apart in a membership change', () => {
    const promoted = normalizeUpdate({
      _: 'updateChannelParticipant',
      channel_id: 9n,
      date: 1,
      actor_id: 1n,
      user_id: 2n,
      qts: 1,
    })

    expect(promoted.chat).toEqual({ kind: 'channel', id: 9n })
    expect(promoted.sender).toEqual({ kind: 'user', id: 1n })
    expect(promoted.target).toEqual({ kind: 'user', id: 2n })
  })

  it('reads who reacted, even when it is a channel, and counts with nobody named', () => {
    const one = normalizeUpdate({
      _: 'updateBotMessageReaction',
      peer: { _: 'peerChat', chat_id: 3n },
      msg_id: 4,
      date: 1,
      actor: { _: 'peerChannel', channel_id: 8n },
      old_reactions: [],
      new_reactions: [{ _: 'reactionEmoji', emoticon: '👍' }],
      qts: 1,
    })
    const counts = normalizeUpdate({
      _: 'updateBotMessageReactions',
      peer: { _: 'peerChat', chat_id: 3n },
      msg_id: 4,
      date: 1,
      reactions: [],
      qts: 1,
    })

    expect([one.kind, one.chat, one.sender]).toEqual([
      'mtproto:bot_reaction',
      { kind: 'chat', id: 3n },
      { kind: 'channel', id: 8n },
    ])
    expect([counts.kind, counts.sender]).toEqual(['mtproto:bot_reaction_count', undefined])
  })

  it('reads a business account’s messages as its own kinds, with their conversation', () => {
    const message = {
      _: 'message',
      id: 4,
      peer_id: { _: 'peerUser', user_id: 5n },
      from_id: { _: 'peerUser', user_id: 5n },
      message: 'hi',
      date: 1,
    }
    const arrived = normalizeUpdate({
      _: 'updateBotNewBusinessMessage',
      connection_id: 'c1',
      message,
      qts: 1,
    })
    const deleted = normalizeUpdate({
      _: 'updateBotDeleteBusinessMessage',
      connection_id: 'c1',
      peer: { _: 'peerUser', user_id: 5n },
      messages: [4],
      qts: 1,
    })
    const pressed = normalizeUpdate({
      _: 'updateBusinessBotCallbackQuery',
      query_id: 1n,
      user_id: 6n,
      connection_id: 'c1',
      message,
      chat_instance: 1n,
    })

    expect([arrived.kind, arrived.chat, arrived.text]).toEqual([
      'mtproto:business_message',
      { kind: 'user', id: 5n },
      'hi',
    ])
    expect([deleted.kind, deleted.chat, deleted.messageIds]).toEqual([
      'mtproto:business_messages_deleted',
      { kind: 'user', id: 5n },
      [4],
    ])
    expect([pressed.chat, pressed.sender]).toEqual([
      { kind: 'user', id: 5n },
      { kind: 'user', id: 6n },
    ])
  })

  it('reads a guest query as asked by the message’s author, in no chat of this account’s', () => {
    const query = normalizeUpdate({
      _: 'updateBotGuestChatQuery',
      query_id: 1n,
      message: {
        _: 'message',
        id: 4,
        peer_id: { _: 'peerUser', user_id: 5n },
        from_id: { _: 'peerUser', user_id: 6n },
        message: 'what is this?',
        date: 1,
      },
      qts: 1,
    })

    expect([query.kind, query.chat, query.sender, query.text]).toEqual([
      'mtproto:guest_query',
      undefined,
      { kind: 'user', id: 6n },
      'what is this?',
    ])
  })

  it('reads the forum topic a message was posted in', () => {
    const inTopic = normalizeUpdate({
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id: 50,
        peer_id: { _: 'peerChannel', channel_id: 9n },
        reply_to: { _: 'messageReplyHeader', forum_topic: true, reply_to_msg_id: 12 },
        message: 'x',
        date: 1,
      },
      pts: 2,
      pts_count: 1,
    })
    const threaded = normalizeUpdate({
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id: 51,
        peer_id: { _: 'peerChannel', channel_id: 9n },
        reply_to: {
          _: 'messageReplyHeader',
          forum_topic: true,
          reply_to_msg_id: 49,
          reply_to_top_id: 12,
        },
        message: 'x',
        date: 1,
      },
      pts: 3,
      pts_count: 1,
    })
    const plainReply = normalizeUpdate({
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id: 52,
        peer_id: { _: 'peerChannel', channel_id: 9n },
        reply_to: { _: 'messageReplyHeader', reply_to_msg_id: 49 },
        message: 'x',
        date: 1,
      },
      pts: 4,
      pts_count: 1,
    })

    expect(inTopic.topicId).toBe(12)
    expect(threaded.topicId).toBe(12)
    expect(plainReply.topicId).toBeUndefined()
  })
})

/* ------------------------------------------------------------------------ */
/* Over the wire                                                             */
/* ------------------------------------------------------------------------ */

/** Seal a value on a connection that can carry it, and send it. */
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

const settle = async (ms = 200): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/** Updates the way a datacenter sends them, naming the users they mention. */
function batch(...updates: TlValue[]): TlValue {
  return {
    _: 'updates',
    updates,
    users: [{ _: 'user', id: 5n, access_hash: 55n, first_name: 'Five' }],
    chats: [],
    date: 1_700_000_000,
    seq: 0,
  }
}

/**
 * An account whose datacenter records what it is asked, and answers a send
 * with the identifier it was sent under — which is how a real one says which
 * message the send became.
 */
async function recorded(
  options: MockAccountOptions = {},
): Promise<{ instance: MockAccount; asked: TlValue[] }> {
  const asked: TlValue[] = []
  const instance = mockAccount({
    ...options,
    api: (query) => {
      asked.push(query)
      const inner = query._ === 'invokeWithBusinessConnection' ? (query['query'] as TlValue) : query
      if (inner._ !== 'messages.sendMessage' && inner._ !== 'messages.sendMedia') return undefined

      return {
        _: 'updates',
        updates: [{ _: 'updateMessageID', id: 100, random_id: inner['random_id'] }],
        users: [],
        chats: [],
        date: 1_700_000_000,
        seq: 0,
      }
    },
  })
  await instance.account.connect()
  await instance.account.api.call({ _: 'help.getConfig' })

  return { instance, asked }
}

const named = (asked: readonly TlValue[], method: string): TlValue | undefined =>
  asked.find((query) => query._ === method)

describe('a kind beyond messages, delivered', () => {
  it('reaches its handler, and the handler answers a pressed button and edits its message', async () => {
    const { instance, asked } = await recorded()
    const seen: (string | undefined)[] = []

    try {
      instance.account.on('mtproto:callback_query', async (event) => {
        seen.push(event.data)
        await event.answerCallback({ text: 'Bought.' })
        await event.edit(fromHtml('<b>Sold out</b>'))
      })

      await push(
        instance,
        batch({
          _: 'updateBotCallbackQuery',
          query_id: 77n,
          user_id: 5n,
          peer: { _: 'peerUser', user_id: 5n },
          msg_id: 3,
          chat_instance: 1n,
          data: new TextEncoder().encode('buy:42'),
        }),
      )
      await settle()

      expect(seen).toEqual(['buy:42'])
      expect(named(asked, 'messages.setBotCallbackAnswer')).toMatchObject({
        query_id: 77n,
        message: 'Bought.',
      })
      // The message the button is under, formatted, in the chat it is in.
      expect(named(asked, 'messages.editMessage')).toMatchObject({
        peer: { _: 'inputPeerUser', user_id: 5n, access_hash: 55n },
        id: 3,
        message: 'Sold out',
        entities: [{ _: 'messageEntityBold', offset: 0, length: 8 }],
      })
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('answers a person who stopped the bot in their own chat, and replies to a compact message', async () => {
    const { instance, asked } = await recorded()
    const sent: (number | undefined)[] = []

    try {
      instance.account.on('mtproto:bot_stopped', async (event) => {
        await event.send('Come back soon.')
      })
      instance.account.on('message', async (event) => {
        const answer = await event.reply(fromHtml('<i>noted</i>'), { silent: true })
        sent.push(answer.id)
      })

      await push(
        instance,
        batch({ _: 'updateBotStopped', user_id: 5n, date: 1, stopped: true, qts: 1 }),
      )
      await settle()
      await push(instance, {
        _: 'updateShortMessage',
        id: 9,
        user_id: 5n,
        message: 'hello',
        pts: 2,
        pts_count: 1,
        date: 1_700_000_000,
      })
      await settle()

      const sends = asked.filter((query) => query._ === 'messages.sendMessage')
      expect(sends[0]).toMatchObject({
        peer: { _: 'inputPeerUser', user_id: 5n, access_hash: 55n },
        message: 'Come back soon.',
      })
      expect(sends[0]?.['reply_to']).toBeUndefined()
      expect(sends[1]).toMatchObject({
        message: 'noted',
        entities: [{ _: 'messageEntityItalic', offset: 0, length: 5 }],
        reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: 9 },
        silent: true,
      })
      expect(sent).toEqual([100])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('answers a business account’s message through the connection it arrived on', async () => {
    const { instance, asked } = await recorded()

    try {
      instance.account.on('mtproto:business_message', async (event) => {
        await event.reply('On it.')
      })

      // Fed rather than pushed: the harness's own encoder cannot box an API
      // `message` beside the protocol's constructor of the same name, so an
      // update nesting one enters just after the connection has decrypted it.
      await instance.account.feed(
        batch({
          _: 'updateBotNewBusinessMessage',
          connection_id: 'conn-1',
          message: {
            _: 'message',
            id: 4,
            peer_id: { _: 'peerUser', user_id: 5n },
            from_id: { _: 'peerUser', user_id: 5n },
            message: 'hi',
            date: 1,
          },
          qts: 1,
        }),
      )
      await settle()

      const wrapped = named(asked, 'invokeWithBusinessConnection')
      expect(wrapped?.['connection_id']).toBe('conn-1')
      expect(wrapped?.['query']).toMatchObject({
        _: 'messages.sendMessage',
        message: 'On it.',
        reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: 4 },
      })
      // Nothing was sent as the bot itself.
      expect(named(asked, 'messages.sendMessage')).toBeUndefined()
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('handles an album once, after its last part, with its parts in order', async () => {
    const { instance } = await recorded({ albumWindow: 100 })
    const albums: (readonly number[])[] = []
    const captions: (string | undefined)[] = []
    let messages = 0

    const part = (id: number, pts: number, text: string): TlValue => ({
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id,
        peer_id: { _: 'peerUser', user_id: 5n },
        from_id: { _: 'peerUser', user_id: 5n },
        message: text,
        date: 1,
        grouped_id: 700n,
      },
      pts,
      pts_count: 1,
    })

    try {
      instance.account.on('message', () => {
        messages += 1
      })
      instance.account.on('mtproto:album', (event: MtprotoContext) => {
        albums.push((event.album ?? []).map((message) => Number(message['id'])))
        captions.push(event.text)
      })

      // Out of order, as parts may arrive; the caption on one part only. Fed
      // for the same reason as the business message above.
      await instance.account.feed(batch(part(12, 2, ''), part(11, 3, 'Holiday')))
      await settle(300)

      expect(messages).toBe(2)
      expect(albums).toEqual([[11, 12]])
      expect(captions).toEqual(['Holiday'])
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})
