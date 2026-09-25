/**
 * Reading and writing the version-3 session string other MTProto libraries use.
 *
 * Where Yuigram's own session string is fixed-length, this one is a small TL
 * record in URL-safe base64 without padding, and carries more: the address of
 * the account's datacenter, and optionally of the one it downloads media from,
 * and which user the account is.
 *
 * ```
 *   byte 0          version, 3
 *   int32           flags   bit 0  the user is present
 *                           bit 1  (older strings) every address is the test network's
 *                           bit 2  a separate media address follows
 *   bytes           main address     byte version (1 or 2), byte dc, byte flags,
 *   bytes           media address?     string host, int32 port
 *                                     flags: 1 IPv6, 2 media only, 4 test network (version 2)
 *   int53, Bool     user id, is a bot    (bit 0)
 *   bytes           the 256-byte authorization key
 * ```
 *
 * The primitives are TL's: little-endian integers, a boolean as one of two
 * constructors, and bytes behind a one- or four-byte length and padded to four.
 * They are written out here rather than borrowed from the TL codec, which is
 * loaded only when an account first speaks to a datacenter; reading a session
 * string is the first thing a program does and should not load a codec.
 *
 * Every field is checked on the way in, and nothing after the key is allowed:
 * the string is an account, and one read as something it is not would sign in
 * as that something.
 */

import { SessionError } from '@yuigram/core'

/** The layout this reads and writes. */
const VERSION = 3

const FLAG_SELF = 0b001
const FLAG_TEST_NETWORK_OLD = 0b010
const FLAG_MEDIA = 0b100

const ADDRESS_IPV6 = 0b001
const ADDRESS_MEDIA_ONLY = 0b010
const ADDRESS_TEST = 0b100

const BOOL_TRUE = 0x997275b5
const BOOL_FALSE = 0xbc799737

const KEY_SIZE = 256

/** Where a datacenter is reached, as the string records it. */
export interface SessionAddress {
  readonly id: number
  readonly host: string
  readonly port: number
  readonly ipv6: boolean
  readonly mediaOnly: boolean
}

/** What a version-3 string says. */
export interface TlSession {
  readonly dcId: number
  readonly testMode: boolean
  readonly authKey: Uint8Array
  /** The main address, and the media one where the string had a separate one. */
  readonly addresses: readonly SessionAddress[]
  /** Which user the account is, where the string says. */
  readonly self?: { readonly id: bigint; readonly isBot: boolean } | undefined
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

class Out {
  readonly #chunks: number[] = []

  byte(value: number): void {
    this.#chunks.push(value & 0xff)
  }

  int32(value: number): void {
    for (let shift = 0; shift < 32; shift += 8) this.byte(value >>> shift)
  }

  int64(value: bigint): void {
    const unsigned = BigInt.asUintN(64, value)
    for (let shift = 0n; shift < 64n; shift += 8n) this.byte(Number((unsigned >> shift) & 0xffn))
  }

  bool(value: boolean): void {
    this.int32(value ? BOOL_TRUE : BOOL_FALSE)
  }

  bytes(value: Uint8Array): void {
    let header: number
    if (value.length <= 253) {
      this.byte(value.length)
      header = 1
    } else {
      this.byte(254)
      this.byte(value.length)
      this.byte(value.length >>> 8)
      this.byte(value.length >>> 16)
      header = 4
    }
    for (const byte of value) this.byte(byte)
    for (let pad = (4 - ((header + value.length) % 4)) % 4; pad > 0; pad -= 1) this.byte(0)
  }

  string(value: string): void {
    this.bytes(new TextEncoder().encode(value))
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.#chunks)
  }
}

class In {
  readonly #bytes: Uint8Array
  #at: number

  constructor(bytes: Uint8Array, at = 0) {
    this.#bytes = bytes
    this.#at = at
  }

  get remaining(): number {
    return this.#bytes.length - this.#at
  }

