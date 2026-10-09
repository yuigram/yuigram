// SPDX-License-Identifier: MPL-2.0

/**
 * Answering what an account just heard.
 *
 * The two operations a handler can perform whatever produced the event. They
 * are safe on an account for one reason: the peer came from the update, so its
 * reference is already written down. A peer this account has never met is
 * refused rather than guessed at, which is the honest half of the same fact.
 *
 * Nothing here reaches a network. What each operation sends is read from the
 * calls it makes.
 */

import { memory, PeerError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Account } from '../src/account.js'
import { AuthKey } from '../src/message/auth-key.js'
import type { DcConfiguration } from '../src/network/dc.js'
import type { SentMessage } from '../src/normalize/sent.js'
import type { TlValue } from '../src/tl/index.js'

const BOOTSTRAP: DcConfiguration = {
  thisDc: 2,
  testMode: false,
  options: [
    {
      id: 2,
      host: '10.0.0.2',
      port: 443,
      ipv6: false,
      mediaOnly: false,
      cdn: false,
      secret: undefined,
      tcpoOnly: false,
      thisPortOnly: false,
      static: false,
    },
  ],
}

/** A message update naming a peer and a message, as MTProto delivers one. */
const update = (id = 11): TlValue => ({
  _: 'updateNewMessage',
  message: {
    _: 'message',
    id,
    peer_id: { _: 'peerUser', user_id: 5n },
    from_id: { _: 'peerUser', user_id: 5n },
    message: 'hello',
    date: 1_700_000_000,
  },
  pts: 2,
  pts_count: 1,
})

/**
 * An account whose calls are recorded instead of sent.
 *
 * The channel seam the network layer already offers, so what a handler does
 * reaches the same place a real call would and stops there.
 */
function harness() {
  const asked: TlValue[] = []
  const account = new Account({
    apiId: 1,
    apiHash: 'hash',
    storage: memory(),
    keys: [],
    bootstrap: BOOTSTRAP,
    openChannel: async (options) =>
      ({
        dcId: options.address.id,
        authorization: options.authorization ?? {
          key: AuthKey.from(new Uint8Array(256)),
          salt: 0n,
          // A key with a lifetime is what the datacenter layer vouches for and
          // then uses; one without would leave it looking for another forever.
          ...(options.expiresIn === undefined ? {} : { expiresAt: 2_000_000_000 }),
        },
        state: 'ready',
        async invoke(query: TlValue) {
          asked.push(query)

          return { _: 'boolTrue' } as TlValue
        },
        bind: async () => {},
        close() {},
      }) as never,
    schedule: () => () => {},
  })

  return { account, asked }
}

/** The peer the update names, as the account would have learned it. */
const PEER = { kind: 'user', id: 5n, accessHash: 9n, min: false, usernames: [] } as const

