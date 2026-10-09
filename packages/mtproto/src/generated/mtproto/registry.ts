// GENERATED FILE — do not edit.
// mtproto registry (47 combinators)
// Source: Telegram MTProto schema, schemas/tl/mtproto.tl
// SPDX-License-Identifier: MPL-2.0

import { type TlRegistry, createRegistry } from '../../tl/registry.js'
import { ENTRIES } from './tables/index.js'

/**
 * An identifier belonging to the `mtproto` table.
 * A value carrying this brand cannot be passed where another table's is
 * expected, which is what keeps the two wire vocabularies apart at compile
 * time.
 */
export type MtprotoId = number & { readonly __table: 'mtproto' }

/** Every `mtproto` combinator, keyed by identifier. */
export const REGISTRY: TlRegistry<MtprotoId> = createRegistry<MtprotoId>(ENTRIES)

/** Whether `id` names a combinator in this table. */
export function isKnown(id: number): id is MtprotoId {
  return REGISTRY.has(id)
}
