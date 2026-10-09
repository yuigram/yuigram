// SPDX-License-Identifier: MPL-2.0

/**
 * Where an account starts in the update stream, and how it keeps its place.
 *
 * An account that has never had a position asks Telegram for one with
 * `updates.getState` when its first update arrives, and holds what arrives
 * meanwhile. Judging against a position nobody reported would make every
 * update a gap and fetch the account's whole history as though it had just
 * been missed — which is what these cases rule out. An account resuming a
 * position keeps chasing gaps from it, however far behind it is, across as
 * many catch-up attempts as that takes, without dropping what it held.
 *
 * Driven by the package's own update server, so what is missed and recovered
 * is what the server really produced. Waiting is a step a case takes.
 */

import { NetworkError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { peerStore } from '../src/storage/peers.js'
import type { TlValue } from '../src/tl/index.js'
import { openUpdates, type UpdatesProgress } from '../src/updates/manager.js'
import { UpdateState, type UpdateStateSnapshot } from '../src/updates/state.js'
import { UpdateServer } from './server/updates.js'

interface Options {
  /** A position read back from a store, as an account that has run before has. */
  readonly resumed?: Partial<UpdateStateSnapshot>
  /** Stands between the manager and the server, to delay or refuse a request. */
  readonly through?: (query: TlValue, answer: () => TlValue) => Promise<TlValue>
}

function client(server: UpdateServer, options: Options = {}) {
  const values = new Map<string, unknown>()
  const peers = peerStore({
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value)
    },
    delete: async (key: string) => {
      values.delete(key)
    },
  })

  const state = new UpdateState(options.resumed ?? {})
  const dispatched: TlValue[] = []
  const failures: Error[] = []
  const progress: UpdatesProgress[] = []
  const written: UpdateStateSnapshot[] = []
  const timers: Array<{ run: () => void; delay: number; cancelled: boolean; fired: boolean }> = []

  const updates = openUpdates({
    state,
    peers,
    established: options.resumed !== undefined,
    invoke: async (query) =>
      options.through === undefined
        ? server.invoke(query)
        : await options.through(query, () => server.invoke(query)),
    onUpdate: (update) => dispatched.push(update),
    onFailure: (error) => failures.push(error),
    onPosition: () => {
      written.push(state.snapshot())
    },
    onProgress: (report) => progress.push(report),
    reorderWindow: 500,
    schedule: (run, delay) => {
      const entry = { run, delay, cancelled: false, fired: false }
      timers.push(entry)

      return () => {
        entry.cancelled = true
      }
    },
  })

  return {
    state,
    updates,
    dispatched,
    failures,
    progress,
    written,
    timers,
    ids: () =>
      dispatched.map((update) => (update['message'] as TlValue | undefined)?.['id'] as number),
    asked: (name: string) => server.asked.filter((query) => query._ === name).length,
    armed: () => timers.filter((timer) => !timer.cancelled && !timer.fired),
    /** Let every wait that is running elapse, and what it starts settle. */
    async elapse() {
      const armed = timers.filter((timer) => !timer.cancelled && !timer.fired)
      if (armed.length === 0) throw new Error('no wait is running')
      for (const timer of armed) {
        timer.fired = true
        timer.run()
      }
      await settle()
    },
  }
}

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** A promise a case resolves when it chooses. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

/** A server that already has a history, as any account in use does. */
function withHistory(messages: number): UpdateServer {
  const server = new UpdateServer()
  for (let id = 1; id <= messages; id += 1) server.message(id)
  server.container([])

  return server
}

