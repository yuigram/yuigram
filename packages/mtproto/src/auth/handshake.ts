/**
 * The client side of the authorization key exchange.
 *
 * Three round trips over the unencrypted channel produce a 2048-bit key that
 * neither end chose alone:
 *
 * ```
 * req_pq_multi          -> resPQ                  publish a semiprime and keys
 * req_DH_params         -> server_DH_params_ok    prove new_nonce under RSA
 * set_client_DH_params  -> dh_gen_ok              exchange public values
 * ```
 *
 * Written as a state machine over messages rather than as a sequence of calls
 * over a socket. It owns no connection: it is given the bytes of one message
 * and returns the bytes of the next, so the transport, the framing and the
 * retry policy above it are all somebody else's concern — and so the whole
 * exchange is reproducible from a fixed clock and a fixed source of randomness.
 *
 * **Every server-supplied value is hostile until checked.** The TL decoder
 * establishes that bytes have a shape; it establishes nothing about whether the
 * values inside are the ones this exchange is entitled to see. The checks that
 * follow each decode are what the protocol requires, and none of them is
 * optional or configurable — a switch that turns off a security check is a
 * switch that is found turned off in production.
 */

import { ConfigError, YuigramError } from '@yuigram/core'
import { modPow } from '../crypto/bigint.js'
import { bigIntToBytesBE, bytesToBigIntBE, concatBytes, equalBytes } from '../crypto/bytes.js'
import { factorizePq } from '../crypto/factorize.js'
import { sha1 } from '../crypto/hash.js'
import { igeDecrypt, igeEncrypt } from '../crypto/ige.js'
import { deriveHandshakeKeys, initialServerSalt } from '../crypto/kdf.js'
import { isValidDhPublicKey, validateDhParameters, validateDhPublicKey } from '../crypto/primes.js'
import { randomBytes as defaultRandom } from '../crypto/random.js'
import { rsaEncryptPadded } from '../crypto/rsa.js'
import { REGISTRY as CORE } from '../generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../generated/mtproto/registry.js'
import { AuthKey } from '../message/auth-key.js'
import {
  createMessageIdGenerator,
  decodePlaintextMessage,
  encodePlaintextMessage,
} from '../message/plaintext.js'
import { readObject, TlReader, TlScope, type TlValue, writeObject } from '../tl/index.js'
import type { ServerRsaKey } from './keys.js'

/**
 * The tables the unencrypted channel may decode.
 *
 * The API layer is deliberately absent. An API constructor cannot legitimately
 * appear before an authorization key exists, and a reader that could decode one
 * would accept traffic the protocol does not allow at this point — so the
 * exclusion is enforced by the identifier being genuinely absent from the
 * tables this reader was built with, not by a check that could be forgotten.
 */
const HANDSHAKE_SCOPE = new TlScope('handshake', [CORE, MTPROTO])

/** Auth keys and the modulus they are reduced under are 2048 bits. */
const KEY_SIZE = 256
/** AES-IGE operates on whole blocks. */
const BLOCK_SIZE = 16
/** Width of the hash prefixing both Diffie-Hellman inner blocks. */
const HASH_SIZE = 20
/** Widest `pq` the protocol can carry. */
const PQ_SIZE = 8

/**
 * Attempts before a retrying exchange is abandoned.
 *
 * `dh_gen_retry` asks for a new exponent, not a new handshake, and a server
 * that keeps asking is one this client cannot complete an exchange with. An
 * unbounded retry is a loop that never reports the failure it is in.
 */
const MAX_ATTEMPTS = 5

/** A handshake that cannot continue. */
export class HandshakeError extends YuigramError {
  override readonly name = 'HandshakeError'
}

/** How far the exchange has progressed. */
export type HandshakeState =
  | 'ready'
  | 'awaiting-res-pq'
  | 'awaiting-server-dh-params'
  | 'awaiting-dh-gen'
  | 'established'
  | 'failed'

/** How the exchange is configured. */
export interface HandshakeOptions {
  /** The server keys this client trusts. A fingerprint outside this set is refused. */
  readonly keys: readonly ServerRsaKey[]
  /** The datacenter this exchange is addressed to. */
  readonly dcId: number
  /**
   * Seconds a temporary key should live.
   *
   * Present for a key bound for forward secrecy, absent for a permanent one.
   */
  readonly expiresIn?: number
  /** Randomness for nonces, the secret exponent and RSA padding. */
  readonly random?: (length: number) => Uint8Array
  /** Milliseconds since the epoch, for message identifiers. */
  readonly now?: () => number
}

