// SPDX-License-Identifier: MIT

/**
 * The authorization key exchange, end to end.
 *
 * These tests drive the package's own primitives — obfuscation, framing, the
 * plaintext envelope, the TL codec, RSA, IGE and the key schedules — against a
 * peer that performs the server half independently. Nothing is asserted about
 * the client's output by re-running the client's code: the assertion is that
 * the peer accepts it and that both ends arrive at the same 2048-bit key.
 *
 * A shared mistake cannot pass. The peer derives its key from its own secret
 * exponent and rebuilds every schedule from the specification, so a wrong
 * offset produces a key that differs, and a key that differs fails the final
 * acknowledgement rather than being quietly accepted.
 *
 * The adversarial cases run the same machinery with one value corrupted, which
 * is what shows the peer's checks are load-bearing rather than decorative.
 */

import { describe, expect, it } from 'vitest'
import { modPow } from '../src/crypto/bigint.js'
import { bigIntToBytesBE, bytesToBigIntBE, concatBytes } from '../src/crypto/bytes.js'
import { factorizePq } from '../src/crypto/factorize.js'
import { sha1 } from '../src/crypto/hash.js'
import { igeDecrypt, igeEncrypt } from '../src/crypto/ige.js'
import {
  authKeyId,
  deriveHandshakeKeys,
  initialServerSalt,
  newNonceHash,
} from '../src/crypto/kdf.js'
import { validateDhParameters, validateDhPublicKey } from '../src/crypto/primes.js'
import { type RsaPublicKey, rsaEncryptLegacy, rsaEncryptPadded } from '../src/crypto/rsa.js'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import {
  createMessageIdGenerator,
  decodePlaintextMessage,
  encodePlaintextMessage,
} from '../src/message/plaintext.js'
import { readObject, TlReader, TlScope, type TlValue, writeObject } from '../src/tl/index.js'
import {
  AbridgedFraming,
  type Frame,
  FrameBuffer,
  type Framing,
  FullFraming,
  IntermediateFraming,
  PaddedIntermediateFraming,
} from '../src/transport/framing.js'
import { createObfuscation, type Obfuscation } from '../src/transport/obfuscation.js'
import { HandshakeViolation } from './server/handshake.js'
import { createServerKey } from './server/keys.js'
import {
  DH_PRIME,
  MockServer,
  MockServerError,
  type MockServerOptions,
  type ObfuscatableFraming,
} from './server/server.js'

/** The tables a client may decode before an auth key exists. */
const HANDSHAKE_SCOPE = new TlScope('handshake', [CORE, MTPROTO])

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A deterministic, non-repeating byte source. */
function scripted(seed: number): (length: number) => Uint8Array {
  let draw = 0
  return (length) => {
    const value = draw
    draw += 1
    return Uint8Array.from(
      { length },
      (_, index) => (seed * 13 + value * 31 + index * 17 + 1) & 0xff,
    )
  }
}

interface ClientOptions {
  /** The envelope the client announces. Intermediate unless stated. */
  readonly framing?: Framing
  /** Whether to obfuscate the stream. */
  readonly obfuscated?: boolean
  /** The MTProxy secret, when one is in use. */
  readonly secret?: Uint8Array
  /** Randomness for the init packet and padding. */
  readonly random?: (length: number) => Uint8Array
  /** Deliver bytes to the peer in slices of this size, rather than whole. */
  readonly chunk?: number
}

/**
 * The client end of a connection.
 *
 * It owns only the transport: announcing a framing, encrypting the stream, and
 * turning one request into one response. The exchange itself is written out
 * below, so a case can send a message no real client would.
 */
