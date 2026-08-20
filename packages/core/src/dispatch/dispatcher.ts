/**
 * Update dispatch.
 *
 * Middleware runs in three priority bands with a **reserved slot for handlers**
 * between `normal` and `low`:
 *
 * ```
 * high     session, auth, rate limiting   (must run before handlers)
 * normal   application middleware
 * HANDLERS on(...) registrations
 * low      metrics, response logging      (must run after handlers)
 * ```
 *
 * The reserved slot solves a real problem. Without it a plugin must either
 * guess registration order or document "install me first", and both fail as
 * soon as two plugins have the same requirement. With it, a session plugin
 * declares `high` and is correct regardless of when the user installs it.
 *
 * Handler lookup is indexed by kind, and filters carrying a `kinds` hint are
 * skipped without evaluating their predicate. For an application with fifty
 * handlers this turns a linear scan into a map lookup.
 */

import type { AnyFilter } from '../filter/types.js'
import type { Middleware } from '../middleware/compose.js'
import { compose } from '../middleware/compose.js'

/** The minimum shape dispatch requires of a context. */
export interface Dispatchable {
  /** Discriminator used for the handler index and the filter fast path. */
  readonly kind: string
}

/** Middleware priority bands, outermost first. */
export type Priority = 'high' | 'normal' | 'low'

/** Options accepted when registering middleware. */
export interface UseOptions {
  /** Band to register in. Defaults to `normal`. */
  readonly priority?: Priority
}

/** Options accepted when registering a handler. */
export interface OnOptions {
  /** Remove the handler after its first successful match. */
  readonly once?: boolean
}

/**
 * A registered handler.
 *
 * The return value is ignored, so `(ctx) => ctx.reply('hi')` typechecks. That
 * is the most common handler body there is, and a `void` return type would
 * reject it for returning the message it just sent.
 */
export type Handler<C> = (context: C) => unknown

interface Registration<C> {
  readonly kinds: readonly string[] | undefined
  readonly filter: AnyFilter | undefined
  readonly handler: Handler<C>
  readonly once: boolean
  readonly seq: number
  removed: boolean
}

/** Receives an error a handler or middleware threw. */
export type ErrorHandler<C> = (error: unknown, context: C) => unknown

/** Options for {@link Dispatcher}. */
export interface DispatcherOptions<C> {
  /**
   * Called when a handler throws and no `catch` handler is registered.
   *
   * The default is to swallow silently, which is why the owner is expected to
   * supply something that logs. See {@link Dispatcher.catch}.
   */
  readonly onUnhandled?: (error: unknown, context: C) => void
}

/** What `collectKinds` reports about the registered handler set. */
export interface KindCoverage {
  /** Kinds some handler is registered for. */
  readonly kinds: ReadonlySet<string>
  /**
   * True when at least one registration could match any kind, so the set above
   * cannot be treated as exhaustive.
   */
  readonly opaque: boolean
}

/**
 * Routes contexts to middleware and handlers.
 *
 * Transport-agnostic: it knows only that a context has a `kind`.
 */
