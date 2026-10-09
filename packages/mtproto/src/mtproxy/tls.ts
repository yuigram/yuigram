// SPDX-License-Identifier: MPL-2.0

/**
 * The TLS a fake-TLS proxy expects to see.
 *
 * A proxy with an `ee` secret sits behind what looks like an ordinary HTTPS
 * server. A client opens with a TLS 1.3 ClientHello naming the proxy's host,
 * whose random field is not random: it is an HMAC-SHA256, keyed by the secret,
 * of the whole greeting with that field zeroed, its last four bytes XORed with
 * the current Unix time. A proxy that holds the secret recognises the greeting
 * — and that it is fresh — and answers with a ServerHello whose own random is
 * an HMAC over the client's random and the answer; anything else it answers as
 * the host it is pretending to be would.
 *
 * After that greeting nothing is TLS. The client sends a ChangeCipherSpec and
 * then wraps the ordinary obfuscated MTProto stream in application-data
 * records, each at most 2878 bytes; the first of them carries the obfuscation's
 * 64-byte opening packet. The proxy answers in the same records.
 *
 * Telegram does not document this. The layout here is the one TDLib (Telegram's
 * own library) and mtcute implement, and the greeting itself follows RFC 8446,
 * so that a TLS implementation reading it finds a well-formed ClientHello. It is
 * shaped like a browser's — GREASE values, a shuffled extension order, an X25519
 * key share that is a point on the curve — but it is not a copy of any
 * particular browser's, so how closely it passes for one is not something
 * established here.
 */

import { NetworkError, ValidationError } from '@yuigram/core'
import { modPow } from '../crypto/bigint.js'
import { hmacPortable } from '../crypto/digest.js'
import { sha256 } from '../crypto/hash.js'

/** The largest payload a proxy accepts in one application-data record. */
export const MAX_RECORD_PAYLOAD = 2878

const HANDSHAKE = 0x16
const CHANGE_CIPHER_SPEC = 0x14
const APPLICATION_DATA = 0x17

/** Where the greeting's random field sits: after the record and handshake headers and the version. */
const RANDOM_OFFSET = 11
const RANDOM_LENGTH = 32

/** What the client sends before its first application-data record. */
const CHANGE_CIPHER_SPEC_RECORD = Uint8Array.of(CHANGE_CIPHER_SPEC, 0x03, 0x03, 0x00, 0x01, 0x01)

const hmacSha256 = (key: Uint8Array, ...parts: readonly Uint8Array[]): Uint8Array =>
  hmacPortable(sha256, 64, key, ...parts)

/**
 * A fake-TLS session that did not go as a proxy holding the secret makes it go.
 *
 * A connection failure like any other, which the account retries; what it
 * says is why, never what the proxy or the secret contained.
 */
export class FakeTlsError extends NetworkError {
  override readonly name = 'FakeTlsError'
}

/* -------------------------------------------------------------------------- */
/* The greeting                                                               */
/* -------------------------------------------------------------------------- */

/** Bytes written front to back, with lengths filled in once what they cover is known. */
class Writer {
  #bytes = new Uint8Array(1024)
  #length = 0
  readonly #open: Array<{ at: number; size: 2 | 3 }> = []

  get length(): number {
    return this.#length
  }

