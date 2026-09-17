// GENERATED FILE — do not edit.
// api registry (2465 combinators)
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import { type TlRegistry, createRegistry } from '../../tl/registry.js'
import { ENTRIES } from './tables/index.js'

/**
 * An identifier belonging to the `api` table.
 * A value carrying this brand cannot be passed where another table's is
 * expected, which is what keeps the two wire vocabularies apart at compile
 * time.
 */
export type ApiId = number & { readonly __table: 'api' }

/** Every `api` combinator, keyed by identifier. */
export const REGISTRY: TlRegistry<ApiId> = createRegistry<ApiId>(ENTRIES)

/** Whether `id` names a combinator in this table. */
export function isKnown(id: number): id is ApiId {
  return REGISTRY.has(id)
}
