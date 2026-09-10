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

import { App, createLogger, type LogRecord, TelegramError } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import type { TlValue } from '../src/tl/index.js'
import type { MockDatacenter } from './server/datacenter.js'
import { contentOf, FileServer } from './server/files.js'
import { createServerKey } from './server/keys.js'
import type { Fault } from './server/server.js'
import { type MockAccount, mockAccount, NOW_SECONDS } from './support/mock-account.js'

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

/**
 * Every method name one message carried.
 *
 * The first call on a connection travels wrapped, because that is where a
 * client states its layer and describes itself, so what a connection carried is
 * the names inside the wrappers as well as the outer one.
 */
function named(value: TlValue): string[] {
  const inner = value['query']
  const nested =
    typeof inner === 'object' && inner !== null && typeof (inner as TlValue)._ === 'string'
      ? named(inner as TlValue)
      : []

  return [value._, ...nested]
}

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
 * Every method a harness's datacenters were asked, by name.
 *
 * Read from the peers rather than from the account, so what a case sees is what
 * actually travelled: a call the account made on its own behalf counts exactly
 * as much as one the case made. What a session sends to keep itself running is
 * left out — an acknowledgement is not a call anybody decided to make.
 */
const names = (instance: MockAccount): readonly string[] =>
  [...instance.datacenters.values()]
    .flatMap((datacenter) => datacenter.connections)
    .flatMap((connection) => connection.peer.seen.map((message) => message.value._))
    .filter((name) => !BOOKKEEPING.has(name))

/** What a session sends on its own behalf, rather than because a caller asked. */
const BOOKKEEPING: ReadonlySet<string> = new Set([
  'msgs_ack',
  'ping',
  'ping_delay_disconnect',
  'msgs_state_req',
  'get_future_salts',
  'http_wait',
])

/** Which methods the second reading holds that the first did not, counted. */
function added(before: readonly string[], after: readonly string[]): string[] {
  const remaining = [...before]
  const extra: string[] = []

  for (const name of after) {
    const at = remaining.indexOf(name)
    if (at === -1) extra.push(name)
    else remaining.splice(at, 1)
  }

  return extra.sort()
}

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

describe('what an account learns from the answers it receives', () => {
  /**
   * A user as an answer describes one.
   *
   * The hash is the point: it is issued per account, cannot be worked out, and
   * arrives only inside answers like this one.
   */
  const USER = {
    _: 'user',
    id: 4242n,
    access_hash: 0x1234_5678n,
    first_name: 'Ada',
    username: 'ada',
  }

  /** A channel, to prove the other array is read as well. */
  const CHANNEL = {
    _: 'channel',
    id: 777n,
    access_hash: 0x0bad_c0den,
    title: 'Notes',
    photo: { _: 'chatPhotoEmpty' },
    date: 1_700_000_000,
  }

  /**
   * A history request, spelled in full.
   *
   * The generated surface asks for every parameter the schema declares as
   * required, so this is what a caller writes. Which window it names matters to
   * nothing here.
   */
  const HISTORY = {
    peer: { _: 'inputPeerSelf' },
    offset_id: 0,
    offset_date: 0,
    add_offset: 0,
    limit: 1,
    max_id: 0,
    min_id: 0,
    hash: 0n,
  } as const

  /** An answer of the shape almost every method returns: a result, and everyone it mentions. */
  const answering = (query: TlValue): TlValue | undefined =>
    query._ === 'messages.getHistory'
      ? { _: 'messages.messages', messages: [], topics: [], chats: [CHANNEL], users: [USER] }
      : undefined

  it('can name a peer it has only ever seen in an answer', async () => {
    // The failure this prevents: read a conversation, then be unable to address
    // anybody who spoke in it, because the hash that arrived with the answer was
    // read past and thrown away.
    const instance = harness({ api: answering })
    await instance.account.connect()

    await instance.account.api.messages.getHistory(HISTORY)
    const named = await instance.account.resolve({ kind: 'user', id: 4242n })

    expect(named).toEqual({ _: 'inputPeerUser', user_id: 4242n, access_hash: 0x1234_5678n })
    await instance.dispose()
  })

  it('reads the chats an answer describes as well as the users', async () => {
    const instance = harness({ api: answering })
    await instance.account.connect()

    await instance.account.api.messages.getHistory(HISTORY)

    expect(await instance.account.resolve({ kind: 'channel', id: 777n })).toEqual({
      _: 'inputPeerChannel',
      channel_id: 777n,
      access_hash: 0x0bad_c0den,
    })
    await instance.dispose()
  })

  it('answers a name from what an answer carried, without asking Telegram', async () => {
    // Harvesting is what makes a name cheap. A peer already described does not
    // send the account back to `contacts.resolveUsername` for what it holds.
    const instance = harness({ api: answering })
    await instance.account.connect()

    await instance.account.api.messages.getHistory(HISTORY)
    const before = names(instance)
    const named = await instance.account.resolve('@ada')

    expect(named).toEqual({ _: 'inputPeerUser', user_id: 4242n, access_hash: 0x1234_5678n })
    expect(added(before, names(instance))).toEqual([])
    await instance.dispose()
  })

  it('learns from a call made through the escape hatch too', async () => {
    // The hatch exists for methods this build has never heard of, and their
    // answers describe peers exactly as any other answer does.
    const instance = harness({ api: answering })
    await instance.account.connect()

    await instance.account.api.call({ _: 'messages.getHistory', ...HISTORY })

    expect(await instance.account.resolve({ kind: 'user', id: 4242n })).toEqual({
      _: 'inputPeerUser',
      user_id: 4242n,
      access_hash: 0x1234_5678n,
    })
    await instance.dispose()
  })

  it('sends nothing of its own to learn', async () => {
    // Reading what came back anyway is the whole mechanism. An account that
    // asked a question to write a peer down would be spending a caller's
    // allowance on bookkeeping.
    const instance = harness({ api: answering })
    await instance.account.connect()

    // Warmed first. Authorizing is two exchanges and a binding, and the first
    // call on a channel travels wrapped in the layer announcement — none of
    // which is what this case is about.
    await instance.account.api.call({ _: 'help.getConfig' })
    await instance.account.api.call({ _: 'help.getConfig' })

    const before = names(instance)
    await instance.account.api.messages.getHistory(HISTORY)

    // Read as a difference rather than by position: several connections carry
    // an account's traffic, and which of them a case reads last is not the
    // question. What was added is.
    expect(added(before, names(instance))).toEqual(['messages.getHistory'])
    await instance.dispose()
  })

  it('still refuses a peer no answer has described', async () => {
    const instance = harness({ api: answering })
    await instance.account.connect()

    await instance.account.api.messages.getHistory(HISTORY)

    await expect(instance.account.resolve({ kind: 'user', id: 9999n })).rejects.toThrow(
      /has not seen user 9999/,
    )
    await instance.dispose()
  })

  it('does not fail a call because the peers could not be written down', async () => {
    // The answer is the caller's and has already arrived. Losing it over a
    // record the account can learn again from the next answer that mentions the
    // same peer would be the worse failure.
    const kept = new Map<string, unknown>()
    const records: LogRecord[] = []
    const instance = harness({
      api: answering,
      // Swallowed, but not silently: a peer store that will not take what
      // arrives is a real problem, and an account that lost every hash it was
      // given without saying so would be diagnosed from the far end.
      log: createLogger({ sink: { write: (record) => records.push(record) } }),
      storage: {
        get: async (name: string) => kept.get(name),
        set: async (name: string, value: unknown) => {
          if (name.startsWith('peers:')) throw new Error('the store is full')
          kept.set(name, value)
        },
        delete: async (name: string) => {
          kept.delete(name)
        },
      },
    })
    await instance.account.connect()

    const answer = await instance.account.api.messages.getHistory(HISTORY)

    expect(answer._).toBe('messages.messages')
    expect(records.filter((record) => record.level === 'warn').map((record) => record.message)) //
      .toContain('could not write down the peers an answer described')
    await instance.dispose()
  })
})

