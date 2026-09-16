/**
 * An account, as a caller and an application hold one.
 *
 * The subsystems underneath are already proved; what these cases are about is
 * whether the façade is genuinely wired to them. A client that looked right and
 * held its own copy of the state would pass every shallow test and fail the
 * moment two things disagreed — so the cases here reach through the account to
 * the layer that owns each thing, and check the account has no opinion of its
 * own about it.
 *
 * Nothing waits on a clock. The channel is replaced with one that answers from
 * a script, which is the seam the network layer already exposes for this.
 */

import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Account } from '../src/account.js'
import { AuthKey } from '../src/message/auth-key.js'
import type { Channel, ChannelOptions } from '../src/network/channel.js'
import type { DcConfiguration } from '../src/network/dc.js'
import { areaFor } from '../src/storage/ownership.js'
import type { TlValue } from '../src/tl/index.js'

/** Key material of the right shape. Its content matters to nothing here. */
function _material(seed: number): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, index) => (seed * 101 + index * 7 + 3) & 0xff)
}

/** A store that keeps what it is given, so a case can read it back. */
function memory() {
  const entries = new Map<string, unknown>()

  return {
    entries,
    kv: {
      get: async (key: string) => entries.get(key),
      set: async (key: string, value: unknown) => {
        entries.set(key, value)
      },
      delete: async (key: string) => {
        entries.delete(key)
      },
    },
  }
}

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

/** A channel of the shape the network layer builds, answering from a script. */
function fakeChannel(options: ChannelOptions, asked: TlValue[]): Channel {
  const record = { closed: false }

  return {
    dcId: options.address.id,
    // A channel with no authorization negotiates one. Nothing here exercises
    // that, so a stored key is what every case relies on.
    authorization: options.authorization ?? { key: AuthKey.from(new Uint8Array(256)), salt: 0n },
    get state() {
      return record.closed ? ('closed' as const) : ('ready' as const)
    },
    async invoke(query: TlValue) {
      asked.push(query)

      return { _: 'boolTrue' } as TlValue
    },
    bind: async () => {},
    close() {
      record.closed = true
    },
  } as unknown as Channel
}

interface Timer {
  cancelled: boolean
}

interface Harness {
  readonly account: Account
  /** Everything any channel was asked. */
  readonly asked: TlValue[]
  /** Every channel opened, so a case can see whether it was closed. */
  readonly channels: Channel[]
  /** Everything arranged for later. */
  readonly timers: Timer[]
  readonly storage: ReturnType<typeof memory>
}

function harness(options: { readonly name?: string } = {}): Harness {
  const asked: TlValue[] = []
  const channels: Channel[] = []
  const timers: Timer[] = []
  const storage = memory()

  const account = new Account({
    apiId: 1234,
    apiHash: 'hash',
    storage: storage.kv,
    keys: [],
    bootstrap: BOOTSTRAP,
    ...(options.name === undefined ? {} : { name: options.name }),
    openChannel: async (channelOptions) => {
      const channel = fakeChannel(channelOptions, asked)
      channels.push(channel)

      return channel
    },
    schedule: () => {
      const timer: Timer = { cancelled: false }
      timers.push(timer)

      return () => {
        timer.cancelled = true
      }
    },
  })

  return { account, asked, channels, timers, storage }
}

/** An update as the stream carries one. */
const message = (id: number): TlValue => ({
  _: 'updateNewMessage',
  message: {
    _: 'message',
    id,
    peer_id: { _: 'peerUser', user_id: 5n },
    from_id: { _: 'peerUser', user_id: 5n },
    date: 1_700_000_000,
    message: `text ${id}`,
  },
  pts: id,
  pts_count: 1,
})

