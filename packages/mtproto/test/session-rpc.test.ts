// SPDX-License-Identifier: MIT

/**
 * A call, and the answer to it.
 *
 * This is the first layer that can be wrong in a way a caller notices directly:
 * an answer routed to the wrong promise, a promise that never settles, a
 * failure raised as a success. So the peer here is driven by hand rather than
 * answering on its own — a test decides what the server says, in what order, and
 * whether it says it twice — and it verifies what the client sent by reading the
 * bytes rather than by re-encoding them.
 */

import { CancelledError, FloodError, NetworkError, TelegramError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { Handshake } from '../src/auth/handshake.js'
import { serverRsaKey } from '../src/auth/keys.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { TL_LAYER } from '../src/generated/schema-info.js'
import { Connection } from '../src/session/connection.js'
import type { SessionEvent } from '../src/session/dispatcher.js'
import { TlScope, type TlValue, writeObject } from '../src/tl/index.js'
import { FrameBuffer, IntermediateFraming } from '../src/transport/framing.js'
import { createServerKey } from './server/keys.js'
import { DH_PRIME, MockServer } from './server/server.js'

const SCOPE = new TlScope('rpc', [CORE, MTPROTO, API])
const SERVER_KEY = createServerKey()

const START = 1_700_000_000_000

/** `invokeWithLayer#da9b0d0d` and `initConnection#c1cd5ea9`. */
const INVOKE_WITH_LAYER = 0xda9b_0d0d
const INIT_CONNECTION = 0xc1cd_5ea9
/** `help.getNearestDc#1fb33026`, a method with no arguments. */
const GET_NEAREST_DC = 0x1fb3_3026
/** Identifiers one acknowledgement may name. */
const MAX_ACK_IDS = 8192

const CLIENT = {
  apiId: 12345,
  deviceModel: 'Yuigram',
  systemVersion: '1.0',
  appVersion: '0.1.0',
  systemLangCode: 'en',
  langPack: '',
  langCode: 'en',
}

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

/** A query the peer never has to understand, since tests answer by hand. */
function query(): TlValue {
  return { _: 'help.getNearestDc' }
}

/** A connection whose peer is driven explicitly. */
function connected(schedule = {}, seed = 11) {
  let clock = START

  const framing = new IntermediateFraming()
  const peer = new MockServer({ key: SERVER_KEY, scope: SCOPE, now: () => clock })
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

  /** Every sealed message the connection produced, oldest first. */
  const sent: Uint8Array[] = []
  const events: SessionEvent[] = []

  const connection = new Connection({
    key: result.authKey,
    scope: SCOPE,
    salt: result.serverSalt,
    client: CLIENT,
    timeOffset: result.timeOffset,
    now: () => clock,
    random: scripted(seed + 50),
    schedule: { pingInterval: 5000, saltInterval: 9000, stateInterval: 7000, ...schedule },
    send: (bytes) => sent.push(bytes),
    onEvent: (event) => events.push(event),
  })

  connection.start()
  peer.expectSession(connection.sessionId)

  /**
   * Run the schedule, then hand whatever went out to the peer.
   *
   * Acknowledgements are filtered out: they travel ahead of the work they
   * accompany, and every case here is about the work.
   */
  const flush = () => {
    connection.tick()

    const out = sent.splice(0)
    const elements = out.flatMap((bytes) => [...peer.openClient(bytes)])

    return elements.filter((element) => element.value._ !== 'msgs_ack')
  }

  /** Everything that went out, acknowledgements included. */
  const flushAll = () => {
    connection.tick()

    const out = sent.splice(0)
    return out.flatMap((bytes) => [...peer.openClient(bytes)])
  }

  return {
    peer,
    connection,
    events,
    sent,
    flush,
    flushAll,
    at: (moment: number) => {
      clock = moment
    },
    advance: (by: number) => {
      clock += by
    },
    now: () => clock,
  }
}

/** The constructor identifier a body begins with. */
function constructorOf(body: Uint8Array, at = 0): number {
  return new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(at, true)
}

/** Let promise callbacks run. */
const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('the first call on a connection', () => {
  it('announces the layer and describes the client, read from the wire', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())

    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    // Read as bytes rather than decoded: the wrapping is the thing under test,
    // and decoding it with the same tables that wrote it would prove less.
    expect(constructorOf(element.body, 0)).toBe(INVOKE_WITH_LAYER)
    expect(new DataView(element.body.buffer, element.body.byteOffset).getInt32(4, true)).toBe(
      TL_LAYER,
    )
    expect(constructorOf(element.body, 8)).toBe(INIT_CONNECTION)

    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await expect(answer).resolves.toEqual({ _: 'boolTrue' })
  })

  it('carries the query itself inside the wrapper', () => {
    const live = connected()
    void live.connection.invoke(query()).catch(() => {})

    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    expect(element.value._).toBe('invokeWithLayer')
    const inner = element.value['query'] as TlValue
    expect(inner._).toBe('initConnection')
    expect(inner['api_id']).toBe(CLIENT.apiId)
    expect((inner['query'] as TlValue)._).toBe('help.getNearestDc')
  })

  it('sends the next call bare, once one has been answered', async () => {
    const live = connected()
    const first = live.connection.invoke(query())
    const [opening] = live.flush()
    if (opening === undefined) throw new Error('nothing was sent')

    live.connection.receive(live.peer.rpcResult(opening.msgId, { _: 'boolTrue' }))
    await first

    const second = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    expect(constructorOf(element.body)).toBe(GET_NEAREST_DC)
    expect(element.body).toHaveLength(4)

    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await second
  })

  it('keeps announcing itself until a call has actually succeeded', async () => {
    const live = connected()
    const first = live.connection.invoke(query())
    const [opening] = live.flush()
    if (opening === undefined) throw new Error('nothing was sent')

    live.connection.receive(live.peer.rpcError(opening.msgId, 400, 'BAD_REQUEST'))
    await expect(first).rejects.toBeInstanceOf(TelegramError)

    // A refused call proves nothing about whether the server recorded what this
    // client is, so the next one says it again.
    const second = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    expect(constructorOf(element.body)).toBe(INVOKE_WITH_LAYER)
    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await second
  })

  it('announces itself again after a temporary key is bound', async () => {
    const live = connected()
    const first = live.connection.invoke(query())
    const [opening] = live.flush()
    if (opening === undefined) throw new Error('nothing was sent')
    live.connection.receive(live.peer.rpcResult(opening.msgId, { _: 'boolTrue' }))
    await first
    expect(live.connection.initialised).toBe(true)

    const bind = live.connection.invoke({
      _: 'auth.bindTempAuthKey',
      perm_auth_key_id: 1n,
      nonce: 2n,
      expires_at: 3,
      encrypted_message: new Uint8Array(8),
    })
    const [binding] = live.flush()
    if (binding === undefined) throw new Error('nothing was sent')
    live.connection.receive(live.peer.rpcResult(binding.msgId, { _: 'boolTrue' }))
    await bind

    // The server keeps what a client told it about itself against the
    // connection, and binding discards it.
    expect(live.connection.initialised).toBe(false)

    const after = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')
    expect(constructorOf(element.body)).toBe(INVOKE_WITH_LAYER)

    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await after
  })
})