/**
 * Fetching a file, through the account rather than through the transfer.
 *
 * `files-download.test.ts` already judges the transfer itself against the bytes
 * a datacenter holds: range planning, boundaries, ordering, short answers. What
 * is left to prove here is the wiring — that an account reaches the datacenter
 * the file names, that it does so on connections ordinary calls are not using,
 * and that it refuses before it has any.
 */
describe('a file an account fetches', () => {
  const FILE = 0x0f11_e001n
  const SIZE = 3 * 1024 * 1024

  /** A datacenter holding the file, and the location that names it. */
  function stored(dcId: number) {
    const server = new FileServer(dcId)
    const { reference } = server.add(FILE, { size: SIZE, dcId })

    return {
      server,
      location: {
        _: 'inputDocumentFileLocation',
        id: FILE,
        access_hash: 5n,
        file_reference: reference,
        thumb_size: '',
      } as TlValue,
    }
  }

  /** An account whose datacenters serve files, and nothing else differently. */
  function serving(files: ReadonlyMap<number, FileServer>) {
    return harness({
      api: (query, dcId) =>
        query._.startsWith('upload.') ? files.get(dcId)?.invoke(query) : undefined,
    })
  }

  it('hands back the bytes the datacenter holds', async () => {
    const home = stored(2)
    const instance = serving(new Map([[2, home.server]]))
    await instance.account.connect()

    const bytes = await instance.account.download({
      location: home.location,
      dcId: 2,
      size: SIZE,
    })

    // Byte for byte against what the datacenter generated, because a range plan
    // that is a kilobyte out still returns something of the right length.
    expect(bytes).toEqual(contentOf(FILE, 0, SIZE))
    await instance.dispose()
  })

  it('hands each range over in file order', async () => {
    const home = stored(2)
    const instance = serving(new Map([[2, home.server]]))
    await instance.account.connect()

    const offsets: number[] = []
    const pieces: Uint8Array[] = []
    const outcome = await instance.account.downloadTo({
      location: home.location,
      dcId: 2,
      size: SIZE,
      write: (chunk, offset) => {
        offsets.push(offset)
        pieces.push(chunk)
      },
    })

    // A consumer appending to a stream keeps nothing of its own, which is only
    // true while the offsets arrive ascending and leave no hole between them.
    expect(outcome.size).toBe(SIZE)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    let at = 0
    for (const [index, offset] of offsets.entries()) {
      expect(offset).toBe(at)
      at += pieces[index]?.length ?? 0
    }
    expect(at).toBe(SIZE)
    await instance.dispose()
  })

  it('fetches from the datacenter the file names, not the one the account is on', async () => {
    // A file lives where it lives. An account that asked its own datacenter for
    // one held elsewhere would be told to go there, which costs a round trip
    // for something the location said in the first place.
    const elsewhere = stored(4)
    const instance = serving(new Map([[4, elsewhere.server]]))
    await instance.account.connect()

    const bytes = await instance.account.download({
      location: elsewhere.location,
      dcId: 4,
      size: SIZE,
    })

    expect(bytes).toEqual(contentOf(FILE, 0, SIZE))
    expect(elsewhere.server.asked.length).toBeGreaterThan(0)
    expect(instance.datacenter(4).connections.length).toBeGreaterThan(0)
    await instance.dispose()
  })

  it('keeps a transfer off the connection ordinary calls travel on', async () => {
    // A file moves in ranges asked for several at a time. Sharing the
    // connection the update stream and every RPC use would put an interactive
    // call behind a megabyte of somebody's video, which is the whole reason the
    // pools keep a separate set for transfers.
    const home = stored(2)
    const instance = serving(new Map([[2, home.server]]))
    await instance.account.connect()

    await instance.account.api.call({ _: 'help.getConfig' })
    await instance.account.download({ location: home.location, dcId: 2, size: SIZE })

    const seen = instance
      .datacenter(2)
      .connections.map((connection) =>
        connection.peer.seen.flatMap((element) => named(element.value)),
      )
    const ordinary = seen.filter((names) => names.includes('help.getConfig'))
    const transfers = seen.filter((names) => names.includes('upload.getFile'))

    expect(ordinary.length).toBeGreaterThan(0)
    expect(transfers.length).toBeGreaterThan(0)
    for (const names of ordinary) expect(names).not.toContain('upload.getFile')
    await instance.dispose()
  })

  it('refuses while the account is not connected', async () => {
    // Before anything is asked of a datacenter, so a caller finds out where the
    // mistake is rather than at an answer that never comes.
    const home = stored(2)
    const instance = serving(new Map([[2, home.server]]))

    await expect(
      instance.account.download({ location: home.location, dcId: 2, size: SIZE }),
    ).rejects.toThrow(/is not connected/)
    await expect(
      instance.account.downloadTo({
        location: home.location,
        dcId: 2,
        size: SIZE,
        write: () => {},
      }),
    ).rejects.toThrow(/is not connected/)

    expect(home.server.asked).toHaveLength(0)
    await instance.dispose()
  })

  it('asks for several ranges at once when the length is known', async () => {
    // Knowing the length is what allows ranges to be asked for at the same
    // time, and the transfer pool is sized for that. A transfer that took the
    // small allowance, or that was not told the length, would move a file at a
    // fraction of the rate for no stated reason.
    const home = stored(2)
    const instance = serving(new Map([[2, home.server]]))
    await instance.account.connect()

    await instance.account.download({
      location: home.location,
      dcId: 2,
      size: SIZE,
      concurrency: 4,
    })

    const carrying = instance
      .datacenter(2)
      .connections.filter((connection) =>
        connection.peer.seen.some((element) => named(element.value).includes('upload.getFile')),
      )

    expect(carrying.length).toBeGreaterThan(2)
    await instance.dispose()
  })

  it('says the account is not connected before it says the request is wrong', async () => {
    // Two things are wrong at once here: the account is down and the range size
    // is not one the protocol allows. The account's own state is the more
    // fundamental of them, and it is what `reach` reports first as well, so a
    // caller is not sent to check a range while nothing could have travelled
    // anyway.
    const home = stored(2)
    const instance = serving(new Map([[2, home.server]]))

    await expect(
      instance.account.download({ location: home.location, dcId: 2, size: SIZE, limit: 3 }),
    ).rejects.toThrow(/is not connected/)
    await instance.dispose()
  })

  it('stops a transfer that outlives the account it belongs to', async () => {
    // A transfer holds no connections of its own: it asks for one per range, so
    // an account stopped halfway through fails the next range rather than going
    // on against connections nothing owns any more.
    const home = stored(2)
    const instance = serving(new Map([[2, home.server]]))
    await instance.account.connect()

    let chunks = 0
    await expect(
      instance.account.downloadTo({
        location: home.location,
        dcId: 2,
        size: SIZE,
        concurrency: 1,
        write: async () => {
          chunks += 1
          if (chunks === 1) await instance.account.stop()
        },
      }),
    ).rejects.toThrow(/is not connected/)

    expect(chunks).toBe(1)
    await instance.dispose()
  })

  it('carries a refusal from the datacenter rather than a short file', async () => {
    // A location the datacenter will not serve has to fail. Handing back the
    // bytes that did arrive would produce a file that is quietly wrong.
    const home = stored(2)
    const instance = serving(new Map([[2, home.server]]))
    await instance.account.connect()
    home.server.expire(FILE)

    await expect(
      instance.account.download({ location: home.location, dcId: 2, size: SIZE }),
    ).rejects.toThrow(/FILE_REFERENCE_EXPIRED/)
    await instance.dispose()
  })
})

