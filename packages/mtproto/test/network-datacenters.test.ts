/**
 * Turning a datacenter identifier into a usable connection.
 *
 * What matters here is what happens either side of a channel being opened: the
 * address chosen for it, whether an authorization was found or had to be
 * obtained, and whether one that was obtained is still there on the next start.
 * A client that quietly re-authorizes on every start works perfectly and looks
 * like an intruder, so the cases below check the storage rather than only the
 * connection.
 *
 * Channels are stubbed. What a channel does once it is open has its own cases;
 * these are about which one is opened and with what.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { AuthKey } from '../src/message/auth-key.js'
import type { Channel, ChannelOptions } from '../src/network/channel.js'
import { openDatacenters } from '../src/network/datacenters.js'
import type { DcAddress, DcConfiguration } from '../src/network/dc.js'
import { authorizationStore } from '../src/storage/authorization.js'
import { datacenterStore } from '../src/storage/datacenters.js'
import type { TlValue } from '../src/tl/index.js'
import { TlScope } from '../src/tl/index.js'

const SCOPE = new TlScope('datacenters', [CORE, MTPROTO, API])

const CLIENT = {
  apiId: 1,
  deviceModel: 'Yuigram',
  systemVersion: '1.0',
  appVersion: '0.1.0',
  systemLangCode: 'en',
  langPack: '',
  langCode: 'en',
}

function address(fields: Partial<DcAddress> = {}): DcAddress {
  return {
    id: 2,
    host: '10.0.0.2',
    port: 443,
    ipv6: false,
    mediaOnly: false,
    tcpoOnly: false,
    cdn: false,
    static: false,
    thisPortOnly: false,
    secret: undefined,
    ...fields,
  }
}

const BOOTSTRAP: DcConfiguration = {
  thisDc: 2,
  testMode: false,
  options: [
    address({ id: 1, host: '10.0.0.1' }),
    address({ id: 2, host: '10.0.0.2' }),
    address({ id: 2, host: '2001:db8::2', ipv6: true }),
    address({ id: 2, host: '10.0.0.9', mediaOnly: true }),
  ],
}

/** Key material a case can recognise. */
function material(seed: number): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, index) => (seed * 101 + index * 7 + 3) & 0xff)
}

/** A store that keeps what it is given. */
function memory() {
  const values = new Map<string, unknown>()

  return {
    values,
    kv: {
      get: async (key: string) => values.get(key),
      set: async (key: string, value: unknown) => {
        values.set(key, value)
      },
      delete: async (key: string) => {
        values.delete(key)
      },
    },
  }
}

/** A store whose next read of an authorization key can be held open. */
function memoryHoldingReads() {
  const base = memory()
  const held: Array<Promise<void>> = []

  return {
    values: base.values,
    /** Hold the next reads of any stored key, one promise each, in order. */
    hold(...untils: Array<Promise<void>>) {
      held.push(...untils)
    },
    kv: {
      get: async (key: string) => {
        // Read first, delivered later: the value is what was there when the
        // read was made, which is exactly what a slow store hands back.
        const snapshot = await base.kv.get(key)
        if (key.endsWith(':key') || key.includes(':temp')) {
          const waiting = held.shift()
          if (waiting !== undefined) await waiting
        }

        return snapshot
      },
      set: base.kv.set,
      delete: base.kv.delete,
    },
  }
}

/** Let everything already queued run. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Where the simulated clock stands, in whole seconds. */
const NOW_SECONDS = 1_700_000_000

/**
 * What an exchange settles on.
 *
 * An exchange asked for a lifetime produces a key that has one, which is what
 * makes it the key connections use; one that was not produces the long-lived
 * key that only ever vouches for those.
 */
function negotiatedBy(options: ChannelOptions, seed: number) {
  return {
    key: AuthKey.from(material(seed)),
    salt: 0x5a17n,
    ...(options.expiresIn === undefined ? {} : { expiresAt: NOW_SECONDS + options.expiresIn }),
  }
}

/** A channel that answers everything and reports whether it was closed. */
function stubbed(options: ChannelOptions, negotiated: number): Channel {
  const authorization = options.authorization ?? negotiatedBy(options, negotiated)
  let closed = false

  return {
    dcId: options.address.id,
    authorization,
    get state() {
      return closed ? ('closed' as const) : ('ready' as const)
    },
    invoke: async () => ({ _: 'boolTrue' }) as TlValue,
    bind: async () => {},
    close() {
      closed = true
    },
  }
}

