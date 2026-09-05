/**
 * An account against datacenters that answer.
 *
 * The cases in `account.test.ts` are about the façade: what it owns, what it
 * delegates, and where an update goes once one arrives. They replace the
 * channel, so nothing in them proves that an account put on a network would
 * ever reach one.
 *
 * These do. Only the socket is replaced; everything above it is the shipping
 * implementation, so a call made here travels the whole way:
 *
 * ```
 *   account.reach(dc).invoke(...)
 *     └─ pools ─ connections ─ channel ─ handshake ─ session ─ sealed bytes ─┐
 *                                                                            │
 *        a datacenter answering in this process, refusing what a real one     │
 *        refuses and remembering what a real one remembers  <────────────────┘
 * ```
 *
 * An account has to authorize before it can be used, and that is three
 * connections rather than one: a long-lived key is negotiated on the first, a
 * key with a lifetime is negotiated and vouched for on the second, and only the
 * third carries the call. All of it runs here for real, which is why these
 * cases cost seconds rather than milliseconds.
 */

import { App } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import type { MockDatacenter } from './server/datacenter.js'
import { createServerKey } from './server/keys.js'
import type { Fault } from './server/server.js'
import { type MockAccount, mockAccount } from './support/mock-account.js'

/**
 * Longer than the default, because these cases run the exchange rather than
 * standing in for it: a 2048-bit Diffie-Hellman agreement costs real time, and
 * an account performs two of them per datacenter it reaches.
 */
vi.setConfig({ testTimeout: 60_000 })

/**
 * The key pair the datacenters here offer.
 *
 * Generated once. Which key a datacenter holds is not what any of these cases
 * is about, and a fresh pair for each of them costs more than the exchanges
 * they exist to run.
 */
const KEY = createServerKey()

/** A harness on the shared key, so no case pays for a new one. */
const harness = (options: Parameters<typeof mockAccount>[0] = {}) =>
  mockAccount({ key: KEY, ...options })

/** Which connections at a datacenter negotiated a key of their own. */
const exchanges = (datacenter: MockDatacenter) =>
  datacenter.connections.map((connection) => connection.peer.result !== undefined)

/** Whether each socket a datacenter answered is still held open. */
const sockets = (datacenter: MockDatacenter) =>
  datacenter.connections.map((connection) => connection.open())

/**
 * A call to make once a connection is already warm.
 *
 * Not a `ping`: a pong is a service message rather than a result, so it
 * acknowledges the ping and feeds the keepalive without settling anything a
 * caller is holding. The first call a channel makes travels wrapped and comes
 * back as a result whatever it was, which is why a ping settles there and only
 * there. A method settles wherever it is made.
 */
const PROBE = { _: 'help.getConfig' }

/** What a call did, without a rejection ending the case before it is read. */
const outcome = async (call: Promise<unknown>): Promise<string> =>
  await call.then(() => 'answered').catch((error: Error) => `refused: ${error.message}`)

/** How many times a datacenter's live connection has been asked the probe. */
const asked = (datacenter: MockDatacenter) =>
  datacenter.connections.at(-1)?.peer.seen.filter((message) => message.value['_'] === PROBE._)
    .length ?? 0

/**
 * Wait for something to become true rather than for a length of time.
 *
 * The wait ends the moment the thing it is waiting for has happened, however
 * long that took, and fails loudly rather than quietly proceeding if it never
 * does. What it waits *through* is a timer, not a microtask: a session sends
 * what it has queued on a due time, and a loop that only yielded to the check
 * phase could spin out its whole budget inside the millisecond before that
 * timer came due — which is a failure that depends on how busy the machine is
 * rather than on anything the case is about.
 */
