/**
 * Filesystem key-value store.
 *
 * Deliberately unsophisticated: one JSON file per key, written atomically via
 * a temporary file and a rename. It exists so that "persist my sessions" needs
 * no infrastructure, not to be a database. Past a few thousand keys, use
 * SQLite.
 *
 * Keys are hashed before becoming filenames. A session key is frequently
 * derived from user input, and a raw key would allow a chat title containing
 * `../` to escape the directory.
 *
 * Within one process, operations on one file run one at a time and in the
 * order they were asked for, whichever store object asked: a later write never
 * lands before an earlier one, and a read never holds a file open while it is
 * being replaced. Across processes nothing is locked; that is what the account
 * storage lease is for.
 */

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { FileOptions } from './file-options.js'
import type { DescribedKV, KVInfo, SetOptions } from './types.js'

interface Envelope<V> {
  /** The original key, retained so `keys()` can report it. */
  readonly key: string
  readonly value: V
  /** Epoch milliseconds at which this expires. */
  readonly expiresAt: number | null
}

/** Bits that let somebody other than the owner in. */
const OTHERS = 0o077

/**
 * The filesystem operations the store performs.
 *
 * Named so that a test can stand in for the filesystem and decide when an
 * operation fails; the store itself always uses Node's.
 */
export interface FileSystem {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<unknown>
  readdir(path: string): Promise<string[]>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, data: string, options: { encoding: 'utf8'; mode: number }): Promise<void>
  rename(from: string, to: string): Promise<void>
  rm(path: string, options: { force: true }): Promise<void>
}

/** What a store runs on: the filesystem, the platform it answers for, and a way to wait. */
export interface FileStoreIo {
  readonly fs: FileSystem
  readonly platform: string
  readonly sleep: (ms: number) => Promise<void>
}

const NODE_IO: FileStoreIo = {
  fs: { mkdir, readdir, readFile, writeFile, rename, rm },
  platform: process.platform,
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
}

/**
 * The waits before each further attempt at a refused replacement.
 *
 * Windows refuses to rename over a file that another handle has open — a
 * virus scanner or the search indexer reading what was just written, or a
 * process outside this one — and the refusal lasts as long as the handle.
 * About three quarters of a second in all, after which the refusal is the
 * caller's to see.
 */
const REPLACE_RETRY_DELAYS: readonly number[] = [10, 25, 50, 100, 200, 400]

/** The codes Windows answers a rename over an open file with. */
const TRANSIENT_REPLACE = new Set(['EPERM', 'EACCES', 'EBUSY'])

/**
 * The tail of the queue for each file, across every store in this process.
 *
 * Keyed by the absolute path, compared without case where the filesystem
 * ignores it, so two stores pointed at one directory share one queue.
 */
const queues = new Map<string, Promise<void>>()

/** Run an operation on a file once every operation asked for before it has finished. */
function inOrder<T>(path: string, platform: string, run: () => Promise<T>): Promise<T> {
  const absolute = resolve(path)
  const key = platform === 'win32' ? absolute.toLowerCase() : absolute

  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.then(run, run)
  const tail = next.then(
    () => undefined,
    () => undefined,
  )
  queues.set(key, tail)
  // Forgotten once nothing is queued behind it, so the map holds only files
  // with work in progress.
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })

  return next
}

/** The code a filesystem error carries, if it carries one. */
function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code

  return typeof code === 'string' ? code : undefined
}

/**
 * Put a written file in place of the old one, in one step.
 *
 * Retried only where a retry can help: on Windows, for the refusals an open
 * handle causes, a bounded number of times. The old file is never removed
 * first, so at every moment the key holds either its previous value or its
 * new one.
 */
async function replace(io: FileStoreIo, temporary: string, path: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await io.fs.rename(temporary, path)
      return
    } catch (error) {
      const delay = REPLACE_RETRY_DELAYS[attempt]
      const transient = io.platform === 'win32' && TRANSIENT_REPLACE.has(codeOf(error) ?? '')
      if (!transient || delay === undefined) throw error

      await io.sleep(delay)
    }
  }
}

/**
 * Whether a mode lets anyone but the owner at what is inside.
 *
 * The directory is what matters rather than the files in it: on a POSIX
 * filesystem nobody reaches a file whose directory denies them, so a session
 * left readable inside a private directory is still private, and a private file
 * inside a readable directory is not. `docs/security.md` §3 asks for a warning
 * when a session has been copied or checked out carelessly, and that is what
 * carelessness looks like from here.
 */
export function isTooOpen(mode: number): boolean {
  return (mode & OTHERS) !== 0
}

/**
 * Read a path's permission bits, where they mean something.
 *
 * Windows reports a mode derived from the read-only attribute rather than from
 * the access-control list that actually decides who may read the file, so the
 * bits there would fail this check for every user while saying nothing about
 * their exposure. Declining is the honest answer: a warning nobody can act on
 * is one everybody learns to ignore.
 */
async function permissionsOf(path: string): Promise<number | undefined> {
  if (process.platform === 'win32') return undefined

  try {
    return (await stat(path)).mode
  } catch {
    return undefined
  }
}

/** Map a key to a filesystem-safe name. */
function fileNameFor(key: string): string {
  return `${createHash('sha256').update(key).digest('hex')}.json`
}

/**
 * Names this store could have produced.
 *
 * Used to decide what `clear` may delete. The store is pointed at a directory
 * but does not own everything in it: a caller may reasonably keep a database
 * or a config file alongside, and removing the directory wholesale would
 * destroy data the store never wrote.
 */
