// SPDX-License-Identifier: MPL-2.0

/**
 * Durable authorization state.
 *
 * Persisted state is attacker-controlled wherever a file can be replaced, so
 * the cases that matter are the ones where what comes back is not what was
 * written. The rule throughout is that unreadable is not the same as absent:
 * absent means sign in again, and answering that for a key that merely failed
 * to decode discards a working authorization.
 *
 * Restoration is checked end to end against the layers above, to show which
 * state crosses a restart and which deliberately does not.
 */

import { memory } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { AuthKey } from '../src/message/auth-key.js'
import { Session } from '../src/session/session.js'
import { authorizationStore, StorageError } from '../src/storage/authorization.js'

/** A key that is distinguishable from any other in these tests. */
function keyBytes(fill: number): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, index) => (index + fill) & 0xff)
}

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A store over a fresh in-memory driver. */
function store() {
  const kv = memory()
  return { kv, store: authorizationStore(kv) }
}

describe('what is kept', () => {
  it('returns a key exactly as it was written', async () => {
    const { store: subject } = store()
    const key = keyBytes(7)

    await subject.setKey(2, key)
    expect(hex((await subject.key(2)) ?? new Uint8Array(0))).toBe(hex(key))
  })

  it('keeps datacenters apart', async () => {
    const { store: subject } = store()
    await subject.setKey(2, keyBytes(1))
    await subject.setKey(4, keyBytes(9))

    expect(hex((await subject.key(2)) ?? new Uint8Array(0))).toBe(hex(keyBytes(1)))
    expect(hex((await subject.key(4)) ?? new Uint8Array(0))).toBe(hex(keyBytes(9)))
  })

  it('knows nothing about a datacenter never used', async () => {
    const { store: subject } = store()

    expect(await subject.key(5)).toBeUndefined()
    expect(await subject.salt(5)).toBeUndefined()
  })

  it('carries a salt through the whole signed range', async () => {
    // A salt is a signed 64-bit value. A number would lose the low bits, so the
    // encoding is checked at both ends of the range rather than in the middle.
    const { store: subject } = store()

    for (const salt of [0n, -1n, 1n, 2n ** 63n - 1n, -(2n ** 63n), 0x0bad_5a17_0bad_5a17n]) {
      await subject.setSalt(2, salt)
      expect(await subject.salt(2), String(salt)).toBe(salt)
    }
  })

  it('replaces a key rather than accumulating them', async () => {
    const { kv, store: subject } = store()
    await subject.setKey(2, keyBytes(1))
    await subject.setKey(2, keyBytes(2))

    expect(hex((await subject.key(2)) ?? new Uint8Array(0))).toBe(hex(keyBytes(2)))
    expect(await kv.get('dc2:key')).toBeTypeOf('string')
  })

  it('forgets a key when asked', async () => {
    const { store: subject } = store()
    await subject.setKey(2, keyBytes(1))
    await subject.setKey(2, undefined)

    expect(await subject.key(2)).toBeUndefined()
  })

  it('forgets everything held for a datacenter', async () => {
    const { store: subject } = store()
    await subject.setKey(2, keyBytes(1))
    await subject.setSalt(2, 99n)
    await subject.setTemporaryKey(2, 0, keyBytes(3), 5000)
    await subject.setKey(4, keyBytes(5))

    await subject.forget(2)

    expect(await subject.key(2)).toBeUndefined()
    expect(await subject.salt(2)).toBeUndefined()
    expect(await subject.temporaryKey(2, 0, 0)).toBeUndefined()
    // Another datacenter is untouched.
    expect(await subject.key(4)).toBeDefined()
  })
})

