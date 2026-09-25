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
 * What this does not do is exclude a second process from an account's area.
 * Two processes can open the same file, and nothing here stops them both
 * running one account; it says it is persistent, which is what tells the
 * account layer not to take a process-local guard for more than it is.
 */

import { type DescribedKV, type KVInfo, StorageError, ValidationError } from '@yuigram/core'
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
export interface SqliteStore<V = unknown> extends DescribedKV<V> {
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
  const info: KVInfo = { driver: 'sqlite', persistent: true }
  let closed = false

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

  return {
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
      const text = encode(key, value)
      const ttl = setOptions?.ttl
      if (ttl !== undefined && (!Number.isFinite(ttl) || ttl <= 0)) {
        throw new ValidationError(`a time to live is a positive number of seconds, not ${ttl}`)
      }
      const expiresAt = ttl === undefined ? null : now() + Math.round(ttl * 1000)

      attempt(`write '${key}'`, () =>
        prepared(
          `INSERT INTO ${table} (key, value, expires_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
        ).run(key, text, expiresAt),
      )
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
      if (prefix === undefined) {
        attempt('clear', () => prepared(`DELETE FROM ${table}`).run())
        return
      }
      // A comparison on the leading characters rather than LIKE, which would
      // read `_` and `%` in a prefix as wildcards and clear the wrong keys.
      attempt(`clear '${prefix}'`, () =>
        prepared(`DELETE FROM ${table} WHERE ${UNDER}`).run(prefix, prefix),
      )
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

    async close() {
      if (closed) return
      closed = true
      statements.clear()
      if (options.ownsConnection === true) attempt('close', () => database.close?.())
    },
  }

  function count(): number {
    const row = attempt('count', () =>
      prepared(`SELECT count(*) AS total FROM ${table}`).get(),
    ) as { readonly total: number | bigint }
    return Number(row.total)
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
    if (error instanceof StorageError || error instanceof ValidationError) throw error
    throw new StorageError(`SQLite could not ${operation}`, { cause: error })
  }
}
