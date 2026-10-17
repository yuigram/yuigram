// SPDX-License-Identifier: MIT

/**
 * The peers this account has encountered, and how to name them again.
 *
 * MTProto identifies a peer by an identifier and an access hash, and the hash
 * is issued per account and cannot be derived from anything. A client that has
 * never encountered a peer cannot construct a reference to it — so encountering
 * one is the only way to learn it, and forgetting one is permanent until it is
 * encountered again.
 *
 * That makes this a cache in name only. Nothing here can be refilled on demand,
 * which is why peers are written down as they arrive rather than fetched when
 * they are wanted.
 *
 * ```
 *   id       ──┐
 *   username ──┼──> peer ──> access hash
 *   phone    ──┘
 * ```
 *
 * Three ways in, because a caller names a peer by whichever it has. The
 * identifier is the record's own; the other two are indexes onto it, rebuilt
 * whenever a record is written, since a peer may change its username and the
 * old one may then belong to somebody else.
 */

import { type KV, YuigramError } from '../core.js'

/** What kind of peer a record describes. */
export type PeerKind = 'user' | 'chat' | 'channel'

/**
 * A peer, as much of it as is needed to refer to it again.
 *
 * Deliberately not a copy of the entity. Titles, photos and flags belong to
 * whatever displays them; what is kept here is only what a reference is built
 * from, because that is the part that cannot be recovered by asking.
 */
export interface PeerRecord {
  readonly kind: PeerKind
  readonly id: bigint
  /**
   * The hash a reference to this peer carries.
   *
   * Absent for a basic group, which is referred to by identifier alone, and
   * absent for a peer that arrived without a usable one.
   */
  readonly accessHash?: bigint
  /**
   * Whether this peer arrived in a form that is only valid where it was seen.
   *
   * Telegram sends a reduced form of a peer the account cannot otherwise
   * access, carrying a hash that works only in the context it arrived in. Such
   * a record can name the peer but cannot be used to reach it on its own.
   */
  readonly min: boolean
  /** Every name the peer currently answers to, lowercased. */
  readonly usernames: readonly string[]
  /** The number, when the peer is a contact who shared one. */
  readonly phone?: string
}

/** A stored peer that could not be read back. */
export class PeerStorageError extends YuigramError {
  override readonly name = 'PeerStorageError'
}

/** Where peers are kept. */
export interface PeerStore {
  /** The peer with this identifier, if it has been encountered. */
  byId(kind: PeerKind, id: bigint): Promise<PeerRecord | undefined>
  /** The peer answering to this name, if one is known to. */
  byUsername(username: string): Promise<PeerRecord | undefined>
  /** The peer reachable at this number, if one is known to be. */
  byPhone(phone: string): Promise<PeerRecord | undefined>
  /**
   * Write a peer down.
   *
   * Answers whether the record was kept. A reduced form never replaces a
   * complete one, so a caller harvesting whatever arrived can hand over
   * everything it saw without having to know which is which.
   */
  save(record: PeerRecord): Promise<boolean>
  /** Forget a peer and the names pointing at it. */
  forget(kind: PeerKind, id: bigint): Promise<void>
}

/** Where one peer's record is kept. */
function peerKey(kind: PeerKind, id: bigint): string {
  return `peer:${kind}:${id}`
}

/** Where a name points from. */
function nameKey(username: string): string {
  return `username:${normalize(username)}`
}

/** Where a number points from. */
function phoneKey(phone: string): string {
  return `phone:${phone.replace(/\D/g, '')}`
}

/**
 * A name as it is looked up.
 *
 * Usernames are compared without regard to case, and a leading marker is not
 * part of the name — a caller that has one written down with the marker and a
 * peer that published it without would otherwise be different peers.
 */
function normalize(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase()
}

/** What an index entry points at. */
interface Pointer {
  readonly kind: PeerKind
  readonly id: string
}

/**
 * Keep peers in a key-value store.
 *
 * The store supplies durability; this supplies the encoding, the indexes and
 * the one rule that matters — that a peer known in full is never replaced by a
 * peer known in part.
 */
