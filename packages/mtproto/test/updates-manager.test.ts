// SPDX-License-Identifier: MPL-2.0

/**
 * Staying in step with Telegram when the stream stops being enough.
 *
 * Every case here is driven by the package's own server, which keeps the
 * sequences a real one keeps and answers a catch-up from what it actually
 * produced. So a gap is a gap the server really opened, and what the client
 * recovers is what it really missed — not a fixture written to match the
 * implementation.
 *
 * The reorder window and the scheduler are supplied, so waiting is a step a
 * case takes rather than a delay it endures.
 */

import { TelegramError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { peerStore } from '../src/storage/peers.js'
import type { TlValue } from '../src/tl/index.js'
import { openUpdates } from '../src/updates/manager.js'
import { UpdateState } from '../src/updates/state.js'
import { UpdateServer } from './server/updates.js'

const CHANNEL = 777n

/** The manager, its server, and the levers a case pulls. */
function client(options: { seededChannel?: boolean } = {}) {
  const server = new UpdateServer()
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

  const state = new UpdateState({ pts: server.pts, date: 0 })
  const dispatched: TlValue[] = []
  const failures: Error[] = []
  const timers: Array<{ run: () => void; delay: number; cancelled: boolean; fired: boolean }> = []

  if (options.seededChannel !== false) server.addChannel(CHANNEL)

  const updates = openUpdates({
    state,
    peers,
    invoke: async (query) => server.invoke(query),
    onUpdate: (update) => dispatched.push(update),
    onFailure: (error) => failures.push(error),
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
    server,
    state,
    peers,
    updates,
    dispatched,
    failures,
    timers,
    /** Everything dispatched, as the message identifiers it carried. */
    ids: () =>
      dispatched.map((update) => (update['message'] as TlValue | undefined)?.['id'] as number),
    /** Let every wait that is running elapse. */
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

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('an ordinary stream', () => {
  it('hands out what arrives, in order', async () => {
    const c = client()

    await c.updates.feed(c.server.container([c.server.message(1), c.server.message(2)]))

    expect(c.ids()).toEqual([1, 2])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('hands out an update that came on its own', async () => {
    const c = client()

    await c.updates.feed(c.server.short(c.server.message(1)))

    expect(c.ids()).toEqual([1])
  })

  it('never hands the same message out twice', async () => {
    const c = client()
    const update = c.server.message(1)

    await c.updates.feed(c.server.container([update]))
    await c.updates.feed(c.server.container([update], { seqStart: 1, seq: 1 }))

    // A duplicate is the sequence saying nothing happened, not that something
    // happened again.
    expect(c.ids()).toEqual([1])
  })

  it('ignores an update the sequence says has already been applied', async () => {
    const c = client()
    const removal = c.server.deletion([1, 2])

    await c.updates.feed(c.server.container([removal]))
    // Delivered outside a container the second time, so the container sequence
    // cannot be what recognises it.
    await c.updates.feed(c.server.short(removal))

    // A deletion carries no message, so nothing about it can be recognised by
    // identity. Only the sequence can say it has already happened.
    expect(c.dispatched).toHaveLength(1)
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('ignores a container it has already applied', async () => {
    const c = client()
    const container = c.server.container([c.server.message(1)])

    await c.updates.feed(container)
    await c.updates.feed(container)

    expect(c.ids()).toEqual([1])
  })

  it('does not hand out what was already seen as the answer to a call', async () => {
    const c = client()
    const update = c.server.message(1)

    // A message sent by this client comes back as the answer to the send, and
    // then again in the stream. Reporting it twice is reporting it wrongly.
    c.updates.observed(update)
    await c.updates.feed(c.server.container([update]))

    expect(c.dispatched).toEqual([])
    // The sequence still moves: the message did happen.
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('still hands out something else that was never seen', async () => {
    const c = client()
    const first = c.server.message(1)
    c.updates.observed(first)

    await c.updates.feed(c.server.container([first, c.server.message(2)]))

    expect(c.ids()).toEqual([2])
  })

  it('writes down the peers an answer described', async () => {
    const c = client()
    c.server.addUser(500n, { username: 'someone' })

    await c.updates.feed(c.server.container([c.server.message(1, { fromId: 500n })]))

    // The only description of a peer is in the answer that mentioned it, so it
    // is written down before anything is judged.
    expect(await c.peers.byUsername('someone')).toMatchObject({ id: 500n })
  })
})

describe('a gap in the common sequence', () => {
  it('is given a moment to resolve itself before anything is asked', async () => {
    const c = client()
    c.server.message(1)
    const second = c.server.message(2)

    await c.updates.feed(c.server.container([second]))

    // The server may simply have reordered. Chasing on the first sign of
    // trouble spends a round trip on almost every reorder.
    expect(c.server.asked).toEqual([])
    expect(c.timers.filter((timer) => !timer.cancelled)).toHaveLength(1)
    expect(c.timers[0]?.delay).toBe(500)
  })

  it('is chased once the moment has passed', async () => {
    const c = client()
    c.server.message(1)
    const second = c.server.message(2)

    await c.updates.feed(c.server.container([second]))
    await c.elapse()

    expect(c.server.asked.map((query) => query._)).toEqual(['updates.getDifference'])
  })

  it('recovers exactly what was missed, and nothing else', async () => {
    const c = client()
    c.server.message(1)
    const second = c.server.message(2)

    await c.updates.feed(c.server.container([second]))
    await c.elapse()

    // The message that never arrived, and the one that opened the gap, each
    // exactly once.
    expect(c.ids().sort((a, b) => a - b)).toEqual([1, 2])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('does not hand out again what the catch-up repeated', async () => {
    const c = client()
    const first = c.server.message(1)
    await c.updates.feed(c.server.container([first]))
    c.server.message(2)
    const third = c.server.message(3)

    await c.updates.feed(c.server.container([third], { seqStart: 2, seq: 2 }))
    await c.elapse()

    // A catch-up legitimately returns messages the stream already delivered.
    expect(c.ids()).toEqual([1, 2, 3])
  })

  it('chases one catch-up however many updates opened the gap', async () => {
    const c = client()
    c.server.message(1)
    const second = c.server.message(2)
    const third = c.server.message(3)

    await c.updates.feed(c.server.container([second]))
    await c.updates.feed(c.server.container([third], { seqStart: 2, seq: 2 }))

    // One wait, not one per update: a second would ask the same question twice
    // and drain the two answers over each other.
    expect(c.timers.filter((timer) => !timer.cancelled)).toHaveLength(1)

    await c.elapse()

    expect(c.server.asked.filter((query) => query._ === 'updates.getDifference')).toHaveLength(1)
  })

  it('follows a catch-up that arrives in pages', async () => {
    const c = client()
    for (let id = 1; id <= 5; id += 1) c.server.message(id)
    const last = c.server.message(6)
    c.server.faults = { sliceAt: 2 }

    await c.updates.feed(c.server.container([last]))
    await c.elapse()

    // A slice says the box has not caught up yet, and stopping there would
    // leave it behind for ever.
    expect(c.ids().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('takes the position the server names when the queue is gone', async () => {
    const c = client()
    c.server.message(1)
    const second = c.server.message(2)
    c.server.faults = { tooLong: true }

    await c.updates.feed(c.server.container([second]))
    await c.elapse()

    // Nothing that was missed can be recovered. Carrying on from where the
    // server says the box is, is the only answer that is not a fiction.
    expect(c.state.pts).toBe(c.server.pts)
    expect(c.failures).toEqual([])
  })
})

describe('a stream the server stopped keeping', () => {
  it('catches up rather than judging anything', async () => {
    const c = client()
    c.server.message(1)
    c.server.message(2)

    await c.updates.feed(c.server.tooLong())

    // There is nothing to judge: everything since is missing, and there is no
    // sequence number to compare against.
    expect(c.server.asked.map((query) => query._)).toEqual(['updates.getDifference'])
    expect(c.ids().sort((a, b) => a - b)).toEqual([1, 2])
    expect(c.state.pts).toBe(c.server.pts)
  })
})

describe('a gap in a channel', () => {
  it('is chased against that channel alone', async () => {
    const c = client()
    const first = c.server.channelMessage(CHANNEL, 1)
    await c.updates.feed(c.server.container([first]))
    c.server.channelMessage(CHANNEL, 2)
    const third = c.server.channelMessage(CHANNEL, 3)

    await c.updates.feed(c.server.container([third], { seqStart: 2, seq: 2 }))
    await c.elapse()

    expect(c.server.asked.map((query) => query._)).toEqual(['updates.getChannelDifference'])
    expect(c.ids()).toEqual([1, 2, 3])
    expect(c.state.channelPts(CHANNEL)).toBe(c.server.channelPts(CHANNEL))
  })

  it('does not hold up the common sequence', async () => {
    const c = client()
    const first = c.server.channelMessage(CHANNEL, 1)
    await c.updates.feed(c.server.container([first]))
    c.server.channelMessage(CHANNEL, 2)
    const stale = c.server.channelMessage(CHANNEL, 3)

    await c.updates.feed(c.server.container([stale], { seqStart: 2, seq: 2 }))
    await c.updates.feed(c.server.container([c.server.message(9)], { seqStart: 3, seq: 3 }))

    // The boxes are independent. A channel that has fallen behind is no reason
    // to hold anything else.
    expect(c.ids()).toContain(9)
  })

  it('stops chasing a channel the account can no longer see', async () => {
    const c = client()
    const first = c.server.channelMessage(CHANNEL, 1)
    await c.updates.feed(c.server.container([first]))
    c.server.channelMessage(CHANNEL, 2)
    const third = c.server.channelMessage(CHANNEL, 3)
    c.server.faults = { channels: new Map([[CHANNEL.toString(), 'private']]) }

    await c.updates.feed(c.server.container([third], { seqStart: 2, seq: 2 }))
    await c.elapse()

    const asked = c.server.asked.length
    c.server.channelMessage(CHANNEL, 4)
    await c.updates.feed(
      c.server.container([c.server.channelMessage(CHANNEL, 5)], { seqStart: 3, seq: 3 }),
    )

    // Nothing is even scheduled: chasing again would fail the same way for as
    // long as the account is out of the channel.
    expect(c.timers.filter((timer) => !timer.cancelled && !timer.fired)).toEqual([])
    expect(c.server.asked).toHaveLength(asked)
    expect(c.failures).toEqual([])
  })

  it('starts a channel over when it has fallen too far behind', async () => {
    const c = client()
    const first = c.server.channelMessage(CHANNEL, 1)
    await c.updates.feed(c.server.container([first]))
    c.server.channelMessage(CHANNEL, 2)
    const third = c.server.channelMessage(CHANNEL, 3)
    c.server.faults = { channels: new Map([[CHANNEL.toString(), 'too-long']]) }

    await c.updates.feed(c.server.container([third], { seqStart: 2, seq: 2 }))
    await c.elapse()

    // Forgotten rather than left behind, so the update that was held becomes
    // the beginning of a fresh sequence instead of gapping for ever against a
    // number nothing will reach.
    expect(c.ids()).toEqual([1, 3])
    expect(c.state.channelPts(CHANNEL)).toBe(c.server.channelPts(CHANNEL))
  })

  it('cannot be chased for a channel that was never encountered', async () => {
    const c = client({ seededChannel: false })
    const unknown = 999n
    const first = c.server.channelMessage(unknown, 1)
    await c.updates.feed(c.server.container([first]))
    c.server.channelMessage(unknown, 2)
    const third = c.server.channelMessage(unknown, 3)

    await c.updates.feed(c.server.container([third], { seqStart: 2, seq: 2 }))
    await c.elapse()

    // A channel is named by a hash the account can only have learned. Saying so
    // is better than sending a reference that will be refused.
    expect(c.failures.map((error) => error.message)).toContainEqual(
      expect.stringContaining('never been named'),
    )
  })
})

describe('stopping', () => {
  it('drops a gap that was waiting to be chased', async () => {
    const c = client()
    c.server.message(1)
    const second = c.server.message(2)
    await c.updates.feed(c.server.container([second]))

    c.updates.close()

    expect(c.timers.every((timer) => timer.cancelled)).toBe(true)
    expect(c.server.asked).toEqual([])
  })

  it('takes nothing further from the stream', async () => {
    const c = client()
    c.updates.close()

    await c.updates.feed(c.server.container([c.server.message(1)]))

    expect(c.dispatched).toEqual([])
  })
})

describe('catching up on request', () => {
  it('asks without waiting for a gap to be noticed', async () => {
    const c = client()
    c.server.message(1)

    await c.updates.recover()

    expect(c.server.asked.map((query) => query._)).toEqual(['updates.getDifference'])
    expect(c.ids()).toEqual([1])
  })

  it('gives up quietly on a channel the account can no longer see', async () => {
    const c = client()
    // The channel has to have been encountered before it can be asked about.
    await c.updates.feed(c.server.container([c.server.channelMessage(CHANNEL, 1)]))
    c.server.faults = { channels: new Map([[CHANNEL.toString(), 'private']]) }

    await expect(
      c.updates.recover({ kind: 'channel', channelId: CHANNEL }),
    ).resolves.toBeUndefined()
  })

  it('refuses to ask about a channel it has never encountered', async () => {
    const c = client({ seededChannel: false })

    await expect(c.updates.recover({ kind: 'channel', channelId: 12345n })).rejects.toThrow(
      /never been named/,
    )
  })

  it('refuses to ask about one it only saw in passing', async () => {
    // A reduced record carries a hash that means something only where it
    // arrived. Catching up with it sends a reference Telegram refuses for a
    // reason that names the call, which is a worse answer than saying the
    // channel cannot be named at all.
    const c = client({ seededChannel: false })
    await c.peers.save({ kind: 'channel', id: 12345n, accessHash: 4n, min: true, usernames: [] })

    await expect(c.updates.recover({ kind: 'channel', channelId: 12345n })).rejects.toThrow(
      /only seen in passing/,
    )
  })
})

describe('a server that answers with something else entirely', () => {
  it('is refused rather than read as an empty catch-up', async () => {
    const server = new UpdateServer()
    const values = new Map<string, unknown>()
    const state = new UpdateState({ pts: server.pts })
    const failures: Error[] = []

    const updates = openUpdates({
      state,
      peers: peerStore({
        get: async (key: string) => values.get(key),
        set: async (key: string, value: unknown) => {
          values.set(key, value)
        },
        delete: async (key: string) => {
          values.delete(key)
        },
      }),
      invoke: async () => ({ _: 'boolTrue' }),
      onUpdate: () => {},
      onFailure: (error) => failures.push(error),
    })

    await expect(updates.recover()).rejects.toThrow(/expected a difference/)
    expect(state.pts).toBe(server.pts)
  })

  it('does not treat a refusal as a reason to move the sequence', async () => {
    const values = new Map<string, unknown>()
    const state = new UpdateState({ pts: 5 })

    const updates = openUpdates({
      state,
      peers: peerStore({
        get: async (key: string) => values.get(key),
        set: async (key: string, value: unknown) => {
          values.set(key, value)
        },
        delete: async (key: string) => {
          values.delete(key)
        },
      }),
      invoke: async () => {
        throw new TelegramError('AUTH_KEY_UNREGISTERED (401)')
      },
      onUpdate: () => {},
    })

    await expect(updates.recover()).rejects.toThrow(/AUTH_KEY_UNREGISTERED/)
    expect(state.pts).toBe(5)
  })
})

/**
 * Following a channel, which Telegram does not push updates for.
 *
 * A channel's updates reach an account only while it is looking at the channel.
 * What the protocol offers instead is the channel's difference on request, and
 * each answer says how long to wait before asking again — so following one
 * means asking repeatedly, at the server's interval rather than a chosen one.
 *
 * The scheduler is supplied, so the waiting is a step a case takes.
 */
describe('following a channel', () => {
  /**
   * Write the channel down, as encountering it would have.
   *
   * A channel is named by an access hash the account can only have learned by
   * meeting it, so one never met cannot be asked about at all. Every case here
   * is about what happens *after* that, so it is arranged rather than acted
   * out — the refusal for a channel that was never named has a case of its own
   * among the catch-up ones.
   */
  const named = async (c: ReturnType<typeof client>) => {
    await c.peers.save({
      kind: 'channel',
      id: CHANNEL,
      accessHash: 7770n,
      min: false,
      usernames: [],
    })
  }

  it('asks for the difference straight away', async () => {
    // The reason a channel was opened is that somebody wants to see it, so the
    // first fetch is now rather than after an interval.
    const c = client()
    c.server.channelMessage(CHANNEL, 101)

    await named(c)
    c.updates.watchChannel(CHANNEL)
    await settle()
    expect(c.ids()).toHaveLength(1)
  })

  it('asks again after the interval the server named', async () => {
    const c = client()
    c.server.timing = { timeout: 30 }

    await named(c)
    c.updates.watchChannel(CHANNEL)
    await settle()

    const armed = c.timers.filter((timer) => !timer.cancelled && !timer.fired)
    expect(armed).toHaveLength(1)
    expect(armed[0]?.delay).toBe(30_000)

    // What arrived while nothing was asking is what the next ask brings back.
    c.server.channelMessage(CHANNEL, 102)
    await c.elapse()

    expect(c.ids()).toHaveLength(1)
  })

  it('keeps asking, so the interval is a rhythm rather than one delay', async () => {
    const c = client()
    c.server.timing = { timeout: 10 }

    await named(c)
    c.updates.watchChannel(CHANNEL)
    await settle()

    c.server.channelMessage(CHANNEL, 103)
    await c.elapse()
    c.server.channelMessage(CHANNEL, 104)
    await c.elapse()

    expect(c.ids()).toHaveLength(2)
  })

  it('stops asking once it is no longer being followed', async () => {
    const c = client()
    c.server.timing = { timeout: 10 }

    await named(c)
    c.updates.watchChannel(CHANNEL)
    await settle()

    expect(c.updates.unwatchChannel(CHANNEL)).toBe(true)

    // The wait that was running was cancelled, so nothing will ask again.
    expect(c.timers.filter((timer) => !timer.cancelled && !timer.fired)).toHaveLength(0)
    expect(c.updates.watched()).toEqual([])
  })

  it('counts followers, so one leaving does not end another’s subscription', async () => {
    const c = client()
    c.server.timing = { timeout: 10 }

    await named(c)
    expect(c.updates.watchChannel(CHANNEL)).toBe(true)
    expect(c.updates.watchChannel(CHANNEL)).toBe(false)
    await settle()

    // The first to stop is not the last, so the subscription survives it.
    expect(c.updates.unwatchChannel(CHANNEL)).toBe(false)
    expect(c.updates.watched()).toEqual([CHANNEL])

    c.server.channelMessage(CHANNEL, 105)
    await c.elapse()
    expect(c.ids()).toHaveLength(1)

    expect(c.updates.unwatchChannel(CHANNEL)).toBe(true)
    expect(c.updates.watched()).toEqual([])
  })

  it('says nothing was following a channel that was not', async () => {
    const c = client()

    expect(c.updates.unwatchChannel(CHANNEL)).toBe(false)
  })

  it('takes a starting position from a caller that has one', async () => {
    // A channel the account has never held a position for cannot be asked for
    // a difference at all. A caller that has just read the dialog has one.
    const c = client()
    c.state.forgetChannel(CHANNEL)
    c.server.channelMessage(CHANNEL, 106)

    await named(c)
    c.updates.watchChannel(CHANNEL, 1)
    await settle()

    expect(c.failures).toEqual([])
    expect(c.ids()).toHaveLength(1)
  })

  it('keeps following after a refresh fails for a reason that may pass', async () => {
    // A channel being looked at is still being looked at after one bad
    // request, and the next interval may well succeed. Reported rather than
    // swallowed, and the subscription is not ended by it.
    const c = client()
    c.server.timing = { timeout: 10 }
    c.server.faults = { channels: new Map([[CHANNEL.toString(), 'unavailable' as const]]) }

    await named(c)
    c.updates.watchChannel(CHANNEL)
    await settle()

    expect(c.failures.map(String)).toEqual([expect.stringContaining('TIMEOUT')])
    expect(c.updates.watched()).toEqual([CHANNEL])
    expect(c.timers.filter((timer) => !timer.cancelled && !timer.fired)).toHaveLength(1)
  })

  it('stops following a channel the account is no longer in', async () => {
    // The other kind of failure. `CHANNEL_PRIVATE` says the account cannot see
    // the channel at all, and asking every ten seconds for as long as that is
    // true is nothing but requests. So following it ends, and the watcher
    // finds out the way it would anyway — the updates stop.
    const c = client()
    c.server.timing = { timeout: 10 }
    c.server.faults = { channels: new Map([[CHANNEL.toString(), 'private' as const]]) }

    await named(c)
    c.updates.watchChannel(CHANNEL)
    await settle()

    expect(c.updates.watched()).toEqual([])
    expect(c.timers.filter((timer) => !timer.cancelled && !timer.fired)).toHaveLength(0)
  })

  it('lets go of everything it was following when it closes', async () => {
    const c = client()
    c.server.timing = { timeout: 10 }

    await named(c)
    c.updates.watchChannel(CHANNEL)
    await settle()

    c.updates.close()

    expect(c.updates.watched()).toEqual([])
    expect(c.timers.filter((timer) => !timer.cancelled && !timer.fired)).toHaveLength(0)
  })
})
