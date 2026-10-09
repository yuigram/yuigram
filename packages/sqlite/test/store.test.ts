// SPDX-License-Identifier: MIT

/**
 * The SQLite store, against real SQLite.
 *
 * Every case opens an actual database — in memory where persistence is not
 * the point, a file in a temporary directory where it is — through the
 * runtime's own driver. What is asserted is the key-value contract the rest of
 * the framework relies on, and the two things a database store adds to it:
 * that what was written is there after the connection is closed and another
 * opened, and that two connections to one file see one store.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type BaseContext,
  createLogger,
  createSession,
  expiring,
  run,
  type SessionFlavor,
  StorageError,
  silentSink,
  ValidationError,
} from '@yuigram/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type SqliteDatabase, sqliteStore } from '../src/index.js'

let directory: string
const opened: SqliteDatabase[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yuigram-sqlite-'))
})

afterEach(async () => {
  for (const database of opened.splice(0)) database.close?.()
  await rm(directory, { recursive: true, force: true })
})

async function open(name = ':memory:'): Promise<SqliteDatabase> {
  const database = await openDatabase(name === ':memory:' ? name : join(directory, name))
  opened.push(database)
  return database
}

/** A clock that moves only when told to. */
function clock(start = 1_000_000) {
  let at = start
  return {
    now: () => at,
    advance(ms: number) {
      at += ms
    },
  }
}

async function collect(keys: AsyncIterable<string> | undefined): Promise<string[]> {
  const all: string[] = []
  for await (const key of keys ?? []) all.push(key)
  return all
}

describe('the key-value contract', () => {
  it('reads back what it was given, as the JSON data it was', async () => {
    const store = sqliteStore(await open())

    await store.set('a', { count: 1, list: ['x', null], flag: false, nested: { deep: 'y' } })
    await store.set('b', 'text')
    await store.set('c', null)

    expect(await store.get('a')).toEqual({
      count: 1,
      list: ['x', null],
      flag: false,
      nested: { deep: 'y' },
    })
    expect(await store.get('b')).toBe('text')
    // A stored null is a value, and reads as one rather than as absent.
    expect(await store.get('c')).toBeNull()
    expect(await store.has('c')).toBe(true)
    expect(await store.get('missing')).toBeUndefined()
    expect(await store.has('missing')).toBe(false)
  })

  it('replaces a value, and forgets a deleted one', async () => {
    const store = sqliteStore(await open())

    await store.set('a', 1)
    await store.set('a', 2)
    expect(await store.get('a')).toBe(2)

    await store.delete('a')
    await store.delete('never-there')
    expect(await store.get('a')).toBeUndefined()
  })

  it('lists and clears by prefix, reading _ and % as themselves', async () => {
    const store = sqliteStore(await open())
    for (const key of ['a_1', 'a_2', 'ab', 'a%', 'b']) await store.set(key, key)

    expect(await collect(store.keys?.('a_'))).toEqual(['a_1', 'a_2'])
    expect(await collect(store.keys?.('a%'))).toEqual(['a%'])

    await store.clear?.('a_')
    expect(await collect(store.keys?.())).toEqual(['a%', 'ab', 'b'])

    await store.clear?.()
    expect(await collect(store.keys?.())).toEqual([])
  })

  it('names itself as a persistent SQLite store', async () => {
    expect(sqliteStore(await open()).info).toEqual({ driver: 'sqlite', persistent: true })
  })

  it('keeps two tables in one database apart', async () => {
    const database = await open()
    const sessions = sqliteStore(database, { table: 'sessions' })
    const cache = sqliteStore(database, { table: 'cache' })

    await sessions.set('k', 'session')
    await cache.set('k', 'cache')

    expect([await sessions.get('k'), await cache.get('k')]).toEqual(['session', 'cache'])
  })
})

