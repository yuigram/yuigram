/**
 * Mock transport behaviour.
 *
 * The mock is test infrastructure, so it is itself tested: a harness that
 * silently misbehaves invalidates every suite built on it. The failure
 * injectors get the most attention, since they are the reason it exists —
 * a client that mishandles a 429 or a malformed body fails in production while
 * passing a suite that only ever sees success.
 */

import { describe, expect, it } from 'vitest'
import {
  apiError,
  floodWait,
  MockNetworkError,
  migrated,
  mockTransport,
  ok,
  serverError,
} from '../src/testing/mock-transport.js'

describe('response scripting', () => {
  it('returns a scripted result', async () => {
    const mock = mockTransport()
    mock.on('getMe', ok({ id: 1, is_bot: true, first_name: 'Bot' }))

    const result = await mock.call({ method: 'getMe', params: {} })

    expect(result.status).toBe(200)
    expect(result.body.ok).toBe(true)
    expect(result.body.result).toMatchObject({ id: 1 })
  })

  it('accepts a responder function receiving the request', async () => {
    const mock = mockTransport()
    mock.on('sendMessage', (request) => ok({ echoed: request.params['text'] }))

    const result = await mock.call({ method: 'sendMessage', params: { text: 'hi' } })

    expect(result.body.result).toEqual({ echoed: 'hi' })
  })

  it('reuses a scripted response across calls', async () => {
    const mock = mockTransport()
    mock.on('getMe', ok({ id: 1 }))

    await mock.call({ method: 'getMe', params: {} })
    const second = await mock.call({ method: 'getMe', params: {} })

    expect(second.body.ok).toBe(true)
  })

  it('consumes a once response and falls back afterwards', async () => {
    const mock = mockTransport()
    mock.on('getMe', ok({ id: 1 }))
    mock.once('getMe', ok({ id: 999 }))

    const first = await mock.call({ method: 'getMe', params: {} })
    const second = await mock.call({ method: 'getMe', params: {} })

    expect(first.body.result).toEqual({ id: 999 })
    expect(second.body.result).toEqual({ id: 1 })
  })

  it('consumes queued once responses in order', async () => {
    const mock = mockTransport()
    mock.once('getMe', ok({ n: 1 }))
    mock.once('getMe', ok({ n: 2 }))

    const first = await mock.call({ method: 'getMe', params: {} })
    const second = await mock.call({ method: 'getMe', params: {} })

    expect(first.body.result).toEqual({ n: 1 })
    expect(second.body.result).toEqual({ n: 2 })
  })

  it('fails loudly for an unscripted method', async () => {
    // Returning an empty success would let a test pass while asserting nothing.
    const result = await mockTransport().call({ method: 'sendMessage', params: {} })

    expect(result.body.ok).toBe(false)
    expect(result.body.description).toContain('sendMessage')
  })

  it('accepts a custom fallback', async () => {
    const mock = mockTransport({ fallback: () => ok({ anything: true }) })
    const result = await mock.call({ method: 'whatever', params: {} })

    expect(result.body.ok).toBe(true)
  })
})

describe('failure injection', () => {
  it('returns a refusal without throwing', async () => {
    // A transport that threw would hide error_code and parameters, which is
    // exactly what a caller needs to decide whether to retry.
    const mock = mockTransport()
    mock.on('sendMessage', apiError(400, 'Bad Request: chat not found'))

    const result = await mock.call({ method: 'sendMessage', params: {} })

    expect(result.body.ok).toBe(false)
    expect(result.body.error_code).toBe(400)
  })

  it('produces a flood wait carrying retry_after', async () => {
    const mock = mockTransport()
    mock.on('sendMessage', floodWait(7))

    const result = await mock.call({ method: 'sendMessage', params: {} })

    expect(result.status).toBe(429)
    expect(result.body.parameters?.retry_after).toBe(7)
  })

  it('produces a retryable server error', async () => {
    const mock = mockTransport()
    mock.on('sendMessage', serverError(502))

    expect((await mock.call({ method: 'sendMessage', params: {} })).status).toBe(502)
  })

  it('produces a migration hint', async () => {
    const mock = mockTransport()
    mock.on('sendMessage', migrated(-100123))

    const result = await mock.call({ method: 'sendMessage', params: {} })

    expect(result.body.parameters?.migrate_to_chat_id).toBe(-100123)
  })

  it('simulates a transport failure once', async () => {
    const mock = mockTransport()
    mock.on('getMe', ok({ id: 1 }))
    mock.failOnce('getMe')

    await expect(mock.call({ method: 'getMe', params: {} })).rejects.toBeInstanceOf(
      MockNetworkError,
    )
    await expect(mock.call({ method: 'getMe', params: {} })).resolves.toMatchObject({
      body: { ok: true },
    })
  })

  it('simulates a body that is not JSON', async () => {
    // What a proxy or an error page returns. A client must not treat it as a
    // valid envelope.
    const mock = mockTransport()
    mock.malformedOnce('getMe')

    await expect(mock.call({ method: 'getMe', params: {} })).rejects.toBeInstanceOf(SyntaxError)
  })

  it('accepts a custom transport error', async () => {
    const mock = mockTransport()
    mock.failOnce('getMe', new Error('ECONNREFUSED'))

    await expect(mock.call({ method: 'getMe', params: {} })).rejects.toThrow('ECONNREFUSED')
  })
})