describe('answers finding their callers', () => {
  it('settles concurrent calls with the right results', async () => {
    const live = connected()
    const first = live.connection.invoke(query())
    const second = live.connection.invoke(query())
    const third = live.connection.invoke(query())

    const elements = live.flush()
    expect(elements).toHaveLength(3)

    // Answered out of order, which the protocol permits: the server processes
    // parallel requests in whatever order it likes.
    live.connection.receive(live.peer.rpcResult(elements[2]?.msgId ?? 0n, { _: 'boolFalse' }))
    live.connection.receive(live.peer.rpcResult(elements[0]?.msgId ?? 0n, { _: 'boolTrue' }))
    live.connection.receive(live.peer.rpcResult(elements[1]?.msgId ?? 0n, { _: 'boolFalse' }))

    await expect(first).resolves.toEqual({ _: 'boolTrue' })
    await expect(second).resolves.toEqual({ _: 'boolFalse' })
    await expect(third).resolves.toEqual({ _: 'boolFalse' })
  })

  it('travels as one container when several calls are made together', () => {
    const live = connected()
    void live.connection.invoke(query()).catch(() => {})
    void live.connection.invoke(query()).catch(() => {})

    live.connection.tick()

    // One sealed message carrying two, not two messages.
    expect(live.sent).toHaveLength(1)
  })

  it('raises the failure the server named', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    const [element] = live.flush()

    live.connection.receive(live.peer.rpcError(element?.msgId ?? 0n, 400, 'CHANNEL_PRIVATE'))

    await expect(answer).rejects.toThrow(/CHANNEL_PRIVATE/)
    await expect(answer).rejects.toBeInstanceOf(TelegramError)
  })

  it('raises a wait as the type both transports share', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    const [element] = live.flush()

    live.connection.receive(live.peer.rpcError(element?.msgId ?? 0n, 420, 'FLOOD_WAIT_42'))

    await expect(answer).rejects.toBeInstanceOf(FloodError)
    await answer.catch((error: unknown) => {
      expect((error as FloodError).retryAfter).toBe(42)
      expect((error as FloodError).method).toBe('help.getNearestDc')
    })
  })

  it('settles a call once, however many times its answer arrives', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    const reply = live.peer.rpcResult(element.msgId, { _: 'boolTrue' })
    live.connection.receive(reply)
    // The same bytes again: a duplicate is refused by identifier before it ever
    // reaches the call it would have settled twice.
    live.connection.receive(reply)

    await expect(answer).resolves.toEqual({ _: 'boolTrue' })
    expect(live.connection.pending).toBe(0)
  })

  it('reports an answer no call is waiting for rather than raising', () => {
    const live = connected()

    live.connection.receive(live.peer.rpcResult(0x7fff_0000_0000_0004n, { _: 'boolTrue' }))

    expect(live.events.map((event) => event.kind)).toContain('message')
  })

  it('passes on a message it has no rule for', () => {
    const live = connected()

    live.connection.receive(live.peer.seal({ _: 'destroy_session_ok', session_id: 4n }))

    const forwarded = live.events.filter((event) => event.kind === 'message')
    expect(forwarded).toHaveLength(1)
  })
})

