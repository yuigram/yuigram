/**
 * The components working as one connection.
 *
 * Each part has been tested against its own rules. What is tested here is that
 * they compose: that the schedule's decisions turn into messages the composer
 * builds, that a peer answers them, that the answers reach the records that were
 * waiting, and that none of the parts has quietly taken over another's job.
 *
 * The loop below is what the layer that owns a socket would run, minus the
 * socket. Time is a variable, so a case can put an hour or a decade between two
 * lines and assert exactly what the connection then owes.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { Handshake } from '../src/auth/handshake.js'
import { serverRsaKey } from '../src/auth/keys.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { encodeEncryptedMessage } from '../src/message/encrypted.js'
import { SessionDispatcher } from '../src/session/dispatcher.js'
import { OutboundTracker } from '../src/session/outbound.js'
import { compose } from '../src/session/outgoing.js'
import { RequestRegistry } from '../src/session/requests.js'
import { getFutureSalts, SaltReservoir } from '../src/session/salts.js'
import { ConnectionSchedule, type Duty } from '../src/session/schedule.js'
import { Session } from '../src/session/session.js'
import { TlScope, writeObject } from '../src/tl/index.js'
import { FrameBuffer, IntermediateFraming } from '../src/transport/framing.js'
import { createServerKey } from './server/keys.js'
import { DH_PRIME, MockServer } from './server/server.js'

const SCOPE = new TlScope('session', [CORE, MTPROTO])
const SERVER_KEY = createServerKey()

/** Where the simulated clock starts, in milliseconds. */
const START = 1_700_000_000_000

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
 * A connection, and the loop that drives it.
 *
 * Everything the layer that owns I/O would do, except that "write" means "hand
 * to the peer" and "wait" means "set the clock forward".
 */
function connection(seed = 11) {
  let clock = START

  const framing = new IntermediateFraming()
  const peer = new MockServer({ key: SERVER_KEY, now: () => clock })
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

  const schedule = new ConnectionSchedule({
    pingInterval: 1000,
    saltInterval: 3000,
    stateInterval: 2000,
  })
  const dispatcher = new SessionDispatcher({ session, key: result.authKey, scope: SCOPE })
  const registry = new RequestRegistry()
  const tracker = new OutboundTracker()
  const reservoir = new SaltReservoir()

  /** Bodies waiting for the next flush, and what each will be recorded as. */
  const queue: Array<{ body: Uint8Array; pingId?: bigint; requestId?: number }> = []
  const acks: bigint[] = []
  const seen: Duty[] = []
  let sent = 0

  const queueBody = (body: Uint8Array, extra: { pingId?: bigint; requestId?: number } = {}) => {
    queue.push({ body, ...extra })
    schedule.queued(clock)
  }

  /** Compose everything queued, hand it to the peer, and take in the answers. */
  const flush = () => {
    // A request that timed out or was withdrawn while it waited for the batch is
    // dropped rather than sent: nobody is waiting for its answer any more.
    const batch = queue.filter(
      (entry) =>
        entry.requestId === undefined || registry.get(entry.requestId)?.state === 'pending',
    )
    const carried = [...acks]
    if (batch.length === 0 && carried.length === 0) {
      queue.length = 0
      schedule.flushed()
      return
    }

    queue.length = 0
    acks.length = 0

    const composed = compose({
      session,
      scope: SCOPE,
      bodies: batch.map((entry) => entry.body),
      ...(carried.length === 0 ? {} : { acks: carried }),
    })
    sent += 1

    const at = session.serverNow()
    for (const [index, part] of composed.parts.entries()) {
      tracker.track({ msgId: part.msgId, seqNo: part.seqNo, sentAt: at })

      const entry = batch[index]
      if (entry?.pingId !== undefined) schedule.pingSent(entry.pingId, clock)
      if (entry?.requestId !== undefined) registry.sent(entry.requestId, part.msgId)
    }

    if (composed.acknowledgement !== undefined) {
      tracker.track({
        msgId: composed.acknowledgement.msgId,
        seqNo: composed.acknowledgement.seqNo,
        sentAt: at,
      })
    }

    if (composed.contains.length > 0) {
      tracker.track({
        msgId: composed.msgId,
        seqNo: composed.seqNo,
        sentAt: at,
        contains: composed.contains,
      })
    }

    schedule.flushed()

    for (const reply of exchange(
      encodeEncryptedMessage({
        key: result.authKey,
        from: 'client',
        salt: session.salt,
        sessionId: session.id,
        msgId: composed.msgId,
        seqNo: composed.seqNo,
        body: composed.body,
      }),
    )) {
      receive(reply)
    }
  }

  /** Interpret one inbound message and route what it produced. */
  const receive = (bytes: Uint8Array) => {
    const dispatched = dispatcher.receive(bytes)
    acks.push(...dispatched.acks)

    for (const msgId of dispatched.answered) {
      tracker.acknowledge(msgId)
      registry.complete(msgId)
    }

    for (const event of dispatched.events) {
      if (event.kind === 'pong') schedule.pongReceived(event.pingId, clock)
      if (event.kind === 'salts-offered') reservoir.offer(event.salts, session.serverNow())
    }

    if (acks.length > 0) schedule.queued(clock)
  }

  /**
   * One pass of the loop: take what is due and act on it until nothing is left.
   *
   * Drained rather than taken once, because acting on a duty can arm another —
   * a ping is queued, which arms a flush. Each duty is spent when it is taken,
   * so the drain terminates; the bound turns a rule that stopped holding into a
   * failed test rather than a hung one.
   */
  const tick = (at: number) => {
    clock = at

    const taken: Duty[] = []
    let epoch = schedule.epoch

    for (let round = 0; ; round += 1) {
      if (round > 8) throw new Error('the schedule kept finding work at a single moment')

      const work = schedule.due(clock)
      epoch = work.epoch
      if (!schedule.current(work.epoch) || work.duties.length === 0) break

      taken.push(...work.duties)
      for (const duty of work.duties) act(duty)
    }

    return { epoch, duties: taken }
  }

  const act = (duty: Duty) => {
    seen.push(duty)

    switch (duty) {
      case 'expiry':
        registry.expire(clock)
        schedule.expireAt(registry.earliestDeadline())
        break

      case 'salts':
        if (reservoir.lowOnSalts(session.serverNow())) queueBody(getFutureSalts(SCOPE, 4))
        break

      case 'state': {
        const outstanding = tracker.due(session.serverNow())
        if (outstanding.length > 0) {
          queueBody(writeObject({ _: 'msgs_state_req', msg_ids: outstanding }, SCOPE))
        }
        break
      }

      case 'ping': {
        const pingId = schedule.nextPingId()
        queueBody(writeObject({ _: 'ping', ping_id: pingId }, SCOPE), { pingId })
        break
      }

      case 'flush':
        flush()
        break
    }
  }

  /** Register a request and queue it, as a caller making a call would. */
  const call = (deadline: number) => {
    const id = registry.create({ deadline })
    schedule.expireAt(registry.earliestDeadline())
    queueBody(writeObject({ _: 'ping', ping_id: BigInt(id) }, SCOPE), { requestId: id })

    return id
  }

  /**
   * Register a request that is not sent.
   *
   * A deadline runs from the moment the caller asked, not from the moment the
   * message left, so a request waiting for a batch is already counting down.
   */
  const awaiting = (deadline: number) => {
    const id = registry.create({ deadline })
    schedule.expireAt(registry.earliestDeadline())

    return id
  }

  return {
    peer,
    session,
    schedule,
    registry,
    tracker,
    reservoir,
    seen,
    tick,
    call,
    awaiting,
    start: () => schedule.start(clock),
    sentMessages: () => sent,
    now: () => clock,
  }
}

