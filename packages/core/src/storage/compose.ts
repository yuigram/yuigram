/**
 * Store composition.
 *
 * Adapters are values, so they combine. `namespaced` keeps unrelated consumers
 * from colliding in one store; `tiered` puts a hot in-memory layer over a
 * persistent one, which matters because session reads happen on every update.
 */

import type { DescribedKV, KV, KVInfo, LeasableKV, LeaseOptions, SetOptions } from './types.js'

/** Prefix every key, so several consumers can share one store safely. */
export function namespaced<V>(store: KV<V>, prefix: string): DescribedKV<V> {
  const scope = (key: string): string => `${prefix}${key}`
  const info: KVInfo = { driver: `namespaced(${prefix})`, persistent: true }

  return {
    info,
    get: (key) => store.get(scope(key)),
    set: (key, value, options) => store.set(scope(key), value, options),
    delete: (key) => store.delete(scope(key)),

    has: async (key) =>
      store.has === undefined
        ? (await store.get(scope(key))) !== undefined
        : await store.has(scope(key)),

    clear: async (innerPrefix) => {
      await store.clear?.(scope(innerPrefix ?? ''))
    },

    async *keys(innerPrefix) {
      if (store.keys === undefined) return
      for await (const key of store.keys(scope(innerPrefix ?? ''))) {
        yield key.slice(prefix.length)
      }
    },

    // Passed through where the store has it: an area of an area is still an
    // area of the store underneath, and the lease is that store's to enforce.
    ...(canLease(store)
      ? { lease: (area: string, options: LeaseOptions) => store.lease(scope(area), options) }
      : {}),
  }
}

/**
 * Whether a store can lease areas of itself, fenced by the store.
 *
 * Only a view that adds nothing between the caller and the store passes the
 * capability on: {@link namespaced} does. {@link tiered} and an encrypting
 * store do not, because a lease's writes go straight to the store beneath and
 * would skip the cache or the encryption.
 */
export function canLease<V>(store: KV<V>): store is LeasableKV<V> {
  return typeof (store as Partial<LeasableKV<V>>).lease === 'function'
}

/**
 * Read through a fast store into a durable one.
 *
 * Reads consult the front store first and populate it on a miss. Writes and
 * deletes go to both, so the front never serves a value the back has lost.
 *
 * The front store is a cache: if it is bounded and evicts, correctness is
 * unaffected because a miss falls through.
 */
export function tiered<V>(front: KV<V>, back: KV<V>): DescribedKV<V> {
  const info: KVInfo = { driver: 'tiered', persistent: true }

  return {
    info,

    async get(key) {
      const hit = await front.get(key)
      if (hit !== undefined) return hit

      const value = await back.get(key)
      if (value !== undefined) await front.set(key, value)

      return value
    },

    async set(key, value, options?: SetOptions) {
      // Write the durable store first: a crash between the two then loses a
      // cache entry rather than an acknowledged write.
      await back.set(key, value, options)
      await front.set(key, value, options)
    },

    async delete(key) {
      await back.delete(key)
      await front.delete(key)
    },

    async has(key) {
      if ((await front.get(key)) !== undefined) return true
      return back.has === undefined ? (await back.get(key)) !== undefined : await back.has(key)
    },

    async clear(prefix) {
      await back.clear?.(prefix)
      await front.clear?.(prefix)
    },

    keys: (prefix) => back.keys?.(prefix) ?? emptyAsyncIterable(),
  }
}

/** An async iterable that yields nothing, for stores without key iteration. */
async function* emptyAsyncIterable(): AsyncIterable<string> {
  // Intentionally empty.
}
