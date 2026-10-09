// SPDX-License-Identifier: MPL-2.0

/**
 * Storage driver behaviour.
 *
 * The contract cases run against every driver, so an adapter that passes them
 * is substitutable. Driver-specific suites cover what only that driver can get
 * wrong: LRU eviction for memory, path safety and atomicity for file.
 */

import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/app/app.js'
import { ConfigError, StorageError } from '../src/errors/errors.js'
import { namespaced, tiered } from '../src/storage/compose.js'
import { encrypted } from '../src/storage/encrypted.js'
import { file, isTooOpen } from '../src/storage/file.js'
import { memory } from '../src/storage/memory.js'
import type { DescribedKV, KV } from '../src/storage/types.js'

/** Key material for the encrypted-store cases. Not a credential for anything. */
const SECRET = 'a-secret-for-tests-only'

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
contractSuite('encrypted', (now) => encrypted(memory<string>({ now }), SECRET))

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

describe('encrypted', () => {
  it('leaves nothing readable in the store it wraps', async () => {
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('cart', { items: ['a-recognisable-string'] })

    const stored = await inner.get('cart')

    expect(stored).toBeTypeOf('string')
    expect(stored).not.toContain('a-recognisable-string')
    expect(stored).not.toContain('items')
  })

  it('passes keys through untouched, so prefixes still work', async () => {
    // Encrypting keys would break `namespaced`, `clear(prefix)` and `keys()`,
    // which are how every other part of the storage layer scopes itself.
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('sessions:42', 1)

    expect(await inner.get('sessions:42')).toBeDefined()
  })

  it('reads back what an earlier store wrote under the same secret', async () => {
    // The salt travels with the value, so a later process derives the same key
    // from the same secret without being told anything else.
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('a', { n: 1 })

    expect(await encrypted(inner, SECRET).get('a')).toEqual({ n: 1 })
  })

  it('survives a restart when the store it wraps does', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-encrypted-'))
    try {
      await encrypted(file<string>(directory), SECRET).set('a', { n: 1 })

      expect(await encrypted(file<string>(directory), SECRET).get('a')).toEqual({ n: 1 })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('refuses to read what another secret wrote', async () => {
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('a', 1)

    await expect(encrypted(inner, 'a-different-secret').get('a')).rejects.toThrow(StorageError)
  })

  it('refuses a value that has been altered', async () => {
    // The reason for an authenticated cipher: a changed byte is detected here
    // rather than decrypting to something plausible.
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('a', { n: 1 })

    const raw = Buffer.from((await inner.get('a')) ?? '', 'base64')
    const last = raw.length - 1
    raw[last] = (raw[last] ?? 0) ^ 0xff
    await inner.set('a', raw.toString('base64'))

    await expect(encrypted(inner, SECRET).get('a')).rejects.toThrow(StorageError)
  })

  it('refuses a value moved to another key', async () => {
    // The key is authenticated alongside the value. Without that, anyone who
    // could write to the store could swap one user's session onto another's
    // key and it would decrypt perfectly.
    const inner = memory<string>()
    const store = encrypted(inner, SECRET)
    await store.set('user:1', { admin: true })

    await inner.set('user:2', (await inner.get('user:1')) ?? '')

    await expect(store.get('user:2')).rejects.toThrow(StorageError)
  })

  it('refuses a value it did not write', async () => {
    // Pointing an encrypted store at one that already holds plaintext. Reading
    // it as absent would look like an empty store and invite overwriting it.
    const inner = memory<string>()
    await inner.set('a', 'plain text nobody encrypted')

    await expect(encrypted(inner, SECRET).get('a')).rejects.toThrow(StorageError)
  })

  it('refuses a value written in a format it does not know', async () => {
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('a', 1)

    const raw = Buffer.from((await inner.get('a')) ?? '', 'base64')
    raw[0] = 0x02
    await inner.set('a', raw.toString('base64'))

    await expect(encrypted(inner, SECRET).get('a')).rejects.toThrow(StorageError)
  })

  it('keeps a value it could not read', async () => {
    // A wrong secret is usually a typo, and the data is still good under the
    // right one. Discarding it the way a corrupt file is discarded would turn
    // a mistake into data loss.
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('a', { n: 1 })

    await expect(encrypted(inner, 'wrong').get('a')).rejects.toThrow(StorageError)

    expect(await encrypted(inner, SECRET).get('a')).toEqual({ n: 1 })
  })

  it('writes the same value differently every time', async () => {
    // A fresh nonce per write. Without one, equal values would be visibly
    // equal in the store, which leaks more than it looks like it does.
    const inner = memory<string>()
    const store = encrypted(inner, SECRET)

    await store.set('a', 'same')
    const first = await inner.get('a')
    await store.set('a', 'same')

    expect(await inner.get('a')).not.toBe(first)
    expect(await store.get('a')).toBe('same')
  })

  it('gives each store its own salt', async () => {
    // A constant salt would mean one precomputation against this library, not
    // against a deployment. The salt travels with the value, which is what
    // still lets a later store read what this one wrote.
    const saltOf = async (store: DescribedKV<unknown>, inner: KV<string>): Promise<string> => {
      await store.set('a', 1)

      return Buffer.from((await inner.get('a')) ?? '', 'base64')
        .subarray(1, 17)
        .toString('hex')
    }

    const first = memory<string>()
    const second = memory<string>()

    expect(await saltOf(encrypted(first, SECRET), first)).not.toBe(
      await saltOf(encrypted(second, SECRET), second),
    )
  })

  it('refuses a stored value that is not text', async () => {
    // An adapter is four methods against whatever database an application
    // already runs, and one that hands back a parsed object rather than the
    // string it was given must not reach the cipher.
    const inner: KV<string> = {
      get: async () => ({ not: 'text' }) as unknown as string,
      set: async () => {},
      delete: async () => {},
    }

    await expect(encrypted(inner, SECRET).get('a')).rejects.toThrow(StorageError)
  })

  it('refuses a stored value that cannot even be described', async () => {
    // A null-prototype object is what several JSON parsers hand back. Coercing
    // one to text throws, so it has to be rejected as a value rather than
    // turned into one on the way to the cipher.
    const inner: KV<string> = {
      get: async () => Object.create(null) as string,
      set: async () => {},
      delete: async () => {},
    }

    await expect(encrypted(inner, SECRET).get('a')).rejects.toThrow(StorageError)
  })

  it('refuses a value cut short after it was written', async () => {
    // A partial write: the format marker survives, the rest does not. Taking
    // it apart anyway hands the cipher an empty nonce and tag, which fails as
    // something other than a storage problem.
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('a', { n: 1 })

    const raw = Buffer.from((await inner.get('a')) ?? '', 'base64')
    await inner.set('a', raw.subarray(0, 20).toString('base64'))

    await expect(encrypted(inner, SECRET).get('a')).rejects.toThrow(StorageError)
  })

  it('reads a value written as undefined as absent', async () => {
    // What every other driver answers, because a value that is `undefined` and
    // one that was never written are the same thing under this contract.
    const store = encrypted(memory<string>(), SECRET)
    await store.set('a', undefined)

    expect(await store.get('a')).toBeUndefined()
  })

  it('round-trips values with nothing in them', async () => {
    const store = encrypted(memory<string>(), SECRET)

    await store.set('text', '')
    await store.set('object', {})
    await store.set('list', [])

    expect(await store.get('text')).toBe('')
    expect(await store.get('object')).toEqual({})
    expect(await store.get('list')).toEqual([])
  })

  it('stays correct over repeated writes and reads', async () => {
    const store = encrypted(memory<string>(), SECRET)

    for (let index = 0; index < 20; index += 1) await store.set('a', index)

    expect(await store.get('a')).toBe(19)
  })

  it('serves concurrent reads, deriving the key once', async () => {
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('a', { n: 1 })

    const store = encrypted(inner, SECRET)
    const reads = await Promise.all(Array.from({ length: 10 }, async () => store.get('a')))

    expect(reads).toEqual(Array.from({ length: 10 }, () => ({ n: 1 })))
  })

  it('answers whether a value exists without needing the secret', async () => {
    // Presence is the wrapped store's answer, not a decryption. A caller
    // checking for a key should not have to be able to read it.
    const inner = memory<string>()
    await encrypted(inner, SECRET).set('a', 1)

    expect(await encrypted(inner, 'a-different-secret').has?.('a')).toBe(true)
  })

  it('deletes and clears through to the store it wraps', async () => {
    const inner = memory<string>()
    const store = encrypted(inner, SECRET)

    await store.set('a:1', 1)
    await store.set('b:1', 2)
    await store.delete('a:1')

    expect(await inner.get('a:1')).toBeUndefined()

    await store.clear?.()
    expect(await inner.get('b:1')).toBeUndefined()
  })

  it('refuses to be built without a secret', async () => {
    // `process.env.KEY!` is `undefined` at run time when the variable is not
    // set, whatever the type says, and a store built from it would encrypt
    // everything under a key nobody chose.
    expect(() => encrypted(memory<string>(), '')).toThrow(ConfigError)
  })

  it('reports the persistence of the store it wraps', () => {
    expect(encrypted(memory<string>(), SECRET).info.persistent).toBe(false)
  })

  it('is persistent over a store that is', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-encrypted-'))
    try {
      expect(encrypted(file<string>(directory), SECRET).info.persistent).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not claim persistence for an adapter that does not say', () => {
    // The four documented methods and nothing else, which is what an adapter
    // written against the contract looks like.
    const bare: KV<string> = {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
    }

    expect(encrypted(bare, SECRET).info.persistent).toBe(false)
  })

  it('does not take an unrelated info field as a description', async () => {
    // `info` is a small enough name that an adapter may already use it for
    // something else. Believing it would report persistence nobody claimed.
    const inner = {
      ...memory<string>(),
      info: 'a note about this adapter',
    } as unknown as KV<string>

    expect(encrypted(inner, SECRET).info.persistent).toBe(false)
  })

  it('composes with namespaced in either order', async () => {
    const inner = memory<string>()

    const outside = namespaced(encrypted(inner, SECRET), 'a:')
    const inside = encrypted(namespaced(inner, 'b:'), SECRET)

    await outside.set('k', 1)
    await inside.set('k', 2)

    expect(await outside.get('k')).toBe(1)
    expect(await inside.get('k')).toBe(2)
    expect(await inner.get('a:k')).toBeTypeOf('string')
    expect(await inner.get('b:k')).toBeTypeOf('string')
  })
})

describe('an application over an encrypted store', () => {
  it('keeps its own state and its clients apart, and neither in the clear', async () => {
    const inner = memory<string>()
    const app = new App({ storage: encrypted(inner, SECRET) })

    await app.storage.set('deployed', 'a-recognisable-string')

    expect(await app.storage.get('deployed')).toBe('a-recognisable-string')
    expect(await inner.get('app:deployed')).not.toContain('a-recognisable-string')
  })
})

/** A logger that keeps what it was told, so a case can read it back. */
function recorder() {
  const warnings: Array<{ message: string; fields?: Record<string, unknown> }> = []
  const log = {
    debug() {},
    info() {},
    warn(message: string, fields?: Record<string, unknown>) {
      warnings.push(fields === undefined ? { message } : { message, fields })
    },
    error() {},
    child: () => log,
    isEnabled: () => true,
  }

  return { log, warnings }
}

describe('a store directory anyone can read', () => {
  it('is what a mode lets anyone but the owner into', () => {
    // The whole of the judgement, so the cases below are about wiring rather
    // than about which bits mean what.
    expect(isTooOpen(0o700)).toBe(false)
    expect(isTooOpen(0o600)).toBe(false)
    expect(isTooOpen(0o500)).toBe(false)
    expect(isTooOpen(0o000)).toBe(false)

    expect(isTooOpen(0o750)).toBe(true)
    expect(isTooOpen(0o705)).toBe(true)
    expect(isTooOpen(0o755)).toBe(true)
    expect(isTooOpen(0o777)).toBe(true)
    expect(isTooOpen(0o701)).toBe(true)
  })

  it('reads the file-type bits without mistaking them for permissions', () => {
    // `stat` reports the type in the high bits: a directory is 0o40700, which
    // a check on the whole number would read as open.
    expect(isTooOpen(0o40700)).toBe(false)
    expect(isTooOpen(0o40755)).toBe(true)
  })

  it('says so, once, when the directory lets others in', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-modes-'))
    const { log, warnings } = recorder()

    try {
      const store = file(directory, { log, permissions: async () => 0o40755 })
      await store.set('a', 1)
      await store.get('a')
      await store.set('b', 2)

      expect(warnings).toHaveLength(1)
      expect(warnings[0]?.message).toMatch(/readable beyond its owner/)
      expect(warnings[0]?.fields).toMatchObject({ directory, mode: '755' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('says nothing about a directory only its owner can reach', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-modes-'))
    const { log, warnings } = recorder()

    try {
      await file(directory, { log, permissions: async () => 0o40700 }).set('a', 1)

      expect(warnings).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('says nothing where permissions mean nothing', async () => {
    // A filesystem without POSIX modes reports whatever it likes. Warning every
    // user of such a platform about a number that says nothing about their
    // exposure is how a warning stops being read.
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-modes-'))
    const { log, warnings } = recorder()

    try {
      await file(directory, { log, permissions: async () => undefined }).set('a', 1)

      expect(warnings).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('says nothing when nowhere was given to say it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-modes-'))
    let asked = 0

    try {
      const store = file(directory, {
        permissions: async () => {
          asked += 1

          return 0o40777
        },
      })
      await store.set('a', 1)

      // Not merely silent: a store with no logger does not go to the
      // filesystem for an answer it has nowhere to put.
      expect(asked).toBe(0)
      expect(await store.get('a')).toBe(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('still works when the directory cannot be inspected at all', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-modes-'))
    const { log, warnings } = recorder()

    try {
      const store = file(directory, {
        log,
        permissions: async () => {
          throw new Error('no such thing')
        },
      })

      await expect(store.set('a', 1)).rejects.toThrow(/no such thing/)
      expect(warnings).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('warns about the directory it was pointed at', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-modes-'))
    const { log } = recorder()
    const inspected: string[] = []

    try {
      await file(directory, {
        log,
        permissions: async (path) => {
          inspected.push(path)

          return 0o40700
        },
      }).set('a', 1)

      expect(inspected).toEqual([directory])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

/** A fresh temporary directory, removed with the rest after the suite. */
async function scratchDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'yuigram-owns-'))
}

describe('what the file store owns', () => {
  it('leaves a neighbouring file alone when cleared', async () => {
    // The store is pointed at a directory but does not own everything in it.
    // Removing the directory wholesale destroyed data it never wrote.
    const directory = await scratchDirectory()
    const store = file(directory)

    await store.set('a', 1)
    await writeFile(join(directory, 'important.db'), 'someone else data')

    await store.clear?.()

    await expect(readFile(join(directory, 'important.db'), 'utf8')).resolves.toBe(
      'someone else data',
    )
    expect(await store.get('a')).toBeUndefined()
  })

  it('ignores a foreign json file when listing keys', async () => {
    const directory = await scratchDirectory()
    const store = file(directory)

    await store.set('a', 1)
    await writeFile(join(directory, 'config.json'), '{"key":"injected","value":9}')

    const keys: string[] = []
    for await (const key of store.keys?.() ?? []) keys.push(key)

    expect(keys).toEqual(['a'])
  })

  it('creates the directory owner-only', async () => {
    // Session state. The default mode leaves it listable by every account on
    // the machine; the files inside are already 0600, so this is defence in
    // depth rather than the only guard.
    if (process.platform === 'win32') {
      expect(true).toBe(true)
      return
    }

    const directory = join(await scratchDirectory(), 'nested')
    await file(directory).set('a', 1)

    expect((await stat(directory)).mode & 0o077).toBe(0)
  })
})
