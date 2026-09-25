/**
 * The shared limiter.
 *
 * What it must not do is limit the wrong people: two buckets spending each
 * other's allowance, two transports' users with the same number counted as
 * one, a context naming nobody grouped under an invented key. Each of those is
 * silent — a bot that has stopped answering someone looks like a bot with no
 * handler — so each is asserted directly, next to the window arithmetic and the
 * forms the counter is offered in.
 */

import { describe, expect, it, vi } from 'vitest'
import type { BaseContext } from '../src/context/types.js'
import type { AddressedPeer } from '../src/conversation/identity.js'
import { Dispatcher } from '../src/dispatch/dispatcher.js'
import { CancelledError, ValidationError } from '../src/errors/errors.js'
import { isAsyncFilter } from '../src/filter/define.js'
import { limiter, type RateLimitEntry } from '../src/limit/rate-limit.js'
import { createLogger, silentSink } from '../src/log/logger.js'
import { memory } from '../src/storage/memory.js'

// Stores the limiter makes for itself, with a count of how often each was
// walked, which nothing public reports.
const made = vi.hoisted(() => [] as Array<{ walks: number }>)

vi.mock('../src/storage/memory.js', async (original) => {
  const actual = await original<typeof import('../src/storage/memory.js')>()

  return {
    ...actual,
    memory: (...options: Parameters<typeof actual.memory>) => {
      const store = actual.memory(...options)
      const seen = { walks: 0 }
      made.push(seen)
      // A memory store always lists its keys.
      const keys = store.keys as NonNullable<typeof store.keys>

      return {
        ...store,
        keys: (prefix?: string) => {
          seen.walks += 1
          return keys.call(store, prefix)
        },
      }
    },
  }
})

interface Ctx extends BaseContext {
  readonly sender?: AddressedPeer
  readonly trail: string[]
}

const log = createLogger({ sink: silentSink() })

function ctx(sender: AddressedPeer | undefined, kind = 'message'): Ctx {
  return {
    kind,
    transport: 'test',
    client: { name: 'test' },
    log,
    raw: undefined,
    trail: [],
    ...(sender === undefined ? {} : { sender }),
  }
}

/** A clock that moves only when told to. */
function clock(start = 1_000_000) {
  let at = start
  return {
    now: () => at,
    advance(ms: number) {
      at += ms
    },
  }
}

