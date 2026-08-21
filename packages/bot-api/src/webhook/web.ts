/**
 * The Fetch API adapter.
 *
 * One `Request` in, one `Response` out — which is the interface Hono, Elysia,
 * h3, Bun, Deno, Cloudflare Workers, Vercel Edge and Next.js route handlers all
 * speak. Adapting each of them separately would be five files that differ in
 * their imports and nothing else.
 *
 * ```ts
 * // Hono
 * app.post('/webhook', (c) => webWebhook(handler)(c.req.raw))
 *
 * // Bun, Deno, or a Worker
 * export default { fetch: webWebhook(handler) }
 *
 * // Next.js route handler
 * export const POST = webWebhook(handler)
 * ```
 *
 * Yuigram does not depend on any of them: `Request` and `Response` are
 * platform globals on every runtime that has this shape, and Node has had them
 * since 18.
 */

import { ValidationError } from '@yuigram/core'
import { DEFAULT_BODY_LIMIT, parseJson } from './body.js'
import type { WebhookHandler } from './handler.js'

/** Options for {@link webWebhook}. */
export interface WebAdapterOptions {
  /**
   * Largest body to accept, in bytes.
   *
   * A webhook endpoint is public the moment its URL leaks, so a limit is a
   * denial-of-service control rather than a tuning knob.
   */
  readonly bodyLimit?: number
  /**
   * Only handle requests whose path matches.
   *
   * Omit it when the router already decided, which is the usual case here —
   * unlike the Node adapter, this one is normally mounted at a route.
   */
  readonly path?: string
}

/** A Fetch-style handler. */
export type FetchHandler = (request: Request) => Promise<Response>

/** Read a request body under a size limit, without buffering past it. */
async function readLimited(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get('content-length')

  if (declared !== null && Number(declared) > limit) {
    throw new ValidationError(`webhook body is larger than the ${limit} byte limit`)
  }

  const body = request.body
  if (body === null) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    size += value.length

    if (size > limit) {
      // Cancelling stops the sender rather than reading a large body to the
      // end only to reject it.
      await reader.cancel()
      throw new ValidationError(`webhook body is larger than the ${limit} byte limit`)
    }

    chunks.push(value)
  }

  return new TextDecoder().decode(concat(chunks, size))
}

/** Join chunks into one buffer. */
function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size)
  let offset = 0

  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }

  return out
}

/**
 * Adapt a webhook handler to the Fetch API.
 *
 * A body that is too large, or is not JSON, is answered `400` rather than
 * thrown: Telegram retries anything it does not see acknowledged, and a
 * rejected promise in a Worker becomes a `500` and a retry loop.
 */
export function webWebhook(handler: WebhookHandler, options: WebAdapterOptions = {}): FetchHandler {
  const { bodyLimit = DEFAULT_BODY_LIMIT, path } = options

  return async (request) => {
    if (path !== undefined && new URL(request.url).pathname !== path) {
      return new Response('', { status: 404 })
    }

    let body: unknown

    try {
      body = parseJson(await readLimited(request, bodyLimit))
    } catch {
      return new Response('', { status: 400 })
    }

    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    const result = await handler({ method: request.method, headers, body })

    return new Response(result.body, {
      status: result.status,
      headers: { 'content-type': result.contentType },
    })
  }
}
