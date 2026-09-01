/**
 * What the client puts on the wire.
 *
 * Composing is the one place a connection spends its message identifiers and
 * sequence numbers, and every rule it follows fails silently when it is broken:
 * a container whose identifier is not above its contents is dropped, a sequence
 * number with the wrong low bit changes what the server thinks it owes an
 * answer for, and an element whose declared length is wrong makes the server
 * read the rest of the container as something else.
 *
 * So the cases here do not compare the composer against itself. They seal what
 * it produced under a real key and hand it to a peer that reads containers
 * against the specification rather than against this writer, and assert what
 * the peer saw.
 */

import { ValidationError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { Handshake } from '../src/auth/handshake.js'
import { serverRsaKey } from '../src/auth/keys.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { encodeEncryptedMessage } from '../src/message/encrypted.js'
import { unpackMessages } from '../src/session/inbound.js'
import { OutboundTracker } from '../src/session/outbound.js'
import { compose } from '../src/session/outgoing.js'
import { Session } from '../src/session/session.js'
import { TlScope, writeObject } from '../src/tl/index.js'
import { FrameBuffer, IntermediateFraming } from '../src/transport/framing.js'
import { createServerKey } from './server/keys.js'
import { DH_PRIME, MockServer } from './server/server.js'

const SCOPE = new TlScope('session', [CORE, MTPROTO])
const SERVER_KEY = createServerKey()

let clock = 1_700_000_000_000

/** The last millisecond whose message identifier still fits a signed 64-bit value. */
const LAST_SIGNED_SECOND = (2 ** 31 - 1) * 1000 + 999
/** The first millisecond whose message identifier does not. */
const FIRST_UNSIGNED_SECOND = 2 ** 31 * 1000

beforeAll(() => {
  validateDhParameters({ p: DH_PRIME, g: 3n })
}, 60_000)

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

/** A session with no peer, for the cases that only concern what is built. */
function alone(seed = 7): Session {
  clock = 1_700_000_000_000

  return new Session({ salt: 0x0102_0304_0506_0708n, random: scripted(seed), now: () => clock })
}

/** `ping#7abe77ec ping_id:long = Pong` */
function ping(id: bigint): Uint8Array {
  return writeObject({ _: 'ping', ping_id: id }, SCOPE)
}

/** A connection that has completed a handshake and opened a session. */
function connected(seed = 11) {
  clock = 1_700_000_000_000

  const framing = new IntermediateFraming()
  const peer = new MockServer({ key: SERVER_KEY })
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
    random: scripted(seed),
    now: () => clock,
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
    random: scripted(seed + 50),
    now: () => clock,
    timeOffset: result.timeOffset,
  })

  /** Compose a batch, seal it, and give it to the peer. */
  const send = (bodies: readonly Uint8Array[], acks?: readonly bigint[]) => {
    const composed = compose({
      session,
      scope: SCOPE,
      bodies,
      ...(acks === undefined ? {} : { acks }),
    })

    const replies = exchange(
      encodeEncryptedMessage({
        key: result.authKey,
        from: 'client',
        salt: session.salt,
        sessionId: session.id,
        msgId: composed.msgId,
        seqNo: composed.seqNo,
        body: composed.body,
      }),
    )

    return { composed, replies }
  }

  return { peer, session, send, key: result.authKey }
}

/** Read a composed body back the way the receiving end reads one. */
function readBack(body: Uint8Array, msgId: bigint, seqNo: number) {
  return unpackMessages(body, SCOPE, msgId, seqNo).map((message) => ({
    msgId: message.msgId,
    seqNo: message.seqNo,
    value: message.value,
  }))
}

describe('a single message', () => {
  it('travels without a container', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n)] })

    expect(composed.parts).toHaveLength(1)
    expect(composed.contains).toEqual([])
    expect(composed.acknowledgement).toBeUndefined()
    // The envelope is the message: nothing was wrapped around it.
    expect(composed.msgId).toBe(composed.parts[0]?.msgId)
    expect(composed.seqNo).toBe(composed.parts[0]?.seqNo)
    expect(composed.body).toEqual(ping(1n))
  })

  it('is numbered as content-related, because a query must be answered for', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n)] })

    expect(composed.seqNo % 2).toBe(1)
    expect(session.contentSent).toBe(1)
  })

  it('is read back as the one message it is', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(9n)] })

    expect(readBack(composed.body, composed.msgId, composed.seqNo)).toEqual([
      { msgId: composed.msgId, seqNo: composed.seqNo, value: { _: 'ping', ping_id: 9n } },
    ])
  })
})

