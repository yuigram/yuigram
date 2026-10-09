// SPDX-License-Identifier: MPL-2.0

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

import { ConfigError } from '../errors/errors.js'
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
  /**
   * Put the handler in a numbered group.
   *
   * Groups run in ascending order, and within a group only the first handler
   * whose match accepts the update runs — unless it returns
   * {@link Propagation.Continue}, which lets the next one in the group run too.
   * A handler registered without a group is in none: it runs whenever it
   * matches, alongside every other, in group 0's place in the order.
   */
  readonly group?: number
}

/**
 * A registered handler.
 *
 * The return value is ignored, so `(ctx) => ctx.reply('hi')` typechecks. That
 * is the most common handler body there is, and a `void` return type would
 * reject it for returning the message it just sent. The one exception is a
 * {@link Propagation} value, which steers what runs next.
 */
export type Handler<C> = (context: C) => unknown

const STOP: unique symbol = Symbol.for('yuigram.propagation.stop')
const STOP_CHILDREN: unique symbol = Symbol.for('yuigram.propagation.stop-children')
const CONTINUE: unique symbol = Symbol.for('yuigram.propagation.continue')

/**
 * What a handler or a `before` hook returns to steer what runs after it.
 *
 * Symbols rather than strings, so a handler that happens to return the text of
 * a message it sent is never read as an instruction.
 */
export const Propagation = Object.freeze({
  /** Run no more of this dispatcher's handlers. Its children still run. */
  Stop: STOP,
  /** Run no more of this dispatcher's handlers, and none of its children. */
  StopChildren: STOP_CHILDREN,
  /** In a group, let the next matching handler of the same group run as well. */
  Continue: CONTINUE,
} as const)

/** One of the {@link Propagation} values. */
export type PropagationAction = (typeof Propagation)[keyof typeof Propagation]

interface Registration<C> {
  readonly kinds: readonly string[] | undefined
  readonly filter: AnyFilter | undefined
  readonly handler: Handler<C>
  readonly once: boolean
  readonly group: number
  /** Whether it takes its group's turn: registered with an explicit group. */
  readonly exclusive: boolean
  readonly seq: number
  removed: boolean
}

/**
 * Receives an error a handler or middleware threw.
 *
 * Returning `false` declines it: the error goes on to the parent dispatcher, or
 * to the owner's fallback, as if this handler had not been registered. Any
 * other return value — including none — means it was dealt with.
 */
export type ErrorHandler<C> = (error: unknown, context: C) => unknown

/** Runs before a dispatcher's handlers; may return {@link Propagation.Stop} or `StopChildren`. */
export type BeforeHook<C> = (context: C) => unknown

/** Runs after a dispatcher's handlers and children, told whether any handler ran. */
export type AfterHook<C> = (handled: boolean, context: C) => unknown

/**
 * The dependencies handlers can reach, by name.
 *
 * Empty here; an application declares what it injects by merging into it:
 *
 * ```ts
 * declare module '@yuigram/core' {
 *   interface Dependencies { readonly db: Database }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: an application declares its dependencies by merging into this
export interface Dependencies {}

/** Options for {@link Dispatcher}. */
export interface DispatcherOptions<C> {
  /**
   * Called when an error is neither handled here nor by a parent.
   *
   * Without it, the error propagates to whoever called `dispatch`, which is why
   * an owner that dispatches with nobody awaiting is expected to supply
   * something that logs. See {@link Dispatcher.catch}.
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

/** How one dispatcher's own pass ended. */
interface Outcome {
  readonly handled: boolean
  readonly children: boolean
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
  readonly #before: Array<BeforeHook<C>> = []
  readonly #after: Array<AfterHook<C>> = []
  readonly #children: Dispatcher<C>[] = []
  readonly #dependencies = new Map<string, unknown>()
  readonly #options: DispatcherOptions<C>
  #parent: Dispatcher<C> | undefined
  #dependencyView: Dependencies | undefined

