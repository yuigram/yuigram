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
import { thumbnailFile } from '../src/files/media.js'
import { POOL_LIMITS } from '../src/network/pools.js'
import type { MtprotoContext } from '../src/normalize/context.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import type { TlValue } from '../src/tl/index.js'
import type { MockDatacenter } from './server/datacenter.js'
import { contentOf, FileServer, thumbnailContentOf } from './server/files.js'
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

/**
 * Every file one message asked a datacenter for.
 *
 * The same unwrapping as {@link named}, reading the location rather than the
 * method, so a case can tell which file a range belonged to.
 */
function fetchedIn(value: TlValue): string[] {
  const inner = value['query']
  const nested =
    typeof inner === 'object' && inner !== null && typeof (inner as TlValue)._ === 'string'
      ? fetchedIn(inner as TlValue)
      : []

  if (value._ !== 'upload.getFile') return nested
  const location = value['location'] as TlValue | undefined
  const id = location?.['id']

  return typeof id === 'bigint' ? [id.toString(), ...nested] : nested
}

/**
 * Which connections at a datacenter carried ranges of one file.
 *
 * By position in the order the datacenter accepted them, which is enough to
 * compare two fetches: a pool hands out its own connections and no others, so
 * two files sharing one were in the same pool and two sharing none were not.
 */
function carriedOn(instance: MockAccount, dcId: number, file: bigint): number[] {
  const wanted = file.toString()

  return instance
    .datacenter(dcId)
    .connections.flatMap((connection, index) =>
      connection.peer.seen.flatMap((message) => fetchedIn(message.value)).includes(wanted)
        ? [index]
        : [],
    )
}

/** Whether two sets of connections have any in common. */
const share = (left: readonly number[], right: readonly number[]) =>
  left.some((index) => right.includes(index))

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
      'claim',
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
    const second = harness({ datacenters: first.datacenters, stored: first.rawStored })
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
      'claim',
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

/**
 * Two accounts in one application.
 *
 * A container holding several clients is the arrangement the design documents
 * claim and the one nothing has exercised: a single account proves that
 * protocol state stays out of the container's store, but it cannot show that
 * two accounts stay out of each other's. Everything an account owns is
 * per-account — its authorizations, the peers it has learned, the place it has
 * reached in the stream, the connections it holds — and the only thing the
 * container decides is which clients exist and what surrounds them.
 *
 * So these are about the boundary between two clients rather than about either
 * one: what each writes down, what each is told, and what happens to one when
 * the other is stopped or fails.
 */
