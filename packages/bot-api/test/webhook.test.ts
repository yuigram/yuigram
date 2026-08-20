/**
 * Webhook handling.
 *
 * The rejection and deduplication cases are the ones with consequences. A
 * webhook URL is a public endpoint, and Telegram retries anything it has not
 * seen acknowledged — so an unvalidated handler accepts forged updates, and a
 * slow one produces duplicated side effects the user can see.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Update } from '../src/generated/types/index.js'
import { createWebhookHandler, SECRET_HEADER, type WebhookRequest } from '../src/webhook/handler.js'

const SECRET = 'a-shared-secret-value'

/** Build a request with sensible defaults. */
function request(overrides: Partial<WebhookRequest> = {}): WebhookRequest {
  return {
    method: 'POST',
    headers: {},
    body: { update_id: 1, message: { message_id: 1, text: 'hi' } },
    ...overrides,
  }
}

describe('request validation', () => {
  it('accepts a well-formed POST', async () => {
    const handler = createWebhookHandler({ onUpdate: () => {} })
    expect((await handler(request())).status).toBe(200)
  })

  it('rejects a non-POST method', async () => {
    const handler = createWebhookHandler({ onUpdate: () => {} })
    expect((await handler(request({ method: 'GET' }))).status).toBe(405)
  })

  it('rejects a body that is not an object', async () => {
    const handler = createWebhookHandler({ onUpdate: () => {} })

    expect((await handler(request({ body: undefined }))).status).toBe(400)
    expect((await handler(request({ body: 'not json' }))).status).toBe(400)
    expect((await handler(request({ body: null }))).status).toBe(400)
  })

  it('rejects a body with no update id', async () => {
    // Anything can POST JSON to a public URL; a payload without an update id
    // is not an update.
    const handler = createWebhookHandler({ onUpdate: () => {} })
    expect((await handler(request({ body: { hello: 'world' } }))).status).toBe(400)
  })

  it('does not dispatch a rejected request', async () => {
    const onUpdate = vi.fn()
    const handler = createWebhookHandler({ onUpdate })

    await handler(request({ method: 'GET' }))
    await handler(request({ body: 'nope' }))

    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('secret validation', () => {
  it('accepts a matching secret', async () => {
    const handler = createWebhookHandler({ onUpdate: () => {}, secretToken: SECRET })
    const response = await handler(request({ headers: { [SECRET_HEADER]: SECRET } }))

    expect(response.status).toBe(200)
  })

  it('rejects a wrong secret', async () => {
    const handler = createWebhookHandler({ onUpdate: () => {}, secretToken: SECRET })
    const response = await handler(request({ headers: { [SECRET_HEADER]: 'wrong' } }))

    expect(response.status).toBe(401)
  })

  it('rejects a missing secret when one is configured', async () => {
    const handler = createWebhookHandler({ onUpdate: () => {}, secretToken: SECRET })
    expect((await handler(request())).status).toBe(401)
  })

  it('rejects a secret of the right length but wrong content', async () => {
    // Guards the constant-time comparison: equal lengths take the slow path.
    const handler = createWebhookHandler({ onUpdate: () => {}, secretToken: SECRET })
    const wrong = 'b'.repeat(SECRET.length)

    expect((await handler(request({ headers: { [SECRET_HEADER]: wrong } }))).status).toBe(401)
  })

  it('does not dispatch when the secret is wrong', async () => {
    const onUpdate = vi.fn()
    const handler = createWebhookHandler({ onUpdate, secretToken: SECRET })

    await handler(request({ headers: { [SECRET_HEADER]: 'wrong' } }))

    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('takes the first value when an adapter supplies several', async () => {
    const handler = createWebhookHandler({ onUpdate: () => {}, secretToken: SECRET })
    const response = await handler(request({ headers: { [SECRET_HEADER]: [SECRET, 'other'] } }))

    expect(response.status).toBe(200)
  })

  it('warns when running without a secret', async () => {
    // A webhook URL leaks through logs and proxies, so an unprotected endpoint
    // is worth saying out loud rather than silently accepting.
    const warn = vi.fn()
    createWebhookHandler({
      onUpdate: () => {},
      log: { warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
    })

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('secret'))
  })
})

describe('dispatch', () => {
  it('passes the update to the handler', async () => {
    const seen: Update[] = []
    const handler = createWebhookHandler({
      onUpdate: (update) => {
        seen.push(update)
      },
    })

    await handler(request())
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    expect(seen[0]?.update_id).toBe(1)
  })

  it('responds before the handler finishes', async () => {
    // Telegram retries anything it has not seen acknowledged, so holding the
    // response open is what produces duplicates under load.
    let released!: () => void
    const blocked = new Promise<void>((resolve) => {
      released = resolve
    })

    const handler = createWebhookHandler({ onUpdate: () => blocked })
    const response = await handler(request())

    expect(response.status).toBe(200)
    released()
  })

  it('reports a handler failure without failing the response', async () => {
    const onError = vi.fn()
    const handler = createWebhookHandler({
      onUpdate: () => {
        throw new Error('handler failed')
      },
      onError,
    })

    const response = await handler(request())

    expect(response.status).toBe(200)
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
  })

  it('tracks dispatched work so shutdown can drain it', async () => {
    const tracked: Array<Promise<void>> = []
    const handler = createWebhookHandler({
      onUpdate: () => {},
      track: (work) => {
        tracked.push(work)
      },
    })

    await handler(request())

    expect(tracked).toHaveLength(1)
    await expect(Promise.all(tracked)).resolves.toBeDefined()
  })
})

describe('deduplication', () => {
  it('ignores a repeated update id', async () => {
    const onUpdate = vi.fn()
    const handler = createWebhookHandler({ onUpdate })

    await handler(request())
    await handler(request())

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
  })

  it('still acknowledges a duplicate', async () => {
    // Answering anything but 200 would make Telegram retry it again.
    const handler = createWebhookHandler({ onUpdate: () => {} })

    await handler(request())

    expect((await handler(request())).status).toBe(200)
  })

  it('accepts distinct updates', async () => {
    const onUpdate = vi.fn()
    const handler = createWebhookHandler({ onUpdate })

    await handler(request({ body: { update_id: 1, message: {} } }))
    await handler(request({ body: { update_id: 2, message: {} } }))

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))
  })

  it('forgets ids beyond the window', async () => {
    const onUpdate = vi.fn()
    const handler = createWebhookHandler({ onUpdate, dedupeWindow: 2 })

    for (const id of [1, 2, 3]) {
      await handler(request({ body: { update_id: id, message: {} } }))
    }
    // 1 was evicted, so it is treated as new again.
    await handler(request({ body: { update_id: 1, message: {} } }))

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(4))
  })

  it('can be disabled for idempotent handlers', async () => {
    const onUpdate = vi.fn()
    const handler = createWebhookHandler({ onUpdate, dedupeWindow: 0 })

    await handler(request())
    await handler(request())

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))
  })
})
