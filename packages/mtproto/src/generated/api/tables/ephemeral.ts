// GENERATED FILE — do not edit.
// Wire layout for ephemeral
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 10 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x734f9721, n: 'ephemeral.deleteAllWelcomeMessages', f: [{ n: 'peer', t: 'obj' }] },
  { id: 0x92f6e797, n: 'ephemeral.deleteMessage', f: [{ n: 'flags', b: 1 }, { n: 'peer', t: 'obj', c: 'flags', i: 0 }, { n: 'receiver_id', t: 'obj' }, { n: 'id', t: 'int' }] },
  { id: 0xe882a9e1, n: 'ephemeral.deleteWelcomeMessage', f: [{ n: 'peer', t: 'obj' }, { n: 'id', t: 'int' }] },
  { id: 0xcf9c725b, n: 'ephemeral.editMessage', f: [{ n: 'flags', b: 1 }, { n: 'invert_media', t: 'true', c: 'flags', i: 5 }, { n: 'welcome', t: 'true', c: 'flags', i: 6 }, { n: 'peer', t: 'obj', c: 'flags', i: 7 }, { n: 'receiver_id', t: 'obj' }, { n: 'id', t: 'int' }, { n: 'message', t: 'string', c: 'flags', i: 0 }, { n: 'media', t: 'obj', c: 'flags', i: 3 }, { n: 'entities', t: { v: 'obj' }, c: 'flags', i: 1 }, { n: 'reply_markup', t: 'obj', c: 'flags', i: 2 }, { n: 'rich_message', t: 'obj', c: 'flags', i: 4 }] },
  { id: 0x3fa464c8, n: 'ephemeral.getCallbackAnswer', f: [{ n: 'flags', b: 1 }, { n: 'peer', t: 'obj' }, { n: 'id', t: 'int' }, { n: 'data', t: 'bytes', c: 'flags', i: 1 }] },
  { id: 0xdb9ac18d, n: 'ephemeral.getWelcomeMessages', f: [{ n: 'peer', t: 'obj' }, { n: 'hash', t: 'long' }] },
  { id: 0x8704f2bf, n: 'ephemeral.reportMessage', f: [{ n: 'peer', t: 'obj' }, { n: 'id', t: 'int' }, { n: 'option', t: 'bytes' }, { n: 'message', t: 'string' }] },
  { id: 0xba8d5f35, n: 'ephemeral.sendMessage', f: [{ n: 'flags', b: 1 }, { n: 'invert_media', t: 'true', c: 'flags', i: 6 }, { n: 'welcome', t: 'true', c: 'flags', i: 7 }, { n: 'anchor', t: 'true', c: 'flags', i: 9 }, { n: 'noforwards', t: 'true', c: 'flags', i: 10 }, { n: 'peer', t: 'obj', c: 'flags', i: 8 }, { n: 'receiver_id', t: 'obj' }, { n: 'query_id', t: 'long', c: 'flags', i: 0 }, { n: 'message', t: 'string' }, { n: 'entities', t: { v: 'obj' }, c: 'flags', i: 1 }, { n: 'media', t: 'obj', c: 'flags', i: 2 }, { n: 'reply_markup', t: 'obj', c: 'flags', i: 3 }, { n: 'rich_message', t: 'obj', c: 'flags', i: 4 }, { n: 'random_id', t: 'long' }, { n: 'reply_to', t: 'obj', c: 'flags', i: 5 }] },
  { id: 0x104fc872, n: 'ephemeral.welcomeMessages', f: [{ n: 'hash', t: 'long' }, { n: 'messages', t: { v: 'obj' } }] },
  { id: 0x59ffdb31, n: 'ephemeral.welcomeMessagesNotModified', f: [] },
]