describe('an account with no position yet', () => {
  it('takes its starting position from Telegram, and fetches none of the history behind it', async () => {
    const server = withHistory(300)
    const c = client(server)

    const live = server.message(301)
    await c.updates.feed(server.container([live]))

    expect(c.asked('updates.getState')).toBe(1)
    expect(c.asked('updates.getDifference')).toBe(0)
    // The live update is handed out; none of the three hundred before it is.
    expect(c.ids()).toEqual([301])
    expect(c.state.pts).toBe(server.pts)
    expect(c.state.basis).toBe('telegram')
    expect(c.updates.established).toBe(true)
    expect(c.failures).toEqual([])
  })

  it('writes the starting position down once it has it', async () => {
    const server = withHistory(10)
    const c = client(server)

    await c.updates.feed(server.container([server.message(11)]))

    expect(c.written).toHaveLength(1)
    expect(c.written[0]?.pts).toBe(server.pts)
    expect(c.written[0]?.basis).toBe('telegram')
    expect(c.progress).toContainEqual(
      expect.objectContaining({ kind: 'baseline', pts: server.pts, early: 1 }),
    )
  })

  it('holds what arrives while it asks, and hands it out in order afterwards', async () => {
    const server = withHistory(50)
    const answer = deferred<void>()
    let asked: TlValue | undefined
    const c = client(server, {
      through: async (query, reply) => {
        if (query._ !== 'updates.getState') return reply()
        // Answered with the state as it stood when the question was asked.
        asked = reply()
        await answer.promise
        return asked
      },
    })

    const first = c.updates.feed(server.container([server.message(51)]))
    await settle()
    const second = c.updates.feed(server.container([server.message(52)]))
    await settle()

    // Nothing is judged while there is no position to judge it against.
    expect(c.dispatched).toEqual([])

    answer.resolve()
    await Promise.all([first, second])

    // The first is covered by the position and handed out as the live update
    // it is; the second lies beyond it and is judged, in the order they came.
    expect(c.ids()).toEqual([51, 52])
    expect(c.asked('updates.getDifference')).toBe(0)
    expect(c.state.pts).toBe(server.pts)
  })

  it('invents no position when the question fails, keeps what waited, and asks again', async () => {
    const server = withHistory(20)
    let refusals = 1
    const c = client(server, {
      through: async (query, reply) => {
        if (query._ === 'updates.getState' && refusals > 0) {
          refusals -= 1
          throw new NetworkError('the connection ended')
        }
        return reply()
      },
    })

    await c.updates.feed(server.container([server.message(21)]))

    expect(c.failures.map((error) => error.message)).toEqual(['the connection ended'])
    expect(c.updates.established).toBe(false)
    expect(c.state.basis).toBeUndefined()
    expect(c.written).toEqual([])
    expect(c.dispatched).toEqual([])
    expect(c.progress).toContainEqual(
      expect.objectContaining({ kind: 'retrying', box: 'baseline', held: 1 }),
    )

    await c.elapse()

    expect(c.ids()).toEqual([21])
    expect(c.updates.established).toBe(true)
    expect(c.asked('updates.getDifference')).toBe(0)
  })

  it('does not ask again while nothing is waiting for a position', async () => {
    const server = withHistory(5)
    const c = client(server, {
      through: async () => {
        throw new NetworkError('the connection ended')
      },
    })

    await c.updates.recover().catch(() => undefined)

    // A failed question with nothing held is not repeated on a timer: the next
    // update asks again.
    expect(c.armed()).toEqual([])
    expect(c.updates.established).toBe(false)
  })

  it('takes nothing once it has stopped, even an answer already on its way', async () => {
    const server = withHistory(5)
    const answer = deferred<void>()
    const c = client(server, {
      through: async (query, reply) => {
        const value = reply()
        if (query._ === 'updates.getState') await answer.promise
        return value
      },
    })

    const fed = c.updates.feed(server.container([server.message(6)]))
    await settle()
    c.updates.close()
    answer.resolve()
    await fed

    expect(c.dispatched).toEqual([])
    expect(c.written).toEqual([])
    expect(c.updates.established).toBe(false)
  })

  it('takes its position instead of a difference when asked to catch up', async () => {
    const server = withHistory(40)
    const c = client(server)

    await c.updates.recover()

    expect(c.asked('updates.getState')).toBe(1)
    expect(c.asked('updates.getDifference')).toBe(0)
    expect(c.dispatched).toEqual([])
    expect(c.state.pts).toBe(server.pts)
  })

  it('takes the overflowed queue as a reason to take a position, not to page through history', async () => {
    const server = withHistory(30)
    const c = client(server)

    await c.updates.feed(server.tooLong())

    expect(c.asked('updates.getDifference')).toBe(0)
    expect(c.dispatched).toEqual([])
    expect(c.updates.established).toBe(true)
  })
})

