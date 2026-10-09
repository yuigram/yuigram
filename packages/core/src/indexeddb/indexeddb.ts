// SPDX-License-Identifier: MIT

/**
 * A store over a browser's IndexedDB.
 *
 * What a browser offers when `localStorage` is too small or too blunt: an
 * origin-scoped database with a far larger quota, written through transactions
 * rather than one synchronous call at a time. One store is one object store in
 * one database; its keys are the store's keys, and each value is the same JSON
 * envelope `web()` and `file()` keep, so a value round-trips here exactly as it
 * does there and nowhere else.
 *
 * **A write is done when its transaction is.** `set`, `delete` and `clear`
 * resolve on the transaction's completion, not on the request's success: a
 * request can succeed inside a transaction that then aborts, and reporting that
 * as written would be reporting a write that never happened. Transactions ask
 * for strict durability unless told otherwise, so completion means the browser
 * has committed the change rather than queued it.
 *
 * **Order.** IndexedDB runs read-write transactions over the same object store
 * one at a time, in the order they were created, across every connection of
 * the origin. Operations through this store are therefore applied in the order
 * they were called; operations from another tab interleave with them, each one
 * whole.
 *
 * **What it is not.** Atomic transactions do not keep two tabs from running the
 * same account. An account over this store is kept to one run per origin by the
 * guard every account takes — the Web Locks API, in a browser — exactly as one
 * over `web()` is; this store adds no exclusion of its own. And like everything
 * at an origin, its contents are readable by any script running there:
 * `docs/security.md` §3 says what follows from that.
 */

import { ConfigError, StorageError } from '../errors/errors.js'
import type { DescribedKV, KVInfo, SetOptions } from '../storage/types.js'

/**
 * An event handler property, as this store sets it.
 *
 * The event is `never` so that any implementation's handler type — the DOM's,
 * with its own event classes, or fake-indexeddb's — is accepted as it is typed.
 * The one handler here that looks at its event reads it defensively.
 */
export type IndexedDbEventHandler = (event: never) => void

/** A request, in the part of `IDBRequest` this store uses. */
export interface IndexedDbRequestLike<T = unknown> {
  readonly result: T
  readonly error: unknown
  onsuccess: IndexedDbEventHandler | null
  onerror: IndexedDbEventHandler | null
}

/** Opening a database, in the part of `IDBOpenDBRequest` this store uses. */
export interface IndexedDbOpenRequestLike extends IndexedDbRequestLike<IndexedDbDatabaseLike> {
  onupgradeneeded: IndexedDbEventHandler | null
  onblocked: IndexedDbEventHandler | null
}

/** A cursor, in the part of `IDBCursorWithValue` this store uses. */
export interface IndexedDbCursorLike {
  readonly key: unknown
  readonly value: unknown
  continue(): void
  delete(): IndexedDbRequestLike
}

/** An object store, in the part of `IDBObjectStore` this store uses. */
export interface IndexedDbObjectStoreLike {
  get(key: string): IndexedDbRequestLike
  put(value: unknown, key: string): IndexedDbRequestLike
  delete(key: string): IndexedDbRequestLike
  clear(): IndexedDbRequestLike
  openCursor(range?: unknown): IndexedDbRequestLike<IndexedDbCursorLike | null>
}

/** A transaction, in the part of `IDBTransaction` this store uses. */
export interface IndexedDbTransactionLike {
  readonly error: unknown
  objectStore(name: string): IndexedDbObjectStoreLike
  abort(): void
  oncomplete: IndexedDbEventHandler | null
  onabort: IndexedDbEventHandler | null
  onerror: IndexedDbEventHandler | null
}

/** A connection, in the part of `IDBDatabase` this store uses. */
export interface IndexedDbDatabaseLike {
  readonly version: number
  readonly objectStoreNames: { contains(name: string): boolean }
  createObjectStore(name: string): unknown
  transaction(
    store: string,
    mode: 'readonly' | 'readwrite',
    options?: { readonly durability?: IndexedDbDurability },
  ): IndexedDbTransactionLike
  close(): void
  onversionchange: IndexedDbEventHandler | null
}

