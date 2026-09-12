/**
 * Keeping more than one connection to a datacenter, and choosing between them.
 *
 * One connection cannot carry an interactive call and a multi-part file at the
 * same time without one waiting behind the other: a request is answered in the
 * order it was sent, and a megabyte of file ahead of a small call means the
 * small call waits for the megabyte. So connections are kept per datacenter
 * *and per purpose*, and the bulk purposes are allowed several.
 *
 * ```
 *   datacenter 2 ─┬─ main            1 connection    calls and updates
 *                 ├─ upload          up to 8         parts going out
 *                 ├─ download        up to 8         parts coming in
 *                 └─ download-small  up to 2         thumbnails
 * ```
 *
 * Each connection in a pool is a connection in its own right — its own channel,
 * its own session — over the single authorization the datacenter holds. That is
 * what makes several of them free to open: they carry no updates and need no
 * authorization of their own, so nothing is duplicated by having more.
 *
 * **A pool grows only when it is being contended for.** A file fetched one
 * range at a time uses one connection however large the pool is allowed to be:
 * the limit is a ceiling on parallelism, not an amount to reach. A new
 * connection is opened when every one already open is busy and the ceiling has
 * not been reached, and never otherwise.
 *
 * **A pool owns no authorization and no channel.** It chooses between
 * connections and holds nothing else; the connection owns its channel, and the
 * datacenter owns the key. Migration is not its business either — a call that
 * is told the file lives elsewhere is made again against another datacenter,
 * which is another pool, and this one is not consulted about it.
 */

import { CancelledError } from '@yuigram/core'
import type { Connections, ManagedConnection } from './connections.js'
import type { DcPurpose } from './dc.js'

/**
 * What a connection is being kept for.
 *
 * Not the same question as which address to use. An upload and a download both
 * go to a datacenter's media address and must not share a connection, so the
 * purpose a pool is keyed by is finer than the purpose an address is chosen by.
 */
export type PoolPurpose = 'main' | 'upload' | 'download' | 'download-small'

/**
 * How many connections each purpose may hold.
 *
 * Calls and updates take one, because the update stream is a single ordered
 * conversation and a second connection carrying it would be a second opinion
 * about what has happened. The transfer purposes take several so that parts
 * move at once. Small media takes fewer than bulk: a thumbnail is worth a
 * connection but not eight of them.
 *
 * Which allowance a fetch belongs in is decided by arithmetic rather than by a
 * chosen size: a range may not cross a megabyte, so a file no larger than one
 * is a single request and can never occupy more than one connection however
 * many it is allowed. `Account` routes those here; everything else, including
 * a file whose length nobody stated, goes to the bulk allowance.
 */
export const POOL_LIMITS: Readonly<Record<PoolPurpose, number>> = {
  main: 1,
  upload: 8,
  download: 8,
  'download-small': 2,
}

/** Which address a purpose is reached at. */
const ADDRESSES: Readonly<Record<PoolPurpose, DcPurpose>> = {
  main: 'main',
  upload: 'media',
  download: 'media',
  'download-small': 'media',
}

/** Which connection is wanted. */
export interface PoolTarget {
  /** Defaults to the datacenter this client belongs to. */
  readonly id?: number
  /** Defaults to ordinary calls and updates. */
  readonly purpose?: PoolPurpose
}

/** The connections this client keeps, grouped by what they are for. */
export interface Pools {
  /**
   * A connection to use for one call.
   *
   * The least busy of the ones already open, or a new one when they are all
   * busy and the purpose allows another. Synchronous, like the layer beneath
   * it, so two callers arriving together cannot both decide to open the last
   * connection a pool was allowed.
   */
  get(target?: PoolTarget): ManagedConnection
  /** How many connections a pool currently holds. For tests and diagnostics. */
  size(target?: PoolTarget): number
  /** Close every connection in every pool. */
  close(): void
}

/** How the pools are built. */
export interface PoolsOptions {
  /** Where connections come from. */
  readonly connections: Connections
  /**
   * How many connections each purpose may hold.
   *
   * Overriding is for tests and for a caller with a reason. The defaults are
   * the protocol's recommendation rather than a tuning choice.
   */
  readonly limits?: Partial<Readonly<Record<PoolPurpose, number>>>
}

/** Build the pools. Nothing is opened until something is asked for. */
export function openPools(options: PoolsOptions): Pools {
  const limits = { ...POOL_LIMITS, ...options.limits }
  /** Which slots each pool has handed out, so a pool grows by taking the next. */
  const held = new Map<string, ManagedConnection[]>()
  let closed = false

  const nameOf = (target: PoolTarget) => `${target.id ?? 'here'}:${target.purpose ?? 'main'}`

  return {
    get(target = {}) {
      if (closed) throw new CancelledError('the connections have been closed')

      const purpose = target.purpose ?? 'main'
      const name = nameOf(target)
      const pool = held.get(name) ?? []

      // A connection that has been closed is finished, and one that is still
      // in the pool would be handed out for ever. Replacing it in place keeps
      // the slot it was opened under, so the pool does not creep upwards every
      // time a connection is lost and reopened.
      for (const [slot, connection] of pool.entries()) {
        if (connection.state !== 'closed') continue

        pool[slot] = open(options.connections, target, purpose, slot)
      }

      const idle = leastBusy(pool)
      const limit = limits[purpose] ?? 1

      // Grow only under contention. A transfer that asks for one range at a
      // time is one caller however much room the pool has. A pool always ends
      // up with its first connection whatever the ceiling says, because there
      // is nothing to choose between until there is one.
      if (idle !== undefined && (idle.inFlight === 0 || pool.length >= limit)) return idle

      const created = open(options.connections, target, purpose, pool.length)
      pool.push(created)
      held.set(name, pool)

      return created
    },

    size(target = {}) {
      return held.get(nameOf(target))?.length ?? 0
    },

    close() {
      closed = true
      for (const pool of held.values()) {
        for (const connection of pool) connection.close()
      }
      held.clear()
    },
  }
}

/**
 * The connection with the least waiting on it.
 *
 * Ties go to the one opened first, so a pool that is not busy keeps using the
 * connection it already has rather than spreading calls over every connection
 * it has ever opened.
 */
function leastBusy(pool: readonly ManagedConnection[]): ManagedConnection | undefined {
  let best: ManagedConnection | undefined

  for (const connection of pool) {
    if (best === undefined || connection.inFlight < best.inFlight) best = connection
  }

  return best
}

function open(
  connections: Connections,
  target: PoolTarget,
  purpose: PoolPurpose,
  slot: number,
): ManagedConnection {
  return connections.get({
    ...(target.id === undefined ? {} : { id: target.id }),
    purpose: ADDRESSES[purpose],
    // Slots are per pool, and two pools sharing an address must not share a
    // connection — so the slot carries which pool it belongs to.
    slot: slotFor(purpose, slot),
  })
}

/**
 * A slot number that is unique across the purposes sharing one address.
 *
 * Upload and download are both reached at the media address, so numbering each
 * pool from zero would have them handing back the same connection.
 */
function slotFor(purpose: PoolPurpose, slot: number): number {
  return ORDER[purpose] * 1000 + slot
}

const ORDER: Readonly<Record<PoolPurpose, number>> = {
  main: 0,
  upload: 1,
  download: 2,
  'download-small': 3,
}