/** What a completed exchange established. */
export interface HandshakeResult {
  /** The negotiated key. */
  readonly authKey: AuthKey
  /** The first salt, derived rather than exchanged. */
  readonly serverSalt: bigint
  /** Seconds to add to the local clock to reach the server's. */
  readonly timeOffset: number
  /** How long a temporary key lives, when one was requested. */
  readonly expiresIn?: number
}

export class Handshake {
  #state: HandshakeState = 'ready'
  readonly #options: HandshakeOptions
  readonly #random: (length: number) => Uint8Array
  readonly #now: () => number
  readonly #nextMsgId: () => bigint

  /** Values this exchange is entitled to see echoed back. */
  #nonce: Uint8Array | undefined
  #serverNonce: Uint8Array | undefined
  #newNonce: Uint8Array | undefined

  /** The parameters the server offered, once validated. */
  #dhPrime: bigint | undefined
  #g: number | undefined
  #gA: bigint | undefined
  #timeOffset = 0

  /** The attempt awaiting acknowledgement, and how many have been made. */
  #pending: AuthKey | undefined
  #retryId = 0n
  #attempts = 0

  #result: HandshakeResult | undefined

  constructor(options: HandshakeOptions) {
    if (options.keys.length === 0) {
      throw new HandshakeError('a handshake needs at least one server key')
    }

    this.#options = options
    this.#random = options.random ?? defaultRandom
    this.#now = options.now ?? Date.now
    this.#nextMsgId = createMessageIdGenerator({
      origin: 'client',
      ...(options.now === undefined ? {} : { now: options.now }),
    })
  }

  get state(): HandshakeState {
    return this.#state
  }

  /** What the exchange established, once it has completed. */
  get result(): HandshakeResult | undefined {
    return this.#result
  }

  /** Open the exchange. The bytes are one unencrypted message. */
  start(): Uint8Array {
    this.#expect('ready', 'start')

    this.#nonce = this.#draw(16)
    this.#state = 'awaiting-res-pq'

    return this.#send({ _: 'req_pq_multi', nonce: this.#nonce })
  }

  /**
   * Take one unencrypted message and produce the next, or nothing when the
   * exchange has finished.
   */
  receive(message: Uint8Array): Uint8Array | undefined {
    if (this.#state === 'ready') {
      throw new HandshakeError('the exchange has not been started')
    }
    if (this.#state === 'established' || this.#state === 'failed') {
      throw new HandshakeError(`received a message while ${this.#state}`)
    }

    try {
      const value = readObject(decodePlaintextMessage(message).body, HANDSHAKE_SCOPE)

      switch (this.#state) {
        case 'awaiting-res-pq':
          return this.#send(this.#resPq(value))
        case 'awaiting-server-dh-params':
          return this.#send(this.#serverDhParams(value))
        case 'awaiting-dh-gen':
          return this.#dhGen(value)
      }
    } catch (error) {
      // A failed exchange is over. Leaving it resumable would mean a second
      // message could act on state the first one had already invalidated.
      this.#fail()
      throw error
    }
  }

  /** Step one: check the answer, factor the semiprime, choose a key. */
  #resPq(value: TlValue): TlValue {
    expectConstructor(value, 'resPQ')
    this.#matchNonce(value)

    this.#serverNonce = readFixed(value, 'server_nonce', 16)

    // `factorizePq` refuses a prime or a value that is not a product of two
    // primes, which is the protocol's requirement that pq be composite.
    const pq = readInteger(value, 'pq', PQ_SIZE)
    const { p, q } = factorizePq(pq)

    const offered = value['server_public_key_fingerprints']
    if (!Array.isArray(offered)) {
      throw new HandshakeError('resPQ carries no key fingerprints')
    }

    const key = this.#options.keys.find((held) =>
      offered.some((fingerprint) => fingerprint === held.fingerprint),
    )
    if (key === undefined) {
      // Configuration rather than circumstance: the keys an account holds are
      // fixed when it is built, so no later attempt could hold a different one.
      const named = offered.map((fingerprint) =>
        BigInt.asUintN(64, BigInt(fingerprint as bigint)).toString(16),
      )
      throw new ConfigError(
        `the datacenter offered server keys ${named.join(', ')} and this account holds none of ` +
          'them. Give the account the keys Telegram publishes for the network it connects to — ' +
          '`serverKeysFromPem` reads them — and the test network’s keys for the test network.',
      )
    }

    this.#newNonce = this.#draw(32)

    const common = {
      pq: bigIntToBytesBE(pq),
      p: bigIntToBytesBE(p),
      q: bigIntToBytesBE(q),
      nonce: this.#nonce,
      server_nonce: this.#serverNonce,
      new_nonce: this.#newNonce,
      dc: this.#options.dcId,
    }
    const inner: TlValue =
      this.#options.expiresIn === undefined
        ? { _: 'p_q_inner_data_dc', ...common }
        : {
            _: 'p_q_inner_data_temp_dc',
            ...common,
            expires_in: this.#options.expiresIn,
          }

    this.#state = 'awaiting-server-dh-params'

    return {
      _: 'req_DH_params',
      nonce: this.#nonce,
      server_nonce: this.#serverNonce,
      p: bigIntToBytesBE(p),
      q: bigIntToBytesBE(q),
      public_key_fingerprint: key.fingerprint,
      encrypted_data: rsaEncryptPadded(writeObject(inner, HANDSHAKE_SCOPE), key, this.#random),
    }
  }

  /**
   * Step two: open the server's answer and validate what it claims.
   *
   * The answer is encrypted under a key derived from `new_nonce`, which only
   * the holder of the RSA private key could have recovered. Decrypting it is
   * therefore evidence about who sent it — but only once the hash inside
   * confirms the decryption produced the bytes the sender encrypted.
   */
  #serverDhParams(value: TlValue): TlValue {
    expectConstructor(value, 'server_DH_params_ok')
    this.#matchNonce(value)
    this.#matchServerNonce(value)

    const newNonce = this.#require(this.#newNonce, 'new_nonce')
    const serverNonce = this.#require(this.#serverNonce, 'server_nonce')

    const tmp = deriveHandshakeKeys(newNonce, serverNonce)
    const answer = readHashed(
      igeDecrypt(readBytes(value, 'encrypted_answer'), tmp.key, tmp.iv),
      'server_DH_inner_data',
    )

    this.#matchNonce(answer)
    this.#matchServerNonce(answer)

    const dhPrime = readInteger(answer, 'dh_prime', KEY_SIZE)
    const g = readInt(answer, 'g')
    const gA = readInteger(answer, 'g_a', KEY_SIZE)

    // Every parameter the shared secret depends on comes from the server, so
    // every one is checked before it is used: the modulus is a 2048-bit safe
    // prime, the generator generates the subgroup it claims to, and the public
    // value sits far enough from both ends of the range.
    validateDhParameters({ p: dhPrime, g: BigInt(g) })
    validateDhPublicKey(gA, dhPrime)

    this.#dhPrime = dhPrime
    this.#g = g
    this.#gA = gA
    this.#timeOffset = readInt(answer, 'server_time') - Math.floor(this.#now() / 1000)

    this.#state = 'awaiting-dh-gen'
    return this.#clientDhParams()
  }

  /**
   * Offer a public value and compute the shared key it implies.
   *
   * Called once for the first attempt and again for each retry, which is what
   * `dh_gen_retry` asks for: a new exponent, not a new exchange.
   */
  #clientDhParams(): TlValue {
    const dhPrime = this.#require(this.#dhPrime, 'dh_prime')
    const gA = this.#require(this.#gA, 'g_a')
    const g = BigInt(this.#require(this.#g, 'g'))
    const newNonce = this.#require(this.#newNonce, 'new_nonce')
    const serverNonce = this.#require(this.#serverNonce, 'server_nonce')

    this.#attempts += 1
    if (this.#attempts > MAX_ATTEMPTS) {
      throw new HandshakeError(`the exchange did not complete in ${MAX_ATTEMPTS} attempts`)
    }

    const { gB, secret } = this.#exchange(g, gA, dhPrime)

    // The acknowledgement proves the server derived the same key, so the key is
    // computed now and held unestablished until that proof arrives.
    this.#pending = AuthKey.from(bigIntToBytesBE(secret, KEY_SIZE))

    const inner = writeObject(
      {
        _: 'client_DH_inner_data',
        nonce: this.#nonce,
        server_nonce: serverNonce,
        retry_id: this.#retryId,
        g_b: bigIntToBytesBE(gB, KEY_SIZE),
      },
      HANDSHAKE_SCOPE,
    )

    const tmp = deriveHandshakeKeys(newNonce, serverNonce)

    return {
      _: 'set_client_DH_params',
      nonce: this.#nonce,
      server_nonce: serverNonce,
      encrypted_data: igeEncrypt(this.#pad(concatBytes(sha1(inner), inner)), tmp.key, tmp.iv),
    }
  }

  /**
   * Draw a secret exponent and derive both the public value and the secret.
   *
   * The public value is checked against the same bounds the server's was. It is
   * this client's own output, so a failure here is a fault rather than an
   * attack — but a value that would be refused by the server produces a silent
   * failure several steps later, and drawing again costs nothing.
   */
  #exchange(g: bigint, gA: bigint, dhPrime: bigint): { gB: bigint; secret: bigint } {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const b = bytesToBigIntBE(this.#draw(KEY_SIZE)) % dhPrime
      const gB = modPow(g, b, dhPrime)
      if (!isValidDhPublicKey(gB, dhPrime)) continue

      const secret = modPow(gA, b, dhPrime)
      // A shared secret at either end of the range is a degenerate key that
      // reveals itself. Reaching one means the exchange was not what it claimed.
      if (!isValidDhPublicKey(secret, dhPrime)) continue

      return { gB, secret }
    }

    throw new HandshakeError('failed to draw a usable Diffie-Hellman exponent')
  }

  /**
   * Step three: the server's verdict.
   *
   * All three outcomes carry a hash over `new_nonce` and the key the server
   * derived, so each is verified against the key this client derived before it
   * is acted on. An acknowledgement that fails its hash is not a verdict about
   * this exchange.
   */
  #dhGen(value: TlValue): Uint8Array | undefined {
    // The constructor is checked before its fields, so a message of the wrong
    // kind is refused for being the wrong kind rather than for lacking a field
    // it was never going to have.
    if (value._ !== 'dh_gen_ok' && value._ !== 'dh_gen_retry' && value._ !== 'dh_gen_fail') {
      throw new HandshakeError(`'${value._}' is not an answer to set_client_DH_params`)
    }

    this.#matchNonce(value)
    this.#matchServerNonce(value)

    const newNonce = this.#require(this.#newNonce, 'new_nonce')
    const pending = this.#require(this.#pending, 'the attempted key')

    switch (value._) {
      case 'dh_gen_ok': {
        this.#verifyAcknowledgement(value, 'new_nonce_hash1', 1, newNonce, pending)

        this.#result = {
          authKey: pending,
          serverSalt: saltOf(newNonce, this.#require(this.#serverNonce, 'server_nonce')),
          timeOffset: this.#timeOffset,
          ...(this.#options.expiresIn === undefined ? {} : { expiresIn: this.#options.expiresIn }),
        }
        this.#settle('established')
        return undefined
      }

      case 'dh_gen_retry': {
        this.#verifyAcknowledgement(value, 'new_nonce_hash2', 2, newNonce, pending)

        // The next attempt names the one that failed, which is how the server
        // tells a retry apart from a fresh exchange.
        this.#retryId = bytesToBigIntLE(pending.auxHash)
        this.#pending = undefined

        return this.#send(this.#clientDhParams())
      }

      case 'dh_gen_fail': {
        this.#verifyAcknowledgement(value, 'new_nonce_hash3', 3, newNonce, pending)
        throw new HandshakeError('the server rejected the exchange')
      }

      default:
        throw new HandshakeError(`'${value._}' is not an answer to set_client_DH_params`)
    }
  }

  /** Check that an acknowledgement was produced against the key derived here. */
  #verifyAcknowledgement(
    value: TlValue,
    field: string,
    variant: 1 | 2 | 3,
    newNonce: Uint8Array,
    key: AuthKey,
  ): void {
    if (!equalBytes(readFixed(value, field, 16), key.nonceHash(newNonce, variant))) {
      throw new HandshakeError(`'${value._}' does not match the key this exchange derived`)
    }
  }

  /** Wrap a value in an unencrypted message. */
  #send(value: TlValue): Uint8Array {
    return encodePlaintextMessage(this.#nextMsgId(), writeObject(value, HANDSHAKE_SCOPE))
  }

  /** Pad to a whole number of AES blocks. */
  #pad(data: Uint8Array): Uint8Array {
    const size = (BLOCK_SIZE - (data.length % BLOCK_SIZE)) % BLOCK_SIZE
    return size === 0 ? data : concatBytes(data, this.#draw(size))
  }

  #draw(length: number): Uint8Array {
    const bytes = this.#random(length)
    if (bytes.length !== length) {
      throw new HandshakeError(`the random source returned ${bytes.length} of ${length} bytes`)
    }
    return bytes
  }

  #expect(state: HandshakeState, action: string): void {
    if (this.#state !== state) {
      throw new HandshakeError(`cannot ${action} while ${this.#state}`)
    }
  }

  #matchNonce(value: TlValue): void {
    const nonce = this.#require(this.#nonce, 'nonce')
    if (!equalBytes(readFixed(value, 'nonce', 16), nonce)) {
      throw new HandshakeError(`'${value._}' carries a different nonce`)
    }
  }

  #matchServerNonce(value: TlValue): void {
    const serverNonce = this.#require(this.#serverNonce, 'server_nonce')
    if (!equalBytes(readFixed(value, 'server_nonce', 16), serverNonce)) {
      throw new HandshakeError(`'${value._}' carries a different server_nonce`)
    }
  }

  #require<T>(value: T | undefined, name: string): T {
    if (value === undefined) {
      throw new HandshakeError(`${name} has not been established`)
    }
    return value
  }

  #fail(): void {
    this.#settle('failed')
    this.#result = undefined
  }

  /**
   * Drop everything the exchange no longer needs.
   *
   * `new_nonce` is the value the whole exchange is built on and the one an
   * attacker with a recorded transcript would need. It has no use once the key
   * exists, so it does not outlive it.
   */
  #settle(state: 'established' | 'failed'): void {
    this.#state = state
    this.#nonce = undefined
    this.#serverNonce = undefined
    this.#newNonce = undefined
    this.#gA = undefined
    this.#pending = undefined
  }
}