async function until(ready: () => boolean, what: string): Promise<void> {
  for (let turn = 0; turn < 200 && !ready(); turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  if (!ready()) throw new Error(`${what} never happened`)
}

/** Watch a call without waiting for it, so a case can ask whether it ever ended. */
function watch(call: Promise<unknown>): () => boolean {
  let done = false
  const settle = () => {
    done = true
  }
  call.then(settle, settle)

  return () => done
}

/** Bring an account up and make one call, which is what authorizes it. */
async function reach(instance: MockAccount, id = 2, pingId = 1n) {
  await instance.account.connect()

  return await instance.account.reach(id).invoke({ _: 'ping', ping_id: pingId })
}

describe('an account reaching a datacenter for the first time', () => {
  it('opens nothing until something needs to travel', async () => {
    const instance = harness()
    await instance.account.connect()

    // Connecting assembles the layers; it does not reach a network. An account
    // that authorized on the way up would pay for datacenters it never uses.
    expect(instance.datacenter(2).connections).toHaveLength(0)
    await instance.dispose()
  })

  it('authorizes over the connections that takes', async () => {
    const instance = harness()
    await reach(instance)

    expect(instance.datacenter(2).connections).toHaveLength(3)
    await instance.dispose()
  })

  it('negotiates a long-lived key on the first connection', async () => {
    const instance = harness()
    await reach(instance)

    const first = instance.datacenter(2).connections[0]?.peer
    expect(first?.result).toBeDefined()
    // No lifetime: this is the key the account keeps.
    expect(first?.result?.expiresIn).toBeUndefined()
    expect(first?.bindings).toHaveLength(0)
    await instance.dispose()
  })

  it('vouches for a second key with the first, on the connection that made it', async () => {
    const instance = harness()
    await reach(instance)

    const second = instance.datacenter(2).connections[1]?.peer
    expect(second?.result?.expiresIn).toBeDefined()
    // The binding travels on the connection that negotiated the temporary key
    // and is checked against the long-lived one, which came from another.
    expect(second?.bindings).toHaveLength(1)
    await instance.dispose()
  })

  it('uses the key it settled on, rather than exchanging again', async () => {
    const instance = harness()
    await reach(instance)

    const [permanent, temporary, live] = instance.datacenter(2).connections
    expect(exchanges(instance.datacenter(2))).toEqual([true, true, false])
    // The connection carrying the call negotiated nothing, because there was
    // nothing left to agree: it is using the key the second one established.
    expect(live?.peer.authorization).toBe(temporary?.peer.result)
    expect(live?.peer.authorization).not.toBe(permanent?.peer.result)
    expect(live?.peer.state).toBe('established')
    await instance.dispose()
  })

  it('gets an answer to an encrypted call it made itself', async () => {
    const instance = harness()
    const answer = await reach(instance, 2, 4242n)

    // Which is only possible if a datacenter opened a message this account
    // sealed under a key the two of them agreed on across three connections.
    expect(answer['_']).toBe('pong')
    expect(answer['ping_id']).toBe(4242n)
    await instance.dispose()
  })
})

describe('an account reaching a method this build does not model', () => {
  it('carries the call and gives back what answered it', async () => {
    // `docs/architecture.md` §7's escape hatch, over the same three connections
    // every other call needs: this is the whole path, not a shortcut past it.
    const instance = harness()
    await instance.account.connect()

    const answer = await instance.account.api.call({ _: 'help.getConfig' })

    expect(answer['_']).toBe('boolTrue')
    await instance.dispose()
  })

  it('sends the query the caller wrote, unchanged', async () => {
    // The hatch exists for methods this build has never heard of, so anything
    // added, removed or renamed on the way would defeat the point of it.
    const instance = harness()
    await instance.account.connect()

    // The first call on a connection travels wrapped, because that is where a
    // client states its layer and describes itself. The second does not, which
    // is the one to read if the question is what the caller wrote.
    await instance.account.api.call({ _: 'help.getConfig' })
    await instance.account.api.call({ _: 'help.getAppUpdate', source: 'a-marker' })

    const seen = instance
      .datacenter(2)
      .connections.flatMap((connection) => connection.peer.seen.map((element) => element.value))
    const sent = seen.find((value) => value._ === 'help.getAppUpdate')

    expect(sent?.['source']).toBe('a-marker')
    await instance.dispose()
  })

  it('lets the pools choose the datacenter', async () => {
    // The account states no opinion about where a call goes; that belongs to
    // the pools. `reach` is the escape from the escape hatch, for the caller
    // who genuinely must name one.
    const instance = harness()
    await instance.account.connect()

    await instance.account.api.call({ _: 'help.getConfig' })

    expect(instance.datacenter(2).connections.length).toBeGreaterThan(0)
    expect(instance.datacenter(4).connections).toHaveLength(0)
    await instance.dispose()
  })

  it('refuses a query naming nothing the schema carries', async () => {
    // The hatch bypasses the typed surface, not the schema. A name that cannot
    // be serialized fails here rather than as an answer that never comes.
    const instance = harness()
    await instance.account.connect()

    await expect(
      instance.account.api.call({ _: 'messages.notAMethodThisSchemaHas' }),
    ).rejects.toThrow(/is not in the api table/)
    await instance.dispose()
  })

  it('refuses a query carrying no constructor at all', async () => {
    const instance = harness()
    await instance.account.connect()

    await expect(instance.account.api.call({ _: '' } as unknown as { _: string })).rejects.toThrow(
      /is not in the api table/,
    )
    await instance.dispose()
  })

  it('carries a generated method over the same path', async () => {
    // The typed surface is 757 signatures over one invoke, not a second way to
    // reach a datacenter. What proves it is the wire: a method addressed
    // through the surface has to arrive serialized as the schema declares it.
    const instance = harness()
    await instance.account.connect()

    // Past the wrapper the first call on a connection carries.
    await instance.account.api.help.getConfig()
    await instance.account.api.help.getAppUpdate({ source: 'a-typed-marker' })

    const seen = instance
      .datacenter(2)
      .connections.flatMap((connection) => connection.peer.seen.map((element) => element.value))
    const sent = seen.find((value) => value._ === 'help.getAppUpdate')

    expect(sent?.['source']).toBe('a-typed-marker')
    await instance.dispose()
  })

  it('refuses a generated method before the account has connected', async () => {
    const instance = harness()

    await expect(instance.account.api.help.getConfig()).rejects.toThrow(/not connected/)
    await instance.dispose()
  })

  it('is reachable from an event, on the account it arrived on', async () => {
    // `docs/api-design.md` §12: the same surface on every context, so a handler
    // never has to reach back to the client it was registered on.
    const instance = harness()
    await instance.account.connect()

    // Past the wrapper the first call on a connection carries, so what the
    // handler sends is readable as the handler wrote it.
    await instance.account.api.call({ _: 'help.getConfig' })

    let answered: unknown
    instance.account.onMessage(async (event) => {
      answered = await event.api.call({ _: 'help.getAppUpdate', source: 'from-a-handler' })
    })
    await instance.account.deliver({
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id: 1,
        peer_id: { _: 'peerUser', user_id: 5n },
        from_id: { _: 'peerUser', user_id: 5n },
        date: 1_700_000_000,
        message: 'hello',
      },
      pts: 1,
      pts_count: 1,
    })

    expect((answered as { _: string })['_']).toBe('boolTrue')

    // And it went out over this account's connection rather than being answered
    // by something the context made up.
    const seen = instance
      .datacenter(2)
      .connections.flatMap((connection) => connection.peer.seen.map((element) => element.value))

    expect(seen.some((value) => value['source'] === 'from-a-handler')).toBe(true)
    await instance.dispose()
  })
})

