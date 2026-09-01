/**
 * A TCP socket, as a stream of bytes.
 *
 * The one place in the subsystem that opens a connection. Everything above it
 * is written against bytes arriving and bytes leaving, which is what makes the
 * rest decidable without a network; this is where that stops being true.
 *
 * It is deliberately thin. It does not frame, obfuscate, buffer for
 * reassembly, or hold any protocol state — a chunk goes out exactly as it was
 * given and comes in exactly as it arrived, because deciding where one message
 * ends belongs to the layer that knows what a message is.
 *
 * It also does not decide what a failure means. A refused connection, a timed
 * out handshake and a peer that hung up are reported and not acted on:
 * recovering from any of them needs to know which datacenter was being reached
 * and what was in flight, and neither is knowable here.
 */

import { connect as netConnect, type Socket } from 'node:net'
import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'

/**
 * How long to wait for the handshake, in milliseconds.
 *
 * A connection that has not completed in ten seconds is one worth trying
 * elsewhere. This bounds the TCP handshake only — how long a *request* may take
 * is a different clock, measured against different work, and belongs to the
 * layer that tracks requests.
 */
const DEFAULT_CONNECT_TIMEOUT = 10_000

/** How a stream is opened. */
export interface TcpOptions {
  readonly host: string
  readonly port: number
  /** Milliseconds to wait for the handshake. Defaults to 10000. */
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
  /**
   * Open the underlying socket.
   *
   * Replaced to route the connection through a proxy, or to drive the lifecycle
   * without a network. The default opens an ordinary TCP socket.
   */
  readonly open?: (host: string, port: number) => Socket
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
   * The socket queues what it cannot send yet and never drops or reorders it,
   * so this is reported rather than acted on. A caller that produces faster
   * than the connection drains can watch it; nothing here throttles.
   */
  readonly pending: number
}

/**
 * Open a stream to an address.
 *
 * Resolves once the handshake has completed, so a caller that has a stream has
 * a connection. Every later failure arrives through `onClose` instead, because
 * by then there is no call left to fail.
 */
export function connectTcp(options: TcpOptions): Promise<ByteStream> {
  const { host, port } = options
  const timeout = options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT

  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new ValidationError(`connectTimeout must be a positive number, received ${timeout}`)
  }

  return new Promise<ByteStream>((resolve, reject) => {
    const socket = (options.open ?? defaultOpen)(host, port)

    let settled = false
    let closed = false
    let reported = false
    let failure: Error | undefined

    const timer = setTimeout(() => {
      // The socket is destroyed rather than left to the operating system's own
      // timeout, which is minutes long and is not a bound this client chose.
      finish(new NetworkError(`connecting to ${host}:${port} timed out after ${timeout}ms`))
    }, timeout)

    /** End the attempt, or the stream, exactly once. */
    const finish = (error?: Error): void => {
      failure ??= error
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)

      if (!closed) {
        closed = true
        socket.destroy()
      }

      if (settled) {
        // The socket emits its own close after being destroyed, so ending the
        // stream and the event that follows are the same ending. Reported once.
        if (reported) return
        reported = true
        options.onClose(failure)
        return
      }

      settled = true
      reject(failure ?? new NetworkError(`the connection to ${host}:${port} closed`))
    }

    const onAbort = (): void => {
      finish(new CancelledError(`connecting to ${host}:${port} was abandoned`))
    }

    if (options.signal?.aborted === true) {
      clearTimeout(timer)
      socket.destroy()
      reject(new CancelledError(`connecting to ${host}:${port} was abandoned`))
      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    socket.on('connect', () => {
      clearTimeout(timer)
      // Messages are small and latency matters more than the packets saved by
      // waiting for more of them, so the delay algorithm is turned off.
      socket.setNoDelay(true)
      settled = true

      resolve({
        write(bytes) {
          if (closed) {
            throw new ValidationError('cannot write to a stream that is closed')
          }
          socket.write(bytes)
        },
        close() {
          // Reported as a clean end: a stream closed from this side is not a
          // failure, whatever the socket emits on its way down.
          if (!closed) finish()
        },
        get open() {
          return !closed
        },
        get pending() {
          return socket.writableLength
        },
      })
    })

    // A socket reports a failure and then closes, so the failure is kept and
    // delivered with the close rather than as an event of its own.
    socket.on('error', (error: Error) => {
      failure ??= error
    })

    socket.on('close', () => {
      finish()
    })

    socket.on('data', (chunk: Buffer) => {
      if (!closed) options.onData(chunk)
    })
  })
}

function defaultOpen(host: string, port: number): Socket {
  return netConnect({ host, port })
}