const OWNED_FILE = /^[0-9a-f]{64}\.json$/

/** True for a file this store wrote. */
function isOwned(name: string): boolean {
  return OWNED_FILE.test(name)
}

/** Create a filesystem-backed store rooted at `directory`. */
export function file<V = unknown>(directory: string, options: FileOptions = {}): DescribedKV<V> {
  return fileStore<V>(directory, options, NODE_IO)
}

/** The store over a given filesystem. {@link file} is this over Node's. */
export function fileStore<V = unknown>(
  directory: string,
  options: FileOptions,
  io: FileStoreIo,
): DescribedKV<V> {
  const fs = io.fs
  const ordered = <T>(path: string, run: () => Promise<T>): Promise<T> =>
    inOrder(path, io.platform, run)
  const now = options.now ?? Date.now
  const info: KVInfo = { driver: 'file', persistent: true }

  const log = options.log
  const permissions = options.permissions ?? permissionsOf

  let ready: Promise<void> | undefined
  const ensureDirectory = (): Promise<void> => {
    // Owner-only: the directory holds session state, and the default mode
    // leaves it listable by every account on the machine. The files inside are
    // already 0600, so this is defence in depth rather than the only guard.
    //
    // The mode is checked after, not instead: `mkdir` sets it on a directory it
    // creates and leaves an existing one alone, so a store pointed at a
    // directory somebody else made — or at one restored from an archive that
    // did not carry modes — would otherwise be silently wide open.
    ready ??= fs
      .mkdir(directory, { recursive: true, mode: 0o700 })
      .then(async () => await warnIfOpen())
      .then(() => undefined)

    return ready
  }

  /** Say so, once, if the directory lets anyone but its owner in. */
  const warnIfOpen = async (): Promise<void> => {
    if (log === undefined) return

    const mode = await permissions(directory)
    if (mode === undefined || !isTooOpen(mode)) return

    log.warn('the storage directory is readable beyond its owner', {
      directory,
      mode: (mode & 0o777).toString(8).padStart(3, '0'),
    })
  }

  /**
   * Read and parse an envelope, treating any unreadable file as absent.
   *
   * In the file's queue, because reading may remove: a removal decided on the
   * strength of an old read must not take away a value written since.
   */
  const read = async (key: string): Promise<Envelope<V> | undefined> => {
    await ensureDirectory()
    const path = join(directory, fileNameFor(key))

    return await ordered(path, async () => {
      let text: string
      try {
        text = await fs.readFile(path, 'utf8')
      } catch {
        return undefined
      }

      let envelope: Envelope<V>
      try {
        envelope = JSON.parse(text) as Envelope<V>
      } catch {
        // A truncated or corrupt file is treated as a miss rather than an error:
        // framework state degrades gracefully by design.
        await fs.rm(path, { force: true })
        return undefined
      }

      if (envelope.expiresAt !== null && envelope.expiresAt <= now()) {
        await fs.rm(path, { force: true })
        return undefined
      }

      return envelope
    })
  }

  return {
    info,

    async get(key) {
      return (await read(key))?.value
    },

    async set(key, value, setOptions: SetOptions = {}) {
      await ensureDirectory()

      const envelope: Envelope<V> = {
        key,
        value,
        expiresAt: setOptions.ttl === undefined ? null : now() + setOptions.ttl * 1000,
      }

      const path = join(directory, fileNameFor(key))
      const text = JSON.stringify(envelope)

      await ordered(path, async () => {
        // Write to a unique temporary file, then rename. A crash mid-write then
        // leaves the previous value intact rather than a half-written one.
        const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`

        try {
          await fs.writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 })
          await replace(io, temporary, path)
        } catch (error) {
          // The write did not happen; neither does its leftover. The caller
          // sees the failure itself, not one from tidying up after it.
          await fs.rm(temporary, { force: true }).catch(() => undefined)
          throw error
        }
      })
    },

    async delete(key) {
      await ensureDirectory()
      const path = join(directory, fileNameFor(key))
      await ordered(path, async () => await fs.rm(path, { force: true }))
    },

    async has(key) {
      return (await read(key)) !== undefined
    },

    async clear(prefix) {
      await ensureDirectory()

      if (prefix !== undefined) {
        for await (const key of this.keys?.(prefix) ?? []) {
          await this.delete(key)
        }
        return
      }

      // Only the files this store wrote. Removing the directory would take
      // anything a caller keeps alongside it with it.
      let names: string[]
      try {
        names = await fs.readdir(directory)
      } catch {
        return
      }

      for (const name of names) {
        if (!isOwned(name)) continue
        const path = join(directory, name)
        await ordered(path, async () => await fs.rm(path, { force: true }))
      }
    },

    async *keys(prefix) {
      await ensureDirectory()

      let names: string[]
      try {
        names = await fs.readdir(directory)
      } catch {
        return
      }

      for (const name of names) {
        if (!isOwned(name)) continue

        // The filename is a hash, so the original key comes from the envelope.
        const path = join(directory, name)
        let envelope: Envelope<V>
        try {
          const text = await ordered(path, async () => await fs.readFile(path, 'utf8'))
          envelope = JSON.parse(text) as Envelope<V>
        } catch {
          continue
        }

        if (envelope.expiresAt !== null && envelope.expiresAt <= now()) continue
        if (prefix !== undefined && !envelope.key.startsWith(prefix)) continue

        yield envelope.key
      }
    },
  }
}

export type { FileOptions } from './file-options.js'
