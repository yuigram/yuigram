// GENERATED FILE — do not edit.
// Wire layout for aicompose
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 9 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x4aa83913, n: 'aicompose.createTone', f: [{ n: 'flags', b: 1 }, { n: 'display_author', t: 'true', c: 'flags', i: 0 }, { n: 'emoji_id', t: 'long' }, { n: 'title', t: 'string' }, { n: 'prompt', t: 'string' }] },
  { id: 0xdd39316a, n: 'aicompose.deleteTone', f: [{ n: 'tone', t: 'obj' }] },
  { id: 0xb2e8ba03, n: 'aicompose.getTone', f: [{ n: 'tone', t: 'obj' }] },
  { id: 0xd1b4ab14, n: 'aicompose.getToneExample', f: [{ n: 'tone', t: 'obj' }, { n: 'num', t: 'int' }] },
  { id: 0xabd59201, n: 'aicompose.getTones', f: [{ n: 'hash', t: 'long' }] },
  { id: 0x1782cbb1, n: 'aicompose.saveTone', f: [{ n: 'tone', t: 'obj' }, { n: 'unsave', t: 'bool' }] },
  { id: 0x6c9d0efe, n: 'aicompose.tones', f: [{ n: 'hash', t: 'long' }, { n: 'tones', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0xc1f46103, n: 'aicompose.tonesNotModified', f: [] },
  { id: 0x903bcf59, n: 'aicompose.updateTone', f: [{ n: 'flags', b: 1 }, { n: 'tone', t: 'obj' }, { n: 'display_author', t: 'bool', c: 'flags', i: 0 }, { n: 'emoji_id', t: 'long', c: 'flags', i: 1 }, { n: 'title', t: 'string', c: 'flags', i: 2 }, { n: 'prompt', t: 'string', c: 'flags', i: 3 }] },
]
