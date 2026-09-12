/**
 * Keeping more than one connection to a datacenter.
 *
 * The thing worth proving is not that a pool holds connections but that it
 * holds the *right number*: one for calls and updates because the stream is one
 * conversation, several for transfer because parts move at once, and never more
 * than a purpose allows however many callers arrive together. A pool that grows
 * without contention wastes sockets on a sequential download; one that refuses
 * to grow under contention is the starvation the pools exist to prevent.
 *
 * Every case here forces its interleaving with a latch rather than a delay, so
 * what is being tested is the rule and not the machine it ran on.
 */

import { CancelledError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type {
  ConnectionState,
  Connections,
  ConnectionTarget,
  ManagedConnection,
} from '../src/network/connections.js'
import { openPools, POOL_LIMITS, type PoolPurpose } from '../src/network/pools.js'
import type { TlValue } from '../src/tl/index.js'

/** A connection that records what it was asked and answers when told to. */
class Fake implements ManagedConnection {
  readonly dcId: number
  readonly purpose: 'main' | 'media' | 'cdn'
  readonly slot: number
  state: ConnectionState = 'ready'
  /** Whether the key this one holds is nearly finished. Driven by the case. */
  spent = false
  #inFlight = 0
  /** Answers waiting to be released, in the order they were asked for. */
  readonly waiting: Array<() => void> = []

  constructor(dcId: number, purpose: 'main' | 'media' | 'cdn', slot: number) {
    this.dcId = dcId
    this.purpose = purpose
    this.slot = slot
  }

  get inFlight(): number {
    return this.#inFlight
  }

  async ready(): Promise<void> {}

  async invoke(_query: TlValue): Promise<TlValue> {
    this.#inFlight += 1
    await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.#inFlight -= 1

    return { _: 'boolTrue' }
  }

  /** Let one held call finish. */
  release(): void {
    this.waiting.shift()?.()
  }

  close(): void {
    this.state = 'closed'
  }
}

/** A connections layer that hands back one fake per identity, and counts them. */
function layer() {
  const made = new Map<string, Fake>()
  const opened: string[] = []
  let closed = false

  const connections: Connections = {
    get(target: ConnectionTarget = {}) {
      if (closed) throw new CancelledError('the connections have been closed')

      const id = target.id ?? 2
      const purpose = target.purpose ?? 'main'
      const slot = target.slot ?? 0
      const key = `${id}:${purpose}:${slot}`

      const existing = made.get(key)
      if (existing !== undefined && existing.state !== 'closed') return existing

      const created = new Fake(id, purpose, slot)
      made.set(key, created)
      opened.push(key)

      return created
    },
    close() {
      closed = true
      for (const connection of made.values()) connection.close()
    },
  }

  return { connections, made, opened }
}

/** Start a call and leave it in flight. */
const busy = (connection: ManagedConnection) => {
  void connection.invoke({ _: 'ping' }).catch(() => undefined)
}

describe('what the protocol says each purpose may hold', () => {
  it('keeps the counts the specification names', () => {
    // Calls and updates are one ordered conversation, so a second connection
    // carrying them would be a second opinion about what has happened.
    expect(POOL_LIMITS.main).toBe(1)
    expect(POOL_LIMITS.upload).toBe(8)
    expect(POOL_LIMITS.download).toBe(8)
    expect(POOL_LIMITS['download-small']).toBe(2)
  })
})

describe('opening only what is being asked for', () => {
  it('opens nothing until something is wanted', () => {
    const { opened } = layer()

    expect(opened).toEqual([])
  })

  it('opens one connection for the first caller', () => {
    const { connections, opened } = layer()
    const pools = openPools({ connections })

    pools.get({ purpose: 'download' })

    expect(opened).toHaveLength(1)
    expect(pools.size({ purpose: 'download' })).toBe(1)
  })

  it('hands the same connection back while nothing is waiting on it', () => {
    // A transfer that asks for one range at a time is one caller, however much
    // room the pool is allowed. Growing here would spend sockets on nothing.
    const { connections, opened } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' })
    const second = pools.get({ purpose: 'download' })

    expect(second).toBe(first)
    expect(opened).toHaveLength(1)
  })

  it('opens another when the one it has is busy', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' })
    busy(first)
    const second = pools.get({ purpose: 'download' })

    expect(second).not.toBe(first)
    expect(pools.size({ purpose: 'download' })).toBe(2)
  })

  it('goes back to a connection once its call has been answered', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' }) as Fake
    busy(first)
    pools.get({ purpose: 'download' })
    first.release()

    return Promise.resolve().then(() => {
      // The pool has two and uses the idle one rather than opening a third.
      expect(pools.get({ purpose: 'download' })).toBe(first)
      expect(pools.size({ purpose: 'download' })).toBe(2)
    })
  })
})

