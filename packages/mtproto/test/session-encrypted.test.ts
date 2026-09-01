/**
 * The authenticated message layer.
 *
 * Two kinds of check. The envelope's own rules are exercised directly, each
 * rejection driven by a message that differs from a valid one in exactly one
 * field. The key schedule is exercised against the peer, which derives it from
 * the specification by its own code — a round trip through one implementation
 * would agree with itself no matter which bytes of the auth key it read.
 *
 * The direction cases carry the most weight. Both ends derive from the same
 * auth key and differ only by an offset into it, so a client that reads the
 * server's half talks fluently to itself and to nothing else.
 */

import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { Handshake } from '../src/auth/handshake.js'
import { serverRsaKey } from '../src/auth/keys.js'
import { igeEncrypt } from '../src/crypto/ige.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { AuthKey } from '../src/message/auth-key.js'
import { decodeEncryptedMessage, encodeEncryptedMessage } from '../src/message/encrypted.js'
import { MessageError } from '../src/message/plaintext.js'
import { isContentRelated, Session } from '../src/session/session.js'
import { readObject, TlScope, writeObject } from '../src/tl/index.js'
import { FrameBuffer, IntermediateFraming } from '../src/transport/framing.js'
import { open as peerOpen } from './server/encrypted.js'
import { createServerKey } from './server/keys.js'
import { DH_PRIME, type Fault, MockServer } from './server/server.js'

const SCOPE = new TlScope('handshake', [CORE, MTPROTO])
const SERVER_KEY = createServerKey()

beforeAll(() => {
  validateDhParameters({ p: DH_PRIME, g: 3n })
}, 60_000)

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

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

/** A fixed key, so a case is reproducible without running an exchange. */
const KEY_BYTES = Uint8Array.from({ length: 256 }, (_, index) => (index * 11 + 5) & 0xff)
const KEY = AuthKey.from(KEY_BYTES)

/** Padding of a fixed size, so an encoded message is byte-reproducible. */
const fixedPadding = (fill: number) => (length: number) =>
  new Uint8Array(12 + ((16 - ((length + 12) % 16)) % 16)).fill(fill)

/** A valid message, as a starting point for the cases that break one. */
function sealed(overrides: Partial<Parameters<typeof encodeEncryptedMessage>[0]> = {}) {
  return encodeEncryptedMessage({
    key: KEY,
    from: 'client',
    salt: 0x0102_0304_0506_0708n,
    sessionId: 0x1122_3344_5566_7788n,
    msgId: 7_301_444_403_200_000_004n,
    seqNo: 1,
    body: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
    padding: fixedPadding(0xab),
    ...overrides,
  })
}

describe('the encrypted envelope', () => {
  it('recovers every field it carried', () => {
    const decoded = decodeEncryptedMessage({ key: KEY, bytes: sealed(), from: 'client' })

    expect(decoded.salt).toBe(0x0102_0304_0506_0708n)
    expect(decoded.sessionId).toBe(0x1122_3344_5566_7788n)
    expect(decoded.msgId).toBe(7_301_444_403_200_000_004n)
    expect(decoded.seqNo).toBe(1)
    expect(hex(decoded.body)).toBe('0102030405060708')
  })

  it('puts the key identifier and the message key in the clear', () => {
    // The only two fields a passive observer can read, and the ones a receiver
    // needs before it can decrypt anything.
    const bytes = sealed()

    expect(hex(bytes.subarray(0, 8))).toBe(hex(KEY.id))
    expect(bytes.subarray(8, 24)).toHaveLength(16)
    expect(hex(bytes.subarray(8, 24))).not.toBe('0'.repeat(32))
  })

  it('aligns the ciphertext to whole blocks', () => {
    for (const size of [0, 4, 8, 16, 20, 100, 1000]) {
      const bytes = sealed({ body: new Uint8Array(size) })
      expect((bytes.length - 24) % 16, `body of ${size}`).toBe(0)
    }
  })

  it('produces a different message every time the padding differs', () => {
    // The plaintext is hashed into the message key, so padding that varies
    // makes two sends of the same body indistinguishable from each other.
    const first = sealed({ padding: fixedPadding(1) })
    const second = sealed({ padding: fixedPadding(2) })

    expect(hex(first)).not.toBe(hex(second))
    expect(hex(first.subarray(8, 24))).not.toBe(hex(second.subarray(8, 24)))
  })
})