/**
 * Sending a file, through the account rather than through the transfer.
 *
 * `files-upload.test.ts` already judges the transfer itself: part numbering,
 * the two forms a reference takes, short reads, retries, the path a length
 * nobody knows takes. What is left to prove here is the wiring — that the
 * account supplies its own datacenter, that parts travel on the connections
 * kept for them, and that a source is the caller's and is read once per part.
 */
describe('a file an account sends', () => {
  const PART = 512 * 1024

  /** The content a synthetic source produces, so a case can compare against it. */
  const byteAt = (at: number) => (at * 7 + 3) & 0xff
  const expected = (size: number) => Uint8Array.from({ length: size }, (_, index) => byteAt(index))

  /** A source of a stated length that never holds the whole file. */
  const synthetic = (size: number, reads?: number[]) => ({
    size,
    read: async (offset: number, length: number) => {
      reads?.push(offset)

      return Uint8Array.from({ length: Math.max(0, Math.min(length, size - offset)) }, (_, index) =>
        byteAt(offset + index),
      )
    },
  })

  /** An account whose datacenters keep what is sent to them. */
  function receiving(files: ReadonlyMap<number, FileServer>) {
    return harness({
      api: (query, dcId) =>
        query._.startsWith('upload.') ? files.get(dcId)?.invoke(query) : undefined,
    })
  }

  it('sends the bytes the source hands over', async () => {
    const home = new FileServer(2)
    const instance = receiving(new Map([[2, home]]))
    await instance.account.connect()

    const size = PART * 2 + 1000
    const sent = await instance.account.upload({ source: synthetic(size), name: 'report.pdf' })

    // Judged by what the datacenter assembled rather than by what the client
    // believes it sent: a part under the wrong number produces a file of the
    // right length and the wrong content.
    expect(home.assembled(sent.fileId)).toEqual(expected(size))
    expect(sent.size).toBe(size)
    expect(sent.parts).toBe(3)
    expect(sent.file._).toBe('inputFile')
    expect(sent.file['name']).toBe('report.pdf')
    await instance.dispose()
  })

  it('reads each part once, and only the parts it needs', async () => {
    // The source belongs to the caller and may be expensive or one-shot, so a
    // part read twice is a cost the caller never agreed to.
    const home = new FileServer(2)
    const instance = receiving(new Map([[2, home]]))
    await instance.account.connect()

    const reads: number[] = []
    const size = PART * 3
    await instance.account.upload({ source: synthetic(size, reads) })

    expect(reads).toHaveLength(3)
    expect(new Set(reads).size).toBe(3)
    expect([...reads].sort((a, b) => a - b)).toEqual([0, PART, PART * 2])
    await instance.dispose()
  })

  it('sends a source that does not know its length in order', async () => {
    // Without a length there is no way to say where the file ends except by
    // reaching it, so the parts cannot go out together and the protocol keeps a
    // separate form for the reference.
    const home = new FileServer(2)
    const instance = receiving(new Map([[2, home]]))
    await instance.account.connect()

    const size = PART + 200
    const reads: number[] = []
    const sent = await instance.account.upload({
      source: {
        read: async (offset: number, length: number) => {
          reads.push(offset)

          return Uint8Array.from(
            { length: Math.max(0, Math.min(length, size - offset)) },
            (_, index) => byteAt(offset + index),
          )
        },
      },
    })

    expect(sent.file._).toBe('inputFileBig')
    expect(home.assembled(sent.fileId)).toEqual(expected(size))
    expect(reads).toEqual([0, PART])
    await instance.dispose()
  })

  it('sends to the datacenter the account belongs to', async () => {
    // A file being sent has no location yet, so there is nothing to name a
    // datacenter with. It goes where the account lives.
    const home = new FileServer(2)
    const other = new FileServer(4)
    const instance = receiving(
      new Map([
        [2, home],
        [4, other],
      ]),
    )
    await instance.account.connect()

    await instance.account.upload({ source: synthetic(PART) })

    expect(home.asked.length).toBeGreaterThan(0)
    expect(other.asked).toHaveLength(0)
    expect(instance.datacenter(4).connections).toHaveLength(0)
    await instance.dispose()
  })

  it('keeps parts off the connection ordinary calls travel on', async () => {
    // The same reason a download is kept off it: parts go out several at a
    // time, and an interactive call behind them waits for all of them.
    const home = new FileServer(2)
    const instance = receiving(new Map([[2, home]]))
    await instance.account.connect()

    await instance.account.api.call({ _: 'help.getConfig' })
    await instance.account.upload({ source: synthetic(PART * 3) })

    const seen = instance
      .datacenter(2)
      .connections.map((connection) =>
        connection.peer.seen.flatMap((element) => named(element.value)),
      )
    const ordinary = seen.filter((names) => names.includes('help.getConfig'))
    const carrying = seen.filter((names) => names.includes('upload.saveFilePart'))

    expect(ordinary.length).toBeGreaterThan(0)
    expect(carrying.length).toBeGreaterThan(1)
    for (const names of ordinary) expect(names).not.toContain('upload.saveFilePart')
    await instance.dispose()
  })

  it('refuses while the account is not connected', async () => {
    const home = new FileServer(2)
    const instance = receiving(new Map([[2, home]]))

    await expect(instance.account.upload({ source: synthetic(PART) })).rejects.toThrow(
      /is not connected/,
    )

    expect(home.asked).toHaveLength(0)
    await instance.dispose()
  })

  it('stops an upload that outlives the account it belongs to', async () => {
    // Connections are asked for per part, so an account stopped halfway through
    // fails the next one rather than going on against connections nothing owns.
    const home = new FileServer(2)
    const instance = receiving(new Map([[2, home]]))
    await instance.account.connect()

    let reads = 0
    const size = PART * 4
    await expect(
      instance.account.upload({
        concurrency: 1,
        source: {
          size,
          read: async (offset: number, length: number) => {
            reads += 1
            if (reads === 2) await instance.account.stop()

            return Uint8Array.from({ length: Math.min(length, size - offset) }, (_, index) =>
              byteAt(offset + index),
            )
          },
        },
      }),
    ).rejects.toThrow(/is not connected/)
    await instance.dispose()
  })

  it('does not share connections with a transfer going the other way', async () => {
    // Sending and fetching are separate allowances, eight connections each, so
    // a large upload and a large download do not compete for the same ones.
    const home = new FileServer(2)
    const stored = home.add(0x0f11_e002n, { size: 2 * PART, dcId: 2 })
    const instance = receiving(new Map([[2, home]]))
    await instance.account.connect()

    await instance.account.upload({ source: synthetic(PART * 2) })
    await instance.account.download({
      dcId: 2,
      size: 2 * PART,
      location: {
        _: 'inputDocumentFileLocation',
        id: stored.fileId,
        access_hash: 5n,
        file_reference: stored.reference,
        thumb_size: '',
      },
    })

    const seen = instance
      .datacenter(2)
      .connections.map((connection) =>
        connection.peer.seen.flatMap((element) => named(element.value)),
      )

    for (const carried of seen) {
      const sending = carried.includes('upload.saveFilePart')
      const fetching = carried.includes('upload.getFile')

      expect(sending && fetching).toBe(false)
    }
    expect(seen.some((carried) => carried.includes('upload.saveFilePart'))).toBe(true)
    expect(seen.some((carried) => carried.includes('upload.getFile'))).toBe(true)
    await instance.dispose()
  })

  it('carries a refusal from the datacenter rather than a reference', async () => {
    // A reference says the upload succeeded. One handed back after a part was
    // refused would name a file the datacenter cannot assemble.
    const instance = harness({
      api: (query) => {
        if (query._ !== 'upload.saveFilePart') return undefined
        throw new TelegramError('FILE_PART_INVALID (400)')
      },
    })
    await instance.account.connect()

    await expect(instance.account.upload({ source: synthetic(PART) })).rejects.toThrow(
      /FILE_PART_INVALID/,
    )
    await instance.dispose()
  })
})

