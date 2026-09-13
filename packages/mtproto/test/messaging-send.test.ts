/**
 * Saying something, to a conversation of the caller's choosing.
 *
 * Driven by a fake client, so what matters is the call each operation builds:
 * whether the deduplication key is there and differs between sends, whether
 * formatting arrives as ranges rather than as markup, whether a peer is
 * resolved once, and whether a channel is addressed by the method that
 * addresses channels — which is the difference between a message being sent and
 * a call being refused.
 */

import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import { fromHtml } from '../src/format/index.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import {
  deleteMessages,
  editMessage,
  forwardMessages,
  getMessages,
  pinMessage,
  react,
  readHistory,
  type Sending,
  sendMedia,
  sendText,
  setTyping,
} from '../src/messaging/send.js'

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

/** A client recording what was called, and answering from a script. */
function fake(options?: {
  readonly peer?: TypeInputPeer
  readonly answers?: Readonly<Record<string, unknown>>
}): Sending & { readonly calls: Call[]; readonly resolved: unknown[] } {
  const calls: Call[] = []
  const resolved: unknown[] = []
  let seed = 0

  const record =
    (method: string) =>
    (params: Record<string, unknown>): Promise<unknown> => {
      calls.push({ method, params })

      return Promise.resolve(
        options?.answers?.[method] ?? {
          _: 'updates',
          updates: [],
          users: [],
          chats: [],
          date: 0,
          seq: 0,
        },
      )
    }

  const api = {
    messages: {
      sendMessage: record('messages.sendMessage'),
      sendMedia: record('messages.sendMedia'),
      editMessage: record('messages.editMessage'),
      deleteMessages: record('messages.deleteMessages'),
      forwardMessages: record('messages.forwardMessages'),
      sendReaction: record('messages.sendReaction'),
      updatePinnedMessage: record('messages.updatePinnedMessage'),
      readHistory: record('messages.readHistory'),
      setTyping: record('messages.setTyping'),
      getMessages: record('messages.getMessages'),
    },
    channels: {
      deleteMessages: record('channels.deleteMessages'),
      readHistory: record('channels.readHistory'),
      getMessages: record('channels.getMessages'),
    },
  } as unknown as MtprotoApi

  return {
    api,
    calls,
    resolved,
    resolve(peer) {
      resolved.push(peer)

      if (options?.peer !== undefined) return Promise.resolve(options.peer)

      // Distinct per name: a call that put the destination where the source
      // belongs is invisible when everything resolves to the same peer.
      const name = typeof peer === 'string' ? peer : `${peer.kind}:${peer.id}`
      const id = BigInt(name.length * 100 + (name.codePointAt(1) ?? 0))

      return Promise.resolve({ _: 'inputPeerUser', user_id: id, access_hash: id })
    },
    random(length) {
      // Deterministic, and different on each draw: the point of the key is that
      // two sends do not carry the same one.
      seed += 1

      return Uint8Array.from({ length }, (_value, at) => (seed * 31 + at) % 251)
    },
  }
}

const CHANNEL: TypeInputPeer = { _: 'inputPeerChannel', channel_id: 55n, access_hash: 900n }