describe('answering an update', () => {
  it('sends the text to the peer the update came from', async () => {
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.reply('hello back')
    })
    await account.deliver(update())

    const sent = asked.at(-1)
    expect(sent?.['_']).toBe('messages.sendMessage')
    expect(sent?.['message']).toBe('hello back')
    expect(sent?.['peer']).toEqual({ _: 'inputPeerUser', user_id: 5n, access_hash: 9n })
    await account.stop()
  })

  it('hands back the message it sent, found against its own identifier', async () => {
    // A handler that has just replied usually wants to do something else with
    // what it sent. MTProto answers a send with the updates it caused rather
    // than with the message, so the identifier is picked out of them against the
    // number this send was deduplicated by.
    const asked: TlValue[] = []
    const account = new Account({
      apiId: 1,
      apiHash: 'hash',
      storage: memory(),
      keys: [],
      bootstrap: BOOTSTRAP,
      openChannel: async (options) =>
        ({
          dcId: options.address.id,
          authorization: options.authorization ?? {
            key: AuthKey.from(new Uint8Array(256)),
            salt: 0n,
            ...(options.expiresIn === undefined ? {} : { expiresAt: 2_000_000_000 }),
          },
          state: 'ready',
          async invoke(query: TlValue) {
            asked.push(query)
            if (query._ !== 'messages.sendMessage') return { _: 'boolTrue' } as TlValue

            const random = query['random_id']

            return {
              _: 'updates',
              updates: [
                // Somebody else's message, arriving in the same batch.
                { _: 'updateMessageID', id: 8, random_id: 0x7777n },
                { _: 'updateMessageID', id: 99, random_id: random },
                {
                  _: 'updateNewMessage',
                  message: {
                    _: 'message',
                    id: 99,
                    peer_id: { _: 'peerUser', user_id: 5n },
                    message: 'hello back',
                    date: 1_700_000_000,
                  },
                  pts: 1,
                  pts_count: 1,
                },
              ],
              users: [],
              chats: [],
              date: 1_700_000_000,
              seq: 0,
            } as TlValue
          },
          bind: async () => {},
          close() {},
        }) as never,
      schedule: () => () => {},
    })

    await account.connect()
    await account.peers.save(PEER)

    let sent: SentMessage | undefined
    account.on('message', async (event) => {
      sent = await event.reply('hello back')
    })
    await account.deliver(update())

    expect(sent?.id).toBe(99)
    expect(sent?.message?._ === 'message' ? sent.message.message : undefined).toBe('hello back')
    expect(sent?.raw['_']).toBe('updates')
    await account.stop()
  })

  it('quotes the message it is answering', async () => {
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.reply('hello back')
    })
    await account.deliver(update(42))

    expect(asked.at(-1)?.['reply_to']).toEqual({
      _: 'inputReplyToMessage',
      reply_to_msg_id: 42,
    })
    await account.stop()
  })

  it('gives each send an identifier of its own', async () => {
    // Telegram deduplicates by it, so two sends that shared one would become
    // one message.
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.reply('once')
      await event.reply('twice')
    })
    await account.deliver(update())

    const [first, second] = asked.slice(-2)
    expect(typeof first?.['random_id']).toBe('bigint')
    expect(first?.['random_id']).not.toBe(second?.['random_id'])
    await account.stop()
  })

  it('answers in the conversation rather than to whoever spoke', async () => {
    // In a group these are different peers. A reply that went to the sender
    // would arrive as a private message nobody in the conversation can see.
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save({ kind: 'chat', id: 77n, min: false, usernames: [] })
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.reply('to the group')
    })
    await account.deliver({
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id: 3,
        peer_id: { _: 'peerChat', chat_id: 77n },
        from_id: { _: 'peerUser', user_id: 5n },
        message: 'hello all',
        date: 1_700_000_000,
      },
      pts: 2,
      pts_count: 1,
    })

    expect(asked.at(-1)?.['peer']).toEqual({ _: 'inputPeerChat', chat_id: 77n })
    await account.stop()
  })

  it('refuses when the event names no conversation at all', async () => {
    const { account } = harness()
    await account.connect()
    await account.peers.save(PEER)

    let failure: unknown
    account.on('message', async (event) => {
      failure = await event.reply('hello').catch((error: unknown) => error)
    })
    // A message with an identifier but no peer: there is something to answer
    // and nowhere to send it.
    await account.deliver({
      _: 'updateNewMessage',
      message: { _: 'message', id: 4, message: 'orphan', date: 1_700_000_000 },
      pts: 2,
      pts_count: 1,
    })

    expect((failure as Error).message).toMatch(/names no conversation/)
    await account.stop()
  })

  it('refuses when the peer is not one this account knows', async () => {
    // No hash, no reference. Refused here rather than sent as something
    // Telegram rejects for a reason that describes the call instead.
    const { account } = harness()
    await account.connect()

    let failure: unknown
    account.on('message', async (event) => {
      failure = await event.reply('hello').catch((error: unknown) => error)
    })
    await account.deliver(update())

    // Refused where `account.sendText` refuses it, since a reply is sent the
    // same way.
    expect(failure).toBeInstanceOf(PeerError)
    expect((failure as Error).message).toMatch(/has not seen user 5/)
    await account.stop()
  })

  it('refuses when the event carries no message to answer', async () => {
    const { account } = harness()
    await account.connect()
    await account.peers.save(PEER)

    let failure: unknown
    account.on('message_deleted', async (event) => {
      failure = await event.reply('hello').catch((error: unknown) => error)
    })
    await account.deliver({ _: 'updateDeleteMessages', messages: [1], pts: 2, pts_count: 1 })

    expect((failure as Error).message).toMatch(/carries no message/)
    await account.stop()
  })

  it('refuses while the account is not connected', async () => {
    const { account } = harness()
    await account.peers.save(PEER)

    let failure: unknown
    account.on('message', async (event) => {
      failure = await event.reply('hello').catch((error: unknown) => error)
    })
    await account.deliver(update())

    expect((failure as Error).message).toMatch(/not connected/)
  })
})

