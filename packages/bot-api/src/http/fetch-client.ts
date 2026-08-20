/**
 * The default transport, built on the platform `fetch`.
 *
 * No HTTP dependency: Node 22 provides `fetch`, `FormData` and `Blob`, which is
 * the whole of what the Bot API needs. Every published package therefore ships
 * with zero runtime dependencies, and a library holding bot tokens has no
 * third-party code in the path a credential travels.
 */

import { ConfigError } from '@yuigram/core'
import type { ApiRequest, ApiResponse, ApiResult, HttpClient } from './client.js'
import { encodeRequest } from './multipart.js'

/** Options for {@link fetchClient}. */
export interface FetchClientOptions {
  /** Bot token issued by BotFather. */
  readonly token: string
  /**
   * API root. Point this at a local Bot API server to lift the 20 MB download
   * and 50 MB upload limits.
   */
  readonly baseUrl?: string
  /** Default timeout per call, in milliseconds. Defaults to 30 seconds. */
  readonly timeout?: number
  /** Extra headers sent with every request. */
  readonly headers?: Readonly<Record<string, string>>
  /** Injectable for tests; defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch

  /**
   * Whether the API root is a local Bot API server.
   *
   * A local server reports absolute on-disk paths in `file_path` and lifts the
   * 20 MB download and 50 MB upload limits, so downloads read from the
   * filesystem rather than over HTTP.
   */
  readonly local?: boolean
}

/** Shape of a bot token: numeric id, colon, secret. */
const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{30,}$/

/** Validate a token without ever echoing it. */
function assertToken(token: string): void {
  if (token === '') {
    throw new ConfigError('a bot token is required')
  }

  if (!TOKEN_PATTERN.test(token)) {
    // Deliberately does not include the value: a malformed token is still a
    // secret, and this message may be logged.
    throw new ConfigError(
      'the bot token is malformed; expected the form "<id>:<secret>" issued by BotFather',
    )
  }
}

/**
 * Create the default transport.
 *
 * Per the {@link HttpClient} contract this does not throw on `ok: false`. It
 * returns the envelope so the caller can read `error_code` and `parameters`,
 * which is what decides between retrying, re-addressing a migrated chat, or
 * giving up.
 */
/**
 * Trim trailing slashes from a base URL.
 *
 * Written as a scan rather than `replace(/\/+$/, '')`: that pattern backtracks
 * quadratically on a long run of slashes, which is the polynomial case static
 * analysis flags. The input is configuration rather than anything an attacker
 * reaches, so this is tidiness rather than a fix — but a linear scan is no
 * harder to read and leaves nothing to argue about.
 */
function withoutTrailingSlashes(url: string): string {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end -= 1
  return url.slice(0, end)
}

export function fetchClient(options: FetchClientOptions): HttpClient {
  assertToken(options.token)

  const baseUrl = withoutTrailingSlashes(options.baseUrl ?? 'https://api.telegram.org')
  const timeout = options.timeout ?? 30_000
  const impl = options.fetch ?? globalThis.fetch
  const extraHeaders = options.headers ?? {}

  // Held in a closure rather than on the returned object, so it cannot escape
  // through inspection or serialization of the client.
  const token = options.token

  return {
    fileUrl(filePath: string): string {
      // A local server hands back a path on disk, not something to fetch.
      if (options.local === true) return filePath
      return `${baseUrl}/file/bot${token}/${filePath}`
    },

    async fetchFile(url: string) {
      const response = await impl(url)
      return { status: response.status, body: response.body }
    },

    async call<T>(request: ApiRequest): Promise<ApiResult<T>> {
      const url = `${baseUrl}/bot${token}/${request.method}`
      const encoded = encodeRequest(request.params)

      const headers: Record<string, string> = { ...extraHeaders }
      if (encoded.contentType !== undefined) headers['content-type'] = encoded.contentType

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), request.timeout ?? timeout)
      // A pending timer must not hold the process open on its own.
      timer.unref?.()

      const onAbort = (): void => controller.abort()
      request.signal?.addEventListener('abort', onAbort, { once: true })

      try {
        request.signal?.throwIfAborted()

        const response = await impl(url, {
          method: 'POST',
          headers,
          body: encoded.body,
          signal: controller.signal,
        })

        const body = (await response.json()) as ApiResponse<T>
        return { status: response.status, body }
      } finally {
        clearTimeout(timer)
        request.signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}