/**
 * Which temporary key an account is willing to open a connection with.
 *
 * A key is chosen when a connection needs one, and the only thing that decides
 * is how much life it has left. A key handed out with a second to go produces a
 * connection that is refused part-way through a call, discards the key, and
 * pays for two fresh exchanges to replace something that was about to be
 * replaced anyway — so the cases here are about the boundary rather than about
 * the exchange, which the group above already covers.
 */
describe('a temporary key near the end of its life', () => {
  /** Authorize once, so there is a stored key to judge. */
  async function authorized() {
    const first = harness({ name: 'first' })
    await reach(first)
    await first.account.stop()

    return first
  }

  /** Rewrite how much life the stored temporary key has left. */
  function expiring(instance: MockAccount, secondsLeft: number) {
    const at = 'auth:dc2:temp0'
    const record = instance.stored.get(at) as { key: string; expires: number }

    instance.stored.set(at, { ...record, expires: NOW_SECONDS + secondsLeft })

    return record
  }

  /** Whether a second account negotiated and vouched for a key of its own. */
  async function resumeOver(instance: MockAccount) {
    const spent = instance.datacenter(2).connections.length
    const second = harness({
      name: 'second',
      datacenters: instance.datacenters,
      stored: instance.stored,
    })
    await second.account.connect()
    await second.account.reach(2).invoke({ _: 'ping', ping_id: 5n })

    const opened = instance.datacenter(2).connections.slice(spent)
    await second.account.stop()

    return {
      exchanged: opened.filter((connection) => connection.peer.result !== undefined).length,
      bound: opened.flatMap((connection) => connection.peer.bindings).length,
    }
  }

  it('is replaced rather than used', async () => {
    // Half a minute left is less than a single call is prepared to wait, so the
    // key cannot see out the call it would be handed to.
    const instance = await authorized()
    expiring(instance, 30)

    const { exchanged, bound } = await resumeOver(instance)

    expect(exchanged).toBe(1)
    expect(bound).toBe(1)
    await instance.account.stop()
  })

  it('is used while it still has a call in it', async () => {
    // The control. An hour is comfortably more than the margin, so the stored
    // key is reused and nothing is negotiated — otherwise the case above would
    // pass for an account that re-authorizes on every start.
    const instance = await authorized()
    expiring(instance, 3600)

    const { exchanged, bound } = await resumeOver(instance)

    expect(exchanged).toBe(0)
    expect(bound).toBe(0)
    await instance.account.stop()
  })

  it('keeps the key it was already given rather than storing a different one', async () => {
    // Replacing a key that is nearly finished must leave a usable one behind,
    // not an empty slot: the next start would otherwise authorize again.
    const instance = await authorized()
    const before = expiring(instance, 30)

    await resumeOver(instance)

    const after = instance.stored.get('auth:dc2:temp0') as { key: string; expires: number }
    expect(after.key).not.toBe(before.key)
    expect(after.expires).toBeGreaterThan(NOW_SECONDS + 60)
    await instance.account.stop()
  })

  it('does not touch the long-lived key it is vouched for by', async () => {
    // The margin replaces the key that encrypts traffic. Losing the root
    // credential would mean signing in again, which is a different order of
    // cost entirely.
    const instance = await authorized()
    const permanent = instance.stored.get('auth:dc2:key')
    expiring(instance, 30)

    await resumeOver(instance)

    expect(instance.stored.get('auth:dc2:key')).toEqual(permanent)
    await instance.account.stop()
  })
})

