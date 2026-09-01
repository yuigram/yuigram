/**
 * What has been sent and not yet answered for.
 *
 * The record decides when a message is sent again, so the cases that matter are
 * the ones where it could decide wrongly: an acknowledgement for something that
 * was never sent, one that arrives twice, a container that stands for the
 * messages inside it, and a message the server will never accept — which
 * without a bound is a message sent forever.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { decodeMessageStatuses, needsResend, OutboundTracker } from '../src/session/outbound.js'

/** A tracker holding three messages sent one second apart. */
function withThree() {
  const tracker = new OutboundTracker()
  tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })
  tracker.track({ msgId: 200n, seqNo: 3, sentAt: 1001 })
  tracker.track({ msgId: 300n, seqNo: 5, sentAt: 1002 })

  return tracker
}

describe('tracking what was sent', () => {
  it('records a message with its sequence number and time', () => {
    const tracker = new OutboundTracker()
    tracker.track({ msgId: 100n, seqNo: 7, sentAt: 1234 })

    expect(tracker.get(100n)).toEqual({
      msgId: 100n,
      seqNo: 7,
      sentAt: 1234,
      acknowledged: false,
      attempts: 1,
    })
    expect(tracker.size).toBe(1)
  })

  it('knows nothing about a message never sent', () => {
    expect(new OutboundTracker().get(999n)).toBeUndefined()
  })

  it('refuses to track the same identifier twice', () => {
    // Two messages cannot share an identifier, so this is the caller losing
    // track rather than something the record should quietly absorb.
    const tracker = new OutboundTracker()
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })

    expect(() => tracker.track({ msgId: 100n, seqNo: 3, sentAt: 1001 })).toThrow(
      /already being tracked/,
    )
  })

  it('refuses rather than evicts once full', () => {
    // Every entry was put here by this client sending something. Dropping the
    // oldest would lose the knowledge that it was never answered.
    const tracker = new OutboundTracker({ capacity: 2 })
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })
    tracker.track({ msgId: 200n, seqNo: 3, sentAt: 1001 })

    expect(() => tracker.track({ msgId: 300n, seqNo: 5, sentAt: 1002 })).toThrow(
      /cannot track more than 2/,
    )
    expect(tracker.get(100n)).toBeDefined()
  })

  it('refuses a capacity or attempt limit that could hold nothing', () => {
    for (const options of [{ capacity: 0 }, { maxAttempts: 0 }, { capacity: 1.5 }]) {
      expect(() => new OutboundTracker(options)).toThrow(ValidationError)
    }
  })
})

describe('acknowledgement', () => {
  it('marks one message', () => {
    const tracker = withThree()

    expect(tracker.acknowledge(200n)).toBe('acknowledged')
    expect(tracker.get(200n)?.acknowledged).toBe(true)
    expect(tracker.get(100n)?.acknowledged).toBe(false)
  })

  it('marks several, one at a time', () => {
    const tracker = withThree()

    for (const msgId of [100n, 200n, 300n]) expect(tracker.acknowledge(msgId)).toBe('acknowledged')
    expect(tracker.due(2000)).toEqual([])
  })

  it('reports a repeat rather than acting on it twice', () => {
    const tracker = withThree()
    tracker.acknowledge(100n)

    expect(tracker.acknowledge(100n)).toBe('already-acknowledged')
  })

  it('reports an identifier it does not hold, and records nothing', () => {
    // Acknowledgements arrive from the network. Inventing an entry for one
    // would let the far end decide how much is remembered.
    const tracker = withThree()

    expect(tracker.acknowledge(999n)).toBe('unknown')
    expect(tracker.size).toBe(3)
    expect(tracker.get(999n)).toBeUndefined()
  })

  it('reports an identifier already forgotten', () => {
    const tracker = withThree()
    tracker.forget(100n)

    expect(tracker.acknowledge(100n)).toBe('unknown')
  })

  it('acknowledges everything a container carried', () => {
    // The server acknowledges what it read, and it read them together.
    const tracker = new OutboundTracker()
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })
    tracker.track({ msgId: 200n, seqNo: 3, sentAt: 1000 })
    tracker.track({ msgId: 900n, seqNo: 0, sentAt: 1000, contains: [100n, 200n] })

    expect(tracker.acknowledge(900n)).toBe('acknowledged')
    expect(tracker.get(100n)?.acknowledged).toBe(true)
    expect(tracker.get(200n)?.acknowledged).toBe(true)
  })

  it('acknowledges a container whose members were already acknowledged', () => {
    const tracker = new OutboundTracker()
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })
    tracker.track({ msgId: 900n, seqNo: 0, sentAt: 1000, contains: [100n, 999n] })
    tracker.acknowledge(100n)

    // The unknown member is reported by the inner call and changes nothing.
    expect(tracker.acknowledge(900n)).toBe('acknowledged')
    expect(tracker.get(100n)?.acknowledged).toBe(true)
  })
})

describe('what is due to be sent again', () => {
  it('lists only what was sent before the deadline', () => {
    const tracker = withThree()

    expect(tracker.due(1001)).toEqual([100n, 200n])
    expect(tracker.due(999)).toEqual([])
  })

  it('lists in send order, whatever order it learned them', () => {
    // A server that dropped a run of messages should see them again in the
    // order it did not see them.
    const tracker = new OutboundTracker()
    tracker.track({ msgId: 300n, seqNo: 5, sentAt: 1000 })
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })
    tracker.track({ msgId: 200n, seqNo: 3, sentAt: 1000 })

    expect(tracker.due(1000)).toEqual([100n, 200n, 300n])
  })

  it('excludes what has been acknowledged', () => {
    const tracker = withThree()
    tracker.acknowledge(200n)

    expect(tracker.due(2000)).toEqual([100n, 300n])
  })

  it('excludes what has been tried as often as it may be', () => {
    const tracker = new OutboundTracker({ maxAttempts: 3 })
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })
    tracker.track({ msgId: 104n, seqNo: 1, sentAt: 1000, replaces: 100n })
    tracker.track({ msgId: 108n, seqNo: 1, sentAt: 1000, replaces: 104n })

    expect(tracker.due(2000)).toEqual([])
  })
})

