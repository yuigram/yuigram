/**
 * A connection, as a stream of bytes.
 *
 * The contract everything above the network is written against. A chunk goes
 * out exactly as it was given and comes in exactly as it arrived, because
 * deciding where one message ends belongs to the layer that knows what a
 * message is.
 *
 * The contract is here on its own, with no implementation and nothing imported,
 * because there is more than one way to open such a stream and which one is
 * available is a property of the runtime. A server opens a TCP socket. A
 * browser cannot — it has no such interface — and opens a WebSocket instead.
 * Both produce this.
 */

/** How a stream is opened. */
export interface StreamOptions {
  /** Where to connect. A host name or an address, depending on what opens it. */
  readonly host: string
  /** The port, for the transports that have one. */
  readonly port: number
  /** Milliseconds to wait for the connection to establish. */
  readonly connectTimeout?: number
  /** Bytes as they arrived: in order, unmodified, and not necessarily whole. */
  readonly onData: (bytes: Uint8Array) => void
  /**
   * The stream has ended, once.
   *
   * Carries the failure when it ended because of one. A peer that closes
   * cleanly and a peer that vanishes are different events, and the layer above
   * treats them differently.
   */
  readonly onClose: (error?: Error) => void
  /** Abandon the attempt. Has no effect once the stream is open. */
  readonly signal?: AbortSignal
}

/** An open stream of bytes. */
export interface ByteStream {
  /** Send bytes. They are delivered in the order they were given. */
  write(bytes: Uint8Array): void
  /** Close the stream. Idempotent. */
  close(): void
  /** Whether the stream can still carry bytes. */
  readonly open: boolean
  /**
   * Bytes accepted but not yet handed to the operating system.
   *
   * What is queued is never dropped or reordered, so this is reported rather
   * than acted on. A caller that produces faster than the connection drains can
   * watch it; nothing here throttles.
   */
  readonly pending: number
}

/**
 * Open a stream to an address.
 *
 * Resolves once the connection is established, so a caller that has a stream
 * has a connection. Every later failure arrives through `onClose` instead,
 * because by then there is no call left to fail.
 */
export type Connector = (options: StreamOptions) => Promise<ByteStream>