describe('calls that do not get an answer', () => {
  it('gives up at the deadline', async () => {
    const live = connected()
    const answer = live.connection.invoke(query(), { timeout: 1000 })
    live.flush()

    live.at(START + 1000)
    live.connection.tick()

    await expect(answer).rejects.toBeInstanceOf(NetworkError)
    expect(live.connection.pending).toBe(0)
  })

  it('does not give up a millisecond early', async () => {
    const live = connected()
    const answer = live.connection.invoke(query(), { timeout: 1000 })
    live.flush()

    live.at(START + 999)
    live.connection.tick()
    await settle()

    expect(live.connection.pending).toBe(1)
    live.at(START + 1000)
    live.connection.tick()
    await expect(answer).rejects.toBeInstanceOf(NetworkError)
  })

  it('is refused when the connection stops', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    live.flush()

    live.connection.stop()

    await expect(answer).rejects.toBeInstanceOf(CancelledError)
    expect(live.connection.pending).toBe(0)
    expect(live.connection.running).toBe(false)
  })

  it('is not resurrected by an answer arriving after the connection stopped', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    live.connection.stop()
    await expect(answer).rejects.toBeInstanceOf(CancelledError)

    // A late answer has nobody to settle, and settling twice would be worse
    // than settling nothing.
    expect(() =>
      live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' })),
    ).not.toThrow()
  })

  it('re-arms for the next deadline after taking the first', async () => {
    const live = connected()
    const first = live.connection.invoke(query(), { timeout: 500 })
    const second = live.connection.invoke(query(), { timeout: 1500 })
    live.flush()

    live.at(START + 500)
    live.connection.tick()
    await expect(first).rejects.toBeInstanceOf(NetworkError)

    // One wake covers every outstanding call, so the pass that took the first
    // deadline has to arm for whatever is then earliest.
    expect(live.connection.pending).toBe(1)
    live.at(START + 1500)
    live.connection.tick()
    await expect(second).rejects.toBeInstanceOf(NetworkError)
  })

  it('is dropped rather than sent when it expires while waiting for the batch', async () => {
    const live = connected()
    const answer = live.connection.invoke(query(), { timeout: 500 })

    live.at(START + 500)
    live.connection.tick()

    await expect(answer).rejects.toBeInstanceOf(NetworkError)
    // Nobody is waiting for the result, so nothing goes out.
    expect(live.sent).toHaveLength(0)
  })
})

describe('messages the connection refuses', () => {
  it('raises when a message is sealed under a key this connection does not hold', () => {
    const live = connected()
    const other = connected({}, 31)

    expect(() =>
      live.connection.receive(other.peer.rpcResult(0x7fff_0000_0000_0004n, { _: 'boolTrue' })),
    ).toThrow()
  })

  it('raises when the message key does not match the content', () => {
    const live = connected()
    const sealed = Uint8Array.from(live.peer.rpcResult(0x7fff_0000_0000_0004n, { _: 'boolTrue' }))
    sealed[10] = (sealed[10] ?? 0) ^ 0x01

    expect(() => live.connection.receive(sealed)).toThrow()
  })

  it('raises when the body was tampered with', () => {
    const live = connected()
    const sealed = Uint8Array.from(live.peer.rpcResult(0x7fff_0000_0000_0004n, { _: 'boolTrue' }))
    const at = sealed.length - 1
    sealed[at] = (sealed[at] ?? 0) ^ 0xff

    expect(() => live.connection.receive(sealed)).toThrow()
  })

  it('raises on a packet too short to be a message', () => {
    const live = connected()

    expect(() => live.connection.receive(new Uint8Array(16))).toThrow()
  })

  it('drops a message addressed to another session without raising', () => {
    const live = connected()

    // Sealed under the right key, but naming a session this connection is not.
    // Replacing a session leaves whatever was already in flight addressed to
    // the old one, so this is an ordinary consequence rather than a failure.
    live.peer.expectSession(live.connection.sessionId ^ 1n)
    const stale = live.peer.seal({ _: 'destroy_session_ok', session_id: 1n })
    live.peer.expectSession(live.connection.sessionId)

    live.connection.receive(stale)

    const dropped = live.events.filter((event) => event.kind === 'dropped')
    expect(dropped).toHaveLength(1)
    expect(dropped[0]).toMatchObject({ reason: 'other-session' })
    expect(live.events.some((event) => event.kind === 'message')).toBe(false)
  })
})

