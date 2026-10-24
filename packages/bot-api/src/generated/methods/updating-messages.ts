// GENERATED FILE — do not edit.
// Bot API method parameters: Updating messages
// Source: Telegram Bot API 10.3, schemas/bot-api/10.3.json
// The code is licensed under MIT (see LICENSE). Descriptions are quoted from
// Telegram's Bot API documentation, which that licence does not cover.

import type { InputChecklist, InputInlineKeyboardMarkup, InputMedia, InputRichMessage, LinkPreviewOptions, MessageEntity } from '../types/index.js'

/**
 * Parameters for `editMessageText`.
 *
 * @see https://corefork.telegram.org/bots/api#editmessagetext
 */
export interface EditMessageTextParams {
  /**
   * New rich content of the message; required if text isn't specified. Direct
   * upload of new files and explicit upload of files by a URL isn't supported
   * when an inline message is edited.
   */
  rich_message?: InputRichMessage | undefined

  /**
   * Link preview generation options for the message
   */
  link_preview_options?: LinkPreviewOptions | undefined

  /**
   * New text of the message, 1-4096 characters after entities parsing; required
   * if rich_message isn't specified
   */
  text?: string | undefined

  /**
   * Mode for parsing entities in the text. See formatting options for more
   * details. Must be one of "Markdown", "MarkdownV2", or "HTML".
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the text, which
   * can be specified instead of parse_mode
   */
  entities?: MessageEntity[] | undefined

  /**
   * A JSON-serialized object for an inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined

  /**
   * Required if chat_id and message_id are not specified. Identifier of the
   * inline message. Must be non-empty.
   */
  inline_message_id?: string | undefined

  /**
   * Unique identifier of the business connection on behalf of which the message
   * to be edited was sent
   */
  business_connection_id?: string | undefined

  /**
   * Required if inline_message_id is not specified. Unique identifier for the
   * target chat or username of the target bot, supergroup or channel in the
   * format @username. If a String, must be non-empty.
   */
  chat_id?: number | string | undefined

  /**
   * Required if inline_message_id is not specified. Identifier of the message to
   * edit. Must be at least 1.
   */
  message_id?: number | undefined
}

/**
 * Parameters for `editMessageCaption`.
 *
 * @see https://corefork.telegram.org/bots/api#editmessagecaption
 */
export interface EditMessageCaptionParams {
  /**
   * A JSON-serialized object for an inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined

  /**
   * New caption of the message, 0-1024 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the caption. See formatting options for more
   * details. Must be one of "Markdown", "MarkdownV2", or "HTML".
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media. Supported
   * only for animation, photo and video messages.
   */
  show_caption_above_media?: boolean | undefined

  /**
   * Required if chat_id and message_id are not specified. Identifier of the
   * inline message. Must be non-empty.
   */
  inline_message_id?: string | undefined

  /**
   * Unique identifier of the business connection on behalf of which the message
   * to be edited was sent
   */
  business_connection_id?: string | undefined

  /**
   * Required if inline_message_id is not specified. Unique identifier for the
   * target chat or username of the target bot, supergroup or channel in the
   * format @username. If a String, must be non-empty.
   */
  chat_id?: number | string | undefined

  /**
   * Required if inline_message_id is not specified. Identifier of the message to
   * edit. Must be at least 1.
   */
  message_id?: number | undefined
}

/**
 * Parameters for `editMessageMedia`.
 *
 * @see https://corefork.telegram.org/bots/api#editmessagemedia
 */
export interface EditMessageMediaParams {
  /**
   * A JSON-serialized object for a new inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined

  /**
   * A JSON-serialized object for the new media content of the message
   */
  media: InputMedia

  /**
   * Required if chat_id and message_id are not specified. Identifier of the
   * inline message. Must be non-empty.
   */
  inline_message_id?: string | undefined

  /**
   * Unique identifier of the business connection on behalf of which the message
   * to be edited was sent
   */
  business_connection_id?: string | undefined

  /**
   * Required if inline_message_id is not specified. Unique identifier for the
   * target chat or username of the target bot, supergroup or channel in the
   * format @username. If a String, must be non-empty.
   */
  chat_id?: number | string | undefined

  /**
   * Required if inline_message_id is not specified. Identifier of the message to
   * edit. Must be at least 1.
   */
  message_id?: number | undefined
}

/**
 * Parameters for `editMessageLiveLocation`.
 *
 * @see https://corefork.telegram.org/bots/api#editmessagelivelocation
 */
export interface EditMessageLiveLocationParams {
  /**
   * New period in seconds during which the location can be updated, starting
   * from the message send date. If 0x7FFFFFFF is specified, then the location
   * can be updated forever. Otherwise, the new value must not exceed the current
   * live_period by more than a day, and the live location expiration date must
   * remain within the next 90 days. If not specified, then live_period remains
   * unchanged.
   */
  live_period?: number | undefined

  /**
   * Direction in which the user is moving, in degrees. Values between 1-360 are
   * accepted.
   */
  heading?: number | undefined

  /**
   * The maximum distance for proximity alerts about approaching another chat
   * member, in meters. Values between 1-100000 are accepted.
   */
  proximity_alert_radius?: number | undefined

