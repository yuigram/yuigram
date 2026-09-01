/**
 * The server half of the authorization key exchange.
 *
 * A peer that genuinely performs the exchange: it decrypts what the client
 * encrypted, checks every value the protocol says it must check, and derives
 * the shared key from its own secret exponent. Nothing is echoed back
 * unexamined and nothing is taken from the client's own computation, so a
 * handshake that completes here is evidence the client's half is correct rather
 * than evidence that one implementation agrees with itself.
 *
 * The key schedules are written out again from the specification instead of
 * being imported. They are the part of the handshake with no visible failure
 * mode — a misplaced offset yields a key that is simply wrong, and both ends
 * would be wrong together if they shared the derivation. AES-IGE and the hashes
 * are taken from the package, because those are already checked against the
 * platform and duplicating them would only create two things to maintain.
 */

import { createHash } from 'node:crypto'
import { modPow } from '../../src/crypto/bigint.js'
import {
  bigIntToBytesBE,
  bytesToBigIntBE,
  concatBytes,
  equalBytes,
} from '../../src/crypto/bytes.js'
import { igeDecrypt, igeEncrypt } from '../../src/crypto/ige.js'
import { REGISTRY as CORE } from '../../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../../src/generated/mtproto/registry.js'
import { TlReader, TlScope, type TlValue, writeObject } from '../../src/tl/index.js'
import type { ServerKey } from './keys.js'

/**
 * The tables a peer may decode before an auth key exists.
 *
 * Deliberately excludes the API layer: an API constructor cannot appear in an
 * unencrypted message, and a peer that could decode one would accept traffic
 * the protocol does not allow at this point in the connection.
 */
export const HANDSHAKE_SCOPE = new TlScope('handshake', [CORE, MTPROTO])

/** A message the client should not have sent, or sent wrongly. */
export class HandshakeViolation extends Error {
  override readonly name = 'HandshakeViolation'
}

/** How far the exchange has progressed. */
export type HandshakeState =
  | 'awaiting-req-pq'
  | 'awaiting-req-dh-params'
  | 'awaiting-set-client-dh-params'
  | 'established'

/**
 * A deliberate deviation from correct server behaviour.
 *
 * The peer exists to test a client, and a client's error paths are unreachable
 * against a server that never misbehaves. Each of these corresponds to a
 * failure a real server or an active attacker can produce.
 */
export type HandshakeFault =
  /** Echo a nonce other than the one the client sent. */
  | 'wrong-nonce'
  /** Change the server nonce partway through the exchange. */
  | 'wrong-server-nonce'
  /** Offer only a key fingerprint the client cannot hold. */
  | 'unknown-fingerprint'
  /** Answer `req_pq_multi` with something that is not `resPQ`. */
  | 'malformed-res-pq'
  /** Corrupt the hash prefixing the encrypted answer. */
  | 'bad-answer-hash'
  /** Offer a modulus that is not a safe prime. */
  | 'unsafe-dh-prime'
  /** Offer a public value at the bottom of the range. */
  | 'invalid-g-a'
  /** Acknowledge with a hash that does not cover the derived key. */
  | 'wrong-nonce-hash'
  /** Ask for one retry, then complete. */
  | 'dh-gen-retry'
  /** Ask for a retry every time, so a bound is the only thing that ends it. */
  | 'dh-gen-retry-always'
  /** Refuse the exchange outright. */
  | 'dh-gen-fail'
  /** Answer the last step with a well-formed message that is not a verdict. */
  | 'not-a-verdict'
  /** Offer a semiprime far wider than the field can carry. */
  | 'oversized-pq'
  /** Offer a modulus far wider than the field can carry. */
  | 'oversized-dh-prime'

/** What the peer is configured with. Every field fixes an otherwise random value. */
export interface HandshakeOptions {
  /** Deliberate misbehaviour, for exercising a client's rejection paths. */
  readonly faults?: ReadonlySet<HandshakeFault>
  /** The key pair whose fingerprint the peer offers. */
  readonly key: ServerKey
  /** The semiprime the client is asked to factor. */
  readonly pq: bigint
  /** The Diffie-Hellman modulus. */
  readonly dhPrime: bigint
  /** The Diffie-Hellman generator. */
  readonly g: number
  /** The peer's secret exponent. */
  readonly a: bigint
  /** The nonce the peer contributes. */
  readonly serverNonce: Uint8Array
  /** Seconds since the epoch, as reported in `server_DH_inner_data`. */
  readonly serverTime: number
  /** Padding for the encrypted answer. */
  readonly random: (length: number) => Uint8Array
}

