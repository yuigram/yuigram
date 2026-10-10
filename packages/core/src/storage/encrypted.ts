// SPDX-License-Identifier: MIT

/**
 * Encryption at rest for any key-value store.
 *
 * Storage is where secrets end up — a session token, a conversation, whatever
 * an application decided to keep — and a store on disk is readable by anything
 * that can read the file. This wraps a store so that what reaches it is
 * ciphertext, and composes with the others: `encrypted(namespaced(file(…), …))`
 * and the reverse both work, because it changes what a value looks like and
 * nothing else.
 *
 * AES-256-GCM with a key derived by scrypt, per `docs/storage.md` §6. GCM is
 * authenticated, so a value that has been altered fails to decrypt rather than
 * decrypting to something plausible — which is the difference between finding
 * out here and finding out as a baffling protocol error later.
 *
 * **Keys are not encrypted.** They pass through untouched, because prefixes are
 * how the rest of the storage layer works: `namespaced` scopes by prefix, and
 * `clear` and `keys` take one. Encrypting them would make composition
 * impossible and leave iteration meaningless. A reader of the store therefore
 * learns what an application stores things under, but not what it stored. The
 * key is authenticated even so, so a value cannot be moved from one key to
 * another and still be read.
 *
 * Encryption is off unless asked for, per `docs/security.md` §3: a mandatory
 * passphrase is one that ends up in a file beside the data it protects.
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { ConfigError, StorageError } from '../errors/errors.js'
import type { DescribedKV, KV, KVInfo, SetOptions } from './types.js'

/** Envelope layout marker, so a later format can be told apart from this one. */
const VERSION = 0x01
const SALT_SIZE = 16
/** What GCM expects, and the size at which it is fastest and best analysed. */
const IV_SIZE = 12
const TAG_SIZE = 16
const HEADER_SIZE = 1 + SALT_SIZE + IV_SIZE + TAG_SIZE
/** AES-256. */
const KEY_SIZE = 32

/**
 * How many derived keys are kept.
 *
 * Every value this store writes carries the same salt, so in practice the map
 * holds one entry per process that has ever written here. The bound is what
 * stops a store filled with unrelated salts from turning every read into a
 * fresh scrypt derivation whose result is then retained.
 */
const DERIVED_KEYS = 8

/** One stored value, taken apart. */
interface Envelope {
  readonly salt: Buffer
  readonly iv: Buffer
  readonly tag: Buffer
  readonly body: Buffer
}

/** Derive a key from a secret and a salt, off the event loop. */
function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // The asynchronous form deliberately: scrypt is expensive by design, and
    // the synchronous one would stall every other update for the duration.
    scrypt(secret, salt, KEY_SIZE, (error, key) => {
      // Any error at all, not `null` alone: Node reports success with `null`,
      // Bun with `undefined`, and treating the second as a failure rejected
      // every write on Bun with nothing to say why.
      if (error !== null && error !== undefined) reject(error)
      else resolve(key)
    })
  })
}

/**
 * Whether a store says what it is.
 *
 * `DescribedKV` is a superset of `KV`, and an adapter written against the
 * documented four methods carries no `info`. Checking the shape rather than
 * the property alone keeps a store that happens to have an unrelated `info`
 * field from being believed about its persistence.
 */
function describes(store: KV<string>): store is DescribedKV<string> {
  const info = (store as Partial<DescribedKV<string>>).info

  return typeof info === 'object' && info !== null && typeof info.persistent === 'boolean'
}

/** Take a stored value apart, or say why it is not one. */
function decode(stored: unknown): Envelope {
  if (typeof stored !== 'string') {
    throw new StorageError('a stored value was not written by this store: it is not text')
  }

  const raw = Buffer.from(stored, 'base64')
  if (raw.length < HEADER_SIZE) {
    throw new StorageError('a stored value was not written by this store: it is too short')
  }
  if (raw[0] !== VERSION) {
    throw new StorageError(
      `a stored value carries format ${String(raw[0])}, which this build cannot read`,
    )
  }

  return {
    salt: raw.subarray(1, 1 + SALT_SIZE),
    iv: raw.subarray(1 + SALT_SIZE, 1 + SALT_SIZE + IV_SIZE),
    tag: raw.subarray(1 + SALT_SIZE + IV_SIZE, HEADER_SIZE),
    body: raw.subarray(HEADER_SIZE),
  }
}

