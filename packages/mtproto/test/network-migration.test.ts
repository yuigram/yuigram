// SPDX-License-Identifier: MIT

/**
 * Introducing an account to a datacenter that does not know it yet.
 *
 * A redirection says the account lives elsewhere; reaching that datacenter is
 * not enough on its own, because it knows the account only once the one holding
 * it has said so. The cases here are about that exchange: what is asked for,
 * what is checked before it is used, and what is left behind when either half
 * fails.
 *
 * Both ends are stubbed. What travels between them is the whole subject, so
 * every call either end receives is recorded and asserted on.
 */

import { SessionError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { Channel } from '../src/network/channel.js'
import type { ManagedConnection } from '../src/network/connections.js'
import {
  type Callable,
  exportAuthorization,
  importAuthorization,
  readExportedAuthorization,
  transferAuthorization,
} from '../src/network/migration.js'
import type { TlValue } from '../src/tl/index.js'

const CREDENTIAL = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])

/** An end of the exchange that answers whatever a case tells it to. */
function peer(answer: (query: TlValue) => TlValue | Promise<TlValue>) {
  const asked: TlValue[] = []

  return {
    asked,
    invoke: async (query: TlValue) => {
      asked.push(query)

      return answer(query)
    },
  }
}

/** A datacenter that issues credentials and one that accepts them. */
function ends(overrides: { holder?: (query: TlValue) => TlValue | Promise<TlValue> } = {}) {
  const holder = peer(
    overrides.holder ??
      (() => ({ _: 'auth.exportedAuthorization', id: 7n, bytes: CREDENTIAL }) as TlValue),
  )
  const target = peer(() => ({ _: 'auth.authorization' }) as TlValue)

  return { holder, target }
}

describe('what an end of the exchange may be', () => {
  it('is anything that answers calls, which both connections already do', () => {
    // The two ends are not the same kind of thing: one is whatever connection
    // saw the redirection, the other is a connection to the datacenter it
    // named. Both answer calls, and that is all this needs of either.
    const asChannel = (channel: Channel): Callable => channel
    const asManaged = (connection: ManagedConnection): Callable => connection

    expect(typeof asChannel).toBe('function')
    expect(typeof asManaged).toBe('function')
  })
})

describe('asking for a credential', () => {
  it('names the datacenter it is meant for', async () => {
    const { holder } = ends()

    const credential = await exportAuthorization(holder, 4)

    expect(holder.asked).toEqual([{ _: 'auth.exportAuthorization', dc_id: 4 }])
    expect(credential).toEqual({ id: 7n, bytes: CREDENTIAL })
  })

  it('refuses a datacenter that could not be one', async () => {
    const { holder } = ends()

    // Asking for a credential for datacenter zero, or for a fraction of one,
    // spends a round trip to be told what could have been known here.
    for (const dcId of [0, -1, 2.5, Number.NaN]) {
      await expect(exportAuthorization(holder, dcId)).rejects.toBeInstanceOf(SessionError)
    }
    expect(holder.asked).toEqual([])
  })
})

describe('reading a credential', () => {
  it('refuses an answer that is not one', () => {
    expect(() => readExportedAuthorization({ _: 'auth.authorization' })).toThrow(
      /expected an exported authorization/,
    )
  })

  it('refuses one missing the account it is about', () => {
    expect(() =>
      readExportedAuthorization({ _: 'auth.exportedAuthorization', bytes: CREDENTIAL }),
    ).toThrow(/must be a 64-bit integer/)
  })

  it('refuses one missing the proof', () => {
    expect(() => readExportedAuthorization({ _: 'auth.exportedAuthorization', id: 7n })).toThrow(
      /must be a byte string/,
    )
  })

  it('refuses one whose proof is empty', () => {
    // Checked here rather than left to the accepting datacenter, which would
    // refuse it with an error about the request instead of about the
    // credential, naming the wrong problem.
    expect(() =>
      readExportedAuthorization({
        _: 'auth.exportedAuthorization',
        id: 7n,
        bytes: new Uint8Array(0),
      }),
    ).toThrow(/is empty/)
  })
})

describe('presenting a credential', () => {
  it('hands over exactly what was issued', async () => {
    const { target } = ends()

    await importAuthorization(target, { id: 9n, bytes: CREDENTIAL })

    expect(target.asked).toEqual([{ _: 'auth.importAuthorization', id: 9n, bytes: CREDENTIAL }])
  })
})

describe('introducing an account to another datacenter', () => {
  it('issues a credential and spends it, in that order', async () => {
    const order: string[] = []
    const holder = peer((query) => {
      order.push(query._)
      return { _: 'auth.exportedAuthorization', id: 7n, bytes: CREDENTIAL } as TlValue
    })
    const target = peer((query) => {
      order.push(query._)
      return { _: 'auth.authorization' } as TlValue
    })

    await transferAuthorization({ from: holder, to: target, dcId: 5 })

    expect(order).toEqual(['auth.exportAuthorization', 'auth.importAuthorization'])
    expect(holder.asked[0]).toEqual({ _: 'auth.exportAuthorization', dc_id: 5 })
    expect(target.asked[0]).toEqual({
      _: 'auth.importAuthorization',
      id: 7n,
      bytes: CREDENTIAL,
    })
  })

  it('presents nothing when no credential was issued', async () => {
    const holder = peer(() => {
      throw new SessionError('the datacenter refused to issue one')
    })
    const { target } = ends()

    await expect(
      transferAuthorization({ from: holder, to: target, dcId: 5 }),
    ).rejects.toBeInstanceOf(SessionError)

    // Nothing reached the other end, so it has learned nothing and there is
    // nothing half-established to undo.
    expect(target.asked).toEqual([])
  })

  it('reports a credential the other end would not accept', async () => {
    const { holder } = ends()
    const target = peer(() => {
      throw new SessionError('the credential was refused')
    })

    await expect(transferAuthorization({ from: holder, to: target, dcId: 5 })).rejects.toThrow(
      /the credential was refused/,
    )

    // The credential was spent whatever the answer was. Another attempt asks
    // for a new one rather than presenting this one again.
    expect(holder.asked).toHaveLength(1)
  })

  it('keeps nothing between attempts', async () => {
    let issued = 0
    const holder = peer(() => {
      issued += 1
      return {
        _: 'auth.exportedAuthorization',
        id: BigInt(issued),
        bytes: CREDENTIAL,
      } as TlValue
    })
    const { target } = ends()

    await transferAuthorization({ from: holder, to: target, dcId: 5 })
    await transferAuthorization({ from: holder, to: target, dcId: 5 })

    // A credential is valid briefly and only once, so a second introduction
    // asks for a second one.
    expect(issued).toBe(2)
    expect(target.asked.map((query) => query['id'])).toEqual([1n, 2n])
  })
})
