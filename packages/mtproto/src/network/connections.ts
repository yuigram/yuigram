/**
 * A connection that outlives the sockets it is made of.
 *
 * Everything below this is single-use on purpose: a channel maps to one socket,
 * one key exchange and one session, and once it ends it stays ended. That is
 * what makes the layers below decidable, and it is also what makes them
 * unusable on their own — a caller holding a channel holds something that will
 * eventually die and take its calls with it.
 *
 * ```
 *   caller ──> logical connection ──> channel ──> socket
 *                     │                  ▲
 *                     └── reconnect ─────┘
 * ```
 *
 * This is where a connection stops being a socket and becomes an address a
 * caller can keep. It owns exactly one channel at a time, replaces it when it
 * dies, and waits between attempts. It owns nothing else: the key belongs to
 * the datacenter, the session belongs to the channel, and both are deliberately
 * out of reach here.
 *
 * **It is not a pool.** There is one channel per identity, no capacity, no
 * selection and no distribution — a pool decides between several channels, and
 * that decision needs a notion of load and health that nothing here has. What
 * this owns is the lifetime of one channel, which is the part a pool would
 * otherwise have to absorb.
 *
 * **It never repeats a call.** Reconnecting recovers the transport, not the
 * requests that were travelling over it. A call that has been written has an
 * unknown outcome once the channel dies, and repeating it would turn one
 * message sent into two. A call that has *not* been written is a different
 * matter: it never reached a socket, so it goes out on whichever channel
 * arrives, and that is not a repeat.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import { randomBytes } from '../crypto/random.js'
import type { InvokeOptions } from '../session/connection.js'
import type { SessionEvent } from '../session/dispatcher.js'
import type { TlValue } from '../tl/index.js'
import {
  AUTH_KEY_NOT_FOUND,
  type Channel,
  type KnownAuthorization,
  TransportError,
} from './channel.js'
import type { Datacenters } from './datacenters.js'
import type { DcPurpose } from './dc.js'

/** Which logical connection is wanted. */
export interface ConnectionTarget {
  /** Defaults to the datacenter this client belongs to. */
  readonly id?: number
  /** Defaults to ordinary calls and updates. */
  readonly purpose?: DcPurpose
}

/**
 * How far a logical connection has got.
 *
 * There is no state for a connection that has lost its channel and is not yet
 * waiting to open another. Losing one and deciding what happens next is a
 * single step: a state between them would own no timer and no attempt, which
 * makes it indistinguishable from `idle` except by history, and anything able
 * to observe it would be something that forgot to arrange the retry.
 */
export type ConnectionState = 'idle' | 'connecting' | 'ready' | 'waiting' | 'closed'

/** How long to wait between attempts. */
export interface BackoffOptions {
  /** Milliseconds before the first retry. */
  readonly base?: number
  /** The longest wait between attempts. */
  readonly cap?: number
}

/** How the layer is built. */
export interface ConnectionsOptions {
  /** Where channels come from. */
  readonly datacenters: Datacenters
  /**
   * Prefer IPv6 addresses.
   *
   * A preference held by the client rather than by a connection: two logical
   * connections differing only in address family would be two sessions
   * competing for one endpoint.
   */
  readonly ipv6?: boolean
  /** Milliseconds between attempts. Defaults to 1000, capped at 32000. */
  readonly backoff?: BackoffOptions
  /** Anything a connection does not answer itself, named by its origin. */
  readonly onEvent?: (origin: ManagedConnection, event: SessionEvent) => void
  /**
   * An attempt failed.
   *
   * Reported because nothing here ever gives up: a failure that repeats forever
   * is invisible unless something says so.
   */
  readonly onFailure?: (origin: ManagedConnection, error: Error) => void
  /** Milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /** Randomness for the jitter between attempts. */
  readonly random?: (length: number) => Uint8Array
  /** Run something later, and return the way to cancel it. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
}

/** How one call is made through a logical connection. */
export interface ConnectionInvokeOptions extends InvokeOptions {
  /** Stop waiting for a connection. Has no effect once the call has gone out. */
  readonly signal?: AbortSignal
}

/** One logical connection: one identity, one channel at a time, reconnected. */
export interface ManagedConnection {
  readonly dcId: number
  readonly purpose: DcPurpose
  readonly state: ConnectionState
  /**
   * Wait until a channel is live.
   *
   * Rejects when this caller withdraws or when the connection is closed, never
   * because an attempt failed — a failed attempt is followed by another.
   */
  ready(options?: { readonly signal?: AbortSignal }): Promise<void>
  /**
   * Call a method, waiting for a channel if there is not one yet.
   *
   * A call that has been written is never written again: the channel dying
   * leaves its outcome unknown, and an unknown outcome is not a reason to
   * repeat it.
   */
  invoke(query: TlValue, options?: ConnectionInvokeOptions): Promise<TlValue>
  /** Stop for good. */
  close(): void
}

/** The logical connections this client keeps. */
export interface Connections {
  /**
   * The connection for an identity, built the first time it is asked for.
   *
   * Synchronous by design: building it cannot be interrupted, so two callers
   * arriving together cannot end up with two connections to one endpoint.
   */
  get(target?: ConnectionTarget): ManagedConnection
  /** Close every logical connection. */
  close(): void
}

const DEFAULT_BASE = 1000
const DEFAULT_CAP = 32_000

/** Build the layer. Nothing is opened until something is asked for. */
export function openConnections(options: ConnectionsOptions): Connections {
  const connections = new Map<string, Logical>()
  let closed = false

  return {
    get(target = {}) {
      if (closed) throw new CancelledError('the connections have been closed')

      const id = target.id ?? options.datacenters.directory.thisDc
      const purpose = target.purpose ?? 'main'
      const key = `${id}:${purpose}`

      const existing = connections.get(key)
      // A connection that was closed is finished. Handing it back would give a
      // caller something that will never connect again.
      if (existing !== undefined && existing.state !== 'closed') return existing

      const created = new Logical(id, purpose, options)
      connections.set(key, created)

      return created
    },

    close() {
      closed = true
      for (const connection of connections.values()) connection.close()
      connections.clear()
    },
  }
}

/** Someone waiting for a channel to exist. */
interface Waiter {
  settle(error?: Error): void
}

/** What one attempt reports back through. */
interface Attempt {
  channel?: Channel
  /** An ending that arrived before the channel had been handed over. */
  early?: Error
}

class Logical implements ManagedConnection {
  readonly dcId: number
  readonly purpose: DcPurpose

