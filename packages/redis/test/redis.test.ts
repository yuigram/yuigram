// SPDX-License-Identifier: MPL-2.0

/**
 * The Redis store and counter, against a stand-in server.
 *
 * What these establish is the adapter's side of the contract: the commands it
 * sends, how it reads the replies, that a namespace is a boundary no operation
 * crosses, and that every failure reaches the caller as the store's error with
 * the client's as its cause. Both client shapes are driven. That the script
 * runs on a real server is `redis-live.test.ts`, which needs one.
 */

import { limiter, StorageError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { HIT_SCRIPT, redisCounter, redisStore } from '../src/index.js'
import { FakeRedis } from './support/fake-redis.js'

/** Every key a listing yields, in order, duplicates included. */
async function collect(keys: AsyncIterable<string> | undefined): Promise<string[]> {
  const all: string[] = []
  for await (const key of keys ?? []) all.push(key)
  return all.sort()
}

describe('the key-value contract', () => {
  it('reads back what it was given through either client shape', async () => {
    const server = new FakeRedis()

    for (const client of [
      server.nodeRedis,
      server.ioredis,
      (args: readonly string[]) => server.send(args),
    ]) {
      const store = redisStore(client)
      await store.set('a', { count: 1, list: ['x', null] })
      await store.set('n', null)

      expect(await store.get('a')).toEqual({ count: 1, list: ['x', null] })
      expect(await store.get('n')).toBeNull()
      expect(await store.has('n')).toBe(true)
      expect(await store.get('missing')).toBeUndefined()

      await store.delete('a')
      expect(await store.has('a')).toBe(false)
    }
    expect(server.commands.some(([command]) => command === 'KEYS' || command === 'FLUSHDB')).toBe(
      false,
    )
  })

  it('writes under its namespace and never outside it', async () => {
    const server = new FakeRedis()
    server.plant('other:app', 'theirs')
    const sessions = redisStore(server.ioredis, { namespace: 'bot:sessions:' })
    const cache = redisStore(server.ioredis, { namespace: 'bot:cache:' })

    await sessions.set('k', 1)
    await cache.set('k', 2)
    expect(server.keys).toEqual(['bot:cache:k', 'bot:sessions:k', 'other:app'])

    await sessions.clear?.()
    expect(server.keys).toEqual(['bot:cache:k', 'other:app'])
    expect(await cache.get('k')).toBe(2)
  })

  it('lists and clears by prefix, reading pattern characters in a prefix as themselves', async () => {
    const server = new FakeRedis()
    const store = redisStore(server.nodeRedis, { namespace: 'n[1]*:', scanCount: 2 })
    for (const key of ['a*1', 'a*2', 'ab', 'a?', 'b']) await store.set(key, key)
    server.plant('n1x:a*1', 'outside the namespace, matched by the unescaped pattern')

    expect(await collect(store.keys?.('a*'))).toEqual(['a*1', 'a*2'])
    expect(await collect(store.keys?.())).toEqual(['a*1', 'a*2', 'a?', 'ab', 'b'])

    await store.clear?.('a*')
    expect(await collect(store.keys?.())).toEqual(['a?', 'ab', 'b'])
    expect(server.keys).toContain('n1x:a*1')
  })

  it('lists a key once when SCAN returns it twice, and never a key outside its namespace', async () => {
    const server = new FakeRedis()
    server.repeatsKeys = true
    server.matchesLoosely = true
    const store = redisStore(server.ioredis, { namespace: 'n[1]:', scanCount: 2 })
    for (const key of ['a', 'b', 'c', 'd', 'e']) await store.set(key, key)
    server.plant('n1:a', 'another namespace, returned by a server that ignores the pattern')

    expect(await collect(store.keys?.())).toEqual(['a', 'b', 'c', 'd', 'e'])

    await store.clear?.()
    expect(server.keys).toEqual(['n1:a'])
  })

  it('sends through call when a client has both shapes, as ioredis does', async () => {
    const server = new FakeRedis()
    // ioredis's own sendCommand takes a prepared command object, not words.
    const both = {
      call: server.ioredis.call,
      sendCommand: () => {
        throw new TypeError('command.setReplyContext is not a function')
      },
    }

    await redisStore(both).set('a', 1)
    expect(await redisStore(both).get('a')).toBe(1)
  })

  it('names itself as a persistent Redis store, and refuses an empty namespace', () => {
    const server = new FakeRedis()

    expect(redisStore(server.ioredis).info).toEqual({ driver: 'redis', persistent: true })
    expect(() => redisStore(server.ioredis, { namespace: '' })).toThrow(ValidationError)
    expect(() => redisStore({} as never)).toThrow(/sendCommand|call/)
  })
})

describe('expiry', () => {
  it('hands a time to live to the server in milliseconds, and a plain write drops it', async () => {
    const server = new FakeRedis()
    const store = redisStore(server.ioredis)

    await store.set('brief', 'x', { ttl: 1.5 })
    expect(server.commands.at(-1)).toEqual(['SET', 'yuigram:kv:brief', '"x"', 'PX', '1500'])

    server.advance(1_499)
    expect(await store.get('brief')).toBe('x')
    server.advance(1)
    expect(await store.get('brief')).toBeUndefined()

    await store.set('kept', 'y', { ttl: 1 })
    await store.set('kept', 'y')
    server.advance(10_000)
    expect(await store.get('kept')).toBe('y')

    await expect(store.set('bad', 1, { ttl: 0 })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('what cannot be stored, and what fails', () => {
  it('refuses a value that is not JSON data without quoting it, and sends nothing', async () => {
    const server = new FakeRedis()
    const store = redisStore(server.ioredis)

    const failure = await store.set('secret', { key: 5n }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(StorageError)
    expect((failure as Error).message).not.toContain('5')
    await expect(store.set('u', undefined)).rejects.toThrow(/delete the key instead/)
    expect(server.commands).toEqual([])
  })

  it('reports a client failure as the store’s, with the client’s error as the cause', async () => {
    const server = new FakeRedis()
    const store = redisStore(server.nodeRedis)
    server.failNext = new Error('connect ECONNREFUSED 127.0.0.1:6379')

    const failure = await store.get('a').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(StorageError)
    expect((failure as Error).message).toBe("Redis could not read 'a'")
    expect(((failure as Error).cause as Error).message).toMatch(/ECONNREFUSED/)
  })

  it('refuses a stored value that is not JSON rather than handing it back', async () => {
    const server = new FakeRedis()
    server.plant('yuigram:kv:bad', 'not json')

    await expect(redisStore(server.ioredis).get('bad')).rejects.toThrow(/is not JSON/)
  })
})

describe('the counter', () => {
  it('counts in one script per hit, on the server’s window, and counts refusals too', async () => {
    const server = new FakeRedis()
    const limits = limiter({ counter: redisCounter(server.ioredis) })
    const rule = { limit: 2, windowMs: 10_000, bucket: 'report' }

    const decisions = []
    for (let index = 0; index < 3; index += 1) {
      decisions.push(await limits.hit('user:1', rule))
      server.advance(1_000)
    }

    expect(decisions.map((one) => [one.allowed, one.count, one.resetMs])).toEqual([
      [true, 1, 10_000],
      [true, 2, 9_000],
      [false, 3, 8_000],
    ])
    expect(
      server.commands.map(([command, script, keys, key]) => [
        command,
        script === HIT_SCRIPT,
        keys,
        key,
      ]),
    ).toEqual([
      ['EVAL', true, '1', 'yuigram:limit:report:user:1'],
      ['EVAL', true, '1', 'yuigram:limit:report:user:1'],
      ['EVAL', true, '1', 'yuigram:limit:report:user:1'],
    ])

    server.advance(7_000)
    expect(await limits.hit('user:1', rule)).toMatchObject({ allowed: true, count: 1 })
  })

  it('gives a key left without an expiry one, rather than counting forever', async () => {
    const server = new FakeRedis()
    server.plant('yuigram:limit:stuck', '41')

    expect(await redisCounter(server.nodeRedis).hit('stuck', 5_000, 0)).toEqual({
      count: 42,
      resetMs: 5_000,
    })
    server.advance(5_000)
    expect(server.keys).toEqual([])
  })

  it('counts one window for two clients of one server, and forgets it on reset', async () => {
    const server = new FakeRedis()
    const one = redisCounter(server.ioredis)
    const two = redisCounter(server.nodeRedis)

    const counts = []
    for (let index = 0; index < 4; index += 1) {
      counts.push((await (index % 2 === 0 ? one : two).hit('k', 1_000, 0)).count)
    }
    expect(counts).toEqual([1, 2, 3, 4])

    await two.reset('k')
    expect((await one.hit('k', 1_000, 0)).count).toBe(1)
  })

  it('reports a failure or an unreadable reply as a storage error', async () => {
    const server = new FakeRedis()
    const counter = redisCounter(server.ioredis)
    server.failNext = new Error('NOSCRIPT or worse')

    await expect(counter.hit('k', 1_000, 0)).rejects.toBeInstanceOf(StorageError)
    await expect(redisCounter(async () => 'OK').hit('k', 1_000, 0)).rejects.toThrow(
      /something other than a count/,
    )
    await expect(redisCounter(async () => [0, 5]).hit('k', 1_000, 0)).rejects.toThrow(
      /a count it cannot be/,
    )
    await expect(counter.hit('k', 0, 0)).rejects.toBeInstanceOf(ValidationError)
  })
})