class Client {
  readonly #server: MockServer
  readonly #framing: Framing
  readonly #buffer = new FrameBuffer()
  readonly #obfuscation: Obfuscation | undefined
  readonly #chunk: number | undefined
  readonly #nextMsgId = createMessageIdGenerator({
    origin: 'client',
    now: () => 1_700_000_000_000,
  })

  constructor(server: MockServer, options: ClientOptions = {}) {
    this.#server = server
    this.#framing = options.framing ?? new IntermediateFraming()
    this.#chunk = options.chunk

    const random = options.random ?? scripted(1)
    this.#obfuscation =
      options.obfuscated === true
        ? createObfuscation(this.#framing, {
            random,
            ...(options.secret === undefined ? {} : { secret: options.secret }),
          })
        : undefined
  }

  /** Announce the transport, which is the first thing on any connection. */
  open(): void {
    const opening = this.#obfuscation?.init ?? this.#framing.tag()
    if (opening.length > 0) this.#deliver(opening)
  }

  /** Send one TL value and read the single response it produces. */
  send(value: TlValue): TlValue {
    return one(this.sendRaw(writeObject(value, HANDSHAKE_SCOPE)))
  }

  /** Send an arbitrary message body, for a case no encoder would produce. */
  sendRaw(body: Uint8Array): Uint8Array[] {
    return this.#deliver(
      this.#encrypt(this.#framing.encode(encodePlaintextMessage(this.#nextMsgId(), body))),
    )
  }

  /** Send bytes that are already framed, bypassing the envelope. */
  sendFramed(framed: Uint8Array): Uint8Array[] {
    return this.#deliver(this.#encrypt(framed))
  }

  /** Decode bytes the peer sent without being asked, as frames. */
  frames(bytes: Uint8Array): Frame[] {
    this.#buffer.push(this.#decrypt(bytes))

    const out: Frame[] = []
    for (;;) {
      const frame = this.#framing.decode(this.#buffer)
      if (frame === undefined) return out
      out.push(frame)
    }
  }

  /** Hand bytes to the peer, splitting them if the case asked for that. */
  #deliver(bytes: Uint8Array): Uint8Array[] {
    const size = this.#chunk
    if (size === undefined) return this.#collect(this.#server.receive(bytes))

    const replies: Uint8Array[] = []
    for (let offset = 0; offset < bytes.length; offset += size) {
      replies.push(...this.#collect(this.#server.receive(bytes.subarray(offset, offset + size))))
    }
    return replies
  }

  /** Turn the peer's bytes into whole message bodies. */
  #collect(bytes: Uint8Array): Uint8Array[] {
    const bodies: Uint8Array[] = []

    for (const frame of this.frames(bytes)) {
      if (frame.kind === 'error') {
        throw new Error(`the peer reported transport error ${frame.code}`)
      }
      bodies.push(decodePlaintextMessage(frame.bytes).body)
    }

    return bodies
  }

  #encrypt(data: Uint8Array): Uint8Array {
    return this.#obfuscation?.encrypt(data) ?? data
  }

  #decrypt(data: Uint8Array): Uint8Array {
    return this.#obfuscation?.decrypt(data) ?? data
  }
}

function one(bodies: readonly Uint8Array[]): TlValue {
  if (bodies.length !== 1) {
    throw new Error(`expected one response, received ${bodies.length}`)
  }
  return readObject(bodies[0] ?? new Uint8Array(0), HANDSHAKE_SCOPE)
}

/** What a completed exchange produced on the client side. */
interface Negotiated {
  readonly authKey: Uint8Array
  readonly serverSalt: Uint8Array
  readonly newNonce: Uint8Array
  readonly serverNonce: Uint8Array
  readonly acknowledgement: TlValue
}

interface NegotiateOptions {
  /** Use the pre-`rsa_pad` padding scheme. */
  readonly legacy?: boolean
  /** Ask for a temporary key that expires after this many seconds. */
  readonly expiresIn?: number
  /** Check the peer's Diffie-Hellman parameters, which is slow but real. */
  readonly validate?: boolean
}

/**
 * The client half of the exchange, written from the specification.
 *
 * Every step uses the package's own primitives, so a fault in any of them
 * surfaces as a peer that rejects a message or as a key that fails to match.
 */
function negotiate(
  client: Client,
  serverKey: RsaPublicKey,
  options: NegotiateOptions = {},
): Negotiated {
  const random = scripted(9)
  const nonce = random(16)

  const resPq = client.send({ _: 'req_pq_multi', nonce })
  expect(resPq._).toBe('resPQ')
  expect(hex(bytes(resPq, 'nonce'))).toBe(hex(nonce))

  const serverNonce = bytes(resPq, 'server_nonce')
  const { p, q } = factorizePq(bytesToBigIntBE(bytes(resPq, 'pq')))
  const fingerprint = (resPq['server_public_key_fingerprints'] as readonly bigint[])[0] ?? 0n

  const newNonce = random(32)
  const common = {
    pq: bytes(resPq, 'pq'),
    p: bigIntToBytesBE(p),
    q: bigIntToBytesBE(q),
    nonce,
    server_nonce: serverNonce,
    new_nonce: newNonce,
    dc: 2,
  }
  const inner: TlValue =
    options.expiresIn === undefined
      ? { _: 'p_q_inner_data_dc', ...common }
      : { _: 'p_q_inner_data_temp_dc', ...common, expires_in: options.expiresIn }

  const encrypt = options.legacy === true ? rsaEncryptLegacy : rsaEncryptPadded

  const params = client.send({
    _: 'req_DH_params',
    nonce,
    server_nonce: serverNonce,
    p: bigIntToBytesBE(p),
    q: bigIntToBytesBE(q),
    public_key_fingerprint: fingerprint,
    encrypted_data: encrypt(writeObject(inner, HANDSHAKE_SCOPE), serverKey, random),
  })
  expect(params._).toBe('server_DH_params_ok')

  const tmp = deriveHandshakeKeys(newNonce, serverNonce)
  const serverInner = readHashed(
    igeDecrypt(bytes(params, 'encrypted_answer'), tmp.key, tmp.iv),
    'server_DH_inner_data',
  )

  const dhPrime = bytesToBigIntBE(bytes(serverInner, 'dh_prime'))
  const g = BigInt(serverInner['g'] as number)
  const gA = bytesToBigIntBE(bytes(serverInner, 'g_a'))

  if (options.validate === true) {
    validateDhParameters({ p: dhPrime, g })
    validateDhPublicKey(gA, dhPrime)
  }

  const b = bytesToBigIntBE(random(256)) % dhPrime
  const clientInner = writeObject(
    {
      _: 'client_DH_inner_data',
      nonce,
      server_nonce: serverNonce,
      retry_id: 0n,
      g_b: bigIntToBytesBE(modPow(g, b, dhPrime), 256),
    },
    HANDSHAKE_SCOPE,
  )

  const acknowledgement = client.send({
    _: 'set_client_DH_params',
    nonce,
    server_nonce: serverNonce,
    encrypted_data: igeEncrypt(
      pad(concatBytes(sha1(clientInner), clientInner), random),
      tmp.key,
      tmp.iv,
    ),
  })

  return {
    authKey: bigIntToBytesBE(modPow(gA, b, dhPrime), 256),
    serverSalt: initialServerSalt(newNonce, serverNonce),
    newNonce,
    serverNonce,
    acknowledgement,
  }
}

