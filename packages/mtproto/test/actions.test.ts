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

import { memory } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Account } from '../src/account.js'
import { AuthKey } from '../src/message/auth-key.js'
import type { DcConfiguration } from '../src/network/dc.js'
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

    expect((failure as Error).message).toMatch(/not known to this account/)
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
    await expect(context.api.call({ _: 'help.getConfig' })).rejects.toThrow(/outside an account/)
  })
})
