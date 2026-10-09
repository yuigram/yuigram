// SPDX-License-Identifier: MPL-2.0

/**
 * The key-value contract over Redis.
 *
 * One Redis string per key, holding the value as JSON, under a namespace that
 * every key this store reads, writes, lists or clears begins with. A time to
 * live is Redis's own expiry, so an entry disappears on the server's clock and
 * nothing here sweeps.
 *
 * Each operation is one command, and so atomic by itself. Listing and clearing
 * walk the namespace with SCAN rather than KEYS, which would stop the server
 * for as long as it took on a large database; a walk that runs while other
 * clients write may see a key twice or miss one written after it began, and
 * both are said by Redis's own contract for SCAN.
 *
 * An area of the store can also be leased to one holder at a time across
 * every client of the server, with each write through the lease checked on the
 * server in the same script that makes it; `lease.ts` says how. That is what an
 * MTProto account keeping its state here uses to stay the only run writing it.
 */

import {
  type DescribedKV,
  type KVInfo,
  type LeasableKV,
  StorageError,
  ValidationError,
} from '@yuigram/core'
import { literalPattern, type RedisClient, type RedisSend, sender } from './client.js'
import { leaseArea } from './lease.js'

/** Options for {@link redisStore}. */
export interface RedisStoreOptions {
  /**
   * What every key begins with. `yuigram:kv:` unless given.
   *
   * Two stores with different namespaces on one database never see each
   * other's keys, and clearing one leaves the other alone — which is the whole
   * of how a database shared with other software stays shared.
   */
  readonly namespace?: string
  /** How many keys a SCAN step asks for while listing or clearing. 500 unless given. */
  readonly scanCount?: number
  /**
   * What the keys recording leases on areas of this store begin with.
   * `yuigram:lease:` unless given.
   *
   * Kept apart from `namespace`, so that listing or clearing the store never
   * reaches a lease — clearing one would let a token be granted twice.
   */
  readonly leaseNamespace?: string
}

/** A store over Redis, with every optional operation of the contract. */
export interface RedisStore<V = unknown> extends DescribedKV<V>, LeasableKV<V> {
  has(key: string): Promise<boolean>
  clear(prefix?: string): Promise<void>
  keys(prefix?: string): AsyncIterable<string>
}

/**
 * A key-value store kept in Redis.
 *
 * ```ts
 * import { Redis } from 'ioredis'
 *
 * const sessions = redisStore<Cart>(new Redis(process.env.REDIS_URL), { namespace: 'bot:sessions:' })
 * ```
 *
 * The client stays the application's: this never connects, disconnects or
 * selects a database on it.
 */
