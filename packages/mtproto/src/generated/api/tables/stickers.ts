// GENERATED FILE — do not edit.
// Wire layout for stickers
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 12 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x8653febe, n: 'stickers.addStickerToSet', f: [{ n: 'stickerset', t: 'obj' }, { n: 'sticker', t: 'obj' }] },
  { id: 0xf5537ebc, n: 'stickers.changeSticker', f: [{ n: 'flags', b: 1 }, { n: 'sticker', t: 'obj' }, { n: 'emoji', t: 'string', c: 'flags', i: 0 }, { n: 'mask_coords', t: 'obj', c: 'flags', i: 1 }, { n: 'keywords', t: 'string', c: 'flags', i: 2 }] },
  { id: 0xffb6d4ca, n: 'stickers.changeStickerPosition', f: [{ n: 'sticker', t: 'obj' }, { n: 'position', t: 'int' }] },
  { id: 0x284b3639, n: 'stickers.checkShortName', f: [{ n: 'short_name', t: 'string' }] },
  { id: 0x9021ab67, n: 'stickers.createStickerSet', f: [{ n: 'flags', b: 1 }, { n: 'masks', t: 'true', c: 'flags', i: 0 }, { n: 'emojis', t: 'true', c: 'flags', i: 5 }, { n: 'text_color', t: 'true', c: 'flags', i: 6 }, { n: 'user_id', t: 'obj' }, { n: 'title', t: 'string' }, { n: 'short_name', t: 'string' }, { n: 'thumb', t: 'obj', c: 'flags', i: 2 }, { n: 'stickers', t: { v: 'obj' } }, { n: 'software', t: 'string', c: 'flags', i: 3 }] },
  { id: 0x87704394, n: 'stickers.deleteStickerSet', f: [{ n: 'stickerset', t: 'obj' }] },
  { id: 0xf7760f51, n: 'stickers.removeStickerFromSet', f: [{ n: 'sticker', t: 'obj' }] },
  { id: 0x124b1c00, n: 'stickers.renameStickerSet', f: [{ n: 'stickerset', t: 'obj' }, { n: 'title', t: 'string' }] },
  { id: 0x4696459a, n: 'stickers.replaceSticker', f: [{ n: 'sticker', t: 'obj' }, { n: 'new_sticker', t: 'obj' }] },
  { id: 0xa76a5392, n: 'stickers.setStickerSetThumb', f: [{ n: 'flags', b: 1 }, { n: 'stickerset', t: 'obj' }, { n: 'thumb', t: 'obj', c: 'flags', i: 0 }, { n: 'thumb_document_id', t: 'long', c: 'flags', i: 1 }] },
  { id: 0x4dafc503, n: 'stickers.suggestShortName', f: [{ n: 'title', t: 'string' }] },
  { id: 0x85fea03f, n: 'stickers.suggestedShortName', f: [{ n: 'short_name', t: 'string' }] },
]
