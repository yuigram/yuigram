// SPDX-License-Identifier: MIT

/**
 * Keeping a file addressable for longer than its reference lasts.
 *
 * A location that names a file carries a *file reference*: a short-lived token
 * the datacenter issues along with whatever the file arrived in — a message, a
 * story, a profile photo. The token expires on the server's schedule and
 * nothing announces it, so a location stored yesterday and used today is
 * refused for a reason that has nothing to do with the file still existing.
 *
 * ```
 *   file id ──> reference   the bytes a request must carry
 *           └─> origin      what issued them, and so what can reissue them
 * ```
 *
 * The way back is the origin. A reference is not renewable on its own terms:
 * the only thing that can produce a current one is whatever produced the last
 * one, refetched. So the origin is recorded when the reference is, and a
 * refusal is answered by going back to it rather than by asking for a
 * replacement — a client that could ask for one directly would never have to
 * get the origin right, and would fail the first time it mattered.
 *
 * **Refetching is not done here.** Going back to a message means the layer that
 * knows about messages, and this one knows about files. What an origin *is*
 * stays opaque, and turning one back into a reference is supplied from outside.
 * The alternative is inventing an origin, which produces a request that is well
 * formed and wrong.
 */

import { ValidationError } from '@yuigram/core'
import type { TlValue } from '../tl/index.js'

/**
 * The refusals that mean the reference is no longer accepted.
 *
 * Two names for one situation, and neither says anything about the file: the
 * token was issued too long ago, or was issued for something else. Both are
 * answered the same way, and both are ordinary rather than exceptional.
 */
const STALE_REFERENCE = /^FILE_REFERENCE_(EXPIRED|INVALID)\b/

/** Whether a datacenter refused a request for the reference it carried. */
export function isStaleReference(error: unknown): boolean {
  return error instanceof Error && STALE_REFERENCE.test(error.message)
}

/**
 * What issued a file reference.
 *
 * Deliberately opaque. This layer records it and hands it back; only whatever
 * refetches it knows whether it is a message, a story or a photo.
 */
export type FileOrigin = unknown

/** Go back to whatever issued a reference and return a current one. */
export type RefetchOrigin = (origin: FileOrigin) => Promise<Uint8Array>

/** A location that can produce itself again with a reference that still works. */
export interface ManagedLocation {
  /** The location as it should be sent now. */
  current(): TlValue
  /**
   * Replace the reference a datacenter has just refused.
   *
   * Takes the reference that was refused so that a caller which lost a race is
   * not made to wait for a refetch it does not need.
   */
  refresh(used: Uint8Array): Promise<void>
}

/**
 * What is known about the references a client is holding.
 *
 * One table keyed by file, holding the current reference and the origin that
 * can reissue it. Both belong to the file-transfer subsystem: a reference is
 * addressing rather than identity, it expires on its own schedule, and nothing
 * outside a transfer has a reason to read one.
 */
export class FileReferences {
  readonly #current = new Map<string, Uint8Array>()
  readonly #origins = new Map<string, FileOrigin>()
  /** Refetches under way, so a file is only ever refetched once at a time. */
  readonly #refetching = new Map<string, Promise<Uint8Array>>()

  constructor(private readonly refetch: RefetchOrigin) {}

  /** Record the reference a file arrived with, and what issued it. */
  remember(fileId: bigint, reference: Uint8Array, origin: FileOrigin): void {
    this.#current.set(fileId.toString(), reference)
    this.#origins.set(fileId.toString(), origin)
  }

  /** The reference currently held for a file. */
  reference(fileId: bigint): Uint8Array | undefined {
    return this.#current.get(fileId.toString())
  }

  /** What issued the reference currently held for a file. */
  origin(fileId: bigint): FileOrigin | undefined {
    return this.#origins.get(fileId.toString())
  }

  /** Forget a file entirely, references and origin together. */
  forget(fileId: bigint): void {
    this.#current.delete(fileId.toString())
    this.#origins.delete(fileId.toString())
    this.#refetching.delete(fileId.toString())
  }

  /**
   * Produce a current reference for a file, refetching its origin if it must.
   *
   * Two things stop this from becoming a storm. A file is refetched once at a
   * time however many callers are asking, because several ranges of one file
   * fail together the moment its reference expires and they would otherwise
   * each go back to the origin. And a caller whose refusal named a reference
   * that has already been replaced is given the replacement rather than causing
   * another refetch, because it lost a race rather than found a stale token.
   */
  async refresh(fileId: bigint, used?: Uint8Array): Promise<Uint8Array> {
    const key = fileId.toString()

    const held = this.#current.get(key)
    if (used !== undefined && held !== undefined && !sameBytes(held, used)) return held

    const running = this.#refetching.get(key)
    if (running !== undefined) return running

    const origin = this.#origins.get(key)
    if (origin === undefined) {
      throw new ValidationError(
        `the reference for file ${fileId} has expired and nothing is recorded about where it came from`,
      )
    }

    const attempt = this.refetch(origin).then((reference) => {
      this.#current.set(key, reference)

      return reference
    })

    // Held only while it runs. A refetch that failed must not be the answer
    // given to the next caller, which may well succeed.
    this.#refetching.set(key, attempt)
    try {
      return await attempt
    } finally {
      if (this.#refetching.get(key) === attempt) this.#refetching.delete(key)
    }
  }

  /**
   * Bind a location to this table so it can be sent again after a refusal.
   *
   * The location keeps whatever else names the file; only the reference is
   * replaced, because only the reference goes stale.
   */
  manage(fileId: bigint, location: TlValue): ManagedLocation {
    const known = this.#current.get(fileId.toString())
    if (known === undefined) {
      const carried = location['file_reference']
      if (carried instanceof Uint8Array) this.#current.set(fileId.toString(), carried)
    }

    return {
      current: () => {
        const reference = this.#current.get(fileId.toString())
        if (reference === undefined) return location

        return { ...location, file_reference: reference }
      },
      refresh: async (used: Uint8Array) => {
        await this.refresh(fileId, used)
      },
    }
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false

  return left.every((byte, index) => byte === right[index])
}
