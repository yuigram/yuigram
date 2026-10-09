// GENERATED FILE — do not edit.
// Wire layout for users
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 12 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0xb60f5918, n: 'users.getFullUser', f: [{ n: 'id', t: 'obj' }] },
  { id: 0xd89a83a3, n: 'users.getRequirementsToContact', f: [{ n: 'id', t: { v: 'obj' } }] },
  { id: 0x788d7fe3, n: 'users.getSavedMusic', f: [{ n: 'id', t: 'obj' }, { n: 'offset', t: 'int' }, { n: 'limit', t: 'int' }, { n: 'hash', t: 'long' }] },
  { id: 0x7573a4e9, n: 'users.getSavedMusicByID', f: [{ n: 'id', t: 'obj' }, { n: 'documents', t: { v: 'obj' } }] },
  { id: 0x0d91a548, n: 'users.getUsers', f: [{ n: 'id', t: { v: 'obj' } }] },
  { id: 0x34a2f297, n: 'users.savedMusic', f: [{ n: 'count', t: 'int' }, { n: 'documents', t: { v: 'obj' } }] },
  { id: 0xe3878aa4, n: 'users.savedMusicNotModified', f: [{ n: 'count', t: 'int' }] },
  { id: 0x90c894b5, n: 'users.setSecureValueErrors', f: [{ n: 'id', t: 'obj' }, { n: 'errors', t: { v: 'obj' } }] },
  { id: 0xfc533372, n: 'users.suggestBirthday', f: [{ n: 'id', t: 'obj' }, { n: 'birthday', t: 'obj' }] },
  { id: 0x3b6d152e, n: 'users.userFull', f: [{ n: 'full_user', t: 'obj' }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x62d706b8, n: 'users.users', f: [{ n: 'users', t: { v: 'obj' } }] },
  { id: 0x315a4974, n: 'users.usersSlice', f: [{ n: 'count', t: 'int' }, { n: 'users', t: { v: 'obj' } }] },
]
