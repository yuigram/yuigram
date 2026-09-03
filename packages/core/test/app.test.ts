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
import type { AppClient } from '../src/app/index.js'
import { App, AppError } from '../src/app/index.js'
import { type Dispatchable, Dispatcher } from '../src/dispatch/dispatcher.js'
import { LifecycleError } from '../src/lifecycle/lifecycle.js'
import type { Middleware } from '../src/middleware/compose.js'

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

describe('what an application is called', () => {
  it('has a name for logs', () => {
    expect(new App<Event>({ name: 'production' }).name).toBe('production')
  })

  it('has one even when none was given', () => {
    expect(new App<Event>().name).toBe('app')
  })
})
