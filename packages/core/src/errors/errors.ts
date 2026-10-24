// SPDX-License-Identifier: MIT

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

/**
 * Transport failure: connection refused, timeout, DNS, socket reset.
 *
 * Subclassed per transport, since what a refusal carries — an HTTP status, a
 * protocol-level code — differs by protocol. The shared contract is that a
 * caller holding one knows the outcome of its request is unknown.
 */
export class NetworkError extends YuigramError {
  override readonly name: string = 'NetworkError'
}

/** Sign-in failure: invalid token, wrong code, 2FA required. */
export class AuthError extends YuigramError {
  override readonly name = 'AuthError'
}

/** A stored authorization session is unusable or was rejected by Telegram. */
export class SessionError extends YuigramError {
  override readonly name = 'SessionError'
}

/**
 * Stored state could not be read.
 *
 * Distinct from a miss, which is not a failure: this says a value is there and
 * cannot be used — written under a different secret, altered since, or in a
 * format this build does not know. A caller that treated it as absent would
 * overwrite data that is very likely still good.
 */
export class StorageError extends YuigramError {
  override readonly name = 'StorageError'
}

/**
 * A store, or an area of one, is already spoken for, or is no longer this
 * run's.
 *
 * Raised when an account finds its area held by another run, and by a store
 * that fences an area when a write arrives from a holder whose lease a later
 * one has superseded — the write is refused rather than landing where another
 * run is now keeping state.
 */
export class StorageOwnershipError extends YuigramError {
  override readonly name = 'StorageOwnershipError'
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

/**
 * Raised by a strict parse of markup, naming where in the source it failed.
 *
 * One class for every dialect and every client, so a caller catches one thing
 * whichever formatter refused.
 */
export class MarkupParseError extends YuigramError {
  override readonly name = 'MarkupParseError'

  constructor(
    message: string,
    /** Where in the source, in UTF-16 code units. */
    readonly offset: number,
    /** What was being parsed. */
    readonly source: string,
  ) {
    super(`${message} at offset ${offset}`)
  }
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
 * A plugin's install threw.
 *
 * The plugin's own error is the cause. The plugins installed before it in the
 * same round have been disposed, so nothing they acquired is left open, and
 * anything their `dispose` threw is kept in `cleanup` rather than hiding the
 * failure that started it.
 */
export class PluginInstallError extends PluginError {
  override readonly name = 'PluginInstallError'
  /** The plugin whose install threw. */
  readonly plugin: string
  /** What disposing the plugins installed before it threw, in the order they were disposed. */
  readonly cleanup: readonly unknown[]

  constructor(plugin: string, cause: unknown, cleanup: readonly unknown[] = []) {
    super(
      `plugin '${plugin}' failed to install${cleanup.length === 0 ? '' : `, and ${cleanup.length} plugin(s) installed before it failed to clean up`}`,
      { cause },
    )
    this.plugin = plugin
    this.cleanup = cleanup
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
