/**
 * Hooks around outgoing calls.
 *
 * The contract that matters is that `next()` is the request: calling it twice
 * retries, not calling it short-circuits, and a hook can change the parameters
 * on the way out. Every production concern that is not a framework feature —
 * flood waits, throttling, caching, metrics — rests on exactly that.
 */

import { createLogger, FloodError, silentSink } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { type ApiHook, createApi } from '../src/api.js'
import { Bot } from '../src/bot.js'
import { retryOnFloodWait, withDefaults } from '../src/hooks.js'
import { fetchClient } from '../src/http/fetch-client.js'
import { NonReplayableUploadError } from '../src/input-file.js'
import { media } from '../src/media.js'
import { apiError, floodWait, mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

function client(hooks: ApiHook[] = []) {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))
  transport.on('sendMessage', ok({ message_id: 1, date: 1, chat: { id: 1, type: 'private' } }))

  const bot = Bot.fromToken(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })

  for (const hook of hooks) bot.hook(hook)

  return { bot, transport }
}

describe('the chain', () => {
  it('wraps every call, outermost first', async () => {
    const order: string[] = []
    const { bot } = client([
      async (_call, next) => {
        order.push('outer:in')
        const result = await next()
        order.push('outer:out')
        return result
      },
      async (_call, next) => {
        order.push('inner:in')
        const result = await next()
        order.push('inner:out')
        return result
      },
    ])

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(order).toEqual(['outer:in', 'inner:in', 'inner:out', 'outer:out'])
  })

  it('names the method being called', async () => {
    const seen: string[] = []
    const { bot } = client([
      async (call, next) => {
        seen.push(call.method)
        return next()
      },
    ])

    await bot.api.getMe()
    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(seen).toEqual(['getMe', 'sendMessage'])
  })

  it('applies to the untyped escape hatch too', async () => {
    const seen: string[] = []
    const { bot, transport } = client([
      async (call, next) => {
        seen.push(call.method)
        return next()
      },
    ])

    transport.on('brandNewMethod', ok(true))
    await bot.api.call('brandNewMethod', {})

    expect(seen).toEqual(['brandNewMethod'])
  })

  it('lets a hook change the parameters on the way out', async () => {
    const { bot, transport } = client([
      async (call, next) => {
        call.params = { ...call.params, parse_mode: 'HTML' }
        return next()
      },
    ])

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(transport.last('sendMessage')?.params).toMatchObject({ parse_mode: 'HTML' })
  })

  it('lets a hook answer without sending anything', async () => {
    // A cache hit, or a refusal. Not calling `next()` is the mechanism.
    const { bot, transport } = client([async () => ({ message_id: 999 })])

    const result = await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(result).toEqual({ message_id: 999 })
    expect(transport.count('sendMessage')).toBe(0)
  })

  it('sends again when a hook calls next twice', async () => {
    const { bot, transport } = client([
      async (_call, next) => {
        await next()
        return next()
      },
    ])

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(transport.count('sendMessage')).toBe(2)
  })

  it('counts attempts, so a hook can tell a retry from a first try', async () => {
    const attempts: number[] = []
    const { bot } = client([
      async (call, next) => {
        await next()
        attempts.push(call.attempt)
        await next()
        attempts.push(call.attempt)
        return undefined
      },
    ])

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(attempts).toEqual([1, 2])
  })

  it('applies a hook registered after the client was built', async () => {
    // Which is what lets a plugin install one.
    const { bot, transport } = client()
    let seen = 0

    bot.hook(async (_call, next) => {
      seen += 1
      return next()
    })

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(seen).toBe(1)
    expect(transport.count('sendMessage')).toBe(1)
  })
})

describe('retryOnFloodWait', () => {
  it('waits the stated time and succeeds on the retry', async () => {
    const transport = mockTransport()
    transport.once('sendMessage', floodWait(0))
    transport.on('sendMessage', ok({ message_id: 1 }))

    const bot = Bot.fromToken(TOKEN, {
      client: transport,
      log: createLogger({ sink: silentSink() }),
    })
    bot.hook(retryOnFloodWait())

    await expect(bot.api.sendMessage({ chat_id: 1, text: 'hi' })).resolves.toMatchObject({
      message_id: 1,
    })
    expect(transport.count('sendMessage')).toBe(2)
  })

  it('rethrows a wait longer than the ceiling', async () => {
    // Sleeping through an hour inside a handler is never what the caller
    // wanted; rescheduling is something only they can do.
    const transport = mockTransport()
    transport.on('sendMessage', floodWait(3600))

    const bot = Bot.fromToken(TOKEN, { client: transport })
    bot.hook(retryOnFloodWait({ maxWait: 30 }))

    await expect(bot.api.sendMessage({ chat_id: 1, text: 'hi' })).rejects.toBeInstanceOf(FloodError)
    expect(transport.count('sendMessage')).toBe(1)
  })

  it('gives up after the attempt limit', async () => {
    const transport = mockTransport()
    transport.on('sendMessage', floodWait(0))

    const bot = Bot.fromToken(TOKEN, { client: transport })
    bot.hook(retryOnFloodWait({ attempts: 2 }))

    await expect(bot.api.sendMessage({ chat_id: 1, text: 'hi' })).rejects.toBeInstanceOf(FloodError)
    expect(transport.count('sendMessage')).toBe(2)
  })

  it('leaves every other failure alone', async () => {
    const transport = mockTransport()
    transport.on('sendMessage', apiError(400, 'Bad Request: chat not found'))

    const bot = Bot.fromToken(TOKEN, { client: transport })
    bot.hook(retryOnFloodWait())

    await expect(bot.api.sendMessage({ chat_id: 1, text: 'hi' })).rejects.toThrow(/chat not found/)
    expect(transport.count('sendMessage')).toBe(1)
  })

  it('reports the wait, so a bot hitting limits is visible', async () => {
    const warn = vi.fn()
    const transport = mockTransport()
    transport.once('sendMessage', floodWait(0))
    transport.on('sendMessage', ok({ message_id: 1 }))

    const bot = Bot.fromToken(TOKEN, { client: transport })
    bot.hook(
      retryOnFloodWait({
        log: createLogger({
          level: 'warn',
          sink: {
            write(record) {
              warn(record.message, record.fields)
            },
          },
        }),
      }),
    )

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(warn).toHaveBeenCalledWith(
      'flood wait, retrying',
      expect.objectContaining({
        method: 'sendMessage',
      }),
    )
  })
})

