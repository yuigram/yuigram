// SPDX-License-Identifier: MIT

/**
 * The session's response to what the server sends.
 *
 * Every rule here fails silently when it is wrong: the server does not report a
 * stale salt twice, does not complain that an acknowledgement never arrived,
 * and does not explain that a clock correction was ignored. So each case drives
 * the real condition through a real key — established by a real handshake, and
 * sealed by the peer's own independent derivation — and asserts the specific
 * outcome rather than that something happened.
 */

import { gzipSync } from 'node:zlib'
import { FloodError, TelegramError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { Handshake } from '../src/auth/handshake.js'
import { serverRsaKey } from '../src/auth/keys.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { encodeEncryptedMessage } from '../src/message/encrypted.js'
import {
  MigrationError,
  type MigrationKind,
  rpcErrorToException,
  SessionDispatcher,
  type SessionEvent,
} from '../src/session/dispatcher.js'
import { OutboundTracker } from '../src/session/outbound.js'
import { SaltReservoir } from '../src/session/salts.js'
import { Session } from '../src/session/session.js'
import { TlScope, type TlValue, TlWriter, writeObject } from '../src/tl/index.js'
import { FrameBuffer, IntermediateFraming } from '../src/transport/framing.js'
import { createServerKey } from './server/keys.js'
import { DH_PRIME, MockServer } from './server/server.js'

const SCOPE = new TlScope('session', [CORE, MTPROTO])
const SERVER_KEY = createServerKey()

/** A clock the tests move deliberately. */
let clock = 1_700_000_000_000

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

  const dispatcher = new SessionDispatcher({ session, key: result.authKey, scope: SCOPE })

  // The peer learns the session identifier from the first message under it.
  exchange(
    encodeEncryptedMessage({
      key: result.authKey,
      from: 'client',
      salt: session.salt,
      sessionId: session.id,
      msgId: session.nextMsgId(),
      seqNo: session.nextSeqNo(true),
      body: new Uint8Array([0xec, 0x77, 0xbe, 0x7a, 1, 0, 0, 0, 0, 0, 0, 0]),
    }),
  )

  return { peer, session, dispatcher, key: result.authKey }
}

/** An `rpc_result` whose result field is written as raw, already-encoded bytes. */
function rpcResultBody(reqMsgId: bigint, result: Uint8Array): Uint8Array {
  const writer = new TlWriter(SCOPE)
  writer.uint(0xf35c_6d01)
  writer.long(reqMsgId)
  writer.raw(result)

  return writer.finish()
}

/** The kinds a result produced, in order. */
function kinds(events: readonly SessionEvent[]): string[] {
  return events.map((event) => event.kind)
}

function only<K extends SessionEvent['kind']>(
  events: readonly SessionEvent[],
  kind: K,
): Extract<SessionEvent, { kind: K }> {
  const found = events.find((event) => event.kind === kind)
  if (found === undefined) throw new Error(`no ${kind} event in [${kinds(events).join(', ')}]`)
  return found as Extract<SessionEvent, { kind: K }>
}

/** A server identifier dated at the session's current clock. */
function nowMsgId(session: Session, low = 1): bigint {
  return (BigInt(session.serverNow()) << 32n) | BigInt(low)
}

describe('acknowledgements', () => {
  it('reports what the server confirmed', () => {
    const { peer, dispatcher } = connected()
    const acked = [0x1111_1111_1111_1114n, 0x2222_2222_2222_2228n]

    const result = dispatcher.receive(peer.seal({ _: 'msgs_ack', msg_ids: acked }))

    expect(only(result.events, 'acknowledged').msgIds).toEqual(acked)
  })

  it('does not acknowledge an acknowledgement', () => {
    // Acknowledging an acknowledgement does not terminate.
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(peer.seal({ _: 'msgs_ack', msg_ids: [4n] }))

    expect(result.acks).toEqual([])
  })

  it('acknowledges an ordinary message', () => {
    const { peer, dispatcher, session } = connected()
    const msgId = nowMsgId(session, 5)

    const result = dispatcher.receive(
      peer.seal({ _: 'destroy_session_ok', session_id: 4n }, { msgId }),
    )

    expect(result.acks).toEqual([msgId])
    expect(kinds(result.events)).toEqual(['message'])
  })

  it('never acknowledges a notification the server is not waiting on', () => {
    const { peer, dispatcher, session } = connected()

    for (const value of [
      {
        _: 'bad_server_salt',
        bad_msg_id: 4n,
        bad_msg_seqno: 1,
        error_code: 48,
        new_server_salt: 9n,
      },
      { _: 'bad_msg_notification', bad_msg_id: 4n, bad_msg_seqno: 1, error_code: 20 },
    ] as TlValue[]) {
      const result = dispatcher.receive(peer.seal(value, { msgId: nowMsgId(session, 9) }))
      expect(result.acks, value._).toEqual([])
    }
  })
})

