/**
 * In-memory key-value store.
 *
 * Intended for development, tests and ephemeral state. An optional `max`
 * applies least-recently-used eviction, because an unbounded map in a
 * long-running bot is a slow memory leak rather than a cache.
 */

import type { DescribedKV, KVInfo, SetOptions } from './types.js'

interface Entry<V> {
  value: V
  /** Epoch milliseconds at which this expires, or `undefined` for no expiry. */
  expiresAt: number | undefined
}

/** Options for {@link memory}. */
export interface MemoryOptions {
  /** Maximum live entries before least-recently-used eviction. Unbounded by default. */
  readonly max?: number
  /** Clock source, injectable so TTL behaviour is testable without waiting. */
  readonly now?: () => number
}

/**
 * Create an in-memory store.
 *
 * `Map` preserves insertion order, so re-inserting on read is enough to
 * maintain LRU ordering without a second structure.
 */
export function memory<V = unknown>(options: MemoryOptions = {}): DescribedKV<V> {
  const entries = new Map<string, Entry<V>>()
  const max = options.max
  const now = options.now ?? Date.now

  const info: KVInfo = { driver: 'memory', persistent: false }

  /** Read a live entry, dropping it if it has expired. */
  const live = (key: string): Entry<V> | undefined => {
    const entry = entries.get(key)
    if (entry === undefined) return undefined

    if (entry.expiresAt !== undefined && entry.expiresAt <= now()) {
      entries.delete(key)
      return undefined
    }

    return entry
  }

  /** Drop the least recently used entries until within bounds. */
  const evict = (): void => {
    if (max === undefined) return
    while (entries.size > max) {
      const oldest = entries.keys().next()
      if (oldest.done === true) return
      entries.delete(oldest.value)
    }
  }

  return {
    info,

    async get(key) {
      const entry = live(key)
      if (entry === undefined) return undefined

      // Re-insert to mark as most recently used.
      entries.delete(key)
      entries.set(key, entry)

      return entry.value
    },

    async set(key, value, setOptions: SetOptions = {}) {
      entries.delete(key)
      entries.set(key, {
        value,
        expiresAt: setOptions.ttl === undefined ? undefined : now() + setOptions.ttl * 1000,
      })
      evict()
    },

    async delete(key) {
      entries.delete(key)
    },

    async has(key) {
      return live(key) !== undefined
    },

    async clear(prefix) {
      if (prefix === undefined) {
        entries.clear()
        return
      }
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) entries.delete(key)
      }
    },

    async *keys(prefix) {
      for (const key of [...entries.keys()]) {
        if (prefix !== undefined && !key.startsWith(prefix)) continue
        // Re-check liveness: a key may have expired since iteration began.
        if (live(key) === undefined) continue
        yield key
      }
    },
  }
}
