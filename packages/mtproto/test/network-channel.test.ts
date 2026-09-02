/**
 * Assembling a usable connection out of the layers below it.
 *
 * The interesting cases are the seams: the moment the key exchange stops and
 * the connection starts, and every way the stream can end on either side of it.
 * A channel that survives its own socket, or that reports an ending twice, or
 * that leaves a timer running after it closed, all look fine until something
 * else fails for a reason that names none of them.
 *
 * The far end is the package's independent peer, driven through a stream a case
 * controls, so a connection refused and a peer that vanishes are facts rather
 * than waits.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { serverRsaKey } from '../src/auth/keys.js'
import { authKeyId } from '../src/crypto/kdf.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import {
  AUTH_KEY_NOT_FOUND,
  type ByteStream,
  openChannel,
  type StreamRequest,
  TransportError,
} from '../src/network/channel.js'
import type { DcAddress } from '../src/network/dc.js'
import { TlScope } from '../src/tl/index.js'
import { FramingError, IntermediateFraming } from '../src/transport/index.js'
import { createServerKey } from './server/keys.js'
import { DH_PRIME, MockServer } from './server/server.js'

const SCOPE = new TlScope('channel', [CORE, MTPROTO, API])
const SERVER_KEY = createServerKey()

const CLIENT = {
  apiId: 12345,
  deviceModel: 'Yuigram',
  systemVersion: '1.0',
  appVersion: '0.1.0',
  systemLangCode: 'en',
  langPack: '',
  langCode: 'en',
}

const ADDRESS: DcAddress = {
  id: 2,
  host: '127.0.0.1',
  port: 443,
  ipv6: false,
  mediaOnly: false,
  tcpoOnly: false,
  cdn: false,
  static: false,
  thisPortOnly: false,
  secret: undefined,
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

/**
 * A stream wired straight to the peer.
 *
 * Bytes the channel writes go to the peer; whatever it answers comes back on
 * the next turn of the microtask queue, which is close enough to a socket for
 * every case here and exact enough to assert on.
 */
function peerStream(peer: MockServer) {
  let onData: (bytes: Uint8Array) => void = () => {}
  let onClose: (error?: Error) => void = () => {}
  let open = true
  const wrote: Uint8Array[] = []

  const stream: ByteStream = {
    write(bytes) {
      if (!open) throw new ValidationError('cannot write to a stream that is closed')
      wrote.push(bytes)

      const answer = peer.receive(bytes)
      if (answer.length > 0) queueMicrotask(() => open && onData(answer))
    },
    close() {
      open = false
    },
    get open() {
      return open
    },
    get pending() {
      return 0
    },
  }

  return {
    stream,
    wrote,
    /** The stream ends the way a peer that vanished ends one. */
    fail(error: Error) {
      open = false
      onClose(error)
    },
    /** The peer sends something that was not an answer to anything. */
    deliver(bytes: Uint8Array) {
      onData(bytes)
    },
    /** The peer hangs up cleanly. */
    hangUp() {
      open = false
      onClose()
    },
    attach(request: StreamRequest) {
      onData = request.onData
      onClose = request.onClose
      return stream
    },
  }
}

/** Open a channel against a fresh peer, with everything deterministic. */
async function channel(overrides: Record<string, unknown> = {}, seed = 11) {
  const peer = new MockServer({ key: SERVER_KEY, scope: SCOPE })
  const wire = peerStream(peer)
  const closes: Array<Error | undefined> = []
  const timers: Array<{ run: () => void; delay: number; cancelled: boolean }> = []

  const opened = openChannel({
    address: ADDRESS,
    scope: SCOPE,
    client: CLIENT,
    keys: [serverRsaKey(peer.key)],
    random: scripted(seed),
    now: () => 1_700_000_000_000,
    onClosed: (error) => closes.push(error),
    open: async (request) => wire.attach(request),
    // Records what was armed, and actually fires it: the connection below only
    // acts when its clock is driven, so a scheduler that recorded and never ran
    // would test a channel that never sends anything.
    schedule: (run, delay) => {
      const entry = { run, delay, cancelled: false }
      timers.push(entry)
      const timer = setTimeout(run, delay)

      return () => {
        entry.cancelled = true
        clearTimeout(timer)
      }
    },
    ...overrides,
  })

  return { opened, peer, wire, closes, timers }
}

