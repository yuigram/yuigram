// SPDX-License-Identifier: MPL-2.0

/**
 * The IndexedDB store, over fake-indexeddb.
 *
 * fake-indexeddb is an implementation of the IndexedDB specification written
 * by others, so transaction ordering, upgrades and aborts here are its reading
 * of the specification rather than this store's. The same behaviour is
 * exercised in a real browser by the browser check (`tools/browser`).
 *
 * The failure cases wrap the factory, so a transaction aborts or a request
 * throws exactly where the case says, every time.
 */

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { ConfigError, StorageError } from '../src/errors/errors.js'
import {
  type IndexedDbFactoryLike,
  type IndexedDbOptions,
  indexedDb,
} from '../src/indexeddb/indexeddb.js'

/** A fresh, empty IndexedDB for one case. */
const fresh = (): IndexedDbFactoryLike => new IDBFactory()

const over = <V>(factory: IndexedDbFactoryLike, options: IndexedDbOptions = {}) =>
  indexedDb<V>({ factory, keyRange: IDBKeyRange, ...options })

/** Read back everything a store lists under a prefix. */
async function listed(store: { keys?(prefix?: string): AsyncIterable<string> }, prefix?: string) {
  const found: string[] = []
  for await (const key of store.keys?.(prefix) ?? []) found.push(key)

  return found
}

/**
 * Wrap a factory so that every write a store makes fails in one chosen way.
 *
 * - `abort` — the request succeeds and the transaction is then aborted, so the
 *   change is undone after the request reported it made.
 * - `throw` — the request itself is refused when it is made.
 */
function failingWrites(
  factory: IndexedDbFactoryLike,
  how: 'abort' | 'throw',
): IndexedDbFactoryLike {
  const wrapStore = (store: object, transaction: { abort(): void }) =>
    new Proxy(store, {
      get(target, property) {
        const original = Reflect.get(target, property, target)
        if (property !== 'put' && property !== 'delete' && property !== 'clear') {
          return typeof original === 'function' ? original.bind(target) : original
        }
        return (...args: unknown[]) => {
          if (how === 'throw') throw new DOMException('refused for the case', 'DataError')
          const request = (original as (...a: unknown[]) => EventTarget).apply(target, args)
          // After the request has succeeded: a store that reported the write on
          // the request's success would report one that is then undone.
          request.addEventListener('success', () => transaction.abort())
          return request
        }
      },
    })
  const wrapTransaction = (transaction: object) =>
    new Proxy(transaction, {
      get(target, property) {
        const original = Reflect.get(target, property, target)
        if (property === 'objectStore') {
          return (name: string) =>
            wrapStore((original as (n: string) => object).call(target, name), target as never)
        }
        return typeof original === 'function' ? original.bind(target) : original
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target)
      },
    })
  const wrapDatabase = (database: object) =>
    new Proxy(database, {
      get(target, property) {
        const original = Reflect.get(target, property, target)
        if (property === 'transaction') {
          return (...args: unknown[]) => {
            const made = (original as (...a: unknown[]) => object).apply(target, args)
            return args[1] === 'readwrite' ? wrapTransaction(made) : made
          }
        }
        return typeof original === 'function' ? original.bind(target) : original
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target)
      },
    })

  return {
    open(name, version) {
      const request = version === undefined ? factory.open(name) : factory.open(name, version)
      return new Proxy(request, {
        get(target, property) {
          const original = Reflect.get(target, property, target)
          if (property === 'result') return wrapDatabase(original as object)
          return typeof original === 'function' ? original.bind(target) : original
        },
        set(target, property, value) {
          return Reflect.set(target, property, value, target)
        },
      })
    },
  }
}

describe('reading and writing', () => {
  it('keeps values the way the other stores do: as JSON', async () => {
    const store = over<unknown>(fresh())

    await store.set('n', 1)
    await store.set('o', { a: [1, 'two', null], at: new Date(0) })

    expect(await store.get('n')).toBe(1)
    // A Date goes in as JSON text, as it would through file() or web().
    expect(await store.get('o')).toEqual({ a: [1, 'two', null], at: '1970-01-01T00:00:00.000Z' })
    expect(await store.has('o')).toBe(true)
    await store.delete('o')
    expect(await store.has('o')).toBe(false)
    expect(await store.get('missing')).toBeUndefined()
  })

  it('refuses a value JSON cannot hold, and writes nothing', async () => {
    const store = over<unknown>(fresh())

    await expect(store.set('big', 1n)).rejects.toBeInstanceOf(StorageError)
    expect(await store.has('big')).toBe(false)
  })

  it('lets a value expire, and forgets it once read', async () => {
    let clock = 1_000
    const factory = fresh()
    const store = over<string>(factory, { now: () => clock })

    await store.set('short', 'lived', { ttl: 2 })
    expect(await store.get('short')).toBe('lived')
    clock += 2_000
    expect(await store.get('short')).toBeUndefined()
    expect(await listed(store)).toEqual([])
  })

  it('treats text another program left under a key as absent, and removes it', async () => {
    const factory = fresh()
    const store = over<string>(factory)
    await store.set('k', 'mine')

    // Written beside the store, in the same object store, by something else.
    await new Promise<void>((done) => {
      const request = (factory as unknown as InstanceType<typeof IDBFactory>).open('yuigram')
      request.onsuccess = () => {
        const tx = request.result.transaction('kv', 'readwrite')
        tx.objectStore('kv').put('{not json', 'k')
        tx.oncomplete = () => {
          request.result.close()
          done()
        }
      }
    })

    expect(await store.get('k')).toBeUndefined()
    expect(await listed(store)).toEqual([])
  })
})

