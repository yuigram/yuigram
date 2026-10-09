// SPDX-License-Identifier: MPL-2.0

/**
 * Keeping the peers this account has encountered.
 *
 * An access hash is issued per account and cannot be worked out, so a peer that
 * is forgotten stays unreachable until it happens to arrive again. That makes
 * the write rules the whole subject: what may replace what, and which names
 * still point at a peer afterwards.
 */

import { describe, expect, it } from 'vitest'
import { type PeerRecord, PeerStorageError, peerStore } from '../src/storage/peers.js'

/** A store that keeps what it is given. */
function memory() {
  const values = new Map<string, unknown>()

  return {
    values,
    store: peerStore({
      get: async (key: string) => values.get(key),
      set: async (key: string, value: unknown) => {
        values.set(key, value)
      },
      delete: async (key: string) => {
        values.delete(key)
      },
    }),
  }
}

/** A peer known well enough to be reached on its own. */
function complete(overrides: Partial<PeerRecord> = {}): PeerRecord {
  return {
    kind: 'user',
    id: 100n,
    accessHash: 0xabcd_ef01_2345_6789n,
    min: false,
    usernames: ['durov'],
    ...overrides,
  }
}

describe('a peer that has been encountered', () => {
  it('is found again by its identifier', async () => {
    const { store } = memory()
    await store.save(complete())

    expect(await store.byId('user', 100n)).toEqual(complete())
  })

  it('is found again by any name it answers to', async () => {
    const { store } = memory()
    await store.save(complete({ usernames: ['durov', 'pavel'] }))

    expect(await store.byUsername('durov')).toMatchObject({ id: 100n })
    expect(await store.byUsername('pavel')).toMatchObject({ id: 100n })
  })

  it('answers to a name however it is written', async () => {
    const { store } = memory()
    await store.save(complete())

    // A caller with the name written down one way and a peer that published it
    // another are the same peer.
    expect(await store.byUsername('@DUROV')).toMatchObject({ id: 100n })
    expect(await store.byUsername('  Durov ')).toMatchObject({ id: 100n })
  })

  it('is found again by a number, however it was punctuated', async () => {
    const { store } = memory()
    await store.save(complete({ phone: '+7 900 123-45-67' }))

    expect(await store.byPhone('79001234567')).toMatchObject({ id: 100n })
  })

  it('keeps an identifier and a hash that a number could not carry', async () => {
    const { store } = memory()
    const large = complete({ id: 7_654_321_098_765_432_109n, accessHash: -1n })
    await store.save(large)

    // Sixty-four bits do not survive a JSON number, and for a hash that means a
    // reference Telegram refuses for no visible reason.
    expect(await store.byId('user', 7_654_321_098_765_432_109n)).toEqual(large)
  })

  it('is not confused with a peer of another kind sharing its identifier', async () => {
    const { store } = memory()
    await store.save(complete({ kind: 'user', id: 5n }))
    await store.save({ kind: 'channel', id: 5n, accessHash: 9n, min: false, usernames: [] })

    expect(await store.byId('user', 5n)).toMatchObject({ accessHash: 0xabcd_ef01_2345_6789n })
    expect(await store.byId('channel', 5n)).toMatchObject({ accessHash: 9n })
  })

  it('is absent when nothing has been encountered', async () => {
    const { store } = memory()

    expect(await store.byId('user', 1n)).toBeUndefined()
    expect(await store.byUsername('nobody')).toBeUndefined()
    expect(await store.byPhone('123')).toBeUndefined()
  })
})