/** `server_salt = new_nonce[0..8] XOR server_nonce[0..8]`, read as a long. */
function saltOf(newNonce: Uint8Array, serverNonce: Uint8Array): bigint {
  return bytesToBigIntLE(initialServerSalt(newNonce, serverNonce))
}

/** Read eight bytes as a little-endian signed 64-bit value, as TL does. */
function bytesToBigIntLE(value: Uint8Array): bigint {
  return new DataView(value.buffer, value.byteOffset, value.byteLength).getBigInt64(0, true)
}

/**
 * Unwrap `SHA1(value) ‖ value ‖ padding`, checking the hash.
 *
 * The hash covers the encoded value alone, and nothing records where the
 * padding begins, so the boundary is whatever the decoder consumed. A block
 * decrypted under the wrong key produces a value that either fails to decode or
 * fails this comparison.
 */
function readHashed(plain: Uint8Array, expected: string): TlValue {
  if (plain.length < HASH_SIZE) {
    throw new HandshakeError('the encrypted answer is too short to carry a hash')
  }

  const body = plain.subarray(HASH_SIZE)
  const reader = new TlReader(body, HANDSHAKE_SCOPE)
  const value = reader.object()

  expectConstructor(value, expected)

  const consumed = body.length - reader.remaining
  if (!equalBytes(plain.subarray(0, HASH_SIZE), sha1(body.subarray(0, consumed)))) {
    throw new HandshakeError(`'${expected}' failed its integrity check`)
  }

  return value
}