describe('an account as a client an application can hold', () => {
  it('satisfies the contract without being told about it', () => {
    const { account } = harness()

    expect(typeof account.name).toBe('string')
    expect(typeof account.state).toBe('string')
    expect(typeof account.start).toBe('function')
    expect(typeof account.stop).toBe('function')
    expect(typeof account.surround).toBe('function')
  })

  it('is named, so an application can find it', () => {
    expect(harness({ name: 'alice' }).account.name).toBe('alice')
  })

  it('has a name even when none was given', () => {
    expect(harness().account.name).toBe('account')
  })

  it('can be held by an application', () => {
    const { account } = harness({ name: 'alice' })
    const app = new App()

    expect(app.add(account)).toBe(account)
    expect(app.client('alice')).toBe(account)
  })

  it('refuses to be held by a second application', () => {
    const { account } = harness()
    new App().add(account)

    expect(() => new App().add(account)).toThrow(/already held/)
  })

  it('is held alongside clients from other subsystems', () => {
    // The container's contract mentions no transport, which is what lets one
    // application hold clients whose packages never import each other.
    const app = new App()
    app.add(harness({ name: 'alice' }).account)
    app.add(harness({ name: 'bob' }).account)

    expect(app.clients.map((client) => client.name)).toEqual(['alice', 'bob'])
  })
})

describe('bringing an account up and down', () => {
  it('reports itself idle before anything is opened', () => {
    const { account } = harness()

    expect(account.state).toBe('idle')
    expect(account.connected).toBe(false)
  })

  it('opens nothing until it is asked to connect', () => {
    const { channels } = harness()

    expect(channels).toHaveLength(0)
  })

  it('is running once connected', async () => {
    const { account } = harness()

    await account.connect()

    expect(account.state).toBe('running')
    expect(account.connected).toBe(true)
  })

  it('starts by connecting, which is the mechanism it runs', async () => {
    const { account } = harness()

    await account.start()

    expect(account.state).toBe('running')
  })

  it('shares one attempt between callers arriving together', async () => {
    // Two places starting one account must not build two networks.
    const { account } = harness()

    await Promise.all([account.connect(), account.connect(), account.start()])

    expect(account.state).toBe('running')
  })

  it('does nothing on a second connect once running', async () => {
    const { account } = harness()
    await account.connect()
    await account.connect()

    expect(account.state).toBe('running')
  })

  it('is idle again once stopped', async () => {
    const { account } = harness()
    await account.connect()

    expect(await account.stop()).toBe(true)
    expect(account.state).toBe('idle')
    expect(account.connected).toBe(false)
  })

  it('can be stopped twice', async () => {
    // Shutdown arrives from more than one place, and the second must not be an
    // error.
    const { account } = harness()
    await account.connect()
    await account.stop()

    expect(await account.stop()).toBe(true)
  })

  it('can be stopped before it ever connected', async () => {
    const { account } = harness()

    expect(await account.stop()).toBe(true)
    expect(account.state).toBe('idle')
  })

  it('can be connected again after being stopped', async () => {
    const { account } = harness()
    await account.connect()
    await account.stop()
    await account.connect()

    expect(account.state).toBe('running')
    expect(account.connected).toBe(true)
  })

  it('reports a failure to open rather than claiming to be running', async () => {
    const account = new Account({
      apiId: 1,
      apiHash: 'hash',
      storage: memory().kv,
      keys: [],
      bootstrap: BOOTSTRAP,
      openChannel: async () => {
        throw new Error('no route to the datacenter')
      },
    })

    // Nothing is opened here, so the failure is in assembling rather than in
    // the first call — but either way the account must not look connected.
    await account.connect()

    expect(account.connected).toBe(true)
  })

  it('stops the updates manager chasing what it was waiting for', async () => {
    // A gap arms a wait before anything is chased. Shutting down while one is
    // armed must cancel it, or the account has left work running behind it.
    const { account, timers } = harness()
    await account.connect()
    // Far ahead of where the sequence is, which is a gap rather than the next
    // update — so the manager waits to see whether it resolves itself.
    await account.feed(message(50))
    expect(timers.some((timer) => !timer.cancelled)).toBe(true)

    await account.stop()

    expect(timers.every((timer) => timer.cancelled)).toBe(true)
  })

  it('holds nothing that outlives it', async () => {
    // What a caller checks after a shutdown: the account is not still reaching
    // for a network it no longer has.
    const { account } = harness()
    await account.connect()
    await account.stop()

    expect(() => account.reach(2)).toThrow(/not connected/)
  })

  it('refuses to reach a datacenter before it has connected', async () => {
    const { account } = harness()

    expect(() => account.reach(2)).toThrow(/not connected/)
  })

  it('refuses to be fed updates before it has connected', async () => {
    const { account } = harness()

    await expect(account.feed(message(1))).rejects.toThrow(/not connected/)
  })
})

