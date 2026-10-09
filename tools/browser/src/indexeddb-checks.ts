// SPDX-License-Identifier: MPL-2.0

/**
 * The IndexedDB store, in the browser's own IndexedDB.
 *
 * Everything here runs against the page's real `indexedDB`: its transactions,
 * its upgrade rules and its ordering are the browser's. The failure cases wrap
 * that same factory so that a transaction aborts after its request succeeded,
 * or a request is refused when it is made — the two ways a write can fail —
 * and check that neither is reported as written.
 *
 * Ownership is the guard's, not the store's: an account over this store takes
 * the same Web Locks hold an account over `web()` takes, and the checks below
 * say so by what the claim reports and what a second claim is told.
 */

import { type IndexedDbFactoryLike, indexedDb } from '../../../packages/core/src/indexeddb/index.js'
import { serverRsaKey } from '../../../packages/mtproto/src/auth/keys.js'
import { connectWebSocket } from '../../../packages/mtproto/src/network/websocket.js'
import { claimArea } from '../../../packages/mtproto/src/storage/ownership.js'
import {
  Account,
  areaFor,
  StorageError,
  StorageOwnershipError,
} from '../../../packages/yuigram/src/index.js'

type Check = (name: string, run: () => Promise<string> | string) => Promise<void>
type Expect = (condition: boolean, message: string) => void

interface Browser {
  readonly indexedDB: IndexedDbFactoryLike & { deleteDatabase(name: string): unknown }
  readonly IDBKeyRange: { lowerBound(lower: string): unknown }
}

const browser = globalThis as unknown as Browser

/** What the account check needs from the page that runs it. */
export interface AccountSetup {
  readonly key: { readonly n: string; readonly e: string }
  readonly dc: number
  readonly host: string
  readonly port: number
  /** The WebSocket address of a datacenter of its own, by client name. */
  readonly socket: (client: string) => string
  readonly stats: (client: string) => Promise<{ readonly permanentKeys: number }>
  readonly now: () => number
}