describe('the envelope refuses', () => {
  it('a message sealed under a different key', () => {
    const other = AuthKey.from(Uint8Array.from(KEY_BYTES, (byte) => byte ^ 0xff))

    expect(() => decodeEncryptedMessage({ key: other, bytes: sealed(), from: 'client' })).toThrow(
      /different authorization key/,
    )
  })

  it('a message whose ciphertext was altered', () => {
    const bytes = sealed()
    const at = bytes.length - 20
    bytes[at] = (bytes[at] ?? 0) ^ 0x01

    expect(() => decodeEncryptedMessage({ key: KEY, bytes, from: 'client' })).toThrow(
      /failed its integrity check/,
    )
  })

  it('a message whose message key was altered', () => {
    const bytes = sealed()
    bytes[8] = (bytes[8] ?? 0) ^ 0x01

    expect(() => decodeEncryptedMessage({ key: KEY, bytes, from: 'client' })).toThrow(
      /failed its integrity check/,
    )
  })

  it('a message read with the wrong direction', () => {
    // The two directions read different halves of the auth key. Reading the
    // wrong one produces a different key, not merely different plaintext.
    expect(() => decodeEncryptedMessage({ key: KEY, bytes: sealed(), from: 'server' })).toThrow(
      /failed its integrity check/,
    )
  })

  it('a message too short to be one', () => {
    expect(() =>
      decodeEncryptedMessage({ key: KEY, bytes: new Uint8Array(40), from: 'client' }),
    ).toThrow(MessageError)
  })

  it('a body length that overruns the plaintext', () => {
    expect(() => decodeTampered((view) => view.setInt32(28, 4096, true))).toThrow(
      /declares 4096 bytes/,
    )
  })

  it('a negative body length', () => {
    expect(() => decodeTampered((view) => view.setInt32(28, -4, true))).toThrow(
      /negative message length/,
    )
  })

  it('a body length that is not a multiple of four', () => {
    expect(() => decodeTampered((view) => view.setInt32(28, 5, true))).toThrow(
      /not a multiple of 4/,
    )
  })

  it('padding shorter than the protocol allows', () => {
    // Twelve bytes is the minimum, and a shorter one means the sender used a
    // layout this receiver does not implement.
    expect(() => decodeTampered((view) => view.setInt32(28, 24, true))).toThrow(
      /padding of 8 bytes/,
    )
  })

  it('a message naming another session', () => {
    expect(() =>
      decodeEncryptedMessage({
        key: KEY,
        bytes: sealed(),
        from: 'client',
        sessionId: 0x9999_9999_9999_9999n,
      }),
    ).toThrow(/belongs to another session/)
  })

  it('a client identifier on a server message', () => {
    const bytes = sealed({ from: 'server', msgId: 4n })

    expect(() => decodeEncryptedMessage({ key: KEY, bytes, from: 'server' })).toThrow(
      /wrong parity for a server message/,
    )
  })

  it('a server identifier on a client message', () => {
    const bytes = sealed({ msgId: 5n })

    expect(() => decodeEncryptedMessage({ key: KEY, bytes, from: 'client' })).toThrow(
      /wrong parity for a client message/,
    )
  })

  it('a whole block appended past the end of the message', () => {
    // Padded framing can add up to fifteen bytes, which are dropped as a
    // partial block. A whole block cannot be told from the message by length
    // alone, so it is decrypted as part of it — and changing the plaintext
    // changes the message key, which is what refuses it.
    for (const extra of [16, 32, 48]) {
      const bytes = sealed()
      const padded = new Uint8Array(bytes.length + extra)
      padded.set(bytes)

      expect(
        () => decodeEncryptedMessage({ key: KEY, bytes: padded, from: 'client' }),
        `${extra} trailing bytes`,
      ).toThrow(/failed its integrity check/)
    }
  })

  it('but tolerates the padding a framing legitimately adds', () => {
    for (const extra of [1, 7, 15]) {
      const bytes = sealed()
      const padded = new Uint8Array(bytes.length + extra)
      padded.set(bytes)

      expect(
        decodeEncryptedMessage({ key: KEY, bytes: padded, from: 'client' }).seqNo,
        `${extra} trailing bytes`,
      ).toBe(1)
    }
  })

  it('padding the protocol does not allow, at the point it is produced', () => {
    // Zero padding aligns whenever the body is a whole number of blocks, and
    // 1040 aligns as readily as 16. Both produce a message a server drops
    // without answering, so the encoder refuses them rather than sending one.
    for (const size of [0, 1040]) {
      expect(
        () =>
          encodeEncryptedMessage({
            key: KEY,
            from: 'client',
            salt: 1n,
            sessionId: 2n,
            msgId: 4n,
            seqNo: 1,
            body: new Uint8Array(16),
            padding: () => new Uint8Array(size),
          }),
        `padding of ${size}`,
      ).toThrow(/outside 12 to 1024/)
    }
  })

  it('a key of the wrong size', () => {
    expect(() => AuthKey.from(new Uint8Array(255))).toThrow(/must be 256 bytes/)
  })
})