describe('a method addressed to the peer an event arrived from', () => {
  /** An update naming a peer, and that peer already written down. */
  // A message in a group, so the conversation and the sender are different
  // peers. A surface that bound the wrong one would be invisible against a
  // private chat, where they are the same.
  const arriving = {
    _: 'updateNewMessage',
    message: {
      _: 'message',
      id: 1,
      peer_id: { _: 'peerChat', chat_id: 12n },
      from_id: { _: 'peerUser', user_id: 5n },
      date: 1_700_000_000,
      message: 'hello',
    },
    pts: 1,
    pts_count: 1,
  }

  async function ready() {
    const instance = harness()
    await instance.account.connect()
    // Both, so a surface binding the sender would still find something and the
    // difference shows in which reference travels rather than in a failure.
    await instance.account.peers.save({
      kind: 'chat',
      id: 12n,
      min: false,
      usernames: [],
    })
    await instance.account.peers.save({
      kind: 'user',
      id: 5n,
      accessHash: 77n,
      min: false,
      usernames: [],
    })

    // Past the wrapper the first call on a connection carries, so what the
    // handler sends is readable as the handler wrote it.
    await instance.account.api.help.getConfig()

    return instance
  }

  /** Everything this account's datacenter was sent. */
  function seen(instance: MockAccount) {
    return instance
      .datacenter(2)
      .connections.flatMap((connection) => connection.peer.seen.map((element) => element.value))
  }

  it('carries the peer the update named, over the same connection', async () => {
    // The ergonomic point: the caller names no peer and the right one travels.
    const instance = await ready()

    let answered: unknown
    instance.account.onMessage(async (event) => {
      answered = await event.here.messages.getPeerSettings()
    })
    await instance.account.deliver(arriving)

    const sent = seen(instance).find((value) => value._ === 'messages.getPeerSettings')

    expect(sent?.['peer']).toEqual({ _: 'inputPeerChat', chat_id: 12n })
    expect((answered as { _: string })['_']).toBe('boolTrue')
    await instance.dispose()
  })

  it('keeps the parameters the caller supplied beside it', async () => {
    const instance = await ready()

    instance.account.onMessage(async (event) => {
      await event.here.messages.getHistory({
        offset_id: 0,
        offset_date: 0,
        add_offset: 0,
        limit: 10,
        max_id: 0,
        min_id: 0,
        hash: 0n,
      })
    })
    await instance.account.deliver(arriving)

    const sent = seen(instance).find((value) => value._ === 'messages.getHistory')

    expect(sent?.['limit']).toBe(10)
    expect(sent?.['peer']).toEqual({ _: 'inputPeerChat', chat_id: 12n })
    await instance.dispose()
  })

  it('cannot be redirected to another conversation', async () => {
    // The peer is written after whatever the caller passed, so a value that
    // reached a handler from elsewhere cannot send the call somewhere the
    // update did not name.
    const instance = await ready()

    instance.account.onMessage(async (event) => {
      await event.here.messages.getPeerSettings({ peer: { _: 'inputPeerSelf' } } as never)
    })
    await instance.account.deliver(arriving)

    const sent = seen(instance).find((value) => value._ === 'messages.getPeerSettings')

    expect(sent?.['peer']).toEqual({ _: 'inputPeerChat', chat_id: 12n })
    await instance.dispose()
  })

  it('reaches no network to find the peer', async () => {
    // The reference comes from what was written down when the update arrived.
    // A bound call costs the call, which is what makes it safe in a handler
    // that runs on every message.
    const instance = await ready()

    instance.account.onMessage(async (event) => {
      await event.here.messages.getPeerSettings()
    })
    await instance.account.deliver(arriving)

    expect(seen(instance).filter((value) => value._ === 'contacts.resolveUsername')).toEqual([])
    await instance.dispose()
  })
})