/**
 * Signing an account in, through the account rather than through the steps.
 *
 * `network-signin.test.ts` already judges the steps themselves: what each call
 * carries, what each answer means, and which redirections are followed. What is
 * left to prove here is the wiring — that the account supplies the datacenter
 * it belongs to and the application it is registered as, and that it goes where
 * a redirected sign-in says the account lives, because the next call would
 * otherwise return to the datacenter this one was just told to leave.
 */
describe('an account signing in', () => {
  const PHONE = '+70000000000'

  const AUTHORIZED: TlValue = {
    _: 'auth.authorization',
    user: { _: 'user', id: 7n, access_hash: 11n },
  }

  const SENT: TlValue = {
    _: 'auth.sentCode',
    type: { _: 'auth.sentCodeTypeApp', length: 5 },
    phone_code_hash: 'hash-of-the-code',
    timeout: 60,
  }

  /** What each datacenter answers, and every sign-in query it was asked. */
  function answering(
    replies: (query: TlValue, dcId: number) => TlValue | undefined,
    asked: Array<{ query: TlValue; dcId: number }> = [],
  ) {
    return {
      asked,
      instance: harness({
        api: (query, dcId) => {
          if (!query._.startsWith('auth.') && query._ !== 'account.getPassword') return undefined
          asked.push({ query, dcId })

          return replies(query, dcId)
        },
      }),
    }
  }

  /** The datacenter the account's stored configuration says it belongs to. */
  const belongsTo = (instance: MockAccount) =>
    (instance.stored.get('dcs:datacenters') as { thisDc?: number } | undefined)?.thisDc

  it('asks the datacenter it belongs to, as the application it is registered as', async () => {
    const { instance, asked } = answering((query) =>
      query._ === 'auth.sendCode' ? SENT : undefined,
    )
    await instance.account.connect()

    const state = await instance.account.sendCode(PHONE)

    expect(state).toEqual({
      kind: 'code-sent',
      dcId: 2,
      phoneCodeHash: 'hash-of-the-code',
      timeout: 60,
    })

    // The account fills in what a caller has no business repeating: which
    // datacenter it is talking to, and which application it is.
    const sent = asked.find((entry) => entry.query._ === 'auth.sendCode')
    expect(sent?.dcId).toBe(2)
    expect(sent?.query['phone_number']).toBe(PHONE)
    expect(sent?.query['api_id']).toBe(10_000)
    expect(sent?.query['api_hash']).toBe('mock-api-hash')
    await instance.dispose()
  })

  it('signs in as a bot in one call', async () => {
    const { instance, asked } = answering((query) =>
      query._ === 'auth.importBotAuthorization' ? AUTHORIZED : undefined,
    )
    await instance.account.connect()

    const state = await instance.account.signInAsBot('123:token')

    expect(state.kind).toBe('authorized')
    expect(asked.at(-1)?.query['bot_auth_token']).toBe('123:token')
    await instance.dispose()
  })

  it('hands back a token for another device to approve', async () => {
    const { instance } = answering((query) =>
      query._ === 'auth.exportLoginToken'
        ? { _: 'auth.loginToken', token: Uint8Array.of(1, 2, 3), expires: 1_700_000_600 }
        : undefined,
    )
    await instance.account.connect()

    const state = await instance.account.requestLoginToken()

    expect(state).toEqual({
      kind: 'pending',
      dcId: 2,
      token: Uint8Array.of(1, 2, 3),
      expires: 1_700_000_600,
    })
    await instance.dispose()
  })

  it('goes to the datacenter a redirected sign-in says the account lives at', async () => {
    // An account lives at one datacenter and the one a client reaches first is
    // not always it. Without recording where it went, the next call returns to
    // the datacenter this one was just told to leave.
    const { instance, asked } = answering((query, dcId) => {
      if (query._ !== 'auth.sendCode') return undefined
      if (dcId === 2) throw new TelegramError('PHONE_MIGRATE_4 (303)')

      return SENT
    })
    await instance.account.connect()

    const state = await instance.account.sendCode(PHONE)

    expect(state.dcId).toBe(4)
    expect(asked.map((entry) => entry.dcId)).toEqual([2, 4])
    expect(belongsTo(instance)).toBe(4)
    await instance.dispose()
  })

  it('leaves the configuration alone when the sign-in stayed put', async () => {
    // The control. A configuration rewritten on every step would look the same
    // from the outside as one rewritten only when it changed.
    const { instance } = answering((query) => (query._ === 'auth.sendCode' ? SENT : undefined))
    await instance.account.connect()
    const before = instance.stored.get('dcs:datacenters')

    await instance.account.sendCode(PHONE)

    expect(instance.stored.get('dcs:datacenters')).toBe(before)
    await instance.dispose()
  })

  it('refuses every step while the account is not connected', async () => {
    const { instance, asked } = answering(() => undefined)

    await expect(instance.account.sendCode(PHONE)).rejects.toThrow(/is not connected/)
    await expect(instance.account.signInAsBot('123:token')).rejects.toThrow(/is not connected/)
    await expect(instance.account.requestLoginToken()).rejects.toThrow(/is not connected/)
    await expect(
      instance.account.signInWithCode({ phone: PHONE, phoneCodeHash: 'h', code: '1' }),
    ).rejects.toThrow(/is not connected/)
    await expect(instance.account.signInWithPassword('p')).rejects.toThrow(/is not connected/)

    expect(asked).toHaveLength(0)
    await instance.dispose()
  })

  it('reports that a password is wanted rather than claiming it signed in', async () => {
    const { instance } = answering((query) => {
      if (query._ !== 'auth.signIn') return undefined
      throw new TelegramError('SESSION_PASSWORD_NEEDED (401)')
    })
    await instance.account.connect()

    const state = await instance.account.signInWithCode({
      phone: PHONE,
      phoneCodeHash: 'hash-of-the-code',
      code: '12345',
    })

    expect(state).toEqual({ kind: 'password-required', dcId: 2 })
    await instance.dispose()
  })
})