/** The browser's `indexedDB`, or anything shaped like it. */
export interface IndexedDbFactoryLike {
  open(name: string, version?: number): IndexedDbOpenRequestLike
}

/** How hard a completed write has been committed. */
export type IndexedDbDurability = 'strict' | 'relaxed' | 'default'

/** Options for {@link indexedDb}. */
export interface IndexedDbOptions {
  /** The database. Defaults to `yuigram`. */
  readonly database?: string
  /**
   * The object store inside it. Defaults to `kv`.
   *
   * A database may hold several; each store of this kind owns one, and
   * `clear()` without a prefix empties that one only. One missing from an
   * existing database is added by raising the database's version, which waits
   * for every other open connection to it to close — this store's own close
   * when asked to.
   */
  readonly store?: string
  /**
   * The durability every write's transaction asks for. Defaults to `strict`,
   * so a completed write is one the browser has committed: an account's keys
   * are not something to lose to a crash after reporting them stored.
   */
  readonly durability?: IndexedDbDurability
  /** Which IndexedDB to use. Defaults to the runtime's `indexedDB`. */
  readonly factory?: IndexedDbFactoryLike
  /**
   * `IDBKeyRange`, for reading and clearing a prefix without walking the whole
   * store. Defaults to the runtime's; without one, a prefix is found by a full
   * walk, which is correct and slower.
   */
  readonly keyRange?: { lowerBound(lower: string): unknown }
  /** Clock source, injectable so expiry is testable without waiting. */
  readonly now?: () => number
}

/** A store over IndexedDB, which can be closed. */
export interface IndexedDbStore<V = unknown> extends DescribedKV<V> {
  has(key: string): Promise<boolean>
  clear(prefix?: string): Promise<void>
  keys(prefix?: string): AsyncIterable<string>
  /**
   * Close the connection. Transactions already begun finish first; an
   * operation that has not begun one by then is refused, as is any called
   * afterwards.
   */
  close(): Promise<void>
}

/** What a stored value looks like: the value, and when it stops being valid. */
interface Envelope {
  readonly v: unknown
  readonly e?: number
}

const DEFAULT_DATABASE = 'yuigram'
const DEFAULT_STORE = 'kv'

/** Attempts at reaching a database whose version moved underneath. */
const OPEN_ATTEMPTS = 5

function defaultFactory(): IndexedDbFactoryLike {
  const found = (globalThis as { indexedDB?: IndexedDbFactoryLike }).indexedDB

  if (found === undefined) {
    throw new ConfigError(
      'this runtime provides no `indexedDB` — pass a `factory`, or use `web()` or `memory()`',
    )
  }

  return found
}

/** Settle a request as a promise. */
function settled<T>(request: IndexedDbRequestLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  const named = error as { name?: unknown; message?: unknown } | null
  if (typeof named?.message === 'string' && named.message !== '') return named.message
  if (typeof named?.name === 'string') return named.name

  return String(error)
}

/**
 * A store over IndexedDB.
 *
 * ```ts
 * const account = Account.fromString(saved, { ...options, storage: indexedDb() })
 * ```
 *
 * Composes with the rest of the storage layer — `namespaced`, `tiered`,
 * `encrypted` — because it changes where values live and nothing else.
 */