/** Unwrap `SHA1(value) ‖ value ‖ padding`, checking the hash. */
function readHashed(plain: Uint8Array, expected: string): TlValue {
  const body = plain.subarray(20)
  const reader = new TlReader(body, HANDSHAKE_SCOPE)
  const value = reader.object()

  expect(value._).toBe(expected)
  expect(hex(plain.subarray(0, 20))).toBe(
    hex(sha1(body.subarray(0, body.length - reader.remaining))),
  )

  return value
}

/** Pad to a whole number of AES blocks. */
function pad(data: Uint8Array, random: (length: number) => Uint8Array): Uint8Array {
  const size = (16 - (data.length % 16)) % 16
  return size === 0 ? data : concatBytes(data, random(size))
}

function bytes(value: TlValue, field: string): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array)) throw new Error(`'${value._}.${field}' is not a byte string`)
  return raw
}

/**
 * The framings a client announces, either as a tag or inside an init packet.
 *
 * Built on demand: framings that carry a sequence number or a padding source
 * hold state, so a case needs its own rather than a shared instance.
 */
const ANNOUNCED_FRAMINGS: ReadonlyArray<[ObfuscatableFraming, () => Framing]> = [
  ['abridged', () => new AbridgedFraming()],
  ['intermediate', () => new IntermediateFraming()],
  ['padded-intermediate', () => new PaddedIntermediateFraming(scripted(7))],
]

/**
 * The key every peer here offers.
 *
 * A server key is long-lived, so one is generated for the whole file rather
 * than per connection. Generating a 2048-bit pair takes long enough that doing
 * it for each of the connections below would dominate the suite's runtime.
 */
const SERVER_KEY = createServerKey()

/** A peer and a client already connected over the given transport. */
function connect(client?: ClientOptions, server?: MockServerOptions) {
  const peer = new MockServer({ key: SERVER_KEY, ...server })
  const near = new Client(peer, client)
  near.open()

  return { peer, client: near }
}

