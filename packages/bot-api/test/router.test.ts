/**
 * Routers.
 *
 * A router is only worth having if its middleware is genuinely scoped — that
 * is the property a naming convention cannot provide — and if a handler behaves
 * the same on a router as on the client. Both are checked here against the real
 * pipeline, along with the two ways a router can be got wrong: middleware that
 * runs once per matching handler instead of once per update, and a client that
 * subscribes to everything because it could not tell what the router covers.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { Bot } from '../src/bot.js'
import type { MessageContext } from '../src/events/index.js'
import { filter } from '../src/filter.js'
import type { Update } from '../src/generated/types/index.js'
import { Router, RouterInstalledError } from '../src/router.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

function client() {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 'test_bot' }))
  transport.on('getUpdates', ok([]))
  transport.on('sendMessage', (request) =>
    ok({ message_id: 9, date: 1, chat: { id: 1, type: 'private' }, text: request.params['text'] }),
  )
  transport.on('answerCallbackQuery', ok(true))

  const bot = Bot.fromToken(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })

  return { bot, transport }
}

function messageUpdate(text: string, id = 1): Update {
  return {
    update_id: id,
    message: {
      message_id: id,
      date: 1,
      chat: { id: 1, type: 'private' },
      from: { id: 7, is_bot: false, first_name: 'A' },
      text,
    },
  } as unknown as Update
}

function callbackUpdate(data: string, id = 2): Update {
  return {
    update_id: id,
    callback_query: {
      id: 'cbq',
      from: { id: 7, is_bot: false, first_name: 'A' },
      chat_instance: 'x',
      data,
    },
  } as unknown as Update
}

describe('dispatch', () => {
  it('runs a router handler for an update the client received', async () => {
    const { bot } = client()
    const seen: string[] = []

    const router = new Router()
    router.onMessage((message) => seen.push(message.text ?? ''))

    bot.extend(router)
    await bot.handleUpdate(messageUpdate('hello'))

    expect(seen).toEqual(['hello'])
  })

  it('gives a router the same registrations as the client', async () => {
    const { bot } = client()
    const seen: string[] = []

    const router = new Router()
    router.onCommand('start', (message) => seen.push(`command:${message.command.name}`))
    router.onText('ping', () => seen.push('text'))
    router.onCallbackQuery(/^buy:/, (query) => seen.push(`callback:${query.data ?? ''}`))
    router.onChatMemberJoined(() => seen.push('joined'))

    bot.extend(router)
    await bot.identify()

    await bot.handleUpdate(messageUpdate('/start'))
    await bot.handleUpdate(messageUpdate('ping'))
    await bot.handleUpdate(callbackUpdate('buy:1'))
    await bot.handleUpdate({
      update_id: 3,
      message: {
        message_id: 3,
        date: 1,
        chat: { id: -1, type: 'supergroup' },
        new_chat_members: [{ id: 8, is_bot: false, first_name: 'B' }],
      },
    } as unknown as Update)

    expect(seen).toEqual(['command:start', 'text', 'callback:buy:1', 'joined'])
  })

  it('applies the same @bot rule to a router command', async () => {
    // The rule lives in one place precisely so a router cannot get it wrong:
    // answering a command addressed to another bot is the classic group bug.
    const { bot } = client()
    const seen: string[] = []

    const router = new Router()
    router.onCommand('start', () => seen.push('start'))

    bot.extend(router)
    await bot.identify()

    await bot.handleUpdate(messageUpdate('/start@test_bot', 1))
    await bot.handleUpdate(messageUpdate('/start@other_bot', 2))

    expect(seen).toEqual(['start'])
  })

  it('runs client and router handlers for the same update', async () => {
    const { bot } = client()
    const seen: string[] = []

    const router = new Router()
    router.onMessage(() => seen.push('router'))

    bot.onMessage(() => seen.push('client'))
    bot.extend(router)

    await bot.handleUpdate(messageUpdate('x'))

    expect(seen).toEqual(['client', 'router'])
  })
})

describe('scoped middleware', () => {
  it('runs only for updates the router handles', async () => {
    // The whole reason a router exists rather than a naming convention.
    const { bot } = client()
    const gate = vi.fn(async (_event: unknown, next: () => Promise<void>) => next())

    const router = new Router()
    router.use(gate)
    router.onCallbackQuery(() => {})

    bot.extend(router)

    await bot.handleUpdate(messageUpdate('not for the router'))
    expect(gate).not.toHaveBeenCalled()

    await bot.handleUpdate(callbackUpdate('anything'))
    expect(gate).toHaveBeenCalledOnce()
  })

  it('runs once per update, not once per matching handler', async () => {
    // Registering the router's handlers directly onto the client would run its
    // middleware once each — a rate limiter would charge one message three
    // times because three handlers wanted it.
    const { bot } = client()
    const gate = vi.fn(async (_event: unknown, next: () => Promise<void>) => next())

    const router = new Router()
    router.use(gate)
    router.onMessage(() => {})
    router.onMessage(() => {})
    router.onMessage(() => {})

    bot.extend(router)
    await bot.handleUpdate(messageUpdate('x'))

    expect(gate).toHaveBeenCalledOnce()
  })

  it('runs inside the client middleware, not beside it', async () => {
    const { bot } = client()
    const order: string[] = []

    const router = new Router()
    router.use(async (_event, next) => {
      order.push('router:in')
      await next()
      order.push('router:out')
    })
    router.onMessage(() => order.push('handler'))

    bot.use(async (_event, next) => {
      order.push('client:in')
      await next()
      order.push('client:out')
    })
    bot.extend(router)

    await bot.handleUpdate(messageUpdate('x'))

    expect(order).toEqual(['client:in', 'router:in', 'handler', 'router:out', 'client:out'])
  })
})

describe('subscription', () => {
  it('narrows allowed_updates to what the router covers', async () => {
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))
    transport.on('getUpdates', ok([]))

    const bot = Bot.fromToken(TOKEN, {
      client: transport,
      allowedUpdates: 'auto',
      log: createLogger({ sink: silentSink() }),
    })

    const router = new Router()
    router.onCallbackQuery(() => {})
    bot.extend(router)

    await bot.poll()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await bot.stop({ timeout: 100 })

    expect(transport.last('getUpdates')?.params['allowed_updates']).toEqual(['callback_query'])
  })

  it('widens when the router cannot say what it covers', async () => {
    // A filter with no kind hint may match anything, so skipping a kind would
    // drop updates a handler wanted.
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))
    transport.on('getUpdates', ok([]))

    const bot = Bot.fromToken(TOKEN, {
      client: transport,
      allowedUpdates: 'auto',
      log: createLogger({ sink: silentSink() }),
    })

    const router = new Router()
    router.on(
      filter<MessageContext>('anything', () => true),
      () => {},
    )
    bot.extend(router)

    await bot.poll()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await bot.stop({ timeout: 100 })

    const asked = transport.last('getUpdates')?.params['allowed_updates'] as string[]
    expect(asked.length).toBeGreaterThan(10)
  })
})

describe('errors', () => {
  it('sends a failure to the client when the router has no handler for it', async () => {
    const { bot } = client()
    const seen: unknown[] = []

    const router = new Router()
    router.onMessage(() => {
      throw new Error('boom')
    })

    bot.onError((error) => seen.push(error))
    bot.extend(router)

    await bot.handleUpdate(messageUpdate('x'))

    expect(seen).toHaveLength(1)
    expect((seen[0] as Error).message).toBe('boom')
  })

  it('keeps a failure inside the router when it handles its own', async () => {
    const { bot } = client()
    const routerSaw: unknown[] = []
    const clientSaw: unknown[] = []

    const router = new Router()
    router.onError((error) => routerSaw.push(error))
    router.onMessage(() => {
      throw new Error('local')
    })

    bot.onError((error) => clientSaw.push(error))
    bot.extend(router)

    await bot.handleUpdate(messageUpdate('x'))

    expect(routerSaw).toHaveLength(1)
    expect(clientSaw).toHaveLength(0)
  })

  it('does not let one failing handler stop the rest', async () => {
    const { bot } = client()
    const seen: string[] = []

    const router = new Router()
    router.onMessage(() => {
      throw new Error('boom')
    })
    router.onMessage(() => seen.push('second'))

    bot.onError(() => {})
    bot.extend(router)

    await bot.handleUpdate(messageUpdate('x'))

    expect(seen).toEqual(['second'])
  })

  it('rethrows before installation, since nothing has claimed the error', async () => {
    const router = new Router()
    router.onMessage(() => {
      throw new Error('unowned')
    })

    await expect(router.dispatch({ kind: 'message', text: 'x' } as never)).rejects.toThrow(
      'unowned',
    )
  })
})

describe('populate, then install', () => {
  it('refuses a registration after installation', () => {
    const { bot } = client()
    const router = new Router()

    router.onMessage(() => {})
    bot.extend(router)

    // Silence here would be worse: the client has already told Telegram which
    // kinds to send, so a handler for a new kind would simply never run.
    expect(() => router.onCallbackQuery(() => {})).toThrow(RouterInstalledError)
    expect(() => router.use(async (_e, next) => next())).toThrow(RouterInstalledError)
  })

  it('refuses a second client', () => {
    const first = client()
    const second = client()
    const router = new Router()

    router.onMessage(() => {})
    first.bot.extend(router)

    expect(() => second.bot.extend(router)).toThrow(RouterInstalledError)
  })

  it('reports whether it is installed', () => {
    const { bot } = client()
    const router = new Router()
    router.onMessage(() => {})

    expect(router.installed).toBe(false)
    bot.extend(router)
    expect(router.installed).toBe(true)
  })

  it('names itself for diagnostics', () => {
    expect(new Router({ name: 'admin' }).name).toBe('admin')
    expect(new Router().name).toMatch(/^router-\d+$/)
  })
})

describe('composition', () => {
  it('installs several routers on one client', async () => {
    const { bot } = client()
    const seen: string[] = []

    const admin = new Router({ name: 'admin' })
    admin.onCommand('ban', () => seen.push('ban'))

    const shop = new Router({ name: 'shop' })
    shop.onCommand('cart', () => seen.push('cart'))

    bot.extend(admin).extend(shop)
    await bot.identify()

    await bot.handleUpdate(messageUpdate('/ban', 1))
    await bot.handleUpdate(messageUpdate('/cart', 2))

    expect(seen).toEqual(['ban', 'cart'])
  })

  it('keeps each router middleware to itself', async () => {
    const { bot } = client()
    const seen: string[] = []

    const admin = new Router()
    admin.use(async (_event, next) => {
      seen.push('admin-mw')
      await next()
    })
    admin.onCommand('ban', () => seen.push('ban'))

    const shop = new Router()
    shop.use(async (_event, next) => {
      seen.push('shop-mw')
      await next()
    })
    shop.onCallbackQuery(() => seen.push('buy'))

    bot.extend(admin).extend(shop)
    await bot.identify()

    await bot.handleUpdate(callbackUpdate('buy:1'))

    expect(seen).toEqual(['shop-mw', 'buy'])
  })
})

describe('plugins', () => {
  it('installs a middleware plugin, scoped to what it handles', async () => {
    // The same `session()` that installs on a client installs here, which is
    // how a feature gets its own state without the rest of the application
    // carrying it.
    const { bot } = client()
    const seen: string[] = []

    const router = new Router()
    router.extend({
      name: 'tracer',
      install(host) {
        host.use((async (_event: unknown, next: () => Promise<void>) => {
          seen.push('plugin')
          await next()
        }) as never)
        return undefined
      },
    })
    router.onMessage(() => seen.push('handler'))

    bot.extend(router)

    await bot.handleUpdate(callbackUpdate('not a message'))
    expect(seen).toEqual([])

    await bot.handleUpdate(messageUpdate('x'))
    expect(seen).toEqual(['plugin', 'handler'])
  })

  it('refuses a plugin after installation, like any other registration', () => {
    const { bot } = client()
    const router = new Router()
    router.onMessage(() => {})
    bot.extend(router)

    expect(() => router.extend({ name: 'late', install: () => undefined })).toThrow(
      RouterInstalledError,
    )
  })
})
