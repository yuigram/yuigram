/**
 * The Bot API client.
 *
 * Four things changed from the 0.1.0 surface, each for a reason recorded in
 * `docs/api-decisions.md`:
 *
 * - **`Bot.fromToken(...)` rather than `new Bot(token)`.** The name carries the
 *   credential, so the API grows by adding names instead of widening an options
 *   bag — which is what the MTProto client and account will need.
 * - **`onMessage` / `on(kind)` both narrow.** Registration selects the context
 *   type, so a message handler receives a `chat` that is a `Chat` rather than a
 *   `Chat | undefined`.
 * - **`poll()` rather than `start()`.** Polling and webhooks are different
 *   deployments with different failure modes, and the ten lines a reader sees
 *   should say which one is running.
 * - **`onError` rather than `catch`.** Everything that subscribes begins with
 *   `on`, so the surface can be guessed rather than memorised.
 *
 * Extensions ride on the `Ext` type parameter rather than a globally merged
 * interface, so two bots in one program can hold different state and the type
 * works through the `yuigram` façade rather than only the internal package.
 */

import {
  type AnyFilter,
  ContextExtender,
  createLogger,
  Dispatcher,
  type ErrorHandler,
  type FilterMeta,
  Lifecycle,
  type Logger,
  type Middleware,
  type MiddlewareHost,
  type Modify,
  type Plugin,
  PluginRegistry,
  type UseOptions,
} from '@yuigram/core'
import { type ApiHook, createApi, type RawApi } from './api.js'
import type { ParsedCommand } from './command.js'
import {
  type AnyEventContext,
  type CallbackQueryContext,
  type CommandContext,
  type ContextFor,
  createEventContext,
  type EventContext,
  type TextMessageContext,
} from './events/index.js'
import { ALL_UPDATE_TYPES, type BotEventKind, KIND_SUBSCRIPTIONS } from './generated/events.js'
import { type GeneratedRegistrations, REGISTRATIONS } from './generated/registrations.js'
import type { Update, User } from './generated/types/index.js'
import type { HttpClient } from './http/client.js'
import { fetchClient } from './http/fetch-client.js'
import { normalizeUpdate } from './normalize.js'
import { createPolling, type Polling } from './polling.js'
import {
  type RegistrationTarget,
  registerCallbackQuery,
  registerCommand,
  registerText,
} from './registration.js'
import { anyUpdate, isRouter, type Router, type RouterThisClientCanHost } from './router.js'
import { createWebhookHandler, type WebhookHandler, type WebhookOptions } from './webhook/index.js'

/** Options accepted when building a client. */
export interface BotOptions {
  /** Transport to use. Defaults to the fetch client built from the token. */
  readonly client?: HttpClient
  /** API root, for a local Bot API server. */
  readonly baseUrl?: string
  /** Whether `baseUrl` points at a local Bot API server. */
  readonly local?: boolean
  /** Name used in logs. */
  readonly name?: string
  /** Logger. Defaults to a console logger at `info`. */
  readonly log?: Logger
  /** Merged into every API call. */
  readonly defaults?: Readonly<Record<string, unknown>>
  /**
   * Update kinds to subscribe to, or `'auto'` to derive them from the
   * registered handlers.
   */
  readonly allowedUpdates?: readonly string[] | 'auto'
}

/** Options accepted by {@link Bot.poll}. */
export interface PollOptions {
  /** Discard updates queued before startup. */
  readonly dropPending?: boolean
  /** Seconds Telegram holds a request open with no updates. */
  readonly timeout?: number
  /**
   * Most handlers running at once.
   *
   * One chat's updates always run in order; unrelated chats run in parallel up
   * to this bound. `1` restores strictly sequential delivery.
   */
  readonly concurrency?: number
  /**
   * Most updates accepted before the loop stops fetching.
   *
   * Defaults to four times `concurrency`, and is never below it. The peak
   * outstanding work is roughly half of this plus one batch, because the check
   * happens before a fetch and a fetch returns a whole batch.
   */
  readonly capacity?: number
  /**
   * Which update kinds to subscribe to, overriding the client's setting.
   *
   * Accepted here as well as on the client because it is a `getUpdates`
   * parameter, and a reader looking for what the bot subscribes to looks at
   * the call that starts it. `'auto'` derives the set from the registrations,
   * including a router's.
   */
  readonly allowedUpdates?: readonly string[] | 'auto'
}