describe('opening a connection', () => {
  it('recognises each framing the client announces in the clear', () => {
    for (const [name, make] of ANNOUNCED_FRAMINGS) {
      const { peer } = connect({ framing: make() })
      expect(peer.transport, name).toEqual({ framing: name, obfuscated: false })
    }
  })

  it('recognises each framing hidden inside an obfuscation init packet', () => {
    for (const [name, make] of ANNOUNCED_FRAMINGS) {
      const { peer } = connect({ framing: make(), obfuscated: true })
      expect(peer.transport, name).toEqual({ framing: name, obfuscated: true })
    }
  })

  it('takes full framing only when told, because it announces nothing', () => {
    // Nothing is sent when the connection opens, so the peer learns how to read
    // the stream from the first message rather than from an announcement.
    const { peer, client } = connect(
      { framing: new FullFraming() },
      { untagged: new FullFraming() },
    )
    expect(peer.transport).toBeUndefined()

    client.send({ _: 'req_pq_multi', nonce: scripted(2)(16) })
    expect(peer.transport).toEqual({ framing: 'full', obfuscated: false })
  })

  it('waits rather than guessing while the opening is incomplete', () => {
    const peer = new MockServer({ key: SERVER_KEY })

    // One byte cannot distinguish an intermediate tag from an init packet.
    expect(peer.receive(Uint8Array.of(0xee))).toHaveLength(0)
    expect(peer.transport).toBeUndefined()
    expect(peer.state).toBe('opening')

    expect(peer.receive(Uint8Array.of(0xee, 0xee, 0xee))).toHaveLength(0)
    expect(peer.transport).toEqual({ framing: 'intermediate', obfuscated: false })
  })

  it('reassembles an init packet delivered one byte at a time', () => {
    const peer = new MockServer({ key: SERVER_KEY })
    const obfuscation = createObfuscation(new IntermediateFraming(), { random: scripted(5) })

    for (const byte of obfuscation.init) peer.receive(Uint8Array.of(byte))

    expect(peer.transport).toEqual({ framing: 'intermediate', obfuscated: true })
  })

  it('refuses an init packet naming no framing it knows', () => {
    // Sixty-four bytes that are not a tag and do not decrypt to one.
    const packet = scripted(6)(64)
    packet[0] = 1

    expect(() => new MockServer({ key: SERVER_KEY }).receive(packet)).toThrow(MockServerError)
    expect(() => new MockServer({ key: SERVER_KEY }).receive(packet)).toThrow(
      /names no known framing/,
    )
  })
})

describe('the key exchange', () => {
  // One case per transport rather than one loop: an exchange is four 2048-bit
  // exponentiations plus an RSA operation, and six of them in a single case
  // both exceeds the default timeout and hides which transport failed.
  for (const [name, make] of ANNOUNCED_FRAMINGS) {
    for (const obfuscated of [false, true]) {
      it(`agrees on the same auth key over ${name}${obfuscated ? ', obfuscated' : ''}`, () => {
        const { peer, client } = connect({ framing: make(), obfuscated })
        const negotiated = negotiate(client, peer.key)

        expect(peer.state).toBe('established')
        expect(hex(negotiated.authKey)).toBe(hex(peer.result?.authKey ?? new Uint8Array(0)))
      })
    }
  }

  it('agrees over full framing, which carries a sequence number and a CRC', () => {
    const { peer, client } = connect(
      { framing: new FullFraming() },
      { untagged: new FullFraming() },
    )
    const negotiated = negotiate(client, peer.key)

    expect(hex(negotiated.authKey)).toBe(hex(peer.result?.authKey ?? new Uint8Array(0)))
  })

  it('produces a 2048-bit key neither end could have produced alone', () => {
    const { peer, client } = connect()
    const negotiated = negotiate(client, peer.key)

    expect(negotiated.authKey).toHaveLength(256)
    // A key of all zeros would mean the exponentiation collapsed.
    expect(hex(negotiated.authKey)).not.toBe('00'.repeat(256))
    expect(negotiated.authKey.some((byte) => byte !== 0)).toBe(true)
  })

  it('acknowledges with a hash the client can only verify with the right key', () => {
    // `dh_gen_ok` proves the peer derived the same key: the hash covers the
    // auth key, so a mismatch anywhere in the exchange fails here.
    const { peer, client } = connect()
    const negotiated = negotiate(client, peer.key)

    expect(negotiated.acknowledgement._).toBe('dh_gen_ok')
    expect(hex(bytes(negotiated.acknowledgement, 'new_nonce_hash1'))).toBe(
      hex(newNonceHash(negotiated.newNonce, 1, negotiated.authKey)),
    )
  })

  it('rejects the acknowledgement when the client checks it against a different key', () => {
    // The negative form of the case above: the hash is not something a client
    // can satisfy without the key the peer actually derived.
    const { peer, client } = connect()
    const negotiated = negotiate(client, peer.key)

    const wrong = Uint8Array.from(negotiated.authKey)
    wrong[0] = (wrong[0] ?? 0) ^ 0x01

    expect(hex(bytes(negotiated.acknowledgement, 'new_nonce_hash1'))).not.toBe(
      hex(newNonceHash(negotiated.newNonce, 1, wrong)),
    )
  })

  it('derives the same first salt at both ends', () => {
    const { peer, client } = connect()
    const negotiated = negotiate(client, peer.key)

    expect(hex(negotiated.serverSalt)).toBe(hex(peer.result?.serverSalt ?? new Uint8Array(0)))
  })

  it('produces an auth key identifier both ends would put on a message', () => {
    const { peer, client } = connect()
    const negotiated = negotiate(client, peer.key)

    expect(hex(authKeyId(negotiated.authKey))).toBe(
      hex(authKeyId(peer.result?.authKey ?? new Uint8Array(256))),
    )
  })

  it('accepts the legacy RSA padding', () => {
    // Which scheme applies is decided by the key fingerprint the client
    // matched, so a client that can only build one cannot reach every server.
    const { peer, client } = connect()
    const negotiated = negotiate(client, peer.key, { legacy: true })

    expect(hex(negotiated.authKey)).toBe(hex(peer.result?.authKey ?? new Uint8Array(0)))
  })

  it('carries the lifetime of a temporary key through to the peer', () => {
    const { peer, client } = connect()
    negotiate(client, peer.key, { expiresIn: 86_400 })

    expect(peer.result?.expiresIn).toBe(86_400)
  })

  it('leaves the lifetime unset for a permanent key', () => {
    const { peer, client } = connect()
    negotiate(client, peer.key)

    expect(peer.result?.expiresIn).toBeUndefined()
  })

  it('offers parameters a client validates in full', { timeout: 60_000 }, () => {
    // The slow path a real client takes on its first connection: the modulus is
    // checked for being a 2048-bit safe prime and the generator for its
    // congruence. A peer offering parameters that failed this would be useless
    // for testing the client that has to run it.
    const { peer, client } = connect()
    const negotiated = negotiate(client, peer.key, { validate: true })

    expect(hex(negotiated.authKey)).toBe(hex(peer.result?.authKey ?? new Uint8Array(0)))
  })

  it('survives a stream delivered one byte at a time', () => {
    // Every layer between the socket and the exchange has to reassemble: the
    // opening, the obfuscation counter, the framing, and the envelope.
    const { peer, client } = connect({ obfuscated: true, chunk: 1 })
    const negotiated = negotiate(client, peer.key)

    expect(hex(negotiated.authKey)).toBe(hex(peer.result?.authKey ?? new Uint8Array(0)))
  })

  it('reports its progress through the exchange', () => {
    const peer = new MockServer({ key: SERVER_KEY })
    const client = new Client(peer)

    expect(peer.state).toBe('opening')
    client.open()
    expect(peer.state).toBe('exchanging')

    negotiate(client, peer.key)
    expect(peer.state).toBe('established')
  })
})

