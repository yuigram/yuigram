/**
 * The callable API surface.
 *
 * 185 methods, no per-method runtime code. The types come from the generated
 * declarations; dispatch is a proxy. A method Telegram adds works as soon as
 * the schema regenerates, with nothing to write by hand.
 *
 * `call()` is the escape hatch for anything newer than the installed schema, so
 * a Telegram release never leaves a user unable to reach a new method.
 */

import type { CallOptions } from './api-options.js'
import { toError, toNetworkError } from './errors.js'
import type { ApiMethods } from './generated/api.js'
import type { ApiRequest, HttpClient } from './http/client.js'

/** Extra controls accepted alongside the generated method surface. */
export interface RawApiExtras {
  /**
   * Call a method by name, bypassing the generated types.
   *
   * For methods newer than the installed schema. Without this, every Telegram
   * release would temporarily block someone.
   */
  call<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<T>
}

/** The typed method surface plus the untyped escape hatch. */
export type RawApi = ApiMethods & RawApiExtras

/** Options for {@link createApi}. */
export interface CreateApiOptions {
  /** Transport to send through. */
  readonly client: HttpClient
  /** Merged into every call, unless the call site supplies the parameter. */
  readonly defaults?: Readonly<Record<string, unknown>>
  /** Observes every call, for retry, throttling or instrumentation. */
  readonly onCall?: (request: ApiRequest) => void
}

/**
 * Perform one call and unwrap the envelope.
 *
 * A refusal becomes an error here rather than in the transport, which returns
 * the envelope so this layer can read `error_code` and `parameters`.
 */
async function invoke<T>(
  client: HttpClient,
  method: string,
  params: Record<string, unknown>,
  onCall?: (request: ApiRequest) => void,
  options?: CallOptions,
): Promise<T> {
  const request: ApiRequest = { method, params, signal: options?.signal, timeout: options?.timeout }
  onCall?.(request)

  let result: Awaited<ReturnType<HttpClient['call']>>

  try {
    result = await client.call<T>(request)
  } catch (error) {
    // An abort is the caller's own doing and is passed through unchanged;
    // wrapping it as a network failure would misreport a deliberate cancel.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw toNetworkError(method, error)
  }

  if (!result.body.ok) {
    throw toError(method, result.status, result.body)
  }

  return result.body.result as T
}

/**
 * Build the API surface.
 *
 * The proxy is the entire runtime. Everything else is types.
 */
export function createApi(options: CreateApiOptions): RawApi {
  const { client, defaults = {}, onCall } = options

  const target = {} as RawApi

  return new Proxy(target, {
    get(_target, property): unknown {
      if (typeof property !== 'string') return undefined

      if (property === 'call') {
        return (method: string, params: Record<string, unknown> = {}, options?: CallOptions) =>
          invoke(client, method, { ...defaults, ...params }, onCall, options)
      }

      // Guard against a runtime probing the proxy for a thenable, which would
      // otherwise be answered with a function and make the object await-able.
      if (property === 'then') return undefined

      return (params: Record<string, unknown> = {}, options?: CallOptions) =>
        invoke(client, property, { ...defaults, ...params }, onCall, options)
    },

    has(_target, property) {
      return typeof property === 'string' && property !== 'then'
    },
  })
}
