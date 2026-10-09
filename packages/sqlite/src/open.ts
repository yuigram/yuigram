// SPDX-License-Identifier: MPL-2.0

/**
 * Opening a database file with the runtime's own SQLite.
 *
 * Node 22.5 and later carry SQLite as `node:sqlite`, so a file can be opened
 * without installing anything. It is loaded when this is called rather than
 * when the package is imported, so an application that hands over a
 * connection of its own never loads it, and a runtime without it fails here
 * with a message rather than at import.
 */

import { ConfigError, StorageError } from '@yuigram/core'
import type { SqliteDatabase } from './driver.js'

/** Options for {@link openDatabase}. */
export interface OpenDatabaseOptions {
  /**
   * How long a statement waits for another connection's write to finish
   * before failing, in milliseconds. Five seconds unless given.
   *
   * Without one, a second process writing at the same moment fails at once
   * with "database is locked" rather than waiting its turn.
   */
  readonly busyTimeoutMs?: number
}

/**
 * Open a database file, ready to be shared between processes.
 *
 * Write-ahead logging, so readers do not wait for a writer; a busy timeout, so
 * writers wait for each other rather than failing; and, where the platform has
 * permissions to set, a file only its owner can read — the file may hold an
 * account's authorization.
 *
 * ```ts
 * const database = await openDatabase('./bot.db')
 * const sessions = sqliteStore(database, { table: 'sessions' })
 * const limits = limiter({ counter: sqliteCounter(database) })
 * ```
 *
 * The connection is the caller's to close.
 */
export async function openDatabase(
  path: string,
  options: OpenDatabaseOptions = {},
): Promise<SqliteDatabase> {
  const busy = options.busyTimeoutMs ?? 5_000
  if (!Number.isInteger(busy) || busy < 0) {
    throw new ConfigError(`a busy timeout is a whole number of milliseconds, not ${busy}`)
  }

  let sqlite: typeof import('node:sqlite')
  try {
    sqlite = await import('node:sqlite')
  } catch (error) {
    throw new ConfigError(
      'this runtime has no built-in SQLite (Node.js 22.5 or later has one); open the database with a driver and pass the connection to sqliteStore instead',
      { cause: error },
    )
  }

  let database: InstanceType<typeof sqlite.DatabaseSync>
  try {
    database = new sqlite.DatabaseSync(path)
    database.exec(`PRAGMA busy_timeout = ${busy}`)
    if (path !== ':memory:') database.exec('PRAGMA journal_mode = WAL')
  } catch (error) {
    throw new StorageError(`SQLite could not open '${path}'`, { cause: error })
  }

  if (path !== ':memory:' && process.platform !== 'win32') {
    const { chmod } = await import('node:fs/promises')
    // Best effort: a file the process can open but not change the mode of is
    // still usable, and refusing it would stop a working deployment.
    await chmod(path, 0o600).catch(() => undefined)
  }

  return database as unknown as SqliteDatabase
}
