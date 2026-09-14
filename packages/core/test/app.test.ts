/**
 * Holding several clients as one application.
 *
 * The cases that matter are about boundaries rather than plumbing. Application
 * middleware has to surround a client completely — a client's own `high`
 * middleware runs *inside* it, because priority orders a client's concerns and
 * is not a way to reach outside the client. And a container must be a
 * convenience over doing the same thing to each client rather than a supervisor
 * that couples them: one client failing to start is no reason for another to.
 *
 * Nothing here waits on a clock. Ordering is recorded as it happens.
 */

import { describe, expect, it } from 'vitest'
import { App, AppError } from '../src/app/app.js'
import type { AppClient } from '../src/app/client.js'
import { type Dispatchable, Dispatcher } from '../src/dispatch/dispatcher.js'
import { LifecycleError } from '../src/lifecycle/lifecycle.js'
import type { Middleware } from '../src/middleware/compose.js'
import type { KV } from '../src/storage/types.js'

interface Event extends Dispatchable {
  readonly kind: string
  readonly client: { readonly name: string }
}

/**
 * A client built the way a real one is: its own dispatcher, its own bands, and
 * one slot for whatever an application puts around the whole of it.
 */
class Fake implements AppClient<Event> {
  readonly name: string
  readonly dispatcher = new Dispatcher<Event>()
  state = 'idle'
  /** What happened, in order. */
  readonly trace: string[]
  /** Set when this client should refuse to start. */
  failOnStart: Error | undefined
  #surrounding: Middleware<Event> | undefined

  constructor(name: string, trace: string[] = []) {
    this.name = name
    this.trace = trace
  }

  async start(): Promise<void> {
    this.state = 'starting'
    if (this.failOnStart !== undefined) {
      this.state = 'failed'
      throw this.failOnStart
    }
    this.state = 'running'
    this.trace.push(`${this.name}:started`)
  }

  async stop(): Promise<boolean> {
    this.state = 'idle'
    this.trace.push(`${this.name}:stopped`)

    return true
  }

  surround(middleware: Middleware<Event>): void {
    if (this.#surrounding !== undefined) {
      throw new LifecycleError('already held by an application')
    }
    this.#surrounding = middleware
  }

  /** Take an update, exactly as a real client's dispatch path would. */
  async deliver(kind = 'message'): Promise<void> {
    const event: Event = { kind, client: { name: this.name } }
    if (this.#surrounding === undefined) {
      await this.dispatcher.dispatch(event)

      return
    }

    await this.#surrounding(event, async () => {
      await this.dispatcher.dispatch(event)
    })
  }
}

/** A store that keeps every key exactly as it was written, so a case can read it. */
function recording() {
  const entries = new Map<string, unknown>()

  return {
    entries,
    kv: {
      get: async (key: string) => entries.get(key),
      set: async (key: string, value: unknown) => {
        entries.set(key, value)
      },
      delete: async (key: string) => {
        entries.delete(key)
      },
    } satisfies KV,
  }
}

describe('what an application holds', () => {
  it('holds nothing until a client is added', () => {
    expect(new App<Event>().clients).toEqual([])
  })

  it('hands back the client it was given, so it can be named in one expression', () => {
    const app = new App<Event>()
    const bot = new Fake('bot')

    expect(app.add(bot)).toBe(bot)
  })

  it('keeps the order clients were added in', () => {
    // Starting and stopping visit clients in this order, so a container that
    // reordered them would make a dependency between two impossible to express.
    const app = new App<Event>()
    for (const name of ['first', 'second', 'third']) app.add(new Fake(name))

    expect(app.clients.map((client) => client.name)).toEqual(['first', 'second', 'third'])
  })

  it('finds a client by name', () => {
    const app = new App<Event>()
    const bot = app.add(new Fake('support-bot'))

    expect(app.client('support-bot')).toBe(bot)
  })

  it('says nothing for a name no client has', () => {
    const app = new App<Event>()
    app.add(new Fake('bot'))

    expect(app.client('missing')).toBeUndefined()
  })

  it('refuses two clients with one name', () => {
    // A name is how a client is found. Two sharing one would make a lookup
    // answer arbitrarily, which is worse than refusing the second.
    const app = new App<Event>()
    app.add(new Fake('bot'))

    expect(() => app.add(new Fake('bot'))).toThrow(AppError)
  })

  it('leaves the first client in place when the second is refused', () => {
    const app = new App<Event>()
    const first = app.add(new Fake('bot'))
    try {
      app.add(new Fake('bot'))
    } catch {
      // The refusal is the subject of the case above.
    }

    expect(app.clients).toEqual([first])
    expect(app.client('bot')).toBe(first)
  })

  it('cannot be held by two applications at once', () => {
    // Two owners means the second application's middleware silently replaces
    // the first's, and neither application is wrong to think it is in charge.
    const bot = new Fake('bot')
    new App<Event>().add(bot)

    expect(() => new App<Event>().add(bot)).toThrow(LifecycleError)
  })

  it('reports its clients without letting a caller change them', () => {
    const app = new App<Event>()
    app.add(new Fake('bot'))
    const taken = app.clients as Fake[]
    taken.push(new Fake('smuggled'))

    expect(app.clients).toHaveLength(1)
  })
})

