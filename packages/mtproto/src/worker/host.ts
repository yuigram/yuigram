// SPDX-License-Identifier: MIT

/**
 * The host: where the accounts actually are.
 *
 * A worker running this owns real {@link Account} instances — their
 * connections, their authorization keys, their peer stores and their place in
 * the update stream — and serves them to however many callers attach. A caller
 * never holds any of that. It holds a port, and the account crosses it one
 * call, one update and one callback at a time.
 *
 * ```
 *   page A ──┐                       ┌── account "main"  ──> datacenter
 *            ├── port ── host ───────┤
 *   page B ──┘                       └── account "other" ──> datacenter
 * ```
 *
 * **Ownership.** The application's worker script creates the host and says how
 * to make an account; the host makes each one the first time a caller attaches
 * to it and keeps it for every caller after that. Two pages attaching to the
 * same account share one account and one set of connections — nothing is
 * connected twice, because there is only one of it to connect.
 *
 * **Lifecycle.** Attaching does not connect. A caller connects and stops the
 * account explicitly, and stopping is the account's, not the caller's: every
 * caller attached to it is told. Detaching is the caller's alone — its calls,
 * callbacks, streams and handles end, and nobody else's do. What happens when
 * the last caller detaches is the host's policy: keep the account running for
 * the next one, or stop it.
 *
 * **Isolation.** A caller is attached to one account and reaches only that
 * one. Updates go to the callers of the account they arrived on, and nothing
 * one caller does — a slow handler, an exception, a vanished tab — reaches
 * another's processing, because each has its own port and its own window.
 */

import { CancelledError, LifecycleError, PeerError, ValidationError } from '@yuigram/core'
import type { Account, ConnectionStatus } from '../account.js'
import type { TlValue } from '../tl/index.js'
import {
  acceptSharedConnections,
  dedicatedScopeEndpoint,
  type Endpoint,
  inSharedWorker,
  type LockManagerLike,
  platformLocks,
} from './endpoints.js'
import { BYTES, GETTERS, HANDLE_KINDS, type HandleKind, shapeOf } from './methods.js'
import {
  type CallerMessage,
  decodeValue,
  encodeValue,
  ownedCopy,
  PROTOCOL_VERSION,
  readCallerMessage,
  serializeError,
  token,
} from './protocol.js'

/** What the host does when an account's last caller detaches. */
export type LastDetached = 'keep' | 'stop'

/** How a host is set up. */
export interface HostOptions {
  /**
   * Make the account a caller attached to, the first time anyone does.
   *
   * `restore` is what that first caller handed over to restore it from — a
   * session string, typically — and is passed here and nowhere else: it is not
   * logged, kept or sent back.
   */
  create(account: string, restore: string | undefined): Account | Promise<Account>
  /** What to do when an account's last caller detaches. `keep` by default. */
  onLastDetached?: LastDetached | ((account: string) => LastDetached)
  /**
   * How long a caller may go without a word before it is let go, in ms.
   *
   * Not applied to a caller whose context the host watches through a lock: the
   * lock is let go when that context is destroyed, and a hidden page whose
   * timers the browser has slowed to one a minute is still there.
   */
  expireAfter?: number
  /** How often callers are checked for that, in ms. */
  sweepEvery?: number
  /** Updates a caller may have unacknowledged before the host holds the rest. */
  window?: number
  /** Updates the host holds for one caller before letting it go. */
  backlog?: number
  /**
   * The locks through which a caller's context is watched. The runtime's own
   * where it has them; `false` to watch callers by their pings alone.
   */
  locks?: LockManagerLike | false
  /** Timers, supplied so tests need not wait in real time. */
  schedule?: (run: () => void, delayMs: number) => () => void
  now?: () => number
}

/** What a host can report about itself, for diagnostics and for tests. */
export interface HostInfo {
  readonly accounts: readonly {
    readonly id: string
    /** How many times the factory made this account. One, unless it was stopped and remade. */
    readonly created: number
    readonly callers: number
    readonly state: string
  }[]
  readonly callers: number
  readonly pendingCalls: number
  readonly pendingCallbacks: number
  readonly streams: number
  readonly handles: number
  /** Messages that were not messages of this protocol, and were dropped. */
  readonly malformed: number
  /** Callers let go so far, by what told the host they were gone. */
  readonly departures: Readonly<Record<Departure, number>>
}