describe('a result the server returned', () => {
  it('is surfaced whole, and reports the request it answers', () => {
    // An answer is itself an acknowledgement: the server does not reply to a
    // message it never processed.
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(
      peer.seal({
        _: 'rpc_result',
        req_msg_id: 0x0123_4567_89ab_cde0n,
        result: { _: 'pong', msg_id: 4n, ping_id: 77n },
      }),
    )

    expect(result.answered).toEqual([0x0123_4567_89ab_cde0n])
    const event = only(result.events, 'message')
    expect(event.message.value._).toBe('rpc_result')
    expect((event.message.value['result'] as { _: string })._).toBe('pong')
  })

  it('carries an error the same way as a value', () => {
    // A failure is a result. Mapping it to something else is the work of the
    // layer that knows what was asked.
    const { peer, dispatcher, session } = connected()

    const result = dispatcher.receive(
      peer.seal(
        {
          _: 'rpc_result',
          req_msg_id: 0x0123_4567_89ab_cde0n,
          result: { _: 'rpc_error', error_code: 420, error_message: 'FLOOD_WAIT_30' },
        },
        { msgId: nowMsgId(session, 9) },
      ),
    )

    expect(result.answered).toEqual([0x0123_4567_89ab_cde0n])
    const inner = only(result.events, 'message').message.value['result'] as Record<string, unknown>
    expect(inner['_']).toBe('rpc_error')
    expect(inner['error_code']).toBe(420)
    expect(inner['error_message']).toBe('FLOOD_WAIT_30')
  })

  it('reports a request identifier this client never sent', () => {
    // The session layer holds no request state, so it reports rather than
    // matches. Deciding that nothing was waiting is the caller's.
    const { peer, dispatcher } = connected()
    const tracker = new OutboundTracker()

    const result = dispatcher.receive(
      peer.seal({
        _: 'rpc_result',
        req_msg_id: 0x7777_0000_0000_0000n,
        result: { _: 'pong', msg_id: 4n, ping_id: 1n },
      }),
    )

    expect(result.answered).toEqual([0x7777_0000_0000_0000n])
    expect(tracker.acknowledge(result.answered[0] ?? 0n)).toBe('unknown')
  })

  it('is not answered for twice when the result is replayed', () => {
    // Replay filtering runs before dispatch, so a repeated result never reaches
    // the point where it would acknowledge its request a second time.
    const { peer, dispatcher, session } = connected()
    const message = peer.seal(
      {
        _: 'rpc_result',
        req_msg_id: 0x0123_4567_89ab_cde0n,
        result: { _: 'pong', msg_id: 4n, ping_id: 1n },
      },
      { msgId: nowMsgId(session, 11) },
    )

    expect(dispatcher.receive(message).answered).toEqual([0x0123_4567_89ab_cde0n])

    const again = dispatcher.receive(message)
    expect(again.answered).toEqual([])
    expect(only(again.events, 'dropped').reason).toBe('duplicate')
  })

  it('acknowledges the request in the tracker exactly once', () => {
    const { peer, dispatcher, session } = connected()
    const tracker = new OutboundTracker()
    tracker.track({ msgId: 0x0123_4567_89ab_cde0n, seqNo: 1, sentAt: session.serverNow() })

    const message = peer.seal(
      {
        _: 'rpc_result',
        req_msg_id: 0x0123_4567_89ab_cde0n,
        result: { _: 'pong', msg_id: 4n, ping_id: 1n },
      },
      { msgId: nowMsgId(session, 13) },
    )

    for (const answered of dispatcher.receive(message).answered) {
      expect(tracker.acknowledge(answered)).toBe('acknowledged')
    }

    expect(tracker.due(session.serverNow())).toEqual([])
  })
})