describe('where application middleware runs', () => {
  it('surrounds a client completely, outside its own priority bands', async () => {
    // The invariant this whole boundary exists for. A client's `high` band
    // orders that client's concerns; it is not a way to run before the
    // application. So the application is outermost and `high` is inside it.
    const trace: string[] = []
    const app = new App<Event>()
    const bot = app.add(new Fake('bot', trace))

    app.use(async (_event, next) => {
      trace.push('app:before')
      await next()
      trace.push('app:after')
    })

    bot.dispatcher.use(
      async (_event, next) => {
        trace.push('client-high:before')
        await next()
        trace.push('client-high:after')
      },
      { priority: 'high' },
    )
    bot.dispatcher.use(async (_event, next) => {
      trace.push('client-normal:before')
      await next()
      trace.push('client-normal:after')
    })
    bot.dispatcher.on('message', () => {
      trace.push('handler')
    })

    await bot.deliver()

    expect(trace).toEqual([
      'app:before',
      'client-high:before',
      'client-normal:before',
      'handler',
      'client-normal:after',
      'client-high:after',
      'app:after',
    ])
  })

  it('runs application middleware in the order it was added', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    const bot = app.add(new Fake('bot', trace))

    app.use(async (_event, next) => {
      trace.push('one')
      await next()
    })
    app.use(async (_event, next) => {
      trace.push('two')
      await next()
    })
    bot.dispatcher.on('message', () => {
      trace.push('handler')
    })

    await bot.deliver()

    expect(trace).toEqual(['one', 'two', 'handler'])
  })

  it('reaches a client added before the middleware was', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    const bot = app.add(new Fake('bot', trace))
    app.use(async (_event, next) => {
      trace.push('app')
      await next()
    })
    bot.dispatcher.on('message', () => {
      trace.push('handler')
    })

    await bot.deliver()

    expect(trace).toEqual(['app', 'handler'])
  })

  it('reaches a client added after the middleware was', async () => {
    // Registration order must not change what the container means, because
    // neither reading of `use` before `add` is more obviously right.
    const trace: string[] = []
    const app = new App<Event>()
    app.use(async (_event, next) => {
      trace.push('app')
      await next()
    })
    const bot = app.add(new Fake('bot', trace))
    bot.dispatcher.on('message', () => {
      trace.push('handler')
    })

    await bot.deliver()

    expect(trace).toEqual(['app', 'handler'])
  })

  it('surrounds every client it holds', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    app.use(async (event, next) => {
      trace.push(`app:${event.client.name}`)
      await next()
    })
    const first = app.add(new Fake('first', trace))
    const second = app.add(new Fake('second', trace))
    for (const bot of [first, second]) {
      bot.dispatcher.on('message', () => {
        trace.push('handler')
      })
    }

    await first.deliver()
    await second.deliver()

    expect(trace).toEqual(['app:first', 'handler', 'app:second', 'handler'])
  })

  it('lets application middleware stop an update reaching the client', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    const bot = app.add(new Fake('bot', trace))
    app.use(async () => {
      trace.push('app')
      // Deliberately not calling next.
    })
    bot.dispatcher.on('message', () => {
      trace.push('handler')
    })

    await bot.deliver()

    expect(trace).toEqual(['app'])
  })

  it('dispatches normally when no application holds the client', async () => {
    const trace: string[] = []
    const bot = new Fake('bot', trace)
    bot.dispatcher.on('message', () => {
      trace.push('handler')
    })

    await bot.deliver()

    expect(trace).toEqual(['handler'])
  })

  it('lets a failure inside the client reach application middleware', async () => {
    // The application surrounds the client, so it is the outer frame and sees
    // what the client did not handle.
    const app = new App<Event>()
    const bot = app.add(new Fake('bot'))
    let seen: unknown

    app.use(async (_event, next) => {
      try {
        await next()
      } catch (error) {
        seen = error
      }
    })
    bot.dispatcher.use(async () => {
      throw new Error('the client middleware failed')
    })

    await bot.deliver()

    expect((seen as Error | undefined)?.message).toBe('the client middleware failed')
  })
})

