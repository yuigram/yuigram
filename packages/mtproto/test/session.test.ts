/**
 * An account carried in a string.
 *
 * The cases here are about the shape of that string and about refusing
 * everything that is not exactly one. A session is a bearer credential: the
 * account it names is signed in for as long as anyone holds it, so what reads
 * one has to be exact about what it accepts and silent about what it read.
 *
 * Nothing here touches a network. The codec is pure, and the cases that need an
 * account use one that opens nothing.
 */

import { memory } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Account } from '../src/account.js'
import type { DcConfiguration } from '../src/network/dc.js'
import { decodeSession, encodeSession } from '../src/session.js'

/** A key of the right shape. Its content matters to nothing here. */
const key = (seed: number): Uint8Array =>
  Uint8Array.from({ length: 256 }, (_, index) => (seed * 101 + index * 7 + 3) & 0xff)

const bootstrap = (testMode: boolean, thisDc = 2): DcConfiguration => ({
  thisDc,
  testMode,
  options: [2, 4].map((id) => ({
    id,
    host: `10.0.0.${id}`,
    port: 443,
    ipv6: false,
    mediaOnly: false,
    cdn: false,
    secret: undefined,
    tcpoOnly: false,
    thisPortOnly: false,
    static: false,
  })),
})

/** Every key a store currently holds, in order, so a case can read them. */
async function held(storage: ReturnType<typeof memory>): Promise<string[]> {
  const names: string[] = []
  for await (const name of storage.keys?.() ?? []) names.push(name)

  return names.toSorted()
}

/** Everything an account needs besides the session itself. */
const options = (testMode = false) => ({
  apiId: 1234,
  apiHash: 'hash',
  keys: [],
  bootstrap: bootstrap(testMode),
  storage: memory(),
})

const SESSION = encodeSession({ dcId: 2, testMode: false, authKey: key(1) })

/** Replace one character, leaving the length and the alphabet intact. */
const swap = (session: string, at: number, character: string): string =>
  session.slice(0, at) + character + session.slice(at + 1)

describe('the shape of a session string', () => {
  it('is 348 characters', () => {
    expect(SESSION).toHaveLength(348)
  })

  it('ends with the padding its length requires', () => {
    expect(SESSION.endsWith('==')).toBe(true)
  })

  it('uses the standard alphabet rather than the one for URLs', () => {
    expect(SESSION.slice(0, -2)).toMatch(/^[A-Za-z0-9+/]+$/)
  })

  it('decodes to 259 bytes', () => {
    expect(Buffer.from(SESSION, 'base64')).toHaveLength(259)
  })

  it('carries the version, the flags, the datacenter and the key, in that order', () => {
    const payload = new Uint8Array(Buffer.from(SESSION, 'base64'))

    expect(payload[0]).toBe(0x01)
    expect(payload[1]).toBe(0)
    expect(payload[2]).toBe(2)
    expect(payload.slice(3)).toEqual(key(1))
  })

  it('marks the test network in the flags', () => {
    const payload = new Uint8Array(
      Buffer.from(encodeSession({ dcId: 2, testMode: true, authKey: key(1) }), 'base64'),
    )

    expect(payload[1]).toBe(0b0000_0001)
  })

  it('writes the same string every time', () => {
    // Determinism is what makes the round trip assertable at all: nothing here
    // is timestamped, randomised, or ordered by a map.
    expect(encodeSession({ dcId: 2, testMode: false, authKey: key(1) })).toBe(SESSION)
  })

  it('writes a different string for a different datacenter', () => {
    expect(encodeSession({ dcId: 4, testMode: false, authKey: key(1) })).not.toBe(SESSION)
  })
})

describe('reading a session back', () => {
  it('returns what was written', () => {
    expect(decodeSession(SESSION)).toEqual({ dcId: 2, testMode: false, authKey: key(1) })
  })

  it('returns the same string when written again', () => {
    expect(encodeSession(decodeSession(SESSION))).toBe(SESSION)
  })

  it('survives the round trip for every datacenter a byte can name', () => {
    for (const dcId of [1, 2, 5, 127, 128, 255]) {
      const session = encodeSession({ dcId, testMode: false, authKey: key(dcId) })

      expect(decodeSession(session)).toEqual({ dcId, testMode: false, authKey: key(dcId) })
    }
  })

  it('survives the round trip on the test network', () => {
    const session = encodeSession({ dcId: 2, testMode: true, authKey: key(9) })

    expect(decodeSession(session).testMode).toBe(true)
  })
})