describe('a batch', () => {
  it('travels as a container the receiving end unpacks into its parts', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n), ping(3n)] })

    expect(composed.parts).toHaveLength(3)
    expect(composed.contains).toEqual(composed.parts.map((part) => part.msgId))
    expect(readBack(composed.body, composed.msgId, composed.seqNo)).toEqual(
      composed.parts.map((part, index) => ({
        msgId: part.msgId,
        seqNo: part.seqNo,
        value: { _: 'ping', ping_id: BigInt(index + 1) },
      })),
    )
  })

  it('keeps the order it was given', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(30n), ping(10n), ping(20n)] })

    const read = readBack(composed.body, composed.msgId, composed.seqNo)
    expect(read.map((message) => message.value['ping_id'])).toEqual([30n, 10n, 20n])
  })

  it('gives the container an identifier above every identifier it carries', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n), ping(3n)] })

    for (const carried of composed.contains) {
      expect(BigInt.asUintN(64, carried)).toBeLessThan(BigInt.asUintN(64, composed.msgId))
    }
  })

  it('numbers the container as needing no acknowledgement', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n)] })

    // The container is an envelope; what it carries is what the server owes an
    // answer for, and each of those is numbered separately.
    expect(composed.seqNo % 2).toBe(0)
    expect(composed.parts.every((part) => part.seqNo % 2 === 1)).toBe(true)
    expect(session.contentSent).toBe(2)
  })

  it('numbers the container at or above everything it carries', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n), ping(3n)] })

    for (const part of composed.parts) {
      expect(composed.seqNo).toBeGreaterThanOrEqual(part.seqNo)
    }
  })

  it('advances the message identifier for every part', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n), ping(3n)] })

    const seen = new Set([...composed.contains, composed.msgId])
    expect(seen.size).toBe(4)
  })
})

describe('acknowledgements carried alongside', () => {
  it('travel ahead of the work they accompany', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n)], acks: [11n, 22n] })

    const read = readBack(composed.body, composed.msgId, composed.seqNo)
    expect(read.map((message) => message.value._)).toEqual(['msgs_ack', 'ping'])
    expect(read[0]?.value['msg_ids']).toEqual([11n, 22n])
  })

  it('are reported separately from the queries', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n)], acks: [11n] })

    expect(composed.parts).toHaveLength(1)
    expect(composed.acknowledgement).toBeDefined()
    expect(composed.contains).toHaveLength(2)
  })

  it('need no acknowledgement of their own', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n)], acks: [11n] })

    expect((composed.acknowledgement?.seqNo ?? -1) % 2).toBe(0)
    // Only the query counted.
    expect(session.contentSent).toBe(1)
  })

  it('can be sent with nothing else, which is how a backlog is flushed', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [], acks: [11n, 22n, 33n] })

    expect(composed.parts).toEqual([])
    expect(composed.contains).toEqual([])
    expect(composed.msgId).toBe(composed.acknowledgement?.msgId)
    expect(readBack(composed.body, composed.msgId, composed.seqNo)).toEqual([
      {
        msgId: composed.msgId,
        seqNo: composed.seqNo,
        value: { _: 'msgs_ack', msg_ids: [11n, 22n, 33n] },
      },
    ])
  })

  it('count toward what a container may carry', () => {
    const session = alone()
    const bodies = Array.from({ length: 1024 }, (_, index) => ping(BigInt(index)))

    // Exactly full without one, over by exactly one with it.
    expect(() => compose({ session, scope: SCOPE, bodies })).not.toThrow()
    expect(() => compose({ session, scope: SCOPE, bodies, acks: [1n] })).toThrow(ValidationError)
  })
})

