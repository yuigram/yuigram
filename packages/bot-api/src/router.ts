/**
 * A group of handlers with its own middleware.
 *
 * The client's registration surface is pleasant at ten handlers and a
 * single-file bottleneck at several hundred. A router carries the same surface
 * and installs onto a client, so a feature becomes a module:
 *
 * ```ts
 * // features/admin.ts
 * export const admin = new Router()
 * admin.use(requireAdmin)
 * admin.onCommand('ban', handleBan)
 *
 * // index.ts
 * bot.extend(admin)
 * ```
 *
 * Two properties make it worth having rather than a naming convention:
 *
 * - **Its middleware is scoped.** `requireAdmin` above runs for the updates
 *   this router handles and for nothing else, so it is a real gate rather than
 *   a global one that returns early. A router that handles only callback
 *   queries costs nothing on a message.
 * - **A handler moves between the two unchanged.** The registration surface is
 *   the client's, including the generated `on…` set, so promoting a handler out
 *   of `index.ts` into a module is a cut and a paste.
 *
 * ## Populate, then install
 *
 * A router's handlers must be registered before it is installed. Installing
 * reads which event kinds the router covers, and the client subscribes to
 * exactly those — so a handler added afterwards would be for a kind Telegram
 * was never asked to send, and would simply never run. Rather than leave that
 * silent, a registration after installation throws.
 *
 * ## Errors
 *
 * A router may register its own `onError`, which then handles what its handlers
 * throw. Without one, failures travel to the client's error handling: the same
 * route a directly-registered handler's would take, rather than a parallel one
 * the application has registered nothing for. Either way one failing handler
 * does not stop the rest.
 */

import {
  type AnyFilter,
  Dispatcher,
  defineFilter,
  type ErrorHandler,
  type FilterMeta,
  type Middleware,
  type MiddlewareHost,
  type Plugin,
  type UseOptions,
} from '@yuigram/core'
import type { EventHandler } from './bot.js'
import type {
  AnyEventContext,
  CallbackQueryContext,
  CommandContext,
  ContextFor,
  TextMessageContext,
} from './events/index.js'
import type { BotEventKind } from './generated/events.js'
import { type GeneratedRegistrations, REGISTRATIONS } from './generated/registrations.js'
import {
  type RegistrationTarget,
  registerCallbackQuery,
  registerCommand,
  registerText,
} from './registration.js'

/** The context a filter registration hands its handler. */
type FilterContext<F> =
  F extends AnyFilter<infer Base, infer Mod>
    ? Base extends AnyEventContext
      ? Omit<Base, keyof Mod> & Mod
      : AnyEventContext
    : AnyEventContext

/** Options for {@link Router}. */
export interface RouterOptions {
  /** Name used in diagnostics. Defaults to a generated one. */
  readonly name?: string
}

/** What a router needs from the client it is installed on. */
export interface RouterHost {
  /** The running bot's username, for the command mention check. */
  username(): string | undefined
  /** Hand an error to the client's error handling. */
  report(error: unknown, context: AnyEventContext): void | Promise<void>
}

/** Raised when a router is registered onto a second client, or written to after install. */
export class RouterInstalledError extends Error {
  override readonly name = 'RouterInstalledError'

  constructor(router: string, what: string) {
    super(
      `${router} is already installed, so ${what} would not be dispatched: ` +
        `the client subscribes to the kinds a router covers when it is installed. ` +
        `Register everything before calling extend().`,
    )
  }
}

/** Distinguishes a router from a plugin without importing one into the other. */
const ROUTER = Symbol.for('yuigram.router')

let counter = 0

/**
 * A mountable group of handlers.
 *
 * `Ext` is what the router's handlers expect every context to carry. A client
 * that does not provide it cannot install the router, which is the compile
 * error that replaces discovering at runtime that `session` is undefined.
 */
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: the merged interface declares the named registrations, which are installed on this prototype below from the same generated list
export class Router<Ext = unknown> {
  /** Marks this object as a router for `extend`. */
  readonly [ROUTER] = true

  /** Name used in diagnostics. */
  readonly name: string

  readonly #dispatcher: Dispatcher<AnyEventContext & Ext>
  #host: RouterHost | undefined

