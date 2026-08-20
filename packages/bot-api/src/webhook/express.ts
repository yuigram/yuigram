/**
 * Express adapter.
 *
 * Typed structurally rather than against Express's own declarations, so
 * Yuigram neither depends on Express nor pins a version of it. Any object with
 * these members works, which includes every Express 4 and 5 request and the
 * many frameworks that imitate them.
 */

import { ValidationError } from '@yuigram/core'
import { type ByteStream, DEFAULT_BODY_LIMIT, parseJson, readBody } from './body.js'
import type { WebhookHandler } from './handler.js'

/** The part of an Express request this adapter uses. */
export interface ExpressRequest extends ByteStream {
  readonly method?: string | undefined
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  /** Present when a body parser has already run. */
  readonly body?: unknown
}

/** The part of an Express response this adapter uses. */
export interface ExpressResponse {
  status(code: number): ExpressResponse
  set(field: string, value: string): ExpressResponse
  send(body: string): unknown
}

/** An Express request handler. */
export type ExpressMiddleware = (
  request: ExpressRequest,
  response: ExpressResponse,
) => Promise<void>

/**
 * Adapt a webhook handler to Express.
 *
 * ```ts
 * app.use('/webhook', expressWebhook(bot.webhookHandler({ secretToken })))
 * ```
 *
 * Works with or without `express.json()`. When a body parser has already run,
 * its result is used; otherwise the body is read here, under the same size
 * limit the other adapters apply.
 */
export function expressWebhook(
  handler: WebhookHandler,
  options: { readonly bodyLimit?: number } = {},
): ExpressMiddleware {
  const { bodyLimit = DEFAULT_BODY_LIMIT } = options

  return async (request, response) => {
    let body = request.body

    if (body === undefined) {
      try {
        body = parseJson(await readBody(request, bodyLimit))
      } catch (error) {
        response.status(error instanceof ValidationError ? 413 : 400).send('')
        return
      }
    }

    const result = await handler({
      method: request.method ?? 'GET',
      headers: request.headers,
      body,
    })

    response.status(result.status).set('content-type', result.contentType).send(result.body)
  }
}