describe('opening a channel', () => {
  it('completes the key exchange and reports the authorization', async () => {
    const { opened, peer } = await channel()
    const live = await opened

    expect(live.state).toBe('ready')
    expect(live.dcId).toBe(2)
    // The key the peer settled on is the key the channel holds. The peer keeps
    // the raw material, so the comparison is over the identifier derived from it.
    const negotiated = peer.result?.authKey
    if (negotiated === undefined) throw new Error('the peer established no key')
    expect(live.authorization.key.id).toEqual(authKeyId(negotiated))
    expect(typeof live.authorization.salt).toBe('bigint')

    live.close()
  })

  it('skips the exchange when an authorization is already known', async () => {
    const { opened } = await channel()
    const first = await opened
    const known = first.authorization
    first.close()

    const second = await channel({ authorization: known, keys: [] })
    const resumed = await second.opened

    // Nothing was exchanged: a restart costs one socket and no round trips.
    expect(resumed.authorization.key.id).toEqual(known.key.id)
    expect(second.peer.state).not.toBe('established')

    resumed.close()
  })

  it('refuses to open with neither an authorization nor keys to obtain one', async () => {
    const { opened } = await channel({ keys: [] })

    await expect(opened).rejects.toBeInstanceOf(ValidationError)
  })

  it('leaves nothing open when the stream cannot be opened', async () => {
    await expect(
      openChannel({
        address: ADDRESS,
        scope: SCOPE,
        client: CLIENT,
        keys: [],
        open: () => Promise.reject(new NetworkError('connection refused')),
      }),
    ).rejects.toThrow(/connection refused/)
  })

  it('fails the attempt when the stream ends mid-exchange', async () => {
    const { opened, wire } = await channel()
    queueMicrotask(() => wire.fail(new NetworkError('reset by peer')))

    // No key and no connection, so this is an attempt that failed rather than a
    // channel that closed.
    await expect(opened).rejects.toThrow(/reset by peer/)
  })

  it('fails the attempt when the peer hangs up mid-exchange', async () => {
    const { opened, wire, closes } = await channel()
    queueMicrotask(() => wire.hangUp())

    await expect(opened).rejects.toBeInstanceOf(NetworkError)
    expect(closes).toEqual([])
  })

  it('fails the attempt when the peer answers with something it should not', async () => {
    const { opened, wire } = await channel({ keys: [serverRsaKey(createServerKey())] })

    // A fingerprint outside the trusted set is refused rather than used.
    await expect(opened).rejects.toBeInstanceOf(Error)
    // An exchange that failed leaves no socket behind: the caller has nothing
    // to close, so the channel closes it.
    expect(wire.stream.open).toBe(false)
  })
})

describe('abandoning an attempt', () => {
  it('is refused when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const { opened } = await channel({ signal: controller.signal })

    await expect(opened).rejects.toBeInstanceOf(CancelledError)
  })

  it('is abandoned while the exchange is still running', async () => {
    const controller = new AbortController()
    const { opened } = await channel({ signal: controller.signal })

    controller.abort()

    await expect(opened).rejects.toBeInstanceOf(CancelledError)
  })
})

describe('a channel that is ready', () => {
  it('carries a call to the peer and back', async () => {
    const { opened, peer } = await channel()
    const live = await opened

    const answer = live.invoke({ _: 'help.getNearestDc' })

    await expect(answer).resolves.toEqual({ _: 'boolTrue' })
    // The first call states the layer and describes the client, which the peer
    // unwraps before answering.
    expect(peer.seen.some((message) => message.value._ === 'invokeWithLayer')).toBe(true)

    live.close()
  })

  it('acts on what arrives without waiting for a timer set earlier', async () => {
    const { opened, peer } = await channel()
    const live = await opened

    await live.invoke({ _: 'help.getNearestDc' })

    // The answer owes an acknowledgement. What is due next changed when it
    // arrived, so a channel that only reset its timer on the way out would hold
    // the acknowledgement until the moment it had already armed — a minute away
    // — and the server would go on resending in the meantime.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(peer.seen.some((message) => message.value._ === 'msgs_ack')).toBe(true)

    live.close()
  })

  it('drives the connection from a timer it owns', async () => {
    const { opened, timers } = await channel()
    const live = await opened

    // Everything below takes the moment as a parameter; this is the one place
    // that turns that into an actual timer.
    expect(timers.some((timer) => !timer.cancelled)).toBe(true)

    live.close()
  })
})

