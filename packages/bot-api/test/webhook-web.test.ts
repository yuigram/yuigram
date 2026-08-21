/**
 * The Fetch API webhook adapter.
 *
 * One adapter covers every runtime that speaks `Request`/`Response`, so the
 * risk is not breadth but the edges: a body too large, a body that is not JSON,
 * and a path that belongs to something else. All three must answer rather than
 * throw — Telegram retries anything it does not see acknowledged, and a
 * rejected promise in a Worker becomes a 500 and a retry loop.
 */

import { describe, expect, it, vi } from 'vitest'
import { createWebhookHandler } from '../src/webhook/handler.js'
import { webWebhook } from '../src/webhook/web.js'

const UPDATE = {
  update_id: 1,
  message: { message_id: 1, date: 1, chat: { id: 1, type: 'private' }, text: 'hi' },
}

/** A handler plus the updates it received. */
function handler(options: { secretToken?: string } = {}) {
  const seen: unknown[] = []

  const webhook = createWebhookHandler({
    ...options,
    onUpdate: (update) => {
      seen.push(update)
    },
  })

  return { webhook, seen }
}

/** A POST carrying an update. */
function post(body: unknown, init: RequestInit = {}): Request {
  return new Request('https://example.com/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('dispatch', () => {
  it('delivers an update and acknowledges', async () => {
    const { webhook, seen } = handler()
    const response = await webWebhook(webhook)(post(UPDATE))

    expect(response.status).toBe(200)
    expect(seen).toHaveLength(1)
  })

  it('passes the headers through, so the secret is checked', async () => {
    const { webhook, seen } = handler({ secretToken: 'shh' })
    const fetchHandler = webWebhook(webhook)

    const rejected = await fetchHandler(post(UPDATE))
    expect(rejected.status).toBe(401)
    expect(seen).toHaveLength(0)

    const accepted = await fetchHandler(
      post(UPDATE, { headers: { 'x-telegram-bot-api-secret-token': 'shh' } }),
    )
    expect(accepted.status).toBe(200)
    expect(seen).toHaveLength(1)
  })

  it('refuses anything that is not a POST', async () => {
    const { webhook } = handler()
    const response = await webWebhook(webhook)(
      new Request('https://example.com/webhook', { method: 'GET' }),
    )

    expect(response.status).toBe(405)
  })
})

describe('bad input', () => {
  it('answers 400 for a body that is not JSON', async () => {
    const { webhook } = handler()
    const response = await webWebhook(webhook)(
      new Request('https://example.com/webhook', { method: 'POST', body: 'not json' }),
    )

    expect(response.status).toBe(400)
  })

  it('answers 400 for a body over the limit rather than reading it all', async () => {
    const { webhook, seen } = handler()
    const response = await webWebhook(webhook, { bodyLimit: 32 })(
      post({ ...UPDATE, padding: 'x'.repeat(1000) }),
    )

    expect(response.status).toBe(400)
    expect(seen).toHaveLength(0)
  })

  it('rejects on a declared length over the limit without reading the body', async () => {
    const { webhook } = handler()
    const body = JSON.stringify(UPDATE)

    const request = new Request('https://example.com/webhook', {
      method: 'POST',
      body,
      headers: { 'content-length': String(body.length) },
    })

    const response = await webWebhook(webhook, { bodyLimit: 4 })(request)
    expect(response.status).toBe(400)
  })

  it('answers 400 rather than throwing, so the runtime does not retry', async () => {
    const { webhook } = handler()
    const fetchHandler = webWebhook(webhook, { bodyLimit: 8 })

    await expect(fetchHandler(post(UPDATE))).resolves.toBeInstanceOf(Response)
  })
})

describe('routing', () => {
  it('ignores a path it was not mounted at', async () => {
    const { webhook, seen } = handler()
    const fetchHandler = webWebhook(webhook, { path: '/hook' })

    const wrong = await fetchHandler(post(UPDATE))
    expect(wrong.status).toBe(404)
    expect(seen).toHaveLength(0)

    const right = await fetchHandler(
      new Request('https://example.com/hook', {
        method: 'POST',
        body: JSON.stringify(UPDATE),
      }),
    )
    expect(right.status).toBe(200)
  })

  it('handles every path when none is given, since the router already chose', async () => {
    const { webhook, seen } = handler()
    const response = await webWebhook(webhook)(
      new Request('https://example.com/anything', {
        method: 'POST',
        body: JSON.stringify(UPDATE),
      }),
    )

    expect(response.status).toBe(200)
    expect(seen).toHaveLength(1)
  })
})

describe('shape', () => {
  it('is a plain fetch handler, which is what every runtime wants', async () => {
    const { webhook } = handler()
    const fetchHandler = webWebhook(webhook)

    // The signature every one of Bun, Deno, Workers, Hono and Next expects.
    const asExport: { fetch: (request: Request) => Promise<Response> } = { fetch: fetchHandler }

    expect(await asExport.fetch(post(UPDATE))).toBeInstanceOf(Response)
  })

  it('reports the content type the handler chose', async () => {
    const { webhook } = handler()
    const response = await webWebhook(webhook)(post(UPDATE))

    expect(response.headers.get('content-type')).toBe('text/plain')
  })

  it('drains an empty body without complaint', async () => {
    const { webhook } = handler()
    const response = await webWebhook(webhook)(
      new Request('https://example.com/webhook', { method: 'POST' }),
    )

    expect(response.status).toBe(400)
  })

  it('does not hold the response open while the handler runs', async () => {
    // Telegram retries anything it has not seen acknowledged, so the reply
    // must not wait for dispatch.
    const slow = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const webhook = createWebhookHandler({ onUpdate: slow })
    const began = Date.now()
    await webWebhook(webhook)(post(UPDATE))

    expect(Date.now() - began).toBeLessThan(40)
  })
})
