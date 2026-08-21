/**
 * Outbound throttling.
 *
 * A throttle that is merely "roughly right" is worse than none: it slows every
 * bot down and still floods on the burst that matters. So the pacing is checked
 * against a controlled clock rather than by timing real waits, and the failure
 * modes are checked one by one — a wedged bucket, an unfair wake order, a
 * window kept alive for a chat the bot stopped talking to.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiCall } from '../src/api.js'
import { Bot } from '../src/bot.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'
import {
  createWindow,
  DEFAULT_EXCLUDED_METHODS,
  ThrottledError,
  throttle,
} from '../src/throttle.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

/** A call, as the hook sees one. */
function call(method: string, params: Record<string, unknown> = {}): ApiCall {
  return { method, params, options: undefined, attempt: 0 }
}

describe('the window primitive', () => {
  it('admits up to the limit, then waits for the oldest to expire', () => {
    const window = createWindow(2, 1_000)

    expect(window.delay(0)).toBe(0)
    window.record(0)
    expect(window.delay(0)).toBe(0)
    window.record(0)

    // Full: the next slot frees when the first stamp leaves the window.
    expect(window.delay(0)).toBe(1_000)
    expect(window.delay(400)).toBe(600)
    expect(window.delay(1_000)).toBe(0)
  })

  it('drops expired stamps and reports whether it is still in use', () => {
    const window = createWindow(1, 1_000)
    window.record(0)

    expect(window.prune(500)).toBe(true)
    expect(window.prune(1_500)).toBe(false)
  })
})

describe('pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets the first calls straight through', async () => {
    const paced = throttle({ globalPerSecond: 3 })
    const seen: number[] = []

    const calls = [0, 1, 2].map((index) =>
      paced.hook(call('sendMessage'), async () => {
        seen.push(index)
        return undefined
      }),
    )

    await vi.advanceTimersByTimeAsync(0)
    await Promise.all(calls)

    expect(seen).toHaveLength(3)
  })

  it('holds the one that would exceed the global limit', async () => {
    const paced = throttle({ globalPerSecond: 2, chatPerSecond: 100 })
    const seen: string[] = []

    const run = (name: string): Promise<unknown> =>
      paced.hook(call('sendMessage'), async () => {
        seen.push(name)
        return undefined
      })

    const all = Promise.all([run('a'), run('b'), run('c')])

    await vi.advanceTimersByTimeAsync(10)
    expect(seen).toEqual(['a', 'b'])

    await vi.advanceTimersByTimeAsync(1_000)
    await all
    expect(seen).toEqual(['a', 'b', 'c'])
  })

  it('paces a chat at one a second by default', async () => {
    const paced = throttle({ globalPerSecond: 100 })
    const seen: string[] = []

    const run = (name: string): Promise<unknown> =>
      paced.hook(call('sendMessage', { chat_id: 42 }), async () => {
        seen.push(name)
        return undefined
      })

    const all = Promise.all([run('a'), run('b')])

    await vi.advanceTimersByTimeAsync(10)
    expect(seen).toEqual(['a'])

    await vi.advanceTimersByTimeAsync(1_000)
    await all
    expect(seen).toEqual(['a', 'b'])
  })

  it('keeps one chat from delaying another', async () => {
    // The reason buckets exist: a slow conversation must not hold up a fast
    // one, and a broadcast must not serialise on a single window.
    const paced = throttle({ globalPerSecond: 100 })
    const seen: number[] = []

    const all = Promise.all(
      [1, 2, 3].map((chat) =>
        paced.hook(call('sendMessage', { chat_id: chat }), async () => {
          seen.push(chat)
          return undefined
        }),
      ),
    )

    await vi.advanceTimersByTimeAsync(10)
    await all

    expect(seen).toHaveLength(3)
  })

  it('paces a group by the minute, as Telegram does', async () => {
    const paced = throttle({ globalPerSecond: 100, groupPerMinute: 2 })
    const seen: string[] = []

    const run = (name: string): Promise<unknown> =>
      paced.hook(call('sendMessage', { chat_id: -100 }), async () => {
        seen.push(name)
        return undefined
      })

    const all = Promise.all([run('a'), run('b'), run('c')])

    await vi.advanceTimersByTimeAsync(1_000)
    expect(seen).toEqual(['a', 'b'])

    await vi.advanceTimersByTimeAsync(60_000)
    await all
    expect(seen).toEqual(['a', 'b', 'c'])
  })

  it('wakes callers in the order they arrived', async () => {
    // Without a queue everything parked on one chat wakes together, races, and
    // one caller starves — which arrives as "this user's message is always
    // last".
    const paced = throttle({ globalPerSecond: 100, chatPerSecond: 1 })
    const seen: number[] = []

    const all = Promise.all(
      [0, 1, 2, 3].map((index) =>
        paced.hook(call('sendMessage', { chat_id: 7 }), async () => {
          seen.push(index)
          return undefined
        }),
      ),
    )

    await vi.advanceTimersByTimeAsync(5_000)
    await all

    expect(seen).toEqual([0, 1, 2, 3])
  })

  it('gives a method with its own limits its own bucket', async () => {
    const paced = throttle({
      globalPerSecond: 100,
      chatPerSecond: 1,
      perMethod: { sendChatAction: { chatPerSecond: 10 } },
    })
    const seen: string[] = []

    const all = Promise.all([
      paced.hook(call('sendMessage', { chat_id: 5 }), async () => {
        seen.push('message')
        return undefined
      }),
      paced.hook(call('sendChatAction', { chat_id: 5 }), async () => {
        seen.push('action')
        return undefined
      }),
      paced.hook(call('sendChatAction', { chat_id: 5 }), async () => {
        seen.push('action')
        return undefined
      }),
    ])

    await vi.advanceTimersByTimeAsync(10)
    await all

    // The action's own window admits both immediately; sharing the message
    // bucket would have held the second one for a second.
    expect(seen).toEqual(['message', 'action', 'action'])
  })
})

