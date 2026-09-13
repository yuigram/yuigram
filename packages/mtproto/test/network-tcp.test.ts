/**
 * The socket underneath everything else.
 *
 * Driven against a real listener on the loopback interface, because the cases
 * that matter are the ones an in-memory stand-in cannot produce: a chunk split
 * where the kernel chose to split it, a peer that vanishes, a connection
 * refused. The lifecycle cases that depend on timing use an injected socket
 * instead, so a timeout is a fact rather than a wait.
 */

import { EventEmitter } from 'node:events'
import { createServer, type Server, type Socket } from 'node:net'
import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import { afterEach, describe, expect, it } from 'vitest'
import type { ByteStream } from '../src/network/stream.js'
import { connectTcp } from '../src/network/tcp.js'

/** Listeners opened by a case, closed when it ends. */
const servers: Server[] = []
const streams: ByteStream[] = []
const connections: Socket[] = []

afterEach(async () => {
  for (const stream of streams.splice(0)) {
    if (stream.open) stream.close()
  }
  // A listener does not close while a connection it accepted is still open.
  for (const socket of connections.splice(0)) socket.destroy()

  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve()
          })
        }),
    ),
  )
})

/** A listener on an ephemeral port, and the connections it accepts. */
async function listener(onConnection?: (socket: Socket) => void) {
  const accepted: Socket[] = []
  const server = createServer((socket) => {
    accepted.push(socket)
    connections.push(socket)
    onConnection?.(socket)
  })
  servers.push(server)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const info = server.address()
  if (info === null || typeof info === 'string') throw new Error('the listener has no port')

  return { port: info.port, accepted }
}

/** A port with nothing behind it. */
async function deadPort(): Promise<number> {
  const { port } = await listener()
  const server = servers.pop()
  await new Promise<void>((resolve) => {
    server?.close(() => {
      resolve()
    })
  })

  return port
}

/** Connect, recording everything the stream reports. */
async function open(port: number, overrides: Record<string, unknown> = {}) {
  const received: Uint8Array[] = []
  const closes: Array<Error | undefined> = []

  const stream = await connectTcp({
    host: '127.0.0.1',
    port,
    onData: (bytes) => received.push(Uint8Array.from(bytes)),
    onClose: (error) => closes.push(error),
    ...overrides,
  })
  streams.push(stream)

  return { stream, received, closes }
}

/** Everything received, joined. */
function joined(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** Wait until a condition holds, or fail rather than hang. */
async function until(predicate: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** A socket that does nothing until a case makes it do something. */
function inertSocket() {
  const socket = new EventEmitter() as EventEmitter & Socket & { destroyed: boolean }
  socket.destroyed = false
  socket.setNoDelay = (() => socket) as Socket['setNoDelay']
  socket.write = (() => true) as Socket['write']
  socket.destroy = ((): Socket => {
    socket.destroyed = true
    return socket
  }) as Socket['destroy']

  return socket
}

describe('opening a connection', () => {
  it('resolves once the handshake has completed', async () => {
    const { port, accepted } = await listener()
    const { stream } = await open(port)

    expect(stream.open).toBe(true)
    await until(() => accepted.length === 1, 'the listener to accept')
  })

  it('refuses a connection nothing is listening for', async () => {
    const port = await deadPort()

    await expect(
      connectTcp({ host: '127.0.0.1', port, onData: () => {}, onClose: () => {} }),
    ).rejects.toBeInstanceOf(Error)
  })

  it('gives up on a handshake that does not complete', async () => {
    const socket = inertSocket()

    // The socket never connects, so only the bound this client chose ends the
    // attempt. Left to the operating system it would be minutes.
    await expect(
      connectTcp({
        host: '10.0.0.1',
        port: 443,
        connectTimeout: 20,
        onData: () => {},
        onClose: () => {},
        open: () => socket,
      }),
    ).rejects.toBeInstanceOf(NetworkError)
    expect(socket.destroyed).toBe(true)
  })

  it('refuses a timeout that would never elapse', async () => {
    for (const connectTimeout of [0, -1, 1.5]) {
      expect(() =>
        connectTcp({
          host: '127.0.0.1',
          port: 1,
          connectTimeout,
          onData: () => {},
          onClose: () => {},
        }),
      ).toThrow(ValidationError)
    }
  })

  it('does not end a connection that outlives the handshake bound', async () => {
    const { port } = await listener()
    const { stream, closes } = await open(port, { connectTimeout: 30 })

    // The bound is on the handshake, not on the connection. A stream still open
    // long after it would otherwise be a healthy connection killed on a timer.
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(stream.open).toBe(true)
    expect(closes).toEqual([])
  })

  it('does not report a close for an attempt that never opened', async () => {
    const port = await deadPort()
    const closes: Array<Error | undefined> = []

    await connectTcp({
      host: '127.0.0.1',
      port,
      onData: () => {},
      onClose: (error) => closes.push(error),
    }).catch(() => undefined)

    // The attempt failed, which the rejected promise already said. Reporting a
    // close as well would have the caller handle one failure twice.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(closes).toEqual([])
  })
})

describe('abandoning an attempt', () => {
  it('is refused before it starts when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      connectTcp({
        host: '127.0.0.1',
        port: 1,
        onData: () => {},
        onClose: () => {},
        signal: controller.signal,
        open: () => inertSocket(),
      }),
    ).rejects.toBeInstanceOf(CancelledError)
  })

  it('is abandoned while the handshake is still in flight', async () => {
    const controller = new AbortController()
    const socket = inertSocket()

    const attempt = connectTcp({
      host: '10.0.0.1',
      port: 443,
      connectTimeout: 5000,
      onData: () => {},
      onClose: () => {},
      signal: controller.signal,
      open: () => socket,
    })

    controller.abort()

    await expect(attempt).rejects.toBeInstanceOf(CancelledError)
    expect(socket.destroyed).toBe(true)
  })
})