/** A handler for one event. */
export type EventHandler<C> = (context: C) => unknown

/**
 * The context a filter proves it has.
 *
 * Both halves of a filter's promise are applied: `Base` is what matching
 * establishes the value is, and `Mod` is what it refines on top. Extracted by
 * conditional inference rather than by inferring through `Filter`'s own type
 * parameters, which does not survive composition — `and(a, b)` produces an
 * intersection that positional inference silently gives up on, falling back to
 * the untyped overload.
 */
export type FilterContext<F> =
  F extends AnyFilter<infer Base, infer Mod>
    ? Base extends EventContext
      ? Modify<Base, Mod>
      : AnyEventContext
    : AnyEventContext

/**
 * A Telegram bot, over the Bot API.
 *
 * `Ext` is what plugins add to every context. It defaults to nothing:
 *
 * ```ts
 * const bot = Bot.fromToken(process.env.BOT_TOKEN!)
 *
 * bot.onCommand('start', (message) => message.reply('Hello.'))
 * bot.onText((message) => message.reply(`You said: ${message.text}`))
 *
 * await bot.poll()
 * ```
 *
 * An application using sessions names the flavour once:
 *
 * ```ts
 * const bot = Bot.fromToken<SessionFlavor<Cart>>(token)
 * ```
 *
 * Beyond the methods declared here, every event kind has a named registration —
 * `onMessage`, `onChannelPost`, `onChatMemberJoined`, seventy-nine in all.
 * They are generated from the same kind list the dispatcher uses and installed
 * on the prototype below, so autocomplete offers the whole taxonomy and none of
 * it is maintained by hand. `onText`, `onCommand` and `onCallbackQuery` stay
 * hand-written, because each matches as well as selects.
 */
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: the merged interface declares the named registrations, which are installed on this prototype below from the same generated list
export class Bot<Ext = unknown> {
  /** The raw API surface, for anything the context actions do not cover. */
  readonly api: RawApi

  /** Name used in logs. */
  readonly name: string

  readonly #log: Logger
  readonly #dispatcher: Dispatcher<AnyEventContext & Ext>
  readonly #plugins = new PluginRegistry<Bot<Ext>>()
  readonly #extender = new ContextExtender()
  readonly #lifecycle: Lifecycle
  readonly #options: BotOptions

  #polling: Polling | undefined
  #pollOptions: PollOptions = {}
  #me: User | undefined
  #identifying: Promise<User> | undefined
  #pluginWork: Promise<unknown> = Promise.resolve()
  readonly #hooks: ApiHook[] = []