/** The layer, with channels stubbed and every call to open one recorded. */
async function datacenters(
  overrides: Record<string, unknown> = {},
  shared?: { auth: ReturnType<typeof memory>; dcs: ReturnType<typeof memory> },
) {
  const auth = shared?.auth ?? memory()
  const dcs = shared?.dcs ?? memory()
  const opened: ChannelOptions[] = []
  const channels: Array<{ closed: boolean }> = []
  const bound: Array<{ temporary: Uint8Array; permanent: Uint8Array }> = []
  let negotiated = 0

  const stubChannel = async (options: ChannelOptions): Promise<Channel> => {
    opened.push(options)
    const record = { closed: false }
    channels.push(record)

    // A channel with no authorization negotiates one; the key it settles on is
    // what the layer above has to write down.
    const authorization = options.authorization ?? negotiatedBy(options, ++negotiated)

    return {
      dcId: options.address.id,
      authorization,
      get state() {
        return record.closed ? ('closed' as const) : ('ready' as const)
      },
      invoke: async () => ({ _: 'boolTrue' }) as TlValue,
      bind: async (permanent) => {
        bound.push({ temporary: authorization.key.id, permanent: permanent.id })
      },
      close() {
        record.closed = true
      },
    }
  }

  const layer = await openDatacenters({
    scope: SCOPE,
    client: CLIENT,
    keys: [],
    authorization: authorizationStore(auth.kv),
    datacenters: datacenterStore(dcs.kv),
    bootstrap: BOOTSTRAP,
    openChannel: stubChannel,
    now: () => NOW_SECONDS * 1000,
    ...overrides,
  })

  /**
   * The channels opened for a caller.
   *
   * A key exchange opens one of its own, carrying no caller's settings, so the
   * cases below look past it.
   */
  const forCallers = () => opened.filter((entry) => entry.authorization !== undefined)

  /** The exchanges that asked for a key with a lifetime. */
  const forLifetimes = () => opened.filter((entry) => entry.expiresIn !== undefined)

  return {
    layer,
    opened,
    forCallers,
    forLifetimes,
    bound,
    channels,
    auth,
    dcs,
    stores: { auth, dcs },
  }
}

