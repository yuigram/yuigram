// SPDX-License-Identifier: MPL-2.0

/**
 * The Koa adapter, inside a real Koa application over local HTTP.
 *
 * A structural adapter is only as good as the structure it assumed, so these
 * run Koa itself: its context, its response handling and its error handling
 * decide what reaches the wire, not a stand-in written to agree with the
 * adapter.
 */

import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import { afterEach, describe, expect, it } from 'vitest'
import type { Update } from '../src/generated/types/index.js'
import { createWebhookHandler, SECRET_HEADER, type WebhookHandler } from '../src/webhook/handler.js'
import { koaWebhook } from '../src/webhook/koa.js'

const SECRET = 'koa-secret-token'
const update = (id: number) => ({ update_id: id, message: { message_id: id } }) as Update

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  )
})

/** Start an application and answer with its base URL. */
async function serve(app: Koa): Promise<string> {
  // Koa reports a failed request on its own; the cases that cause one assert
  // on the response instead.
  app.silent = true
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((done) => server.once('listening', () => done()))

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** A handler that records what it dispatched and what failed. */
function recording(onUpdate: (update: Update) => void = () => {}) {
  const seen: Update[] = []
  const failures: unknown[] = []
  const handler = createWebhookHandler({
    secretToken: SECRET,
    onUpdate: (incoming) => {
      seen.push(incoming)
      onUpdate(incoming)
    },
    onError: (error) => void failures.push(error),
  })

  return { handler, seen, failures }
}

/** POST a body; `null` sends no secret header at all. */
const post = (url: string, body: string, secret: string | null = SECRET) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret === null ? {} : { [SECRET_HEADER]: secret }),
    },
    body,
  })

/** Let a dispatched update run. */
const settle = () => new Promise((done) => setTimeout(done, 20))

describe('a Koa application without a body parser', () => {
  it('reads the body itself, accepts an update and dispatches it once', async () => {
    const { handler, seen } = recording()
    const app = new Koa()
    app.use(koaWebhook(handler, { path: '/hook' }))
    const base = await serve(app)

    const first = await post(`${base}/hook`, JSON.stringify(update(1)))
    const again = await post(`${base}/hook`, JSON.stringify(update(1)))
    await settle()

    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toContain('text/plain')
    expect(again.status).toBe(200)
    expect(seen.map((one) => one.update_id)).toEqual([1])
  })

  it('refuses a missing or wrong secret, and dispatches nothing', async () => {
    const { handler, seen } = recording()
    const app = new Koa()
    app.use(koaWebhook(handler))
    const base = await serve(app)

    expect((await post(base, JSON.stringify(update(2)), 'wrong')).status).toBe(401)
    expect((await post(base, JSON.stringify(update(3)), null)).status).toBe(401)
    await settle()

    expect(seen).toEqual([])
  })

  it('answers what is not an update the way the other adapters do', async () => {
    const { handler, seen } = recording()
    const app = new Koa()
    app.use(koaWebhook(handler, { bodyLimit: 64 }))
    const base = await serve(app)

    expect((await fetch(base)).status).toBe(405)
    expect((await post(base, '{not json')).status).toBe(400)
    expect(
      (await post(base, JSON.stringify({ ...update(4), padding: 'x'.repeat(200) }))).status,
    ).toBe(413)
    expect(seen).toEqual([])
  })

  it('acknowledges an update whose handler fails, and reports the failure', async () => {
    const { handler, failures } = recording(() => {
      throw new Error('the handler broke')
    })
    const app = new Koa()
    app.use(koaWebhook(handler))
    const base = await serve(app)

    const response = await post(base, JSON.stringify(update(5)))
    await settle()

    // Acknowledged regardless: Telegram retries what it has not seen answered,
    // and a retry repeats whatever the handler managed before it failed.
    expect(response.status).toBe(200)
    expect(failures).toHaveLength(1)
    expect((failures[0] as Error).message).toBe('the handler broke')
  })

  it('passes other paths on to the next middleware', async () => {
    const { handler, seen } = recording()
    const app = new Koa()
    app.use(koaWebhook(handler, { path: '/hook' }))
    app.use((context) => {
      context.status = 404
      context.body = 'elsewhere'
    })
    const base = await serve(app)

    const response = await post(`${base}/other`, JSON.stringify(update(6)))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('elsewhere')
    expect(seen).toEqual([])
  })

  it("leaves a handler's own failure to Koa's error handling", async () => {
    const failing: WebhookHandler = () => Promise.reject(new Error('unexpected'))
    const app = new Koa()
    app.use(koaWebhook(failing))
    const base = await serve(app)

    expect((await post(base, JSON.stringify(update(7)))).status).toBe(500)
  })
})

describe('a Koa application with a body parser before the adapter', () => {
  it('uses the parsed body rather than reading the request again', async () => {
    const { handler, seen } = recording()
    const app = new Koa()
    app.use(async (context, next) => {
      // What a parser leaves behind: the stream consumed, the result on the
      // request. Reading the stream again would find it empty.
      let text = ''
      for await (const chunk of context.req) text += String(chunk)
      ;(context.request as { body?: unknown }).body = JSON.parse(text)
      await next()
    })
    app.use(koaWebhook(handler))
    const base = await serve(app)

    expect((await post(base, JSON.stringify(update(8)))).status).toBe(200)
    await settle()
    expect(seen.map((one) => one.update_id)).toEqual([8])
  })
})
