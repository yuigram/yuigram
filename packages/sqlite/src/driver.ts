// SPDX-License-Identifier: MPL-2.0

/**
 * What this package needs of a SQLite connection.
 *
 * The connection is the application's: `node:sqlite`, `better-sqlite3` and
 * `bun:sqlite` all offer this much under these names, so any of them can be
 * handed over as it is. Depending on none of them keeps a native module out of
 * every install that does not want one, and lets the application choose its
 * driver, its file and its pragmas.
 */

import { ValidationError } from '@yuigram/core'

/** A value a statement binds or a row carries. */
export type SqliteValue = string | number | bigint | null | Uint8Array

/** A prepared statement. */
export interface SqliteStatement {
  /** Run it for its effect. */
  run(...params: SqliteValue[]): unknown
  /** The first row, or `undefined` for none. */
  get(...params: SqliteValue[]): unknown
  /** Every row. */
  all(...params: SqliteValue[]): unknown[]
}

/** A connection to one database. */
export interface SqliteDatabase {
  /** Run one or more statements with no parameters. */
  exec(sql: string): unknown
  /** Prepare a statement. */
  prepare(sql: string): SqliteStatement
  /** Close the connection. Called only for a connection this package opened. */
  close?(): unknown
}

/**
 * A table name, checked.
 *
 * Names are written into statements rather than bound, since SQL binds values
 * and not names, so anything other than a plain identifier is refused rather
 * than quoted and hoped for.
 */
export function tableName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) {
    throw new ValidationError(
      `a table name is a letter or underscore followed by letters, digits or underscores, not '${name}'`,
    )
  }

  return name
}