describe('temporary keys', () => {
  it('are returned with the moment they stop being valid', async () => {
    const { store: subject } = store()
    await subject.setTemporaryKey(2, 0, keyBytes(4), 5000)

    // A caller holding the key also has to know when it runs out, to decide
    // whether to replace it and to say so again when vouching for it. Reading
    // the record twice would leave the two answers able to disagree.
    expect((await subject.temporaryKey(2, 0, 0))?.expires).toBe(5000)
  })

  it('are returned while they are still live', async () => {
    const { store: subject } = store()
    await subject.setTemporaryKey(2, 0, keyBytes(4), 5000)

    expect(hex((await subject.temporaryKey(2, 0, 4999))?.key ?? new Uint8Array(0))).toBe(
      hex(keyBytes(4)),
    )
  })

  it('are withheld at and past their expiry', async () => {
    // Judged at the moment it is asked for, because a stored key outlives the
    // process that wrote it and no timer survives with it.
    const { store: subject } = store()
    await subject.setTemporaryKey(2, 0, keyBytes(4), 5000)

    expect(await subject.temporaryKey(2, 0, 5000)).toBeUndefined()
    expect(await subject.temporaryKey(2, 0, 5001)).toBeUndefined()
  })

  it('are held separately per index', async () => {
    const { store: subject } = store()
    await subject.setTemporaryKey(2, 0, keyBytes(1), 5000)
    await subject.setTemporaryKey(2, 1, keyBytes(2), 5000)

    expect(hex((await subject.temporaryKey(2, 0, 0))?.key ?? new Uint8Array(0))).toBe(
      hex(keyBytes(1)),
    )
    expect(hex((await subject.temporaryKey(2, 1, 0))?.key ?? new Uint8Array(0))).toBe(
      hex(keyBytes(2)),
    )
  })

  it('can be forgotten', async () => {
    const { store: subject } = store()
    await subject.setTemporaryKey(2, 0, keyBytes(1), 5000)
    await subject.setTemporaryKey(2, 0, undefined, 0)

    expect(await subject.temporaryKey(2, 0, 0)).toBeUndefined()
  })

  it('are written with the clock their expiry is on', async () => {
    const { kv, store: subject } = store()
    await subject.setTemporaryKey(2, 0, keyBytes(4), 5000)

    expect(await kv.get('dc2:temp0')).toMatchObject({ expires: 5000, clock: 'local' })
  })

  it('are not used when an earlier build wrote them, whatever their expiry says', async () => {
    // An earlier build put the expiry on the server's clock and kept no record
    // of the offset, so the number cannot be read on this clock. The key is
    // withheld rather than guessed at; the record itself is left for the next
    // key to replace.
    const { kv, store: subject } = store()
    const legacy = { key: Buffer.from(keyBytes(4)).toString('base64'), expires: 9_999_999_999 }
    await kv.set('dc2:temp0', legacy)

    expect(await subject.temporaryKey(2, 0, 0)).toBeUndefined()
    expect(await subject.temporaryKey(2, 0, 5000)).toBeUndefined()
    expect(await kv.get('dc2:temp0')).toEqual(legacy)
  })
})