  /**
   * How the shared registrations write onto this client.
   *
   * The username is read through a function because it arrives from `getMe`
   * after registration: a command registered at import time still has to get
   * the `@bot` check right once the client knows who it is.
   */
  readonly #target: RegistrationTarget = {
    register: (match, handler) => {
      this.#dispatcher.on(match, handler as never)
    },
    username: () => this.#me?.username,
  }

  /**
   * Build a client from a bot token.
   *
   * The usual way in. The name says which credential is being used, which is
   * what lets `Bot.fromMtproto` and `Account.fromSession` join it later without
   * any of them growing a mode flag.
   */
  static fromToken<Ext = unknown>(token: string, options: BotOptions = {}): Bot<Ext> {
    return new Bot<Ext>(token, options)
  }

  /**
   * Build a client directly.
   *
   * Kept for the case where every option is being set. `fromToken` is the
   * documented path.
   */
  constructor(token: string, options: BotOptions = {}) {
    this.#options = options
    this.name = options.name ?? 'bot'
    this.#log = (options.log ?? createLogger()).child(this.name)

    this.#dispatcher = new Dispatcher<AnyEventContext & Ext>({
      onUnhandled: (error, context) => {
        // Logged rather than swallowed: with no error handler registered this
        // is the only trace an operator gets.
        this.#log.error('unhandled error while dispatching an update', {
          kind: context.kind,
          updateId: context.updateId,
          error,
        })
      },
    })

    const client =
      options.client ??
      fetchClient({
        token,
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.local === undefined ? {} : { local: options.local }),
      })

    this.api = createApi({
      client,
      ...(options.defaults === undefined ? {} : { defaults: options.defaults }),
      // Passed by reference so a hook registered later still applies. Building
      // the surface once and letting plugins extend it is the whole reason
      // `hook` can be called after construction.
      hooks: this.#hooks,
    })

    this.#lifecycle = new Lifecycle({
      onStart: () => this.#startPolling(),
      onStop: (context) => this.#stopPolling(context.signal),
    })
  }

  /**
   * Updates scheduled but not yet finished.
   *
   * Zero when idle. Rising and staying high means handlers are slower than the
   * updates arriving, which is what the poll loop's own backpressure responds
   * to — visible here so an application can see it too.
   */
  get pending(): number {
    return this.#polling?.pending ?? 0
  }

  /** Who this bot is, once identified. */
  get me(): User | undefined {
    return this.#me
  }

  /** Current lifecycle state. */
  get state(): string {
    return this.#lifecycle.state
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /** Register dispatch middleware. */
  use(middleware: Middleware<AnyEventContext & Ext>, options?: UseOptions): this {
    this.#dispatcher.use(middleware, options)
    return this
  }

  /**
   * Register a handler for one event kind.
   *
   * The kind is a type-level input, so the handler receives the context that
   * kind produces — the same type the named methods give.
   */
  on<K extends BotEventKind>(kind: K, handler: EventHandler<ContextFor<K> & Ext>): this

  /** Register a handler for several kinds at once. */
  on(match: readonly string[], handler: EventHandler<AnyEventContext & Ext>): this

  /**
   * Register a handler behind a filter.
   *
   * What the filter proves is applied here rather than at the call site: a
   * filter declaring `{ text: string }` hands the handler a context whose
   * `text` is a `string`, without the handler re-checking what matching
   * already established.
   *
   * Give a composed filter a name before registering it:
   *
   * ```ts
   * const privateWithLink = and(isPrivate, hasEntities)
   * bot.on(privateWithLink, (message) => …)
   * ```
   *
   * Composing inline is rejected rather than accepted with a widened context.
   * The compiler will not follow `Filter`'s recursive composition members
   * deeply enough to infer through a nested call, and a handler that silently
   * received every kind would be worse than a compile error.
   */
  on<F extends FilterMeta>(match: F, handler: EventHandler<FilterContext<F> & Ext>): this

  on(match: string | readonly string[] | AnyFilter, handler: EventHandler<never>): this {
    this.#dispatcher.on(match, handler as never)
    return this
  }

  /** Register a handler that runs once, then removes itself. */
  once<K extends BotEventKind>(kind: K, handler: EventHandler<ContextFor<K> & Ext>): this {
    this.#dispatcher.once(kind, handler as never)
    return this
  }

  /** Remove a handler. */
  off(handler: EventHandler<never>): boolean {
    return this.#dispatcher.off(handler as never)
  }

  /**
   * A message carrying text.
   *
   * `text` is a plain `string` here, which `onMessage` cannot promise: a photo
   * without a caption is a message with no text.
   */
  onText(handler: EventHandler<TextMessageContext & Ext>): this
  onText(match: string | RegExp, handler: EventHandler<TextMessageContext & Ext>): this
  onText(
    first: string | RegExp | EventHandler<TextMessageContext & Ext>,
    second?: EventHandler<TextMessageContext & Ext>,
  ): this {
    const match = typeof first === 'function' ? undefined : first
    const handler = (typeof first === 'function' ? first : second) as EventHandler<
      TextMessageContext & Ext
    >

    registerText(this.#target, match, handler as never)
    return this
  }

  /**
   * A command.
   *
   * `/start` matches whichever bot is running; `/start@thisbot` matches only
   * when the suffix names us, and `/start@otherbot` never does. Answering a
   * command addressed to another bot is the most common mistake in hand-rolled
   * command handling.
   */
  onCommand(match: string | RegExp, handler: EventHandler<CommandContext & Ext>): this {
    registerCommand(this.#target, match, handler as never)
    return this
  }

  /** A callback query, from an inline keyboard button. */
  onCallbackQuery(handler: EventHandler<CallbackQueryContext & Ext>): this
  onCallbackQuery(match: string | RegExp, handler: EventHandler<CallbackQueryContext & Ext>): this
  onCallbackQuery(
    first: string | RegExp | EventHandler<CallbackQueryContext & Ext>,
    second?: EventHandler<CallbackQueryContext & Ext>,
  ): this {
    const match = typeof first === 'function' ? undefined : first
    const handler = (typeof first === 'function' ? first : second) as EventHandler<
      CallbackQueryContext & Ext
    >

    registerCallbackQuery(this.#target, match, handler as never)
    return this
  }

  /**
   * Report an error from a handler or middleware.
   *
   * An error is either handled or propagates, and is never silent: with a
   * handler registered the handlers see it and dispatch continues; without one
   * it is logged; with neither a handler nor a logger it propagates to whoever
   * called `handleUpdate`.
   */
  onError(handler: ErrorHandler<AnyEventContext & Ext>): this {
    this.#dispatcher.catch(handler as never)
    return this
  }

  /** Install a plugin. */
  /**
   * Wrap every outgoing API call.
   *
   * Composed outermost-first, like handler middleware, with `next()` sending
   * the request — so retry, throttling, caching and instrumentation are
   * ordinary code rather than framework features:
   *
   * ```ts
   * bot.hook(retryOnFloodWait({ maxWait: 30 }))
   * ```
   *
   * Hooks may be added at any time, including from a plugin, because the chain
   * is read at call time rather than captured when the client is built.
   */
  hook(hook: ApiHook): this {
    this.#hooks.push(hook)
    return this
  }

  extend<RouterExt>(router: RouterThisClientCanHost<Ext, RouterExt>): this
  extend(plugin: Plugin<string, unknown, Bot<Ext>>): this
  /**
   * Install a plugin that only needs somewhere to put middleware.
   *
   * A plugin should not have to name the client class it will be installed on:
   * that ties it to one transport and stops it working on a `Router`. Declaring
   * {@link MiddlewareHost} instead is what makes `session()` installable on
   * both.
   */
  extend(plugin: Plugin<string, unknown, MiddlewareHost>): this
  extend(extension: Router<unknown> | Plugin<string, unknown, never>): this {
    if (isRouter(extension)) {
      this.#mount(extension as unknown as Router<Ext>)
      return this
    }

    // Narrowed by the guard above: `isRouter` reports on a symbol a plugin
    // does not carry, which TypeScript cannot see through a union of two
    // structural types.
    this.#plugins.add(extension as unknown as Plugin<string, unknown, Bot<Ext>>)
    return this
  }

  /**
   * Install a router as a single handler that dispatches into it.
   *
   * Registering the router's own handlers onto this client would run its
   * middleware once per matching handler rather than once per update, which is
   * wrong for anything that counts — a rate limiter would charge a photo three
   * times because three handlers wanted it.
   *
   * The kinds are read now, which is why a router refuses registrations after
   * installation: this is what the client subscribes to.
   */
  #mount(router: Router<Ext>): void {
    router.install({
      username: () => this.#me?.username,
      report: (error, context) => this.#dispatcher.report(error, context as never),
    })

    const dispatch = (context: AnyEventContext & Ext): Promise<void> => router.dispatch(context)
    const coverage = router.collectKinds()

    // An opaque router — one carrying a filter that could match anything — is
    // registered the same way any opaque filter is, and widens the subscription
    // for the same reason: skipping a kind a handler might want is a silently
    // dropped update.
    if (coverage.opaque) {
      this.#dispatcher.on(anyUpdate, dispatch as never)
      return
    }

    this.#dispatcher.on([...coverage.kinds], dispatch as never)
  }

  /** Contribute a member to every context, under a plugin's name. */
  extendContext(owner: string, key: string, value: (context: object) => unknown): this {
    this.#extender.add({ owner, key, value })
    return this
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  /** Handle one update. The entry point for both polling and webhooks. */
  async handleUpdate(update: Update): Promise<void> {
    // Plugins are installed by dispatch rather than by a transport, because a
    // webhook deployment never calls `poll()` — and a session plugin that
    // silently does nothing behind a webhook is the worst kind of defect: the
    // code is right, the deployment is ordinary, and nothing reports a problem.
    if (this.#plugins.pending > 0) await this.#installPlugins()

    const normalized = normalizeUpdate(update)

    const context = this.#extender.apply(
      createEventContext({
        normalized,
        api: this.api,
        log: this.#log,
      }) as object,
    ) as AnyEventContext & Ext

    await this.#dispatcher.dispatch(context)
  }

  /**
   * Resolve who this bot is, without starting anything.
   *
   * `poll()` does this already, but a webhook bot never calls it — and command
   * matching needs the username to tell `/start@thisbot` from `/start@otherbot`.
   *
   * Concurrent calls share one request: a webhook bot handling a burst at cold
   * start would otherwise send a `getMe` for each.
   */
  async identify(): Promise<User> {
    if (this.#me !== undefined) return this.#me

    this.#identifying ??= this.api.getMe().then(
      (me) => {
        this.#me = me
        this.#identifying = undefined
        return me
      },
      (error: unknown) => {
        // Cleared on failure so a later call retries rather than replaying a
        // rejection forever.
        this.#identifying = undefined
        throw error
      },
    )

    return this.#identifying
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Receive updates by long polling.
   *
   * Named for the mechanism, because polling and webhooks are different
   * deployments: one holds a connection open and scales by process, the other
   * is pushed to and scales by request.
   */
  async poll(options: PollOptions = {}): Promise<void> {
    this.#pollOptions = options
    await this.#lifecycle.start()
  }

  /**
   * Build a webhook handler.
   *
   * Returns a handler rather than starting a server: Yuigram does not own your
   * HTTP server, and the adapters in `yuigram/webhook` turn this into whatever
   * your framework expects.
   */
  webhook(options: Omit<WebhookOptions, 'onUpdate'> = {}): WebhookHandler {
    return createWebhookHandler({
      ...options,
      log: options.log ?? this.#log,
      onUpdate: (update) => this.handleUpdate(update),
      track: (work) => {
        this.#lifecycle.track(work)
      },
    })
  }

  /**
   * Stop, draining in-flight handlers first.
   *
   * The timeout is a deadline over the whole shutdown — the drain and the
   * polling loop's own wait for its handlers — rather than over one stage with
   * another behind it. Returns whether everything finished: `false` means the
   * deadline passed and handlers were abandoned, which is worth logging rather
   * than reporting as a clean stop.
   */
  async stop(options: { timeout?: number } = {}): Promise<boolean> {
    await this.#lifecycle.stop(options)
    return this.#lifecycle.stopped
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  async #startPolling(): Promise<void> {
    // Eagerly here, so a plugin that throws takes the process down at startup
    // rather than on whichever update happens to arrive first.
    await this.#installPlugins()

    const me = await this.identify()
    this.#log.info('signed in', { username: me.username, id: me.id })

    if (!this.#dispatcher.hasCatcher) {
      // Said once, at start: errors are logged and dispatch continues, which is
      // safe but easy to miss if nobody is reading logs.
      this.#log.warn(
        'no error handler registered; handler errors will be logged and swallowed. Use bot.onError() to handle them',
      )
    }

    const allowedUpdates = this.#resolveAllowedUpdates()

    this.#polling = createPolling({
      api: this.api,
      log: this.#log,
      ...(allowedUpdates === undefined ? {} : { allowedUpdates }),
      ...(this.#pollOptions.dropPending === true ? { dropPending: true } : {}),
      ...(this.#pollOptions.concurrency === undefined
        ? {}
        : { concurrency: this.#pollOptions.concurrency }),
      ...(this.#pollOptions.capacity === undefined ? {} : { capacity: this.#pollOptions.capacity }),
      ...(this.#pollOptions.timeout === undefined ? {} : { timeout: this.#pollOptions.timeout }),
      onUpdate: (update) => this.#lifecycle.track(this.handleUpdate(update)),
      onError: (error) => {
        this.#log.error('polling error', { error })
      },
      onFatal: (error) => {
        // The bot is no longer receiving updates, so staying in the running
        // state would leave `bot.state` claiming something untrue. Deferred off
        // the polling loop's own stack: stopping from inside the loop being
        // stopped is re-entrant.
        this.#log.error('polling stopped and cannot recover', { error })
        queueMicrotask(() => {
          void this.stop().catch((stopError) => {
            this.#log.error('failed to stop after a fatal polling error', { error: stopError })
          })
        })
      },
    })

    await this.#polling.start()
  }

  async #stopPolling(signal: AbortSignal): Promise<void> {
    // The deadline comes from the lifecycle, so the wait for handlers here is
    // part of the timeout the caller set rather than a second one behind it.
    await this.#polling?.stop({ signal })
    this.#polling = undefined
  }

  /**
   * Work out what to put in `allowed_updates`.
   *
   * Telegram takes its own update type names here — the `Update` field names —
   * not Yuigram kinds. Sending a kind it does not recognise means it never
   * sends that update, and the handler never runs.
   */
  /**
   * Install whatever is queued, at most once and never twice at a time.
   *
   * Serialized on a single chain rather than a memoized promise: `extend` may
   * be called after the first update, and the registry installs in rounds, so
   * the guarantee needed is one-at-a-time rather than once-ever. Concurrent
   * updates would otherwise both see the same queue and install it twice.
   */
  #installPlugins(): Promise<unknown> {
    this.#pluginWork = this.#pluginWork.then(() => this.#plugins.install(this))
    return this.#pluginWork
  }

  #resolveAllowedUpdates(): readonly string[] | undefined {
    // The call that starts polling wins over the client's setting: it is the
    // more specific statement, and it is the one in front of the reader.
    const configured = this.#pollOptions.allowedUpdates ?? this.#options.allowedUpdates

    if (configured === undefined) return undefined
    if (configured !== 'auto') return configured

    const coverage = this.#dispatcher.collectKinds()

    if (coverage.opaque || coverage.kinds.size === 0) return ALL_UPDATE_TYPES

    const fields = new Set<string>()

    for (const kind of coverage.kinds) {
      const subscription = KIND_SUBSCRIPTIONS[kind]

      if (subscription === undefined) {
        // A kind the installed schema does not know: it may be newer than this
        // build, and narrowing it away would drop it silently.
        this.#log.warn('unrecognised update kind in subscription; subscribing to everything', {
          kind,
        })
        return ALL_UPDATE_TYPES
      }

      for (const field of subscription) fields.add(field)
    }

    return [...fields].sort()
  }
}

/**
 * The named registrations, merged onto the class.
 *
 * Declaration merging rather than `implements`: the methods are installed on
 * the prototype below, so declaring them in the class body would mean writing
 * seventy-nine bodies that all say the same thing.
 */
export interface Bot<Ext = unknown> extends GeneratedRegistrations<Ext> {}

/**
 * Install the named registrations, once, on the prototype.
 *
 * Every one is `on(kind, handler)` with the kind fixed, so they cost nothing
 * per instance and nothing per update. The list is generated from the same
 * taxonomy the dispatcher indexes, which is what keeps the two from drifting:
 * a kind Telegram adds appears here the moment the schema is regenerated.
 */
for (const [method, kind] of REGISTRATIONS) {
  Object.defineProperty(Bot.prototype, method, {
    // Not enumerable, so a `Bot` still inspects as its own fields rather than
    // as eighty functions.
    enumerable: false,
    writable: true,
    configurable: true,
    value: function registerByKind(this: Bot, handler: EventHandler<never>): Bot {
      return this.on(kind as BotEventKind, handler as never)
    },
  })
}

export type { ParsedCommand }
