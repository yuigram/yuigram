/**
 * A store over the browser's own key-value storage.
 *
 * What a browser has instead of a directory. `localStorage` is synchronous,
 * origin-scoped, and survives a reload, which is what a session needs: an
 * account whose keys are gone on refresh has to sign in again, and Telegram
 * charges for that in codes sent to a real phone.
 *
 * The interface is asynchronous even though the storage is not, because the
 * contract is, and a store that resolved immediately on one runtime and not on
 * another would let a caller depend on the difference.
 *
 * **What it is not.** A browser gives every origin its own storage and nothing
 * else: anything running on the page can read this, including an injected
 * script. An authorization key kept here is the account — not a token that can
 * be scoped or revoked in isolation — so a script that can read this origin's
 * storage can be the account until the key is revoked. That is a property of
 * the platform rather than of this store, and the alternatives a browser offers
 * have the same property: IndexedDB is origin-scoped and script-readable too.
 * `docs/security.md` §3 says what follows from that and why the answer is not a
 * passphrase kept beside the thing it protects.
 *
 * **One place per origin.** The default prefix is the same for everyone, so
 * `web()` called twice produces two stores over the same place. What keeps two
 * accounts in a page from writing to the same keys is not this store: an
 * account keeps everything inside an area named after it, so two accounts with
 * different names share this store safely, and two with the same name are
 * refused rather than silently merged. A `prefix` still separates this store's
 * keys from whatever else the application keeps at the origin.
 *
 * **Quota.** The limit is a few megabytes per origin and is enforced by
 * throwing. A session is kilobytes, so a program storing only that will never
 * meet it; one storing conversation state might, and finds out here rather than
 * silently losing the write.
 */

import { ConfigError, StorageError } from '../errors/errors.js'
import type { DescribedKV, KVInfo, SetOptions } from './types.js'

/** What the browser offers: the two `Storage` objects, or anything shaped like one. */
export interface WebStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

/** Options for {@link web}. */
export interface WebOptions {
  /**
   * Which storage to use.
   *
   * Defaults to `localStorage`. Pass `sessionStorage` for state that should not
   * outlive the tab, or anything with the same shape to drive the store without
   * a browser.
   */
  readonly storage?: WebStorageLike
  /**
   * What every key this store writes is prefixed with.
   *
   * An origin's storage is shared by everything on the page, so a prefix is
   * what keeps this store's keys apart from whatever else the application
   * keeps there. Defaults to `yuigram:`.
   *
   * A store owns every key that begins with its prefix. One whose prefix
   * begins another store's therefore lists that store's keys and clears them
   * with its own, so stores meant to be separate take prefixes that do not
   * nest: `app:sessions:` and `app:cache:`, not `app:` and `app:cache:`.
   */
  readonly prefix?: string
  /** Clock source, injectable so expiry is testable without waiting. */
  readonly now?: () => number
}

/** What a stored value looks like: the value, and when it stops being valid. */
interface Envelope {
  readonly v: unknown
  readonly e?: number
}

const DEFAULT_PREFIX = 'yuigram:'

/** The runtime's `localStorage`, or a failure naming what is missing. */
function defaultStorage(): WebStorageLike {
  const found = (globalThis as { localStorage?: WebStorageLike }).localStorage

  if (found === undefined) {
    throw new ConfigError('this runtime provides no `localStorage` — pass one, or use `memory()`')
  }

  return found
}

/**
 * A store over the browser's own key-value storage.
 *
 * Composes with the rest of the storage layer: `namespaced(web(), 'accounts')`
 * and `tiered(memory(), web())` both work, because this changes where values
 * live and nothing else.
 */
export function web<V = unknown>(options: WebOptions = {}): DescribedKV<V> {
  const storage = options.storage ?? defaultStorage()
  const prefix = options.prefix ?? DEFAULT_PREFIX
  const now = options.now ?? Date.now

  /** Every key this store owns, as the storage names them. */
  const owned = (): string[] => {
    const found: string[] = []

    // Read by index rather than through `Object.keys`: the storage object
    // exposes its keys as properties too, and anything the page happens to have
    // set on it would arrive alongside the real ones.
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) found.push(key)
    }

    return found
  }

  /** Read an envelope, discarding one that has expired or cannot be read. */
  const envelope = (key: string): Envelope | undefined => {
    const raw = storage.getItem(prefix + key)
    if (raw === null) return undefined

    let parsed: Envelope

    try {
      parsed = JSON.parse(raw) as Envelope
    } catch {
      // Something else wrote under this prefix, or a write was torn. Either
      // way it is not a value this store put there, and reporting it as one
      // would be worse than treating the key as absent.
      storage.removeItem(prefix + key)

      return undefined
    }

    if (parsed.e !== undefined && parsed.e <= now()) {
      storage.removeItem(prefix + key)

      return undefined
    }

    return parsed
  }

  const info: KVInfo = { driver: 'web', persistent: true }

  return {
    info,

    get(key: string): Promise<V | undefined> {
      return Promise.resolve(envelope(key)?.v as V | undefined)
    },

    set(key: string, value: V, setOptions?: SetOptions): Promise<void> {
      const ttl = setOptions?.ttl
      const stored: Envelope =
        ttl === undefined ? { v: value } : { v: value, e: now() + ttl * 1000 }

      try {
        storage.setItem(prefix + key, JSON.stringify(stored))
      } catch (error) {
        // The quota, almost always. Reported rather than swallowed: a write
        // that silently did nothing is a session that silently fails to resume.
        //
        // Rejected rather than thrown, even though the storage underneath is
        // synchronous. The contract is asynchronous, so a caller that handles
        // failure with `.catch` is entitled to see this one — and would not,
        // if the difference between the runtimes leaked out here.
        return Promise.reject(
          new StorageError(`could not store '${key}': ${describe(error)}`, { cause: error }),
        )
      }

      return Promise.resolve()
    },

    delete(key: string): Promise<void> {
      storage.removeItem(prefix + key)

      return Promise.resolve()
    },

    has(key: string): Promise<boolean> {
      return Promise.resolve(envelope(key) !== undefined)
    },

    async *keys(under?: string): AsyncIterable<string> {
      const scope = prefix + (under ?? '')

      for (const key of owned()) {
        if (!key.startsWith(scope)) continue

        const name = key.slice(prefix.length)
        // Expiry is checked on read, so a key whose value has expired is not a
        // key this store has.
        if (envelope(name) !== undefined) yield name
      }
    },

    clear(under?: string): Promise<void> {
      const scope = prefix + (under ?? '')

      for (const key of owned()) {
        if (key.startsWith(scope)) storage.removeItem(key)
      }

      return Promise.resolve()
    },
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