describe('state that will not decode', () => {
  it('refuses a key stored as something other than text', async () => {
    const { kv, store: subject } = store()
    await kv.set('dc2:key', 42)

    await expect(subject.key(2)).rejects.toThrow(/not text/)
  })

  it('refuses a key of the wrong length', async () => {
    // Base64 accepts input that decodes to a length other than the one it
    // implies, so the decoded width is what decides.
    const { kv, store: subject } = store()
    await kv.set('dc2:key', Buffer.from(new Uint8Array(255)).toString('base64'))

    await expect(subject.key(2)).rejects.toThrow(/decodes to 255 bytes/)
  })

  it('refuses an encoded value far larger than a key', async () => {
    // Bounded before the decode allocates from it.
    const { kv, store: subject } = store()
    await kv.set('dc2:key', 'A'.repeat(100_000))

    await expect(subject.key(2)).rejects.toThrow(/far past a key/)
  })

  it('refuses a truncated key', async () => {
    const { kv, store: subject } = store()
    const encoded = Buffer.from(keyBytes(1)).toString('base64')
    await kv.set('dc2:key', encoded.slice(0, 40))

    await expect(subject.key(2)).rejects.toThrow(StorageError)
  })

  it('refuses a salt that is not a number', async () => {
    const { kv, store: subject } = store()
    await kv.set('dc2:salt', 'not a salt')

    await expect(subject.salt(2)).rejects.toThrow(/is not a number/)
  })

  it('refuses a salt field that is empty or blank', async () => {
    // The conversion turns an empty string into zero, so a truncated field
    // would come back as a usable salt rather than as the damage it is.
    for (const stored of ['', '   ', '	']) {
      const { kv, store: subject } = store()
      await kv.set('dc2:salt', stored)

      await expect(subject.salt(2), JSON.stringify(stored)).rejects.toThrow(/is not a number/)
    }
  })

  it('refuses a salt that is not written the way it is stored', async () => {
    // Hexadecimal, surrounding space and a leading plus all parse, and none is
    // a form this store ever writes. Accepting them would mean the stored
    // representation is not the one that comes back.
    for (const stored of ['0x10', ' 5 ', '+7', '007', '1.0', '1e3']) {
      const { kv, store: subject } = store()
      await kv.set('dc2:salt', stored)

      await expect(subject.salt(2), stored).rejects.toThrow(/is not a number/)
    }
  })

  it('still accepts every form it does write', async () => {
    const { kv, store: subject } = store()

    for (const salt of [0n, -1n, 1n, 2n ** 63n - 1n, -(2n ** 63n)]) {
      await kv.set('dc2:salt', salt.toString())
      expect(await subject.salt(2), String(salt)).toBe(salt)
    }
  })

  it('refuses a salt outside the field that carries it', async () => {
    const { kv, store: subject } = store()
    await kv.set('dc2:salt', (2n ** 63n).toString())

    await expect(subject.salt(2)).rejects.toThrow(/does not fit the field/)
  })

  it('refuses a salt stored as something other than text', async () => {
    const { kv, store: subject } = store()
    await kv.set('dc2:salt', { value: 5 })

    await expect(subject.salt(2)).rejects.toThrow(/not text/)
  })

  it('refuses a temporary key with no usable expiry', async () => {
    const { kv, store: subject } = store()
    await kv.set('dc2:temp0', { key: Buffer.from(keyBytes(1)).toString('base64') })

    await expect(subject.temporaryKey(2, 0, 0)).rejects.toThrow(/no usable expiry/)
  })

  it('refuses a temporary record that is not a record', async () => {
    const { kv, store: subject } = store()
    await kv.set('dc2:temp0', ['not', 'a', 'record'])

    await expect(subject.temporaryKey(2, 0, 0)).rejects.toThrow(/not a stored record/)
  })

  it('refuses to write a key that is not one', async () => {
    const { store: subject } = store()

    await expect(subject.setKey(2, new Uint8Array(255))).rejects.toThrow(/must be 256 bytes/)
  })

  it('never reports unreadable state as absent', async () => {
    // The distinction is the whole point: absent means sign in again, and
    // answering that for a key that merely failed to decode throws away a
    // working authorization.
    const { kv, store: subject } = store()
    await kv.set('dc2:key', 'corrupt')

    await expect(subject.key(2)).rejects.toThrow(StorageError)
  })
})