describe('an obfuscated stream', () => {
  it('puts nothing recognisable on the wire', () => {
    // The peer is the only reader here; what matters is that a passive observer
    // sees neither the framing tag nor the length prefix in the clear.
    const framing = new IntermediateFraming()
    const obfuscation = createObfuscation(framing, { random: scripted(8) })
    const message = encodePlaintextMessage(
      0n,
      writeObject({ _: 'ping', ping_id: 1n }, HANDSHAKE_SCOPE),
    )

    const framed = framing.encode(message)
    const wire = obfuscation.encrypt(framed)

    expect(hex(wire)).not.toBe(hex(framed))
    // The envelope's eight zero bytes are the most recognisable thing in the
    // plaintext and must not survive into the ciphertext.
    expect(hex(wire)).not.toContain('0000000000000000')
  })

  it('fails at the opening when the two ends hold different proxy secrets', () => {
    // The secret is mixed into the keys that protect the init packet itself, so
    // a mismatch is caught by the first thing the peer reads: the framing tag
    // decrypts to noise and names nothing. The connection never reaches a
    // message, which is the failure a misconfigured proxy should produce.
    const configured = new MockServer({ key: SERVER_KEY, secret: new Uint8Array(16).fill(0xa8) })
    const mismatched = new Client(configured, {
      obfuscated: true,
      secret: new Uint8Array(16).fill(0xa7),
    })
    expect(() => mismatched.open()).toThrow(MockServerError)

    // A client offering no secret at all fails the same way, against a peer
    // that has not already been left in a partial state by the case above.
    const fresh = new MockServer({ key: SERVER_KEY, secret: new Uint8Array(16).fill(0xa8) })
    expect(() => new Client(fresh, { obfuscated: true }).open()).toThrow(/names no known framing/)
    expect(fresh.transport).toBeUndefined()
  })

  it('exchanges normally when both ends hold the same proxy secret', () => {
    const secret = new Uint8Array(16).fill(0xa7)
    const { peer, client } = connect({ obfuscated: true, secret }, { secret })

    expect(hex(negotiate(client, peer.key).authKey)).toBe(
      hex(peer.result?.authKey ?? new Uint8Array(0)),
    )
  })
})