describe('the outbound lifecycle', () => {
  /** A connection with one request already sent and tracked. */
  function withRequest() {
    const connection = connected()
    const tracker = new OutboundTracker()
    const reqMsgId = 0x0123_4567_89ab_cde0n
    tracker.track({ msgId: reqMsgId, seqNo: 1, sentAt: connection.session.serverNow() })

    return { ...connection, tracker, reqMsgId }
  }

  it('settles correctly when the acknowledgement arrives first', () => {
    const { peer, dispatcher, session, tracker, reqMsgId } = withRequest()

    for (const id of dispatcher
      .receive(peer.seal({ _: 'msgs_ack', msg_ids: [reqMsgId] }))
      .events.flatMap((event) => (event.kind === 'acknowledged' ? [...event.msgIds] : []))) {
      expect(tracker.acknowledge(id)).toBe('acknowledged')
    }
    expect(tracker.due(session.serverNow())).toEqual([])

    const answered = dispatcher.receive(
      peer.seal(
        { _: 'rpc_result', req_msg_id: reqMsgId, result: { _: 'pong', msg_id: 4n, ping_id: 1n } },
        { msgId: nowMsgId(session, 11) },
      ),
    ).answered

    // The result acknowledges a request already acknowledged, which is a repeat
    // rather than a contradiction.
    expect(answered).toEqual([reqMsgId])
    expect(tracker.acknowledge(reqMsgId)).toBe('already-acknowledged')
    expect(tracker.due(session.serverNow())).toEqual([])
  })

  it('settles correctly when the result arrives first', () => {
    const { peer, dispatcher, session, tracker, reqMsgId } = withRequest()

    const answered = dispatcher.receive(
      peer.seal({
        _: 'rpc_result',
        req_msg_id: reqMsgId,
        result: { _: 'pong', msg_id: 4n, ping_id: 1n },
      }),
    ).answered
    expect(tracker.acknowledge(answered[0] ?? 0n)).toBe('acknowledged')
    expect(tracker.due(session.serverNow())).toEqual([])

    // The caller has finished with the request and stops tracking it.
    tracker.forget(reqMsgId)

    const late = dispatcher.receive(
      peer.seal({ _: 'msgs_ack', msg_ids: [reqMsgId] }, { msgId: nowMsgId(session, 13) }),
    )
    for (const id of late.events.flatMap((event) =>
      event.kind === 'acknowledged' ? [...event.msgIds] : [],
    )) {
      // Forgotten and never-sent are reported identically. Both mean the same
      // thing to a caller: there is nothing outstanding to settle.
      expect(tracker.acknowledge(id)).toBe('unknown')
    }
    expect(tracker.size).toBe(0)
  })

  it('does not resend a request the server has answered', () => {
    const { peer, dispatcher, session, tracker, reqMsgId } = withRequest()

    for (const id of dispatcher.receive(
      peer.seal({
        _: 'rpc_result',
        req_msg_id: reqMsgId,
        result: { _: 'rpc_error', error_code: 400, error_message: 'BAD_REQUEST' },
      }),
    ).answered) {
      tracker.acknowledge(id)
    }

    // A failure is still an answer, so the request is settled either way.
    expect(tracker.due(session.serverNow())).toEqual([])
    expect(tracker.canResend(reqMsgId)).toBe(false)
  })

  it('settles the request that a resend carried, not the one it replaced', () => {
    const { peer, dispatcher, session, tracker, reqMsgId } = withRequest()

    const resent = reqMsgId + 4n
    tracker.track({ msgId: resent, seqNo: 3, sentAt: session.serverNow(), replaces: reqMsgId })

    const answered = dispatcher.receive(
      peer.seal({
        _: 'rpc_result',
        req_msg_id: resent,
        result: { _: 'pong', msg_id: 4n, ping_id: 1n },
      }),
    ).answered

    expect(answered).toEqual([resent])
    expect(tracker.acknowledge(resent)).toBe('acknowledged')
    expect(tracker.acknowledge(reqMsgId)).toBe('unknown')
    expect(tracker.due(session.serverNow())).toEqual([])
  })
})

describe('a compressed result', () => {
  it('is unwrapped before it is surfaced', () => {
    // Compression around a whole message is undone while flattening; a result
    // is compressed inside the field that carries it, and only the layer that
    // knows the field is a result can undo that.
    const { peer, dispatcher } = connected()
    const inner = writeObject({ _: 'pong', msg_id: 4n, ping_id: 0xbeefn }, SCOPE)

    const writer = new TlWriter(SCOPE)
    writer.uint(0x3072_cfa1)
    writer.bytes(gzipSync(inner))

    const result = dispatcher.receive(
      peer.sealRaw(rpcResultBody(0x0123_4567_89ab_cde0n, writer.finish())),
    )

    const value = only(result.events, 'message').message.value
    const answer = value['result'] as Record<string, unknown>
    expect(answer['_']).toBe('pong')
    expect(answer['ping_id']).toBe(0xbeefn)
    expect(result.answered).toEqual([0x0123_4567_89ab_cde0n])
  })

  it('refuses one that would expand past the ceiling', () => {
    // The same bound governs both places compression appears, so a result
    // cannot be the way around it.
    const { peer, dispatcher } = connected()

    const writer = new TlWriter(SCOPE)
    writer.uint(0x3072_cfa1)
    writer.bytes(gzipSync(new Uint8Array(20 * 1024 * 1024)))

    expect(() => dispatcher.receive(peer.sealRaw(rpcResultBody(4n, writer.finish())))).toThrow(
      /could not be read/,
    )
  })

  it('leaves an uncompressed result exactly as it arrived', () => {
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(
      peer.seal({
        _: 'rpc_result',
        req_msg_id: 8n,
        result: { _: 'pong', msg_id: 4n, ping_id: 1n },
      }),
    )

    const answer = only(result.events, 'message').message.value['result'] as Record<string, unknown>
    expect(answer['_']).toBe('pong')
  })
})

