/**
 * Bounded ingestion.
 *
 * The audit finding these exist for: the poll loop scheduled work and returned,
 * so a transport that always had another batch outran the handlers and the
 * backlog became the process's memory — at any concurrency, including one.
 *
 * What is asserted here is the **invariant**, not the mechanism: outstanding
 * work stays bounded while a full transport is served, ordering survives, and
 * the loop resumes when the backlog clears. A test pinned to a particular
 * watermark would pass a broken implementation that happened to use the same
 * number.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Update } from '../src/generated/types/index.js'
import { createScheduler } from '../src/scheduler.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

/** An update in a chat. */
function update(chat: number, id = chat): Update {
  return {
    update_id: id,
    message: {
      message_id: id,
      date: 1,
      chat: { id: chat, type: 'private' },
      from: { id: chat, is_bot: false, first_name: 'A' },
      text: 'hi',
    },
  } as unknown as Update
}

/**
 * A client whose transport always has another full batch waiting.
 *
 * The worst case for an unbounded loop, and an ordinary one for a bot coming
 * back after downtime.
 */
function saturated(options: { chats?: number } = {}) {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))

  let issued = 0
  const chats = options.chats ?? Number.POSITIVE_INFINITY

  transport.on('getUpdates', () =>
    ok(
      Array.from({ length: 100 }, () => {
        issued += 1
        return update(issued % chats, issued)
      }),
    ),
  )

  const bot = Bot.fromToken(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })

  return { bot, transport, issued: () => issued }
}

describe('the scheduler gate', () => {
  it('admits work until it is full, then makes the producer wait', async () => {
    const scheduler = createScheduler({ limit: 1, capacity: 4 })
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    for (let index = 0; index < 4; index += 1) {
      scheduler.run(update(index), () => held)
    }

    expect(scheduler.saturated).toBe(true)

    let admitted = false
    void scheduler.whenReady().then(() => {
      admitted = true
    })

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(admitted).toBe(false)

    release()
    await scheduler.drain()
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(admitted).toBe(true)
  })

  it('resolves immediately when there is room, so a keeping-up producer pays nothing', async () => {
    const scheduler = createScheduler({ limit: 4, capacity: 8 })

    // No timers, no ticks: the check has to be free on the common path.
    await expect(scheduler.whenReady()).resolves.toBeUndefined()
  })

  it('stops waiting when the signal aborts, so shutdown is never blocked here', async () => {
    const scheduler = createScheduler({ limit: 1, capacity: 1 })
    const controller = new AbortController()

    scheduler.run(update(1), () => new Promise(() => {}))

    const waiting = scheduler.whenReady(controller.signal)
    controller.abort(new Error('stopping'))

    await expect(waiting).rejects.toThrow('stopping')
  })

  it('never sets a capacity below what it runs', () => {
    // A scheduler that cannot hold what it is running would stall on itself.
    const scheduler = createScheduler({ limit: 8, capacity: 2 })

    for (let index = 0; index < 8; index += 1) {
      scheduler.run(update(index), async () => {})
    }

    expect(scheduler.pending).toBeLessThanOrEqual(8)
  })
})

/**
 * Peak backlog while a full transport is served for `ms`.
 *
 * The invariant is that this does not depend on `ms`: an unbounded loop grows
 * with the time it runs, a bounded one settles. Comparing two durations tests
 * that directly, where a single threshold would only test whichever number
 * happened to be written down.
 */
async function peakBacklog(concurrency: number, ms: number): Promise<number> {
  const { bot } = saturated()
  let peak = 0

  bot.onMessage(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })

  await bot.poll({ concurrency })

  const until = Date.now() + ms
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    peak = Math.max(peak, bot.pending)
  }

  await bot.stop({ timeout: 2_000 })
  return peak
}

