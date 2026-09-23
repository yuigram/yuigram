/**
 * Waiting for the next update in one conversation.
 *
 * A prompt, a step in a form and a flow's `waitFor` are the same thing under
 * three names: somewhere in a handler, execution stops until an update arrives
 * that this conversation was waiting for. The register below is what makes that
 * possible, and the middleware is the only place an update is ever diverted.
 *
 * ```
 *   update ──> middleware ──> is a waiter registered for this conversation?
 *                               │
 *                               ├── no  ──> next(): the ordinary handlers
 *                               │
 *                               └── yes ──> does it match the waiter?
 *                                             ├── no  ──> next(), unless the
 *                                             │            waiter said to hold
 *                                             └── yes ──> resolve; consume or
 *                                                          fall through
 * ```
 *
 * **A waiter belongs to one conversation.** It is registered under a
 * conversation key, so an update from somebody else — or from the same person
 * in another chat — never reaches it. That is the difference between a prompt
 * and a global listener, and it is why the key is derived before anything else
 * happens.
 *
 * **Waiting is bounded.** Every waiter may carry a timeout and an abort signal,
 * and both unregister it. A waiter with neither waits until the conversation
 * produces a matching update or the process ends, which is a choice the caller
 * makes explicitly rather than a default.
 */

import { YuigramError } from '../errors/errors.js'
import type { Middleware, Next } from '../middleware/compose.js'
import {
  type Addressed,
  type ConversationKeyFn,
  type ConversationScope,
  conversationKey,
  DEFAULT_SCOPE,
} from './identity.js'

/** Raised when a waiter's timeout passes before a matching update arrives. */
export class WaitTimeoutError extends YuigramError {
  override readonly name = 'WaitTimeoutError'
}

/** Raised when a waiter is replaced or the conversation is reset under it. */
export class WaitCancelledError extends YuigramError {
  override readonly name = 'WaitCancelledError'
}

/**
 * Raised inside a durable flow when one of its steps failed.
 *
 * The same class whether the step failed just now or in a run before a
 * restart, because a flow that is resumed must take the same path it took the
 * first time: the name and message of what failed are kept with the flow, and
 * `cause` is present only when the failure happened in this process.
 */
export class FlowStepError extends YuigramError {
  override readonly name: string = 'FlowStepError'

  constructor(
    /** The label of the step that failed. */
    readonly step: string,
    /** The name of the error the step raised. */
    readonly causeName: string,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`'${step}' failed with ${causeName}: ${message}`, options)
  }
}

/**
 * Raised inside a durable flow when an effect may or may not have happened.
 *
 * The flow was stopped after the effect began and before its outcome was
 * written down — a crash, a deployment, a store that failed. Whether the
 * effect reached the outside world cannot be known from here, so the flow is
 * told rather than the effect being quietly run twice or not at all. An effect
 * declared safe to repeat is run again instead.
 */
export class EffectUncertainError extends FlowStepError {
  override readonly name = 'EffectUncertainError'

  constructor(step: string) {
    super(
      step,
      'EffectUncertainError',
      'the flow stopped after this effect began and before its outcome was recorded',
    )
  }
}

/** What a waiter decides about an update it was shown. */
export type WaitVerdict =
  /** Not what was being waited for. */
  | { readonly matched: false }
  /** What was being waited for, carrying what the caller asked to be given. */
  | { readonly matched: true; readonly value: unknown }

/** How one waiter decides, and what happens to updates it does not want. */
export interface WaiterSpec<C, T> {
  /** Whether this update is the one being waited for. */
  match(context: C): boolean | Promise<boolean>
  /**
   * What to hand back once it matches.
   *
   * Defaults to the context itself. A caller that wants a field rather than
   * the whole update says so here, which is what decides the awaited type.
   */
  transform?(context: C): T | Promise<T>
  /**
   * Check a match before accepting it.
   *
   * Returning `false` or a string rejects the update and keeps waiting; the
   * string is handed to {@link WaiterSpec.onInvalid} so the caller can say why.
   */
  validate?(value: T, context: C): boolean | string | Promise<boolean | string>
  /** Told when a match was rejected, with whatever `validate` said. */
  onInvalid?(reason: string | undefined, context: C): unknown
  /** Milliseconds before giving up. */
  timeout?: number
  /** Give up from outside. */
  signal?: AbortSignal
  /**
   * Whether a matching update stops here.
   *
   * `true` by default: an update that answered a prompt has been dealt with,
   * and letting it also reach the ordinary handlers means a form's answer is
   * read a second time as a command. Set `false` to let it through as well.
   */
  consume?: boolean
  /**
   * Whether a *non*-matching update stops here too.
   *
   * `false` by default, so an unrelated message still reaches the handlers
   * while a prompt is open. `true` makes the conversation exclusive, which is
   * what a form that must not be interrupted wants.
   */
  exclusive?: boolean
  /** Resolve with `undefined` on timeout instead of raising. */
  nullOnTimeout?: boolean
}

/** A waiter that has been registered and not yet settled. */
interface Pending {
  readonly key: string
  readonly spec: WaiterSpec<never, unknown>
  settle(value: unknown): void
  fail(error: unknown): void
  release(): void
}