describe('turning a failure into an error', () => {
  it('raises the shared type for a rate limit, carrying the wait', () => {
    // The one failure both transports report and both callers handle the same
    // way, so it becomes the type they share.
    const error = rpcErrorToException({
      _: 'rpc_error',
      error_code: 420,
      error_message: 'FLOOD_WAIT_42',
    })

    expect(error).toBeInstanceOf(FloodError)
    expect((error as FloodError).retryAfter).toBe(42)
    expect(error.message).toContain('FLOOD_WAIT_42')
  })

  it('recognises every error that names a wait, not only the flood one', () => {
    // The Bot API decides by whether a delay was supplied at all, and reports
    // slow mode the same way it reports a flood. Matching one name here would
    // make the two transports disagree about the same condition.
    for (const text of ['SLOWMODE_WAIT_10', 'FLOOD_PREMIUM_WAIT_7', 'FLOOD_WAIT_1']) {
      const error = rpcErrorToException({ _: 'rpc_error', error_code: 420, error_message: text })
      expect(error, text).toBeInstanceOf(FloodError)
    }
  })

  it('raises a redirection as the datacenter it names', () => {
    // The number is the whole content of the answer. A caller that has to read
    // it back out of a message cannot act on it without matching text.
    const error = rpcErrorToException({
      _: 'rpc_error',
      error_code: 303,
      error_message: 'PHONE_MIGRATE_4',
    })

    expect(error).toBeInstanceOf(MigrationError)
    expect((error as MigrationError).kind).toBe('phone')
    expect((error as MigrationError).dcId).toBe(4)
    expect(error.message).toContain('PHONE_MIGRATE_4')
  })

  it('recognises each of the four things that can have moved', () => {
    const cases: Array<[string, MigrationKind, number]> = [
      ['PHONE_MIGRATE_1', 'phone', 1],
      ['NETWORK_MIGRATE_2', 'network', 2],
      ['USER_MIGRATE_3', 'user', 3],
      ['FILE_MIGRATE_5', 'file', 5],
    ]

    for (const [text, kind, dcId] of cases) {
      const error = rpcErrorToException({ _: 'rpc_error', error_code: 303, error_message: text })

      expect(error, text).toBeInstanceOf(MigrationError)
      expect((error as MigrationError).kind, text).toBe(kind)
      expect((error as MigrationError).dcId, text).toBe(dcId)
    }
  })

  it('is still a refusal from Telegram, so a caller that handles those sees it', () => {
    const error = rpcErrorToException(
      { _: 'rpc_error', error_code: 303, error_message: 'USER_MIGRATE_2' },
      'auth.signIn',
    )

    expect(error).toBeInstanceOf(TelegramError)
    expect(error).not.toBeInstanceOf(FloodError)
    expect(error.method).toBe('auth.signIn')
  })

  it('does not read a redirection into anything that merely mentions one', () => {
    // The shape is the whole test: a name, the word, and a number. Anything
    // else keeps the name Telegram gave it.
    for (const text of ['MIGRATE_2', 'PHONE_MIGRATE', 'PHONE_MIGRATE_X', 'CHAT_MIGRATE_TO_5']) {
      const error = rpcErrorToException({ _: 'rpc_error', error_code: 400, error_message: text })

      expect(error, text).not.toBeInstanceOf(MigrationError)
    }
  })

  it('keeps the name Telegram gave anything else', () => {
    // A caller matching on CHANNEL_PRIVATE needs to see CHANNEL_PRIVATE.
    const error = rpcErrorToException({
      _: 'rpc_error',
      error_code: 400,
      error_message: 'CHANNEL_PRIVATE',
    })

    expect(error).toBeInstanceOf(TelegramError)
    expect(error).not.toBeInstanceOf(FloodError)
    expect(error.message).toContain('CHANNEL_PRIVATE')
    expect(error.message).toContain('400')
  })

  it('records the method when the caller knows it', () => {
    const error = rpcErrorToException(
      { _: 'rpc_error', error_code: 400, error_message: 'BAD' },
      'messages.sendMessage',
    )

    expect(error.method).toBe('messages.sendMessage')
  })

  it('survives an error with no description', () => {
    const error = rpcErrorToException({ _: 'rpc_error', error_code: 500, error_message: '' })

    expect(error).toBeInstanceOf(TelegramError)
    expect(error.message).toContain('500')
  })

  it('does not read a wait out of something that merely resembles one', () => {
    for (const text of ['FLOOD_WAIT', 'FLOOD_WAIT_', 'FLOOD_WAIT_X', 'NOT_A_FLOOD_WAIT_5_MORE']) {
      expect(
        rpcErrorToException({ _: 'rpc_error', error_code: 420, error_message: text }),
        text,
      ).not.toBeInstanceOf(FloodError)
    }
  })
})

