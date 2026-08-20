/**
 * Client lifecycle.
 *
 * Stopping **drains** rather than severing: intake halts immediately, in-flight
 * work is awaited up to a timeout, then transports close. A bot killed
 * mid-handler loses that work and may reprocess the update on restart, so
 * draining is the default rather than an option.
 */

import { YuigramError } from '../errors/errors.js'

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

/** Hooks a lifecycle runs on transition. */
export interface LifecycleHooks {
  /** Bring the client up. Failure moves the state to `failed`. */
  onStart?: () => Promise<void> | void
  /** Take the client down. Runs after in-flight work has drained. */
  onStop?: () => Promise<void> | void
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
   * Work that has not settled within the timeout is abandoned rather than
   * waited on indefinitely: a stuck handler must not prevent shutdown.
   */
  async stop(options: StopOptions = {}): Promise<void> {
    if (this.#state === 'idle' || this.#state === 'stopping') return

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

    try {
      await this.drain(options.timeout ?? 10_000)
      await this.#hooks.onStop?.()
    } finally {
      this.#state = 'idle'
      this.#inFlight.clear()
    }
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
  async drain(timeout = 10_000): Promise<boolean> {
    if (this.#inFlight.size === 0) return true
    if (timeout <= 0) return this.#inFlight.size === 0

    const settled = Promise.all([...this.#inFlight]).then(() => true)

    let timer: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<boolean>((resolve) => {
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
