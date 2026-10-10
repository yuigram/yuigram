// SPDX-License-Identifier: MIT

/**
 * An MTProxy, for tests, written from the protocol rather than from the client.
 *
 * Nothing here imports the client's proxy, TLS, obfuscation or framing code:
 * the sockets are `node:net`, the cryptography is `node:crypto`, and the
 * ClientHello is taken apart by a reader written for this file. A client that
 * this accepts has met an implementation of the other side that shares none of
 * its helpers — which is the point, since a client and a peer built on one
 * helper would agree about that helper's mistakes.
 *
 * What it does is what a proxy does, minus the network beyond it: it reads the
 * obfuscated opening packet, learns from it which datacenter the client wants
 * and which framing it speaks, and forwards the decrypted stream to a stand-in
 * datacenter in this process, encrypting what comes back. With a fake-TLS
 * secret it first plays the server side of the TLS greeting — checking the
 * client's HMAC, its clock and the host it names — and then carries the stream
 * in application-data records.
 *
 * It also misbehaves on request, in the ways a proxy, or whatever answers at
 * its address, can.
 */

import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { type AddressInfo, createServer, type Server, type Socket } from 'node:net'
import type { ByteStream } from '../../src/network/stream.js'

/** How a proxy expects to be reached. */
export type PeerMode = 'obfuscated' | 'padded' | 'fake-tls'

/** Ways the peer can answer badly. */
export type PeerFault =
  /** The ServerHello's random is not the HMAC it has to be. */
  | 'wrong-hmac'
  /** Answer the greeting as a web server that does not know the protocol would. */
  | 'plain-http'
  /** Accept the connection and say nothing. */
  | 'silent'
  /** Close the connection as soon as the greeting arrives. */
  | 'hang-up'
  /** After the greeting, send a handshake record where application data belongs. */
  | 'bad-record'

export interface PeerOptions {
  readonly mode: PeerMode
  /** The sixteen bytes the secret binds. */
  readonly key: Uint8Array
  /** For fake TLS, the host the client must name. */
  readonly domain?: string
  /** The stand-in datacenter a connection for this number is forwarded to. */
  readonly backend: (dcId: number) => { connect(request: BackendRequest): ByteStream }
  readonly faults?: ReadonlySet<PeerFault>
  /** Seconds a greeting's time may be from this clock's. */
  readonly window?: number
  /** Largest record this peer sends back. */
  readonly recordSize?: number
}

/** What a stand-in datacenter is asked for. */
export interface BackendRequest {
  readonly host: string
  readonly port: number
  readonly onData: (bytes: Uint8Array) => void
  readonly onClose: (error?: Error) => void
}

/** What the peer saw of one connection. */
export interface PeerConnection {
  /** The datacenter number the opening packet carried. */
  dcId?: number
  /** The framing tag it carried, as hex. */
  tag?: string
  /** The host the greeting named, for fake TLS. */
  serverName?: string | undefined
  /** The time the greeting carried, in seconds. */
  greetingTime?: number
  /** Why the peer refused the connection, when it did. */
  refused?: string
  /** Whether the client's socket is still open. */
  open: boolean
  /** Sizes of the application-data records the client sent. */
  records: number[]
}

export interface MtProxyPeer {
  readonly port: number
  readonly connections: PeerConnection[]
  close(): Promise<void>
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

const sha256 = (...parts: Uint8Array[]): Buffer => {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part)
  return hash.digest()
}

const hmac = (key: Uint8Array, ...parts: Uint8Array[]): Buffer => {
  const mac = createHmac('sha256', key)
  for (const part of parts) mac.update(part)
  return mac.digest()
}

/* -------------------------------------------------------------------------- */
/* The ClientHello, read                                                      */
/* -------------------------------------------------------------------------- */

/** What a ClientHello says, read the way a TLS server reads it. */
export interface ReadClientHello {
  readonly random: Uint8Array
  readonly sessionId: Uint8Array
  readonly cipherSuites: number[]
  readonly extensions: Map<number, Uint8Array>
  readonly serverName: string | undefined
}

/** Refuse a greeting, saying why. */
const malformed = (why: string): never => {
  throw new Error(`not a ClientHello: ${why}`)
}

/** The extensions of a ClientHello, from where they begin to the end of the record. */
function readExtensions(record: Uint8Array, view: DataView, from: number): Map<number, Uint8Array> {
  const extensions = new Map<number, Uint8Array>()
  let at = from
  while (at < record.length) {
    const type = view.getUint16(at)
    const length = view.getUint16(at + 2)
    if (at + 4 + length > record.length) malformed('an extension runs past the record')
    if (extensions.has(type)) malformed(`extension ${type} twice`)
    extensions.set(type, record.slice(at + 4, at + 4 + length))
    at += 4 + length
  }

  return extensions
}