  #take(count: number, what: string): Uint8Array {
    if (count > this.remaining) {
      throw new SessionError(`the session string ends inside its ${what}; it may be incomplete`)
    }
    const taken = this.#bytes.subarray(this.#at, this.#at + count)
    this.#at += count
    return taken
  }

  byte(what: string): number {
    return this.#take(1, what)[0] as number
  }

  int32(what: string): number {
    const [a, b, c, d] = this.#take(4, what) as unknown as [number, number, number, number]
    return (a | (b << 8) | (c << 16) | (d << 24)) >>> 0
  }

  int53(what: string): bigint {
    const low = BigInt(this.int32(what))
    const high = BigInt(this.int32(what))
    return BigInt.asIntN(64, (high << 32n) | low)
  }

  bool(what: string): boolean {
    const id = this.int32(what)
    if (id === BOOL_TRUE) return true
    if (id === BOOL_FALSE) return false
    throw new SessionError(`the session string's ${what} is not a boolean`)
  }

  bytes(what: string): Uint8Array {
    const first = this.byte(`${what} length`)
    let length = first
    let header = 1
    if (first === 254) {
      const [a, b, c] = this.#take(3, `${what} length`) as unknown as [number, number, number]
      length = a | (b << 8) | (c << 16)
      header = 4
    } else if (first === 255) {
      throw new SessionError(`the session string's ${what} has a length it cannot have`)
    }
    const value = this.#take(length, what).slice()
    this.#take((4 - ((header + length) % 4)) % 4, `${what} padding`)
    return value
  }
}

/* -------------------------------------------------------------------------- */
/* Base64                                                                     */
/* -------------------------------------------------------------------------- */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  // URL-safe is what is written; the standard alphabet and padding are read
  // too, since a string copied through another tool may have gained either.
  const trimmed = text.trim()
  if (!/^[A-Za-z0-9_\-+/]+={0,2}$/.test(trimmed) || trimmed.replace(/=+$/, '').length % 4 === 1) {
    throw new SessionError('a session string is not base64')
  }
  const standard = trimmed.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/* -------------------------------------------------------------------------- */
/* Addresses                                                                  */
/* -------------------------------------------------------------------------- */

function checkDc(id: number, what: string): void {
  if (!Number.isInteger(id) || id < 1 || id > 255) {
    throw new SessionError(
      `the session string names datacenter ${id} for its ${what}, which cannot be one`,
    )
  }
}

function writeAddress(address: SessionAddress, testMode: boolean): Uint8Array {
  checkDc(address.id, 'address')
  if (address.host === '') throw new SessionError('a datacenter address needs a host')
  if (!Number.isInteger(address.port) || address.port < 1 || address.port > 65_535) {
    throw new SessionError(`a datacenter port is 1 to 65535, not ${address.port}`)
  }

  const out = new Out()
  out.byte(2)
  out.byte(address.id)
  out.byte(
    (address.ipv6 ? ADDRESS_IPV6 : 0) |
      (address.mediaOnly ? ADDRESS_MEDIA_ONLY : 0) |
      (testMode ? ADDRESS_TEST : 0),
  )
  out.string(address.host)
  out.int32(address.port)
  return out.finish()
}

function readAddress(bytes: Uint8Array, what: string): SessionAddress & { readonly test: boolean } {
  const input = new In(bytes)
  const version = input.byte(`${what} version`)
  if (version !== 1 && version !== 2) {
    throw new SessionError(
      `the session string's ${what} is of a layout (${version}) that cannot be read`,
    )
  }
  const id = input.byte(`${what} datacenter`)
  checkDc(id, what)
  const flags = input.byte(`${what} flags`)
  if ((flags & ~(ADDRESS_IPV6 | ADDRESS_MEDIA_ONLY | ADDRESS_TEST)) !== 0) {
    throw new SessionError(`the session string's ${what} sets flags that cannot be read`)
  }
  const host = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes(`${what} host`))
  const port = input.int32(`${what} port`)
  if (host === '' || port < 1 || port > 65_535) {
    throw new SessionError(`the session string's ${what} is not an address that can be reached`)
  }

  return {
    id,
    host,
    port,
    ipv6: (flags & ADDRESS_IPV6) !== 0,
    mediaOnly: (flags & ADDRESS_MEDIA_ONLY) !== 0,
    test: version === 2 && (flags & ADDRESS_TEST) !== 0,
  }
}

