// SPDX-License-Identifier: MPL-2.0

/**
 * The authorization state that must survive a restart.
 *
 * Very little does. An authorization key is expensive to obtain and identifies
 * the client to Telegram, so losing it means signing in again; a server salt is
 * cheap but rejecting a message to learn a new one costs a round trip. Almost
 * everything else a connection holds is a property of *that* connection and is
 * wrong to carry into the next one.
 *
 * What is deliberately not here:
 *
 * - **the session identifier and its sequence numbers.** A session belongs to
 *   one connection. Restoring an identifier with a sequence counter back at
 *   zero recreates exactly the disagreement the server answers by discarding
 *   messages, so a restarted client opens a new session, which is ordinary and
 *   which the server expects
 * - **the clock correction.** It is learned from the server and is only true
 *   relative to the local clock it was measured against. A machine whose clock
 *   was fixed while the process was down would restore a correction that is now
 *   wrong, and the mechanism that learns it works from the first refused
 *   message either way
 * - **anything in flight.** Requests, their deadlines, ordering groups, message
 *   attempts and retry counts describe work whose outcome can no longer be
 *   observed. A promise cannot be persisted, and a request whose caller is gone
 *   has nobody to answer
 *
 * The failure policy differs from the framework's on purpose. Framework session
 * storage degrades to memory and warns, because losing it costs a user their
 * conversation state. Authorization storage does not: silently continuing
 * without a key means signing in again as if for the first time, and a client
 * that does that on every start is one that looks like an intruder.
 */

import { type KV, YuigramError } from '../core.js'
import { fromBase64, toBase64 } from '../crypto/encoding.js'

/** Auth keys are 2048 bits. */
const AUTH_KEY_SIZE = 256

/**
 * Longest encoded value this store will decode.
 *
 * Persisted state is attacker-controlled wherever a file can be replaced, so
 * the bound is applied to the encoded form before anything is allocated from
 * it. A key is 256 bytes and a salt is 8; nothing here is large.
 */
const MAX_ENCODED = 1024

/** Where one datacenter's state is kept. */
function keyOf(dc: number, what: string): string {
  return `dc${dc}:${what}`
}

/** What is stored for a temporary key, alongside when it stops being usable. */
interface StoredTemporaryKey {
  readonly key: string
  readonly expires: number
  /** The clock `expires` is on: this machine's. Absent on records from earlier builds. */
  readonly clock: 'local'
}

/** A temporary key and the second it stops being valid. */
export interface StoredKeyLifetime {
  readonly key: Uint8Array
  /** The Unix second the key expires at. */
  readonly expires: number
}

/**
 * Durable authorization state.
 *
 * The interface an application implements to supply its own persistence. The
 * operations are semantic rather than key-value: what is stored, and how, is
 * this layer's business.
 */
export interface AuthorizationStore {
  /** The permanent key for a datacenter, if one has been established. */
  key(dc: number): Promise<Uint8Array | undefined>
  /** Record a permanent key, or forget it by passing `undefined`. */
  setKey(dc: number, key: Uint8Array | undefined): Promise<void>
  /**
   * A temporary key, if one is stored and has not expired at `now`.
   *
   * The expiry comes back with it. A caller that holds the key also has to know
   * when it stops being valid — to decide whether to replace it, and to say so
   * again when vouching for it — and reading the record twice would leave the
   * two answers able to disagree.
   */
  temporaryKey(dc: number, index: number, now: number): Promise<StoredKeyLifetime | undefined>
  /** Record a temporary key with the second it expires at. */
  setTemporaryKey(
    dc: number,
    index: number,
    key: Uint8Array | undefined,
    expires: number,
  ): Promise<void>
  /** The last salt known to be accepted by a datacenter. */
  salt(dc: number): Promise<bigint | undefined>
  /** Record a salt the server supplied. */
  setSalt(dc: number, salt: bigint): Promise<void>
  /** Forget everything held for a datacenter. */
  forget(dc: number): Promise<void>
}

/** A stored value that could not be read back. */
export class StorageError extends YuigramError {
  override readonly name = 'StorageError'
}

/**
 * Keep authorization state in a key-value store.
 *
 * The store supplies durability and atomicity; this supplies the encoding and
 * the checks that decide whether what came back is usable. A value that does
 * not decode is refused rather than treated as absent — absent means "sign in",
 * and answering that for a key that is merely unreadable discards a working
 * authorization.
 */
