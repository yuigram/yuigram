/**
 * The caller: an account that lives somewhere else.
 *
 * A {@link RemoteAccount} has the account's methods and none of its state. Each
 * method call crosses to the host, runs on the real account there, and its
 * result crosses back — so `sendText`, `history` and `signIn` behave as they do
 * in-process, while the connections, the keys and the peers stay in the host.
 *
 * **What crosses, and as what.**
 *
 * - Data crosses as data. bigint, byte arrays, dates, maps and sets survive
 *   structured cloning, and a TL value is nothing but those.
 * - A view — `MessageView`, `UserView` and the rest — crosses as the raw value
 *   it reads and is rebuilt here, which is faithful because a view is a reading
 *   of its value and nothing more.
 * - A function crosses only where the method declares one — a sign-in prompt,
 *   an upload's reader, a download's sink. It stays here; the host calls it back
 *   through the port while the call that took it is running.
 * - An iterable — `history`, `members`, `downloadIterable` — crosses as a stream
 *   this side pulls with bounded credit, so a consumer that stops reading stops
 *   the host reading too.
 * - An object with methods of its own — a streaming draft, an open mini app, a
 *   takeout — crosses as a handle whose methods are called by name.
 * - An `AbortSignal` is taken out of the arguments and replaced on the host by
 *   one that aborting here fires, so cancelling stops the operation itself and
 *   not just the wait for it.
 *
 * **What runs here.** Handlers. `on`, `use` and `catch` register code on this
 * side, and the host forwards the account's updates; a slow or failing handler
 * here is this caller's alone. The raw API, `reach` and `withParams` are built
 * here over the host's raw call, so every TL method is reachable without being
 * listed anywhere.
 *
 * **When the host goes.** A host that stops answering pings, or whose worker
 * exits, fails every call waiting on it with {@link HostUnavailableError}
 * rather than leaving it waiting.
 */

import {
  CancelledError,
  createLogger,
  Dispatcher,
  type ErrorHandler,
  type Handler,
  LifecycleError,
  type Logger,
  type Middleware,
  type UseOptions,
} from '@yuigram/core'
import type { Account } from '../account.js'
import { type MtprotoApi, rawApi } from '../api.js'
import type { DownloadRequest } from '../files/download.js'
import { isStaleReference } from '../files/references.js'
import type { NodeReadable, StreamOptions } from '../files/streams.js'
import { streamOf } from '../files/streams.js'
import type { Reach } from '../network/signin.js'
import { type MtprotoContext, mtprotoContext } from '../normalize/context.js'
import { type BoundCalls, type CallDefaults, withParams } from '../session/operations.js'
import type { PeerKind, PeerRecord, PeerStore } from '../storage/peers.js'
import type { TlValue } from '../tl/index.js'
import type { Endpoint } from './endpoints.js'
import type { HostInfo } from './host.js'
import {
  CALLBACKS,
  CALLS,
  type CallbackName,
  type CallName,
  GETTERS,
  type GetterName,
  HANDLES,
  STREAMS,
  type StreamName,
} from './methods.js'
import {
  decodeValue,
  deserializeError,
  encodeValue,
  type HostMessage,
  HostUnavailableError,
  PROTOCOL_VERSION,
  readHostMessage,
  serializeError,
  token,
} from './protocol.js'

/* -------------------------------------------------------------------------- */
/* The typed surface                                                           */
/* -------------------------------------------------------------------------- */

type Real = Account<unknown>
type Method<K extends keyof Real> = Real[K] extends (...args: infer A) => infer R
  ? { readonly args: A; readonly result: R }
  : never
type Settled<R> = R extends Promise<infer T> ? T : R
type Element<R> = R extends AsyncIterable<infer T> ? T : never

/** A streaming draft held by the host. */
export interface RemoteDraft<Content> {
  readonly key: bigint
  readonly stopped: boolean
  write(content: Content): Promise<void>
  stop(): Promise<void>
}

