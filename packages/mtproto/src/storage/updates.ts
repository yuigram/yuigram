/**
 * How far through the update stream an account had got.
 *
 * The sequences are the account's place in Telegram's own numbering, and they
 * are the only thing that decides whether a restart resumes or starts again.
 * Without them a client rejoins the stream knowing nothing, asks for the
 * difference from a position that is far behind, and is told the box is too far
 * gone to describe — so everything that happened while it was down is lost
 * rather than delivered.
 *
 * ```
 *   pts · qts · seq · date   the common box
 *   pts[channel]             one per channel the account follows
 * ```
 *
 * It is a position, not a record of what happened. Nothing here holds an
 * update, a message or a peer: those arrive again from the difference the
 * position is used to ask for, which is what makes the position worth keeping
 * and the rest not.
 *
 * The failure policy matches the stores beside it: a snapshot that cannot be
 * read is refused rather than treated as absent. Absent means "start from
 * whatever Telegram says now", and answering that for a position that is merely
 * damaged would silently skip everything between.
 */

import { type KV, YuigramError } from '../core.js'
import type { UpdateStateSnapshot } from '../updates/state.js'

/** Where the position is kept. */
const KEY = 'state'

/**
 * Channels one stored position may name.
 *
 * An allocation guard rather than a protocol limit: persisted state is
 * attacker-controlled wherever a file can be replaced, and the bound is applied
 * before the map is built so a damaged file cannot ask for unbounded memory. No
 * account follows anything approaching this many.
 */
const MAX_CHANNELS = 100_000

/** A stored position that could not be read back. */
export class UpdateStorageError extends YuigramError {
  override readonly name = 'UpdateStorageError'
}

/** Where the position an account resumes from is kept. */
export interface UpdateStore {
  /** The last position written, or nothing if none has been. */
  load(): Promise<UpdateStateSnapshot | undefined>
  /** Write the position down, replacing whatever was there. */
  save(snapshot: UpdateStateSnapshot): Promise<void>
}

/** Keep the position in a key-value store. */
export function updateStore(kv: KV<unknown>): UpdateStore {
  return {
    async load() {
      const stored = await kv.get(KEY)
      if (stored === undefined) return undefined

      return decode(stored)
    },

    async save(snapshot) {
      await kv.set(KEY, {
        pts: snapshot.pts,
        qts: snapshot.qts,
        seq: snapshot.seq,
        date: snapshot.date,
        // A plain object rather than the map, because a store keeps what JSON
        // can carry and a map is not that.
        channels: Object.fromEntries(snapshot.channels),
      })
    },
  }
}

/** Read a stored position, refusing anything that is not one. */
function decode(stored: unknown): UpdateStateSnapshot {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new UpdateStorageError(`the stored update position is ${typeof stored}, not a record`)
  }

  const record = stored as Record<string, unknown>
  const channels = record['channels']
  if (typeof channels !== 'object' || channels === null || Array.isArray(channels)) {
    throw new UpdateStorageError('the stored update position names no channels record')
  }

  const entries = Object.entries(channels as Record<string, unknown>)
  if (entries.length > MAX_CHANNELS) {
    throw new UpdateStorageError(
      `the stored update position names ${entries.length} channels, more than ${MAX_CHANNELS}`,
    )
  }

  return {
    pts: counter(record['pts'], 'pts'),
    qts: counter(record['qts'], 'qts'),
    seq: counter(record['seq'], 'seq'),
    date: counter(record['date'], 'date'),
    channels: new Map(entries.map(([id, pts]) => [id, counter(pts, `channel ${id}`)])),
  }
}

/**
 * Read one counter.
 *
 * Every one of them counts upwards from zero, so a negative or fractional value
 * is not a position that was ever reached — and a client that resumed from one
 * would ask for a difference the server cannot describe.
 */
function counter(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new UpdateStorageError(`the stored update position has no usable '${what}'`)
  }

  return value
}