describe('a state query the server answered', () => {
  it('is decoded into one status per identifier asked about', () => {
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(
      peer.seal({
        _: 'msgs_state_info',
        req_msg_id: 0x0055_0000_0000_0000n,
        info: Uint8Array.of(1, 2, 0b1100),
      }),
    )

    const event = only(result.events, 'message-states')
    expect(event.reqMsgId).toBe(0x0055_0000_0000_0000n)
    expect(event.statuses).toEqual([
      { state: 1, acknowledged: false },
      { state: 2, acknowledged: false },
      { state: 4, acknowledged: true },
    ])
  })

  it('is never acknowledged', () => {
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(
      peer.seal({ _: 'msgs_state_info', req_msg_id: 1n, info: Uint8Array.of(4) }),
    )

    expect(result.acks).toEqual([])
  })
})

describe('salts the server offers', () => {
  it('are reported with the query they answer', () => {
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(
      peer.seal({
        _: 'future_salts',
        req_msg_id: 0x0077_0000_0000_0000n,
        now: 1_700_000_000,
        salts: [
          { _: 'future_salt', valid_since: 100, valid_until: 200, salt: 7n },
          { _: 'future_salt', valid_since: 200, valid_until: 300, salt: 8n },
        ],
      }),
    )

    const event = only(result.events, 'salts-offered')
    expect(event.reqMsgId).toBe(0x0077_0000_0000_0000n)
    expect(event.salts).toEqual([
      { validSince: 100, validUntil: 200, salt: 7n },
      { validSince: 200, validUntil: 300, salt: 8n },
    ])
  })

  it('fill a reservoir the connection can then draw on', () => {
    const { peer, dispatcher } = connected()
    const reservoir = new SaltReservoir()

    const result = dispatcher.receive(
      peer.seal({
        _: 'future_salts',
        req_msg_id: 1n,
        now: 50,
        salts: [{ _: 'future_salt', valid_since: 100, valid_until: 200, salt: 0xfeedn }],
      }),
    )

    const event = only(result.events, 'salts-offered')
    reservoir.offer(event.salts, 50)

    expect(reservoir.inForce(150)).toBe(0xfeedn)
  })

  it('carry an empty run when the server has none to give', () => {
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(
      peer.seal({ _: 'future_salts', req_msg_id: 1n, now: 50, salts: [] }),
    )

    expect(only(result.events, 'salts-offered').salts).toEqual([])
  })
})

describe('a message that is itself an acknowledgement', () => {
  it('is not acknowledged in turn, for a pong', () => {
    const { peer, dispatcher } = connected()

    // A pong answers a ping, and answering is what acknowledging the ping
    // means. Acknowledging the pong would be reporting on an exchange that had
    // already finished.
    const result = dispatcher.receive(peer.seal({ _: 'pong', msg_id: 7n, ping_id: 3n }))

    expect(result.acks).toEqual([])
    // Not acknowledged, but still reported — it names the ping it answers, and
    // that answer is what confirms the ping arrived.
    expect(only(result.events, 'pong')).toEqual({ kind: 'pong', msgId: 7n, pingId: 3n })
    expect(result.answered).toEqual([7n])
  })

  it('is not acknowledged in turn, for a list of future salts', () => {
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(
      peer.seal({
        _: 'future_salts',
        req_msg_id: 11n,
        now: 1_700_000_000,
        salts: [{ _: 'future_salt', valid_since: 1, valid_until: 2, salt: 3n }],
      }),
    )

    expect(result.acks).toEqual([])
  })

  it('does not excuse a result, which the server still waits to hear about', () => {
    const { peer, dispatcher } = connected()

    const result = dispatcher.receive(
      peer.seal({
        _: 'rpc_result',
        req_msg_id: 5n,
        result: { _: 'pong', msg_id: 5n, ping_id: 1n },
      }),
    )

    // The result answers the query and acknowledges it, but the result itself
    // is a message like any other and is resent until it is acknowledged.
    expect(result.acks).toHaveLength(1)
    expect(result.answered).toEqual([5n])
  })
})

describe('a stale salt', () => {
  it('is replaced, and the refused message is named for resending', () => {
    const { peer, dispatcher, session } = connected()
    const before = session.salt

    const result = dispatcher.receive(
      peer.seal({
        _: 'bad_server_salt',
        bad_msg_id: 0x1234_5678_9abc_def0n,
        bad_msg_seqno: 3,
        error_code: 48,
        new_server_salt: 0x0bad_5a17_0bad_5a17n,
      }),
    )

    const event = only(result.events, 'salt-changed')
    expect(event.salt).toBe(0x0bad_5a17_0bad_5a17n)
    expect(event.resend).toBe(0x1234_5678_9abc_def0n)
    expect(session.salt).toBe(0x0bad_5a17_0bad_5a17n)
    expect(session.salt).not.toBe(before)
  })
})