describe('a string that is not a session', () => {
  it('refuses an empty one', () => {
    expect(() => decodeSession('')).toThrow(/empty/)
  })

  it('refuses one that is only whitespace', () => {
    expect(() => decodeSession('   \n\t  ')).toThrow(/empty/)
  })

  it('refuses one carrying a character outside the alphabet', () => {
    expect(() => decodeSession(swap(SESSION, 10, '!'))).toThrow(/not base64/)
  })

  it('refuses the alphabet meant for URLs', () => {
    // A session written for a URL decodes to different bytes. Accepting both
    // would let one account have two strings.
    expect(() => decodeSession(swap(SESSION, 10, '-'))).toThrow(/not base64/)
    expect(() => decodeSession(swap(SESSION, 10, '_'))).toThrow(/not base64/)
  })

  it('refuses one whose padding was stripped', () => {
    expect(() => decodeSession(SESSION.slice(0, -2))).toThrow(/incomplete/)
  })

  it('refuses one padded in the wrong place', () => {
    expect(() => decodeSession(swap(SESSION, 10, '='))).toThrow(/not base64/)
  })

  it('refuses one whose spare bits are not spare', () => {
    // The last character carries two bits of the payload and four of nothing.
    // Setting them decodes to the same bytes, so a session that allowed it
    // would have more than one string.
    const payload = new Uint8Array(Buffer.from(SESSION, 'base64'))
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const spare = alphabet.indexOf(SESSION[345] as string)
    const damaged = swap(SESSION, 345, alphabet[spare | 0b0001] as string)

    expect(damaged).not.toBe(SESSION)
    expect(new Uint8Array(Buffer.from(damaged, 'base64'))).toEqual(payload)
    expect(() => decodeSession(damaged)).toThrow(/bits that are not part of it/)
  })

  it('refuses one cut short', () => {
    expect(() => decodeSession(SESSION.slice(0, 200))).toThrow(/incomplete/)
  })

  it('refuses one with something after it', () => {
    expect(() => decodeSession(`${SESSION}AAAA`)).toThrow(/incomplete/)
  })

  it('refuses a version it does not write', () => {
    const payload = new Uint8Array(Buffer.from(SESSION, 'base64'))
    payload[0] = 0x02

    expect(() => decodeSession(Buffer.from(payload).toString('base64'))).toThrow(/version 2/)
  })

  it('refuses flags it does not know about', () => {
    const payload = new Uint8Array(Buffer.from(SESSION, 'base64'))
    payload[1] = 0b0000_0010

    expect(() => decodeSession(Buffer.from(payload).toString('base64'))).toThrow(/flags/)
  })

  it('refuses one that names no datacenter', () => {
    const payload = new Uint8Array(Buffer.from(SESSION, 'base64'))
    payload[2] = 0

    expect(() => decodeSession(Buffer.from(payload).toString('base64'))).toThrow(/no datacenter/)
  })

  it('refuses to write a key of the wrong shape', () => {
    expect(() => encodeSession({ dcId: 2, testMode: false, authKey: new Uint8Array(8) })).toThrow(
      /256 bytes/,
    )
  })

  it('refuses to write a datacenter a byte cannot name', () => {
    for (const dcId of [0, -1, 256, 1.5]) {
      expect(() => encodeSession({ dcId, testMode: false, authKey: key(1) })).toThrow(/1 to 255/)
    }
  })
})

describe('what a refusal says', () => {
  /** Every way of being wrong, and the message each produces. */
  const refusals = (): string[] => {
    const payload = new Uint8Array(Buffer.from(SESSION, 'base64'))
    const damaged = (at: number, value: number) => {
      const copy = new Uint8Array(payload)
      copy[at] = value

      return Buffer.from(copy).toString('base64')
    }

    const attempts: Array<() => unknown> = [
      () => decodeSession(''),
      () => decodeSession(swap(SESSION, 10, '!')),
      () => decodeSession(SESSION.slice(0, 200)),
      () => decodeSession(`${SESSION}AAAA`),
      () => decodeSession(damaged(0, 0x02)),
      () => decodeSession(damaged(1, 0b0000_0010)),
      () => decodeSession(damaged(2, 0)),
      () => encodeSession({ dcId: 2, testMode: false, authKey: new Uint8Array(8) }),
    ]

    return attempts.map((attempt) => {
      try {
        attempt()
      } catch (error) {
        return (error as Error).message
      }

      throw new Error('the attempt was expected to fail and did not')
    })
  }

  it('never repeats the session it was given', () => {
    // An error travels: into a log, a crash report, a bug tracker. A message
    // carrying the string would put a logged-in account in all three.
    for (const message of refusals()) {
      expect(message).not.toContain(SESSION)
      expect(message).not.toContain(SESSION.slice(0, 40))
    }
  })

  it('never repeats the key', () => {
    const encoded = Buffer.from(key(1)).toString('base64')

    for (const message of refusals()) {
      expect(message).not.toContain(encoded)
      expect(message).not.toContain(encoded.slice(0, 24))
    }
  })

  it('says which kind of wrong it was', () => {
    // Useless secrecy would be a message that said nothing. Each of these names
    // the category, and none names the material.
    expect(refusals()).toEqual([
      expect.stringMatching(/empty/),
      expect.stringMatching(/not base64/),
      expect.stringMatching(/incomplete/),
      expect.stringMatching(/incomplete/),
      expect.stringMatching(/version/),
      expect.stringMatching(/flags/),
      expect.stringMatching(/datacenter/),
      expect.stringMatching(/256 bytes/),
    ])
  })
})

