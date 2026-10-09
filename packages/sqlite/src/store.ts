// SPDX-License-Identifier: MPL-2.0

/**
 * The key-value contract over a SQLite table.
 *
 * One row per key: the value as JSON text, and when it stops being one. The
 * same shape the file and web stores keep, so a value that survives one
 * survives the others, and what serves a session serves an account's
 * authorization, its peers and its update state alike.
 *
 * ```
 *   yuigram_kv
 *   ┌──────────────┬──────────────────┬──────────────┐
 *   │ key TEXT PK  │ value TEXT (JSON)│ expires_at   │  ms since the epoch, NULL = never
 *   └──────────────┴──────────────────┴──────────────┘
 * ```
 *
 * Every operation is one statement, so each is atomic by itself and safe to
 * run from several connections at once; the database orders them. An expired
 * row is invisible to every read from the moment it expires and is deleted
 * when read or swept.
 *
 * **Leases.** An area of the table — an account's, say — can be leased to one
 * holder at a time across every connection to the file, whichever process or
 * program holds it. The lease is a row in a second table, and it fences: every
 * write through a lease runs in a transaction that takes the write lock first,
 * checks the lease is still the current one, and only then writes. So a holder
 * that was paused while its lease expired and another took it cannot land a
 * write afterwards, however late it wakes.
 *
 * ```
 *   yuigram_kv_leases
 *   ┌──────────────┬───────────────┬──────────────┬──────────────┐
 *   │ area TEXT PK │ token INTEGER │ holder TEXT  │ expires_at   │  NULL holder = released
 *   └──────────────┴───────────────┴──────────────┴──────────────┘
 * ```
 *
 * The token only grows. A released or expired lease keeps its row, so the next
 * grant is numbered above every one before it and an old holder's token never
 * becomes current again; clearing the store leaves the leases alone for the
 * same reason. Expiry is read from the clock of whoever asks, which is one
 * clock for processes on one host — the only way a SQLite file is safely
 * shared.
 */

import {
  type DescribedKV,
  type KV,
  type KVInfo,
  type LeasableKV,
  type LeaseOptions,
  type SetOptions,
  StorageError,
  StorageOwnershipError,
  type StoreLease,
  ValidationError,
} from '@yuigram/core'
import { type SqliteDatabase, type SqliteStatement, tableName } from './driver.js'

/** Options for {@link sqliteStore}. */
export interface SqliteStoreOptions {
  /** The table entries live in, created if missing. `yuigram_kv` unless given. */
  readonly table?: string
  /** The time, in milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /**
   * Whether closing the store closes the connection.
   *
   * `false` for a connection handed over, which stays the application's: other
   * stores and its own queries may still be using it. {@link openDatabase}
   * sets it for the connection it opens.
   */
  readonly ownsConnection?: boolean
}

/** A store over a SQLite table, with every optional operation of the contract. */
export interface SqliteStore<V = unknown> extends DescribedKV<V>, LeasableKV<V> {
  has(key: string): Promise<boolean>
  clear(prefix?: string): Promise<void>
  keys(prefix?: string): AsyncIterable<string>
  /** Delete every entry whose time to live has passed, and say how many went. */
  sweep(): Promise<number>
  /**
   * Stop using the connection, closing it if this store owns it.
   *
   * Later operations are refused, so a store closed during shutdown cannot be
   * written to by whatever was still finishing.
   */
  close(): Promise<void>
}

interface Row {
  readonly value: string
  readonly expires_at: number | bigint | null
}

interface LeaseRow {
  readonly token: number | bigint
  readonly holder: string | null
  readonly expires_at: number | bigint | null
}

/** Rows name columns, and some drivers hand integers back as `bigint`. */
function millis(value: number | bigint | null): number | undefined {
  return value === null ? undefined : Number(value)
}