/** An open mini app held by the host, prolonged there until it is closed. */
export interface RemoteWebView {
  readonly url: string
  readonly queryId?: bigint
  readonly fullscreen: boolean
  readonly open: boolean
  close(): Promise<void>
}

/** An export held by the host. */
export interface RemoteTakeout {
  readonly id: bigint
  call(query: TlValue): Promise<TlValue>
  finish(succeeded: boolean): Promise<void>
}

/**
 * The account's methods, as a caller reaches them.
 *
 * Derived from the account's own signatures, so a parameter changing there
 * changes here. What differs is only what has to: every result is a promise,
 * an iterable is an async generator pulled across the port, and a handle's
 * methods return promises because they cross too.
 */
export type RemoteMethods = {
  [K in CallName | CallbackName]: (
    ...args: Method<K>['args']
  ) => Promise<Settled<Method<K>['result']>>
} & {
  [K in StreamName]: (
    ...args: Method<K>['args']
  ) => AsyncGenerator<Element<Method<K>['result']>, void, undefined>
} & {
  createStreamingDraft(
    ...args: Method<'createStreamingDraft'>['args']
  ): Promise<RemoteDraft<Parameters<Settled<Method<'createStreamingDraft'>['result']>['write']>[0]>>
  createRichStreamingDraft(
    ...args: Method<'createRichStreamingDraft'>['args']
  ): Promise<
    RemoteDraft<Parameters<Settled<Method<'createRichStreamingDraft'>['result']>['write']>[0]>
  >
  openWebview(...args: Method<'openWebview'>['args']): Promise<RemoteWebView>
  initTakeoutSession(...args: Method<'initTakeoutSession'>['args']): Promise<RemoteTakeout>
  stayOnline(): Promise<() => Promise<void>>
  watchChat(...args: Method<'watchChat'>['args']): Promise<() => Promise<void>>
}

/** What happened to this caller's standing with the host. */
export type RemoteEvent =
  /** The account was stopped — by this caller, another, or the host. */
  | { readonly kind: 'stopped' }
  /** The host let this caller go for going quiet. */
  | { readonly kind: 'expired' }
  /** The host let this caller go for falling too far behind on updates. */
  | { readonly kind: 'lagged'; readonly unacknowledged: number }
  /** The host stopped answering, or its worker exited. */
  | { readonly kind: 'host-lost'; readonly reason: string }

/** How to attach. */
export interface AttachOptions {
  /** Which account on the host. The host makes it the first time anyone asks. */
  readonly account: string
  /** Receive the account's updates. On by default. */
  readonly updates?: boolean
  /**
   * What the host's factory may restore the account from — a session string.
   * Used only if this caller is the one that makes the account; never logged.
   */
  readonly restore?: string
  /** How often to tell the host this caller is alive, in ms. */
  readonly pingEvery?: number
  /** How long the host may go without a word before it counts as gone, in ms. */
  readonly hostTimeout?: number
  /** How long to wait for the host to answer `hello` and `attach`, in ms. */
  readonly attachTimeout?: number
  /** Acknowledge handled updates in batches of this many. */
  readonly ackEvery?: number
  /** How many stream items to ask for at a time. */
  readonly streamCredit?: number
  /**
   * Tell the host this caller is leaving when the page is hidden for good.
   *
   * On by default where there is a page. Without it, a closed tab is noticed
   * only when its pings stop — up to a minute later.
   */
  readonly releaseOnPageHide?: boolean
  readonly log?: Logger
  /** Timers, supplied so tests need not wait in real time. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
  readonly now?: () => number
}

/** A call waiting for its answer. */
interface Waiting {
  resolve(value: unknown): void
  reject(error: unknown): void
  /** Functions this call handed over, by token. */
  readonly callbacks: Map<number, (...args: unknown[]) => unknown>
  readonly cleanup: () => void
}

/** A stream this side is pulling. */
interface Pulling {
  readonly queue: unknown[]
  done: boolean
  failure: unknown
  wake: (() => void) | undefined
  outstanding: number
}

const defaultSchedule = (run: () => void, delayMs: number): (() => void) => {
  const timer = setTimeout(run, delayMs) as unknown as { unref?: () => void }
  timer.unref?.()

  return () => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>)
}

