// SPDX-License-Identifier: MIT

/**
 * The file store under contention.
 *
 * Within one process, operations on one file run one at a time in the order
 * they were asked for, across every store pointed at the directory; a
 * replacement Windows refuses because something holds the file open is tried
 * again a bounded number of times; and a write that fails leaves no temporary
 * file behind. Nothing here claims to lock across processes.
 *
 * Most cases run over a filesystem that lives in memory and fails when a case
 * says so, so every failure and every interleaving is a decision rather than a
 * race. The last cases use the real filesystem.
 */

import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type FileStoreIo, type FileSystem, file, fileStore } from '../src/storage/file.js'

/** An error of the shape Node raises, with its code. */
const failure = (code: string): Error => Object.assign(new Error(`${code}: refused`), { code })

/** A promise a case settles when it chooses. */
function deferred() {
  let release: () => void = () => {}
  const promise = new Promise<void>((done) => {
    release = done
  })

  return { promise, release }
}

/**
 * A filesystem in memory that records what was done to it.
 *
 * `renames` decides each rename in turn: an error code to refuse with, a
 * promise to wait for first, both, or nothing to let it through.
 */
function memoryFs(platform = 'win32') {
  const files = new Map<string, string>()
  const log: string[] = []
  const renames: Array<
    string | Promise<void> | { after: Promise<void>; code: string } | undefined
  > = []
  const writes: Array<string | undefined> = []
  const mkdirs: Array<Promise<void> | undefined> = []
  const slept: number[] = []

  const name = (path: string) => path.split(/[\\/]/).at(-1) ?? path

  const fs: FileSystem = {
    async mkdir() {
      await mkdirs.shift()
      return undefined
    },
    async readdir() {
      return [...files.keys()].map(name)
    },
    async readFile(path) {
      log.push(`read ${name(path)}`)
      const text = files.get(path)
      if (text === undefined) throw failure('ENOENT')
      return text
    },
    async writeFile(path, data) {
      const refusal = writes.shift()
      log.push(`write ${name(path).endsWith('.tmp') ? 'temporary' : name(path)}`)
      if (refusal !== undefined) {
        // A failed write can still leave a partial file behind.
        files.set(path, data.slice(0, 3))
        throw failure(refusal)
      }
      files.set(path, data)
    },
    async rename(from, to) {
      const decision = renames.shift()
      if (decision instanceof Promise) await decision
      if (typeof decision === 'object' && !(decision instanceof Promise)) await decision.after
      log.push('rename')
      if (typeof decision === 'string') throw failure(decision)
      if (typeof decision === 'object' && !(decision instanceof Promise))
        throw failure(decision.code)
      const text = files.get(from)
      if (text === undefined) throw failure('ENOENT')
      files.delete(from)
      files.set(to, text)
    },
    async rm(path) {
      log.push(`remove ${name(path).endsWith('.tmp') ? 'temporary' : 'file'}`)
      files.delete(path)
    },
  }

  const io: FileStoreIo = {
    fs,
    platform,
    sleep: async (ms) => {
      slept.push(ms)
    },
  }

  return {
    io,
    files,
    log,
    renames,
    writes,
    mkdirs,
    slept,
    temporaries: () => [...files.keys()].filter((path) => path.endsWith('.tmp')),
  }
}

const DIRECTORY = join(tmpdir(), 'yuigram-file-store-cases')