describe('persistence and naming', () => {
  it('finds what an earlier store wrote, after it closed', async () => {
    const factory = fresh()
    const first = over<string>(factory, { database: 'app' })
    await first.set('session', 'keys')
    await first.close()

    const second = over<string>(factory, { database: 'app' })
    expect(await second.get('session')).toBe('keys')
  })

  it('keeps databases and object stores apart', async () => {
    const factory = fresh()
    const sessions = over<string>(factory, { database: 'app', store: 'sessions' })
    const cache = over<string>(factory, { database: 'app', store: 'cache' })
    const other = over<string>(factory, { database: 'other' })

    await sessions.set('k', 'session')
    // Adding the second object store raises the database's version while the
    // first store holds a connection; that one steps aside and reopens.
    await cache.set('k', 'cached')
    await other.set('k', 'elsewhere')
    await cache.clear()

    expect(await sessions.get('k')).toBe('session')
    expect(await cache.get('k')).toBeUndefined()
    expect(await other.get('k')).toBe('elsewhere')
    await sessions.set('k2', 'after the upgrade')
    expect(await sessions.get('k2')).toBe('after the upgrade')
  })

  it('lists and clears exactly the prefix asked for', async () => {
    const store = over<number>(fresh())
    for (const key of ['a', 'a:1', 'a:2', 'ab', 'b:1']) await store.set(key, 1)

    expect(await listed(store, 'a:')).toEqual(['a:1', 'a:2'])
    await store.clear('a:')
    expect(await listed(store)).toEqual(['a', 'ab', 'b:1'])
  })

  it('finds a prefix by walking the store when there is no key range', async () => {
    const store = indexedDb<number>({ factory: fresh(), keyRange: undefined as never })
    for (const key of ['a', 'a:1', 'b:1', 'b:2', 'c']) await store.set(key, 1)

    expect(await listed(store, 'b:')).toEqual(['b:1', 'b:2'])
    await store.clear('b:')
    expect(await listed(store)).toEqual(['a', 'a:1', 'c'])
  })
})

describe('order', () => {
  it('ends with the last of many writes to one key, called together', async () => {
    const store = over<number>(fresh())

    await Promise.all(Array.from({ length: 40 }, (_, index) => store.set('key', index)))

    expect(await store.get('key')).toBe(39)
  })

  it('applies writes from two stores over one database in the order they were called', async () => {
    const factory = fresh()
    const one = over<number>(factory)
    const two = over<number>(factory)
    // Both connected before the race, so neither waits on opening.
    await one.set('warm', 0)
    await two.set('warm', 0)

    await Promise.all(
      Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? one : two).set('key', index)),
    )

    expect(await one.get('key')).toBe(19)
  })

  it('orders a removal after the write before it, and a read after both', async () => {
    const store = over<string>(fresh())

    const written = store.set('k', 'v')
    const removed = store.delete('k')
    const read = store.get('k')
    await Promise.all([written, removed])

    expect(await read).toBeUndefined()
  })
})

describe('failure', () => {
  it('does not report a write whose transaction aborted', async () => {
    const factory = fresh()
    await over<string>(factory).set('k', 'before')
    const failing = over<string>(failingWrites(factory, 'abort'))

    const attempt = failing.set('k', 'after')

    await expect(attempt).rejects.toBeInstanceOf(StorageError)
    await expect(attempt).rejects.toThrow(/aborted/)
    expect(await over<string>(factory).get('k')).toBe('before')
  })

  it('reports a request that was refused, with its cause', async () => {
    const factory = fresh()
    const failing = over<string>(failingWrites(factory, 'throw'))

    const attempt = failing.set('k', 'v')

    await expect(attempt).rejects.toBeInstanceOf(StorageError)
    await expect(attempt).rejects.toMatchObject({ cause: { name: 'DataError' } })
    expect(await over<string>(factory).get('k')).toBeUndefined()
  })

  it('reports a failed removal and a failed clear the same way', async () => {
    const factory = fresh()
    await over<string>(factory).set('k', 'kept')
    const failing = over<string>(failingWrites(factory, 'abort'))

    await expect(failing.delete('k')).rejects.toBeInstanceOf(StorageError)
    await expect(failing.clear()).rejects.toBeInstanceOf(StorageError)
    expect(await over<string>(factory).get('k')).toBe('kept')
  })

  it('refuses operations once closed', async () => {
    const store = over<string>(fresh())
    await store.set('k', 'v')
    await store.close()

    await expect(store.get('k')).rejects.toThrow(/closed/)
    await expect(store.set('k', 'w')).rejects.toBeInstanceOf(StorageError)
  })

  it('says what is missing in a runtime without IndexedDB', () => {
    expect(() => indexedDb()).toThrow(ConfigError)
  })
})

describe('what it reports about itself', () => {
  it('is a persistent store named for its driver', () => {
    expect(over(fresh()).info).toEqual({ driver: 'indexeddb', persistent: true })
  })
})