/**
 * RFC 8446 §4.2.8: a key share only for a group the client offered, once each,
 * and an X25519 share of 32 bytes. OpenSSL refuses a greeting that breaks it.
 */
function checkKeyShares(groups: Uint8Array | undefined, shares: Uint8Array | undefined): void {
  if (groups === undefined || shares === undefined) return
  const pair = (bytes: Uint8Array, at: number) =>
    ((bytes[at] as number) << 8) | (bytes[at + 1] as number)

  const offered = new Set<number>()
  for (let index = 2; index < groups.length; index += 2) offered.add(pair(groups, index))

  const shared = new Set<number>()
  for (let index = 2; index < shares.length; ) {
    const group = pair(shares, index)
    const length = pair(shares, index + 2)
    if (!offered.has(group)) malformed(`a key share for group ${group}, which was not offered`)
    if (shared.has(group)) malformed(`two key shares for group ${group}`)
    if (group === 0x001d && length !== 32) malformed('an X25519 share that is not 32 bytes')
    shared.add(group)
    index += 4 + length
  }
}

/** The host a server_name extension names. */
function readServerName(sni: Uint8Array | undefined): string | undefined {
  if (sni === undefined) return undefined
  const view = new DataView(sni.buffer, sni.byteOffset, sni.byteLength)
  if (view.getUint16(0) !== sni.length - 2) malformed('a malformed server_name list')
  if (sni[2] !== 0) malformed('a server_name that is not a host name')
  if (5 + view.getUint16(3) !== sni.length) malformed('a malformed host name')

  return new TextDecoder().decode(sni.subarray(5))
}

/**
 * Take a ClientHello record apart, refusing anything malformed.
 *
 * Every length is checked against what contains it, as a TLS implementation
 * must: a greeting that only looks like one at its first bytes fails here.
 */
export function readClientHello(record: Uint8Array): ReadClientHello {
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength)
  if (record.length < 5 || record[0] !== 0x16 || record[1] !== 0x03) {
    malformed('not a handshake record')
  }
  if (view.getUint16(3) !== record.length - 5) malformed('the record length is not its body')
  if (record[5] !== 0x01) malformed('not a ClientHello message')
  if (((view.getUint8(6) << 16) | view.getUint16(7)) !== record.length - 9) {
    malformed('the handshake length is not its body')
  }
  if (record[9] !== 0x03 || record[10] !== 0x03) malformed('not the TLS 1.2 legacy version')

  let at = 11
  const random = record.slice(at, at + 32)
  at += 32
  const sessionLength = record[at] ?? malformed('no session id')
  const sessionId = record.slice(at + 1, at + 1 + sessionLength)
  at += 1 + sessionLength
  const suitesLength = view.getUint16(at)
  if (suitesLength % 2 !== 0) malformed('an odd cipher suite list')
  const cipherSuites: number[] = []
  for (let index = 0; index < suitesLength; index += 2) {
    cipherSuites.push(view.getUint16(at + 2 + index))
  }
  at += 2 + suitesLength
  at += 1 + (record[at] ?? malformed('no compression methods'))
  if (at + 2 + view.getUint16(at) !== record.length) {
    malformed('the extensions are not the rest of the record')
  }

  const extensions = readExtensions(record, view, at + 2)
  checkKeyShares(extensions.get(0x000a), extensions.get(0x0033))

  return {
    random,
    sessionId,
    cipherSuites,
    extensions,
    serverName: readServerName(extensions.get(0x0000)),
  }
}

/* -------------------------------------------------------------------------- */
/* The peer                                                                   */
/* -------------------------------------------------------------------------- */