describe('a salt the server replaces mid-batch', () => {
  it('sends every call in the refused container again', async () => {
    const live = connected()
    const answers = [
      live.connection.invoke(query()),
      live.connection.invoke(query()),
      live.connection.invoke(query()),
    ]
    for (const answer of answers) answer.catch(() => {})

    live.connection.tick()
    const sealed = live.sent.splice(0)
    const elements = sealed.flatMap((bytes) => [...live.peer.openClient(bytes)])
    expect(elements).toHaveLength(3)

    // The salt travels on the envelope, so the identifier the server refuses is
    // the container's — one no call was ever registered under.
    const container = live.peer.lastEnvelope()
    expect(elements.some((element) => element.msgId === container)).toBe(false)

    live.connection.receive(
      live.peer.seal({
        _: 'bad_server_salt',
        bad_msg_id: container,
        bad_msg_seqno: 0,
        error_code: 48,
        new_server_salt: 0x0bad_5a17_0bad_5a17n,
      }),
    )

    live.advance(1)
    const again = live.flush()
    expect(again).toHaveLength(3)

    for (const element of again) {
      live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    }

    await expect(Promise.all(answers)).resolves.toHaveLength(3)
  })
})

describe('a container refused more than once', () => {
  it('resends only what it carried, and stops at the attempt bound', async () => {
    const live = connected()
    const inside = [live.connection.invoke(query()), live.connection.invoke(query())]
    for (const answer of inside) answer.catch(() => {})

    live.connection.tick()
    let elements = live.sent.splice(0).flatMap((bytes) => [...live.peer.openClient(bytes)])
    expect(elements).toHaveLength(2)
    let container = live.peer.lastEnvelope()

    // A call made after the batch went out belongs to no container and must not
    // be dragged into a resend of one.
    live.advance(1)
    const outside = live.connection.invoke(query())
    outside.catch(() => {})
    live.connection.tick()
    const alone = live.sent.splice(0).flatMap((bytes) => [...live.peer.openClient(bytes)])
    expect(alone).toHaveLength(1)

    const refuse = (msgId: bigint, salt: bigint) => {
      live.connection.receive(
        live.peer.seal({
          _: 'bad_server_salt',
          bad_msg_id: msgId,
          bad_msg_seqno: 0,
          error_code: 48,
          new_server_salt: salt,
        }),
      )
      live.advance(1)
      live.connection.tick()
      return live.sent.splice(0).flatMap((bytes) => [...live.peer.openClient(bytes)])
    }

    // Four more attempts, each under a fresh container. The count follows the
    // succession of messages carrying each call, so the bound still binds.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      elements = refuse(container, BigInt(attempt + 1) * 0x0101n)
      expect(elements).toHaveLength(2)

      // The call that was never in the container is untouched throughout.
      expect(elements.some((element) => element.msgId === alone[0]?.msgId)).toBe(false)
      container = live.peer.lastEnvelope()
    }

    // Five attempts is the bound: the sixth refusal produces nothing.
    expect(refuse(container, 0x0999n)).toEqual([])

    // The call outside the container is still live and still answerable.
    live.connection.receive(live.peer.rpcResult(alone[0]?.msgId ?? 0n, { _: 'boolTrue' }))
    await expect(outside).resolves.toEqual({ _: 'boolTrue' })
  })

  it('forgets a container once everything it carried has settled', async () => {
    const live = connected()
    const answers = [live.connection.invoke(query()), live.connection.invoke(query())]

    live.connection.tick()
    const elements = live.sent.splice(0).flatMap((bytes) => [...live.peer.openClient(bytes)])
    const container = live.peer.lastEnvelope()

    for (const element of elements) {
      live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    }
    await Promise.all(answers)

    // A refusal naming a container whose calls have all been answered has
    // nothing to resend, and the mapping that would have found them is gone.
    live.connection.receive(
      live.peer.seal({
        _: 'bad_server_salt',
        bad_msg_id: container,
        bad_msg_seqno: 0,
        error_code: 48,
        new_server_salt: 0x0bad_5a17n,
      }),
    )

    live.advance(1)
    expect(live.flush()).toEqual([])
    expect(live.connection.pending).toBe(0)
  })
})

