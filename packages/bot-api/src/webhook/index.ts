/**
 * Webhook handling and its framework adapters.
 *
 * The handler is a pure request-to-response function. Each adapter is the few
 * lines that translate one framework's request and reply objects into it, and
 * none of them is a dependency: the adapters describe the shape they need
 * structurally, so no framework has to be installed for the types to resolve.
 */

export { type ByteStream, DEFAULT_BODY_LIMIT, parseJson, readBody } from './body.js'
export {
  type ExpressMiddleware,
  type ExpressRequest,
  type ExpressResponse,
  expressWebhook,
} from './express.js'
export {
  type FastifyReply,
  type FastifyRequest,
  type FastifyRouteHandler,
  fastifyWebhook,
} from './fastify.js'
export {
  createWebhookHandler,
  SECRET_HEADER,
  type WebhookHandler,
  type WebhookOptions,
  type WebhookRequest,
  type WebhookResponse,
} from './handler.js'
export { type NodeAdapterOptions, type NodeListener, nodeWebhook } from './node.js'