  readonly #options: ConnectionsOptions
  readonly #base: number
  readonly #cap: number
  readonly #now: () => number
  readonly #random: (length: number) => Uint8Array
  readonly #schedule: (run: () => void, delayMs: number) => () => void

  #state: ConnectionState = 'idle'
  #channel: Channel | undefined
  /** The attempt in flight, so two callers cannot start two. */
  #attempt: Promise<Channel> | undefined
  #abort: AbortController | undefined
  #cancelTimer: (() => void) | undefined
  /** A refused key being discarded, awaited before the next attempt. */
  #discarding: Promise<void> | undefined
  #failures = 0
  /**
   * The kind of key the datacenter refused last, if that is what went wrong.
   *
   * A datacenter that does not know the key a connection presents refuses it,
   * and the answer is to obtain another — which works, once. Two in a row is a
   * datacenter refusing every key this client can obtain, at the cost of a
   * whole key exchange each time.
   *
   * The two kinds are counted apart. A key with a lifetime is replaceable
   * material: the client stays authorized and obtaining another costs an
   * exchange and a vouching. The long-lived key is the authorization itself,
   * and losing it means starting again. A run of one says nothing about the
   * other, so neither lengthens the other's waits. Anything else going wrong
   * ends whichever run was open.
   */
  #refused: KeyKind | undefined
  #lastDelay = 0
  #readyAt = 0
  #waiters: Waiter[] = []

  constructor(dcId: number, purpose: DcPurpose, options: ConnectionsOptions) {
    this.dcId = dcId
    this.purpose = purpose
    this.#options = options
    this.#base = options.backoff?.base ?? DEFAULT_BASE
    this.#cap = options.backoff?.cap ?? DEFAULT_CAP
    this.#now = options.now ?? Date.now
    this.#random = options.random ?? randomBytes
    this.#schedule = options.schedule ?? defaultSchedule
  }

  get state(): ConnectionState {
    return this.#state
  }

