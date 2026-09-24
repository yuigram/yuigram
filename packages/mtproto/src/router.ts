/**
 * Where an account's handlers are registered, and how a set of them travels.
 *
 * The dispatcher underneath is core's — the same ordering, groups, propagation,
 * error routing and dependencies a bot has. What this file adds is the
 * account's way of naming what a handler is for: one of the kinds the
 * normalizer produces, a filter, or both, with the filter's proof reaching the
 * handler's context type.
 *
 * An {@link AccountRouter} is a set of registrations with no connection of its
 * own. Added to an account, it runs after the account's own handlers with its
 * own middleware, and an error it does not handle goes on to the account's
 * catchers. Nothing about it is tied to one account until it is added, and it
 * can be added to one parent at a time.
 */

import {
  type AfterHook,
  type AnyFilter,
  and,
  type BeforeHook,
  type Dependencies,
  type Dispatchable,
  Dispatcher,
  defineFilter,
  type ErrorHandler,
  type FilterMeta,
  type Handler,
  isFilter,
  type Middleware,
  type Modify,
  type OnOptions,
  type UseOptions,
  ValidationError,
} from '@yuigram/core'
import type { MtprotoContext } from './normalize/context.js'
import { ACCOUNT_KINDS, type MtprotoEventKind, SHARED_KINDS } from './normalize/events.js'

/**
 * The context a filter proves it has.
 *
 * `Base` is what matching establishes the value is and `Mod` what it refines
 * on top, both applied — so a filter that proves `text` is a string hands the
 * handler a context where it is. A filter that proves nothing leaves the
 * account's own context as it is.
 */
export type AccountFilterContext<F> =
  F extends AnyFilter<infer Base, infer Mod>
    ? Base extends MtprotoContext
      ? Modify<Base, Mod>
      : Modify<MtprotoContext, Mod>
    : MtprotoContext

/** Every kind an account's events can have. */
const KNOWN_KINDS: ReadonlySet<string> = new Set<string>([...SHARED_KINDS, ...ACCOUNT_KINDS])

/**
 * Read what a registration was given into what the dispatcher takes.
 *
 * Three shapes: a kind or kinds, a filter, or a kind or kinds and a filter that
 * must both hold. The second argument tells them apart — a filter carries its
 * name and its composition members, a handler does not. A bare predicate in a
 * filter's place is refused rather than taken for the handler, which would
 * leave the real handler unregistered and every update matching.
 */
export function register<C extends Dispatchable>(
  dispatcher: Dispatcher<C>,
  args: readonly unknown[],
  once: boolean,
): void {
  const [first, second, third, fourth] = args
  let match: string | readonly string[] | AnyFilter
  let handler: unknown
  let options: unknown

  if (typeof second === 'function' && typeof third === 'function') {
    if (!isFilter(second)) {
      throw new ValidationError(
        'the argument between the kind and the handler is not a filter; build it with defineFilter or a factory from @yuigram/mtproto/filters',
      )
    }
    const kinds = kindsOf(first)
    match = and(ofKind(kinds), second)
    handler = third
    options = fourth
  } else {
    match = isFilter(first) ? first : kindsOf(first)
    handler = second
    options = third
  }

  if (typeof handler !== 'function') throw new ValidationError('a handler is a function')

  dispatcher.on(match, handler as Handler<C>, {
    ...(options as OnOptions | undefined),
    ...(once ? { once: true } : {}),
  })
}

/**
 * The kinds a registration names, checked.
 *
 * A kind nothing produces is a handler that never runs and says nothing about
 * it, which is the worst way for a misspelling to fail.
 */
function kindsOf(value: unknown): readonly string[] {
  const kinds = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined
  if (kinds === undefined || kinds.length === 0) {
    throw new ValidationError('a registration names a kind, several kinds, or a filter')
  }

  for (const kind of kinds) {
    if (typeof kind !== 'string' || !KNOWN_KINDS.has(kind)) {
      throw new ValidationError(`'${String(kind)}' is not a kind an account produces`)
    }
  }

  return kinds as readonly string[]
}

/** A filter matching these kinds, so a kind and a filter compose as one. */
function ofKind(kinds: readonly string[]): AnyFilter {
  return defineFilter(
    `kind(${kinds.join(', ')})`,
    (value) => kinds.includes((value as { readonly kind?: unknown }).kind as string),
    { kinds },
  )
}

/** The dispatcher behind each router, reachable only from this package. */
const DISPATCHERS = new WeakMap<object, Dispatcher<never>>()