  /** Whether a dispatch of a context ran any handler, read once the chain has run. */
  readonly #handled = new WeakMap<object, boolean>()

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
   * - a catcher here takes it — dispatch continues;
   * - every catcher here declines it by returning `false`, or there is none —
   *   it goes to the parent dispatcher, which applies the same rule;
   * - no parent takes it — the owner's `onUnhandled` reports it;
   * - there is none — it propagates to the caller of `dispatch`.
   *
   * A catcher that throws has not dealt with anything: what it threw goes the
   * same way, to the parent and then the owner.
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
      group: options.group ?? 0,
      exclusive: options.group !== undefined,
      seq: this.#nextSeq++,
      removed: false,
    })

    this.#chain = undefined
    return this
  }

  /** Register a handler that removes itself after its first match. */
  once(
    match: string | readonly string[] | AnyFilter,
    handler: Handler<C>,
    options: Omit<OnOptions, 'once'> = {},
  ): this {
    return this.on(match, handler, { ...options, once: true })
  }

  /**
   * Remove a previously registered handler. Returns whether anything matched.
   *
   * Takes effect at once, including for a dispatch already in progress: a
   * handler removed before its turn in that dispatch does not run. One already
   * running finishes.
   */
  off(handler: Handler<C>): boolean {
    let removed = false

    for (let i = this.#registrations.length - 1; i >= 0; i--) {
      const registration = this.#registrations[i] as Registration<C>
      if (registration.handler === handler) {
        registration.removed = true
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

  /** Run a hook before this dispatcher's handlers; a {@link Propagation} value it returns is obeyed. */
  before(hook: BeforeHook<C>): this {
    this.#before.push(hook)
    return this
  }

  /** Run a hook after this dispatcher's handlers and children, told whether any handler ran. */
  after(hook: AfterHook<C>): this {
    this.#after.push(hook)
    return this
  }

  /* ------------------------------------------------------------------------ */
  /* Children                                                                  */
  /* ------------------------------------------------------------------------ */

  /** The dispatcher this one was added to, if any. */
  get parent(): Dispatcher<C> | undefined {
    return this.#parent
  }

  /** The dispatchers added to this one, in the order they run. */
  get children(): readonly Dispatcher<C>[] {
    return [...this.#children]
  }

  /**
   * Add a child dispatcher.
   *
   * A child runs after this dispatcher's own handlers, with its own middleware,
   * handlers and grouping: `Stop` here does not stop it, `StopChildren` does.
   * An error the child does not handle goes to this dispatcher's catchers, and
   * the child reads the dependencies injected here. A dispatcher has at most
   * one parent.
   */
  addChild(child: Dispatcher<C>): this {
    if (child === this) throw new ConfigError('a dispatcher cannot be its own child')
    if (child.#parent !== undefined) {
      throw new ConfigError('this dispatcher is already the child of another')
    }
    for (let ancestor: Dispatcher<C> | undefined = this; ancestor; ancestor = ancestor.#parent) {
      if (ancestor === child) throw new ConfigError('adding this child would make a cycle')
    }

    child.#parent = this
    this.#children.push(child)
    return this
  }

  /** Remove a child dispatcher. Returns whether it was one. */
  removeChild(child: Dispatcher<C>): boolean {
    const index = this.#children.indexOf(child)
    if (index === -1) return false

    this.#children.splice(index, 1)
    child.#parent = undefined
    return true
  }

  /**
   * Take in everything another dispatcher has: its middleware, handlers,
   * hooks, catchers and dependencies, and copies of its children.
   *
   * A snapshot. What is registered on `other` afterwards is not taken in;
   * unlike {@link Dispatcher.addChild}, the two do not stay linked, and their
   * handlers share this dispatcher's grouping from now on.
   */
  extend(other: Dispatcher<C>): this {
    for (const band of ['high', 'normal', 'low'] as const) {
      this.#middleware[band].push(...other.#middleware[band])
    }
    for (const registration of other.#registrations) {
      this.#registrations.push({ ...registration, seq: this.#nextSeq++, removed: false })
    }
    this.#catchers.push(...other.#catchers)
    this.#before.push(...other.#before)
    this.#after.push(...other.#after)
    for (const [name, value] of other.#dependencies) this.#dependencies.set(name, value)
    for (const child of other.#children) this.addChild(child.clone(true))

    this.#chain = undefined
    return this
  }

  /** A new dispatcher with the same registrations, and copies of the children if asked. */
  clone(children = false): Dispatcher<C> {
    const copy = new Dispatcher<C>(this.#options)
    for (const band of ['high', 'normal', 'low'] as const) {
      copy.#middleware[band].push(...this.#middleware[band])
    }
    for (const registration of this.#registrations) {
      copy.#registrations.push({ ...registration, removed: false })
    }
    copy.#nextSeq = this.#nextSeq
    copy.#catchers.push(...this.#catchers)
    copy.#before.push(...this.#before)
    copy.#after.push(...this.#after)
    for (const [name, value] of this.#dependencies) copy.#dependencies.set(name, value)
    if (children) for (const child of this.#children) copy.addChild(child.clone(true))

    return copy
  }

  /* ------------------------------------------------------------------------ */
  /* Dependencies                                                              */
  /* ------------------------------------------------------------------------ */

  /**
   * Make a value reachable from every handler of this dispatcher and its
   * children, as `deps[name]`.
   *
   * Values, not globals: each dispatcher tree has its own, so two clients in one
   * process never see each other's. Injecting a name again replaces it.
   */
  inject<K extends keyof Dependencies & string>(name: K, value: Dependencies[K]): this
  inject(dependencies: Partial<Dependencies>): this
  inject(first: string | Partial<Dependencies>, value?: unknown): this {
    if (typeof first === 'string') {
      this.#dependencies.set(first, value)
    } else {
      for (const [name, entry] of Object.entries(first)) this.#dependencies.set(name, entry)
    }

    return this
  }

  /**
   * The injected dependencies, here and in the dispatchers above this one.
   *
   * Reading a name nothing injected throws a `ConfigError` naming it, rather
   * than handing a handler `undefined` to fail on later.
   */
  get deps(): Dependencies {
    this.#dependencyView ??= new Proxy(Object.create(null) as Dependencies, {
      get: (_target, name) => {
        if (typeof name !== 'string') return undefined
        const found = this.#dependency(name)
        if (!found.present) {
          throw new ConfigError(
            `no dependency named '${name}' was injected into this dispatcher or any above it`,
          )
        }

        return found.value
      },
      has: (_target, name) => typeof name === 'string' && this.#dependency(name).present,
      ownKeys: () => [...this.#dependencyNames()],
      getOwnPropertyDescriptor: (_target, name) =>
        typeof name === 'string' && this.#dependency(name).present
          ? { configurable: true, enumerable: true, value: this.#dependency(name).value }
          : undefined,
    })

    return this.#dependencyView
  }

  #dependency(name: string): { readonly present: boolean; readonly value?: unknown } {
    for (let at: Dispatcher<C> | undefined = this; at !== undefined; at = at.#parent) {
      if (at.#dependencies.has(name)) return { present: true, value: at.#dependencies.get(name) }
    }

    return { present: false }
  }

  #dependencyNames(): Set<string> {
    const names = new Set<string>()
    for (let at: Dispatcher<C> | undefined = this; at !== undefined; at = at.#parent) {
      for (const name of at.#dependencies.keys()) names.add(name)
    }

    return names
  }

  /* ------------------------------------------------------------------------ */
  /* Dispatch                                                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * Report which kinds have handlers, here and in every child.
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

    for (const child of this.#children) {
      const coverage = child.collectKinds()
      opaque ||= coverage.opaque
      for (const kind of coverage.kinds) kinds.add(kind)
    }

    return { kinds, opaque }
  }

  /**
   * Run middleware and handlers for one context.
   *
   * Resolves to whether any handler — here or in a child — ran.
   */
  async dispatch(context: C): Promise<boolean> {
    this.#chain ??= compose<C>([
      ...this.#middleware.high,
      ...this.#middleware.normal,
      // The reserved handler slot.
      async (inner, next) => {
        this.#handled.set(inner, await this.#runSlot(inner))
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

    const handled = this.#handled.get(context) ?? false
    this.#handled.delete(context)

    return handled
  }

  /** The handler slot: hooks, this dispatcher's handlers, then its children. */
  async #runSlot(context: C): Promise<boolean> {
    let outcome: Outcome = { handled: false, children: true }
    const steer = await this.#runBefore(context)

    if (steer !== STOP && steer !== STOP_CHILDREN) outcome = await this.#runHandlers(context)
    let handled = outcome.handled

    if (outcome.children && steer !== STOP_CHILDREN) {
      for (const child of [...this.#children]) {
        handled = (await child.dispatch(context)) || handled
      }
    }

    for (const hook of this.#after) {
      try {
        await hook(handled, context)
      } catch (error) {
        await this.#reportError(error, context)
      }
    }

    return handled
  }

  async #runBefore(context: C): Promise<unknown> {
    for (const hook of this.#before) {
      try {
        const steer = await hook(context)
        if (steer === STOP || steer === STOP_CHILDREN) return steer
      } catch (error) {
        await this.#reportError(error, context)
      }
    }

    return undefined
  }

  /**
   * Run the handlers whose match accepts this context.
   *
   * Every matching handler outside a group runs, not only the first:
   * independent concerns — logging a photo, reacting to it, archiving it —
   * compose without knowing about each other. Within a numbered group the
   * first match takes the group's turn.
   */
  async #runHandlers(context: C): Promise<Outcome> {
    // Snapshot: a handler that registers another must not affect this pass.
    const candidates = this.#registrations
      .filter((registration) => this.#couldMatch(registration, context))
      .sort((a, b) => a.group - b.group || a.seq - b.seq)
    const decided = new Set<number>()
    let handled = false

    for (const registration of candidates) {
      if (registration.exclusive && decided.has(registration.group)) continue
      const ran = await this.#runOne(registration, context)
      if (!ran.ran) continue

      handled = true
      if (ran.steer === STOP) return { handled, children: true }
      if (ran.steer === STOP_CHILDREN) return { handled, children: false }
      if (registration.exclusive && ran.steer !== CONTINUE) decided.add(registration.group)
    }

    return { handled, children: true }
  }

  /** Run one registration if its match accepts the context, and say what it returned. */
  async #runOne(
    registration: Registration<C>,
    context: C,
  ): Promise<{ readonly ran: boolean; readonly steer?: unknown }> {
    if (registration.removed) return { ran: false }
    if (!(await this.#matches(registration, context))) return { ran: false }
    // Checked again after the filter: a dispatch running alongside this one may
    // have taken a once-registration, or a handler removed it, while the filter
    // was being evaluated.
    if (registration.removed) return { ran: false }

    if (registration.once) {
      // Remove this registration specifically, not every registration sharing
      // the same function. The same handler may legitimately be registered both
      // once and permanently.
      registration.removed = true
      this.#remove(registration)
    }

    try {
      return { ran: true, steer: await registration.handler(context) }
    } catch (error) {
      // One failing handler must not stop the others: they are independent
      // concerns that happened to match the same update.
      await this.#reportError(error, context)

      return { ran: true }
    }
  }

  /**
   * Hand an error to this dispatcher's error handling.
   *
   * For code that dispatches on its own — a router running its handlers inside
   * one of ours, a transport failing between updates — and needs the failure to
   * take the same route a handler's would, rather than a parallel one the
   * application has not registered anything for.
   */
  async report(error: unknown, context: C): Promise<void> {
    await this.#reportError(error, context)
  }

  /** Route an error to the catchers here, then upwards, then to the owner. */
  async #reportError(error: unknown, context: C): Promise<void> {
    let handled = false

    for (const catcher of this.#catchers) {
      try {
        if ((await catcher(error, context)) !== false) handled = true
      } catch (catcherError) {
        // A failing error handler cannot be reported to itself, and what it
        // threw is not silence either: it goes where an unhandled error goes.
        handled = true
        await this.#escalate(catcherError, context)
      }
    }

    if (!handled) await this.#escalate(error, context)
  }

  /** An error nothing here took: the parent's, else the owner's, else the caller's. */
  async #escalate(error: unknown, context: C): Promise<void> {
    if (this.#parent !== undefined) {
      await this.#parent.#reportError(error, context)
      return
    }

    // Nothing has claimed responsibility for errors, so this one propagates to
    // whoever called `dispatch`. Swallowing it would be the one outcome worse
    // than either alternative: the failure would vanish entirely.
    if (this.#options.onUnhandled === undefined) throw error

    this.#options.onUnhandled(error, context)
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
