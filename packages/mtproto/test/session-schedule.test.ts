// SPDX-License-Identifier: MIT

/**
 * When a connection does what it does periodically.
 *
 * Time is supplied rather than read, so every case here is exact: a duty falls
 * due at a stated millisecond or it does not, and a pause of a month is one
 * number rather than a wait. That is the point of the design, so the cases
 * exercise the boundaries directly — the millisecond before and the millisecond
 * of, several duties arriving together, and the jumps that a laptop closing its
 * lid produces.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { ConnectionSchedule, type Duty } from '../src/session/schedule.js'

const START = 1_000_000

/** A schedule with intervals chosen to be easy to reason about. */
function schedule(options = {}): ConnectionSchedule {
  return new ConnectionSchedule({
    pingInterval: 1000,
    saltInterval: 3000,
    stateInterval: 2000,
    ...options,
  })
}

/** A schedule that has been started. */
function running(options = {}): ConnectionSchedule {
  const created = schedule(options)
  created.start(START)

  return created
}

/** The duties due at a moment. */
function duties(created: ConnectionSchedule, now: number): Duty[] {
  return [...created.due(now).duties]
}

describe('starting and stopping', () => {
  it('reports nothing before it is started', () => {
    const created = schedule()

    expect(created.running).toBe(false)
    expect(created.epoch).toBe(0)
    expect(duties(created, START + 1_000_000)).toEqual([])
    expect(created.nextWakeup()).toBeUndefined()
  })

  it('arms the periodic duties from the moment it starts', () => {
    const created = running()

    expect(created.running).toBe(true)
    expect(created.dueAt('ping')).toBe(START + 1000)
    expect(created.dueAt('state')).toBe(START + 2000)
    expect(created.dueAt('salts')).toBe(START + 3000)
    expect(created.nextWakeup()).toBe(START + 1000)
  })

  it('starts a second time without moving a schedule already set', () => {
    const created = running()
    created.due(START + 1500)
    const armed = created.dueAt('ping')

    created.start(START + 9999)

    // Nothing to duplicate and nothing to shift: the duties are moments, and a
    // caller that starts twice believed it was already running.
    expect(created.dueAt('ping')).toBe(armed)
    expect(created.epoch).toBe(1)
  })

  it('stops without leaving anything armed', () => {
    const created = running()
    created.queued(START)
    created.expireAt(START + 10)
    created.stop()

    expect(created.running).toBe(false)
    expect(created.nextWakeup()).toBeUndefined()
    expect(created.dueAt('flush')).toBeUndefined()
    expect(created.dueAt('expiry')).toBeUndefined()
  })

  it('stops more than once without complaint', () => {
    const created = running()
    created.stop()
    created.stop()

    expect(created.running).toBe(false)
  })

  it('reports nothing while stopped, however late the moment', () => {
    const created = running()
    created.stop()

    // A wake that races a close is ordinary rather than something a caller has
    // to guard against.
    expect(duties(created, START + 10_000_000)).toEqual([])
  })

  it('reports nothing armed while it was stopped', () => {
    const created = running()
    created.stop()

    // Arming is allowed while stopped — a caller queueing a message during a
    // reconnect is not making a mistake — but nothing is owed by a connection
    // that is not running, so none of it is reported until one is.
    created.queued(START)
    created.expireAt(START)

    expect(duties(created, START + 1)).toEqual([])

    created.start(START + 1)
    expect(duties(created, START + 1)).toEqual(['expiry', 'flush'])
  })

  it('refuses a moment that is not a finite number', () => {
    const created = schedule()

    expect(() => created.start(Number.NaN)).toThrow(ValidationError)
    expect(() => created.start(Number.POSITIVE_INFINITY)).toThrow(ValidationError)
  })

  it('refuses an interval that would never come round', () => {
    expect(() => new ConnectionSchedule({ pingInterval: 0 })).toThrow(ValidationError)
    expect(() => new ConnectionSchedule({ saltInterval: -1 })).toThrow(ValidationError)
    expect(() => new ConnectionSchedule({ stateInterval: 1.5 })).toThrow(ValidationError)
    expect(() => new ConnectionSchedule({ flushDelay: -1 })).toThrow(ValidationError)
    expect(() => new ConnectionSchedule({ maxOutstandingPings: 0 })).toThrow(ValidationError)
  })
})