describe('building an account from a session', () => {
  it('reads the string where it was passed', () => {
    // Not on the first connection, which is somewhere else entirely and long
    // after whoever passed the string has stopped looking.
    expect(() => Account.fromString('not a session', options())).toThrow(/348 characters/)
  })

  it('refuses a session for the other network', () => {
    const session = encodeSession({ dcId: 2, testMode: true, authKey: key(1) })

    expect(() => Account.fromString(session, options(false))).toThrow(/test network/)
  })

  it('refuses a production session against test addresses', () => {
    expect(() => Account.fromString(SESSION, options(true))).toThrow(/production network/)
  })

  it('takes the datacenter from the session rather than the addresses', async () => {
    // The bootstrap says where to start looking; the session says whose key
    // this is. An account that preferred the bootstrap would file the key under
    // a datacenter it does not belong to.
    const session = encodeSession({ dcId: 4, testMode: false, authKey: key(3) })
    const account = Account.fromString(session, { ...options(), name: 'me' })

    await account.connect()

    expect(await account.exportSession()).toBe(session)
    await account.stop()
  })

  it('keeps the store the caller supplied', async () => {
    const storage = memory()
    const account = Account.fromString(SESSION, { ...options(), storage })

    await account.connect()

    // The key is in the caller's store, not in one the account made itself.
    expect(await held(storage)).toContain('auth:dc2:key')
    await account.stop()
  })
})

describe('what an imported session does to a store', () => {
  it('writes the key where the datacenter layer looks for it', async () => {
    const storage = memory()
    const account = Account.fromString(SESSION, { ...options(), storage })

    await account.connect()

    expect(await storage.get('auth:dc2:key')).toBe(Buffer.from(key(1)).toString('base64'))
    await account.stop()
  })

  it('does not write anything until the account is brought up', async () => {
    const storage = memory()
    Account.fromString(SESSION, { ...options(), storage })

    expect(await held(storage)).toEqual([])
  })

  it('clears an authorization somebody else left in the store', async () => {
    // The hazard this exists for: a store carrying a key for another datacenter
    // belongs to whoever was there before. An account that kept it would reach
    // that datacenter as a stranger holding a stranger's key.
    const storage = memory()
    await storage.set('auth:dc4:key', Buffer.from(key(99)).toString('base64'))

    const account = Account.fromString(SESSION, { ...options(), storage })
    await account.connect()

    expect(await storage.get('auth:dc4:key')).toBeUndefined()
    expect(await storage.get('auth:dc2:key')).toBe(Buffer.from(key(1)).toString('base64'))
    await account.stop()
  })

  it('replaces an authorization already held for its own datacenter', async () => {
    const storage = memory()
    await storage.set('auth:dc2:key', Buffer.from(key(99)).toString('base64'))

    const account = Account.fromString(SESSION, { ...options(), storage })
    await account.connect()

    expect(await storage.get('auth:dc2:key')).toBe(Buffer.from(key(1)).toString('base64'))
    await account.stop()
  })

  it('leaves what does not belong to an authorization alone', async () => {
    const storage = memory()
    await storage.set('peers:peer:user:7', { kind: 'user' })

    const account = Account.fromString(SESSION, { ...options(), storage })
    await account.connect()

    expect(await storage.get('peers:peer:user:7')).toEqual({ kind: 'user' })
    await account.stop()
  })

  it('seeds once rather than on every connection', async () => {
    // A second seed would undo whatever the first connection established — the
    // key with a lifetime, the salt — on every reconnection.
    const storage = memory()
    const account = Account.fromString(SESSION, { ...options(), storage })

    await account.connect()
    await account.stop()
    await storage.set('auth:dc4:key', Buffer.from(key(42)).toString('base64'))
    await account.connect()

    expect(await storage.get('auth:dc4:key')).toBe(Buffer.from(key(42)).toString('base64'))
    await account.stop()
  })
})

describe('writing an account out', () => {
  it('refuses when there is no authorization to write', async () => {
    const account = new Account(options())

    await expect(account.exportSession()).rejects.toThrow(/no authorization/)
  })

  it('needs no connection', async () => {
    const storage = memory()
    await storage.set('auth:dc2:key', Buffer.from(key(1)).toString('base64'))
    const account = new Account({ ...options(), storage })

    expect(account.connected).toBe(false)
    expect(await account.exportSession()).toBe(SESSION)
  })

  it('gives the same answer twice', async () => {
    const storage = memory()
    await storage.set('auth:dc2:key', Buffer.from(key(1)).toString('base64'))
    const account = new Account({ ...options(), storage })

    expect(await account.exportSession()).toBe(await account.exportSession())
  })

  it('changes nothing by being asked', async () => {
    const storage = memory()
    await storage.set('auth:dc2:key', Buffer.from(key(1)).toString('base64'))
    const account = new Account({ ...options(), storage })
    const before = await held(storage)

    await account.exportSession()

    expect(await held(storage)).toEqual(before)
  })

  it('writes out what it was built from', async () => {
    const account = Account.fromString(SESSION, options())
    await account.connect()

    expect(await account.exportSession()).toBe(SESSION)
    await account.stop()
  })
})
