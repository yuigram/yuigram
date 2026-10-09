// SPDX-License-Identifier: MIT

/**
 * Counting rate-limit hits in SQLite.
 *
 * The property that matters is the one a plain store cannot give: several
 * processes counting one bucket at once, each told a count of its own, and the
 * limit holding exactly. It is asserted with real processes, each with its own
 * connection to one file, started together.
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { limiter, StorageError, ValidationError } from '@yuigram/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type SqliteDatabase, sqliteCounter } from '../src/index.js'

let directory: string
const opened: SqliteDatabase[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yuigram-limits-'))
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

type Decision = [count: number, allowed: boolean, resetMs: number]

/** Run one contender to completion and read what it printed. */
function contend(
  args: readonly string[],
): Promise<{ pid: number; early: boolean; decisions: Decision[] }> {
  const script = fileURLToPath(new URL('./support/contender.mjs', import.meta.url))

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`contender exited ${code}: ${err}`))
        return
      }
      resolve(JSON.parse(out) as { pid: number; early: boolean; decisions: Decision[] })
    })
  })
}

describe('one step per hit', () => {
  it('opens a window, adds to it, and opens a fresh one once it closes', async () => {
    const counter = sqliteCounter(await open())

    expect(await counter.hit('k', 1_000, 5_000)).toEqual({ count: 1, resetMs: 1_000 })
    expect(await counter.hit('k', 1_000, 5_400)).toEqual({ count: 2, resetMs: 600 })
    expect(await counter.hit('k', 1_000, 5_999)).toEqual({ count: 3, resetMs: 1 })
    expect(await counter.hit('k', 1_000, 6_000)).toEqual({ count: 1, resetMs: 1_000 })
    expect(await counter.hit('other', 1_000, 6_000)).toEqual({ count: 1, resetMs: 1_000 })
  })

  it('forgets a key on reset, and sweeps the windows that have closed', async () => {
    const database = await open()
    const counter = sqliteCounter(database)

    await counter.hit('a', 1_000, 0)
    await counter.hit('a', 1_000, 0)
    await counter.reset('a')
    expect(await counter.hit('a', 1_000, 10)).toEqual({ count: 1, resetMs: 1_000 })

    await counter.hit('b', 5_000, 10)
    expect(await counter.sweep(1_010)).toBe(1)
    expect(database.prepare('SELECT key FROM yuigram_limits').all()).toEqual([{ key: 'b' }])
  })

  it('counts refused attempts too, and tells a limiter how long to wait', async () => {
    let now = 50_000
    const limits = limiter({ counter: sqliteCounter(await open()), now: () => now })
    const rule = { limit: 2, windowMs: 10_000 }

    const decisions = []
    for (let index = 0; index < 4; index += 1) {
      decisions.push(await limits.hit('user:1', rule))
      now += 1_000
    }

    expect(decisions.map((one) => [one.allowed, one.count, one.resetMs])).toEqual([
      [true, 1, 10_000],
      [true, 2, 9_000],
      [false, 3, 8_000],
      [false, 4, 7_000],
    ])
  })

  it('never tells a hit to wait longer than the window, though its clock was read before the window opened', async () => {
    // Two connections to one file, as two processes are. The second read its
    // clock at 999 and reached the database after the first opened the window
    // at 1,000 — which a caller waiting for the write lock does.
    const first = sqliteCounter(await open('stale.db'))
    const second = sqliteCounter(await open('stale.db'))

    await first.hit('k', 60_000, 1_000)
    const late = await second.hit('k', 60_000, 999)

    expect(late.count).toBe(2)
    expect(late.resetMs).toBe(60_000)
  })

  it('reports a database failure as a storage error, which a limiter passes on', async () => {
    const database = await open()
    const limits = limiter({ counter: sqliteCounter(database) })
    database.exec('DROP TABLE yuigram_limits')

    const failure = await limits
      .hit('a', { limit: 1, windowMs: 1_000 })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(StorageError)
    expect(String((failure as Error).cause)).toMatch(/no such table/)
  })

  it('refuses a window that is not a positive length', async () => {
    const counter = sqliteCounter(await open())

    await expect(counter.hit('a', 0, 0)).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('another connection between every statement', () => {
  /**
   * A connection that lets a second one count a hit before each of its own
   * statements runs.
   *
   * The drivers are synchronous, so within one process nothing else can run
   * between two statements on their own — which is exactly the gap a count
   * read separately from its write would fall into when processes share a
   * file. This puts another connection's write into every such gap, every
   * time, rather than hoping a scheduler does.
   */
  function interleaved(inner: SqliteDatabase, between: () => void): SqliteDatabase {
    return {
      exec: (sql) => inner.exec(sql),
      prepare(sql) {
        const statement = inner.prepare(sql)
        return {
          run: (...params) => {
            between()
            return statement.run(...params)
          },
          get: (...params) => {
            between()
            return statement.get(...params)
          },
          all: (...params) => {
            between()
            return statement.all(...params)
          },
        }
      },
    }
  }

  it('gives every hit a count of its own however the two interleave', async () => {
    const first = await open('interleaved.db')
    const second = await open('interleaved.db')
    const theirs = sqliteCounter(second)
    const pending: Array<Promise<{ count: number; resetMs: number }>> = []
    // The second connection's statement runs as soon as `hit` is called: the
    // drivers are synchronous, so it has finished before the first one's does.
    const ours = sqliteCounter(
      interleaved(first, () => {
        pending.push(theirs.hit('k', 60_000, 1_000))
      }),
    )

    const mine = []
    for (let index = 0; index < 20; index += 1) mine.push(await ours.hit('k', 60_000, 1_000))
    const others = await Promise.all(pending)

    const counts = [...mine, ...others].map((one) => one.count).sort((a, b) => a - b)
    expect(counts).toEqual(Array.from({ length: counts.length }, (_, index) => index + 1))
    expect(others.length).toBeGreaterThanOrEqual(20)
  })
})

describe('separate processes on one bucket', () => {
  it('counts every hit exactly once and lets exactly the limit through', async () => {
    const path = join(directory, 'limits.db')
    // Created before the contenders start, so none of them races to make it.
    sqliteCounter(await open('limits.db'))

    const processes = 4
    const hits = 150
    const limit = 211
    // Long enough for every process to load and open its connection first.
    const startAt = Date.now() + 8_000
    const args = [path, String(hits), String(limit), '60000', String(startAt)]

    const runs = await Promise.all(Array.from({ length: processes }, () => contend(args)))

    const counts = runs
      .flatMap((one) => one.decisions.map(([count]) => count))
      .sort((a, b) => a - b)
    const allowed = runs.flatMap((one) => one.decisions.filter(([, ok]) => ok))

    // Four processes, four connections, all ready before the start.
    expect(new Set(runs.map((one) => one.pid)).size).toBe(processes)
    expect(runs.map((one) => one.early)).toEqual([true, true, true, true])
    // Every hit got a count nobody else got: none was read and written over.
    expect(counts).toEqual(Array.from({ length: processes * hits }, (_, index) => index + 1))
    expect(allowed).toHaveLength(limit)
    // Each is told when to try again, within the one window they all share.
    for (const one of runs) {
      for (const [, , resetMs] of one.decisions) {
        expect(resetMs).toBeGreaterThan(0)
        expect(resetMs).toBeLessThanOrEqual(60_000)
      }
    }
    // They really did run at once: some process's counts are spread among the
    // others' rather than all of its hits landing in one block.
    const spread = runs.filter((one) => {
      const own = one.decisions.map(([count]) => count)
      return (own.at(-1) ?? 0) - (own[0] ?? 0) + 1 > hits
    })
    expect(spread.length).toBeGreaterThan(0)
  }, 60_000)
})