describe('bringing an application up and down', () => {
  it('starts every client, in the order they were added', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    app.add(new Fake('first', trace))
    app.add(new Fake('second', trace))

    await app.start()

    expect(trace).toEqual(['first:started', 'second:started'])
    expect(app.clients.map((client) => client.state)).toEqual(['running', 'running'])
  })

  it('stops every client, in the order they were added', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    app.add(new Fake('first', trace))
    app.add(new Fake('second', trace))
    await app.start()
    trace.length = 0

    expect(await app.stop()).toBe(true)
    expect(trace).toEqual(['first:stopped', 'second:stopped'])
  })

  it('leaves the other clients running when one fails to start', async () => {
    // A bot that cannot reach Telegram is no reason for an unrelated account
    // to stop, and giving up on the first failure would leave the clients
    // after it untouched.
    const trace: string[] = []
    const app = new App<Event>()
    const first = app.add(new Fake('first', trace))
    const broken = app.add(new Fake('broken', trace))
    const last = app.add(new Fake('last', trace))
    broken.failOnStart = new Error('no route')
    const failures: string[] = []
    app.onError(({ client }) => failures.push(client.name))

    await app.start()

    expect(failures).toEqual(['broken'])
    expect([first.state, broken.state, last.state]).toEqual(['running', 'failed', 'running'])
    expect(trace).toEqual(['first:started', 'last:started'])
  })

  it('leaves a failed client separately manageable', async () => {
    const app = new App<Event>()
    const broken = app.add(new Fake('broken'))
    broken.failOnStart = new Error('no route')
    app.onError(() => {})
    await app.start()

    // The container reported it and moved on; the client is still a client.
    broken.failOnStart = undefined
    await broken.start()

    expect(broken.state).toBe('running')
  })

  it('tells every listener about a failure', async () => {
    const app = new App<Event>()
    const broken = app.add(new Fake('broken'))
    broken.failOnStart = new Error('no route')
    const seen: unknown[] = []
    app.onError(({ error }) => seen.push(error))
    app.onError(({ error }) => seen.push(error))

    await app.start()

    expect(seen).toHaveLength(2)
    expect((seen[0] as Error).message).toBe('no route')
  })

  it('raises a failure nobody is listening for rather than swallowing it', async () => {
    // A container that dropped it would turn a client that never started into
    // a silence, which is the failure a container is most likely to hide.
    const app = new App<Event>()
    const broken = app.add(new Fake('broken'))
    broken.failOnStart = new Error('no route')

    await expect(app.start()).rejects.toThrow(/no route/)
  })

  it('keeps stopping the rest when one client fails to stop', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    const broken = app.add(new Fake('broken', trace))
    app.add(new Fake('last', trace))
    broken.stop = async () => {
      throw new Error('would not close')
    }
    app.onError(() => {})

    expect(await app.stop()).toBe(false)
    expect(trace).toEqual(['last:stopped'])
  })

  it('reports a client that could not finish draining', async () => {
    const app = new App<Event>()
    const slow = app.add(new Fake('slow'))
    slow.stop = async () => false

    expect(await app.stop()).toBe(false)
  })

  it('starts and stops nothing when it holds nothing', async () => {
    const app = new App<Event>()

    await app.start()

    expect(await app.stop()).toBe(true)
  })

  it('does not start a client twice', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    app.add(new Fake('bot', trace))

    await app.start()
    await app.start()

    // Idempotence is the client's own contract; the container must not turn one
    // call into two transitions of its own.
    expect(trace).toEqual(['bot:started', 'bot:started'])
  })
})