/**
 * A key-value store kept in a SQLite table.
 *
 * ```ts
 * import { DatabaseSync } from 'node:sqlite'
 *
 * const database = new DatabaseSync('./bot.db')
 * const sessions = sqliteStore<Cart>(database, { table: 'sessions' })
 * ```
 *
 * The table is created on the spot if it is missing. The connection's
 * settings stay the application's; a connection shared between processes
 * should set a busy timeout, which {@link openDatabase} does.
 */
export function sqliteStore<V = unknown>(
  database: SqliteDatabase,
  options: SqliteStoreOptions = {},
): SqliteStore<V> {
  const table = tableName(options.table ?? 'yuigram_kv')
  const now = options.now ?? (() => Date.now())
  const leases = `${table}_leases`
  const info: KVInfo = { driver: 'sqlite', persistent: true }
  let closed = false
  let leasesReady = false

  attempt('create the table', () =>
    database.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (
         key TEXT PRIMARY KEY NOT NULL,
         value TEXT NOT NULL,
         expires_at INTEGER
       ) WITHOUT ROWID`,
    ),
  )

  const statements = new Map<string, SqliteStatement>()
  const prepared = (sql: string): SqliteStatement => {
    let statement = statements.get(sql)
    if (statement === undefined) {
      statement = database.prepare(sql)
      statements.set(sql, statement)
    }
    return statement
  }

  // Live rows only: one that has expired reads as absent from the moment it
  // does, whether or not anything has deleted it yet.
  const LIVE = '(expires_at IS NULL OR expires_at > ?)'
  const UNDER = 'substr(key, 1, length(?)) = ?'

  const open = (operation: string): void => {
    if (closed) throw new StorageError(`the SQLite store is closed, so it cannot ${operation}`)
  }

  /**
   * A write of one entry, checked and encoded now and run when called.
   *
   * Split so that a lease can run it inside its own transaction: what can be
   * refused without touching the database is refused before the write lock is
   * taken.
   */
  const writing = (key: string, value: unknown, setOptions?: SetOptions): (() => unknown) => {
    const text = encode(key, value)
    const ttl = setOptions?.ttl
    if (ttl !== undefined && (!Number.isFinite(ttl) || ttl <= 0)) {
      throw new ValidationError(`a time to live is a positive number of seconds, not ${ttl}`)
    }
    const expiresAt = ttl === undefined ? null : now() + Math.round(ttl * 1000)

    return () =>
      prepared(
        `INSERT INTO ${table} (key, value, expires_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      ).run(key, text, expiresAt)
  }

  const clearing = (prefix: string | undefined): (() => unknown) =>
    prefix === undefined
      ? () => prepared(`DELETE FROM ${table}`).run()
      : // A comparison on the leading characters rather than LIKE, which would
        // read `_` and `%` in a prefix as wildcards and clear the wrong keys.
        () => prepared(`DELETE FROM ${table} WHERE ${UNDER}`).run(prefix, prefix)

  const store: SqliteStore<V> = {
    info,

    async get(key) {
      open('read')
      const row = attempt(`read '${key}'`, () =>
        prepared(`SELECT value, expires_at FROM ${table} WHERE key = ?`).get(key),
      ) as Row | undefined
      if (row === undefined) return undefined

      const expiresAt = millis(row.expires_at)
      if (expiresAt !== undefined && expiresAt <= now()) {
        // Only the row that was read, and only if it is still the expired one:
        // another connection may have written a fresh value since.
        attempt(`forget the expired '${key}'`, () =>
          prepared(`DELETE FROM ${table} WHERE key = ? AND expires_at <= ?`).run(key, now()),
        )
        return undefined
      }

      return attempt(`read '${key}'`, () => JSON.parse(row.value) as V)
    },

    async set(key, value, setOptions) {
      open('write')
      attempt(`write '${key}'`, writing(key, value, setOptions))
    },

    async delete(key) {
      open('delete')
      attempt(`delete '${key}'`, () => prepared(`DELETE FROM ${table} WHERE key = ?`).run(key))
    },

    async has(key) {
      open('read')
      const row = attempt(`read '${key}'`, () =>
        prepared(`SELECT 1 AS present FROM ${table} WHERE key = ? AND ${LIVE}`).get(key, now()),
      )
      return row !== undefined
    },

    async clear(prefix) {
      open('clear')
      attempt(prefix === undefined ? 'clear' : `clear '${prefix}'`, clearing(prefix))
    },

    async *keys(prefix) {
      open('list')
      const rows = attempt('list keys', () =>
        prefix === undefined
          ? prepared(`SELECT key FROM ${table} WHERE ${LIVE} ORDER BY key`).all(now())
          : prepared(`SELECT key FROM ${table} WHERE ${UNDER} AND ${LIVE} ORDER BY key`).all(
              prefix,
              prefix,
              now(),
            ),
      ) as Array<{ readonly key: string }>

      for (const row of rows) yield row.key
    },

    async sweep() {
      open('sweep')
      const before = count()
      attempt('sweep', () =>
        prepared(`DELETE FROM ${table} WHERE expires_at IS NOT NULL AND expires_at <= ?`).run(
          now(),
        ),
      )
      return before - count()
    },

    async lease(prefix, leaseOptions) {
      open('lease an area')
      checkLease(leaseOptions)
      leaseTable()

      const token = transaction(`lease '${prefix}'`, () => {
        const row = prepared(`SELECT token, holder, expires_at FROM ${leases} WHERE area = ?`).get(
          prefix,
        ) as LeaseRow | undefined
        const live =
          row !== undefined && row.holder !== null && (millis(row.expires_at) ?? 0) > now()
        if (live && leaseOptions.steal !== true) return undefined

        // Above every grant before it, including released and expired ones,
        // which is why their rows are kept.
        const next = (row === undefined ? 0 : Number(row.token)) + 1
        prepared(
          `INSERT INTO ${leases} (area, token, holder, expires_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (area) DO UPDATE SET
             token = excluded.token, holder = excluded.holder, expires_at = excluded.expires_at`,
        ).run(prefix, next, leaseOptions.holder, now() + leaseOptions.ttlMs)
        return next
      })

      return token === undefined ? undefined : leased(prefix, token, leaseOptions.ttlMs)
    },

    async close() {
      if (closed) return
      closed = true
      statements.clear()
      if (options.ownsConnection === true) attempt('close', () => database.close?.())
    },
  }

  return store

  function count(): number {
    const row = attempt('count', () =>
      prepared(`SELECT count(*) AS total FROM ${table}`).get(),
    ) as { readonly total: number | bigint }
    return Number(row.total)
  }

  /** The lease table, created the first time anything is leased. */
  function leaseTable(): void {
    if (leasesReady) return
    attempt('create the lease table', () =>
      database.exec(
        `CREATE TABLE IF NOT EXISTS ${leases} (
           area TEXT PRIMARY KEY NOT NULL,
           token INTEGER NOT NULL,
           holder TEXT,
           expires_at INTEGER
         ) WITHOUT ROWID`,
      ),
    )
    leasesReady = true
  }

  /**
   * Run statements as one transaction that holds the write lock from its start.
   *
   * `IMMEDIATE` rather than the default, which takes the lock only at the first
   * write: a check followed by a write is exactly the pair another connection
   * must not get between, and waiting for the lock up front — within the busy
   * timeout — is what makes the pair one step. Nothing awaits inside, so no
   * other operation on this connection can interleave either.
   */
  function transaction<T>(operation: string, run: () => T): T {
    attempt(operation, () => database.exec('BEGIN IMMEDIATE'))
    try {
      const result = attempt(operation, run)
      attempt(operation, () => database.exec('COMMIT'))
      return result
    } catch (error) {
      try {
        database.exec('ROLLBACK')
      } catch {
        // Already rolled back by the failure itself.
      }
      throw error
    }
  }

  /** A granted lease: the area through its fence, and the means to keep or give it up. */
  function leased(prefix: string, token: number, ttlMs: number): StoreLease {
    let held = true

    /** Whether this lease is the area's current one, read inside a transaction. */
    const current = (): boolean =>
      prepared(
        `SELECT 1 AS current FROM ${leases}
         WHERE area = ? AND token = ? AND holder IS NOT NULL AND expires_at > ?`,
      ).get(prefix, token, now()) !== undefined

    const fenced = (operation: string, run: () => unknown): void => {
      open(operation)
      transaction(operation, () => {
        if (!current()) {
          held = false
          throw new StorageOwnershipError(
            `the store refused to ${operation}: the lease on '${prefix}' is no longer this ` +
              "holder's — a later one was granted, or it was released or expired — and " +
              'writing now would land in an area another holder may be keeping',
          )
        }
        run()
      })
    }

    const storage: KV<unknown> = {
      get: (key) => store.get(prefix + key),
      has: (key) => store.has(prefix + key),
      async *keys(inner) {
        for await (const key of store.keys(prefix + (inner ?? ''))) {
          yield key.slice(prefix.length)
        }
      },
      async set(key, value, setOptions) {
        const write = writing(prefix + key, value, setOptions)
        fenced(`write '${key}'`, write)
      },
      async delete(key) {
        fenced(`delete '${key}'`, () =>
          prepared(`DELETE FROM ${table} WHERE key = ?`).run(prefix + key),
        )
      },
      async clear(inner) {
        fenced('clear', clearing(prefix + (inner ?? '')))
      },
    }

    return {
      token,
      storage,
      get held() {
        return held
      },
      async renew() {
        if (!held) return false
        open('renew a lease')
        const row = attempt(`renew the lease on '${prefix}'`, () =>
          prepared(
            `UPDATE ${leases} SET expires_at = ?
             WHERE area = ? AND token = ? AND holder IS NOT NULL AND expires_at > ?
             RETURNING token`,
          ).get(now() + ttlMs, prefix, token, now()),
        )
        if (row === undefined) held = false
        return held
      },
      async release() {
        held = false
        if (closed) return
        // Only this grant's row: a successor's is left exactly as it is.
        attempt(`release the lease on '${prefix}'`, () =>
          prepared(
            `UPDATE ${leases} SET holder = NULL, expires_at = NULL WHERE area = ? AND token = ?`,
          ).run(prefix, token),
        )
      },
    }
  }
}

