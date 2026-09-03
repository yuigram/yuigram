/**
 * A bot as an application holds one.
 *
 * The container in the shared layer knows nothing about bots — it holds
 * whatever has a name, a lifecycle and a way to be surrounded. These cases
 * prove a real bot is such a thing, and that the surrounding reaches the real
 * dispatch path rather than a stand-in for it: the ordering guarantee is only
 * worth anything if it holds through the dispatcher a bot actually uses.
 */

import { App, type AppClient } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { AnyEventContext } from '../src/events/types.js'
import { messageUpdate } from '../src/testing/fixtures.js'
import { mockBot } from '../src/testing/mock-bot.js'

describe('a bot as a client an application can hold', () => {
  it('satisfies the contract without being told about it', () => {
    // Structural: a bot is a client because of what it has, not because it
    // imports anything from the container's layer.
    const { bot } = mockBot()
    const client: AppClient<AnyEventContext> = bot

    expect(typeof client.name).toBe('string')
    expect(typeof client.state).toBe('string')
    expect(typeof client.start).toBe('function')
    expect(typeof client.stop).toBe('function')
    expect(typeof client.surround).toBe('function')
  })

  it('can be added to an application', () => {
    const { bot } = mockBot()
    const app = new App<AnyEventContext>()

    expect(app.add(bot)).toBe(bot)
    expect(app.client(bot.name)).toBe(bot)
  })

  it('refuses to be held by a second application', () => {
    const { bot } = mockBot()
    new App<AnyEventContext>().add(bot)

    expect(() => new App<AnyEventContext>().add(bot)).toThrow(/already held/)
  })
})

describe('application middleware around a real bot', () => {
  it('surrounds the dispatcher a bot actually uses', async () => {
    // The invariant, proved through the real dispatch path: the application is
    // outermost and a bot's own `high` middleware runs inside it.
    const trace: string[] = []
    const { bot, send } = mockBot()
    const app = new App<AnyEventContext>()
    app.add(bot)

    app.use(async (_event, next) => {
      trace.push('app:before')
      await next()
      trace.push('app:after')
    })
    bot.use(
      async (_event, next) => {
        trace.push('bot-high:before')
        await next()
        trace.push('bot-high:after')
      },
      { priority: 'high' },
    )
    bot.use(async (_event, next) => {
      trace.push('bot-normal:before')
      await next()
      trace.push('bot-normal:after')
    })
    bot.onMessage(() => {
      trace.push('handler')
    })

    await send.message('hello')

    expect(trace).toEqual([
      'app:before',
      'bot-high:before',
      'bot-normal:before',
      'handler',
      'bot-normal:after',
      'bot-high:after',
      'app:after',
    ])
  })

  it('dispatches unchanged when no application holds the bot', async () => {
    // The surrounding is opt-in. A bot used on its own behaves exactly as it
    // did before there was a container to hold it.
    const trace: string[] = []
    const { bot, send } = mockBot()
    bot.use(async (_event, next) => {
      trace.push('bot')
      await next()
    })
    bot.onMessage(() => {
      trace.push('handler')
    })

    await send.message('hello')

    expect(trace).toEqual(['bot', 'handler'])
  })

  it('lets application middleware stop an update reaching the bot', async () => {
    // The application is the outer frame, so declining to continue keeps the
    // update away from the bot's middleware and handlers alike.
    const trace: string[] = []
    const { bot, send } = mockBot()
    const app = new App<AnyEventContext>()
    app.add(bot)
    app.use(async () => {
      trace.push('app')
    })
    bot.use(async (_event, next) => {
      trace.push('bot')
      await next()
    })
    bot.onMessage(() => {
      trace.push('handler')
    })

    await send.message('hello')

    expect(trace).toEqual(['app'])
  })
})

describe('the client an event names', () => {
  it('is the bot the update arrived on', async () => {
    const { bot, send } = mockBot()
    let seen: { readonly name: string } | undefined
    bot.onMessage((message) => {
      seen = message.client
    })

    await send.message('hello')

    expect(seen).toBe(bot)
  })

  it('is the same client every update names, not a copy', async () => {
    const { bot, send } = mockBot()
    const seen: unknown[] = []
    bot.onMessage((message) => {
      seen.push(message.client)
    })

    await send.message('one')
    await send.message('two')

    expect(seen).toEqual([bot, bot])
  })

  it('tells two bots apart', async () => {
    // What an application holding several clients reads before anything else.
    const first = mockBot({ name: 'first-bot' })
    const second = mockBot({ name: 'second-bot' })
    const names: string[] = []
    for (const { bot } of [first, second]) {
      bot.onMessage((message) => {
        names.push(message.client.name)
      })
    }

    await first.send.message('one')
    await second.send.message('two')

    expect(names).toEqual(['first-bot', 'second-bot'])
  })

  it('names the bot rather than something the update carried', async () => {
    // The payload's own fields are assigned before the normalizations, so a
    // sender who puts a `client` field in an update cannot make a handler hold
    // whatever they chose.
    const { bot, send } = mockBot()
    let seen: unknown
    bot.onMessage((message) => {
      seen = message.client
    })

    const update = messageUpdate({ text: 'hello' }) as unknown as Record<string, unknown>
    const payload = update['message'] as Record<string, unknown>
    payload['client'] = { name: 'not-the-bot' }

    await send.update(update as never)

    expect(seen).toBe(bot)
  })
})

describe('a bot brought up by an application', () => {
  it('reports the state the container reads', () => {
    const { bot } = mockBot()

    expect(bot.state).toBe('idle')
  })

  it('is stopped by the container along with the rest', async () => {
    const { bot } = mockBot()
    const app = new App<AnyEventContext>()
    app.add(bot)

    expect(await app.stop()).toBe(true)
    expect(bot.state).toBe('idle')
  })

  it('keeps its own name for lookup', () => {
    const bot = Bot.fromToken('123456789:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', {
      name: 'support-bot',
    })
    const app = new App<AnyEventContext>()
    app.add(bot)

    expect(app.client('support-bot')).toBe(bot)
  })
})