describe('reacting to an update', () => {
  it('reacts to the message the update carries', async () => {
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.react('👍')
    })
    await account.deliver(update(7))

    const sent = asked.at(-1)
    expect(sent?.['_']).toBe('messages.sendReaction')
    expect(sent?.['msg_id']).toBe(7)
    expect(sent?.['peer']).toEqual({ _: 'inputPeerUser', user_id: 5n, access_hash: 9n })
    expect(sent?.['reaction']).toEqual([{ _: 'reactionEmoji', emoticon: '👍' }])
    await account.stop()
  })

  it('clears the reaction when given nothing', async () => {
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.react('')
    })
    await account.deliver(update())

    expect(asked.at(-1)?.['reaction']).toEqual([])
    await account.stop()
  })

  it('refuses when the event carries no message to react to', async () => {
    const { account } = harness()
    await account.connect()
    await account.peers.save(PEER)

    let failure: unknown
    account.on('message_deleted', async (event) => {
      failure = await event.react('👍').catch((error: unknown) => error)
    })
    await account.deliver({ _: 'updateDeleteMessages', messages: [1], pts: 2, pts_count: 1 })

    expect((failure as Error).message).toMatch(/carries no message/)
    await account.stop()
  })
})

describe('an event built without an account', () => {
  it('says so rather than pretending it can act', async () => {
    // A context can be built for reading — the normalizer does it — and reading
    // is all it can honestly offer. The members exist so the failure names the
    // reason rather than a missing property.
    const { mtprotoContext } = await import('../src/normalize/context.js')
    const context = mtprotoContext(update(), {
      client: { name: 'nobody' },
      log: { debug() {}, info() {}, warn() {}, error() {}, child: () => context.log } as never,
    })

    await expect(context.reply('hello')).rejects.toThrow(/outside an account/)
    await expect(context.react('👍')).rejects.toThrow(/outside an account/)
    await expect(context.edit('corrected')).rejects.toThrow(/outside an account/)
    await expect(context.delete()).rejects.toThrow(/outside an account/)
    await expect(context.api.call({ _: 'help.getConfig' })).rejects.toThrow(/outside an account/)
  })
})

describe('editing the message an update carries', () => {
  it('replaces the text of that message, in the conversation it arrived in', async () => {
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.edit('corrected')
    })
    await account.deliver(update(42))

    const sent = asked.at(-1)
    expect(sent?.['_']).toBe('messages.editMessage')
    expect(sent?.['message']).toBe('corrected')
    expect(sent?.['id']).toBe(42)
    expect(sent?.['peer']).toEqual({ _: 'inputPeerUser', user_id: 5n, access_hash: 9n })
    await account.stop()
  })

  it('carries no identifier of its own', async () => {
    // An edit names the message it changes, so there is nothing to deduplicate:
    // the same edit twice leaves the same text. A random identifier here would
    // be a field the method does not carry.
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.edit('corrected')
    })
    await account.deliver(update(42))

    expect(asked.at(-1)?.['random_id']).toBeUndefined()
    expect(asked.at(-1)?.['reply_to']).toBeUndefined()
    await account.stop()
  })

  it('edits the conversation rather than whoever spoke in it', async () => {
    // The message lives in the conversation. Addressing the sender would edit
    // nothing there, and in a group it would name a different peer entirely.
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save({ kind: 'chat', id: 77n, min: false, usernames: [] })
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.edit('corrected')
    })
    await account.deliver({
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id: 3,
        peer_id: { _: 'peerChat', chat_id: 77n },
        from_id: { _: 'peerUser', user_id: 5n },
        message: 'hello all',
        date: 1_700_000_000,
      },
      pts: 1,
      pts_count: 1,
    })

    expect(asked.at(-1)?.['peer']).toEqual({ _: 'inputPeerChat', chat_id: 77n })
    expect(asked.at(-1)?.['id']).toBe(3)
    await account.stop()
  })

  it('refuses an event that carries no message to edit', async () => {
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)
    const before = asked.length
    let refusal: unknown

    account.on('mtproto:typing', async (event) => {
      refusal = await event.edit('corrected').catch((error: unknown) => error)
    })
    await account.deliver({
      _: 'updateUserTyping',
      user_id: 5n,
      action: { _: 'sendMessageTypingAction' },
    })

    expect((refusal as Error).message).toMatch(/carries no message to edit/)
    expect(asked).toHaveLength(before)
    await account.stop()
  })

  it('refuses a peer this account has never written down', async () => {
    // Nothing is invented: a reference needs an access hash issued to this
    // account, and one that was never harvested cannot be made up.
    const { account, asked } = harness()
    await account.connect()
    const before = asked.length
    let refusal: unknown

    account.on('message', async (event) => {
      refusal = await event.edit('corrected').catch((error: unknown) => error)
    })
    await account.deliver(update(42))

    expect((refusal as Error).message).toMatch(/is not known to this account/)
    expect(asked).toHaveLength(before)
    await account.stop()
  })
})