  ready(options: { readonly signal?: AbortSignal } = {}): Promise<void> {
    if (this.#state === 'closed') {
      return Promise.reject(new CancelledError('the connection was closed'))
    }
    if (this.#state === 'ready') return Promise.resolve()
    if (options.signal?.aborted === true) {
      return Promise.reject(new CancelledError('the caller stopped waiting'))
    }

    this.#start()

    return this.#wait(options.signal)
  }

  async invoke(query: TlValue, options: ConnectionInvokeOptions = {}): Promise<TlValue> {
    const channel = await this.#live(options.signal)

    // The write. Everything before it may be repeated freely; nothing after it
    // may be repeated at all.
    return channel.invoke(query, options.timeout === undefined ? {} : { timeout: options.timeout })
  }

  close(): void {
    if (this.#state === 'closed') return
    this.#state = 'closed'

    this.#cancelTimer?.()
    this.#cancelTimer = undefined
    this.#abort?.abort()
    this.#abort = undefined
    this.#attempt = undefined

    // Let go of it before closing it, so the ending it may report is already
    // the ending of a channel this connection no longer holds.
    const channel = this.#channel
    this.#channel = undefined
    channel?.close()

    this.#settleAll(new CancelledError('the connection was closed'))
  }

  /** The live channel, waiting for one if there is none. */
  async #live(signal: AbortSignal | undefined): Promise<Channel> {
    const current = this.#channel
    if (this.#state === 'ready' && current !== undefined) return current

    await this.ready(signal === undefined ? {} : { signal })

    const channel = this.#channel
    if (channel === undefined) throw new NetworkError('the connection has no channel')

    return channel
  }

  /**
   * Open a channel.
   *
   * Only an idle connection starts one, and that single test is what keeps
   * every other state honest: `connecting` already has an attempt in flight, so
   * two callers cannot become two sockets; `ready` already has a channel;
   * `waiting` has a timer armed, and cutting that wait short is exactly what
   * the wait exists to prevent; `closed` is final.
   */
  #start(): void {
    if (this.#state !== 'idle') return

    this.#state = 'connecting'
    const abort = new AbortController()
    this.#abort = abort
    const attempt: Attempt = {}

    const opening = (async () => {
      // A key that was refused is discarded before another connection is
      // attempted, so the attempt cannot present the key that was just refused.
      await this.#discarding
      this.#discarding = undefined

      return this.#options.datacenters.connect({
        id: this.dcId,
        purpose: this.purpose,
        ...(this.#options.ipv6 === undefined ? {} : { ipv6: this.#options.ipv6 }),
        signal: abort.signal,
        onClosed: (error) => this.#ended(attempt, error),
        onEvent: (event) => this.#happened(attempt, event),
      })
    })()

    this.#attempt = opening
    opening.then(
      (channel) => this.#opened(opening, attempt, channel),
      (error: unknown) => this.#lost(opening, asError(error), undefined),
    )
  }

  /** A channel arrived. */
  #opened(opening: Promise<Channel>, attempt: Attempt, channel: Channel): void {
    // Either this is no longer the attempt in flight, or nothing is in flight
    // at all — a shutdown lets go of the attempt as well. Whatever replaced it
    // owns the connection now, and this channel belongs to nobody.
    if (this.#attempt !== opening) {
      channel.close()
      return
    }

    attempt.channel = channel

    // An ending that arrived while the channel was still being handed over.
    // Keeping the reason is what lets a refusal seen in that window be acted
    // on, rather than seen as a channel that was never usable.
    const early = attempt.early
    if (early !== undefined) {
      channel.close()
      this.#lost(opening, early, channel)
      return
    }

    this.#attempt = undefined
    this.#abort = undefined
    this.#channel = channel
    this.#state = 'ready'
    this.#readyAt = this.#now()

    this.#settleAll(undefined)
  }

  /** The channel this connection holds has ended on its own. */
  #ended(attempt: Attempt, error: Error | undefined): void {
    const channel = attempt.channel
    if (channel === undefined) {
      // The channel is still being handed over. Kept rather than acted on, so
      // the reason survives to the moment there is something to act with.
      attempt.early = error ?? new NetworkError('the connection ended')
      return
    }

    // A channel that is not the current one has already been replaced or
    // closed. Acting on its ending would arrange a reconnection for a
    // connection that already has one, or revive one that was shut down.
    if (channel !== this.#channel) return

    // A channel that lasted longer than the wait that preceded it is evidence
    // that the trouble has passed, so the next failure starts over.
    //
    // A run of refused keys earns that once. Every attempt in such a run opens
    // a connection, obtains a key and is refused again, and each new channel
    // lives long enough to look like a recovery — so counting them as
    // recoveries is exactly what holds the wait at its shortest while a
    // datacenter rejects everything this client can offer it.
    const dead = isDeadKey(error)
    if (
      (!dead || this.#refused !== kindOf(channel.authorization)) &&
      this.#now() - this.#readyAt >= this.#lastDelay
    ) {
      this.#failures = 0
    }

    this.#lost(undefined, error ?? new NetworkError('the connection ended'), channel)
  }

  /** Something the connection did not answer itself. */
  #happened(attempt: Attempt, event: SessionEvent): void {
    if (attempt.channel === undefined || attempt.channel !== this.#channel) return

    this.#options.onEvent?.(this, event)
  }

  /**
   * There is no channel, and there will not be one until the next attempt.
   *
   * `refused` names the channel whose key the far end may have rejected. An
   * attempt that failed before a channel existed names none: nothing says a key
   * was at fault, and the exchange that would have produced one runs on a
   * connection this layer never sees.
   */
  #lost(opening: Promise<Channel> | undefined, error: Error, refused: Channel | undefined): void {
    if (opening !== undefined && this.#attempt !== opening) return
    // Deliberately redundant: no path reaches here after a shutdown, since one
    // lets go of both the channel and the attempt that the callers above check
    // against. It stays because the cost of being wrong about that is a
    // connection that reconnects after it was shut down.
    if (this.#state === 'closed') return

    this.#channel = undefined
    this.#attempt = undefined
    this.#abort = undefined
    this.#state = 'waiting'

    // Only a key that was actually presented can have been refused. An attempt
    // that failed before there was a channel has no key to answer for, whatever
    // the far end said, so it ends a run rather than continuing one.
    const refusedKey = refused !== undefined && isDeadKey(error)
    if (refusedKey) this.#discard(refused)

    // The run belongs to this connection, not to the datacenter: two purposes
    // share one authorization, and one of them being refused is not a reason to
    // lengthen the other's waits.
    this.#refused = refusedKey ? kindOf(refused.authorization) : undefined

    this.#options.onFailure?.(this, error)

    this.#failures += 1
    const delay = this.#delayFor(error)
    this.#lastDelay = delay

    this.#cancelTimer = this.#schedule(() => {
      this.#cancelTimer = undefined
      // The wait may have been called off while the timer was already on its
      // way here, which cancelling it cannot undo.
      if (this.#state !== 'waiting') return

      // The wait is over, so the connection is idle again and may start one.
      this.#state = 'idle'
      this.#start()
    }, delay)
  }

  /**
   * Throw away a key the datacenter says it does not know.
   *
   * Named by the key that was refused, so it cannot remove one that another
   * connection to the same datacenter obtained in the meantime. Obtaining the
   * replacement is left where it already happens: the datacenter shares one
   * exchange between everything that asks, and a second way to ask would
   * defeat that.
   */
  #discard(refused: Channel): void {
    this.#discarding = this.#options.datacenters
      .forget(this.dcId, refused.authorization.key.id)
      .catch((error: unknown) => {
        this.#options.onFailure?.(this, asError(error))
      })
  }

