// SPDX-License-Identifier: MPL-2.0

/**
 * What this package needs of a Redis client: a way to send one command.
 *
 * The client is the application's — its connection, its reconnection policy,
 * its cluster or sentinel set-up, its credentials — so this package opens
 * nothing, closes nothing, and depends on no client library. The two common
 * clients each offer a raw command method, under different names, and either
 * can be handed over as it is:
 *
 * ```ts
 * redisStore(createClient())   // node-redis: sendCommand([...args])
 * redisStore(new Redis())      // ioredis: call(command, ...args)
 * redisStore((args) => mine.send(args))  // anything else
 * ```
 */

import { ConfigError } from '@yuigram/core'

/** A client with node-redis's raw command method. */
export interface SendCommandClient {
  sendCommand(args: string[]): Promise<unknown>
}

/** A client with ioredis's raw command method. */
export interface CallClient {
  call(command: string, ...args: string[]): Promise<unknown>
}

/** Sends one command, given as its words, and resolves with the reply. */
export type RedisSend = (args: readonly string[]) => Promise<unknown>

/** Anything this package can send commands through. */
export type RedisClient = SendCommandClient | CallClient | RedisSend

/** The one method this package uses, whichever client provides it. */
export function sender(client: RedisClient): RedisSend {
  if (typeof client === 'function') return client

  // `call` first: ioredis has it, and also has a `sendCommand` of its own that
  // takes a prepared command object rather than the words of one, so reading
  // the shape in the other order would send ioredis something it cannot take.
  if (typeof (client as Partial<CallClient>).call === 'function') {
    const commander = client as CallClient
    return ([command, ...args]) => commander.call(command as string, ...args)
  }

  if (typeof (client as Partial<SendCommandClient>).sendCommand === 'function') {
    const commander = client as SendCommandClient
    return (args) => commander.sendCommand([...args])
  }

  throw new ConfigError(
    'a Redis client needs sendCommand(args) or call(command, ...args); pass a function that sends a command otherwise',
  )
}

/**
 * A prefix written into a SCAN pattern as itself.
 *
 * `*`, `?`, `[` and `\` are pattern syntax, so a namespace containing them
 * would otherwise match keys outside it — and clearing it would delete them.
 */
export function literalPattern(prefix: string): string {
  return prefix.replace(/[*?[\]\\]/g, (character) => `\\${character}`)
}