  #room(more: number): void {
    if (this.#length + more <= this.#bytes.length) return
    const grown = new Uint8Array(Math.max(this.#bytes.length * 2, this.#length + more))
    grown.set(this.#bytes.subarray(0, this.#length))
    this.#bytes = grown
  }

  bytes(data: ArrayLike<number>): void {
    this.#room(data.length)
    this.#bytes.set(data, this.#length)
    this.#length += data.length
  }

  u8(value: number): void {
    this.bytes([value & 0xff])
  }

  u16(value: number): void {
    this.bytes([(value >> 8) & 0xff, value & 0xff])
  }

  /** Begin a length-prefixed part; `end` writes how long it turned out. */
  begin(size: 2 | 3): void {
    this.#open.push({ at: this.#length, size })
    this.bytes(new Uint8Array(size))
  }

  end(): void {
    const part = this.#open.pop()
    if (part === undefined) throw new ValidationError('a part was closed that was never opened')
    const length = this.#length - part.at - part.size
    if (part.size === 3) this.#bytes[part.at] = (length >> 16) & 0xff
    this.#bytes[part.at + part.size - 2] = (length >> 8) & 0xff
    this.#bytes[part.at + part.size - 1] = length & 0xff
  }

  result(): Uint8Array {
    return this.#bytes.slice(0, this.#length)
  }
}

/**
 * GREASE values, as RFC 8701 defines them: `0x?A?A`, both bytes alike.
 *
 * Several are drawn per greeting and two in a row are never the same, which is
 * how a browser uses them.
 */
function greaseValues(random: (length: number) => Uint8Array, count: number): number[] {
  const drawn = random(count)
  const values: number[] = []
  for (let index = 0; index < count; index += 1) {
    let byte = ((drawn[index] as number) & 0xf0) | 0x0a
    if (index > 0 && byte === ((values[index - 1] as number) & 0xff)) byte ^= 0x10
    values.push((byte << 8) | byte)
  }

  return values
}

/** Curve25519, as RFC 7748 states it: p = 2^255 - 19, and the curve's coefficient A. */
const CURVE_P = (1n << 255n) - 19n
const CURVE_A = 486662n

/**
 * A public X25519 key share that is a point on the curve, in its prime-order subgroup.
 *
 * No exchange is ever completed, so any 32 bytes would carry a greeting. A
 * value off the curve, though, is something a careful observer can tell from a
 * real one; a point on it, multiplied by the curve's cofactor, cannot be.
 */
function curvePoint(random: (length: number) => Uint8Array): Uint8Array {
  for (;;) {
    const candidate = random(32)
    candidate[31] = (candidate[31] as number) & 0x7f
    let x = 0n
    for (let index = 31; index >= 0; index -= 1) x = (x << 8n) | BigInt(candidate[index] as number)
    x %= CURVE_P

    // y² = x³ + A·x² + x has a solution exactly when the right side is a square.
    const rhs = (((x * x) % CURVE_P) * x + ((CURVE_A * x) % CURVE_P) * x + x) % CURVE_P
    if (rhs === 0n || modPow(rhs, (CURVE_P - 1n) / 2n, CURVE_P) !== 1n) continue

    // Three doublings multiply by the cofactor, 8.
    for (let doubling = 0; doubling < 3; doubling += 1) {
      const x2 = (x * x) % CURVE_P
      const numerator = ((x2 - 1n + CURVE_P) % CURVE_P) ** 2n % CURVE_P
      const denominator = (4n * x * ((x2 + CURVE_A * x + 1n) % CURVE_P)) % CURVE_P
      if (denominator === 0n) break
      x = (numerator * modPow(denominator, CURVE_P - 2n, CURVE_P)) % CURVE_P
    }

    const share = new Uint8Array(32)
    let rest = x
    for (let index = 0; index < 32; index += 1) {
      share[index] = Number(rest & 0xffn)
      rest >>= 8n
    }

    return share
  }
}

/** A Fisher–Yates shuffle, from the given randomness. */
function shuffled<T>(items: readonly T[], random: (length: number) => Uint8Array): T[] {
  const out = [...items]
  const draws = random(out.length * 4)
  for (let index = out.length - 1; index > 0; index -= 1) {
    const view = new DataView(draws.buffer, draws.byteOffset + index * 4, 4)
    const pick = view.getUint32(0, true) % (index + 1)
    const held = out[index] as T
    out[index] = out[pick] as T
    out[pick] = held
  }

  return out
}

/** What a client sent as its greeting, and what it needs to check the answer. */
export interface ClientHello {
  readonly bytes: Uint8Array
  /** The random field as sent, which the proxy's answer is checked against. */
  readonly random: Uint8Array
}

/**
 * Write the greeting a fake-TLS proxy recognises.
 *
 * `time` is the Unix time in seconds: the proxy refuses a greeting whose time is
 * too far from its own, so a client with a badly wrong clock is refused here.
 */
export function clientHello(options: {
  readonly key: Uint8Array
  readonly domain: string
  readonly time: number
  readonly random: (length: number) => Uint8Array
}): ClientHello {
  const { key, domain, time, random } = options
  const host = new TextEncoder().encode(domain)
  const grease = greaseValues(random, 7)
  const g = (index: number) => grease[index] as number

  const extensions: Array<(w: Writer) => void> = [
    // server_name, naming the host the session claims to be with.
    (w) => {
      w.u16(0x0000)
      w.begin(2)
      w.begin(2)
      w.u8(0)
      w.begin(2)
      w.bytes(host)
      w.end()
      w.end()
      w.end()
    },
    (w) => w.bytes([0x00, 0x17, 0x00, 0x00]), // extended_master_secret
    (w) => w.bytes([0xff, 0x01, 0x00, 0x01, 0x00]), // renegotiation_info
    // supported_groups: GREASE, X25519, P-256, P-384.
    (w) => {
      w.u16(0x000a)
      w.begin(2)
      w.begin(2)
      w.u16(g(4))
      w.bytes([0x00, 0x1d, 0x00, 0x17, 0x00, 0x18])
      w.end()
      w.end()
    },
    (w) => w.bytes([0x00, 0x0b, 0x00, 0x02, 0x01, 0x00]), // ec_point_formats: uncompressed
    (w) => w.bytes([0x00, 0x23, 0x00, 0x00]), // session_ticket
    // application_layer_protocol_negotiation: h2, http/1.1.
    (w) =>
      w.bytes([
        0x00, 0x10, 0x00, 0x0e, 0x00, 0x0c, 0x02, 0x68, 0x32, 0x08, 0x68, 0x74, 0x74, 0x70, 0x2f,
        0x31, 0x2e, 0x31,
      ]),
    (w) => w.bytes([0x00, 0x05, 0x00, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00]), // status_request
    // signature_algorithms.
    (w) =>
      w.bytes([
        0x00, 0x0d, 0x00, 0x12, 0x00, 0x10, 0x04, 0x03, 0x08, 0x04, 0x04, 0x01, 0x05, 0x03, 0x08,
        0x05, 0x05, 0x01, 0x08, 0x06, 0x06, 0x01,
      ]),
    (w) => w.bytes([0x00, 0x12, 0x00, 0x00]), // signed_certificate_timestamp
    // key_share: a GREASE share of one byte, and an X25519 share. The GREASE
    // group is the one supported_groups lists: RFC 8446 refuses a share for a
    // group the client did not offer.
    (w) => {
      w.u16(0x0033)
      w.begin(2)
      w.begin(2)
      w.u16(g(4))
      w.bytes([0x00, 0x01, 0x00])
      w.bytes([0x00, 0x1d, 0x00, 0x20])
      w.bytes(curvePoint(random))
      w.end()
      w.end()
    },
    (w) => w.bytes([0x00, 0x2d, 0x00, 0x02, 0x01, 0x01]), // psk_key_exchange_modes: psk_dhe_ke
    // supported_versions: GREASE, TLS 1.3, TLS 1.2.
    (w) => {
      w.u16(0x002b)
      w.begin(2)
      w.u8(6)
      w.u16(g(6))
      w.bytes([0x03, 0x04, 0x03, 0x03])
      w.end()
    },
    (w) => w.bytes([0x00, 0x1b, 0x00, 0x03, 0x02, 0x00, 0x02]), // compress_certificate: brotli
  ]

  const w = new Writer()
  w.bytes([HANDSHAKE, 0x03, 0x01])
  w.begin(2) // record
  w.u8(0x01) // ClientHello
  w.begin(3) // handshake
  w.bytes([0x03, 0x03])
  w.bytes(new Uint8Array(RANDOM_LENGTH))
  w.u8(32)
  w.bytes(random(32)) // session id
  w.begin(2) // cipher suites
  w.u16(g(0))
  w.bytes([
    0x13, 0x01, 0x13, 0x02, 0x13, 0x03, 0xc0, 0x2b, 0xc0, 0x2f, 0xc0, 0x2c, 0xc0, 0x30, 0xcc, 0xa9,
    0xcc, 0xa8, 0xc0, 0x13, 0xc0, 0x14, 0x00, 0x9c, 0x00, 0x9d, 0x00, 0x2f, 0x00, 0x35,
  ])
  w.end()
  w.bytes([0x01, 0x00]) // compression: none
  w.begin(2) // extensions
  w.u16(g(2))
  w.bytes([0x00, 0x00])
  for (const extension of shuffled(extensions, random)) extension(w)
  w.u16(g(3))
  w.bytes([0x00, 0x01, 0x00])
  // padding, RFC 7685: a greeting is taken to at least 512 bytes, as browsers do.
  const handshakeSoFar = w.length - 5
  if (handshakeSoFar + 4 < 512) {
    w.u16(0x0015)
    w.begin(2)
    w.bytes(new Uint8Array(512 - handshakeSoFar - 4))
    w.end()
  }
  w.end()
  w.end()
  w.end()

  const bytes = w.result()
  const digest = hmacSha256(key, bytes)
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
  view.setInt32(28, view.getInt32(28, true) ^ time, true)
  bytes.set(digest, RANDOM_OFFSET)

  return { bytes, random: digest }
}

/* -------------------------------------------------------------------------- */
/* The answer                                                                 */
/* -------------------------------------------------------------------------- */

/** The records a proxy's answer opens with, and how much of each is fixed. */
const SERVER_HELLO_PREFIX = Uint8Array.of(HANDSHAKE, 0x03, 0x03)
const CHANGE_CIPHER_THEN_DATA = Uint8Array.of(
  CHANGE_CIPHER_SPEC,
  0x03,
  0x03,
  0x00,
  0x01,
  0x01,
  APPLICATION_DATA,
  0x03,
  0x03,
)

const equal = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] as number) ^ (b[index] as number)
  }
  return difference === 0
}