/** The server side of the TLS greeting, built from what the client sent. */
function serverGreeting(
  key: Uint8Array,
  clientRandom: Uint8Array,
  sessionId: Uint8Array,
  wrong: boolean,
) {
  const hello: number[] = [0x03, 0x03, ...new Uint8Array(32), sessionId.length, ...sessionId]
  hello.push(0x13, 0x01, 0x00) // TLS_AES_128_GCM_SHA256, no compression
  const extensions = [
    0x00,
    0x2b,
    0x00,
    0x02,
    0x03,
    0x04, // supported_versions: TLS 1.3
    0x00,
    0x33,
    0x00,
    0x24,
    0x00,
    0x1d,
    0x00,
    0x20,
    ...randomBytes(32), // key_share: X25519
  ]
  hello.push(extensions.length >> 8, extensions.length & 0xff, ...extensions)
  const handshake = [0x02, 0x00, hello.length >> 8, hello.length & 0xff, ...hello]
  const encrypted = randomBytes(64 + (randomBytes(1)[0] as number))
  const answer = Uint8Array.from([
    0x16,
    0x03,
    0x03,
    handshake.length >> 8,
    handshake.length & 0xff,
    ...handshake,
    0x14,
    0x03,
    0x03,
    0x00,
    0x01,
    0x01,
    0x17,
    0x03,
    0x03,
    encrypted.length >> 8,
    encrypted.length & 0xff,
    ...encrypted,
  ])
  const digest = hmac(key, clientRandom, answer)
  if (wrong) digest[0] = (digest[0] as number) ^ 0xff
  answer.set(digest, 11)
  return answer
}

/** One client connection, as the proxy handles it: greeting, then the stream. */
class PeerSession {
  readonly #socket: Socket
  readonly #options: PeerOptions
  readonly #seen: PeerConnection
  readonly #faults: ReadonlySet<PeerFault>
  #buffer: Uint8Array = new Uint8Array(0)
  #phase: 'greeting' | 'change-cipher' | 'stream'
  #initial: Uint8Array = new Uint8Array(0)
  #decipher: ReturnType<typeof createCipheriv> | undefined
  #cipher: ReturnType<typeof createCipheriv> | undefined
  #backend: ByteStream | undefined

  constructor(socket: Socket, options: PeerOptions, seen: PeerConnection) {
    this.#socket = socket
    this.#options = options
    this.#seen = seen
    this.#faults = options.faults ?? new Set()
    this.#phase = options.mode === 'fake-tls' ? 'greeting' : 'stream'
  }