/**
 * What told the host a caller was gone.
 *
 * - `detached`: the caller said so.
 * - `port-closed`: the platform reported the caller's port closed.
 * - `context-gone`: the lock the caller held was let go without a word, which
 *   is its browsing context being destroyed.
 * - `expired`: nothing was heard from it for `expireAfter`.
 * - `lagged`: it fell too far behind on updates.
 * - `host-closed`: the host itself was closed.
 */
export type Departure =
  | 'detached'
  | 'port-closed'
  | 'context-gone'
  | 'expired'
  | 'lagged'
  | 'host-closed'

/** One account the host is serving. */
interface Hosted {
  readonly id: string
  account: Account | undefined
  making: Promise<Account> | undefined
  created: number
  readonly callers: Set<Caller>
  /** Stops passing the account's connection status on. */
  unwatch: (() => void) | undefined
}

/** A call a caller is waiting on. */
interface PendingCall {
  readonly abort: AbortController
  /** Callback tokens this call issued, revoked when it settles. */
  readonly tokens: Set<number>
}

/** A callback the host is waiting on a caller to answer. */
interface PendingCallback {
  resolve(value: unknown): void
  reject(error: unknown): void
}

/** A stream a caller is pulling. */
interface OpenStream {
  readonly iterator: AsyncIterator<unknown>
  readonly bytes: boolean
  credit: number
  pumping: boolean
}

/** A handle a caller holds. */
interface OpenHandle {
  readonly kind: HandleKind
  readonly target: unknown
}

/** One caller: a connection on an endpoint. */
interface Caller {
  readonly connection: string
  readonly endpoint: Endpoint
  greeted: boolean
  hosted: Hosted | undefined
  wantsUpdates: boolean
  lastSeen: number
  readonly calls: Map<number, PendingCall>
  readonly callbacks: Map<number, PendingCallback>
  readonly streams: Map<number, OpenStream>
  readonly handles: Map<number, OpenHandle>
  /** Updates sent, updates acknowledged, and updates held back for this caller. */
  sent: number
  acknowledged: number
  readonly held: unknown[]
  released: boolean
  /** Whether a lock tells the host when this caller's context is gone. */
  witnessed: boolean
}

const defaultSchedule = (run: () => void, delayMs: number): (() => void) => {
  const timer = setTimeout(run, delayMs) as unknown as { unref?: () => void }
  // A host with nothing to do must not keep a Node worker alive on its own.
  timer.unref?.()

  return () => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>)
}