  constructor(options: RouterOptions = {}) {
    counter += 1
    this.name = options.name ?? `router-${counter}`

    this.#dispatcher = new Dispatcher<AnyEventContext & Ext>({
      onUnhandled: (error, context) => {
        // Nothing in the router claimed the error, so it belongs to the client.
        // Before installation there is no client, and rethrowing is the only
        // honest option left — swallowing it would be the one outcome worse
        // than either alternative.
        if (this.#host === undefined) throw error
        void this.#host.report(error, context)
      },
    })
  }

  /** Whether this router has been installed on a client. */
  get installed(): boolean {
    return this.#host !== undefined
  }

  /** Number of handlers registered. */
  get size(): number {
    return this.#dispatcher.size
  }

  /** Register middleware, scoped to the updates this router handles. */
  use(middleware: Middleware<AnyEventContext & Ext>, options?: UseOptions): this {
    this.#assertOpen('this middleware')
    this.#dispatcher.use(middleware, options)
    return this
  }

  /** Register a handler for a kind, a list of kinds, or a filter. */
  on<K extends BotEventKind>(kind: K, handler: EventHandler<ContextFor<K> & Ext>): this
  on(match: readonly string[], handler: EventHandler<AnyEventContext & Ext>): this
  on<F extends FilterMeta>(match: F, handler: EventHandler<FilterContext<F> & Ext>): this
  on(match: string | readonly string[] | AnyFilter, handler: EventHandler<never>): this {
    this.#assertOpen(`a handler for ${describe(match)}`)
    this.#dispatcher.on(match, handler as never)
    return this
  }

  /** Register a handler that removes itself after its first match. */
  once<K extends BotEventKind>(kind: K, handler: EventHandler<ContextFor<K> & Ext>): this {
    this.#assertOpen(`a handler for ${kind}`)
    this.#dispatcher.once(kind, handler as never)
    return this
  }

  /** Remove a handler. */
  off(handler: EventHandler<never>): boolean {
    return this.#dispatcher.off(handler as never)
  }

  /** A message carrying text, optionally matching it. */
  onText(handler: EventHandler<TextMessageContext & Ext>): this
  onText(match: string | RegExp, handler: EventHandler<TextMessageContext & Ext>): this
  onText(
    first: string | RegExp | EventHandler<TextMessageContext & Ext>,
    second?: EventHandler<TextMessageContext & Ext>,
  ): this {
    this.#assertOpen('this text handler')
    const match = typeof first === 'function' ? undefined : first
    const handler = (typeof first === 'function' ? first : second) as EventHandler<
      TextMessageContext & Ext
    >

    registerText(this.#target(), match, handler as never)
    return this
  }

  /** A command, with the same `@bot` rules the client applies. */
  onCommand(match: string | RegExp, handler: EventHandler<CommandContext & Ext>): this {
    this.#assertOpen(`a handler for ${String(match)}`)
    registerCommand(this.#target(), match, handler as never)
    return this
  }

  /** A callback query, optionally matching its data. */
  onCallbackQuery(handler: EventHandler<CallbackQueryContext & Ext>): this
  onCallbackQuery(match: string | RegExp, handler: EventHandler<CallbackQueryContext & Ext>): this
  onCallbackQuery(
    first: string | RegExp | EventHandler<CallbackQueryContext & Ext>,
    second?: EventHandler<CallbackQueryContext & Ext>,
  ): this {
    this.#assertOpen('this callback query handler')
    const match = typeof first === 'function' ? undefined : first
    const handler = (typeof first === 'function' ? first : second) as EventHandler<
      CallbackQueryContext & Ext
    >

    registerCallbackQuery(this.#target(), match, handler as never)
    return this
  }

  /**
   * Install a plugin that only needs somewhere to put middleware.
   *
   * The same `session()` that installs on a client installs here, scoped to
   * what this router handles — which is how a feature gets its own state
   * without the rest of the application carrying it.
   */
  extend(plugin: Plugin<string, unknown, MiddlewareHost>): this {
    this.#assertOpen(`the ${plugin.name} plugin`)
    void plugin.install(this as unknown as MiddlewareHost)
    return this
  }

  /** Handle what this router's handlers and middleware throw. */
  onError(handler: ErrorHandler<AnyEventContext & Ext>): this {
    this.#dispatcher.catch(handler)
    return this
  }

  /** Which event kinds this router handles, for the client's subscription. */
  collectKinds(): { readonly kinds: ReadonlySet<string>; readonly opaque: boolean } {
    return this.#dispatcher.collectKinds()
  }

  /**
   * Attach to a client.
   *
   * Called by `Bot.extend`. Installing twice is refused: a router holds one
   * host, and the second client's username would silently win the command
   * check for both.
   */
  install(host: RouterHost): void {
    if (this.#host !== undefined) throw new RouterInstalledError(this.name, 'installing it again')
    this.#host = host
  }

  /** Run this router's middleware and handlers for one update. */
  async dispatch(context: AnyEventContext & Ext): Promise<void> {
    await this.#dispatcher.dispatch(context)
  }

  /** The registration target the shared helpers write through. */
  #target(): RegistrationTarget {
    return {
      register: (match, handler) => {
        this.#dispatcher.on(match, handler as never)
      },
      username: () => this.#host?.username(),
    }
  }

  /** Refuse a registration that would never be dispatched. */
  #assertOpen(what: string): void {
    if (this.#host !== undefined) throw new RouterInstalledError(this.name, what)
  }
}

/**
 * A router this client can host.
 *
 * The client must provide at least what the router asks every context to
 * carry. Without the guard the assignability runs the wrong way — a client
 * with no session would happily accept a router whose handlers read
 * `message.session`, and the failure would arrive at runtime as `undefined`.
 *
 * When the check fails the parameter type collapses to `never`, so the call
 * site reports the router as not assignable rather than accepting it.
 */
export type RouterThisClientCanHost<ClientExt, RouterExt> = Router<RouterExt> &
  (ClientExt extends RouterExt ? object : never)

/** Whether a value is a router. Structural, so it survives duplicate copies of the package. */
export function isRouter(value: unknown): value is Router<never> {
  return typeof value === 'object' && value !== null && ROUTER in value
}

/** A filter that matches anything, for a router whose coverage cannot be narrowed. */
export const anyUpdate: AnyFilter = defineFilter('router', () => true)

/** Describe a match for an error message. */
function describe(match: string | readonly string[] | AnyFilter): string {
  if (typeof match === 'string') return match
  if (Array.isArray(match)) return match.join(', ')
  return (match as FilterMeta).name
}

/**
 * The named registrations, merged onto the router.
 *
 * The same generated interface the client declares, so a handler written
 * against one works on the other unchanged.
 */
export interface Router<Ext = unknown> extends GeneratedRegistrations<Ext> {}

for (const [method, kind] of REGISTRATIONS) {
  Object.defineProperty(Router.prototype, method, {
    enumerable: false,
    writable: true,
    configurable: true,
    value: function registerByKind(this: Router, handler: EventHandler<never>): Router {
      return this.on(kind as BotEventKind, handler as never)
    },
  })
}
