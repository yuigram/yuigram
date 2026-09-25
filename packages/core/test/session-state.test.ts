/**
 * What a session writes, and when.
 *
 * The commit point, forced writes, merging, per-write expiry and expiring
 * fields are all promises about the store, so each case reads the store back
 * rather than the value in hand. A store that serializes to JSON is used where
 * the distinction between absent, `undefined` and `null` is the point, since
 * that is what every persistent store does to a value.
 */

import { describe, expect, it } from 'vitest'
import type { BaseContext } from '../src/context/types.js'
import { CancelledError } from '../src/errors/errors.js'
import { createLogger, silentSink } from '../src/log/logger.js'
import { run } from '../src/middleware/compose.js'
import {
  createSession,
  expiring,
  type SessionCommit,
  type SessionFlavor,
  userChatKey,
} from '../src/session/session.js'
import { memory } from '../src/storage/memory.js'
import type { KV, SetOptions } from '../src/storage/types.js'

interface Data {
  count: number
  cart?: { items: string[]; note?: { text: string } }
  code?: string | undefined
  flag?: boolean | null
  gone?: string
}

interface Ctx extends BaseContext, SessionFlavor<Data | null> {
  readonly userId: number | undefined
}

const log = createLogger({ sink: silentSink() })

function ctx(userId: number | undefined): Ctx {
  return { kind: 'message', transport: 'test', client: { name: 't' }, log, raw: {}, userId } as Ctx
}