describe('two accounts held by one application', () => {
  /** A container over a store a case can read, as an application's own state. */
  function container() {
    const shared = new Map<string, unknown>()
    // Parameterised, as an application holding accounts is: a container's own
    // type is every event its clients can produce, and a handler that spans
    // them reads what that type carries.
    const app = new App<MtprotoContext>({
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

    return { app, shared }
  }

  /** An update naming a peer, as one account would be told about it. */
  const message = (id: number, text: string): TlValue => ({
    _: 'updateNewMessage',
    message: {
      _: 'message',
      id,
      peer_id: { _: 'peerUser', user_id: 5n },
      message: text,
      date: NOW_SECONDS,
    },
    pts: 1,
    pts_count: 1,
  })

  it('gives each its own authorization, and neither the other s', async () => {
    // Each account has its own store because each has its own credentials. Two
    // sharing one would collide on every name the subsystem owns, so the
    // container hands out neither and nothing is shared by default.
    const { app } = container()
    const alice = harness({ name: 'alice' })
    const bob = harness({ name: 'bob' })
    app.add(alice.account)
    app.add(bob.account)

    await reach(alice)
    await reach(bob)

    expect([...alice.stored.keys()].toSorted()).toEqual([
      'auth:dc2:key',
      'auth:dc2:salt',
      'auth:dc2:temp0',
      'claim',
    ])
    expect(alice.stored.get('auth:dc2:key')).not.toEqual(bob.stored.get('auth:dc2:key'))
    await app.stop()
  })

  it('gives each its own area of the application s own store', async () => {
    const { app, shared } = container()
    const alice = harness({ name: 'alice' })
    const bob = harness({ name: 'bob' })
    app.add(alice.account)
    app.add(bob.account)

    await app.storageFor(alice.account).set('seen', 1)
    await app.storageFor(bob.account).set('seen', 2)

    expect([...shared.keys()].toSorted()).toEqual(['clients:alice:seen', 'clients:bob:seen'])
    expect(await app.storageFor(alice.account).get('seen')).toBe(1)
    await app.stop()
  })

  it('tells only the account an update arrived on', async () => {
    // The container surrounds both, but an update belongs to the client that
    // received it. A handler registered on one must not run for the other's
    // traffic, or a program holding two identities would answer as whichever
    // it happened to register first.
    const { app } = container()
    const alice = harness({ name: 'alice' })
    const bob = harness({ name: 'bob' })
    app.add(alice.account)
    app.add(bob.account)

    const heard: string[] = []
    alice.account.on('message', (event) => {
      heard.push(`alice:${event.text ?? ''}`)
    })
    bob.account.on('message', (event) => {
      heard.push(`bob:${event.text ?? ''}`)
    })

    await alice.account.connect()
    await bob.account.connect()
    await alice.account.deliver(message(1, 'for alice'))

    expect(heard).toEqual(['alice:for alice'])
    await app.stop()
  })

  it('names the client an update arrived on, for a handler that spans both', async () => {
    const { app } = container()
    const alice = harness({ name: 'alice' })
    const bob = harness({ name: 'bob' })
    app.add(alice.account)
    app.add(bob.account)

    const seen: string[] = []
    app.on('message', (event) => {
      seen.push(event.client.name)
    })

    await alice.account.connect()
    await bob.account.connect()
    await alice.account.deliver(message(1, 'one'))
    await bob.account.deliver(message(2, 'two'))
    await bob.account.deliver(message(3, 'three'))

    expect(seen).toEqual(['alice', 'bob', 'bob'])
    await app.stop()
  })

  it('leaves one usable when the other is stopped', async () => {
    // Stopping takes down the connections that client holds. Another client's
    // are not among them, and a container that shared any of it would make one
    // account's shutdown the other's outage.
    const { app } = container()
    const alice = harness({ name: 'alice' })
    const bob = harness({ name: 'bob' })
    app.add(alice.account)
    app.add(bob.account)

    await reach(alice)
    await reach(bob)
    await alice.account.stop()

    expect(alice.account.connected).toBe(false)
    expect(bob.account.connected).toBe(true)
    // Still answering, on the connections it held all along. What the mock
    // answers with is not the point; that it answers at all is.
    await expect(bob.account.api.call({ _: 'help.getNearestDc' })).resolves.toBeDefined()
    await app.stop()
  })

  it('refuses the one that was stopped, without touching the other', async () => {
    const { app } = container()
    const alice = harness({ name: 'alice' })
    const bob = harness({ name: 'bob' })
    app.add(alice.account)
    app.add(bob.account)

    await reach(alice)
    await reach(bob)
    await alice.account.stop()

    await expect(alice.account.api.call({ _: 'help.getNearestDc' })).rejects.toThrow(
      /is not connected/,
    )
    expect(bob.account.connected).toBe(true)
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
      'claim',
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
    const stranded = harness({ stored: spent.rawStored })
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
          if (name.includes('peers:')) throw new Error('the store is full')
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
 * Which set of connections a fetch is allowed to use.
 *
 * The bulk allowance exists so a file that moves in many ranges can move in
 * several at once. A file that is one range cannot use it — it occupies one
 * connection whatever the ceiling says — and a stream of thumbnails taking a
 * bulk connection each would crowd out the transfers the allowance is for. So
 * a fetch that is one request goes to the smaller allowance instead, and what
 * separates the two comes from the protocol rather than from a number somebody
 * picked: a range may not cross a megabyte, so a file no larger than one is a
 * single request by arithmetic.
 *
 * Pools are separate sets of connections, so two fetches in one pool share
 * connections and two in different pools cannot. That is what these cases read.
 */
describe('how much of a file there is decides which connections carry it', () => {
  const BULK = 0x0b01_c000n
  const SMALL = 0x0b01_c001n
  const OTHER = 0x0b01_c002n
  const EDGE = 0x0b01_c003n
  const OVER = 0x0b01_c004n

  const MEGABYTE = 1024 * 1024

  const SIZES = new Map<bigint, number>([
    [BULK, 3 * MEGABYTE],
    [SMALL, 64 * 1024],
    [OTHER, 32 * 1024],
    [EDGE, MEGABYTE],
    [OVER, MEGABYTE + 1],
  ])

  /** An account whose datacenter holds every file these cases fetch. */
  function stored() {
    const server = new FileServer(2)
    const locations = new Map<bigint, TlValue>()

    for (const [id, size] of SIZES) {
      const { reference } = server.add(id, { size, dcId: 2 })
      locations.set(id, {
        _: 'inputDocumentFileLocation',
        id,
        access_hash: 5n,
        file_reference: reference,
        thumb_size: '',
      })
    }

    const instance = harness({
      api: (query, dcId) =>
        query._.startsWith('upload.') && dcId === 2 ? server.invoke(query) : undefined,
    })

    /** Fetch one of them, stating its length unless the case is about not knowing. */
    const fetch = (id: bigint, known = true) =>
      instance.account.download({
        location: locations.get(id) as TlValue,
        dcId: 2,
        ...(known ? { size: SIZES.get(id) as number } : {}),
      })

    /** The same fetch, handed over range by range rather than whole. */
    const stream = (id: bigint) =>
      instance.account.downloadTo({
        location: locations.get(id) as TlValue,
        dcId: 2,
        size: SIZES.get(id) as number,
        write: () => {},
      })

    return { server, instance, fetch, stream }
  }

  it('lets two bulk fetches share connections, which is what one pool looks like', async () => {
    // The control every case below is read against. Both of these are several
    // ranges, both belong to the bulk allowance, and a pool hands its own
    // connections back rather than opening a set per transfer.
    const { instance, fetch } = stored()
    await instance.account.connect()

    await fetch(BULK)
    await fetch(OVER)

    expect(share(carriedOn(instance, 2, BULK), carriedOn(instance, 2, OVER))).toBe(true)
    await instance.dispose()
  })

  it('does not put a file that fits in one range on a bulk connection', async () => {
    const { instance, fetch } = stored()
    await instance.account.connect()

    await fetch(BULK)
    await fetch(SMALL)

    const small = carriedOn(instance, 2, SMALL)
    expect(small.length).toBeGreaterThan(0)
    expect(share(carriedOn(instance, 2, BULK), small)).toBe(false)
    await instance.dispose()
  })

  it('keeps small fetches together, rather than taking a connection each', async () => {
    // The smaller allowance is an allowance, not a connection per thumbnail.
    const { instance, fetch } = stored()
    await instance.account.connect()

    await fetch(SMALL)
    await fetch(OTHER)

    expect(share(carriedOn(instance, 2, SMALL), carriedOn(instance, 2, OTHER))).toBe(true)
    await instance.dispose()
  })

  it('reads a megabyte as one range and a byte more as several', async () => {
    // The boundary is the one the server enforces on a range, so it falls at a
    // megabyte exactly rather than at a round number near it.
    const { instance, fetch } = stored()
    await instance.account.connect()

    await fetch(EDGE)
    await fetch(OVER)

    const edge = carriedOn(instance, 2, EDGE)
    expect(edge.length).toBeGreaterThan(0)
    expect(share(edge, carriedOn(instance, 2, OVER))).toBe(false)
    await instance.dispose()
  })

  it('does not treat a length nobody knows as small', async () => {
    // Read in order until it ends, which is one range at a time but may be any
    // size at all. Two of those would fill the smaller allowance and leave
    // nothing for the traffic it exists for.
    const { instance, fetch } = stored()
    await instance.account.connect()

    await fetch(BULK)
    await fetch(OTHER, false)

    const unknown = carriedOn(instance, 2, OTHER)
    expect(unknown.length).toBeGreaterThan(0)
    expect(share(carriedOn(instance, 2, BULK), unknown)).toBe(true)
    await instance.dispose()
  })

  it('keeps a small fetch off the connection ordinary calls travel on', async () => {
    // The smaller allowance is a third set, not the main connection reused for
    // whatever happens to be short.
    const { instance, fetch } = stored()
    await instance.account.connect()

    await instance.account.api.call({ _: 'help.getConfig' })
    await fetch(SMALL)

    const ordinary = instance
      .datacenter(2)
      .connections.flatMap((connection, index) =>
        connection.peer.seen.flatMap((message) => named(message.value)).includes('help.getConfig')
          ? [index]
          : [],
      )
    expect(ordinary.length).toBeGreaterThan(0)
    expect(share(ordinary, carriedOn(instance, 2, SMALL))).toBe(false)
    await instance.dispose()
  })

  it('gives a bulk transfer more connections than the small allowance would hold', async () => {
    // What separates the two allowances is how many connections each may take,
    // and a partition that had them the wrong way round would look identical
    // everywhere except here: three megabytes is three ranges, they are asked
    // for together, and each one in flight takes a connection of its own.
    const { instance, fetch } = stored()
    await instance.account.connect()

    await fetch(BULK)

    expect(carriedOn(instance, 2, BULK).length).toBeGreaterThan(POOL_LIMITS['download-small'])
    await instance.dispose()
  })

  it('measures a streamed fetch the same way as a whole one', async () => {
    // Handing ranges over as they arrive is a different way of receiving a
    // file, not a different kind of transfer.
    const { instance, fetch, stream } = stored()
    await instance.account.connect()

    await fetch(BULK)
    await stream(SMALL)

    const small = carriedOn(instance, 2, SMALL)
    expect(small.length).toBeGreaterThan(0)
    expect(share(carriedOn(instance, 2, BULK), small)).toBe(false)
    await instance.dispose()
  })

  it('still hands back the bytes that were asked for', async () => {
    // Routing decides which connection carries the request, and nothing else.
    const { instance, fetch } = stored()
    await instance.account.connect()

    const bytes = await fetch(SMALL)

    expect(bytes).toEqual(contentOf(SMALL, 0, SIZES.get(SMALL) as number))
    await instance.dispose()
  })
})

/**
 * Fetching from a machine Telegram does not operate.
 *
 * A datacenter may answer a request for a file by naming a delivery node. The
 * node holds the file encrypted, knows nothing about the account, and is not
 * run by Telegram — so going there is a decision about trust rather than about
 * speed, and `docs/security.md` §5 makes it the caller's and nobody else's.
 *
 * `files-cdn.test.ts` judges what happens to the bytes: the counter-mode
 * decryption and the per-block verification that makes them worth anything.
 * What is left to prove here is the boundary around it — that the offer is not
 * made unless it was asked for, that a node is recognised by the address list
 * rather than by whoever claimed to be one, and that nothing but a range
 * request ever travels there.
 */
describe('a delivery node', () => {
  const FILE = 0x0cd0_0001n
  const SIZE = 512 * 1024

  /** The datacenter the node stands behind, and the number it is published as. */
  const HOME = 2
  const NODE = 102

  /**
   * An account whose datacenter would rather redirect than serve.
   *
   * The node is a datacenter of its own in the address list, flagged as one, so
   * everything from the handshake upwards runs against it for real.
   */
  function willing(options: { readonly published?: boolean } = {}) {
    const published = options.published ?? true
    const server = new FileServer(HOME)
    server.faults = { viaCdn: true }
    const { reference } = server.add(FILE, { size: SIZE, dcId: HOME })

    const instance = harness({
      endpoints: [
        { id: HOME, host: '127.0.0.2' },
        ...(published ? [{ id: NODE, host: '127.0.0.102', cdn: true }] : []),
      ],
      // The same store answers under both numbers: a node serving ranges of a
      // file the datacenter holds is the arrangement being modelled, and a
      // second store would only have to be kept in step with the first.
      api: (query) => (query._.startsWith('upload.') ? server.invoke(query) : undefined),
    })

    return {
      instance,
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

  /** Whether one message asked for a file and said a node would do. */
  function saidNodeWouldDo(value: TlValue): boolean {
    const inner = value['query']
    const nested =
      typeof inner === 'object' && inner !== null && typeof (inner as TlValue)._ === 'string'
        ? saidNodeWouldDo(inner as TlValue)
        : false

    return nested || (value._ === 'upload.getFile' && value['cdn_supported'] === true)
  }

  /** Whether any request this account made said it would accept a node. */
  const offered = (instance: MockAccount) =>
    [...instance.datacenters.values()]
      .flatMap((datacenter) => datacenter.connections)
      .flatMap((connection) => connection.peer.seen)
      .some((element) => saidNodeWouldDo(element.value))

  it('is not offered unless the caller asked for one', async () => {
    // The default. A datacenter that would rather redirect still serves the
    // file to a client that has not said it can be redirected, so holding the
    // boundary costs nothing.
    const { instance, location } = willing()
    await instance.account.connect()

    const bytes = await instance.account.download({ location, dcId: HOME, size: SIZE })

    expect(offered(instance)).toBe(false)
    expect(bytes).toEqual(contentOf(FILE, 0, SIZE))
    await instance.dispose()
  })

  it('is offered when the caller asks, and serves the file', async () => {
    const { instance, location } = willing()
    await instance.account.connect()

    const bytes = await instance.account.download({ location, dcId: HOME, size: SIZE, cdn: true })

    expect(offered(instance)).toBe(true)
    // Byte for byte against what the datacenter holds, because a range that
    // decrypts to something of the right length is not the right content.
    expect(bytes).toEqual(contentOf(FILE, 0, SIZE))
    await instance.dispose()
  })

  it('is reached on connections of its own, never the account s', async () => {
    // A node is a datacenter this account holds nothing at. Sharing a
    // connection with one it does hold something at is the whole thing being
    // avoided.
    const { instance, location } = willing()
    await instance.account.connect()

    await instance.account.api.call({ _: 'help.getNearestDc' })
    await instance.account.download({ location, dcId: HOME, size: SIZE, cdn: true })

    expect(instance.datacenter(NODE).connections.length).toBeGreaterThan(0)
    await instance.dispose()
  })

  it('is asked for ranges and nothing else', async () => {
    // The list is this client's rather than the node's. A guarantee that
    // depends on the far end declining what it should never have been offered
    // is not a guarantee.
    const { instance, location } = willing()
    await instance.account.connect()

    await instance.account.download({ location, dcId: HOME, size: SIZE, cdn: true })

    const asked = instance
      .datacenter(NODE)
      .connections.flatMap((connection) => connection.peer.seen)
      .flatMap((element) => named(element.value))
      .filter((name) => !name.startsWith('invoke') && !name.startsWith('initConnection'))
    expect(asked.length).toBeGreaterThan(0)
    for (const name of asked) {
      expect(['upload.getCdnFile', 'upload.getCdnFileHashes', 'msgs_ack', 'ping']).toContain(name)
    }
    await instance.dispose()
  })

  it('is not asked for a file, whatever a location claims', async () => {
    // A location says which datacenter holds the file, and that is somebody
    // else's claim too. One naming a node would otherwise have a transfer ask
    // for an ordinary range there — a method a node does not serve, and one
    // this client has no business sending to a machine it holds nothing at.
    const { instance, location } = willing()
    await instance.account.connect()

    await expect(instance.account.download({ location, dcId: NODE, size: SIZE })).rejects.toThrow(
      /a delivery node may not be asked 'upload.getFile'/,
    )
    await instance.dispose()
  })

  it('is not somewhere the escape hatch can be pointed', async () => {
    // A node holds no authorization of this account's and answers none of the
    // methods that would need one. Reaching one for an ordinary call is a wait
    // for an address the list says does not exist, so it is refused instead.
    const { instance } = willing()
    await instance.account.connect()

    expect(() => instance.account.reach(NODE)).toThrow(/is a delivery node/)
    await instance.dispose()
  })

  it('is not reached at all when the address list does not describe one', async () => {
    // A redirection is a claim somebody else made. The flag is Telegram's own
    // statement about which machines it does not operate, and a redirection to
    // a datacenter the list says nothing about is nowhere to go.
    const { instance, location } = willing({ published: false })
    await instance.account.connect()

    await expect(
      instance.account.download({ location, dcId: HOME, size: SIZE, cdn: true }),
    ).rejects.toThrow(/no address is known for datacenter 102/)
    await instance.dispose()
  })

  it('is authorized with a key of its own, vouched for by nothing', async () => {
    // What is negotiated with a node is good for fetching ranges from that node
    // and for nothing beyond it. No temporary key is obtained there, because
    // vouching for one means presenting the long-lived key this account
    // authorizes with to a machine that has no business seeing it.
    const { instance, location } = willing()
    await instance.account.connect()
    await instance.account.api.call({ _: 'help.getNearestDc' })
    const home = instance.stored.get(`auth:dc${HOME}:key`)

    await instance.account.download({ location, dcId: HOME, size: SIZE, cdn: true })

    const held = [...instance.stored.keys()].filter((key) => key.startsWith(`auth:dc${NODE}:`))
    expect(held).toContain(`auth:dc${NODE}:key`)
    expect(held).not.toContain(`auth:dc${NODE}:temp0`)
    // And the account's own authorization is exactly where it was.
    expect(instance.stored.get(`auth:dc${HOME}:key`)).toEqual(home)
    expect(instance.stored.get(`auth:dc${NODE}:key`)).not.toEqual(home)
    await instance.dispose()
  })

  it('holds no authorization belonging to this account', async () => {
    // A key negotiated with a node is good for fetching ranges from that node
    // and for nothing beyond it. Nothing vouches for it, and the long-lived key
    // this account authorizes with never travels there.
    const { instance, location } = willing()
    await instance.account.connect()

    await instance.account.download({ location, dcId: HOME, size: SIZE, cdn: true })

    const asked = instance
      .datacenter(NODE)
      .connections.flatMap((connection) => connection.peer.seen)
      .flatMap((element) => named(element.value))
    expect(asked).not.toContain('auth.bindTempAuthKey')
    expect(asked).not.toContain('auth.importAuthorization')
    expect(asked).not.toContain('auth.exportAuthorization')
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

  /** Whether a second run negotiated and vouched for a key of its own. */
  async function resumeOver(instance: MockAccount) {
    const spent = instance.datacenter(2).connections.length
    // The same account, started again over the store the first run left: the
    // question is which stored key the second run is willing to open with.
    const second = harness({
      name: 'first',
      datacenters: instance.datacenters,
      stored: instance.rawStored,
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
describe('saying an account is at the keyboard', () => {
  /** Let the calls the presence timer started actually travel. */
  const settleCalls = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60))

  /**
   * A scheduler that records the presence timer and runs everything else.
   *
   * The connection layer needs its own timers to fire or nothing reaches a
   * datacenter, so only the interval presence uses is held back — which is what
   * lets a case decide when the next "I am here" happens.
   */
  function recordingPresence() {
    const held: { run: () => void; cancelled: boolean }[] = []

    const schedule = (run: () => void, delay: number): (() => void) => {
      if (delay !== 240_000) {
        const timer = setTimeout(run, delay)

        return () => clearTimeout(timer)
      }

      const entry = { run, cancelled: false }
      held.push(entry)

      return () => {
        entry.cancelled = true
      }
    }

    return { held, schedule }
  }

  it('repeats that it is online until told to stop', async () => {
    // Appearing online is a repeated statement rather than a state: Telegram
    // forgets within minutes. One call says it once; this keeps saying it.
    const presence = recordingPresence()
    const asked: TlValue[] = []
    const instance = harness({
      schedule: presence.schedule,
      api: (query) => {
        asked.push(query)

        return undefined
      },
    })
    // Reached first, so the exchange is behind us and a call travels at once.
    await reach(instance)

    const said = () => asked.filter((one) => one._ === 'account.updateStatus').length
    const stop = instance.account.stayOnline()
    await settleCalls()

    expect(said()).toBe(1)
    expect(presence.held).toHaveLength(1)

    // The scheduled turn says it again.
    presence.held[0]?.run()
    await settleCalls()
    expect(said()).toBe(2)

    // The one still pending is cancelled. The one that already fired is not
    // pending and was never cancelled, which is the difference.
    stop()
    expect(presence.held).toHaveLength(2)
    expect(presence.held.at(-1)?.cancelled).toBe(true)
    await instance.dispose()
  })

  it('keeps one presence rather than two', async () => {
    // An account has one presence. A second timer would double the calls to
    // say the same thing.
    const presence = recordingPresence()
    const instance = harness({ schedule: presence.schedule })
    await reach(instance)

    instance.account.stayOnline()
    await settleCalls()
    const [first] = presence.held

    instance.account.stayOnline()
    await settleCalls()

    expect(first?.cancelled).toBe(true)
    expect(presence.held.filter((timer) => !timer.cancelled)).toHaveLength(1)
    await instance.dispose()
  })

  it('stops saying so when the account stops', async () => {
    const presence = recordingPresence()
    const instance = harness({ schedule: presence.schedule })
    await reach(instance)

    instance.account.stayOnline()
    await settleCalls()
    await instance.account.stop()

    expect(presence.held.every((timer) => timer.cancelled)).toBe(true)
  })
})

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
    expect(sent?.query['phone_number']).toBe(PHONE.slice(1))
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

  it('repeats a send with the key it already carried, not a fresh one', async () => {
    // Telegram deduplicates a send by its random identifier. A migration
    // repeats the call at another datacenter, and drawing a new identifier for
    // the second attempt would make the two look like two different messages —
    // so a redirected send would arrive twice.
    const sent: Array<{ dcId: number; randomId: unknown }> = []
    const instance = harness({
      api: (query, dcId) => {
        const introduced = introduction(query)
        if (introduced !== undefined) return introduced
        if (query._ !== 'messages.sendMessage') return undefined

        sent.push({ dcId, randomId: (query as { random_id?: unknown }).random_id })
        if (dcId === 2) throw new TelegramError('USER_MIGRATE_4 (303)')

        return { _: 'updateShortSentMessage', id: 55, pts: 1, pts_count: 1, date: 0 }
      },
    })

    await instance.account.connect()
    await instance.account.peers.save({
      kind: 'user',
      id: 9n,
      accessHash: 11n,
      min: false,
      usernames: [],
    })

    const answer = await instance.account.sendText({ kind: 'user', id: 9n }, 'hello')

    expect(answer.id).toBe(55)
    expect(sent.map((one) => one.dcId)).toEqual([2, 4])
    expect(typeof sent[0]?.randomId).toBe('bigint')
    expect(sent[1]?.randomId).toBe(sent[0]?.randomId)

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

/**
 * Signing out, and what is left behind when it is done.
 *
 * The call is the easy half. The half worth proving is the store: an
 * authorization the server has revoked is dead everywhere, and a client that
 * kept one would start again against a key nothing accepts — while a position
 * and a set of access hashes belong to the account that earned them and mean
 * nothing to whoever signs in next.
 */
describe('an account signing out', () => {
  /** An account that has connected, learned a peer, and read some of the stream. */
  async function livedIn() {
    const asked: string[] = []
    const instance = harness({
      api: (query) => {
        asked.push(query._)

        return undefined
      },
    })

    await instance.account.connect()
    // A call, because an authorization is negotiated when a datacenter is first
    // reached rather than when the account is built.
    await instance.account.api.call({ _: 'help.getNearestDc' })
    await instance.account.peers.save({
      kind: 'user',
      id: 5n,
      accessHash: 9n,
      min: false,
      usernames: ['someone'],
    })
    await instance.account.feed({
      _: 'updateShort',
      update: { _: 'updateUserTyping', user_id: 5n, action: { _: 'sendMessageTypingAction' } },
      date: NOW_SECONDS,
    })

    return { instance, asked }
  }

  /** Every key the store holds, so a case can say what survived. */
  const held = (instance: MockAccount) => [...instance.stored.keys()].sort()

  it('asks Telegram before it touches anything', async () => {
    const { instance, asked } = await livedIn()

    await instance.account.logOut()

    expect(asked).toContain('auth.logOut')
    await instance.dispose()
  })

  it('keeps everything when the server refuses', async () => {
    // An authorization that survives a failed sign-out is still an
    // authorization. A store cleared anyway would leave an account signed in
    // somewhere it can no longer reach.
    const instance = harness({
      api: (query) => {
        if (query._ !== 'auth.logOut') return undefined

        throw new TelegramError('FRESH_RESET_AUTHORISATION_FORBIDDEN (406)')
      },
    })
    await instance.account.connect()
    await instance.account.api.call({ _: 'help.getNearestDc' })
    const before = held(instance)

    await expect(instance.account.logOut()).rejects.toThrow(/FRESH_RESET/)

    expect(held(instance)).toEqual(before)
    await instance.dispose()
  })

  it('forgets the authorization, so nothing starts again against a dead key', async () => {
    const { instance } = await livedIn()
    expect(held(instance).some((key) => key.startsWith('auth:'))).toBe(true)

    await instance.account.logOut()

    expect(held(instance).filter((key) => key.startsWith('auth:'))).toEqual([])
    await instance.dispose()
  })

  it('forgets the place in the stream, which belonged to that account', async () => {
    const { instance } = await livedIn()
    expect(held(instance)).toContain('updates:state')

    await instance.account.logOut()

    expect(held(instance).filter((key) => key.startsWith('updates:'))).toEqual([])
    await instance.dispose()
  })

  it('forgets the peers, whose hashes were issued to that account', async () => {
    const { instance } = await livedIn()
    expect(held(instance).some((key) => key.startsWith('peers:'))).toBe(true)

    await instance.account.logOut()

    expect(held(instance).filter((key) => key.startsWith('peers:'))).toEqual([])
    await instance.dispose()
  })

  it('keeps the published address list, which describes Telegram rather than the account', async () => {
    // Nothing in it was issued to anybody, and it is what the next sign-in
    // needs before it can reach anything at all. Written here rather than
    // waited for: a datacenter that never publishes a configuration leaves the
    // bootstrap in force, and the case is about what signing out removes.
    const { instance } = await livedIn()
    instance.stored.set('dcs:datacenters', { thisDc: 2 })

    await instance.account.logOut()

    expect(held(instance)).toContain('dcs:datacenters')
    await instance.dispose()
  })

  it('takes the network down with it', async () => {
    const { instance } = await livedIn()

    await instance.account.logOut()

    expect(instance.account.connected).toBe(false)
    await instance.dispose()
  })

  it('refuses while the account is not connected', async () => {
    // The call needs the authorization it is about to revoke.
    const instance = harness()

    await expect(instance.account.logOut()).rejects.toThrow(/is not connected/)
    await instance.dispose()
  })

  it('says so rather than pretending when the store cannot remove in bulk', async () => {
    // Bulk removal is optional in the store interface. What is left behind
    // belongs to an account that has signed out, and somebody has to know.
    const records: LogRecord[] = []
    const kept = new Map<string, unknown>()
    const instance = harness({
      log: createLogger({ sink: { write: (record) => records.push(record) } }),
      storage: {
        get: async (name: string) => kept.get(name),
        set: async (name: string, value: unknown) => {
          kept.set(name, value)
        },
        delete: async (name: string) => {
          kept.delete(name)
        },
      },
    })
    await instance.account.connect()

    await instance.account.logOut()

    expect(records.map((record) => record.message)).toContain(
      'this store cannot remove what the account signed out of',
    )
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

    const second = harness({ datacenters: first.datacenters, stored: first.rawStored })
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
          if (name.includes('updates:')) throw new Error('the store is full')
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

    const second = harness({ datacenters: first.datacenters, stored: first.rawStored })

    await expect(second.account.connect()).rejects.toThrow(/no usable 'pts'/)
    await second.dispose()
  })
})

/**
 * Fetching the document an event carried, and surviving a reference that has
 * expired underneath it.
 *
 * A file reference expires on the datacenter's own schedule and nothing
 * announces it, so the interesting case is the quiet one: a request that is
 * well formed, refused for a reason that says nothing about the file, and put
 * right by asking for the message again. The cases here drive that against a
 * datacenter that actually refuses the stale reference.
 */
describe('a document an event carried', () => {
  const FILE = 0x0d0c_0001n
  const SIZE = 3 * 1024

  /** The message an update carries, naming a document with this reference. */
  const messageWith = (reference: Uint8Array): TlValue => ({
    _: 'message',
    id: 77,
    peer_id: { _: 'peerUser', user_id: 5n },
    from_id: { _: 'peerUser', user_id: 5n },
    message: 'here',
    date: 1_700_000_000,
    media: {
      _: 'messageMediaDocument',
      document: {
        _: 'document',
        id: FILE,
        access_hash: 5n,
        file_reference: reference,
        date: 1_700_000_000,
        mime_type: 'application/pdf',
        size: BigInt(SIZE),
        dc_id: 2,
        attributes: [],
      },
    },
  })

  const update = (reference: Uint8Array): TlValue => ({
    _: 'updateNewMessage',
    message: messageWith(reference),
    pts: 1,
    pts_count: 1,
  })

  /** An account whose datacenter serves the file and answers message refetches. */
  function serving(options: { refetch?: () => Uint8Array } = {}) {
    const files = new FileServer(2)
    const stored = files.add(FILE, { size: SIZE, dcId: 2 })
    const asked: string[] = []

    const instance = harness({
      api: (query) => {
        if (query._.startsWith('upload.')) {
          asked.push(query._)

          return files.invoke(query)
        }
        if (query._ === 'messages.getMessages' || query._ === 'channels.getMessages') {
          asked.push(query._)
          const reference = options.refetch?.()

          return {
            _: 'messages.messages',
            messages: reference === undefined ? [] : [messageWith(reference)],
            chats: [],
            users: [],
          }
        }

        return undefined
      },
    })

    return { instance, files, stored, asked }
  }

  it('fetches it, byte for byte', async () => {
    const { instance, stored } = serving()
    await instance.account.connect()
    await instance.account.peers.save({
      kind: 'user',
      id: 5n,
      accessHash: 9n,
      min: false,
      usernames: [],
    })

    let bytes: Uint8Array | undefined
    instance.account.on('message', async (event) => {
      bytes = await event.download()
    })
    await instance.account.deliver(update(stored.reference))

    expect(bytes).toEqual(contentOf(FILE, 0, SIZE))
    await instance.dispose()
  })

  it('fetches it through the allowance its length belongs in', async () => {
    // An event's own fetch is a fetch like any other. Three kilobytes is one
    // range, so it belongs with the small transfers rather than on a
    // connection kept for files that move in many — and a handler that fetches
    // a thumbnail per message must not be able to take the bulk allowance
    // away from whatever is downloading a video.
    const BULKY = 0x0d0c_0002n
    const { instance, files, stored } = serving()
    const bulk = files.add(BULKY, { size: 3 * 1024 * 1024, dcId: 2 })
    await instance.account.connect()
    await instance.account.peers.save({
      kind: 'user',
      id: 5n,
      accessHash: 9n,
      min: false,
      usernames: [],
    })

    instance.account.on('message', async (event) => {
      await event.download()
    })
    await instance.account.deliver(update(stored.reference))
    await instance.account.download({
      location: {
        _: 'inputDocumentFileLocation',
        id: BULKY,
        access_hash: 5n,
        file_reference: bulk.reference,
        thumb_size: '',
      },
      dcId: 2,
      size: 3 * 1024 * 1024,
    })

    const carried = carriedOn(instance, 2, FILE)
    expect(carried.length).toBeGreaterThan(0)
    expect(share(carried, carriedOn(instance, 2, BULKY))).toBe(false)
    await instance.dispose()
  })

  it('refuses an event whose message carries no media', async () => {
    const { instance } = serving()
    await instance.account.connect()

    let outcome: unknown
    instance.account.on('message', async (event) => {
      outcome = await event.download().catch((error: unknown) => error)
    })
    await instance.account.deliver({
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id: 78,
        peer_id: { _: 'peerUser', user_id: 5n },
        message: 'no media here',
        date: 1_700_000_000,
      },
      pts: 1,
      pts_count: 1,
    })

    expect((outcome as Error).message).toMatch(/carries no media to fetch/)
    await instance.dispose()
  })

  it('refuses a photo that carries no size to fetch', async () => {
    // An empty photo is a hole where one the account cannot see used to be.
    // There is no size to name and nothing to ask a datacenter for.
    const { instance } = serving()
    await instance.account.connect()

    let outcome: unknown
    instance.account.on('message', async (event) => {
      outcome = await event.download().catch((error: unknown) => error)
    })
    await instance.account.deliver({
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id: 79,
        peer_id: { _: 'peerUser', user_id: 5n },
        message: '',
        date: 1_700_000_000,
        media: { _: 'messageMediaPhoto', photo: { _: 'photoEmpty', id: 1n } },
      },
      pts: 1,
      pts_count: 1,
    })

    expect((outcome as Error).message).toMatch(/carries no file this can fetch/)
    await instance.dispose()
  })
})

/**
 * A thumbnail of a document an event carried, fetched over the wire.
 *
 * The datacenter here serves each rendering as its own bytes and refuses a size
 * it does not hold, so a request that lost the selector, or named the wrong
 * document, fetches something visibly different rather than the same bytes.
 * Putting a refused reference right is driven at its seam instead, in
 * `actions-refresh.test.ts`, for the reason given there.
 */
describe('a thumbnail of a document an event carried', () => {
  const FILE = 0x0d0c_0003n
  const THUMB = 1_500

  const documentWith = (reference: Uint8Array) => ({
    _: 'document' as const,
    id: FILE,
    access_hash: 5n,
    file_reference: reference,
    date: 1_700_000_000,
    mime_type: 'video/mp4',
    size: 900_000n,
    dc_id: 2,
    attributes: [],
    thumbs: [
      { _: 'photoStrippedSize' as const, type: 'i', bytes: Uint8Array.of(1, 8, 8) },
      { _: 'photoSize' as const, type: 'm', w: 320, h: 180, size: THUMB },
    ],
  })

  const messageWith = (reference: Uint8Array): TlValue => ({
    _: 'message',
    id: 80,
    peer_id: { _: 'peerUser', user_id: 5n },
    from_id: { _: 'peerUser', user_id: 5n },
    message: 'a clip',
    date: 1_700_000_000,
    media: { _: 'messageMediaDocument', document: documentWith(reference) },
  })

  const update = (reference: Uint8Array): TlValue => ({
    _: 'updateNewMessage',
    message: messageWith(reference),
    pts: 1,
    pts_count: 1,
  })

  function serving() {
    const files = new FileServer(2)
    const stored = files.add(FILE, { size: 900_000, dcId: 2, thumbnails: { m: THUMB } })
    const instance = harness({
      api: (query) => (query._.startsWith('upload.') ? files.invoke(query) : undefined),
    })

    return { instance, files, stored }
  }

  async function connected(instance: ReturnType<typeof serving>['instance']) {
    await instance.account.connect()
    await instance.account.peers.save({
      kind: 'user',
      id: 5n,
      accessHash: 9n,
      min: false,
      usernames: [],
    })
  }

  /** The size every fetch of this file named, in order. */
  const sizesAsked = (files: FileServer) =>
    files.asked
      .filter((query) => query._ === 'upload.getFile')
      .map((query) => (query['location'] as TlValue)['thumb_size'])

  it('fetches the rendering named rather than the document', async () => {
    const { instance, files, stored } = serving()
    await connected(instance)

    let bytes: Uint8Array | undefined
    instance.account.on('message', async (event) => {
      bytes = await event.download({ thumbnail: 'm' })
    })
    await instance.account.deliver(update(stored.reference))

    expect(bytes).toEqual(thumbnailContentOf(FILE, 'm', 0, THUMB))
    expect(sizesAsked(files)).toEqual(['m'])
    await instance.dispose()
  })

  it('surfaces an expired reference to a caller holding only the location', async () => {
    // Nothing here holds the message, so nothing can ask for it again: the
    // refusal is the caller's to act on, carried as the datacenter gave it.
    const { instance, files, stored } = serving()
    await connected(instance)
    files.expire(FILE)

    await expect(
      instance.account.download(thumbnailFile(documentWith(stored.reference), 'm')),
    ).rejects.toThrow(/FILE_REFERENCE_EXPIRED/)
    await instance.dispose()
  })

  it('refuses a size carried in the message before asking anything', async () => {
    const { instance, files, stored } = serving()
    await connected(instance)

    let outcome: unknown
    instance.account.on('message', async (event) => {
      outcome = await event.download({ thumbnail: 'i' }).catch((error: unknown) => error)
    })
    await instance.account.deliver(update(stored.reference))

    expect((outcome as Error).message).toMatch(/arrived with the message/)
    expect(sizesAsked(files)).toEqual([])
    await instance.dispose()
  })
})

/**
 * Reaching a datacenter the address list does not name.
 *
 * A first run is given one address and keeps the list it started with. A
 * redirection to a datacenter that list does not name would otherwise end the
 * account: the call fails saying no address is known, and so does every call
 * after it, because what would fix it is the list nobody asked for.
 */
describe('a redirection to a datacenter the list does not name', () => {
  /** Only datacenter 2 is named, though 4 answers. */
  const NARROW = {
    thisDc: 2,
    testMode: true,
    options: [
      {
        id: 2,
        host: '127.0.0.2',
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

  /** What `help.getConfig` publishes: both datacenters, as the server knows them. */
  const PUBLISHED: TlValue = {
    _: 'config',
    date: 1_700_000_000,
    expires: 1_700_003_600,
    test_mode: true,
    this_dc: 2,
    dc_options: [
      { _: 'dcOption', id: 2, ip_address: '127.0.0.2', port: 443 },
      { _: 'dcOption', id: 4, ip_address: '127.0.0.4', port: 443 },
    ],
    dc_txt_domain_name: 'example',
    chat_size_max: 200,
    megagroup_size_max: 200_000,
    forwarded_count_max: 100,
    online_update_period_ms: 120_000,
    offline_blur_timeout_ms: 5_000,
    offline_idle_timeout_ms: 30_000,
    online_cloud_timeout_ms: 300_000,
    notify_cloud_delay_ms: 30_000,
    notify_default_delay_ms: 1_500,
    push_chat_period_ms: 60_000,
    push_chat_limit: 2,
    edit_time_limit: 172_800,
    revoke_time_limit: 172_800,
    revoke_pm_time_limit: 172_800,
    rating_e_decay: 2_419_200,
    stickers_recent_limit: 200,
    channels_read_media_period: 604_800,
    call_receive_timeout_ms: 20_000,
    call_ring_timeout_ms: 90_000,
    call_connect_timeout_ms: 30_000,
    call_packet_timeout_ms: 10_000,
    me_url_prefix: 'https://t.me/',
    caption_length_max: 1_024,
    message_length_max: 4_096,
    webfile_dc_id: 4,
  }

  /** An account that starts knowing one datacenter and is sent to another. */
  function redirected(publish: boolean) {
    const asked: Array<{ name: string; dcId: number }> = []

    const instance = harness({
      bootstrap: NARROW,
      api: (query, dcId) => {
        asked.push({ name: query._, dcId })
        if (query._ === 'help.getConfig') {
          // A server that publishes a list still missing the datacenter it
          // redirected to has left nothing further to try.
          return publish
            ? PUBLISHED
            : { ...PUBLISHED, dc_options: [(PUBLISHED['dc_options'] as TlValue[])[0]] }
        }
        if (query._ === 'help.getNearestDc' && dcId === 2) {
          throw new TelegramError('NETWORK_MIGRATE_4 (303)')
        }

        return undefined
      },
    })

    return { instance, asked }
  }

  it('asks for the published list, and reaches it', async () => {
    const { instance, asked } = redirected(true)
    await instance.account.connect()

    const answer = await instance.account.api.call({ _: 'help.getNearestDc' })

    expect(answer['_']).toBe('boolTrue')
    // Asked of the connection that issued the redirection, which is reachable
    // by definition, and answered before the account tried to go anywhere.
    const config = asked.find((entry) => entry.name === 'help.getConfig')
    expect(config?.dcId).toBe(2)
    expect(asked.some((entry) => entry.dcId === 4)).toBe(true)
    await instance.dispose()
  })

  it('keeps the published list, so the next call needs no second ask', async () => {
    const { instance, asked } = redirected(true)
    await instance.account.connect()

    await instance.account.api.call({ _: 'help.getNearestDc' })
    const before = asked.filter((entry) => entry.name === 'help.getConfig').length
    await instance.account.api.call({ _: 'help.getInviteText' })

    expect(asked.filter((entry) => entry.name === 'help.getConfig')).toHaveLength(before)
    expect(before).toBe(1)
    await instance.dispose()
  })

  it('does not ask when the list already names the datacenter', async () => {
    // The list is read, not fetched. A redirection to somewhere already known
    // costs nothing.
    const asked: string[] = []
    const instance = harness({
      api: (query, dcId) => {
        asked.push(query._)
        if (query._ === 'help.getNearestDc' && dcId === 2) {
          throw new TelegramError('NETWORK_MIGRATE_4 (303)')
        }

        return undefined
      },
    })
    await instance.account.connect()

    await instance.account.api.call({ _: 'help.getNearestDc' })

    expect(asked).not.toContain('help.getConfig')
    await instance.dispose()
  })

  it('asks once, and does not keep asking, when the list still omits it', async () => {
    // Asking is the only thing that could have helped. A server that publishes
    // a list still missing the datacenter it redirected to has left nothing
    // further to try, and asking again would only repeat the answer.
    const { instance, asked } = redirected(false)
    await instance.account.connect()

    const call = instance.account.api.call({ _: 'help.getNearestDc' })
    const settled = watch(call)
    await until(
      () => asked.some((entry) => entry.name === 'help.getConfig'),
      'the account asked for the published list',
    )

    expect(asked.filter((entry) => entry.name === 'help.getConfig')).toHaveLength(1)
    expect(settled()).toBe(false)

    await instance.dispose()
    await outcome(call)
  })
})

describe('watching a conversation nobody pushes updates for', () => {
  /** Let the calls a watch started actually travel. */
  const settleCalls = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60))

  const CHANNEL: PeerRef = { kind: 'channel', id: 500n }

  /**
   * An account that can name one channel, and a record of what it asked.
   *
   * Everything here is about which requests a watch produces, so the datacenter
   * answers them rather than a connection carrying them: the peer is written
   * down as encountering it would have, and the answers are the shapes Telegram
   * sends for a difference.
   */
  function watching(options: { readonly timeout?: number } = {}) {
    const asked: TlValue[] = []
    const instance = harness({
      api: (query) => {
        asked.push(query)

        if (query._ === 'updates.getChannelDifference') {
          return {
            _: 'updates.channelDifferenceEmpty',
            final: true,
            pts: 4,
            ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
          }
        }

        if (query._ === 'messages.getPeerDialogs') {
          return {
            _: 'messages.peerDialogs',
            dialogs: [
              {
                _: 'dialog',
                peer: { _: 'peerChannel', channel_id: CHANNEL.id },
                top_message: 1,
                read_inbox_max_id: 0,
                read_outbox_max_id: 0,
                unread_count: 0,
                unread_mentions_count: 0,
                unread_reactions_count: 0,
                unread_poll_votes_count: 0,
                notify_settings: { _: 'peerNotifySettings' },
                pts: 3,
              },
            ],
            messages: [],
            chats: [],
            users: [],
            state: { _: 'updates.state', pts: 1, qts: 0, date: 0, seq: 0, unread_count: 0 },
          }
        }

        return undefined
      },
    })

    return { instance, asked, count: (name: string) => asked.filter((q) => q._ === name).length }
  }

  /** Write the channel down, as meeting it would have. */
  const named = async (instance: MockAccount) => {
    await instance.account.peers.save({
      kind: 'channel',
      id: CHANNEL.id,
      accessHash: 5000n,
      min: false,
      usernames: [],
    })
  }

  it('asks for the channel’s difference as soon as it is watched', async () => {
    // Telegram does not push a channel's updates to an account that is not
    // looking at it, so looking at it is a request rather than a flag.
    const w = watching()
    await reach(w.instance)
    await named(w.instance)

    await w.instance.account.watchChat(CHANNEL)
    await settleCalls()

    expect(w.count('updates.getChannelDifference')).toBe(1)
    await w.instance.dispose()
  })

  it('reads a starting position from the dialog when it has none stored', async () => {
    // A channel the account has never held a position for cannot be asked for
    // a difference at all, and the conversation-list row carries one.
    const w = watching()
    await reach(w.instance)
    await named(w.instance)

    await w.instance.account.watchChat(CHANNEL)
    await settleCalls()

    expect(w.count('messages.getPeerDialogs')).toBe(1)
    const asked = w.asked.find((one) => one._ === 'updates.getChannelDifference')
    expect(asked?.['pts']).toBe(3)
    await w.instance.dispose()
  })

  it('stops asking once the watch is released', async () => {
    const w = watching({ timeout: 30 })
    await reach(w.instance)
    await named(w.instance)

    const stop = await w.instance.account.watchChat(CHANNEL)
    await settleCalls()
    const before = w.count('updates.getChannelDifference')

    stop()
    // Releasing twice is not an error and does not release somebody else's.
    stop()

    await settleCalls()
    expect(w.count('updates.getChannelDifference')).toBe(before)
    await w.instance.dispose()
  })

  it('does nothing for a conversation that has no sequence of its own', async () => {
    // A private chat's updates are in the account's own sequence and already
    // arrive. Accepted and ignored rather than refused, so a caller does not
    // have to know which kind of conversation it is holding.
    const w = watching()
    await reach(w.instance)
    await w.instance.account.peers.save({
      kind: 'user',
      id: 7n,
      accessHash: 70n,
      min: false,
      usernames: [],
    })

    const stop = await w.instance.account.watchChat({ kind: 'user', id: 7n })
    await settleCalls()

    expect(w.count('updates.getChannelDifference')).toBe(0)
    expect(() => {
      stop()
    }).not.toThrow()
    await w.instance.dispose()
  })

  it('releases what it was watching when the account stops', async () => {
    const w = watching({ timeout: 30 })
    await reach(w.instance)
    await named(w.instance)

    const stop = await w.instance.account.watchChat(CHANNEL)
    await settleCalls()
    await w.instance.account.stop()

    // The account is gone, and letting go afterwards is still safe.
    expect(() => {
      stop()
    }).not.toThrow()
  })
})

/**
 * An inline message lives on the datacenter its identifier names.
 *
 * Only that datacenter will edit it, and an account signed in elsewhere is
 * unknown there until it has been introduced. So the edit goes where the
 * identifier says, and a refusal naming an unregistered key is answered once,
 * with the introduction, before the edit is repeated.
 */
describe('editing an inline message on another datacenter', () => {
  const inlineOn = (dcId: number) => ({
    _: 'inputBotInlineMessageID' as const,
    dc_id: dcId,
    id: 42n,
    access_hash: 7n,
  })

  function inlineAccount(refusal: string, times = 1) {
    const asked: Array<{ name: string; dcId: number }> = []
    let refused = 0
    const instance = harness({
      api: (query, dcId) => {
        asked.push({ name: query._, dcId })
        if (query._ === 'auth.exportAuthorization') {
          return { _: 'auth.exportedAuthorization', id: 7n, bytes: Uint8Array.of(1, 2, 3, 4) }
        }
        if (query._ === 'auth.importAuthorization') {
          return { _: 'auth.authorization', user: { _: 'user', id: 7n, access_hash: 11n } }
        }
        if (query._ !== 'messages.editInlineBotMessage') return undefined
        if (dcId === 4 && refused < times) {
          refused += 1
          throw new TelegramError(refusal)
        }

        return { _: 'boolTrue' }
      },
    })

    return { instance, asked }
  }

  const named = (asked: Array<{ name: string; dcId: number }>, name: string) =>
    asked.filter((entry) => entry.name === name)

  it('introduces the account where the message lives, then makes the edit there', async () => {
    const { instance, asked } = inlineAccount('AUTH_KEY_UNREGISTERED (401)')
    await instance.account.connect()

    await instance.account.editInlineMessage(inlineOn(4), 'edited')

    expect(named(asked, 'messages.editInlineBotMessage')).toEqual([
      { name: 'messages.editInlineBotMessage', dcId: 4 },
      { name: 'messages.editInlineBotMessage', dcId: 4 },
    ])
    // The datacenter holding the account issues the credential; the one the
    // message lives on accepts it.
    expect(named(asked, 'auth.exportAuthorization')).toEqual([
      { name: 'auth.exportAuthorization', dcId: 2 },
    ])
    expect(named(asked, 'auth.importAuthorization')).toEqual([
      { name: 'auth.importAuthorization', dcId: 4 },
    ])
    await instance.dispose()
  })

  it('introduces once, and raises a second refusal rather than looping', async () => {
    const { instance, asked } = inlineAccount('AUTH_KEY_UNREGISTERED (401)', 2)
    await instance.account.connect()

    await expect(instance.account.editInlineMessage(inlineOn(4), 'edited')).rejects.toThrow(
      /AUTH_KEY_UNREGISTERED/,
    )
    expect(named(asked, 'auth.importAuthorization')).toHaveLength(1)
    expect(named(asked, 'messages.editInlineBotMessage')).toHaveLength(2)
    await instance.dispose()
  })

  it('raises any other refusal without introducing anything', async () => {
    const { instance, asked } = inlineAccount('MESSAGE_NOT_MODIFIED (400)')
    await instance.account.connect()

    await expect(instance.account.editInlineMessage(inlineOn(4), 'same')).rejects.toThrow(
      /MESSAGE_NOT_MODIFIED/,
    )
    expect(named(asked, 'auth.exportAuthorization')).toHaveLength(0)
    await instance.dispose()
  })

  it('makes the edit on the home datacenter the ordinary way', async () => {
    const { instance, asked } = inlineAccount('AUTH_KEY_UNREGISTERED (401)')
    await instance.account.connect()

    await instance.account.editInlineMessage(inlineOn(2), 'edited')

    expect(named(asked, 'messages.editInlineBotMessage')).toEqual([
      { name: 'messages.editInlineBotMessage', dcId: 2 },
    ])
    expect(named(asked, 'auth.exportAuthorization')).toHaveLength(0)
    await instance.dispose()
  })
})

describe('a mini app the account keeps open', () => {
  const BOT = {
    _: 'user',
    id: 90n,
    access_hash: 91n,
    bot: true,
    bot_info_version: 1,
    username: 'shop_bot',
  }

  /** An account answering the bot's name and the request, holding back the prolonging timer. */
  function keeping() {
    const prolonging: { run: () => void; cancelled: boolean }[] = []
    const asked: TlValue[] = []
    const instance = harness({
      schedule: (run, delay) => {
        if (delay !== 60_000) {
          const timer = setTimeout(run, delay)

          return () => clearTimeout(timer)
        }
        const entry = { run, cancelled: false }
        prolonging.push(entry)

        return () => {
          entry.cancelled = true
        }
      },
      api: (query) => {
        asked.push(query)
        if (query._ === 'contacts.resolveUsername') {
          return {
            _: 'contacts.resolvedPeer',
            peer: { _: 'peerUser', user_id: 90n },
            chats: [],
            users: [BOT],
          }
        }
        if (query._ === 'messages.requestWebView') {
          return { _: 'webViewResultUrl', query_id: 5n, url: 'https://app.example/' }
        }

        return undefined
      },
    })

    return { instance, prolonging, asked }
  }

  it('lets go of what it keeps open when it stops', async () => {
    // A mini app opened in a conversation is prolonged every minute. The
    // account that opened it is what stops that, so nothing keeps calling
    // Telegram on behalf of an account that has gone.
    const { instance, prolonging } = keeping()
    await instance.account.connect()

    const view = await instance.account.openWebview({
      bot: '@shop_bot',
      source: { kind: 'chat', url: 'https://app.example/' },
      platform: 'android',
    })
    expect(view.open).toBe(true)
    expect(prolonging).toHaveLength(1)

    await instance.account.stop()

    expect(view.open).toBe(false)
    expect(prolonging.every((timer) => timer.cancelled)).toBe(true)
    await instance.dispose()
  })

  it('stops keeping one that is closed, and no longer holds it at stop', async () => {
    const { instance, prolonging, asked } = keeping()
    await instance.account.connect()

    const view = await instance.account.openWebview({
      bot: '@shop_bot',
      source: { kind: 'chat' },
      platform: 'android',
    })
    instance.account.closeWebview(view)
    await instance.account.stop()

    expect(prolonging[0]?.cancelled).toBe(true)
    expect(asked.filter((query) => query._ === 'messages.prolongWebView')).toEqual([])
    await instance.dispose()
  })
})