describe('what a peer makes of it', () => {
  it('answers every message in a container', () => {
    const { peer, send } = connected()
    const { composed, replies } = send([ping(1n), ping(2n), ping(3n)])

    expect(peer.seen.map((message) => message.value['ping_id'])).toEqual([1n, 2n, 3n])
    // The peer reports on the elements, never on the container that carried
    // them, so the identifiers it answered are the ones it was given.
    expect(peer.seen.map((message) => message.msgId)).toEqual(composed.contains)
    expect(replies).toHaveLength(1)
  })

  it('sees the sequence numbers the parts were numbered with', () => {
    const { peer, send } = connected()
    const { composed } = send([ping(1n), ping(2n)])

    expect(peer.seen.map((message) => message.seqNo)).toEqual(
      composed.parts.map((part) => part.seqNo),
    )
  })

  it('records an acknowledgement and does not answer it', () => {
    const { peer, send } = connected()
    send([ping(1n)], [77n])

    expect(peer.seen.map((message) => message.value._)).toEqual(['msgs_ack', 'ping'])
  })

  it('is sent nothing to answer when only acknowledgements go out', () => {
    const { peer, send } = connected()
    const { replies } = send([], [77n])

    expect(peer.seen.map((message) => message.value._)).toEqual(['msgs_ack'])
    expect(replies).toEqual([])
  })

  it('reads a single message that was not wrapped in a container', () => {
    const { peer, send } = connected()
    const { composed, replies } = send([ping(5n)])

    expect(peer.seen).toHaveLength(1)
    expect(peer.seen[0]?.msgId).toBe(composed.msgId)
    expect(replies).toHaveLength(1)
  })
})

describe('what the tracker is told', () => {
  it('can record a container and everything it carried', () => {
    const session = alone()
    const tracker = new OutboundTracker()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n)] })

    for (const part of composed.parts) {
      tracker.track({ msgId: part.msgId, seqNo: part.seqNo, sentAt: 100 })
    }
    tracker.track({
      msgId: composed.msgId,
      seqNo: composed.seqNo,
      sentAt: 100,
      contains: composed.contains,
    })

    // Acknowledging the container acknowledges what it carried, which is why
    // the composed message reports the identifiers it stands for.
    tracker.acknowledge(composed.msgId)
    for (const part of composed.parts) {
      expect(tracker.get(part.msgId)?.acknowledged).toBe(true)
    }
  })
})

describe('what will not be composed', () => {
  it('refuses an empty batch, which would send an empty message', () => {
    expect(() => compose({ session: alone(), scope: SCOPE, bodies: [] })).toThrow(ValidationError)
  })

  it('refuses a body too short to carry a constructor', () => {
    expect(() =>
      compose({ session: alone(), scope: SCOPE, bodies: [new Uint8Array([1, 2, 3])] }),
    ).toThrow(/carries no constructor/)
  })

  it('refuses a body that is not whole words', () => {
    expect(() => compose({ session: alone(), scope: SCOPE, bodies: [new Uint8Array(6)] })).toThrow(
      /whole words/,
    )
  })

  it('refuses a service wrapper the caller built', () => {
    const forged = writeObject({ _: 'msgs_ack', msg_ids: [1n] }, SCOPE)

    expect(() => compose({ session: alone(), scope: SCOPE, bodies: [forged] })).toThrow(
      /service wrapper/,
    )
  })

  it('refuses a container the caller built, which would nest one', () => {
    const forged = new Uint8Array(8)
    new DataView(forged.buffer).setUint32(0, 0x73f1_f8dc, true)

    expect(() => compose({ session: alone(), scope: SCOPE, bodies: [forged] })).toThrow(
      /service wrapper/,
    )
  })

  it('refuses more messages than a container may carry', () => {
    const bodies = Array.from({ length: 1025 }, (_, index) => ping(BigInt(index)))

    expect(() => compose({ session: alone(), scope: SCOPE, bodies })).toThrow(/at most 1024/)
  })

  it('refuses more identifiers than an acknowledgement may name', () => {
    const acks = Array.from({ length: 8193 }, (_, index) => BigInt(index))

    expect(() => compose({ session: alone(), scope: SCOPE, bodies: [], acks })).toThrow(
      /at most 8192/,
    )
  })

  it('accepts exactly as many identifiers as one may name', () => {
    const acks = Array.from({ length: 8192 }, (_, index) => BigInt(index + 1))

    expect(() => compose({ session: alone(), scope: SCOPE, bodies: [], acks })).not.toThrow()
  })

  it('refuses a body larger than the envelope could seal', () => {
    const oversized = new Uint8Array(16 * 1024 * 1024 + 4)
    new DataView(oversized.buffer).setUint32(0, 0x7abe_77ec, true)

    expect(() => compose({ session: alone(), scope: SCOPE, bodies: [oversized] })).toThrow(
      /too large to send/,
    )
  })

  it('measures the container it would build, not the bodies it was given', () => {
    // A container costs eight bytes for itself and sixteen for each element it
    // carries. These two bodies come to exactly the limit once all of that is
    // counted, and one word more does not — so a ceiling that measured the
    // payload alone would pass a message that could not then be sealed.
    const half = (16 * 1024 * 1024 - 8 - 2 * 16) / 2
    const sized = (size: number): Uint8Array => {
      const body = new Uint8Array(size)
      new DataView(body.buffer).setUint32(0, 0x7abe_77ec, true)
      return body
    }

    expect(() =>
      compose({ session: alone(), scope: SCOPE, bodies: [sized(half), sized(half)] }),
    ).not.toThrow()
    expect(() =>
      compose({ session: alone(), scope: SCOPE, bodies: [sized(half), sized(half + 4)] }),
    ).toThrow(/too large to send/)
  })
})

