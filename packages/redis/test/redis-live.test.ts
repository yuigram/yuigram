// SPDX-License-Identifier: MIT

/**
 * The Redis store and counter against a real server.
 *
 * Runs only when `YUIGRAM_TEST_REDIS_URL` names a server this suite may write
 * to; every key goes under a namespace of its own for this run and is cleared
 * afterwards. Otherwise every case is skipped, and says so. This is the evidence
 * a stand-in cannot give: that the script runs on a server, that clients in
 * separate processes contending on one bucket each get a count of their own,
 * and that both common client libraries — which send commands differently —
 * are spoken to correctly.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { limiter, StorageError, StorageOwnershipError } from '@yuigram/core'
import { Redis } from 'ioredis'
import { createClient } from 'redis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HIT_SCRIPT, type RedisClient, redisCounter, redisStore } from '../src/index.js'

const url = process.env['YUIGRAM_TEST_REDIS_URL']
/** The database the application chose: the one the URL names, or 0 where it names none. */
const chosenDatabase = url === undefined ? 0 : Number(new URL(url).pathname.slice(1) || '0')
const namespace = `yuigram-test:${process.pid}:${Date.now()}:`

interface Connected {
  readonly name: string
  readonly client: RedisClient
  ping(): Promise<string>
  close(): Promise<unknown>
}

const clients: Connected[] = []

beforeAll(async () => {
  if (url === undefined) return
  const io = new Redis(url)
  const node = createClient({ url })
  await node.connect()
  clients.push(
    { name: 'ioredis', client: io, ping: () => io.ping(), close: () => io.quit() },
    {
      name: 'node-redis',
      client: node as unknown as RedisClient,
      ping: () => node.ping(),
      close: () => node.quit(),
    },
  )
})

afterAll(async () => {
  const first = clients[0]
  if (first !== undefined) await redisStore(first.client, { namespace }).clear()
  for (const one of clients) await one.close()
})