describe('a duty falling due', () => {
  it('arrives at its moment and not the millisecond before', () => {
    const created = running()

    expect(duties(created, START + 999)).toEqual([])
    expect(duties(created, START + 1000)).toEqual(['ping'])
  })

  it('is reported once per time it comes due', () => {
    const created = running()

    expect(duties(created, START + 1000)).toEqual(['ping'])
    expect(duties(created, START + 1000)).toEqual([])
    expect(duties(created, START + 1999)).toEqual([])
    expect(duties(created, START + 2000)).toEqual(['state', 'ping'])
  })

  it('does not arrive when the moment moves backwards', () => {
    const created = running()
    created.due(START + 1000)

    expect(duties(created, START + 500)).toEqual([])
    expect(created.dueAt('ping')).toBe(START + 2000)
  })
})

describe('several duties at once', () => {
  it('are reported in a fixed order', () => {
    const created = running()
    created.expireAt(START + 6000)
    created.queued(START + 6000)

    // Expiry first, so a request already given up on is not then asked about or
    // sent; flush last, so what the others queued travels with it.
    expect(duties(created, START + 6000)).toEqual(['expiry', 'salts', 'state', 'ping', 'flush'])
  })

  it('leave the periodic ones armed and the moments spent', () => {
    const created = running()
    created.expireAt(START + 6000)
    created.queued(START + 6000)
    created.due(START + 6000)

    expect(created.dueAt('expiry')).toBeUndefined()
    // A flush is owed until it has happened, not until it has been noticed.
    expect(created.flushPending).toBe(true)
    created.flushed()
    expect(created.dueAt('flush')).toBeUndefined()
    expect(created.dueAt('ping')).toBe(START + 7000)
    expect(created.dueAt('state')).toBe(START + 8000)
    expect(created.dueAt('salts')).toBe(START + 9000)
  })

  it('produce no duties at all on a cycle where nothing is owed', () => {
    const created = running()

    expect(created.due(START + 1).duties).toEqual([])
    expect(created.due(START + 1).epoch).toBe(1)
  })
})

describe('periodic work', () => {
  it('does not drift when a pass is taken late', () => {
    const created = running()

    // Handled 400ms late three times over. Counting from the scheduled moment
    // rather than from now keeps the slots where they started.
    created.due(START + 1400)
    created.due(START + 2400)
    created.due(START + 3400)

    expect(created.dueAt('ping')).toBe(START + 4000)
  })

  it('stays aligned across many passes', () => {
    const created = running()

    for (let pass = 1; pass <= 500; pass += 1) {
      created.due(START + pass * 1000 + 700)
    }

    expect(created.dueAt('ping')).toBe(START + 501_000)
  })

  it('owes one ping after a long pause, not one for every slot missed', () => {
    const created = running()

    // An hour asleep. Sixty slots passed; answering a pause with sixty pings
    // would be a burst at the moment the connection can least absorb one.
    expect(duties(created, START + 3_600_000)).toEqual(['salts', 'state', 'ping'])
    expect(duties(created, START + 3_600_000)).toEqual([])
  })

  it('realigns to the slot after the pause rather than to the pause itself', () => {
    const created = running()
    created.due(START + 3_600_000)

    // The next ping is one interval past the slot that was taken, and the slots
    // remain multiples of the interval from where they started.
    expect(created.dueAt('ping')).toBe(START + 3_601_000)
    expect((created.dueAt('ping') as number) % 1000).toBe(START % 1000)
  })

  it('survives a jump of years without counting the slots one by one', () => {
    const created = running()
    const decade = 10 * 365 * 24 * 60 * 60 * 1000

    const before = Date.now()
    expect(duties(created, START + decade)).toEqual(['salts', 'state', 'ping'])
    const spent = Date.now() - before

    // Arithmetic rather than a loop: counting three hundred million slots would
    // not finish, so this bounds the cost of a long pause rather than its length.
    expect(spent).toBeLessThan(200)
    expect(created.dueAt('ping')).toBe(START + decade + 1000)
  })
})