describe('a stream that stops being the protocol', () => {
  /** A frame header claiming more than any frame may carry. */
  const impossibleFrame = () => {
    const header = new Uint8Array(4)
    new DataView(header.buffer).setUint32(0, 64 * 1024 * 1024, true)

    return header
  }

  /** A well-formed frame whose contents are not a message this key can open. */
  const unreadableMessage = () => new IntermediateFraming().encode(new Uint8Array(64))

  it('ends the channel rather than escaping the callback that delivered it', async () => {
    const { opened, wire, closes } = await channel()
    const live = await opened

    // The bytes arrive on a socket callback. An exception thrown here has
    // nowhere to go but the runtime, which ends the process rather than the
    // connection.
    expect(() => wire.deliver(impossibleFrame())).not.toThrow()

    expect(live.state).toBe('closed')
    expect(closes[0]).toBeInstanceOf(FramingError)
  })

  it('reports a message that does not verify the same way', async () => {
    const { opened, wire, closes } = await channel()
    const live = await opened

    expect(() => wire.deliver(unreadableMessage())).not.toThrow()

    expect(live.state).toBe('closed')
    // Whatever the layer that refused it raised, reported as it was raised.
    expect(closes[0]).toBeInstanceOf(Error)
    expect(closes[0]).not.toBeInstanceOf(CancelledError)
  })

  it('ends once, however much more arrives', async () => {
    const { opened, wire, closes } = await channel()
    await opened

    wire.deliver(impossibleFrame())
    wire.deliver(impossibleFrame())
    wire.deliver(unreadableMessage())

    expect(closes).toHaveLength(1)
  })

  it('withdraws the calls that were still waiting', async () => {
    const { opened, wire } = await channel()
    const live = await opened

    const call = live.invoke({ _: 'ping', ping_id: 9n })
    wire.deliver(impossibleFrame())

    const failure = await call.catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(NetworkError)
    // The outcome is unknown, and what made it unknown is kept.
    expect((failure as Error).cause).toBeInstanceOf(FramingError)
  })

  it('stops the timer and the stream', async () => {
    const { opened, wire, timers } = await channel()
    await opened

    wire.deliver(impossibleFrame())

    expect(timers.every((timer) => timer.cancelled)).toBe(true)
    expect(wire.stream.open).toBe(false)
  })

  it('leaves a stream that is still the protocol alone', async () => {
    const { opened, peer, closes } = await channel()
    const live = await opened

    const answer = await live.invoke({ _: 'ping', ping_id: 11n })

    expect(answer).toMatchObject({ _: 'pong', ping_id: 11n })
    expect(closes).toEqual([])
    expect(live.state).toBe('ready')
    expect(peer.state).toBe('established')

    live.close()
  })

  it('fails the attempt when bytes arrive before anything can read them', async () => {
    const peer = new MockServer({ key: SERVER_KEY, scope: SCOPE })
    const wire = peerStream(peer)

    await expect(
      openChannel({
        address: ADDRESS,
        scope: SCOPE,
        client: CLIENT,
        keys: [serverRsaKey(peer.key)],
        // A stream that delivers before it has been handed over. There is
        // nothing to end and nobody to tell, so the failure belongs to whoever
        // is opening the channel.
        open: async (request) => {
          request.onData(Uint8Array.of(1, 2, 3, 4))

          return wire.attach(request)
        },
      }),
    ).rejects.toThrow(/link that is/)
  })

  it('fails the attempt when it happens before there is a channel', async () => {
    const { opened, wire } = await channel({ authorization: undefined })

    // Nothing is established yet, so there is no channel to end — the failure
    // belongs to whoever is waiting for one.
    queueMicrotask(() => wire.deliver(impossibleFrame()))

    await expect(opened).rejects.toBeInstanceOf(FramingError)
  })
})

describe('a refusal from the datacenter', () => {
  it('is reported as a code rather than as a sentence', async () => {
    const { opened, wire, peer, closes } = await channel()
    const live = await opened

    wire.deliver(peer.transportError(AUTH_KEY_NOT_FOUND))

    // The layer above has to tell one refusal from another to know whether the
    // key it holds is worth keeping. Reading that back out of a message would
    // make the wording protocol.
    const [reported] = closes
    expect(reported).toBeInstanceOf(TransportError)
    expect((reported as TransportError).code).toBe(AUTH_KEY_NOT_FOUND)
    expect(live.state).toBe('closed')
  })

  it('carries whatever code the far end sent', async () => {
    for (const code of [1, 404, 429, 444, 100_000]) {
      const { opened, wire, peer, closes } = await channel()
      const live = await opened

      wire.deliver(peer.transportError(code))

      expect((closes[0] as TransportError).code).toBe(code)
      live.close()
    }
  })

  it('is still a network failure to anyone holding a call', async () => {
    const { opened, wire, peer } = await channel()
    const live = await opened

    const call = live.invoke({ _: 'ping', ping_id: 7n })
    wire.deliver(peer.transportError(AUTH_KEY_NOT_FOUND))

    // A caller learns only that the outcome is unknown. The code is for the
    // layer deciding what to open next, and it survives as the cause.
    const failure = await call.catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(NetworkError)
    expect(failure).not.toBeInstanceOf(TransportError)
    expect((failure as Error).cause).toBeInstanceOf(TransportError)
    expect(((failure as Error).cause as TransportError).code).toBe(AUTH_KEY_NOT_FOUND)
  })

  it('is a network failure in its own right', () => {
    // Existing callers branch on NetworkError and must keep working.
    expect(new TransportError(404)).toBeInstanceOf(NetworkError)
    expect(new TransportError(404).name).toBe('TransportError')
    expect(new TransportError(404).message).toContain('404')
  })

  it('keeps the cause it was given', () => {
    const cause = new Error('the frame that carried it')
    expect(new TransportError(429, { cause }).cause).toBe(cause)
  })
})