describe('a salt the server replaces', () => {
  it('sends the refused call again under a new identifier', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    const [first] = live.flush()
    if (first === undefined) throw new Error('nothing was sent')

    live.connection.receive(
      live.peer.seal({
        _: 'bad_server_salt',
        bad_msg_id: first.msgId,
        bad_msg_seqno: 1,
        error_code: 48,
        new_server_salt: 0x0bad_5a17_0bad_5a17n,
      }),
    )

    live.advance(1)
    const [second] = live.flush()
    if (second === undefined) throw new Error('the refused call was not sent again')

    // A new message carrying the same query: an identifier is used once.
    expect(second.msgId).not.toBe(first.msgId)
    expect(second.body).toEqual(first.body)

    live.connection.receive(live.peer.rpcResult(second.msgId, { _: 'boolTrue' }))
    await expect(answer).resolves.toEqual({ _: 'boolTrue' })
  })
})

describe('a message whose outcome the server cannot state', () => {
  it('fails the call rather than running it a second time', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    // Code 20: the protocol says it cannot be verified whether the server
    // received this message. Sending it again would run it twice if it did.
    live.connection.receive(
      live.peer.seal({
        _: 'bad_msg_notification',
        bad_msg_id: element.msgId,
        bad_msg_seqno: 1,
        error_code: 20,
      }),
    )

    await expect(answer).rejects.toBeInstanceOf(NetworkError)

    live.advance(1)
    expect(live.flush()).toEqual([])
    expect(live.connection.pending).toBe(0)
  })

  it('releases what it gave up on, so the connection keeps working', async () => {
    const live = connected()

    // Every call given up on has to release its place, or the bound meant to
    // catch runaway concurrency becomes a limit on how many calls a connection
    // may ever make.
    for (let call = 0; call < 2200; call += 1) {
      live.advance(1)
      const answer = live.connection.invoke(query())
      const [element] = live.flush()
      if (element === undefined) throw new Error(`call ${call} was not sent`)

      live.connection.receive(
        live.peer.seal({
          _: 'bad_msg_notification',
          bad_msg_id: element.msgId,
          bad_msg_seqno: 1,
          error_code: 20,
        }),
      )
      await expect(answer).rejects.toBeInstanceOf(NetworkError)
    }

    expect(live.connection.pending).toBe(0)
  }, 60_000)

  it('still sends again when the server said it refused the message', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    void answer.catch(() => {})
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    // Code 16 is the server stating it did not accept the message, so the
    // remedy the protocol names is to send it again.
    live.connection.receive(
      live.peer.seal({
        _: 'bad_msg_notification',
        bad_msg_id: element.msgId,
        bad_msg_seqno: 1,
        error_code: 16,
      }),
    )

    live.advance(1)
    expect(live.flush()).toHaveLength(1)
  })
})

describe('a message the server keeps refusing', () => {
  it('carries its attempt count across every change of identifier', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    void answer.catch(() => {})

    let current = live.flush()[0]
    if (current === undefined) throw new Error('nothing was sent')

    const identifiers = [current.msgId]
    // Refused four more times. An identifier is used once, so each refusal
    // produces a new message — and the count that eventually stops it has to
    // follow the succession rather than any one identifier.
    for (let refusal = 0; refusal < 4; refusal += 1) {
      live.connection.receive(
        live.peer.seal({
          _: 'bad_server_salt',
          bad_msg_id: current.msgId,
          bad_msg_seqno: 1,
          error_code: 48,
          new_server_salt: BigInt(refusal + 1) * 0x0101_0101n,
        }),
      )

      live.advance(1)
      const next = live.flush()[0]
      if (next === undefined) throw new Error(`refusal ${refusal} produced no resend`)

      identifiers.push(next.msgId)
      current = next
    }

    expect(new Set(identifiers).size).toBe(identifiers.length)

    // Five attempts is the bound. The sixth refusal produces nothing.
    live.connection.receive(
      live.peer.seal({
        _: 'bad_server_salt',
        bad_msg_id: current.msgId,
        bad_msg_seqno: 1,
        error_code: 48,
        new_server_salt: 0x0999_0999n,
      }),
    )

    live.advance(1)
    expect(live.flush()).toEqual([])
  })

  it('is not sent again once the server has answered it', async () => {
    const live = connected()
    const answer = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await answer

    // An answer is an acknowledgement, so a refusal naming the same message
    // afterwards describes something already settled.
    live.connection.receive(
      live.peer.seal({
        _: 'bad_server_salt',
        bad_msg_id: element.msgId,
        bad_msg_seqno: 1,
        error_code: 48,
        new_server_salt: 0x0bad_5a17n,
      }),
    )

    live.advance(1)
    expect(live.flush()).toEqual([])
  })
})

describe('what a long-lived connection accumulates', () => {
  it('keeps making calls long past the number it may have outstanding at once', async () => {
    const live = connected()

    // The records refuse to grow past a bound rather than evicting, because
    // every entry is there because this end put it there. A settled call has to
    // release its place, or the bound becomes a limit on how many calls a
    // connection may ever make.
    for (let call = 0; call < 2200; call += 1) {
      live.advance(1)
      const answer = live.connection.invoke(query())
      const [element] = live.flush()
      if (element === undefined) throw new Error(`call ${call} was not sent`)

      live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
      await expect(answer).resolves.toEqual({ _: 'boolTrue' })
    }

    expect(live.connection.pending).toBe(0)
  })

  it('releases a call that was given up on as well as one that was answered', async () => {
    const live = connected()

    for (let call = 0; call < 2200; call += 1) {
      const answer = live.connection.invoke(query(), { timeout: 10 })
      live.flush()
      live.advance(10)
      live.connection.tick()
      await expect(answer).rejects.toBeInstanceOf(NetworkError)
    }

    expect(live.connection.pending).toBe(0)
  })
})

