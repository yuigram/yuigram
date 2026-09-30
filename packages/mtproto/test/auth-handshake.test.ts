/**
 * The client handshake, against a peer that performs the server half.
 *
 * The exchange runs through the real transport — framing, obfuscation, the
 * unencrypted envelope, the TL codec, RSA, IGE and the key schedules — and ends
 * with both ends holding a key neither chose alone. The peer derives its key
 * from its own secret exponent and rebuilds the schedules from the
 * specification, so agreement is evidence rather than coincidence.
 *
 * The rejection cases matter more than the agreement. Each one changes a single
 * value a hostile server controls and asserts the specific error, because a
 * check that is present but unreachable behind an earlier branch protects
 * nothing.
 */

import { createHash } from 'node:crypto'
import { ConfigError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { Handshake, HandshakeError } from '../src/auth/handshake.js'
import { rsaKeyFingerprint, serverRsaKey } from '../src/auth/keys.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import {
  AbridgedFraming,
  FrameBuffer,
  type Framing,
  IntermediateFraming,
  PaddedIntermediateFraming,
} from '../src/transport/framing.js'
import { createObfuscation, type Obfuscation } from '../src/transport/obfuscation.js'
import { createServerKey } from './server/keys.js'
import type { Fault } from './server/server.js'
import { DH_PRIME, MockServer } from './server/server.js'

/**
 * The key every peer here offers.
 *
 * A server key is long-lived, so one is generated for the whole file. Drawing a
 * 2048-bit pair per connection would dominate the runtime of every case below.
 */
const SERVER_KEY = createServerKey()

beforeAll(() => {
  // A client checks the modulus in full the first time it meets one, and a
  // 2048-bit safe-prime test costs seconds. The outcome is cached by digest, so
  // the cost is paid here rather than landing on whichever case runs first.
  validateDhParameters({ p: DH_PRIME, g: 3n })
}, 60_000)

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

interface ConnectionOptions {
  readonly framing?: Framing
  readonly obfuscated?: boolean
  readonly faults?: readonly Fault[]
  /** Deliver the peer's bytes in slices of this size, rather than whole. */
  readonly chunk?: number
}

/**
 * A client and a peer joined by a byte stream.
 *
 * The transport is real on both sides; only the socket is missing, and a socket
 * would add nothing this exercises.
 */
function connect(options: ConnectionOptions = {}) {
  const framing = options.framing ?? new IntermediateFraming()
  const peer = new MockServer({
    key: SERVER_KEY,
    ...(options.faults === undefined ? {} : { faults: new Set(options.faults) }),
  })

  const obfuscation: Obfuscation | undefined =
    options.obfuscated === true ? createObfuscation(framing, { random: scripted(1) }) : undefined

  const buffer = new FrameBuffer()
  const encrypt = (data: Uint8Array) => obfuscation?.encrypt(data) ?? data
  const decrypt = (data: Uint8Array) => obfuscation?.decrypt(data) ?? data

  /** Send one message and collect whatever whole messages come back. */
  const exchange = (message: Uint8Array): Uint8Array[] => {
    const wire = encrypt(framing.encode(message))

    const replies: Uint8Array[] = []
    const feed = (bytes: Uint8Array) => {
      if (bytes.length === 0) return
      buffer.push(decrypt(bytes))

      for (;;) {
        const frame = framing.decode(buffer)
        if (frame === undefined) return
        if (frame.kind === 'error') throw new Error(`transport error ${frame.code}`)
        replies.push(frame.bytes)
      }
    }

    if (options.chunk === undefined) feed(peer.receive(wire))
    else {
      for (let at = 0; at < wire.length; at += options.chunk) {
        feed(peer.receive(wire.subarray(at, at + options.chunk)))
      }
    }

    return replies
  }

  const opening = obfuscation?.init ?? framing.tag()
  if (opening.length > 0) peer.receive(opening)

  return { peer, framing, exchange }
}