describe('expiry', () => {
  it('is armed for an exact deadline rather than polled for', () => {
    const created = running()
    // Before the first ping, so the case says something about expiry alone.
    created.expireAt(START + 500)

    expect(created.nextWakeup()).toBe(START + 500)
    expect(duties(created, START + 499)).toEqual([])
    expect(duties(created, START + 500)).toEqual(['expiry'])
  })

  it('is armed once however many requests are outstanding', () => {
    const created = running()
    created.expireAt(START + 1500)
    created.expireAt(START + 1200)

    // The earliest deadline is the only one that can need attention next, so
    // re-arming replaces rather than accumulates.
    expect(created.dueAt('expiry')).toBe(START + 1200)
  })

  it('is disarmed when nothing is outstanding', () => {
    const created = running()
    created.expireAt(START + 1500)
    created.expireAt(undefined)

    expect(created.dueAt('expiry')).toBeUndefined()
  })

  it('is not re-armed by taking it, because what is next is the registry to say', () => {
    const created = running()
    created.expireAt(START + 1500)
    created.due(START + 1500)

    expect(created.dueAt('expiry')).toBeUndefined()
  })

  it('reports every deadline that has passed in one duty, not one duty each', () => {
    const created = running()
    created.expireAt(START + 1500)

    // Three requests may have expired; the schedule says only that the moment
    // has come. Which requests those are is the registry's answer.
    expect(duties(created, START + 5000).filter((duty) => duty === 'expiry')).toEqual(['expiry'])
  })

  it('refuses a deadline that is not a finite number', () => {
    const created = running()

    expect(() => created.expireAt(Number.NaN)).toThrow(ValidationError)
  })
})

describe('flushing', () => {
  it('is due as soon as something is queued', () => {
    const created = running()
    created.queued(START + 10)

    expect(created.flushPending).toBe(true)
    expect(duties(created, START + 10)).toEqual(['flush'])
  })

  it('stays owed until it has happened, not until it has been noticed', () => {
    const created = running()
    created.queued(START + 10)

    // Reported again, because the bytes have not gone out. This is also what
    // keeps work queued while handling one duty out of a second batch: the
    // flush it would have armed is the one already owed.
    expect(duties(created, START + 10)).toEqual(['flush'])
    created.queued(START + 10)
    expect(duties(created, START + 10)).toEqual(['flush'])

    created.flushed()
    expect(duties(created, START + 10)).toEqual([])
  })

  it('is cleared by flushing even when nothing was owed', () => {
    const created = running()
    created.flushed()

    expect(created.flushPending).toBe(false)
  })

  it('arms once however much is queued', () => {
    const created = running()
    created.queued(START + 10)
    created.queued(START + 20)
    created.queued(START + 30)

    // The later messages join the batch the first one armed. Arming per message
    // would send each on its own and lose the batching entirely.
    expect(created.dueAt('flush')).toBe(START + 10)
    expect(duties(created, START + 30)).toEqual(['flush'])
    created.flushed()
    expect(duties(created, START + 30)).toEqual([])
  })

  it('can be delayed, to trade latency for fuller batches', () => {
    const created = running({ flushDelay: 50 })
    created.queued(START + 10)

    expect(duties(created, START + 59)).toEqual([])
    expect(duties(created, START + 60)).toEqual(['flush'])
  })

  it('arms again once the previous batch has gone', () => {
    const created = running()
    created.queued(START + 10)
    created.due(START + 10)
    created.flushed()

    expect(created.flushPending).toBe(false)
    created.queued(START + 20)
    expect(created.dueAt('flush')).toBe(START + 20)
  })

  it('brings the wakeup forward when it is the soonest thing owed', () => {
    const created = running()
    expect(created.nextWakeup()).toBe(START + 1000)

    created.queued(START + 10)
    expect(created.nextWakeup()).toBe(START + 10)
  })
})

