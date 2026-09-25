/**
 * Counting rate-limit hits in SQLite, one statement per hit.
 *
 * A limiter over a plain store reads a count and writes it back, and two
 * processes can both read the same count between those two steps. Here the
 * read and the write are one statement — an insert that becomes an update on
 * conflict and returns the row it left — and SQLite runs a statement under its
 * write lock, so two connections counting the same key are ordered by the
 * database and each is told its own count.
 *
 * ```
 *   INSERT (key, 1, now + window)
 *   ON CONFLICT: window closed?  → count = 1,         reset_at = now + window
 *                window open?    → count = count + 1, reset_at unchanged
 *   RETURNING count, reset_at
 * ```
 *
 * The clock is the caller's. Processes on one machine share one, which is the
 * case a database file serves; across machines, their clocks decide where a
 * window ends, and skew between them moves the boundary by that much.
 */

import { StorageError, ValidationError, type WindowCounter } from '@yuigram/core'
import { type SqliteDatabase, type SqliteStatement, tableName } from './driver.js'

/** Options for {@link sqliteCounter}. */
export interface SqliteCounterOptions {
  /** The table windows live in, created if missing. `yuigram_limits` unless given. */
  readonly table?: string
}

/** A counter over a SQLite table, and the means to tidy it. */
export interface SqliteCounter extends WindowCounter {
  /** Delete every window that has closed, and say how many went. */
  sweep(now?: number): Promise<number>
}

interface Counted {
  readonly count: number | bigint
  readonly reset_at: number | bigint
}

/**
 * An atomic counter for a limiter shared between processes.
 *
 * ```ts
 * const limits = limiter({ counter: sqliteCounter(database) })
 * ```
 */
export function sqliteCounter(
  database: SqliteDatabase,
  options: SqliteCounterOptions = {},
): SqliteCounter {
  const table = tableName(options.table ?? 'yuigram_limits')

  attempt('create the table', () =>
    database.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (
         key TEXT PRIMARY KEY NOT NULL,
         count INTEGER NOT NULL,
         reset_at INTEGER NOT NULL
       ) WITHOUT ROWID`,
    ),
  )

  const statements = new Map<string, SqliteStatement>()
  // Prepared inside the attempt that uses it, so a statement the database
  // refuses to prepare — its table dropped, say — fails as the store's error.
  const prepared = (sql: string): SqliteStatement => {
    let statement = statements.get(sql)
    if (statement === undefined) {
      statement = database.prepare(sql)
      statements.set(sql, statement)
    }
    return statement
  }

  return {
    async hit(key, windowMs, now) {
      if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new ValidationError(
          `a window lasts a positive number of milliseconds, not ${windowMs}`,
        )
      }
      const at = Math.floor(now)
      const closes = at + Math.ceil(windowMs)

      const row = attempt(`count a hit for '${key}'`, () =>
        prepared(
          `INSERT INTO ${table} (key, count, reset_at) VALUES (?, 1, ?)
           ON CONFLICT (key) DO UPDATE SET
             count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
             reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
           RETURNING count, reset_at`,
        ).get(key, closes, at, at, closes),
      ) as Counted | undefined

      if (row === undefined) {
        throw new StorageError(`SQLite returned no row for the hit on '${key}'`)
      }

      return { count: Number(row.count), resetMs: Number(row.reset_at) - at }
    },

    async reset(key) {
      attempt(`reset '${key}'`, () => prepared(`DELETE FROM ${table} WHERE key = ?`).run(key))
    },

    async sweep(now = Date.now()) {
      const rows = attempt('sweep', () =>
        prepared(`DELETE FROM ${table} WHERE reset_at <= ? RETURNING key`).all(Math.floor(now)),
      )
      return rows.length
    },
  }
}

function attempt<T>(operation: string, run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof StorageError || error instanceof ValidationError) throw error
    throw new StorageError(`SQLite could not ${operation}`, { cause: error })
  }
}