describe('where an application keeps what belongs to it', () => {
  it('takes the store it is given', async () => {
    const store = recording()
    const app = new App<Event>({ storage: store.kv })

    await app.storage.set('greeting', 'hello')

    expect(await app.storage.get('greeting')).toBe('hello')
  })

  it('has a store of its own when given none', async () => {
    const app = new App<Event>()

    await app.storage.set('greeting', 'hello')

    expect(await app.storage.get('greeting')).toBe('hello')
  })

  it('keeps what it was given to itself', async () => {
    // The store goes in; areas of it come out. A container that handed back
    // what it was given would let a client reach everything in it.
    const store = recording()
    const app = new App<Event>({ storage: store.kv })

    await app.storage.set('greeting', 'hello')

    expect(store.entries.has('greeting')).toBe(false)
    expect([...store.entries.keys()]).toEqual(['app:greeting'])
  })

  it('gives a client an area of its own', async () => {
    const store = recording()
    const app = new App<Event>({ storage: store.kv })
    const client = app.add(new Fake('alice'))

    await app.storageFor(client).set('cart', 1)

    expect([...store.entries.keys()]).toEqual(['clients:alice:cart'])
  })

  it('has no area for a client it does not hold', () => {
    const app = new App<Event>({ storage: recording().kv })
    const stranger = new Fake('alice')

    expect(() => app.storageFor(stranger)).toThrow(AppError)
  })

  it('has no area for an impostor wearing a name it holds', () => {
    // Identity, not the name: two clients answering to one name would otherwise
    // share an area, which is the collision the check exists to prevent.
    const app = new App<Event>({ storage: recording().kv })
    app.add(new Fake('alice'))

    expect(() => app.storageFor(new Fake('alice'))).toThrow(AppError)
  })
})

describe('what an application keeps apart', () => {
  it('keeps a client out of what the application keeps', async () => {
    const store = recording()
    const app = new App<Event>({ storage: store.kv })
    const client = app.add(new Fake('alice'))

    await app.storage.set('secret', 'application')
    await app.storageFor(client).set('secret', 'client')

    expect(await app.storage.get('secret')).toBe('application')
    expect(await app.storageFor(client).get('secret')).toBe('client')
  })

  it('keeps two clients out of each other', async () => {
    const store = recording()
    const app = new App<Event>({ storage: store.kv })
    const alice = app.add(new Fake('alice'))
    const bob = app.add(new Fake('bob'))

    await app.storageFor(alice).set('cart', 'hers')
    await app.storageFor(bob).set('cart', 'his')

    expect(await app.storageFor(alice).get('cart')).toBe('hers')
    expect(await app.storageFor(bob).get('cart')).toBe('his')
  })

  it('keeps apart two clients whose names could be read as one area', async () => {
    // The collision a bare prefix would allow: `a` writing `b:cart` and `a:b`
    // writing `cart` both read as `clients:a:b:cart`. Names being unique does
    // not help, because these are two different names.
    const store = recording()
    const app = new App<Event>({ storage: store.kv })
    const outer = app.add(new Fake('a'))
    const inner = app.add(new Fake('a:b'))

    await app.storageFor(outer).set('b:cart', 'outer')
    await app.storageFor(inner).set('cart', 'inner')

    expect(await app.storageFor(outer).get('b:cart')).toBe('outer')
    expect(await app.storageFor(inner).get('cart')).toBe('inner')
    expect(store.entries.size).toBe(2)
  })

  it('keeps a client named after the application area out of it', async () => {
    const store = recording()
    const app = new App<Event>({ storage: store.kv })
    const client = app.add(new Fake('app'))

    await app.storage.set('secret', 'application')
    await app.storageFor(client).set('secret', 'client')

    expect(await app.storage.get('secret')).toBe('application')
    expect(store.entries.size).toBe(2)
  })

  it('keeps two applications on separate stores apart', async () => {
    const first = new App<Event>({ storage: recording().kv })
    const second = new App<Event>({ storage: recording().kv })

    await first.storage.set('greeting', 'first')
    await second.storage.set('greeting', 'second')

    expect(await first.storage.get('greeting')).toBe('first')
    expect(await second.storage.get('greeting')).toBe('second')
  })

  it('keeps two applications that were given nothing apart', async () => {
    // A store made per application rather than shared from the module. Two
    // built the same way must not find each other's keys.
    const first = new App<Event>()
    const second = new App<Event>()

    await first.storage.set('greeting', 'first')

    expect(await second.storage.get('greeting')).toBeUndefined()
  })

  it('shares one store between two applications that were given one', async () => {
    // Deliberate sharing still works, and that is the point: an area is a
    // function of nothing but the prefix, so a later run finds what an earlier
    // one left rather than a fresh and empty place.
    const store = recording()
    const first = new App<Event>({ storage: store.kv })
    const second = new App<Event>({ storage: store.kv })

    await first.storage.set('greeting', 'hello')

    expect(await second.storage.get('greeting')).toBe('hello')
  })
})

