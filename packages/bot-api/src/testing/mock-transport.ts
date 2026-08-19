/**
 * An in-process Bot API server.
 *
 * Implements the same {@link HttpClient} seam the real transport does, so tests
 * drive genuine request construction, retry handling and response decoding.
 *
 * The failure injectors matter more than the happy path. Every condition here
 * is one Telegram actually produces, and a client that mishandles any of them
 * fails in production while passing a suite that only ever sees success.
 */

import type { ApiRequest, ApiResponse, ApiResult, HttpClient } from '../http/client.js'

/** A call as the mock recorded it. */
export interface RecordedCall {
  readonly method: string
  readonly params: Record<string, unknown>
  /** Order in which the call arrived, starting at 0. */
  readonly index: number
}

/** Produces a response for a call, or throws to simulate a transport failure. */
export type Responder = (request: ApiRequest) => ApiResult | Promise<ApiResult>

/** Raised by the mock to simulate a connection failure. */
export class MockNetworkError extends Error {
  override readonly name = 'MockNetworkError'
}

/** A successful envelope. */
export function ok<T>(result: T, status = 200): ApiResult<T> {
  return { status, body: { ok: true, result } }
}

/** A refusal, as Telegram sends it. */
export function apiError(
  code: number,
  description: string,
  parameters?: ApiResponse['parameters'],
): ApiResult {
  return {
    status: code,
    body: {
      ok: false,
      error_code: code,
      description,
      ...(parameters === undefined ? {} : { parameters }),
    },
  }
}

/** A 429 carrying `retry_after`, the shape rate limiting actually takes. */
export function floodWait(seconds: number): ApiResult {
  return apiError(429, 'Too Many Requests: retry later', { retry_after: seconds })
}

/** A 5xx, which is retryable where a 400 is not. */
export function serverError(status = 500): ApiResult {
  return apiError(status, 'Internal Server Error')
}

/** A migration hint, which requires re-addressing the chat rather than retrying. */
export function migrated(toChatId: number): ApiResult {
  return apiError(400, 'Bad Request: group chat was upgraded to a supergroup chat', {
    migrate_to_chat_id: toChatId,
  })
}

/** Options for {@link mockTransport}. */
export interface MockTransportOptions {
  /**
   * Response used when no responder matches.
   *
   * Defaults to a 400 naming the method, so an unscripted call fails loudly
   * rather than silently succeeding with an empty result.
   */
  readonly fallback?: Responder
}

/** An in-process Bot API server with recording and failure injection. */
export interface MockTransport extends HttpClient {
  /** Every call received, in order. */
  readonly calls: readonly RecordedCall[]

  /** Script a response for a method. Replaces any previous script. */
  on(method: string, responder: Responder | ApiResult): this
  /** Script a response used once, then discarded. Queues in order. */
  once(method: string, responder: Responder | ApiResult): this
  /** Make the next call to a method fail at the transport level. */
  failOnce(method: string, error?: Error): this
  /** Make the next call to a method return a body that is not valid JSON. */
  malformedOnce(method: string): this

  /** Calls recorded for one method. */
  callsTo(method: string): readonly RecordedCall[]
  /** The most recent call to a method, if any. */
  last(method: string): RecordedCall | undefined
  /** How many times a method was called. */
  count(method: string): number
  /** Forget every recorded call. Scripts are kept. */
  reset(): void
}

/** Sentinel a responder throws to signal an unparseable body. */
const MALFORMED = Symbol('malformed')

/** Create an in-process Bot API server. */
export function mockTransport(options: MockTransportOptions = {}): MockTransport {
  const calls: RecordedCall[] = []
  const responders = new Map<string, Responder>()
  const queued = new Map<string, Responder[]>()

  const fallback: Responder =
    options.fallback ??
    ((request) => apiError(400, `Bad Request: no mock response for '${request.method}'`))

  const toResponder = (value: Responder | ApiResult): Responder =>
    typeof value === 'function' ? value : () => value

  const enqueue = (method: string, responder: Responder): void => {
    const existing = queued.get(method)
    if (existing === undefined) queued.set(method, [responder])
    else existing.push(responder)
  }

  const transport: MockTransport = {
    get calls() {
      return calls
    },

    on(method, responder) {
      responders.set(method, toResponder(responder))
      return this
    },

    once(method, responder) {
      enqueue(method, toResponder(responder))
      return this
    },

    failOnce(method, error) {
      enqueue(method, () => {
        throw error ?? new MockNetworkError('socket hang up')
      })
      return this
    },

    malformedOnce(method) {
      enqueue(method, () => {
        throw MALFORMED
      })
      return this
    },

    callsTo(method) {
      return calls.filter((call) => call.method === method)
    },

    last(method) {
      return this.callsTo(method).at(-1)
    },

    count(method) {
      return this.callsTo(method).length
    },

    reset() {
      calls.length = 0
    },

    async call<T>(request: ApiRequest): Promise<ApiResult<T>> {
      // Abort is checked before recording: a cancelled call never reached
      // Telegram, so recording it would misrepresent what was sent.
      request.signal?.throwIfAborted()

      calls.push({ method: request.method, params: request.params, index: calls.length })

      const pending = queued.get(request.method)
      const responder = pending?.shift() ?? responders.get(request.method) ?? fallback
      if (pending !== undefined && pending.length === 0) queued.delete(request.method)

      try {
        return (await responder(request)) as ApiResult<T>
      } catch (error) {
        if (error === MALFORMED) {
          // A body that is not JSON at all — what a proxy or an error page
          // produces, and a case a client must not treat as a valid envelope.
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        }
        throw error
      }
    },
  }

  return transport
}
