// GENERATED FILE — do not edit.
// Wire layout for toncenter
// Source: Telegram TL layer 232, schemas/tl/api.232.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 4 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0xac8dfe19, n: 'toncenter.apiResponse', f: [{ n: 'response', t: 'obj' }] },
  { id: 0xcdaf63c7, n: 'toncenter.getStreamingUrl', f: [] },
  { id: 0x8d7bdd61, n: 'toncenter.performApiRequest', f: [{ n: 'flags', b: 1 }, { n: 'post', t: 'true', c: 'flags', i: 0 }, { n: 'endpoint', t: 'string' }, { n: 'query', t: 'string', c: 'flags', i: 1 }, { n: 'payload', t: 'string', c: 'flags', i: 2 }] },
  { id: 0x19887601, n: 'toncenter.streamingUrl', f: [{ n: 'url', t: 'string' }, { n: 'expires', t: 'int' }] },
]