describe('saying something', () => {
  it('resolves the peer and carries a deduplication key', async () => {
    const client = fake()

    await sendText(client, '@someone', 'hello')

    expect(client.resolved).toEqual(['@someone'])
    expect(client.calls[0]?.method).toBe('messages.sendMessage')
    expect(client.calls[0]?.params).toMatchObject({ message: 'hello' })
    expect(typeof client.calls[0]?.params['random_id']).toBe('bigint')
  })

  it('gives two sends two different keys', async () => {
    // Telegram drops a repeat carrying a key it has already seen, so a key that
    // did not change would silently lose the second message.
    const client = fake()

    await sendText(client, '@someone', 'one')
    await sendText(client, '@someone', 'two')

    expect(client.calls[0]?.params['random_id']).not.toBe(client.calls[1]?.params['random_id'])
  })

  it('sends formatting as ranges rather than as markup', async () => {
    const client = fake()

    await sendText(client, '@someone', fromHtml('<b>bold</b> text'))

    expect(client.calls[0]?.params).toMatchObject({
      message: 'bold text',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 4 }],
    })
  })

  it('leaves the ranges off entirely when there are none', async () => {
    // An empty list is not the same as no list to Telegram, and sending one
    // asks it to parse nothing.
    const client = fake()

    await sendText(client, '@someone', { text: 'plain', entities: [] })

    expect(client.calls[0]?.params).not.toHaveProperty('entities')
  })

  it('sends no reply header when nothing is being answered', async () => {
    // A header naming no message is not the same as no header, and Telegram
    // refuses one.
    const client = fake()

    await sendText(client, '@someone', 'hi')

    expect(client.calls[0]?.params).not.toHaveProperty('reply_to')
  })

  it('answers a message when asked to', async () => {
    const client = fake()

    await sendText(client, '@someone', 'hi', { replyTo: 42 })

    expect(client.calls[0]?.params['reply_to']).toEqual({
      _: 'inputReplyToMessage',
      reply_to_msg_id: 42,
    })
  })

  it('sends into a forum topic, answering the message that opened it', async () => {
    const client = fake()

    await sendText(client, '@someone', 'hi', { topicId: 7 })

    expect(client.calls[0]?.params['reply_to']).toEqual({
      _: 'inputReplyToMessage',
      reply_to_msg_id: 7,
      top_msg_id: 7,
    })
  })

  it('answers a message inside a topic without losing either', async () => {
    const client = fake()

    await sendText(client, '@someone', 'hi', { replyTo: 42, topicId: 7 })

    expect(client.calls[0]?.params['reply_to']).toEqual({
      _: 'inputReplyToMessage',
      reply_to_msg_id: 42,
      top_msg_id: 7,
    })
  })

  it('carries the flags it was given, and only those', async () => {
    const client = fake()

    await sendText(client, '@someone', 'hi', {
      silent: true,
      protectContent: true,
      scheduleDate: 1_700_000_000,
    })

    expect(client.calls[0]?.params).toMatchObject({
      silent: true,
      noforwards: true,
      schedule_date: 1_700_000_000,
    })
    expect(client.calls[0]?.params).not.toHaveProperty('invert_media')
    expect(client.calls[0]?.params).not.toHaveProperty('clear_draft')
  })

  it('sends none of the flags when it was given none', async () => {
    // Each flag is present-or-absent on the wire, so sending one set to false
    // is the same as sending it set.
    const client = fake()

    await sendText(client, '@someone', 'hi')

    for (const flag of ['silent', 'noforwards', 'invert_media', 'clear_draft', 'schedule_date']) {
      expect(client.calls[0]?.params).not.toHaveProperty(flag)
    }
  })

  it('sends media with a caption that carries its own formatting', async () => {
    const client = fake()

    await sendMedia(client, '@someone', { _: 'inputMediaEmpty' }, fromHtml('<i>look</i>'), {
      silent: true,
    })

    expect(client.calls[0]?.method).toBe('messages.sendMedia')
    expect(client.calls[0]?.params).toMatchObject({
      media: { _: 'inputMediaEmpty' },
      message: 'look',
      entities: [{ _: 'messageEntityItalic', offset: 0, length: 4 }],
      silent: true,
    })
  })

  it('sends media with no caption at all', async () => {
    const client = fake()

    await sendMedia(client, '@someone', { _: 'inputMediaEmpty' })

    expect(client.calls[0]?.params).toMatchObject({ message: '' })
    expect(client.calls[0]?.params).not.toHaveProperty('entities')
  })
})

describe('changing and removing', () => {
  it('edits text and formatting together', async () => {
    const client = fake()

    await editMessage(client, '@someone', 42, fromHtml('<b>new</b>'))

    expect(client.calls[0]?.method).toBe('messages.editMessage')
    expect(client.calls[0]?.params).toMatchObject({
      id: 42,
      message: 'new',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 3 }],
    })
  })

  it('edits only the parts it was given', async () => {
    const client = fake()

    await editMessage(client, '@someone', 42, undefined, { markup: { _: 'replyKeyboardHide' } })

    expect(client.calls[0]?.params).not.toHaveProperty('message')
    expect(client.calls[0]?.params).toMatchObject({ reply_markup: { _: 'replyKeyboardHide' } })
  })

  it('deletes for everybody by default, and for this account when asked', async () => {
    const everybody = fake()
    const mine = fake()

    await deleteMessages(everybody, '@someone', [1, 2])
    await deleteMessages(mine, '@someone', [1, 2], { revoke: false })

    expect(everybody.calls[0]?.params).toMatchObject({ id: [1, 2], revoke: true })
    expect(mine.calls[0]?.params).not.toHaveProperty('revoke')
  })

  it('deletes from a channel through the call that addresses channels', async () => {
    // The two methods are not interchangeable: the one without a channel would
    // be refused, and the failure names the call rather than the conversation.
    const client = fake({ peer: CHANNEL })

    await deleteMessages(client, 'someone', [1])

    expect(client.calls[0]?.method).toBe('channels.deleteMessages')
    expect(client.calls[0]?.params).toMatchObject({
      channel: { _: 'inputChannel', channel_id: 55n, access_hash: 900n },
      id: [1],
    })
  })
})

describe('forwarding', () => {
  it('resolves both ends and gives every message its own key', async () => {
    const client = fake()

    await forwardMessages(client, { from: '@a', to: '@b', ids: [1, 2, 3] })

    expect(client.resolved).toEqual(['@a', '@b'])
    expect(client.calls[0]?.method).toBe('messages.forwardMessages')

    const keys = client.calls[0]?.params['random_id'] as readonly bigint[]

    expect(keys).toHaveLength(3)
    expect(new Set(keys).size).toBe(3)
  })

  it('sends the source as the source and the destination as the destination', async () => {
    // Both are input peers of the same shape, so swapping them is a call that
    // succeeds and copies the wrong way.
    const client = fake()

    await forwardMessages(client, { from: '@a', to: '@bb', ids: [1] })

    const params = client.calls[0]?.params as Record<string, { user_id: bigint }>

    expect(params['from_peer']?.user_id).not.toBe(params['to_peer']?.user_id)
    expect(params['from_peer']).toEqual(await client.resolve('@a'))
    expect(params['to_peer']).toEqual(await client.resolve('@bb'))
  })

  it('carries what it was told to drop', async () => {
    const client = fake()

    await forwardMessages(
      client,
      { from: '@a', to: '@b', ids: [1] },
      {
        dropAuthor: true,
        dropCaptions: true,
      },
    )

    expect(client.calls[0]?.params).toMatchObject({
      drop_author: true,
      drop_media_captions: true,
    })
  })
})

