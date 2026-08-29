// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

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
