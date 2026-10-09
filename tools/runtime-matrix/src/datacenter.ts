// SPDX-License-Identifier: MPL-2.0

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
 *                        GET /datacenter?name=…  the TCP port of a datacenter for one account
 *                        GET /mtproxy  a fake-TLS MTProxy in front of a datacenter of its own:
 *                                      its port and secret, as JSON
 *                        /bot<t>/getMe a Bot API stand-in; /bot<t>/slow never answers
 * ```
 *
 * A fresh set per runtime, and a datacenter per account within it: a mock
 * datacenter remembers the long-lived key its first client bound, and refuses
 * another client's binding, which is a fact about the peer rather than about
 * the client under test.
 */

import { createPublicKey, randomBytes } from 'node:crypto'
import { createServer as createHttp, type ServerResponse } from 'node:http'
import { createServer as createTcp } from 'node:net'
import { REGISTRY as API } from '../../../packages/mtproto/src/generated/api/registry.js'
import { REGISTRY as CORE } from '../../../packages/mtproto/src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../../../packages/mtproto/src/generated/mtproto/registry.js'
import type { TlValue } from '../../../packages/mtproto/src/tl/index.js'
import { TlScope } from '../../../packages/mtproto/src/tl/registry.js'
import { MockDatacenter } from '../../../packages/mtproto/test/server/datacenter.js'
import { createServerKey } from '../../../packages/mtproto/test/server/keys.js'
import {
  type MtProxyPeer,
  startMtProxyPeer,
} from '../../../packages/mtproto/test/server/mtproxy.js'
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

  const live: {
    send(bytes: Uint8Array): void
    push(value: TlValue): Uint8Array | undefined
    open(): boolean
  }[] = []
  const sockets = new Set<import('node:net').Socket>()
  const listeners: ReturnType<typeof createTcp>[] = []
  let closed = 0

  /** Carry one connection into a datacenter, and its answers back out. */
  const attach = (
    place: MockDatacenter,
    port: number,
    send: (bytes: Uint8Array) => void,
    end: () => void,
    open: () => boolean,
  ) => {
    const before = place.connections.length
    const stream = place.connect({
      host: '127.0.0.1',
      port,
      onData: (bytes) => {
        if (open()) send(bytes)
      },
      onClose: () => end(),
    })
    const opened = place.connections[before]
    if (opened !== undefined) live.push({ send, push: (value) => opened.peer.push(value), open })
    return stream
  }

  /**
   * A datacenter of its own, on a port of its own, for one account.
   *
   * A mock datacenter remembers the long-lived key the first account bound and
   * refuses another account's binding, so each account a run brings up is given
   * one. They share the key, so one PEM serves them all.
   */
  const standUp = async (): Promise<{ place: MockDatacenter; port: number }> => {
    const tcp = createTcp()
    await new Promise<void>((resolve) => tcp.listen(0, '127.0.0.1', resolve))
    listeners.push(tcp)
    const port = (tcp.address() as { port: number }).port
    const place = new MockDatacenter({
      id: 2,
      host: '127.0.0.1',
      port,
      key,
      scope: new TlScope('runtime-matrix', [CORE, MTPROTO, API]),
      serverTime: ORIGIN_SECONDS,
    })

    tcp.on('connection', (socket) => {
      sockets.add(socket)
      let open = true
      const stream = attach(
        place,
        port,
        (bytes) => socket.write(bytes),
        () => socket.end(),
        () => open,
      )
      socket.on('data', (data: Buffer) => stream.write(new Uint8Array(data)))
      socket.on('close', () => {
        sockets.delete(socket)
        open = false
        closed += 1
        stream.close()
      })
      socket.on('error', () => undefined)
    })

    return { place, port }
  }

  const named = new Map<string, Promise<{ place: MockDatacenter; port: number }>>()
  const datacenterFor = (name: string) => {
    let found = named.get(name)
    if (found === undefined) {
      found = standUp()
      named.set(name, found)
    }
    return found
  }
  const main = await datacenterFor('main')
  const tcpPort = main.port

  // The test suite's MTProxy peer — node:net and node:crypto, sharing nothing
  // with the client — in front of a datacenter of its own, with a fake-TLS
  // secret, so a runtime's account is checked through the whole proxy path.
  const proxyKey = new Uint8Array(randomBytes(16))
  const proxyDomain = 'matrix.example.org'
  let proxy: MtProxyPeer | undefined
  const proxyFor = async (): Promise<MtProxyPeer> => {
    if (proxy !== undefined) return proxy
    const { place } = await datacenterFor('mtproxy')
    proxy = await startMtProxyPeer({
      mode: 'fake-tls',
      key: proxyKey,
      domain: proxyDomain,
      backend: () => place,
    })
    return proxy
  }

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
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname
    if (path === '/mtproxy') {
      void proxyFor().then((peer) => {
        const secret = Buffer.from([0xee, ...proxyKey, ...Buffer.from(proxyDomain)]).toString(
          'base64url',
        )
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            port: peer.port,
            secret,
            refused: peer.connections.filter((seen) => seen.refused !== undefined).length,
          }),
        )
      })
      return
    }
    if (path === '/datacenter') {
      void datacenterFor(url.searchParams.get('name') ?? 'main').then(({ port }) =>
        response.end(String(port)),
      )
      return
    }
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
        main.place,
        main.port,
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
      await proxy?.close()
      await Promise.all([
        new Promise((resolve) => http.close(resolve)),
        ...listeners.map((tcp) => new Promise((resolve) => tcp.close(resolve))),
      ])
    },
  }
}
