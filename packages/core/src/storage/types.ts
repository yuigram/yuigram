/**
 * The storage contract.
 *
 * Deliberately small — four required methods — because most users will
 * eventually want an adapter against whatever database they already run, and a
 * large interface makes that a project rather than an afternoon.
 *
 * This serves framework sessions, plugin state and caches. MTProto
 * authorization state uses a different, structured contract: its peer table
 * needs indexed lookup by three keys, and forcing that through a key-value
 * interface would mean rewriting a serialized blob on every update.
 */

/** Options accepted when writing a value. */
export interface SetOptions {
  /** Time to live, in seconds. Omit for no expiry. */
  readonly ttl?: number
}

/**
 * A key-value store.
 *
 * Async throughout, even for the in-memory driver, so swapping a driver never
 * changes calling code.
 */
export interface KV<V = unknown> {
  /** Read a value, or `undefined` when absent or expired. */
  get(key: string): Promise<V | undefined>
  /** Write a value, optionally with a TTL. */
  set(key: string, value: V, options?: SetOptions): Promise<void>
  /** Remove a value. Removing an absent key is not an error. */
  delete(key: string): Promise<void>

  /** Whether a live value exists. Defaults to a `get` when not implemented. */
  has?(key: string): Promise<boolean>
  /** Remove everything, or everything under a prefix. */
  clear?(prefix?: string): Promise<void>
  /** Iterate keys, optionally under a prefix. */
  keys?(prefix?: string): AsyncIterable<string>
}

/** A store that reports whether it can persist across restarts. */
export interface KVInfo {
  /** Human-readable driver name, used in diagnostics. */
  readonly driver: string
  /** False for stores that vanish with the process. */
  readonly persistent: boolean
}

/** A store carrying its own descriptive metadata. */
export type DescribedKV<V = unknown> = KV<V> & { readonly info: KVInfo }