describe('what the layer starts from', () => {
  it('uses the supplied addresses when nothing was stored', async () => {
    const { layer } = await datacenters()

    expect(layer.directory.thisDc).toBe(2)
    expect(layer.directory.identifiers()).toEqual([1, 2])
  })

  it('prefers what was stored over what was supplied', async () => {
    const stores = { auth: memory(), dcs: memory() }
    await datacenterStore(stores.dcs.kv).save({
      thisDc: 4,
      testMode: true,
      options: [address({ id: 4, host: '10.0.0.4' })],
    })

    // The stored list came from a server; the supplied one exists only to reach
    // a server in the first place.
    const { layer } = await datacenters({}, stores)

    expect(layer.directory.thisDc).toBe(4)
    expect(layer.directory.testMode).toBe(true)
    expect(layer.directory.identifiers()).toEqual([4])
  })

  it('refuses a supplied configuration that names nothing', async () => {
    await expect(
      datacenters({ bootstrap: { thisDc: 2, testMode: false, options: [] } }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('choosing where to connect', () => {
  it('connects to the datacenter this client belongs to by default', async () => {
    const { layer, forCallers } = await datacenters()
    await layer.connect()

    expect(forCallers()[0]?.address.id).toBe(2)
    expect(forCallers()[0]?.address.host).toBe('10.0.0.2')
  })

  it('connects to the datacenter that was asked for', async () => {
    const { layer, forCallers } = await datacenters()
    await layer.connect({ id: 1 })

    expect(forCallers()[0]?.address.host).toBe('10.0.0.1')
  })

  it('honours the purpose and the address family', async () => {
    const { layer, forCallers } = await datacenters()
    await layer.connect({ purpose: 'media' })
    await layer.connect({ ipv6: true })

    // Media prefers the address set aside for it; the family is a preference
    // applied within the purpose.
    expect(forCallers()[0]?.address.host).toBe('10.0.0.9')
    expect(forCallers()[1]?.address.host).toBe('2001:db8::2')
  })

  it('refuses when no address serves what was asked for', async () => {
    const { layer } = await datacenters()

    await expect(layer.connect({ id: 9 })).rejects.toBeInstanceOf(NetworkError)
    await expect(layer.connect({ purpose: 'cdn' })).rejects.toThrow(/serving cdn/)
  })

  it('passes the settings every connection shares', async () => {
    const { layer, forCallers } = await datacenters({ obfuscated: true, connectTimeout: 250 })
    await layer.connect()

    expect(forCallers()[0]).toMatchObject({ obfuscated: true, connectTimeout: 250, client: CLIENT })
  })
})

describe('the first authorization', () => {
  it('is negotiated on a connection opened for that alone', async () => {
    const { layer, opened, channels } = await datacenters()
    await layer.connect()

    // The exchange opens its own connection, carrying the server keys and none
    // of the caller's settings, and closes it once the key is stored.
    expect(opened[0]?.authorization).toBeUndefined()
    expect(opened[0]?.keys).toEqual([])
    expect(opened[0]?.signal).toBeUndefined()
    expect(opened[0]?.onClosed).toBeUndefined()
    expect(channels[0]?.closed).toBe(true)
  })

  it('is written down, key and salt together', async () => {
    const { layer, auth } = await datacenters()
    const channel = await layer.connect()

    const store = authorizationStore(auth.kv)
    // What a connection uses is the key with a lifetime. The long-lived key is
    // kept apart, and encrypts nothing.
    expect((await store.temporaryKey(2, 0, NOW_SECONDS))?.key).toEqual(
      channel.authorization.key.toBytes(),
    )
    expect(await store.key(2)).toEqual(material(1))
    expect(await store.salt(2)).toBe(channel.authorization.salt)
  })

  it('vouches for the key connections use with the one that never encrypts', async () => {
    const { layer, bound, auth } = await datacenters()
    const channel = await layer.connect()

    const store = authorizationStore(auth.kv)
    const permanent = await store.key(2)
    if (permanent === undefined) throw new Error('no long-lived key was kept')

    expect(bound).toHaveLength(1)
    expect(bound[0]?.temporary).toEqual(channel.authorization.key.id)
    expect(bound[0]?.permanent).toEqual(AuthKey.from(permanent).id)
  })

  it('opens one connection for each half, and closes both', async () => {
    const { layer, opened, forLifetimes, channels } = await datacenters()
    await layer.connect()

    // One exchange for the long-lived key, one for the key with a lifetime,
    // and neither carries anything belonging to a caller.
    expect(opened.filter((entry) => entry.authorization === undefined)).toHaveLength(2)
    expect(forLifetimes()).toHaveLength(1)
    expect(channels[0]?.closed).toBe(true)
    expect(channels[1]?.closed).toBe(true)
  })

  it('is written down against the datacenter it belongs to', async () => {
    const { layer, auth } = await datacenters()
    await layer.connect({ id: 1 })

    const store = authorizationStore(auth.kv)
    expect(await store.key(1)).toBeDefined()
    expect(await store.key(2)).toBeUndefined()
  })

  it('is obtained once, however many connections ask for it at the same time', async () => {
    const stores = { auth: memory(), dcs: memory() }
    let exchanges = 0

    const slow = async (options: ChannelOptions): Promise<Channel> => {
      const authorization = options.authorization ?? negotiatedBy(options, ++exchanges)
      // An exchange takes a moment, as a real one does.
      if (options.authorization === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }

      return {
        dcId: options.address.id,
        authorization,
        state: 'ready',
        invoke: async () => ({ _: 'boolTrue' }) as TlValue,
        bind: async () => {},
        close() {},
      }
    }

    const { layer } = await datacenters({ openChannel: slow }, stores)
    const [first, second] = await Promise.all([layer.connect(), layer.connect()])

    // Two exchanges in all — one for each half of the authorization — however
    // many callers asked. A second run would produce a second key, and only one
    // can be kept, so the other connection would be holding an authorization
    // that is discarded the moment it ends.
    expect(exchanges).toBe(2)

    const kept = (await authorizationStore(stores.auth.kv).temporaryKey(2, 0, NOW_SECONDS))?.key
    expect(kept).toEqual(first.authorization.key.toBytes())
    expect(kept).toEqual(second.authorization.key.toBytes())
  })

  it('is not abandoned because another caller abandoned its own request', async () => {
    const stores = { auth: memory(), dcs: memory() }
    let exchanges = 0

    const watching = async (options: ChannelOptions): Promise<Channel> => {
      if (options.authorization === undefined) {
        exchanges += 1
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 20)
          options.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              reject(new CancelledError('abandoned'))
            },
            { once: true },
          )
        })
      }

      return {
        dcId: options.address.id,
        authorization: options.authorization ?? negotiatedBy(options, exchanges),
        state: 'ready',
        invoke: async () => ({ _: 'boolTrue' }) as TlValue,
        bind: async () => {},
        close() {},
      }
    }

    const { layer } = await datacenters({ openChannel: watching }, stores)

    const mine = new AbortController()
    const abandoned = layer.connect({ signal: mine.signal })
    const other = layer.connect()
    abandoned.catch(() => undefined)

    setTimeout(() => mine.abort(), 5)

    // The exchange is shared; one caller's cancellation is not.
    await expect(other).resolves.toBeDefined()
  })

  it('is attempted again after an exchange that failed', async () => {
    const stores = { auth: memory(), dcs: memory() }
    let attempts = 0

    const flaky = async (options: ChannelOptions): Promise<Channel> => {
      attempts += 1
      if (attempts === 1) throw new NetworkError('the exchange failed')

      return {
        dcId: options.address.id,
        authorization: options.authorization ?? negotiatedBy(options, attempts),
        state: 'ready',
        invoke: async () => ({ _: 'boolTrue' }) as TlValue,
        bind: async () => {},
        close() {},
      }
    }

    const { layer } = await datacenters({ openChannel: flaky }, stores)

    await expect(layer.connect()).rejects.toThrow(/the exchange failed/)

    // A failure is not remembered: the next caller starts a fresh exchange
    // rather than being handed the one that failed. Two more follow it, one for
    // each half of the authorization.
    const channel = await layer.connect()
    expect(channel.authorization.key.toBytes()).toEqual(material(3))
  })

  it('fails the connection when it cannot be written down', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const failing = {
      ...authorizationStore(stores.auth.kv),
      setKey: async () => {
        throw new Error('the disk is full')
      },
    }

    const { layer, channels } = await datacenters({ authorization: failing }, stores)

    // A client that cannot keep its key negotiates a new one on every start,
    // which is what an intruder looks like. Better to fail loudly.
    await expect(layer.connect()).rejects.toThrow(/disk is full/)
    expect(channels[0]?.closed).toBe(true)
  })
})

