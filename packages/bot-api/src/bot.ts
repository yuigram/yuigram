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
  type Modify,
  type Plugin,
  PluginRegistry,
  type UseOptions,
} from '@yuigram/core'
import { createApi, type RawApi } from './api.js'
import { addressedToUs, commandMatches, type ParsedCommand, parseCommand } from './command.js'
import {
  type AnyEventContext,
  type CallbackQueryContext,
  type CommandContext,
  type ContextFor,
  createEventContext,
  type EventContext,
  type MessageContext,
  type TextMessageContext,
} from './events/index.js'
import {
  ALL_UPDATE_TYPES,
  type BotEventKind,
  KIND_SUBSCRIPTIONS,
  MESSAGE_KINDS,
} from './generated/events.js'
import type { Update, User } from './generated/types/index.js'
import type { HttpClient } from './http/client.js'
import { fetchClient } from './http/fetch-client.js'
import { normalizeUpdate } from './normalize.js'
import { createPolling, type Polling } from './polling.js'
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
 */
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
    })

    this.#lifecycle = new Lifecycle({
      onStart: () => this.#startPolling(),
      onStop: () => this.#stopPolling(),
    })
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

  /** Any incoming message, whether or not it has text. */
  onMessage(handler: EventHandler<MessageContext<'message'> & Ext>): this {
    return this.on('message', handler as never)
  }

  /** An edited message. */
  onEditedMessage(handler: EventHandler<MessageContext<'message_edited'> & Ext>): this {
    return this.on('message_edited', handler as never)
  }

  /** A channel post. */
  onChannelPost(handler: EventHandler<MessageContext<'channel_post'> & Ext>): this {
    return this.on('channel_post', handler as never)
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

    this.#dispatcher.on(MESSAGE_KINDS, (context) => {
      const text = (context as { text?: unknown }).text
      if (typeof text !== 'string') return

      if (match !== undefined) {
        const matched = typeof match === 'string' ? text === match : match.test(text)
        if (!matched) return
      }

      return handler(context as unknown as TextMessageContext & Ext)
    })

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
    this.#dispatcher.on(MESSAGE_KINDS, (context) => {
      const text = (context as { text?: unknown }).text
      if (typeof text !== 'string') return

      const parsed = parseCommand(text)
      if (parsed === undefined) return
      if (!commandMatches(parsed, match)) return
      if (!addressedToUs(parsed, this.#me?.username)) return

      // Derived rather than assigned: writing onto the shared context would
      // leave `command` visible to every later handler for this update,
      // including ones that have nothing to do with commands.
      const withCommand = Object.create(context as object, {
        command: { value: parsed, enumerable: true },
      }) as CommandContext & Ext

      return handler(withCommand)
    })

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

    return this.on('callback_query', ((context: CallbackQueryContext) => {
      const data = context.data
      if (match === undefined) return handler(context as CallbackQueryContext & Ext)

      if (typeof data !== 'string') return
      const matched = typeof match === 'string' ? data === match : match.test(data)
      if (!matched) return

      return handler(context as CallbackQueryContext & Ext)
    }) as never)
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
  extend(plugin: Plugin<string, unknown, Bot<Ext>>): this {
    this.#plugins.add(plugin)
    return this
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

  /** Stop, draining in-flight handlers first. */
  async stop(options: { timeout?: number } = {}): Promise<void> {
    await this.#lifecycle.stop(options)
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  async #startPolling(): Promise<void> {
    await this.#plugins.install(this)

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

  async #stopPolling(): Promise<void> {
    await this.#polling?.stop()
    this.#polling = undefined
  }

  /**
   * Work out what to put in `allowed_updates`.
   *
   * Telegram takes its own update type names here — the `Update` field names —
   * not Yuigram kinds. Sending a kind it does not recognise means it never
   * sends that update, and the handler never runs.
   */
  #resolveAllowedUpdates(): readonly string[] | undefined {
    const configured = this.#options.allowedUpdates

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

export type { ParsedCommand }
