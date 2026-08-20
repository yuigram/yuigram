/**
 * Webhook handling.
 *
 * Framework-agnostic: the handler takes a parsed request and returns a
 * response, so adapters for node, express, fastify and the rest are a few lines
 * each and none of them leaks into the core.
 *
 * Three behaviours are not negotiable:
 *
 * - **Respond before dispatching.** Telegram retries an update it has not seen
 *   acknowledged, so waiting for the handler produces duplicates under exactly
 *   the load where duplicates hurt most.
 * - **Validate the secret in constant time.** It is the only thing separating
 *   a real update from anyone who guessed the URL.
 * - **Deduplicate.** Retries are normal, and a duplicated side effect — a
 *   second reply, a second charge — is visible to the user.
 */

import { timingSafeEqual } from 'node:crypto'
import type { Logger } from '@yuigram/core'
import type { Update } from './generated/types/index.js'

/** The header Telegram sends the configured secret in. */
export const SECRET_HEADER = 'x-telegram-bot-api-secret-token'

/** A request, already parsed by an adapter. */
export interface WebhookRequest {
  readonly method: string
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  /** The decoded JSON body, or `undefined` if it could not be parsed. */
  readonly body: unknown
}

/** A response for the adapter to write. */
export interface WebhookResponse {
  readonly status: number
  readonly body: string
  readonly contentType: string
}

/** Options for {@link createWebhookHandler}. */
export interface WebhookOptions {
  /** Called for each accepted update. */
  readonly onUpdate: (update: Update) => Promise<void> | void
  /** Reports a failure from a dispatched handler. */
  readonly onError?: (error: unknown, update: Update) => void
  readonly log?: Logger

  /**
   * Shared secret, set through `setWebhook`.
   *
   * Strongly recommended. Without it, anyone who learns the URL can post
   * updates, and webhook URLs leak through logs and proxies.
   */
  readonly secretToken?: string

  /**
   * Remember this many recent update ids for deduplication.
   *
   * Set to `0` to accept every delivery, which is only correct if handlers are
   * idempotent.
   */
  readonly dedupeWindow?: number

  /** Tracks a dispatch so shutdown can drain it. */
  readonly track?: (work: Promise<void>) => void
}

/** A request handler an adapter can drive. */
export type WebhookHandler = (request: WebhookRequest) => Promise<WebhookResponse>

const EMPTY: WebhookResponse = { status: 200, body: '', contentType: 'text/plain' }

/** Build a response with no body. */
function status(code: number): WebhookResponse {
  return { status: code, body: '', contentType: 'text/plain' }
}

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Length is compared first and separately, which is unavoidable — the length
 * of a secret is not the secret.
 */
function secretMatches(expected: string, received: string | undefined): boolean {
  if (received === undefined) return false

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(received, 'utf8')

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Read a header, taking the first value when an adapter supplies several. */
function header(headers: WebhookRequest['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/** A bounded set of recently-seen ids, oldest evicted first. */
function recentIds(max: number): { seen(id: number): boolean } {
  const ids = new Set<number>()

  return {
    seen(id) {
      if (ids.has(id)) return true

      ids.add(id)
      if (ids.size > max) {
        const oldest = ids.values().next()
        if (oldest.done !== true) ids.delete(oldest.value)
      }

      return false
    },
  }
}

/** Create a framework-agnostic webhook handler. */
export function createWebhookHandler(options: WebhookOptions): WebhookHandler {
  const { onUpdate, onError, log, secretToken, dedupeWindow = 1000, track } = options
  const recent = dedupeWindow > 0 ? recentIds(dedupeWindow) : undefined

  if (secretToken === undefined) {
    log?.warn('webhook running without a secret token; anyone who learns the URL can post updates')
  }

  return async (request) => {
    if (request.method !== 'POST') return status(405)

    if (secretToken !== undefined) {
      if (!secretMatches(secretToken, header(request.headers, SECRET_HEADER))) {
        log?.warn('rejected a webhook request with an invalid secret')
        return status(401)
      }
    }

    if (typeof request.body !== 'object' || request.body === null) return status(400)

    const update = request.body as Update

    if (typeof update.update_id !== 'number') return status(400)

    if (recent?.seen(update.update_id) === true) {
      // A retry Telegram sent because it did not see the first acknowledgement.
      log?.debug('ignored a duplicate update', { updateId: update.update_id })
      return EMPTY
    }

    // Dispatched without awaiting: Telegram retries anything it has not seen
    // acknowledged, so holding the response open produces the duplicates this
    // handler just went to the trouble of filtering.
    const work = Promise.resolve()
      .then(() => onUpdate(update))
      .catch((error: unknown) => {
        log?.error('webhook handler failed', { updateId: update.update_id, error })
        onError?.(error, update)
      })

    track?.(work)

    return EMPTY
  }
}
