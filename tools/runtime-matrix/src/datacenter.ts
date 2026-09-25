/**
 * The peer a runtime is checked against.
 *
 * One mock datacenter — the test suite's own, doing the real key exchange and
 * the real encrypted session — reachable three ways:
 *
 * ```
 *   TCP                  Node, Bun and Deno, through an account's default connector
 *   WebSocket /mtproto   an edge worker, which has no sockets of its own
 *   HTTP                 GET /key      the public key, as PKCS#1 PEM
 *                        POST /deliver push an update down the newest live connection
 *                        GET /closed   how many connections have ended
 *                        /bot<t>/getMe a Bot API stand-in; /bot<t>/slow never answers
 * ```
 *
 * A fresh one per runtime: a datacenter remembers the long-lived key its first
 * client bound, and refuses another client's binding, which is a fact about
 * the peer rather than about the client under test.
 */

import { createPublicKey } from 'node:crypto'
import { createServer as createHttp, type ServerResponse } from 'node:http'
import { createServer as createTcp } from 'node:net'
import { REGISTRY as API } from '../../../packages/mtproto/src/generated/api/registry.js'
import { REGISTRY as CORE } from '../../../packages/mtproto/src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../../../packages/mtproto/src/generated/mtproto/registry.js'
import type { TlValue } from '../../../packages/mtproto/src/tl/index.js'
import { TlScope } from '../../../packages/mtproto/src/tl/registry.js'
import { MockDatacenter } from '../../../packages/mtproto/test/server/datacenter.js'
import { createServerKey } from '../../../packages/mtproto/test/server/keys.js'
import { serveWebSockets } from '../../browser/src/websocket-server.js'

/** The instant both sides work from; the client is given it as well. */
export const ORIGIN_SECONDS = 1_700_000_000

/** A running datacenter, and how to stop it. */
export interface Datacenter {
  readonly tcpPort: number
  readonly httpPort: number
  close(): Promise<void>
}

const bytesOf = (value: bigint): string => {
  let hex = value.toString(16)
  if (hex.length % 2 === 1) hex = `0${hex}`
  return Buffer.from(hex, 'hex').toString('base64url')
}

/** Stand one up on two free ports. */
export async function startDatacenter(): Promise<Datacenter> {
  const key = createServerKey()
  const pem = createPublicKey({
    key: { kty: 'RSA', n: bytesOf(key.n), e: bytesOf(key.e) },
    format: 'jwk',
  })
    .export({ type: 'pkcs1', format: 'pem' })
    .toString()

  const tcp = createTcp()
  await new Promise<void>((resolve) => tcp.listen(0, '127.0.0.1', resolve))
  const tcpPort = (tcp.address() as { port: number }).port

  const datacenter = new MockDatacenter({
    id: 2,
    host: '127.0.0.1',
    port: tcpPort,
    key,
    scope: new TlScope('runtime-matrix', [CORE, MTPROTO, API]),
    serverTime: ORIGIN_SECONDS,
  })

  const live: {
    send(bytes: Uint8Array): void
    push(value: TlValue): Uint8Array | undefined
    open(): boolean
  }[] = []
  let closed = 0

  const attach = (send: (bytes: Uint8Array) => void, end: () => void, open: () => boolean) => {
    const before = datacenter.connections.length
    const stream = datacenter.connect({
      host: '127.0.0.1',
      port: tcpPort,
      onData: (bytes) => {
        if (open()) send(bytes)
      },
      onClose: () => end(),
    })
    const opened = datacenter.connections[before]
    if (opened !== undefined) live.push({ send, push: (value) => opened.peer.push(value), open })
    return stream
  }

  const sockets = new Set<import('node:net').Socket>()
  tcp.on('connection', (socket) => {
    sockets.add(socket)
    let open = true
    const stream = attach(
      (bytes) => socket.write(bytes),
      () => socket.end(),
      () => open,
    )
    socket.on('data', (data) => stream.write(new Uint8Array(data)))
    socket.on('close', () => {
      sockets.delete(socket)
      open = false
      closed += 1
      stream.close()
    })
    socket.on('error', () => undefined)
  })

  /** Push an update down the newest connection that can carry one. */
  const deliver = (): boolean => {
    // Something that carries no `pts`, so it is dispatched as it arrives rather
    // than held against a place in the stream the account has not fetched.
    const update: TlValue = {
      _: 'updateShort',
      update: { _: 'updateUserTyping', user_id: 42n, action: { _: 'sendMessageTypingAction' } },
      date: ORIGIN_SECONDS,
    }
    for (const entry of [...live].reverse()) {
      const bytes = entry.open() ? entry.push(update) : undefined
      if (bytes === undefined) continue
      entry.send(bytes)
      return true
    }
    return false
  }

  const routes: Record<string, (response: ServerResponse) => void> = {
    '/key': (response) => response.end(pem),
    '/closed': (response) => response.end(String(closed)),
    '/deliver': (response) => {
      if (deliver()) {
        response.end('pushed')
        return
      }
      response.statusCode = 409
      response.end('no live connection')
    },
  }

  const http = createHttp((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const route = routes[path]
    if (route !== undefined) {
      route(response)
      return
    }
    const method = /^\/bot[^/]+\/(\w+)$/.exec(path)?.[1]
    if (method === 'getMe') {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          ok: true,
          result: { id: 7, is_bot: true, first_name: 'Matrix', username: 'matrix_bot' },
        }),
      )
      return
    }
    // Never answered: a request only its own cancellation can end.
    if (method === 'slow') return
    response.statusCode = 404
    response.end('')
  })

  serveWebSockets(http, {
    '/mtproto': (peer) => {
      const stream = attach(
        (bytes) => peer.send(bytes),
        () => peer.close(),
        () => peer.open,
      )
      return {
        onData: (data) => stream.write(data),
        onClose: () => {
          closed += 1
          stream.close()
        },
      }
    },
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const httpPort = (http.address() as { port: number }).port

  return {
    tcpPort,
    httpPort,
    async close() {
      http.closeAllConnections()
      for (const socket of sockets) socket.destroy()
      await Promise.all([
        new Promise((resolve) => http.close(resolve)),
        new Promise((resolve) => tcp.close(resolve)),
      ])
    },
  }
}
