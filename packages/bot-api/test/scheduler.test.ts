/**
 * Update scheduling.
 *
 * Two properties that pull against each other, and both are load-bearing:
 * a conversation must stay in order, and unrelated conversations must not
 * wait for each other. Getting the first wrong reorders someone's replies;
 * getting the second wrong makes one slow handler the throughput of the whole
 * bot.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Update } from '../src/generated/types/index.js'
import { chatKeyOf, createScheduler } from '../src/scheduler.js'
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

/** A promise that resolves when told. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {}
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('keying', () => {
  it('finds the chat an update belongs to', () => {
    expect(chatKeyOf(update(42))).toBe('42')
  })

  it('finds the chat behind a callback query, through its message', () => {
    // The query itself has no chat; the message its button sits on does.
    const query = {
      update_id: 1,
      callback_query: {
        id: 'q',
        from: { id: 7, is_bot: false, first_name: 'A' },
        message: { message_id: 1, chat: { id: -100, type: 'supergroup' } },
      },
    } as unknown as Update

    expect(chatKeyOf(query)).toBe('-100')
  })

  it('leaves an update with no chat unkeyed, so it waits for nothing', () => {
    const answer = {
      update_id: 1,
      poll_answer: { poll_id: 'p', option_ids: [0] },
    } as unknown as Update

    expect(chatKeyOf(answer)).toBeUndefined()
  })
})

describe('ordering', () => {
  it('runs one chat in the order the updates arrived', async () => {
    const scheduler = createScheduler({ limit: 10 })
    const order: number[] = []

    const gates = [deferred(), deferred(), deferred()]

    for (const [index, gate] of gates.entries()) {
      scheduler.run(update(1, index), async () => {
        await gate.promise
        order.push(index)
      })
    }

    // Released out of order: the chain must still produce them in order.
    gates[2]?.resolve()
    gates[1]?.resolve()
    gates[0]?.resolve()

    await scheduler.drain()
    expect(order).toEqual([0, 1, 2])
  })

  it('does not make one chat wait for another', async () => {
    // The reason for concurrency at all: a slow handler in one conversation
    // must not be the throughput of the whole bot.
    const scheduler = createScheduler({ limit: 10 })
    const order: string[] = []
    const slow = deferred()

    scheduler.run(update(1), async () => {
      await slow.promise
      order.push('slow')
    })

    scheduler.run(update(2), async () => {
      order.push('fast')
    })

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(order).toEqual(['fast'])

    slow.resolve()
    await scheduler.drain()
    expect(order).toEqual(['fast', 'slow'])
  })

  it('keeps going in a chat after one of its handlers fails', async () => {
    const scheduler = createScheduler({ limit: 4 })
    const order: string[] = []

    scheduler.run(update(1, 1), async () => {
      order.push('first')
      throw new Error('boom')
    })

    scheduler.run(update(1, 2), async () => {
      order.push('second')
    })

    await scheduler.drain()
    expect(order).toEqual(['first', 'second'])
  })
})

describe('the concurrency bound', () => {
  it('runs no more than the limit at once', async () => {
    // Without a bound, a batch of a hundred slow handlers opens a hundred
    // connections to whatever they depend on.
    const scheduler = createScheduler({ limit: 2 })
    let running = 0
    let peak = 0

    const gates = Array.from({ length: 6 }, () => deferred())

    for (const [index, gate] of gates.entries()) {
      scheduler.run(update(index), async () => {
        running += 1
        peak = Math.max(peak, running)
        await gate.promise
        running -= 1
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(peak).toBe(2)

    for (const gate of gates) gate.resolve()
    await scheduler.drain()

    expect(peak).toBe(2)
  })

  it('takes the next update as soon as a slot frees', async () => {
    const scheduler = createScheduler({ limit: 1 })
    const order: number[] = []
    const gates = [deferred(), deferred()]

    for (const [index, gate] of gates.entries()) {
      scheduler.run(update(index), async () => {
        order.push(index)
        await gate.promise
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(order).toEqual([0])

    gates[0]?.resolve()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(order).toEqual([0, 1])

    gates[1]?.resolve()
    await scheduler.drain()
  })
})

describe('draining', () => {
  it('waits for everything scheduled', async () => {
    const scheduler = createScheduler({ limit: 4 })
    let done = 0

    for (let index = 0; index < 8; index += 1) {
      scheduler.run(update(index), async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        done += 1
      })
    }

    await scheduler.drain()
    expect(done).toBe(8)
  })

  it('waits for work that scheduled more work', async () => {
    // A handler that sends a message which produces an update is ordinary.
    const scheduler = createScheduler({ limit: 4 })
    let done = 0

    scheduler.run(update(1), async () => {
      done += 1
      scheduler.run(update(2), async () => {
        done += 1
      })
    })

    await scheduler.drain()
    expect(done).toBe(2)
  })

  it('reports how much is outstanding', async () => {
    const scheduler = createScheduler({ limit: 4 })
    const gate = deferred()

    scheduler.run(update(1), () => gate.promise)
    expect(scheduler.pending).toBe(1)

    gate.resolve()
    await scheduler.drain()
    expect(scheduler.pending).toBe(0)
  })

  it('forgets a chat once its chain is empty', async () => {
    // One chain per chat kept forever is how a busy bot leaks memory.
    const scheduler = createScheduler({ limit: 4 })

    for (let chat = 0; chat < 100; chat += 1) {
      scheduler.run(update(chat), async () => {})
    }

    await scheduler.drain()
    expect(scheduler.pending).toBe(0)
  })
})

describe('on a polling client', () => {
  it('handles a batch concurrently while keeping each chat in order', async () => {
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))

    let served = false
    transport.on('getUpdates', () => {
      if (served) return ok([])
      served = true
      return ok([update(1, 1), update(1, 2), update(2, 3)])
    })

    const bot = Bot.fromToken(TOKEN, {
      client: transport,
      log: createLogger({ sink: silentSink() }),
    })

    const order: number[] = []

    bot.onMessage(async (message) => {
      // The first update of chat 1 is the slowest, so a sequential loop and a
      // per-chat one produce different orders here.
      if (message.message_id === 1) await new Promise((resolve) => setTimeout(resolve, 20))
      order.push(message.message_id)
    })

    await bot.poll()
    await new Promise((resolve) => setTimeout(resolve, 60))
    await bot.stop({ timeout: 500 })

    // Chat 2 did not wait behind chat 1, and chat 1 stayed in order.
    expect(order.indexOf(3)).toBeLessThan(order.indexOf(1))
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(2))
  })

  it('drains handlers still running when it is stopped', async () => {
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))

    let served = false
    transport.on('getUpdates', () => {
      if (served) return ok([])
      served = true
      return ok([update(1, 1)])
    })

    const bot = Bot.fromToken(TOKEN, {
      client: transport,
      log: createLogger({ sink: silentSink() }),
    })

    let finished = false

    bot.onMessage(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      finished = true
    })

    await bot.poll()
    await new Promise((resolve) => setTimeout(resolve, 10))
    await bot.stop({ timeout: 500 })

    // Cutting a handler off mid-reply is what draining exists to prevent.
    expect(finished).toBe(true)
  })
})