/** A case run once through each client library. */
const withEach = (run: (one: Connected) => Promise<void>) => async () => {
  expect(clients).toHaveLength(2)
  for (const one of clients) await run(one)
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(url === undefined)('against a real server', () => {
  it(
    'keeps JSON data as given, and lists and clears only its own namespace',
    withEach(async ({ name, client }) => {
      const store = redisStore(client, { namespace: `${namespace}${name}:kv:`, scanCount: 7 })
      const other = redisStore(client, { namespace: `${namespace}${name}:kv-other:` })
      await other.set('k', 'untouched')

      await store.set('a', { count: 1, list: ['x', null], nested: { flag: false }, text: 'é 👍' })
      await store.set('n', null)
      await store.set('glob*[x]', 1)
      for (let index = 0; index < 30; index += 1) await store.set(`many:${index}`, index)

      expect(await store.get('a')).toEqual({
        count: 1,
        list: ['x', null],
        nested: { flag: false },
        text: 'é 👍',
      })
      expect(await store.get('n')).toBeNull()
      expect(await store.has('n')).toBe(true)
      expect(await store.has('missing')).toBe(false)
      expect(await store.get('missing')).toBeUndefined()

      // Thirty keys listed seven at a time: the walk follows the cursor to its end.
      const listed: string[] = []
      for await (const key of store.keys('many:')) listed.push(key)
      expect(listed.sort()).toEqual(Array.from({ length: 30 }, (_, i) => `many:${i}`).sort())

      // A pattern character in a prefix is matched as itself.
      const globbed: string[] = []
      for await (const key of store.keys('glob*')) globbed.push(key)
      expect(globbed).toEqual(['glob*[x]'])

      await store.clear('many:')
      const left: string[] = []
      for await (const key of store.keys()) left.push(key)
      expect(left.sort()).toEqual(['a', 'glob*[x]', 'n'])

      await store.clear()
      expect(await store.has('a')).toBe(false)
      expect(await other.get('k')).toBe('untouched')
      await other.clear()
    }),
  )

  it(
    'lets the server expire an entry, and forgets an expiry on a plain write',
    withEach(async ({ name, client }) => {
      const store = redisStore(client, { namespace: `${namespace}${name}:ttl:` })

      await store.set('brief', 1, { ttl: 0.3 })
      await store.set('kept', 1, { ttl: 0.3 })
      await store.set('kept', 2)
      expect(await store.get('brief')).toBe(1)

      await pause(500)
      expect(await store.get('brief')).toBeUndefined()
      expect(await store.has('brief')).toBe(false)
      expect(await store.get('kept')).toBe(2)
      await store.clear()
    }),
  )

  it(
    'counts refused attempts, tells the time left from the server, and opens a fresh window',
    withEach(async ({ name, client }) => {
      const limits = limiter({
        counter: redisCounter(client, { namespace: `${namespace}${name}:window:` }),
      })
      const rule = { limit: 2, windowMs: 400 }

      const decisions = []
      for (let index = 0; index < 4; index += 1) decisions.push(await limits.hit('u', rule))

      expect(decisions.map((one) => [one.allowed, one.count])).toEqual([
        [true, 1],
        [true, 2],
        [false, 3],
        [false, 4],
      ])
      for (const one of decisions) {
        expect(one.resetMs).toBeGreaterThan(0)
        expect(one.resetMs).toBeLessThanOrEqual(400)
      }
      // The time left falls as the window runs; it is read, not restarted.
      expect(decisions[3]?.resetMs).toBeLessThanOrEqual(decisions[0]?.resetMs ?? 0)

      // Another key and another bucket count apart.
      expect(await limits.hit('v', rule)).toMatchObject({ allowed: true, count: 1 })
      expect(await limits.hit('u', { ...rule, bucket: 'other' })).toMatchObject({ count: 1 })

      await pause(500)
      expect(await limits.hit('u', rule)).toMatchObject({ allowed: true, count: 1 })
    }),
  )

  it(
    'gives a key found without an expiry one, rather than counting it forever',
    withEach(async ({ name, client }) => {
      const key = `${namespace}${name}:repair:stuck`
      const send = (args: string[]) =>
        name === 'ioredis'
          ? (client as unknown as Redis).call(args[0] as string, ...args.slice(1))
          : (client as unknown as { sendCommand(args: string[]): Promise<unknown> }).sendCommand(
              args,
            )
      await send(['SET', key, '41'])
      expect(await send(['PTTL', key])).toBe(-1)

      const counter = redisCounter(client, { namespace: `${namespace}${name}:repair:` })
      const counted = await counter.hit('stuck', 5_000, Date.now())

      expect(counted.count).toBe(42)
      expect(counted.resetMs).toBeGreaterThan(4_000)
      expect(Number(await send(['PTTL', key]))).toBeGreaterThan(4_000)
      expect(HIT_SCRIPT).toContain("redis.call('INCR'")
    }),
  )

  it('lets exactly the limit through when four processes contend on one bucket', async () => {
    const script = fileURLToPath(new URL('./support/contender.mjs', import.meta.url))
    const processes = 4
    const hits = 150
    const limit = 211
    const shared = `${namespace}processes:`
    // Late enough for every process to load and connect before any counts.
    const startAt = Date.now() + 8_000

    type Run = { pid: number; early: boolean; decisions: Array<[number, boolean, number]> }
    const runs = await Promise.all(
      Array.from(
        { length: processes },
        () =>
          new Promise<Run>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [script, url as string, shared, String(hits), String(limit), String(startAt)],
              { stdio: ['ignore', 'pipe', 'pipe'] },
            )
            let out = ''
            let err = ''
            child.stdout.on('data', (chunk: Buffer) => {
              out += chunk.toString()
            })
            child.stderr.on('data', (chunk: Buffer) => {
              err += chunk.toString()
            })
            child.on('error', reject)
            child.on('close', (code) =>
              code === 0
                ? resolve(JSON.parse(out) as Run)
                : reject(new Error(`a contender exited with ${code}: ${err}`)),
            )
          }),
      ),
    )

    const all = runs.flatMap((one) => one.decisions)
    const counts = all.map(([count]) => count).sort((a, b) => a - b)
    expect(new Set(runs.map((one) => one.pid)).size).toBe(processes)
    expect(new Set(runs.map((one) => one.pid)).has(process.pid)).toBe(false)
    // Each was ready before the start, so the counting overlapped.
    expect(runs.map((one) => one.early)).toEqual([true, true, true, true])
    expect(counts).toEqual(Array.from({ length: processes * hits }, (_, index) => index + 1))
    expect(all.filter(([, allowed]) => allowed)).toHaveLength(limit)
    for (const [count, allowed] of all) expect(allowed).toBe(count <= limit)
    // Every process saw the refusals start at the same count.
    for (const run of runs) {
      const first = run.decisions.find(([, allowed]) => !allowed)
      if (first !== undefined) expect(first[0]).toBeGreaterThan(limit)
    }
  }, 60_000)

  it(
    'leases an area to one holder at a time, numbering every grant above the last',
    withEach(async ({ name, client }) => {
      const options = {
        namespace: `${namespace}${name}:leased:`,
        leaseNamespace: `${namespace}${name}:leases:`,
      }
      const first = redisStore(client, options)
      const second = redisStore(client, options)

      const held = await first.lease('accounts:a:', { holder: 'one', ttlMs: 5_000 })
      expect(held?.token).toBe(1)
      expect(await second.lease('accounts:a:', { holder: 'two', ttlMs: 5_000 })).toBeUndefined()
      expect(await second.lease('accounts:b:', { holder: 'two', ttlMs: 5_000 })).toBeDefined()

      await held?.storage.set('auth:2', { key: [1] })
      await held?.storage.set('brief', 1, { ttl: 5 })
      expect(await second.get('accounts:a:auth:2')).toEqual({ key: [1] })
      const listed: string[] = []
      for await (const key of held?.storage.keys?.() ?? []) listed.push(key)
      expect(listed.sort()).toEqual(['auth:2', 'brief'])

      // Leases are kept outside the store: clearing it reaches neither the
      // lease nor its count.
      await second.clear()
      expect(await second.lease('accounts:a:', { holder: 'two', ttlMs: 5_000 })).toBeUndefined()
      await held?.release()
      expect((await second.lease('accounts:a:', { holder: 'two', ttlMs: 5_000 }))?.token).toBe(2)
    }),
  )

  it(
    'refuses a holder whose lease lapsed or was superseded, and leaves the successor’s writes',
    withEach(async ({ name, client }) => {
      const options = {
        namespace: `${namespace}${name}:fenced:`,
        leaseNamespace: `${namespace}${name}:fences:`,
      }
      const store = redisStore(client, options)

      const lapsing = await store.lease('area:', { holder: 'lapsing', ttlMs: 300 })
      await lapsing?.storage.set('state', 'before')
      await pause(400)
      // Nobody else has asked, and the late write is still refused.
      await expect(lapsing?.storage.set('state', 'late')).rejects.toBeInstanceOf(
        StorageOwnershipError,
      )
      expect(await lapsing?.renew()).toBe(false)

      const old = await store.lease('area:', { holder: 'old', ttlMs: 5_000 })
      const next = await store.lease('area:', { holder: 'next', ttlMs: 5_000, steal: true })
      expect([old?.token, next?.token]).toEqual([2, 3])
      await next?.storage.set('state', 'next')

      for (const write of [
        () => old?.storage.set('state', 'old'),
        () => old?.storage.delete('state'),
        () => old?.storage.clear?.(),
      ]) {
        await expect(write()).rejects.toBeInstanceOf(StorageOwnershipError)
      }
      expect(old?.held).toBe(false)
      await old?.release()

      expect(await store.get('area:state')).toBe('next')
      expect(await next?.renew()).toBe(true)
      await next?.release()
    }),
  )

  it('refuses a write already sent when a successor took over before the server ran it', async () => {
    const owner = new Redis(url as string)
    const other = new Redis(url as string)
    const options = {
      namespace: `${namespace}inflight:`,
      leaseNamespace: `${namespace}inflight-leases:`,
    }

    try {
      const lease = await redisStore(owner, options).lease('area:', {
        holder: 'owner',
        ttlMs: 5_000,
      })
      await lease?.storage.set('state', 'owner')

      // The owner's connection is busy for a second, so its next command waits
      // on the server, sent but not yet run.
      const blocked = owner.blpop(`${namespace}inflight-nothing`, 1)
      const write = lease?.storage.set('state', 'in flight').catch((error: unknown) => error)
      await pause(150)

      const successor = await redisStore(other, options).lease('area:', {
        holder: 'successor',
        ttlMs: 5_000,
        steal: true,
      })
      await successor?.storage.set('state', 'successor')
      await blocked

      // Run after the grant, so refused — which it could only be if it ran
      // after, since before the grant the owner's lease was current.
      expect(await write).toBeInstanceOf(StorageOwnershipError)
      expect(await redisStore(other, options).get('area:state')).toBe('successor')
    } finally {
      await owner.quit()
      await other.quit()
    }
  })

  it('reports an unreachable server as a storage error, keeping the client error', async () => {
    const dead = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    })
    const failure = await redisStore(dead)
      .get('a')
      .catch((error: unknown) => error)
    dead.disconnect()

    expect(failure).toBeInstanceOf(StorageError)
    expect((failure as Error).message).toContain("'a'")
    expect((failure as Error).cause).toBeInstanceOf(Error)
  })

  it(
    'never closes, selects on or reconnects a client it was given',
    withEach(async ({ name, client, ping }) => {
      const store = redisStore(client, { namespace: `${namespace}${name}:own:` })
      const counter = redisCounter(client, { namespace: `${namespace}${name}:own-limit:` })
      await store.set('a', 1)
      await counter.hit('x', 1_000, Date.now())
      await store.clear()
      await redisStore(client, { namespace: `${namespace}${name}:own-limit:` }).clear()

      // Still the application's, still open, still on its database.
      expect(await ping()).toBe('PONG')
      const database = await (name === 'ioredis'
        ? (client as unknown as Redis).call('CLIENT', 'INFO')
        : (client as unknown as { sendCommand(args: string[]): Promise<unknown> }).sendCommand([
            'CLIENT',
            'INFO',
          ]))
      expect(String(database)).toContain(` db=${chosenDatabase} `)
    }),
  )
})