/** Remove a database, waiting until the browser has. */
function remove(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = browser.indexedDB.deleteDatabase(name) as {
      onsuccess: (() => void) | null
      onerror: (() => void) | null
      onblocked: (() => void) | null
    }
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

/** Every key a store lists under a prefix. */
async function listed(store: { keys?(prefix?: string): AsyncIterable<string> }, prefix?: string) {
  const found: string[] = []
  for await (const key of store.keys?.(prefix) ?? []) found.push(key)

  return found
}

/**
 * The page's IndexedDB, with every write made to fail one way.
 *
 * `abort` lets the request succeed and then aborts its transaction; `throw`
 * refuses the request when it is made.
 */
function failingWrites(how: 'abort' | 'throw'): IndexedDbFactoryLike {
  const bind = (target: object, property: PropertyKey) => {
    const original = Reflect.get(target, property, target)
    return typeof original === 'function' ? original.bind(target) : original
  }
  const settable = {
    set: (target: object, property: PropertyKey, value: unknown) =>
      Reflect.set(target, property, value, target),
  }

  const store = (inner: object, transaction: { abort(): void }) =>
    new Proxy(inner, {
      get(target, property) {
        if (property !== 'put' && property !== 'delete' && property !== 'clear')
          return bind(target, property)
        const original = Reflect.get(target, property, target) as (
          ...args: unknown[]
        ) => EventTarget
        return (...args: unknown[]) => {
          if (how === 'throw') throw new DOMException('refused for the check', 'DataError')
          const request = original.apply(target, args)
          request.addEventListener('success', () => transaction.abort())
          return request
        }
      },
    })
  const transaction = (inner: object) =>
    new Proxy(inner, {
      ...settable,
      get(target, property) {
        if (property !== 'objectStore') return bind(target, property)
        const original = Reflect.get(target, property, target) as (name: string) => object
        return (name: string) => store(original.call(target, name), target as { abort(): void })
      },
    })
  const database = (inner: object) =>
    new Proxy(inner, {
      ...settable,
      get(target, property) {
        if (property !== 'transaction') return bind(target, property)
        const original = Reflect.get(target, property, target) as (...args: unknown[]) => object
        return (...args: unknown[]) => {
          const made = original.apply(target, args)
          return args[1] === 'readwrite' ? transaction(made) : made
        }
      },
    })

  return {
    open(name, version) {
      const request =
        version === undefined ? browser.indexedDB.open(name) : browser.indexedDB.open(name, version)
      return new Proxy(request, {
        ...settable,
        get(target, property) {
          if (property === 'result')
            return database(Reflect.get(target, property, target) as object)
          return bind(target, property)
        },
      }) as unknown as ReturnType<IndexedDbFactoryLike['open']>
    },
  }
}

export async function runIndexedDbChecks(check: Check, expect: Expect, run: string): Promise<void> {
  const name = `browser-check-idb-${run}`

  try {
    await check('keeps values in IndexedDB, and finds them after reopening', async () => {
      const first = indexedDb<unknown>({ database: name })
      await first.set('session', { dc: 2, key: 'material' })
      await first.set('count', 3)
      await first.close()

      const second = indexedDb<unknown>({ database: name })
      const session = (await second.get('session')) as { dc: number; key: string } | undefined
      expect(session?.dc === 2 && session.key === 'material', 'the value did not survive reopening')
      expect((await second.get('count')) === 3, 'a number did not survive reopening')
      await second.close()

      return 'written, closed, reopened over a new connection and read back'
    })

    await check('removes, lists and clears exactly what it is asked to', async () => {
      const store = indexedDb<number>({ database: name, store: 'scoped' })
      const other = indexedDb<number>({ database: name, store: 'neighbour' })
      for (const key of ['a:1', 'a:2', 'ab', 'b:1']) await store.set(key, 1)
      await other.set('a:1', 1)

      await store.delete('a:1')
      expect((await store.get('a:1')) === undefined, 'a removed key is still there')
      expect(
        JSON.stringify(await listed(store, 'a')) === JSON.stringify(['a:2', 'ab']),
        `listed ${JSON.stringify(await listed(store, 'a'))}`,
      )
      await store.clear('a:')
      expect(
        JSON.stringify(await listed(store)) === JSON.stringify(['ab', 'b:1']),
        `left ${JSON.stringify(await listed(store))}`,
      )
      await store.clear()
      expect((await listed(store)).length === 0, 'clear left keys behind')
      expect((await other.get('a:1')) === 1, 'clearing one object store emptied another')
      await store.close()
      await other.close()

      return 'one removal, a prefix cleared, a store emptied, and the neighbouring store untouched'
    })

    await check(
      'applies concurrent writes from two stores in the order they were called',
      async () => {
        const one = indexedDb<number>({ database: name, store: 'ordered' })
        const two = indexedDb<number>({ database: name, store: 'ordered' })
        await one.set('warm', 0)
        await two.set('warm', 0)

        await Promise.all(
          Array.from({ length: 50 }, (_, index) => (index % 2 === 0 ? one : two).set('key', index)),
        )
        const last = await one.get('key')
        expect(last === 49, `the key ended as ${String(last)}`)
        await one.close()
        await two.close()

        return '50 writes over two connections; the last one called is the one kept'
      },
    )

    await check('reports a write only once its transaction has completed', async () => {
      const store = indexedDb<string>({ database: name, store: 'failing' })
      await store.set('k', 'before')
      await store.close()

      let refusal: unknown
      try {
        await indexedDb<string>({
          database: name,
          store: 'failing',
          factory: failingWrites('abort'),
        }).set('k', 'after')
      } catch (error) {
        refusal = error
      }
      expect(refusal instanceof StorageError, `the aborted write ended with ${String(refusal)}`)

      const reread = indexedDb<string>({ database: name, store: 'failing' })
      expect((await reread.get('k')) === 'before', 'an aborted write changed the value')
      await reread.close()

      return `refused: ${(refusal as Error).message.slice(0, 70)}…`
    })

    await check('refuses a request the browser will not make, with its cause', async () => {
      let refusal: unknown
      try {
        await indexedDb<string>({
          database: name,
          store: 'failing',
          factory: failingWrites('throw'),
        }).set('k', 'never')
      } catch (error) {
        refusal = error
      }
      expect(refusal instanceof StorageError, `the refused write ended with ${String(refusal)}`)
      const cause = (refusal as { cause?: { name?: string } }).cause
      expect(cause?.name === 'DataError', `the cause was ${String(cause?.name)}`)

      return 'refused as a StorageError carrying the DataError'
    })

    await check('takes an account’s area through the origin-wide lock, as web() does', async () => {
      const store = indexedDb<unknown>({ database: name, store: 'accounts' })
      const lease = await claimArea(store, { name: 'frank', holder: 'run-one' })
      expect(lease.scope === 'origin', `the claim reports '${lease.scope}'`)
      await lease.storage.set('auth:dc2:key', 'frank-material')

      let refusal: unknown
      try {
        await claimArea(store, { name: 'frank', holder: 'run-two' })
      } catch (error) {
        refusal = error
      }
      expect(refusal instanceof StorageOwnershipError, `a second run was told ${String(refusal)}`)

      const superseded = lease
      const taken = await claimArea(store, { name: 'frank', holder: 'run-three', takeOver: true })
      let late = false
      try {
        await superseded.storage.set('auth:dc2:key', 'too late')
      } catch {
        late = true
      }
      expect(late, 'a superseded run was allowed to write')
      expect(
        (await taken.storage.get('auth:dc2:key')) === 'frank-material',
        'the takeover lost what was stored',
      )
      await taken.release()
      await store.close()

      return 'held across the origin; a second run refused; a superseded run fenced off'
    })
  } finally {
    await remove(name)
  }
}

/**
 * An account whose whole session lives in IndexedDB.
 *
 * A datacenter of its own, so the long-lived key it negotiates is counted
 * apart from the page's other account.
 */
export async function runIndexedDbAccountCheck(
  check: Check,
  expect: Expect,
  setup: AccountSetup,
  run: string,
): Promise<void> {
  const database = `browser-check-idb-account-${run}`
  const client = `idb-${run}`

  const open = () =>
    new Account({
      apiId: 10_000,
      apiHash: 'browser-check',
      name: 'idb-account',
      keys: [serverRsaKey({ n: BigInt(setup.key.n), e: BigInt(setup.key.e) })],
      storage: indexedDb({ database }),
      now: setup.now,
      bootstrap: {
        thisDc: setup.dc,
        testMode: true,
        options: [
          {
            id: setup.dc,
            host: setup.host,
            port: setup.port,
            ipv6: false,
            mediaOnly: false,
            tcpoOnly: false,
            cdn: false,
            static: true,
            thisPortOnly: true,
            secret: undefined,
          },
        ],
      },
      open: (request) => connectWebSocket({ ...request, url: () => setup.socket(client) }),
    })

  const keyOf = async (): Promise<string | undefined> => {
    const store = indexedDb<unknown>({ database })
    const value = await store.get(`${areaFor('idb-account')}auth:dc${setup.dc}:key`)
    await store.close()
    return value === undefined ? undefined : JSON.stringify(value)
  }

  try {
    await check('runs an account whose session is kept in IndexedDB, and resumes it', async () => {
      const first = open()
      await first.connect()
      const answer = (await first.api.call({ _: 'help.getConfig' })) as { _: string }
      await first.stop()
      const stored = await keyOf()
      expect(stored !== undefined, 'the long-lived key was not kept in IndexedDB')

      const second = open()
      await second.connect()
      await second.api.call({ _: 'help.getConfig' })
      await second.stop()

      const seen = await setup.stats(client)
      expect((await keyOf()) === stored, 'the second run replaced the stored long-lived key')
      expect(
        seen.permanentKeys === 1,
        `the datacenter negotiated ${String(seen.permanentKeys)} long-lived keys`,
      )

      return `answered '${answer._}'; stopped; a new run resumed with the stored key and negotiated no other`
    })
  } finally {
    await remove(database)
  }
}