/** The dispatcher a router registers into, for the account that adds it. */
export function dispatcherOf<C extends Dispatchable>(router: AccountRouter<never>): Dispatcher<C> {
  const dispatcher = DISPATCHERS.get(router)
  if (dispatcher === undefined) throw new ValidationError('not an AccountRouter')

  return dispatcher as unknown as Dispatcher<C>
}

/**
 * A set of handlers that can be added to an account.
 *
 * For splitting an application by feature: each module builds a router, and
 * the account adds them. A router runs after the handlers of whatever it was
 * added to, and its middleware wraps only its own handlers.
 *
 * ```ts
 * const admin = new AccountRouter()
 * admin.use(onlyAdmins)
 * admin.on('message', f.command('ban'), (event) => ban(event))
 *
 * account.addChild(admin)
 * ```
 */
export class AccountRouter<Ext = unknown> {
  readonly #dispatcher = new Dispatcher<MtprotoContext & Ext>()

  constructor() {
    DISPATCHERS.set(this, this.#dispatcher as Dispatcher<never>)
  }

  /** Add middleware around this router's own handlers and children. */
  use(middleware: Middleware<MtprotoContext & Ext>, options?: UseOptions): this {
    this.#dispatcher.use(middleware, options)

    return this
  }

  /** Handle events of a kind, or of several. */
  on<K extends MtprotoEventKind>(
    kind: K | readonly K[],
    handler: Handler<MtprotoContext & Ext>,
    options?: OnOptions,
  ): this
  /** Handle what a filter matches; the handler's context is what the filter proves. */
  on<F extends FilterMeta>(
    filter: F,
    handler: Handler<AccountFilterContext<F> & Ext>,
    options?: OnOptions,
  ): this
  /** Handle events of a kind that a filter also matches. */
  on<K extends MtprotoEventKind, F extends FilterMeta>(
    kind: K | readonly K[],
    filter: F,
    handler: Handler<AccountFilterContext<F> & Ext>,
    options?: OnOptions,
  ): this
  on(...args: unknown[]): this {
    register(this.#dispatcher, args, false)

    return this
  }

  /** As {@link AccountRouter.on}, for a handler that runs once and is removed. */
  once<K extends MtprotoEventKind>(
    kind: K | readonly K[],
    handler: Handler<MtprotoContext & Ext>,
    options?: OnOptions,
  ): this
  once<F extends FilterMeta>(
    filter: F,
    handler: Handler<AccountFilterContext<F> & Ext>,
    options?: OnOptions,
  ): this
  once<K extends MtprotoEventKind, F extends FilterMeta>(
    kind: K | readonly K[],
    filter: F,
    handler: Handler<AccountFilterContext<F> & Ext>,
    options?: OnOptions,
  ): this
  once(...args: unknown[]): this {
    register(this.#dispatcher, args, true)

    return this
  }

  /** Handle new messages. */
  onMessage(handler: Handler<MtprotoContext & Ext>): this {
    return this.on('message', handler)
  }

  /** Remove a handler. A dispatch already running it lets it finish. */
  off(handler: Handler<never>): boolean {
    return this.#dispatcher.off(handler as Handler<MtprotoContext & Ext>)
  }

  /** Run before this router's handlers; returning `Propagation.Stop` skips them. */
  before(hook: BeforeHook<MtprotoContext & Ext>): this {
    this.#dispatcher.before(hook)

    return this
  }

  /** Run after this router's handlers, told whether any ran. */
  after(hook: AfterHook<MtprotoContext & Ext>): this {
    this.#dispatcher.after(hook)

    return this
  }

  /** Be told about what this router's handlers throw. Return `false` to pass it on. */
  catch(handler: ErrorHandler<MtprotoContext & Ext>): this {
    this.#dispatcher.catch(handler)

    return this
  }

  /** Put a router inside this one, to run after this one's handlers. */
  addChild(router: AccountRouter<Ext>): this {
    this.#dispatcher.addChild(dispatcherOf(router as AccountRouter<never>))

    return this
  }

  /** Take a router back out. */
  removeChild(router: AccountRouter<Ext>): boolean {
    return this.#dispatcher.removeChild(dispatcherOf(router as AccountRouter<never>))
  }

  /** Make a value reachable as `deps[name]` here and in every router below. */
  inject<K extends keyof Dependencies & string>(name: K, value: Dependencies[K]): this
  inject(dependencies: Partial<Dependencies>): this
  inject(first: string | Partial<Dependencies>, value?: unknown): this {
    if (typeof first === 'string') {
      this.#dispatcher.inject(first as keyof Dependencies & string, value as never)
    } else {
      this.#dispatcher.inject(first)
    }

    return this
  }

  /** What was injected here or above. Reading a name nobody injected throws. */
  get deps(): Dependencies {
    return this.#dispatcher.deps
  }
}