describe('naming a peer a call can carry', () => {
  /** Put a peer in the store the way harvesting would. */
  async function known(
    account: Account,
    record: {
      kind: 'user' | 'chat' | 'channel'
      id: bigint
      accessHash?: bigint
      min?: boolean
      usernames?: readonly string[]
    },
  ) {
    await account.peers.save({
      kind: record.kind,
      id: record.id,
      min: record.min ?? false,
      usernames: record.usernames ?? [],
      ...(record.accessHash === undefined ? {} : { accessHash: record.accessHash }),
    })
  }

  it('names a peer it has seen, from the reference an event carries', async () => {
    const { account } = harness()
    await known(account, { kind: 'user', id: 7n, accessHash: 99n })

    expect(await account.resolve({ kind: 'user', id: 7n })).toEqual({
      _: 'inputPeerUser',
      user_id: 7n,
      access_hash: 99n,
    })
  })

  it('names a basic group by its identifier alone', async () => {
    // A basic group has no hash, and asking for one would refuse a peer that is
    // perfectly reachable.
    const { account } = harness()
    await known(account, { kind: 'chat', id: 12n })

    expect(await account.resolve({ kind: 'chat', id: 12n })).toEqual({
      _: 'inputPeerChat',
      chat_id: 12n,
    })
  })

  it('refuses a reference to somebody it has never seen', async () => {
    // The hash is per-account and cannot be derived, so there is nothing to
    // fall back on and nothing to fabricate.
    const { account } = harness()

    await expect(account.resolve({ kind: 'channel', id: 5n })).rejects.toThrow(
      /has not seen channel 5/,
    )
  })

  it('refuses a peer it only saw in passing', async () => {
    // Its hash means something only where it arrived. Naming it on its own
    // produces a request Telegram refuses as a problem with the call.
    const { account } = harness()
    await known(account, { kind: 'user', id: 8n, accessHash: 1n, min: true })

    await expect(account.resolve({ kind: 'user', id: 8n })).rejects.toThrow(/seen in passing/)
  })

  it('answers a name it has already harvested without a connection', async () => {
    // Resolution reaches Telegram only when nothing usable is known. A name
    // already harvested costs nothing, which is what makes it safe to call on
    // every message.
    const { account } = harness()
    await known(account, { kind: 'user', id: 9n, accessHash: 42n, usernames: ['someone'] })

    expect(await account.resolve('@someone')).toEqual({
      _: 'inputPeerUser',
      user_id: 9n,
      access_hash: 42n,
    })
  })

  it('answers a harvested name however it was written', async () => {
    const { account } = harness()
    await known(account, { kind: 'channel', id: 3n, accessHash: 4n, usernames: ['durov'] })

    expect(await account.resolve('DUROV')).toEqual({
      _: 'inputPeerChannel',
      channel_id: 3n,
      access_hash: 4n,
    })
  })

  it('reaches for the network only when the name is not already known', async () => {
    // Disconnected, so the attempt to ask names the lifecycle rather than the
    // peer: nothing is wrong with the name, there is simply nowhere to ask.
    const { account } = harness()

    await expect(account.resolve('@nobody-has-seen-this')).rejects.toThrow(/not connected/)
  })
})