describe('an authorization that already exists', () => {
  it('is used instead of negotiating another', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const store = authorizationStore(stores.auth.kv)
    await store.setKey(2, material(7))
    await store.setTemporaryKey(2, 0, material(8), NOW_SECONDS + 3600)
    await store.setSalt(2, 0x1234n)

    const { layer, opened, forLifetimes } = await datacenters({}, stores)
    await layer.connect()

    // Nothing is exchanged and nothing is vouched for: the key connections use
    // is already there and has not run out.
    expect(forLifetimes()).toEqual([])
    expect(opened[0]?.authorization?.key.toBytes()).toEqual(material(8))
    expect(opened[0]?.authorization?.salt).toBe(0x1234n)
    expect(opened[0]?.keys).toBeUndefined()
  })

  it('is handed to connections with the moment it stops being valid', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const store = authorizationStore(stores.auth.kv)
    await store.setKey(2, material(7))
    await store.setTemporaryKey(2, 0, material(8), NOW_SECONDS + 3600)

    const { layer, forCallers } = await datacenters({}, stores)
    const channel = await layer.connect()

    // A connection that cannot say when its key runs out cannot be told apart
    // from one using the long-lived key, and the two are answered differently
    // when the datacenter refuses them.
    expect(channel.authorization.expiresAt).toBe(NOW_SECONDS + 3600)
    expect(forCallers()[0]?.authorization?.expiresAt).toBe(NOW_SECONDS + 3600)
  })

  it('is replaced when it has run out, without touching the long-lived key', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const store = authorizationStore(stores.auth.kv)
    await store.setKey(2, material(7))
    await store.setTemporaryKey(2, 0, material(8), NOW_SECONDS - 1)

    const { layer, bound, forLifetimes } = await datacenters({}, stores)
    const channel = await layer.connect()

    // A key that has run out is answered the same way as none at all: obtain
    // another and have the long-lived key vouch for it. That key is untouched.
    expect(forLifetimes()).toHaveLength(1)
    expect(bound[0]?.permanent).toEqual(AuthKey.from(material(7)).id)
    expect(await store.key(2)).toEqual(material(7))
    expect(channel.authorization.key.toBytes()).not.toEqual(material(8))
  })

  it('survives a restart of the layer', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const first = await datacenters({}, stores)
    const channel = await first.layer.connect()

    const second = await datacenters({}, stores)
    await second.layer.connect()

    // The second start reuses what the first negotiated rather than asking for
    // another key.
    expect(second.opened[0]?.authorization?.key.toBytes()).toEqual(
      channel.authorization.key.toBytes(),
    )
  })

  it('is used even when no salt was kept, which the server then corrects', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const store = authorizationStore(stores.auth.kv)
    await store.setKey(2, material(9))
    await store.setTemporaryKey(2, 0, material(10), NOW_SECONDS + 3600)

    const { layer, opened } = await datacenters({}, stores)
    await layer.connect()

    // The server refuses the first message and names the salt to use, so a key
    // without one costs a round trip rather than a re-authorization.
    expect(opened[0]?.authorization?.salt).toBe(0n)
  })

  it('is not written again for a connection that reused it', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const store = authorizationStore(stores.auth.kv)
    await store.setKey(2, material(3))
    await store.setTemporaryKey(2, 0, material(4), NOW_SECONDS + 3600)
    await store.setSalt(2, 0xaan)

    let writes = 0
    const counting = {
      ...store,
      setKey: async (dc: number, key: Uint8Array | undefined) => {
        writes += 1
        return store.setKey(dc, key)
      },
      setSalt: async (dc: number, salt: bigint) => {
        writes += 1
        return store.setSalt(dc, salt)
      },
      setTemporaryKey: async (
        dc: number,
        index: number,
        key: Uint8Array | undefined,
        expires: number,
      ) => {
        writes += 1
        return store.setTemporaryKey(dc, index, key, expires)
      },
    }

    const { layer } = await datacenters({ authorization: counting }, stores)
    await layer.connect()

    // Nothing was negotiated, so there is nothing to record.
    expect(writes).toBe(0)
    expect(await store.salt(2)).toBe(0xaan)
  })
})

