/**
 * The Bot client, end to end.
 *
 * These drive the real pipeline — transport, normalization, dispatch,
 * lifecycle — with only the network replaced. A test that bypassed dispatch
 * would prove nothing about what a user's handlers actually see.
 */

import { createLogger, defineFilter, definePlugin, silentSink } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { Bot } from '../src/bot.js'
import type { MessageContext } from '../src/events/index.js'
import { filter } from '../src/filter.js'
import { callbackQueryUpdate, memberJoinedUpdate, messageUpdate } from '../src/testing/fixtures.js'
import { apiError, mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

/** A bot wired to a mock transport, with polling never started. */
function testBot(): { bot: Bot; transport: ReturnType<typeof mockTransport> } {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'Bot', username: 'test_bot' }))
  transport.on('sendMessage', ok({ message_id: 100 }))

  const bot = new Bot(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })

  return { bot, transport }
}

describe('dispatch', () => {
  it('routes an update to a matching handler', async () => {
    const { bot } = testBot()
    const seen: string[] = []

    bot.on('message', (ctx) => {
      seen.push(ctx.text ?? '')
    })

    await bot.handleUpdate(messageUpdate({ text: 'hello' }))

    expect(seen).toEqual(['hello'])
  })

  it('routes a promoted service message to its own kind', async () => {
    // The whole point of promotion: a member join never reaches a message
    // handler, so no defensive branching is needed there.
    const { bot } = testBot()
    const seen: string[] = []

    bot.on('message', () => seen.push('message'))
    bot.on('chat_member_joined', () => seen.push('joined'))

    await bot.handleUpdate(memberJoinedUpdate())

    expect(seen).toEqual(['joined'])
  })

  it('runs middleware around handlers', async () => {
    const { bot } = testBot()
    const trail: string[] = []

    bot.use(async (_ctx, next) => {
      trail.push('before')
      await next()
      trail.push('after')
    })
    bot.on('message', () => {
      trail.push('handler')
    })

    await bot.handleUpdate(messageUpdate({ text: 'x' }))

    expect(trail).toEqual(['before', 'handler', 'after'])
  })

  it('supports filters', async () => {
    const { bot } = testBot()
    // Named through the subsystem's own `filter`, so the predicate receives a
    // context rather than `unknown` and the cast `defineFilter` would need
    // disappears.
    const hasText = filter<MessageContext, { text: string }>(
      'hasText',
      (message) => message.text !== undefined,
    )
    const seen: string[] = []

    bot.on(hasText, (message) => seen.push(message.text))

    await bot.handleUpdate(messageUpdate({ text: 'yes' }))
    await bot.handleUpdate(memberJoinedUpdate())

    expect(seen).toEqual(['yes'])
  })

  it('removes a handler', async () => {
    const { bot } = testBot()
    const handler = vi.fn()

    bot.on('message', handler)
    expect(bot.off(handler)).toBe(true)

    await bot.handleUpdate(messageUpdate({ text: 'x' }))

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('context', () => {
  it('exposes the normalized fields', async () => {
    const { bot } = testBot()
    let captured: MessageContext<'message'> | undefined

    bot.on('message', (ctx) => {
      captured = ctx
    })
    await bot.handleUpdate(messageUpdate({ text: 'hi' }))

    expect(captured?.transport).toBe('bot-api')
    expect(captured?.kind).toBe('message')
    expect(captured?.text).toBe('hi')
    expect(captured?.chat).toBeDefined()
    expect(captured?.sender).toBeDefined()
  })

  it('sends a reply to the originating chat', async () => {
    const { bot, transport } = testBot()

    bot.on('message', (ctx) => ctx.reply('pong'))
    const update = messageUpdate({ text: 'ping' })
    await bot.handleUpdate(update)

    expect(transport.last('sendMessage')?.params).toMatchObject({
      chat_id: update.message?.chat.id,
      text: 'pong',
    })
  })

  it('forwards reply parameters', async () => {
    const { bot, transport } = testBot()

    bot.on('message', (ctx) => ctx.reply('hi', { parse_mode: 'HTML' }))
    await bot.handleUpdate(messageUpdate({ text: 'x' }))

    expect(transport.last('sendMessage')?.params['parse_mode']).toBe('HTML')
  })

  it('offers no message actions on a kind that can never reach a chat', async () => {
    // A poll update carries no chat, so replying is not a runtime failure to
    // explain — it is a call the type refuses. The check here is the runtime
    // half: nothing is attached that the type says is absent.
    const { bot } = testBot()
    let context: object | undefined

    bot.on('poll', (event) => {
      context = event
    })

    await bot.handleUpdate({ update_id: 1, poll: { id: '1', question: 'q' } } as never)

    expect(context).toBeDefined()
    expect(context).not.toHaveProperty('reply')
    expect(context).not.toHaveProperty('send')
    expect(context).not.toHaveProperty('delete')
  })

  it('exposes the raw api for anything unwrapped', async () => {
    const { bot, transport } = testBot()
    transport.on('answerCallbackQuery', ok(true))

    bot.on('callback_query', async (ctx) => {
      await ctx.api.answerCallbackQuery({ callback_query_id: '1', text: 'done' })
    })

    await bot.handleUpdate(callbackQueryUpdate({ data: 'x' }))

    expect(transport.last('answerCallbackQuery')?.params['text']).toBe('done')
  })
})

describe('plugins', () => {
  it('installs plugins on start', async () => {
    const { bot, transport } = testBot()
    transport.on('getUpdates', ok([]))
    const install = vi.fn(() => undefined)

    bot.extend(definePlugin<'metrics', undefined, Bot>({ name: 'metrics', install }))
    expect(install).not.toHaveBeenCalled()

    await bot.poll()
    await bot.stop()

    expect(install).toHaveBeenCalledOnce()
  })

  it('contributes lazily to every context', async () => {
    const { bot } = testBot()
    const value = vi.fn(() => ({ count: 0 }))

    bot.extendContext('session', 'session', value)

    let seen: unknown
    bot.on('message', (ctx) => {
      seen = (ctx as unknown as Record<string, unknown>)['session']
    })

    await bot.handleUpdate(messageUpdate({ text: 'x' }))

    expect(seen).toEqual({ count: 0 })
    expect(value).toHaveBeenCalledOnce()
  })
})

describe('lifecycle', () => {
  it('signs in and begins polling', async () => {
    const { bot, transport } = testBot()
    transport.on('getUpdates', ok([]))

    await bot.poll()

    expect(bot.me?.username).toBe('test_bot')
    expect(bot.state).toBe('running')

    await bot.stop()
    expect(bot.state).toBe('idle')
  })

  it('fails to start when the token is rejected', async () => {
    const transport = mockTransport()
    transport.on('getMe', apiError(401, 'Unauthorized'))

    const bot = new Bot(TOKEN, { client: transport, log: createLogger({ sink: silentSink() }) })

    await expect(bot.poll()).rejects.toThrow()
    expect(bot.state).toBe('failed')
  })

  it('drains in-flight updates on stop', async () => {
    const { bot, transport } = testBot()
    transport.on('getUpdates', ok([]))

    let released!: () => void
    const blocked = new Promise<void>((resolve) => {
      released = resolve
    })
    let finished = false

    bot.on('message', async () => {
      await blocked
      finished = true
    })

    await bot.poll()
    void bot.handleUpdate(messageUpdate({ text: 'x' }))

    const stopping = bot.stop({ timeout: 1000 })
    released()
    await stopping

    expect(finished).toBe(true)
  })
})

describe('allowed updates', () => {
  it('derives the minimal set from registered handlers', async () => {
    const { bot: _unused } = testBot()
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'B' }))
    transport.on('getUpdates', ok([]))

    const bot = new Bot(TOKEN, {
      client: transport,
      allowedUpdates: 'auto',
      log: createLogger({ sink: silentSink() }),
    })

    bot.on('message', () => {})
    bot.on('callback_query', () => {})

    await bot.poll()
    await bot.stop()

    expect(transport.last('getUpdates')?.params['allowed_updates']).toEqual([
      'callback_query',
      'message',
    ])
  })

  it('subscribes to everything when a handler could match anything', async () => {
    // An unconstrained filter makes the registered set unknowable, so every
    // type is named explicitly. Omitting the parameter is not equivalent:
    // Telegram reuses whatever a previous run configured, and its own default
    // excludes chat member and reaction updates.
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'B' }))
    transport.on('getUpdates', ok([]))

    const bot = new Bot(TOKEN, {
      client: transport,
      allowedUpdates: 'auto',
      log: createLogger({ sink: silentSink() }),
    })

    bot.on('message', () => {})
    bot.on(
      defineFilter('anything', () => true),
      () => {},
    )

    await bot.poll()
    await bot.stop()

    const asked = transport.last('getUpdates')?.params['allowed_updates'] as readonly string[]

    expect(asked).toBeDefined()
    expect(asked).toContain('message')
    expect(asked).toContain('message_reaction')
    expect(asked).toContain('chat_member')
  })

  it('passes an explicit list through unchanged', async () => {
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'B' }))
    transport.on('getUpdates', ok([]))

    const bot = new Bot(TOKEN, {
      client: transport,
      allowedUpdates: ['message_reaction'],
      log: createLogger({ sink: silentSink() }),
    })

    await bot.poll()
    await bot.stop()

    expect(transport.last('getUpdates')?.params['allowed_updates']).toEqual(['message_reaction'])
  })
})

