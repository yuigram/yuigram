// GENERATED FILE — do not edit.
// Wire layout for photos
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 8 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x87cf7f2f, n: 'photos.deletePhotos', f: [{ n: 'id', t: { v: 'obj' } }] },
  { id: 0x91cd32a8, n: 'photos.getUserPhotos', f: [{ n: 'user_id', t: 'obj' }, { n: 'offset', t: 'int' }, { n: 'max_id', t: 'long' }, { n: 'limit', t: 'int' }] },
  { id: 0x20212ca8, n: 'photos.photo', f: [{ n: 'photo', t: 'obj' }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x8dca6aa5, n: 'photos.photos', f: [{ n: 'photos', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x15051f54, n: 'photos.photosSlice', f: [{ n: 'count', t: 'int' }, { n: 'photos', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x09e82039, n: 'photos.updateProfilePhoto', f: [{ n: 'flags', b: 1 }, { n: 'fallback', t: 'true', c: 'flags', i: 0 }, { n: 'bot', t: 'obj', c: 'flags', i: 1 }, { n: 'id', t: 'obj' }] },
  { id: 0xe14c4a71, n: 'photos.uploadContactProfilePhoto', f: [{ n: 'flags', b: 1 }, { n: 'suggest', t: 'true', c: 'flags', i: 3 }, { n: 'save', t: 'true', c: 'flags', i: 4 }, { n: 'user_id', t: 'obj' }, { n: 'file', t: 'obj', c: 'flags', i: 0 }, { n: 'video', t: 'obj', c: 'flags', i: 1 }, { n: 'video_start_ts', t: 'double', c: 'flags', i: 2 }, { n: 'video_emoji_markup', t: 'obj', c: 'flags', i: 5 }] },
  { id: 0x0388a3b5, n: 'photos.uploadProfilePhoto', f: [{ n: 'flags', b: 1 }, { n: 'fallback', t: 'true', c: 'flags', i: 3 }, { n: 'bot', t: 'obj', c: 'flags', i: 5 }, { n: 'file', t: 'obj', c: 'flags', i: 0 }, { n: 'video', t: 'obj', c: 'flags', i: 1 }, { n: 'video_start_ts', t: 'double', c: 'flags', i: 2 }, { n: 'video_emoji_markup', t: 'obj', c: 'flags', i: 4 }] },
]