/** How the register is told which conversation an update belongs to. */
export interface RegisterOptions {
  readonly scope?: ConversationScope
  readonly key?: ConversationKeyFn
  /** Schedules the timeouts. Supplied so tests need not wait in real time. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
}

const defaultSchedule = (run: () => void, delayMs: number): (() => void) => {
  const timer = setTimeout(run, delayMs)

  return () => clearTimeout(timer)
}

/**
 * The waiters currently open, by conversation.
 *
 * One waiter per conversation at a time. A second `waitFor` in the same
 * conversation cancels the first rather than queueing behind it or racing it:
 * two pieces of code waiting for the same person's next message is a bug that
 * would otherwise show up as one of them never resolving. The cancelled one
 * rejects with {@link WaitCancelledError}, so the code that was waiting learns
 * what happened instead of hanging.
 */
export class WaiterRegister<C extends Addressed> {
  readonly #pending = new Map<string, Pending>()
  readonly #scope: ConversationScope
  readonly #key: ConversationKeyFn | undefined
  readonly #schedule: (run: () => void, delayMs: number) => () => void

  constructor(options: RegisterOptions = {}) {
    this.#scope = options.scope ?? DEFAULT_SCOPE
    this.#key = options.key
    this.#schedule = options.schedule ?? defaultSchedule
  }

  /** How many conversations are waiting for something. */
  get size(): number {
    return this.#pending.size
  }

  /** The key a context belongs to, by whichever rule this register was given. */
  keyOf(context: Addressed): string | undefined {
    return this.#key === undefined ? conversationKey(context, this.#scope) : this.#key(context)
  }

  /** Whether this conversation is waiting for something. */
  waiting(key: string): boolean {
    return this.#pending.has(key)
  }

  /**
   * Wait for the next update in this conversation that the spec accepts.
   *
   * Resolves with what {@link WaiterSpec.transform} produced, or the context
   * itself. Raises {@link WaitTimeoutError} unless `nullOnTimeout` was asked
   * for, {@link WaitCancelledError} if something replaced this waiter or the
   * signal fired.
   */
  async wait<T>(key: string, spec: WaiterSpec<C, T>): Promise<T | undefined> {
    // One waiter per conversation: the one already there is told rather than
    // left to never resolve.
    this.#pending.get(key)?.fail(new WaitCancelledError('another waiter replaced this one'))

    return await new Promise<T | undefined>((resolve, reject) => {
      let settled = false
      let cancelTimer: (() => void) | undefined

      const release = (): void => {
        cancelTimer?.()
        cancelTimer = undefined
        spec.signal?.removeEventListener('abort', onAbort)
        if (this.#pending.get(key) === entry) this.#pending.delete(key)
      }

      const finish = (run: () => void): void => {
        if (settled) return
        settled = true
        release()
        run()
      }

      const entry: Pending = {
        key,
        spec: spec as WaiterSpec<never, unknown>,
        settle: (value) => {
          finish(() => resolve(value as T))
        },
        fail: (error) => {
          finish(() => reject(error))
        },
        release,
      }

      function onAbort(): void {
        entry.fail(new WaitCancelledError('the wait was cancelled'))
      }

      if (spec.signal?.aborted === true) {
        reject(new WaitCancelledError('the wait was cancelled'))

        return
      }
      spec.signal?.addEventListener('abort', onAbort, { once: true })

      if (spec.timeout !== undefined) {
        cancelTimer = this.#schedule(() => {
          if (spec.nullOnTimeout === true) {
            entry.settle(undefined)

            return
          }
          entry.fail(new WaitTimeoutError(`nothing arrived within ${spec.timeout}ms`))
        }, spec.timeout)
      }

      this.#pending.set(key, entry)
    })
  }

  /**
   * Cancel whatever this conversation is waiting for.
   *
   * Used when a scene is left or reset under an open prompt: the code inside
   * the scene that was waiting learns the conversation moved on rather than
   * waiting for an answer that will never be read.
   */
  cancel(key: string, reason = 'the conversation moved on'): boolean {
    const entry = this.#pending.get(key)
    if (entry === undefined) return false

    entry.fail(new WaitCancelledError(reason))

    return true
  }

  /** Cancel every open waiter, for a client that is shutting down. */
  cancelAll(reason = 'the client stopped'): void {
    for (const entry of [...this.#pending.values()]) entry.fail(new WaitCancelledError(reason))
  }

  /**
   * Offer an update to whatever this conversation is waiting for.
   *
   * Answers what should happen to the update: whether it was taken, and whether
   * the ordinary handlers should still see it.
   */
  async offer(context: C): Promise<{ readonly consumed: boolean }> {
    const key = this.keyOf(context)
    if (key === undefined) return { consumed: false }

    const entry = this.#pending.get(key)
    if (entry === undefined) return { consumed: false }

    const spec = entry.spec as unknown as WaiterSpec<C, unknown>

    let matched: boolean
    try {
      matched = await spec.match(context)
    } catch (error) {
      entry.fail(error)

      return { consumed: spec.consume !== false }
    }

    if (!matched) return { consumed: spec.exclusive === true }

    let value: unknown
    try {
      value = spec.transform === undefined ? context : await spec.transform(context)

      if (spec.validate !== undefined) {
        const verdict = await spec.validate(value, context)

        if (verdict !== true) {
          // Rejected: the waiter stays open, and the caller is told why so it
          // can say something to the person answering.
          await spec.onInvalid?.(typeof verdict === 'string' ? verdict : undefined, context)

          return { consumed: spec.consume !== false }
        }
      }
    } catch (error) {
      entry.fail(error)

      return { consumed: spec.consume !== false }
    }

    entry.settle(value)

    return { consumed: spec.consume !== false }
  }

  /**
   * Middleware that offers each update to this register first.
   *
   * Installed once. An update belonging to a conversation with nothing pending
   * passes straight through, so the cost on the ordinary path is one map
   * lookup.
   */
  middleware(): Middleware<C> {
    return async (context: C, next: Next) => {
      const { consumed } = await this.offer(context)
      if (consumed) return

      await next()
    }
  }
}
