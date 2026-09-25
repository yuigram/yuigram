/**
 * An account over a store that leases its areas.
 *
 * Two accounts here stand for two processes: each has a guard of its own, so
 * nothing in this process excludes one from the other, and each reaches the
 * file through a connection of its own. What keeps them apart is the store's
 * lease and nothing else — which is the situation of two processes over one
 * database, driven through the account a caller builds.
 *
 * The datacenters answer in this process; the SQLite file is real.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger, type LogRecord, processGuard, StorageOwnershipError } from '@yuigram/core'
import { openDatabase, type SqliteDatabase, sqliteStore } from '@yuigram/sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deserializeError, serializeError } from '../src/worker/protocol.js'
import { createServerKey } from './server/keys.js'
import { type MockAccount, mockAccount } from './support/mock-account.js'

vi.setConfig({ testTimeout: 60_000 })

const KEY = createServerKey()

let directory: string
const opened: SqliteDatabase[] = []
const accounts: MockAccount[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yuigram-lease-account-'))
})

afterEach(async () => {
  for (const one of accounts.splice(0)) await one.dispose()
  for (const database of opened.splice(0)) database.close?.()
  await rm(directory, { recursive: true, force: true })
})

/** A connection of its own to the shared file, as another process would have. */
async function connection() {
  const database = await openDatabase(join(directory, 'accounts.db'))
  opened.push(database)
  return sqliteStore(database)
}

/** An account in a "process" of its own: its own guard, its own connection. */
async function run(options: Parameters<typeof mockAccount>[0] = {}) {
  const made = mockAccount({
    key: KEY,
    name: 'main',
    storageGuard: processGuard(),
    storage: await connection(),
    ...options,
  })
  accounts.push(made)
  return made
}

describe('an account over a leasing store', () => {
  it('is refused while another run in another process holds the area', async () => {
    const first = await run()
    await first.account.connect()
    await first.account.reach(2).invoke({ _: 'ping', ping_id: 1n })

    const second = await run({ datacenters: first.datacenters })
    const refused = await second.account.connect().catch((error: unknown) => error)

    expect(refused).toBeInstanceOf(StorageOwnershipError)
    expect((refused as Error).message).toContain('another process')
    expect(first.account.state).toBe('running')
  })

  it('stops a run another process took over, which then writes nothing', async () => {
    const records: LogRecord[] = []
    // Long enough to outlast a key exchange, which computes without yielding:
    // a lease shorter than that lapses while the exchange runs, and the account
    // stops itself — the right answer for a run that was not heard from.
    const first = await run({
      storageLeaseMs: 3_000,
      log: createLogger({ sink: { write: (record) => records.push(record) } }),
    })
    await first.account.connect()
    await first.account.reach(2).invoke({ _: 'ping', ping_id: 1n })

    const taker = await run({ datacenters: first.datacenters, takeOverStorage: true })
    await taker.account.connect()
    await taker.account.reach(2).invoke({ _: 'ping', ping_id: 2n })

    // Told by its next renewal, within a third of its lease, and stopped.
    await vi.waitFor(() => expect(first.account.state).toBe('idle'), { timeout: 10_000 })
    expect(records.some((record) => record.message.includes('took over'))).toBe(true)
    expect(taker.account.state).toBe('running')

    // The area is the taker's: it still writes, and stops cleanly.
    const store = await connection()
    const lease = await store.lease('accounts:main:', { holder: 'probe', ttlMs: 1_000 })
    expect(lease).toBeUndefined()
    await taker.account.stop()
    expect(await store.lease('accounts:main:', { holder: 'probe', ttlMs: 1_000 })).toBeDefined()
  })

  it('reopens an area the moment the run before it stops', async () => {
    const first = await run()
    await first.account.connect()
    await first.account.reach(2).invoke({ _: 'ping', ping_id: 1n })
    await first.account.stop()
    const store = await connection()
    const negotiated = await store.get('accounts:main:auth:dc2:key')
    expect(negotiated).toBeDefined()

    const next = await run({ datacenters: first.datacenters })
    await expect(next.account.connect()).resolves.toBeUndefined()
    // The authorization the first run negotiated is the one the next one uses.
    await next.account.reach(2).invoke({ _: 'ping', ping_id: 2n })
    expect(await store.get('accounts:main:auth:dc2:key')).toEqual(negotiated)
  })

  it('signs out holding a lease of its own, and leaves the area free', async () => {
    const first = await run({
      api: (query) => (query._ === 'auth.logOut' ? { _: 'auth.loggedOut', flags: 0 } : undefined),
    })
    await first.account.connect()
    await first.account.reach(2).invoke({ _: 'ping', ping_id: 1n })

    await first.account.logOut()

    const store = await connection()
    const left: string[] = []
    for await (const key of store.keys('accounts:main:auth:')) left.push(key)
    expect(left).toEqual([])
    expect(await store.lease('accounts:main:', { holder: 'probe', ttlMs: 1_000 })).toBeDefined()
  })
})

describe('across a worker', () => {
  it('brings a refusal back as the class a caller catches', () => {
    const crossed = deserializeError(
      serializeError(new StorageOwnershipError("the account 'main' is open on this storage")),
    )

    expect(crossed).toBeInstanceOf(StorageOwnershipError)
    expect(crossed.message).toContain("'main'")
  })
})