export function authorizationStore(kv: KV<unknown>): AuthorizationStore {
  return {
    async key(dc) {
      return decodeKey(await kv.get(keyOf(dc, 'key')), `dc${dc} auth key`)
    },

    async setKey(dc, key) {
      if (key === undefined) return kv.delete(keyOf(dc, 'key'))

      await kv.set(keyOf(dc, 'key'), encodeKey(key, `dc${dc} auth key`))
    },

    async temporaryKey(dc, index, now) {
      const stored = await kv.get(keyOf(dc, `temp${index}`))
      if (stored === undefined) return undefined

      const record = asRecord(stored, `dc${dc} temporary key ${index}`)
      const expires = record['expires']
      if (typeof expires !== 'number' || !Number.isFinite(expires)) {
        throw new StorageError(`dc${dc} temporary key ${index} has no usable expiry`)
      }

      // A record without the marker was written by an earlier build, which put
      // the expiry on the server's clock. The offset it converted with was not
      // kept, so the moment cannot be recovered from the number, and reading it
      // on this clock would repeat that build's error. The key is not used: the
      // caller obtains another and has the permanent key vouch for it, and the
      // permanent key is left exactly where it is.
      if (record['clock'] !== 'local') return undefined

      // Expiry is checked on the way out rather than on a timer: a stored key
      // outlives the process that wrote it, so the only moment its lifetime can
      // be judged against is the one it is asked for.
      if (expires <= now) return undefined

      const key = decodeKey(record['key'], `dc${dc} temporary key ${index}`)
      if (key === undefined) {
        throw new StorageError(`dc${dc} temporary key ${index} has no key material`)
      }

      return { key, expires }
    },

    async setTemporaryKey(dc, index, key, expires) {
      const at = keyOf(dc, `temp${index}`)
      if (key === undefined) return kv.delete(at)

      const record: StoredTemporaryKey = {
        key: encodeKey(key, `dc${dc} temporary key ${index}`),
        expires,
        clock: 'local',
      }
      await kv.set(at, record)
    },

    async salt(dc) {
      const stored = await kv.get(keyOf(dc, 'salt'))
      if (stored === undefined) return undefined

      return decodeSalt(stored, `dc${dc} salt`)
    },

    async setSalt(dc, salt) {
      // Written as text: a salt is a signed 64-bit value, and a JSON number
      // cannot carry one without losing the low bits.
      await kv.set(keyOf(dc, 'salt'), salt.toString())
    },

    async forget(dc) {
      await Promise.all([
        kv.delete(keyOf(dc, 'key')),
        kv.delete(keyOf(dc, 'salt')),
        kv.delete(keyOf(dc, 'temp0')),
        kv.delete(keyOf(dc, 'temp1')),
      ])
    },
  }
}

/** Encode key material for a store that carries text. */
function encodeKey(key: Uint8Array, what: string): string {
  if (key.length !== AUTH_KEY_SIZE) {
    throw new StorageError(`${what} must be ${AUTH_KEY_SIZE} bytes, received ${key.length}`)
  }

  return toBase64(key)
}

/**
 * Recover key material, refusing anything that is not exactly a key.
 *
 * The width is checked before the decode allocates, and again after, because
 * base64 accepts input that decodes to a different length than it implies.
 */
function decodeKey(stored: unknown, what: string): Uint8Array | undefined {
  if (stored === undefined) return undefined
  if (typeof stored !== 'string') {
    throw new StorageError(`${what} is stored as ${typeof stored}, not text`)
  }
  if (stored.length > MAX_ENCODED) {
    throw new StorageError(`${what} is ${stored.length} characters, far past a key`)
  }

  const decoded = fromBase64(stored)
  if (decoded.length !== AUTH_KEY_SIZE) {
    throw new StorageError(`${what} decodes to ${decoded.length} bytes, not ${AUTH_KEY_SIZE}`)
  }

  return decoded
}

/** Recover a salt, refusing anything outside the range the field can carry. */
function decodeSalt(stored: unknown, what: string): bigint {
  if (typeof stored !== 'string') {
    throw new StorageError(`${what} is stored as ${typeof stored}, not text`)
  }
  if (stored.length > MAX_ENCODED) {
    throw new StorageError(`${what} is ${stored.length} characters, far past a salt`)
  }

  // Checked as text before it is parsed. The conversion is lenient in ways the
  // stored form is not: it reads hexadecimal, tolerates surrounding space, and
  // turns an empty string into zero — so a truncated field would come back as a
  // usable salt rather than as the damage it is.
  if (!/^-?(?:0|[1-9]\d*)$/.test(stored)) {
    throw new StorageError(`${what} is not a number`)
  }

  const value = BigInt(stored)

  if (value < -(2n ** 63n) || value > 2n ** 63n - 1n) {
    throw new StorageError(`${what} does not fit the field that carries it`)
  }

  return value
}

function asRecord(stored: unknown, what: string): Record<string, unknown> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new StorageError(`${what} is not a stored record`)
  }

  return stored as Record<string, unknown>
}