/* -------------------------------------------------------------------------- */
/* The string                                                                 */
/* -------------------------------------------------------------------------- */

/** Write a version-3 session string. */
export function writeTlSession(session: TlSession): string {
  checkDc(session.dcId, 'account')
  if (session.authKey.length !== KEY_SIZE) {
    throw new SessionError(
      `an authorization key must be ${KEY_SIZE} bytes, received ${session.authKey.length}`,
    )
  }

  const main =
    session.addresses.find((address) => address.id === session.dcId && !address.mediaOnly) ??
    session.addresses.find((address) => address.id === session.dcId)
  if (main === undefined) {
    throw new SessionError(
      `a version-3 session string needs the address of datacenter ${session.dcId}, and none is known`,
    )
  }
  const media =
    session.addresses.find((address) => address.id === session.dcId && address.mediaOnly) ?? main

  const out = new Out()
  out.byte(VERSION)
  out.int32((session.self === undefined ? 0 : FLAG_SELF) | (media === main ? 0 : FLAG_MEDIA))
  const mainBytes = writeAddress({ ...main, mediaOnly: false }, session.testMode)
  out.bytes(mainBytes)
  if (media !== main) out.bytes(writeAddress(media, session.testMode))
  if (session.self !== undefined) {
    if (session.self.id <= 0n || session.self.id > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new SessionError('a version-3 session string cannot carry this user identifier')
    }
    out.int64(session.self.id)
    out.bool(session.self.isBot)
  }
  out.bytes(session.authKey)

  return toBase64Url(out.finish())
}

/** Read a version-3 session string, refusing anything that is not exactly one. */
export function readTlSession(text: string): TlSession {
  if (text.trim() === '') throw new SessionError('a session string is empty')

  const bytes = fromBase64Url(text)
  const version = bytes[0]
  if (version !== VERSION) {
    throw new SessionError(
      version === undefined
        ? 'a session string is empty'
        : `a version-3 session string starts with 3, and this one with ${version}`,
    )
  }

  const input = new In(bytes, 1)
  const flags = input.int32('flags')
  if ((flags & ~(FLAG_SELF | FLAG_TEST_NETWORK_OLD | FLAG_MEDIA)) !== 0) {
    throw new SessionError('the session string sets flags that cannot be read')
  }

  const main = readAddress(input.bytes('address'), 'address')
  const media =
    (flags & FLAG_MEDIA) !== 0 ? readAddress(input.bytes('media address'), 'media address') : main

  const oldTest = (flags & FLAG_TEST_NETWORK_OLD) !== 0
  if (!oldTest && main.test !== media.test) {
    throw new SessionError('the session string puts its two addresses on different networks')
  }

  let self: TlSession['self']
  if ((flags & FLAG_SELF) !== 0) {
    const id = input.int53('user identifier')
    if (id <= 0n || id > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new SessionError('the session string names a user identifier that cannot be one')
    }
    self = { id, isBot: input.bool('bot flag') }
  }

  const authKey = input.bytes('authorization key')
  if (authKey.length !== KEY_SIZE) {
    throw new SessionError(
      `the session string's authorization key is ${authKey.length} bytes, not ${KEY_SIZE}`,
    )
  }
  if (input.remaining !== 0) {
    throw new SessionError('the session string carries bytes after its key, so it is not one')
  }

  const strip = ({ test: _test, ...address }: SessionAddress & { readonly test: boolean }) =>
    address
  const addresses = media === main ? [strip(main)] : [strip(main), strip(media)]

  return {
    dcId: main.id,
    testMode: oldTest || main.test,
    authKey,
    addresses,
    ...(self === undefined ? {} : { self }),
  }
}
