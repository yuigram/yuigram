/**
 * Storage driver behaviour.
 *
 * The contract cases run against every driver, so an adapter that passes them
 * is substitutable. Driver-specific suites cover what only that driver can get
 * wrong: LRU eviction for memory, path safety and atomicity for file.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { namespaced, tiered } from '../src/storage/compose.js'
import { file } from '../src/storage/file.js'
import { memory } from '../src/storage/memory.js'
import type { DescribedKV } from '../src/storage/types.js'

/** Controllable clock, so TTL behaviour is tested without waiting. */
function clock(start = 1_000_000): { now: () => number; advance: (seconds: number) => void } {
  let current = start
  return {
    now: () => current,
    advance: (seconds) => {
      current += seconds * 1000
    },
  }
}

/** Shared contract every driver must satisfy. */
function contractSuite(
  name: string,
  create: (now: () => number) => Promise<DescribedKV<unknown>> | DescribedKV<unknown>,
): void {
  describe(`${name} — contract`, () => {
    it('round-trips a value', async () => {
      const store = await create(Date.now)
      await store.set('a', { n: 1 })
      expect(await store.get('a')).toEqual({ n: 1 })
    })

    it('returns undefined for an absent key', async () => {
      const store = await create(Date.now)
      expect(await store.get('missing')).toBeUndefined()
    })

    it('overwrites an existing value', async () => {
      const store = await create(Date.now)
      await store.set('a', 1)
      await store.set('a', 2)
      expect(await store.get('a')).toBe(2)
    })

    it('deletes a value', async () => {
      const store = await create(Date.now)
      await store.set('a', 1)
      await store.delete('a')
      expect(await store.get('a')).toBeUndefined()
    })

    it('treats deleting an absent key as a no-op', async () => {
      const store = await create(Date.now)
      await expect(store.delete('missing')).resolves.toBeUndefined()
    })

    it('reports presence', async () => {
      const store = await create(Date.now)
      await store.set('a', 1)
      expect(await store.has?.('a')).toBe(true)
      expect(await store.has?.('missing')).toBe(false)
    })

    it('stores falsy values distinguishably from absence', async () => {
      // `get` returning undefined must mean absent, not "stored 0".
      const store = await create(Date.now)
      await store.set('zero', 0)
      await store.set('empty', '')
      await store.set('false', false)

      expect(await store.get('zero')).toBe(0)
      expect(await store.get('empty')).toBe('')
      expect(await store.get('false')).toBe(false)
    })

    it('expires a value after its ttl', async () => {
      const time = clock()
      const store = await create(time.now)

      await store.set('a', 1, { ttl: 60 })
      expect(await store.get('a')).toBe(1)

      time.advance(61)
      expect(await store.get('a')).toBeUndefined()
    })

    it('keeps a value with no ttl', async () => {
      const time = clock()
      const store = await create(time.now)

      await store.set('a', 1)
      time.advance(100_000)

      expect(await store.get('a')).toBe(1)
    })

    it('lists keys', async () => {
      const store = await create(Date.now)
      await store.set('a:1', 1)
      await store.set('a:2', 2)
      await store.set('b:1', 3)

      const all: string[] = []
      for await (const key of store.keys?.() ?? []) all.push(key)

      expect(all.sort()).toEqual(['a:1', 'a:2', 'b:1'])
    })

    it('lists keys under a prefix', async () => {
      const store = await create(Date.now)
      await store.set('a:1', 1)
      await store.set('b:1', 2)

      const found: string[] = []
      for await (const key of store.keys?.('a:') ?? []) found.push(key)

      expect(found).toEqual(['a:1'])
    })

    it('clears everything', async () => {
      const store = await create(Date.now)
      await store.set('a', 1)
      await store.clear?.()
      expect(await store.get('a')).toBeUndefined()
    })

    it('clears under a prefix only', async () => {
      const store = await create(Date.now)
      await store.set('a:1', 1)
      await store.set('b:1', 2)

      await store.clear?.('a:')

      expect(await store.get('a:1')).toBeUndefined()
      expect(await store.get('b:1')).toBe(2)
    })
  })
}

contractSuite('memory', (now) => memory({ now }))

