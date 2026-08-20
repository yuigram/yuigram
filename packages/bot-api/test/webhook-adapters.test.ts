/**
 * Webhook framework adapters.
 *
 * The adapters are thin, so the risk is concentrated in the two places they are
 * not: reading a request body off the network, and deciding which status a
 * refusal gets. A webhook endpoint is public by necessity — an unbounded read
 * lets anyone who learns the URL exhaust the process with one request that
 * never ends.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import type { Update } from '../src/generated/types/index.js'
import { readBody } from '../src/webhook/body.js'
import { expressWebhook } from '../src/webhook/express.js'
import { fastifyWebhook } from '../src/webhook/fastify.js'
import { createWebhookHandler, SECRET_HEADER } from '../src/webhook/handler.js'
import { nodeWebhook } from '../src/webhook/node.js'

/** An update Telegram would plausibly send. */
const update = { update_id: 1, message: { message_id: 7 } } as Update

/** A handler that records what it was given. */
function recording() {
  const seen: Update[] = []
  const handler = createWebhookHandler({ onUpdate: (u) => void seen.push(u) })
  return { handler, seen }
}

/** A readable stream of the given chunks. */
async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield new TextEncoder().encode(part)
}

describe('body reading', () => {
  it('joins chunks into one body', async () => {
    expect(await readBody(chunks('{"a":', '1}'))).toBe('{"a":1}')
  })

  it('decodes a multi-byte character split across chunks', async () => {
    // A naive per-chunk decode turns a split character into replacement
    // characters, which then fails to parse as JSON.
    const bytes = new TextEncoder().encode('{"t":"é"}')
    const split = async function* (): AsyncGenerator<Uint8Array> {
      yield bytes.slice(0, 7)
      yield bytes.slice(7)
    }

    expect(await readBody(split())).toBe('{"t":"é"}')
  })

  it('refuses a body over the limit', async () => {
    await expect(readBody(chunks('x'.repeat(200)), 100)).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses while the body arrives, not after buffering it', async () => {
    // The point of the limit: an attacker streaming forever must be cut off,
    // not buffered until the process dies.
    let produced = 0
    const endless = async function* (): AsyncGenerator<Uint8Array> {
      while (true) {
        produced += 1
        yield new TextEncoder().encode('x'.repeat(64))
      }
    }

    await expect(readBody(endless(), 256)).rejects.toBeInstanceOf(ValidationError)
    expect(produced).toBeLessThan(10)
  })

  it('does not report the received size', async () => {
    // Reporting it tells whoever is probing exactly where the cap sits.
    try {
      await readBody(chunks('x'.repeat(200)), 100)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as Error).message).not.toContain('200')
    }
  })
})

