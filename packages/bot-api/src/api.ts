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

import { YuigramError } from '@yuigram/core'
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

/**
 * Properties a runtime or library asks for before deciding what an object is.
 *
 * The proxy cannot distinguish these from a Telegram method name, and
 * answering them with a callable turns a serialization, a coercion or an
 * `await` into an API call. No Bot API method is named any of them.
 */
const PROBED_PROPERTIES: ReadonlySet<string | symbol> = new Set([
  'then',
  'toJSON',
  'toString',
  'valueOf',
  'constructor',
  'inspect',
])

/** The typed method surface plus the untyped escape hatch. */
export type RawApi = ApiMethods & RawApiExtras

/**
 * One outgoing call, as a hook sees it.
 *
 * `params` is mutable on purpose: adjusting a parameter before the request
 * goes out is most of what a hook is for — filling a default the caller
 * omitted, trimming a payload, forcing `parse_mode` for a whole application.
 */
export interface ApiCall {
  /** Method being called. */
  readonly method: string
  /** Parameters, after defaults and before encoding. */
  params: Record<string, unknown>
  /** Per-call controls the caller supplied. */
  readonly options: CallOptions | undefined
  /** How many times `next()` has been entered, starting at 1. */
  readonly attempt: number
}

/**
 * Middleware around an outgoing API call.
 *
 * Composed like handler middleware — outermost first — with `next()` sending
 * the request. Calling `next()` more than once retries it, which is what makes
 * flood-wait handling, throttling and caching ordinary userland code rather
 * than framework features:
 *
 * ```ts
 * bot.hook(async (call, next) => {
 *   const started = performance.now()
 *   try {
 *     return await next()
 *   } finally {
 *     metrics.observe(call.method, performance.now() - started)
 *   }
 * })
 * ```
 */
export type ApiHook = (call: ApiCall, next: () => Promise<unknown>) => Promise<unknown>

/** Options for {@link createApi}. */
export interface CreateApiOptions {
  /** Transport to send through. */
  readonly client: HttpClient
  /** Merged into every call, unless the call site supplies the parameter. */
  readonly defaults?: Readonly<Record<string, unknown>>
  /** Observes every call, for instrumentation. */
  readonly onCall?: (request: ApiRequest) => void
  /**
   * Hooks wrapping every call.
   *
   * Read at call time rather than captured, so a hook registered after the
   * client was built still applies — which is what lets a plugin install one.
   */
  readonly hooks?: readonly ApiHook[]
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

    // So is anything the framework raised on purpose. Encoding happens inside
    // the transport call, so a refusal from it — a single-use upload asked for
    // twice — would otherwise be reported as "could not reach the Telegram
    // API", which is both false and unactionable. The message that explains
    // the problem must be the one the caller sees.
    if (error instanceof YuigramError) throw error

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
  const { client, defaults = {}, onCall, hooks } = options

  /** Run one call through the hook chain, then the transport. */
  const send = async <T>(
    method: string,
    params: Record<string, unknown>,
    callOptions?: CallOptions,
  ): Promise<T> => {
    const chain = hooks ?? []
    if (chain.length === 0) return invoke<T>(client, method, params, onCall, callOptions)

    const call: {
      method: string
      params: Record<string, unknown>
      options: CallOptions | undefined
      attempt: number
    } = {
      method,
      params,
      options: callOptions,
      attempt: 0,
    }

    let result: unknown

    /** Enter hook `index`, or send the request once the chain is exhausted. */
    const step = async (index: number): Promise<unknown> => {
      const hook = chain[index]

      if (hook === undefined) {
        call.attempt += 1
        result = await invoke<T>(client, call.method, call.params, onCall, call.options)
        return result
      }

      // A hook that never calls `next()` short-circuits deliberately — a cache
      // hit, a refusal — so its return value is the result.
      return hook(call as ApiCall, () => step(index + 1))
    }

    return (await step(0)) as T
  }

  const target = {} as RawApi

  return new Proxy(target, {
    get(target, property): unknown {
      if (typeof property !== 'string') return undefined

      if (property === 'call') {
        return (method: string, params: Record<string, unknown> = {}, options?: CallOptions) =>
          send(method, { ...defaults, ...params }, options)
      }

      // Runtimes and libraries probe objects for these before deciding what
      // they are. The proxy answers every string property with a function, so
      // without this an innocent `JSON.stringify(ctx)` calls `toJSON`, which
      // sends a real request to Telegram for a method named `toJSON` and
      // rejects — from an error tracker serializing a context, which is the
      // worst possible moment for it.
      //
      // Deferring to the plain object makes the surface behave like an
      // ordinary one here: `toJSON` and `then` are absent, `toString` and
      // `valueOf` work normally. None of the 185 Bot API methods is named any
      // of them, so nothing real is shadowed.
      if (PROBED_PROPERTIES.has(property)) return Reflect.get(target, property) as unknown

      return (params: Record<string, unknown> = {}, options?: CallOptions) =>
        send(property, { ...defaults, ...params }, options)
    },

    has(target, property) {
      if (typeof property !== 'string') return false
      if (PROBED_PROPERTIES.has(property)) return Reflect.has(target, property)
      return true
    },
  })
}