describe('a connection driven by its schedule', () => {
  it('proves liveness on the interval and measures the round trip', () => {
    const live = connection()
    live.start()

    live.tick(START + 1000)

    expect(live.seen).toEqual(['ping', 'flush'])
    expect(live.schedule.roundTrip).toBe(0)
    expect(live.schedule.outstandingPings).toBe(0)
  })

  it('records the ping as delivered once the answer arrives', () => {
    const live = connection()
    live.start()
    live.tick(START + 1000)

    // A pong is the only confirmation a ping receives. Without it the ping would
    // sit unacknowledged and be resent until its attempts ran out.
    const outstanding = live.tracker.due(live.session.serverNow() + 3600)
    expect(outstanding).toEqual([])
  })

  it('fills the salt reserve from the server when it runs low', () => {
    const live = connection()
    live.start()

    live.tick(START + 3000)

    expect(live.seen).toContain('salts')
    expect(live.reservoir.size).toBe(4)
    expect(live.reservoir.lowOnSalts(live.session.serverNow())).toBe(false)
  })

  it('stops asking for salts once the reserve is deep enough', () => {
    const live = connection()
    live.start()
    live.tick(START + 3000)
    const held = live.reservoir.size

    live.tick(START + 6000)

    expect(live.reservoir.size).toBe(held)
  })

  it('reconciles delivery for messages the server has not answered for', () => {
    const live = connection()
    live.start()

    live.tick(START + 2000)

    // A state query is composed through the ordinary path, so the message that
    // carries it is tracked like any other.
    expect(live.seen).toContain('state')
    expect(live.tracker.size).toBeGreaterThan(0)
  })

  it('does every kind of work owed in one pass, in one message', () => {
    const live = connection()
    live.start()
    const before = live.sentMessages()

    live.call(START + 5000)
    const work = live.tick(START + 6000)

    // Expiry, salts, state and ping all fall due together, and the flush that
    // follows them carries everything they queued as a single container.
    expect(work.duties).toEqual(['expiry', 'salts', 'state', 'ping', 'flush'])
    expect(live.sentMessages()).toBe(before + 1)
  })
})

