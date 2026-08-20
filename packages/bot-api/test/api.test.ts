/**
 * The callable API surface.
 *
 * The proxy is the entire runtime for 185 methods, so these cases pin down what
 * it guarantees: correct dispatch, envelope unwrapping, refusals mapped onto
 * the error hierarchy, and forward compatibility for methods newer than the
 * installed schema.
 */

import { FloodError, NetworkError } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { createApi } from '../src/api.js'
import { BotApiError } from '../src/errors.js'
import { apiError, floodWait, mockTransport, ok } from '../src/testing/mock-transport.js'

describe('dispatch', () => {
  it('calls the named method', async () => {
    const client = mockTransport()
    client.on('getMe', ok({ id: 1, is_bot: true, first_name: 'Bot' }))

    const api = createApi({ client })
    const me = await api.getMe()

    expect(me).toMatchObject({ id: 1 })
    expect(client.last('getMe')).toBeDefined()
  })

  it('forwards parameters unchanged', async () => {
    const client = mockTransport()
    client.on('sendMessage', ok({ message_id: 1 }))

    await createApi({ client }).sendMessage({ chat_id: 1, text: 'hi' })

    expect(client.last('sendMessage')?.params).toEqual({ chat_id: 1, text: 'hi' })
  })

  it('unwraps the envelope to the result', async () => {
    const client = mockTransport()
    client.on('getMe', ok({ id: 42 }))

    expect(await createApi({ client }).getMe()).toEqual({ id: 42 })
  })

  it('works for a method with no parameters', async () => {
    const client = mockTransport()
    client.on('logOut', ok(true))

    expect(await createApi({ client }).logOut()).toBe(true)
  })

  it('does not pretend to be a promise', async () => {
    // A proxy answering `then` with a function makes the object await-able,
    // and `await api` would then hang or resolve to nonsense.
    const api = createApi({ client: mockTransport() })

    expect((api as unknown as Record<string, unknown>)['then']).toBeUndefined()
    await expect(Promise.resolve(api)).resolves.toBe(api)
  })
})

describe('defaults', () => {
  it('merges defaults into every call', async () => {
    const client = mockTransport()
    client.on('sendMessage', ok({}))

    const api = createApi({ client, defaults: { parse_mode: 'HTML' } })
    await api.sendMessage({ chat_id: 1, text: 'hi' })

    expect(client.last('sendMessage')?.params).toMatchObject({ parse_mode: 'HTML' })
  })

  it('lets the call site win', async () => {
    const client = mockTransport()
    client.on('sendMessage', ok({}))

    const api = createApi({ client, defaults: { parse_mode: 'HTML' } })
    await api.sendMessage({ chat_id: 1, text: 'hi', parse_mode: 'MarkdownV2' })

    expect(client.last('sendMessage')?.params['parse_mode']).toBe('MarkdownV2')
  })
})

describe('forward compatibility', () => {
  it('calls a method the installed schema does not know', async () => {
    // Without this, every Telegram release temporarily blocks someone.
    const client = mockTransport()
    client.on('sendChecklist', ok({ message_id: 9 }))

    const result = await createApi({ client }).call('sendChecklist', { chat_id: 1 })

    expect(result).toEqual({ message_id: 9 })
    expect(client.last('sendChecklist')?.params).toEqual({ chat_id: 1 })
  })

  it('applies defaults to an untyped call as well', async () => {
    const client = mockTransport()
    client.on('futureMethod', ok({}))

    await createApi({ client, defaults: { parse_mode: 'HTML' } }).call('futureMethod')

    expect(client.last('futureMethod')?.params).toEqual({ parse_mode: 'HTML' })
  })
})

describe('error mapping', () => {
  it('raises a refusal as BotApiError', async () => {
    const client = mockTransport()
    client.on('sendMessage', apiError(400, 'Bad Request: chat not found'))

    await expect(
      createApi({ client }).sendMessage({ chat_id: 1, text: 'x' }),
    ).rejects.toBeInstanceOf(BotApiError)
  })

  it('raises a rate limit as FloodError with retryAfter', async () => {
    const client = mockTransport()
    client.on('sendMessage', floodWait(9))

    await expect(
      createApi({ client }).sendMessage({ chat_id: 1, text: 'x' }),
    ).rejects.toMatchObject({ retryAfter: 9 })

    await expect(
      createApi({ client }).sendMessage({ chat_id: 1, text: 'x' }),
    ).rejects.toBeInstanceOf(FloodError)
  })

  it('wraps a transport failure as NetworkError', async () => {
    const client = mockTransport()
    client.failOnce('getMe')

    await expect(createApi({ client }).getMe()).rejects.toBeInstanceOf(NetworkError)
  })

  it('names the failing method', async () => {
    const client = mockTransport()
    client.on('sendPhoto', apiError(403, 'Forbidden'))

    await expect(createApi({ client }).sendPhoto({ chat_id: 1, photo: 'x' })).rejects.toMatchObject(
      {
        method: 'sendPhoto',
      },
    )
  })

  it('passes an abort through unchanged', async () => {
    // A deliberate cancel is not a network failure, and reporting it as one
    // would send callers looking for a connectivity problem.
    const client = mockTransport()
    client.failOnce('getMe', new DOMException('aborted', 'AbortError'))

    await expect(createApi({ client }).getMe()).rejects.toBeInstanceOf(DOMException)
  })
})

describe('observation', () => {
  it('reports every call before it is sent', async () => {
    const onCall = vi.fn()
    const client = mockTransport()
    client.on('getMe', ok({}))

    await createApi({ client, onCall }).getMe()

    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ method: 'getMe' }))
  })

  it('reports untyped calls too', async () => {
    const onCall = vi.fn()
    const client = mockTransport()
    client.on('futureMethod', ok({}))

    await createApi({ client, onCall }).call('futureMethod')

    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ method: 'futureMethod' }))
  })
})