describe('a refused message', () => {
  /** Send one notification and hand back what it produced. */
  function notify(code: number, low = 7) {
    const connection = connected()
    const msgId = nowMsgId(connection.session, low)
    const before = { id: connection.session.id, offset: connection.session.timeOffset }

    const result = connection.dispatcher.receive(
      connection.peer.seal(
        {
          _: 'bad_msg_notification',
          bad_msg_id: 0x0aaa_aaaa_aaaa_aaa0n,
          bad_msg_seqno: 5,
          error_code: code,
        },
        { msgId },
      ),
    )

    return { ...connection, result, msgId, before }
  }

  it('corrects the clock and resends when the identifier was too low', () => {
    // Code 16. The notification's own identifier carries the server's clock;
    // the payload says what was wrong, never what would have been right.
    const { result, session, msgId } = notify(16)

    expect(only(result.events, 'resend').msgId).toBe(0x0aaa_aaaa_aaaa_aaa0n)
    expect(session.serverNow()).toBe(Number(BigInt.asUintN(64, msgId) >> 32n))
  })

  it('corrects the clock and sends again when the identifier was too high', () => {
    // Code 17. The protocol says to synchronise the clock and re-send with the
    // corrected identifier — the server refused the message, so it did not run.
    const { result, session, before } = notify(17)

    expect(only(result.events, 'resend').msgId).toBe(0x0aaa_aaaa_aaaa_aaa0n)
    expect(session.id).toBe(before.id)
  })

  it('gives up on a message too old, rather than sending it again', () => {
    // Code 20. The protocol states that for a message this old it cannot be
    // verified whether the server received it. Sending it again would run it a
    // second time if it did, and the identifier that would have stopped that
    // belongs to a session the message is no longer part of.
    const connection = connected()
    const before = connection.session.timeOffset

    const result = connection.dispatcher.receive(
      connection.peer.seal(
        { _: 'bad_msg_notification', bad_msg_id: 8n, bad_msg_seqno: 1, error_code: 20 },
        { msgId: (BigInt(connection.session.serverNow() - 200) << 32n) | 1n },
      ),
    )

    expect(only(result.events, 'outcome-unknown').msgId).toBe(8n)
    expect(kinds(result.events)).not.toContain('resend')
    expect(kinds(result.events)).not.toContain('reset')
    // It says nothing about the clock, so correcting from it would move a clock
    // that was right.
    expect(connection.session.timeOffset).toBe(before)
  })

  // One case per code rather than one loop: each drives a full exchange, and
  // eight of them in a single case exceeds the default timeout and hides which
  // code failed.
  for (const code of [18, 19, 32, 33, 34, 35, 48, 64]) {
    it(`replaces the session for code ${code}, which a resend cannot repair`, () => {
      // Sequence numbers, low bits and containers all describe a disagreement
      // about the connection, which resending one message under repeats.
      const { result, session } = notify(code)

      expect(kinds(result.events)).toEqual(['reset'])
      expect(only(result.events, 'reset').reason).toContain(String(code))
      expect(session.contentSent).toBe(0)
    })
  }
})

describe('a session the server started', () => {
  const announcement = (uniqueId: bigint, salt = 0x7777_7777_7777_7777n): TlValue => ({
    _: 'new_session_created',
    first_msg_id: 0x5555_5555_5555_5554n,
    unique_id: uniqueId,
    server_salt: salt,
  })

  it('adopts the salt and names the first message that ran', () => {
    const { peer, dispatcher, session } = connected()

    const result = dispatcher.receive(peer.seal(announcement(1n)))
    const event = only(result.events, 'new-session')

    expect(event.firstMsgId).toBe(0x5555_5555_5555_5554n)
    expect(session.salt).toBe(0x7777_7777_7777_7777n)
  })

  it('reports no gap for the first one on a connection', () => {
    // A connection that has just opened fetches state anyway.
    const { peer, dispatcher } = connected()

    expect(only(dispatcher.receive(peer.seal(announcement(1n))).events, 'new-session').gap).toBe(
      false,
    )
  })

  it('reports a gap when the session is replaced mid-connection', () => {
    const { peer, dispatcher, session } = connected()
    dispatcher.receive(peer.seal(announcement(1n)))

    const result = dispatcher.receive(
      peer.seal(announcement(2n, 0x8888n), { msgId: nowMsgId(session, 21) }),
    )

    expect(only(result.events, 'new-session').gap).toBe(true)
    expect(session.salt).toBe(0x8888n)
  })

  it('ignores the same announcement repeated', () => {
    // The announcement reaches every connection sharing the session. Acting on
    // it twice would report a gap that did not happen.
    const { peer, dispatcher, session } = connected()
    dispatcher.receive(peer.seal(announcement(1n)))

    const result = dispatcher.receive(
      peer.seal(announcement(1n, 0x9999n), { msgId: nowMsgId(session, 25) }),
    )

    expect(kinds(result.events)).toEqual([])
    expect(session.salt).toBe(0x7777_7777_7777_7777n)
  })
})

