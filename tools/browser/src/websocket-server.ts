// SPDX-License-Identifier: MPL-2.0

/**
 * Just enough of a WebSocket server to answer a browser.
 *
 * Test infrastructure, never shipped. It exists so that the browser's own
 * `WebSocket` has something real to talk to: a stub that resolved without a
 * network would prove nothing about the transport, which is the one layer that
 * cannot be checked without one.
 *
 * Written here rather than taken from a package because it is a hundred lines of
 * a published specification — the opening handshake of RFC 6455 §4.2 and the
 * frame format of §5 — and adding a dependency to a repository that has none,
 * for a tool that runs a browser check, is a poor trade.
 *
 * It implements what a browser client needs and nothing else: binary and text
 * frames, close, ping and pong, and unmasking. It does not fragment what it
 * sends, does not compress, and does not mask — a server never masks.
 */

import { createHash } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'

/** What separates the lines of an HTTP message. */
const CRLF = String.fromCharCode(13, 10)

/** The constant RFC 6455 §4.2.2 appends to the client's key. */
const ACCEPT_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** Frame opcodes, from §5.2. */
const CONTINUATION = 0x0
const TEXT = 0x1
const BINARY = 0x2
const CLOSE = 0x8
const PING = 0x9
const PONG = 0xa

/** One connection, as the thing driving it sees it. */
export interface WebSocketPeer {
  /** Send bytes as a binary frame. */
  send(data: Uint8Array): void
  /** Close cleanly. */
  close(): void
  /** Whether the socket can still carry frames. */
  readonly open: boolean
}

/**
 * How a connection is handled.
 *
 * Handed the address the page asked for as well, so one route can serve
 * several peers told apart by the query — a datacenter per account, say.
 */
export type WebSocketHandler = (
  peer: WebSocketPeer,
  url: URL,
) => {
  readonly onData?: (data: Uint8Array) => void
  readonly onClose?: () => void
}

/** The `Sec-WebSocket-Accept` value a key requires. */
function accept(key: string): string {
  return createHash('sha1')
    .update(key + ACCEPT_GUID)
    .digest('base64')
}

/** Build a frame the browser will accept: final, unmasked, with the right length form. */
function frame(opcode: number, payload: Uint8Array): Uint8Array {
  const length = payload.length
  let header: Uint8Array

  if (length < 126) {
    header = Uint8Array.from([0x80 | opcode, length])
  } else if (length < 65_536) {
    header = new Uint8Array(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    new DataView(header.buffer).setUint16(2, length, false)
  } else {
    header = new Uint8Array(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    new DataView(header.buffer).setBigUint64(2, BigInt(length), false)
  }

  const out = new Uint8Array(header.length + length)
  out.set(header, 0)
  out.set(payload, header.length)

  return out
}

/**
 * Attach WebSocket endpoints to a server, by path.
 *
 * One listener for all of them, deliberately. Node calls every `upgrade`
 * listener for every upgrade, so a second handler answering "not found" for a
 * path it does not own would write that answer into a socket the first one had
 * already upgraded. That reaches the browser as a frame it cannot parse, some
 * way into a connection that looked like it was working.
 *
 * A path nothing claims is refused rather than ignored, so one typed wrongly
 * fails visibly instead of hanging.
 */
export function serveWebSockets(server: Server, routes: Record<string, WebSocketHandler>): void {
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    const handle = routes[path]

    if (handle === undefined) {
      socket.end(`HTTP/1.1 404 Not Found${CRLF}${CRLF}`)

      return
    }

    const key = request.headers['sec-websocket-key']

    if (typeof key !== 'string') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')

      return
    }

    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept(key)}`,
        '',
        '',
      ].join('\r\n'),
    )

    let closed = false
    const peer: WebSocketPeer = {
      send: (data) => void socket.write(frame(BINARY, data)),
      close() {
        if (closed) return
        closed = true
        socket.write(frame(CLOSE, new Uint8Array(0)))
        socket.end()
      },
      get open() {
        return !closed
      },
    }

    const hooks = handle(peer, new URL(request.url ?? '/', 'http://localhost'))

    // Whatever arrived with the upgrade belongs to the stream that follows it.
    let buffer = Buffer.concat([head])
    let fragments: Uint8Array[] = []

    const finish = (): void => {
      if (closed) return
      closed = true
      hooks.onClose?.()
      socket.destroy()
    }

    /**
     * Act on one frame.
     *
     * Returns false when the connection has ended, so the loop reading frames
     * out of the buffer stops rather than acting on what followed a close.
     */
    const handleFrame = (read: Frame): boolean => {
      if (read.opcode === CLOSE) {
        peer.close()
        finish()

        return false
      }

      if (read.opcode === PING) {
        socket.write(frame(PONG, read.payload))

        return true
      }

      if (read.opcode === PONG) return true

      if (!read.final) {
        fragments.push(read.payload)

        return true
      }

      if (read.opcode === CONTINUATION) {
        fragments.push(read.payload)
        const whole = joined(fragments)
        fragments = []
        hooks.onData?.(whole)

        return true
      }

      if (read.opcode === TEXT || read.opcode === BINARY) hooks.onData?.(read.payload)

      return true
    }

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])

      for (;;) {
        const read = readFrame(buffer)
        if (read === undefined) return

        buffer = buffer.subarray(read.consumed)
        if (!handleFrame(read)) return
      }
    })

    socket.on('close', finish)
    socket.on('error', finish)
  })
}

/** Join fragments into the message they make up. */
function joined(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0
  for (const part of parts) length += part.length

  const out = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  return out
}

/** One frame, as it was read off the wire. */
interface Frame {
  readonly opcode: number
  readonly final: boolean
  readonly payload: Uint8Array
  readonly consumed: number
}

/** Read one frame, or nothing when it has not all arrived. */
function readFrame(buffer: Buffer): Frame | undefined {
  if (buffer.length < 2) return undefined

  const first = buffer[0] as number
  const second = buffer[1] as number
  const final = (first & 0x80) !== 0
  const opcode = first & 0x0f
  const masked = (second & 0x80) !== 0
  let length = second & 0x7f
  let at = 2

  if (length === 126) {
    if (buffer.length < at + 2) return undefined
    length = buffer.readUInt16BE(at)
    at += 2
  } else if (length === 127) {
    if (buffer.length < at + 8) return undefined
    length = Number(buffer.readBigUInt64BE(at))
    at += 8
  }

  // Every frame a browser sends is masked; a server's are not. RFC 6455 §5.3.
  let mask: Buffer | undefined
  if (masked) {
    if (buffer.length < at + 4) return undefined
    mask = buffer.subarray(at, at + 4)
    at += 4
  }

  if (buffer.length < at + length) return undefined

  const payload = new Uint8Array(buffer.subarray(at, at + length))
  if (mask !== undefined) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = (payload[index] as number) ^ (mask[index % 4] as number)
    }
  }

  return { opcode, final, payload, consumed: at + length }
}
