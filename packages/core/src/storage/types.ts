// SPDX-License-Identifier: MPL-2.0

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

/** How an area of a store is leased. */
export interface LeaseOptions {
  /** Distinguishes this holder from another; a fresh value per run. */
  readonly holder: string
  /**
   * How long the lease lasts without being renewed, in milliseconds.
   *
   * What bounds recovery from a holder that stopped without releasing: once it
   * passes, the area can be leased again. It is not what keeps a late holder
   * out — the token does that — so a holder paused for longer is refused, not
   * trusted.
   */
  readonly ttlMs: number
  /**
   * Lease the area even while another holder's lease is live.
   *
   * Safe where a store fences, which is the only place this exists: the store
   * refuses every write the superseded holder makes from then on, so it cannot
   * land anything after its successor has begun.
   */
  readonly steal?: boolean
}

/**
 * A lease on the keys under one prefix, enforced by the store itself.
 *
 * Every write through {@link StoreLease.storage} is checked against the lease
 * in the same atomic step as the write, inside the store: a SQLite transaction
 * holding the write lock, a Redis script. That is the difference from a lock
 * held beside a store. A holder that was paused — by a debugger, a stalled
 * disk, a machine asleep — while its lease expired and another took it cannot
 * tell by itself that it is late, and does not have to: its token is no longer
 * the current one, and the store refuses the write.
 */
export interface StoreLease {
  /**
   * Which grant this is. Every lease of an area gets a higher one than the
   * last, and the numbers are never reused, so an older holder's writes can be
   * told from the current one's.
   */
  readonly token: number
  /**
   * The area, with keys relative to its prefix.
   *
   * Reads are answered whoever holds the area. `set`, `delete` and `clear`
   * are refused with `StorageOwnershipError` once this lease has been
   * superseded, released or has expired.
   */
  readonly storage: KV<unknown>
  /**
   * Whether this lease was current the last time the store was asked. False
   * once released, and once a renewal or a write found it superseded.
   */
  readonly held: boolean
  /** Extend the lease by its time to live. False when it is no longer current. */
  renew(): Promise<boolean>
  /** Give the area up, if this lease is still the current one. */
  release(): Promise<void>
}

/**
 * A store that can lease an area of itself to one holder at a time, across
 * every process and machine that reaches the same database.
 *
 * Offered by stores whose backend can check and write in one step. A store
 * without it — a directory of files, `localStorage`, an adapter over a
 * key-value service with no conditional write — cannot fence, and whatever
 * excludes two holders over it has to come from outside it.
 */
export interface LeasableKV<V = unknown> extends KV<V> {
  /** Lease the area under `prefix`, or answer nothing while another holder's lease is live. */
  lease(prefix: string, options: LeaseOptions): Promise<StoreLease | undefined>
}