describe('an account resuming the position it wrote down', () => {
  it('continues from it after a restart, applying the next update as it comes', async () => {
    const server = withHistory(10)
    const first = client(server)
    await first.updates.feed(server.container([server.message(11)]))
    const kept = first.state.snapshot()
    first.updates.close()

    const second = client(server, { resumed: kept })
    await second.updates.feed(server.container([server.message(12)]))

    expect(second.ids()).toEqual([12])
    expect(second.asked('updates.getState')).toBe(1)
    expect(second.state.basis).toBe('telegram')
  })

  it('recovers what happened while it was down from where it left off', async () => {
    const server = withHistory(10)
    const first = client(server)
    await first.updates.feed(server.container([server.message(11)]))
    const kept = first.state.snapshot()
    first.updates.close()

    // Down for a while: three messages nobody received.
    server.message(12)
    server.message(13)
    server.message(14)

    const second = client(server, { resumed: kept })
    await second.updates.feed(server.container([server.message(15)]))
    await second.elapse()

    expect(second.ids().toSorted((a, b) => a - b)).toEqual([12, 13, 14, 15])
    expect(second.asked('updates.getState')).toBe(1)
    expect(second.state.pts).toBe(server.pts)
  })

  it('treats a stored position as one Telegram reported, however small its numbers', async () => {
    // A position of 1 written down is still a position: inferring that it is
    // none would skip whatever lies between it and now.
    const server = withHistory(3)
    const c = client(server, { resumed: { pts: 1, qts: 1, seq: 0, date: 0 } })

    await c.updates.feed(server.container([server.message(4)]))
    await c.elapse()

    expect(c.asked('updates.getState')).toBe(0)
    expect(c.ids().toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })
})

describe('a catch-up longer than one attempt', () => {
  it('goes on from where each attempt stopped until it is done, writing the position down between', async () => {
    const server = withHistory(250)
    server.faults = { sliceAt: 1 }
    const c = client(server, { resumed: { pts: 1, qts: 1, seq: 1, date: 0 } })

    await c.updates.feed(server.container([server.message(251)]))
    await c.elapse()
    // One attempt follows a hundred pages, then the next goes on at once.
    while (c.armed().length > 0) await c.elapse()

    const ids = c.ids()
    expect(ids.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 251 }, (_, i) => i + 1))
    expect(new Set(ids).size).toBe(ids.length)
    expect(c.failures).toEqual([])
    expect(c.state.pts).toBe(server.pts)

    const continued = c.progress.filter((report) => report.kind === 'continuing')
    expect(continued.length).toBeGreaterThanOrEqual(2)
    // Each attempt that ran out of pages wrote down a position further on.
    const positions = c.written.map((snapshot) => snapshot.pts)
    expect(positions.length).toBeGreaterThanOrEqual(2)
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
    expect(positions[0]).toBeGreaterThan(1)
  })

  it('is a failure when an attempt moves the position nowhere, and the held update waits', async () => {
    const server = withHistory(5)
    const stuck: TlValue = {
      _: 'updates.differenceSlice',
      new_messages: [],
      new_encrypted_messages: [],
      other_updates: [],
      chats: [],
      users: [],
      intermediate_state: { _: 'updates.state', pts: 1, qts: 1, date: 0, seq: 1, unread_count: 0 },
    }
    const c = client(server, {
      resumed: { pts: 1, qts: 1, seq: 1, date: 0 },
      through: async (query, reply) => (query._ === 'updates.getDifference' ? stuck : reply()),
    })

    await c.updates.feed(server.container([server.message(6)]))
    await c.elapse()

    expect(c.failures.map((error) => error.message)).toEqual([
      'the common box did not move in 100 pages of catching up',
    ])
    expect(c.dispatched).toEqual([])
    expect(c.progress).toContainEqual(
      expect.objectContaining({ kind: 'retrying', box: 'common', held: 1 }),
    )
    expect(c.armed()).toHaveLength(1)
  })
})

describe('a catch-up that fails', () => {
  it('keeps what it held and tries again later, rather than dropping it', async () => {
    const server = withHistory(10)
    let refusals = 1
    const c = client(server, {
      resumed: { pts: server.pts, qts: 1, seq: 1, date: 0 },
      through: async (query, reply) => {
        if (query._ === 'updates.getDifference' && refusals > 0) {
          refusals -= 1
          throw new NetworkError('the connection ended')
        }
        return reply()
      },
    })
    server.message(11)
    const live = server.message(12)

    await c.updates.feed(server.container([live], { seqStart: 2, seq: 2 }))
    await c.elapse()

    expect(c.failures.map((error) => error.message)).toEqual(['the connection ended'])
    expect(c.dispatched).toEqual([])
    const retry = c.armed()
    expect(retry).toHaveLength(1)
    // Longer than the reorder window: the next attempt waits out a failure.
    expect(retry[0]?.delay).toBe(1000)

    await c.elapse()

    expect(c.ids().toSorted((a, b) => a - b)).toEqual([11, 12])
  })
})