describe('deadlines under the schedule', () => {
  it('expires a request at its deadline and not the millisecond before', () => {
    const live = connection()
    live.start()
    const id = live.awaiting(START + 500)

    live.tick(START + 499)
    expect(live.registry.get(id)?.state).not.toBe('timed-out')

    live.tick(START + 500)
    expect(live.registry.get(id)?.state).toBe('timed-out')
  })

  it('wakes for the earliest deadline rather than on an interval', () => {
    const live = connection()
    live.start()
    live.awaiting(START + 250)

    // The deadline is sooner than any periodic duty, so it is what the
    // connection's single timer is set to — no polling interval sits between a
    // deadline passing and its being noticed.
    expect(live.schedule.dueAt('expiry')).toBe(START + 250)
    expect(live.schedule.nextWakeup()).toBe(START + 250)
  })

  it('expires several requests that fall due together in one pass', () => {
    const live = connection()
    live.start()
    const ids = [live.awaiting(START + 400), live.awaiting(START + 400), live.awaiting(START + 400)]

    live.tick(START + 400)

    for (const id of ids) expect(live.registry.get(id)?.state).toBe('timed-out')
  })

  it('re-arms for the next deadline after taking the first', () => {
    const live = connection()
    live.start()
    live.awaiting(START + 300)
    live.awaiting(START + 700)

    live.tick(START + 300)

    expect(live.schedule.dueAt('expiry')).toBe(START + 700)
  })

  it('disarms expiry once nothing is outstanding', () => {
    const live = connection()
    live.start()
    live.awaiting(START + 300)

    live.tick(START + 300)

    expect(live.schedule.dueAt('expiry')).toBeUndefined()
  })

  it('does not extend a deadline because the connection was busy', () => {
    const live = connection()
    live.start()
    const id = live.awaiting(START + 2500)

    // Pings, salt refills and state queries all happen in between. A deadline
    // says how long its caller will wait, and nothing the connection does on its
    // own behalf changes that.
    live.tick(START + 1000)
    live.tick(START + 2000)
    live.tick(START + 2500)

    expect(live.registry.get(id)?.state).toBe('timed-out')
  })

  it('does not expire a request that was answered before its deadline', () => {
    const live = connection()
    live.start()
    const id = live.call(START + 5000)

    live.tick(START + 100)
    live.tick(START + 5000)

    // The peer answered it, so it completed; expiry finds nothing to give up on.
    expect(live.registry.get(id)?.state).not.toBe('timed-out')
  })
})

describe('a connection that is replaced', () => {
  it('runs one of each duty afterwards, never two', () => {
    const live = connection()
    live.start()
    live.tick(START + 1000)

    live.schedule.stop()
    live.schedule.start(START + 1000)
    live.seen.length = 0

    live.tick(START + 20_000)

    expect(live.seen.filter((duty) => duty === 'ping')).toEqual(['ping'])
  })

  it('ignores a pass whose decision belonged to the previous connection', () => {
    const live = connection()
    live.start()

    live.schedule.stop()
    live.seen.length = 0

    // The loop checks the epoch before acting, so a wake that arrives after the
    // connection went away does nothing to the one that replaced it.
    live.tick(START + 20_000)

    expect(live.seen).toEqual([])
  })

  it('keeps a request waiting on the deadline it was created with', () => {
    const live = connection()
    live.start()
    const id = live.awaiting(START + 5000)

    live.schedule.stop()
    live.schedule.start(START + 1000)
    live.schedule.expireAt(live.registry.earliestDeadline())

    // The registry never lost the deadline; the schedule arms from it again.
    expect(live.schedule.dueAt('expiry')).toBe(START + 5000)
    live.tick(START + 5000)
    expect(live.registry.get(id)?.state).toBe('timed-out')
  })

  it('leaves resend eligibility to the record that owns it', () => {
    const live = connection()
    live.start()
    live.tick(START + 2000)
    const outstanding = live.tracker.due(live.session.serverNow())

    live.schedule.stop()
    live.schedule.start(START + 2000)

    // Stopping and starting decides nothing about which messages may be sent
    // again — the schedule holds no messages, and the tracker's answer is the
    // same on either side of a reconnect.
    expect(live.tracker.due(live.session.serverNow())).toEqual(outstanding)
  })
})

describe('a connection left alone', () => {
  it('owes one round of work after a long pause, not one per interval missed', () => {
    const live = connection()
    live.start()

    const work = live.tick(START + 3_600_000)

    expect(work.duties).toEqual(['salts', 'state', 'ping', 'flush'])
    expect(live.schedule.outstandingPings).toBe(0)
  })

  it('sends one message for that round rather than one per missed slot', () => {
    const live = connection()
    live.start()
    const before = live.sentMessages()

    live.tick(START + 3_600_000)

    expect(live.sentMessages()).toBe(before + 1)
  })

  it('accumulates nothing across many quiet passes', () => {
    const live = connection()
    live.start()

    for (let pass = 1; pass <= 200; pass += 1) live.tick(START + pass)

    // Nothing fell due on any of them, so nothing was queued, sent or recorded.
    expect(live.seen).toEqual([])
    expect(live.tracker.size).toBe(0)
    expect(live.registry.size).toBe(0)
  })
})
