// SPDX-License-Identifier: MPL-2.0

/**
 * Inbound acceptance.
 *
 * Both rules here exist to stop a message being acted on twice, so the cases
 * that matter are the ones where a second message looks exactly like a first:
 * a resend, a replay, and an identifier that has aged out of the record.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { MessageHistory, withinAcceptanceWindow } from '../src/session/history.js'

/** An identifier created `seconds` after the epoch, with server parity. */
function at(seconds: number, low = 1): bigint {
  return (BigInt(seconds) << 32n) | BigInt(low)
}

describe('the record of what has been seen', () => {
  it('admits an identifier once', () => {
    const history = new MessageHistory()

    expect(history.admit(at(1000))).toBe('accepted')
    expect(history.has(at(1000))).toBe(true)
  })

  it('refuses the same identifier twice', () => {
    // A resend and a replay are the same shape. Neither may be acted on twice.
    const history = new MessageHistory()
    history.admit(at(1000))

    expect(history.admit(at(1000))).toBe('duplicate')
  })

  it('admits identifiers arriving out of order', () => {
    // Delivery order is not identifier order, and a later message overtaking an
    // earlier one is ordinary rather than an error.
    const history = new MessageHistory()

    expect(history.admit(at(1000, 9))).toBe('accepted')
    expect(history.admit(at(1000, 5))).toBe('accepted')
    expect(history.admit(at(1000, 13))).toBe('accepted')
    expect(history.size).toBe(3)
  })

  it('holds only its capacity, forgetting the oldest first', () => {
    const history = new MessageHistory({ capacity: 4 })
    for (let index = 1; index <= 6; index += 1) history.admit(at(1000, index * 2 + 1))

    expect(history.size).toBe(4)
    expect(history.has(at(1000, 3))).toBe(false)
    expect(history.has(at(1000, 13))).toBe(true)
  })

  it('refuses an identifier older than everything it retains', () => {
    // The record cannot prove such an identifier is new. Treating "forgotten"
    // as "unseen" would let a replay succeed by being old enough.
    const history = new MessageHistory({ capacity: 3 })
    for (const low of [11, 13, 15]) history.admit(at(1000, low))

    expect(history.admit(at(1000, 5))).toBe('too-old')
    expect(history.size).toBe(3)
  })

  it('admits an older identifier while it still has room', () => {
    const history = new MessageHistory({ capacity: 8 })
    history.admit(at(1000, 15))

    expect(history.admit(at(1000, 5))).toBe('accepted')
  })

  it('forgets everything when the session is replaced', () => {
    const history = new MessageHistory()
    history.admit(at(1000))
    history.clear()

    expect(history.size).toBe(0)
    expect(history.admit(at(1000))).toBe('accepted')
  })

  it('refuses a capacity that could not hold anything', () => {
    for (const capacity of [0, -1, 1.5]) {
      expect(() => new MessageHistory({ capacity })).toThrow(ValidationError)
    }
  })

  it('stays bounded under sustained traffic', () => {
    const history = new MessageHistory({ capacity: 64 })
    for (let index = 0; index < 10_000; index += 1) history.admit(at(1000 + index, 1))

    expect(history.size).toBe(64)
  })
})

describe('the acceptance window', () => {
  const now = 1_700_000_000

  it('accepts a message created now', () => {
    expect(withinAcceptanceWindow(at(now), now)).toBe(true)
  })

  it('accepts the edges of the window', () => {
    expect(withinAcceptanceWindow(at(now + 30), now)).toBe(true)
    expect(withinAcceptanceWindow(at(now - 300), now)).toBe(true)
  })

  it('refuses a message dated past either edge', () => {
    expect(withinAcceptanceWindow(at(now + 31), now)).toBe(false)
    expect(withinAcceptanceWindow(at(now - 301), now)).toBe(false)
  })

  it('is asymmetric, because clocks drift backwards more readily', () => {
    expect(withinAcceptanceWindow(at(now + 120), now)).toBe(false)
    expect(withinAcceptanceWindow(at(now - 120), now)).toBe(true)
  })

  it('reads the embedded time as unsigned', () => {
    // An identifier created past January 2038 is carried as a negative long.
    // Reading its high word as signed would place it before the epoch and
    // refuse every message from that point onward.
    const future = 3_000_000_000
    const msgId = BigInt.asIntN(64, (BigInt(future) << 32n) | 1n)

    expect(msgId).toBeLessThan(0n)
    expect(withinAcceptanceWindow(msgId, future)).toBe(true)
  })
})