describe('transport errors', () => {
  // The report is recognised by its length, so each envelope has to deliver
  // exactly four bytes. Padded intermediate is the case that can get this
  // wrong: padding the frame would turn the report into a short payload.
  for (const [name, make] of ANNOUNCED_FRAMINGS) {
    for (const obfuscated of [false, true]) {
      it(`reaches the client over ${name}${obfuscated ? ', obfuscated' : ''}`, () => {
        const { peer, client } = connect({ framing: make(), obfuscated })

        expect(client.frames(peer.transportError(404))).toEqual([{ kind: 'error', code: 404 }])
      })
    }
  }

  it('reaches the client over full framing', () => {
    const { peer, client } = connect(
      { framing: new FullFraming() },
      { untagged: new FullFraming() },
    )
    client.send({ _: 'req_pq_multi', nonce: scripted(13)(16) })

    expect(client.frames(peer.transportError(429))).toEqual([{ kind: 'error', code: 429 }])
  })

  it('reports each documented code', () => {
    for (const code of [404, 429, 444]) {
      const { peer, client } = connect()
      expect(client.frames(peer.transportError(code))).toEqual([{ kind: 'error', code }])
    }
  })

  it('is refused when the client sends one', () => {
    // The code is a server-to-client report. A client sending one is either
    // confused or hostile, and either way the peer must not read it as a body.
    const { peer, client } = connect()

    const body = new Uint8Array(4)
    new DataView(body.buffer).setInt32(0, -404, true)

    expect(() => client.sendFramed(new IntermediateFraming().encode(body))).toThrow(
      /transport error frame/,
    )
    expect(peer.state).toBe('exchanging')
  })
})