export function redisStore<V = unknown>(
  client: RedisClient,
  options: RedisStoreOptions = {},
): RedisStore<V> {
  const send = sender(client)
  const namespace = options.namespace ?? 'yuigram:kv:'
  const scanCount = options.scanCount ?? 500
  const leases = options.leaseNamespace ?? 'yuigram:lease:'
  const info: KVInfo = { driver: 'redis', persistent: true }

  if (namespace.length === 0) {
    // An empty namespace makes `clear()` a walk over the whole database.
    throw new ValidationError(
      'a Redis store needs a namespace, so clearing it cannot reach other keys',
    )
  }
  if (!Number.isInteger(scanCount) || scanCount < 1) {
    throw new ValidationError(`a SCAN count is a positive whole number, not ${scanCount}`)
  }
  if (leases.length === 0 || leases.startsWith(namespace) || namespace.startsWith(leases)) {
    // Overlapping, clearing the store could remove a token and let it be
    // granted again.
    throw new ValidationError(
      `a Redis store's lease namespace is non-empty and apart from its namespace, not '${leases}'`,
    )
  }

  const at = (key: string): string => namespace + key

  const store: RedisStore<V> = {
    info,

    async get(key) {
      const reply = await attempt(send, `read '${key}'`, ['GET', at(key)])
      if (reply === null || reply === undefined) return undefined
      if (typeof reply !== 'string' && !(reply instanceof Uint8Array)) {
        throw new StorageError(`Redis answered a read of '${key}' with something other than text`)
      }

      const text = typeof reply === 'string' ? reply : new TextDecoder().decode(reply)
      try {
        return JSON.parse(text) as V
      } catch (error) {
        throw new StorageError(`the value stored for '${key}' is not JSON`, { cause: error })
      }
    },

    async set(key, value, setOptions) {
      const text = encode(key, value)
      const ttl = setOptions?.ttl
      if (ttl === undefined) {
        // A plain SET also drops any expiry the key had, which is what a write
        // without a time to live means everywhere else.
        await attempt(send, `write '${key}'`, ['SET', at(key), text])
        return
      }
      if (!Number.isFinite(ttl) || ttl <= 0) {
        throw new ValidationError(`a time to live is a positive number of seconds, not ${ttl}`)
      }
      await attempt(send, `write '${key}'`, [
        'SET',
        at(key),
        text,
        'PX',
        String(Math.max(1, Math.round(ttl * 1000))),
      ])
    },

    async delete(key) {
      await attempt(send, `delete '${key}'`, ['DEL', at(key)])
    },

    async has(key) {
      const reply = await attempt(send, `read '${key}'`, ['EXISTS', at(key)])
      return Number(reply) > 0
    },

    async clear(prefix) {
      const batch: string[] = []
      for await (const key of scan(send, at(prefix ?? ''), scanCount)) {
        batch.push(key)
        if (batch.length >= scanCount) {
          await attempt(send, 'clear', ['UNLINK', ...batch.splice(0)])
        }
      }
      if (batch.length > 0) await attempt(send, 'clear', ['UNLINK', ...batch])
    },

    async *keys(prefix) {
      const seen = new Set<string>()
      for await (const key of scan(send, at(prefix ?? ''), scanCount)) {
        // SCAN may return a key more than once; a listing returns it once.
        if (seen.has(key)) continue
        seen.add(key)
        yield key.slice(namespace.length)
      }
    },

    lease: (prefix, leaseOptions) =>
      leaseArea(
        {
          send,
          namespace,
          leases,
          scanCount,
          store,
          scan: (full) => scan(send, full, scanCount),
          encode,
          attempt: (operation, args) => attempt(send, operation, args),
        },
        prefix,
        leaseOptions,
      ),
  }

  return store
}

/** Every key beginning with `prefix`, walked with SCAN. */
async function* scan(send: RedisSend, prefix: string, count: number): AsyncGenerator<string> {
  let cursor = '0'
  const pattern = `${literalPattern(prefix)}*`

  do {
    const reply = await attempt(send, 'list keys', [
      'SCAN',
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      String(count),
    ])
    if (!Array.isArray(reply) || reply.length !== 2 || !Array.isArray(reply[1])) {
      throw new StorageError('Redis answered SCAN with something other than a cursor and keys')
    }
    cursor = String(reply[0])
    for (const key of reply[1] as unknown[]) {
      const text = typeof key === 'string' ? key : new TextDecoder().decode(key as Uint8Array)
      // MATCH is a pattern and the prefix was escaped for it; this is the
      // plain comparison that decides, in case a server matched loosely.
      if (text.startsWith(prefix)) yield text
    }
  } while (cursor !== '0')
}

/** JSON text for a value, or a refusal naming the key and never the value. */
function encode(key: string, value: unknown): string {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch (error) {
    throw new StorageError(`the value for '${key}' is not JSON data, so it cannot be stored`, {
      cause: error,
    })
  }
  if (text === undefined) {
    throw new StorageError(
      `the value for '${key}' is undefined, which a store cannot hold; delete the key instead`,
    )
  }
  return text
}

/**
 * Send a command, reporting a failure as the store's.
 *
 * The client's error is kept as the cause — its message says whether the
 * server was unreachable, read-only or out of memory — and the message says
 * what the store was doing. Neither quotes a value.
 */
export async function attempt(
  send: RedisSend,
  operation: string,
  args: readonly string[],
): Promise<unknown> {
  try {
    return await send(args)
  } catch (error) {
    throw new StorageError(`Redis could not ${operation}`, { cause: error })
  }
}