describe('one key for every purpose a datacenter serves', () => {
  it('is shared by main and media rather than obtained twice', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer, forLifetimes, forCallers, bound } = await datacenters({}, stores)

    const main = await layer.connect()
    const media = await layer.connect({ purpose: 'media' })

    // A datacenter has one authorization. Media is a different address, not a
    // different client.
    expect(forLifetimes()).toHaveLength(1)
    expect(bound).toHaveLength(1)
    expect(media.authorization.key.id).toEqual(main.authorization.key.id)
    expect(forCallers()).toHaveLength(2)
  })

  it('is obtained once when both purposes ask at the same moment', async () => {
    const stores = { auth: memory(), dcs: memory() }
    let exchanges = 0

    const slow = async (options: ChannelOptions): Promise<Channel> => {
      if (options.authorization === undefined) {
        exchanges += 1
        await new Promise((resolve) => setTimeout(resolve, 5))
      }

      return stubbed(options, exchanges)
    }

    const { layer } = await datacenters({ openChannel: slow }, stores)
    const [main, media] = await Promise.all([layer.connect(), layer.connect({ purpose: 'media' })])

    // Two exchanges in all — the long-lived key and the one with a lifetime —
    // however many purposes asked at once.
    expect(exchanges).toBe(2)
    expect(media?.authorization.key.id).toEqual(main?.authorization.key.id)
    expect((await authorizationStore(stores.auth.kv).temporaryKey(2, 0, NOW_SECONDS))?.key).toEqual(
      main?.authorization.key.toBytes(),
    )
  })

  it('leaves nothing behind when vouching fails', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer, channels } = await datacenters(
      {
        openChannel: async (options: ChannelOptions) => {
          const channel = stubbed(options, 1)
          if (options.expiresIn === undefined) return channel

          return {
            ...channel,
            bind: async () => {
              throw new NetworkError('the datacenter would not vouch')
            },
          }
        },
      },
      stores,
    )

    await expect(layer.connect()).rejects.toThrow(/would not vouch/)

    // A key nothing has agreed to is not a key. What is kept is the long-lived
    // one, which was established before any of this and is still good.
    const store = authorizationStore(stores.auth.kv)
    expect(await store.temporaryKey(2, 0, 0)).toBeUndefined()
    expect(await store.key(2)).toEqual(material(1))
    expect(channels.every((channel) => channel.closed)).toBe(true)
  })
})