  /**
   * Latitude of new location
   */
  latitude: number

  /**
   * Longitude of new location
   */
  longitude: number

  /**
   * The radius of uncertainty for the location, measured in meters, 0-1500
   */
  horizontal_accuracy?: number | undefined

  /**
   * A JSON-serialized object for a new inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined

  /**
   * Required if chat_id and message_id are not specified. Identifier of the
   * inline message. Must be non-empty.
   */
  inline_message_id?: string | undefined

  /**
   * Unique identifier of the business connection on behalf of which the message
   * to be edited was sent
   */
  business_connection_id?: string | undefined

  /**
   * Required if inline_message_id is not specified. Unique identifier for the
   * target chat or username of the target bot, supergroup or channel in the
   * format @username. If a String, must be non-empty.
   */
  chat_id?: number | string | undefined

  /**
   * Required if inline_message_id is not specified. Identifier of the message to
   * edit. Must be at least 1.
   */
  message_id?: number | undefined
}

/**
 * Parameters for `stopMessageLiveLocation`.
 *
 * @see https://corefork.telegram.org/bots/api#stopmessagelivelocation
 */
export interface StopMessageLiveLocationParams {
  /**
   * A JSON-serialized object for a new inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined

  /**
   * Required if chat_id and message_id are not specified. Identifier of the
   * inline message. Must be non-empty.
   */
  inline_message_id?: string | undefined

  /**
   * Unique identifier of the business connection on behalf of which the message
   * to be edited was sent
   */
  business_connection_id?: string | undefined

  /**
   * Required if inline_message_id is not specified. Unique identifier for the
   * target chat or username of the target bot, supergroup or channel in the
   * format @username. If a String, must be non-empty.
   */
  chat_id?: number | string | undefined

  /**
   * Required if inline_message_id is not specified. Identifier of the message
   * with live location to stop. Must be at least 1.
   */
  message_id?: number | undefined
}

/**
 * Parameters for `editMessageChecklist`.
 *
 * @see https://corefork.telegram.org/bots/api#editmessagechecklist
 */
export interface EditMessageChecklistParams {
  /**
   * A JSON-serialized object for the new inline keyboard for the message
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined

  /**
   * A JSON-serialized object for the new checklist
   */
  checklist: InputChecklist

  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be sent
   */
  business_connection_id: string

  /**
   * Unique identifier for the target chat or username of the target bot in the
   * format @username, if a String, must be non-empty
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message, at least 1
   */
  message_id: number
}

/**
 * Parameters for `editMessageReplyMarkup`.
 *
 * @see https://corefork.telegram.org/bots/api#editmessagereplymarkup
 */
export interface EditMessageReplyMarkupParams {
  /**
   * A JSON-serialized object for an inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined

  /**
   * Required if chat_id and message_id are not specified. Identifier of the
   * inline message. Must be non-empty.
   */
  inline_message_id?: string | undefined

  /**
   * Unique identifier of the business connection on behalf of which the message
   * to be edited was sent
   */
  business_connection_id?: string | undefined

  /**
   * Required if inline_message_id is not specified. Unique identifier for the
   * target chat or username of the target bot, supergroup or channel in the
   * format @username. If a String, must be non-empty.
   */
  chat_id?: number | string | undefined

  /**
   * Required if inline_message_id is not specified. Identifier of the message to
   * edit. Must be at least 1.
   */
  message_id?: number | undefined
}

/**
 * Parameters for `stopPoll`.
 *
 * @see https://corefork.telegram.org/bots/api#stoppoll
 */
export interface StopPollParams {
  /**
   * A JSON-serialized object for a new message inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined

  /**
   * Unique identifier of the business connection on behalf of which the message
   * to be edited was sent
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target bot,
   * supergroup or channel in the format @username, if a String, must be
   * non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the original message with the poll, at least 1
   */
  message_id: number
}

/**
 * Parameters for `editEphemeralMessageText`.
 *
 * @see https://corefork.telegram.org/bots/api#editephemeralmessagetext
 */
export interface EditEphemeralMessageTextParams {
  /**
   * New rich content of the message; required if text isn't specified
   */
  rich_message?: InputRichMessage | undefined

  /**
   * Link preview generation options for the message
   */
  link_preview_options?: LinkPreviewOptions | undefined

  /**
   * New text of the message, 1-4096 characters after entities parsing; required
   * if rich_message isn't specified
   */
  text?: string | undefined

  /**
   * Mode for parsing entities in the text. See formatting options for more
   * details. Must be one of "Markdown", "MarkdownV2", or "HTML".
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the text, which
   * can be specified instead of parse_mode
   */
  entities?: MessageEntity[] | undefined

  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username, if a String, must be non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the user who received the message, at least 1
   */
  receiver_user_id: number

  /**
   * Identifier of the ephemeral message to edit
   */
  ephemeral_message_id: number

  /**
   * A JSON-serialized object for an inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined
}

/**
 * Parameters for `editEphemeralMessageMedia`.
 *
 * @see https://corefork.telegram.org/bots/api#editephemeralmessagemedia
 */
export interface EditEphemeralMessageMediaParams {
  /**
   * A JSON-serialized object for the new media content of the message
   */
  media: InputMedia

  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username, if a String, must be non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the user who received the message, at least 1
   */
  receiver_user_id: number