describe('what an account writes down', () => {
  it('keeps the authorization where the datacenter layer keeps it', async () => {
    const instance = harness()
    await reach(instance)

    expect([...instance.stored.keys()].toSorted()).toEqual([
      'auth:dc2:key',
      'auth:dc2:salt',
      'auth:dc2:temp0',
    ])
    await instance.dispose()
  })

  it('resumes from it rather than authorizing a second time', async () => {
    const first = harness()
    await reach(first)
    await first.account.stop()
    const spent = first.datacenter(2).connections.length

    // The same datacenters, still remembering this client, and the state the
    // first account left behind. Nothing else is carried over.
    const second = harness({ datacenters: first.datacenters, stored: first.stored })
    const answer = await reach(second, 2, 7n)

    expect(first.datacenter(2).connections).toHaveLength(spent + 1)
    expect(exchanges(first.datacenter(2)).at(-1)).toBe(false)
    expect(answer['ping_id']).toBe(7n)
    await second.dispose()
  })

  it('keeps one datacenter’s key apart from another’s', async () => {
    const instance = harness()
    await reach(instance, 2)
    await instance.account.reach(4).invoke({ _: 'ping', ping_id: 2n })

    expect(instance.stored.get('auth:dc2:key')).not.toEqual(instance.stored.get('auth:dc4:key'))
    await instance.dispose()
  })
})

describe('an account across datacenters', () => {
  it('reaches a datacenter only when something is sent to it', async () => {
    const instance = harness()
    await instance.account.connect()
    await instance.account.reach(4).invoke({ _: 'ping', ping_id: 1n })

    // Authorizing everywhere on the way up would cost six exchanges for a
    // client that may only ever use one datacenter.
    expect(instance.datacenter(4).connections).toHaveLength(3)
    expect(instance.datacenter(2).connections).toHaveLength(0)
    await instance.dispose()
  })

  it('authorizes each one it reaches, on its own', async () => {
    const instance = harness()
    await reach(instance, 2)
    await instance.account.reach(4).invoke({ _: 'ping', ping_id: 2n })

    // Each datacenter holds its own authorization: a key established with one
    // means nothing to another.
    expect(exchanges(instance.datacenter(2))).toEqual([true, true, false])
    expect(exchanges(instance.datacenter(4))).toEqual([true, true, false])
    expect(instance.datacenter(2).permanent).not.toBe(instance.datacenter(4).permanent)
    await instance.dispose()
  })

  it('is answered by the datacenter the call was addressed to', async () => {
    const instance = harness()
    const answer = await reach(instance, 4, 99n)

    expect(answer['ping_id']).toBe(99n)
    expect(instance.datacenter(4).temporary).toBeDefined()
    expect(instance.datacenter(2).temporary).toBeUndefined()
    await instance.dispose()
  })
})

