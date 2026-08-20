/**
 * Bot API error mapping.
 *
 * Refusals arrive as values from the transport and are turned into errors here,
 * where the shape of a Bot API response is understood. The original envelope is
 * always preserved: an error a caller cannot diagnose from the object is a
 * framework bug.
 *
 * No error carries a URL. The bot token sits in the request path, and an error
 * object is the most common route by which one reaches a log aggregator.
 */

import { FloodError, NetworkError, TelegramError } from '@yuigram/core'
import type { ApiResponse } from './http/client.js'

/** Telegram refused the call. */
export class BotApiError extends TelegramError {
  override readonly name = 'BotApiError'

  /** Telegram's numeric error code, such as 400 or 403. */
  readonly code: number
  /** Telegram's human-readable description. */
  readonly description: string
  /** The supergroup this chat migrated to, when that is why the call failed. */
  readonly migrateToChatId: number | undefined

  constructor(method: string, response: ApiResponse) {
    const code = response.error_code ?? 0
    const description = response.description ?? 'unknown error'

    super(`${method} failed: ${code} ${description}`, { method, cause: response })

    this.code = code
    this.description = description
    this.migrateToChatId = response.parameters?.migrate_to_chat_id
  }
}

/**
 * Build the right error for a failed response.
 *
 * A 429 becomes `FloodError` so it can be caught alongside the MTProto
 * equivalent — the one case where the two transports genuinely agree.
 */
export function toError(method: string, status: number, response: ApiResponse): TelegramError {
  const retryAfter = response.parameters?.retry_after

  if (status === 429 || retryAfter !== undefined) {
    return new FloodError(`${method} rate limited`, {
      method,
      retryAfter: retryAfter ?? 0,
      cause: response,
    })
  }

  return new BotApiError(method, response)
}

/**
 * Wrap a transport failure.
 *
 * The cause is preserved, but the message never includes the request URL: the
 * token is in the path, and error objects are the most common way one escapes.
 */
export function toNetworkError(method: string, cause: unknown): NetworkError {
  return new NetworkError(`${method} could not reach the Telegram API`, { cause })
}

/** Whether a failure is worth retrying without changing the request. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof FloodError) return true
  if (error instanceof NetworkError) return true
  // 5xx is Telegram's problem and usually transient; 4xx is the caller's.
  return error instanceof BotApiError && error.code >= 500
}