/**
 * Read a proxy's answer to the greeting, as bytes arrive.
 *
 * Answers `undefined` until the whole answer is in, then the bytes that came
 * after it. Throws on anything that is not the answer a proxy holding the
 * secret gives: the wrong records, or a ServerHello whose random is not the
 * HMAC it has to be — which is what an ordinary server at that address, or
 * anything in between, would send.
 */
export class ServerHelloReader {
  readonly #key: Uint8Array
  readonly #clientRandom: Uint8Array
  #buffer = new Uint8Array(0)

  constructor(key: Uint8Array, clientRandom: Uint8Array) {
    this.#key = key
    this.#clientRandom = clientRandom
  }

  push(bytes: Uint8Array): Uint8Array | undefined {
    const joined = new Uint8Array(this.#buffer.length + bytes.length)
    joined.set(this.#buffer)
    joined.set(bytes, this.#buffer.length)
    this.#buffer = joined

    let at = 0
    for (const prefix of [SERVER_HELLO_PREFIX, CHANGE_CIPHER_THEN_DATA]) {
      const seen = this.#buffer.subarray(at, at + prefix.length)
      if (!equal(seen, prefix.subarray(0, seen.length))) {
        throw new FakeTlsError("the proxy's answer is not the greeting a fake-TLS proxy gives")
      }
      if (this.#buffer.length < at + prefix.length + 2) return undefined

      const view = new DataView(
        this.#buffer.buffer,
        this.#buffer.byteOffset + at + prefix.length,
        2,
      )
      at += prefix.length + 2 + view.getUint16(0)
      if (this.#buffer.length < at) return undefined
    }

    const answer = this.#buffer.slice(0, at)
    if (answer.length < RANDOM_OFFSET + RANDOM_LENGTH) {
      throw new FakeTlsError("the proxy's greeting is too short to carry its random")
    }
    const random = answer.slice(RANDOM_OFFSET, RANDOM_OFFSET + RANDOM_LENGTH)
    answer.fill(0, RANDOM_OFFSET, RANDOM_OFFSET + RANDOM_LENGTH)
    if (!equal(hmacSha256(this.#key, this.#clientRandom, answer), random)) {
      throw new FakeTlsError("the proxy's greeting was not made with this secret")
    }

    const rest = this.#buffer.slice(at)
    this.#buffer = new Uint8Array(0)

    return rest
  }
}

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Wrap bytes in application-data records.
 *
 * `first` puts the ChangeCipherSpec in front, which is sent once, before the
 * first record and in the same write.
 */
export function wrapRecords(data: Uint8Array, first: boolean): Uint8Array {
  const count = Math.ceil(data.length / MAX_RECORD_PAYLOAD)
  const prefix = first ? CHANGE_CIPHER_SPEC_RECORD.length : 0
  const out = new Uint8Array(prefix + data.length + count * 5)
  if (first) out.set(CHANGE_CIPHER_SPEC_RECORD)

  let at = prefix
  for (let from = 0; from < data.length; from += MAX_RECORD_PAYLOAD) {
    const part = data.subarray(from, from + MAX_RECORD_PAYLOAD)
    out.set([APPLICATION_DATA, 0x03, 0x03, (part.length >> 8) & 0xff, part.length & 0xff], at)
    out.set(part, at + 5)
    at += 5 + part.length
  }

  return out
}

/** Read application-data records from bytes as they arrive. */
export class RecordReader {
  #buffer = new Uint8Array(0)

  /** The payloads every complete record carried, in order. */
  push(bytes: Uint8Array): Uint8Array[] {
    const joined = new Uint8Array(this.#buffer.length + bytes.length)
    joined.set(this.#buffer)
    joined.set(bytes, this.#buffer.length)

    const payloads: Uint8Array[] = []
    let at = 0
    while (joined.length - at >= 5) {
      if (joined[at] !== APPLICATION_DATA || joined[at + 1] !== 0x03 || joined[at + 2] !== 0x03) {
        throw new FakeTlsError('the proxy sent something that is not an application-data record')
      }
      const length = ((joined[at + 3] as number) << 8) | (joined[at + 4] as number)
      if (joined.length - at - 5 < length) break
      payloads.push(joined.slice(at + 5, at + 5 + length))
      at += 5 + length
    }
    this.#buffer = joined.slice(at)

    return payloads
  }
}