/** A connection identifier: unguessable, so one caller cannot speak for another. */
function connectionId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)

  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/* -------------------------------------------------------------------------- */
/* The caller                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * An account held by a worker host, reached from here.
 *
 * Made by {@link attachAccount}. The methods of {@link RemoteMethods} are on it
 * too, installed from the method table rather than written out one by one.
 */
export class RemoteAccount {
  /** The account this caller is attached to, as the host names it. */
  readonly name: string
  /** This caller's connection, as the host knows it. */
  readonly connection: string
  /** The TL surface, every method of it, through the host's raw call. */
  readonly api: MtprotoApi

  readonly #endpoint: Endpoint
  readonly #options: AttachOptions
  readonly #log: Logger
  readonly #schedule: (run: () => void, delayMs: number) => () => void
  readonly #now: () => number
  readonly #waiting = new Map<number, Waiting>()
  readonly #streams = new Map<number, Pulling>()
  readonly #listeners = new Set<(event: RemoteEvent) => void>()
  readonly #dispatcher = new Dispatcher<MtprotoContext>()
  readonly #cleanups: (() => void)[] = []
  #nextId = 1
  #lastHeard: number
  #closed: Error | undefined
  /** Updates handled, and how far the contiguous run of handled ones reaches. */
  readonly #handled = new Set<number>()
  #contiguous = 0
  #acknowledged = 0