  #refuse(why: string): void {
    this.#seen.refused = why
    this.#socket.destroy()
  }

  receive(chunk: Uint8Array): void {
    this.#buffer = concat(this.#buffer, chunk)
    if (this.#phase === 'greeting' && !this.#greet()) return
    if (this.#phase === 'change-cipher' && !this.#changeCipher()) return
    if (this.#options.mode !== 'fake-tls') {
      const bytes = this.#buffer
      this.#buffer = new Uint8Array(0)
      this.#stream(bytes)
      return
    }
    this.#records()
  }

  /** Answer the ClientHello once it is all here. True when the greeting is done. */
  #greet(): boolean {
    if (this.#faults.has('silent') || this.#buffer.length < 5) return false
    const length = ((this.#buffer[3] as number) << 8) | (this.#buffer[4] as number)
    if (this.#buffer.length < 5 + length) return false
    const record = this.#buffer.slice(0, 5 + length)
    this.#buffer = this.#buffer.slice(5 + length)

    if (this.#faults.has('hang-up')) {
      this.#socket.destroy()
      return false
    }
    if (this.#faults.has('plain-http')) {
      this.#socket.end('HTTP/1.1 400 Bad Request\r\ncontent-length: 0\r\n\r\n')
      return false
    }

    let hello: ReadClientHello
    try {
      hello = readClientHello(record)
    } catch (error) {
      this.#refuse((error as Error).message)
      return false
    }
    this.#seen.serverName = hello.serverName

    const zeroed = Uint8Array.from(record)
    zeroed.fill(0, 11, 43)
    const expected = hmac(this.#options.key, zeroed)
    if (!timingSafeEqual(expected.subarray(0, 28), Buffer.from(hello.random.subarray(0, 28)))) {
      this.#refuse('the greeting was not made with this secret')
      return false
    }
    const time = expected.readInt32LE(28) ^ Buffer.from(hello.random).readInt32LE(28)
    this.#seen.greetingTime = time
    if (Math.abs(time - Math.floor(Date.now() / 1000)) > (this.#options.window ?? 120)) {
      this.#refuse(`the greeting's time is ${time}`)
      return false
    }
    if (hello.serverName !== this.#options.domain) {
      this.#refuse(`the greeting names ${String(hello.serverName)}`)
      return false
    }

    const wrong = this.#faults.has('wrong-hmac')
    this.#socket.write(serverGreeting(this.#options.key, hello.random, hello.sessionId, wrong))
    this.#phase = 'change-cipher'
    return true
  }

  /** The ChangeCipherSpec the client sends before its first record. */
  #changeCipher(): boolean {
    if (this.#buffer.length < 6) return false
    if (Buffer.from(this.#buffer.subarray(0, 6)).toString('hex') !== '140303000101') {
      this.#refuse('no ChangeCipherSpec before the first record')
      return false
    }
    this.#buffer = this.#buffer.slice(6)
    this.#phase = 'stream'
    if (this.#faults.has('bad-record')) {
      this.#socket.write(Buffer.from([0x16, 0x03, 0x03, 0x00, 0x01, 0x00]))
    }
    return true
  }

  /** Application-data records, unwrapped into the obfuscated stream. */
  #records(): void {
    while (this.#buffer.length >= 5) {
      if (this.#buffer[0] !== 0x17 || this.#buffer[1] !== 0x03 || this.#buffer[2] !== 0x03) {
        this.#refuse('a record that is not application data')
        return
      }
      const length = ((this.#buffer[3] as number) << 8) | (this.#buffer[4] as number)
      if (this.#buffer.length < 5 + length) return
      this.#seen.records.push(length)
      const payload = this.#buffer.slice(5, 5 + length)
      this.#buffer = this.#buffer.slice(5 + length)
      this.#stream(payload)
    }
  }

  /** The obfuscated stream: the opening packet first, then frames for the datacenter. */
  #stream(bytes: Uint8Array): void {
    if (this.#decipher === undefined) {
      this.#initial = concat(this.#initial, bytes)
      if (this.#initial.length >= 64) this.#open()
      return
    }
    if (this.#backend?.open === true) this.#backend.write(this.#decipher.update(bytes))
  }

  #open(): void {
    const packet = this.#initial.subarray(0, 64)
    const rest = this.#initial.subarray(64)
    const key = this.#options.key
    // The client's encryption keys are read from the packet as sent; the keys
    // this side encrypts with come from the packet reversed.
    const reversed = Uint8Array.from(packet.subarray(8, 56)).reverse()
    const decipher = createCipheriv(
      'aes-256-ctr',
      sha256(packet.subarray(8, 40), key),
      packet.subarray(40, 56),
    )
    this.#decipher = decipher
    this.#cipher = createCipheriv(
      'aes-256-ctr',
      sha256(reversed.subarray(0, 32), key),
      reversed.subarray(32, 48),
    )
    const plain = decipher.update(packet)
    const tag = Buffer.from(plain.subarray(56, 60)).toString('hex')
    this.#seen.tag = tag
    this.#seen.dcId = plain.readInt16LE(60)
    const expected = this.#options.mode === 'obfuscated' ? 'eeeeeeee' : 'dddddddd'
    if (tag !== expected) {
      this.#refuse(`framing tag ${tag}, not ${expected}`)
      return
    }

    const backend = this.#options.backend(this.#seen.dcId).connect({
      host: 'stand-in',
      port: 443,
      onData: (answer) => this.#send(answer),
      onClose: () => this.#socket.destroy(),
    })
    this.#backend = backend
    // The datacenter is told the framing in the clear, as a direct connection
    // would tell it: the obfuscation ended here.
    backend.write(plain.subarray(56, 60))
    if (rest.length > 0) backend.write(decipher.update(rest))
  }

  /** Encrypt what the datacenter answered, and wrap it in records for fake TLS. */
  #send(bytes: Uint8Array): void {
    if (this.#socket.destroyed || this.#cipher === undefined) return
    const encrypted = this.#cipher.update(bytes)
    if (this.#options.mode !== 'fake-tls') {
      this.#socket.write(encrypted)
      return
    }
    const size = this.#options.recordSize ?? 1500
    for (let from = 0; from < encrypted.length; from += size) {
      const part = encrypted.subarray(from, from + size)
      this.#socket.write(Buffer.from([0x17, 0x03, 0x03, part.length >> 8, part.length & 0xff]))
      this.#socket.write(part)
    }
  }
}

/** Start a peer on an ephemeral local port. */
export async function startMtProxyPeer(options: PeerOptions): Promise<MtProxyPeer> {
  const connections: PeerConnection[] = []
  const sockets = new Set<Socket>()

  const server: Server = createServer((socket) => {
    sockets.add(socket)
    const seen: PeerConnection = { open: true, records: [] }
    connections.push(seen)
    const session = new PeerSession(socket, options, seen)
    socket.on('data', (chunk: Buffer) => session.receive(new Uint8Array(chunk)))
    socket.on('close', () => {
      seen.open = false
      sockets.delete(socket)
    })
    socket.on('error', () => {})
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  return {
    port: (server.address() as AddressInfo).port,
    connections,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
