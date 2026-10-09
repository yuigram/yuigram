// SPDX-License-Identifier: MIT

/**
 * Koa adapter.
 *
 * Typed structurally rather than against Koa's own declarations, so Yuigram
 * neither depends on Koa nor pins a version of it. Any context with these
 * members works, which includes Koa 2 and 3.
 *
 * Koa owns the response. The adapter sets the status, the content type and the
 * body on the context, once, and writes nothing to the underlying socket: Koa
 * sends what the context holds when the middleware chain unwinds, exactly as
 * it would for any other route, so there is no second writer to race.
 */

import { ValidationError } from '@yuigram/core'
import { type ByteStream, DEFAULT_BODY_LIMIT, parseJson, readBody } from './body.js'
import type { WebhookHandler } from './handler.js'

/** The part of a Koa context this adapter uses. */
export interface KoaContext {
  readonly method: string
  /** The path of the request, without its query string. */
  readonly path: string
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  /** Koa's request; `body` is present when a body parser has already run. */
  readonly request: { readonly body?: unknown }
  /** Node's request, read when no body parser has run. */
  readonly req: ByteStream
  status: number
  body: unknown
  set(field: string, value: string): void
}

/** Options for {@link koaWebhook}. */
export interface KoaAdapterOptions {
  /** Largest accepted request body, in bytes, when the adapter reads it itself. */
  readonly bodyLimit?: number
  /**
   * Only serve this path, and pass every other request on to the next middleware.
   *
   * Without it the middleware answers every request that reaches it, which is
   * right when it is mounted on a route of its own and wrong when it is not.
   */
  readonly path?: string
}

/** A Koa middleware. */
export type KoaMiddleware = (context: KoaContext, next: () => Promise<unknown>) => Promise<void>

/**
 * Adapt a webhook handler to Koa.
 *
 * ```ts
 * app.use(koaWebhook(bot.webhookHandler({ secretToken }), { path: '/webhook' }))
 * ```
 *
 * Works with or without a body parser. When one has already run, its result is
 * used; otherwise the request is read here, under the same size limit the
 * other adapters apply, so an oversized body is refused with 413 and an
 * unreadable one with 400. A handler that throws is left to Koa's own error
 * handling rather than answered here.
 */
export function koaWebhook(
  handler: WebhookHandler,
  options: KoaAdapterOptions = {},
): KoaMiddleware {
  const { bodyLimit = DEFAULT_BODY_LIMIT, path } = options

  return async (context, next) => {
    if (path !== undefined && context.path !== path) {
      await next()
      return
    }

    let body = context.request.body

    if (body === undefined) {
      try {
        body = parseJson(await readBody(context.req, bodyLimit))
      } catch (error) {
        context.status = error instanceof ValidationError ? 413 : 400
        context.body = ''
        return
      }
    }

    const result = await handler({ method: context.method, headers: context.headers, body })

    context.status = result.status
    context.set('content-type', result.contentType)
    context.body = result.body
  }
}
