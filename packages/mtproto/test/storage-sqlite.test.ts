// SPDX-License-Identifier: MIT

/**
 * An account whose state lives in SQLite.
 *
 * The account's store is the key-value contract, so a SQLite table holds its
 * authorization, its datacenter configuration, its peers and its update state
 * as well as a directory would. What is asserted is the part that matters: a
 * second run over the same file, on a new connection, is the same account — it
 * resumes with the key the first run negotiated rather than negotiating
 * another.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, sqliteStore } from '@yuigram/sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MockDatacenter } from './server/datacenter.js'
import { createServerKey } from './server/keys.js'
import { mockAccount } from './support/mock-account.js'

const KEY = createServerKey()

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yuigram-account-sqlite-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

/** Which connections at a datacenter negotiated a key of their own. */
const exchanges = (datacenter: MockDatacenter) =>
  datacenter.connections.map((connection) => connection.peer.result !== undefined)

describe('an account kept in SQLite', () => {
  it('resumes from the file on a new connection rather than authorizing again', async () => {
    const path = join(directory, 'account.db')

    const firstDatabase = await openDatabase(path)
    const first = mockAccount({ key: KEY, storage: sqliteStore(firstDatabase) })
    await first.account.connect()
    await first.account.api.call({ _: 'help.getConfig' })
    await first.dispose()
    firstDatabase.close?.()

    const rows = await openDatabase(path)
    const keys = (
      rows.prepare('SELECT key FROM yuigram_kv ORDER BY key').all() as Array<{
        key: string
      }>
    ).map((row) => row.key)
    rows.close?.()
    // The authorization went to the file, under the account's own area.
    expect(keys.some((key) => /auth:dc2:key$/.test(key))).toBe(true)

    const secondDatabase = await openDatabase(path)
    const second = mockAccount({
      key: KEY,
      datacenters: first.datacenters,
      storage: sqliteStore(secondDatabase),
    })
    try {
      await second.account.connect()
      const answer = (await second.account.api.call({
        _: 'ping',
        ping_id: 7n,
      })) as unknown as { ping_id: bigint }

      expect(answer.ping_id).toBe(7n)
      // The newest connection carried the stored key: no exchange on it.
      expect(exchanges(first.datacenter(2)).at(-1)).toBe(false)
    } finally {
      await second.dispose()
      secondDatabase.close?.()
    }
  }, 60_000)
})