/**
 * An ordinary call told the account belongs somewhere else.
 *
 * Nothing else ever tells this account it moved: the published configuration is
 * never re-fetched, so a redirection is the only way it finds out. Two of the
 * four are answerable here, and the cases below are about which, what happens
 * before the call is repeated, and what is written down afterwards.
 */
describe('a call redirected to another datacenter', () => {
  /** The datacenter the account's stored configuration says it belongs to. */
  const homeOf = (instance: MockAccount) =>
    (instance.stored.get('dcs:datacenters') as { thisDc?: number } | undefined)?.thisDc

  /**
   * An account whose home datacenter redirects one method once.
   *
   * The probe is answered normally everywhere else, so what a case reads is the
   * redirection rather than a datacenter that refuses everything.
   */
  /** What a datacenter answers the two halves of an introduction with. */
  const introduction = (query: TlValue): TlValue | undefined => {
    if (query._ === 'auth.exportAuthorization') {
      return { _: 'auth.exportedAuthorization', id: 7n, bytes: Uint8Array.of(1, 2, 3, 4) }
    }
    if (query._ === 'auth.importAuthorization') {
      return { _: 'auth.authorization', user: { _: 'user', id: 7n, access_hash: 11n } }
    }

    return undefined
  }

  function redirecting(error: string, method = 'help.getAppUpdate') {
    const asked: Array<{ name: string; dcId: number }> = []
    const instance = harness({
      api: (query, dcId) => {
        asked.push({ name: query._, dcId })
        const introduced = introduction(query)
        if (introduced !== undefined) return introduced
        if (query._ !== method) return undefined
        if (dcId === 2) throw new TelegramError(error)

        return { _: 'boolFalse' }
      },
    })

    return { instance, asked }
  }

  const probe = { _: 'help.getAppUpdate', source: 'probe' }

  it('introduces the account before repeating the call, and records where it moved', async () => {
    // An account that has moved leaves the datacenter it moved to knowing
    // nothing about it, so the credential goes first. Recording the move is
    // what stops the next call returning to the datacenter it just left.
    const { instance, asked } = redirecting('USER_MIGRATE_4 (303)')
    await instance.account.connect()

    const answer = await instance.account.api.call(probe)

    expect(answer._).toBe('boolFalse')

    // Which end each half of the introduction was made at is the whole of it:
    // the datacenter holding the account issues the credential, and the one it
    // is being introduced to accepts it. Reversed, the credential names the
    // wrong datacenter and is refused.
    expect(asked.filter((entry) => entry.name === 'auth.exportAuthorization')).toEqual([
      { name: 'auth.exportAuthorization', dcId: 2 },
    ])
    expect(asked.filter((entry) => entry.name === 'auth.importAuthorization')).toEqual([
      { name: 'auth.importAuthorization', dcId: 4 },
    ])
    expect(homeOf(instance)).toBe(4)
    await instance.dispose()
  })

  it('follows a network suggestion without introducing anything or moving house', async () => {
    // A network that suggests another datacenter says nothing about where the
    // account lives, so there is nothing to introduce and nothing to record.
    const { instance, asked } = redirecting('NETWORK_MIGRATE_4 (303)')
    await instance.account.connect()
    const before = instance.stored.get('dcs:datacenters')

    const answer = await instance.account.api.call(probe)

    expect(answer._).toBe('boolFalse')
    expect(asked.filter((entry) => entry.name === 'auth.exportAuthorization')).toHaveLength(0)
    expect(instance.stored.get('dcs:datacenters')).toBe(before)
    await instance.dispose()
  })

  it('raises a phone redirection rather than following it', async () => {
    // It means signing in again where it points, which is the sign-in steps'
    // business and not something a call can do on the caller's behalf.
    const { instance } = redirecting('PHONE_MIGRATE_4 (303)')
    await instance.account.connect()

    await expect(instance.account.api.call(probe)).rejects.toThrow(/PHONE_MIGRATE_4/)
    await instance.dispose()
  })

  it('raises a file redirection rather than following it', async () => {
    // A transfer follows its own, and routing a whole call to the datacenter
    // that holds one file is not what the redirection asked for.
    const { instance } = redirecting('FILE_MIGRATE_4 (303)')
    await instance.account.connect()

    await expect(instance.account.api.call(probe)).rejects.toThrow(/FILE_MIGRATE_4/)
    await instance.dispose()
  })

  it('gives up on datacenters that point at each other', async () => {
    // Two datacenters each saying the account is at the other describe a loop
    // no number of attempts resolves.
    const instance = harness({
      api: (query, dcId) => {
        const introduced = introduction(query)
        if (introduced !== undefined) return introduced
        if (query._ !== 'help.getAppUpdate') return undefined
        throw new TelegramError(`USER_MIGRATE_${dcId === 2 ? 4 : 2} (303)`)
      },
    })
    await instance.account.connect()

    await expect(instance.account.api.call(probe)).rejects.toThrow(/redirected in a loop/)
    await instance.dispose()
  })

  it('leaves an ordinary refusal alone', async () => {
    // The control. A call that fails for its own reasons must not be repeated
    // anywhere, or a refusal would be tried against every datacenter in turn.
    const asked: number[] = []
    const instance = harness({
      api: (query, dcId) => {
        if (query._ !== 'help.getAppUpdate') return undefined
        asked.push(dcId)
        throw new TelegramError('SOMETHING_ELSE (400)')
      },
    })
    await instance.account.connect()

    await expect(instance.account.api.call(probe)).rejects.toThrow(/SOMETHING_ELSE/)
    expect(asked).toEqual([2])
    await instance.dispose()
  })
})