describe('carrying bytes', () => {
  it('delivers what the peer sent', async () => {
    const { port } = await listener((socket) => socket.write(Buffer.from([1, 2, 3, 4])))
    const { received } = await open(port)

    await until(() => received.length > 0, 'the first chunk')
    expect(joined(received)).toEqual(Uint8Array.from([1, 2, 3, 4]))
  })

  it('delivers a run split wherever the network split it', async () => {
    const payload = Uint8Array.from({ length: 200_000 }, (_, index) => index & 0xff)
    const { port } = await listener((socket) => {
      // Written in pieces, and the kernel is free to split it further.
      for (let at = 0; at < payload.length; at += 7919) {
        socket.write(Buffer.from(payload.subarray(at, at + 7919)))
      }
    })
    const { received } = await open(port)

    await until(() => joined(received).length === payload.length, 'the whole run to arrive')
    expect(joined(received)).toEqual(payload)
  })

  it('sends bytes the peer reads back in order', async () => {
    const seen: Buffer[] = []
    const { port } = await listener((socket) => {
      socket.on('data', (chunk: Buffer) => seen.push(chunk))
    })
    const { stream } = await open(port)

    for (let index = 0; index < 50; index += 1) {
      stream.write(Uint8Array.of(index))
    }

    await until(() => Buffer.concat(seen).length === 50, 'the peer to read everything')
    expect([...Buffer.concat(seen)]).toEqual(Array.from({ length: 50 }, (_, index) => index))
  })

  it('keeps order for a payload larger than one write can take', async () => {
    const seen: Buffer[] = []
    const { port } = await listener((socket) => {
      socket.on('data', (chunk: Buffer) => seen.push(chunk))
    })
    const { stream } = await open(port)

    // More than a socket hands to the operating system at once, so the rest is
    // queued. It is delivered whole and in order rather than dropped. A file
    // part is a megabyte, which is the size that actually occurs.
    const payload = Uint8Array.from({ length: 1_048_576 }, (_, index) => index & 0xff)
    stream.write(payload)

    await until(() => Buffer.concat(seen).length === payload.length, 'the whole payload')
    expect(Uint8Array.from(Buffer.concat(seen))).toEqual(payload)
  }, 30_000)

  it('reports what the socket has taken but not yet sent', async () => {
    const socket = inertSocket()
    let queued = 0
    socket.write = ((chunk: Uint8Array) => {
      queued += chunk.length
      return false
    }) as Socket['write']
    Object.defineProperty(socket, 'writableLength', { get: () => queued })

    const opening = connectTcp({
      host: '10.0.0.1',
      port: 443,
      onData: () => {},
      onClose: () => {},
      open: () => socket,
    })
    socket.emit('connect')
    const stream = await opening

    expect(stream.pending).toBe(0)
    stream.write(Uint8Array.from({ length: 1000 }, () => 0x55))

    // Reported, not acted on: the socket queues what it cannot send yet and
    // never drops or reorders it, so throttling here would add a second buffer
    // with nothing to consume it.
    expect(stream.pending).toBe(1000)
  })
})

describe('ending a connection', () => {
  it('reports a peer that closed cleanly', async () => {
    const { port } = await listener((socket) => socket.end())
    const { stream, closes } = await open(port)

    await until(() => closes.length === 1, 'the close to be reported')
    expect(closes[0]).toBeUndefined()
    expect(stream.open).toBe(false)
  })

  it('reports a stream that ended because of a failure', async () => {
    const socket = inertSocket()
    const closes: Array<Error | undefined> = []

    const opening = connectTcp({
      host: '10.0.0.1',
      port: 443,
      onData: () => {},
      onClose: (error) => closes.push(error),
      open: () => socket,
    })
    socket.emit('connect')
    await opening

    // A socket reports the failure and then closes. The two are one ending, and
    // the failure is what the layer above needs in order to tell it from a peer
    // that hung up cleanly.
    socket.emit('error', new Error('reset by peer'))
    socket.emit('close')

    expect(closes).toHaveLength(1)
    expect(closes[0]).toBeInstanceOf(Error)
  })

  it('reports a close from this side without a failure', async () => {
    const { port } = await listener()
    const { stream, closes } = await open(port)

    stream.close()

    expect(closes).toEqual([undefined])
    expect(stream.open).toBe(false)
  })

  it('closes once, however many times it is asked', async () => {
    const { port } = await listener()
    const { stream, closes } = await open(port)

    stream.close()
    stream.close()
    stream.close()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(closes).toEqual([undefined])
  })

  it('refuses to write once closed', async () => {
    const { port } = await listener()
    const { stream } = await open(port)
    stream.close()

    expect(() => stream.write(Uint8Array.of(1))).toThrow(ValidationError)
  })

  it('delivers nothing that arrives after it has closed', async () => {
    const socket = inertSocket()
    const received: Uint8Array[] = []

    const opening = connectTcp({
      host: '10.0.0.1',
      port: 443,
      onData: (bytes) => received.push(bytes),
      onClose: () => {},
      open: () => socket,
    })
    socket.emit('connect')
    const stream = await opening

    stream.close()
    // A chunk already in flight when the stream was closed belongs to a
    // connection nobody is listening to any more.
    socket.emit('data', Buffer.from([1, 2, 3]))

    expect(received).toEqual([])
  })

  it('delivers nothing after it has closed', async () => {
    const { port } = await listener((socket) => {
      setTimeout(() => socket.write(Buffer.from([9, 9, 9])), 10)
    })
    const { stream, received } = await open(port)

    stream.close()
    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(received).toEqual([])
  })
})