describe('closing a channel', () => {
  it('stops the timer and the stream', async () => {
    const { opened, timers, wire } = await channel()
    const live = await opened

    live.close()

    expect(live.state).toBe('closed')
    expect(timers.every((timer) => timer.cancelled)).toBe(true)
    expect(wire.stream.open).toBe(false)
  })

  it('does not report an ending the caller asked for', async () => {
    const { opened, closes } = await channel()
    const live = await opened

    live.close()

    expect(closes).toEqual([])
  })

  it('closes once, however many times it is asked', async () => {
    const { opened, closes } = await channel()
    const live = await opened

    live.close()
    live.close()
    live.close()

    expect(closes).toEqual([])
    expect(live.state).toBe('closed')
  })

  it('refuses a call once closed', async () => {
    const { opened } = await channel()
    const live = await opened
    live.close()

    // The channel names itself rather than reporting an internal state.
    await expect(live.invoke({ _: 'ping', ping_id: 1n })).rejects.toThrow(/channel is closed/)
  })

  it('withdraws the calls that were still waiting', async () => {
    const { opened } = await channel()
    const live = await opened

    const answer = live.invoke({ _: 'help.getNearestDc' })
    live.close()

    // The caller asked for this, so the call was withdrawn rather than lost.
    await expect(answer).rejects.toBeInstanceOf(CancelledError)
  })
})

describe('a channel that ends on its own', () => {
  it('reports the failure that ended it', async () => {
    const { opened, wire, closes } = await channel()
    const live = await opened

    wire.fail(new NetworkError('reset by peer'))

    expect(closes).toHaveLength(1)
    expect(closes[0]).toBeInstanceOf(NetworkError)
    expect(live.state).toBe('closed')
  })

  it('reports a peer that hung up cleanly, without a failure', async () => {
    const { opened, wire, closes } = await channel()
    const live = await opened

    wire.hangUp()

    // A peer that closed and a peer that vanished are different events, and the
    // layer that will reconnect treats them differently.
    expect(closes).toEqual([undefined])
    expect(live.state).toBe('closed')
  })

  it('reports its ending once', async () => {
    const { opened, wire, closes } = await channel()
    await opened

    wire.fail(new NetworkError('reset by peer'))
    wire.fail(new NetworkError('reset again'))

    expect(closes).toHaveLength(1)
  })

  it('stops the timer it owned', async () => {
    const { opened, wire, timers } = await channel()
    await opened

    wire.fail(new NetworkError('reset by peer'))

    expect(timers.every((timer) => timer.cancelled)).toBe(true)
  })

  it('loses the calls that were still waiting, and says so', async () => {
    const { opened, wire } = await channel()
    const live = await opened

    const answer = live.invoke({ _: 'help.getNearestDc' })
    wire.fail(new NetworkError('reset by peer'))

    // A call the connection lost is a different thing from one its caller
    // withdrew: the first is worth making again on another channel and the
    // second must not be. Whatever decides that must not have to read a message
    // to tell them apart.
    await expect(answer).rejects.toBeInstanceOf(NetworkError)
    await expect(answer).rejects.not.toBeInstanceOf(CancelledError)
    await answer.catch((error: unknown) => {
      expect((error as Error).cause).toBeInstanceOf(NetworkError)
    })
  })

  it('loses the calls that were waiting when the peer hangs up cleanly', async () => {
    const { opened, wire } = await channel()
    const live = await opened

    const answer = live.invoke({ _: 'help.getNearestDc' })
    wire.hangUp()

    // Nobody withdrew the call. The connection simply stopped carrying it.
    await expect(answer).rejects.toBeInstanceOf(NetworkError)
  })
})