/**
 * Signing in from prompts, which is the flow above driven by one call.
 *
 * What the steps do is settled by the group above. What is left here is the
 * part the convenience adds: asking Telegram whether anybody is signed in
 * before asking a person for anything, and reaching each callback only where
 * the account genuinely needs it.
 */
describe('signing in from prompts', () => {
  const PHONE = '+70000000000'

  const SENT: TlValue = {
    _: 'auth.sentCode',
    type: { _: 'auth.sentCodeTypeApp', length: 5 },
    phone_code_hash: 'hash-of-the-code',
    timeout: 60,
  }

  const AUTHORIZED: TlValue = {
    _: 'auth.authorization',
    user: { _: 'user', id: 7n, access_hash: 11n },
  }

  const STATE: TlValue = {
    _: 'updates.state',
    pts: 42,
    qts: 0,
    date: 1_700_000_000,
    seq: 7,
    unread_count: 0,
  }

  /** An account whose datacenters answer sign-in and the authorization probe. */
  function driving(replies: (query: TlValue) => TlValue | undefined) {
    const asked: string[] = []

    return {
      asked,
      instance: harness({
        api: (query) => {
          const mine =
            query._.startsWith('auth.') ||
            query._ === 'updates.getState' ||
            query._ === 'account.getPassword'
          if (!mine) return undefined
          asked.push(query._)

          return replies(query)
        },
      }),
    }
  }

  /** Callbacks that record whether they were reached. */
  function prompts() {
    const reached: string[] = []

    return {
      reached,
      calls: {
        phone: () => {
          reached.push('phone')

          return PHONE
        },
        code: () => {
          reached.push('code')

          return '12345'
        },
        password: () => {
          reached.push('password')

          return 'correct horse'
        },
      },
    }
  }

  it('asks Telegram before asking anybody for anything', async () => {
    // An account resumed from a session it was already signed in with reaches
    // none of the callbacks, and nothing local could have told it that.
    const { instance, asked } = driving((query) =>
      query._ === 'updates.getState' ? STATE : undefined,
    )
    await instance.account.connect()
    const { reached, calls } = prompts()

    await instance.account.signIn(calls)

    expect(asked).toEqual(['updates.getState'])
    expect(reached).toEqual([])
    await instance.dispose()
  })

  it('drives the whole flow when nobody is signed in', async () => {
    const { instance, asked } = driving((query) => {
      if (query._ === 'updates.getState') throw new TelegramError('AUTH_KEY_UNREGISTERED (401)')
      if (query._ === 'auth.sendCode') return SENT
      if (query._ === 'auth.signIn') return AUTHORIZED

      return undefined
    })
    await instance.account.connect()
    const { reached, calls } = prompts()

    await instance.account.signIn(calls)

    expect(asked).toEqual(['updates.getState', 'auth.sendCode', 'auth.signIn'])
    expect(reached).toEqual(['phone', 'code'])
    await instance.dispose()
  })

  it('asks for a password only where the account has one', async () => {
    const { instance } = driving((query) => {
      if (query._ === 'updates.getState') throw new TelegramError('AUTH_KEY_UNREGISTERED (401)')
      if (query._ === 'auth.sendCode') return SENT
      if (query._ === 'auth.signIn') throw new TelegramError('SESSION_PASSWORD_NEEDED (401)')
      if (query._ === 'account.getPassword') throw new TelegramError('PASSWORD_HASH_INVALID (400)')

      return undefined
    })
    await instance.account.connect()
    const { reached, calls } = prompts()

    await expect(instance.account.signIn(calls)).rejects.toThrow(/PASSWORD_HASH_INVALID/)

    // Reached because the account asked for it, and only then.
    expect(reached).toEqual(['phone', 'code', 'password'])
    await instance.dispose()
  })

  it('says so rather than half signing in when no password was offered', async () => {
    const { instance } = driving((query) => {
      if (query._ === 'updates.getState') throw new TelegramError('AUTH_KEY_UNREGISTERED (401)')
      if (query._ === 'auth.sendCode') return SENT
      if (query._ === 'auth.signIn') throw new TelegramError('SESSION_PASSWORD_NEEDED (401)')

      return undefined
    })
    await instance.account.connect()
    const { calls } = prompts()

    await expect(instance.account.signIn({ phone: calls.phone, code: calls.code })).rejects.toThrow(
      /protected by a password/,
    )
    await instance.dispose()
  })

  it('raises anything that is not a refusal about the authorization', async () => {
    // The distinction that matters: a flood wait or an unreachable datacenter
    // is a different problem, and treating one as "not signed in" would ask a
    // signed-in person for their phone number.
    const { instance } = driving((query) => {
      if (query._ === 'updates.getState') throw new TelegramError('FLOOD_WAIT_30 (420)')

      return undefined
    })
    await instance.account.connect()
    const { reached, calls } = prompts()

    await expect(instance.account.signIn(calls)).rejects.toThrow(/FLOOD_WAIT_30/)
    expect(reached).toEqual([])
    await instance.dispose()
  })

  it('reports an answer it cannot carry on from', async () => {
    // A number with no account behind it needs registering, which is a separate
    // sequence and is not implemented. Saying so beats looking signed in.
    const { instance } = driving((query) => {
      if (query._ === 'updates.getState') throw new TelegramError('AUTH_KEY_UNREGISTERED (401)')
      if (query._ === 'auth.sendCode') return SENT
      if (query._ === 'auth.signIn') {
        return { _: 'auth.authorizationSignUpRequired' }
      }

      return undefined
    })
    await instance.account.connect()
    const { calls } = prompts()

    await expect(instance.account.signIn(calls)).rejects.toThrow(/registration-required/)
    await instance.dispose()
  })

  it('refuses while the account is not connected', async () => {
    const { instance, asked } = driving(() => undefined)
    const { reached, calls } = prompts()

    await expect(instance.account.signIn(calls)).rejects.toThrow(/is not connected/)

    expect(asked).toHaveLength(0)
    expect(reached).toEqual([])
    await instance.dispose()
  })
})