describe('reacting', () => {
  it('reacts with an emoji', async () => {
    const client = fake()

    await react(client, '@someone', 42, '👍')

    expect(client.calls[0]?.params).toMatchObject({
      msg_id: 42,
      reaction: [{ _: 'reactionEmoji', emoticon: '👍' }],
    })
  })

  it('reacts with a custom emoji by its document', async () => {
    const client = fake()

    await react(client, '@someone', 42, 5n)

    expect(client.calls[0]?.params).toMatchObject({
      reaction: [{ _: 'reactionCustomEmoji', document_id: 5n }],
    })
  })

  it('takes a reaction back with an empty list rather than another call', async () => {
    const client = fake()

    await react(client, '@someone', 42, undefined)

    expect(client.calls[0]?.method).toBe('messages.sendReaction')
    expect(client.calls[0]?.params['reaction']).toEqual([])
  })
})

describe('pinning, reading and typing', () => {
  it('pins for this account only unless told otherwise', async () => {
    // The flag is named for the narrower behaviour, so defaulting to the wider
    // one would pin a private message for somebody who did not ask.
    const one = fake()
    const both = fake()

    await pinMessage(one, '@someone', 42)
    await pinMessage(both, '@someone', 42, { bothSides: true })

    expect(one.calls[0]?.params).toMatchObject({ id: 42, pm_oneside: true })
    expect(both.calls[0]?.params).not.toHaveProperty('pm_oneside')
  })

  it('unpins through the same call', async () => {
    const client = fake()

    await pinMessage(client, '@someone', 42, { unpin: true })

    expect(client.calls[0]?.params).toMatchObject({ unpin: true })
  })

  it('reads a conversation, and a channel through its own call', async () => {
    const plain = fake()
    const channel = fake({ peer: CHANNEL })

    await readHistory(plain, '@someone', 90)
    await readHistory(channel, 'somewhere')

    expect(plain.calls[0]?.method).toBe('messages.readHistory')
    expect(plain.calls[0]?.params).toMatchObject({ max_id: 90 })
    expect(channel.calls[0]?.method).toBe('channels.readHistory')
    expect(channel.calls[0]?.params).toMatchObject({ max_id: 0 })
  })

  it('types unless told to do something else', async () => {
    const typing = fake()
    const other = fake()

    await setTyping(typing, '@someone')
    await setTyping(other, '@someone', { _: 'sendMessageUploadPhotoAction', progress: 40 })

    expect(typing.calls[0]?.params['action']).toEqual({ _: 'sendMessageTypingAction' })
    expect(other.calls[0]?.params['action']).toEqual({
      _: 'sendMessageUploadPhotoAction',
      progress: 40,
    })
  })
})

describe('fetching messages by number', () => {
  const page = {
    _: 'messages.messages',
    messages: [
      {
        _: 'message',
        id: 7,
        peer_id: { _: 'peerUser', user_id: 3n },
        message: 'found',
        date: 1_700_000_000,
      },
      { _: 'messageEmpty', id: 8 },
    ],
    chats: [],
    users: [],
    topics: [],
  }

  it('reads what came back rather than handing over the answer', async () => {
    const client = fake({ answers: { 'messages.getMessages': page } })

    const found = await getMessages(client, '@someone', [7, 8])

    expect(client.calls[0]?.params).toMatchObject({
      id: [
        { _: 'inputMessageID', id: 7 },
        { _: 'inputMessageID', id: 8 },
      ],
    })
    expect(found[0]?.text).toBe('found')
  })

  it('reports a message it cannot see as empty rather than as a gap', async () => {
    const client = fake({ answers: { 'messages.getMessages': page } })

    const found = await getMessages(client, '@someone', [7, 8])

    expect(found).toHaveLength(2)
    expect(found[1]?.isEmpty).toBe(true)
  })

  it('asks a channel through the call that addresses channels', async () => {
    const client = fake({ peer: CHANNEL, answers: { 'channels.getMessages': page } })

    await getMessages(client, 'somewhere', [7])

    expect(client.calls[0]?.method).toBe('channels.getMessages')
    expect(client.calls[0]?.params).toMatchObject({
      channel: { _: 'inputChannel', channel_id: 55n, access_hash: 900n },
    })
  })

  it('answers nothing when the server says nothing has changed', async () => {
    const client = fake({
      answers: { 'messages.getMessages': { _: 'messages.messagesNotModified', count: 0 } },
    })

    expect(await getMessages(client, '@someone', [7])).toEqual([])
  })
})