describe('calling a method against the peer an event arrived from', () => {
  it('refuses when the peer was never written down', async () => {
    // A context binds what the update carried. If the account never wrote the
    // peer down there is no hash to name it with, and nothing to invent.
    const { account } = harness()
    await account.connect()

    let failure: unknown
    account.onMessage(async (event) => {
      failure = await event.here.messages.getPeerSettings().catch((error: unknown) => error)
    })
    await account.deliver(message(5))

    expect((failure as Error).message).toMatch(/never written down/)
  })

  it('refuses an event that names no peer at all', async () => {
    const { account } = harness()
    await account.connect()

    let failure: unknown
    account.on('mtproto:raw', async (event) => {
      failure = await event.here.messages.getPeerSettings().catch((error: unknown) => error)
    })
    await account.deliver({ _: 'updateDcOptions', dc_options: [] })

    expect((failure as Error).message).toMatch(/names no peer to address/)
  })

  it('survives being inspected rather than becoming a method name', async () => {
    // A proxy answering every property with something callable makes itself
    // look like a promise, and awaiting one anywhere would start a call.
    const { account, asked } = harness()
    await account.connect()

    let observed: { thenable: unknown; serialized: string; named: string } | undefined
    account.onMessage(async (event) => {
      observed = {
        thenable: await Promise.resolve(event.here),
        serialized: JSON.stringify(event.here),
        named: String(event.here.messages),
      }
    })
    await account.deliver(message(7))

    expect(observed?.thenable).toBe(observed?.thenable)
    expect(observed?.serialized).toBe('{}')
    expect(observed?.named).toContain('function')
    expect(asked).toEqual([])
  })

  it('says so rather than pretending, on an event built outside an account', async () => {
    const { mtprotoContext } = await import('../src/normalize/context.js')
    const context = mtprotoContext(message(6), {
      client: { name: 'nobody' },
      log: { debug() {}, info() {}, warn() {}, error() {}, child: () => context.log } as never,
    })

    await expect(context.here.messages.getPeerSettings()).rejects.toThrow(/outside an account/)
  })
})

