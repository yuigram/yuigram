// SPDX-License-Identifier: MIT

/**
 * Leasing an area of a SQLite store, against real SQLite.
 *
 * A lease is what lets one holder at a time write an area across every
 * connection to a file, and the property that matters is the fence: once a
 * later lease has been granted, a write from an earlier holder is refused by
 * the store, whatever that holder believes. Each case here uses two
 * connections to one file — the way two processes see it — and a clock that
 * moves only when told, so expiry is decided by the case rather than by timing.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  canLease,
  encrypted,
  memory,
  namespaced,
  StorageOwnershipError,
  tiered,
  ValidationError,
} from '@yuigram/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type SqliteDatabase, type SqliteStore, sqliteStore } from '../src/index.js'

let directory: string
const opened: SqliteDatabase[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yuigram-lease-'))
})

afterEach(async () => {
  for (const database of opened.splice(0)) database.close?.()
  await rm(directory, { recursive: true, force: true })
})

/** A clock that moves only when told to, shared by both connections. */
function clock(start = 1_000_000) {
  let at = start
  return {
    now: () => at,
    advance(ms: number) {
      at += ms
    },
  }
}

/** Two connections to one file, as two processes would hold them. */
async function twoConnections(time = clock()) {
  const path = join(directory, 'shared.db')
  const first = await openDatabase(path)
  const second = await openDatabase(path)
  opened.push(first, second)
  return {
    time,
    first: sqliteStore(first, { now: time.now }),
    second: sqliteStore(second, { now: time.now }),
  }
}

async function collect(keys: AsyncIterable<string> | undefined): Promise<string[]> {
  const all: string[] = []
  for await (const key of keys ?? []) all.push(key)
  return all
}

const AREA = 'accounts:main:'

describe('one holder at a time', () => {
  it('refuses a second lease while the first is live, from another connection', async () => {
    const { first, second } = await twoConnections()

    const held = await first.lease(AREA, { holder: 'a', ttlMs: 1_000 })
    expect(held?.token).toBe(1)
    expect(await second.lease(AREA, { holder: 'b', ttlMs: 1_000 })).toBeUndefined()
    expect(await first.lease(AREA, { holder: 'a-again', ttlMs: 1_000 })).toBeUndefined()
  })

  it('writes through a lease under its prefix, and reads through it and around it', async () => {
    const { first, second } = await twoConnections()
    const lease = await first.lease(AREA, { holder: 'a', ttlMs: 1_000 })

    await lease?.storage.set('auth:2', { key: [1, 2] })
    await lease?.storage.set('peers:5', 'x', { ttl: 1 })

    expect(await second.get(`${AREA}auth:2`)).toEqual({ key: [1, 2] })
    expect(await lease?.storage.get('auth:2')).toEqual({ key: [1, 2] })
    expect(await lease?.storage.has?.('peers:5')).toBe(true)
    expect(await collect(lease?.storage.keys?.())).toEqual(['auth:2', 'peers:5'])
    expect(await collect(lease?.storage.keys?.('peers:'))).toEqual(['peers:5'])

    await lease?.storage.delete('auth:2')
    await lease?.storage.clear?.('peers:')
    expect(await collect(second.keys())).toEqual([])
  })

  it('keeps leases out of what the store lists, and out of reach of clearing it', async () => {
    const { first, second } = await twoConnections()
    const lease = await first.lease(AREA, { holder: 'a', ttlMs: 1_000 })
    await lease?.release()

    await second.clear()
    expect(await collect(second.keys())).toEqual([])

    // The count survived the clear, so the next grant is still above the last.
    expect((await second.lease(AREA, { holder: 'b', ttlMs: 1_000 }))?.token).toBe(2)
  })

  it('leases areas and stores in one file independently', async () => {
    const { first, second, time } = await twoConnections()
    const other = sqliteStore(opened[1] as SqliteDatabase, { table: 'other', now: time.now })

    expect(await first.lease('accounts:a:', { holder: 'a', ttlMs: 1_000 })).toBeDefined()
    expect(await second.lease('accounts:b:', { holder: 'b', ttlMs: 1_000 })).toBeDefined()
    expect(await other.lease('accounts:a:', { holder: 'c', ttlMs: 1_000 })).toBeDefined()
  })
})

