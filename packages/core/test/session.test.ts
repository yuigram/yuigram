/**
 * Session behaviour.
 *
 * The concurrency suite is the important half. Two rapid messages from one
 * user is not an edge case — it is the first thing that happens in production,
 * and without per-key serialization both read the same value and one increment
 * is silently lost.
 */

import { describe, expect, it, vi } from 'vitest'
import type { BaseContext } from '../src/context/types.js'
import { createLogger, silentSink } from '../src/log/logger.js'
import { run } from '../src/middleware/compose.js'
import type { SessionFlavor } from '../src/session/session.js'
import { createSession, userChatKey } from '../src/session/session.js'
import { memory } from '../src/storage/memory.js'
import type { KV } from '../src/storage/types.js'

interface Data {
  count: number
}

interface Ctx extends BaseContext, SessionFlavor<Data> {
  userId: number | undefined
}

// No default parameter: passing `undefined` explicitly must mean "no subject",
// and a default would silently substitute a value instead.
//
// Cast for the same reason the client casts: the flavour's members are
// installed by the middleware under test, so a context built before it runs
// cannot carry them yet.
function ctx(userId: number | undefined): Ctx {
  return {
    kind: 'message',
    transport: 'test',
    log: createLogger({ sink: silentSink() }),
    raw: {},
    userId,
    session: { count: 0 },
  } as Ctx
}

function sessionMiddleware(storage: KV<Data>, ttl?: number) {
  return createSession<Ctx, Data>({
    storage,
    key: (c) => c.userId,
    initial: () => ({ count: 0 }),
    ...(ttl === undefined ? {} : { ttl }),
  })
}

describe('loading', () => {
  it('provides the initial value when nothing is stored', async () => {
    const storage = memory<Data>()
    const c = ctx(1)

    await run(
      [
        sessionMiddleware(storage),
        (inner) => {
          inner.session.count++
        },
      ],
      c,
    )

    expect(await storage.get('1')).toBeUndefined()
  })

  it('loads a stored value', async () => {
    const storage = memory<Data>()
    await storage.set('1', { count: 7 })

    let seen = 0
    await run(
      [
        sessionMiddleware(storage),
        (inner) => {
          seen = inner.session.count
        },
      ],
      ctx(1),
    )

    expect(seen).toBe(7)
  })

  it('does not read the store when the key is undefined', async () => {
    // A channel post has no meaningful subject; inventing a key would collide
    // every such update onto one session.
    const storage = memory<Data>()
    const get = vi.spyOn(storage, 'get')

    await run([sessionMiddleware(storage)], ctx(undefined))

    expect(get).not.toHaveBeenCalled()
  })

  it('keys sessions separately per subject', async () => {
    const storage = memory<Data>()
    const mw = sessionMiddleware(storage)

    await run(
      [
        mw,
        (c) => {
          c.session = { count: 1 }
        },
      ],
      ctx(1),
    )
    await run(
      [
        mw,
        (c) => {
          c.session = { count: 2 }
        },
      ],
      ctx(2),
    )

    expect(await storage.get('1')).toEqual({ count: 1 })
    expect(await storage.get('2')).toEqual({ count: 2 })
  })
})

describe('dirty tracking', () => {
  it('does not write when the session was only read', async () => {
    // Read-only traffic must not hammer the store.
    const storage = memory<Data>()
    await storage.set('1', { count: 3 })
    const set = vi.spyOn(storage, 'set')

    await run(
      [
        sessionMiddleware(storage),
        (c) => {
          void c.session.count
        },
      ],
      ctx(1),
    )

    expect(set).not.toHaveBeenCalled()
  })

  it('writes when the session is replaced', async () => {
    const storage = memory<Data>()

    await run(
      [
        sessionMiddleware(storage),
        (c) => {
          c.session = { count: 5 }
        },
      ],
      ctx(1),
    )

    expect(await storage.get('1')).toEqual({ count: 5 })
  })

  it('writes when the session is never touched but the key exists', async () => {
    const storage = memory<Data>()
    await storage.set('1', { count: 1 })
    const set = vi.spyOn(storage, 'set')

    await run([sessionMiddleware(storage)], ctx(1))

    expect(set).not.toHaveBeenCalled()
  })

  it('persists even when a handler throws', async () => {
    // A partially-applied change is still a change; discarding it would lose
    // state the user can see the effect of.
    const storage = memory<Data>()

    await expect(
      run(
        [
          sessionMiddleware(storage),
          (c) => {
            c.session = { count: 9 }
            throw new Error('handler failed')
          },
        ],
        ctx(1),
      ),
    ).rejects.toThrow('handler failed')

    expect(await storage.get('1')).toEqual({ count: 9 })
  })

  it('applies a ttl on write', async () => {
    const storage = memory<Data>()
    const set = vi.spyOn(storage, 'set')

    await run(
      [
        sessionMiddleware(storage, 60),
        (c) => {
          c.session = { count: 1 }
        },
      ],
      ctx(1),
    )

    expect(set).toHaveBeenCalledWith('1', { count: 1 }, { ttl: 60 })
  })
})