describe('recording', () => {
  it('records calls in order', async () => {
    const mock = mockTransport({ fallback: () => ok({}) })

    await mock.call({ method: 'getMe', params: {} })
    await mock.call({ method: 'sendMessage', params: { text: 'a' } })
    await mock.call({ method: 'sendMessage', params: { text: 'b' } })

    expect(mock.calls.map((call) => call.method)).toEqual(['getMe', 'sendMessage', 'sendMessage'])
    expect(mock.calls.map((call) => call.index)).toEqual([0, 1, 2])
  })

  it('records parameters', async () => {
    const mock = mockTransport({ fallback: () => ok({}) })
    await mock.call({ method: 'sendMessage', params: { chat_id: 1, text: 'hi' } })

    expect(mock.last('sendMessage')?.params).toEqual({ chat_id: 1, text: 'hi' })
  })

  it('filters and counts by method', async () => {
    const mock = mockTransport({ fallback: () => ok({}) })
    await mock.call({ method: 'sendMessage', params: { n: 1 } })
    await mock.call({ method: 'getMe', params: {} })
    await mock.call({ method: 'sendMessage', params: { n: 2 } })

    expect(mock.count('sendMessage')).toBe(2)
    expect(mock.callsTo('sendMessage').map((call) => call.params['n'])).toEqual([1, 2])
    expect(mock.last('sendMessage')?.params).toEqual({ n: 2 })
  })

  it('reports undefined for a method never called', async () => {
    const mock = mockTransport()
    expect(mock.last('sendMessage')).toBeUndefined()
    expect(mock.count('sendMessage')).toBe(0)
  })

  it('records a call that failed', async () => {
    // A request that reached the server and was refused still happened, and a
    // retry test needs to see both attempts.
    const mock = mockTransport()
    mock.on('sendMessage', floodWait(1))

    await mock.call({ method: 'sendMessage', params: {} })

    expect(mock.count('sendMessage')).toBe(1)
  })

  it('records a call that failed at the transport level', async () => {
    const mock = mockTransport()
    mock.failOnce('sendMessage')

    await expect(mock.call({ method: 'sendMessage', params: {} })).rejects.toThrow()

    expect(mock.count('sendMessage')).toBe(1)
  })

  it('clears recordings but keeps scripts', async () => {
    const mock = mockTransport()
    mock.on('getMe', ok({ id: 1 }))

    await mock.call({ method: 'getMe', params: {} })
    mock.reset()

    expect(mock.calls).toHaveLength(0)
    await expect(mock.call({ method: 'getMe', params: {} })).resolves.toMatchObject({
      body: { ok: true },
    })
  })
})

describe('cancellation', () => {
  it('rejects an already-aborted request', async () => {
    const mock = mockTransport({ fallback: () => ok({}) })
    const controller = new AbortController()
    controller.abort()

    await expect(
      mock.call({ method: 'getMe', params: {}, signal: controller.signal }),
    ).rejects.toThrow()
  })

  it('does not record a cancelled request', async () => {
    // A cancelled call never reached Telegram, so recording it would
    // misrepresent what was actually sent.
    const mock = mockTransport({ fallback: () => ok({}) })
    const controller = new AbortController()
    controller.abort()

    await expect(
      mock.call({ method: 'getMe', params: {}, signal: controller.signal }),
    ).rejects.toThrow()

    expect(mock.calls).toHaveLength(0)
  })
})