describe('withDefaults', () => {
  it('fills a parameter the caller did not set', async () => {
    const { bot, transport } = client([withDefaults(() => ({ parse_mode: 'HTML' }))])

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(transport.last('sendMessage')?.params).toMatchObject({ parse_mode: 'HTML' })
  })

  it('never overrides what the caller set', async () => {
    const { bot, transport } = client([withDefaults(() => ({ parse_mode: 'HTML' }))])

    await bot.api.sendMessage({ chat_id: 1, text: 'hi', parse_mode: 'MarkdownV2' })

    expect(transport.last('sendMessage')?.params).toMatchObject({ parse_mode: 'MarkdownV2' })
  })

  it('decides per method', async () => {
    const { bot, transport } = client([
      withDefaults((method) => (method === 'sendMessage' ? { protect_content: true } : undefined)),
    ])

    await bot.api.sendMessage({ chat_id: 1, text: 'hi' })
    await bot.api.getMe()

    expect(transport.last('sendMessage')?.params).toMatchObject({ protect_content: true })
    expect(transport.last('getMe')?.params).toEqual({})
  })
})

describe('retrying a request with a body', () => {
  /** A transport that refuses once with a flood wait, then accepts. */
  function floodThenAccept() {
    const sent: string[] = []
    let calls = 0

    const fetchImpl = async (_url: string, init: RequestInit): Promise<Response> => {
      calls += 1

      const body = init.body
      sent.push(
        body instanceof ReadableStream
          ? await new Response(body).text()
          : body instanceof FormData
            ? await (body.get('document') as Blob).text()
            : String(body),
      )

      const payload =
        calls === 1
          ? {
              ok: false,
              error_code: 429,
              description: 'Too Many Requests',
              parameters: { retry_after: 0 },
            }
          : { ok: true, result: { message_id: 1 } }

      return new Response(JSON.stringify(payload), { status: calls === 1 ? 429 : 200 })
    }

    const api = createApi({
      client: fetchClient({ token: TOKEN, fetch: fetchImpl as typeof fetch }),
      hooks: [retryOnFloodWait()],
    })

    return { api, sent, attempts: () => calls }
  }

  /** A stream that can only be read once. */
  async function* once(): AsyncGenerator<Uint8Array> {
    yield new TextEncoder().encode('PAYLOAD')
  }

  it('refuses rather than retrying a consumed stream with an empty body', async () => {
    // The failure this prevents is silent: the first attempt uploads the file,
    // the retry uploads nothing, and Telegram reports success.
    const { api, attempts } = floodThenAccept()

    await expect(
      api.sendDocument({ chat_id: 1, document: media.stream(once(), 'a.txt') } as never),
    ).rejects.toBeInstanceOf(NonReplayableUploadError)

    // The first request went out; the retry failed before a second one.
    expect(attempts()).toBe(1)
  })

  it('reports the refusal as itself rather than as a network failure', async () => {
    // Encoding happens inside the transport call, so the refusal would
    // otherwise be wrapped as "could not reach the Telegram API" — false, and
    // hiding the one message that says what to do.
    const { api } = floodThenAccept()

    await expect(
      api.sendDocument({ chat_id: 1, document: media.stream(once(), 'a.txt') } as never),
    ).rejects.toThrow(/consumed by the first attempt/)
  })

  it('retries a stream built by a factory, with the bytes intact', async () => {
    const { api, sent, attempts } = floodThenAccept()

    await api.sendDocument({ chat_id: 1, document: media.stream(() => once(), 'a.txt') } as never)

    expect(attempts()).toBe(2)
    expect(sent[1]).toContain('PAYLOAD')
  })

  it('retries a buffered upload, as it always did', async () => {
    const { api, sent, attempts } = floodThenAccept()

    await api.sendDocument({
      chat_id: 1,
      document: media.buffer(new TextEncoder().encode('PAYLOAD'), 'a.bin'),
    } as never)

    expect(attempts()).toBe(2)
    expect(sent[1]).toContain('PAYLOAD')
  })
})
