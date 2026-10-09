// SPDX-License-Identifier: MPL-2.0

/**
 * Ephemeral and welcome messages.
 *
 * An ephemeral message exists in one person's view of a conversation and
 * nowhere else, so the address is (chat, receiver, id) and the receiver is
 * never optional. The cases below pin that down, together with the one place
 * the chat genuinely is absent — a guest chat, where a query identifier stands
 * in for it — and with the update kinds, which must not be the ordinary message
 * ones because the payload is a different type.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import {
  deleteAllWelcomeMessages,
  deleteEphemeralMessage,
  deleteWelcomeMessage,
  type Ephemeral,
  EphemeralMessageView,
  editEphemeralMessage,
  getEphemeralCallbackAnswer,
  getWelcomeMessages,
  sendEphemeralMessage,
} from '../src/messaging/ephemeral.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import { normalizeUpdate } from '../src/normalize/normalize.js'
import type { TlValue } from '../src/tl/index.js'

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

const MESSAGE = {
  _: 'ephemeralMessage' as const,
  id: 12,
  from_id: { _: 'peerUser' as const, user_id: 1n },
  peer_id: { _: 'peerChannel' as const, channel_id: 77n },
  receiver_id: 9n,
  date: 1_700,
  message: 'only for you',
}

const sentBack = (message: object = MESSAGE) => ({
  _: 'updates',
  updates: [{ _: 'updateNewEphemeralMessage', message }],
  chats: [],
  users: [],
})

function scripted(script: Readonly<Record<string, unknown>> = {}) {
  const calls: Call[] = []

  const answer = (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params })

    return Promise.resolve(script[method] ?? true)
  }

  const handler = (namespace: string) =>
    new Proxy(
      {},
      {
        get: (_t, name: string) => (params: Record<string, unknown>) =>
          answer(`${namespace}.${name}`, params),
      },
    )

  const client: Ephemeral & { readonly calls: Call[] } = {
    api: { ephemeral: handler('ephemeral') } as unknown as MtprotoApi,
    calls,
    resolve(peer: string | PeerRef) {
      const name = typeof peer === 'string' ? peer.replace(/^@/, '') : `${peer.kind}${peer.id}`
      const resolved: TypeInputPeer = name.startsWith('channel')
        ? { _: 'inputPeerChannel', channel_id: 77n, access_hash: 770n }
        : { _: 'inputPeerUser', user_id: 9n, access_hash: 90n }

      return Promise.resolve(resolved)
    },
    random: (length) => new Uint8Array(length).fill(7),
  }

  return client
}

const sent = (client: { readonly calls: Call[] }, method: string) =>
  client.calls.find((call) => call.method === method)?.params

describe('sending one', () => {
  it('names the receiver as well as the conversation, since the id means nothing alone', async () => {
    const client = scripted({ 'ephemeral.sendMessage': sentBack() })

    const message = await sendEphemeralMessage(
      client,
      { chat: '@channel_news', receiver: '@someone' },
      'only for you',
    )

    expect(sent(client, 'ephemeral.sendMessage')).toMatchObject({
      peer: { _: 'inputPeerChannel', channel_id: 77n },
      receiver_id: { _: 'inputUser', user_id: 9n, access_hash: 90n },
      message: 'only for you',
    })
    expect(message.id).toBe(12)
    expect(message.receiver).toEqual({ kind: 'user', id: 9n })
    expect(message.chat).toEqual({ kind: 'channel', id: 77n })
  })

  it('carries a deduplication key, as every send does', async () => {
    const client = scripted({ 'ephemeral.sendMessage': sentBack() })
    await sendEphemeralMessage(client, { chat: '@channel_news', receiver: '@someone' }, 'x')

    expect(typeof sent(client, 'ephemeral.sendMessage')?.['random_id']).toBe('bigint')
  })

  it('sends no chat in a guest chat, where the query names where it goes', async () => {
    const client = scripted({ 'ephemeral.sendMessage': sentBack() })

    await sendEphemeralMessage(client, { chat: null, receiver: '@someone' }, 'hello', {
      queryId: 55n,
    })

    const params = sent(client, 'ephemeral.sendMessage')
    expect(params).not.toHaveProperty('peer')
    expect(params).toMatchObject({ query_id: 55n })
  })

  it('refuses a guest chat with no query, and a message with nothing in it', async () => {
    await expect(
      sendEphemeralMessage(scripted(), { chat: null, receiver: '@someone' }, 'hello'),
    ).rejects.toThrow(/names the query/)

    await expect(
      sendEphemeralMessage(scripted(), { chat: '@channel_news', receiver: '@someone' }, ''),
    ).rejects.toThrow(/needs text, media or rich content/)
  })

  it('refuses a receiver that is a conversation rather than a person', async () => {
    const client = scripted()
    await expect(
      sendEphemeralMessage(client, { chat: '@channel_news', receiver: '@channel_news' }, 'x'),
    ).rejects.toThrow(/visible to one person/)
    expect(client.calls.filter((call) => call.method === 'ephemeral.sendMessage')).toEqual([])
  })

  it('answers an ephemeral message by its own kind of reply, not the ordinary one', async () => {
    const toEphemeral = scripted({ 'ephemeral.sendMessage': sentBack() })
    await sendEphemeralMessage(toEphemeral, { chat: '@channel_news', receiver: '@someone' }, 'x', {
      replyToEphemeral: 3,
      replyTo: 4,
    })
    // The ephemeral reply wins: replying to a message in the history and to
    // another ephemeral message are different targets.
    expect(sent(toEphemeral, 'ephemeral.sendMessage')?.['reply_to']).toEqual({
      _: 'inputReplyToEphemeralMessage',
      id: 3,
    })

    const toOrdinary = scripted({ 'ephemeral.sendMessage': sentBack() })
    await sendEphemeralMessage(toOrdinary, { chat: '@channel_news', receiver: '@someone' }, 'x', {
      replyTo: 4,
    })
    expect(toOrdinary.calls[0]?.params['reply_to']).toEqual({
      _: 'inputReplyToMessage',
      reply_to_msg_id: 4,
    })
  })

  it('marks a welcome template, and protects content when asked', async () => {
    const client = scripted({ 'ephemeral.sendMessage': sentBack() })

    await sendEphemeralMessage(client, { chat: '@channel_news', receiver: '@someone' }, 'Welcome', {
      welcome: true,
      anchor: true,
      protectContent: true,
    })

    expect(sent(client, 'ephemeral.sendMessage')).toMatchObject({
      welcome: true,
      anchor: true,
      noforwards: true,
    })
  })

  it('says so when Telegram answers without describing the message', async () => {
    const client = scripted({
      'ephemeral.sendMessage': { _: 'updates', updates: [], chats: [], users: [] },
    })

    await expect(
      sendEphemeralMessage(client, { chat: '@channel_news', receiver: '@someone' }, 'x'),
    ).rejects.toThrow(/did not describe/)
  })
})

describe('changing and taking back', () => {
  it('sends only what an edit changes', async () => {
    const client = scripted({
      'ephemeral.editMessage': {
        _: 'updates',
        updates: [{ _: 'updateEditEphemeralMessage', message: { ...MESSAGE, message: 'changed' } }],
        chats: [],
        users: [],
      },
    })

    const edited = await editEphemeralMessage(
      client,
      { chat: '@channel_news', receiver: '@someone' },
      12,
      { text: 'changed' },
    )

    const params = sent(client, 'ephemeral.editMessage')
    expect(params).toMatchObject({ id: 12, message: 'changed' })
    expect(params).not.toHaveProperty('reply_markup')
    expect(edited.text).toBe('changed')
  })

  it('refuses an edit that changes nothing', async () => {
    const client = scripted()
    await expect(
      editEphemeralMessage(client, { chat: '@channel_news', receiver: '@someone' }, 12, {}),
    ).rejects.toThrow(ValidationError)
    expect(client.calls).toEqual([])
  })

  it('deletes by the same three-part address', async () => {
    const client = scripted()
    await deleteEphemeralMessage(client, { chat: '@channel_news', receiver: '@someone' }, 12)

    expect(sent(client, 'ephemeral.deleteMessage')).toEqual({
      peer: { _: 'inputPeerChannel', channel_id: 77n, access_hash: 770n },
      receiver_id: { _: 'inputUser', user_id: 9n, access_hash: 90n },
      id: 12,
    })
  })

  it('presses a button and reads what the bot answered', async () => {
    const client = scripted({
      'ephemeral.getCallbackAnswer': {
        _: 'messages.botCallbackAnswer',
        message: 'Done',
        alert: true,
        cache_time: 5,
      },
    })

    const answer = await getEphemeralCallbackAnswer(client, '@channel_news', 12, 'buy:1')

    expect(sent(client, 'ephemeral.getCallbackAnswer')).toEqual({
      peer: { _: 'inputPeerChannel', channel_id: 77n, access_hash: 770n },
      id: 12,
      data: new TextEncoder().encode('buy:1'),
    })
    expect(answer).toEqual({ message: 'Done', alert: true, cacheTime: 5 })
  })
})

describe('welcome templates', () => {
  it('reads them, sending a zero hash since nothing is held to compare against', async () => {
    const client = scripted({
      'ephemeral.getWelcomeMessages': {
        _: 'ephemeral.welcomeMessages',
        hash: 0n,
        messages: [{ ...MESSAGE, welcome_template: true }],
      },
    })

    const messages = await getWelcomeMessages(client, '@channel_news')

    expect(sent(client, 'ephemeral.getWelcomeMessages')).toEqual({
      peer: { _: 'inputPeerChannel', channel_id: 77n, access_hash: 770n },
      hash: 0n,
    })
    expect(messages[0]?.isWelcomeTemplate).toBe(true)
  })

  it('says so rather than answering nothing when Telegram reports no change', async () => {
    const client = scripted({
      'ephemeral.getWelcomeMessages': { _: 'ephemeral.welcomeMessagesNotModified' },
    })

    await expect(getWelcomeMessages(client, '@channel_news')).rejects.toThrow(/unchanged/)
  })

  it('deletes one, and deletes them all, through their own calls', async () => {
    const client = scripted()

    await deleteWelcomeMessage(client, '@channel_news', 12)
    await deleteAllWelcomeMessages(client, '@channel_news')

    expect(client.calls.map((call) => call.method)).toEqual([
      'ephemeral.deleteWelcomeMessage',
      'ephemeral.deleteAllWelcomeMessages',
    ])
    expect(sent(client, 'ephemeral.deleteWelcomeMessage')).toMatchObject({ id: 12 })
    expect(sent(client, 'ephemeral.deleteAllWelcomeMessages')).not.toHaveProperty('id')
  })
})

describe('the updates they arrive as', () => {
  it('is its own kind rather than an ordinary message', () => {
    const update = normalizeUpdate({ _: 'updateNewEphemeralMessage', message: MESSAGE } as TlValue)

    expect(update.kind).toBe('mtproto:ephemeral_message')
    expect(update.chat).toEqual({ kind: 'channel', id: 77n })
    expect(update.sender).toEqual({ kind: 'user', id: 1n })
    expect(update.text).toBe('only for you')
    expect(update.date).toBe(1_700)
    // `message` holds a `Message`, and this is not one. The payload is in `raw`.
    expect(update.message).toBeUndefined()
    expect(new EphemeralMessageView(update.raw['message'] as never).id).toBe(12)
  })

  it('carries no conversation for a guest chat, which has none', () => {
    const { peer_id: _peer, ...guest } = MESSAGE
    const update = normalizeUpdate({ _: 'updateEditEphemeralMessage', message: guest } as TlValue)

    expect(update.kind).toBe('mtproto:ephemeral_message_edited')
    expect(update.chat).toBeUndefined()
  })

  it('reads a deletion, whose numbers live under a different field name', () => {
    const update = normalizeUpdate({
      _: 'updateDeleteEphemeralMessages',
      peer: { _: 'peerUser', user_id: 9n },
      ids: [1, 2, 3],
    } as TlValue)

    expect(update.kind).toBe('mtproto:ephemeral_messages_deleted')
    expect(update.messageIds).toEqual([1, 2, 3])
    expect(update.chat).toEqual({ kind: 'user', id: 9n })
  })

  it('gives a pressed button on one its own kind', () => {
    const update = normalizeUpdate({
      _: 'updateEphemeralBotCallbackQuery',
      query_id: 5n,
      user_id: 9n,
      msg_id: 12,
      data: new Uint8Array(),
      message: MESSAGE,
    } as TlValue)

    expect(update.kind).toBe('mtproto:ephemeral_callback_query')
  })
})