describe('messages the peer must refuse', () => {
  /** A connected peer that has already answered `req_pq_multi`. */
  function opened() {
    const { peer, client } = connect()
    const nonce = scripted(21)(16)
    const resPq = client.send({ _: 'req_pq_multi', nonce })

    return { peer, client, nonce, serverNonce: bytes(resPq, 'server_nonce'), resPq }
  }

  it('a step arriving out of order', () => {
    const { client } = connect()

    expect(() =>
      client.send({
        _: 'set_client_DH_params',
        nonce: new Uint8Array(16),
        server_nonce: new Uint8Array(16),
        encrypted_data: new Uint8Array(16),
      }),
    ).toThrow(/while awaiting-req-pq/)
  })

  it('a repeated first step', () => {
    const { client, nonce } = opened()

    expect(() => client.send({ _: 'req_pq_multi', nonce })).toThrow(/while awaiting-req-dh-params/)
  })

  it('a method that is not part of the exchange', () => {
    const { client } = connect()

    expect(() => client.send({ _: 'ping', ping_id: 7n })).toThrow(HandshakeViolation)
    expect(() => connect().client.send({ _: 'ping', ping_id: 7n })).toThrow(
      /is not part of the key exchange/,
    )
  })

  it('a nonce that does not match the one the exchange opened with', () => {
    const { client, serverNonce } = opened()

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce: new Uint8Array(16).fill(0xff),
        server_nonce: serverNonce,
        p: bigIntToBytesBE(2_147_483_629n),
        q: bigIntToBytesBE(2_147_483_647n),
        public_key_fingerprint: 0n,
        encrypted_data: new Uint8Array(256),
      }),
    ).toThrow(/carries a different nonce/)
  })

  it('a server nonce the client invented', () => {
    const { client, nonce } = opened()

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce,
        server_nonce: new Uint8Array(16).fill(0x11),
        p: bigIntToBytesBE(2_147_483_629n),
        q: bigIntToBytesBE(2_147_483_647n),
        public_key_fingerprint: 0n,
        encrypted_data: new Uint8Array(256),
      }),
    ).toThrow(/carries a different server_nonce/)
  })

  it('factors that do not multiply to the published semiprime', () => {
    const { client, nonce, serverNonce } = opened()

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce,
        server_nonce: serverNonce,
        p: bigIntToBytesBE(3n),
        q: bigIntToBytesBE(5n),
        public_key_fingerprint: 0n,
        encrypted_data: new Uint8Array(256),
      }),
    ).toThrow(/are not the ones that were published/)
  })

  it('the correct factors submitted in the wrong order', () => {
    // The protocol fixes the order, and a peer that accepted either would let
    // a client that gets it wrong pass here and fail against Telegram.
    const { client, nonce, serverNonce } = opened()

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce,
        server_nonce: serverNonce,
        p: bigIntToBytesBE(2_147_483_647n),
        q: bigIntToBytesBE(2_147_483_629n),
        public_key_fingerprint: 0n,
        encrypted_data: new Uint8Array(256),
      }),
    ).toThrow(/smaller first/)
  })

  it('a fingerprint naming a key the peer does not hold', () => {
    const { client, nonce, serverNonce } = opened()

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce,
        server_nonce: serverNonce,
        p: bigIntToBytesBE(2_147_483_629n),
        q: bigIntToBytesBE(2_147_483_647n),
        public_key_fingerprint: 0x0123_4567_89ab_cdefn,
        encrypted_data: new Uint8Array(256),
      }),
    ).toThrow(/a key this peer does not hold/)
  })

  it('an RSA block built under neither padding scheme', () => {
    const { peer, client, nonce, serverNonce } = opened()

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce,
        server_nonce: serverNonce,
        p: bigIntToBytesBE(2_147_483_629n),
        q: bigIntToBytesBE(2_147_483_647n),
        public_key_fingerprint: peer.key.fingerprint,
        encrypted_data: scripted(22)(256),
      }),
    ).toThrow()
  })

  it('an RSA block whose integrity check has been broken', () => {
    // One flipped bit in the ciphertext changes the whole decryption, which is
    // what the trailing hash exists to detect.
    const { peer, client, nonce, serverNonce, resPq } = opened()
    const random = scripted(23)

    const encrypted = rsaEncryptPadded(
      writeObject(
        {
          _: 'p_q_inner_data_dc',
          pq: bytes(resPq, 'pq'),
          p: bigIntToBytesBE(2_147_483_629n),
          q: bigIntToBytesBE(2_147_483_647n),
          nonce,
          server_nonce: serverNonce,
          new_nonce: random(32),
          dc: 2,
        },
        HANDSHAKE_SCOPE,
      ),
      peer.key,
      random,
    )
    encrypted[100] = (encrypted[100] ?? 0) ^ 0x80

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce,
        server_nonce: serverNonce,
        p: bigIntToBytesBE(2_147_483_629n),
        q: bigIntToBytesBE(2_147_483_647n),
        public_key_fingerprint: peer.key.fingerprint,
        encrypted_data: encrypted,
      }),
    ).toThrow()
  })

  it('an encrypted block holding something other than the inner data', () => {
    const { peer, client, nonce, serverNonce } = opened()
    const random = scripted(24)

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce,
        server_nonce: serverNonce,
        p: bigIntToBytesBE(2_147_483_629n),
        q: bigIntToBytesBE(2_147_483_647n),
        public_key_fingerprint: peer.key.fingerprint,
        encrypted_data: rsaEncryptPadded(
          writeObject({ _: 'ping', ping_id: 3n }, HANDSHAKE_SCOPE),
          peer.key,
          random,
        ),
      }),
    ).toThrow(/the encrypted block holds 'ping'/)
  })

  it('a Diffie-Hellman answer decrypted under the wrong key', () => {
    const { peer, client } = connect()

    expect(() => tamperClientDh(peer, client, { corrupt: true })).toThrow(
      /failed its integrity check/,
    )
  })

  it('a public value at the edge of the permitted range', () => {
    // g_b of 1 or p-1 puts the shared secret in a tiny subgroup, which is the
    // classic small-subgroup attack rather than a hypothetical one.
    for (const gB of [0n, 1n, DH_PRIME - 1n, DH_PRIME]) {
      const { peer, client } = connect()

      expect(() => tamperClientDh(peer, client, { gB })).toThrow(/outside the permitted range/)
    }
  })

  it('a public value inside the range but too close to an endpoint', () => {
    // `1 < g_b < p - 1` is not the whole rule. A value within 2^1984 of either
    // end leaves the shared secret searchable, and Telegram's servers reject it,
    // so a peer that accepted one would pass a client that cannot connect.
    const margin = 2n ** 1984n

    for (const gB of [margin, margin - 1n, DH_PRIME - margin, DH_PRIME - margin + 1n]) {
      const { peer, client } = connect()

      expect(() => tamperClientDh(peer, client, { gB })).toThrow(/within 2\^1984 of an endpoint/)
    }
  })

  it('a public value just inside the margin, which must be accepted', () => {
    // The positive half of the case above: the bound has to reject values past
    // it without rejecting the ones immediately inside it.
    const { peer, client } = connect()

    expect(tamperClientDh(peer, client, { gB: 2n ** 1984n + 1n })._).toBe('dh_gen_ok')
  })

  it('factors inside the encrypted block that differ from the visible ones', () => {
    // The pair appears twice: in the clear, where anyone can rewrite it, and
    // inside the block only the key holder can produce. A peer that checked
    // only the visible copy would be checking something an attacker controls.
    const { peer, client, nonce, serverNonce, resPq } = opened()
    const random = scripted(25)
    const { p, q } = factorizePq(bytesToBigIntBE(bytes(resPq, 'pq')))

    expect(() =>
      client.send({
        _: 'req_DH_params',
        nonce,
        server_nonce: serverNonce,
        p: bigIntToBytesBE(p),
        q: bigIntToBytesBE(q),
        public_key_fingerprint: peer.key.fingerprint,
        encrypted_data: rsaEncryptPadded(
          writeObject(
            {
              _: 'p_q_inner_data_dc',
              pq: bytes(resPq, 'pq'),
              // Swapped: each is a real factor, neither is in its own place.
              p: bigIntToBytesBE(q),
              q: bigIntToBytesBE(p),
              nonce,
              server_nonce: serverNonce,
              new_nonce: random(32),
              dc: 2,
            },
            HANDSHAKE_SCOPE,
          ),
          peer.key,
          random,
        ),
      }),
    ).toThrow(/names different factors/)
  })

  it('a retry identifier on an exchange that was never retried', () => {
    const { peer, client } = connect()

    expect(() => tamperClientDh(peer, client, { retryId: 99n })).toThrow(
      /does not name the attempt that failed/,
    )
  })
})

