/**
 * A datacenter, across the connections a client makes to it.
 *
 * A peer models one conversation: it holds the transport it was opened with,
 * the framing that was announced, the session the client chose and the exchange
 * that ran on it. All of that is per-connection and must not be shared, because
 * two sockets are two conversations.
 *
 * An authorization is not. A client negotiates a long-lived key on one
 * connection, vouches for a temporary one on a second, and then uses that
 * temporary key on every connection after — none of which performs an exchange,
 * because there is nothing left to agree. A datacenter that forgot its client
 * between sockets would answer the third connection as a stranger.
 *
 * ```
 *   connection 0 ─ exchange ──> permanent key ─┐
 *   connection 1 ─ exchange + binding ─────────┤ held here
 *   connection 2 ─ no exchange, encrypted ─────┘
 * ```
 *
 * So this owns what outlives a socket — the endpoint, the server key pair and
 * the authorizations — and hands each connection its own peer, seeded with
 * whichever of those apply. It implements none of the protocol itself.
 */

import type { StreamRequest } from '../../src/network/channel.js'
import type { ByteStream } from '../../src/network/tcp.js'
import type { TlScope, TlValue } from '../../src/tl/index.js'
import type { HandshakeResult } from './handshake.js'
import { createServerKey, type ServerKey } from './keys.js'
import { type Fault, MockServer } from './server.js'

/** How a datacenter is built. */
export interface MockDatacenterOptions {
  /** The identifier a client knows this datacenter by. */
  readonly id?: number
  /** The address it answers on. Nothing routes to it. */
  readonly host?: string
  readonly port?: number
  /** The key pair every connection offers. Generated when omitted. */
  readonly key?: ServerKey
  /** The tables its peers encode and decode with. */
  readonly scope?: TlScope
  /** Seconds since the epoch, as its peers report during an exchange. */
  readonly serverTime?: number
  /** Deliberate misbehaviour, applied to every connection it answers. */
  readonly faults?: ReadonlySet<Fault>
  /**
   * What its peers answer an API method with, where a case models one.
   *
   * Told which datacenter is being asked, so one function can stand for
   * several of them — a file held at one datacenter and asked for at another
   * is the case that needs it.
   */
  readonly api?: (query: TlValue, dcId: number) => TlValue | undefined
}

/** One connection this datacenter has answered. */
export interface MockConnection {
  /** The peer holding this conversation. */
  readonly peer: MockServer
  /** Whether the client still holds the stream open. */
  open(): boolean
  /** End it the way a peer that vanished ends one. */
  fail(error: Error): void
}

/**
 * One datacenter, answering in this process.
 *
 * Not a client and not a network: it answers connections, and what it remembers
 * between them is exactly what a datacenter remembers about a client.
 */
export class MockDatacenter {
  readonly id: number
  readonly host: string
  readonly port: number
  /** The key pair every connection offers, so a client can trust its fingerprint. */
  readonly key: ServerKey

  /** Every connection answered, oldest first. */
  readonly connections: MockConnection[] = []

  readonly #options: MockDatacenterOptions
  #permanent: HandshakeResult | undefined
  #temporary: HandshakeResult | undefined

  constructor(options: MockDatacenterOptions = {}) {
    this.#options = options
    this.id = options.id ?? 2
    this.host = options.host ?? '127.0.0.2'
    this.port = options.port ?? 443
    this.key = options.key ?? createServerKey()
  }

  /** The long-lived key this client established, once it has. */
  get permanent(): HandshakeResult | undefined {
    this.#collect()

    return this.#permanent
  }

  /** The key with a lifetime, once one has been established. */
  get temporary(): HandshakeResult | undefined {
    this.#collect()

    return this.#temporary
  }

  /** Whether this address is the one a request names. */
  answers(request: { readonly host: string; readonly port: number }): boolean {
    return request.host === this.host && request.port === this.port
  }

  /**
   * Answer a new connection.
   *
   * Each gets its own peer, offered every authorization this client has
   * established here. Which of them the connection turns out to be using — or
   * whether it negotiates a new one instead — is settled by its first frame
   * rather than decided here, because the two are indistinguishable until then.
   */
  connect(request: StreamRequest): ByteStream {
    this.#collect()
    const { api } = this.#options

    const peer = new MockServer({
      key: this.key,
      ...(this.#options.scope === undefined ? {} : { scope: this.#options.scope }),
      ...(this.#options.serverTime === undefined ? {} : { serverTime: this.#options.serverTime }),
      ...(this.#options.faults === undefined ? {} : { faults: this.#options.faults }),
      ...(api === undefined ? {} : { api: (query: TlValue) => api(query, this.id) }),
      // The long-lived key is what a binding is checked against, and a binding
      // arrives on a different connection from the one that established it.
      ...(this.#permanent === undefined ? {} : { permanentKey: this.#permanent.authKey }),
      // Every key this client has established. Which of them a connection is
      // using — if any — is decided by what its messages name, not here: a
      // connection that negotiates a new key is indistinguishable from one
      // reusing an old one until its first frame arrives.
      authorizations: this.#known(),
    })

    const wire = stream(peer)
    this.connections.push({ peer, open: wire.isOpen, fail: wire.fail })

    return wire.attach(request)
  }

  /** Every authorization this client has established here, newest first. */
  #known(): readonly HandshakeResult[] {
    return [this.#temporary, this.#permanent].filter(
      (authorization): authorization is HandshakeResult => authorization !== undefined,
    )
  }

  /**
   * Take note of anything the connections have settled on.
   *
   * Read from the peers rather than reported by them, because a peer answers a
   * conversation and has no way to tell this it has finished one. A key with a
   * lifetime is the temporary one; a key without is the long-lived one, which
   * is the same thing that distinguishes them to a client.
   */
  #collect(): void {
    for (const connection of this.connections) {
      const settled = connection.peer.result
      if (settled === undefined) continue

      // A long-lived key is established once and kept. A key with a lifetime is
      // replaced: a client that negotiates another has stopped using the one
      // before it, and a datacenter that kept the older one would refuse the
      // traffic the client is actually sending.
      if (settled.expiresIn === undefined) this.#permanent ??= settled
      else this.#temporary = settled
    }
  }
}

/**
 * A stream wired straight to a peer.
 *
 * Bytes the client writes go to the peer; whatever it answers comes back on the
 * next turn of the microtask queue, which is close enough to a socket for a
 * test and exact enough to assert on.
 */
function stream(peer: MockServer) {
  let onData: (bytes: Uint8Array) => void = () => {}
  let onClose: (error?: Error) => void = () => {}
  let open = true

  const byteStream: ByteStream = {
    write(bytes) {
      if (!open) throw new Error('cannot write to a stream that is closed')

      // A datacenter that cannot make sense of what arrived hangs up; it does
      // not answer, and it does not reach back into the client. Ending the
      // stream is how that reaches a client on a real socket, and a case that
      // let the failure surface as a throw here would be testing this harness
      // rather than what a client does when a datacenter drops it.
      let answer: Uint8Array
      try {
        answer = peer.receive(bytes)
      } catch (error) {
        open = false
        queueMicrotask(() => onClose(error instanceof Error ? error : new Error(String(error))))

        return
      }

      if (answer.length > 0) queueMicrotask(() => open && onData(answer))
    },
    close() {
      open = false
    },
    get open() {
      return open
    },
    get pending() {
      return 0
    },
  }

  return {
    isOpen: () => open,
    fail(error: Error) {
      open = false
      onClose(error)
    },
    attach(request: StreamRequest): ByteStream {
      onData = request.onData
      onClose = request.onClose

      return byteStream
    },
  }
}
