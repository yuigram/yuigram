/**
 * One authorized connection to one datacenter, assembled.
 *
 * Every layer below this is deliberately unable to reach a network: a link
 * moves bytes it is handed, a connection speaks the protocol through callbacks,
 * an exchange produces a key from messages someone else delivers. A channel is
 * where they are wired to each other and to a socket, which makes it the only
 * place that owns a real timer and a real file descriptor.
 *
 * ```
 *   socket ──> link ──> handshake ──┐
 *                                   ├──> connection ──> invoke()
 *   socket <── link <───────────────┘
 * ```
 *
 * **A channel is used once.** It maps to one socket, one key exchange and one
 * connection, and once it is closed it stays closed. Reconnecting means opening
 * another; a pool holds several; reaching a different datacenter opens one
 * there. Keeping it single-use is what stops any of those needing to unpick
 * this wiring, and what makes it impossible for state belonging to a connection
 * that ended to be read by the one that replaced it.
 *
 * What it does not own is the authorization key. A key outlives every socket it
 * is ever used over, so it is supplied when one is already known and reported
 * when one is negotiated — and storing it belongs to the caller, which keeps
 * persistence out of the live machinery.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import { Handshake } from '../auth/handshake.js'
import type { ServerRsaKey } from '../auth/keys.js'
import type { AuthKey } from '../message/auth-key.js'
import { type ClientInfo, Connection, type InvokeOptions } from '../session/connection.js'
import type { SessionEvent } from '../session/dispatcher.js'
import type { TlScope, TlValue } from '../tl/index.js'
import type { Framing } from '../transport/framing.js'
import { IntermediateFraming } from '../transport/framing.js'
import { createObfuscation } from '../transport/obfuscation.js'
import type { DcAddress } from './dc.js'
import { Link } from './link.js'
import { type ByteStream, connectTcp } from './tcp.js'

/** How far a channel has got. */
export type ChannelState = 'handshaking' | 'ready' | 'closed'

/** A key that is already established, and the salt that goes with it. */
export interface KnownAuthorization {
  readonly key: AuthKey
  /** The last salt known to be accepted. */
  readonly salt: bigint
  /** Seconds to add to the local clock to reach the server's. */
  readonly timeOffset?: number
}

/** How a channel is opened. */
export interface ChannelOptions {
  /** Where to connect. */
  readonly address: DcAddress
  /** The tables this connection encodes and decodes with. */
  readonly scope: TlScope
  /** What the server is told this client is. */
  readonly client: ClientInfo
  /**
   * The server keys a key exchange may be answered with.
   *
   * Required only when there is no authorization yet. A fingerprint outside
   * this set is refused rather than trusted.
   */
  readonly keys?: readonly ServerRsaKey[]
  /**
   * An authorization already established for this datacenter.
   *
   * Supplying one skips the exchange entirely, which is what makes a restart
   * cost nothing. Omitting it runs an exchange and reports the result.
   */
  readonly authorization?: KnownAuthorization
  /** The envelope messages travel in. Defaults to the intermediate framing. */
  readonly framing?: Framing
  /** Hide the shape of the connection. */
  readonly obfuscated?: boolean
  /** Milliseconds to wait for the socket handshake. */
  readonly connectTimeout?: number
  /** Abandon the attempt. */
  readonly signal?: AbortSignal
  /**
   * The channel ended on its own.
   *
   * A transport failure after the channel is ready has no call left to fail, so
   * it arrives here instead. Closing the channel deliberately does not.
   */
  readonly onClosed?: (error?: Error) => void
  /** Anything the connection does not answer itself. */
  readonly onEvent?: (event: SessionEvent) => void
  /** Milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /** Randomness for nonces, session identifiers and padding. */
  readonly random?: (length: number) => Uint8Array
  /** Open the byte stream. Replaced to route through a proxy, or in a test. */
  readonly open?: (options: StreamRequest) => Promise<ByteStream>
  /**
   * Run something later, and return the way to cancel it.
   *
   * The one real timer a connection needs. It lives here because everything
   * below takes the moment as a parameter, which is what makes those layers
   * decidable without waiting.
   */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
}