describe('webhook integration', () => {
  it('drives the same pipeline as polling', async () => {
    const { bot } = testBot()
    const seen: string[] = []

    bot.on('message', (ctx) => {
      seen.push(ctx.text ?? '')
    })

    const handler = bot.webhook({ secretToken: 'secret' })
    const response = await handler({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'secret' },
      body: messageUpdate({ text: 'via webhook' }),
    })

    expect(response.status).toBe(200)
    await vi.waitFor(() => expect(seen).toEqual(['via webhook']))
  })

  it('rejects a forged request before dispatching', async () => {
    const { bot } = testBot()
    const handler = vi.fn()

    bot.on('message', handler)

    const response = await bot.webhook({ secretToken: 'secret' })({
      method: 'POST',
      headers: {},
      body: messageUpdate({ text: 'forged' }),
    })

    expect(response.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('identifying the bot', () => {
  const who = { id: 1, is_bot: true, first_name: 'T', username: 't' }

  it('shares one request between concurrent callers', async () => {
    // A webhook bot handling a burst at cold start calls this from every
    // request at once. Caching only the result sent a getMe for each - a
    // self-inflicted herd against a rate-limited endpoint.
    const transport = mockTransport()
    transport.on('getMe', ok(who))

    const bot = new Bot(TOKEN, { client: transport, log: createLogger({ sink: silentSink() }) })

    await Promise.all(Array.from({ length: 8 }, () => bot.identify()))

    expect(transport.count('getMe')).toBe(1)
  })

  it('caches the answer across later calls', async () => {
    const transport = mockTransport()
    transport.on('getMe', ok(who))

    const bot = new Bot(TOKEN, { client: transport, log: createLogger({ sink: silentSink() }) })

    await bot.identify()
    await bot.identify()

    expect(transport.count('getMe')).toBe(1)
    expect(bot.me?.username).toBe('t')
  })

  it('retries after a failure rather than replaying it', async () => {
    // Caching the promise must not cache a rejection: a bot that failed to
    // identify once would never succeed.
    const transport = mockTransport()
    let attempt = 0
    transport.on('getMe', () => {
      attempt += 1
      if (attempt === 1) throw new Error('network down')
      return ok(who)
    })

    const bot = new Bot(TOKEN, { client: transport, log: createLogger({ sink: silentSink() }) })

    await expect(bot.identify()).rejects.toThrow()
    await expect(bot.identify()).resolves.toMatchObject({ username: 't' })
  })
})