describe('a connection kept alive for a long time', () => {
  it('still works after more liveness exchanges than it may track messages', async () => {
    const live = connected()

    // A ping is answered by a pong rather than acknowledged, so it is released
    // on a different path from a call. Left tracked, the record fills with
    // completed exchanges and the connection stops being able to send.
    for (let round = 1; round <= 2100; round += 1) {
      live.at(START + round * 5000)
      const ping = live.flush().find((element) => element.value._ === 'ping')
      if (ping === undefined) throw new Error(`round ${round} sent no ping`)

      live.connection.receive(
        live.peer.seal({ _: 'pong', msg_id: ping.msgId, ping_id: ping.value['ping_id'] }),
      )
    }

    live.advance(1)
    const answer = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('the connection could no longer send')

    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await expect(answer).resolves.toEqual({ _: 'boolTrue' })
  })

  it('can still take on salts after many have come and gone', () => {
    const live = connected()
    // Each answer is valid when it arrives and closed by the next round, which
    // is what a reserve looks like on a connection that outlives many
    // rotations. Without reclaiming, the reserve saturates with windows that
    // can never be selected and every later answer is turned away.
    const offer = (asked: bigint, salts: readonly [number, number, bigint][]) => {
      const second = Math.floor(live.now() / 1000)
      live.connection.receive(
        live.peer.seal({
          _: 'future_salts',
          req_msg_id: asked,
          now: second,
          salts: salts.map(([since, until, salt]) => ({
            _: 'future_salt',
            valid_since: second + since,
            valid_until: second + until,
            salt,
          })),
        }),
      )
    }

    let round = 0
    for (; round < 70; round += 1) {
      live.at(START + (round + 1) * 9000)
      const asked = live.flush().find((element) => element.value._ === 'get_future_salts')
      if (asked === undefined) throw new Error(`round ${round} asked for no salts`)

      offer(asked.msgId, [[-1, 3, BigInt(round + 1)]])
    }

    live.at(START + (round + 1) * 9000)
    const asked = live.flush().find((element) => element.value._ === 'get_future_salts')
    if (asked === undefined) throw new Error('expected one more request')

    // A reserve deep enough to last. It can only be taken on if the closed
    // windows have made room for it.
    offer(asked.msgId, [
      [-1, 100_000, 0x900n],
      [-1, 200_000, 0x901n],
    ])

    live.at(START + (round + 2) * 9000)
    expect(live.flush().map((element) => element.value._)).not.toContain('get_future_salts')
  })

  it('still works after many batches that carried no call at all', async () => {
    // Pings and acknowledgements travelling together form a container, and a
    // container carrying no call is never resent and has nothing to release it.
    const live = connected({ pingInterval: 5000, saltInterval: 10_000_000, stateInterval: 7000 })

    for (let round = 1; round <= 2100; round += 1) {
      live.at(START + round * 5000)
      live.connection.receive(
        live.peer.seal({ _: 'destroy_session_ok', session_id: BigInt(round) }),
      )

      const elements = live.flushAll()
      const ping = elements.find((element) => element.value._ === 'ping')
      if (ping === undefined) throw new Error(`round ${round} sent no ping`)

      live.connection.receive(
        live.peer.seal({ _: 'pong', msg_id: ping.msgId, ping_id: ping.value['ping_id'] }),
      )
    }

    live.advance(1)
    const answer = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('the connection could no longer send')

    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await expect(answer).resolves.toEqual({ _: 'boolTrue' })
  })
})

describe('more calls at once than one message can carry', () => {
  it('sends what fits and keeps the rest for the next batch', async () => {
    const live = connected()
    const answers = Array.from({ length: 1100 }, () => live.connection.invoke(query()))
    for (const answer of answers) answer.catch(() => {})

    live.connection.tick()

    // Two sealed messages, because a container carries at most 1024 and the
    // remainder is kept rather than refused.
    const messages = live.sent.splice(0).map((bytes) => live.peer.openClient(bytes))
    expect(messages.map((elements) => elements.length)).toEqual([1024, 76])

    // Nothing was stranded: every call was sent exactly once.
    const identifiers = new Set(messages.flat().map((element) => element.msgId))
    expect(identifiers.size).toBe(1100)
  })

  it('strands nothing when a batch is divided', async () => {
    const live = connected()
    const answers = Array.from({ length: 1100 }, () => live.connection.invoke(query()))

    const elements = [...live.flush()]
    live.advance(1)
    elements.push(...live.flush())

    for (const element of elements) {
      live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    }

    await expect(Promise.all(answers)).resolves.toHaveLength(1100)
    expect(live.connection.pending).toBe(0)
  })
})

