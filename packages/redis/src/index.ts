// SPDX-License-Identifier: MPL-2.0

/**
 * Redis storage for Yuigram.
 *
 * A key-value store under a namespace, serving sessions, conversation state,
 * caches and an account's own state, and an atomic counter for rate limits
 * shared between processes and machines. Both send commands through a client
 * the application supplies — node-redis, ioredis, or a function — so this
 * package opens no connection and installs no client library.
 */

export type {
  CallClient,
  RedisClient,
  RedisSend,
  SendCommandClient,
} from './client.js'
export { HIT_SCRIPT, type RedisCounterOptions, redisCounter } from './counter.js'
export { LEASE_SCRIPT } from './lease.js'
export { type RedisStore, type RedisStoreOptions, redisStore } from './store.js'