/**
 * Seal a plaintext whose header has been altered.
 *
 * The message key is computed over the altered bytes, so the message is
 * genuinely valid and the integrity check passes — which is what lets these
 * cases reach the field validation behind it.
 */
function decodeTampered(change: (view: DataView) => void) {
  const body = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8)
  const padding = new Uint8Array(24).fill(0xcd)

  const plaintext = new Uint8Array(32 + body.length + padding.length)
  const view = new DataView(plaintext.buffer)
  view.setBigInt64(0, 1n, true)
  view.setBigInt64(8, 2n, true)
  view.setBigInt64(16, 4n, true)
  view.setInt32(24, 1, true)
  view.setInt32(28, body.length, true)
  plaintext.set(body, 32)
  plaintext.set(padding, 32 + body.length)

  change(view)

  const msgKey = KEY.messageKey(plaintext, 'client')
  const aes = KEY.derive(msgKey, 'client')

  const bytes = new Uint8Array(24 + plaintext.length)
  bytes.set(KEY.id, 0)
  bytes.set(msgKey, 8)
  bytes.set(igeEncrypt(plaintext, aes.key, aes.iv), 24)

  return decodeEncryptedMessage({ key: KEY, bytes, from: 'client' })
}

describe('the session', () => {
  it('draws a non-zero identifier', () => {
    // Zero is what the field holds before a session exists, so a session that
    // drew it would be indistinguishable from one never opened.
    for (let seed = 0; seed < 32; seed += 1) {
      expect(new Session({ salt: 0n, random: scripted(seed) }).id).not.toBe(0n)
    }
  })

  it('redraws rather than accepting zero', () => {
    let drawn = 0
    const random = (length: number) => {
      drawn += 1
      return drawn === 1 ? new Uint8Array(length) : new Uint8Array(length).fill(7)
    }

    expect(new Session({ salt: 0n, random }).id).not.toBe(0n)
    expect(drawn).toBe(2)
  })

  it('gives independent sessions different identifiers', () => {
    const ids = new Set<bigint>()
    for (let seed = 0; seed < 16; seed += 1) {
      ids.add(new Session({ salt: 0n, random: scripted(seed + 100) }).id)
    }

    expect(ids.size).toBe(16)
  })

  it('numbers content-related messages odd and advances only for them', () => {
    // `2n+1` for a message needing acknowledgement, `2n` for one that does not,
    // where n counts only the messages that needed one.
    const session = new Session({ salt: 0n, random: scripted(3) })

    expect(session.nextSeqNo(true)).toBe(1)
    expect(session.nextSeqNo(true)).toBe(3)
    expect(session.nextSeqNo(false)).toBe(4)
    expect(session.nextSeqNo(false)).toBe(4)
    expect(session.nextSeqNo(true)).toBe(5)
    expect(session.contentSent).toBe(3)
  })

  it('starts a fresh session at zero', () => {
    expect(new Session({ salt: 0n, random: scripted(4) }).nextSeqNo(false)).toBe(0)
  })

  it('exempts containers, acknowledgements and the compression wrapper', () => {
    for (const name of ['msgs_ack', 'msg_container', 'msg_copy', 'gzip_packed']) {
      expect(isContentRelated(name), name).toBe(false)
    }
    for (const name of ['ping', 'pong', 'rpc_result', 'new_session_created']) {
      expect(isContentRelated(name), name).toBe(true)
    }
  })

  it('reports the server clock, not the local one', () => {
    const session = new Session({
      salt: 0n,
      random: scripted(20),
      now: () => 1_700_000_000_000,
      timeOffset: 90,
    })

    expect(session.serverNow()).toBe(1_700_000_090)
  })

  it('learns the server clock from a time the server states', () => {
    // The server states its time by rejecting a message, so the offset is
    // computed against the local clock rather than supplied ready-made.
    const session = new Session({ salt: 0n, random: scripted(21), now: () => 1_700_000_000_000 })
    session.adoptServerTime(1_700_000_500)

    expect(session.timeOffset).toBe(500)
    expect(session.serverNow()).toBe(1_700_000_500)
  })

  it('applies a corrected offset to every identifier generated afterwards', () => {
    // A generator that captured the offset at construction would keep producing
    // identifiers the server has already said are wrong.
    const session = new Session({ salt: 0n, random: scripted(22), now: () => 1_700_000_000_500 })
    const before = session.nextMsgId()

    session.adoptServerTime(1_700_000_600)
    const after = session.nextMsgId()

    expect(after >> 32n).toBe((before >> 32n) + 600n)
  })

  it('starts again under a new identifier when the session is replaced', () => {
    const session = new Session({ salt: 5n, random: scripted(23) })
    const id = session.id
    session.nextSeqNo(true)
    session.nextSeqNo(true)

    session.reset()

    expect(session.id).not.toBe(id)
    expect(session.id).not.toBe(0n)
    expect(session.contentSent).toBe(0)
    expect(session.nextSeqNo(true)).toBe(1)
  })

  it('keeps the salt across a reset, because the key outlives the session', () => {
    const session = new Session({ salt: 0x1234n, random: scripted(24) })
    session.reset()

    expect(session.salt).toBe(0x1234n)
  })

  it('adopts a salt the server supplies', () => {
    const session = new Session({ salt: 1n, random: scripted(5) })
    session.adoptSalt(0x0bad_5a17_0bad_5a17n)

    expect(session.salt).toBe(0x0bad_5a17_0bad_5a17n)
  })

  it('produces identifiers a server would accept', () => {
    const session = new Session({ salt: 0n, random: scripted(6), now: () => 1_700_000_000_000 })

    for (let index = 0; index < 8; index += 1) {
      const msgId = session.nextMsgId()
      expect(msgId % 4n).toBe(0n)
      expect(msgId & 0xffff_ffffn).not.toBe(0n)
    }
  })

  it('applies the offset the handshake learned', () => {
    const local = new Session({ salt: 0n, random: scripted(7), now: () => 1_700_000_000_500 })
    const corrected = new Session({
      salt: 0n,
      random: scripted(7),
      now: () => 1_700_000_000_500,
      timeOffset: 90,
    })

    expect(corrected.nextMsgId() >> 32n).toBe((local.nextMsgId() >> 32n) + 90n)
  })
})