describe('where an account resumes the update stream', () => {
  /** An update that advances the common box by one. */
  const message = (pts: number): TlValue => ({
    _: 'updateNewMessage',
    message: {
      _: 'message',
      id: pts,
      peer_id: { _: 'peerUser', user_id: 5n },
      from_id: { _: 'peerUser', user_id: 5n },
      message: 'hello',
      date: 1_700_000_000,
    },
    pts,
    pts_count: 1,
  })

  /** The position the account has written down, if it has written one. */
  const written = (instance: MockAccount) =>
    instance.stored.get('updates:state') as { pts?: number; seq?: number } | undefined

  it('writes down how far it has got once a batch is absorbed', async () => {
    const instance = harness()
    await instance.account.connect()

    await instance.account.feed(message(2))

    expect(written(instance)?.pts).toBe(2)
    await instance.dispose()
  })

  it('resumes from the position rather than from nothing', async () => {
    // The whole point. A restarted account that began again from nothing would
    // ask for a difference from a position far behind, be told the box is too
    // far gone to describe, and lose everything it was down for.
    const first = harness()
    await first.account.connect()
    await first.account.feed(message(2))
    await first.account.stop()

    const second = harness({ datacenters: first.datacenters, stored: first.stored })
    await second.account.connect()

    // The next update in the sequence is the one after the position it resumed
    // from, so it applies rather than opening a gap.
    const seen: number[] = []
    second.account.on('message', (event) => {
      seen.push(Number(event.raw['pts']))
    })
    await second.account.feed(message(3))

    expect(seen).toEqual([3])
    expect(written(second)?.pts).toBe(3)
    await second.dispose()
  })

  it('keeps nothing but the position', async () => {
    // Not the updates, not the messages, not the peers they mentioned: those
    // arrive again from the difference the position is used to ask for.
    const instance = harness()
    await instance.account.connect()

    await instance.account.feed(message(2))

    expect(Object.keys(written(instance) ?? {}).toSorted()).toEqual([
      'channels',
      'date',
      'pts',
      'qts',
      'seq',
    ])
    await instance.dispose()
  })

  it('does not fail the stream when the store will not take the position', async () => {
    // The updates have already been judged and handed on. Losing the place
    // costs a catch-up on the next start, not correctness now.
    const records: LogRecord[] = []
    const kept = new Map<string, unknown>()
    const instance = harness({
      log: createLogger({ sink: { write: (record) => records.push(record) } }),
      storage: {
        get: async (name: string) => kept.get(name),
        set: async (name: string, value: unknown) => {
          if (name.startsWith('updates:')) throw new Error('the store is full')
          kept.set(name, value)
        },
        delete: async (name: string) => {
          kept.delete(name)
        },
      },
    })
    await instance.account.connect()

    const seen: number[] = []
    instance.account.on('message', (event) => {
      seen.push(Number(event.raw['pts']))
    })
    await instance.account.feed(message(2))

    expect(seen).toEqual([2])
    expect(records.filter((record) => record.level === 'warn').map((record) => record.message)) //
      .toContain('could not write down how far through the stream this account has got')
    await instance.dispose()
  })

  it('refuses a stored position that cannot be read rather than starting again', async () => {
    // Absent means "start from wherever Telegram is now". A damaged position
    // answered that way skips everything between and says nothing about it.
    const first = harness()
    await first.account.connect()
    await first.account.feed(message(2))
    await first.account.stop()
    first.stored.set('updates:state', { pts: -1, qts: 1, seq: 0, date: 0, channels: {} })

    const second = harness({ datacenters: first.datacenters, stored: first.stored })

    await expect(second.account.connect()).rejects.toThrow(/no usable 'pts'/)
    await second.dispose()
  })
})