function expectConstructor(value: TlValue, expected: string): void {
  if (value._ !== expected) {
    throw new HandshakeError(`expected '${expected}', received '${value._}'`)
  }
}

/** Read a fixed-width field, refusing anything of the wrong size. */
function readFixed(value: TlValue, field: string, size: number): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array) || raw.length !== size) {
    throw new HandshakeError(`'${value._}.${field}' must be ${size} bytes`)
  }
  return raw
}

/**
 * Read a byte field as an integer, refusing one wider than the protocol allows.
 *
 * The bound is on the *encoded width*, and it is checked before the conversion
 * rather than after. Converting a byte string to an integer costs time
 * quadratic in its length, so a field the transport would accept at its 16 MB
 * frame limit occupies this client for hours — long before any check on the
 * resulting value could run. Every one of these fields has a width the protocol
 * fixes, and nothing wider is a value a server could legitimately be sending.
 */
function readInteger(value: TlValue, field: string, maxBytes: number): bigint {
  const raw = readBytes(value, field)
  if (raw.length > maxBytes) {
    throw new HandshakeError(
      `'${value._}.${field}' must be at most ${maxBytes} bytes, received ${raw.length}`,
    )
  }

  return bytesToBigIntBE(raw)
}

/** Read a variable-width byte field. */
function readBytes(value: TlValue, field: string): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array)) {
    throw new HandshakeError(`'${value._}.${field}' must be a byte string`)
  }
  return raw
}

/** Read a 32-bit field. */
function readInt(value: TlValue, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number') {
    throw new HandshakeError(`'${value._}.${field}' must be a 32-bit integer`)
  }
  return raw
}
