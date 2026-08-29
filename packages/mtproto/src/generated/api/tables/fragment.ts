// GENERATED FILE — do not edit.
// Wire layout for fragment
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlEntry } from '../../../tl/schema.js'

/** 2 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x6ebdff91, n: 'fragment.collectibleInfo', f: [{ n: 'purchase_date', t: 'int' }, { n: 'currency', t: 'string' }, { n: 'amount', t: 'long' }, { n: 'crypto_currency', t: 'string' }, { n: 'crypto_amount', t: 'long' }, { n: 'url', t: 'string' }] },
  { id: 0xbe1e85ba, n: 'fragment.getCollectibleInfo', f: [{ n: 'collectible', t: 'obj' }] },
]