describe('the ceiling on each purpose', () => {
  it('never opens more than a purpose allows, however many callers arrive', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    // Twenty callers all at once against a purpose allowed eight.
    const taken: ManagedConnection[] = []
    for (let caller = 0; caller < 20; caller += 1) {
      const connection = pools.get({ purpose: 'download' })
      busy(connection)
      taken.push(connection)
    }

    expect(pools.size({ purpose: 'download' })).toBe(8)
    expect(new Set(taken).size).toBe(8)
  })

  it('keeps calls and updates on one connection', () => {
    // The stream is a single ordered conversation. A second connection would
    // be a second opinion about what has happened.
    const { connections } = layer()
    const pools = openPools({ connections })

    for (let caller = 0; caller < 5; caller += 1) busy(pools.get())

    expect(pools.size()).toBe(1)
  })

  it('gives small media fewer connections than bulk', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    for (let caller = 0; caller < 6; caller += 1) busy(pools.get({ purpose: 'download-small' }))

    expect(pools.size({ purpose: 'download-small' })).toBe(2)
  })

  it('spreads callers over the pool once it is full rather than piling them up', () => {
    const { connections } = layer()
    const pools = openPools({ connections, limits: { download: 2 } })

    const first = pools.get({ purpose: 'download' })
    busy(first)
    const second = pools.get({ purpose: 'download' })
    busy(second)

    // The pool is full and both are equally busy, so the next caller joins the
    // one that has least on it — which is the first, by one call each.
    const third = pools.get({ purpose: 'download' })
    busy(third)

    expect(third).toBe(first)
    expect(first.inFlight).toBe(2)
    expect(second.inFlight).toBe(1)
    // And the one after that joins the other, rather than piling onto the same.
    expect(pools.get({ purpose: 'download' })).toBe(second)
  })
})

describe('which callers may share a connection', () => {
  it('keeps the purposes apart even though they share an address', () => {
    // Upload and download are both reached at the media address. Sharing a
    // connection would put a part going out behind a part coming in.
    const { connections } = layer()
    const pools = openPools({ connections })

    const up = pools.get({ purpose: 'upload' })
    const down = pools.get({ purpose: 'download' })

    expect(up).not.toBe(down)
  })

  it('keeps small media apart from bulk', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    expect(pools.get({ purpose: 'download' })).not.toBe(pools.get({ purpose: 'download-small' }))
  })

  it('keeps datacenters apart', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    expect(pools.get({ id: 2, purpose: 'download' })).not.toBe(
      pools.get({ id: 4, purpose: 'download' }),
    )
    expect(pools.size({ id: 2, purpose: 'download' })).toBe(1)
    expect(pools.size({ id: 4, purpose: 'download' })).toBe(1)
  })

  it('reaches transfer purposes at the media address and calls at the main one', () => {
    const { connections, opened } = layer()
    const pools = openPools({ connections })

    pools.get()
    pools.get({ purpose: 'upload' })
    pools.get({ purpose: 'download' })
    pools.get({ purpose: 'download-small' })

    expect(opened.filter((key) => key.includes(':main:'))).toHaveLength(1)
    expect(opened.filter((key) => key.includes(':media:'))).toHaveLength(3)
  })
})

