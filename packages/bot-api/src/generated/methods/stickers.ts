// GENERATED FILE — do not edit.
// Bot API method parameters: Stickers
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { ForceReply, InlineKeyboardMarkup, InputSticker, MaskPosition, ReplyKeyboardMarkup, ReplyKeyboardRemove, ReplyParameters, SuggestedPostParameters } from '../types/index.js'
import type { InputFile } from '../../input-file.js'

/**
 * Parameters for `sendSticker`.
 *
 * @see https://corefork.telegram.org/bots/api#sendsticker
 */
export interface SendStickerParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be sent
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target bot,
   * supergroup or channel in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread (topic) of a forum; for
   * forum supergroups and private chats of bots with forum topic mode enabled
   * only
   */
  message_thread_id?: number | undefined

  /**
   * Identifier of the direct messages topic to which the message will be sent;
   * required if the message is sent to a direct messages chat
   */
  direct_messages_topic_id?: number | undefined

  /**
   * For outgoing ephemeral messages, unique identifier of the user who will
   * receive the message; for group and supergroup chats only. It is not
   * guaranteed that the user will receive the message, especially if they are
   * offline. See ephemeral message sending for more details.
   */
  receiver_user_id?: number | undefined

  /**
   * For outgoing ephemeral messages, identifier of the callback query which
   * triggered the message if any
   */
  callback_query_id?: string | undefined

  /**
   * Sticker to send. Pass a file_id as String to send a file that exists on the
   * Telegram servers (recommended), pass an HTTP URL as a String for Telegram to
   * get a .WEBP sticker from the Internet, or upload a new .WEBP, .TGS, or .WEBM
   * sticker using multipart/form-data. More information on Sending Files ».
   * Video and animated stickers can't be sent via an HTTP URL.
   */
  sticker: InputFile | string

  /**
   * Emoji associated with the sticker; only for just uploaded stickers
   */
  emoji?: string | undefined

  /**
   * Sends the message silently. Users will receive a notification with no sound.
   */
  disable_notification?: boolean | undefined

  /**
   * Protects the contents of the sent message from forwarding and saving
   */
  protect_content?: boolean | undefined

  /**
   * Pass True to allow up to 1000 messages per second, ignoring broadcasting
   * limits for a fee of 0.1 Telegram Stars per message. The relevant Stars will
   * be withdrawn from the bot's balance.
   */
  allow_paid_broadcast?: boolean | undefined

  /**
   * Unique identifier of the message effect to be added to the message; for
   * private chats only
   */
  message_effect_id?: string | undefined

  /**
   * A JSON-serialized object containing the parameters of the suggested post to
   * send; for direct messages chats only. If the message is sent as a reply to
   * another suggested post, then that suggested post is automatically declined.
   */
  suggested_post_parameters?: SuggestedPostParameters | undefined

  /**
   * Description of the message to reply to
   */
  reply_parameters?: ReplyParameters | undefined

  /**
   * Additional interface options. A JSON-serialized object for an inline
   * keyboard, custom reply keyboard, instructions to remove a reply keyboard or
   * to force a reply from the user.
   */
  reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply | undefined
}

/**
 * Parameters for `getStickerSet`.
 *
 * @see https://corefork.telegram.org/bots/api#getstickerset
 */
export interface GetStickerSetParams {
  /**
   * Name of the sticker set
   */
  name: string
}

/**
 * Parameters for `getCustomEmojiStickers`.
 *
 * @see https://corefork.telegram.org/bots/api#getcustomemojistickers
 */
export interface GetCustomEmojiStickersParams {
  /**
   * A JSON-serialized list of custom emoji identifiers. At most 200 custom emoji
   * identifiers can be specified.
   */
  custom_emoji_ids: string[]
}

/**
 * Parameters for `uploadStickerFile`.
 *
 * @see https://corefork.telegram.org/bots/api#uploadstickerfile
 */
export interface UploadStickerFileParams {
  /**
   * User identifier of sticker file owner
   */
  user_id: number

  /**
   * A file with the sticker in .WEBP, .PNG, .TGS, or .WEBM format. See
   * https://core.telegram.org/stickers for technical requirements. More
   * information on Sending Files »
   */
  sticker: InputFile

  /**
   * Format of the sticker, must be one of “static”, “animated”, “video”
   */
  sticker_format: string
}

/**
 * Parameters for `createNewStickerSet`.
 *
 * @see https://corefork.telegram.org/bots/api#createnewstickerset
 */
export interface CreateNewStickerSetParams {
  /**
   * User identifier of created sticker set owner
   */
  user_id: number

  /**
   * Short name of sticker set, to be used in t.me/addstickers/ URLs (e.g.,
   * animals). Can contain only English letters, digits and underscores. Must
   * begin with a letter, can't contain consecutive underscores and must end in
   * "_by_<bot_username>". <bot_username> is case insensitive. 1-64 characters.
   */
  name: string

  /**
   * Sticker set title, 1-64 characters
   */
  title: string

  /**
   * A JSON-serialized list of 1-50 initial stickers to be added to the sticker
   * set
   */
  stickers: InputSticker[]

  /**
   * Type of stickers in the set, pass “regular”, “mask”, or “custom_emoji”. By
   * default, a regular sticker set is created.
   */
  sticker_type?: string | undefined

  /**
   * Pass True if stickers in the sticker set must be repainted to the color of
   * text when used in messages, the accent color if used as emoji status, white
   * on chat photos, or another appropriate color based on context; for custom
   * emoji sticker sets only
   */
  needs_repainting?: boolean | undefined
}