describe('what an application does to storage when it comes and goes', () => {
  it('leaves what it kept where it was across a stop and a start', async () => {
    const store = recording()
    const app = new App<Event>({ storage: store.kv })
    const client = app.add(new Fake('alice'))

    await app.start()
    await app.storage.set('greeting', 'hello')
    await app.storageFor(client).set('cart', 1)
    await app.stop()
    await app.start()

    // Nothing was replaced, cleared or re-scoped: a lifecycle moves clients,
    // not the state a container was handed.
    expect(await app.storage.get('greeting')).toBe('hello')
    expect(await app.storageFor(client).get('cart')).toBe(1)
    expect([...store.entries.keys()].toSorted()).toEqual(['app:greeting', 'clients:alice:cart'])
    await app.stop()
  })

  it('reads the same area a previous application wrote', async () => {
    // What makes the naming worth anything: a store that outlives a process
    // hands the next one back its own keys.
    const store = recording()

    const before = new App<Event>({ storage: store.kv })
    const alice = before.add(new Fake('alice'))
    await before.storageFor(alice).set('cart', 3)

    const after = new App<Event>({ storage: store.kv })
    const again = after.add(new Fake('alice'))

    expect(await after.storageFor(again).get('cart')).toBe(3)
  })
})

describe('handling an event from any client', () => {
  it('reaches a handler registered on the application', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const seen: string[] = []
    app.on('message', (event) => seen.push(event.client.name))

    await client.deliver()

    expect(seen).toEqual(['alice'])
  })

  it('reaches one registered before the client was added', async () => {
    // Registration is not a subscription to the clients present at the time: an
    // application whose handlers depended on registration order would make
    // `on` before `add` mean something different from the reverse.
    const app = new App<Event>()
    const seen: string[] = []
    app.on('message', (event) => seen.push(event.client.name))
    const client = app.add(new Fake('alice'))

    await client.deliver()

    expect(seen).toEqual(['alice'])
  })

  it('reaches one registered after the client was added', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const seen: string[] = []
    app.on('message', (event) => seen.push(event.client.name))

    await client.deliver()

    expect(seen).toEqual(['alice'])
  })

  it('hears from every client it holds', async () => {
    const app = new App<Event>()
    const alice = app.add(new Fake('alice'))
    const bob = app.add(new Fake('bob'))
    const seen: string[] = []
    app.on('message', (event) => seen.push(event.client.name))

    await alice.deliver()
    await bob.deliver()

    expect(seen).toEqual(['alice', 'bob'])
  })

  it('says which client an event arrived on', async () => {
    // The whole point of registering across clients: a handler that could not
    // tell them apart would be a handler that must not read anything specific.
    const app = new App<Event>()
    const alice = app.add(new Fake('alice'))
    const bob = app.add(new Fake('bob'))
    const seen: Array<{ name: string; kind: string }> = []
    app.on(['message', 'callback_query'], (event) =>
      seen.push({ name: event.client.name, kind: event.kind }),
    )

    await bob.deliver('callback_query')
    await alice.deliver('message')

    expect(seen).toEqual([
      { name: 'bob', kind: 'callback_query' },
      { name: 'alice', kind: 'message' },
    ])
  })

  it('runs handlers in the order they were registered', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const order: string[] = []
    app.on('message', () => order.push('first'))
    app.on('message', () => order.push('second'))

    await client.deliver()

    expect(order).toEqual(['first', 'second'])
  })

  it('runs every handler that matches, not only the first', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const ran: string[] = []
    app.on('message', () => ran.push('a'))
    app.on(['message', 'callback_query'], () => ran.push('b'))

    await client.deliver()

    expect(ran).toEqual(['a', 'b'])
  })

  it('leaves an event no handler asked for alone', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const seen: string[] = []
    app.on('callback_query', (event) => seen.push(event.kind))

    await client.deliver('message')

    expect(seen).toEqual([])
  })

  it('handles the next matching event once, when asked once', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    let count = 0
    app.once('message', () => {
      count += 1
    })

    await client.deliver()
    await client.deliver()

    expect(count).toBe(1)
  })

  it('forgets a handler that was taken off', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    let count = 0
    const handler = () => {
      count += 1
    }
    app.on('message', handler)

    expect(app.off(handler)).toBe(true)
    await client.deliver()

    expect(count).toBe(0)
  })
})