describe('file driver', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'yuigram-storage-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  contractSuite('file', async (now) => {
    const scoped = await mkdtemp(join(tmpdir(), 'yuigram-contract-'))
    return file(scoped, { now })
  })

  it('persists across store instances', async () => {
    await file(directory).set('a', { n: 1 })
    expect(await file(directory).get('a')).toEqual({ n: 1 })
  })

  it('hashes keys into filenames', async () => {
    // A raw key as a filename would let user-derived input escape the
    // directory or collide with another entry.
    const store = file(directory)
    await store.set('../../escape', 1)
    await store.set('a/b/c', 2)

    const names = await readdir(directory)

    expect(names).toHaveLength(2)
    for (const name of names) {
      expect(name).toMatch(/^[0-9a-f]{64}\.json$/)
    }
    expect(await store.get('../../escape')).toBe(1)
    expect(await store.get('a/b/c')).toBe(2)
  })

  it('leaves no temporary files behind', async () => {
    const store = file(directory)
    await store.set('a', 1)
    expect((await readdir(directory)).filter((n) => n.endsWith('.tmp'))).toHaveLength(0)
  })

  it('treats a corrupt file as a miss and removes it', async () => {
    // Framework state degrades gracefully; a truncated write must not throw
    // on every subsequent read.
    const store = file(directory)
    await store.set('a', 1)

    const [name] = await readdir(directory)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(directory, name ?? ''), '{ not json', 'utf8')

    expect(await store.get('a')).toBeUndefined()
    expect(await readdir(directory)).toHaveLength(0)
  })

  it('creates the directory on demand', async () => {
    const nested = join(directory, 'deep', 'nested')
    const store = file(nested)
    await store.set('a', 1)
    expect(await store.get('a')).toBe(1)
  })
})

describe('memory driver', () => {
  it('evicts least recently used entries past max', async () => {
    const store = memory({ max: 2 })
    await store.set('a', 1)
    await store.set('b', 2)
    await store.set('c', 3)

    expect(await store.get('a')).toBeUndefined()
    expect(await store.get('b')).toBe(2)
    expect(await store.get('c')).toBe(3)
  })

  it('counts a read as recent use', async () => {
    const store = memory({ max: 2 })
    await store.set('a', 1)
    await store.set('b', 2)
    await store.get('a')
    await store.set('c', 3)

    expect(await store.get('a')).toBe(1)
    expect(await store.get('b')).toBeUndefined()
  })

  it('is unbounded by default', async () => {
    const store = memory()
    for (let i = 0; i < 500; i++) await store.set(`k${i}`, i)
    expect(await store.get('k0')).toBe(0)
  })

  it('reports itself as non-persistent', () => {
    expect(memory().info.persistent).toBe(false)
  })
})

describe('namespaced', () => {
  it('isolates two consumers sharing one store', async () => {
    const shared = memory()
    const a = namespaced(shared, 'a:')
    const b = namespaced(shared, 'b:')

    await a.set('key', 1)
    await b.set('key', 2)

    expect(await a.get('key')).toBe(1)
    expect(await b.get('key')).toBe(2)
  })

  it('reports unprefixed keys', async () => {
    const store = namespaced(memory(), 'ns:')
    await store.set('key', 1)

    const found: string[] = []
    for await (const key of store.keys?.() ?? []) found.push(key)

    expect(found).toEqual(['key'])
  })

  it('clears only its own namespace', async () => {
    const shared = memory()
    const a = namespaced(shared, 'a:')
    const b = namespaced(shared, 'b:')

    await a.set('key', 1)
    await b.set('key', 2)
    await a.clear?.()

    expect(await a.get('key')).toBeUndefined()
    expect(await b.get('key')).toBe(2)
  })
})

describe('tiered', () => {
  it('reads through to the backing store', async () => {
    const back = memory()
    await back.set('a', 1)

    expect(await tiered(memory(), back).get('a')).toBe(1)
  })

  it('populates the front store on a miss', async () => {
    const front = memory()
    const back = memory()
    await back.set('a', 1)

    await tiered(front, back).get('a')

    expect(await front.get('a')).toBe(1)
  })

  it('writes to both stores', async () => {
    const front = memory()
    const back = memory()

    await tiered(front, back).set('a', 1)

    expect(await front.get('a')).toBe(1)
    expect(await back.get('a')).toBe(1)
  })

  it('deletes from both stores', async () => {
    const front = memory()
    const back = memory()
    const store = tiered(front, back)

    await store.set('a', 1)
    await store.delete('a')

    expect(await front.get('a')).toBeUndefined()
    expect(await back.get('a')).toBeUndefined()
  })

  it('stays correct when the front store evicts', async () => {
    // The front tier is a cache; eviction must only cost a round trip.
    const front = memory({ max: 1 })
    const back = memory()
    const store = tiered(front, back)

    await store.set('a', 1)
    await store.set('b', 2)

    expect(await store.get('a')).toBe(1)
  })
})
