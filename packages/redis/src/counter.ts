// SPDX-License-Identifier: MPL-2.0

/**
 * Counting rate-limit hits in Redis, one script per hit.
 *
 * A read followed by a write is two commands, and another client's hit can
 * land between them. The script below runs on the server as one step — Redis
 * runs a script to completion before serving any other command — so each hit
 * is told its own count however many clients count one key.
 *
 * ```
 *   INCR key                       count, creating the key at 1
 *   PTTL key                       the time the window has left
 *   no expiry yet?  PEXPIRE key window
 *   → { count, milliseconds left }
 * ```
 *
 * The window is the server's: it opens with the first hit and Redis expires
 * the key when it closes, so clients on machines whose clocks disagree still
 * share one window. A key found without an expiry — written by something
 * other than this script — is given one rather than counting forever.
 */

import { StorageError, ValidationError, type WindowCounter } from '@yuigram/core'
import { type RedisClient, sender } from './client.js'
import { attempt } from './store.js'

/** The script each hit runs. Kept to commands every Redis since 2.6 has. */
export const HIT_SCRIPT = `local count = redis.call('INCR', KEYS[1])
local left = redis.call('PTTL', KEYS[1])
if left < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  left = tonumber(ARGV[1])
end
return { count, left }`

/** Options for {@link redisCounter}. */
export interface RedisCounterOptions {
  /** What every window's key begins with. `yuigram:limit:` unless given. */
  readonly namespace?: string
}

/**
 * An atomic counter for a limiter shared between processes and machines.
 *
 * ```ts
 * const limits = limiter({ counter: redisCounter(client) })
 * ```
 */
export function redisCounter(
  client: RedisClient,
  options: RedisCounterOptions = {},
): WindowCounter {
  const send = sender(client)
  const namespace = options.namespace ?? 'yuigram:limit:'

  if (namespace.length === 0) {
    throw new ValidationError('a Redis counter needs a namespace, so its keys cannot meet others')
  }

  return {
    async hit(key, windowMs) {
      if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new ValidationError(
          `a window lasts a positive number of milliseconds, not ${windowMs}`,
        )
      }

      const reply = await attempt(send, `count a hit for '${key}'`, [
        'EVAL',
        HIT_SCRIPT,
        '1',
        namespace + key,
        String(Math.ceil(windowMs)),
      ])

      if (!Array.isArray(reply) || reply.length !== 2) {
        throw new StorageError(
          `Redis answered the hit on '${key}' with something other than a count`,
        )
      }

      const count = Number(reply[0])
      const left = Number(reply[1])
      if (!Number.isInteger(count) || count < 1 || !Number.isFinite(left)) {
        throw new StorageError(`Redis answered the hit on '${key}' with a count it cannot be`)
      }

      return { count, resetMs: Math.max(0, left) }
    },

    async reset(key) {
      await attempt(send, `reset '${key}'`, ['DEL', namespace + key])
    },
  }
}