/** What opening a byte stream needs. */
export interface StreamRequest {
  readonly host: string
  readonly port: number
  readonly connectTimeout?: number
  readonly signal?: AbortSignal
  readonly onData: (bytes: Uint8Array) => void
  readonly onClose: (error?: Error) => void
}

/** A live connection to one datacenter. */
export interface Channel {
  readonly dcId: number
  /** The key this connection is authorized with, however it was obtained. */
  readonly authorization: KnownAuthorization
  readonly state: ChannelState
  /** Call a method and wait for its answer. */
  invoke(query: TlValue, options?: InvokeOptions): Promise<TlValue>
  /** Close everything, once. */
  close(): void
}

/**
 * Open a channel.
 *
 * Resolves once the connection is usable — the socket is open and an
 * authorization exists — so a caller holding a channel can call methods on it.
 * Everything that goes wrong before that rejects, leaving nothing open;
 * everything that goes wrong after arrives through `onClosed`.
 */
export async function openChannel(options: ChannelOptions): Promise<Channel> {
  const framing = options.framing ?? new IntermediateFraming()
  const now = options.now ?? Date.now
  const later = options.schedule ?? defaultSchedule
  const openStream = options.open ?? defaultOpen

  const obfuscation =
    options.obfuscated === true
      ? createObfuscation(framing, {
          ...(options.random === undefined ? {} : { random: options.random }),
          ...(options.address.secret === undefined ? {} : { secret: options.address.secret }),
          dcId: options.address.id,
        })
      : undefined

  /** What the link is currently handing payloads to. */
  let deliver: (payload: Uint8Array) => void = () => {}
  let ended: ((error?: Error) => void) | undefined
  let closed = false

  const link = new Link({
    framing,
    ...(obfuscation === undefined ? {} : { obfuscation }),
    write: (bytes) => stream.write(bytes),
    onPayload: (payload) => deliver(payload),
    onTransportError: (code) => {
      ended?.(new NetworkError(`the datacenter refused the connection with code ${code}`))
    },
  })

  const stream = await openStream({
    host: options.address.host,
    port: options.address.port,
    ...(options.connectTimeout === undefined ? {} : { connectTimeout: options.connectTimeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    onData: (bytes) => {
      if (!closed) link.receive(bytes)
    },
    onClose: (error) => {
      ended?.(error)
    },
  })

  link.open()

  /** Shut everything down, in the order that leaves nothing writing. */
  const shutdown = (): void => {
    if (closed) return
    closed = true

    link.close()
    if (stream.open) stream.close()
  }

  try {
    const authorization =
      options.authorization ??
      (await negotiate({
        link,
        keys: options.keys ?? [],
        dcId: options.address.id,
        now,
        ...(options.random === undefined ? {} : { random: options.random }),
        signal: options.signal,
        accept: (handle) => {
          deliver = handle.deliver
          ended = handle.ended
        },
      }))

    return live({
      options,
      link,
      stream,
      authorization,
      now,
      later,
      shutdown,
      isClosed: () => closed,
      accept: (handle) => {
        deliver = handle.deliver
        ended = handle.ended
      },
    })
  } catch (error) {
    shutdown()
    throw error
  }
}

/** How the channel is told where payloads and endings should go. */
interface Wiring {
  readonly deliver: (payload: Uint8Array) => void
  readonly ended: (error?: Error) => void
}

/**
 * Run the key exchange over the link.
 *
 * The exchange is a sequence of plaintext messages, so it travels over the same
 * link that will later carry encrypted ones — the link does not know the
 * difference, which is why it can carry both.
 */
function negotiate(options: {
  link: Link
  keys: readonly ServerRsaKey[]
  dcId: number
  now: () => number
  random?: (length: number) => Uint8Array
  signal: AbortSignal | undefined
  accept: (wiring: Wiring) => void
}): Promise<KnownAuthorization> {
  if (options.keys.length === 0) {
    throw new ValidationError('a channel with no authorization needs server keys to obtain one')
  }

  const handshake = new Handshake({
    keys: options.keys,
    dcId: options.dcId,
    now: options.now,
    ...(options.random === undefined ? {} : { random: options.random }),
  })

  return new Promise<KnownAuthorization>((resolve, reject) => {
    let settled = false

    const finish = (outcome: () => void): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      outcome()
    }

    const onAbort = (): void => {
      finish(() => reject(new CancelledError('the key exchange was abandoned')))
    }

    if (options.signal?.aborted === true) {
      reject(new CancelledError('the key exchange was abandoned'))
      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    options.accept({
      deliver: (payload) => {
        try {
          const next = handshake.receive(payload)
          if (next !== undefined) {
            options.link.send(next)
            return
          }

          const result = handshake.result
          if (result === undefined) {
            throw new ValidationError('the exchange completed without establishing a key')
          }

          finish(() =>
            resolve({
              key: result.authKey,
              salt: result.serverSalt,
              timeOffset: result.timeOffset,
            }),
          )
        } catch (error) {
          finish(() => reject(error))
        }
      },
      // A stream that ends mid-exchange leaves no key and no connection, so the
      // attempt fails rather than being reported as a channel that closed.
      ended: (error) => {
        finish(() =>
          reject(error ?? new NetworkError('the connection closed during the key exchange')),
        )
      },
    })

    try {
      options.link.send(handshake.start())
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

/** Wire the connection to the link and start driving its clock. */
function live(context: {
  options: ChannelOptions
  link: Link
  stream: ByteStream
  authorization: KnownAuthorization
  now: () => number
  later: (run: () => void, delayMs: number) => () => void
  shutdown: () => void
  isClosed: () => boolean
  accept: (wiring: Wiring) => void
}): Channel {
  const { options, link, authorization, now, later } = context
  let cancelTimer: (() => void) | undefined
  let state: ChannelState = 'ready'

  const connection = new Connection({
    key: authorization.key,
    scope: options.scope,
    salt: authorization.salt,
    client: options.client,
    send: (bytes) => link.send(bytes),
    ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.random === undefined ? {} : { random: options.random }),
    ...(authorization.timeOffset === undefined ? {} : { timeOffset: authorization.timeOffset }),
  })

  connection.start()

  /** Set the one timer to whatever the connection says is next. */
  const rearm = (): void => {
    cancelTimer?.()
    cancelTimer = undefined
    if (state !== 'ready') return

    const wakeup = connection.nextWakeup()
    if (wakeup === undefined) return

    cancelTimer = later(
      () => {
        cancelTimer = undefined
        if (state !== 'ready') return

        connection.tick()
        rearm()
      },
      Math.max(0, wakeup - now()),
    )
  }

  /**
   * End the channel, telling whatever was waiting why.
   *
   * The reason separates a call the caller withdrew from one the connection
   * lost, which is the difference between a call that must not be made again
   * and one that is worth making on the next channel. Collapsing them would
   * leave that decision to be guessed at from a message.
   */
  const end = (reason: Error): void => {
    if (state === 'closed') return
    state = 'closed'

    cancelTimer?.()
    cancelTimer = undefined
    connection.stop(reason)
    context.shutdown()
  }

  context.accept({
    deliver: (payload) => {
      connection.receive(payload)
      rearm()
    },
    ended: (error) => {
      const reported = state !== 'closed'
      end(new NetworkError('the connection ended', error === undefined ? {} : { cause: error }))

      // Only an ending the channel did not ask for is reported: closing it is
      // something the caller already knows about. A peer that hung up cleanly
      // and one that vanished stay distinguishable here.
      if (!reported) return
      if (error === undefined) options.onClosed?.()
      else options.onClosed?.(error)
    },
  })

  rearm()

  return {
    dcId: options.address.id,
    authorization,
    get state() {
      return state
    },
    invoke(query, invokeOptions) {
      if (state !== 'ready') {
        return Promise.reject(new NetworkError('the channel is closed'))
      }

      const answer = connection.invoke(query, invokeOptions ?? {})
      rearm()

      return answer
    },
    close() {
      end(new CancelledError('the channel was closed'))
    },
  }
}

function defaultOpen(request: StreamRequest): Promise<ByteStream> {
  return connectTcp(request)
}

function defaultSchedule(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs)

  return () => clearTimeout(timer)
}