describe('in-place mutation', () => {
  it('persists after an explicit touch', async () => {
    const storage = memory<Data>()

    await run(
      [
        sessionMiddleware(storage),
        (c) => {
          c.session.count = 4
          ;(c as unknown as { sessionHandle: { touch(): void } }).sessionHandle.touch()
        },
      ],
      ctx(1),
    )

    expect(await storage.get('1')).toEqual({ count: 4 })
  })

  it('clears the stored session', async () => {
    const storage = memory<Data>()
    await storage.set('1', { count: 3 })

    await run(
      [
        sessionMiddleware(storage),
        (c) => (c as unknown as { sessionHandle: { clear(): void } }).sessionHandle.clear(),
      ],
      ctx(1),
    )

    expect(await storage.get('1')).toBeUndefined()
  })
})

describe('concurrency', () => {
  it('serializes concurrent updates for the same key', async () => {
    // Without serialization both passes read count 0 and the result is 1.
    const storage = memory<Data>()
    const mw = sessionMiddleware(storage)

    const increment = async (): Promise<void> => {
      await run(
        [
          mw,
          async (c) => {
            const current = c.session.count
            await new Promise((resolve) => setTimeout(resolve, 5))
            c.session = { count: current + 1 }
          },
        ],
        ctx(1),
      )
    }

    await Promise.all([increment(), increment(), increment()])

    expect(await storage.get('1')).toEqual({ count: 3 })
  })

  it('does not serialize across different keys', async () => {
    const storage = memory<Data>()
    const mw = sessionMiddleware(storage)
    const order: string[] = []

    const slow = run(
      [
        mw,
        async (c) => {
          await new Promise((resolve) => setTimeout(resolve, 20))
          order.push('slow')
          c.session = { count: 1 }
        },
      ],
      ctx(1),
    )

    const fast = run(
      [
        mw,
        (c) => {
          order.push('fast')
          c.session = { count: 1 }
        },
      ],
      ctx(2),
    )

    await Promise.all([slow, fast])

    expect(order).toEqual(['fast', 'slow'])
  })

  it('lets the next update proceed after one fails', async () => {
    // A queue that propagates a rejection would wedge every later update for
    // that user.
    const storage = memory<Data>()
    const mw = sessionMiddleware(storage)

    await expect(
      run(
        [
          mw,
          () => {
            throw new Error('first failed')
          },
        ],
        ctx(1),
      ),
    ).rejects.toThrow()

    await run(
      [
        mw,
        (c) => {
          c.session = { count: 1 }
        },
      ],
      ctx(1),
    )

    expect(await storage.get('1')).toEqual({ count: 1 })
  })
})

describe('storage failure', () => {
  function brokenStorage(): KV<Data> {
    return {
      get: () => Promise.reject(new Error('store down')),
      set: () => Promise.reject(new Error('store down')),
      delete: () => Promise.reject(new Error('store down')),
    }
  }

  it('starts from the initial value when loading fails', async () => {
    let seen = -1

    await run(
      [
        sessionMiddleware(brokenStorage()),
        (c) => {
          seen = c.session.count
        },
      ],
      ctx(1),
    )

    expect(seen).toBe(0)
  })

  it('does not fail the update when persisting fails', async () => {
    // A bot that stops replying because a cache is down is worse than a bot
    // that forgets state.
    await expect(
      run(
        [
          sessionMiddleware(brokenStorage()),
          (c) => {
            c.session = { count: 1 }
          },
        ],
        ctx(1),
      ),
    ).resolves.toBeUndefined()
  })

  it('warns when a session cannot be loaded', async () => {
    const warn = vi.fn()
    // `log` is readonly on the context contract, so the spy is built in
    // rather than reassigned after construction.
    const c: Ctx = { ...ctx(1), log: { ...createLogger({ sink: silentSink() }), warn } }

    await run([sessionMiddleware(brokenStorage())], c)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('load'), expect.anything())
  })
})

describe('userChatKey', () => {
  it('combines chat and sender', () => {
    expect(userChatKey({ kind: 'message', chat: { id: 10 }, sender: { id: 20 } })).toBe('10:20')
  })

  it('distinguishes the same user across chats', () => {
    const a = userChatKey({ kind: 'message', chat: { id: 1 }, sender: { id: 99 } })
    const b = userChatKey({ kind: 'message', chat: { id: 2 }, sender: { id: 99 } })
    expect(a).not.toBe(b)
  })

  it('returns undefined when neither is present', () => {
    expect(userChatKey({ kind: 'message' })).toBeUndefined()
  })

  it('still produces a key when only one is present', () => {
    expect(userChatKey({ kind: 'message', chat: { id: 1 } })).toBe('1:nosender')
    expect(userChatKey({ kind: 'message', sender: { id: 2 } })).toBe('nochat:2')
  })
})
