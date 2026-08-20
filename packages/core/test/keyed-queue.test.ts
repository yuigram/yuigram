/**
 * Per-key serialization.
 *
 * This is what stops two rapid messages from the same user both reading
 * `count: 0` and both writing `1`. It has to serialize work for one key while
 * leaving different keys fully parallel, and it has to forget a key once its
 * work is done — a queue that never forgets is a leak keyed by every user the
 * bot has ever served.
 */

import { describe, expect, it } from 'vitest'
import { KeyedQueue } from '../src/session/session.js'

/** Resolve after `ms`, for interleaving two tasks deliberately. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('serialization', () => {
  it('runs tasks for one key one at a time', async () => {
    const queue = new KeyedQueue()
    const events: string[] = []

    const task = (name: string) => async () => {
      events.push(`${name}:start`)
      await sleep(10)
      events.push(`${name}:end`)
    }

    await Promise.all([queue.run('a', task('one')), queue.run('a', task('two'))])

    // Interleaved execution would read one:start, two:start, one:end, two:end.
    expect(events).toEqual(['one:start', 'one:end', 'two:start', 'two:end'])
  })

  it('prevents the lost update', async () => {
    const queue = new KeyedQueue()
    const store = new Map<string, number>([['a', 0]])

    const increment = async (): Promise<void> => {
      const current = store.get('a') ?? 0
      await sleep(5)
      store.set('a', current + 1)
    }

    await Promise.all([queue.run('a', increment), queue.run('a', increment)])

    expect(store.get('a')).toBe(2)
  })

  it('leaves different keys parallel', async () => {
    const queue = new KeyedQueue()
    const began = Date.now()

    await Promise.all([
      queue.run('a', () => sleep(30)),
      queue.run('b', () => sleep(30)),
      queue.run('c', () => sleep(30)),
    ])

    // Serialized, this would take 90ms. Independent keys must not queue.
    expect(Date.now() - began).toBeLessThan(80)
  })
})

describe('failure isolation', () => {
  it('propagates a failure to its own caller', async () => {
    const queue = new KeyedQueue()

    await expect(queue.run('a', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('does not cascade a failure into the next task for the key', async () => {
    const queue = new KeyedQueue()

    const failed = queue.run('a', () => Promise.reject(new Error('boom')))
    const after = queue.run('a', () => Promise.resolve('fine'))

    await expect(failed).rejects.toThrow('boom')
    await expect(after).resolves.toBe('fine')
  })
})

describe('bookkeeping', () => {
  it('forgets a key once its work is done', async () => {
    // The check has to compare against the tail this task installed. Comparing
    // against `undefined` never matches, and the map then grows by one entry
    // per distinct key for the lifetime of the process.
    const queue = new KeyedQueue()

    await queue.run('a', () => Promise.resolve())
    await queue.run('b', () => Promise.resolve())

    expect(queue.size).toBe(0)
  })

  it('forgets a key whose task failed', async () => {
    const queue = new KeyedQueue()

    await queue.run('a', () => Promise.reject(new Error('boom'))).catch(() => undefined)

    expect(queue.size).toBe(0)
  })

  it('keeps the entry while work is still queued behind it', async () => {
    // Deleting early would let the next update for this key run unserialized,
    // which is the race the queue exists to prevent.
    const queue = new KeyedQueue()

    const first = queue.run('a', () => sleep(20))
    const second = queue.run('a', () => sleep(20))

    expect(queue.size).toBe(1)

    await Promise.all([first, second])
    expect(queue.size).toBe(0)
  })
})