describe('the boundary between the handshake and the API', () => {
  it('refuses an API constructor sent before an auth key exists', () => {
    // The peer decodes with the core and service tables only. An API identifier
    // is genuinely absent from them, so it cannot resolve — which is the
    // property that keeps the unencrypted channel from carrying API traffic.
    const { client } = connect()

    const first = [...API.byId.keys()][0] ?? 0
    const body = new Uint8Array(4)
    new DataView(body.buffer).setUint32(0, first, true)

    expect(() => client.sendRaw(body)).toThrow(/handshake/)
  })

  it('refuses a body that is not a known constructor at all', () => {
    const { client } = connect()

    const body = new Uint8Array(4)
    new DataView(body.buffer).setUint32(0, 0xdead_beef, true)

    expect(() => client.sendRaw(body)).toThrow()
  })

  it('refuses a message with bytes left over after the value', () => {
    const { client } = connect()
    const body = concatBytes(
      writeObject({ _: 'req_pq_multi', nonce: new Uint8Array(16) }, HANDSHAKE_SCOPE),
      new Uint8Array(4),
    )

    expect(() => client.sendRaw(body)).toThrow(/bytes remain/)
  })
})

/**
 * Walk the exchange to its last step and send a corrupted final message.
 *
 * The first two steps have to be genuine for the third to be reached at all,
 * so each case here differs from a working handshake by exactly one value.
 */
function tamperClientDh(peer: MockServer, client: Client, change: Tampering = {}): TlValue {
  const random = scripted(41)
  const nonce = random(16)

  const resPq = client.send({ _: 'req_pq_multi', nonce })
  const serverNonce = bytes(resPq, 'server_nonce')
  const { p, q } = factorizePq(bytesToBigIntBE(bytes(resPq, 'pq')))
  const newNonce = random(32)

  const params = client.send({
    _: 'req_DH_params',
    nonce,
    server_nonce: serverNonce,
    p: bigIntToBytesBE(p),
    q: bigIntToBytesBE(q),
    public_key_fingerprint: peer.key.fingerprint,
    encrypted_data: rsaEncryptPadded(
      writeObject(
        {
          _: 'p_q_inner_data_dc',
          pq: bytes(resPq, 'pq'),
          p: bigIntToBytesBE(p),
          q: bigIntToBytesBE(q),
          nonce,
          server_nonce: serverNonce,
          new_nonce: newNonce,
          dc: 2,
        },
        HANDSHAKE_SCOPE,
      ),
      peer.key,
      random,
    ),
  })

  const tmp = deriveHandshakeKeys(newNonce, serverNonce)
  const inner = readHashed(
    igeDecrypt(bytes(params, 'encrypted_answer'), tmp.key, tmp.iv),
    'server_DH_inner_data',
  )
  const dhPrime = bytesToBigIntBE(bytes(inner, 'dh_prime'))
  const g = BigInt(inner['g'] as number)
  const b = bytesToBigIntBE(random(256)) % dhPrime

  const clientInner = writeObject(
    {
      _: 'client_DH_inner_data',
      nonce,
      server_nonce: serverNonce,
      retry_id: change.retryId ?? 0n,
      g_b: bigIntToBytesBE(change.gB ?? modPow(g, b, dhPrime), 256),
    },
    HANDSHAKE_SCOPE,
  )

  // Corrupting the ciphertext rather than the plaintext is what a wrong key
  // looks like from the peer's side.
  const encrypted = igeEncrypt(
    pad(concatBytes(sha1(clientInner), clientInner), random),
    tmp.key,
    tmp.iv,
  )

  return client.send({
    _: 'set_client_DH_params',
    nonce,
    server_nonce: serverNonce,
    encrypted_data: change.corrupt === true ? flip(encrypted) : encrypted,
  })
}

/** The single value a case changes about an otherwise correct final step. */
interface Tampering {
  /** Flip a bit in the ciphertext, which is what a wrong key looks like. */
  readonly corrupt?: boolean
  /** Send this public value instead of a real one. */
  readonly gB?: bigint
  /** Claim the exchange is a retry of an earlier one. */
  readonly retryId?: bigint
}

/** Flip a bit in the middle of a block, which changes everything after it. */
function flip(data: Uint8Array): Uint8Array {
  const out = Uint8Array.from(data)
  const index = Math.floor(out.length / 2)
  out[index] = (out[index] ?? 0) ^ 0x40
  return out
}