/**
 * Encrypt everything written to `store`.
 *
 * The secret is key material rather than a password prompt — an environment
 * variable holding something with real entropy — and it is stretched with
 * scrypt so that a weaker one is not immediately a key.
 *
 * ```ts
 * const app = new App({ storage: encrypted(file<string>('./state'), process.env.KEY!) })
 * ```
 *
 * **A value that does not decrypt throws** rather than reading as absent.
 * Returning `undefined` for a mistyped secret would look exactly like a store
 * that had never been written to, and an application would carry on and
 * overwrite it. Nothing is deleted on failure either: a value that cannot be
 * read under this secret is very often perfectly good under the right one.
 *
 * TTL, key iteration and clearing are the wrapped store's, unchanged. This owns
 * the value and nothing else.
 */
export function encrypted<V = unknown>(store: KV<string>, secret: string): DescribedKV<V> {
  if (typeof secret !== 'string' || secret.length === 0) {
    // Almost always an environment variable that is not set: `process.env.KEY!`
    // is `undefined` at run time whatever the type says, and deriving a key
    // from it would encrypt everything under a secret nobody chose.
    throw new ConfigError('encrypted() needs a secret; none was given')
  }

  // New for each store rather than a constant, so a key derived for one
  // deployment is of no use against another. It travels in every value written,
  // which is what lets a later process derive the same key from the same
  // secret without being told the salt.
  const salt = randomBytes(SALT_SIZE)

  const derived = new Map<string, Promise<Buffer>>()
  const keyFor = (forSalt: Buffer): Promise<Buffer> => {
    const id = forSalt.toString('base64')
    const known = derived.get(id)
    if (known !== undefined) return known

    // Stored before it resolves, so concurrent reads share one derivation
    // rather than each paying for their own.
    const pending = deriveKey(secret, forSalt)
    derived.set(id, pending)

    while (derived.size > DERIVED_KEYS) {
      const oldest = derived.keys().next()
      if (oldest.done === true) break
      derived.delete(oldest.value)
    }

    return pending
  }

  /** Persistence is the wrapped store's property; this only changes the value. */
  const info: KVInfo = {
    driver: 'encrypted',
    persistent: describes(store) ? store.info.persistent : false,
  }

  return {
    info,

    async get(key) {
      const stored = await store.get(key)
      if (stored === undefined) return undefined

      const envelope = decode(stored)
      const decipher = createDecipheriv('aes-256-gcm', await keyFor(envelope.salt), envelope.iv)
      // The key a value was written under is authenticated but not stored, so
      // a ciphertext copied from one key to another fails here rather than
      // decrypting perfectly well in the wrong place.
      decipher.setAAD(Buffer.from(key, 'utf8'))
      decipher.setAuthTag(envelope.tag)

      let plaintext: Buffer
      try {
        plaintext = Buffer.concat([decipher.update(envelope.body), decipher.final()])
      } catch (cause) {
        // The key is left out deliberately. A caller knows which one it asked
        // for, and a key is frequently derived from user input that has no
        // business in a message that may be logged.
        throw new StorageError(
          'a stored value did not decrypt: the secret is wrong, or the value was altered',
          { cause },
        )
      }

      // An empty plaintext is how `undefined` was written; see `set`.
      if (plaintext.length === 0) return undefined

      try {
        return JSON.parse(plaintext.toString('utf8')) as V
      } catch (cause) {
        throw new StorageError('a stored value decrypted to something that is not a value', {
          cause,
        })
      }
    },

    async set(key, value, options?: SetOptions) {
      // `JSON.stringify(undefined)` is `undefined` rather than text. Writing
      // nothing keeps this store's answer the same as every other driver's: a
      // value written as `undefined` reads back as absent.
      const plaintext = JSON.stringify(value) ?? ''

      const iv = randomBytes(IV_SIZE)
      const cipher = createCipheriv('aes-256-gcm', await keyFor(salt), iv)
      cipher.setAAD(Buffer.from(key, 'utf8'))
      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

      const envelope = Buffer.concat([Buffer.of(VERSION), salt, iv, cipher.getAuthTag(), body])

      await store.set(key, envelope.toString('base64'), options)
    },

    delete: (key) => store.delete(key),

    /** Presence, not readability: this answers without needing the secret. */
    has: async (key) =>
      store.has === undefined ? (await store.get(key)) !== undefined : await store.has(key),

    clear: async (prefix) => {
      await store.clear?.(prefix)
    },

    keys: (prefix) => store.keys?.(prefix) ?? empty(),
  }
}

/** An async iterable that yields nothing, for stores without key iteration. */
async function* empty(): AsyncIterable<string> {
  // Intentionally empty.
}