export function indexedDb<V = unknown>(options: IndexedDbOptions = {}): IndexedDbStore<V> {
  const factory = options.factory ?? defaultFactory()
  const database = options.database ?? DEFAULT_DATABASE
  const storeName = options.store ?? DEFAULT_STORE
  const durability = options.durability ?? 'strict'
  const keyRange =
    options.keyRange ??
    (globalThis as { IDBKeyRange?: { lowerBound(lower: string): unknown } }).IDBKeyRange
  const now = options.now ?? Date.now

  let connection: Promise<IndexedDbDatabaseLike> | undefined
  let closed = false

  /** Open the database at a version that has this store, adding it if it is missing. */
  const open = async (): Promise<IndexedDbDatabaseLike> => {
    let lastError: unknown

    for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt += 1) {
      try {
        const first = factory.open(database)
        // A database that does not exist yet is created at version 1, and the
        // store can be made in that same upgrade.
        first.onupgradeneeded = () => {
          const creating = first.result
          if (!creating.objectStoreNames.contains(storeName)) creating.createObjectStore(storeName)
        }
        let db = await settled(first)

        if (!db.objectStoreNames.contains(storeName)) {
          const version = db.version + 1
          db.close()

          const request = factory.open(database, version)
          request.onupgradeneeded = () => {
            const upgrading = request.result
            if (!upgrading.objectStoreNames.contains(storeName)) {
              upgrading.createObjectStore(storeName)
            }
          }
          // Blocked means another connection is still open at the old version.
          // The request stays pending until it closes, which a connection of
          // this kind does as soon as it is asked.
          request.onblocked = () => {}
          db = await settled(request)
        }

        // Another connection — another tab, or another store of this kind —
        // needs a newer version. Step aside, and open again on the next call.
        db.onversionchange = () => {
          db.close()
          if (connection !== undefined) connection = undefined
        }

        return db
      } catch (error) {
        lastError = error
        // A version that moved between the two opens is raised again by the
        // next attempt; anything else is not going to change by trying.
        if ((error as { name?: unknown } | null)?.name !== 'VersionError') break
      }
    }

    throw new StorageError(
      `could not open the IndexedDB database '${database}': ${describe(lastError)}`,
      { cause: lastError },
    )
  }

  const connected = (): Promise<IndexedDbDatabaseLike> => {
    if (closed) return Promise.reject(new StorageError('this IndexedDB store has been closed'))

    connection ??= open().catch((error: unknown) => {
      connection = undefined
      throw error
    })

    return connection
  }

  /**
   * Run work in one transaction, and settle when the transaction does.
   *
   * The work records its result as its requests succeed; the promise resolves
   * with it only on completion, and rejects on an abort whatever the requests
   * reported, because an aborted transaction changed nothing.
   */
  const transact = async <T>(
    mode: 'readonly' | 'readwrite',
    what: string,
    work: (store: IndexedDbObjectStoreLike, done: (value: T) => void) => void,
  ): Promise<T> => {
    const begin = async (): Promise<IndexedDbTransactionLike> => {
      const db = await connected()
      try {
        return db.transaction(storeName, mode, mode === 'readwrite' ? { durability } : undefined)
      } catch (error) {
        // The connection closed for a version change after it was handed out.
        // One more connection is the whole remedy; a second failure is real.
        if ((error as { name?: unknown } | null)?.name !== 'InvalidStateError' || closed)
          throw error
        connection = undefined
        const again = await connected()
        return again.transaction(storeName, mode, mode === 'readwrite' ? { durability } : undefined)
      }
    }

    let transaction: IndexedDbTransactionLike
    try {
      transaction = await begin()
    } catch (error) {
      if (error instanceof StorageError) throw error
      throw new StorageError(`could not ${what}: ${describe(error)}`, { cause: error })
    }

    return await new Promise<T>((resolve, reject) => {
      let result: T | undefined
      let failure: unknown

      transaction.oncomplete = () => resolve(result as T)
      transaction.onabort = () => {
        const cause = failure ?? transaction.error ?? undefined
        reject(
          new StorageError(
            `could not ${what}: the transaction was aborted${cause === undefined ? '' : `: ${describe(cause)}`}`,
            cause === undefined ? undefined : { cause },
          ),
        )
      }
      // A failed request aborts its transaction, and the abort is where the
      // promise settles; this only keeps the request's own error as the cause.
      transaction.onerror = (event) => {
        const target = (event as { target?: { error?: unknown } } | null)?.target
        failure ??= target?.error
      }

      try {
        work(transaction.objectStore(storeName), (value) => {
          result = value
        })
      } catch (error) {
        failure = error
        try {
          transaction.abort()
        } catch {
          // Already finishing; its own handlers settle the promise.
        }
      }
    })
  }

  /** Read the raw text under a key. */
  const raw = (key: string): Promise<string | undefined> =>
    transact<string | undefined>('readonly', `read '${key}'`, (store, done) => {
      const request = store.get(key)
      request.onsuccess = () =>
        done(typeof request.result === 'string' ? request.result : undefined)
    })

  /**
   * Remove a key whose value was found unusable, but only if it still holds what
   * was found: a value written since is somebody's write, and is kept.
   */
  const discard = (key: string, seen: string): Promise<void> =>
    transact<void>('readwrite', `remove '${key}'`, (store) => {
      const request = store.get(key)
      request.onsuccess = () => {
        if (request.result === seen) store.delete(key)
      }
    })

  /** Parse an envelope, or say why it is not a value. */
  const read = (text: string): Envelope | 'unreadable' | 'expired' => {
    let parsed: Envelope
    try {
      parsed = JSON.parse(text) as Envelope
    } catch {
      return 'unreadable'
    }
    if (typeof parsed !== 'object' || parsed === null) return 'unreadable'
    if (parsed.e !== undefined && parsed.e <= now()) return 'expired'

    return parsed
  }

  const value = async (key: string): Promise<Envelope | undefined> => {
    const text = await raw(key)
    if (text === undefined) return undefined

    const envelope = read(text)
    if (typeof envelope === 'string') {
      await discard(key, text)
      return undefined
    }

    return envelope
  }

  /** Every key at or after `prefix` that begins with it, with its text. */
  /**
   * Visit every entry whose key begins with `prefix`, inside a transaction.
   *
   * Keys are ordered, so the first one past the prefix ends the walk. Without a
   * key range the walk starts at the beginning instead, and keys before the
   * prefix are passed over.
   */
  const walk = (
    store: IndexedDbObjectStoreLike,
    prefix: string,
    visit: (cursor: IndexedDbCursorLike, key: string) => void,
  ): void => {
    const request = store.openCursor(keyRange?.lowerBound(prefix))
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor === null) return

      const key = cursor.key
      if (typeof key === 'string') {
        if (key.startsWith(prefix)) visit(cursor, key)
        else if (keyRange !== undefined || key > prefix) return
      }
      cursor.continue()
    }
  }

  /** Every key that begins with `prefix`, with its text. */
  const entries = (prefix: string): Promise<Array<[string, string]>> =>
    transact<Array<[string, string]>>('readonly', 'list keys', (store, done) => {
      const found: Array<[string, string]> = []
      done(found)
      walk(store, prefix, (cursor, key) => {
        if (typeof cursor.value === 'string') found.push([key, cursor.value])
      })
    })

  const info: KVInfo = { driver: 'indexeddb', persistent: true }

  return {
    info,

    async get(key: string): Promise<V | undefined> {
      return (await value(key))?.v as V | undefined
    },

    async set(key: string, stored: V, setOptions?: SetOptions): Promise<void> {
      const ttl = setOptions?.ttl
      let text: string
      try {
        text = JSON.stringify(
          ttl === undefined ? { v: stored } : { v: stored, e: now() + ttl * 1000 },
        )
      } catch (error) {
        throw new StorageError(`could not store '${key}': ${describe(error)}`, { cause: error })
      }

      await transact<void>('readwrite', `store '${key}'`, (store) => {
        store.put(text, key)
      })
    },

    async delete(key: string): Promise<void> {
      await transact<void>('readwrite', `remove '${key}'`, (store) => {
        store.delete(key)
      })
    },

    async has(key: string): Promise<boolean> {
      return (await value(key)) !== undefined
    },

    async *keys(under?: string): AsyncIterable<string> {
      for (const [key, text] of await entries(under ?? '')) {
        // Expiry is judged on read, so a key whose value has expired is not a
        // key this store has.
        if (typeof read(text) !== 'string') yield key
      }
    },

    async clear(under?: string): Promise<void> {
      if (under === undefined || under === '') {
        await transact<void>('readwrite', 'clear the store', (store) => {
          store.clear()
        })
        return
      }

      await transact<void>('readwrite', `clear '${under}'`, (store) => {
        walk(store, under, (cursor) => {
          cursor.delete()
        })
      })
    },

    async close(): Promise<void> {
      if (closed) return
      closed = true

      const open = connection
      connection = undefined
      if (open === undefined) return

      try {
        // Closing waits for transactions already created on the connection to
        // finish; it is only new ones that are refused.
        ;(await open).close()
      } catch {
        // It never opened; there is nothing to close.
      }
    },
  }
}