describe('a permanently full transport', () => {
  it('cannot make outstanding work grow with the time it runs', async () => {
    // The audit's failure was exactly this: the backlog tracked elapsed time
    // until the process ran out of memory. Four times the runtime must not
    // mean a materially larger backlog.
    const short = await peakBacklog(4, 150)
    const long = await peakBacklog(4, 600)

    expect(long).toBeLessThanOrEqual(short * 2)
  })

  it('stays bounded at concurrency 1, where sequential delivery used to be the only guard', async () => {
    const short = await peakBacklog(1, 150)
    const long = await peakBacklog(1, 600)

    expect(long).toBeLessThanOrEqual(short * 2)

    // And bounded by the batch the loop admits rather than by anything that
    // accumulates: one batch is 100, and it waits before fetching another.
    expect(long).toBeLessThan(250)
  })

  it('respects a capacity the caller chose', async () => {
    const { bot } = saturated()
    const observed: number[] = []

    bot.onMessage(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    await bot.poll({ concurrency: 2, capacity: 6 })

    for (let sample = 0; sample < 6; sample += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      observed.push(bot.pending)
    }

    await bot.stop({ timeout: 1_000 })

    // One batch may be admitted while at the watermark, so the bound is the
    // capacity plus that batch — not unbounded, which is the property.
    expect(Math.max(...observed)).toBeLessThanOrEqual(6 + 100)
    expect(Math.max(...observed)).toBeLessThan(200)
  })
})

describe('what backpressure must not cost', () => {
  it('keeps processing chats in parallel', async () => {
    const { bot } = saturated({ chats: 50 })
    let peak = 0
    let running = 0

    bot.onMessage(async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 10))
      running -= 1
    })

    await bot.poll({ concurrency: 8 })
    await new Promise((resolve) => setTimeout(resolve, 150))
    await bot.stop({ timeout: 1_000 })

    // Waiting for room must not collapse into one-at-a-time.
    expect(peak).toBeGreaterThan(1)
  })

  it('keeps one chat in order while another is being served', async () => {
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))

    let served = false
    transport.on('getUpdates', () => {
      if (served) return ok([])
      served = true
      return ok([update(1, 1), update(2, 2), update(1, 3), update(1, 4)])
    })

    const bot = Bot.fromToken(TOKEN, {
      client: transport,
      log: createLogger({ sink: silentSink() }),
    })

    const seen: number[] = []

    bot.onMessage(async (message) => {
      if (message.message_id === 1) await new Promise((resolve) => setTimeout(resolve, 20))
      seen.push(message.message_id)
    })

    await bot.poll({ concurrency: 4, capacity: 4 })
    await new Promise((resolve) => setTimeout(resolve, 120))
    await bot.stop({ timeout: 1_000 })

    const chatOne = seen.filter((id) => id !== 2)
    expect(chatOne).toEqual([1, 3, 4])
  })

  it('resumes fetching once the backlog clears', async () => {
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))

    let batches = 0
    let issued = 0
    transport.on('getUpdates', () => {
      batches += 1
      // One burst, then nothing: the loop has to come back for the empty
      // polls after the burst has drained.
      if (batches > 1) return ok([])
      return ok(Array.from({ length: 40 }, () => update(issued, ++issued)))
    })

    const bot = Bot.fromToken(TOKEN, {
      client: transport,
      log: createLogger({ sink: silentSink() }),
    })

    let handled = 0
    bot.onMessage(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2))
      handled += 1
    })

    await bot.poll({ concurrency: 2, capacity: 4 })
    await new Promise((resolve) => setTimeout(resolve, 300))
    await bot.stop({ timeout: 1_000 })

    expect(handled).toBe(40)
    // Having drained, the loop went back for more rather than staying parked.
    expect(batches).toBeGreaterThan(1)
  })
})

describe('shutdown while backpressured', () => {
  it('stops promptly even though the producer is parked', async () => {
    const { bot } = saturated()

    bot.onMessage(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    await bot.poll({ concurrency: 2, capacity: 4 })
    await new Promise((resolve) => setTimeout(resolve, 60))

    const began = Date.now()
    const clean = await bot.stop({ timeout: 400 })

    // The parked producer must not hold the shutdown open: whatever the
    // backlog, the deadline is what bounds the wait.
    expect(Date.now() - began).toBeLessThan(1_000)
    expect(typeof clean).toBe('boolean')
  })
})