/** Run the exchange to completion, or to the error that ends it. */
function negotiate(
  connection: ReturnType<typeof connect>,
  overrides: Partial<Parameters<typeof buildHandshake>[1]> = {},
): Handshake {
  const handshake = buildHandshake(connection, overrides)

  let outgoing: Uint8Array | undefined = handshake.start()
  let rounds = 0

  while (outgoing !== undefined) {
    if (++rounds > 24) throw new Error('the exchange did not terminate')

    const replies = connection.exchange(outgoing)
    if (replies.length !== 1) throw new Error(`expected one reply, received ${replies.length}`)

    outgoing = handshake.receive(replies[0] ?? new Uint8Array(0))
  }

  return handshake
}

function buildHandshake(
  connection: ReturnType<typeof connect>,
  overrides: {
    readonly keys?: ReturnType<typeof serverRsaKey>[]
    readonly dcId?: number
    readonly expiresIn?: number
    readonly seed?: number
  } = {},
): Handshake {
  return new Handshake({
    keys: overrides.keys ?? [serverRsaKey(connection.peer.key)],
    dcId: overrides.dcId ?? 2,
    ...(overrides.expiresIn === undefined ? {} : { expiresIn: overrides.expiresIn }),
    random: scripted(overrides.seed ?? 5),
    now: () => 1_700_000_000_500,
  })
}

describe('a completed exchange', () => {
  const transports: ReadonlyArray<[string, () => Framing]> = [
    ['abridged', () => new AbridgedFraming()],
    ['intermediate', () => new IntermediateFraming()],
    ['padded-intermediate', () => new PaddedIntermediateFraming(scripted(7))],
  ]

  for (const [name, make] of transports) {
    for (const obfuscated of [false, true]) {
      it(`agrees on a key over ${name}${obfuscated ? ', obfuscated' : ''}`, () => {
        const connection = connect({ framing: make(), obfuscated })
        const handshake = negotiate(connection)

        expect(handshake.state).toBe('established')
        expect(hex(handshake.result?.authKey.id ?? new Uint8Array(0))).toBe(
          hex(keyIdOf(connection.peer)),
        )
      })
    }
  }

  it('survives a stream delivered one byte at a time', () => {
    const connection = connect({ obfuscated: true, chunk: 1 })
    const handshake = negotiate(connection)

    expect(handshake.state).toBe('established')
  })

  it('derives the same salt the peer did', () => {
    const connection = connect()
    const handshake = negotiate(connection)

    const peerSalt = connection.peer.result?.serverSalt ?? new Uint8Array(8)
    const asLong = new DataView(peerSalt.buffer, peerSalt.byteOffset, 8).getBigInt64(0, true)

    expect(handshake.result?.serverSalt).toBe(asLong)
  })

  it('learns how far the local clock is from the server', () => {
    const connection = connect()
    const handshake = negotiate(connection)

    // The peer reports a fixed time and the client's clock is fixed, so the
    // offset is exactly their difference rather than approximately.
    expect(handshake.result?.timeOffset).toBe(1_700_000_000 - 1_700_000_000)
  })

  it('carries the lifetime of a temporary key', () => {
    const connection = connect()
    const handshake = negotiate(connection, { expiresIn: 86_400 })

    expect(handshake.result?.expiresIn).toBe(86_400)
    expect(connection.peer.result?.expiresIn).toBe(86_400)
  })

  it('forgets the exchange once the key exists', () => {
    // `new_nonce` is what an attacker holding a transcript would need. It has
    // no use after the key, so it must not outlive it.
    const connection = connect()
    const handshake = negotiate(connection)

    expect(JSON.stringify(handshake)).not.toContain('newNonce')
    expect(handshake.result?.authKey.toString()).toMatch(/^AuthKey\([0-9a-f]{16}\)$/)
  })

  it('redraws an exponent that would produce a degenerate public value', () => {
    // An exponent of zero makes g_b one, which the protocol forbids and a
    // server refuses. The client checks its own public value before sending it,
    // so the draw is repeated rather than the exchange lost.
    let exhausted = false
    const source = scripted(9)
    const random = (length: number) => {
      if (length === 256 && !exhausted) {
        exhausted = true
        return new Uint8Array(256)
      }
      return source(length)
    }

    const connection = connect()
    const handshake = new Handshake({
      keys: [serverRsaKey(connection.peer.key)],
      dcId: 2,
      random,
      now: () => 1_700_000_000_500,
    })

    let outgoing: Uint8Array | undefined = handshake.start()
    while (outgoing !== undefined) {
      const replies = connection.exchange(outgoing)
      outgoing = handshake.receive(replies[0] ?? new Uint8Array(0))
    }

    expect(exhausted).toBe(true)
    expect(handshake.state).toBe('established')
  })

  it('refuses to continue once it has finished', () => {
    const connection = connect()
    const handshake = negotiate(connection)

    expect(() => handshake.receive(new Uint8Array(64))).toThrow(/while established/)
  })
})

