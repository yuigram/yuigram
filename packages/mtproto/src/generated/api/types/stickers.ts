// GENERATED FILE — do not edit.
// TL types for stickers
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_i$ from './root/i.js'
import type * as root_m$ from './root/m.js'
import type { TlObject } from '../../../tl/object.js'

/** `stickers.addStickerToSet#8653febe` */
export interface AddStickerToSet {
  readonly _: 'stickers.addStickerToSet'
  readonly stickerset: root_i$.TypeInputStickerSet
  readonly sticker: root_i$.TypeInputStickerSetItem
}

/** `stickers.changeSticker#f5537ebc` */
export interface ChangeSticker {
  readonly _: 'stickers.changeSticker'
  readonly sticker: root_i$.TypeInputDocument
  readonly emoji?: string
  readonly mask_coords?: root_m$.TypeMaskCoords
  readonly keywords?: string
}

/** `stickers.changeStickerPosition#ffb6d4ca` */
export interface ChangeStickerPosition {
  readonly _: 'stickers.changeStickerPosition'
  readonly sticker: root_i$.TypeInputDocument
  readonly position: number
}

/** `stickers.checkShortName#284b3639` */
export interface CheckShortName {
  readonly _: 'stickers.checkShortName'
  readonly short_name: string
}

/** `stickers.createStickerSet#9021ab67` */
export interface CreateStickerSet {
  readonly _: 'stickers.createStickerSet'
  readonly masks?: true
  readonly emojis?: true
  readonly text_color?: true
  readonly user_id: root_i$.TypeInputUser
  readonly title: string
  readonly short_name: string
  readonly thumb?: root_i$.TypeInputDocument
  readonly stickers: readonly root_i$.TypeInputStickerSetItem[]
  readonly software?: string
}

/** `stickers.deleteStickerSet#87704394` */
export interface DeleteStickerSet {
  readonly _: 'stickers.deleteStickerSet'
  readonly stickerset: root_i$.TypeInputStickerSet
}

/** `stickers.removeStickerFromSet#f7760f51` */
export interface RemoveStickerFromSet {
  readonly _: 'stickers.removeStickerFromSet'
  readonly sticker: root_i$.TypeInputDocument
}

/** `stickers.renameStickerSet#124b1c00` */
export interface RenameStickerSet {
  readonly _: 'stickers.renameStickerSet'
  readonly stickerset: root_i$.TypeInputStickerSet
  readonly title: string
}

/** `stickers.replaceSticker#4696459a` */
export interface ReplaceSticker {
  readonly _: 'stickers.replaceSticker'
  readonly sticker: root_i$.TypeInputDocument
  readonly new_sticker: root_i$.TypeInputStickerSetItem
}

/** `stickers.setStickerSetThumb#a76a5392` */
export interface SetStickerSetThumb {
  readonly _: 'stickers.setStickerSetThumb'
  readonly stickerset: root_i$.TypeInputStickerSet
  readonly thumb?: root_i$.TypeInputDocument
  readonly thumb_document_id?: bigint
}

/** `stickers.suggestShortName#4dafc503` */
export interface SuggestShortName {
  readonly _: 'stickers.suggestShortName'
  readonly title: string
}

/** `stickers.suggestedShortName#85fea03f` */
export interface SuggestedShortName {
  readonly _: 'stickers.suggestedShortName'
  readonly short_name: string
}

/** Any `stickers.SuggestedShortName`. */
export type TypeSuggestedShortName =
  | SuggestedShortName