describe('an account shutting down', () => {
  it('closes the socket its calls were travelling over', async () => {
    const instance = harness()
    await reach(instance)

    // The one still in use before the account stops, and nothing after it.
    expect(sockets(instance.datacenter(2))).toEqual([false, false, true])
    await instance.account.stop()

    expect(sockets(instance.datacenter(2))).toEqual([false, false, false])
  })

  it('closes them at every datacenter it reached', async () => {
    const instance = harness()
    await reach(instance, 2)
    await instance.account.reach(4).invoke({ _: 'ping', ping_id: 2n })
    await instance.account.stop()

    expect(sockets(instance.datacenter(2))).toEqual([false, false, false])
    expect(sockets(instance.datacenter(4))).toEqual([false, false, false])
  })

  it('can be raised again, and reaches the network as it did before', async () => {
    const instance = harness()
    await reach(instance)
    await instance.account.stop()

    await instance.account.connect()
    const answer = await instance.account.reach(2).invoke({ _: 'ping', ping_id: 5n })

    expect(answer['ping_id']).toBe(5n)
    expect(sockets(instance.datacenter(2)).at(-1)).toBe(true)
    await instance.dispose()
  })
})

describe('an account authorizing inside an application', () => {
  it('writes its authorization to its own store and nowhere else', async () => {
    // The one case where this can be shown rather than assumed. An account only
    // establishes a key when something needs to travel, so a container holding
    // an idle account proves nothing about where a key would have gone. Here
    // one actually goes out, and the container's store stays empty of it.
    const shared = new Map<string, unknown>()
    const app = new App({
      storage: {
        get: async (key: string) => shared.get(key),
        set: async (key: string, value: unknown) => {
          shared.set(key, value)
        },
        delete: async (key: string) => {
          shared.delete(key)
        },
      },
    })
    const instance = harness({ name: 'alice' })
    app.add(instance.account)

    await app.storage.set('greeting', 'hello')
    await reach(instance)

    // The account established a key, a salt and a temporary key, all under the
    // names the MTProto subsystem owns.
    expect([...instance.stored.keys()].toSorted()).toEqual([
      'auth:dc2:key',
      'auth:dc2:salt',
      'auth:dc2:temp0',
    ])
    // None of which is anywhere near the application's store.
    expect([...shared.keys()]).toEqual(['app:greeting'])
    await app.stop()
  })

  it('keeps the application area beside the authorization, not inside it', async () => {
    // Both exist at once and neither is reachable from the other: framework
    // state in the container's store under the client's area, protocol state in
    // the account's own store under the subsystem's names.
    const shared = new Map<string, unknown>()
    const app = new App({
      storage: {
        get: async (key: string) => shared.get(key),
        set: async (key: string, value: unknown) => {
          shared.set(key, value)
        },
        delete: async (key: string) => {
          shared.delete(key)
        },
      },
    })
    const instance = harness({ name: 'alice' })
    app.add(instance.account)

    await reach(instance)
    await app.storageFor(instance.account).set('seen', 1)

    expect([...shared.keys()]).toEqual(['clients:alice:seen'])
    expect(await app.storageFor(instance.account).get('auth:dc2:key')).toBeUndefined()
    expect(instance.stored.has('clients:alice:seen')).toBe(false)
    await app.stop()
  })
})