/** What the exchange produced, once it has completed. */
export interface HandshakeResult {
  /** The 2048-bit shared key. */
  readonly authKey: Uint8Array
  /** The salt both ends derive rather than exchange. */
  readonly serverSalt: Uint8Array
  /** How long a temporary key lives, when the client asked for one. */
  readonly expiresIn?: number
}

/** IGE operates on whole blocks. */
const BLOCK_SIZE = 16
/** Auth keys are 2048 bits, and so is the modulus they are reduced under. */
const KEY_SIZE = 256
/** Width of the hash prefixing both Diffie-Hellman inner blocks. */
const HASH_SIZE = 20
/**
 * The margin a public value must keep from either end of the range.
 *
 * `1 < g_b < p - 1` alone is not enough: a value close to an endpoint leaves so
 * few possibilities for the shared secret that it can be searched. Telegram's
 * servers enforce the wider bound, so a peer that only enforced the narrow one
 * would accept a client that real servers reject.
 */
const DH_MARGIN = 2n ** 1984n

export class Handshake {
  #state: HandshakeState = 'awaiting-req-pq'
  readonly #options: HandshakeOptions

  /** Nonces are held to check that later messages belong to this exchange. */
  #nonce: Uint8Array | undefined
  #newNonce: Uint8Array | undefined
  #expiresIn: number | undefined
  #result: HandshakeResult | undefined

  /** Attempts made, and the identifier the next one must name. */
  #attempts = 0
  #expectedRetryId = 0n

  constructor(options: HandshakeOptions) {
    this.#options = options
  }

