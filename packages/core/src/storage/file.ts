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
 */

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DescribedKV, KVInfo, SetOptions } from './types.js'

interface Envelope<V> {
  /** The original key, retained so `keys()` can report it. */
  readonly key: string
  readonly value: V
  /** Epoch milliseconds at which this expires. */
  readonly expiresAt: number | null
}

/** Options for {@link file}. */
export interface FileOptions {
  /** Clock source, injectable so TTL behaviour is testable without waiting. */
  readonly now?: () => number
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
  const now = options.now ?? Date.now
  const info: KVInfo = { driver: 'file', persistent: true }

  let ready: Promise<void> | undefined
  const ensureDirectory = (): Promise<void> => {
    // Owner-only: the directory holds session state, and the default mode
    // leaves it listable by every account on the machine. The files inside are
    // already 0600, so this is defence in depth rather than the only guard.
    ready ??= mkdir(directory, { recursive: true, mode: 0o700 }).then(() => undefined)
    return ready
  }

  /** Read and parse an envelope, treating any unreadable file as absent. */
  const read = async (key: string): Promise<Envelope<V> | undefined> => {
    await ensureDirectory()
    const path = join(directory, fileNameFor(key))

    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch {
      return undefined
    }

    let envelope: Envelope<V>
    try {
      envelope = JSON.parse(text) as Envelope<V>
    } catch {
      // A truncated or corrupt file is treated as a miss rather than an error:
      // framework state degrades gracefully by design.
      await rm(path, { force: true })
      return undefined
    }

    if (envelope.expiresAt !== null && envelope.expiresAt <= now()) {
      await rm(path, { force: true })
      return undefined
    }

    return envelope
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
      // Write to a unique temporary file, then rename. A crash mid-write then
      // leaves the previous value intact rather than a half-written one.
      const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`

      await writeFile(temporary, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, path)
    },

    async delete(key) {
      await ensureDirectory()
      await rm(join(directory, fileNameFor(key)), { force: true })
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
        names = await readdir(directory)
      } catch {
        return
      }

      for (const name of names) {
        if (!isOwned(name)) continue
        await rm(join(directory, name), { force: true })
      }
    },

    async *keys(prefix) {
      await ensureDirectory()

      let names: string[]
      try {
        names = await readdir(directory)
      } catch {
        return
      }

      for (const name of names) {
        if (!isOwned(name)) continue

        // The filename is a hash, so the original key comes from the envelope.
        let envelope: Envelope<V>
        try {
          envelope = JSON.parse(await readFile(join(directory, name), 'utf8')) as Envelope<V>
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
