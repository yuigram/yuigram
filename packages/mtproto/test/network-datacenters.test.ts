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

import { NetworkError, ValidationError } from '@yuigram/core'
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

/** The layer, with channels stubbed and every call to open one recorded. */
async function datacenters(
  overrides: Record<string, unknown> = {},
  shared?: { auth: ReturnType<typeof memory>; dcs: ReturnType<typeof memory> },
) {
  const auth = shared?.auth ?? memory()
  const dcs = shared?.dcs ?? memory()
  const opened: ChannelOptions[] = []
  const channels: Array<{ closed: boolean }> = []
  let negotiated = 0

  const stubChannel = async (options: ChannelOptions): Promise<Channel> => {
    opened.push(options)
    const record = { closed: false }
    channels.push(record)

    // A channel with no authorization negotiates one; the key it settles on is
    // what the layer above has to write down.
    const authorization = options.authorization ?? {
      key: AuthKey.from(material(++negotiated)),
      salt: 0x5a17n,
    }

    return {
      dcId: options.address.id,
      authorization,
      get state() {
        return record.closed ? ('closed' as const) : ('ready' as const)
      },
      invoke: async () => ({ _: 'boolTrue' }) as TlValue,
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
    ...overrides,
  })

  return { layer, opened, channels, auth, dcs, stores: { auth, dcs } }
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
    const { layer, opened } = await datacenters()
    await layer.connect()

    expect(opened[0]?.address.id).toBe(2)
    expect(opened[0]?.address.host).toBe('10.0.0.2')
  })

  it('connects to the datacenter that was asked for', async () => {
    const { layer, opened } = await datacenters()
    await layer.connect({ id: 1 })

    expect(opened[0]?.address.host).toBe('10.0.0.1')
  })

  it('honours the purpose and the address family', async () => {
    const { layer, opened } = await datacenters()
    await layer.connect({ purpose: 'media' })
    await layer.connect({ ipv6: true })

    // Media prefers the address set aside for it; the family is a preference
    // applied within the purpose.
    expect(opened[0]?.address.host).toBe('10.0.0.2')
    expect(opened[1]?.address.host).toBe('2001:db8::2')
  })

  it('refuses when no address serves what was asked for', async () => {
    const { layer } = await datacenters()

    await expect(layer.connect({ id: 9 })).rejects.toBeInstanceOf(NetworkError)
    await expect(layer.connect({ purpose: 'cdn' })).rejects.toThrow(/serving cdn/)
  })

  it('passes the settings every connection shares', async () => {
    const { layer, opened } = await datacenters({ obfuscated: true, connectTimeout: 250 })
    await layer.connect()

    expect(opened[0]).toMatchObject({ obfuscated: true, connectTimeout: 250, client: CLIENT })
  })
})

describe('the first authorization', () => {
  it('is negotiated when none is stored', async () => {
    const { layer, opened } = await datacenters()
    await layer.connect()

    // No authorization to supply, so the channel is told which server keys an
    // exchange may be answered with.
    expect(opened[0]?.authorization).toBeUndefined()
    expect(opened[0]?.keys).toEqual([])
  })

  it('is written down, key and salt together', async () => {
    const { layer, auth } = await datacenters()
    const channel = await layer.connect()

    const store = authorizationStore(auth.kv)
    expect(await store.key(2)).toEqual(channel.authorization.key.toBytes())
    expect(await store.salt(2)).toBe(channel.authorization.salt)
  })

  it('is written down against the datacenter it belongs to', async () => {
    const { layer, auth } = await datacenters()
    await layer.connect({ id: 1 })

    const store = authorizationStore(auth.kv)
    expect(await store.key(1)).toBeDefined()
    expect(await store.key(2)).toBeUndefined()
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
    await authorizationStore(stores.auth.kv).setKey(2, material(7))
    await authorizationStore(stores.auth.kv).setSalt(2, 0x1234n)

    const { layer, opened } = await datacenters({}, stores)
    await layer.connect()

    expect(opened[0]?.authorization?.key.toBytes()).toEqual(material(7))
    expect(opened[0]?.authorization?.salt).toBe(0x1234n)
    expect(opened[0]?.keys).toBeUndefined()
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
    await authorizationStore(stores.auth.kv).setKey(2, material(9))

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
    }

    const { layer } = await datacenters({ authorization: counting }, stores)
    await layer.connect()

    // Nothing was negotiated, so there is nothing to record.
    expect(writes).toBe(0)
    expect(await store.salt(2)).toBe(0xaan)
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
    channel.invoke = async () => config()

    const adopted = await layer.refresh(channel)

    expect(adopted.thisDc).toBe(4)
    expect(layer.directory.identifiers()).toEqual([4, 5])
    expect((await datacenterStore(stores.dcs.kv).load())?.thisDc).toBe(4)
  })

  it('changes where a later connection goes', async () => {
    const { layer, opened } = await datacenters()
    const channel = await layer.connect()
    channel.invoke = async () => config()
    await layer.refresh(channel)

    await layer.connect()

    // The default is the datacenter this client belongs to, which the server
    // has just said is a different one.
    expect(opened[1]?.address.id).toBe(4)
  })

  it('is refused whole when it is malformed', async () => {
    const { layer } = await datacenters()
    const channel = await layer.connect()
    channel.invoke = async () => config({ dc_options: [] })

    await expect(layer.refresh(channel)).rejects.toBeInstanceOf(ValidationError)
    // Nothing was adopted, so what was known is still what is used.
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
    const { layer, opened } = await datacenters()
    const first = await layer.connect()
    const second = await layer.connect()

    // Holding channels would mean asking twice gives the same connection, which
    // is pooling — and pooling is not decided here.
    expect(opened).toHaveLength(2)
    expect(first).not.toBe(second)
  })

  it('leaves closing to whoever asked for the channel', async () => {
    const { layer, channels } = await datacenters()
    const channel = await layer.connect()

    expect(channels[0]?.closed).toBe(false)
    channel.close()
    expect(channels[0]?.closed).toBe(true)
  })

  it('passes cancellation through to the attempt', async () => {
    const controller = new AbortController()
    const { layer, opened } = await datacenters()

    await layer.connect({ signal: controller.signal })

    expect(opened[0]?.signal).toBe(controller.signal)
  })

  it('passes the reports a caller asked for through to the channel', async () => {
    const onClosed = () => {}
    const { layer, opened } = await datacenters()

    await layer.connect({ onClosed })

    expect(opened[0]?.onClosed).toBe(onClosed)
  })
})
