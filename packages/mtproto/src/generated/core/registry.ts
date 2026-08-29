// GENERATED FILE — do not edit.
// core registry (6 combinators)
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import { type TlRegistry, createRegistry } from '../../tl/registry.js'
import { ENTRIES } from './tables/index.js'

/**
 * An identifier belonging to the `core` table.
 * A value carrying this brand cannot be passed where another table's is
 * expected, which is what keeps the two wire vocabularies apart at compile
 * time.
 */
export type CoreId = number & { readonly __table: 'core' }

/** Every `core` combinator, keyed by identifier. */
export const REGISTRY: TlRegistry<CoreId> = createRegistry<CoreId>(ENTRIES)

/** Whether `id` names a combinator in this table. */
export function isKnown(id: number): id is CoreId {
  return REGISTRY.has(id)
}