describe('expiry', () => {
  it('hides an entry the moment it expires, deletes it when read, and sweeps the rest', async () => {
    const time = clock()
    const database = await open()
    const store = sqliteStore(database, { now: time.now })

    await store.set('short', 'a', { ttl: 1 })
    await store.set('also', 'b', { ttl: 1 })
    await store.set('long', 'c', { ttl: 60 })
    await store.set('forever', 'd')

    time.advance(999)
    expect(await store.get('short')).toBe('a')

    time.advance(1)
    expect(await store.get('short')).toBeUndefined()
    expect(await store.has('also')).toBe(false)
    expect(await collect(store.keys?.())).toEqual(['forever', 'long'])

    // `short` went when it was read; `also` is still a row until swept.
    expect(await store.sweep()).toBe(1)
    const rows = database.prepare('SELECT key FROM yuigram_kv ORDER BY key').all()
    expect(rows).toEqual([{ key: 'forever' }, { key: 'long' }])
  })

  it('refuses a time to live that is not a positive number of seconds', async () => {
    const store = sqliteStore(await open())

    await expect(store.set('a', 1, { ttl: 0 })).rejects.toBeInstanceOf(ValidationError)
    await expect(store.set('a', 1, { ttl: Number.NaN })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('what cannot be stored, and what fails', () => {
  it('refuses a value that is not JSON data, without quoting it', async () => {
    const store = sqliteStore(await open())

    const bigint = await store.set('secret-key', { authKey: 5n }).catch((error: unknown) => error)
    expect(bigint).toBeInstanceOf(StorageError)
    expect((bigint as Error).message).toContain("'secret-key'")
    expect((bigint as Error).message).not.toContain('5')
    expect((bigint as Error).cause).toBeInstanceOf(TypeError)

    await expect(store.set('u', undefined)).rejects.toThrow(/delete the key instead/)
  })

  it('reports a driver failure as the store’s, with the driver’s error as the cause', async () => {
    const database = await open()
    const store = sqliteStore(database, { table: 'doomed' })
    database.exec('DROP TABLE doomed')

    const failure = await store.get('a').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(StorageError)
    expect((failure as Error).message).toBe("SQLite could not read 'a'")
    expect(String((failure as Error).cause)).toMatch(/no such table/)
  })

  it('refuses a table name it would have to quote', async () => {
    const database = await open()

    expect(() => sqliteStore(database, { table: 'kv; DROP TABLE x' })).toThrow(ValidationError)
    expect(() => sqliteStore(database, { table: '1kv' })).toThrow(ValidationError)
  })
})

describe('the connection', () => {
  it('refuses everything once closed, and closes a connection only when it owns it', async () => {
    const shared = await open()
    const borrowing = sqliteStore(shared)
    await borrowing.close()

    await expect(borrowing.get('a')).rejects.toThrow(/closed/)
    // Still the application's, and still open.
    expect(shared.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 })

    const owned = await openDatabase(join(directory, 'owned.db'))
    const owning = sqliteStore(owned, { ownsConnection: true })
    await owning.close()
    expect(() => owned.prepare('SELECT 1')).toThrow()
  })

  it('keeps what was written after the connection closes and another opens the file', async () => {
    const time = clock(Date.now())
    const first = await openDatabase(join(directory, 'bot.db'))
    const before = sqliteStore(first, { now: time.now })
    await before.set('kept', { cart: ['tea'] })
    await before.set('brief', 'x', { ttl: 30 })
    first.close?.()

    const second = await open('bot.db')
    const after = sqliteStore(second, { now: time.now })

    expect(await after.get('kept')).toEqual({ cart: ['tea'] })
    expect(await after.get('brief')).toBe('x')
    time.advance(30_000)
    expect(await after.get('brief')).toBeUndefined()
  })

  it('is one store to two connections open on one file', async () => {
    const one = sqliteStore(await open('shared.db'))
    const two = sqliteStore(await open('shared.db'))

    await one.set('a', 1)
    expect(await two.get('a')).toBe(1)
    await two.delete('a')
    expect(await one.has('a')).toBe(false)
  })
})

describe('as a session store', () => {
  interface Data {
    count: number
    code?: string | undefined
    note?: string | null
  }

  interface Ctx extends BaseContext, SessionFlavor<Data> {}

  const log = createLogger({ sink: silentSink() })
  const context = (): Ctx =>
    ({ kind: 'message', transport: 'test', client: { name: 't' }, log, raw: {} }) as Ctx

  it('keeps null, drops undefined and holds an expiring field across a reopen', async () => {
    const time = clock(Date.now())
    const sessions = (database: SqliteDatabase) =>
      createSession<Ctx, Data>({
        storage: sqliteStore<Data>(database, { now: time.now }),
        key: () => 'user:1',
        initial: () => ({ count: 0 }),
        now: time.now,
      })
    const update = (database: SqliteDatabase, step: (session: Data) => void) => {
      const event = context()
      return run([sessions(database), () => step(event.session)], event)
    }

    const first = await openDatabase(join(directory, 'sessions.db'))
    await update(first, (session) => {
      session.count = 1
      session.note = null
      session.code = undefined
    })
    await update(first, (session) => {
      expect('code' in session).toBe(false)
      session.code = expiring('482913', 60_000)
    })
    first.close?.()

    const second = await open('sessions.db')
    await update(second, (session) => {
      expect(session).toMatchObject({ count: 1, note: null })
      expect(session.code).toBe('482913')
    })

    time.advance(60_000)
    await update(second, (session) => {
      expect('code' in session).toBe(false)
    })
    expect(await sqliteStore(second).get('user:1')).toEqual({ count: 1, note: null })
  })
})
