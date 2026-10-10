// SPDX-License-Identifier: MIT

/**
 * One run per account across processes, over a store that leases its areas.
 *
 * Every holder here is a separate operating-system process taking an account's
 * area through the same claim an account makes when it starts, over a real
 * SQLite file and — when `YUIGRAM_TEST_REDIS_URL` names a server this suite may
 * write to — a real Redis server. What is asserted is what a process-wide guard
 * cannot give: that a second process is refused while the first is live, that a
 * crashed one's area comes back on its own, and that a process paused past its
 * lease cannot write after another has taken over.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { Redis } from 'ioredis'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

/** Starting a process that loads TypeScript takes a moment on a busy machine. */
const SLOW = 60_000
const SCRIPT = fileURLToPath(new URL('./support/area-holder.mjs', import.meta.url))
const redisUrl = process.env['YUIGRAM_TEST_REDIS_URL']

type Answer = { ok: boolean; error?: string; message?: string; [key: string]: unknown }

/** A holder process, and a way to talk to it. */
interface Holder {
  ask(command: Record<string, unknown>): Promise<Answer>
  /** Settles when the holder reports its lease lost. */
  readonly lost: Promise<string>
  readonly exited: Promise<number | null>
  readonly child: ChildProcess
}

const running: Holder[] = []

// Wait for each holder to be gone, not only told to go: on Windows a process
// that is still exiting holds its SQLite files open, and removing the
// directory under it fails with EBUSY.
afterEach(async () => {
  const holders = running.splice(0)
  for (const holder of holders) holder.child.kill()
  await Promise.all(holders.map((holder) => holder.exited))
})

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Backend {
  readonly name: string
  location(): string
  namespace(): string
}

async function start(
  backend: Backend,
  account: string,
  holder: string,
  leaseMs: number,
): Promise<Holder> {
  const child = spawn(
    process.execPath,
    [
      SCRIPT,
      backend.name,
      backend.location(),
      backend.namespace(),
      account,
      holder,
      String(leaseMs),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const pending = new Map<number, (answer: Answer) => void>()
  let next = 0
  let reportLost = (_: string): void => {}
  const lost = new Promise<string>((resolve) => {
    reportLost = resolve
  })
  let ready = (): void => {}
  const started = new Promise<void>((resolve) => {
    ready = resolve
  })
  let errors = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    errors += chunk.toString()
  })

  const lines = createInterface({ input: child.stdout as NodeJS.ReadableStream })
  lines.on('line', (line) => {
    const message = JSON.parse(line) as Answer & { id?: number; event?: string }
    if (message.event === 'ready') ready()
    else if (message.event === 'lost') reportLost(String(message['message']))
    else if (message.id !== undefined) pending.get(message.id)?.(message)
  })

  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve))
  const made: Holder = {
    child,
    lost,
    exited,
    ask(command) {
      const id = next++
      return new Promise<Answer>((resolve, reject) => {
        pending.set(id, resolve)
        child.stdin?.write(`${JSON.stringify({ id, ...command })}\n`)
        void exited.then(() => reject(new Error(`the holder exited: ${errors}`)))
      })
    },
  }
  running.push(made)
  await Promise.race([
    started,
    exited.then(() => {
      throw new Error(`the holder did not start: ${errors}`)
    }),
  ])
  return made
}