describe('discarding a key the datacenter refused', () => {
  /** The identifier of the nth key a stub negotiates. */
  const idOf = (seed: number) => AuthKey.from(material(seed)).id

  /** The long-lived key is the first negotiated; the one in use is the second. */
  const PERMANENT = 1
  const TEMPORARY = 2

  const stored = (auth: ReturnType<typeof memory>) => authorizationStore(auth.kv)

  it('removes the key that was refused and keeps the one that vouched for it', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect()

    // And says which it removed, which is what a diagnostic reports.
    await expect(layer.forget(2, idOf(TEMPORARY))).resolves.toBe('temporary')

    // The key with a lifetime is replaceable material. The long-lived key is
    // the authorization itself, and losing it would mean starting again.
    expect(await stored(stores.auth).temporaryKey(2, 0, 0)).toBeUndefined()
    expect(await stored(stores.auth).key(2)).toEqual(material(PERMANENT))
  })

  it('lets the next connection obtain another without authorizing again', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer, bound, forLifetimes } = await datacenters({}, stores)
    await layer.connect()
    await layer.forget(2, idOf(TEMPORARY))

    const channel = await layer.connect()

    // A second exchange for a key with a lifetime, vouched for by the same
    // long-lived key. Nothing asked the server to authorize this client again.
    expect(forLifetimes()).toHaveLength(2)
    expect(bound).toHaveLength(2)
    expect(bound[1]?.permanent).toEqual(idOf(PERMANENT))
    expect(channel.authorization.key.toBytes()).toEqual(material(3))
    expect(await stored(stores.auth).key(2)).toEqual(material(PERMANENT))
  })

  it('removes everything when the long-lived key itself is refused', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect()
    // Nothing presents the long-lived key, so this can only arrive once the key
    // in use is already gone — but when it does, the authorization is finished.
    await layer.forget(2, idOf(TEMPORARY))

    await expect(layer.forget(2, idOf(PERMANENT))).resolves.toBe('permanent')

    expect(await stored(stores.auth).key(2)).toBeUndefined()
  })

  it('removes a key that had already run out when the refusal names it', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const store = authorizationStore(stores.auth.kv)
    await store.setKey(2, material(7))
    await store.setTemporaryKey(2, 0, material(8), NOW_SECONDS - 1)

    const { layer } = await datacenters({}, stores)
    await layer.forget(2, AuthKey.from(material(8)).id)

    // This end had already written the key off; the datacenter refusing it says
    // so too. Leaving it behind would keep something that will only ever be
    // refused, and let a later refusal be read as one of the long-lived key.
    expect(await store.temporaryKey(2, 0, 0)).toBeUndefined()
    expect(await store.key(2)).toEqual(material(7))
  })

  it('keeps a key the refusal does not name', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect()

    await expect(layer.forget(2, idOf(9))).resolves.toBe('none')

    expect((await stored(stores.auth).temporaryKey(2, 0, 0))?.key).toEqual(material(TEMPORARY))
    expect(await stored(stores.auth).key(2)).toEqual(material(PERMANENT))
  })

  it('does nothing when there is nothing stored', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)

    await expect(layer.forget(2, idOf(1))).resolves.toBe('none')
    expect(stores.auth.values.size).toBe(0)
  })

  it('does nothing the second time it is asked', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect()

    await layer.forget(2, idOf(TEMPORARY))
    await layer.forget(2, idOf(TEMPORARY))

    expect(await stored(stores.auth).temporaryKey(2, 0, 0)).toBeUndefined()
    expect(await stored(stores.auth).key(2)).toEqual(material(PERMANENT))
  })

  it('leaves a replacement obtained since the refusal alone', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect()
    await layer.forget(2, idOf(TEMPORARY))
    await layer.connect()

    // The refusal was about a key that is already gone. A datacenter serves
    // more than one connection, so this arrives after another has replaced it.
    await layer.forget(2, idOf(TEMPORARY))

    expect((await stored(stores.auth).temporaryKey(2, 0, 0))?.key).toEqual(material(3))
  })

  it('leaves a replacement alone even while it is being obtained', async () => {
    const stores = { auth: memory(), dcs: memory() }
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let exchanges = 0

    const { layer } = await datacenters(
      {
        openChannel: async (options: ChannelOptions) => {
          if (options.authorization !== undefined) return stubbed(options, 0)

          exchanges += 1
          const seed = exchanges
          // Only the exchange that replaces the key is held open, so a case can
          // act while a replacement is under way rather than after it.
          if (seed === 3) await held

          return stubbed(options, seed)
        },
      },
      stores,
    )

    await layer.connect()
    await layer.forget(2, idOf(TEMPORARY))

    const second = layer.connect()
    const stale = layer.forget(2, idOf(TEMPORARY))
    release()
    await Promise.all([second, stale])

    expect((await stored(stores.auth).temporaryKey(2, 0, 0))?.key).toEqual(material(3))
  })

  it('never removes a replacement obtained while it was still reading', async () => {
    const auth = memoryHoldingReads()
    const stores = { auth, dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect()

    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    auth.hold(held)

    // The read behind this discard takes longer than everything that follows
    // it. A comparison made against what it read, applied to what is there when
    // it finally acts, would remove a key it never looked at.
    const stale = layer.forget(2, idOf(TEMPORARY))
    await tick()

    const replacing = (async () => {
      await layer.forget(2, idOf(TEMPORARY))
      await layer.connect()
    })()

    // Given every chance to run to completion first. It cannot, because the
    // datacenter's authorization is not free — and that is the whole guarantee.
    await tick()

    release()
    await Promise.all([stale, replacing])

    expect((await stored(auth).temporaryKey(2, 0, 0))?.key).toEqual(material(3))
  })

  it('lets an unrelated datacenter carry on while one is held up', async () => {
    const auth = memoryHoldingReads()
    const stores = { auth, dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect({ id: 1 })

    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    auth.hold(held)

    const stuck = layer.forget(2, idOf(9))
    await tick()

    let behind = false
    const queuedBehind = layer.forget(2, idOf(9)).then(() => {
      behind = true
    })

    // Datacenters have authorizations of their own, so one waiting on a slow
    // store is not a reason for the others to wait with it — while anything
    // else for the same datacenter waits exactly as it should.
    await expect(layer.forget(1, idOf(9))).resolves.toBe('none')
    expect(behind).toBe(false)

    release()
    await Promise.all([stuck, queuedBehind])
    expect(behind).toBe(true)
  })

  it('does not let one operation overtake another because an earlier one finished', async () => {
    const auth = memoryHoldingReads()
    const stores = { auth, dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect()

    let release = () => {}
    const slow = new Promise<void>((resolve) => {
      release = resolve
    })
    // The first goes straight through; the second is still reading.
    auth.hold(Promise.resolve(), slow)

    const first = layer.forget(2, idOf(9))
    const second = layer.forget(2, idOf(9))
    await first
    await tick()

    let third = false
    const queuedBehind = layer.forget(2, idOf(9)).then(() => {
      third = true
    })
    await tick()

    // One operation finishing says nothing about the one after it. Treating it
    // as the end of the queue would let a third run alongside the second.
    expect(third).toBe(false)

    release()
    await Promise.all([second, queuedBehind])
    expect(third).toBe(true)
  })

  it('is not wedged by an operation that failed', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters(
      {
        openChannel: async (options: ChannelOptions) => {
          if (options.authorization === undefined) throw new NetworkError('the exchange failed')

          return stubbed(options, 0)
        },
      },
      stores,
    )

    await expect(layer.connect()).rejects.toBeInstanceOf(NetworkError)

    // The next operation is not the one that failed, and it reads the store for
    // itself.
    await expect(layer.forget(2, idOf(1))).resolves.toBe('none')
  })

  it('is safe when two connections to one datacenter refuse the same key', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)
    await layer.connect()

    // Main and media are one datacenter and one key, so both see the same
    // refusal. The second discard names a key the first has already removed.
    await Promise.all([layer.forget(2, idOf(TEMPORARY)), layer.forget(2, idOf(TEMPORARY))])
    await layer.connect({ purpose: 'media' })

    expect((await stored(stores.auth).temporaryKey(2, 0, 0))?.key).toEqual(material(3))
    expect(await stored(stores.auth).key(2)).toEqual(material(PERMANENT))
  })
})