  constructor(endpoint: Endpoint, options: AttachOptions, connection: string) {
    this.#endpoint = endpoint
    this.#options = options
    this.#log = options.log ?? createLogger()
    this.#schedule = options.schedule ?? defaultSchedule
    this.#now = options.now ?? Date.now
    this.#lastHeard = this.#now()
    this.name = options.account
    this.connection = connection
    this.api = rawApi(async (query) => (await this.#call('@call', [query])) as TlValue)

    for (const name of [...CALLS, ...Object.keys(CALLBACKS)]) {
      this.#install(name, (...args) => this.#call(name, args))
    }
    for (const name of STREAMS) {
      this.#install(name, (...args) => this.#pullStream(name, args))
    }
    for (const name of Object.keys(HANDLES)) {
      this.#install(name, (...args) => this.#call(name, args))
    }
  }

  #install(name: string, run: (...args: unknown[]) => unknown): void {
    Object.defineProperty(this, name, { value: run, enumerable: false, configurable: false })
  }

  /* ------------------------------------------------------------------------ */
  /* Opening                                                                   */
  /* ------------------------------------------------------------------------ */

  /** Say hello, attach, and start the liveness checks. */
  async open(): Promise<void> {
    this.#cleanups.push(
      this.#endpoint.listen((data) => {
        void this.#receive(data)
      }),
    )
    this.#cleanups.push(
      this.#endpoint.onGone((reason) => {
        this.#lose(reason)
      }),
    )

    await this.#handshake('hello', {
      type: 'hello',
      connection: this.connection,
      v: PROTOCOL_VERSION,
    })
    await this.#handshake('attach', {
      type: 'attach',
      connection: this.connection,
      account: this.#options.account,
      updates: this.#options.updates ?? true,
      ...(this.#options.restore === undefined ? {} : { restore: this.#options.restore }),
    })

    this.#startPinging()
    this.#watchPageHide()
  }

  /** One of the two opening exchanges, bounded so a missing host fails rather than hangs. */
  async #handshake(stage: 'hello' | 'attach', message: object): Promise<void> {
    const timeout = this.#options.attachTimeout ?? 10_000

    await new Promise<void>((resolve, reject) => {
      const cancel = this.#schedule(() => {
        this.#opening = undefined
        reject(new HostUnavailableError(`the host did not answer '${stage}' within ${timeout}ms`))
      }, timeout)

      this.#opening = {
        stage,
        settle: (error) => {
          cancel()
          this.#opening = undefined
          if (error === undefined) resolve()
          else reject(error)
        },
      }
      this.#endpoint.post(message)
    })
  }

  #opening: { stage: 'hello' | 'attach'; settle(error?: Error): void } | undefined

  /* ------------------------------------------------------------------------ */
  /* Receiving                                                                 */
  /* ------------------------------------------------------------------------ */

  async #receive(data: unknown): Promise<void> {
    const message = readHostMessage(data)
    // Another caller's traffic on a shared port, or not this protocol at all.
    if (message === undefined || message.connection !== this.connection) return

    this.#lastHeard = this.#now()

    switch (message.type) {
      case 'welcome':
        if (this.#opening?.stage === 'hello') this.#opening.settle()
        break
      case 'mismatch':
        this.#opening?.settle(
          new LifecycleError(
            `the host speaks protocol version ${message.v} and this caller ${PROTOCOL_VERSION}`,
          ),
        )
        break
      case 'attached':
        if (this.#opening?.stage === 'attach') this.#opening.settle()
        break
      case 'result':
        this.#settle(message.id, message.value)
        break
      case 'failure':
        if (message.id === 0 && this.#opening?.stage === 'attach') {
          this.#opening.settle(deserializeError(message.error))
          break
        }
        this.#fail(message.id, deserializeError(message.error))
        break
      case 'callback':
        await this.#callBack(message)
        break
      case 'item':
      case 'end':
      case 'stream-failure':
        this.#streamMessage(message)
        break
      case 'update':
        await this.#deliver(message.seq, message.update)
        break
      case 'stopped':
        this.#emit({ kind: 'stopped' })
        break
      case 'expired':
        this.#end(new LifecycleError('the host let this caller go for going quiet'))
        this.#emit({ kind: 'expired' })
        break
      case 'lagged':
        this.#end(new LifecycleError('the host let this caller go for falling behind on updates'))
        this.#emit({ kind: 'lagged', unacknowledged: message.unacknowledged })
        break
      case 'protocol-error':
        this.#log.warn('the host refused a message', { reason: message.reason })
        break
      default:
        break
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Calling                                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * Call a method on the host.
   *
   * Functions in the arguments are allowed only at the method's declared slots;
   * signals anywhere in the first few levels are taken out and wired to
   * `abort`, which the host turns back into a signal of its own.
   */
  async #call(method: string, args: readonly unknown[]): Promise<unknown> {
    if (this.#closed !== undefined) throw this.#closed

    const id = this.#nextId++
    const callbacks = new Map<number, (...args: unknown[]) => unknown>()
    const slots = new Set<string>(
      ((CALLBACKS as Readonly<Record<string, readonly string[]>>)[method] ?? []).map(
        (slot) =>
          `value[${slot.split('.')[0]}]${slot
            .split('.')
            .slice(1)
            .map((part) => `.${part}`)
            .join('')}`,
      ),
    )

    const signals: { readonly path: string; readonly signal: AbortSignal }[] = []
    const stripped = stripSignals(args, signals)
    const encoded = encodeValue(stripped, {
      callback: (fn, path) => {
        if (!slots.has(path)) {
          throw new LifecycleError(`${path} is not a place '${method}' takes a function`)
        }
        const tokenId = this.#nextId++
        callbacks.set(tokenId, fn as (...args: unknown[]) => unknown)

        return token('callback', tokenId)
      },
    }) as unknown[]

    return await new Promise<unknown>((resolve, reject) => {
      const aborts = signals.map(({ signal }) => {
        const abort = (): void => {
          this.#endpoint.post({ type: 'abort', connection: this.connection, id })
          this.#fail(id, new CancelledError('the call was cancelled'))
        }
        if (signal.aborted) queueMicrotask(abort)
        else signal.addEventListener('abort', abort, { once: true })

        return () => signal.removeEventListener('abort', abort)
      })

      this.#waiting.set(id, {
        resolve,
        reject,
        callbacks,
        cleanup: () => {
          for (const stop of aborts) stop()
        },
      })

      try {
        this.#endpoint.post({
          type: 'call',
          connection: this.connection,
          id,
          method,
          args: encoded,
          ...(signals.length === 0 ? {} : { signals: signals.map((one) => one.path) }),
        })
      } catch (error) {
        this.#fail(id, error)
      }
    })
  }

  #settle(id: number, value: unknown): void {
    const waiting = this.#waiting.get(id)
    if (waiting === undefined) return

    this.#waiting.delete(id)
    waiting.cleanup()

    try {
      waiting.resolve(
        decodeValue(value, {
          stream: (stream) => stream,
          handle: (handle, kind, fields) => this.#handle(handle, kind, fields),
        }),
      )
    } catch (error) {
      waiting.reject(error)
    }
  }

  #fail(id: number, error: unknown): void {
    const waiting = this.#waiting.get(id)
    if (waiting === undefined) return

    this.#waiting.delete(id)
    waiting.cleanup()
    waiting.reject(error)
  }

  /** Run a function this side handed over, because the host asked. */
  async #callBack(message: Extract<HostMessage, { type: 'callback' }>): Promise<void> {
    const fn = [...this.#waiting.values()]
      .map((waiting) => waiting.callbacks.get(message.callback))
      .find((found) => found !== undefined)

    try {
      if (fn === undefined) throw new CancelledError('that callback belongs to a call that ended')

      const value = await fn(...(decodeValue(message.args) as unknown[]))
      this.#endpoint.post({
        type: 'callback-result',
        connection: this.connection,
        id: message.id,
        ok: true,
        value: encodeValue(value),
      })
    } catch (error) {
      this.#endpoint.post({
        type: 'callback-result',
        connection: this.connection,
        id: message.id,
        ok: false,
        error: serializeError(error),
      })
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Streams                                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * An async generator over a stream the host holds.
   *
   * Credit is asked for in batches as the local queue drains, so at most one
   * batch waits here and the host reads no further ahead than that. Leaving the
   * loop early closes the stream on the host, which returns the host's own
   * iterator — the same thing leaving a loop does in-process.
   */
  async *#pullStream(
    method: string,
    args: readonly unknown[],
  ): AsyncGenerator<unknown, void, undefined> {
    const id = (await this.#call(method, args)) as number
    const credit = this.#options.streamCredit ?? 8
    const state: Pulling = {
      queue: [],
      done: false,
      failure: undefined,
      wake: undefined,
      outstanding: 0,
    }
    this.#streams.set(id, state)

    const ask = (): void => {
      state.outstanding += credit
      this.#endpoint.post({ type: 'pull', connection: this.connection, stream: id, credit })
    }

    let finished = false
    try {
      ask()
      for (;;) {
        while (state.queue.length === 0 && !state.done && state.failure === undefined) {
          await new Promise<void>((resolve) => {
            state.wake = resolve
          })
        }

        if (state.queue.length > 0) {
          const value = state.queue.shift()
          if (state.outstanding === 0 && state.queue.length === 0 && !state.done) ask()
          yield decodeValue(value)
          continue
        }

        if (state.failure !== undefined) throw state.failure

        finished = true

        return
      }
    } finally {
      this.#streams.delete(id)
      if (!finished && state.failure === undefined && this.#closed === undefined) {
        await this.#call('@closeStream', [id]).catch(() => undefined)
      }
    }
  }

  #streamMessage(message: Extract<HostMessage, { type: 'item' | 'end' | 'stream-failure' }>): void {
    const state = this.#streams.get(message.stream)
    if (state === undefined) return

    if (message.type === 'item') {
      state.queue.push(message.value)
      state.outstanding = Math.max(0, state.outstanding - 1)
    } else if (message.type === 'end') {
      state.done = true
    } else {
      state.failure = deserializeError(message.error)
    }

    const wake = state.wake
    state.wake = undefined
    wake?.()
  }

  /* ------------------------------------------------------------------------ */
  /* Handles                                                                   */
  /* ------------------------------------------------------------------------ */

  /** A handle's stand-in: its fields as last reported, and its methods by name. */
  #handle(id: number, kind: string, fields: Readonly<Record<string, unknown>>): unknown {
    const current: Record<string, unknown> = { ...fields }
    const invoke = async (method: string, args: readonly unknown[]): Promise<unknown> => {
      const answer = (await this.#call('@handle', [id, method, ...args])) as {
        readonly value: unknown
        readonly fields: Readonly<Record<string, unknown>>
      }
      Object.assign(current, answer.fields)

      return answer.value
    }

    if (kind === 'stop') return async () => void (await invoke('call', []))

    const methods: Readonly<Record<string, readonly string[]>> = {
      draft: ['write', 'stop'],
      webview: ['close'],
      takeout: ['call', 'finish'],
    }
    for (const method of methods[kind] ?? []) {
      current[method] = async (...args: unknown[]) => await invoke(method, args)
    }

    return current
  }

  /* ------------------------------------------------------------------------ */
  /* Updates                                                                   */
  /* ------------------------------------------------------------------------ */

  /** Handle one update here, then acknowledge it. */
  async #deliver(seq: number, update: unknown): Promise<void> {
    try {
      const context = mtprotoContext(update as TlValue, {
        client: this,
        log: this.#log,
        actions: {
          peers: this.#peers,
          invoke: async (query) => (await this.#call('@call', [query])) as TlValue,
          random: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
          fetch: async (request, references) => await this.#fetch(request, references),
        },
      })

      await this.#dispatcher.dispatch(context)
    } catch (error) {
      // Dispatch reports handler errors itself. What reaches here is an update
      // this side could not read, which is this caller's problem alone.
      this.#log.warn('an update could not be handled here', { error })
    } finally {
      this.#handledUpTo(seq)
    }
  }

  #handledUpTo(seq: number): void {
    this.#handled.add(seq)
    while (this.#handled.has(this.#contiguous + 1)) {
      this.#contiguous += 1
      this.#handled.delete(this.#contiguous)
    }

    if (this.#contiguous - this.#acknowledged >= (this.#options.ackEvery ?? 16)) this.#ack()
  }

  #ack(): void {
    if (this.#contiguous === this.#acknowledged || this.#closed !== undefined) return

    this.#acknowledged = this.#contiguous
    this.#endpoint.post({ type: 'ack', connection: this.connection, seq: this.#acknowledged })
  }

  /** The peer store a context reads, answered by the host's own resolution. */
  readonly #peers: PeerStore = {
    byId: async (kind: PeerKind, id: bigint) =>
      (await this.#call('@peer', [kind, id])) as PeerRecord | undefined,
    byUsername: async () => undefined,
    byPhone: async () => undefined,
    // The host keeps the peers; what this side learns it learns through the
    // host, which harvests every answer itself.
    save: async () => false,
    forget: async () => {},
  }

  /** A whole file, refreshing a refused reference once through what issued it. */
  async #fetch(
    request: DownloadRequest,
    references: { current(): TlValue; refresh(used: Uint8Array): Promise<void> },
  ): Promise<Uint8Array> {
    for (let attempt = 0; ; attempt += 1) {
      const location = references.current()

      try {
        return (await this.#call('download', [{ ...request, location }])) as Uint8Array
      } catch (error) {
        const used = location['file_reference']
        if (attempt > 0 || !isStaleReference(error) || !(used instanceof Uint8Array)) throw error

        await references.refresh(used)
      }
    }
  }

  /** Handle events of a kind, here. */
  on(kind: string | readonly string[], handler: Handler<MtprotoContext>): this {
    this.#dispatcher.on(kind, handler)

    return this
  }

  /** Handle new messages, here. */
  onMessage(handler: Handler<MtprotoContext>): this {
    return this.on('message', handler)
  }

  /** Run middleware around this caller's handlers. */
  use(middleware: Middleware<MtprotoContext>, options?: UseOptions): this {
    this.#dispatcher.use(middleware, options)

    return this
  }

  /** Be told about anything a handler here threw. */
  catch(handler: ErrorHandler<MtprotoContext>): this {
    this.#dispatcher.catch(handler)

    return this
  }

  /* ------------------------------------------------------------------------ */
  /* Built here                                                                */
  /* ------------------------------------------------------------------------ */

  /** Make a call on a particular datacenter, through the host. */
  get reach(): Reach {
    return (dcId: number) => ({
      invoke: async (query: TlValue) => (await this.#call('@callOn', [dcId, query])) as TlValue,
    })
  }

  /** This account with call defaults bound in, through the host. */
  withParams(defaults: CallDefaults): BoundCalls {
    return withParams(
      {
        call: async (query, options) => {
          const timeout = options?.timeout
          const signal = options?.signal

          return (await this.#call('@call', [
            query,
            {
              ...(timeout === undefined ? {} : { timeout }),
              ...(signal === undefined ? {} : { signal }),
            },
          ])) as TlValue
        },
      },
      defaults,
    )
  }

  /** A file as a `ReadableStream`, pulled across the port. */
  async downloadAsStream(
    request: DownloadRequest & StreamOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const { highWaterMark, ...rest } = request

    return streamOf(
      (this as unknown as RemoteMethods).downloadIterable(rest) as AsyncGenerator<
        Uint8Array,
        void,
        undefined
      >,
      highWaterMark,
    )
  }

  /** A file as a Node `Readable`, pulled across the port. Only where Node is. */
  async downloadAsNodeStream(request: DownloadRequest & StreamOptions): Promise<NodeReadable> {
    const { highWaterMark, ...rest } = request
    const { readableFrom } = await import('../files/node-stream.js')

    return await readableFrom(
      (this as unknown as RemoteMethods).downloadIterable(rest) as AsyncGenerator<
        Uint8Array,
        void,
        undefined
      >,
      highWaterMark,
    )
  }

  /** Close a mini app, which is the handle's own method. */
  async closeWebview(view: RemoteWebView): Promise<void> {
    await view.close()
  }

  /** Read one of the account's state properties on the host. */
  async read<K extends GetterName>(name: K): Promise<Real[K]> {
    if (!(GETTERS as readonly string[]).includes(name)) {
      throw new LifecycleError(`'${name}' is not something a caller may read`)
    }

    return (await this.#call('@get', [name])) as Real[K]
  }

  /** What the host reports about itself. */
  async hostInfo(): Promise<HostInfo> {
    return (await this.#call('@info', [])) as HostInfo
  }

  /* ------------------------------------------------------------------------ */
  /* Liveness and leaving                                                      */
  /* ------------------------------------------------------------------------ */

  /** Be told what happens to this caller's standing with the host. */
  onEvent(listener: (event: RemoteEvent) => void): () => void {
    this.#listeners.add(listener)

    return () => {
      this.#listeners.delete(listener)
    }
  }

  #emit(event: RemoteEvent): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(event)
      } catch (error) {
        this.#log.warn('a listener threw', { error })
      }
    }
  }

  #startPinging(): void {
    const every = this.#options.pingEvery ?? 10_000
    const timeout = this.#options.hostTimeout ?? 30_000

    const round = (): void => {
      if (this.#closed !== undefined) return

      if (this.#now() - this.#lastHeard > timeout) {
        this.#lose(`the host has not answered for ${timeout}ms`)

        return
      }

      this.#ack()
      this.#endpoint.post({ type: 'ping', connection: this.connection })
      cancel = this.#schedule(round, every)
    }

    let cancel = this.#schedule(round, every)
    this.#cleanups.push(() => cancel())
  }

  /** Tell the host when the page is going away, so it does not wait for pings to stop. */
  #watchPageHide(): void {
    const page = globalThis as {
      addEventListener?: (type: string, listener: (event: { persisted?: boolean }) => void) => void
      removeEventListener?: (
        type: string,
        listener: (event: { persisted?: boolean }) => void,
      ) => void
      document?: unknown
    }
    if (this.#options.releaseOnPageHide === false) return
    if (page.document === undefined || typeof page.addEventListener !== 'function') return

    const hidden = (event: { persisted?: boolean }): void => {
      // A page kept in the back/forward cache may come back, and should find
      // its caller still attached.
      if (event.persisted === true) return
      void this.detach()
    }
    page.addEventListener('pagehide', hidden)
    this.#cleanups.push(() => page.removeEventListener?.('pagehide', hidden))
  }

  #lose(reason: string): void {
    if (this.#closed !== undefined) return

    this.#end(new HostUnavailableError(reason))
    this.#emit({ kind: 'host-lost', reason })
  }

  /** Fail everything waiting, and stop every timer and listener this caller set up. */
  #end(error: Error): void {
    if (this.#closed !== undefined) return
    this.#closed = error

    for (const id of [...this.#waiting.keys()]) this.#fail(id, error)
    for (const state of this.#streams.values()) {
      state.failure = error
      state.wake?.()
    }
    for (const cleanup of this.#cleanups.splice(0)) cleanup()
    this.#opening?.settle(error)
  }

  /**
   * Leave the host.
   *
   * This caller's calls, callbacks, streams and handles end on both sides;
   * other callers attached to the same account are untouched, and the account
   * itself keeps running unless the host's policy says otherwise.
   */
  async detach(): Promise<void> {
    if (this.#closed !== undefined) return

    this.#ack()
    this.#endpoint.post({ type: 'release', connection: this.connection })
    this.#end(new CancelledError('this caller detached'))
  }
}

/**
 * Take `AbortSignal`s out of arguments, recording where each was.
 *
 * Looked for within the first three levels, which is where every method that
 * takes one has it — an options object, or an options object's field.
 */
function stripSignals(
  args: readonly unknown[],
  found: { path: string; signal: AbortSignal }[],
): unknown[] {
  const walk = (value: unknown, path: string, depth: number): unknown => {
    if (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal) {
      found.push({ path, signal: value })

      return undefined
    }
    if (depth >= 3 || value === null || typeof value !== 'object' || Array.isArray(value)) {
      return value
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return value

    const copy: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const next = walk(item, `${path}.${key}`, depth + 1)
      if (next !== undefined || item === undefined) copy[key] = next
    }

    return copy
  }

  return args.map((arg, index) => walk(arg, String(index), 0))
}

/** The whole caller: the class and the methods installed on it. */
export type AttachedAccount = RemoteAccount & RemoteMethods

/**
 * Attach to an account a worker host holds.
 *
 * ```ts
 * const account = await attachAccount(workerEndpoint(worker), { account: 'main' })
 * await account.connect()
 * const me = await account.me()
 * ```
 *
 * Resolves once the host has greeted this caller and made or found the
 * account. Rejects if the host speaks another protocol version, cannot make the
 * account, or does not answer at all.
 */
export async function attachAccount(
  endpoint: Endpoint,
  options: AttachOptions,
): Promise<AttachedAccount> {
  const account = new RemoteAccount(endpoint, options, connectionId())
  await account.open()

  return account as AttachedAccount
}

export { HostUnavailableError }
