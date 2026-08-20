/**
 * `node:http` adapter.
 *
 * The only adapter that reads the request itself; the others receive a body
 * their framework has already parsed. Everything framework-specific lives here
 * and in its two siblings, so the handler stays a pure request-to-response
 * function that can be tested without a server.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { ValidationError } from '@yuigram/core'
import { DEFAULT_BODY_LIMIT, parseJson, readBody } from './body.js'
import type { WebhookHandler } from './handler.js'

/** Options for {@link nodeWebhook}. */
export interface NodeAdapterOptions {
  /** Largest accepted request body, in bytes. */
  readonly bodyLimit?: number
  /**
   * Only serve this path.
   *
   * Worth setting when the bot shares a server with anything else: without it
   * the handler answers every request the server routes to it, including ones
   * meant for another endpoint.
   */
  readonly path?: string
}

/** A `node:http` request listener. */
export type NodeListener = (request: IncomingMessage, response: ServerResponse) => Promise<void>

/**
 * Adapt a webhook handler to `node:http`.
 *
 * ```ts
 * import { createServer } from 'node:http'
 *
 * createServer(nodeWebhook(bot.webhookHandler({ secretToken }))).listen(8080)
 * ```
 */
export function nodeWebhook(
  handler: WebhookHandler,
  options: NodeAdapterOptions = {},
): NodeListener {
  const { bodyLimit = DEFAULT_BODY_LIMIT, path } = options

  return async (request, response) => {
    if (path !== undefined && pathOf(request.url) !== path) {
      response.writeHead(404).end()
      return
    }

    let body: unknown

    try {
      body = parseJson(await readBody(request, bodyLimit))
    } catch (error) {
      // An oversized body is refused with the status that describes it, rather
      // than the 400 an unparseable body would get.
      const oversized = error instanceof ValidationError
      response.writeHead(oversized ? 413 : 400).end()
      return
    }

    const result = await handler({
      method: request.method ?? 'GET',
      headers: request.headers,
      body,
    })

    response.writeHead(result.status, { 'content-type': result.contentType })
    response.end(result.body)
  }
}

/** The path portion of a request URL, ignoring any query string. */
function pathOf(url: string | undefined): string {
  if (url === undefined) return '/'
  const query = url.indexOf('?')
  return query === -1 ? url : url.slice(0, query)
}
