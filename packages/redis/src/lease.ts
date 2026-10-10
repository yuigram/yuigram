// SPDX-License-Identifier: MIT

/**
 * Leasing an area of a Redis store to one holder at a time.
 *
 * Two keys per area, outside the store's namespace so that listing and
 * clearing the store never reach them:
 *
 * ```
 *   <leases><namespace><prefix>:owner   "<token>/<holder>"   expires with the lease
 *   <leases><namespace><prefix>:token   the last token granted, never expiring
 * ```
 *
 * A grant is one script — refuse if an owner is set, else count the token up
 * and set the owner — and so is every write through a lease: compare the owner
 * with this holder's, then write. Redis runs a script to completion before any
 * other command, so no grant can land between a holder's check and its write.
 * A holder paused past its lease finds another's owner value, or none, and
 * its write is refused on the server.
 *
 * The token key is never removed, so a grant after a release or an expiry is
 * numbered above every one before it. Every script touches the owner key and
 * the keys it writes together, so a fenced area needs one Redis server — or a
 * primary with its replicas — rather than a cluster, which refuses a script
 * whose keys live on different nodes.
 */

import {
  type KV,
  type LeaseOptions,
  StorageError,
  StorageOwnershipError,
  type StoreLease,
  ValidationError,
} from '@yuigram/core'
import type { RedisSend } from './client.js'

/** A grant: refused while an owner is set, unless it steals. Answers the token, or 0. */
export const LEASE_SCRIPT = `if redis.call('EXISTS', KEYS[1]) == 1 and ARGV[2] ~= '1' then
  return 0
end
local token = redis.call('INCR', KEYS[2])
redis.call('SET', KEYS[1], tostring(token) .. '/' .. ARGV[3], 'PX', ARGV[1])
return token`

/** Extend a lease that is still this holder's. */
const RENEW_SCRIPT = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
end
return 0`

/** Give up a lease that is still this holder's, leaving a successor's alone. */
const RELEASE_SCRIPT = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
end
return 1`

/** Write one entry, if the lease is still this holder's. */
const FENCED_SET_SCRIPT = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if ARGV[3] == '' then
  redis.call('SET', KEYS[2], ARGV[2])
else
  redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
end
return 1`

/** Remove entries, if the lease is still this holder's. */
const FENCED_DELETE_SCRIPT = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if #KEYS > 1 then
  redis.call('UNLINK', unpack(KEYS, 2))
end
return 1`

/** What a lease needs of the store it is taken on. */
export interface LeaseHost {
  readonly send: RedisSend
  /** Where the store's own keys begin. */
  readonly namespace: string
  /** Where lease keys begin. */
  readonly leases: string
  readonly scanCount: number
  /** The store, for reads, which the lease does not fence. */
  readonly store: KV<unknown>
  /** Every full key under a prefix, walked with SCAN. */
  scan(prefix: string): AsyncIterable<string>
  /** JSON text for a value, refused as the store refuses it. */
  encode(key: string, value: unknown): string
  /** Send a command, reporting a failure as the store's. */
  attempt(operation: string, args: readonly string[]): Promise<unknown>
}

/** Lease the area under `prefix`, or answer nothing while another holder's lease is live. */
export async function leaseArea(
  host: LeaseHost,
  prefix: string,
  options: LeaseOptions,
): Promise<StoreLease | undefined> {
  if (typeof options.holder !== 'string' || options.holder.length === 0) {
    throw new ValidationError('a lease names its holder')
  }
  if (!Number.isInteger(options.ttlMs) || options.ttlMs <= 0) {
    throw new ValidationError(
      `a lease lasts a positive whole number of milliseconds, not ${options.ttlMs}`,
    )
  }

  const base = `${host.leases}${host.namespace}${prefix}`
  const owner = `${base}:owner`
  const reply = await host.attempt(`lease '${prefix}'`, [
    'EVAL',
    LEASE_SCRIPT,
    '2',
    owner,
    `${base}:token`,
    String(options.ttlMs),
    options.steal === true ? '1' : '0',
    options.holder,
  ])

  const token = Number(reply)
  if (!Number.isSafeInteger(token) || token < 0) {
    throw new StorageError(
      `Redis answered a lease on '${prefix}' with something other than a token`,
    )
  }
  if (token === 0) return undefined

  const mine = `${token}/${options.holder}`
  let held = true

  const refused = (operation: string): never => {
    held = false
    throw new StorageOwnershipError(
      `the store refused to ${operation}: the lease on '${prefix}' is no longer this ` +
        "holder's — a later one was granted, or it was released or expired — and " +
        'writing now would land in an area another holder may be keeping',
    )
  }

  const fencedDelete = async (operation: string, keys: readonly string[]): Promise<void> => {
    const done = await host.attempt(operation, [
      'EVAL',
      FENCED_DELETE_SCRIPT,
      String(1 + keys.length),
      owner,
      ...keys,
      mine,
    ])
    if (Number(done) !== 1) refused(operation)
  }

  const storage: KV<unknown> = {
    get: (key) => host.store.get(prefix + key),
    has: async (key) => (await host.store.has?.(prefix + key)) ?? false,
    async *keys(inner) {
      for await (const key of host.store.keys?.(prefix + (inner ?? '')) ?? []) {
        yield key.slice(prefix.length)
      }
    },

    async set(key, value, setOptions) {
      const text = host.encode(key, value)
      const ttl = setOptions?.ttl
      if (ttl !== undefined && (!Number.isFinite(ttl) || ttl <= 0)) {
        throw new ValidationError(`a time to live is a positive number of seconds, not ${ttl}`)
      }
      const operation = `write '${key}'`
      const done = await host.attempt(operation, [
        'EVAL',
        FENCED_SET_SCRIPT,
        '2',
        owner,
        host.namespace + prefix + key,
        mine,
        text,
        ttl === undefined ? '' : String(Math.max(1, Math.round(ttl * 1000))),
      ])
      if (Number(done) !== 1) refused(operation)
    },

    async delete(key) {
      await fencedDelete(`delete '${key}'`, [host.namespace + prefix + key])
    },

    async clear(inner) {
      // The walk reads; each removal is fenced. A clear with nothing to remove
      // still asks, so a superseded holder learns it rather than being told
      // nothing happened.
      const batch: string[] = []
      let asked = false
      for await (const key of host.scan(host.namespace + prefix + (inner ?? ''))) {
        batch.push(key)
        if (batch.length >= host.scanCount) {
          await fencedDelete('clear', batch.splice(0))
          asked = true
        }
      }
      if (batch.length > 0 || !asked) await fencedDelete('clear', batch)
    },
  }

  return {
    token,
    storage,
    get held() {
      return held
    },
    async renew() {
      if (!held) return false
      const done = await host.attempt(`renew the lease on '${prefix}'`, [
        'EVAL',
        RENEW_SCRIPT,
        '1',
        owner,
        mine,
        String(options.ttlMs),
      ])
      if (Number(done) !== 1) held = false
      return held
    },
    async release() {
      held = false
      await host.attempt(`release the lease on '${prefix}'`, [
        'EVAL',
        RELEASE_SCRIPT,
        '1',
        owner,
        mine,
      ])
    },
  }
}