  /**
   * How long to wait before the next attempt.
   *
   * A refusal the far end chose to send, or an answer that was not the
   * protocol, is not something another attempt a second later will fix — it is
   * a middlebox, a wrong port, or a datacenter that wants nothing to do with
   * this client — so those wait the longest interval from the start. Everything
   * else ramps, and half of each interval is fixed so that many connections
   * failing together do not all come back together.
   */
  #delayFor(error: Error): number {
    const full = isProtocolFailure(error)
      ? this.#cap
      : Math.min(this.#cap, this.#base * 2 ** (this.#failures - 1))

    const half = full / 2

    return Math.round(half + half * fraction(this.#random(4)))
  }

  /** Register interest in there being a channel. */
  #wait(signal: AbortSignal | undefined): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false

      const waiter: Waiter = {
        settle: (error) => {
          if (settled) return
          settled = true

          signal?.removeEventListener('abort', withdraw)
          const at = this.#waiters.indexOf(waiter)
          if (at >= 0) this.#waiters.splice(at, 1)

          if (error === undefined) resolve()
          else reject(error)
        },
      }

      // One caller losing interest is not a reason to stop connecting: the
      // connection is shared, and the others are still waiting for it.
      const withdraw = (): void => waiter.settle(new CancelledError('the caller stopped waiting'))

      this.#waiters.push(waiter)
      signal?.addEventListener('abort', withdraw, { once: true })
    })
  }

  /** Answer everyone waiting, at once. */
  #settleAll(error: Error | undefined): void {
    const waiting = this.#waiters
    this.#waiters = []
    for (const waiter of waiting) waiter.settle(error)
  }
}

/** Which of a datacenter's two keys a connection was using. */
type KeyKind = 'temporary' | 'permanent'

/**
 * Which kind of key an authorization is.
 *
 * A lifetime is what tells them apart: the long-lived key does not have one,
 * and the key that encrypts traffic does.
 */
function kindOf(authorization: KnownAuthorization): KeyKind {
  return authorization.expiresAt === undefined ? 'permanent' : 'temporary'
}

/**
 * Whether the far end answered in a way another attempt will not change.
 *
 * A refusal naming the authorization key is deliberately not one of these: the
 * key is discarded and the next attempt obtains another, which is exactly the
 * case where trying again promptly is the right thing to do.
 */
function isProtocolFailure(error: Error): boolean {
  if (error instanceof TransportError) return !isDeadKey(error)

  return error instanceof ValidationError
}

/** Whether the far end said the key the connection presented is unknown to it. */
function isDeadKey(error: Error | undefined): boolean {
  return error instanceof TransportError && error.code === AUTH_KEY_NOT_FOUND
}

/** A fraction in [0, 1) from four bytes. */
function fraction(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  return view.getUint32(0, true) / 0x1_0000_0000
}

/** Anything thrown, as something with a message. */
function asError(value: unknown): Error {
  return value instanceof Error ? value : new NetworkError(String(value))
}

function defaultSchedule(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs)

  return () => clearTimeout(timer)
}
