// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_i$ from '../root/i.js'
import type { TlObject } from '../../../../tl/object.js'

/** Any `VideoSize`. */
export type TypeVideoSize =
  | VideoSize
  | VideoSizeEmojiMarkup
  | VideoSizeStickerMarkup

/** `videoSize#de33b094` */
export interface VideoSize {
  readonly _: 'videoSize'
  readonly type: string
  readonly w: number
  readonly h: number
  readonly size: number
  readonly video_start_ts?: number
}

/** `videoSizeEmojiMarkup#f85c413c` */
export interface VideoSizeEmojiMarkup {
  readonly _: 'videoSizeEmojiMarkup'
  readonly emoji_id: bigint
  readonly background_colors: readonly number[]
}

/** `videoSizeStickerMarkup#0da082fe` */
export interface VideoSizeStickerMarkup {
  readonly _: 'videoSizeStickerMarkup'
  readonly stickerset: root_i$.TypeInputStickerSet
  readonly sticker_id: bigint
  readonly background_colors: readonly number[]
}
