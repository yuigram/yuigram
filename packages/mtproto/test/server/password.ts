/**
 * The server's half of a password check.
 *
 * Written from the protocol's own statement of the exchange rather than from
 * the client's implementation. The two sides compute the session key by
 * different routes — the client from `g_b` and its secret exponent, the server
 * from `g_a` and the verifier it stored when the password was set — and they
 * agree only if both are right. A verifier that recomputed the client's route
 * would agree with it however wrong the pair was.
 *
 * ```
 * k    := H(p | g)                       u   := H(g_a | g_b)
 * x    := PH2(password, salt1, salt2)    v   := pow(g, x) mod p
 * k_v  := (k * v) mod p                  g_b := (k_v + pow(g, b) mod p) mod p
 * s_b  := pow(g_a * (pow(v, u) mod p), b) mod p
 * k_b  := H(s_b)
 * M1   := H(H(p) xor H(g) | H(salt1) | H(salt2) | g_a | g_b | k_b)
 * ```
 *
 * Every operand is big-endian, padded to 2048 bits before it is hashed or
 * concatenated.
 */

import { createHash, pbkdf2Sync } from 'node:crypto'
import type { TlValue } from '../../src/tl/index.js'

/** Every SRP operand is hashed at this width. */
const WIDTH = 256

/** What the client is told, and what it must answer with. */
export interface PasswordExchange {
  readonly srpId: bigint
  readonly p: bigint
  readonly g: bigint
  readonly salt1: Uint8Array
  readonly salt2: Uint8Array
  readonly gB: bigint
}

/** A stretching step a test may replace to keep the cost down. */
export type Stretch = (input: Uint8Array, salt: Uint8Array) => Uint8Array

const realStretch: Stretch = (input, salt) =>
  new Uint8Array(pbkdf2Sync(input, salt, 100_000, 64, 'sha512'))

function h(...parts: readonly Uint8Array[]): Uint8Array {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part)

  return new Uint8Array(hash.digest())
}

/** `SH(data, salt) = H(salt | data | salt)` */
function sh(data: Uint8Array, salt: Uint8Array): Uint8Array {
  return h(salt, data, salt)
}

function pad(value: bigint): Uint8Array {
  const out = new Uint8Array(WIDTH)
  let rest = value
  for (let at = WIDTH - 1; at >= 0 && rest > 0n; at -= 1) {
    out[at] = Number(rest & 0xffn)
    rest >>= 8n
  }

  return out
}

function toBigInt(bytes: Uint8Array): bigint {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)

  return value
}

function power(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n
  let b = base % modulus
  let e = exponent
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus
    b = (b * b) % modulus
    e >>= 1n
  }

  return result
}

function xor(left: Uint8Array, right: Uint8Array): Uint8Array {
  return Uint8Array.from(left, (byte, index) => byte ^ (right[index] ?? 0))
}

/** `PH2`, transcribed from the protocol's definition. */
function passwordValue(
  password: Uint8Array,
  salt1: Uint8Array,
  salt2: Uint8Array,
  stretch: Stretch,
): bigint {
  const ph1 = sh(sh(password, salt1), salt2)

  return toBigInt(sh(stretch(ph1, salt1), salt2))
}

/**
 * A server that knows one password and will check a proof of it.
 *
 * The secret exponent is drawn once and kept, exactly as a server keeps it
 * against the exchange identifier — which is what makes a proof answer one
 * challenge rather than any challenge.
 */
export class PasswordServer {
  readonly #password: Uint8Array
  readonly #stretch: Stretch
  readonly #b: bigint
  readonly #v: bigint
  readonly exchange: PasswordExchange

  constructor(options: {
    password: string
    p: bigint
    g: bigint
    salt1: Uint8Array
    salt2: Uint8Array
    b?: bigint
    srpId?: bigint
    stretch?: Stretch
  }) {
    this.#password = new TextEncoder().encode(options.password)
    this.#stretch = options.stretch ?? realStretch
    this.#b = options.b ?? 0x5eed_1234_9abc_def0n

    const { p, g, salt1, salt2 } = options
    this.#v = power(g, passwordValue(this.#password, salt1, salt2, this.#stretch), p)

    const k = toBigInt(h(pad(p), pad(g)))
    const kv = (k * this.#v) % p

    this.exchange = {
      srpId: options.srpId ?? 0x0102_0304_0506_0708n,
      p,
      g,
      salt1,
      salt2,
      gB: (kv + power(g, this.#b, p)) % p,
    }
  }

  /** The answer `account.getPassword` would give. */
  describe(): TlValue {
    return {
      _: 'account.password',
      has_password: true,
      current_algo: {
        _: 'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow',
        salt1: this.exchange.salt1,
        salt2: this.exchange.salt2,
        g: Number(this.exchange.g),
        p: pad(this.exchange.p),
      },
      srp_B: pad(this.exchange.gB),
      srp_id: this.exchange.srpId,
      new_algo: { _: 'passwordKdfAlgoUnknown' },
      new_secure_algo: { _: 'securePasswordKdfAlgoUnknown' },
      secure_random: new Uint8Array(0),
    }
  }

  /** Whether a proof would be accepted. */
  accepts(answer: { srp_id: bigint; A: Uint8Array; M1: Uint8Array }): boolean {
    if (answer.srp_id !== this.exchange.srpId) return false

    const { p, g, salt1, salt2, gB } = this.exchange
    const gA = toBigInt(answer.A)
    if (gA <= 1n || gA >= p - 1n) return false

    const u = toBigInt(h(pad(gA), pad(gB)))
    const sB = power((gA * power(this.#v, u, p)) % p, this.#b, p)
    const expected = h(xor(h(pad(p)), h(pad(g))), h(salt1), h(salt2), pad(gA), pad(gB), h(pad(sB)))

    return (
      answer.M1.length === expected.length &&
      answer.M1.every((byte, index) => byte === expected[index])
    )
  }
}
