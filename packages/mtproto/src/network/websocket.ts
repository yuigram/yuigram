/**
 * A WebSocket, as a stream of bytes.
 *
 * What a browser has instead of a socket. The framing and the obfuscation above
 * this are unchanged — a WebSocket carries binary messages and the protocol
 * carries its own lengths, so the layer above neither knows nor cares which of
 * the two is underneath.
 *
 * One difference is real and is handled here: a WebSocket preserves message
 * boundaries, and a socket does not. That makes the stream *more* structured
 * than the contract promises, not less, so nothing above has to change — a
 * layer prepared for a chunk to arrive split is also prepared for it not to.
 *
 * **Where it connects.** A WebSocket needs a URL, and the datacenter list gives
 * an address and a port. The default builds `wss://host:port/apiws`, which is
 * the path Telegram serves this on, and a program whose datacenter list names
 * the web endpoints therefore needs no configuration. A program whose list
 * names raw addresses has to supply `url`, because an address is not a name a
 * certificate can be issued for and no default can invent one.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import type { ByteStream, StreamOptions } from './stream.js'

/**
 * How long to wait for the connection, in milliseconds.
 *
 * The same bound the socket transport uses, for the same reason: a connection
 * that has not opened in ten seconds is one worth trying elsewhere. How long a
 * *request* may take is a different clock.
 */
const DEFAULT_CONNECT_TIMEOUT = 10_000

/** How a WebSocket stream is opened. */
export interface WebSocketOptions extends StreamOptions {
  /**
   * The URL to connect to, from the address the datacenter list gave.
   *
   * Replaced to reach a different path, to speak plain `ws` against something
   * local, or to route through a gateway.
   */
  readonly url?: (host: string, port: number) => string

  /**
   * Open the underlying socket.
   *
   * Replaced to drive the lifecycle without a network. The default uses the
   * runtime's own `WebSocket`, which every browser, every worker, Deno and Bun
   * provide as a global, as does Node from version 22.
   */
  readonly open?: (url: string) => WebSocket
}

/** The default endpoint: what Telegram serves the protocol on over a WebSocket. */
function defaultUrl(host: string, port: number): string {
  return `wss://${host}:${port}/apiws`
}

/** The runtime's own WebSocket, or a failure that names what is missing. */
function defaultOpen(url: string): WebSocket {
  const Ctor = globalThis.WebSocket

  if (Ctor === undefined) {
    throw new NetworkError('this runtime provides no `WebSocket`')
  }

  return new Ctor(url)
}

/** Open a stream to an address over a WebSocket. */
export function connectWebSocket(options: WebSocketOptions): Promise<ByteStream> {
  const { host, port } = options
  const timeout = options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT

  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new ValidationError(`connectTimeout must be a positive number, received ${timeout}`)
  }

  const url = (options.url ?? defaultUrl)(host, port)

  return new Promise<ByteStream>((resolve, reject) => {
    let socket: WebSocket

    try {
      socket = (options.open ?? defaultOpen)(url)
    } catch (error) {
      reject(error instanceof Error ? error : new NetworkError(String(error)))

      return
    }

    // Messages arrive as `Blob` by default, which would make reading them
    // asynchronous for no reason: the protocol wants bytes and the runtime
    // already has them.
    socket.binaryType = 'arraybuffer'

    let settled = false
    let closed = false
    let reported = false
    let failure: Error | undefined

    const timer = setTimeout(() => {
      finish(new NetworkError(`connecting to ${url} timed out after ${timeout}ms`))
    }, timeout)

    /** End the attempt, or the stream, exactly once. */
    const finish = (error?: Error): void => {
      failure ??= error
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)

      if (!closed) {
        closed = true
        // `close` rather than an abort: a WebSocket has a closing handshake and
        // skipping it makes a clean shutdown look like a dropped connection to
        // the other side.
        try {
          socket.close()
        } catch {
          // A socket that has not opened yet refuses to close. It ends anyway.
        }
      }

      if (settled) {
        if (reported) return
        reported = true
        options.onClose(failure)

        return
      }

      settled = true
      reject(failure ?? new NetworkError(`the connection to ${url} closed`))
    }

    const onAbort = (): void => {
      finish(new CancelledError(`connecting to ${url} was abandoned`))
    }

    if (options.signal?.aborted === true) {
      clearTimeout(timer)
      finish(new CancelledError(`connecting to ${url} was abandoned`))

      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    socket.onopen = (): void => {
      clearTimeout(timer)
      settled = true

      resolve({
        write(bytes) {
          if (closed) {
            throw new ValidationError('cannot write to a stream that is closed')
          }
          // A copy rather than the caller's view: `send` may queue the buffer,
          // and the buffer underneath a subarray is usually a larger one this
          // code has no claim on.
          socket.send(bytes.slice().buffer)
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
          return socket.bufferedAmount
        },
      })
    }

    socket.onmessage = (event: MessageEvent): void => {
      const data: unknown = event.data

      if (data instanceof ArrayBuffer) {
        options.onData(new Uint8Array(data))

        return
      }

      // Anything else means the other end is not speaking this protocol — a
      // text frame where binary was expected is a proxy or a wrong endpoint,
      // not a message with a byte or two out of place.
      finish(new NetworkError(`${url} sent a frame that is not binary`))
    }

    // A WebSocket reports a failure with no detail — deliberately, so that a
    // page cannot probe a network by listening — and then closes. The failure
    // is kept and delivered with the close rather than as an event of its own.
    socket.onerror = (): void => {
      failure ??= new NetworkError(`the connection to ${url} failed`)
    }

    socket.onclose = (event: CloseEvent): void => {
      if (failure === undefined && !event.wasClean) {
        failure = new NetworkError(`${url} closed the connection with code ${event.code}`)
      }
      finish()
    }
  })
}
