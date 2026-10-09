// SPDX-License-Identifier: MPL-2.0

/**
 * The salts a connection keeps in reserve.
 *
 * A salt decides whether the server will accept a message at all, so every rule
 * here is about not ending up without a usable one: a window that has closed is
 * not supply, a duplicate is not supply, and an answer that does not belong to
 * the query that asked for it is not supply either.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import {
  type FutureSalt,
  getFutureSalts,
  readFutureSalts,
  SaltReservoir,
} from '../src/session/salts.js'
import { readObject, TlScope, type TlValue } from '../src/tl/index.js'

const SCOPE = new TlScope('session', [CORE, MTPROTO])

/** A salt valid across the given window. */
function salt(validSince: number, validUntil: number, value: bigint): FutureSalt {
  return { validSince, validUntil, salt: value }
}

/** What the server sends, as a decoded value. */
function answer(reqMsgId: bigint, salts: readonly FutureSalt[]): TlValue {
  return {
    _: 'future_salts',
    req_msg_id: reqMsgId,
    now: 1000,
    salts: salts.map((entry) => ({
      _: 'future_salt',
      valid_since: entry.validSince,
      valid_until: entry.validUntil,
      salt: entry.salt,
    })),
  }
}

describe('asking for salts', () => {
  it('builds a query the codec reads back', () => {
    const query = getFutureSalts(SCOPE, 32)

    expect(readObject(query, SCOPE)).toEqual({ _: 'get_future_salts', num: 32 })
  })

  it('asks for as few as one and as many as sixty-four', () => {
    expect(() => getFutureSalts(SCOPE, 1)).not.toThrow()
    expect(() => getFutureSalts(SCOPE, 64)).not.toThrow()
  })

  it('refuses a count outside what the protocol allows', () => {
    expect(() => getFutureSalts(SCOPE, 0)).toThrow(ValidationError)
    expect(() => getFutureSalts(SCOPE, 65)).toThrow(ValidationError)
    expect(() => getFutureSalts(SCOPE, -1)).toThrow(ValidationError)
    expect(() => getFutureSalts(SCOPE, 1.5)).toThrow(ValidationError)
  })
})

describe('reading an answer', () => {
  it('recovers the salts and their windows', () => {
    const offered = [salt(100, 200, 7n), salt(200, 300, 8n)]

    expect(readFutureSalts(answer(5n, offered), 5n)).toEqual(offered)
  })

  it('refuses one that answers a different query', () => {
    // The protocol requires this comparison. Salts decide which messages the
    // server accepts, so an answer taken without it is one nobody asked for.
    expect(() => readFutureSalts(answer(5n, [salt(100, 200, 7n)]), 6n)).toThrow(/not the query/)
  })

  it('refuses a value that is not an answer carrying salts', () => {
    expect(() => readFutureSalts({ _: 'pong', msg_id: 1n, ping_id: 2n }, 1n)).toThrow(
      /not an answer carrying salts/,
    )
  })

  it('refuses an element that is not a salt', () => {
    const malformed = { ...answer(5n, []), salts: [{ _: 'pong', msg_id: 1n, ping_id: 2n }] }

    expect(() => readFutureSalts(malformed, 5n)).toThrow(/salt 0 is a 'pong'/)
  })

  it('refuses a salt that does not state its window', () => {
    const malformed = {
      ...answer(5n, []),
      salts: [{ _: 'future_salt', valid_since: 1, salt: 7n }],
    }

    expect(() => readFutureSalts(malformed, 5n)).toThrow(/window it is valid in/)
  })

  it('refuses a salt that is not a 64-bit value', () => {
    const malformed = {
      ...answer(5n, []),
      salts: [{ _: 'future_salt', valid_since: 1, valid_until: 2, salt: 7 }],
    }

    expect(() => readFutureSalts(malformed, 5n)).toThrow(/not a 64-bit value/)
  })

  it('accepts an answer that carries none, which the server may send', () => {
    // The server returns "a maximum of num" salts and may return fewer.
    expect(readFutureSalts(answer(5n, []), 5n)).toEqual([])
  })
})

describe('holding salts', () => {
  it('keeps what it is offered', () => {
    const reservoir = new SaltReservoir()

    expect(reservoir.offer([salt(100, 200, 7n), salt(200, 300, 8n)], 50)).toBe(2)
    expect(reservoir.size).toBe(2)
  })

  it('orders them by the second each becomes valid', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(300, 400, 9n), salt(100, 200, 7n), salt(200, 300, 8n)], 50)

    expect(reservoir.held().map((entry) => entry.salt)).toEqual([7n, 8n, 9n])
  })

  it('discards one whose window has already closed', () => {
    const reservoir = new SaltReservoir()

    expect(reservoir.offer([salt(0, 100, 7n), salt(100, 200, 8n)], 150)).toBe(1)
    expect(reservoir.held().map((entry) => entry.salt)).toEqual([8n])
  })

  it('discards one whose window is inverted, which can never apply', () => {
    const reservoir = new SaltReservoir()

    expect(reservoir.offer([salt(300, 100, 7n)], 50)).toBe(0)
    expect(reservoir.size).toBe(0)
  })

  it('discards one whose window is empty', () => {
    const reservoir = new SaltReservoir()

    expect(reservoir.offer([salt(100, 100, 7n)], 50)).toBe(0)
  })

  it('does not keep the same salt twice', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n)], 50)

    // A server may repeat a salt across two answers. Counted twice, it would
    // report supply the connection does not have.
    expect(reservoir.offer([salt(100, 200, 7n), salt(200, 300, 8n)], 50)).toBe(1)
    expect(reservoir.size).toBe(2)
  })

  it('stops at sixty-four, however many are offered', () => {
    const reservoir = new SaltReservoir()
    const offered = Array.from({ length: 100 }, (_, index) =>
      salt(100 + index, 200 + index, BigInt(index + 1)),
    )

    expect(reservoir.offer(offered, 50)).toBe(64)
    expect(reservoir.size).toBe(64)
  })
})

