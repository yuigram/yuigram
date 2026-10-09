// SPDX-License-Identifier: MPL-2.0

/**
 * The store a browser has instead of a directory.
 *
 * Driven through a stand-in rather than a real `localStorage`, because what has
 * to be true is about this store's behaviour and not about the browser's: that
 * it keeps to its own prefix, that expiry is honoured, that a torn or foreign
 * value is not reported as one of its own, and that a write which could not
 * happen is reported rather than lost.
 *
 * `crypto-backend.test.ts` and the browser harness cover the case this cannot:
 * that a real browser behaves the way the stand-in does.
 */

import { describe, expect, it } from 'vitest'
import { ConfigError, StorageError, type WebStorageLike, web } from '../src/index.js'

/** A `Storage` that records what it was asked to do. */
function fakeStorage(options: { readonly failAt?: number } = {}): WebStorageLike & {
  readonly raw: Map<string, string>
} {
  const raw = new Map<string, string>()

  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem(key, value) {
      if (options.failAt !== undefined && raw.size >= options.failAt) {
        // What a browser does at the quota: it throws.
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      raw.set(key, value)
    },
    removeItem: (key) => void raw.delete(key),
    key: (index) => [...raw.keys()][index] ?? null,
    get length() {
      return raw.size
    },
  }
}

describe('keeping to its own keys', () => {
  it('writes under a prefix and reads back through it', async () => {
    const storage = fakeStorage()
    const store = web({ storage })

    await store.set('session', { dc: 2 })

    expect([...storage.raw.keys()]).toEqual(['yuigram:session'])
    expect(await store.get('session')).toEqual({ dc: 2 })
  })

  it('does not see what something else on the page stored', async () => {
    // An origin's storage is shared by everything running on it. A store that
    // read keys outside its prefix would report another application's state as
    // its own, and `clear` would delete it.
    const storage = fakeStorage()
    storage.setItem('someone-else', 'not ours')
    const store = web({ storage })

    await store.set('mine', 1)
    const keys: string[] = []
    for await (const key of store.keys?.() ?? []) keys.push(key)

    expect(keys).toEqual(['mine'])

    await store.clear?.()

    expect(storage.raw.has('someone-else')).toBe(true)
    expect(storage.raw.has('yuigram:mine')).toBe(false)
  })

  it('takes the prefix it was given', async () => {
    const storage = fakeStorage()

    await web({ storage, prefix: 'app/' }).set('k', 1)

    expect([...storage.raw.keys()]).toEqual(['app/k'])
  })

  it('owns a store whose prefix its own begins, and leaves a sibling alone', async () => {
    // A prefix is the whole of what separates two stores on one origin. Nested
    // prefixes are one store inside another, and clearing the outer one clears
    // both — which is how a page's cache check once emptied its session.
    const storage = fakeStorage()
    const outer = web({ storage, prefix: 'app:' })
    const inner = web({ storage, prefix: 'app:sessions:' })
    const sibling = web({ storage, prefix: 'other:' })

    await inner.set('key', 1)
    await sibling.set('key', 2)
    await outer.clear?.()

    expect(await inner.get('key')).toBeUndefined()
    expect(await sibling.get('key')).toBe(2)

    const first = web({ storage, prefix: 'app:cache:' })
    await inner.set('key', 3)
    await first.set('key', 4)
    await first.clear?.()

    expect(await inner.get('key')).toBe(3)
  })

  it('scopes keys and clear to a sub-prefix', async () => {
    const storage = fakeStorage()
    const store = web({ storage })

    await store.set('a:one', 1)
    await store.set('a:two', 2)
    await store.set('b:one', 3)

    const under: string[] = []
    for await (const key of store.keys?.('a:') ?? []) under.push(key)

    expect(under.sort()).toEqual(['a:one', 'a:two'])

    await store.clear?.('a:')

    expect(await store.get('a:one')).toBeUndefined()
    expect(await store.get('b:one')).toBe(3)
  })
})

describe('a value that has stopped being valid', () => {
  it('is gone once its time has passed, and takes its key with it', async () => {
    let clock = 1000
    const storage = fakeStorage()
    const store = web({ storage, now: () => clock })

    await store.set('code', 'x', { ttl: 60 })

    expect(await store.get('code')).toBe('x')
    expect(await store.has?.('code')).toBe(true)

    clock += 60_001

    expect(await store.get('code')).toBeUndefined()
    expect(await store.has?.('code')).toBe(false)
    // Read is when expiry is noticed, so the key is removed then rather than
    // left to accumulate against a quota nobody is watching.
    expect(storage.raw.has('yuigram:code')).toBe(false)
  })

  it('stays without a ttl', async () => {
    let clock = 1000
    const store = web({ storage: fakeStorage(), now: () => clock })

    await store.set('session', 'keep')
    clock += 10 ** 9

    expect(await store.get('session')).toBe('keep')
  })

  it('is not listed among the keys', async () => {
    let clock = 1000
    const store = web({ storage: fakeStorage(), now: () => clock })

    await store.set('kept', 1)
    await store.set('going', 2, { ttl: 1 })
    clock += 2000

    const keys: string[] = []
    for await (const key of store.keys?.() ?? []) keys.push(key)

    expect(keys).toEqual(['kept'])
  })
})

describe('what the store did not write', () => {
  it('treats a value it cannot read as absent, and removes it', async () => {
    // A torn write, or something else that chose the same prefix. Reporting it
    // as a value would hand a caller whatever it happens to parse as.
    const storage = fakeStorage()
    storage.setItem('yuigram:broken', '{not json')
    const store = web({ storage })

    expect(await store.get('broken')).toBeUndefined()
    expect(storage.raw.has('yuigram:broken')).toBe(false)
  })
})

describe('a write that could not happen', () => {
  it('is reported rather than lost', async () => {
    // The quota. A write that silently did nothing is a session that silently
    // fails to resume, which is a sign-in the person has to do again.
    const store = web({ storage: fakeStorage({ failAt: 1 }) })

    await store.set('first', 1)

    await expect(store.set('second', 2)).rejects.toThrow(StorageError)
  })
})

describe('saying what it is', () => {
  it('reports itself as persistent, because it is', async () => {
    const store = web({ storage: fakeStorage() })

    expect(store.info).toEqual({ driver: 'web', persistent: true })
  })

  it('says what is missing when there is no storage to use', () => {
    // `localStorage` is absent under Node, which is where this case runs, so
    // the default really does have nothing to find.
    expect(() => web()).toThrow(ConfigError)
    expect(() => web()).toThrow(/localStorage/)
  })
})