export class Dispatcher<C extends Dispatchable> {
  readonly #middleware: Record<Priority, Array<Middleware<C>>> = {
    high: [],
    normal: [],
    low: [],
  }

  readonly #catchers: Array<ErrorHandler<C>> = []
  readonly #options: DispatcherOptions<C>

  constructor(options: DispatcherOptions<C> = {}) {
    this.#options = options
  }

  /**
   * Register an error handler.
   *
   * An error from a handler or from middleware reaches every registered
   * catcher, and dispatch continues: the remaining handlers still run, so one
   * malformed update cannot end every conversation in flight.
   *
   * The full rule is that an error is either handled or propagates, and is
   * never silent:
   *
   * - a catcher is registered — the catchers see it, dispatch continues;
   * - no catcher, but the owner supplied `onUnhandled` — reported, continues;
   * - neither — it propagates to the caller of `dispatch`.
   *
   * Continuing is a deliberate choice and not the only defensible one. Other
   * frameworks rethrow on a microtask so Node's `uncaughtException` fires,
   * which makes failures impossible to ignore at the cost of taking the
   * process down for one bad update. See docs/middleware.md §7.
   */
  catch(handler: ErrorHandler<C>): this {
    this.#catchers.push(handler)
    return this
  }

  /** Whether any error handler is registered. */
  get hasCatcher(): boolean {
    return this.#catchers.length > 0
  }

  readonly #registrations: Array<Registration<C>> = []
  #nextSeq = 0

  /** Cached composed chain, invalidated whenever registrations change. */
  #chain: Middleware<C> | undefined

  /** Register middleware in a priority band. */
  use(middleware: Middleware<C>, options: UseOptions = {}): this {
    this.#middleware[options.priority ?? 'normal'].push(middleware)
    this.#chain = undefined
    return this
  }

  /**
   * Register a handler.
   *
   * `match` may be a kind, a list of kinds, or a filter. A filter carrying a
   * `kinds` hint gets the same index fast path as a literal kind.
   */
  on(
    match: string | readonly string[] | AnyFilter,
    handler: Handler<C>,
    options: OnOptions = {},
  ): this {
    const isFilter = typeof match === 'function'

    this.#registrations.push({
      kinds: isFilter
        ? (match as AnyFilter).kinds
        : typeof match === 'string'
          ? [match]
          : [...match],
      filter: isFilter ? (match as AnyFilter) : undefined,
      handler,
      once: options.once ?? false,
      seq: this.#nextSeq++,
      removed: false,
    })

    this.#chain = undefined
    return this
  }

  /** Register a handler that removes itself after its first match. */
  once(match: string | readonly string[] | AnyFilter, handler: Handler<C>): this {
    return this.on(match, handler, { once: true })
  }

  /** Remove a previously registered handler. Returns whether anything matched. */
  off(handler: Handler<C>): boolean {
    let removed = false

    for (let i = this.#registrations.length - 1; i >= 0; i--) {
      if (this.#registrations[i]?.handler === handler) {
        this.#registrations.splice(i, 1)
        removed = true
      }
    }

    if (removed) this.#chain = undefined
    return removed
  }

  /** Number of live handler registrations. */
  get size(): number {
    return this.#registrations.length
  }

  /**
   * Report which kinds have handlers.
   *
   * Transports use this to subscribe to the minimal set of updates. An opaque
   * registration — a filter with no `kinds` hint — widens the subscription back
   * to everything, because skipping a kind a handler might want is a silently
   * dropped update.
   */
  collectKinds(): KindCoverage {
    const kinds = new Set<string>()
    let opaque = false

    for (const registration of this.#registrations) {
      if (registration.kinds === undefined) {
        opaque = true
        continue
      }
      for (const kind of registration.kinds) kinds.add(kind)
    }

    return { kinds, opaque }
  }

  /** Run middleware and handlers for one context. */
  async dispatch(context: C): Promise<void> {
    this.#chain ??= compose<C>([
      ...this.#middleware.high,
      ...this.#middleware.normal,
      // The reserved handler slot.
      async (inner, next) => {
        await this.#runHandlers(inner)
        await next()
      },
      ...this.#middleware.low,
    ])

    try {
      await this.#chain(context, async () => {})
    } catch (error) {
      // Reached only when middleware threw: handler errors are caught closer
      // to the handler so the remaining handlers still run.
      await this.#reportError(error, context)
    }
  }

  /**
   * Run every handler whose match accepts this context.
   *
   * All matching handlers run, not only the first. Independent concerns —
   * logging a photo, reacting to it, archiving it — then compose without
   * knowing about each other.
   */
  async #runHandlers(context: C): Promise<void> {
    // Snapshot: a handler that registers another must not affect this pass.
    const candidates = this.#registrations
      .filter((registration) => this.#couldMatch(registration, context))
      .sort((a, b) => a.seq - b.seq)

    for (const registration of candidates) {
      if (registration.removed) continue
      if (!(await this.#matches(registration, context))) continue

      if (registration.once) {
        // Remove this registration specifically, not every registration sharing
        // the same function. The same handler may legitimately be registered
        // both once and permanently.
        registration.removed = true
        this.#remove(registration)
      }

      try {
        await registration.handler(context)
      } catch (error) {
        // One failing handler must not stop the others: they are independent
        // concerns that happened to match the same update.
        await this.#reportError(error, context)
      }
    }
  }

  /** Route an error to the registered catchers, or to the fallback. */
  async #reportError(error: unknown, context: C): Promise<void> {
    if (this.#catchers.length === 0) {
      // Nothing has claimed responsibility for errors, so this one propagates
      // to whoever called `dispatch`. Swallowing it would be the one outcome
      // worse than either alternative: the failure would vanish entirely.
      if (this.#options.onUnhandled === undefined) throw error

      this.#options.onUnhandled(error, context)
      return
    }

    for (const catcher of this.#catchers) {
      try {
        await catcher(error, context)
      } catch (catcherError) {
        // A failing error handler cannot be reported to itself.
        this.#options.onUnhandled?.(catcherError, context)
      }
    }
  }

  /** Drop one specific registration. */
  #remove(registration: Registration<C>): void {
    const index = this.#registrations.indexOf(registration)
    if (index === -1) return
    this.#registrations.splice(index, 1)
    this.#chain = undefined
  }

  /** Cheap index check, before any predicate runs. */
  #couldMatch(registration: Registration<C>, context: C): boolean {
    return registration.kinds === undefined || registration.kinds.includes(context.kind)
  }

  /** Full check, evaluating the filter predicate when there is one. */
  async #matches(registration: Registration<C>, context: C): Promise<boolean> {
    if (registration.filter === undefined) return true
    return await registration.filter(context)
  }
}