describe('a peer only seen in passing', () => {
  const reduced = complete({ min: true, accessHash: 1n, usernames: [] })

  it('is kept when nothing better is known', async () => {
    const { store } = memory()

    expect(await store.save(reduced)).toBe(true)
    expect(await store.byId('user', 100n)).toMatchObject({ min: true })
  })

  it('never replaces a peer that is known in full', async () => {
    const { store } = memory()
    await store.save(complete())

    // The rule the store exists for. A hash that works only where it arrived
    // would degrade the record permanently, and the failures it caused would
    // appear nowhere near here.
    expect(await store.save(reduced)).toBe(false)
    expect(await store.byId('user', 100n)).toEqual(complete())
  })

  it('is replaced the moment the peer is known in full', async () => {
    const { store } = memory()
    await store.save(reduced)

    expect(await store.save(complete())).toBe(true)
    expect(await store.byId('user', 100n)).toEqual(complete())
  })

  it('replaces another peer only seen in passing', async () => {
    const { store } = memory()
    await store.save(reduced)

    expect(await store.save({ ...reduced, accessHash: 2n })).toBe(true)
    expect(await store.byId('user', 100n)).toMatchObject({ accessHash: 2n })
  })
})

describe('the names a peer answers to', () => {
  it('stop pointing at it once it has dropped them', async () => {
    const { store } = memory()
    await store.save(complete({ usernames: ['durov', 'pavel'] }))

    await store.save(complete({ usernames: ['durov'] }))

    // A name that was given up may since belong to somebody else, so it must
    // not go on resolving to whoever held it before.
    expect(await store.byUsername('durov')).toMatchObject({ id: 100n })
    expect(await store.byUsername('pavel')).toBeUndefined()
  })

  it('stop pointing at it when it is forgotten', async () => {
    const { store } = memory()
    await store.save(complete({ phone: '+79001234567' }))

    await store.forget('user', 100n)

    expect(await store.byId('user', 100n)).toBeUndefined()
    expect(await store.byUsername('durov')).toBeUndefined()
    expect(await store.byPhone('79001234567')).toBeUndefined()
  })

  it('leave nothing behind when a number changes', async () => {
    const { store } = memory()
    await store.save(complete({ phone: '+79001111111' }))

    await store.save(complete({ phone: '+79002222222' }))

    expect(await store.byPhone('79001111111')).toBeUndefined()
    expect(await store.byPhone('79002222222')).toMatchObject({ id: 100n })
  })

  it('forgetting a peer that was never encountered does nothing', async () => {
    const { store, values } = memory()

    await expect(store.forget('user', 1n)).resolves.toBeUndefined()
    expect(values.size).toBe(0)
  })
})

describe('a stored peer that cannot be read back', () => {
  it('is refused rather than treated as absent', async () => {
    const { store, values } = memory()
    values.set('peer:user:1', 'not a record')

    // Absent means "never encountered", which for a peer means unreachable.
    // Answering that for a record that is merely unreadable hides the fault.
    await expect(store.byId('user', 1n)).rejects.toBeInstanceOf(PeerStorageError)
  })

  it('is refused when it names no kind this client knows', async () => {
    const { store, values } = memory()
    values.set('peer:user:1', { kind: 'secret', id: '1', min: false, usernames: [] })

    await expect(store.byId('user', 1n)).rejects.toThrow(/no peer kind/)
  })

  it('is refused when its identifier is not one', async () => {
    const { store, values } = memory()
    values.set('peer:user:1', { kind: 'user', id: 1, min: false, usernames: [] })

    await expect(store.byId('user', 1n)).rejects.toThrow(/not text/)
  })

  it('is refused when its identifier is not a number', async () => {
    const { store, values } = memory()
    values.set('peer:user:1', { kind: 'user', id: 'nine', min: false, usernames: [] })

    await expect(store.byId('user', 1n)).rejects.toThrow(/not a number/)
  })

  it('is refused when its names are not a list of names', async () => {
    const { store, values } = memory()
    values.set('peer:user:1', { kind: 'user', id: '1', min: false, usernames: [7] })

    await expect(store.byId('user', 1n)).rejects.toThrow(/no usable list of names/)
  })

  it('is refused when a name points at nothing usable', async () => {
    const { store, values } = memory()
    values.set('username:durov', 'somewhere')

    await expect(store.byUsername('durov')).rejects.toBeInstanceOf(PeerStorageError)
  })
})