describe('an account carried to another process', () => {
  it('is exported, imported and used, against a datacenter that remembers it', async () => {
    // The whole point of a portable session, end to end and for real: a key
    // established over a genuine exchange, written out as a string, read back
    // into an account that shares nothing else with the first, and used to talk
    // to the datacenter that issued it.
    const first = harness({ name: 'first' })
    await reach(first)
    const session = await first.account.exportSession()
    await first.account.stop()
    const spent = first.datacenter(2).connections.length

    // The same datacenters, still remembering this client. Everything the
    // second account knows arrived in the string.
    const carried = harness({ name: 'carried', datacenters: first.datacenters, session })
    await carried.account.connect()
    const answer = await carried.account.reach(2).invoke({ _: 'ping', ping_id: 77n })

    expect(answer['ping_id']).toBe(77n)

    // Two connections rather than three: the long-lived key came in the string,
    // so only the key with a lifetime had to be negotiated and vouched for.
    const opened = first.datacenter(2).connections.slice(spent)
    expect(opened).toHaveLength(2)
    expect(opened.map((connection) => connection.peer.result !== undefined)).toEqual([true, false])
    expect(opened[0]?.peer.bindings).toHaveLength(1)

    // And the string it writes out is the string it was given.
    expect(await carried.account.exportSession()).toBe(session)
    await carried.account.stop()
  })

  it('writes its own store rather than the one it was exported from', async () => {
    const first = harness({ name: 'first' })
    await reach(first)
    const session = await first.account.exportSession()
    await first.account.stop()

    const carried = harness({ name: 'carried', datacenters: first.datacenters, session })
    await carried.account.connect()
    await carried.account.reach(2).invoke({ _: 'ping', ping_id: 1n })

    // Its own key, salt and temporary key, in a store the first account never
    // saw. The string carried the authorization; nothing else travelled.
    expect([...carried.stored.keys()].toSorted()).toEqual([
      'auth:dc2:key',
      'auth:dc2:salt',
      'auth:dc2:temp0',
    ])
    expect(carried.stored).not.toBe(first.stored)
    await carried.account.stop()
  })
})

describe('a datacenter an account cannot make sense of', () => {
  /** Authorize against a well-behaved datacenter, then make it misbehave. */
  async function misbehaving(fault: Fault) {
    const faults = new Set<Fault>()
    const instance = harness({ faults })
    await reach(instance)
    faults.add(fault)

    const result = await outcome(instance.account.reach(2).invoke(PROBE))
    await instance.account.stop()

    return result
  }

  it('answers a call made on a connection that is already warm', async () => {
    // The control the rest of this group rests on. Every case below reads a
    // second call on an established connection, so one that could never settle
    // would let a fault look like a refusal it had nothing to do with.
    const instance = harness()
    await reach(instance)

    await expect(instance.account.reach(2).invoke(PROBE)).resolves.toBeDefined()
    await instance.dispose()
  })

  it('fails a call answered with something that is not an encrypted message', async () => {
    expect(await misbehaving('malformed-encrypted-message')).toBe('refused: the connection ended')
  })

  it('fails a call whose answer does not survive its integrity check', async () => {
    expect(await misbehaving('bad-message-integrity')).toBe('refused: the connection ended')
  })

  it('fails a call answered with an identifier carrying the client’s parity', async () => {
    expect(await misbehaving('wrong-message-id-parity')).toBe('refused: the connection ended')
  })

  it('does not accept an answer arriving in a session it never opened', async () => {
    // Not an error but a message for somebody else, so it is discarded rather
    // than acted on, and the call it was pretending to answer stays
    // outstanding. An account that took it would have accepted a message for a
    // session it never established.
    const faults = new Set<Fault>()
    const instance = harness({ faults })
    await reach(instance)

    faults.add('wrong-session')
    const ignored = watch(instance.account.reach(2).invoke(PROBE))
    // Waited for rather than assumed: calls queued together travel in one
    // message and are answered in one, so a barrier queued alongside this would
    // share its fate instead of outlasting it.
    await until(() => asked(instance.datacenter(2)) === 1, 'the ignored call going out')

    // The barrier is a later call rather than a clock: made after the answer to
    // the first was already composed, it travels the same connection and comes
    // all the way back, so that answer had every chance to arrive first.
    faults.delete('wrong-session')
    await instance.account.reach(2).invoke(PROBE)

    expect(ignored()).toBe(false)
    await instance.account.stop()
  })

  it('is refused when the key it holds is not one the datacenter knows', async () => {
    const spent = harness()
    await reach(spent)
    await spent.account.stop()

    // The state of an account whose datacenters have since forgotten it: it
    // opens straight into encrypted traffic under a key that means nothing
    // there, and is hung up on rather than answered.
    const stranded = harness({ stored: spent.stored })
    await stranded.account.connect()
    const result = await outcome(stranded.account.reach(2).invoke({ _: 'ping', ping_id: 1n }))

    expect(result).toBe('refused: the connection ended')
    // It did not quietly negotiate a new key instead: one connection, refused.
    expect(exchanges(stranded.datacenter(2))).toEqual([false])
    await stranded.account.stop()
  })
})
