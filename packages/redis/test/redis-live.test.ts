/**
 * The Redis store and counter against a real server.
 *
 * Runs only when `YUIGRAM_TEST_REDIS_URL` names a server this suite may write
 * to — its keys go under a namespace of their own and are cleared afterwards —
 * and a client library, `ioredis` or `redis`, is installed. Otherwise every
 * case is skipped, and says so: this is the evidence the stand-in cannot give,
 * that the script runs and several clients contending on one bucket each get a
 * count of their own.
 */

import { limiter } from '@yuigram/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type RedisClient, redisCounter, redisStore } from '../src/index.js'

const url = process.env['YUIGRAM_TEST_REDIS_URL']

interface Connected {
  readonly client: RedisClient
  close(): Promise<void>
}

/** A connection through whichever client library is installed, or none. */
async function connect(): Promise<Connected | undefined> {
  if (url === undefined) return undefined
  try {
    const { Redis } = (await import('ioredis' as string)) as {
      Redis: new (url: string) => RedisClient & { quit(): Promise<unknown> }
    }
    const client = new Redis(url)
    return { client, close: async () => void (await client.quit()) }
  } catch {
    // Not installed; the other one may be.
  }
  try {
    const { createClient } = (await import('redis' as string)) as {
      createClient: (options: { url: string }) => RedisClient & {
        connect(): Promise<unknown>
        quit(): Promise<unknown>
      }
    }
    const client = createClient({ url })
    await client.connect()
    return { client, close: async () => void (await client.quit()) }
  } catch {
    return undefined
  }
}

const namespace = `yuigram-test:${process.pid}:${Date.now()}:`
const clients: Connected[] = []
let available = false

beforeAll(async () => {
  for (let index = 0; index < 4; index += 1) {
    const connected = await connect()
    if (connected === undefined) return
    clients.push(connected)
  }
  available = true
})

afterAll(async () => {
  if (clients[0] !== undefined) {
    await redisStore(clients[0].client, { namespace }).clear?.()
  }
  for (const connected of clients) await connected.close()
})

describe.skipIf(url === undefined)('against a real server', () => {
  it('keeps, expires and lists values', async () => {
    if (!available)
      return expect.fail('YUIGRAM_TEST_REDIS_URL is set but no client library connected')
    const store = redisStore(clients[0]?.client as RedisClient, { namespace })

    await store.set('a', { kept: true })
    await store.set('brief', 1, { ttl: 1 })
    expect(await store.get('a')).toEqual({ kept: true })

    await new Promise((resolve) => setTimeout(resolve, 1_100))
    expect(await store.get('brief')).toBeUndefined()
  })

  it('lets exactly the limit through when four clients contend on one bucket', async () => {
    if (!available)
      return expect.fail('YUIGRAM_TEST_REDIS_URL is set but no client library connected')
    const limit = 37
    const perClient = 25
    const limiters = clients.map((connected) =>
      limiter({ counter: redisCounter(connected.client, { namespace: `${namespace}limit:` }) }),
    )

    const decisions = await Promise.all(
      limiters.map(async (limits) => {
        const own = []
        for (let index = 0; index < perClient; index += 1) {
          own.push(await limits.hit('user:1', { limit, windowMs: 60_000 }))
        }
        return own
      }),
    )

    const counts = decisions
      .flat()
      .map((one) => one.count)
      .sort((a, b) => a - b)
    expect(counts).toEqual(Array.from({ length: counts.length }, (_, index) => index + 1))
    expect(decisions.flat().filter((one) => one.allowed)).toHaveLength(limit)
  })
})