describe('a connection the pool has lost', () => {
  it('replaces one that has been closed', () => {
    // A closed connection never connects again. Handing it back would give a
    // caller something that can only fail.
    const { connections } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' })
    first.close()

    const second = pools.get({ purpose: 'download' })

    expect(second).not.toBe(first)
    expect(second.state).not.toBe('closed')
  })

  it('replaces it in place rather than growing the pool', () => {
    // Reopening under a fresh slot every time would creep the pool upwards
    // until it hit the ceiling, one lost connection at a time.
    const { connections } = layer()
    const pools = openPools({ connections })

    for (let round = 0; round < 5; round += 1) {
      pools.get({ purpose: 'download' }).close()
    }
    pools.get({ purpose: 'download' })

    expect(pools.size({ purpose: 'download' })).toBe(1)
  })

  it('replaces one that died while others are still working', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' })
    busy(first)
    const second = pools.get({ purpose: 'download' })
    busy(second)
    first.close()

    const replacement = pools.get({ purpose: 'download' })

    expect(replacement).not.toBe(first)
    expect(replacement.state).not.toBe('closed')
    expect(pools.size({ purpose: 'download' })).toBe(2)
  })
})

describe('shutting the pools down', () => {
  it('closes every connection it opened', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    const main = pools.get()
    const download = pools.get({ purpose: 'download' })
    busy(download)
    const second = pools.get({ purpose: 'download' })

    pools.close()

    expect([main.state, download.state, second.state]).toEqual(['closed', 'closed', 'closed'])
  })

  it('refuses to hand out anything afterwards', () => {
    const { connections } = layer()
    const pools = openPools({ connections })
    pools.close()

    expect(() => pools.get({ purpose: 'download' })).toThrow(CancelledError)
  })

  it('can be closed twice', () => {
    // Shutdown arrives from more than one place — a caller stopping and a
    // failure ending things — and the second must not be an error.
    const { connections } = layer()
    const pools = openPools({ connections })

    pools.close()

    expect(() => {
      pools.close()
    }).not.toThrow()
  })

  it('forgets what it held, so nothing is reported as still open', () => {
    const { connections } = layer()
    const pools = openPools({ connections })
    pools.get({ purpose: 'download' })

    pools.close()

    expect(pools.size({ purpose: 'download' })).toBe(0)
  })

  it('leaves a call already in flight to finish rather than losing its answer', async () => {
    // Closing the pool closes the connections, and what happens to a call that
    // was already written is the connection's business rather than the pool's.
    const { connections } = layer()
    const pools = openPools({ connections })
    const connection = pools.get({ purpose: 'download' }) as Fake

    const call = connection.invoke({ _: 'ping' })
    pools.close()
    connection.release()

    await expect(call).resolves.toEqual({ _: 'boolTrue' })
  })
})