describe('liveness', () => {
  it('gives each ping an identifier of its own', () => {
    const created = running()

    expect([created.nextPingId(), created.nextPingId(), created.nextPingId()]).toEqual([1n, 2n, 3n])
  })

  it('measures the round trip a pong completes', () => {
    const created = running()
    created.pingSent(1n, START)

    expect(created.pongReceived(1n, START + 42)).toBe(42)
    expect(created.roundTrip).toBe(42)
  })

  it('measures nothing for a ping this connection did not send', () => {
    const created = running()

    expect(created.pongReceived(99n, START + 42)).toBeUndefined()
    expect(created.roundTrip).toBeUndefined()
  })

  it('measures nothing for a pong that arrives twice', () => {
    const created = running()
    created.pingSent(1n, START)
    created.pongReceived(1n, START + 42)

    // The second copy travelled at a moment nobody asked about.
    expect(created.pongReceived(1n, START + 9000)).toBeUndefined()
    expect(created.roundTrip).toBe(42)
  })

  it('measures nothing for a pong that claims to precede its ping', () => {
    const created = running()
    created.pingSent(1n, START + 100)

    // A clock moving backwards, not a fast network. Recorded as a measurement
    // it would make the connection look healthiest as its timekeeping broke.
    expect(created.pongReceived(1n, START)).toBeUndefined()
    expect(created.roundTrip).toBeUndefined()
  })

  it('measures a round trip of nothing when the answer is immediate', () => {
    const created = running()
    created.pingSent(1n, START)

    expect(created.pongReceived(1n, START)).toBe(0)
  })

  it('holds a bounded number of unanswered pings', () => {
    const created = running({ maxOutstandingPings: 3 })
    for (let index = 1n; index <= 10n; index += 1n) created.pingSent(index, START + Number(index))

    expect(created.outstandingPings).toBe(3)
  })

  it('drops the oldest unanswered ping rather than the newest', () => {
    const created = running({ maxOutstandingPings: 2 })
    created.pingSent(1n, START)
    created.pingSent(2n, START + 10)
    created.pingSent(3n, START + 20)

    expect(created.pongReceived(1n, START + 30)).toBeUndefined()
    expect(created.pongReceived(3n, START + 30)).toBe(10)
  })

  it('accumulates nothing across a connection that is never answered', () => {
    const created = running({ maxOutstandingPings: 4 })
    for (let index = 1n; index <= 5000n; index += 1n) created.pingSent(index, START)

    expect(created.outstandingPings).toBe(4)
  })

  it('refuses a moment that is not a finite number', () => {
    const created = running()

    expect(() => created.pingSent(1n, Number.NaN)).toThrow(ValidationError)
    expect(() => created.pongReceived(1n, Number.NaN)).toThrow(ValidationError)
  })
})

describe('a connection that is replaced', () => {
  it('runs under a new epoch', () => {
    const created = running()
    expect(created.epoch).toBe(1)

    created.stop()
    created.start(START + 5000)

    expect(created.epoch).toBe(2)
  })

  it('treats work decided under the old connection as no longer applying', () => {
    const created = running()
    const decided = created.due(START + 1000)
    expect(created.current(decided.epoch)).toBe(true)

    created.stop()
    created.start(START + 5000)

    // The decision was correct when it was made and is not correct now. Nothing
    // fires into the new connection; a caller still holding the old conclusion
    // can see that it has been superseded.
    expect(created.current(decided.epoch)).toBe(false)
    expect(created.current(created.epoch)).toBe(true)
  })

  it('treats every decision as inapplicable while stopped', () => {
    const created = running()
    const decided = created.due(START + 1000)
    created.stop()

    expect(created.current(decided.epoch)).toBe(false)
  })

  it('arms the periodic duties from the new connection, not the old', () => {
    const created = running()
    created.stop()
    created.start(START + 5000)

    expect(created.dueAt('ping')).toBe(START + 6000)
  })

  it('produces one of each duty after reconnecting, never two', () => {
    const created = running()
    created.stop()
    created.start(START + 5000)

    expect(duties(created, START + 20_000)).toEqual(['salts', 'state', 'ping'])
    expect(duties(created, START + 20_000)).toEqual([])
  })

  it('forgets a flush the old connection had queued', () => {
    const created = running()
    created.queued(START + 10)
    created.stop()
    created.start(START + 5000)

    // The messages themselves are held elsewhere and are the outbound record's
    // to resend; what is discarded is the intention to write bytes to a socket
    // that no longer exists.
    expect(created.flushPending).toBe(false)
  })

  it('forgets a round trip measured on the old connection', () => {
    const created = running()
    created.pingSent(1n, START)
    created.pongReceived(1n, START + 42)

    created.stop()
    created.start(START + 5000)

    expect(created.roundTrip).toBeUndefined()
    expect(created.outstandingPings).toBe(0)
  })

  it('leaves a deadline to be re-armed from the record that owns it', () => {
    const created = running()
    created.expireAt(START + 1500)
    created.stop()
    created.start(START + 5000)

    // A deadline says how long a caller will wait, which reconnecting does not
    // change. The schedule does not remember it — the registry still holds it,
    // and the next pass arms from there.
    expect(created.dueAt('expiry')).toBeUndefined()
    created.expireAt(START + 1500)
    expect(duties(created, START + 5000)).toEqual(['expiry'])
  })
})
