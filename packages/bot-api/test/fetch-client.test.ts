/**
 * Transport and error mapping.
 *
 * The token-leak cases are the security-critical half. A bot token sits in the
 * request path, and an error object is the most common route by which one
 * reaches a log aggregator — so no error, at any layer, may carry the URL.
 */

import { ConfigError, FloodError, NetworkError, TelegramError } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { BotApiError, isRetryable, toError, toNetworkError } from '../src/errors.js'
import { fetchClient } from '../src/http/fetch-client.js'

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw'

/**
 * A fetch stub returning a fixed envelope.
 *
 * The parameters are declared so the recorded calls carry their real shape;
 * a zero-argument mock types `calls[0]` as an empty tuple.
 */
function stubFetch(body: unknown, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  )
}

type FetchStub = ReturnType<typeof stubFetch>

/** The URL of the first recorded call, asserted to exist. */
function firstUrl(impl: FetchStub): string {
  const call = impl.mock.calls[0]
  if (call === undefined) throw new Error('fetch was never called')
  return String(call[0])
}

/** The init of the first recorded call, asserted to exist. */
function firstInit(impl: FetchStub): RequestInit {
  const call = impl.mock.calls[0]
  if (call === undefined) throw new Error('fetch was never called')
  const init = call[1]
  if (init === undefined) throw new Error('fetch was called without an init')
  return init
}

/** Headers of the first recorded call. */
function firstHeaders(impl: FetchStub): Record<string, string> {
  return (firstInit(impl).headers ?? {}) as Record<string, string>
}

describe('token handling', () => {
  it('rejects an empty token', () => {
    expect(() => fetchClient({ token: '' })).toThrow(ConfigError)
  })

  it('rejects a malformed token', () => {
    expect(() => fetchClient({ token: 'not-a-token' })).toThrow(ConfigError)
  })

  it('never echoes the token in a validation error', () => {
    // A malformed token is still a secret, and this message may be logged.
    const bad = '999:SECRETVALUETHATMUSTNOTAPPEARANYWHEREATALL'
    try {
      fetchClient({ token: `${bad}!` })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as Error).message).not.toContain('SECRETVALUE')
    }
  })

  it('places the token in the request path', async () => {
    const impl = stubFetch({ ok: true, result: {} })
    const client = fetchClient({ token: TOKEN, fetch: impl })

    await client.call({ method: 'getMe', params: {} })

    expect(firstUrl(impl)).toBe(`https://api.telegram.org/bot${TOKEN}/getMe`)
  })

  it('does not expose the token on the client object', () => {
    // Inspection or accidental serialization of the client must not leak it.
    const client = fetchClient({ token: TOKEN })
    expect(JSON.stringify(client)).not.toContain('AAHdqTcv')
    expect(Object.keys(client)).not.toContain('token')
  })
})

