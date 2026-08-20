/**
 * The Bot client.
 *
 * Ties the transport, dispatch, normalization and lifecycle together. Almost
 * everything here is delegation — the substance lives in `@yuigram/core` and in
 * the modules beside this one — which is what keeps the client small enough to
 * read in one sitting.
 */

import {
  type AnyFilter,
  ContextExtender,
  createLogger,
  Dispatcher,
  type Handler,
  Lifecycle,
  type Logger,
  type Middleware,
  type Plugin,
  PluginRegistry,
  type UseOptions,
} from '@yuigram/core'
import { createApi, type RawApi } from './api.js'
import { addressedToUs, commandMatches, type ParsedCommand, parseCommand } from './command.js'
import { type Context, createContext } from './context.js'
import {
  type DownloadTarget,
  download,
  downloadStream,
  downloadToFile,
  getFileUrl,
} from './download.js'
import { MESSAGE_KINDS } from './generated/events.js'
import type { Update, User } from './generated/types/index.js'
import type { HttpClient } from './http/client.js'
import { fetchClient } from './http/fetch-client.js'
import { normalizeUpdate } from './normalize.js'
import { createPolling, type Polling } from './polling.js'
import { createWebhookHandler, type WebhookHandler, type WebhookOptions } from './webhook/index.js'

/** Options for {@link Bot}. */
export interface BotOptions {
  /** Transport to use. Defaults to the fetch client built from the token. */
  readonly client?: HttpClient
  /** API root, for a local Bot API server. */
  readonly baseUrl?: string
  /**
   * Whether `baseUrl` points at a local Bot API server.
   *
   * Such a server reports absolute on-disk paths in `file_path`, so downloads
   * read from the filesystem instead of over HTTP.
   */
  readonly local?: boolean
  /** Name used in logs and by `App.client(name)`. */
  readonly name?: string
  /** Logger. Defaults to a console logger at `info`. */
  readonly log?: Logger
  /** Merged into every API call unless the call site supplies the parameter. */
  readonly defaults?: Readonly<Record<string, unknown>>

  /**
   * Update kinds to subscribe to.
   *
   * `'auto'` derives the minimal set from registered handlers, which matters
   * because Telegram does not deliver `message_reaction` or `chat_member`
   * unless they are requested.
   */
  readonly allowedUpdates?: readonly string[] | 'auto'
}

/**
 * Update kinds a command or text handler may fire on.
 *
 * Edited messages are included: editing a message into a command is a real
 * thing users do, and ignoring it silently is surprising.
 */

/** A context whose update carried a command. */
export interface CommandContext extends Context {
  /** The parsed command: name, arguments and any `@bot` suffix. */
  readonly command: ParsedCommand
}

/** Options accepted by {@link Bot.start}. */
export interface StartOptions {
  /** Discard updates queued before startup. */
  readonly dropPending?: boolean
}

/** A Telegram bot, over the Bot API. */
export class Bot {
  /** The raw API surface. */
  readonly api: RawApi

  /** Name used in logs. */
  readonly name: string

  readonly #log: Logger
  readonly #dispatcher: Dispatcher<Context>
  readonly #plugins = new PluginRegistry<Bot>()
  readonly #extender = new ContextExtender()
  readonly #lifecycle: Lifecycle
  readonly #options: BotOptions
  readonly #client: HttpClient

  #polling: Polling | undefined
  #me: User | undefined

