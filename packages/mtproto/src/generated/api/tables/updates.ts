// GENERATED FILE — do not edit.
// Wire layout for updates
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 11 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x2064674e, n: 'updates.channelDifference', f: [{ n: 'flags', b: 1 }, { n: 'final', t: 'true', c: 'flags', i: 0 }, { n: 'pts', t: 'int' }, { n: 'timeout', t: 'int', c: 'flags', i: 1 }, { n: 'new_messages', t: { v: 'obj' } }, { n: 'other_updates', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x3e11affb, n: 'updates.channelDifferenceEmpty', f: [{ n: 'flags', b: 1 }, { n: 'final', t: 'true', c: 'flags', i: 0 }, { n: 'pts', t: 'int' }, { n: 'timeout', t: 'int', c: 'flags', i: 1 }] },
  { id: 0xa4bcc6fe, n: 'updates.channelDifferenceTooLong', f: [{ n: 'flags', b: 1 }, { n: 'final', t: 'true', c: 'flags', i: 0 }, { n: 'timeout', t: 'int', c: 'flags', i: 1 }, { n: 'dialog', t: 'obj' }, { n: 'messages', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x00f49ca0, n: 'updates.difference', f: [{ n: 'new_messages', t: { v: 'obj' } }, { n: 'new_encrypted_messages', t: { v: 'obj' } }, { n: 'other_updates', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }, { n: 'state', t: 'obj' }] },
  { id: 0x5d75a138, n: 'updates.differenceEmpty', f: [{ n: 'date', t: 'int' }, { n: 'seq', t: 'int' }] },
  { id: 0xa8fb1981, n: 'updates.differenceSlice', f: [{ n: 'new_messages', t: { v: 'obj' } }, { n: 'new_encrypted_messages', t: { v: 'obj' } }, { n: 'other_updates', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }, { n: 'intermediate_state', t: 'obj' }] },
  { id: 0x4afe8f6d, n: 'updates.differenceTooLong', f: [{ n: 'pts', t: 'int' }] },
  { id: 0x03173d78, n: 'updates.getChannelDifference', f: [{ n: 'flags', b: 1 }, { n: 'force', t: 'true', c: 'flags', i: 0 }, { n: 'channel', t: 'obj' }, { n: 'filter', t: 'obj' }, { n: 'pts', t: 'int' }, { n: 'limit', t: 'int' }] },
  { id: 0x19c2f763, n: 'updates.getDifference', f: [{ n: 'flags', b: 1 }, { n: 'pts', t: 'int' }, { n: 'pts_limit', t: 'int', c: 'flags', i: 1 }, { n: 'pts_total_limit', t: 'int', c: 'flags', i: 0 }, { n: 'date', t: 'int' }, { n: 'qts', t: 'int' }, { n: 'qts_limit', t: 'int', c: 'flags', i: 2 }] },
  { id: 0xedd4882a, n: 'updates.getState', f: [] },
  { id: 0xa56c2a3e, n: 'updates.state', f: [{ n: 'pts', t: 'int' }, { n: 'qts', t: 'int' }, { n: 'date', t: 'int' }, { n: 'seq', t: 'int' }, { n: 'unread_count', t: 'int' }] },
]