/**
 * Parameters for `addStickerToSet`.
 *
 * @see https://corefork.telegram.org/bots/api#addstickertoset
 */
export interface AddStickerToSetParams {
  /**
   * User identifier of sticker set owner
   */
  user_id: number

  /**
   * Sticker set name
   */
  name: string

  /**
   * A JSON-serialized object with information about the added sticker. If
   * exactly the same sticker had already been added to the set, then the set
   * isn't changed.
   */
  sticker: InputSticker
}

/**
 * Parameters for `setStickerPositionInSet`.
 *
 * @see https://corefork.telegram.org/bots/api#setstickerpositioninset
 */
export interface SetStickerPositionInSetParams {
  /**
   * File identifier of the sticker
   */
  sticker: string

  /**
   * New sticker position in the set, zero-based
   */
  position: number
}

/**
 * Parameters for `deleteStickerFromSet`.
 *
 * @see https://corefork.telegram.org/bots/api#deletestickerfromset
 */
export interface DeleteStickerFromSetParams {
  /**
   * File identifier of the sticker
   */
  sticker: string
}

/**
 * Parameters for `replaceStickerInSet`.
 *
 * @see https://corefork.telegram.org/bots/api#replacestickerinset
 */
export interface ReplaceStickerInSetParams {
  /**
   * User identifier of the sticker set owner
   */
  user_id: number

  /**
   * Sticker set name
   */
  name: string

  /**
   * File identifier of the replaced sticker
   */
  old_sticker: string

  /**
   * A JSON-serialized object with information about the added sticker. If
   * exactly the same sticker had already been added to the set, then the set
   * remains unchanged.
   */
  sticker: InputSticker
}

/**
 * Parameters for `setStickerEmojiList`.
 *
 * @see https://corefork.telegram.org/bots/api#setstickeremojilist
 */
export interface SetStickerEmojiListParams {
  /**
   * File identifier of the sticker
   */
  sticker: string

  /**
   * A JSON-serialized list of 1-20 emoji associated with the sticker
   */
  emoji_list: string[]
}

/**
 * Parameters for `setStickerKeywords`.
 *
 * @see https://corefork.telegram.org/bots/api#setstickerkeywords
 */
export interface SetStickerKeywordsParams {
  /**
   * File identifier of the sticker
   */
  sticker: string

  /**
   * A JSON-serialized list of 0-20 search keywords for the sticker with total
   * length of up to 64 characters
   */
  keywords?: string[] | undefined
}

/**
 * Parameters for `setStickerMaskPosition`.
 *
 * @see https://corefork.telegram.org/bots/api#setstickermaskposition
 */
export interface SetStickerMaskPositionParams {
  /**
   * File identifier of the sticker
   */
  sticker: string

  /**
   * A JSON-serialized object with the position where the mask should be placed
   * on faces. Omit the parameter to remove the mask position.
   */
  mask_position?: MaskPosition | undefined
}

/**
 * Parameters for `setStickerSetTitle`.
 *
 * @see https://corefork.telegram.org/bots/api#setstickersettitle
 */
export interface SetStickerSetTitleParams {
  /**
   * Sticker set name
   */
  name: string

  /**
   * Sticker set title, 1-64 characters
   */
  title: string
}

/**
 * Parameters for `setStickerSetThumbnail`.
 *
 * @see https://corefork.telegram.org/bots/api#setstickersetthumbnail
 */
export interface SetStickerSetThumbnailParams {
  /**
   * Sticker set name
   */
  name: string

  /**
   * User identifier of the sticker set owner
   */
  user_id: number

  /**
   * A .WEBP or .PNG image with the thumbnail, must be up to 128 kilobytes in
   * size and have a width and height of exactly 100px, or a .TGS animation with
   * a thumbnail up to 32 kilobytes in size (see
   * https://core.telegram.org/stickers#animation-requirements for animated
   * sticker technical requirements), or a .WEBM video with the thumbnail up to
   * 32 kilobytes in size; see
   * https://core.telegram.org/stickers#video-requirements for video sticker
   * technical requirements. Pass a file_id as a String to send a file that
   * already exists on the Telegram servers, pass an HTTP URL as a String for
   * Telegram to get a file from the Internet, or upload a new one using
   * multipart/form-data. More information on Sending Files ». Animated and video
   * sticker set thumbnails can't be uploaded via HTTP URL. If omitted, then the
   * thumbnail is dropped and the first sticker is used as the thumbnail.
   */
  thumbnail?: InputFile | string | undefined

  /**
   * Format of the thumbnail, must be one of “static” for a .WEBP or .PNG image,
   * “animated” for a .TGS animation, or “video” for a .WEBM video
   */
  format: string
}

/**
 * Parameters for `setCustomEmojiStickerSetThumbnail`.
 *
 * @see https://corefork.telegram.org/bots/api#setcustomemojistickersetthumbnail
 */
export interface SetCustomEmojiStickerSetThumbnailParams {
  /**
   * Sticker set name
   */
  name: string

  /**
   * Custom emoji identifier of a sticker from the sticker set; pass an empty
   * string to drop the thumbnail and use the first sticker as the thumbnail
   */
  custom_emoji_id?: string | undefined
}

/**
 * Parameters for `deleteStickerSet`.
 *
 * @see https://corefork.telegram.org/bots/api#deletestickerset
 */
export interface DeleteStickerSetParams {
  /**
   * Sticker set name
   */
  name: string
}