describe('exclusions', () => {
  it('never throttles the bot reading its own updates', async () => {
    // Throttling `getUpdates` throttles intake, which is the one thing that
    // must not queue behind a broadcast.
    expect(DEFAULT_EXCLUDED_METHODS).toContain('getUpdates')

    const paced = throttle({ globalPerSecond: 1 })
    let ran = 0

    await Promise.all(
      [0, 1, 2].map(() =>
        paced.hook(call('getUpdates'), async () => {
          ran += 1
          return undefined
        }),
      ),
    )

    expect(ran).toBe(3)
  })

  it('takes an exclusion list of its own', async () => {
    const paced = throttle({ globalPerSecond: 1, exclude: ['sendMessage'] })
    let ran = 0

    await Promise.all(
      [0, 1].map(() =>
        paced.hook(call('sendMessage'), async () => {
          ran += 1
          return undefined
        }),
      ),
    )

    expect(ran).toBe(2)
  })
})

describe('backpressure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops rather than queues when told to, naming the bucket', async () => {
    const paced = throttle({ globalPerSecond: 1, maxQueue: 1, mode: 'drop' })

    const first = paced.hook(call('sendMessage'), async () => undefined)
    const second = paced.hook(call('sendMessage'), async () => undefined)

    // The assertion is attached before the clock moves: the rejection happens
    // as the call is made, and a promise left unhandled across a tick is an
    // unhandled rejection rather than a test failure.
    const third = expect(
      paced.hook(call('sendMessage'), async () => undefined),
    ).rejects.toMatchObject({ method: 'sendMessage', bucket: 'global' })

    await vi.advanceTimersByTimeAsync(2_000)
    await third
    await Promise.all([first, second])

    expect(new ThrottledError('sendMessage', 'global', 2)).toBeInstanceOf(ThrottledError)
  })

  it('queues patiently by default', async () => {
    const paced = throttle({ globalPerSecond: 1, maxQueue: 1 })

    const calls = [0, 1, 2].map(() => paced.hook(call('sendMessage'), async () => undefined))

    await vi.advanceTimersByTimeAsync(3_000)
    await expect(Promise.all(calls)).resolves.toHaveLength(3)
  })
})