describe('more bytes at once than one message can carry', () => {
  /** A call whose encoded body is roughly nineteen kilobytes. */
  const bulky = (): TlValue => ({
    _: 'msgs_state_req',
    msg_ids: Array.from({ length: 2400 }, (_, index) => BigInt(index + 1)),
  })

  it('divides by size as well as by count, and strands nothing', async () => {
    const live = connected()
    const answers = Array.from({ length: 900 }, () => live.connection.invoke(bulky()))

    // Nine hundred of these come to more than one message may hold, though far
    // fewer than one container may carry. A batch bounded only by count would
    // build something that cannot be sealed.
    live.connection.tick()

    const messages = live.sent.splice(0).map((bytes) => live.peer.openClient(bytes))
    expect(messages.length).toBeGreaterThan(1)

    const elements = messages.flat()
    expect(elements).toHaveLength(900)
    expect(new Set(elements.map((element) => element.msgId)).size).toBe(900)

    for (const element of elements) {
      live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    }

    await expect(Promise.all(answers)).resolves.toHaveLength(900)
    expect(live.connection.pending).toBe(0)
  }, 60_000)

  it('refuses a call too large to travel at all, rather than queueing it forever', async () => {
    const live = connected()

    // Larger on its own than one message may be. It is taken as the first entry
    // whatever it measures — a batch that skipped it would queue it again every
    // flush and never send it — so composition fails and the caller is told why
    // instead of waiting out its deadline against a message never sent.
    const answer = live.connection.invoke({
      _: 'msgs_state_req',
      msg_ids: Array.from({ length: 2_100_000 }, (_, index) => BigInt(index + 1)),
    })

    live.connection.tick()

    await expect(answer).rejects.toThrow(/too large to send/)
    expect(live.connection.pending).toBe(0)
    expect(live.sent).toHaveLength(0)
  }, 60_000)

  it('leaves room for the acknowledgement travelling with a full batch', async () => {
    const live = connected()

    // A full acknowledgement is sixty-four kilobytes, which has to be counted
    // before the batch is filled or the message it produces overruns the
    // ceiling and cannot be sealed.
    for (let message = 0; message < MAX_ACK_IDS; message += 1) {
      live.connection.receive(
        live.peer.seal({ _: 'destroy_session_ok', session_id: BigInt(message + 1) }),
      )
    }

    const answers = Array.from({ length: 900 }, () => live.connection.invoke(bulky()))
    live.connection.tick()

    for (const message of live.sent) expect(message.length).toBeLessThanOrEqual(16 * 1024 * 1024)

    const elements = live.sent
      .splice(0)
      .flatMap((bytes) => [...live.peer.openClient(bytes)])
      .filter((element) => element.value._ !== 'msgs_ack')

    for (const element of elements) {
      live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    }

    // Nothing was refused for want of room that should have been reserved.
    await expect(Promise.all(answers)).resolves.toHaveLength(900)
  }, 60_000)

  it('keeps every message it builds within what one may carry', () => {
    const live = connected()
    for (let call = 0; call < 900; call += 1) void live.connection.invoke(bulky()).catch(() => {})

    live.connection.tick()

    // Sealed, so this is the size that actually goes on the wire.
    for (const message of live.sent) expect(message.length).toBeLessThanOrEqual(16 * 1024 * 1024)
  }, 60_000)
})

describe('a connection that is not running', () => {
  it('refuses a call rather than accepting one nothing will send', async () => {
    const live = connected()
    live.connection.stop()

    // Nothing drives a stopped connection, so a call accepted here would wait
    // for a batch that is never composed.
    await expect(live.connection.invoke(query())).rejects.toBeInstanceOf(NetworkError)
    expect(live.sent).toHaveLength(0)
  })

  it('refuses a call made before it has started', async () => {
    const live = connected()
    live.connection.stop()

    await expect(live.connection.invoke(query())).rejects.toThrow(/not running/)
  })

  it('takes calls again once it has been started afresh', async () => {
    const live = connected()
    live.connection.stop()
    await expect(live.connection.invoke(query())).rejects.toBeInstanceOf(NetworkError)

    live.advance(1)
    live.connection.start()
    live.peer.expectSession(live.connection.sessionId)

    const answer = live.connection.invoke(query())
    const [element] = live.flush()
    if (element === undefined) throw new Error('nothing was sent')

    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await expect(answer).resolves.toEqual({ _: 'boolTrue' })
  })
})