/** Let pending work move on. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('a replacement Windows refuses', () => {
  it('is tried again after a short wait, and succeeds once the handle is gone', async () => {
    const fake = memoryFs()
    const store = fileStore<number>(join(DIRECTORY, 'retry'), {}, fake.io)
    fake.renames.push('EPERM', 'EBUSY')

    await store.set('key', 1)

    expect(await store.get('key')).toBe(1)
    expect(fake.slept).toEqual([10, 25])
    expect(fake.temporaries()).toEqual([])
  })

  it('is given up on after a bounded number of tries, with the refusal as it was and the old value kept', async () => {
    const fake = memoryFs()
    const store = fileStore<number>(join(DIRECTORY, 'exhausted'), {}, fake.io)
    await store.set('key', 1)
    fake.renames.push(...Array.from({ length: 10 }, () => 'EACCES'))

    const refused = await store.set('key', 2).catch((error: unknown) => error)

    expect((refused as { code?: string }).code).toBe('EACCES')
    expect(fake.slept).toEqual([10, 25, 50, 100, 200, 400])
    expect(fake.temporaries()).toEqual([])
    // Never deleted to make room: the key still holds what it held.
    expect(await store.get('key')).toBe(1)
  })

  it('is not retried when the refusal is not one an open handle causes', async () => {
    const fake = memoryFs()
    const store = fileStore<number>(join(DIRECTORY, 'permanent'), {}, fake.io)
    fake.renames.push('ENOSPC')

    await expect(store.set('key', 1)).rejects.toMatchObject({ code: 'ENOSPC' })

    expect(fake.slept).toEqual([])
    expect(fake.temporaries()).toEqual([])
    expect(await store.get('key')).toBeUndefined()
  })

  it('is not retried on a platform where the refusal means what it says', async () => {
    const fake = memoryFs('linux')
    const store = fileStore<number>(join(DIRECTORY, 'posix'), {}, fake.io)
    fake.renames.push('EPERM')

    await expect(store.set('key', 1)).rejects.toMatchObject({ code: 'EPERM' })

    expect(fake.slept).toEqual([])
    expect(fake.temporaries()).toEqual([])
  })
})

describe('a write that fails before the replacement', () => {
  it('leaves no temporary file behind, and reports the write failure itself', async () => {
    const fake = memoryFs()
    const store = fileStore<number>(join(DIRECTORY, 'write'), {}, fake.io)
    fake.writes.push('ENOSPC')

    await expect(store.set('key', 1)).rejects.toMatchObject({ code: 'ENOSPC' })

    expect(fake.temporaries()).toEqual([])
    expect(fake.log).toEqual(['write temporary', 'remove temporary'])
  })
})

describe('operations on one key', () => {
  it('run in the order they were asked for, so an older write retrying cannot land after a newer one', async () => {
    const fake = memoryFs()
    const store = fileStore<string>(join(DIRECTORY, 'order'), {}, fake.io)
    const held = deferred()
    // The first replacement waits, then is refused once and retried.
    fake.renames.push({ after: held.promise, code: 'EPERM' })

    const older = store.set('key', 'older')
    await settle()
    const newer = store.set('key', 'newer')
    await settle()

    // The newer write has not even been started while the older one is open.
    expect(fake.log).toEqual(['write temporary'])

    held.release()
    await Promise.all([older, newer])

    expect(fake.log).toEqual(['write temporary', 'rename', 'rename', 'write temporary', 'rename'])
    expect(await store.get('key')).toBe('newer')
  })

  it('order a removal after the write before it, and a read after both', async () => {
    const fake = memoryFs()
    const store = fileStore<string>(join(DIRECTORY, 'removal'), {}, fake.io)
    const held = deferred()
    fake.renames.push(held.promise)

    const written = store.set('key', 'value')
    const removed = store.delete('key')
    const read = store.get('key')
    await settle()
    held.release()
    await Promise.all([written, removed])

    expect(await read).toBeUndefined()
    expect(fake.log.slice(0, 3)).toEqual(['write temporary', 'rename', 'remove file'])
    expect(fake.log[3]).toMatch(/^read [0-9a-f]{64}\.json$/)
  })

  it('are ordered across two stores pointed at the same directory', async () => {
    const fake = memoryFs()
    const directory = join(DIRECTORY, 'shared')
    const one = fileStore<string>(directory, {}, fake.io)
    const two = fileStore<string>(directory, {}, fake.io)
    const held = deferred()
    fake.renames.push(held.promise)

    const first = one.set('key', 'from one')
    const second = two.set('key', 'from two')
    await settle()
    expect(fake.log).toEqual(['write temporary'])

    held.release()
    await Promise.all([first, second])

    expect(await one.get('key')).toBe('from two')
  })

  it('keep the order they were asked in when one store is slower to make its directory', async () => {
    // Each store makes the directory once, on its first operation. A write
    // that waited for that before taking its place in the queue could be
    // overtaken by a later write from a store that was ready sooner.
    const fake = memoryFs()
    const directory = join(DIRECTORY, 'slow-directory')
    const one = fileStore<string>(directory, {}, fake.io)
    const two = fileStore<string>(directory, {}, fake.io)
    const slow = deferred()
    fake.mkdirs.push(slow.promise)

    const first = one.set('key', 'from one')
    const second = two.set('key', 'from two')
    await settle()
    expect(fake.log).toEqual([])

    slow.release()
    await Promise.all([first, second])

    expect(await two.get('key')).toBe('from two')
  })

  it('do not hold up an unrelated key', async () => {
    const fake = memoryFs()
    const store = fileStore<string>(join(DIRECTORY, 'unrelated'), {}, fake.io)
    const held = deferred()
    fake.renames.push(held.promise)

    const slow = store.set('slow', 'value')
    await settle()
    await store.set('other', 'value')

    expect(await store.get('other')).toBe('value')
    held.release()
    await slow
  })

  it('do not let a read that finds an expired value remove one written after it', async () => {
    let clock = 1_000
    const fake = memoryFs()
    const store = fileStore<string>(join(DIRECTORY, 'expiry'), { now: () => clock }, fake.io)
    await store.set('key', 'old', { ttl: 1 })
    clock += 5_000

    // The read that will find the old value expired, and the write of a new
    // one, asked for in that order.
    const read = store.get('key')
    const written = store.set('key', 'new')
    await Promise.all([read, written])

    expect(await read).toBeUndefined()
    expect(await store.get('key')).toBe('new')
  })
})

describe('the real filesystem', () => {
  const made: string[] = []
  afterEach(() => {
    for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true })
  })
  const directory = (): string => {
    const created = mkdtempSync(join(tmpdir(), 'yuigram-file-store-'))
    made.push(created)
    return created
  }

  it('ends with the last of many writes to one key, from two stores, and no leftovers', async () => {
    const where = directory()
    const one = file<number>(where)
    const two = file<number>(where)

    await Promise.all(
      Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? one : two).set('key', index)),
    )

    expect(await one.get('key')).toBe(39)
    expect(await two.get('key')).toBe(39)
    expect(readdirSync(where).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('ends as the order of writes and removals says', async () => {
    const where = directory()
    const store = file<string>(where)

    await Promise.all([
      store.set('key', 'a'),
      store.delete('key'),
      store.set('key', 'b'),
      store.set('other', 'c'),
      store.delete('other'),
    ])

    expect(await store.get('key')).toBe('b')
    expect(await store.get('other')).toBeUndefined()
    expect(readdirSync(where).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