describe('the configuration the server publishes', () => {
  const config = (fields: Record<string, unknown> = {}): TlValue => ({
    _: 'config',
    this_dc: 4,
    test_mode: false,
    dc_options: [
      { _: 'dcOption', id: 4, ip_address: '10.0.0.4', port: 443 },
      { _: 'dcOption', id: 5, ip_address: '10.0.0.5', port: 443, media_only: true },
    ],
    ...fields,
  })

  it('replaces what was known and is remembered', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)
    const channel = await layer.connect()

    const asked: TlValue[] = []
    channel.invoke = async (query) => {
      asked.push(query)
      return config()
    }

    const adopted = await layer.refresh(channel)

    // The configuration comes from the one method that publishes it.
    expect(asked).toEqual([{ _: 'help.getConfig' }])

    expect(adopted.thisDc).toBe(4)
    expect(layer.directory.identifiers()).toEqual([4, 5])
    expect((await datacenterStore(stores.dcs.kv).load())?.thisDc).toBe(4)
  })

  it('changes where a later connection goes', async () => {
    const { layer, forCallers } = await datacenters()
    const channel = await layer.connect()
    channel.invoke = async () => config()
    await layer.refresh(channel)

    await layer.connect()

    // The default is the datacenter this client belongs to, which the server
    // has just said is a different one.
    expect(forCallers().at(-1)?.address.id).toBe(4)
  })

  it('is refused whole when it is malformed', async () => {
    const { layer } = await datacenters()
    const channel = await layer.connect()
    channel.invoke = async () => config({ dc_options: [] })

    await expect(layer.refresh(channel)).rejects.toBeInstanceOf(ValidationError)
    // Nothing was adopted, so what was known is still what is used.
    expect(layer.directory.thisDc).toBe(2)
  })

  it('leaves the directory alone when it cannot be written down', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const store = datacenterStore(stores.dcs.kv)
    const failing = {
      ...store,
      save: async () => {
        throw new Error('the disk is full')
      },
    }

    const { layer } = await datacenters({ datacenters: failing }, stores)
    const channel = await layer.connect()
    channel.invoke = async () => config()

    await expect(layer.refresh(channel)).rejects.toThrow(/disk is full/)

    // Adopted in memory but not on disk is a client that reverts on restart and
    // reported a failure while changing anyway.
    expect(layer.directory.thisDc).toBe(2)
    expect(layer.directory.identifiers()).toEqual([1, 2])
  })

  it('writes nothing when the server publishes what was already stored', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const store = datacenterStore(stores.dcs.kv)

    let writes = 0
    const counting = {
      ...store,
      save: async (configuration: DcConfiguration) => {
        writes += 1
        return store.save(configuration)
      },
    }

    const { layer } = await datacenters({ datacenters: counting }, stores)
    const channel = await layer.connect()
    channel.invoke = async () => config()

    await layer.refresh(channel)
    expect(writes).toBe(1)

    // The same configuration again is not a change, and rewriting it would put
    // the store through a write for nothing on every refresh.
    await layer.refresh(channel)
    await layer.refresh(channel)
    expect(writes).toBe(1)
  })

  it('is adopted the same way however many times it is asked for', async () => {
    const { layer } = await datacenters()
    const channel = await layer.connect()
    channel.invoke = async () => config()

    const first = await layer.refresh(channel)
    const second = await layer.refresh(channel)

    expect(second).toEqual(first)
    expect(layer.directory.identifiers()).toEqual([4, 5])
  })

  it('is refused when the call itself fails, leaving what was known in place', async () => {
    const { layer } = await datacenters()
    const channel = await layer.connect()
    channel.invoke = async () => {
      throw new NetworkError('the call failed')
    }

    await expect(layer.refresh(channel)).rejects.toThrow(/the call failed/)
    expect(layer.directory.thisDc).toBe(2)
  })

  it('is refused on a channel that has been closed', async () => {
    const { layer } = await datacenters()
    const channel = await layer.connect()
    channel.invoke = async () => {
      throw new NetworkError('the channel is closed')
    }
    channel.close()

    await expect(layer.refresh(channel)).rejects.toBeInstanceOf(NetworkError)
    expect(layer.directory.thisDc).toBe(2)
  })

  it('can be adopted directly, without asking', async () => {
    const stores = { auth: memory(), dcs: memory() }
    const { layer } = await datacenters({}, stores)

    await layer.adopt({ thisDc: 1, testMode: true, options: [address({ id: 1 })] })

    expect(layer.directory.thisDc).toBe(1)
    expect((await datacenterStore(stores.dcs.kv).load())?.testMode).toBe(true)
  })
})

