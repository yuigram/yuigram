/**
 * Client lifecycle.
 *
 * Stopping **drains** rather than severing: intake halts immediately, in-flight
 * work is awaited up to a timeout, then transports close. A bot killed
 * mid-handler loses that work and may reprocess the update on restart, so
 * draining is the default rather than an option.
 */

import { CancelledError, YuigramError } from '../errors/errors.js'

/** Lifecycle states, in the order they occur. */
export type LifecycleState = 'idle' | 'starting' | 'running' | 'stopping' | 'failed'

/** Raised when an operation is invalid for the current state. */
export class LifecycleError extends YuigramError {
  override readonly name = 'LifecycleError'
}

/** Options for {@link Lifecycle.stop}. */
export interface StopOptions {
  /**
   * Milliseconds to wait for in-flight work before closing anyway.
   * Defaults to 10 seconds. `0` closes immediately without draining.
   */
  readonly timeout?: number
}

/** What a stop hook is told about the deadline it runs under. */
export interface StopContext {
  /**
   * Fires when the shutdown deadline passes.
   *
   * A hook that waits for anything must honour it. The deadline covers the
   * whole of `stop()`, not just the drain before the hook, so a hook with a
   * wait of its own would otherwise defeat the timeout the caller set.
   */
  readonly signal: AbortSignal
}

/** Hooks a lifecycle runs on transition. */
export interface LifecycleHooks {
  /** Bring the client up. Failure moves the state to `failed`. */
  onStart?: () => Promise<void> | void
  /**
   * Take the client down. Runs after in-flight work has drained.
   *
   * Receives the shutdown deadline, and must return once it fires. Anything
   * still running is abandoned — nothing can cancel a promise — so a hook that
   * gives up says so by returning rather than by waiting longer.
   */
  onStop?: (context: StopContext) => Promise<void> | void
}

/**
 * Tracks state and in-flight work for one client.
 *
 * Concurrent `start()` calls share one attempt rather than racing, because a
 * caller that starts a client from two places should not open two connections.
 */
export class Lifecycle {
  #state: LifecycleState = 'idle'
  #startPromise: Promise<void> | undefined
  #inFlight = new Set<Promise<unknown>>()
  /** Whether the last stop finished everything. See {@link Lifecycle.stopped}. */
  #drained = true
  readonly #hooks: LifecycleHooks

  constructor(hooks: LifecycleHooks = {}) {
    this.#hooks = hooks
  }

  /** Current state. */
  get state(): LifecycleState {
    return this.#state
  }

  /** Whether the client is running and accepting work. */
  get isRunning(): boolean {
    return this.#state === 'running'
  }

  /** Number of tracked operations that have not settled. */
  get inFlight(): number {
    return this.#inFlight.size
  }