describe('the attempt limit', () => {
  /** Resend under a new identifier, which is the only correct way to resend. */
  function resend(tracker: OutboundTracker, from: bigint): bigint {
    const to = from + 4n
    tracker.track({ msgId: to, seqNo: 1, sentAt: 1000, replaces: from })
    return to
  }

  it('counts a succession, not an identifier', () => {
    // An identifier is used once — the server ignores a repeat as a duplicate —
    // so a resend is a new message. A count kept per identifier would restart
    // at every resend and the limit would never bind.
    const tracker = new OutboundTracker({ maxAttempts: 4 })
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })

    const second = resend(tracker, 100n)
    expect(tracker.get(second)?.attempts).toBe(2)

    const third = resend(tracker, second)
    expect(tracker.get(third)?.attempts).toBe(3)
  })

  it('forgets the identifier a resend replaced', () => {
    const tracker = new OutboundTracker()
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })
    const second = resend(tracker, 100n)

    expect(tracker.get(100n)).toBeUndefined()
    expect(tracker.due(2000)).toEqual([second])
    expect(tracker.size).toBe(1)
  })

  it('binds at the limit however many identifiers the succession used', () => {
    // The exact boundary: one below the limit is still due, at the limit is
    // not, and going past it is refused rather than silently allowed.
    const tracker = new OutboundTracker({ maxAttempts: 3 })
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })

    const second = resend(tracker, 100n)
    expect(tracker.get(second)?.attempts).toBe(2)
    expect(tracker.canResend(second)).toBe(true)
    expect(tracker.due(2000)).toEqual([second])

    const third = resend(tracker, second)
    expect(tracker.get(third)?.attempts).toBe(3)
    expect(tracker.canResend(third)).toBe(false)
    expect(tracker.exhausted(third)).toBe(true)
    expect(tracker.due(2000)).toEqual([])

    expect(() => resend(tracker, third)).toThrow(/has been tried 3 times/)
  })

  it('refuses to replace a message it does not hold', () => {
    // Silently starting a fresh count is exactly the failure the limit exists
    // to prevent.
    const tracker = new OutboundTracker()

    expect(() => tracker.track({ msgId: 104n, seqNo: 1, sentAt: 1000, replaces: 100n })).toThrow(
      /is not being tracked/,
    )
  })

  it('refuses to replace a message that was acknowledged', () => {
    const tracker = new OutboundTracker()
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })
    tracker.acknowledge(100n)

    expect(() => resend(tracker, 100n)).toThrow(/must not be sent again/)
  })

  it('answers whether a message may be sent again without changing anything', () => {
    const tracker = new OutboundTracker({ maxAttempts: 2 })
    tracker.track({ msgId: 100n, seqNo: 1, sentAt: 1000 })

    expect(tracker.canResend(100n)).toBe(true)
    expect(tracker.canResend(100n)).toBe(true)
    expect(tracker.get(100n)?.attempts).toBe(1)
  })

  it('answers no for a message it does not hold or has acknowledged', () => {
    const tracker = withThree()
    tracker.acknowledge(100n)

    expect(tracker.canResend(100n)).toBe(false)
    expect(tracker.canResend(999n)).toBe(false)
    expect(tracker.exhausted(999n)).toBe(false)
  })

  it('forgets everything when the session is replaced', () => {
    const tracker = withThree()
    tracker.clear()

    expect(tracker.size).toBe(0)
    expect(tracker.due(2000)).toEqual([])
  })
})

describe('the statuses a state query answers with', () => {
  it('reads the four defined states', () => {
    expect(decodeMessageStatuses(Uint8Array.of(1, 2, 3, 4))).toEqual([
      { state: 1, acknowledged: false },
      { state: 2, acknowledged: false },
      { state: 3, acknowledged: false },
      { state: 4, acknowledged: false },
    ])
  })

  it('reads the already-acknowledged bit alongside the state', () => {
    expect(decodeMessageStatuses(Uint8Array.of(0b1100, 0b1001))).toEqual([
      { state: 4, acknowledged: true },
      { state: 1, acknowledged: true },
    ])
  })

  it('refuses a byte naming no defined state', () => {
    // The correspondence is positional, so a byte that cannot be read leaves
    // every one after it meaning something other than what it says.
    expect(() => decodeMessageStatuses(Uint8Array.of(4, 0))).toThrow(/state 0 at position 1/)
    expect(() => decodeMessageStatuses(Uint8Array.of(0b111))).toThrow(/state 7 at position 0/)
  })

  it('reads an empty answer as no statuses', () => {
    expect(decodeMessageStatuses(new Uint8Array(0))).toEqual([])
  })

  it('treats everything but received as needing to be sent again', () => {
    expect(needsResend({ state: 1, acknowledged: false })).toBe(true)
    expect(needsResend({ state: 2, acknowledged: false })).toBe(true)
    expect(needsResend({ state: 3, acknowledged: false })).toBe(true)
    expect(needsResend({ state: 4, acknowledged: false })).toBe(false)
    expect(needsResend({ state: 4, acknowledged: true })).toBe(false)
  })
})