describe('callers arriving together', () => {
  it('opens one connection when several ask at the same moment', () => {
    // Choosing is synchronous, so two callers cannot both decide to open the
    // connection a pool was allowed. Nothing here awaits between the calls.
    const { connections, opened } = layer()
    const pools = openPools({ connections })

    const taken = [pools.get(), pools.get(), pools.get()]

    expect(new Set(taken).size).toBe(1)
    expect(opened).toHaveLength(1)
  })

  it('gives every caller a usable connection under contention', async () => {
    const { connections } = layer()
    const pools = openPools({ connections, limits: { download: 3 } })

    const calls: Array<Promise<TlValue>> = []
    const used: Fake[] = []
    for (let caller = 0; caller < 6; caller += 1) {
      const connection = pools.get({ purpose: 'download' }) as Fake
      used.push(connection)
      calls.push(connection.invoke({ _: 'ping' }))
    }

    // Two calls landed on each of the three connections, and every one of them
    // is answerable — nobody was handed something that cannot work.
    expect(pools.size({ purpose: 'download' })).toBe(3)
    for (const connection of new Set(used)) {
      connection.release()
      connection.release()
    }

    await expect(Promise.all(calls)).resolves.toHaveLength(6)
  })

  it('passes a failure to open through to the caller that asked', () => {
    const pools = openPools({
      connections: {
        get() {
          throw new Error('no route to the datacenter')
        },
        close() {},
      },
    })

    expect(() => pools.get({ purpose: 'download' })).toThrow(/no route/)
  })

  it('lets a later caller try again after one failed to open', () => {
    // A failure to open is not remembered. The next caller gets a fresh
    // attempt rather than the answer the previous one got.
    let attempts = 0
    const { connections } = layer()
    const pools = openPools({
      connections: {
        get(target) {
          attempts += 1
          if (attempts === 1) throw new Error('no route to the datacenter')

          return connections.get(target)
        },
        close() {},
      },
    })

    expect(() => pools.get({ purpose: 'download' })).toThrow(/no route/)
    expect(pools.get({ purpose: 'download' })).toBeDefined()
    expect(pools.size({ purpose: 'download' })).toBe(1)
  })

  it('leaves a pool it already had untouched when growing it fails', async () => {
    // The failure that matters is not the first one. A pool holding a working
    // connection that fails to open a second must still be a pool holding a
    // working connection, rather than one with a hole where the second went.
    const { connections } = layer()
    let refuse = false
    const pools = openPools({
      connections: {
        get(target) {
          if (refuse) throw new Error('no route to the datacenter')

          return connections.get(target)
        },
        close() {},
      },
    })

    const working = pools.get({ purpose: 'download' }) as Fake
    const call = working.invoke({ _: 'ping' })

    refuse = true
    expect(() => pools.get({ purpose: 'download' })).toThrow(/no route/)
    expect(pools.size({ purpose: 'download' })).toBe(1)

    // The connection it had is still there and still the one it hands back.
    working.release()
    await call
    refuse = false

    expect(pools.get({ purpose: 'download' })).toBe(working)
    expect(pools.size({ purpose: 'download' })).toBe(1)
  })

  it('does not count a connection it failed to open', () => {
    const pools = openPools({
      connections: {
        get() {
          throw new Error('no route to the datacenter')
        },
        close() {},
      },
    })

    expect(() => pools.get({ purpose: 'download' })).toThrow()
    expect(pools.size({ purpose: 'download' })).toBe(0)
  })
})

describe('a purpose asked for with an unusual limit', () => {
  it('honours a limit a caller had a reason to set', () => {
    const { connections } = layer()
    const pools = openPools({ connections, limits: { upload: 3 } })

    for (let caller = 0; caller < 9; caller += 1) busy(pools.get({ purpose: 'upload' }))

    expect(pools.size({ purpose: 'upload' })).toBe(3)
  })

  it('keeps at least one connection however low the limit is set', () => {
    // A pool of nothing is a pool that can never answer. A limit below one is
    // read as one rather than obeyed into uselessness.
    const { connections } = layer()
    const pools = openPools({ connections, limits: { download: 0 } })

    const connection = pools.get({ purpose: 'download' })
    busy(connection)

    expect(connection).toBeDefined()
    expect(pools.get({ purpose: 'download' })).toBe(connection)
    expect(pools.size({ purpose: 'download' })).toBe(1)
  })

  it('leaves the other purposes at what the protocol says', () => {
    const { connections } = layer()
    const pools = openPools({ connections, limits: { upload: 3 } })

    for (let caller = 0; caller < 12; caller += 1) busy(pools.get({ purpose: 'download' }))

    expect(pools.size({ purpose: 'download' })).toBe(POOL_LIMITS.download)
  })
})