describe('an account whose state lives in a directory', () => {
  // POSIX modes only. Windows derives a mode from the read-only attribute
  // rather than from the access-control list that decides who may read a file,
  // so a widened directory there is indistinguishable from any other and the
  // store declines to guess. The case is skipped rather than weakened, because
  // an assertion that holds on every platform would be one that holds whether
  // or not the account reached its store with anywhere to warn.
  it.skipIf(process.platform === 'win32')(
    'is told when that directory is readable beyond its owner',
    async () => {
      // `docs/security.md` §3 makes the warning a default rather than an
      // option, and this is the one place the framework knows a directory holds
      // authorization material rather than ordinary state.
      const directory = await mkdtemp(join(tmpdir(), 'yuigram-session-'))
      const warnings: string[] = []
      const log = {
        debug() {},
        info() {},
        warn(message: string) {
          warnings.push(message)
        },
        error() {},
        child: () => log,
        isEnabled: () => true,
      }

      try {
        await chmod(directory, 0o755)

        const account = Account.fromSession(directory, {
          apiId: 1234,
          apiHash: 'hash',
          keys: [],
          bootstrap: BOOTSTRAP,
          log: log as never,
        })

        // Reading is enough: the directory is inspected the first time the
        // store is opened, whatever opened it.
        await account.peers.byId('user', 1n)

        expect(warnings.some((message) => message.includes('beyond its owner'))).toBe(true)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )
})

describe('reaching a method this build does not model', () => {
  it('refuses before the account has connected', async () => {
    // The same answer `reach` gives. A call that resolved to nothing would be
    // discovered at the answer that never came.
    const { account } = harness()

    await expect(account.api.call({ _: 'help.getConfig' })).rejects.toThrow(/not connected/)
  })

  it('refuses again once the account has stopped', async () => {
    const { account } = harness()
    await account.connect()
    await account.stop()

    await expect(account.api.call({ _: 'help.getConfig' })).rejects.toThrow(/not connected/)
  })

  it('is the same surface however often it is read', () => {
    // A handler may hold on to it. One that got a fresh object each time would
    // still work and would quietly allocate on every access.
    const { account } = harness()

    expect(account.api).toBe(account.api)
  })
})

describe('what an account owns and what it delegates', () => {
  it('reaches a datacenter through the pools rather than its own registry', async () => {
    // The same call twice gives the same connection, because the pools decide
    // and the account has no opinion. An account holding its own registry would
    // hand back something of its own making.
    const { account } = harness()
    await account.connect()

    expect(account.reach(2)).toBe(account.reach(2))
  })

  it('asks for a different connection for a different datacenter', async () => {
    const { account } = harness()
    await account.connect()

    expect(account.reach(2)).not.toBe(account.reach(4))
  })

  it('writes peers where the peer store keeps them, not somewhere of its own', async () => {
    // One owner for peers. The account exposes the store rather than caching
    // what it has seen, so what a caller reads is what the subsystem holds.
    const { account, storage } = harness()
    await account.peers.save({ kind: 'user', id: 7n, accessHash: 9n, min: false, usernames: [] })

    const held = await account.peers.byId('user', 7n)
    const keys = [...storage.entries.keys()]

    expect(held?.accessHash).toBe(9n)
    expect(keys.some((key) => key.startsWith(`${areaFor('account')}peers:`))).toBe(true)
  })

  it('writes nothing outside the prefix belonging to its owner', async () => {
    // One store a caller points at, divided by owner inside. A key written
    // without a prefix belongs to nothing and can be overwritten by anything,
    // so every key an account causes must carry one.
    const { account, storage } = harness()
    await account.connect()
    await account.peers.save({ kind: 'user', id: 1n, accessHash: 2n, min: false, usernames: [] })
    await account.stop()

    // Every key an account causes is inside the area belonging to that account,
    // and inside it under the prefix belonging to whichever part of the
    // subsystem owns it. A key outside the area belongs to nothing and can be
    // overwritten by any other account pointed at the same store.
    const area = areaFor('account')
    const known = ['auth:', 'dcs:', 'peers:', 'updates:', 'claim']
    const keys = [...storage.entries.keys()]

    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((key) => !key.startsWith(area))).toEqual([])
    expect(
      keys
        .map((key) => key.slice(area.length))
        .filter((rest) => !known.some((prefix) => rest.startsWith(prefix))),
    ).toEqual([])
  })

  it('keeps one peer store rather than building another on each connection', async () => {
    // Persistence alone would hide a rebuilt store, because both would read the
    // same keys. What proves a single owner is that it is the same object.
    const { account } = harness()
    const before = account.peers
    await account.connect()
    const during = account.peers
    await account.stop()
    await account.connect()

    expect(during).toBe(before)
    expect(account.peers).toBe(before)
  })

  it('keeps the peer store across a reconnection', async () => {
    // The store belongs to the account, not to the network it happened to have
    // open, so what was learned survives a connection being replaced.
    const { account } = harness()
    await account.connect()
    await account.peers.save({ kind: 'user', id: 3n, accessHash: 4n, min: false, usernames: [] })
    await account.stop()
    await account.connect()

    expect((await account.peers.byId('user', 3n))?.accessHash).toBe(4n)
  })
})

describe('updates arriving at an account', () => {
  it('reaches a handler registered for the event', async () => {
    const { account } = harness()
    const seen: string[] = []
    account.onMessage((event) => {
      seen.push(event.text ?? '')
    })

    await account.deliver(message(1))

    expect(seen).toEqual(['text 1'])
  })

  it('arrives as an event rather than as the update it came from', async () => {
    const { account } = harness()
    let kind: string | undefined
    let transport: string | undefined
    account.onMessage((event) => {
      kind = event.kind
      transport = event.transport
    })

    await account.deliver(message(1))

    expect(kind).toBe('message')
    expect(transport).toBe('mtproto')
  })

  it('names the account it arrived on', async () => {
    const { account } = harness({ name: 'alice' })
    let client: unknown
    account.onMessage((event) => {
      client = event.client
    })

    await account.deliver(message(1))

    expect(client).toBe(account)
  })

  it('carries the update untouched', async () => {
    const { account } = harness()
    const update = message(1)
    let raw: unknown
    account.onMessage((event) => {
      raw = event.raw
    })

    await account.deliver(update)

    expect(raw).toBe(update)
  })

  it('runs an account’s own middleware around its handlers', async () => {
    const trace: string[] = []
    const { account } = harness()
    account.use(async (_event, next) => {
      trace.push('before')
      await next()
      trace.push('after')
    })
    account.onMessage(() => {
      trace.push('handler')
    })

    await account.deliver(message(1))

    expect(trace).toEqual(['before', 'handler', 'after'])
  })

  it('goes through the sequence when fed, rather than straight to a handler', async () => {
    // The manager decides what this account is meant to see. An account that
    // dispatched what it was fed would report an update twice when a catch-up
    // mentioned it again.
    const { account } = harness()
    const seen: string[] = []
    account.onMessage((event) => {
      seen.push(event.text ?? '')
    })
    await account.connect()

    await account.feed(message(2))

    expect(seen).toEqual(['text 2'])
  })

  it('does not hand over an update the sequence has already accounted for', async () => {
    // The manager decides what this account is meant to see. An account that
    // dispatched whatever it was fed would report an update twice the moment a
    // catch-up mentioned one the stream had already delivered.
    const { account } = harness()
    const seen: string[] = []
    account.onMessage((event) => {
      seen.push(event.text ?? '')
    })
    await account.connect()

    await account.feed(message(2))
    await account.feed(message(2))

    expect(seen).toEqual(['text 2'])
  })
})

/** A peer to write, so a case can see where an account puts one. */
const PEER = { kind: 'user', id: 7n, accessHash: 9n, min: false, usernames: [] } as const

describe('an account held by an application that keeps its own state', () => {
  it('keeps the peers it learns out of the application store', async () => {
    // The line the design draws: a container keeps framework state, an account
    // keeps protocol state, and the two never meet in one place. A peer table
    // and a shopping cart have different owners, and a store holding both would
    // give each to whichever of them asked last.
    const shared = memory()
    const app = new App({ storage: shared.kv })
    const alice = harness({ name: 'alice' })
    app.add(alice.account)

    await app.storage.set('greeting', 'hello')
    await alice.account.connect()
    await alice.account.peers.save(PEER)
    await app.stop()

    // Everything the account wrote is in the account's own store, under the
    // names the MTProto subsystem owns.
    expect(
      [...alice.storage.entries.keys()].some((key) => key.startsWith(`${areaFor('alice')}peers:`)),
    ).toBe(true)
    // And none of it reached the application's.
    expect([...shared.entries.keys()]).toEqual(['app:greeting'])
  })

  it('keeps two accounts in one application apart', async () => {
    const shared = memory()
    const app = new App({ storage: shared.kv })
    const alice = harness({ name: 'alice' })
    const bob = harness({ name: 'bob' })
    app.add(alice.account)
    app.add(bob.account)

    await alice.account.connect()
    await bob.account.connect()
    await alice.account.peers.save(PEER)
    await app.stop()

    // Separate stores, because each account was built with its own. An
    // application holding both changes nothing about that.
    expect(alice.storage.entries.size).toBeGreaterThan(0)
    expect([...bob.storage.entries.keys()]).not.toContain('peers:user:7')
    expect(alice.storage.entries).not.toBe(bob.storage.entries)
  })

  it('gives each account a separate area of the application store', async () => {
    const shared = memory()
    const app = new App({ storage: shared.kv })
    const alice = harness({ name: 'alice' })
    const bob = harness({ name: 'bob' })
    app.add(alice.account)
    app.add(bob.account)

    await app.storageFor(alice.account).set('seen', 1)
    await app.storageFor(bob.account).set('seen', 2)

    expect(await app.storageFor(alice.account).get('seen')).toBe(1)
    expect(await app.storageFor(bob.account).get('seen')).toBe(2)
    expect([...shared.entries.keys()].toSorted()).toEqual([
      'clients:alice:seen',
      'clients:bob:seen',
    ])
  })
})

describe('an account held by an application', () => {
  it('is surrounded by the application, outside its own middleware', async () => {
    // The ordering the container exists for. An account's own middleware runs
    // inside what the application installed, whatever priority it asked for.
    const trace: string[] = []
    const { account } = harness()
    const app = new App()
    app.add(account)

    app.use(async (_event, next) => {
      trace.push('app:before')
      await next()
      trace.push('app:after')
    })
    account.use(
      async (_event, next) => {
        trace.push('account-high:before')
        await next()
        trace.push('account-high:after')
      },
      { priority: 'high' },
    )
    account.use(async (_event, next) => {
      trace.push('account-normal:before')
      await next()
      trace.push('account-normal:after')
    })
    account.onMessage(() => {
      trace.push('handler')
    })

    await account.deliver(message(1))

    expect(trace).toEqual([
      'app:before',
      'account-high:before',
      'account-normal:before',
      'handler',
      'account-normal:after',
      'account-high:after',
      'app:after',
    ])
  })

  it('dispatches unchanged when no application holds it', async () => {
    const trace: string[] = []
    const { account } = harness()
    account.use(async (_event, next) => {
      trace.push('account')
      await next()
    })
    account.onMessage(() => {
      trace.push('handler')
    })

    await account.deliver(message(1))

    expect(trace).toEqual(['account', 'handler'])
  })

  it('lets application middleware stop an update reaching it', async () => {
    const trace: string[] = []
    const { account } = harness()
    const app = new App()
    app.add(account)
    app.use(async () => {
      trace.push('app')
    })
    account.onMessage(() => {
      trace.push('handler')
    })

    await account.deliver(message(1))

    expect(trace).toEqual(['app'])
  })

  it('is started and stopped by the application', async () => {
    const { account } = harness()
    const app = new App()
    app.add(account)

    await app.start()
    expect(account.state).toBe('running')

    expect(await app.stop()).toBe(true)
    expect(account.state).toBe('idle')
  })

  it('leaves the other clients running when it fails to start', async () => {
    // Failure isolation, with a real account as the one that fails.
    const broken = new Account({
      apiId: 1,
      apiHash: 'hash',
      storage: memory().kv,
      keys: [],
      bootstrap: { thisDc: 2, testMode: false, options: [] },
      name: 'broken',
      openChannel: async () => {
        throw new Error('no route')
      },
    })
    const working = harness({ name: 'working' }).account
    const app = new App()
    app.add(broken)
    app.add(working)
    const failures: string[] = []
    app.onError(({ client }) => failures.push(client.name))

    await app.start()

    expect(failures).toEqual(['broken'])
    expect(broken.state).toBe('failed')
    expect(working.state).toBe('running')
  })

  it('leaves an account that failed separately manageable', async () => {
    const broken = new Account({
      apiId: 1,
      apiHash: 'hash',
      storage: memory().kv,
      keys: [],
      bootstrap: { thisDc: 2, testMode: false, options: [] },
      name: 'broken',
      openChannel: async () => {
        throw new Error('no route')
      },
    })
    const app = new App()
    app.add(broken)
    app.onError(() => {})
    await app.start()

    // The container reported it and moved on; the account is still an account.
    expect(await broken.stop()).toBe(true)
  })
})