describe('the handle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports how many callers are parked', async () => {
    const paced = throttle({ globalPerSecond: 1 })

    const calls = [0, 1, 2].map(() => paced.hook(call('sendMessage'), async () => undefined))
    await vi.advanceTimersByTimeAsync(0)

    expect(paced.handle.pending).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(3_000)
    await Promise.all(calls)

    expect(paced.handle.pending).toBe(0)
  })

  it('forgets a chat the bot has stopped talking to', async () => {
    // One window per chat kept forever is how a broadcast bot leaks memory.
    const paced = throttle({ globalPerSecond: 100 })

    await paced.hook(call('sendMessage', { chat_id: 1 }), async () => undefined)
    expect(paced.handle.chatWindows).toBe(1)

    await vi.advanceTimersByTimeAsync(5_000)
    paced.handle.sweep()

    expect(paced.handle.chatWindows).toBe(0)
  })

  it('drops the queue chain along with the window it belonged to', async () => {
    // The bug this pins: the sweep dropped a chat's window and left its FIFO
    // chain behind, so a broadcast bot retained one settled promise per chat
    // it had ever spoken to. The window count returned to zero and the leak
    // was invisible in it.
    const paced = throttle({ globalPerSecond: 100_000, chatPerSecond: 100_000 })

    for (let chat = 0; chat < 200; chat += 1) {
      await paced.hook(call('sendMessage', { chat_id: chat }), async () => undefined)
    }

    expect(paced.handle.chatWindows).toBe(200)
    expect(paced.handle.trackedQueues).toBeGreaterThan(200)

    // Past the window, so nothing is tracked and nothing is waiting.
    await vi.advanceTimersByTimeAsync(2_000)
    paced.handle.sweep()

    expect(paced.handle.chatWindows).toBe(0)
    // The global bucket keeps its chain; every per-chat one goes.
    expect(paced.handle.trackedQueues).toBeLessThanOrEqual(1)
  })

  it('keeps the chain of a bucket that is still in use', async () => {
    // Dropping a chain someone is queued behind would let a later caller jump
    // ahead of them, and lose the ordering the FIFO exists for.
    const paced = throttle({ globalPerSecond: 100_000, chatPerSecond: 1 })

    const first = paced.hook(call('sendMessage', { chat_id: 7 }), async () => undefined)
    const second = paced.hook(call('sendMessage', { chat_id: 7 }), async () => undefined)

    await vi.advanceTimersByTimeAsync(0)
    paced.handle.sweep()

    // Someone is waiting, so the window and its chain both survive the sweep.
    expect(paced.handle.chatWindows).toBe(1)

    await vi.advanceTimersByTimeAsync(2_000)
    await Promise.all([first, second])
  })

  it('sweeps on a timer rather than on every call', async () => {
    // Walking every window per request is O(chats) on the hot path: invisible
    // at ten conversations, a real cost at a hundred thousand.
    const paced = throttle({ globalPerSecond: 1_000, chatPerSecond: 1_000 })

    for (let chat = 0; chat < 5; chat += 1) {
      await paced.hook(call('sendMessage', { chat_id: chat }), async () => undefined)
    }

    // All five windows are still tracked despite four calls having followed
    // the first, because no sweep interval has elapsed.
    expect(paced.handle.chatWindows).toBe(5)

    await vi.advanceTimersByTimeAsync(31_000)
    await paced.hook(call('sendMessage', { chat_id: 99 }), async () => undefined)

    // The sweep dropped the five idle ones and kept the one just used.
    expect(paced.handle.chatWindows).toBe(1)
  })

  it('counts groups separately from private chats', async () => {
    const paced = throttle({ globalPerSecond: 100 })

    await paced.hook(call('sendMessage', { chat_id: 1 }), async () => undefined)
    await paced.hook(call('sendMessage', { chat_id: -100 }), async () => undefined)

    expect(paced.handle.chatWindows).toBe(1)
    expect(paced.handle.groupWindows).toBe(1)
  })
})

describe('cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops waiting when the call is aborted', async () => {
    const paced = throttle({ globalPerSecond: 1 })
    const controller = new AbortController()

    const first = paced.hook(call('sendMessage'), async () => undefined)
    const second = paced.hook(
      { ...call('sendMessage'), options: { signal: controller.signal } },
      async () => undefined,
    )

    await vi.advanceTimersByTimeAsync(0)
    controller.abort(new Error('shutting down'))

    await expect(second).rejects.toThrow('shutting down')
    await vi.advanceTimersByTimeAsync(2_000)
    await first
  })

  it('does not wedge the bucket behind an aborted caller', async () => {
    // The failure this prevents: one cancelled request leaving every later
    // call to that chat waiting on a promise that never settles.
    const paced = throttle({ globalPerSecond: 1 })
    const controller = new AbortController()
    let ran = false

    // The first call takes the only slot, so the second has to wait — which is
    // what makes the abort land while it is parked.
    const holding = paced.hook(call('sendMessage'), async () => undefined)

    const doomed = paced.hook(
      { ...call('sendMessage'), options: { signal: controller.signal } },
      async () => undefined,
    )

    await vi.advanceTimersByTimeAsync(0)
    controller.abort(new Error('gone'))
    await expect(doomed).rejects.toThrow('gone')
    await holding

    const after = paced.hook(call('sendMessage'), async () => {
      ran = true
      return undefined
    })

    await vi.advanceTimersByTimeAsync(2_000)
    await after

    expect(ran).toBe(true)
  })
})

describe('on a client', () => {
  it('paces real calls through the hook chain', async () => {
    const transport = mockTransport()
    transport.on('sendMessage', ok({ message_id: 1 }))

    const bot = Bot.fromToken(TOKEN, {
      client: transport,
      log: createLogger({ sink: silentSink() }),
    })

    const paced = throttle({ globalPerSecond: 100, chatPerSecond: 100 })
    bot.hook(paced.hook)

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })
    await bot.api.sendMessage({ chat_id: 1, text: 'again' })

    expect(transport.count('sendMessage')).toBe(2)
  })

  it('composes with flood-wait retry, pacing the retry too', async () => {
    const transport = mockTransport()
    transport.on('sendMessage', ok({ message_id: 1 }))

    const bot = Bot.fromToken(TOKEN, { client: transport })
    const paced = throttle({ globalPerSecond: 100 })

    // Throttle outermost: a retry re-enters it, so the second attempt is paced
    // as well rather than firing straight into the limit that rejected it.
    bot.hook(paced.hook)

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })
    expect(transport.count('sendMessage')).toBe(1)
  })
})
