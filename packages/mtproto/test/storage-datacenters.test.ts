// SPDX-License-Identifier: MIT

/**
 * Remembering where the datacenters are.
 *
 * The list is the only way to reach the server and is fetched from the server,
 * so what is stored here is what closes that loop on the next start. A stored
 * list that comes back subtly wrong is worse than none: it is used, it fails to
 * connect, and nothing about the failure names the stored value.
 */

import { describe, expect, it } from 'vitest'
import type { DcAddress, DcConfiguration } from '../src/network/dc.js'
import { DatacenterStorageError, datacenterStore } from '../src/storage/datacenters.js'

/** A store that keeps what it is given, and lets a case corrupt it. */
function memory() {
  const values = new Map<string, unknown>()

  return {
    kv: {
      get: async (key: string) => values.get(key),
      set: async (key: string, value: unknown) => {
        values.set(key, value)
      },
      delete: async (key: string) => {
        values.delete(key)
      },
    },
    values,
  }
}

function address(fields: Partial<DcAddress> = {}): DcAddress {
  return {
    id: 2,
    host: '10.0.0.1',
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

const CONFIGURATION: DcConfiguration = {
  thisDc: 2,
  testMode: false,
  options: [
    address(),
    address({ id: 2, host: '2001:db8::1', ipv6: true, static: true }),
    address({ id: 5, host: '10.0.0.5', mediaOnly: true, tcpoOnly: true }),
  ],
}

describe('a configuration that was saved', () => {
  it('comes back as it went in', async () => {
    const { kv } = memory()
    const store = datacenterStore(kv)
    await store.save(CONFIGURATION)

    expect(await store.load()).toEqual(CONFIGURATION)
  })

  it('keeps every flag, not only the ones that were set', async () => {
    const { kv } = memory()
    const store = datacenterStore(kv)
    await store.save(CONFIGURATION)
    const loaded = await store.load()

    expect(loaded?.options[1]).toMatchObject({ ipv6: true, static: true, mediaOnly: false })
    expect(loaded?.options[2]).toMatchObject({ mediaOnly: true, tcpoOnly: true, ipv6: false })
  })

  it('keeps the order the server published', async () => {
    const { kv } = memory()
    const store = datacenterStore(kv)
    await store.save(CONFIGURATION)

    expect((await store.load())?.options.map((entry) => entry.id)).toEqual([2, 2, 5])
  })

  it('keeps an obfuscation secret through a form that carries text', async () => {
    const { kv } = memory()
    const store = datacenterStore(kv)
    const secret = Uint8Array.from({ length: 16 }, (_, index) => (index * 17) & 0xff)
    await store.save({ ...CONFIGURATION, options: [address({ secret })] })

    expect((await store.load())?.options[0]?.secret).toEqual(secret)
  })

  it('leaves an absent secret absent rather than storing nothing as something', async () => {
    const { kv } = memory()
    const store = datacenterStore(kv)
    await store.save(CONFIGURATION)

    expect((await store.load())?.options[0]?.secret).toBeUndefined()
  })

  it('is replaced wholesale rather than merged', async () => {
    const { kv } = memory()
    const store = datacenterStore(kv)
    await store.save(CONFIGURATION)
    await store.save({ thisDc: 1, testMode: true, options: [address({ id: 1 })] })

    // An address missing from a later configuration is one the server stopped
    // serving. Merging would keep it forever.
    const loaded = await store.load()
    expect(loaded?.options).toHaveLength(1)
    expect(loaded?.thisDc).toBe(1)
    expect(loaded?.testMode).toBe(true)
  })

  it('is gone once forgotten', async () => {
    const { kv } = memory()
    const store = datacenterStore(kv)
    await store.save(CONFIGURATION)
    await store.forget()

    expect(await store.load()).toBeUndefined()
  })
})

describe('a configuration that was never saved', () => {
  it('reads as absent rather than as an empty network', async () => {
    expect(await datacenterStore(memory().kv).load()).toBeUndefined()
  })

  it('is forgotten without complaint', async () => {
    await expect(datacenterStore(memory().kv).forget()).resolves.toBeUndefined()
  })
})

describe('a stored configuration that is damaged', () => {
  /** Save, then corrupt what was written. */
  async function corrupted(mutate: (stored: Record<string, unknown>) => void) {
    const { kv, values } = memory()
    const store = datacenterStore(kv)
    await store.save(CONFIGURATION)

    const stored = values.get('datacenters') as Record<string, unknown>
    mutate(stored)

    return store
  }

  it('is refused rather than treated as absent', async () => {
    // Absent means "ask the server". Answering that for a list that is merely
    // damaged discards addresses that were working.
    const store = await corrupted((stored) => {
      stored['options'] = 'not a list'
    })

    await expect(store.load()).rejects.toBeInstanceOf(DatacenterStorageError)
  })

  it('is refused when it names no addresses', async () => {
    const store = await corrupted((stored) => {
      stored['options'] = []
    })

    await expect(store.load()).rejects.toThrow(/names 0 addresses/)
  })

  it('is refused when it names far more addresses than a network has', async () => {
    const store = await corrupted((stored) => {
      stored['options'] = Array.from({ length: 1025 }, () => ({}))
    })

    await expect(store.load()).rejects.toThrow(/names 1025 addresses/)
  })

  it('is refused when the identity is not a whole number', async () => {
    const store = await corrupted((stored) => {
      stored['thisDc'] = '2'
    })

    await expect(store.load()).rejects.toThrow(/'thisDc' is not a whole number/)
  })

  it('is refused when the network is not a flag', async () => {
    const store = await corrupted((stored) => {
      stored['testMode'] = 'yes'
    })

    await expect(store.load()).rejects.toThrow(/'testMode' is not a flag/)
  })

  it('is refused when an address lost its host', async () => {
    const store = await corrupted((stored) => {
      const options = stored['options'] as Record<string, unknown>[]
      const first = options[0]
      if (first !== undefined) first['host'] = ''
    })

    await expect(store.load()).rejects.toThrow(/'host' is not text/)
  })

  it('is refused when a flag became something else', async () => {
    const store = await corrupted((stored) => {
      const options = stored['options'] as Record<string, unknown>[]
      const first = options[0]
      if (first !== undefined) first['cdn'] = 1
    })

    await expect(store.load()).rejects.toThrow(/'cdn' is not a flag/)
  })

  it('is refused when an address is not a record at all', async () => {
    const store = await corrupted((stored) => {
      stored['options'] = ['10.0.0.1']
    })

    await expect(store.load()).rejects.toThrow(/stored address 0 is not a stored record/)
  })

  it('is refused when a secret decodes to nothing', async () => {
    const store = await corrupted((stored) => {
      const options = stored['options'] as Record<string, unknown>[]
      const first = options[0]
      // Base64 accepts text that decodes to no bytes, which would otherwise be
      // handed to the transport as though it were a secret.
      if (first !== undefined) first['secret'] = ''
    })

    await expect(store.load()).rejects.toThrow(/decodes to nothing/)
  })

  it('is refused when the whole record is not a record', async () => {
    const { kv, values } = memory()
    const store = datacenterStore(kv)
    values.set('datacenters', ['10.0.0.1'])

    await expect(store.load()).rejects.toThrow(/is not a stored record/)
  })
})