  /**
   * Identifier of the ephemeral message to edit
   */
  ephemeral_message_id: number

  /**
   * A JSON-serialized object for an inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined
}

/**
 * Parameters for `editEphemeralMessageCaption`.
 *
 * @see https://corefork.telegram.org/bots/api#editephemeralmessagecaption
 */
export interface EditEphemeralMessageCaptionParams {
  /**
   * New caption of the message, 0-1024 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the caption. See formatting options for more
   * details. Must be one of "Markdown", "MarkdownV2", or "HTML".
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media. Supported
   * only for animation, photo and video messages.
   */
  show_caption_above_media?: boolean | undefined

  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username, if a String, must be non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the user who received the message, at least 1
   */
  receiver_user_id: number

  /**
   * Identifier of the ephemeral message to edit
   */
  ephemeral_message_id: number

  /**
   * A JSON-serialized object for an inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined
}

/**
 * Parameters for `editEphemeralMessageReplyMarkup`.
 *
 * @see https://corefork.telegram.org/bots/api#editephemeralmessagereplymarkup
 */
export interface EditEphemeralMessageReplyMarkupParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username, if a String, must be non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the user who received the message, at least 1
   */
  receiver_user_id: number

  /**
   * Identifier of the ephemeral message to edit
   */
  ephemeral_message_id: number

  /**
   * A JSON-serialized object for an inline keyboard
   */
  reply_markup?: InputInlineKeyboardMarkup | undefined
}

/**
 * Parameters for `approveSuggestedPost`.
 *
 * @see https://corefork.telegram.org/bots/api#approvesuggestedpost
 */
export interface ApproveSuggestedPostParams {
  /**
   * Unique identifier for the target direct messages chat, if a String, must be
   * non-empty
   */
  chat_id: number | string

  /**
   * Identifier of a suggested post message to approve, at least 1
   */
  message_id: number

  /**
   * Point in time (Unix timestamp) when the post is expected to be published;
   * omit if the date has already been specified when the suggested post was
   * created. If specified, then the date must be not more than 2678400 seconds
   * (30 days) in the future.
   */
  send_date?: number | undefined
}

/**
 * Parameters for `declineSuggestedPost`.
 *
 * @see https://corefork.telegram.org/bots/api#declinesuggestedpost
 */
export interface DeclineSuggestedPostParams {
  /**
   * Unique identifier for the target direct messages chat, if a String, must be
   * non-empty
   */
  chat_id: number | string

  /**
   * Identifier of a suggested post message to decline, at least 1
   */
  message_id: number

  /**
   * Comment for the creator of the suggested post, 0-128 characters
   */
  comment?: string | undefined
}

/**
 * Parameters for `deleteMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#deletemessage
 */
export interface DeleteMessageParams {
  /**
   * Unique identifier for the target chat or username of the target bot,
   * supergroup or channel in the format @username, if a String, must be
   * non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the message to delete, at least 1
   */
  message_id: number
}

/**
 * Parameters for `deleteMessages`.
 *
 * @see https://corefork.telegram.org/bots/api#deletemessages
 */
export interface DeleteMessagesParams {
  /**
   * Unique identifier for the target chat or username of the target bot,
   * supergroup or channel in the format @username, if a String, must be
   * non-empty
   */
  chat_id: number | string

  /**
   * A JSON-serialized list of identifiers of messages to delete. See
   * deleteMessage for limitations on which messages can be deleted. Must have
   * 1-100 elements. Each element must be at least 1.
   */
  message_ids: number[]
}

/**
 * Parameters for `deleteEphemeralMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#deleteephemeralmessage
 */
export interface DeleteEphemeralMessageParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username, if a String, must be non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the user who received the message, at least 1
   */
  receiver_user_id: number

  /**
   * Identifier of the ephemeral message to delete
   */
  ephemeral_message_id: number
}

/**
 * Parameters for `deleteMessageReaction`.
 *
 * @see https://corefork.telegram.org/bots/api#deletemessagereaction
 */
export interface DeleteMessageReactionParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username, if a String, must be non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the target message, at least 1
   */
  message_id: number

  /**
   * Identifier of the user whose reaction will be removed, if the reaction was
   * added by a user, at least 1
   */
  user_id?: number | undefined

  /**
   * Identifier of the chat whose reaction will be removed, if the reaction was
   * added by a chat
   */
  actor_chat_id?: number | undefined
}

/**
 * Parameters for `deleteAllMessageReactions`.
 *
 * @see https://corefork.telegram.org/bots/api#deleteallmessagereactions
 */
export interface DeleteAllMessageReactionsParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username, if a String, must be non-empty
   */
  chat_id: number | string

  /**
   * Identifier of the user whose reactions will be removed, if the reactions
   * were added by a user, at least 1
   */
  user_id?: number | undefined

  /**
   * Identifier of the chat whose reactions will be removed, if the reactions
   * were added by a chat
   */
  actor_chat_id?: number | undefined
}