/** Refuse a lease request that could never be kept. */
function checkLease(options: LeaseOptions): void {
  if (typeof options.holder !== 'string' || options.holder.length === 0) {
    throw new ValidationError('a lease names its holder')
  }
  if (!Number.isInteger(options.ttlMs) || options.ttlMs <= 0) {
    throw new ValidationError(
      `a lease lasts a positive whole number of milliseconds, not ${options.ttlMs}`,
    )
  }
}

/** JSON text for a value, or a refusal naming the key and never the value. */
function encode(key: string, value: unknown): string {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch (error) {
    throw new StorageError(`the value for '${key}' is not JSON data, so it cannot be stored`, {
      cause: error,
    })
  }
  if (text === undefined) {
    throw new StorageError(
      `the value for '${key}' is undefined, which a store cannot hold; delete the key instead`,
    )
  }
  return text
}

/**
 * Run a driver call, reporting a failure as the store's.
 *
 * The driver's own error is kept as the cause — its code says whether the
 * database was busy, full or read-only — and the message says what the store
 * was doing. Values are never quoted: they may be a session or a key.
 */
function attempt<T>(operation: string, run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (
      error instanceof StorageError ||
      error instanceof StorageOwnershipError ||
      error instanceof ValidationError
    ) {
      throw error
    }
    throw new StorageError(`SQLite could not ${operation}`, { cause: error })
  }
}