/** Serve accounts to callers across a worker boundary. */
export class WorkerHost {
  readonly #options: HostOptions
  readonly #hosted = new Map<string, Hosted>()
  readonly #callers = new Map<string, Caller>()
  readonly #schedule: (run: () => void, delayMs: number) => () => void
  readonly #now: () => number
  #malformed = 0
  readonly #departures: Record<Departure, number> = {
    detached: 0,
    'port-closed': 0,
    'context-gone': 0,
    expired: 0,
    lagged: 0,
    'host-closed': 0,
  }
  #nextId = 1
  #sweep: (() => void) | undefined
  #closed = false

  constructor(options: HostOptions) {
    this.#options = options
    this.#schedule = options.schedule ?? defaultSchedule
    this.#now = options.now ?? Date.now
  }

  /**
   * Serve callers arriving on an endpoint.
   *
   * One endpoint may carry several callers — each names its connection — so a
   * page holding two accounts through one port is two callers here.
   */
  accept(endpoint: Endpoint): () => void {
    const stopListening = endpoint.listen((data) => {
      void this.#receive(endpoint, data)
    })
    const stopWatching = endpoint.onGone(() => {
      for (const caller of [...this.#callers.values()]) {
        if (caller.endpoint === endpoint) void this.#release(caller, 'port-closed')
      }
    })

    return () => {
      stopListening()
      stopWatching()
    }
  }

  /**
   * Serve whoever connects to the worker this is running in.
   *
   * A `SharedWorker` accepts every page that connects; a dedicated worker, or
   * a Node worker's `parentPort`, is one endpoint.
   */
  listen(scope: unknown = globalThis): () => void {
    if (inSharedWorker(scope)) {
      return acceptSharedConnections(scope, (endpoint) => {
        this.accept(endpoint)
      })
    }

    return this.accept(dedicatedScopeEndpoint(scope))
  }

  /** What this host is doing, for diagnostics and tests. */
  info(): HostInfo {
    return this.#report(0)
  }

  /** The same, not counting calls that are the report being asked for. */
  #report(asking: number): HostInfo {
    const callers = [...this.#callers.values()]

    return {
      accounts: [...this.#hosted.values()].map((hosted) => ({
        id: hosted.id,
        created: hosted.created,
        callers: hosted.callers.size,
        state: hosted.account?.state ?? 'absent',
      })),
      callers: callers.length,
      pendingCalls: callers.reduce((sum, one) => sum + one.calls.size, 0) - asking,
      pendingCallbacks: callers.reduce((sum, one) => sum + one.callbacks.size, 0),
      streams: callers.reduce((sum, one) => sum + one.streams.size, 0),
      handles: callers.reduce((sum, one) => sum + one.handles.size, 0),
      malformed: this.#malformed,
      departures: { ...this.#departures },
    }
  }

  /**
   * Stop every account and let every caller go.
   *
   * What terminating the host means from the inside. Each caller is told its
   * account stopped, so none is left waiting for an answer.
   */
  async close(): Promise<void> {
    this.#closed = true
    this.#sweep?.()
    this.#sweep = undefined

    for (const caller of [...this.#callers.values()]) await this.#release(caller, 'host-closed')
    for (const hosted of this.#hosted.values()) {
      await hosted.account?.stop()
      hosted.unwatch?.()
      hosted.unwatch = undefined
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Messages                                                                  */
  /* ------------------------------------------------------------------------ */

  async #receive(endpoint: Endpoint, data: unknown): Promise<void> {
    const message = readCallerMessage(data)

    if (message === undefined) {
      this.#malformed += 1
      const connection = (data as { connection?: unknown } | null)?.connection
      if (typeof connection === 'string' && connection.length > 0) {
        endpoint.post({
          type: 'protocol-error',
          connection,
          reason: 'not a message of this protocol',
        })
      }

      return
    }

    if (this.#closed) return

    if (message.type === 'hello') {
      this.#greet(endpoint, message)

      return
    }

    const caller = this.#callers.get(message.connection)
    if (caller === undefined || caller.endpoint !== endpoint || !caller.greeted) {
      endpoint.post({
        type: 'protocol-error',
        connection: message.connection,
        reason: 'this connection has not said hello',
      })

      return
    }

    caller.lastSeen = this.#now()
    await this.#handle(caller, message)
  }

  #greet(endpoint: Endpoint, message: Extract<CallerMessage, { type: 'hello' }>): void {
    if (message.v !== PROTOCOL_VERSION) {
      // Refused rather than guessed at: a caller built against another version
      // would read these answers as something they are not.
      endpoint.post({ type: 'mismatch', connection: message.connection, v: PROTOCOL_VERSION })

      return
    }

    this.#callers.set(message.connection, {
      connection: message.connection,
      endpoint,
      greeted: true,
      hosted: undefined,
      wantsUpdates: false,
      lastSeen: this.#now(),
      calls: new Map(),
      callbacks: new Map(),
      streams: new Map(),
      handles: new Map(),
      sent: 0,
      acknowledged: 0,
      held: [],
      released: false,
      witnessed: false,
    })
    endpoint.post({ type: 'welcome', connection: message.connection, v: PROTOCOL_VERSION })
    this.#startSweeping()
  }

  async #handle(caller: Caller, message: CallerMessage): Promise<void> {
    switch (message.type) {
      case 'attach':
        await this.#attach(caller, message)
        break
      case 'call':
        await this.#call(caller, message)
        break
      case 'abort': {
        // Forgotten at once: the caller has already given up on it, so it is not
        // pending for anybody. What the signal can stop, it stops; an operation
        // already past the point of stopping finishes, and its result is
        // discarded rather than sent to a caller that is no longer waiting.
        const call = caller.calls.get(message.id)
        caller.calls.delete(message.id)
        call?.abort.abort(new CancelledError('the caller cancelled'))
        break
      }
      case 'callback-result':
        this.#answered(caller, message)
        break
      case 'pull':
        this.#pull(caller, message.stream, message.credit)
        break
      case 'ack':
        this.#acknowledge(caller, message.seq)
        break
      case 'ping':
        caller.endpoint.post({ type: 'pong', connection: caller.connection })
        break
      case 'release':
        await this.#release(caller, 'detached')
        break
      default:
        break
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Accounts                                                                  */
  /* ------------------------------------------------------------------------ */

  async #attach(
    caller: Caller,
    message: Extract<CallerMessage, { type: 'attach' }>,
  ): Promise<void> {
    if (caller.hosted !== undefined) {
      caller.endpoint.post({
        type: 'protocol-error',
        connection: caller.connection,
        reason: `this connection is already attached to '${caller.hosted.id}'`,
      })

      return
    }

    const hosted = this.#hostedFor(message.account)
    caller.hosted = hosted
    caller.wantsUpdates = message.updates
    hosted.callers.add(caller)

    try {
      const account = await this.#accountOf(hosted, message.restore)
      if (message.lock !== undefined) this.#watch(caller, message.lock)
      caller.endpoint.post({
        type: 'attached',
        connection: caller.connection,
        account: hosted.id,
        status: account.connectionStatus,
      })
    } catch (error) {
      hosted.callers.delete(caller)
      caller.hosted = undefined
      caller.endpoint.post({
        type: 'failure',
        connection: caller.connection,
        id: 0,
        error: serializeError(error),
      })
    }
  }

  #hostedFor(id: string): Hosted {
    const existing = this.#hosted.get(id)
    if (existing !== undefined) return existing

    const hosted: Hosted = {
      id,
      account: undefined,
      making: undefined,
      created: 0,
      callers: new Set(),
      unwatch: undefined,
    }
    this.#hosted.set(id, hosted)

    return hosted
  }

  /**
   * The account behind an entry, made once however many callers ask at once.
   *
   * Two pages attaching together both wait on the one factory call. That is the
   * whole of why an account is never connected twice: there is only ever one of
   * it, and connecting it is idempotent.
   */
  async #accountOf(hosted: Hosted, restore: string | undefined): Promise<Account> {
    if (hosted.account !== undefined) return hosted.account
    if (hosted.making !== undefined) return await hosted.making

    hosted.making = (async () => {
      const account = await this.#options.create(hosted.id, restore)
      hosted.created += 1
      // The host is this account's application: what it dispatches passes
      // through here first, in the order it was delivered, and goes to every
      // caller that asked for updates.
      account.surround(async (context, next) => {
        this.#forward(hosted, context.raw)
        await next()
      })
      // Passed on as it changes rather than read when asked, so a caller showing
      // it is told the moment the account goes offline, in the order it did.
      hosted.unwatch = account.onConnectionStatus((status) => {
        this.#announceStatus(hosted, status)
      })
      hosted.account = account

      return account
    })()

    try {
      return await hosted.making
    } finally {
      hosted.making = undefined
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Calls                                                                     */
  /* ------------------------------------------------------------------------ */

  async #call(caller: Caller, message: Extract<CallerMessage, { type: 'call' }>): Promise<void> {
    const pending: PendingCall = { abort: new AbortController(), tokens: new Set() }
    caller.calls.set(message.id, pending)

    try {
      const account = caller.hosted?.account
      if (account === undefined) throw new LifecycleError('attach to an account before calling it')

      const outcome = await this.#run(caller, account, message, pending)
      if (caller.calls.get(message.id) !== pending) return

      caller.endpoint.post(
        { type: 'result', connection: caller.connection, id: message.id, value: outcome.value },
        outcome.transfer,
      )

      if (message.method === 'stop') this.#announceStopped(caller.hosted as Hosted)
    } catch (error) {
      if (caller.calls.get(message.id) !== pending) return

      caller.endpoint.post({
        type: 'failure',
        connection: caller.connection,
        id: message.id,
        error: serializeError(error),
      })
    } finally {
      for (const id of pending.tokens)
        caller.callbacks.get(id)?.reject(new CancelledError('the call ended'))
      caller.calls.delete(message.id)
    }
  }

  /** Run one call and produce what goes back, with the buffers it may transfer. */
  async #run(
    caller: Caller,
    account: Account,
    message: Extract<CallerMessage, { type: 'call' }>,
    pending: PendingCall,
  ): Promise<{ readonly value: unknown; readonly transfer: ArrayBuffer[] }> {
    if (message.method.startsWith('@')) {
      const args = [...message.args]
      for (const path of message.signals ?? []) placeSignal(args, path, pending.abort.signal)
      const special = await this.#special(caller, account, { ...message, args })
      if (special !== undefined)
        return { value: (special as { value: unknown }).value, transfer: [] }

      throw new ValidationError(`'${message.method}' is not something a worker caller may call`)
    }

    const shape = shapeOf(message.method)
    if (shape === undefined) {
      throw new ValidationError(`'${message.method}' is not something a worker caller may call`)
    }

    const slots = new Set(
      shape.shape === 'callback' ? shape.slots.map((slot) => slotPath(slot)) : [],
    )
    const args = decodeValue(message.args, {
      callback: (id, path) => {
        if (!slots.has(path)) {
          throw new ValidationError(`${path} is not a place '${message.method}' takes a function`)
        }

        return this.#callbackFor(caller, pending, id)
      },
    }) as unknown[]
    for (const path of message.signals ?? []) placeSignal(args, path, pending.abort.signal)

    // Looked up in the table above, never by walking the account: the name has
    // already been checked to be one the table lists.
    const method = (account as unknown as Record<string, (...args: unknown[]) => unknown>)[
      message.method
    ]
    if (typeof method !== 'function') {
      throw new ValidationError(`'${message.method}' is not a method of this account`)
    }

    const result = await method.apply(account, args)

    if (shape.shape === 'stream') {
      const id = this.#nextId++
      const iterable = result as AsyncIterable<unknown>
      caller.streams.set(id, {
        iterator: iterable[Symbol.asyncIterator](),
        bytes: message.method === 'downloadIterable',
        credit: 0,
        pumping: false,
      })

      return { value: token('stream', id, { kind: message.method }), transfer: [] }
    }

    if (shape.shape === 'handle') {
      const id = this.#nextId++
      caller.handles.set(id, { kind: shape.kind, target: result })

      return {
        value: token('handle', id, { kind: shape.kind, fields: fieldsOf(shape.kind, result) }),
        transfer: [],
      }
    }

    if ((BYTES as readonly string[]).includes(message.method) && result instanceof Uint8Array) {
      const copy = ownedCopy(result)

      return { value: copy, transfer: [copy.buffer] }
    }

    return { value: encodeValue(result), transfer: [] }
  }

  /**
   * The targets that are not account methods.
   *
   * Each is a fixed name with a fixed shape: a raw call, a call on a named
   * datacenter, a getter, a handle's method, closing a stream, the peer record
   * a context needs, and what the host reports about itself.
   */
  async #special(
    caller: Caller,
    account: Account,
    message: Extract<CallerMessage, { type: 'call' }>,
  ): Promise<unknown> {
    const [first, second, ...rest] = message.args

    switch (message.method) {
      case '@call': {
        // The caller's signal, if it had one, was replaced by this call's own —
        // which is what `abort` fires.
        const options = (second ?? {}) as { readonly timeout?: number; readonly signal?: unknown }
        const bound = account.withParams({
          ...(typeof options.timeout === 'number' ? { timeout: options.timeout } : {}),
          ...(options.signal instanceof AbortSignal ? { signal: options.signal } : {}),
        })

        return { value: await bound.call(first as TlValue) }
      }
      case '@callOn':
        return { value: await account.reach(first as number).invoke(second as TlValue) }
      case '@get': {
        if (typeof first !== 'string' || !(GETTERS as readonly string[]).includes(first)) {
          throw new ValidationError(`'${String(first)}' is not something a caller may read`)
        }

        return { value: (account as unknown as Record<string, unknown>)[first] }
      }
      case '@handle':
        return { value: await this.#handleCall(caller, first, second, rest) }
      case '@closeStream': {
        const stream = caller.streams.get(first as number)
        caller.streams.delete(first as number)
        await stream?.iterator.return?.()

        return { value: true }
      }
      case '@peer':
        return { value: await peerRecord(account, first, second) }
      case '@info':
        return { value: this.#report(1) }
      default:
        return undefined
    }
  }

  async #handleCall(
    caller: Caller,
    id: unknown,
    method: unknown,
    args: unknown[],
  ): Promise<unknown> {
    const handle = typeof id === 'number' ? caller.handles.get(id) : undefined
    if (handle === undefined) throw new ValidationError('this handle is not held by this caller')

    const allowed: readonly string[] = HANDLE_KINDS[handle.kind].methods
    if (typeof method !== 'string' || !allowed.includes(method)) {
      throw new ValidationError(`a ${handle.kind} handle has no method '${String(method)}'`)
    }

    const decoded = decodeValue(args) as unknown[]
    const value =
      handle.kind === 'stop'
        ? await (handle.target as () => unknown)()
        : await (handle.target as Record<string, (...args: unknown[]) => unknown>)[method]?.apply(
            handle.target,
            decoded,
          )
    // Ended, so there is nothing left for a departing caller to release.
    if (method === HANDLE_KINDS[handle.kind].ends) caller.handles.delete(id as number)

    return { value: encodeValue(value), fields: fieldsOf(handle.kind, handle.target) }
  }

  /* ------------------------------------------------------------------------ */
  /* Callbacks                                                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * A function standing in for one the caller kept.
   *
   * Calling it asks the caller to call theirs, and waits for the answer. It
   * works only while the call that issued it is running: afterwards the caller
   * may have forgotten the function, and a late call would reach nothing.
   */
  #callbackFor(
    caller: Caller,
    pending: PendingCall,
    callback: number,
  ): (...args: unknown[]) => Promise<unknown> {
    return async (...args: unknown[]) => {
      if (caller.released) throw new CancelledError('the caller that supplied this is gone')

      const id = this.#nextId++
      pending.tokens.add(id)
      const transfer: ArrayBuffer[] = []
      const encoded = args.map((arg) => {
        if (arg instanceof Uint8Array) {
          const copy = ownedCopy(arg)
          transfer.push(copy.buffer)

          return copy
        }

        return encodeValue(arg)
      })

      try {
        return await new Promise<unknown>((resolve, reject) => {
          caller.callbacks.set(id, { resolve, reject })
          caller.endpoint.post(
            { type: 'callback', connection: caller.connection, id, callback, args: encoded },
            transfer,
          )
        })
      } finally {
        caller.callbacks.delete(id)
        pending.tokens.delete(id)
      }
    }
  }

  #answered(caller: Caller, message: Extract<CallerMessage, { type: 'callback-result' }>): void {
    const waiting = caller.callbacks.get(message.id)
    if (waiting === undefined) return

    if (message.ok) {
      waiting.resolve(decodeValue(message.value))
    } else {
      const reason = message.error?.message ?? 'the callback failed'
      waiting.reject(new CancelledError(reason))
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Streams                                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * Give a stream more room, and send what fits.
   *
   * The caller says how many items it is ready for and the host sends no more
   * than that — the same pull the iterator already has, extended across the
   * port, so a caller that stops reading stops the host reading too.
   */
  #pull(caller: Caller, id: number, credit: number): void {
    const stream = caller.streams.get(id)
    if (stream === undefined) return

    stream.credit += credit
    if (!stream.pumping) void this.#pump(caller, id, stream)
  }

  async #pump(caller: Caller, id: number, stream: OpenStream): Promise<void> {
    stream.pumping = true

    try {
      while (stream.credit > 0 && caller.streams.get(id) === stream) {
        const next = await stream.iterator.next()
        if (caller.streams.get(id) !== stream) return

        if (next.done === true) {
          caller.streams.delete(id)
          caller.endpoint.post({ type: 'end', connection: caller.connection, stream: id })

          return
        }

        stream.credit -= 1

        if (stream.bytes && next.value instanceof Uint8Array) {
          const copy = ownedCopy(next.value)
          caller.endpoint.post(
            { type: 'item', connection: caller.connection, stream: id, value: copy },
            [copy.buffer],
          )
        } else {
          caller.endpoint.post({
            type: 'item',
            connection: caller.connection,
            stream: id,
            value: encodeValue(next.value),
          })
        }
      }
    } catch (error) {
      caller.streams.delete(id)
      caller.endpoint.post({
        type: 'stream-failure',
        connection: caller.connection,
        stream: id,
        error: serializeError(error),
      })
    } finally {
      stream.pumping = false
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Updates                                                                   */
  /* ------------------------------------------------------------------------ */

  /** Hand an update to every caller of the account it arrived on. */
  #forward(hosted: Hosted, update: unknown): void {
    for (const caller of hosted.callers) {
      if (!caller.wantsUpdates || caller.released) continue
      this.#send(caller, update)
    }
  }

  /**
   * Send one update to one caller, within its window.
   *
   * A caller acknowledges what it has handled. While it has fewer than the
   * window outstanding, an update goes straight out; past that it is held, in
   * order, until acknowledgements make room. A caller that falls so far behind
   * that the held updates pass the backlog is let go and told why — its
   * updates are not quietly dropped, and its lag does not become everyone's.
   */
  #send(caller: Caller, update: unknown): void {
    const window = this.#options.window ?? 1024
    const backlog = this.#options.backlog ?? 8192

    if (caller.held.length > 0 || caller.sent - caller.acknowledged >= window) {
      caller.held.push(update)

      if (caller.held.length > backlog) {
        caller.endpoint.post({
          type: 'lagged',
          connection: caller.connection,
          unacknowledged: caller.sent - caller.acknowledged + caller.held.length,
        })
        void this.#release(caller, 'lagged')
      }

      return
    }

    caller.sent += 1
    caller.endpoint.post({
      type: 'update',
      connection: caller.connection,
      seq: caller.sent,
      update,
    })
  }

  #acknowledge(caller: Caller, seq: number): void {
    if (seq > caller.sent) return
    caller.acknowledged = Math.max(caller.acknowledged, seq)

    const window = this.#options.window ?? 1024
    while (caller.held.length > 0 && caller.sent - caller.acknowledged < window) {
      const update = caller.held.shift()
      caller.sent += 1
      caller.endpoint.post({
        type: 'update',
        connection: caller.connection,
        seq: caller.sent,
        update,
      })
    }
  }

  #announceStatus(hosted: Hosted, status: ConnectionStatus): void {
    for (const caller of hosted.callers) {
      if (caller.released) continue
      caller.endpoint.post({ type: 'status', connection: caller.connection, status })
    }
  }

  /**
   * Let a caller go when the lock it holds is let go.
   *
   * The caller took the lock before attaching, so this request waits behind it
   * and is granted only once the caller releases it — by detaching, which has
   * already let the caller go here — or once its context is destroyed, which
   * says nothing over the port at all.
   */
  #watch(caller: Caller, name: string): void {
    const locks =
      this.#options.locks === false ? undefined : (this.#options.locks ?? platformLocks())
    if (locks === undefined) return

    caller.witnessed = true
    locks
      .request(name, async () => {
        if (!caller.released) await this.#release(caller, 'context-gone')
      })
      .catch(() => {
        // A lock that cannot be asked for leaves the caller to its pings.
        caller.witnessed = false
      })
  }

  #announceStopped(hosted: Hosted): void {
    for (const caller of hosted.callers) {
      caller.endpoint.post({ type: 'stopped', connection: caller.connection, account: hosted.id })
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Leaving                                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * Let one caller go, and everything it held.
   *
   * Its calls are cancelled, its callbacks fail, its streams are returned and
   * its handles released by their kind's rule. Nothing another caller holds is
   * touched. If it was the account's last caller, the host's policy decides
   * whether the account keeps running.
   */
  async #release(caller: Caller, reason: Departure): Promise<void> {
    if (caller.released) return
    caller.released = true
    this.#departures[reason] += 1
    this.#callers.delete(caller.connection)

    for (const call of caller.calls.values())
      call.abort.abort(new CancelledError('the caller left'))
    caller.calls.clear()
    for (const callback of caller.callbacks.values())
      callback.reject(new CancelledError('the caller left'))
    caller.callbacks.clear()
    for (const stream of caller.streams.values())
      await stream.iterator.return?.().catch(() => undefined)
    caller.streams.clear()
    for (const handle of caller.handles.values()) await releaseHandle(handle)
    caller.handles.clear()
    caller.held.length = 0

    const hosted = caller.hosted
    if (hosted === undefined) return
    hosted.callers.delete(caller)
    if (hosted.callers.size > 0) return

    const policy = this.#options.onLastDetached ?? 'keep'
    const decision = typeof policy === 'function' ? policy(hosted.id) : policy
    if (decision === 'stop') await hosted.account?.stop()
  }

  #startSweeping(): void {
    if (this.#sweep !== undefined) return

    const every = this.#options.sweepEvery ?? 10_000
    const expireAfter = this.#options.expireAfter ?? 60_000

    const round = (): void => {
      this.#sweep = undefined
      const now = this.#now()

      for (const caller of [...this.#callers.values()]) {
        if (caller.witnessed || now - caller.lastSeen <= expireAfter) continue

        caller.endpoint.post({ type: 'expired', connection: caller.connection })
        void this.#release(caller, 'expired')
      }

      if (this.#callers.size > 0 && !this.#closed) this.#sweep = this.#schedule(round, every)
    }

    this.#sweep = this.#schedule(round, every)
  }
}

/** Serve accounts from the worker this runs in. The usual way to start a host. */
export function serveAccounts(options: HostOptions, scope: unknown = globalThis): WorkerHost {
  const host = new WorkerHost(options)
  host.listen(scope)

  return host
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** `0.source.read` as the path a decoder reports: `value[0].source.read`. */
function slotPath(slot: string): string {
  const [index, ...rest] = slot.split('.')

  return `value[${index}]${rest.map((part) => `.${part}`).join('')}`
}

/** Put a signal back where the caller took one out. */
function placeSignal(args: unknown[], path: string, signal: AbortSignal): void {
  const parts = path.split('.')
  const index = Number(parts[0])
  if (!Number.isInteger(index) || index < 0 || index >= args.length) return

  let target = args[index] as Record<string, unknown> | undefined
  for (const part of parts.slice(1, -1)) {
    if (target === undefined || typeof target !== 'object') return
    target = target[part] as Record<string, unknown> | undefined
  }

  const last = parts.at(-1)
  if (parts.length === 1) {
    args[index] = signal
  } else if (target !== undefined && typeof target === 'object' && last !== undefined) {
    target[last] = signal
  }
}

/** The fields of a handle a caller sees, as they are now. */
function fieldsOf(kind: HandleKind, target: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const field of HANDLE_KINDS[kind].fields) {
    const value = (target as Record<string, unknown>)[field]
    if (value !== undefined) fields[field] = encodeValue(value)
  }

  return fields
}

/** Release a handle whose caller is gone, by its kind's rule. */
async function releaseHandle(handle: OpenHandle): Promise<void> {
  const rule = HANDLE_KINDS[handle.kind].release

  try {
    if (rule === 'call') await (handle.target as () => unknown)()
    if (rule === 'close') await (handle.target as { close(): unknown }).close()
  } catch {
    // Releasing is best effort: the caller is already gone, and a failure to
    // stop what it started has nobody to report to.
  }
}

/**
 * The peer record a caller's context needs to act on an update.
 *
 * Read through the account's own resolution, so it answers what the account
 * knows and nothing it does not: an unknown peer is `undefined`, as it would be
 * from the store itself.
 */
async function peerRecord(account: Account, kind: unknown, id: unknown): Promise<unknown> {
  if ((kind !== 'user' && kind !== 'chat' && kind !== 'channel') || typeof id !== 'bigint') {
    throw new ValidationError('a peer is named by its kind and a numeric identifier')
  }

  try {
    const input = await account.resolve({ kind, id })
    const hash =
      input._ === 'inputPeerUser' || input._ === 'inputPeerChannel' ? input.access_hash : undefined

    return {
      kind,
      id,
      ...(hash === undefined ? {} : { accessHash: hash }),
      min: false,
      usernames: [],
    }
  } catch (error) {
    if (error instanceof PeerError) return undefined
    throw error
  }
}