describe('the salt in force', () => {
  it('is the one whose window covers the moment', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n), salt(200, 300, 8n)], 50)

    expect(reservoir.inForce(150)).toBe(7n)
    expect(reservoir.inForce(250)).toBe(8n)
  })

  it('is none before the first window opens', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n)], 50)

    expect(reservoir.inForce(50)).toBeUndefined()
  })

  it('is none after the last window closes', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n)], 50)

    expect(reservoir.inForce(200)).toBeUndefined()
  })

  it('applies from the first second of the window and not the last', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n)], 50)

    expect(reservoir.inForce(99)).toBeUndefined()
    expect(reservoir.inForce(100)).toBe(7n)
    expect(reservoir.inForce(199)).toBe(7n)
    expect(reservoir.inForce(200)).toBeUndefined()
  })

  it('is the newer one where two windows overlap', () => {
    const reservoir = new SaltReservoir()
    // An old salt stays acceptable for a further half hour after the new one
    // takes over, so the windows overlap while one replaces the other — and a
    // message sent in that period carries the new salt.
    reservoir.offer([salt(100, 400, 7n), salt(200, 500, 8n)], 50)

    expect(reservoir.inForce(150)).toBe(7n)
    expect(reservoir.inForce(250)).toBe(8n)
    expect(reservoir.inForce(450)).toBe(8n)
  })

  it('steps over an expired salt sitting before a valid one', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n), salt(100, 900, 8n)], 50)

    expect(reservoir.inForce(500)).toBe(8n)
  })
})

describe('knowing when to ask for more', () => {
  it('reports a low supply when nothing is held', () => {
    expect(new SaltReservoir().lowOnSalts(0)).toBe(true)
  })

  it('counts only the salts that are still usable', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n), salt(200, 300, 8n), salt(300, 400, 9n)], 50)

    expect(reservoir.usable(50)).toBe(3)
    expect(reservoir.lowOnSalts(50)).toBe(false)

    // Two windows have closed by now, leaving one — below the reserve.
    expect(reservoir.usable(350)).toBe(1)
    expect(reservoir.lowOnSalts(350)).toBe(true)
  })

  it('is satisfied by exactly the reserve and not by one fewer', () => {
    const reservoir = new SaltReservoir({ reserve: 3 })
    reservoir.offer([salt(100, 200, 7n), salt(200, 300, 8n)], 50)
    expect(reservoir.lowOnSalts(50)).toBe(true)

    reservoir.offer([salt(300, 400, 9n)], 50)
    expect(reservoir.lowOnSalts(50)).toBe(false)
  })

  it('refuses a reserve that would never be satisfied', () => {
    expect(() => new SaltReservoir({ reserve: 0 })).toThrow(ValidationError)
    expect(() => new SaltReservoir({ reserve: -1 })).toThrow(ValidationError)
    expect(() => new SaltReservoir({ reserve: 1.5 })).toThrow(ValidationError)
  })
})

describe('reclaiming space', () => {
  it('drops the salts whose windows have closed', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n), salt(200, 300, 8n)], 50)

    expect(reservoir.forgetExpired(250)).toBe(1)
    expect(reservoir.held().map((entry) => entry.salt)).toEqual([8n])
  })

  it('keeps a long-lived connection able to accept new salts', () => {
    const reservoir = new SaltReservoir()
    // Filled to capacity with salts that then expire. Without reclaiming, the
    // reservoir would be permanently full of values it can never select.
    reservoir.offer(
      Array.from({ length: 64 }, (_, index) => salt(100, 200, BigInt(index + 1))),
      50,
    )
    expect(reservoir.offer([salt(300, 400, 900n)], 50)).toBe(0)

    reservoir.forgetExpired(250)
    expect(reservoir.offer([salt(300, 400, 900n)], 250)).toBe(1)
    expect(reservoir.inForce(350)).toBe(900n)
  })

  it('changes no answer, because selection already steps over them', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n), salt(200, 300, 8n)], 50)

    const before = reservoir.inForce(250)
    reservoir.forgetExpired(250)

    expect(reservoir.inForce(250)).toBe(before)
  })

  it('forgets everything when the connection moves elsewhere', () => {
    const reservoir = new SaltReservoir()
    reservoir.offer([salt(100, 200, 7n)], 50)
    reservoir.clear()

    expect(reservoir.size).toBe(0)
    expect(reservoir.inForce(150)).toBeUndefined()
  })
})