describe('what the schedule drives', () => {
  it('proves liveness on its interval and measures the round trip', () => {
    const live = connected()

    live.at(START + 5000)
    const elements = live.flush()

    expect(elements.map((element) => element.value._)).toContain('ping')

    const ping = elements.find((element) => element.value._ === 'ping')
    if (ping === undefined) throw new Error('no ping was sent')

    live.advance(7)
    live.connection.receive(
      live.peer.seal({ _: 'pong', msg_id: ping.msgId, ping_id: ping.value['ping_id'] }),
    )

    expect(live.connection.roundTrip).toBe(7)
  })

  it('fills the salt reserve when it runs low', () => {
    const live = connected()

    live.at(START + 9000)
    const elements = live.flush()

    expect(elements.map((element) => element.value._)).toContain('get_future_salts')
  })

  it('stops asking once the server has answered with enough', () => {
    const live = connected()
    live.at(START + 9000)
    const asked = live.flush().find((element) => element.value._ === 'get_future_salts')
    if (asked === undefined) throw new Error('no salts were asked for')

    const since = live.connection.sessionId === 0n ? 0 : 1_700_000_000
    live.connection.receive(
      live.peer.seal({
        _: 'future_salts',
        req_msg_id: asked.msgId,
        now: since,
        salts: [
          { _: 'future_salt', valid_since: since, valid_until: since + 1800, salt: 0x11n },
          { _: 'future_salt', valid_since: since + 1800, valid_until: since + 3600, salt: 0x22n },
        ],
      }),
    )

    live.at(START + 18_000)
    const again = live.flush()

    expect(again.map((element) => element.value._)).not.toContain('get_future_salts')
  })

  it('acknowledges what the server sent, in the next batch', () => {
    const live = connected()
    live.connection.receive(live.peer.seal({ _: 'destroy_session_ok', session_id: 4n }))

    live.advance(1)
    const elements = live.flushAll()

    expect(elements.map((element) => element.value._)).toContain('msgs_ack')
  })

  it('does nothing at a moment when nothing is owed', () => {
    const live = connected()

    live.advance(1)
    live.connection.tick()

    expect(live.sent).toHaveLength(0)
  })
})

describe('a query that names the identifier it travels under', () => {
  /** A ping whose identifier is the identifier the message is sent under. */
  const selfNaming = (msgId: bigint) => writeObject({ _: 'ping', ping_id: msgId }, SCOPE)

  /** Whatever went out, opened, without running the schedule first. */
  const took = (live: ReturnType<typeof connected>) =>
    live.sent.splice(0).flatMap((bytes) => [...live.peer.openClient(bytes)])

  it('is sent under the identifier its body was built from', async () => {
    const live = connected()
    const answer = live.connection.invokeNaming('ping', selfNaming)

    const [element] = took(live)
    if (element === undefined) throw new Error('nothing was sent')

    // The server compares the two, and a mismatch is refused without saying
    // which half was wrong — so the two agreeing is the whole property.
    expect(element.value).toMatchObject({ _: 'ping', ping_id: element.msgId })

    live.connection.receive(live.peer.rpcResult(element.msgId, { _: 'boolTrue' }))
    await expect(answer).resolves.toMatchObject({ _: 'boolTrue' })
  })

  it('travels on its own, in no container', async () => {
    const live = connected()
    const answer = live.connection.invokeNaming('ping', selfNaming)

    const sent = live.sent.splice(0)
    expect(sent).toHaveLength(1)
    const opened = [...live.peer.openClient(sent[0] ?? new Uint8Array(0))]
    expect(opened).toHaveLength(1)

    void answer.catch(() => undefined)
    live.connection.stop()
  })

  it('is not wrapped, even before the server has been told what this client is', async () => {
    const live = connected()
    expect(live.connection.initialised).toBe(false)

    const answer = live.connection.invokeNaming('ping', selfNaming)
    const [element] = took(live)

    // A key that has not been vouched for yet may carry only a few named
    // methods, and an ordering wrapper is not one of them.
    expect(element?.value._).toBe('ping')

    void answer.catch(() => undefined)
    live.connection.stop()
  })

  it('is never sent again when the server asks for it to be', async () => {
    const live = connected()
    const answer = live.connection.invokeNaming('ping', selfNaming)
    const [element] = took(live)
    if (element === undefined) throw new Error('nothing was sent')

    // A second attempt would travel under a new identifier, which the body it
    // carries would no longer name.
    live.connection.receive(
      live.peer.seal({
        _: 'bad_msg_notification',
        bad_msg_id: element.msgId,
        bad_msg_seqno: 0,
        error_code: 16,
      }),
    )
    live.connection.tick()

    expect(took(live).filter((sent) => sent.value._ === 'ping')).toEqual([])

    void answer.catch(() => undefined)
    live.connection.stop()
  })

  it('is refused on a connection that is not running', async () => {
    const live = connected()
    live.connection.stop()

    await expect(live.connection.invokeNaming('ping', selfNaming)).rejects.toThrow(/is not running/)
  })
})