describe('a session that has been replaced', () => {
  it('numbers the next batch from the beginning again', () => {
    const session = alone()
    compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n)] })
    expect(session.contentSent).toBe(2)

    session.reset()

    const composed = compose({ session, scope: SCOPE, bodies: [ping(3n)] })
    expect(composed.seqNo).toBe(1)
  })

  it('keeps advancing the message identifier across the reset', () => {
    const session = alone()
    const before = compose({ session, scope: SCOPE, bodies: [ping(1n)] })

    session.reset()

    const after = compose({ session, scope: SCOPE, bodies: [ping(2n)] })
    // Identifiers must strictly increase for as long as the connection lives,
    // whatever the session does: a repeated one is dropped as a duplicate.
    expect(BigInt.asUintN(64, after.msgId)).toBeGreaterThan(BigInt.asUintN(64, before.msgId))
  })
})

describe('a clock past 2038', () => {
  it('still composes a container, because identifiers are compared unsigned', () => {
    const session = alone()
    // Past the point where a message identifier no longer fits a signed 64-bit
    // value and is carried as a negative number. Comparing the signed forms
    // would make every container look malformed from that day on.
    clock = 2_500_000_000_000

    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n)] })

    expect(composed.msgId).toBeLessThan(0n)
    expect(composed.contains.every((carried) => carried < 0n)).toBe(true)
    for (const carried of composed.contains) {
      expect(BigInt.asUintN(64, carried)).toBeLessThan(BigInt.asUintN(64, composed.msgId))
    }
    expect(readBack(composed.body, composed.msgId, composed.seqNo)).toHaveLength(2)
  })

  it('composes the batch that straddles the moment identifiers turn negative', () => {
    // The one batch where the two forms disagree: its parts are drawn in the
    // last second that still fits a signed 64-bit value and its container in
    // the first that does not, so the parts read as large positive numbers and
    // the container as a negative one. Compared as signed, every part would
    // look as though it belonged above its own container.
    const readings = [LAST_SIGNED_SECOND, LAST_SIGNED_SECOND, FIRST_UNSIGNED_SECOND]
    let reading = 0

    const session = new Session({
      salt: 1n,
      random: scripted(3),
      now: () => readings[reading++] ?? FIRST_UNSIGNED_SECOND,
    })

    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n)] })

    expect(composed.contains.every((carried) => carried > 0n)).toBe(true)
    expect(composed.msgId).toBeLessThan(0n)
    expect(readBack(composed.body, composed.msgId, composed.seqNo)).toHaveLength(2)
  })
})

describe('the values a peer would refuse', () => {
  it('never gives a part an identifier at or above the container it travels in', () => {
    const session = alone()

    // Every batch, not one: the guard is on the relation, and a generator that
    // stopped advancing would break it silently on some later batch rather than
    // the first.
    for (let batch = 0; batch < 32; batch += 1) {
      clock += 1
      const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n)] })

      for (const carried of composed.contains) {
        expect(BigInt.asUintN(64, carried)).toBeLessThan(BigInt.asUintN(64, composed.msgId))
      }
    }
  })

  it('gives every message an identifier the server accepts as a client one', () => {
    const session = alone()
    const composed = compose({ session, scope: SCOPE, bodies: [ping(1n), ping(2n)], acks: [3n] })

    for (const msgId of [...composed.contains, composed.msgId]) {
      // Client identifiers are divisible by four, and the low word must not be
      // empty — the server ignores one that is, without saying so.
      expect(BigInt.asUintN(64, msgId) % 4n).toBe(0n)
      expect(BigInt.asUintN(64, msgId) & 0xffff_ffffn).not.toBe(0n)
    }
  })
})