describe('requests', () => {
  it('posts JSON for a plain call', async () => {
    const impl = stubFetch({ ok: true, result: { message_id: 1 } })
    const client = fetchClient({ token: TOKEN, fetch: impl })

    await client.call({ method: 'sendMessage', params: { chat_id: 1, text: 'hi' } })

    const init = firstInit(impl)
    expect(init.method).toBe('POST')
    expect(firstHeaders(impl)['content-type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: 1, text: 'hi' })
  })

  it('omits the content type for multipart so the runtime sets the boundary', async () => {
    const impl = stubFetch({ ok: true, result: {} })
    const client = fetchClient({ token: TOKEN, fetch: impl })

    await client.call({ method: 'sendPhoto', params: { photo: new Uint8Array([1]) } })

    expect(firstInit(impl).body).toBeInstanceOf(FormData)
    expect(firstHeaders(impl)['content-type']).toBeUndefined()
  })

  it('honours a custom base URL for a local Bot API server', async () => {
    const impl = stubFetch({ ok: true, result: {} })
    const client = fetchClient({ token: TOKEN, baseUrl: 'http://localhost:8081/', fetch: impl })

    await client.call({ method: 'getMe', params: {} })

    expect(firstUrl(impl)).toBe(`http://localhost:8081/bot${TOKEN}/getMe`)
  })

  it('sends extra headers', async () => {
    const impl = stubFetch({ ok: true, result: {} })
    const client = fetchClient({ token: TOKEN, fetch: impl, headers: { 'x-trace': 'abc' } })

    await client.call({ method: 'getMe', params: {} })

    expect(firstHeaders(impl)['x-trace']).toBe('abc')
  })
})

describe('responses', () => {
  it('returns a success envelope', async () => {
    const client = fetchClient({ token: TOKEN, fetch: stubFetch({ ok: true, result: { id: 1 } }) })

    const result = await client.call({ method: 'getMe', params: {} })

    expect(result.status).toBe(200)
    expect(result.body.result).toEqual({ id: 1 })
  })

  it('returns a refusal rather than throwing', async () => {
    // Throwing would hide error_code and parameters, which is what a caller
    // needs to decide whether to retry.
    const impl = stubFetch({ ok: false, error_code: 400, description: 'Bad Request' }, 400)
    const client = fetchClient({ token: TOKEN, fetch: impl })

    const result = await client.call({ method: 'sendMessage', params: {} })

    expect(result.status).toBe(400)
    expect(result.body.ok).toBe(false)
    expect(result.body.error_code).toBe(400)
  })
})

describe('cancellation', () => {
  it('rejects when the signal is already aborted', async () => {
    const client = fetchClient({ token: TOKEN, fetch: stubFetch({ ok: true }) })
    const controller = new AbortController()
    controller.abort()

    await expect(
      client.call({ method: 'getMe', params: {}, signal: controller.signal }),
    ).rejects.toThrow()
  })

  it('aborts the underlying request when the caller aborts', async () => {
    const controller = new AbortController()
    const impl = vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )

    const client = fetchClient({ token: TOKEN, fetch: impl as unknown as typeof fetch })
    const pending = client.call({ method: 'getMe', params: {}, signal: controller.signal })

    controller.abort()

    await expect(pending).rejects.toThrow()
  })
})

describe('error mapping', () => {
  it('maps 429 to FloodError with retryAfter', async () => {
    const error = toError('sendMessage', 429, {
      ok: false,
      error_code: 429,
      description: 'Too Many Requests',
      parameters: { retry_after: 12 },
    })

    expect(error).toBeInstanceOf(FloodError)
    expect((error as FloodError).retryAfter).toBe(12)
  })

  it('maps retry_after without a 429 status', async () => {
    // Local Bot API servers report the wait with a different status.
    const error = toError('sendMessage', 400, {
      ok: false,
      error_code: 400,
      description: 'flood',
      parameters: { retry_after: 3 },
    })

    expect(error).toBeInstanceOf(FloodError)
  })

  it('maps an ordinary refusal to BotApiError', () => {
    const error = toError('sendMessage', 400, {
      ok: false,
      error_code: 400,
      description: 'Bad Request: chat not found',
    })

    expect(error).toBeInstanceOf(BotApiError)
    expect(error).toBeInstanceOf(TelegramError)
    expect((error as BotApiError).code).toBe(400)
    expect((error as BotApiError).description).toContain('chat not found')
  })

  it('exposes a migration target', () => {
    const error = toError('sendMessage', 400, {
      ok: false,
      error_code: 400,
      description: 'group upgraded',
      parameters: { migrate_to_chat_id: -100999 },
    }) as BotApiError

    expect(error.migrateToChatId).toBe(-100999)
  })

  it('preserves the original envelope as the cause', () => {
    const response = { ok: false, error_code: 403, description: 'Forbidden' }
    expect(toError('sendMessage', 403, response).cause).toBe(response)
  })

  it('records the method that failed', () => {
    expect(toError('sendPhoto', 400, { ok: false, error_code: 400 }).method).toBe('sendPhoto')
  })

  it('wraps a transport failure without leaking the URL', () => {
    // The token is in the path; an error carrying it is how it escapes.
    const cause = new Error(`connect ECONNREFUSED https://api.telegram.org/bot${TOKEN}/getMe`)
    const error = toNetworkError('getMe', cause)

    expect(error).toBeInstanceOf(NetworkError)
    expect(error.message).not.toContain('AAHdqTcv')
    expect(error.cause).toBe(cause)
  })
})

describe('isRetryable', () => {
  it('retries flood waits, network failures and 5xx', () => {
    expect(isRetryable(new FloodError('x', { retryAfter: 1 }))).toBe(true)
    expect(isRetryable(new NetworkError('x'))).toBe(true)
    expect(
      isRetryable(new BotApiError('m', { ok: false, error_code: 500, description: 'oops' })),
    ).toBe(true)
  })

  it('does not retry a client error', () => {
    // A 400 means the request itself is wrong; repeating it changes nothing.
    expect(
      isRetryable(new BotApiError('m', { ok: false, error_code: 400, description: 'bad' })),
    ).toBe(false)
  })

  it('does not retry an unrelated error', () => {
    expect(isRetryable(new Error('boom'))).toBe(false)
  })
})