  /** Whether the peer was configured to misbehave in this particular way. */
  #faulty(fault: HandshakeFault): boolean {
    return this.#options.faults?.has(fault) === true
  }

  get state(): HandshakeState {
    return this.#state
  }

  /** What the exchange agreed on, or `undefined` while it is still running. */
  get result(): HandshakeResult | undefined {
    return this.#result
  }

  /** Answer one request, advancing the exchange by a step. */
  handle(request: TlValue): TlValue {
    switch (request._) {
      case 'req_pq_multi':
        return this.#reqPq(request)
      case 'req_DH_params':
        return this.#reqDhParams(request)
      case 'set_client_DH_params':
        return this.#setClientDhParams(request)
      default:
        throw new HandshakeViolation(`'${request._}' is not part of the key exchange`)
    }
  }

  /** Step one: publish the semiprime and the keys available to protect step two. */
  #reqPq(request: TlValue): TlValue {
    this.#expect('awaiting-req-pq', request._)

    this.#nonce = readFixed(request, 'nonce', 16)
    this.#state = 'awaiting-req-dh-params'

    if (this.#faulty('malformed-res-pq')) {
      // A well-formed message of the wrong kind. The client must reject it on
      // the constructor, not on a field it happens not to find.
      return { _: 'pong', msg_id: 1n, ping_id: 2n }
    }

    return {
      _: 'resPQ',
      nonce: this.#faulty('wrong-nonce') ? flipFirst(this.#nonce) : this.#nonce,
      server_nonce: this.#options.serverNonce,
      pq: this.#faulty('oversized-pq')
        ? new Uint8Array(1_000_000).fill(0xff)
        : bigIntToBytesBE(this.#options.pq),
      server_public_key_fingerprints: [
        this.#faulty('unknown-fingerprint')
          ? this.#options.key.fingerprint ^ 0x0f0f_0f0f_0f0f_0f0fn
          : this.#options.key.fingerprint,
      ],
    }
  }

  /**
   * Step two: check the factorization, recover the client's inner data, and
   * answer with the peer's public Diffie-Hellman value.
   *
   * The encrypted answer is `SHA1(inner) ‖ inner ‖ padding`, encrypted under a
   * key derived from `new_nonce` — which the client has just proved it knows by
   * placing it inside the RSA block.
   */
  #reqDhParams(request: TlValue): TlValue {
    this.#expect('awaiting-req-dh-params', request._)
    this.#matchNonces(request)

    const p = bytesToBigIntBE(readBytes(request, 'p'))
    const q = bytesToBigIntBE(readBytes(request, 'q'))

    if (p * q !== this.#options.pq) {
      throw new HandshakeViolation('the submitted factors are not the ones that were published')
    }
    if (p >= q) {
      throw new HandshakeViolation('the factors must be submitted smaller first')
    }
    if (readLong(request, 'public_key_fingerprint') !== this.#options.key.fingerprint) {
      throw new HandshakeViolation('the client selected a key this peer does not hold')
    }

    const inner = this.#decodeInnerData(readBytes(request, 'encrypted_data'))

    if (bytesToBigIntBE(readBytes(inner, 'pq')) !== this.#options.pq) {
      throw new HandshakeViolation('the encrypted block names a different semiprime')
    }
    // The factors appear twice, once in the clear and once inside the block an
    // observer cannot alter. They have to agree, or the visible pair says
    // nothing about what the client actually committed to.
    if (
      bytesToBigIntBE(readBytes(inner, 'p')) !== p ||
      bytesToBigIntBE(readBytes(inner, 'q')) !== q
    ) {
      throw new HandshakeViolation('the encrypted block names different factors')
    }
    this.#matchNonces(inner)

    const newNonce = readFixed(inner, 'new_nonce', 32)
    this.#newNonce = newNonce
    if (inner._ === 'p_q_inner_data_temp_dc') {
      this.#expiresIn = readInt(inner, 'expires_in')
    }

    // A prime one less than a safe prime is still 2048 bits and still odd, so
    // it passes every cheap check and fails only the full primality test.
    // Subtracting three keeps the residue the generator congruence checks and
    // makes the value even, so it is refused by the primality test rather than
    // by a cheaper check standing in front of it.
    const dhPrime = this.#faulty('unsafe-dh-prime')
      ? this.#options.dhPrime - 3n
      : this.#options.dhPrime
    const gA = this.#faulty('invalid-g-a')
      ? 1n
      : modPow(BigInt(this.#options.g), this.#options.a, this.#options.dhPrime)

    const answer = writeObject(
      {
        _: 'server_DH_inner_data',
        nonce: this.#nonce,
        server_nonce: this.#options.serverNonce,
        g: this.#options.g,
        dh_prime: this.#faulty('oversized-dh-prime')
          ? new Uint8Array(1_000_000).fill(0xff)
          : bigIntToBytesBE(dhPrime, KEY_SIZE),
        g_a: bigIntToBytesBE(gA, KEY_SIZE),
        server_time: this.#options.serverTime,
      },
      HANDSHAKE_SCOPE,
    )

    const { key, iv } = handshakeKeys(newNonce, this.#options.serverNonce)
    this.#state = 'awaiting-set-client-dh-params'

    const hash = this.#faulty('bad-answer-hash') ? flipFirst(sha1(answer)) : sha1(answer)

    return {
      _: 'server_DH_params_ok',
      nonce: this.#nonce,
      server_nonce: this.#faulty('wrong-server-nonce')
        ? flipFirst(this.#options.serverNonce)
        : this.#options.serverNonce,
      encrypted_answer: igeEncrypt(this.#pad(concatBytes(hash, answer)), key, iv),
    }
  }

  /**
   * Step three: combine the client's public value with the peer's secret and
   * acknowledge the key that results.
   */
  #setClientDhParams(request: TlValue): TlValue {
    this.#expect('awaiting-set-client-dh-params', request._)
    this.#matchNonces(request)

    const newNonce = this.#newNonce
    if (newNonce === undefined) {
      throw new HandshakeViolation('no new_nonce was established')
    }

    const { key, iv } = handshakeKeys(newNonce, this.#options.serverNonce)
    const inner = decodeHashed(
      igeDecrypt(readBytes(request, 'encrypted_data'), key, iv),
      'client_DH_inner_data',
    )

    this.#matchNonces(inner)
    // The first attempt names no predecessor; a retry must name the key of the
    // attempt this peer refused, which is how a retry is told from a restart.
    if (readLong(inner, 'retry_id') !== this.#expectedRetryId) {
      throw new HandshakeViolation('the retry does not name the attempt that failed')
    }

    const gB = bytesToBigIntBE(readBytes(inner, 'g_b'))
    const dhPrime = this.#options.dhPrime
    if (gB <= 1n || gB >= dhPrime - 1n) {
      throw new HandshakeViolation('g_b is outside the permitted range')
    }
    if (gB <= DH_MARGIN || gB >= dhPrime - DH_MARGIN) {
      throw new HandshakeViolation('g_b is within 2^1984 of an endpoint')
    }

    const authKey = bigIntToBytesBE(modPow(gB, this.#options.a, this.#options.dhPrime), KEY_SIZE)
    this.#attempts += 1

    if (this.#faulty('not-a-verdict')) {
      return { _: 'pong', msg_id: 1n, ping_id: 2n }
    }

    if (this.#faulty('dh-gen-fail')) {
      return {
        _: 'dh_gen_fail',
        nonce: this.#nonce,
        server_nonce: this.#options.serverNonce,
        new_nonce_hash3: newNonceHash(newNonce, 3, authKey),
      }
    }

    if (
      this.#faulty('dh-gen-retry-always') ||
      (this.#faulty('dh-gen-retry') && this.#attempts === 1)
    ) {
      // The state does not advance: a retry asks for another exponent under the
      // same exchange, not for the exchange to begin again.
      this.#expectedRetryId = readInt64LE(authKeyAuxHash(authKey))
      return {
        _: 'dh_gen_retry',
        nonce: this.#nonce,
        server_nonce: this.#options.serverNonce,
        new_nonce_hash2: newNonceHash(newNonce, 2, authKey),
      }
    }

    this.#result = {
      authKey,
      serverSalt: xor(newNonce.subarray(0, 8), this.#options.serverNonce.subarray(0, 8)),
      ...(this.#expiresIn === undefined ? {} : { expiresIn: this.#expiresIn }),
    }
    this.#state = 'established'

    const acknowledgement = newNonceHash(newNonce, 1, authKey)

    return {
      _: 'dh_gen_ok',
      nonce: this.#nonce,
      server_nonce: this.#options.serverNonce,
      new_nonce_hash1: this.#faulty('wrong-nonce-hash')
        ? flipFirst(acknowledgement)
        : acknowledgement,
    }
  }

  /**
   * Undo the RSA step and decode what the client hid inside it.
   *
   * The legacy scheme hashes only the encoded value, whose length the padding
   * does not record, so that check can only happen once the value has been
   * decoded and the reader can say how many bytes it consumed.
   */
  #decodeInnerData(cipher: Uint8Array): TlValue {
    const plain = this.#options.key.decrypt(cipher)

    const reader = new TlReader(plain.data, HANDSHAKE_SCOPE)
    const value = reader.object()

    if (value._ !== 'p_q_inner_data_dc' && value._ !== 'p_q_inner_data_temp_dc') {
      throw new HandshakeViolation(`the encrypted block holds '${value._}'`)
    }

    if (plain.scheme === 'legacy') {
      const consumed = plain.data.length - reader.remaining
      if (!equalBytes(plain.hash, sha1(plain.data.subarray(0, consumed)))) {
        throw new HandshakeViolation('the encrypted block failed its integrity check')
      }
    }

    return value
  }

  /** Pad to a whole number of IGE blocks. */
  #pad(data: Uint8Array): Uint8Array {
    const size = (BLOCK_SIZE - (data.length % BLOCK_SIZE)) % BLOCK_SIZE
    return size === 0 ? data : concatBytes(data, this.#options.random(size))
  }

  #expect(state: HandshakeState, received: string): void {
    if (this.#state !== state) {
      throw new HandshakeViolation(`received '${received}' while ${this.#state}`)
    }
  }

  /** Both nonces must match the ones this exchange was opened with. */
  #matchNonces(value: TlValue): void {
    const nonce = this.#nonce
    if (nonce === undefined) {
      throw new HandshakeViolation('no nonce was established')
    }
    if (!equalBytes(readFixed(value, 'nonce', 16), nonce)) {
      throw new HandshakeViolation(`'${value._}' carries a different nonce`)
    }
    if (!equalBytes(readFixed(value, 'server_nonce', 16), this.#options.serverNonce)) {
      throw new HandshakeViolation(`'${value._}' carries a different server_nonce`)
    }
  }
}

/**
 * `SHA1(value) ‖ value ‖ padding`, checked and unwrapped.
 *
 * Both halves of the Diffie-Hellman exchange travel in this envelope, and the
 * hash is the only thing distinguishing a correctly decrypted block from one
 * decrypted under the wrong key.
 */
function decodeHashed(plain: Uint8Array, expected: string): TlValue {
  if (plain.length < HASH_SIZE) {
    throw new HandshakeViolation('the encrypted block is too short to carry a hash')
  }

  const body = plain.subarray(HASH_SIZE)
  const reader = new TlReader(body, HANDSHAKE_SCOPE)
  const value = reader.object()

  if (value._ !== expected) {
    throw new HandshakeViolation(`expected '${expected}', received '${value._}'`)
  }

  // The hash covers the encoded value alone, so the padding has to be measured
  // rather than assumed: only the bytes the reader consumed are hashed.
  const consumed = body.length - reader.remaining
  if (!equalBytes(plain.subarray(0, HASH_SIZE), sha1(body.subarray(0, consumed)))) {
    throw new HandshakeViolation(`'${expected}' failed its integrity check`)
  }

  return value
}

/**
 * The temporary key protecting the Diffie-Hellman exchange.
 *
 * ```
 * key = SHA1(new_nonce ‖ server_nonce) ‖ SHA1(server_nonce ‖ new_nonce)[0..12]
 * iv  = SHA1(server_nonce ‖ new_nonce)[12..20] ‖ SHA1(new_nonce ‖ new_nonce)
 *       ‖ new_nonce[0..4]
 * ```
 */
function handshakeKeys(
  newNonce: Uint8Array,
  serverNonce: Uint8Array,
): { key: Uint8Array; iv: Uint8Array } {
  const newServer = sha1(newNonce, serverNonce)
  const serverNew = sha1(serverNonce, newNonce)
  const newNew = sha1(newNonce, newNonce)

  return {
    key: concatBytes(newServer, serverNew.subarray(0, 12)),
    iv: concatBytes(serverNew.subarray(12, 20), newNew, newNonce.subarray(0, 4)),
  }
}

/** `SHA1(new_nonce ‖ variant ‖ SHA1(auth_key)[0..8])[4..20]`. */
function newNonceHash(newNonce: Uint8Array, variant: number, authKey: Uint8Array): Uint8Array {
  return sha1(newNonce, Uint8Array.of(variant), sha1(authKey).subarray(0, 8)).subarray(4, 20)
}

/** The high 64 bits of SHA1(auth_key), which name a key without revealing it. */
function authKeyAuxHash(authKey: Uint8Array): Uint8Array {
  return sha1(authKey).subarray(0, 8)
}

/** Read eight bytes as a little-endian signed 64-bit value, as TL does. */
function readInt64LE(value: Uint8Array): bigint {
  return new DataView(value.buffer, value.byteOffset, value.byteLength).getBigInt64(0, true)
}

/** Change a value without changing its shape. */
function flipFirst(value: Uint8Array): Uint8Array {
  const out = Uint8Array.from(value)
  out[0] = (out[0] ?? 0) ^ 0xff
  return out
}

function sha1(...parts: Uint8Array[]): Uint8Array {
  const hash = createHash('sha1')
  for (const part of parts) hash.update(part)
  return new Uint8Array(hash.digest())
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  return Uint8Array.from(a, (byte, index) => byte ^ (b[index] ?? 0))
}

/** Read a fixed-width field, refusing anything of the wrong size. */
function readFixed(value: TlValue, field: string, size: number): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array) || raw.length !== size) {
    throw new HandshakeViolation(`'${value._}.${field}' must be ${size} bytes`)
  }
  return raw
}

/** Read a variable-width byte field. */
function readBytes(value: TlValue, field: string): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array)) {
    throw new HandshakeViolation(`'${value._}.${field}' must be a byte string`)
  }
  return raw
}

/** Read a 64-bit field. */
function readLong(value: TlValue, field: string): bigint {
  const raw = value[field]
  if (typeof raw !== 'bigint') {
    throw new HandshakeViolation(`'${value._}.${field}' must be a 64-bit integer`)
  }
  return raw
}

/** Read a 32-bit field. */
function readInt(value: TlValue, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number') {
    throw new HandshakeViolation(`'${value._}.${field}' must be a 32-bit integer`)
  }
  return raw
}
