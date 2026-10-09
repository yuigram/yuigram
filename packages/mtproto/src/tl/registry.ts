// SPDX-License-Identifier: MPL-2.0

/**
 * A constructor table, indexed for both directions of the codec.
 *
 * A registry is built per table and never merged. The reader is constructed
 * with the registries a *channel* may legitimately see: the plaintext handshake
 * gets core and service constructors, the encrypted session gets those plus the
 * API layer. An API identifier arriving before an auth key exists therefore
 * resolves to nothing and raises, because it is genuinely absent from the table
 * that reader was built with.
 *
 * The type parameter carries each table's brand, so an identifier from one
 * cannot be handed to the other's lookup without the compiler objecting.
 */

import { ValidationError } from '@yuigram/core'
import type { TlEntry } from './schema.js'

/** An entry together with the table it came from. */
export interface Found {
  readonly entry: TlEntry
  readonly registry: TlRegistry
}

/** A table, ready for lookup in both directions. */
export interface TlRegistry<Id extends number = number> {
  /**
   * Identifier to combinator.
   *
   * Keyed by a plain number, because a lookup is precisely how an unbranded
   * identifier read off the wire *becomes* branded. The brand belongs on
   * {@link TlRegistry.has}, which is the boundary an unchecked value crosses.
   */
  readonly byId: ReadonlyMap<number, TlEntry>
  /** TL name to combinator. */
  readonly byName: ReadonlyMap<string, TlEntry>
  /** How many combinators the table holds. */
  readonly size: number
  /** Whether this table carries `id`, narrowing it to this table's brand. */
  has(id: number): id is Id
}

/**
 * Index a generated table.
 *
 * A duplicate identifier or name is rejected here as well as in the generator:
 * a registry that silently dropped an entry would decode one constructor as
 * another, and the failure would surface far from its cause.
 */
export function createRegistry<Id extends number = number>(
  entries: readonly TlEntry[],
): TlRegistry<Id> {
  const byId = new Map<number, TlEntry>()
  const byName = new Map<string, TlEntry>()

  for (const entry of entries) {
    if (byId.has(entry.id)) {
      throw new ValidationError(`duplicate TL identifier for '${entry.n}'`)
    }
    if (byName.has(entry.n)) {
      throw new ValidationError(`duplicate TL name '${entry.n}'`)
    }

    byId.set(entry.id, entry)
    byName.set(entry.n, entry)
  }

  return {
    byId,
    byName,
    size: entries.length,
    has: (id: number): id is Id => byId.has(id),
  }
}

/**
 * The tables one channel may decode.
 *
 * Ordered: earlier registries win a lookup, though the generator guarantees the
 * three tables share no identifier, so the order only decides which duplicate
 * would be reported if that guarantee ever broke.
 */
export class TlScope {
  readonly #registries: readonly TlRegistry[]
  /** What this scope is, for error messages a reader can act on. */
  readonly name: string

  constructor(name: string, registries: readonly TlRegistry[]) {
    this.name = name
    this.#registries = registries
  }

  /**
   * Look up an identifier, with the table that carries it.
   *
   * The owning table comes back because a bare reference inside the entry has
   * to resolve in the same table. `message` names the container element in the
   * service schema and a chat message in the API layer; resolving one entry's
   * bare reference against a merged view would decode the wrong shape.
   */
  find(id: number): Found | undefined {
    for (const registry of this.#registries) {
      const entry = registry.byId.get(id)
      if (entry !== undefined) return { entry, registry }
    }
    return undefined
  }

  /**
   * Look up a constructor by name, for the writer.
   *
   * A name carried by two tables is **ambiguous, not resolved by order**. The
   * two schemas are separate vocabularies that happen to share a word, and
   * silently preferring whichever table was listed first would encode the wrong
   * constructor with no indication that it had happened. A caller that means a
   * specific table addresses that table's registry.
   */
  findByName(name: string): Found | undefined {
    const matches: Found[] = []
    for (const registry of this.#registries) {
      const entry = registry.byName.get(name)
      if (entry !== undefined) matches.push({ entry, registry })
    }

    if (matches.length > 1) {
      throw new ValidationError(
        `'${name}' names a constructor in more than one table reachable from ${this.name}`,
      )
    }

    return matches[0]
  }

  /** How many combinators this scope can decode. */
  get size(): number {
    let total = 0
    for (const registry of this.#registries) total += registry.size
    return total
  }
}