/** A store that keeps what a database would: JSON text, and the ttl it was given. */
function jsonStore() {
  const texts = new Map<string, string>()
  const ttls = new Map<string, number | undefined>()
  const store: KV<Data | null> = {
    async get(key) {
      const text = texts.get(key)
      return text === undefined ? undefined : (JSON.parse(text) as Data | null)
    },
    async set(key, value, options?: SetOptions) {
      texts.set(key, JSON.stringify(value))
      ttls.set(key, options?.ttl)
    },
    async delete(key) {
      texts.delete(key)
      ttls.delete(key)
    },
  }

  return { store, texts, ttls }
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

function sessions(
  storage: KV<Data | null>,
  options: { commit?: SessionCommit; ttl?: number; now?: () => number } = {},
) {
  return createSession<Ctx, Data | null>({
    storage,
    key: (c) => c.userId,
    initial: () => ({ count: 0 }),
    ...options,
  })
}

type Step = (c: Ctx) => unknown

async function update(storage: KV<Data | null>, step: Step, options = {}, userId = 1) {
  await run([sessions(storage, options), async (c) => void (await step(c))], ctx(userId))
}

describe('the commit point', () => {
  it('writes what a failed handler changed by default, and not when committing on success', async () => {
    const always = jsonStore()
    const onSuccess = jsonStore()
    const failing: Step = (c) => {
      ;(c.session as Data).count = 5
      throw new Error('handler failed')
    }

    await expect(update(always.store, failing)).rejects.toThrow('handler failed')
    await expect(update(onSuccess.store, failing, { commit: 'success' })).rejects.toThrow(
      'handler failed',
    )

    expect(await always.store.get('1')).toEqual({ count: 5 })
    expect(await onSuccess.store.get('1')).toBeUndefined()
  })

  it('treats a cancelled handler as one that failed, and one that caught it as one that finished', async () => {
    const { store } = jsonStore()

    await expect(
      update(
        store,
        (c) => {
          ;(c.session as Data).count = 1
          throw new CancelledError('the update was cancelled')
        },
        { commit: 'success' },
      ),
    ).rejects.toBeInstanceOf(CancelledError)
    expect(await store.get('1')).toBeUndefined()

    await update(
      store,
      (c) => {
        ;(c.session as Data).count = 2
        try {
          throw new CancelledError('the wait was cancelled')
        } catch {
          // Handled: the update itself finished.
        }
      },
      { commit: 'success' },
    )
    expect(await store.get('1')).toEqual({ count: 2 })
  })

  it('keeps what was saved before a failure, and only that', async () => {
    const { store } = jsonStore()

    await expect(
      update(
        store,
        async (c) => {
          ;(c.session as Data).count = 1
          await c.sessionHandle.save()
          ;(c.session as Data).count = 2
          throw new Error('after the save')
        },
        { commit: 'success' },
      ),
    ).rejects.toThrow('after the save')

    expect(await store.get('1')).toEqual({ count: 1 })
  })
})

describe('forced writes', () => {
  it('writes at once, leaves the session clean, and writes later changes at the end', async () => {
    const { store, texts } = jsonStore()
    const seen: Array<string | undefined> = []

    await update(store, async (c) => {
      ;(c.session as Data).count = 3
      await c.sessionHandle.save()
      seen.push(texts.get('1'))
      expect(c.sessionHandle.dirty).toBe(false)
      ;(c.session as Data).cart = { items: ['tea'] }
    })

    expect(seen).toEqual(['{"count":3}'])
    expect(await store.get('1')).toEqual({ count: 3, cart: { items: ['tea'] } })
  })

  it('reports a store that refuses a forced write to the handler that asked for it', async () => {
    const refusing: KV<Data | null> = {
      ...jsonStore().store,
      set: async () => {
        throw new Error('disk full')
      },
    }

    await expect(update(refusing, (c) => c.sessionHandle.save())).rejects.toThrow('disk full')
  })

  it('deletes a cleared session when saved, and keeps it deleted', async () => {
    const { store } = jsonStore()
    await store.set('1', { count: 9 })

    await update(store, async (c) => {
      c.sessionHandle.clear()
      await c.sessionHandle.save()
      expect(await store.get('1')).toBeUndefined()
    })

    expect(await store.get('1')).toBeUndefined()
  })
})

describe('replacing, deleting and clearing', () => {
  it('reads a cleared session as new, and writes it if it is changed again', async () => {
    const { store } = jsonStore()
    await store.set('1', { count: 9, code: 'old' })

    await update(store, (c) => {
      c.sessionHandle.clear()
      expect(c.session).toEqual({ count: 0 })
      ;(c.session as Data).count = 1
    })

    expect(await store.get('1')).toEqual({ count: 1 })
  })

  it('writes a deleted field as absent, and a field set to null as null', async () => {
    const { store, texts } = jsonStore()
    await store.set('1', { count: 1, flag: true, gone: 'x' })

    await update(store, (c) => {
      const data = c.session as Data
      delete data.gone
      data.flag = null
    })

    expect(texts.get('1')).toBe('{"count":1,"flag":null}')
  })

  it('writes a field set to undefined as absent, which is what it reads as after a restart', async () => {
    const { store } = jsonStore()

    await update(store, (c) => {
      ;(c.session as Data).code = undefined
    })

    await update(store, (c) => {
      expect('code' in (c.session as Data)).toBe(false)
    })
  })

  it('keeps a stored null as the value rather than starting over', async () => {
    const { store } = jsonStore()
    await store.set('1', null)

    await update(store, (c) => {
      expect(c.session).toBeNull()
      expect(c.sessionHandle.isNew).toBe(false)
    })
    await update(
      store,
      (c) => {
        expect(c.sessionHandle.isNew).toBe(true)
      },
      {},
      2,
    )
  })

  it('does not lose a change made through a nested object held in a variable', async () => {
    const { store } = jsonStore()

    await update(store, (c) => {
      const data = c.session as Data
      data.cart = { items: [] }
      const cart = data.cart
      cart.items.push('tea')
      cart.note = { text: 'hot' }
    })

    expect(await store.get('1')).toEqual({
      count: 0,
      cart: { items: ['tea'], note: { text: 'hot' } },
    })
  })
})

describe('merging', () => {
  it('assigns the given fields over the value, replacing nested objects rather than merging into them', async () => {
    const { store } = jsonStore()
    await store.set('1', { count: 1, cart: { items: ['tea'], note: { text: 'hot' } } })

    await update(store, (c) => {
      c.sessionHandle.merge({ code: 'a', cart: { items: ['cake'] } })
    })

    expect(await store.get('1')).toEqual({ count: 1, code: 'a', cart: { items: ['cake'] } })
  })

  it('makes the patch the value when there is nothing to merge into', async () => {
    const { store } = jsonStore()
    await store.set('1', null)

    await update(store, (c) => {
      c.sessionHandle.merge({ count: 4 })
    })

    expect(await store.get('1')).toEqual({ count: 4 })
  })
})

describe('expiry per write', () => {
  it('keeps a write for the time it names, in place of the session’s own', async () => {
    const { store, ttls } = jsonStore()

    await update(store, (c) => c.sessionHandle.set({ count: 1 }, { ttl: 30 }), { ttl: 600 })
    expect(ttls.get('1')).toBe(30)

    await update(store, (c) => c.sessionHandle.merge({ count: 2 }, { ttl: 45 }), { ttl: 600 })
    expect(ttls.get('1')).toBe(45)

    await update(store, (c) => c.sessionHandle.save({ ttl: 5 }), { ttl: 600 })
    expect(ttls.get('1')).toBe(5)

    await update(
      store,
      (c) => {
        ;(c.session as Data).count = 3
      },
      { ttl: 600 },
    )
    expect(ttls.get('1')).toBe(600)

    // Zero is a write without one, for a session whose default would expire it.
    await update(
      store,
      (c) => {
        ;(c.session as Data).count = 4
        c.sessionHandle.expireIn(0)
      },
      { ttl: 600 },
    )
    expect(ttls.get('1')).toBeUndefined()
  })

  it('refuses a time to live that is not one', async () => {
    const { store } = jsonStore()

    await expect(update(store, (c) => c.sessionHandle.expireIn(-1))).rejects.toThrow(
      /non-negative number of seconds/,
    )
    expect(() => expiring('x', Number.NaN)).toThrow(/non-negative number of milliseconds/)
  })
})

describe('expiring fields', () => {
  it('reads a field until it expires, across updates and a store that serializes', async () => {
    const time = clock()
    const { store, texts } = jsonStore()

    await update(
      store,
      (c) => {
        ;(c.session as Data).code = expiring('482913', 60_000)
      },
      { now: time.now },
    )
    expect(JSON.parse(texts.get('1') ?? '')).toEqual({
      count: 0,
      code: { $expiring: { at: time.now() + 60_000, for: 60_000 }, value: '482913' },
    })

    time.advance(59_999)
    await update(
      store,
      (c) => {
        expect((c.session as Data).code).toBe('482913')
        expect('code' in (c.session as Data)).toBe(true)
      },
      { now: time.now },
    )

    time.advance(1)
    await update(
      store,
      (c) => {
        expect('code' in (c.session as Data)).toBe(false)
        expect((c.session as Data).code).toBeUndefined()
      },
      { now: time.now },
    )

    // Dropped from the store as soon as it had expired, read or not.
    expect(texts.get('1')).toBe('{"count":0}')
  })

  it('drops an expired field on the next write even when nothing reads it', async () => {
    const time = clock()
    const { store, texts } = jsonStore()

    await update(
      store,
      (c) => {
        ;(c.session as Data).code = expiring('1', 1_000)
        ;(c.session as Data).cart = { items: [], note: expiring({ text: 'soon' }, 500) }
      },
      { now: time.now },
    )

    time.advance(2_000)
    await update(store, () => undefined, { now: time.now })

    expect(texts.get('1')).toBe('{"count":0,"cart":{"items":[]}}')
  })

  it('restarts the same allowance when the field is assigned again, and ends it on expiring(value, 0)', async () => {
    const time = clock()
    const { store } = jsonStore()
    const read = () =>
      update(store, (c) => void seen.push((c.session as Data).code), { now: time.now })
    const seen: Array<string | undefined> = []

    await update(
      store,
      (c) => {
        ;(c.session as Data).code = expiring('a', 1_000)
      },
      { now: time.now },
    )

    time.advance(800)
    await update(
      store,
      (c) => {
        ;(c.session as Data).code = 'b'
      },
      { now: time.now },
    )

    // Assigned at 800 with the same allowance, so it lasts until 1,800.
    time.advance(900)
    await read()
    time.advance(200)
    await read()
    expect(seen).toEqual(['b', undefined])

    await update(
      store,
      (c) => {
        ;(c.session as Data).code = expiring('c', 1_000)
      },
      { now: time.now },
    )
    await update(
      store,
      (c) => {
        ;(c.session as Data).code = expiring('d', 0)
      },
      { now: time.now },
    )
    time.advance(10_000)
    await read()
    expect(seen.at(-1)).toBe('d')
    expect(await store.get('1')).toEqual({ count: 0, code: 'd' })
  })

  it('expires a field during the update that set it, and reads a nested one as its value at once', async () => {
    const time = clock()
    const { store } = jsonStore()

    await update(
      store,
      (c) => {
        const data = c.session as Data
        data.cart = { items: [], note: expiring({ text: 'soon' }, 1_000) }
        expect(data.cart.note?.text).toBe('soon')

        data.code = expiring('x', 1_000)
        time.advance(1_000)
        expect(data.code).toBeUndefined()
        expect(data.cart.note).toBeUndefined()
      },
      { now: time.now },
    )

    expect(await store.get('1')).toEqual({ count: 0, cart: { items: [] } })
  })

  it('keeps a field’s expiry when a merge assigns it', async () => {
    const time = clock()
    const { store } = jsonStore()

    await update(
      store,
      (c) => {
        ;(c.session as Data).code = expiring('a', 1_000)
      },
      { now: time.now },
    )
    await update(store, (c) => c.sessionHandle.merge({ code: 'b' }), { now: time.now })

    time.advance(1_000)
    await update(
      store,
      (c) => {
        expect((c.session as Data).code).toBeUndefined()
      },
      { now: time.now },
    )
  })

  it('tracks a change made inside an expiring value', async () => {
    const time = clock()
    const { store } = jsonStore()

    await update(
      store,
      (c) => {
        ;(c.session as Data).cart = expiring({ items: [] as string[] }, 60_000)
      },
      { now: time.now },
    )
    await update(
      store,
      (c) => {
        ;(c.session as Data).cart?.items.push('tea')
      },
      { now: time.now },
    )

    const stored = (await store.get('1')) as unknown as { cart: { value: { items: string[] } } }
    expect(stored.cart.value.items).toEqual(['tea'])
  })
})

describe('scopes', () => {
  it('keeps a bot’s user and an account’s user of the same number apart in one store', async () => {
    const { store } = jsonStore()
    const middleware = createSession<Ctx & { chat?: object; sender?: object }, Data | null>({
      storage: store,
      key: userChatKey,
      initial: () => ({ count: 0 }),
    })
    const botEvent = { ...ctx(1), chat: { id: 5 }, sender: { id: 5 } }
    const accountEvent = {
      ...ctx(1),
      chat: { id: 5n, kind: 'user' },
      sender: { id: 5n, kind: 'user' },
    }

    const counting = (count: number) => (c: { session: Data | null }) => {
      ;(c.session as Data).count = count
    }

    await run([middleware, counting(1)], botEvent)
    await run([middleware, counting(2)], accountEvent)

    expect(await store.get('5:5')).toEqual({ count: 1 })
    expect(await store.get('user:5:user:5')).toEqual({ count: 2 })
  })

  it('serializes updates for one key while a forced write is in flight', async () => {
    const { store } = jsonStore()
    const slow: KV<Data | null> = {
      ...store,
      set: async (key, value, options) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        await store.set(key, value, options)
      },
    }
    const middleware = sessions(slow)
    const bump: Step = async (c) => {
      ;(c.session as Data).count += 1
      await c.sessionHandle.save()
    }

    await Promise.all(
      Array.from({ length: 5 }, () => run([middleware, async (c) => void (await bump(c))], ctx(1))),
    )

    expect(await store.get('1')).toEqual({ count: 5 })
  })
})

describe('reading only', () => {
  it('does not write a session that was only read, even with an expiring field still live', async () => {
    const time = clock()
    const writes: string[] = []
    const inner = memory<Data | null>()
    const counted: KV<Data | null> = {
      ...inner,
      set: async (key, value, options) => {
        writes.push(key)
        await inner.set(key, value, options)
      },
    }

    await update(
      counted,
      (c) => {
        ;(c.session as Data).code = expiring('x', 60_000)
      },
      { now: time.now },
    )
    await update(
      counted,
      (c) => {
        expect((c.session as Data).code).toBe('x')
      },
      { now: time.now },
    )

    expect(writes).toEqual(['1'])
  })
})
