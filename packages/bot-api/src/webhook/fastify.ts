/**
 * Fastify adapter.
 *
 * Fastify parses a JSON body before the handler runs, so this adapter never
 * reads the request itself and the body limit is Fastify's own `bodyLimit`
 * setting rather than one Yuigram imposes.
 *
 * Typed structurally, so Yuigram neither depends on Fastify nor pins a version.
 */

import type { WebhookHandler } from './handler.js'

/** The part of a Fastify request this adapter uses. */
export interface FastifyRequest {
  readonly method?: string | undefined
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly body?: unknown
}

/** The part of a Fastify reply this adapter uses. */
export interface FastifyReply {
  code(status: number): FastifyReply
  header(name: string, value: string): FastifyReply
  send(payload: string): unknown
}

/** A Fastify route handler. */
export type FastifyRouteHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>

/**
 * Adapt a webhook handler to Fastify.
 *
 * ```ts
 * app.post('/webhook', fastifyWebhook(bot.webhookHandler({ secretToken })))
 * ```
 */
export function fastifyWebhook(handler: WebhookHandler): FastifyRouteHandler {
  return async (request, reply) => {
    const result = await handler({
      method: request.method ?? 'POST',
      headers: request.headers,
      body: request.body,
    })

    await reply.code(result.status).header('content-type', result.contentType).send(result.body)
  }
}