describe('node adapter', () => {
  /** A minimal `node:http` request and response pair. */
  function exchange(body: string, options: { url?: string; method?: string } = {}) {
    const request = Object.assign(chunks(body), {
      method: options.method ?? 'POST',
      url: options.url ?? '/',
      headers: {} as Record<string, string | string[] | undefined>,
    })

    const response = {
      status: 0,
      headers: {} as Record<string, string>,
      payload: '',
      writeHead(status: number, headers?: Record<string, string>) {
        response.status = status
        Object.assign(response.headers, headers ?? {})
        return response
      },
      end(payload?: string) {
        response.payload = payload ?? ''
      },
    }

    return { request, response }
  }

  it('delivers a valid update', async () => {
    const { handler, seen } = recording()
    const { request, response } = exchange(JSON.stringify(update))

    await nodeWebhook(handler)(request as never, response as never)

    expect(response.status).toBe(200)
    expect(seen).toHaveLength(1)
  })

  it('answers 400 for a body that is not JSON', async () => {
    const { handler, seen } = recording()
    const { request, response } = exchange('not json at all')

    await nodeWebhook(handler)(request as never, response as never)

    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('answers 413 for an oversized body', async () => {
    // Distinct from the 400 an unparseable body gets: the client needs to know
    // the request was too large, not malformed.
    const { handler } = recording()
    const { request, response } = exchange('x'.repeat(5000))

    await nodeWebhook(handler, { bodyLimit: 100 })(request as never, response as never)

    expect(response.status).toBe(413)
  })

  it('answers 405 for a non-POST request', async () => {
    const { handler } = recording()
    const { request, response } = exchange('', { method: 'GET' })

    await nodeWebhook(handler)(request as never, response as never)

    expect(response.status).toBe(405)
  })

  it('serves only the configured path', async () => {
    const { handler, seen } = recording()
    const { request, response } = exchange(JSON.stringify(update), { url: '/other' })

    await nodeWebhook(handler, { path: '/hook' })(request as never, response as never)

    expect(response.status).toBe(404)
    expect(seen).toEqual([])
  })

  it('ignores a query string when matching the path', async () => {
    const { handler, seen } = recording()
    const { request, response } = exchange(JSON.stringify(update), { url: '/hook?v=2' })

    await nodeWebhook(handler, { path: '/hook' })(request as never, response as never)

    expect(seen).toHaveLength(1)
  })

  it('rejects a request whose secret does not match', async () => {
    const seen: Update[] = []
    const handler = createWebhookHandler({
      onUpdate: (u) => void seen.push(u),
      secretToken: 'correct-horse',
      log: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
    })

    const { request, response } = exchange(JSON.stringify(update))
    request.headers[SECRET_HEADER] = 'wrong'

    await nodeWebhook(handler)(request as never, response as never)

    expect(response.status).toBe(401)
    expect(seen).toEqual([])
  })
})

describe('express adapter', () => {
  /** A minimal Express response recorder. */
  function reply() {
    const state = { status: 0, headers: {} as Record<string, string>, payload: '' }
    const response = {
      status(code: number) {
        state.status = code
        return response
      },
      set(field: string, value: string) {
        state.headers[field] = value
        return response
      },
      send(payload: string) {
        state.payload = payload
        return response
      },
    }
    return { response, state }
  }

  it('uses a body a parser already produced', async () => {
    const { handler, seen } = recording()
    const { response, state } = reply()

    await expressWebhook(handler)(
      { method: 'POST', headers: {}, body: update } as never,
      response as never,
    )

    expect(state.status).toBe(200)
    expect(seen).toHaveLength(1)
  })

  it('reads the body itself when no parser has run', async () => {
    // An app without a JSON body parser should still work rather than silently
    // answering 400 for every update.
    const { handler, seen } = recording()
    const { response, state } = reply()

    const request = Object.assign(chunks(JSON.stringify(update)), {
      method: 'POST',
      headers: {},
    })

    await expressWebhook(handler)(request as never, response as never)

    expect(state.status).toBe(200)
    expect(seen).toHaveLength(1)
  })

  it('answers 413 for an oversized unparsed body', async () => {
    const { handler } = recording()
    const { response, state } = reply()

    const request = Object.assign(chunks('x'.repeat(5000)), { method: 'POST', headers: {} })

    await expressWebhook(handler, { bodyLimit: 100 })(request as never, response as never)

    expect(state.status).toBe(413)
  })
})

describe('fastify adapter', () => {
  /** A minimal Fastify reply recorder. */
  function reply() {
    const state = { status: 0, headers: {} as Record<string, string>, payload: '' }
    const response = {
      code(status: number) {
        state.status = status
        return response
      },
      header(name: string, value: string) {
        state.headers[name] = value
        return response
      },
      send(payload: string) {
        state.payload = payload
        return response
      },
    }
    return { response, state }
  }

  it('delivers a body Fastify parsed', async () => {
    const { handler, seen } = recording()
    const { response, state } = reply()

    await fastifyWebhook(handler)(
      { method: 'POST', headers: {}, body: update } as never,
      response as never,
    )

    expect(state.status).toBe(200)
    // An acknowledgement carries no body; Telegram only reads the status.
    expect(state.headers['content-type']).toBe('text/plain')
    expect(state.payload).toBe('')
    expect(seen).toHaveLength(1)
  })

  it('answers 400 when Fastify parsed nothing', async () => {
    const { handler, seen } = recording()
    const { response, state } = reply()

    await fastifyWebhook(handler)(
      { method: 'POST', headers: {}, body: undefined } as never,
      response as never,
    )

    expect(state.status).toBe(400)
    expect(seen).toEqual([])
  })
})
