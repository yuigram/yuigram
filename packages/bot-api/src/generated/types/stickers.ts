// GENERATED FILE — do not edit.
// Bot API types: Stickers
// Source: Telegram Bot API 10.3, schemas/bot-api/10.3.json

import type { File, PhotoSize } from './available-types.js'

/**
 * This object represents a sticker.
 *
 * @see https://corefork.telegram.org/bots/api#sticker
 */
export interface Sticker {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Type of the sticker, currently one of “regular”, “mask”, “custom_emoji”. The
   * type of the sticker is independent from its format, which is determined by
   * the fields is_animated and is_video.
   */
  readonly type: string

  /**
   * Sticker width
   */
  readonly width: number

  /**
   * Sticker height
   */
  readonly height: number

  /**
   * True, if the sticker is animated
   */
  readonly is_animated: boolean

  /**
   * True, if the sticker is a video sticker
   */
  readonly is_video: boolean

  /**
   * Sticker thumbnail in the .WEBP or .JPG format
   */
  readonly thumbnail?: PhotoSize | undefined

  /**
   * Emoji associated with the sticker
   */
  readonly emoji?: string | undefined

  /**
   * Name of the sticker set to which the sticker belongs
   */
  readonly set_name?: string | undefined

  /**
   * For premium regular stickers, premium animation for the sticker
   */
  readonly premium_animation?: File | undefined

  /**
   * For mask stickers, the position where the mask should be placed
   */
  readonly mask_position?: MaskPosition | undefined

  /**
   * For custom emoji stickers, unique identifier of the custom emoji
   */
  readonly custom_emoji_id?: string | undefined

  /**
   * True, if the sticker must be repainted to a text color in messages, the
   * color of the Telegram Premium badge in emoji status, white color on chat
   * photos, or another appropriate color in other places
   */
  readonly needs_repainting?: true | undefined

  /**
   * File size in bytes
   */
  readonly file_size?: number | undefined
}

/**
 * This object represents a sticker set.
 *
 * @see https://corefork.telegram.org/bots/api#stickerset
 */
export interface StickerSet {
  /**
   * Sticker set name
   */
  readonly name: string

  /**
   * Sticker set title
   */
  readonly title: string

  /**
   * Type of stickers in the set, currently one of “regular”, “mask”,
   * “custom_emoji”
   */
  readonly sticker_type: string

  /**
   * List of all set stickers
   */
  readonly stickers: Sticker[]

  /**
   * Sticker set thumbnail in the .WEBP, .TGS, or .WEBM format
   */
  readonly thumbnail?: PhotoSize | undefined
}

/**
 * This object describes the position on faces where a mask should be placed by
 * default.
 *
 * @see https://corefork.telegram.org/bots/api#maskposition
 */
export interface MaskPosition {
  /**
   * The part of the face relative to which the mask should be placed. One of
   * “forehead”, “eyes”, “mouth”, or “chin”.
   */
  readonly point: string

  /**
   * Shift by X-axis measured in widths of the mask scaled to the face size, from
   * left to right. For example, choosing -1.0 will place mask just to the left
   * of the default mask position.
   */
  readonly x_shift: number

  /**
   * Shift by Y-axis measured in heights of the mask scaled to the face size,
   * from top to bottom. For example, 1.0 will place the mask just below the
   * default mask position.
   */
  readonly y_shift: number

  /**
   * Mask scaling coefficient. For example, 2.0 means double size.
   */
  readonly scale: number
}

/**
 * This object describes a sticker to be added to a sticker set.
 *
 * @see https://corefork.telegram.org/bots/api#inputsticker
 */
export interface InputSticker {
  /**
   * The added sticker. Pass a file_id as a String to send a file that already
   * exists on the Telegram servers, pass an HTTP URL as a String for Telegram to
   * get a file from the Internet, or pass “attach://<file_attach_name>” to
   * upload a new file using multipart/form-data under <file_attach_name> name.
   * Animated and video stickers can't be uploaded via HTTP URL. More information
   * on Sending Files »
   */
  readonly sticker: string

  /**
   * Format of the added sticker, must be one of “static” for a .WEBP or .PNG
   * image, “animated” for a .TGS animation, “video” for a .WEBM video
   */
  readonly format: string

  /**
   * List of 1-20 emoji associated with the sticker
   */
  readonly emoji_list: string[]

  /**
   * Position where the mask should be placed on faces. For “mask” stickers only.
   */
  readonly mask_position?: MaskPosition | undefined

  /**
   * List of 0-20 search keywords for the sticker with total length of up to 64
   * characters. For “regular” and “custom_emoji” stickers only.
   */
  readonly keywords?: string[] | undefined
}