  /**
   * Start the client.
   *
   * Idempotent while running, and concurrent calls await the same attempt.
   */
  async start(): Promise<void> {
    if (this.#state === 'running') return
    if (this.#startPromise !== undefined) return this.#startPromise

    if (this.#state === 'stopping') {
      throw new LifecycleError('cannot start while stopping')
    }

    this.#state = 'starting'

    const attempt = (async () => {
      try {
        await this.#hooks.onStart?.()
        // Only claim the state if this attempt still owns it. `stop()` waits
        // for a start in flight, so this should always hold; asserting it here
        // means a future path that does not wait cannot silently mark a
        // stopped client running.
        if (this.#state === 'starting') this.#state = 'running'
      } catch (error) {
        if (this.#state === 'starting') this.#state = 'failed'
        throw error
      }
    })()

    // Assign before awaiting, and clear only if this attempt is still the
    // current one. Clearing inside the async body would race: a hook that
    // throws synchronously runs the whole body before this assignment, so the
    // rejected promise would be cached and replayed by every later start().
    this.#startPromise = attempt

    try {
      await attempt
    } finally {
      if (this.#startPromise === attempt) this.#startPromise = undefined
    }
  }

  /**
   * Stop the client, draining in-flight work first.
   *
   * The timeout is a deadline over the **whole** call, not over the drain
   * alone. A stop hook that waits for work of its own — a polling loop waiting
   * for its handlers — is given the same deadline and must return when it
   * fires, so there is exactly one clock and no wait behind it.
   *
   * Work still running when the deadline passes is abandoned rather than
   * waited on: a stuck handler must not prevent shutdown, and nothing can
   * cancel a promise. `stopped` reports whether everything actually finished.
   */
  async stop(options: StopOptions = {}): Promise<void> {
    if (this.#state === 'stopping') return

    // An idle client can still have work in flight. A webhook deployment never
    // calls `start()` — it hands a request handler to someone else's server —
    // yet every update it dispatches is tracked here. Returning early on
    // `idle` meant `stop()` drained nothing in exactly the deployment where a
    // clean shutdown matters most, while reporting success.
    if (this.#state === 'idle' && this.#inFlight.size === 0) return

    // A stop arriving mid-start waits for the start to settle first. Running
    // `onStop` while `onStart` is still bringing transports up leaves whatever
    // it creates unowned — for a bot, a polling loop nobody will ever stop,
    // still running after `stop()` has returned — and the start would then
    // mark the client running after the stop had finished.
    if (this.#startPromise !== undefined) {
      await this.#startPromise.catch(() => undefined)

      // Another stop may have run to completion while this one waited. Read
      // through the getter: control-flow analysis narrowed `#state` at the
      // guard above and cannot see that awaiting lets it change.
      const current: LifecycleState = this.state
      if (current === 'idle' || current === 'stopping') return
    }

    this.#state = 'stopping'

    const timeout = options.timeout ?? 10_000
    const deadline = new AbortController()

    // One clock for the whole shutdown. The drain gets whatever is left of it,
    // and the stop hook gets the same signal, so a wait inside the hook cannot
    // outlive the deadline the caller asked for.
    const timer =
      timeout > 0
        ? setTimeout(() => deadline.abort(new CancelledError('shutdown deadline passed')), timeout)
        : undefined

    timer?.unref?.()
    if (timeout <= 0) deadline.abort(new CancelledError('shutdown deadline passed'))

    try {
      this.#drained = await this.drain(timeout, deadline.signal)

      // Raced rather than merely awaited. The signal asks a cooperative hook
      // to return; racing the deadline holds one that does not to the same
      // promise anyway. A foundation other transports implement cannot rely on
      // every one of them honouring a signal, and the caller was given a
      // deadline, not a suggestion.
      const hook = this.#hooks.onStop?.({ signal: deadline.signal })

      if (hook !== undefined) {
        const settled = Promise.resolve(hook).then(() => true)
        const expired = new Promise<boolean>((resolve) => {
          if (deadline.signal.aborted) resolve(false)
          else deadline.signal.addEventListener('abort', () => resolve(false), { once: true })
        })

        // A hook that loses the race keeps running; its failure would
        // otherwise surface as an unhandled rejection long after the stop.
        settled.catch(() => undefined)

        if (!(await Promise.race([settled, expired]))) this.#drained = false
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      this.#state = 'idle'

      // Cleared because this lifecycle is done with them, not because they
      // finished: `stopped` is what says whether they did.
      this.#inFlight.clear()
    }
  }

  /**
   * Whether the last `stop()` drained everything before its deadline.
   *
   * `false` means work was abandoned and is possibly still running. A caller
   * that reports a clean shutdown regardless is reporting something it does
   * not know.
   */
  get stopped(): boolean {
    return this.#drained
  }

  /**
   * Track an operation so `stop()` can wait for it.
   *
   * Returns the original promise, so this wraps a call without changing it.
   */
  track<T>(operation: Promise<T>): Promise<T> {
    // Attach a settled handler that only removes the entry. The rejection is
    // still the caller's to handle; swallowing it here would hide failures.
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    )

    this.#inFlight.add(tracked)
    void tracked.finally(() => this.#inFlight.delete(tracked))

    return operation
  }

  /**
   * Wait for in-flight work to settle.
   *
   * Resolves early once everything settles, and gives up after `timeout`.
   */
  async drain(timeout = 10_000, signal?: AbortSignal): Promise<boolean> {
    if (this.#inFlight.size === 0) return true
    if (timeout <= 0 || signal?.aborted === true) return this.#inFlight.size === 0

    const settled = Promise.all([...this.#inFlight]).then(() => true)

    let timer: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<boolean>((resolve) => {
      // A shared deadline takes precedence: `stop` passes one so the drain and
      // the stop hook cannot each spend the full timeout in turn.
      if (signal !== undefined) {
        signal.addEventListener('abort', () => resolve(false), { once: true })
        return
      }

      timer = setTimeout(() => resolve(false), timeout)
      // Do not hold the event loop open purely to time out a drain.
      timer.unref?.()
    })

    try {
      return await Promise.race([settled, expired])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /** Force the state to `failed`, for an unrecoverable transport error. */
  fail(): void {
    this.#state = 'failed'
  }
}