describe('a container', () => {
  it('is unpacked into the messages it carries', () => {
    const { peer, dispatcher, session } = connected()

    const result = dispatcher.receive(
      peer.sealContainer([
        { value: { _: 'destroy_session_ok', session_id: 4n }, msgId: nowMsgId(session, 5) },
        { value: { _: 'msgs_ack', msg_ids: [8n] }, msgId: nowMsgId(session, 9) },
      ]),
    )

    expect(kinds(result.events)).toEqual(['message', 'acknowledged'])
  })

  it('gives each element the identifier it carries, not the envelope one', () => {
    // An acknowledgement names an element, never the container that delivered
    // it, so the elements' own identifiers are what leave this layer.
    const { peer, dispatcher, session } = connected()
    const first = nowMsgId(session, 5)
    const second = nowMsgId(session, 9)

    const result = dispatcher.receive(
      peer.sealContainer([
        { value: { _: 'destroy_session_ok', session_id: 4n }, msgId: first },
        { value: { _: 'destroy_session_ok', session_id: 8n }, msgId: second },
      ]),
    )

    expect(result.acks).toEqual([first, second])
  })

  it('refuses only the element that repeats, not the container', () => {
    const { peer, dispatcher, session } = connected()
    const repeated = nowMsgId(session, 5)
    dispatcher.receive(peer.seal({ _: 'destroy_session_ok', session_id: 4n }, { msgId: repeated }))

    const result = dispatcher.receive(
      peer.sealContainer([
        { value: { _: 'destroy_session_ok', session_id: 4n }, msgId: repeated },
        { value: { _: 'destroy_session_ok', session_id: 8n }, msgId: nowMsgId(session, 9) },
      ]),
    )

    expect(kinds(result.events)).toEqual(['dropped', 'message'])
    expect(result.acks).toHaveLength(1)
  })
})

describe('a compressed payload', () => {
  it('is decompressed and processed as though it arrived whole', () => {
    const { peer, dispatcher, session } = connected()
    const msgId = nowMsgId(session, 5)

    const result = dispatcher.receive(
      peer.sealCompressed({ _: 'destroy_session_ok', session_id: 0x1234n }, { msgId }),
    )

    const event = only(result.events, 'message')
    expect(event.message.value._).toBe('destroy_session_ok')
    expect(event.message.value['session_id']).toBe(0x1234n)
    expect(event.message.msgId).toBe(msgId)
  })
})

