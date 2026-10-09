// SPDX-License-Identifier: MIT

/**
 * SQLite storage for Yuigram.
 *
 * A key-value store that serves sessions, conversation state, caches and an
 * account's own state, and an atomic counter for rate limits shared between
 * processes. Both take a connection the application supplies — `node:sqlite`,
 * `better-sqlite3` or `bun:sqlite` — so installing this package installs no
 * native module, and {@link openDatabase} opens a file with the runtime's own
 * SQLite where there is one.
 */

export { type SqliteCounter, type SqliteCounterOptions, sqliteCounter } from './counter.js'
export type {
  SqliteDatabase,
  SqliteStatement,
  SqliteValue,
} from './driver.js'
export { type OpenDatabaseOptions, openDatabase } from './open.js'
export { type SqliteStore, type SqliteStoreOptions, sqliteStore } from './store.js'