/** The same cases, over each backend that can be reached. */
function processes(backend: Backend) {
  it(
    'lets one process hold an account’s area and refuses a second while it is live',
    async () => {
      const first = await start(backend, 'main', 'first', 5_000)
      const second = await start(backend, 'main', 'second', 5_000)

      expect(await first.ask({ do: 'claim' })).toMatchObject({ ok: true, scope: 'store' })
      const refused = await second.ask({ do: 'claim' })
      expect(refused).toMatchObject({ ok: false, error: 'StorageOwnershipError' })
      expect(refused.message).toContain('another process')

      // Other accounts in the same store are held apart.
      const other = await start(backend, 'other', 'third', 5_000)
      expect(await other.ask({ do: 'claim' })).toMatchObject({ ok: true })
    },
    SLOW,
  )

  it(
    'hands a released area to the next process at once, and refuses the one that released',
    async () => {
      const first = await start(backend, 'main', 'first', 30_000)
      const second = await start(backend, 'main', 'second', 30_000)

      await first.ask({ do: 'claim' })
      await first.ask({ do: 'write', key: 'state', value: 'first' })
      await first.ask({ do: 'release' })

      expect(await second.ask({ do: 'claim' })).toMatchObject({ ok: true })
      expect(await second.ask({ do: 'read', key: 'state' })).toMatchObject({ value: 'first' })
      await second.ask({ do: 'write', key: 'state', value: 'second' })

      expect(await first.ask({ do: 'write', key: 'state', value: 'late' })).toMatchObject({
        ok: false,
        error: 'StorageOwnershipError',
      })
      expect(await second.ask({ do: 'read', key: 'state' })).toMatchObject({ value: 'second' })
    },
    SLOW,
  )

  it(
    'recovers a crashed process’s area once its lease lapses, with no flag',
    async () => {
      // Both running before anything is claimed: starting a process can take
      // longer than the lease on a loaded machine, and the refusal below has to
      // be asked while the crashed run's lease is still live.
      const crashed = await start(backend, 'main', 'crashed', 3_000)
      const next = await start(backend, 'main', 'next', 3_000)
      await crashed.ask({ do: 'claim' })
      await crashed.ask({ do: 'write', key: 'state', value: 'before the crash' })
      void crashed.ask({ do: 'crash' }).catch(() => undefined)
      await crashed.exited

      expect(await next.ask({ do: 'claim' })).toMatchObject({ ok: false })

      await pause(3_200)
      expect(await next.ask({ do: 'claim' })).toMatchObject({ ok: true, scope: 'store' })
      expect(await next.ask({ do: 'read', key: 'state' })).toMatchObject({
        value: 'before the crash',
      })
    },
    SLOW,
  )

  it(
    'refuses a paused process’s writes after another took over, and tells it',
    async () => {
      const paused = await start(backend, 'main', 'paused', 600)
      const successor = await start(backend, 'main', 'successor', 600)
      await paused.ask({ do: 'claim' })
      await paused.ask({ do: 'write', key: 'state', value: 'paused, before' })

      // Frozen: no timer runs in it, so nothing renews its lease.
      const frozen = paused.ask({ do: 'freeze', ms: 2_500 })
      await pause(900)
      expect(await successor.ask({ do: 'claim' })).toMatchObject({ ok: true })
      await successor.ask({ do: 'write', key: 'state', value: 'successor' })

      // Awake again, and still believing, until it asks, that it holds the area.
      await frozen
      const late = await paused.ask({ do: 'write', key: 'state', value: 'paused, after' })
      expect(late).toMatchObject({ ok: false, error: 'StorageOwnershipError' })
      expect(await paused.lost).toContain('was lost')

      expect(await successor.ask({ do: 'read', key: 'state' })).toMatchObject({
        value: 'successor',
      })
      expect(await successor.ask({ do: 'write', key: 'state', value: 'still' })).toMatchObject({
        ok: true,
      })
    },
    SLOW,
  )

  it(
    'lets a takeover supersede a live process, whose writes are refused from then on',
    async () => {
      const live = await start(backend, 'main', 'live', 900)
      const taker = await start(backend, 'main', 'taker', 900)
      await live.ask({ do: 'claim' })

      expect(await taker.ask({ do: 'claim', takeOver: true })).toMatchObject({ ok: true })
      await taker.ask({ do: 'write', key: 'state', value: 'taker' })

      expect(await live.ask({ do: 'write', key: 'state', value: 'live' })).toMatchObject({
        ok: false,
        error: 'StorageOwnershipError',
      })
      expect(await live.lost).toBeTypeOf('string')
      expect(await taker.ask({ do: 'read', key: 'state' })).toMatchObject({ value: 'taker' })
    },
    SLOW,
  )
}

describe('over one SQLite file', () => {
  let directory = ''
  let file = 0

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'yuigram-lease-processes-'))
  })
  afterEach(() => {
    file += 1
  })
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  processes({
    name: 'sqlite',
    location: () => join(directory, `store-${file}.db`),
    namespace: () => '',
  })
})

describe.skipIf(redisUrl === undefined)('over one Redis server', () => {
  const run = `yuigram-test:${process.pid}:${Date.now()}:`
  let round = 0

  afterEach(() => {
    round += 1
  })
  afterAll(async () => {
    const client = new Redis(redisUrl as string)
    let cursor = '0'
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${run}*`, 'COUNT', 500)
      cursor = next
      if (keys.length > 0) await client.del(...keys)
    } while (cursor !== '0')
    await client.quit()
  })

  processes({
    name: 'redis',
    location: () => redisUrl as string,
    namespace: () => `${run}${round}:`,
  })
})
