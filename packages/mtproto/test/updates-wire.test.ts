/**
 * Updates as they actually arrive: over the connection.
 *
 * Everywhere else in this suite an update is handed to the account directly,
 * which is the right way to test what happens *after* one arrives. It skips
 * everything that happens before: the decryption, the message key, the framing,
 * the session's judgement about what is an answer and what is not, and the
 * sequence's judgement about what this account has already seen.
 *
 * That path was not connected. A datacenter could seal an update, the client
 * could decrypt it, and it reached nothing — every case in this file failed
 * before the connection layer was wired to the sequence, and none of the
 * existing ones did.
 *
 * The peer here is the same one the rest of the suite uses, sealing under the
 * key the handshake established. Nothing is faked past the socket.
 */

import { describe, expect, it } from 'vitest'
import { areaFor } from '../src/storage/ownership.js'
import type { TlValue } from '../src/tl/index.js'
import type { MockConnection } from './server/datacenter.js'
import { mockAccount } from './support/mock-account.js'

/** An update the sequence does not gate on a position in the stream. */
const typing = (userId: bigint): TlValue => ({
  _: 'updateShort',
  update: {
    _: 'updateUserTyping',
    user_id: userId,
    action: { _: 'sendMessageTypingAction' },
  },
  date: 1_700_000_000,
})

/** A datacenter, as much of one as these cases touch. */
interface Answering {
  readonly connections: readonly MockConnection[]
}

/**
 * Seal a value on whichever connection can carry it, and say which.
 *
 * Newest first, because that is the one an account is using — but not only the
 * newest: a connection that has just been opened has no session until its
 * handshake finishes, and a pool keeps a spare. Waiting for one that can carry
 * the message is what a server does anyway; failing immediately would be the
 * case racing the client.
 */