describe('counting', () => {
  it('allows the allowance, refuses the rest, and counts every attempt', async () => {
    const time = clock()
    const limits = limiter<Ctx>({ now: time.now })
    const rule = { limit: 2, windowMs: 10_000 }

    const decisions = []
    for (let index = 0; index < 4; index += 1) decisions.push(await limits.hit(7, rule))

    expect(decisions.map((one) => [one.allowed, one.count])).toEqual([
      [true, 1],
      [true, 2],
      [false, 3],
      [false, 4],
    ])
    expect(decisions.every((one) => one.key === '7' && one.resetMs === 10_000)).toBe(true)
  })

  it('opens a fresh window once the last one closes, and not a moment before', async () => {
    const time = clock()
    const limits = limiter<Ctx>({ now: time.now })
    const rule = { limit: 1, windowMs: 1_000 }

    expect((await limits.hit('a', rule)).allowed).toBe(true)
    time.advance(999)
    expect(await limits.hit('a', rule)).toMatchObject({ allowed: false, resetMs: 1 })
    time.advance(1)
    expect(await limits.hit('a', rule)).toMatchObject({ allowed: true, count: 1, resetMs: 1_000 })
  })

  it('counts two buckets apart, so one allowance does not spend the other', async () => {
    const limits = limiter<Ctx>({ now: clock().now })

    await limits.hit(7, { limit: 1, windowMs: 60_000, bucket: 'report' })
    expect((await limits.hit(7, { limit: 1, windowMs: 60_000, bucket: 'report' })).allowed).toBe(
      false,
    )
    expect((await limits.hit(7, { limit: 1, windowMs: 60_000 })).allowed).toBe(true)
    expect((await limits.hit(8, { limit: 1, windowMs: 60_000, bucket: 'report' })).allowed).toBe(
      true,
    )
  })

  it('forgets a key in one bucket when reset, and leaves the others', async () => {
    const limits = limiter<Ctx>({ now: clock().now })
    const everything = { limit: 1, windowMs: 60_000 }
    const reports = { ...everything, bucket: 'report' }

    await limits.hit(7, everything)
    await limits.hit(7, reports)
    await limits.reset(7, 'report')

    expect((await limits.hit(7, reports)).allowed).toBe(true)
    expect((await limits.hit(7, everything)).allowed).toBe(false)
  })

  it('counts simultaneous hits one at a time, so none reads a stale count', async () => {
    // A store that answers late is where two unserialised hits would both
    // read the same count and both be allowed.
    const inner = memory<RateLimitEntry>()
    const slow = {
      ...inner,
      // Reads now and answers later, so the answer can be stale by the time
      // it arrives, as a network round trip's can.
      get: async (key: string) => {
        const found = await inner.get(key)
        await new Promise((resolve) => setTimeout(resolve, 1))
        return found
      },
    }
    const limits = limiter<Ctx>({ storage: slow })

    const decisions = await Promise.all(
      Array.from({ length: 5 }, () => limits.hit(7, { limit: 2, windowMs: 60_000 })),
    )

    expect(decisions.map((one) => one.count).sort()).toEqual([1, 2, 3, 4, 5])
    expect(decisions.filter((one) => one.allowed)).toHaveLength(2)
  })

  it('refuses a rule it cannot count by, before counting anything', async () => {
    const limits = limiter<Ctx>()

    await expect(limits.hit(7, { limit: 0, windowMs: 1 })).rejects.toBeInstanceOf(ValidationError)
    await expect(limits.hit(7, { limit: 1.5, windowMs: 1 })).rejects.toBeInstanceOf(ValidationError)
    await expect(limits.hit(7, { limit: 1, windowMs: 0 })).rejects.toBeInstanceOf(ValidationError)
    await expect(limits.hit(7, { limit: 1, windowMs: 1, bucket: 'a:b' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(() => limits.middleware({ limit: 1, windowMs: 1, bucket: '' })).toThrow(ValidationError)
  })
})

describe('the store', () => {
  it('keeps counts in a store two limiters share, as two processes would', async () => {
    const time = clock()
    const shared = memory<RateLimitEntry>({ now: time.now })
    const first = limiter<Ctx>({ storage: shared, now: time.now })
    const second = limiter<Ctx>({ storage: shared, now: time.now })
    const rule = { limit: 2, windowMs: 60_000 }

    await first.hit(7, rule)
    await second.hit(7, rule)

    expect(await second.hit(7, rule)).toMatchObject({ allowed: false, count: 3 })
    expect(await shared.get('default:7')).toEqual({ count: 3, resetAt: time.now() + 60_000 })
  })

  it('writes each record to expire with its window', async () => {
    const writes: Array<[string, number | undefined]> = []
    const inner = memory<RateLimitEntry>()
    const recorded = {
      ...inner,
      set: async (key: string, value: RateLimitEntry, options?: { ttl?: number }) => {
        writes.push([key, options?.ttl])
        await inner.set(key, value, options)
      },
    }
    const limits = limiter<Ctx>({ storage: recorded, now: clock().now })

    await limits.hit(7, { limit: 1, windowMs: 2_500, bucket: 'report' })
    await limits.hit(7, { limit: 1, windowMs: 200 })

    // Rounded up to whole seconds, so a store never forgets a window early.
    expect(writes).toEqual([
      ['report:7', 3],
      ['default:7', 1],
    ])
  })

  it('walks its own store for closed windows once a minute, and never a store it was given', async () => {
    const time = clock()
    const limits = limiter<Ctx>({ now: time.now })
    const store = made.at(-1)
    const rule = { limit: 1, windowMs: 1_000 }

    for (let id = 0; id < 50; id += 1) await limits.hit(id, rule)
    expect(store?.walks).toBe(1)
    time.advance(60_000)
    await limits.hit('later', rule)
    expect(store?.walks).toBe(1)
    time.advance(1)
    await limits.hit('later', rule)
    // Listing a memory store drops what has expired, so each walk forgets
    // every window that closed since the last.
    expect(store?.walks).toBe(2)

    const given = memory<RateLimitEntry>({ now: time.now })
    const walked = { ...given, keys: () => expect.unreachable('a given store is not walked') }
    await limiter<Ctx>({ storage: walked, now: time.now }).hit(7, rule)
  })
})

describe('with a counter', () => {
  /** A counter whose every hit is one step, as a database statement would be. */
  function fakeCounter() {
    const windows = new Map<string, { count: number; resetAt: number }>()
    const calls: Array<[string, number, number]> = []
    return {
      calls,
      windows,
      async hit(key: string, windowMs: number, now: number) {
        calls.push([key, windowMs, now])
        const open = windows.get(key)
        const next =
          open === undefined || open.resetAt <= now
            ? { count: 1, resetAt: now + windowMs }
            : { count: open.count + 1, resetAt: open.resetAt }
        windows.set(key, next)
        return { count: next.count, resetMs: next.resetAt - now }
      },
      async reset(key: string) {
        windows.delete(key)
      },
    }
  }

  it('counts every hit in the counter, by bucket, and decides from what it reports', async () => {
    const counter = fakeCounter()
    const time = clock()
    const limits = limiter<Ctx>({ counter, now: time.now })

    const decisions = []
    for (let index = 0; index < 3; index += 1) {
      decisions.push(await limits.hit(7, { limit: 2, windowMs: 5_000, bucket: 'report' }))
    }

    expect(decisions.map((one) => [one.allowed, one.count, one.resetMs])).toEqual([
      [true, 1, 5_000],
      [true, 2, 5_000],
      [false, 3, 5_000],
    ])
    expect(counter.calls.map(([key, windowMs]) => [key, windowMs])).toEqual([
      ['report:7', 5_000],
      ['report:7', 5_000],
      ['report:7', 5_000],
    ])
    expect(counter.calls.every(([, , now]) => now === time.now())).toBe(true)
  })

  it('forgets a key through the counter, and takes no store beside it', async () => {
    const counter = fakeCounter()
    const limits = limiter<Ctx>({ counter })

    await limits.hit(7, { limit: 1, windowMs: 60_000 })
    await limits.reset(7)
    expect(counter.windows.size).toBe(0)

    expect(() => limiter<Ctx>({ counter, storage: memory<RateLimitEntry>() })).toThrow(
      ValidationError,
    )
  })

  it('passes a counter’s failure to whoever asked for the hit', async () => {
    const limits = limiter<Ctx>({
      counter: {
        hit: async () => {
          throw new Error('connection refused')
        },
        reset: async () => undefined,
      },
    })

    await expect(limits.hit(7, { limit: 1, windowMs: 1 })).rejects.toThrow('connection refused')
  })
})

describe('reading a key from a context', () => {
  it('counts the sender by default, wherever they write', async () => {
    const limits = limiter<Ctx>({ now: clock().now })
    const rule = { limit: 1, windowMs: 60_000 }

    expect(await limits.check(ctx({ id: 7 }), rule)).toMatchObject({ allowed: true, key: '7' })
    expect(await limits.check(ctx({ id: 7 }), rule)).toMatchObject({ allowed: false })
  })

  it('keeps people from two transports apart when their numbers match', async () => {
    const limits = limiter<Ctx>({ now: clock().now })
    const rule = { limit: 1, windowMs: 60_000 }

    await limits.check(ctx({ id: 7 }), rule)
    const account = await limits.check(ctx({ id: 7n, kind: 'user' }), rule)

    expect(account).toMatchObject({ allowed: true, key: 'user:7' })
  })

  it('does not count a context that names nobody', async () => {
    const limits = limiter<Ctx>({ now: clock().now })

    expect(await limits.check(ctx(undefined), { limit: 1, windowMs: 1 })).toBeUndefined()
  })

  it('reads the key the application names instead, when it names one', async () => {
    const limits = limiter<Ctx>({ now: clock().now, key: (context) => context.kind })
    const rule = { limit: 1, windowMs: 60_000 }

    await limits.check(ctx({ id: 1 }, 'callback'), rule)
    expect(await limits.check(ctx({ id: 2 }, 'callback'), rule)).toMatchObject({
      allowed: false,
      key: 'callback',
    })
  })
})

describe('as middleware', () => {
  it('drops what is over the limit and tells the application about each', async () => {
    const limited: Array<[string, number]> = []
    const dispatcher = new Dispatcher<Ctx>()
    dispatcher.use(
      limiter<Ctx>({ now: clock().now }).middleware({
        limit: 1,
        windowMs: 60_000,
        onLimited: (_context, info) => void limited.push([info.key, info.count]),
      }),
    )
    dispatcher.on('message', (context) => void context.trail.push('handled'))

    const contexts = [ctx({ id: 7 }), ctx({ id: 7 }), ctx({ id: 8 }), ctx(undefined)]
    for (const context of contexts) await dispatcher.dispatch(context)

    expect(contexts.map((context) => context.trail.length)).toEqual([1, 0, 1, 1])
    expect(limited).toEqual([['7', 2]])
  })

  it('passes other kinds uncounted when told which kinds it is for', async () => {
    const dispatcher = new Dispatcher<Ctx>()
    dispatcher.use(
      limiter<Ctx>({ now: clock().now }).middleware({
        limit: 1,
        windowMs: 60_000,
        kinds: ['callback'],
      }),
    )
    dispatcher.on(['message', 'callback'], (context) => void context.trail.push('handled'))

    const contexts = [
      ctx({ id: 7 }),
      ctx({ id: 7 }),
      ctx({ id: 7 }, 'callback'),
      ctx({ id: 7 }, 'callback'),
    ]
    for (const context of contexts) await dispatcher.dispatch(context)

    expect(contexts.map((context) => context.trail.length)).toEqual([1, 1, 1, 0])
  })
})

describe('as a filter', () => {
  it('matches while within the allowance, and spends it only where it was asked', async () => {
    const limits = limiter<Ctx>({ now: clock().now })
    const reports = limits.filter({ limit: 1, windowMs: 60_000, bucket: 'report' })
    const dispatcher = new Dispatcher<Ctx>()
    dispatcher.on(reports, (context) => void context.trail.push('report'))
    dispatcher.on('message', (context) => void context.trail.push('message'))

    const first = ctx({ id: 7 })
    const second = ctx({ id: 7 })
    await dispatcher.dispatch(first)
    await dispatcher.dispatch(second)

    expect(isAsyncFilter(reports)).toBe(true)
    expect(reports.name).toBe('rateLimit(1/60000ms, report)')
    expect([first.trail, second.trail]).toEqual([['report', 'message'], ['message']])
    // The filter's bucket is its own: the default allowance was never touched.
    expect((await limits.hit(7, { limit: 1, windowMs: 60_000 })).allowed).toBe(true)
  })

  it('matches a context naming nobody, since there is nobody to hold to the limit', async () => {
    const filter = limiter<Ctx>().filter({ limit: 1, windowMs: 60_000 })

    expect(await filter(ctx(undefined))).toBe(true)
    expect(await filter(ctx(undefined))).toBe(true)
  })

  it('carries its kinds, so the dispatcher can skip it for anything else', () => {
    const filter = limiter<Ctx>().filter({ limit: 1, windowMs: 1, kinds: ['callback'] })

    expect(filter.kinds).toEqual(['callback'])
  })
})

describe('waiting', () => {
  it('waits out a full window and then counts the hit in the next', async () => {
    const time = clock()
    const slept: number[] = []
    const limits = limiter<Ctx>({
      now: time.now,
      sleep: async (ms) => {
        slept.push(ms)
        time.advance(ms)
      },
    })
    const rule = { limit: 1, windowMs: 5_000 }

    expect(await limits.wait(7, rule)).toMatchObject({ allowed: true, count: 1 })
    time.advance(2_000)
    expect(await limits.wait(7, rule)).toMatchObject({ allowed: true, count: 1 })
    expect(slept).toEqual([3_000])
  })

  it('gives up with a cancellation when its signal is aborted', async () => {
    const controller = new AbortController()
    const limits = limiter<Ctx>({
      now: clock().now,
      sleep: async (_ms, signal) => {
        controller.abort()
        if (signal?.aborted === true) throw new CancelledError('the wait was cancelled')
      },
    })
    const rule = { limit: 1, windowMs: 5_000 }

    await limits.hit(7, rule)
    await expect(limits.wait(7, rule, controller.signal)).rejects.toBeInstanceOf(CancelledError)
    await expect(limits.wait(8, rule, controller.signal)).rejects.toBeInstanceOf(CancelledError)
  })

  it('cancels a real wait promptly rather than sleeping the window out', async () => {
    const limits = limiter<Ctx>()
    const rule = { limit: 1, windowMs: 3_600_000 }
    const controller = new AbortController()

    await limits.hit(7, rule)
    const waiting = limits.wait(7, rule, controller.signal)
    setTimeout(() => controller.abort(), 5)

    await expect(waiting).rejects.toBeInstanceOf(CancelledError)
  })
})