describe('where an application handler sits', () => {
  it('runs inside the application middleware and outside the client', async () => {
    const trace: string[] = []
    const app = new App<Event>()
    app.use(async (_event, next) => {
      trace.push('app middleware in')
      await next()
      trace.push('app middleware out')
    })
    app.on('message', () => trace.push('app handler'))

    const client = app.add(new Fake('alice'))
    client.dispatcher.use(async (_event, next) => {
      trace.push('client middleware in')
      await next()
      trace.push('client middleware out')
    })
    client.dispatcher.on('message', () => trace.push('client handler'))

    await client.deliver()

    expect(trace).toEqual([
      'app middleware in',
      'app handler',
      'client middleware in',
      'client handler',
      'client middleware out',
      'app middleware out',
    ])
  })

  it('does not consume the update the client would have handled', async () => {
    // Two tiers, both live. An application handler is an additional concern,
    // not a claim on the update.
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const ran: string[] = []
    app.on('message', () => ran.push('app'))
    client.dispatcher.on('message', () => ran.push('client'))

    await client.deliver()

    expect(ran).toEqual(['app', 'client'])
  })

  it('is stopped by application middleware that does not continue', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const ran: string[] = []
    app.use(async () => {
      ran.push('middleware')
    })
    app.on('message', () => ran.push('app handler'))
    client.dispatcher.on('message', () => ran.push('client handler'))

    await client.deliver()

    expect(ran).toEqual(['middleware'])
  })

  it('runs for a client that was never given handlers of its own', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const ran: string[] = []
    app.on('message', () => ran.push('app'))

    await client.deliver()

    expect(ran).toEqual(['app'])
  })
})

describe('an application handler that fails', () => {
  it('reports the failure the way a failed start is reported', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const failures: Array<{ name: string; error: unknown }> = []
    app.onError(({ client: which, error }) => failures.push({ name: which.name, error }))
    const boom = new Error('boom')
    app.on('message', () => {
      throw boom
    })

    await client.deliver()

    // One error path in an application, and it names the client the failure
    // belongs to — which is the only thing that makes it actionable.
    expect(failures).toEqual([{ name: 'alice', error: boom }])
  })

  it('raises a failure nobody is listening for', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    app.on('message', () => {
      throw new Error('boom')
    })

    await expect(client.deliver()).rejects.toThrow('boom')
  })

  it('lets the handlers after it run', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const ran: string[] = []
    app.onError(() => {})
    app.on('message', () => {
      throw new Error('boom')
    })
    app.on('message', () => ran.push('second'))

    await client.deliver()

    expect(ran).toEqual(['second'])
  })

  it('reports every failure from one update', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const failures: string[] = []
    app.onError(({ error }) => failures.push((error as Error).message))
    app.on('message', () => {
      throw new Error('first')
    })
    app.on('message', () => {
      throw new Error('second')
    })

    await client.deliver()

    expect(failures).toEqual(['first', 'second'])
  })

  it('still lets the client handle the update', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const ran: string[] = []
    app.onError(() => {})
    app.on('message', () => {
      throw new Error('boom')
    })
    client.dispatcher.on('message', () => ran.push('client'))

    await client.deliver()

    expect(ran).toEqual(['client'])
  })
})

describe('what a lifecycle does to registration', () => {
  it('keeps handlers across a stop and a start', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    let count = 0
    app.on('message', () => {
      count += 1
    })

    await app.start()
    await client.deliver()
    await app.stop()
    await app.start()
    await client.deliver()

    // Two updates, two runs. A handler registered once must not be installed
    // twice by a restart, and must not be forgotten by one either.
    expect(count).toBe(2)
    await app.stop()
  })

  it('reaches a handler registered while the application is running', async () => {
    const app = new App<Event>()
    const client = app.add(new Fake('alice'))
    const ran: string[] = []

    await app.start()
    app.on('message', () => ran.push('late'))
    await client.deliver()

    expect(ran).toEqual(['late'])
    await app.stop()
  })
})

describe('what an application is called', () => {
  it('has a name for logs', () => {
    expect(new App<Event>({ name: 'production' }).name).toBe('production')
  })

  it('has one even when none was given', () => {
    expect(new App<Event>().name).toBe('app')
  })
})