describe('the fence', () => {
  it('refuses every write from a holder a later lease superseded, and keeps the successor’s', async () => {
    const { first, second } = await twoConnections()
    const old = await first.lease(AREA, { holder: 'old', ttlMs: 1_000 })
    await old?.storage.set('state', 'old')

    const next = await second.lease(AREA, { holder: 'next', ttlMs: 1_000, steal: true })
    expect(next?.token).toBe(2)
    await next?.storage.set('state', 'next')

    for (const write of [
      () => old?.storage.set('state', 'late'),
      () => old?.storage.delete('state'),
      () => old?.storage.clear?.(),
    ]) {
      await expect(write()).rejects.toBeInstanceOf(StorageOwnershipError)
    }

    expect(old?.held).toBe(false)
    expect(await old?.renew()).toBe(false)
    expect(await second.get(`${AREA}state`)).toBe('next')
    // Reads are still answered: what an old holder reads is the area as it is.
    expect(await old?.storage.get('state')).toBe('next')
  })

  it('refuses a paused holder whose lease lapsed, whether or not anyone took it since', async () => {
    const { first, second, time } = await twoConnections()
    const paused = await first.lease(AREA, { holder: 'paused', ttlMs: 1_000 })
    await paused?.storage.set('state', 'before')

    time.advance(1_001)
    // Nobody else has asked yet, and the late write is still refused.
    await expect(paused?.storage.set('state', 'late')).rejects.toBeInstanceOf(StorageOwnershipError)

    const next = await second.lease(AREA, { holder: 'next', ttlMs: 1_000 })
    expect(next?.token).toBe(2)
    await expect(paused?.storage.set('state', 'later')).rejects.toBeInstanceOf(
      StorageOwnershipError,
    )
    expect(await second.get(`${AREA}state`)).toBe('before')
  })

  it('keeps a lease that is renewed in time, and stops keeping one that is not', async () => {
    const { first, second, time } = await twoConnections()
    const lease = await first.lease(AREA, { holder: 'a', ttlMs: 1_000 })

    for (let beat = 0; beat < 5; beat += 1) {
      time.advance(600)
      expect(await lease?.renew()).toBe(true)
    }
    expect(await second.lease(AREA, { holder: 'b', ttlMs: 1_000 })).toBeUndefined()
    await lease?.storage.set('state', 'kept')

    time.advance(1_000)
    expect(await lease?.renew()).toBe(false)
    expect(lease?.held).toBe(false)
    expect(await second.lease(AREA, { holder: 'b', ttlMs: 1_000 })).toBeDefined()
  })
})

describe('release and recovery', () => {
  it('frees the area at once on release, and refuses the released holder afterwards', async () => {
    const { first, second } = await twoConnections()
    const lease = await first.lease(AREA, { holder: 'a', ttlMs: 60_000 })
    await lease?.release()

    expect(lease?.held).toBe(false)
    await expect(lease?.storage.set('state', 'after')).rejects.toBeInstanceOf(StorageOwnershipError)
    expect((await second.lease(AREA, { holder: 'b', ttlMs: 60_000 }))?.token).toBe(2)
  })

  it('does not free a successor’s lease when a superseded holder releases', async () => {
    const { first, second } = await twoConnections()
    const old = await first.lease(AREA, { holder: 'old', ttlMs: 60_000 })
    const next = await second.lease(AREA, { holder: 'next', ttlMs: 60_000, steal: true })

    await old?.release()

    expect(await first.lease(AREA, { holder: 'third', ttlMs: 60_000 })).toBeUndefined()
    await next?.storage.set('state', 'still the successor’s')
  })

  it('recovers an area whose holder vanished, once its lease lapses, numbered above it', async () => {
    const { second, time } = await twoConnections()
    // A connection of its own, closed without releasing: what a process that
    // died leaves behind.
    const doomed = await openDatabase(join(directory, 'shared.db'))
    await sqliteStore(doomed, { now: time.now }).lease(AREA, { holder: 'crashed', ttlMs: 1_000 })
    doomed.close?.()

    expect(await second.lease(AREA, { holder: 'next', ttlMs: 1_000 })).toBeUndefined()
    time.advance(1_001)
    expect((await second.lease(AREA, { holder: 'next', ttlMs: 1_000 }))?.token).toBe(2)
  })

  it('numbers every grant above the last, across releases, lapses and new connections', async () => {
    const { first, time } = await twoConnections()
    const tokens: number[] = []

    for (let round = 0; round < 3; round += 1) {
      const lease = await first.lease(AREA, { holder: `r${round}`, ttlMs: 1_000 })
      tokens.push(lease?.token ?? -1)
      await lease?.release()
    }
    const lapsed = await first.lease(AREA, { holder: 'lapsed', ttlMs: 1_000 })
    tokens.push(lapsed?.token ?? -1)
    time.advance(2_000)

    const reopened = await openDatabase(join(directory, 'shared.db'))
    opened.push(reopened)
    const again = await sqliteStore(reopened, { now: time.now }).lease(AREA, {
      holder: 'again',
      ttlMs: 1_000,
    })
    tokens.push(again?.token ?? -1)

    expect(tokens).toEqual([1, 2, 3, 4, 5])
  })
})

describe('what can lease', () => {
  it('passes the capability through a namespace, onto the area beneath it', async () => {
    const { first, second } = await twoConnections()
    const scoped = namespaced(first, 'tenant:')
    expect(canLease(scoped)).toBe(true)

    const lease = await (scoped as unknown as SqliteStore).lease(AREA, {
      holder: 'a',
      ttlMs: 1_000,
    })
    await lease?.storage.set('state', 1)

    expect(await second.get(`tenant:${AREA}state`)).toBe(1)
    expect(await second.lease(`tenant:${AREA}`, { holder: 'b', ttlMs: 1_000 })).toBeUndefined()
  })

  it('is not offered through a cache or encryption, whose writes a lease would skip', async () => {
    const { first } = await twoConnections()
    expect(canLease(tiered(memory(), first))).toBe(false)
    expect(canLease(encrypted(first as never, 'k'.repeat(32)))).toBe(false)
    expect(canLease(memory())).toBe(false)
  })

  it('refuses a lease with no holder or no lifetime', async () => {
    const { first } = await twoConnections()
    await expect(first.lease(AREA, { holder: '', ttlMs: 1_000 })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(first.lease(AREA, { holder: 'a', ttlMs: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(first.lease(AREA, { holder: 'a', ttlMs: 1.5 })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})