describe('the exchange refuses', () => {
  /** Run an exchange expected to fail, and hand back the error. */
  function reject(faults: readonly Fault[], overrides = {}): Error {
    const connection = connect({ faults })

    try {
      negotiate(connection, overrides)
    } catch (error) {
      return error as Error
    }

    throw new Error('the exchange completed when it should not have')
  }

  it('an answer echoing a different nonce', () => {
    expect(reject(['wrong-nonce']).message).toMatch(/different nonce/)
  })

  it('a server nonce that changes partway through', () => {
    expect(reject(['wrong-server-nonce']).message).toMatch(/different server_nonce/)
  })

  it('a first answer that is not resPQ', () => {
    expect(reject(['malformed-res-pq']).message).toMatch(/expected 'resPQ', received 'pong'/)
  })

  it('a key fingerprint this client does not hold, as a matter of how it was built', () => {
    // Configuration rather than circumstance: no later attempt holds other keys.
    const refused = reject(['unknown-fingerprint'])
    expect(refused).toBeInstanceOf(ConfigError)
    expect(refused.message).toMatch(/holds none of them/)
    expect(refused.message).toMatch(/serverKeysFromPem/)
  })

  it('an encrypted answer whose hash does not cover it', () => {
    expect(reject(['bad-answer-hash']).message).toMatch(/failed its integrity check/)
  })

  it('a modulus that is not a safe prime', () => {
    expect(reject(['unsafe-dh-prime']).message).toMatch(/not a safe prime/)
  })

  it('a public value at the bottom of the range', () => {
    expect(reject(['invalid-g-a']).message).toMatch(/outside \(1, p - 1\)/)
  })

  it('an acknowledgement not derived from the key this client computed', () => {
    expect(reject(['wrong-nonce-hash']).message).toMatch(/does not match the key/)
  })

  it('a semiprime wider than the field can carry', () => {
    // Converting a byte string to an integer costs time quadratic in its
    // length, so this is refused on the encoded width before the conversion.
    // A megabyte here would occupy the client for minutes; the transport would
    // carry sixteen times that.
    const started = Date.now()
    expect(reject(['oversized-pq']).message).toMatch(/must be at most 8 bytes/)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('a modulus wider than the field can carry', () => {
    const started = Date.now()
    expect(reject(['oversized-dh-prime']).message).toMatch(/must be at most 256 bytes/)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('an answer that is not one of the three verdicts', () => {
    // Refused for being the wrong kind of message, not for lacking a field it
    // was never going to carry.
    expect(reject(['not-a-verdict']).message).toMatch(/is not an answer to set_client_DH_params/)
  })

  it('an outright refusal', () => {
    expect(reject(['dh-gen-fail']).message).toMatch(/rejected the exchange/)
  })

  it('a server that asks for a retry forever', () => {
    // The bound is the only thing that ends this, and without one the exchange
    // never reports the failure it is in.
    expect(reject(['dh-gen-retry-always']).message).toMatch(/did not complete in 5 attempts/)
  })

  it('a handshake configured with no keys at all', () => {
    expect(() => new Handshake({ keys: [], dcId: 2 })).toThrow(/at least one server key/)
  })

  it('a message truncated below its own header', () => {
    const connection = connect()
    const handshake = buildHandshake(connection)
    handshake.start()

    expect(() => handshake.receive(new Uint8Array(12))).toThrow(/needs 20 bytes/)
    expect(handshake.state).toBe('failed')
  })

  it('a message whose body is shorter than it declares', () => {
    // The envelope's length field is the only thing that says where the body
    // ends, so a body that does not arrive must not be decoded as a short one.
    const connection = connect()
    const handshake = buildHandshake(connection)
    handshake.start()

    const truncated = new Uint8Array(24)
    new DataView(truncated.buffer).setInt32(16, 64, true)

    expect(() => handshake.receive(truncated)).toThrow(/declares 64 bytes/)
    expect(handshake.state).toBe('failed')
  })

  it('a body that is not a constructor this channel carries', () => {
    const connection = connect()
    const handshake = buildHandshake(connection)
    handshake.start()

    const message = new Uint8Array(24)
    new DataView(message.buffer).setInt32(16, 4, true)
    new DataView(message.buffer).setUint32(20, 0xdead_beef, true)

    expect(() => handshake.receive(message)).toThrow(/is not in the handshake table/)
    expect(handshake.state).toBe('failed')
    expect(handshake.result).toBeUndefined()
  })

  it('a message arriving before the exchange was started', () => {
    const connection = connect()
    const handshake = buildHandshake(connection)

    expect(() => handshake.receive(new Uint8Array(64))).toThrow(/has not been started/)
  })

  it('a second start', () => {
    const connection = connect()
    const handshake = buildHandshake(connection)
    handshake.start()

    expect(() => handshake.start()).toThrow(/cannot start while awaiting-res-pq/)
  })
})

describe('a failed exchange', () => {
  it('is over, and cannot be resumed', () => {
    // Leaving it resumable would let a second message act on state that the
    // first had already invalidated.
    const connection = connect({ faults: ['wrong-nonce'] })
    const handshake = buildHandshake(connection)

    const replies = connection.exchange(handshake.start())
    expect(() => handshake.receive(replies[0] ?? new Uint8Array(0))).toThrow(HandshakeError)

    expect(handshake.state).toBe('failed')
    expect(handshake.result).toBeUndefined()
    expect(() => handshake.receive(replies[0] ?? new Uint8Array(0))).toThrow(/while failed/)
  })

  it('establishes no key when the acknowledgement does not verify', () => {
    const connection = connect({ faults: ['wrong-nonce-hash'] })
    const handshake = buildHandshake(connection)

    expect(() => negotiate(connection, {})).toThrow()
    expect(handshake.result).toBeUndefined()
  })
})

describe('a retried exchange', () => {
  it('completes after the server asks for a new exponent', () => {
    // A retry asks for another exponent under the same exchange, so the nonces
    // stay and only the public value changes. The peer checks that the retry
    // names the attempt it refused.
    const connection = connect({ faults: ['dh-gen-retry'] })
    const handshake = negotiate(connection)

    expect(handshake.state).toBe('established')
    expect(hex(handshake.result?.authKey.id ?? new Uint8Array(0))).toBe(
      hex(keyIdOf(connection.peer)),
    )
  })
})

describe('server key fingerprints', () => {
  it('names a key the way a server does', () => {
    // The peer computes the fingerprint by its own implementation, and the
    // exchange only completes if the two agree on which key was meant.
    const connection = connect()
    const key = connection.peer.key

    expect(rsaKeyFingerprint(key)).toBe(key.fingerprint)
  })

  it('picks the held key out of several the server offers', () => {
    const connection = connect()
    const held = serverRsaKey(connection.peer.key)

    const handshake = negotiate(connection, {
      keys: [{ n: 3n, e: 5n, fingerprint: 1n }, held, { n: 7n, e: 11n, fingerprint: 2n }],
    })

    expect(handshake.state).toBe('established')
  })

  it('refuses a key whose modulus or exponent is not positive', () => {
    expect(() => rsaKeyFingerprint({ n: 0n, e: 65_537n })).toThrow(/positive/)
    expect(() => rsaKeyFingerprint({ n: 17n, e: 0n })).toThrow(/positive/)
  })
})

/**
 * The identifier the peer's own key material produces.
 *
 * Derived here rather than taken from the client's key object, so the two ends
 * are compared through their key material rather than through one end's view
 * of it.
 */
function keyIdOf(peer: MockServer): Uint8Array {
  const key = peer.result?.authKey ?? new Uint8Array(256)
  return new Uint8Array(createHash('sha1').update(key).digest()).subarray(12, 20)
}