describe('resuming after a restart', () => {
  /** Everything a restarted process would reload. */
  async function restore(kv: ReturnType<typeof memory>) {
    const subject = authorizationStore(kv)
    const key = await subject.key(2)
    const salt = await subject.salt(2)
    if (key === undefined || salt === undefined) throw new Error('nothing to resume from')

    return { authKey: AuthKey.from(key), salt }
  }

  it('restores the key that was established', async () => {
    const kv = memory()
    const subject = authorizationStore(kv)
    const original = AuthKey.from(keyBytes(11))

    await subject.setKey(2, keyBytes(11))
    await subject.setSalt(2, 0x1234_5678_9abc_def0n)

    const resumed = await restore(kv)
    expect(hex(resumed.authKey.id)).toBe(hex(original.id))
    expect(resumed.salt).toBe(0x1234_5678_9abc_def0n)
  })

  it('opens a new session rather than resuming the old one', async () => {
    // A session belongs to one connection. Restoring an identifier with its
    // counter back at zero recreates the disagreement the server answers by
    // discarding messages.
    const kv = memory()
    await authorizationStore(kv).setKey(2, keyBytes(11))
    await authorizationStore(kv).setSalt(2, 5n)

    const before = new Session({ salt: 5n })
    before.nextSeqNo(true)

    const resumed = await restore(kv)
    const after = new Session({ salt: resumed.salt })

    expect(after.id).not.toBe(before.id)
    expect(after.contentSent).toBe(0)
    expect(after.salt).toBe(5n)
  })

  it('produces identifiers that still move forward', async () => {
    const kv = memory()
    await authorizationStore(kv).setKey(2, keyBytes(11))
    await authorizationStore(kv).setSalt(2, 5n)

    const resumed = await restore(kv)
    const session = new Session({ salt: resumed.salt, now: () => 1_700_000_000_000 })

    const first = session.nextMsgId()
    const second = session.nextMsgId()
    expect(second).toBeGreaterThan(first)
    expect(first % 4n).toBe(0n)
  })

  it('carries no clock correction across the restart', async () => {
    // The correction is only true relative to the clock it was measured
    // against, and that clock may have been fixed while the process was down.
    const kv = memory()
    await authorizationStore(kv).setKey(2, keyBytes(11))
    await authorizationStore(kv).setSalt(2, 5n)

    const before = new Session({ salt: 5n, timeOffset: 500 })
    expect(before.timeOffset).toBe(500)

    const resumed = await restore(kv)
    expect(new Session({ salt: resumed.salt }).timeOffset).toBe(0)
  })

  it('keeps the salt that was last recorded', async () => {
    const kv = memory()
    const subject = authorizationStore(kv)
    await subject.setKey(2, keyBytes(11))
    await subject.setSalt(2, 1n)
    await subject.setSalt(2, 0x0bad_5a17_0bad_5a17n)

    expect((await restore(kv)).salt).toBe(0x0bad_5a17_0bad_5a17n)
  })

  it('refuses to resume once the authorization has been forgotten', async () => {
    // A reset must not leave the old authorization usable.
    const kv = memory()
    const subject = authorizationStore(kv)
    await subject.setKey(2, keyBytes(11))
    await subject.setSalt(2, 5n)
    await subject.forget(2)

    await expect(restore(kv)).rejects.toThrow(/nothing to resume from/)
  })
})

describe('writing concurrently', () => {
  it('leaves the last write standing', async () => {
    const { store: subject } = store()

    await Promise.all([subject.setSalt(2, 1n), subject.setSalt(2, 2n), subject.setSalt(2, 3n)])

    // Each write is whole; which one lands last is the caller's ordering to
    // decide, and one of them is always what is read back.
    expect([1n, 2n, 3n]).toContain(await subject.salt(2))
  })

  it('reads back what a write just committed', async () => {
    const { store: subject } = store()
    await subject.setKey(2, keyBytes(3))

    expect(hex((await subject.key(2)) ?? new Uint8Array(0))).toBe(hex(keyBytes(3)))
  })

  it('reports a store that cannot be written', async () => {
    // A write failure is surfaced, never swallowed: continuing without the key
    // stored means signing in again on the next start.
    const failing = {
      ...memory(),
      set: () => Promise.reject(new Error('disk full')),
    }

    await expect(authorizationStore(failing).setKey(2, keyBytes(1))).rejects.toThrow(/disk full/)
  })

  it('reports a store that cannot be read', async () => {
    const failing = {
      ...memory(),
      get: () => Promise.reject(new Error('device gone')),
    }

    await expect(authorizationStore(failing).key(2)).rejects.toThrow(/device gone/)
  })
})