export function peerStore(kv: KV<unknown>): PeerStore {
  async function read(kind: PeerKind, id: bigint): Promise<PeerRecord | undefined> {
    const stored = await kv.get(peerKey(kind, id))
    if (stored === undefined) return undefined

    return decode(stored, `${kind} ${id}`)
  }

  async function follow(key: string): Promise<PeerRecord | undefined> {
    const pointer = await kv.get(key)
    if (pointer === undefined) return undefined

    const { kind, id } = asPointer(pointer, key)

    return read(kind, id)
  }

  return {
    byId: read,

    async byUsername(username) {
      return follow(nameKey(username))
    },

    async byPhone(phone) {
      return follow(phoneKey(phone))
    },

    async save(record) {
      const existing = await read(record.kind, record.id)

      // The rule the whole store exists to enforce. A reduced peer carries a
      // hash that works only where it was seen, so letting one replace a
      // complete record would degrade the store permanently and produce
      // failures nowhere near the cause.
      if (record.min && existing !== undefined && !existing.min) return false

      await kv.set(peerKey(record.kind, record.id), encode(record))

      // Names are rewritten rather than added to: a peer that dropped a
      // username should stop answering to it, and the name may since have been
      // taken by somebody else.
      const pointer: Pointer = { kind: record.kind, id: record.id.toString() }
      const stale = (existing?.usernames ?? []).filter((name) => !record.usernames.includes(name))

      await Promise.all([
        ...stale.map((name) => kv.delete(nameKey(name))),
        ...record.usernames.map((name) => kv.set(nameKey(name), pointer)),
        ...(record.phone === undefined ? [] : [kv.set(phoneKey(record.phone), pointer)]),
        ...(existing?.phone !== undefined && existing.phone !== record.phone
          ? [kv.delete(phoneKey(existing.phone))]
          : []),
      ])

      return true
    },

    async forget(kind, id) {
      const existing = await read(kind, id)
      if (existing === undefined) return

      await Promise.all([
        kv.delete(peerKey(kind, id)),
        ...existing.usernames.map((name) => kv.delete(nameKey(name))),
        ...(existing.phone === undefined ? [] : [kv.delete(phoneKey(existing.phone))]),
      ])
    },
  }
}

/** What a record looks like once it is written down. */
interface StoredPeer {
  readonly kind: PeerKind
  readonly id: string
  readonly accessHash?: string
  readonly min: boolean
  readonly usernames: readonly string[]
  readonly phone?: string
}

/**
 * Write a record out.
 *
 * Identifiers and hashes are 64-bit and travel as text: a JSON number cannot
 * carry one without losing the low bits, which for a hash means a reference
 * that is refused and for an identifier means the wrong peer.
 */
function encode(record: PeerRecord): StoredPeer {
  return {
    kind: record.kind,
    id: record.id.toString(),
    ...(record.accessHash === undefined ? {} : { accessHash: record.accessHash.toString() }),
    min: record.min,
    usernames: [...record.usernames],
    ...(record.phone === undefined ? {} : { phone: record.phone }),
  }
}

/** Read a record back, refusing anything that is not one. */
function decode(stored: unknown, what: string): PeerRecord {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new PeerStorageError(`${what} is stored as ${typeof stored}, not a record`)
  }

  const record = stored as Record<string, unknown>
  const kind = record['kind']
  if (kind !== 'user' && kind !== 'chat' && kind !== 'channel') {
    throw new PeerStorageError(`${what} names no peer kind this client knows`)
  }

  const names = record['usernames']
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) {
    throw new PeerStorageError(`${what} has no usable list of names`)
  }

  const phone = record['phone']
  if (phone !== undefined && typeof phone !== 'string') {
    throw new PeerStorageError(`${what} has a number that is not one`)
  }

  const hash = record['accessHash']

  return {
    kind,
    id: readBigInt(record['id'], `${what} identifier`),
    ...(hash === undefined ? {} : { accessHash: readBigInt(hash, `${what} access hash`) }),
    min: record['min'] === true,
    usernames: names as string[],
    ...(phone === undefined ? {} : { phone }),
  }
}

/** Read an index entry, refusing one that points nowhere usable. */
function asPointer(stored: unknown, key: string): { kind: PeerKind; id: bigint } {
  if (typeof stored !== 'object' || stored === null) {
    throw new PeerStorageError(`'${key}' points at ${typeof stored}, not a peer`)
  }

  const pointer = stored as Record<string, unknown>
  const kind = pointer['kind']
  if (kind !== 'user' && kind !== 'chat' && kind !== 'channel') {
    throw new PeerStorageError(`'${key}' names no peer kind this client knows`)
  }

  return { kind, id: readBigInt(pointer['id'], `'${key}'`) }
}

function readBigInt(raw: unknown, what: string): bigint {
  if (typeof raw !== 'string') {
    throw new PeerStorageError(`${what} is stored as ${typeof raw}, not text`)
  }

  try {
    return BigInt(raw)
  } catch {
    throw new PeerStorageError(`${what} is not a number`)
  }
}