async function sealOn(
  datacenter: Answering,
  value: TlValue,
): Promise<{ connection: MockConnection; bytes: Uint8Array }> {
  const deadline = Date.now() + 5000

  for (;;) {
    for (const connection of [...datacenter.connections].reverse()) {
      if (!connection.open()) continue

      const bytes = connection.peer.push(value)
      if (bytes !== undefined) return { connection, bytes }
    }

    if (Date.now() > deadline) {
      const states = datacenter.connections
        .map((one, index) => `${String(index)}:${one.open() ? 'open' : 'closed'}`)
        .join(' ')

      throw new Error(`no connection could carry the message (${states})`)
    }

    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** Send a value down the wire. */
async function push(datacenter: Answering, value: TlValue): Promise<void> {
  const { connection, bytes } = await sealOn(datacenter, value)
  connection.push(bytes)
}

/** Let the microtasks and the timer the stream uses run. */
const settle = async (ms = 150): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('an update the datacenter sends', () => {
  it('is decrypted, judged, normalized and dispatched', async () => {
    const instance = mockAccount()
    const seen: string[] = []

    try {
      await instance.account.connect()
      instance.account.on('mtproto:typing', (event) => {
        seen.push(`${event.kind}:${String(event.sender?.id)}`)
      })

      // A call first, so a connection exists and is carrying the session.
      await instance.account.api.call({ _: 'help.getConfig' })

      await push(instance.datacenter(2), typing(42n))
      await settle()

      expect(seen).toEqual(['mtproto:typing:42'])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('arrives in the order it was sent', async () => {
    const instance = mockAccount()
    const seen: bigint[] = []

    try {
      await instance.account.connect()
      instance.account.on('mtproto:typing', (event) => {
        if (event.sender !== undefined) seen.push(event.sender.id)
      })
      await instance.account.api.call({ _: 'help.getConfig' })

      for (const id of [1n, 2n, 3n, 4n, 5n]) await push(instance.datacenter(2), typing(id))
      await settle(300)

      expect(seen).toEqual([1n, 2n, 3n, 4n, 5n])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('is delivered once when the same bytes arrive twice', async () => {
    // A replay: one message, one identifier, delivered twice. A network that
    // duplicated a packet produces this, and so does anyone who recorded one.
    // Sealing the same value twice would be two legitimate messages instead,
    // which is a different thing and not what is being checked.
    const instance = mockAccount()
    const seen: bigint[] = []

    try {
      await instance.account.connect()
      instance.account.on('mtproto:typing', (event) => {
        if (event.sender !== undefined) seen.push(event.sender.id)
      })
      await instance.account.api.call({ _: 'help.getConfig' })

      const { connection, bytes } = await sealOn(instance.datacenter(2), typing(21n))

      connection.push(bytes)
      connection.push(bytes)
      await settle(400)

      expect(seen).toEqual([21n])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('is read out of a container the way a single one is', async () => {
    // The stream carries several at once, and the container is not a wrapper a
    // handler should ever see.
    const instance = mockAccount()
    const seen: bigint[] = []

    try {
      await instance.account.connect()
      instance.account.on('mtproto:typing', (event) => {
        if (event.sender !== undefined) seen.push(event.sender.id)
      })
      await instance.account.api.call({ _: 'help.getConfig' })

      await push(instance.datacenter(2), {
        _: 'updates',
        updates: [
          { _: 'updateUserTyping', user_id: 8n, action: { _: 'sendMessageTypingAction' } },
          { _: 'updateUserTyping', user_id: 9n, action: { _: 'sendMessageTypingAction' } },
        ],
        users: [],
        chats: [],
        date: 1_700_000_000,
        seq: 0,
      })
      await settle()

      expect(seen).toEqual([8n, 9n])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('is read out of a compressed container', async () => {
    // A container large enough to be worth compressing arrives gzipped, and
    // nothing above the session layer should be able to tell.
    const instance = mockAccount()
    const seen: bigint[] = []

    try {
      await instance.account.connect()
      instance.account.on('mtproto:typing', (event) => {
        if (event.sender !== undefined) seen.push(event.sender.id)
      })
      await instance.account.api.call({ _: 'help.getConfig' })

      // Any connection will do so long as it has a session; the helper finds
      // one, and the value it seals is thrown away.
      const { connection } = await sealOn(instance.datacenter(2), { _: 'msgs_ack', msg_ids: [] })
      const bytes = connection.peer.pushCompressed({
        _: 'updates',
        updates: Array.from({ length: 40 }, (_, index) => ({
          _: 'updateUserTyping',
          user_id: BigInt(100 + index),
          action: { _: 'sendMessageTypingAction' },
        })),
        users: [],
        chats: [],
        date: 1_700_000_000,
        seq: 0,
      })

      expect(bytes, 'the peer could not compress an update').toBeDefined()
      connection.push(bytes as Uint8Array)
      await settle(300)

      expect(seen.length).toBe(40)
      expect(seen[0]).toBe(100n)
      expect(seen.at(-1)).toBe(139n)
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})

describe('what the stream does not deliver to handlers', () => {
  it('ignores an answer nobody is waiting for', async () => {
    // A result naming a request no longer in flight — one that was withdrawn,
    // or that timed out while the server was still working on it — is reported
    // upward rather than dropped, because the layer above may want to know. It
    // is not an update, and the sequence treats whatever it is handed as one,
    // so it must not be handed this.
    //
    // A pong or an acknowledgement would not do here: the session layer turns
    // those into events of their own and they never arrive as a message at all,
    // which is what made an earlier version of this case pass without testing
    // anything.
    const instance = mockAccount()
    const seen: string[] = []

    try {
      await instance.account.connect()
      instance.account.on('mtproto:raw', (event) => {
        seen.push(event.raw._)
      })
      await instance.account.api.call({ _: 'help.getConfig' })

      await push(instance.datacenter(2), {
        _: 'rpc_result',
        req_msg_id: 0x7fff_ffff_0000_0000n,
        result: { _: 'boolTrue' },
      })
      await settle()

      expect(seen).toEqual([])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('ignores a service message that is not an update', async () => {
    const instance = mockAccount()
    const seen: string[] = []

    try {
      await instance.account.connect()
      instance.account.on('mtproto:raw', (event) => {
        seen.push(event.raw._)
      })
      await instance.account.api.call({ _: 'help.getConfig' })

      await push(instance.datacenter(2), {
        _: 'msg_detailed_info',
        msg_id: 1n,
        answer_msg_id: 2n,
        bytes: 16,
        status: 0,
      })
      await settle()

      expect(seen).toEqual([])
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})

describe('a session the server replaced', () => {
  /**
   * Announce a session on whichever connection can carry it.
   *
   * Two announcements on one connection mean a gap: the first is just the
   * session starting. The salt announced is the one the peer already accepts,
   * because naming another makes it refuse the client's next message — which
   * ends the connection for a reason that has nothing to do with the gap.
   */
  const announce = async (
    datacenter: { readonly connections: readonly MockConnection[] },
    uniqueId: bigint,
  ): Promise<void> => {
    const { connection, bytes } = await sealOn(datacenter, { _: 'msgs_ack', msg_ids: [] })
    void bytes

    const salt = connection.peer.salt
    const announced = connection.peer.push({
      _: 'new_session_created',
      first_msg_id: 1n,
      unique_id: uniqueId,
      server_salt: salt ?? 0n,
    })

    if (announced !== undefined) connection.push(announced)
  }

  it('is not chased by an account that has never run', async () => {
    // Nothing is behind an account with no place in the stream, so asking for
    // the difference would fetch a backlog it was never meant to see.
    const asked: string[] = []
    const instance = mockAccount({
      api: (query) => {
        asked.push(query._)

        return undefined
      },
    })

    try {
      await instance.account.connect()
      await instance.account.api.call({ _: 'help.getConfig' })

      await announce(instance.datacenter(2), 0x1111_1111_1111_1111n)
      await announce(instance.datacenter(2), 0x2222_2222_2222_2222n)
      await settle(400)

      expect(asked.filter((name) => name.startsWith('updates.'))).toEqual([])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('is chased by an account that had a place in the stream', async () => {
    const asked: string[] = []
    // Written where this account keeps it: inside its own area of the store,
    // which is where it will look for it.
    const stored = new Map<string, unknown>([
      [
        `${areaFor('account')}updates:state`,
        { pts: 40, qts: 1, seq: 0, date: 1_700_000_000, channels: {} },
      ],
    ])

    const instance = mockAccount({
      stored,
      api: (query) => {
        asked.push(query._)
        if (query._ === 'updates.getState') {
          return {
            _: 'updates.state',
            pts: 40,
            qts: 1,
            date: 1_700_000_000,
            seq: 0,
            unread_count: 0,
          }
        }
        if (query._ === 'updates.getDifference') {
          return { _: 'updates.differenceEmpty', date: 1_700_000_000, seq: 0 }
        }

        return undefined
      },
    })

    try {
      await instance.account.connect()
      await instance.account.api.call({ _: 'help.getConfig' })

      await announce(instance.datacenter(2), 0x3333_3333_3333_3333n)
      await announce(instance.datacenter(2), 0x4444_4444_4444_4444n)
      await settle(600)

      // Counted rather than merely observed: a client that chased a gap on
      // every fresh session, rather than only on one that replaced another,
      // would fetch a difference twice here and ask the server for a backlog
      // every time it reconnected.
      const differences = asked.filter((name) => name === 'updates.getDifference').length

      expect(differences).toBe(1)
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})

describe('an account that is going away', () => {
  it('stops without dispatching what was still in flight', async () => {
    // A handler that runs after the account has been disposed would be acting
    // on a client that no longer has a connection, a store or a sequence.
    const instance = mockAccount()
    const seen: string[] = []

    try {
      await instance.account.connect()
      instance.account.on('mtproto:typing', (event) => {
        seen.push(event.kind)
      })
      await instance.account.api.call({ _: 'help.getConfig' })

      await push(instance.datacenter(2), typing(1n))
      // Disposed in the same turn the update was pushed, so it is in flight.
      await instance.dispose()
      const after = seen.length
      await settle()

      expect(seen.length).toBe(after)
    } finally {
      // Disposing twice is what a caller that cannot tell would do.
      await instance.dispose()
    }
  }, 30_000)
})
