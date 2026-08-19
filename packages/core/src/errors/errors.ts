/**
 * The error hierarchy.
 *
 * Every error preserves its origin. Wrapping must never destroy information:
 * an error a user cannot diagnose from the object is a bug in the framework,
 * not an inconvenience.
 *
 * Transport-specific errors (Bot API responses, TL RPC errors) subclass these
 * in their own packages. Core defines only what is genuinely shared.
 */

/** Options accepted by every Yuigram error. */
export interface ErrorOptions {
  /** The underlying error or payload this wraps. Always preserved. */
  readonly cause?: unknown
}

/**
 * Root of the hierarchy.
 *
 * `err instanceof YuigramError` distinguishes framework errors from everything
 * else. Subclasses carry no prefix — `FloodError`, not `YuigramFloodError` —
 * because the import already establishes provenance.
 */
export class YuigramError extends Error {
  override readonly name: string = 'YuigramError'

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
  }
}

/** Invalid configuration: missing credentials, contradictory options. */
export class ConfigError extends YuigramError {
  override readonly name = 'ConfigError'
}

/** Arguments rejected before anything reached the network. */
export class ValidationError extends YuigramError {
  override readonly name = 'ValidationError'
}

/** Transport failure: connection refused, timeout, DNS, socket reset. */
export class NetworkError extends YuigramError {
  override readonly name = 'NetworkError'
}

/** Sign-in failure: invalid token, wrong code, 2FA required. */
export class AuthError extends YuigramError {
  override readonly name = 'AuthError'
}

/** A stored authorization session is unusable or was rejected by Telegram. */
export class SessionError extends YuigramError {
  override readonly name = 'SessionError'
}

/** A peer could not be resolved, or its access hash is no longer valid. */
export class PeerError extends YuigramError {
  override readonly name = 'PeerError'
}

/**
 * Telegram refused the request.
 *
 * Subclassed per transport, since a Bot API error and a TL RPC error carry
 * different detail. The shared contract is that the original is preserved.
 */
export class TelegramError extends YuigramError {
  override readonly name: string = 'TelegramError'

  /** The method that was called, when known. */
  readonly method: string | undefined

  constructor(message: string, options: ErrorOptions & { method?: string } = {}) {
    super(message, options)
    this.method = options.method
  }
}

/**
 * Rate limited. The one error genuinely unified across both transports.
 *
 * The Bot API reports `429` with `parameters.retry_after`; MTProto reports
 * `FLOOD_WAIT_N`. They mean the same thing to a caller and want the same
 * handling, so they map onto one type.
 */
export class FloodError extends TelegramError {
  override readonly name = 'FloodError'

  /** Seconds to wait before retrying. */
  readonly retryAfter: number

  constructor(message: string, options: ErrorOptions & { method?: string; retryAfter: number }) {
    super(message, options)
    this.retryAfter = options.retryAfter
  }
}

/** The operation was cancelled by an abort signal or by shutdown. */
export class CancelledError extends YuigramError {
  override readonly name = 'CancelledError'
}

/** A plugin could not be installed. */
export class PluginError extends YuigramError {
  override readonly name: string = 'PluginError'
}

/** Two plugins claim the same name. */
export class PluginConflictError extends PluginError {
  override readonly name = 'PluginConflictError'

  constructor(pluginName: string) {
    super(`plugin '${pluginName}' is already installed`)
  }
}

/** A plugin depends on one that was never registered. */
export class PluginDependencyError extends PluginError {
  override readonly name = 'PluginDependencyError'

  constructor(pluginName: string, dependency: string) {
    super(`plugin '${pluginName}' depends on '${dependency}', which is not registered`)
  }
}

/** Plugin dependencies form a cycle. */
export class PluginCycleError extends PluginError {
  override readonly name = 'PluginCycleError'

  constructor(cycle: readonly string[]) {
    super(`plugin dependency cycle: ${cycle.join(' -> ')}`)
  }
}

/**
 * Walk the `cause` chain, outermost first.
 *
 * Useful when a wrapped error needs to be inspected for a specific underlying
 * condition without knowing how many layers wrapped it.
 */
export function* causeChain(error: unknown): Generator<unknown> {
  let current = error
  const seen = new Set<unknown>()

  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current)
    yield current
    current = current instanceof Error ? current.cause : undefined
  }
}

/** Find the first error in the cause chain matching a constructor. */
export function findCause<T>(
  error: unknown,
  predicate: new (...args: never[]) => T,
): T | undefined {
  for (const link of causeChain(error)) {
    if (link instanceof predicate) return link
  }
  return undefined
}
