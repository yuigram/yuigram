// SPDX-License-Identifier: MPL-2.0

/**
 * The place in the update stream, written down and read back.
 *
 * A position is the only thing that decides whether a restart resumes or starts
 * again, and it is read from a file that anything able to write there can
 * replace. So the cases here are about what the store refuses: a position that
 * counts backwards, one that is not whole, one that is not a record at all.
 * Accepting any of them means resuming from somewhere the server cannot
 * describe, which loses everything between silently.
 */

import { describe, expect, it } from 'vitest'
import { UpdateStorageError, updateStore } from '../src/storage/updates.js'
import type { UpdateStateSnapshot } from '../src/updates/state.js'

/** A store over a map, so a case can see and corrupt exactly what was written. */
function memory() {
  const entries = new Map<string, unknown>()

  return {
    entries,
    store: updateStore({
      get: async (key: string) => entries.get(key),
      set: async (key: string, value: unknown) => {
        entries.set(key, value)
      },
      delete: async (key: string) => {
        entries.delete(key)
      },
    }),
  }
}

const SNAPSHOT: UpdateStateSnapshot = {
  pts: 4321,
  qts: 12,
  seq: 88,
  date: 1_700_000_000,
  channels: new Map([
    ['1001', 55],
    ['2002', 7],
  ]),
}

describe('a position written down', () => {
  it('reads back as the position that was written', async () => {
    const { store } = memory()

    await store.save(SNAPSHOT)

    expect(await store.load()).toEqual(SNAPSHOT)
  })

  it('is absent before anything has been written', async () => {
    const { store } = memory()

    expect(await store.load()).toBeUndefined()
  })

  it('keeps the channels as something a store can carry', async () => {
    // A map is not what JSON holds, so what reaches the store has to be a
    // record — and it has to come back as a map either way.
    const { store, entries } = memory()

    await store.save(SNAPSHOT)

    expect(entries.get('state')).toEqual({
      pts: 4321,
      qts: 12,
      seq: 88,
      date: 1_700_000_000,
      channels: { '1001': 55, '2002': 7 },
    })
  })

  it('replaces the position rather than accumulating them', async () => {
    const { store, entries } = memory()

    await store.save(SNAPSHOT)
    await store.save({ ...SNAPSHOT, pts: 9999, channels: new Map() })

    expect(entries.size).toBe(1)
    expect((await store.load())?.pts).toBe(9999)
    expect((await store.load())?.channels.size).toBe(0)
  })
})

describe('a position that cannot be read back', () => {
  /** Put a damaged value where a position belongs. */
  async function damaged(value: unknown) {
    const { store, entries } = memory()
    await store.save(SNAPSHOT)
    entries.set('state', value)

    return store
  }

  it('is refused rather than treated as absent', async () => {
    // Absent means "start from wherever Telegram is now". Answering that for a
    // position that is merely damaged skips everything in between and says
    // nothing about it.
    const store = await damaged('not a record')

    await expect(store.load()).rejects.toBeInstanceOf(UpdateStorageError)
  })

  it('refuses a counter that runs backwards', async () => {
    const store = await damaged({ ...SNAPSHOT, pts: -1, channels: {} })

    await expect(store.load()).rejects.toThrow(/no usable 'pts'/)
  })

  it('refuses a counter that is not whole', async () => {
    const store = await damaged({ ...SNAPSHOT, seq: 1.5, channels: {} })

    await expect(store.load()).rejects.toThrow(/no usable 'seq'/)
  })

  it('refuses a channel whose position is not one', async () => {
    const store = await damaged({ ...SNAPSHOT, channels: { '1001': 'soon' } })

    await expect(store.load()).rejects.toThrow(/channel 1001/)
  })

  it('refuses a position that names no channels record', async () => {
    const store = await damaged({ ...SNAPSHOT, channels: [1, 2, 3] })

    await expect(store.load()).rejects.toThrow(/names no channels record/)
  })

  it('refuses more channels than a position could name', async () => {
    // An allocation guard: the file is attacker-controlled wherever it can be
    // replaced, and the bound is applied before the map is built.
    const channels: Record<string, number> = {}
    for (let index = 0; index < 100_001; index += 1) channels[String(index)] = 1
    const store = await damaged({ ...SNAPSHOT, channels })

    await expect(store.load()).rejects.toThrow(/more than 100000/)
  })
})