describe('what the layer does not own', () => {
  it('opens a new channel every time rather than handing one back', async () => {
    const { layer, forCallers } = await datacenters()
    const first = await layer.connect()
    const second = await layer.connect()

    // Holding channels would mean asking twice gives the same connection, which
    // is pooling — and pooling is not decided here.
    expect(forCallers()).toHaveLength(2)
    expect(first).not.toBe(second)
  })

  it('leaves closing to whoever asked for the channel', async () => {
    const { layer, channels } = await datacenters()
    const channel = await layer.connect()

    // The exchange closes its own; the caller's stays open until the caller
    // says otherwise.
    const mine = channels.at(-1)
    expect(mine?.closed).toBe(false)
    channel.close()
    expect(mine?.closed).toBe(true)
  })

  it('passes cancellation through to the attempt', async () => {
    const controller = new AbortController()
    const { layer, forCallers } = await datacenters()

    await layer.connect({ signal: controller.signal })

    expect(forCallers()[0]?.signal).toBe(controller.signal)
  })

  it('passes the reports a caller asked for through to the channel', async () => {
    const onClosed = () => {}
    const { layer, forCallers } = await datacenters()

    await layer.connect({ onClosed })

    expect(forCallers()[0]?.onClosed).toBe(onClosed)
  })
})
