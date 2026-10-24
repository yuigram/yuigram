// GENERATED FILE — do not edit.
// Wire layout for langpack
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 5 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0xcd984aa5, n: 'langpack.getDifference', f: [{ n: 'lang_pack', t: 'string' }, { n: 'lang_code', t: 'string' }, { n: 'from_version', t: 'int' }] },
  { id: 0xf2f2330a, n: 'langpack.getLangPack', f: [{ n: 'lang_pack', t: 'string' }, { n: 'lang_code', t: 'string' }] },
  { id: 0x6a596502, n: 'langpack.getLanguage', f: [{ n: 'lang_pack', t: 'string' }, { n: 'lang_code', t: 'string' }] },
  { id: 0x42c6978f, n: 'langpack.getLanguages', f: [{ n: 'lang_pack', t: 'string' }] },
  { id: 0xefea3803, n: 'langpack.getStrings', f: [{ n: 'lang_pack', t: 'string' }, { n: 'lang_code', t: 'string' }, { n: 'keys', t: { v: 'string' } }] },
]