describe('a message that must not be acted on', () => {
  it('is refused when it repeats', () => {
    const { peer, dispatcher, session } = connected()
    const msgId = nowMsgId(session, 5)
    const message = peer.seal({ _: 'destroy_session_ok', session_id: 4n }, { msgId })

    expect(kinds(dispatcher.receive(message).events)).toEqual(['message'])

    const again = dispatcher.receive(message)
    expect(kinds(again.events)).toEqual(['dropped'])
    expect(only(again.events, 'dropped').reason).toBe('duplicate')
    expect(again.acks).toEqual([])
  })

  it('is refused when a container element has client parity', () => {
    // Server identifiers are odd. The envelope's own identifier is checked by
    // the envelope, but a container element carries its own and bypasses that
    // check entirely — which is the only way an even one can reach this layer.
    const { peer, dispatcher, session } = connected()

    const result = dispatcher.receive(
      peer.sealContainer([
        { value: { _: 'destroy_session_ok', session_id: 4n }, msgId: nowMsgId(session, 4) },
        { value: { _: 'destroy_session_ok', session_id: 8n }, msgId: nowMsgId(session, 5) },
      ]),
    )

    expect(kinds(result.events)).toEqual(['dropped', 'message'])
    expect(only(result.events, 'dropped').reason).toBe('wrong-parity')
  })

  it('is refused by the envelope when the envelope itself has client parity', () => {
    const { peer, dispatcher, session } = connected()

    expect(() =>
      dispatcher.receive(
        peer.seal({ _: 'destroy_session_ok', session_id: 4n }, { msgId: nowMsgId(session, 4) }),
      ),
    ).toThrow(/wrong parity for a server message/)
  })

  it('is refused when it is dated too far ahead', () => {
    const { peer, dispatcher, session } = connected()

    const result = dispatcher.receive(
      peer.seal(
        { _: 'pong', msg_id: 4n, ping_id: 1n },
        { msgId: (BigInt(session.serverNow() + 31) << 32n) | 1n },
      ),
    )

    expect(only(result.events, 'dropped').reason).toBe('outside-window')
  })

  it('is refused when it is dated too far behind', () => {
    const { peer, dispatcher, session } = connected()

    const result = dispatcher.receive(
      peer.seal(
        { _: 'pong', msg_id: 4n, ping_id: 1n },
        { msgId: (BigInt(session.serverNow() - 301) << 32n) | 1n },
      ),
    )

    expect(only(result.events, 'dropped').reason).toBe('outside-window')
  })

  it('is accepted at both edges of the window', () => {
    const { peer, dispatcher, session } = connected()

    for (const shift of [30, -300]) {
      const result = dispatcher.receive(
        peer.seal(
          { _: 'destroy_session_ok', session_id: 4n },
          { msgId: (BigInt(session.serverNow() + shift) << 32n) | 1n },
        ),
      )

      expect(kinds(result.events), `${shift}s`).toEqual(['message'])
    }
  })

  it('is refused, not raised, when it names a session the client replaced', () => {
    // Replacing the session leaves whatever was in flight addressed to the old
    // one. A caller that had to catch an exception per stale message would be
    // catching the normal case.
    const { peer, dispatcher, session } = connected()
    const stale = peer.seal({ _: 'pong', msg_id: 4n, ping_id: 1n }, { msgId: nowMsgId(session, 5) })

    dispatcher.receive(
      peer.seal(
        { _: 'bad_msg_notification', bad_msg_id: 8n, bad_msg_seqno: 1, error_code: 34 },
        { msgId: nowMsgId(session, 7) },
      ),
    )

    const result = dispatcher.receive(stale)
    expect(only(result.events, 'dropped').reason).toBe('other-session')
    expect(result.acks).toEqual([])
  })

  it('does not replace the session twice for one repeated notification', () => {
    // The notification is never acknowledged, so the server may send it again.
    // The repeat names the session it was addressed to, which no longer exists.
    const { peer, dispatcher, session } = connected()
    const notification = peer.seal(
      { _: 'bad_msg_notification', bad_msg_id: 8n, bad_msg_seqno: 1, error_code: 34 },
      { msgId: nowMsgId(session, 7) },
    )

    dispatcher.receive(notification)
    const replaced = session.id

    const again = dispatcher.receive(notification)
    expect(only(again.events, 'dropped').reason).toBe('other-session')
    expect(session.id).toBe(replaced)
  })

  it('does not accumulate an offset when a correction repeats', () => {
    // The correction is absolute, not additive: the same notification applied
    // twice must leave the clock where one application put it.
    const { peer, dispatcher, session } = connected()
    const msgId = (BigInt(session.serverNow() + 25) << 32n) | 7n

    dispatcher.receive(
      peer.seal(
        { _: 'bad_msg_notification', bad_msg_id: 8n, bad_msg_seqno: 1, error_code: 16 },
        { msgId },
      ),
    )
    const once = session.timeOffset

    dispatcher.receive(
      peer.seal(
        { _: 'bad_msg_notification', bad_msg_id: 8n, bad_msg_seqno: 1, error_code: 16 },
        { msgId: (BigInt(session.serverNow()) << 32n) | 9n },
      ),
    )

    expect(session.timeOffset).toBe(once)
  })

  it('leaves the clock alone when the notification is itself refused', () => {
    // The rules that reject a message run before the rules that act on it, and
    // the clock is the one piece of state a refused notification could move.
    const { peer, dispatcher, session } = connected()
    const before = session.timeOffset

    dispatcher.receive(
      peer.seal(
        { _: 'bad_msg_notification', bad_msg_id: 8n, bad_msg_seqno: 1, error_code: 16 },
        { msgId: (BigInt(session.serverNow() - 400) << 32n) | 7n },
      ),
    )

    expect(session.timeOffset).toBe(before)
  })

  it('changes nothing about the session when it is refused', () => {
    // A refused message must not adopt a salt, correct a clock, or reset
    // anything: the rules that reject it run before the rules that act on it.
    const { peer, dispatcher, session } = connected()
    const salt = session.salt
    const id = session.id

    // Dated outside the window, so the rules that reject it run before the
    // rules that would have adopted the salt it names.
    dispatcher.receive(
      peer.seal(
        {
          _: 'bad_server_salt',
          bad_msg_id: 4n,
          bad_msg_seqno: 1,
          error_code: 48,
          new_server_salt: 0xdeadn,
        },
        { msgId: (BigInt(session.serverNow() - 400) << 32n) | 1n },
      ),
    )

    expect(session.salt).toBe(salt)
    expect(session.id).toBe(id)
  })
})