describe('an authenticated exchange', () => {
  /** Run the handshake, then hold the connection open for encrypted traffic. */
  function established(faults: readonly Fault[] = []) {
    const framing = new IntermediateFraming()
    const peer = new MockServer({
      key: SERVER_KEY,
      ...(faults.length === 0 ? {} : { faults: new Set(faults) }),
    })
    const buffer = new FrameBuffer()

    const exchange = (message: Uint8Array): Uint8Array[] => {
      buffer.push(peer.receive(framing.encode(message)))

      const out: Uint8Array[] = []
      for (;;) {
        const frame = framing.decode(buffer)
        if (frame === undefined) return out
        if (frame.kind === 'error') throw new Error(`transport error ${frame.code}`)
        out.push(frame.bytes)
      }
    }

    peer.receive(framing.tag())

    const handshake = new Handshake({
      keys: [serverRsaKey(peer.key)],
      dcId: 2,
      random: scripted(11),
      now: () => 1_700_000_000_500,
    })

    let outgoing = handshake.start()
    for (;;) {
      const replies = exchange(outgoing)
      const next = handshake.receive(replies[0] ?? new Uint8Array(0))
      if (next === undefined) break
      outgoing = next
    }

    const result = handshake.result
    if (result === undefined) throw new Error('the exchange did not establish a key')

    const session = new Session({
      salt: result.serverSalt,
      random: scripted(12),
      now: () => 1_700_000_000_600,
      timeOffset: result.timeOffset,
    })

    return { peer, session, result, exchange }
  }

  /** Send one TL value under the established key and read the answer. */
  function call(
    connection: ReturnType<typeof established>,
    value: Parameters<typeof writeObject>[0],
  ) {
    const { session, result, exchange } = connection
    const body = writeObject(value, SCOPE)

    const replies = exchange(
      encodeEncryptedMessage({
        key: result.authKey,
        from: 'client',
        salt: session.salt,
        sessionId: session.id,
        msgId: session.nextMsgId(),
        seqNo: session.nextSeqNo(true),
        body,
      }),
    )

    if (replies.length !== 1) throw new Error(`expected one reply, received ${replies.length}`)

    return decodeEncryptedMessage({
      key: result.authKey,
      bytes: replies[0] ?? new Uint8Array(0),
      from: 'server',
      sessionId: session.id,
    })
  }

  it('carries a message the peer can read and answer', () => {
    // The peer opens the message with its own key schedule, so a client whose
    // derivation disagreed would produce something it could not read at all.
    const connection = established()
    const answer = call(connection, { _: 'ping', ping_id: 0x1234_5678_9abc_def0n })

    const pong = readObject(answer.body, SCOPE)
    expect(pong._).toBe('pong')
    expect(pong['ping_id']).toBe(0x1234_5678_9abc_def0n)
  })

  it('answers under the salt and session the client opened', () => {
    const connection = established()
    const answer = call(connection, { _: 'ping', ping_id: 1n })

    expect(answer.salt).toBe(connection.session.salt)
    expect(answer.sessionId).toBe(connection.session.id)
  })

  it('answers with a server identifier and an odd sequence number', () => {
    const connection = established()
    const answer = call(connection, { _: 'ping', ping_id: 1n })

    expect(answer.msgId % 2n).toBe(1n)
    expect(answer.seqNo % 2).toBe(1)
  })

  it('lets the peer read what the client sealed, by its own derivation', () => {
    // The strongest statement available offline about the message key schedule:
    // two implementations written from the specification separately agree on
    // every byte, in both directions.
    const connection = established()
    const key = connection.result.authKey

    const bytes = encodeEncryptedMessage({
      key,
      from: 'client',
      salt: 5n,
      sessionId: 6n,
      msgId: 8n,
      seqNo: 1,
      body: Uint8Array.of(9, 9, 9, 9),
      padding: fixedPadding(0x33),
    })

    const opened = peerOpen(connection.peer.result?.authKey ?? new Uint8Array(256), bytes, 'client')

    expect(opened.salt).toBe(5n)
    expect(opened.msgId).toBe(8n)
    expect(hex(opened.body)).toBe('09090909')
  })

  it('rejects an answer carrying a salt the client did not agree to', () => {
    const connection = established(['wrong-salt'])
    const answer = call(connection, { _: 'ping', ping_id: 1n })

    // The envelope decodes; the salt is a session-level disagreement the
    // caller acts on rather than a decryption failure.
    expect(answer.salt).not.toBe(connection.session.salt)
  })

  it('rejects an answer naming another session', () => {
    const connection = established(['wrong-session'])

    expect(() => call(connection, { _: 'ping', ping_id: 1n })).toThrow(/belongs to another session/)
  })

  it('rejects an answer whose integrity does not hold', () => {
    const connection = established(['bad-message-integrity'])

    expect(() => call(connection, { _: 'ping', ping_id: 1n })).toThrow(/failed its integrity check/)
  })

  it('rejects an answer carrying a client identifier', () => {
    const connection = established(['wrong-message-id-parity'])

    expect(() => call(connection, { _: 'ping', ping_id: 1n })).toThrow(/wrong parity/)
  })

  it('rejects an answer that is not an encrypted message', () => {
    const connection = established(['malformed-encrypted-message'])

    expect(() => call(connection, { _: 'ping', ping_id: 1n })).toThrow(
      /different authorization key/,
    )
  })

  it('agrees with the peer on the key identifier', () => {
    const connection = established()
    const peerKey = connection.peer.result?.authKey ?? new Uint8Array(256)

    expect(hex(connection.result.authKey.id)).toBe(
      hex(new Uint8Array(createHash('sha1').update(peerKey).digest()).subarray(12, 20)),
    )
  })
})