  constructor(token: string, options: BotOptions = {}) {
    this.#options = options
    this.name = options.name ?? 'bot'
    this.#log = (options.log ?? createLogger()).child(this.name)

    this.#dispatcher = new Dispatcher<Context>({
      onUnhandled: (error, context) => {
        // Logged at error rather than swallowed: with no catch handler
        // registered this is the only trace an operator gets.
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

    this.#client = client

    this.api = createApi({
      client,
      ...(options.defaults === undefined ? {} : { defaults: options.defaults }),
    })

    this.#lifecycle = new Lifecycle({
      onStart: () => this.#onStart(),
      onStop: () => this.#onStop(),
    })
  }

  /** Who this bot is, once started. */
  get me(): User | undefined {
    return this.#me
  }

  /** Current lifecycle state. */
  get state(): string {
    return this.#lifecycle.state
  }

  /** Register dispatch middleware. */
  use(middleware: Middleware<Context>, options?: UseOptions): this {
    this.#dispatcher.use(middleware, options)
    return this
  }

  /** Register a handler for one or more update kinds, or a filter. */
  on(match: string | readonly string[] | AnyFilter, handler: Handler<Context>): this {
    this.#dispatcher.on(match, handler)
    return this
  }

  /** Register a handler that runs once. */
  once(match: string | readonly string[] | AnyFilter, handler: Handler<Context>): this {
    this.#dispatcher.once(match, handler)
    return this
  }

  /** Remove a handler. */
  off(handler: Handler<Context>): boolean {
    return this.#dispatcher.off(handler)
  }

  /**
   * Register a command handler.
   *
   * `/start` matches whichever bot is running; `/start@thisbot` matches only
   * when the suffix names us, and `/start@otherbot` never does. Getting that
   * wrong means answering messages addressed to a different bot, which is the
   * most common mistake in hand-rolled command handling.
   *
   * A regex form matches against the command name.
   */
  command(match: string | RegExp, handler: Handler<CommandContext>): this {
    this.#dispatcher.on(MESSAGE_KINDS, (context) => {
      const parsed = parseCommand(context.text)
      if (parsed === undefined) return
      if (!commandMatches(parsed, match)) return
      if (!addressedToUs(parsed, this.#me?.username)) return

      // Derived, not mutated: assigning onto the shared context would leave a
      // `command` property visible to every later handler for this update,
      // including ones that have nothing to do with commands.
      const withCommand: CommandContext = Object.create(context, {
        command: { value: parsed, enumerable: true },
      })

      return handler(withCommand)
    })

    return this
  }

  /** Register a handler for an exact text match, or a pattern. */
  text(match: string | RegExp, handler: Handler<Context>): this {
    this.#dispatcher.on(MESSAGE_KINDS, (context) => {
      const value = context.text
      if (value === undefined) return

      const matched = typeof match === 'string' ? value === match : match.test(value)
      if (!matched) return

      return handler(context)
    })

    return this
  }

  /** Register a handler for callback data, exact or by pattern. */
  callback(match: string | RegExp, handler: Handler<Context>): this {
    this.#dispatcher.on('callback_query', (context) => {
      const value = context.data
      if (value === undefined) return

      const matched = typeof match === 'string' ? value === match : match.test(value)
      if (!matched) return

      return handler(context)
    })

    return this
  }

  /**
   * Register an error handler.
   *
   * An error from a handler or from middleware reaches every registered
   * catcher, and the bot keeps serving. With none registered, errors are
   * logged and dispatch continues — a single malformed update must not take
   * down every conversation a busy bot is handling.
   */
  catch(handler: (error: unknown, context: Context) => unknown): this {
    this.#dispatcher.catch(handler)
    return this
  }

  /** Install a plugin. Installation is deferred until `start()`. */
  extend(plugin: Plugin<string, unknown, Bot>): this {
    this.#plugins.add(plugin)
    return this
  }

  /** Contribute a lazily-computed member to every context. */
  extendContext(owner: string, key: string, value: (context: object) => unknown): this {
    this.#extender.add({ owner, key, value })
    return this
  }

  /**
   * Feed one raw update through the pipeline.
   *
   * Public so a webhook adapter, a test, or a replay tool can drive the same
   * path polling does — there is no second, simplified route.
   */
  async handleUpdate(update: Update): Promise<void> {
    const normalized = normalizeUpdate(update, this.#log)

    const context = this.#extender.apply(
      createContext({
        normalized,
        api: this.api,
        log: this.#log.child(normalized.kind, { updateId: normalized.updateId }),
      }),
    )

    await this.#dispatcher.dispatch(context)
  }

  /**
   * Resolve who this bot is, without starting polling.
   *
   * `start()` does this already, but a webhook-only bot never calls it — and
   * command matching needs the username to tell `/start@thisbot` from
   * `/start@otherbot`. Idempotent.
   */
  async identify(): Promise<User> {
    this.#me ??= await this.api.getMe()
    return this.#me
  }

  /** What the download helpers need from this bot. */
  get #downloadDeps() {
    return {
      api: this.api,
      client: this.#client,
      ...(this.#options.local === undefined ? {} : { local: this.#options.local }),
    }
  }

  /**
   * Download a file into memory.
   *
   * Accepts a `file_id`, a photo size array, or any object carrying a
   * `file_id` — the shapes a handler already has.
   */
  async download(target: DownloadTarget): Promise<Uint8Array> {
    return download(this.#downloadDeps, target)
  }

  /** Open a byte stream, for files too large to hold in memory. */
  async downloadStream(target: DownloadTarget): Promise<ReadableStream<Uint8Array>> {
    return downloadStream(this.#downloadDeps, target)
  }

  /** Download straight to disk, without buffering. */
  async downloadToFile(path: string, target: DownloadTarget): Promise<void> {
    return downloadToFile(this.#downloadDeps, path, target)
  }

  /**
   * Resolve a file's download URL.
   *
   * The result contains the bot token, because Telegram's file endpoint
   * requires it. Treat it as a credential.
   */
  async fileUrl(target: DownloadTarget): Promise<string> {
    return getFileUrl(this.#downloadDeps, target)
  }

  /** A webhook handler wired to this bot. */
  webhookHandler(options: Omit<WebhookOptions, 'onUpdate'> = {}): WebhookHandler {
    return createWebhookHandler({
      ...options,
      log: options.log ?? this.#log,
      onUpdate: (update) => this.handleUpdate(update),
      track: (work) => {
        this.#lifecycle.track(work)
      },
    })
  }

  /** Start the bot and begin polling. */
  async start(options: StartOptions = {}): Promise<void> {
    this.#startOptions = options
    await this.#lifecycle.start()
  }

  /** Stop polling, drain in-flight updates, and shut down. */
  async stop(options: { timeout?: number } = {}): Promise<void> {
    await this.#lifecycle.stop(options)
  }

  #startOptions: StartOptions = {}

  /** Resolve the subscription set from configuration or registered handlers. */
  #resolveAllowedUpdates(): readonly string[] | undefined {
    const configured = this.#options.allowedUpdates

    if (configured === undefined) return undefined
    if (configured !== 'auto') return configured

    const coverage = this.#dispatcher.collectKinds()

    // An opaque registration could match anything, so narrowing the
    // subscription would silently drop updates a handler wanted.
    if (coverage.opaque || coverage.kinds.size === 0) return undefined

    return [...coverage.kinds].sort()
  }

  async #onStart(): Promise<void> {
    await this.#plugins.install(this)

    const me = await this.identify()
    this.#log.info('signed in', { username: me.username, id: me.id })

    if (!this.#dispatcher.hasCatcher) {
      // Said once, at start: errors are logged and dispatch continues, which
      // is safe but easy to miss if nobody is reading logs.
      this.#log.warn(
        'no error handler registered; handler errors will be logged and swallowed. Use bot.catch() to handle them',
      )
    }

    const allowedUpdates = this.#resolveAllowedUpdates()

    this.#polling = createPolling({
      api: this.api,
      log: this.#log,
      ...(allowedUpdates === undefined ? {} : { allowedUpdates }),
      ...(this.#startOptions.dropPending === true ? { dropPending: true } : {}),
      onUpdate: (update) => this.#lifecycle.track(this.handleUpdate(update)),
      onError: (error) => {
        this.#log.error('polling error', { error })
      },
      onFatal: (error) => {
        // The bot is no longer receiving updates, so reporting while staying
        // in the `running` state would leave `bot.state` claiming something
        // untrue. Deferred off the polling loop's own stack: stopping from
        // inside the loop that is being stopped is re-entrant.
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

  async #onStop(): Promise<void> {
    await this.#polling?.stop()
    this.#polling = undefined
  }
}