describe('deleting the message an update carries', () => {
  it('deletes it for everyone, outside a channel', async () => {
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)

    account.on('message', async (event) => {
      await event.delete()
    })
    await account.deliver(update(42))

    const sent = asked.at(-1)
    expect(sent?.['_']).toBe('messages.deleteMessages')
    expect(sent?.['id']).toEqual([42])
    expect(sent?.['revoke']).toBe(true)
    await account.stop()
  })

  it('names the channel rather than the peer, inside one', async () => {
    // A channel keeps its messages under the channel rather than in this
    // account's own numbering, so the ordinary method would name a message
    // somewhere else entirely.
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save({
      kind: 'channel',
      id: 55n,
      accessHash: 13n,
      min: false,
      usernames: [],
    })

    account.on('message', async (event) => {
      await event.delete()
    })
    await account.deliver({
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id: 9,
        peer_id: { _: 'peerChannel', channel_id: 55n },
        message: 'a post',
        date: 1_700_000_000,
      },
      pts: 1,
      pts_count: 1,
    })

    const sent = asked.at(-1)
    expect(sent?.['_']).toBe('channels.deleteMessages')
    expect(sent?.['channel']).toEqual({ _: 'inputChannel', channel_id: 55n, access_hash: 13n })
    expect(sent?.['id']).toEqual([9])
    // The channel method carries no such choice, and none is invented for it.
    expect(sent?.['revoke']).toBeUndefined()
    await account.stop()
  })

  it('refuses an event that carries no message to delete', async () => {
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save(PEER)
    const before = asked.length
    let refusal: unknown

    account.on('mtproto:typing', async (event) => {
      refusal = await event.delete().catch((error: unknown) => error)
    })
    await account.deliver({
      _: 'updateUserTyping',
      user_id: 5n,
      action: { _: 'sendMessageTypingAction' },
    })

    expect((refusal as Error).message).toMatch(/carries no message to delete/)
    expect(asked).toHaveLength(before)
    await account.stop()
  })

  it('refuses a channel this account has only seen in passing', async () => {
    // A reduced peer's hash means something only where it arrived. Naming a
    // channel with one produces a request Telegram rejects as a problem with
    // the call rather than with the channel.
    const { account, asked } = harness()
    await account.connect()
    await account.peers.save({
      kind: 'channel',
      id: 55n,
      accessHash: 13n,
      min: true,
      usernames: [],
    })
    const before = asked.length
    let refusal: unknown

    account.on('message', async (event) => {
      refusal = await event.delete().catch((error: unknown) => error)
    })
    await account.deliver({
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id: 9,
        peer_id: { _: 'peerChannel', channel_id: 55n },
        message: 'a post',
        date: 1_700_000_000,
      },
      pts: 1,
      pts_count: 1,
    })

    expect((refusal as Error).message).toMatch(/only seen in passing/)
    expect(asked).toHaveLength(before)
    await account.stop()
  })

  it('refuses a channel this account has never written down', async () => {
    const { account, asked } = harness()
    await account.connect()
    const before = asked.length
    let refusal: unknown

    account.on('message', async (event) => {
      refusal = await event.delete().catch((error: unknown) => error)
    })
    await account.deliver({
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id: 9,
        peer_id: { _: 'peerChannel', channel_id: 55n },
        message: 'a post',
        date: 1_700_000_000,
      },
      pts: 1,
      pts_count: 1,
    })

    expect((refusal as Error).message).toMatch(/is not known to this account/)
    expect(asked).toHaveLength(before)
    await account.stop()
  })
})
