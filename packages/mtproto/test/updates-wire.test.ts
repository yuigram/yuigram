// SPDX-License-Identifier: MPL-2.0

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

import { TelegramError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { areaFor } from '../src/storage/ownership.js'
import type { TlValue } from '../src/tl/index.js'
import type { MockConnection } from './server/datacenter.js'
import { FileServer } from './server/files.js'
import { mockAccount } from './support/mock-account.js'

/** A transfer range, the size the protocol moves files in. */
const PART = 512 * 1024

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

/**
 * Which connection may move an account through the update stream.
 *
 * A client holds more than one connection, and they look alike on the wire: the
 * same framing, the same envelope, the same key exchange. Only one of them is
 * the account's update stream — the first main connection to the datacenter the
 * account belongs to — and the rest are separate conversations that happen to
 * be shaped the same.
 *
 * That distinction is a property of routing, so every case here delivers sealed
 * bytes down a chosen connection rather than handing the account a value. A
 * case that called `feed()` would prove the sequence works and say nothing about
 * where an update is allowed to come from, which is what is being decided.
 */
describe('which connection may move an account through the stream', () => {
  /** Seal on a chosen connection, rather than on whichever one can carry it. */
  async function pushOn(connection: MockConnection, value: TlValue): Promise<void> {
    const deadline = Date.now() + 5000

    for (;;) {
      if (connection.open()) {
        const bytes = connection.peer.push(value)
        if (bytes !== undefined) {
          connection.push(bytes)

          return
        }
      }

      if (Date.now() > deadline) throw new Error('that connection never carried a session')

      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  /** Every typing event a handler saw, by sender. */
  function watching(instance: ReturnType<typeof mockAccount>): bigint[] {
    const seen: bigint[] = []
    instance.account.on('mtproto:typing', (event) => {
      if (event.sender !== undefined) seen.push(event.sender.id)
    })

    return seen
  }

  /** What a download asks for, so a transfer opens connections of its own. */
  const fileAt = (server: FileServer, id: bigint) => {
    const stored = server.add(id, { size: PART, dcId: 2 })

    return {
      dcId: 2,
      size: PART,
      location: {
        _: 'inputDocumentFileLocation',
        id: stored.fileId,
        access_hash: 5n,
        file_reference: stored.reference,
        thumb_size: '',
      },
    } as const
  }

  it('does not take one from a connection to another datacenter', async () => {
    // A main connection to a datacenter the account does not live at exists for
    // a call that was redirected there. It carries no common box: a position
    // advanced by it is a position `updates.getDifference` at the home
    // datacenter would then contradict.
    const instance = mockAccount()

    try {
      await instance.account.connect()
      const seen = watching(instance)

      await instance.account.api.call({ _: 'help.getConfig' })
      await instance.account.reach(4).invoke({ _: 'ping', ping_id: 1n })

      const elsewhere = instance.datacenter(4).connections.at(-1)
      expect(elsewhere, 'no connection was opened to datacenter 4').toBeDefined()

      await pushOn(elsewhere as MockConnection, typing(70n))
      await settle(300)

      expect(seen).toEqual([])

      // The control, on the same account and in the same run: the home
      // datacenter's connection still delivers, so this is about where the
      // update came from rather than about a client that stopped listening.
      await push(instance.datacenter(2), typing(71n))
      await settle(300)

      expect(seen).toEqual([71n])
    } finally {
      await instance.dispose()
    }
  }, 40_000)

  it('does not take one from a transfer connection to its own datacenter', async () => {
    // Same datacenter, same address, same key — and not the stream. A transfer
    // connection exists to move bytes, and what arrives on it has no standing
    // to say where the account is in a conversation it is not part of.
    const home = new FileServer(2)
    const instance = mockAccount({
      api: (query) => (query._.startsWith('upload.') ? home.invoke(query) : undefined),
    })

    try {
      await instance.account.connect()
      const seen = watching(instance)

      await instance.account.api.call({ _: 'help.getConfig' })
      // The connection that carried that call, held before the download so it
      // can be told apart from the ones the download opens.
      const beforeTransfer = instance.datacenter(2).connections.length
      const stream = instance.datacenter(2).connections.at(-1) as MockConnection

      await instance.account.download(fileAt(home, 0x0f11_e0a1n))

      // Identified by construction: everything opened after the call above was
      // opened to carry the transfer.
      const transfer = instance.datacenter(2).connections.slice(beforeTransfer)
      expect(transfer.length, 'the download opened no connection of its own').toBeGreaterThan(0)

      for (const connection of transfer) await pushOn(connection, typing(80n))
      await settle(300)

      expect(seen).toEqual([])

      // And the one that is the stream still is.
      await pushOn(stream, typing(81n))
      await settle(300)

      expect(seen).toEqual([81n])
    } finally {
      await instance.dispose()
    }
  }, 40_000)

  it('does not chase a gap a transfer connection announced', async () => {
    // A transfer connection gets a session of its own, and the server
    // announcing a new one there says nothing about updates: none were going to
    // be delivered on it. Chasing it would fetch a difference for every
    // connection a download opened.
    const home = new FileServer(2)
    const asked: string[] = []
    const instance = mockAccount({
      // A position to be behind, so an account that did chase would have
      // something to chase from.
      stored: new Map<string, unknown>([
        [
          `${areaFor('account')}updates:state`,
          { pts: 40, qts: 1, seq: 0, date: 1_700_000_000, channels: {} },
        ],
      ]),
      api: (query) => {
        asked.push(query._)
        if (query._.startsWith('upload.')) return home.invoke(query)
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
      const beforeTransfer = instance.datacenter(2).connections.length

      await instance.account.download(fileAt(home, 0x0f11_e0a2n))

      const transfer = instance.datacenter(2).connections.slice(beforeTransfer)
      expect(transfer.length).toBeGreaterThan(0)

      // Twice on the same connection, which is what makes the second a
      // replacement rather than a session starting.
      for (const connection of transfer) {
        const salt = connection.peer.salt ?? 0n
        await pushOn(connection, {
          _: 'new_session_created',
          first_msg_id: 1n,
          unique_id: 0x5555_5555_5555_5551n,
          server_salt: salt,
        })
        await pushOn(connection, {
          _: 'new_session_created',
          first_msg_id: 1n,
          unique_id: 0x5555_5555_5555_5552n,
          server_salt: salt,
        })
      }
      await settle(600)

      expect(asked.filter((name) => name === 'updates.getDifference')).toEqual([])
    } finally {
      await instance.dispose()
    }
  }, 40_000)

  it('stops taking the stream from a datacenter it has moved away from', async () => {
    // A redirected sign-in moves the account, and the connection that was the
    // stream is still open with a live session at the datacenter it left. What
    // arrives there is no longer this account's stream, and what arrives at the
    // datacenter it moved to is.
    const instance = mockAccount({
      api: (query, dcId) => {
        if (query._ !== 'auth.sendCode') return undefined
        if (dcId === 2) throw new TelegramError('PHONE_MIGRATE_4 (303)')

        return {
          _: 'auth.sentCode',
          type: { _: 'auth.sentCodeTypeApp', length: 5 },
          phone_code_hash: 'hash-of-the-code',
          timeout: 60,
        }
      },
    })

    try {
      await instance.account.connect()
      const seen = watching(instance)

      await instance.account.api.call({ _: 'help.getConfig' })
      const left = instance.datacenter(2).connections.at(-1) as MockConnection

      // Before the move, the connection at datacenter 2 is the stream.
      await pushOn(left, typing(90n))
      await settle(300)
      expect(seen).toEqual([90n])

      const state = await instance.account.sendCode('+70000000000')
      expect(state.dcId).toBe(4)

      // After it, the same connection is a conversation with a datacenter this
      // account no longer belongs to.
      await pushOn(left, typing(91n))
      await settle(300)
      expect(seen).toEqual([90n])

      // And the datacenter it moved to is the stream now.
      await push(instance.datacenter(4), typing(92n))
      await settle(300)
      expect(seen).toEqual([90n, 92n])
    } finally {
      await instance.dispose()
    }
  }, 40_000)

  it('keeps two accounts apart when the traffic looks identical', async () => {
    // Two accounts, one store, the same update sealed for each. Each must see
    // its own and only its own: a sequence or a record of what has been
    // dispatched that was shared would show one account the other's traffic, or
    // suppress the second as a duplicate of the first.
    const shared = new Map<string, unknown>()
    const alice = mockAccount({ name: 'alice', stored: shared })
    const bob = mockAccount({ name: 'bob', stored: shared })

    try {
      await alice.account.connect()
      await bob.account.connect()
      const hers = watching(alice)
      const his = watching(bob)

      await alice.account.api.call({ _: 'help.getConfig' })
      await bob.account.api.call({ _: 'help.getConfig' })

      // The same value, sealed separately for each account under its own key.
      await push(alice.datacenter(2), typing(55n))
      await settle(300)

      expect(hers).toEqual([55n])
      expect(his).toEqual([])

      await push(bob.datacenter(2), typing(55n))
      await settle(300)

      // Not suppressed as something already seen: the record of what has been
      // dispatched belongs to an account, not to the process.
      expect(his).toEqual([55n])
      expect(hers).toEqual([55n])
    } finally {
      await alice.dispose()
      await bob.dispose()
    }
  }, 40_000)
})