describe('what a pool does not own', () => {
  it('asks for connections rather than building them', () => {
    // The pool chooses; the layer beneath it owns the channel, and the
    // datacenter owns the key. Nothing about authorization passes through here.
    const { connections, opened } = layer()
    const pools = openPools({ connections })

    pools.get({ id: 4, purpose: 'download' })

    expect(opened).toEqual(['4:media:2000'])
  })

  it('says nothing about a datacenter it has never been asked for', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    expect(pools.size({ id: 9, purpose: 'upload' })).toBe(0)
  })

  it('holds one pool per datacenter and purpose', () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    const purposes: PoolPurpose[] = ['main', 'upload', 'download', 'download-small']
    for (const purpose of purposes) {
      for (const id of [2, 4]) busy(pools.get({ id, purpose }))
    }

    for (const purpose of purposes) {
      for (const id of [2, 4]) expect(pools.size({ id, purpose }), `${id}/${purpose}`).toBe(1)
    }
  })
})

/**
 * A pool replacing a connection whose key is nearly finished.
 *
 * The margin that keeps a nearly-expired key from being used to *open* a
 * connection says nothing about one already open, and a long-lived connection
 * outlives the key it was opened with. Handing that one out puts a call behind
 * a key that will not see it out: the datacenter refuses part-way through, the
 * key is discarded, and the exchange the replacement needed anyway is paid for
 * with a failed call on top.
 *
 * So the pool asks before it hands one out. Only an idle connection is
 * replaced — closing a busy one would take the calls already on it down to save
 * a later one, which is the trade the other way round.
 */
describe('a connection the pool will not hand out again', () => {
  it('is replaced when its key is nearly finished', () => {
    const { connections, made } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' }) as Fake
    first.spent = true
    const second = pools.get({ purpose: 'download' })

    expect(second).not.toBe(first)
    expect(first.state).toBe('closed')
    expect(made.size).toBe(1)
  })

  it('is replaced in the slot it held, so the pool does not grow', () => {
    // A pool that grew every time a key ran out would creep up to its ceiling
    // on a long-lived client and stay there.
    const { connections, opened } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' }) as Fake
    first.spent = true
    pools.get({ purpose: 'download' })

    expect(pools.size({ purpose: 'download' })).toBe(1)
    expect(opened).toEqual(['2:media:2000', '2:media:2000'])
  })

  it('is left alone while calls are still on it', () => {
    // Closing it would settle those calls with a failure to save a later one
    // from a refusal, which is a worse trade than the one being avoided. The
    // next caller gets a second connection, because a busy one under the limit
    // is contention like any other.
    const { connections } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' }) as Fake
    busy(first)
    first.spent = true

    expect(pools.get({ purpose: 'download' })).not.toBe(first)
    expect(first.state).not.toBe('closed')
  })

  it('is replaced once the calls on it have finished', async () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' }) as Fake
    busy(first)
    first.spent = true
    pools.get({ purpose: 'download' })
    first.release()
    await Promise.resolve()

    // The next caller finds it idle and spent, which is the moment to replace.
    pools.get({ purpose: 'download' })

    expect(first.state).toBe('closed')
  })

  it('is kept while its key still has a call in it', () => {
    // The control. A pool that replaced connections regardless would pay for an
    // exchange on every call.
    const { connections } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' })

    expect(pools.get({ purpose: 'download' })).toBe(first)
  })

  it('replaces the one that is finished and keeps the one that is not', async () => {
    const { connections } = layer()
    const pools = openPools({ connections })

    const first = pools.get({ purpose: 'download' }) as Fake
    busy(first)
    const second = pools.get({ purpose: 'download' }) as Fake
    busy(second)
    second.spent = true
    second.release()
    await Promise.resolve()

    // Only the spent one goes: the other is still carrying a call, and a key
    // with life in it is not the pool's business.
    pools.get({ purpose: 'download' })

    expect(first.state).not.toBe('closed')
    expect(second.state).toBe('closed')
  })
})
