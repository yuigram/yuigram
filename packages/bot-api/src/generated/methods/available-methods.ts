// GENERATED FILE — do not edit.
// Bot API method parameters: Available methods
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { AcceptedGiftTypes, BotCommand, BotCommandScope, ChatAdministratorRights, ChatPermissions, ForceReply, InlineKeyboardMarkup, InlineQueryResult, InputChecklist, InputMediaAudio, InputMediaDocument, InputMediaLivePhoto, InputMediaPhoto, InputMediaVideo, InputPaidMedia, InputPollMedia, InputPollOption, InputProfilePhoto, InputStoryContent, KeyboardButton, LinkPreviewOptions, MenuButton, MessageEntity, ReactionType, ReplyKeyboardMarkup, ReplyKeyboardRemove, ReplyParameters, StoryArea, SuggestedPostParameters } from '../types/index.js'
import type { InputFile } from '../../input-file.js'

/**
 * Parameters for `getMe`.
 *
 * @see https://corefork.telegram.org/bots/api#getme
 */
// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters
export interface GetMeParams {}

/**
 * Parameters for `logOut`.
 *
 * @see https://corefork.telegram.org/bots/api#logout
 */
// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters
export interface LogOutParams {}

/**
 * Parameters for `close`.
 *
 * @see https://corefork.telegram.org/bots/api#close
 */
// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters
export interface CloseParams {}

/**
 * Parameters for `sendMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#sendmessage
 */
export interface SendMessageParams {
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
   * Text of the message to be sent, 1-4096 characters after entities parsing
   */
  text: string

  /**
   * Mode for parsing entities in the message text. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in message text,
   * which can be specified instead of parse_mode
   */
  entities?: MessageEntity[] | undefined

  /**
   * Link preview generation options for the message
   */
  link_preview_options?: LinkPreviewOptions | undefined

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
 * Parameters for `forwardMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#forwardmessage
 */
export interface ForwardMessageParams {
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
   * Identifier of the direct messages topic to which the message will be
   * forwarded; required if the message is forwarded to a direct messages chat
   */
  direct_messages_topic_id?: number | undefined

  /**
   * Unique identifier for the chat where the original message was sent (or
   * username of the target bot, supergroup or channel in the format @username)
   */
  from_chat_id: number | string

  /**
   * New start timestamp for the forwarded video in the message
   */
  video_start_timestamp?: number | undefined

  /**
   * Sends the message silently. Users will receive a notification with no sound.
   */
  disable_notification?: boolean | undefined

  /**
   * Protects the contents of the forwarded message from forwarding and saving
   */
  protect_content?: boolean | undefined

  /**
   * Unique identifier of the message effect to be added to the message; only
   * available when forwarding to private chats
   */
  message_effect_id?: string | undefined

  /**
   * A JSON-serialized object containing the parameters of the suggested post to
   * send; for direct messages chats only
   */
  suggested_post_parameters?: SuggestedPostParameters | undefined

  /**
   * Message identifier in the chat specified in from_chat_id
   */
  message_id: number
}

/**
 * Parameters for `forwardMessages`.
 *
 * @see https://corefork.telegram.org/bots/api#forwardmessages
 */
export interface ForwardMessagesParams {
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
   * Identifier of the direct messages topic to which the messages will be
   * forwarded; required if the messages are forwarded to a direct messages chat
   */
  direct_messages_topic_id?: number | undefined

  /**
   * Unique identifier for the chat where the original messages were sent (or
   * username of the target bot, supergroup or channel in the format @username)
   */
  from_chat_id: number | string

  /**
   * A JSON-serialized list of 1-100 identifiers of messages in the chat
   * from_chat_id to forward. The identifiers must be specified in a strictly
   * increasing order.
   */
  message_ids: number[]

  /**
   * Sends the messages silently. Users will receive a notification with no
   * sound.
   */
  disable_notification?: boolean | undefined

  /**
   * Protects the contents of the forwarded messages from forwarding and saving
   */
  protect_content?: boolean | undefined
}

/**
 * Parameters for `copyMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#copymessage
 */
export interface CopyMessageParams {
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
   * Unique identifier for the chat where the original message was sent (or
   * username of the target bot, supergroup or channel in the format @username)
   */
  from_chat_id: number | string

  /**
   * Message identifier in the chat specified in from_chat_id
   */
  message_id: number

  /**
   * New start timestamp for the copied video in the message
   */
  video_start_timestamp?: number | undefined

  /**
   * New caption for media, 0-1024 characters after entities parsing. If not
   * specified, the original caption is kept.
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the new caption. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the new caption,
   * which can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media. Ignored if a
   * new caption isn't specified.
   */
  show_caption_above_media?: boolean | undefined

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
   * Unique identifier of the message effect to be added to the message; only
   * available when copying to private chats
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
 * Parameters for `copyMessages`.
 *
 * @see https://corefork.telegram.org/bots/api#copymessages
 */
export interface CopyMessagesParams {
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
   * Identifier of the direct messages topic to which the messages will be sent;
   * required if the messages are sent to a direct messages chat
   */
  direct_messages_topic_id?: number | undefined

  /**
   * Unique identifier for the chat where the original messages were sent (or
   * username of the target bot, supergroup or channel in the format @username)
   */
  from_chat_id: number | string

  /**
   * A JSON-serialized list of 1-100 identifiers of messages in the chat
   * from_chat_id to copy. The identifiers must be specified in a strictly
   * increasing order.
   */
  message_ids: number[]

  /**
   * Sends the messages silently. Users will receive a notification with no
   * sound.
   */
  disable_notification?: boolean | undefined

  /**
   * Protects the contents of the sent messages from forwarding and saving
   */
  protect_content?: boolean | undefined

  /**
   * Pass True to copy the messages without their captions
   */
  remove_caption?: boolean | undefined
}

/**
 * Parameters for `sendPhoto`.
 *
 * @see https://corefork.telegram.org/bots/api#sendphoto
 */
export interface SendPhotoParams {
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
   * Photo to send. Pass a file_id as String to send a photo that exists on the
   * Telegram servers (recommended), pass an HTTP URL as a String for Telegram to
   * get a photo from the Internet, or upload a new photo using
   * multipart/form-data. The photo must be at most 10 MB in size. The photo's
   * width and height must not exceed 10000 in total. Width and height ratio must
   * be at most 20. More information on Sending Files »
   */
  photo: InputFile | string

  /**
   * Photo caption (may also be used when resending photos by file_id), 0-1024
   * characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the photo caption. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  show_caption_above_media?: boolean | undefined

  /**
   * Pass True if the photo needs to be covered with a spoiler animation
   */
  has_spoiler?: boolean | undefined

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
 * Parameters for `sendLivePhoto`.
 *
 * @see https://corefork.telegram.org/bots/api#sendlivephoto
 */
export interface SendLivePhotoParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be sent
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target channel (in
   * the format @channelusername)
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
   * Live photo video to send. The video must be no longer than 10 seconds and
   * must not exceed 10 MB in size. Pass a file_id as String to send a video that
   * exists on the Telegram servers (recommended) or upload a new video using
   * multipart/form-data. More information on Sending Files ». Sending live
   * photos by a URL is currently unsupported.
   */
  live_photo: InputFile | string

  /**
   * The static photo to send. Pass a file_id as String to send a photo that
   * exists on the Telegram servers (recommended) or upload a new video using
   * multipart/form-data. More information on Sending Files ». Sending live
   * photos by a URL is currently unsupported.
   */
  photo: InputFile | string

  /**
   * Video caption (may also be used when resending videos by file_id), 0-1024
   * characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the video caption. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  show_caption_above_media?: boolean | undefined

  /**
   * Pass True if the video needs to be covered with a spoiler animation
   */
  has_spoiler?: boolean | undefined

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
 * Parameters for `sendAudio`.
 *
 * @see https://corefork.telegram.org/bots/api#sendaudio
 */
export interface SendAudioParams {
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
   * Audio file to send. Pass a file_id as String to send an audio file that
   * exists on the Telegram servers (recommended), pass an HTTP URL as a String
   * for Telegram to get an audio file from the Internet, or upload a new one
   * using multipart/form-data. More information on Sending Files »
   */
  audio: InputFile | string

  /**
   * Audio caption, 0-1024 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the audio caption. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Duration of the audio in seconds
   */
  duration?: number | undefined

  /**
   * Performer
   */
  performer?: string | undefined

  /**
   * Track name
   */
  title?: string | undefined

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  thumbnail?: InputFile | string | undefined

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
 * Parameters for `sendDocument`.
 *
 * @see https://corefork.telegram.org/bots/api#senddocument
 */
export interface SendDocumentParams {
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
   * File to send. Pass a file_id as String to send a file that exists on the
   * Telegram servers (recommended), pass an HTTP URL as a String for Telegram to
   * get a file from the Internet, or upload a new one using multipart/form-data.
   * More information on Sending Files »
   */
  document: InputFile | string

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  thumbnail?: InputFile | string | undefined

  /**
   * Document caption (may also be used when resending documents by file_id),
   * 0-1024 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the document caption. See formatting options
   * for more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Disables automatic server-side content type detection for files uploaded
   * using multipart/form-data
   */
  disable_content_type_detection?: boolean | undefined

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
 * Parameters for `sendVideo`.
 *
 * @see https://corefork.telegram.org/bots/api#sendvideo
 */
export interface SendVideoParams {
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
   * Video to send. Pass a file_id as String to send a video that exists on the
   * Telegram servers (recommended), pass an HTTP URL as a String for Telegram to
   * get a video from the Internet, or upload a new video using
   * multipart/form-data. More information on Sending Files »
   */
  video: InputFile | string

  /**
   * Duration of sent video in seconds
   */
  duration?: number | undefined

  /**
   * Video width
   */
  width?: number | undefined

  /**
   * Video height
   */
  height?: number | undefined

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  thumbnail?: InputFile | string | undefined

  /**
   * Cover for the video in the message. Pass a file_id to send a file that
   * exists on the Telegram servers (recommended), pass an HTTP URL for Telegram
   * to get a file from the Internet, or pass “attach://<file_attach_name>” to
   * upload a new one using multipart/form-data under <file_attach_name> name.
   * More information on Sending Files »
   */
  cover?: InputFile | string | undefined

  /**
   * Start timestamp for the video in the message
   */
  start_timestamp?: number | undefined

  /**
   * Video caption (may also be used when resending videos by file_id), 0-1024
   * characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the video caption. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  show_caption_above_media?: boolean | undefined

  /**
   * Pass True if the video needs to be covered with a spoiler animation
   */
  has_spoiler?: boolean | undefined

  /**
   * Pass True if the uploaded video is suitable for streaming
   */
  supports_streaming?: boolean | undefined

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
 * Parameters for `sendAnimation`.
 *
 * @see https://corefork.telegram.org/bots/api#sendanimation
 */
export interface SendAnimationParams {
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
   * Animation to send. Pass a file_id as String to send an animation that exists
   * on the Telegram servers (recommended), pass an HTTP URL as a String for
   * Telegram to get an animation from the Internet, or upload a new animation
   * using multipart/form-data. More information on Sending Files »
   */
  animation: InputFile | string

  /**
   * Duration of sent animation in seconds
   */
  duration?: number | undefined

  /**
   * Animation width
   */
  width?: number | undefined

  /**
   * Animation height
   */
  height?: number | undefined

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  thumbnail?: InputFile | string | undefined

  /**
   * Animation caption (may also be used when resending animation by file_id),
   * 0-1024 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the animation caption. See formatting options
   * for more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  show_caption_above_media?: boolean | undefined

  /**
   * Pass True if the animation needs to be covered with a spoiler animation
   */
  has_spoiler?: boolean | undefined

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
 * Parameters for `sendVoice`.
 *
 * @see https://corefork.telegram.org/bots/api#sendvoice
 */
export interface SendVoiceParams {
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
   * Audio file to send. Pass a file_id as String to send a file that exists on
   * the Telegram servers (recommended), pass an HTTP URL as a String for
   * Telegram to get a file from the Internet, or upload a new one using
   * multipart/form-data. More information on Sending Files »
   */
  voice: InputFile | string

  /**
   * Voice message caption, 0-1024 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the voice message caption. See formatting
   * options for more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Duration of the voice message in seconds
   */
  duration?: number | undefined

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
 * Parameters for `sendVideoNote`.
 *
 * @see https://corefork.telegram.org/bots/api#sendvideonote
 */
export interface SendVideoNoteParams {
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
   * Video note to send. Pass a file_id as String to send a video note that
   * exists on the Telegram servers (recommended) or upload a new video using
   * multipart/form-data. More information on Sending Files ». Sending video
   * notes by a URL is currently unsupported.
   */
  video_note: InputFile | string

  /**
   * Duration of sent video in seconds
   */
  duration?: number | undefined

  /**
   * Video width and height, i.e. diameter of the video message
   */
  length?: number | undefined

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  thumbnail?: InputFile | string | undefined

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
 * Parameters for `sendPaidMedia`.
 *
 * @see https://corefork.telegram.org/bots/api#sendpaidmedia
 */
export interface SendPaidMediaParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be sent
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target bot,
   * supergroup or channel in the format @username. If the chat is a channel, all
   * Telegram Star proceeds from this media will be credited to the chat's
   * balance. Otherwise, they will be credited to the bot's balance.
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
   * The number of Telegram Stars that must be paid to buy access to the media;
   * 1-25000
   */
  star_count: number

  /**
   * A JSON-serialized Array describing the media to be sent; up to 10 items
   */
  media: InputPaidMedia[]

  /**
   * Bot-defined paid media payload, 0-128 bytes. This will not be displayed to
   * the user, use it for your internal processes.
   */
  payload?: string | undefined

  /**
   * Media caption, 0-1024 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the media caption. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  show_caption_above_media?: boolean | undefined

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
 * Parameters for `sendMediaGroup`.
 *
 * @see https://corefork.telegram.org/bots/api#sendmediagroup
 */
export interface SendMediaGroupParams {
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
   * Identifier of the direct messages topic to which the messages will be sent;
   * required if the messages are sent to a direct messages chat
   */
  direct_messages_topic_id?: number | undefined

  /**
   * A JSON-serialized Array describing messages to be sent, must include 2-10
   * items
   */
  media: Array<InputMediaAudio | InputMediaDocument | InputMediaLivePhoto | InputMediaPhoto | InputMediaVideo>

  /**
   * Sends messages silently. Users will receive a notification with no sound.
   */
  disable_notification?: boolean | undefined

  /**
   * Protects the contents of the sent messages from forwarding and saving
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
   * Description of the message to reply to
   */
  reply_parameters?: ReplyParameters | undefined
}

/**
 * Parameters for `sendLocation`.
 *
 * @see https://corefork.telegram.org/bots/api#sendlocation
 */
export interface SendLocationParams {
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
   * Latitude of the location
   */
  latitude: number

  /**
   * Longitude of the location
   */
  longitude: number

  /**
   * The radius of uncertainty for the location, measured in meters; 0-1500
   */
  horizontal_accuracy?: number | undefined

  /**
   * Period in seconds during which the location will be updated (see Live
   * Locations), must be between 60 and 86400, or 0x7FFFFFFF for live locations
   * that can be edited indefinitely. Must be 0 for ephemeral messages.
   */
  live_period?: number | undefined

  /**
   * For live locations, a direction in which the user is moving, in degrees.
   * Must be between 1 and 360 if specified.
   */
  heading?: number | undefined

  /**
   * For live locations, a maximum distance for proximity alerts about
   * approaching another chat member, in meters. Must be between 1 and 100000 if
   * specified.
   */
  proximity_alert_radius?: number | undefined

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
 * Parameters for `sendVenue`.
 *
 * @see https://corefork.telegram.org/bots/api#sendvenue
 */
export interface SendVenueParams {
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
   * Latitude of the venue
   */
  latitude: number

  /**
   * Longitude of the venue
   */
  longitude: number

  /**
   * Name of the venue
   */
  title: string

  /**
   * Address of the venue
   */
  address: string

  /**
   * Foursquare identifier of the venue
   */
  foursquare_id?: string | undefined

  /**
   * Foursquare type of the venue, if known. (For example,
   * “arts_entertainment/default”, “arts_entertainment/aquarium” or
   * “food/icecream”.)
   */
  foursquare_type?: string | undefined

  /**
   * Google Places identifier of the venue
   */
  google_place_id?: string | undefined

  /**
   * Google Places type of the venue. (See supported types.)
   */
  google_place_type?: string | undefined

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
 * Parameters for `sendContact`.
 *
 * @see https://corefork.telegram.org/bots/api#sendcontact
 */
export interface SendContactParams {
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
   * Contact's phone number
   */
  phone_number: string

  /**
   * Contact's first name
   */
  first_name: string

  /**
   * Contact's last name
   */
  last_name?: string | undefined

  /**
   * Additional data about the contact in the form of a vCard, 0-2048 bytes
   */
  vcard?: string | undefined

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
 * Parameters for `sendPoll`.
 *
 * @see https://corefork.telegram.org/bots/api#sendpoll
 */
export interface SendPollParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be sent
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target bot,
   * supergroup or channel in the format @username. Polls can't be sent to
   * channel direct messages chats.
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread (topic) of a forum; for
   * forum supergroups and private chats of bots with forum topic mode enabled
   * only
   */
  message_thread_id?: number | undefined

  /**
   * Poll question, 1-300 characters
   */
  question: string

  /**
   * Mode for parsing entities in the question. See formatting options for more
   * details. Currently, only custom emoji entities are allowed.
   */
  question_parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the poll question.
   * It can be specified instead of question_parse_mode.
   */
  question_entities?: MessageEntity[] | undefined

  /**
   * A JSON-serialized list of 1-12 answer options
   */
  options: InputPollOption[]

  /**
   * True, if the poll needs to be anonymous, defaults to True
   */
  is_anonymous?: boolean | undefined

  /**
   * Poll type, “quiz” or “regular”, defaults to “regular”
   */
  type?: string | undefined

  /**
   * Pass True if the poll allows multiple answers, defaults to False
   */
  allows_multiple_answers?: boolean | undefined

  /**
   * Pass True if the poll allows to change chosen answer options, defaults to
   * False for quizzes and to True for regular polls
   */
  allows_revoting?: boolean | undefined

  /**
   * Pass True if the poll options must be shown in random order
   */
  shuffle_options?: boolean | undefined

  /**
   * Pass True if answer options can be added to the poll after creation; not
   * supported for anonymous polls and quizzes
   */
  allow_adding_options?: boolean | undefined

  /**
   * Pass True if poll results must be shown only after the poll closes
   */
  hide_results_until_closes?: boolean | undefined

  /**
   * Pass True if voting is limited to users who have been members of the chat
   * where the poll is being sent for more than 24 hours; for channel chats only
   */
  members_only?: boolean | undefined

  /**
   * A JSON-serialized list of 0-12 two-letter ISO 3166-1 alpha-2 country codes
   * indicating the countries from which users can vote in the poll; for channel
   * chats only. Use “FT” as a country code to allow users with anonymous numbers
   * to vote. If omitted or empty, then users from any country can participate in
   * the poll.
   */
  country_codes?: string[] | undefined

  /**
   * A JSON-serialized list of monotonically increasing 0-based identifiers of
   * the correct answer options, required for polls in quiz mode
   */
  correct_option_ids?: number[] | undefined

  /**
   * Text that is shown when a user chooses an incorrect answer or taps on the
   * lamp icon in a quiz-style poll, 0-200 characters with at most 2 line feeds
   * after entities parsing
   */
  explanation?: string | undefined

  /**
   * Mode for parsing entities in the explanation. See formatting options for
   * more details.
   */
  explanation_parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the poll
   * explanation. It can be specified instead of explanation_parse_mode.
   */
  explanation_entities?: MessageEntity[] | undefined

  /**
   * Media added to the quiz explanation
   */
  explanation_media?: InputPollMedia | undefined

  /**
   * Amount of time in seconds the poll will be active after creation, 5-2628000.
   * Can't be used together with close_date.
   */
  open_period?: number | undefined

  /**
   * Point in time (Unix timestamp) when the poll will be automatically closed.
   * Must be at least 5 and no more than 2628000 seconds in the future. Can't be
   * used together with open_period.
   */
  close_date?: number | undefined

  /**
   * Pass True if the poll needs to be immediately closed. This can be useful for
   * poll preview.
   */
  is_closed?: boolean | undefined

  /**
   * Description of the poll to be sent, 0-1024 characters after entities parsing
   */
  description?: string | undefined

  /**
   * Mode for parsing entities in the poll description. See formatting options
   * for more details.
   */
  description_parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the poll
   * description, which can be specified instead of description_parse_mode
   */
  description_entities?: MessageEntity[] | undefined

  /**
   * Media added to the poll description
   */
  media?: InputPollMedia | undefined

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
 * Parameters for `sendChecklist`.
 *
 * @see https://corefork.telegram.org/bots/api#sendchecklist
 */
export interface SendChecklistParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be sent
   */
  business_connection_id: string

  /**
   * Unique identifier for the target chat or username of the target bot in the
   * format @username
   */
  chat_id: number | string

  /**
   * A JSON-serialized object for the checklist to send
   */
  checklist: InputChecklist

  /**
   * Sends the message silently. Users will receive a notification with no sound.
   */
  disable_notification?: boolean | undefined

  /**
   * Protects the contents of the sent message from forwarding and saving
   */
  protect_content?: boolean | undefined

  /**
   * Unique identifier of the message effect to be added to the message
   */
  message_effect_id?: string | undefined

  /**
   * A JSON-serialized object for description of the message to reply to
   */
  reply_parameters?: ReplyParameters | undefined

  /**
   * A JSON-serialized object for an inline keyboard
   */
  reply_markup?: InlineKeyboardMarkup | undefined
}

/**
 * Parameters for `sendDice`.
 *
 * @see https://corefork.telegram.org/bots/api#senddice
 */
export interface SendDiceParams {
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
   * Emoji on which the dice throw animation is based. Currently, must be one of
   * “”, “”, “”, “”, “”, or “”. Dice can have values 1-6 for “”, “” and “”,
   * values 1-5 for “” and “”, and values 1-64 for “”. Defaults to “”.
   */
  emoji?: string | undefined

  /**
   * Sends the message silently. Users will receive a notification with no sound.
   */
  disable_notification?: boolean | undefined

  /**
   * Protects the contents of the sent message from forwarding
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
 * Parameters for `sendMessageDraft`.
 *
 * @see https://corefork.telegram.org/bots/api#sendmessagedraft
 */
export interface SendMessageDraftParams {
  /**
   * Unique identifier for the target private chat
   */
  chat_id: number

  /**
   * Unique identifier for the target message thread
   */
  message_thread_id?: number | undefined

  /**
   * Unique identifier of the message draft; must be non-zero. Changes to drafts
   * with the same identifier are animated.
   */
  draft_id: number

  /**
   * Text of the message to be sent, 0-4096 characters after entities parsing.
   * Pass an empty text to show a “Thinking…” placeholder.
   */
  text?: string | undefined

  /**
   * Mode for parsing entities in the message text. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in message text,
   * which can be specified instead of parse_mode
   */
  entities?: MessageEntity[] | undefined
}

/**
 * Parameters for `sendChatAction`.
 *
 * @see https://corefork.telegram.org/bots/api#sendchataction
 */
export interface SendChatActionParams {
  /**
   * Unique identifier of the business connection on behalf of which the action
   * will be sent
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target bot or
   * supergroup in the format @username. Channel chats and channel direct
   * messages chats aren't supported.
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread or topic of a forum; for
   * supergroups and private chats of bots with forum topic mode enabled only
   */
  message_thread_id?: number | undefined

  /**
   * Type of action to broadcast. Choose one, depending on what the user is about
   * to receive: typing for text messages, upload_photo for photos, record_video
   * or upload_video for videos, record_voice or upload_voice for voice notes,
   * upload_document for general files, choose_sticker for stickers,
   * find_location for location data, record_video_note or upload_video_note for
   * video notes.
   */
  action: string
}

/**
 * Parameters for `setMessageReaction`.
 *
 * @see https://corefork.telegram.org/bots/api#setmessagereaction
 */
export interface SetMessageReactionParams {
  /**
   * Unique identifier for the target chat or username of the target bot,
   * supergroup or channel in the format @username
   */
  chat_id: number | string

  /**
   * Identifier of the target message. If the message belongs to a media group,
   * the reaction is set to the first non-deleted message in the group instead.
   */
  message_id: number

  /**
   * A JSON-serialized list of reaction types to set on the message. Currently,
   * as non-premium users, bots can set up to one reaction per message. A custom
   * emoji reaction can be used if it is either already present on the message or
   * explicitly allowed by chat administrators. Paid reactions can't be used by
   * bots.
   */
  reaction?: ReactionType[] | undefined

  /**
   * Pass True to set the reaction with a big animation
   */
  is_big?: boolean | undefined
}

/**
 * Parameters for `getUserProfilePhotos`.
 *
 * @see https://corefork.telegram.org/bots/api#getuserprofilephotos
 */
export interface GetUserProfilePhotosParams {
  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * Sequential number of the first photo to be returned. By default, all photos
   * are returned.
   */
  offset?: number | undefined

  /**
   * Limits the number of photos to be retrieved. Values between 1-100 are
   * accepted. Defaults to 100.
   */
  limit?: number | undefined
}

/**
 * Parameters for `getUserProfileAudios`.
 *
 * @see https://corefork.telegram.org/bots/api#getuserprofileaudios
 */
export interface GetUserProfileAudiosParams {
  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * Sequential number of the first audio to be returned. By default, all audios
   * are returned.
   */
  offset?: number | undefined

  /**
   * Limits the number of audios to be retrieved. Values between 1-100 are
   * accepted. Defaults to 100.
   */
  limit?: number | undefined
}

/**
 * Parameters for `setUserEmojiStatus`.
 *
 * @see https://corefork.telegram.org/bots/api#setuseremojistatus
 */
export interface SetUserEmojiStatusParams {
  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * Custom emoji identifier of the emoji status to set. Pass an empty string to
   * remove the status.
   */
  emoji_status_custom_emoji_id?: string | undefined

  /**
   * Expiration date of the emoji status, if any
   */
  emoji_status_expiration_date?: number | undefined
}

/**
 * Parameters for `getFile`.
 *
 * @see https://corefork.telegram.org/bots/api#getfile
 */
export interface GetFileParams {
  /**
   * File identifier to get information about
   */
  file_id: string
}

/**
 * Parameters for `banChatMember`.
 *
 * @see https://corefork.telegram.org/bots/api#banchatmember
 */
export interface BanChatMemberParams {
  /**
   * Unique identifier for the target group or username of the target supergroup
   * or channel in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * Date when the user will be unbanned; Unix time. If user is banned for more
   * than 366 days or less than 30 seconds from the current time they are
   * considered to be banned forever. Applied for supergroups and channels only.
   */
  until_date?: number | undefined

  /**
   * Pass True to delete all messages from the chat for the user that is being
   * removed. If False, the user will be able to see messages in the group that
   * were sent before the user was removed. Always True for supergroups and
   * channels.
   */
  revoke_messages?: boolean | undefined
}

/**
 * Parameters for `unbanChatMember`.
 *
 * @see https://corefork.telegram.org/bots/api#unbanchatmember
 */
export interface UnbanChatMemberParams {
  /**
   * Unique identifier for the target group or username of the target supergroup
   * or channel in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * Do nothing if the user is not banned
   */
  only_if_banned?: boolean | undefined
}

/**
 * Parameters for `restrictChatMember`.
 *
 * @see https://corefork.telegram.org/bots/api#restrictchatmember
 */
export interface RestrictChatMemberParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * A JSON-serialized object for new user permissions
   */
  permissions: ChatPermissions

  /**
   * Pass True if chat permissions are set independently. Otherwise, the
   * can_send_other_messages and can_add_web_page_previews permissions will imply
   * the can_send_messages, can_send_audios, can_send_documents, can_send_photos,
   * can_send_videos, can_send_video_notes, and can_send_voice_notes permissions;
   * the can_send_polls permission will imply the can_send_messages permission.
   */
  use_independent_chat_permissions?: boolean | undefined

  /**
   * Date when restrictions will be lifted for the user; Unix time. If user is
   * restricted for more than 366 days or less than 30 seconds from the current
   * time, they are considered to be restricted forever.
   */
  until_date?: number | undefined
}

/**
 * Parameters for `promoteChatMember`.
 *
 * @see https://corefork.telegram.org/bots/api#promotechatmember
 */
export interface PromoteChatMemberParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * Pass True if the administrator's presence in the chat is hidden
   */
  is_anonymous?: boolean | undefined

  /**
   * Pass True if the administrator can access the chat event log, get boost
   * list, see hidden supergroup and channel members, report spam messages,
   * ignore slow mode, and send messages to the chat without paying Telegram
   * Stars. Implied by any other administrator privilege.
   */
  can_manage_chat?: boolean | undefined

  /**
   * Pass True if the administrator can delete messages of other users
   */
  can_delete_messages?: boolean | undefined

  /**
   * Pass True if the administrator can manage video chats
   */
  can_manage_video_chats?: boolean | undefined

  /**
   * Pass True if the administrator can restrict, ban or unban chat members, or
   * access supergroup statistics. For backward compatibility, defaults to True
   * for promotions of channel administrators.
   */
  can_restrict_members?: boolean | undefined

  /**
   * Pass True if the administrator can add new administrators with a subset of
   * their own privileges or demote administrators that they have promoted,
   * directly or indirectly (promoted by administrators that were appointed by
   * him)
   */
  can_promote_members?: boolean | undefined

  /**
   * Pass True if the administrator can change chat title, photo and other
   * settings
   */
  can_change_info?: boolean | undefined

  /**
   * Pass True if the administrator can invite new users to the chat
   */
  can_invite_users?: boolean | undefined

  /**
   * Pass True if the administrator can post stories to the chat
   */
  can_post_stories?: boolean | undefined

  /**
   * Pass True if the administrator can edit stories posted by other users, post
   * stories to the chat page, pin chat stories, and access the chat's story
   * archive
   */
  can_edit_stories?: boolean | undefined

  /**
   * Pass True if the administrator can delete stories posted by other users
   */
  can_delete_stories?: boolean | undefined

  /**
   * Pass True if the administrator can post messages in the channel, approve
   * suggested posts, or access channel statistics; for channels only
   */
  can_post_messages?: boolean | undefined

  /**
   * Pass True if the administrator can edit messages of other users and can pin
   * messages; for channels only
   */
  can_edit_messages?: boolean | undefined

  /**
   * Pass True if the administrator can pin messages; for supergroups only
   */
  can_pin_messages?: boolean | undefined

  /**
   * Pass True if the user is allowed to create, rename, close, and reopen forum
   * topics; for supergroups only
   */
  can_manage_topics?: boolean | undefined

  /**
   * Pass True if the administrator can manage direct messages within the channel
   * and decline suggested posts; for channels only
   */
  can_manage_direct_messages?: boolean | undefined

  /**
   * Pass True if the administrator can edit the tags of regular members; for
   * groups and supergroups only
   */
  can_manage_tags?: boolean | undefined
}

/**
 * Parameters for `setChatAdministratorCustomTitle`.
 *
 * @see https://corefork.telegram.org/bots/api#setchatadministratorcustomtitle
 */
export interface SetChatAdministratorCustomTitleParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * New custom title for the administrator; 0-16 characters, emoji are not
   * allowed
   */
  custom_title: string
}

/**
 * Parameters for `setChatMemberTag`.
 *
 * @see https://corefork.telegram.org/bots/api#setchatmembertag
 */
export interface SetChatMemberTagParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * New tag for the member; 0-16 characters, emoji are not allowed
   */
  tag?: string | undefined
}

/**
 * Parameters for `banChatSenderChat`.
 *
 * @see https://corefork.telegram.org/bots/api#banchatsenderchat
 */
export interface BanChatSenderChatParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target sender chat
   */
  sender_chat_id: number
}

/**
 * Parameters for `unbanChatSenderChat`.
 *
 * @see https://corefork.telegram.org/bots/api#unbanchatsenderchat
 */
export interface UnbanChatSenderChatParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target sender chat
   */
  sender_chat_id: number
}

/**
 * Parameters for `setChatPermissions`.
 *
 * @see https://corefork.telegram.org/bots/api#setchatpermissions
 */
export interface SetChatPermissionsParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * A JSON-serialized object for new default chat permissions
   */
  permissions: ChatPermissions

  /**
   * Pass True if chat permissions are set independently. Otherwise, the
   * can_send_other_messages and can_add_web_page_previews permissions will imply
   * the can_send_messages, can_send_audios, can_send_documents, can_send_photos,
   * can_send_videos, can_send_video_notes, and can_send_voice_notes permissions;
   * the can_send_polls permission will imply the can_send_messages permission.
   */
  use_independent_chat_permissions?: boolean | undefined
}

/**
 * Parameters for `exportChatInviteLink`.
 *
 * @see https://corefork.telegram.org/bots/api#exportchatinvitelink
 */
export interface ExportChatInviteLinkParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `createChatInviteLink`.
 *
 * @see https://corefork.telegram.org/bots/api#createchatinvitelink
 */
export interface CreateChatInviteLinkParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Invite link name; 0-32 characters
   */
  name?: string | undefined

  /**
   * Point in time (Unix timestamp) when the link will expire
   */
  expire_date?: number | undefined

  /**
   * The maximum number of users that can be members of the chat simultaneously
   * after joining the chat via this invite link; 1-99999
   */
  member_limit?: number | undefined

  /**
   * True, if users joining the chat via the link need to be approved by chat
   * administrators. If True, member_limit can't be specified.
   */
  creates_join_request?: boolean | undefined
}

/**
 * Parameters for `editChatInviteLink`.
 *
 * @see https://corefork.telegram.org/bots/api#editchatinvitelink
 */
export interface EditChatInviteLinkParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * The invite link to edit
   */
  invite_link: string

  /**
   * Invite link name; 0-32 characters
   */
  name?: string | undefined

  /**
   * Point in time (Unix timestamp) when the link will expire
   */
  expire_date?: number | undefined

  /**
   * The maximum number of users that can be members of the chat simultaneously
   * after joining the chat via this invite link; 1-99999
   */
  member_limit?: number | undefined

  /**
   * True, if users joining the chat via the link need to be approved by chat
   * administrators. If True, member_limit can't be specified.
   */
  creates_join_request?: boolean | undefined
}

/**
 * Parameters for `createChatSubscriptionInviteLink`.
 *
 * @see https://corefork.telegram.org/bots/api#createchatsubscriptioninvitelink
 */
export interface CreateChatSubscriptionInviteLinkParams {
  /**
   * Unique identifier for the target channel chat or username of the target
   * channel in the format @username
   */
  chat_id: number | string

  /**
   * Invite link name; 0-32 characters
   */
  name?: string | undefined

  /**
   * The number of seconds the subscription will be active for before the next
   * payment. Currently, it must always be 2592000 (30 days).
   */
  subscription_period: number

  /**
   * The amount of Telegram Stars a user must pay initially and after each
   * subsequent subscription period to be a member of the chat; 1-10000
   */
  subscription_price: number
}

/**
 * Parameters for `editChatSubscriptionInviteLink`.
 *
 * @see https://corefork.telegram.org/bots/api#editchatsubscriptioninvitelink
 */
export interface EditChatSubscriptionInviteLinkParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * The invite link to edit
   */
  invite_link: string

  /**
   * Invite link name; 0-32 characters
   */
  name?: string | undefined
}

/**
 * Parameters for `revokeChatInviteLink`.
 *
 * @see https://corefork.telegram.org/bots/api#revokechatinvitelink
 */
export interface RevokeChatInviteLinkParams {
  /**
   * Unique identifier of the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * The invite link to revoke
   */
  invite_link: string
}

/**
 * Parameters for `approveChatJoinRequest`.
 *
 * @see https://corefork.telegram.org/bots/api#approvechatjoinrequest
 */
export interface ApproveChatJoinRequestParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number
}

/**
 * Parameters for `declineChatJoinRequest`.
 *
 * @see https://corefork.telegram.org/bots/api#declinechatjoinrequest
 */
export interface DeclineChatJoinRequestParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number
}

/**
 * Parameters for `answerChatJoinRequestQuery`.
 *
 * @see https://corefork.telegram.org/bots/api#answerchatjoinrequestquery
 */
export interface AnswerChatJoinRequestQueryParams {
  /**
   * Unique identifier of the join request query
   */
  chat_join_request_query_id: string

  /**
   * Result of the query. Must be either “approve” to allow the user to join the
   * chat, “decline” to disallow the user to join the chat, or “queue” to leave
   * the decision to other administrators.
   */
  result: string
}

/**
 * Parameters for `sendChatJoinRequestWebApp`.
 *
 * @see https://corefork.telegram.org/bots/api#sendchatjoinrequestwebapp
 */
export interface SendChatJoinRequestWebAppParams {
  /**
   * Unique identifier of the join request query
   */
  chat_join_request_query_id: string

  /**
   * An HTTPS URL of a Web App to be opened with additional data as specified in
   * Initializing Web Apps
   */
  web_app_url: string
}

/**
 * Parameters for `setChatPhoto`.
 *
 * @see https://corefork.telegram.org/bots/api#setchatphoto
 */
export interface SetChatPhotoParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * New chat photo, uploaded using multipart/form-data
   */
  photo: InputFile
}

/**
 * Parameters for `deleteChatPhoto`.
 *
 * @see https://corefork.telegram.org/bots/api#deletechatphoto
 */
export interface DeleteChatPhotoParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `setChatTitle`.
 *
 * @see https://corefork.telegram.org/bots/api#setchattitle
 */
export interface SetChatTitleParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * New chat title, 1-128 characters
   */
  title: string
}

/**
 * Parameters for `setChatDescription`.
 *
 * @see https://corefork.telegram.org/bots/api#setchatdescription
 */
export interface SetChatDescriptionParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * New chat description, 0-255 characters
   */
  description?: string | undefined
}

/**
 * Parameters for `pinChatMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#pinchatmessage
 */
export interface PinChatMessageParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be pinned
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Identifier of a message to pin
   */
  message_id: number

  /**
   * Pass True if it is not necessary to send a notification to all chat members
   * about the new pinned message. Notifications are always disabled in channels
   * and private chats.
   */
  disable_notification?: boolean | undefined
}

/**
 * Parameters for `unpinChatMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#unpinchatmessage
 */
export interface UnpinChatMessageParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be unpinned
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Identifier of the message to unpin. Required if business_connection_id is
   * specified. If not specified, the most recent pinned message (by sending
   * date) will be unpinned.
   */
  message_id?: number | undefined
}

/**
 * Parameters for `unpinAllChatMessages`.
 *
 * @see https://corefork.telegram.org/bots/api#unpinallchatmessages
 */
export interface UnpinAllChatMessagesParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `leaveChat`.
 *
 * @see https://corefork.telegram.org/bots/api#leavechat
 */
export interface LeaveChatParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * or channel in the format @username. Channel direct messages chats aren't
   * supported; leave the corresponding channel instead.
   */
  chat_id: number | string
}

/**
 * Parameters for `getChat`.
 *
 * @see https://corefork.telegram.org/bots/api#getchat
 */
export interface GetChatParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * or channel in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `getChatAdministrators`.
 *
 * @see https://corefork.telegram.org/bots/api#getchatadministrators
 */
export interface GetChatAdministratorsParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * or channel in the format @username
   */
  chat_id: number | string

  /**
   * Pass True to additionally receive all bots that are administrators of the
   * chat. By default, bots other than the current bot are omitted.
   */
  return_bots?: boolean | undefined
}

/**
 * Parameters for `getChatMemberCount`.
 *
 * @see https://corefork.telegram.org/bots/api#getchatmembercount
 */
export interface GetChatMemberCountParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * or channel in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `getChatMember`.
 *
 * @see https://corefork.telegram.org/bots/api#getchatmember
 */
export interface GetChatMemberParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * or channel in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number
}

/**
 * Parameters for `getUserPersonalChatMessages`.
 *
 * @see https://corefork.telegram.org/bots/api#getuserpersonalchatmessages
 */
export interface GetUserPersonalChatMessagesParams {
  /**
   * Unique identifier for the target user
   */
  user_id: number

  /**
   * The maximum number of messages to return; 1-20
   */
  limit: number
}

/**
 * Parameters for `setChatStickerSet`.
 *
 * @see https://corefork.telegram.org/bots/api#setchatstickerset
 */
export interface SetChatStickerSetParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Name of the sticker set to be set as the group sticker set
   */
  sticker_set_name: string
}

/**
 * Parameters for `deleteChatStickerSet`.
 *
 * @see https://corefork.telegram.org/bots/api#deletechatstickerset
 */
export interface DeleteChatStickerSetParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `getForumTopicIconStickers`.
 *
 * @see https://corefork.telegram.org/bots/api#getforumtopiciconstickers
 */
// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters
export interface GetForumTopicIconStickersParams {}

/**
 * Parameters for `createForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#createforumtopic
 */
export interface CreateForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Topic name, 1-128 characters
   */
  name: string

  /**
   * Color of the topic icon in RGB format. Currently, must be one of 7322096
   * (0x6FB9F0), 16766590 (0xFFD67E), 13338331 (0xCB86DB), 9367192 (0x8EEE98),
   * 16749490 (0xFF93B2), or 16478047 (0xFB6F5F).
   */
  icon_color?: number | undefined

  /**
   * Unique identifier of the custom emoji shown as the topic icon. Use
   * getForumTopicIconStickers to get all allowed custom emoji identifiers.
   */
  icon_custom_emoji_id?: string | undefined
}

/**
 * Parameters for `editForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#editforumtopic
 */
export interface EditForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread of the forum topic
   */
  message_thread_id: number

  /**
   * New topic name, 0-128 characters. If not specified or empty, the current
   * name of the topic will be kept.
   */
  name?: string | undefined

  /**
   * New unique identifier of the custom emoji shown as the topic icon. Use
   * getForumTopicIconStickers to get all allowed custom emoji identifiers. Pass
   * an empty string to remove the icon. If not specified, the current icon will
   * be kept.
   */
  icon_custom_emoji_id?: string | undefined
}

/**
 * Parameters for `closeForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#closeforumtopic
 */
export interface CloseForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread of the forum topic
   */
  message_thread_id: number
}

/**
 * Parameters for `reopenForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#reopenforumtopic
 */
export interface ReopenForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread of the forum topic
   */
  message_thread_id: number
}

/**
 * Parameters for `deleteForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#deleteforumtopic
 */
export interface DeleteForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread of the forum topic
   */
  message_thread_id: number
}

/**
 * Parameters for `unpinAllForumTopicMessages`.
 *
 * @see https://corefork.telegram.org/bots/api#unpinallforumtopicmessages
 */
export interface UnpinAllForumTopicMessagesParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread of the forum topic
   */
  message_thread_id: number
}

/**
 * Parameters for `editGeneralForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#editgeneralforumtopic
 */
export interface EditGeneralForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string

  /**
   * New topic name, 1-128 characters
   */
  name: string
}

/**
 * Parameters for `closeGeneralForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#closegeneralforumtopic
 */
export interface CloseGeneralForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `reopenGeneralForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#reopengeneralforumtopic
 */
export interface ReopenGeneralForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `hideGeneralForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#hidegeneralforumtopic
 */
export interface HideGeneralForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `unhideGeneralForumTopic`.
 *
 * @see https://corefork.telegram.org/bots/api#unhidegeneralforumtopic
 */
export interface UnhideGeneralForumTopicParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `unpinAllGeneralForumTopicMessages`.
 *
 * @see https://corefork.telegram.org/bots/api#unpinallgeneralforumtopicmessages
 */
export interface UnpinAllGeneralForumTopicMessagesParams {
  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `answerCallbackQuery`.
 *
 * @see https://corefork.telegram.org/bots/api#answercallbackquery
 */
export interface AnswerCallbackQueryParams {
  /**
   * Unique identifier for the query to be answered
   */
  callback_query_id: string

  /**
   * Text of the notification. If not specified, nothing will be shown to the
   * user, 0-200 characters.
   */
  text?: string | undefined

  /**
   * If True, an alert will be shown by the client instead of a notification at
   * the top of the chat screen. Defaults to False.
   */
  show_alert?: boolean | undefined

  /**
   * URL that will be opened by the user's client. If you have created a Game and
   * accepted the conditions via @BotFather, specify the URL that opens your game
   * - note that this will only work if the query comes from a callback_game
   * button. Otherwise, you may use links like t.me/your_bot?start=XXXX that open
   * your bot with a parameter.
   */
  url?: string | undefined

  /**
   * The maximum amount of time in seconds that the result of the callback query
   * may be cached client-side. Telegram apps will support caching starting in
   * version 3.14. Defaults to 0.
   */
  cache_time?: number | undefined
}

/**
 * Parameters for `answerGuestQuery`.
 *
 * @see https://corefork.telegram.org/bots/api#answerguestquery
 */
export interface AnswerGuestQueryParams {
  /**
   * Unique identifier for the query to be answered
   */
  guest_query_id: string

  /**
   * A JSON-serialized object describing the message to be sent
   */
  result: InlineQueryResult
}

/**
 * Parameters for `getUserChatBoosts`.
 *
 * @see https://corefork.telegram.org/bots/api#getuserchatboosts
 */
export interface GetUserChatBoostsParams {
  /**
   * Unique identifier for the chat or username of the channel in the format
   * @username
   */
  chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  user_id: number
}

/**
 * Parameters for `getBusinessConnection`.
 *
 * @see https://corefork.telegram.org/bots/api#getbusinessconnection
 */
export interface GetBusinessConnectionParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string
}

/**
 * Parameters for `getManagedBotToken`.
 *
 * @see https://corefork.telegram.org/bots/api#getmanagedbottoken
 */
export interface GetManagedBotTokenParams {
  /**
   * User identifier of the managed bot whose token will be returned
   */
  user_id: number
}

/**
 * Parameters for `replaceManagedBotToken`.
 *
 * @see https://corefork.telegram.org/bots/api#replacemanagedbottoken
 */
export interface ReplaceManagedBotTokenParams {
  /**
   * User identifier of the managed bot whose token will be replaced
   */
  user_id: number
}

/**
 * Parameters for `getManagedBotAccessSettings`.
 *
 * @see https://corefork.telegram.org/bots/api#getmanagedbotaccesssettings
 */
export interface GetManagedBotAccessSettingsParams {
  /**
   * User identifier of the managed bot whose access settings will be returned
   */
  user_id: number
}

/**
 * Parameters for `setManagedBotAccessSettings`.
 *
 * @see https://corefork.telegram.org/bots/api#setmanagedbotaccesssettings
 */
export interface SetManagedBotAccessSettingsParams {
  /**
   * User identifier of the managed bot whose access settings will be changed
   */
  user_id: number

  /**
   * Pass True if only selected users can access the bot. The bot's owner can
   * always access it.
   */
  is_access_restricted: boolean

  /**
   * A JSON-serialized list of up to 10 identifiers of users who will have access
   * to the bot in addition to its owner. Ignored if is_access_restricted is
   * False.
   */
  added_user_ids?: number[] | undefined
}

/**
 * Parameters for `setMyCommands`.
 *
 * @see https://corefork.telegram.org/bots/api#setmycommands
 */
export interface SetMyCommandsParams {
  /**
   * A JSON-serialized list of bot commands to be set as the list of the bot's
   * commands. At most 100 commands can be specified.
   */
  commands: BotCommand[]

  /**
   * A JSON-serialized object, describing scope of users for which the commands
   * are relevant. Defaults to BotCommandScopeDefault.
   */
  scope?: BotCommandScope | undefined

  /**
   * A two-letter ISO 639-1 language code. If empty, commands will be applied to
   * all users from the given scope, for whose language there are no dedicated
   * commands.
   */
  language_code?: string | undefined
}

/**
 * Parameters for `deleteMyCommands`.
 *
 * @see https://corefork.telegram.org/bots/api#deletemycommands
 */
export interface DeleteMyCommandsParams {
  /**
   * A JSON-serialized object, describing scope of users for which the commands
   * are relevant. Defaults to BotCommandScopeDefault.
   */
  scope?: BotCommandScope | undefined

  /**
   * A two-letter ISO 639-1 language code. If empty, commands will be applied to
   * all users from the given scope, for whose language there are no dedicated
   * commands.
   */
  language_code?: string | undefined
}

/**
 * Parameters for `getMyCommands`.
 *
 * @see https://corefork.telegram.org/bots/api#getmycommands
 */
export interface GetMyCommandsParams {
  /**
   * A JSON-serialized object, describing scope of users. Defaults to
   * BotCommandScopeDefault.
   */
  scope?: BotCommandScope | undefined

  /**
   * A two-letter ISO 639-1 language code or an empty string
   */
  language_code?: string | undefined
}

/**
 * Parameters for `setMyName`.
 *
 * @see https://corefork.telegram.org/bots/api#setmyname
 */
export interface SetMyNameParams {
  /**
   * New bot name; 0-64 characters. Pass an empty string to remove the dedicated
   * name for the given language.
   */
  name?: string | undefined

  /**
   * A two-letter ISO 639-1 language code. If empty, the name will be shown to
   * all users for whose language there is no dedicated name.
   */
  language_code?: string | undefined
}

/**
 * Parameters for `getMyName`.
 *
 * @see https://corefork.telegram.org/bots/api#getmyname
 */
export interface GetMyNameParams {
  /**
   * A two-letter ISO 639-1 language code or an empty string
   */
  language_code?: string | undefined
}

/**
 * Parameters for `setMyDescription`.
 *
 * @see https://corefork.telegram.org/bots/api#setmydescription
 */
export interface SetMyDescriptionParams {
  /**
   * New bot description; 0-512 characters. Pass an empty string to remove the
   * dedicated description for the given language.
   */
  description?: string | undefined

  /**
   * A two-letter ISO 639-1 language code. If empty, the description will be
   * applied to all users for whose language there is no dedicated description.
   */
  language_code?: string | undefined
}

/**
 * Parameters for `getMyDescription`.
 *
 * @see https://corefork.telegram.org/bots/api#getmydescription
 */
export interface GetMyDescriptionParams {
  /**
   * A two-letter ISO 639-1 language code or an empty string
   */
  language_code?: string | undefined
}

/**
 * Parameters for `setMyShortDescription`.
 *
 * @see https://corefork.telegram.org/bots/api#setmyshortdescription
 */
export interface SetMyShortDescriptionParams {
  /**
   * New short description for the bot; 0-120 characters. Pass an empty string to
   * remove the dedicated short description for the given language.
   */
  short_description?: string | undefined

  /**
   * A two-letter ISO 639-1 language code. If empty, the short description will
   * be applied to all users for whose language there is no dedicated short
   * description.
   */
  language_code?: string | undefined
}

/**
 * Parameters for `getMyShortDescription`.
 *
 * @see https://corefork.telegram.org/bots/api#getmyshortdescription
 */
export interface GetMyShortDescriptionParams {
  /**
   * A two-letter ISO 639-1 language code or an empty string
   */
  language_code?: string | undefined
}

/**
 * Parameters for `setMyProfilePhoto`.
 *
 * @see https://corefork.telegram.org/bots/api#setmyprofilephoto
 */
export interface SetMyProfilePhotoParams {
  /**
   * The new profile photo to set
   */
  photo: InputProfilePhoto
}

/**
 * Parameters for `removeMyProfilePhoto`.
 *
 * @see https://corefork.telegram.org/bots/api#removemyprofilephoto
 */
// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters
export interface RemoveMyProfilePhotoParams {}

/**
 * Parameters for `setChatMenuButton`.
 *
 * @see https://corefork.telegram.org/bots/api#setchatmenubutton
 */
export interface SetChatMenuButtonParams {
  /**
   * Unique identifier for the target private chat. If not specified, the bot's
   * default menu button will be changed.
   */
  chat_id?: number | undefined

  /**
   * A JSON-serialized object for the bot's new menu button. Defaults to
   * MenuButtonDefault.
   */
  menu_button?: MenuButton | undefined
}

/**
 * Parameters for `getChatMenuButton`.
 *
 * @see https://corefork.telegram.org/bots/api#getchatmenubutton
 */
export interface GetChatMenuButtonParams {
  /**
   * Unique identifier for the target private chat. If not specified, the bot's
   * default menu button will be returned.
   */
  chat_id?: number | undefined
}

/**
 * Parameters for `setMyDefaultAdministratorRights`.
 *
 * @see https://corefork.telegram.org/bots/api#setmydefaultadministratorrights
 */
export interface SetMyDefaultAdministratorRightsParams {
  /**
   * A JSON-serialized object describing new default administrator rights. If not
   * specified, the default administrator rights will be cleared.
   */
  rights?: ChatAdministratorRights | undefined

  /**
   * Pass True to change the default administrator rights of the bot in channels.
   * Otherwise, the default administrator rights of the bot for groups and
   * supergroups will be changed.
   */
  for_channels?: boolean | undefined
}

/**
 * Parameters for `getMyDefaultAdministratorRights`.
 *
 * @see https://corefork.telegram.org/bots/api#getmydefaultadministratorrights
 */
export interface GetMyDefaultAdministratorRightsParams {
  /**
   * Pass True to get default administrator rights of the bot in channels.
   * Otherwise, default administrator rights of the bot for groups and
   * supergroups will be returned.
   */
  for_channels?: boolean | undefined
}

/**
 * Parameters for `getAvailableGifts`.
 *
 * @see https://corefork.telegram.org/bots/api#getavailablegifts
 */
// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters
export interface GetAvailableGiftsParams {}

/**
 * Parameters for `sendGift`.
 *
 * @see https://corefork.telegram.org/bots/api#sendgift
 */
export interface SendGiftParams {
  /**
   * Required if chat_id is not specified. Unique identifier of the target user
   * who will receive the gift.
   */
  user_id?: number | undefined

  /**
   * Required if user_id is not specified. Unique identifier for the chat or
   * username of the channel (in the format @username) that will receive the
   * gift.
   */
  chat_id?: number | string | undefined

  /**
   * Identifier of the gift; limited gifts can't be sent to channel chats
   */
  gift_id: string

  /**
   * Pass True to pay for the gift upgrade from the bot's balance, thereby making
   * the upgrade free for the receiver
   */
  pay_for_upgrade?: boolean | undefined

  /**
   * Text that will be shown along with the gift; 0-128 characters
   */
  text?: string | undefined

  /**
   * Mode for parsing entities in the text. See formatting options for more
   * details. Entities other than “bold”, “italic”, “underline”, “strikethrough”,
   * “spoiler”, “custom_emoji”, and “date_time” are ignored.
   */
  text_parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the gift text. It
   * can be specified instead of text_parse_mode. Entities other than “bold”,
   * “italic”, “underline”, “strikethrough”, “spoiler”, “custom_emoji”, and
   * “date_time” are ignored.
   */
  text_entities?: MessageEntity[] | undefined
}

/**
 * Parameters for `giftPremiumSubscription`.
 *
 * @see https://corefork.telegram.org/bots/api#giftpremiumsubscription
 */
export interface GiftPremiumSubscriptionParams {
  /**
   * Unique identifier of the target user who will receive a Telegram Premium
   * subscription
   */
  user_id: number

  /**
   * Number of months the Telegram Premium subscription will be active for the
   * user; must be one of 3, 6, or 12
   */
  month_count: number

  /**
   * Number of Telegram Stars to pay for the Telegram Premium subscription; must
   * be 1000 for 3 months, 1500 for 6 months, and 2500 for 12 months
   */
  star_count: number

  /**
   * Text that will be shown along with the service message about the
   * subscription; 0-128 characters
   */
  text?: string | undefined

  /**
   * Mode for parsing entities in the text. See formatting options for more
   * details. Entities other than “bold”, “italic”, “underline”, “strikethrough”,
   * “spoiler”, “custom_emoji”, and “date_time” are ignored.
   */
  text_parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the gift text. It
   * can be specified instead of text_parse_mode. Entities other than “bold”,
   * “italic”, “underline”, “strikethrough”, “spoiler”, “custom_emoji”, and
   * “date_time” are ignored.
   */
  text_entities?: MessageEntity[] | undefined
}

/**
 * Parameters for `verifyUser`.
 *
 * @see https://corefork.telegram.org/bots/api#verifyuser
 */
export interface VerifyUserParams {
  /**
   * Unique identifier of the target user
   */
  user_id: number

  /**
   * Custom description for the verification; 0-70 characters. Must be empty if
   * the organization isn't allowed to provide a custom verification description.
   */
  custom_description?: string | undefined
}

/**
 * Parameters for `verifyChat`.
 *
 * @see https://corefork.telegram.org/bots/api#verifychat
 */
export interface VerifyChatParams {
  /**
   * Unique identifier for the target chat or username of the target bot,
   * supergroup or channel in the format @username. Channel direct messages chats
   * can't be verified.
   */
  chat_id: number | string

  /**
   * Custom description for the verification; 0-70 characters. Must be empty if
   * the organization isn't allowed to provide a custom verification description.
   */
  custom_description?: string | undefined
}

/**
 * Parameters for `removeUserVerification`.
 *
 * @see https://corefork.telegram.org/bots/api#removeuserverification
 */
export interface RemoveUserVerificationParams {
  /**
   * Unique identifier of the target user
   */
  user_id: number
}

/**
 * Parameters for `removeChatVerification`.
 *
 * @see https://corefork.telegram.org/bots/api#removechatverification
 */
export interface RemoveChatVerificationParams {
  /**
   * Unique identifier for the target chat or username of the target bot or
   * channel in the format @username
   */
  chat_id: number | string
}

/**
 * Parameters for `readBusinessMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#readbusinessmessage
 */
export interface ReadBusinessMessageParams {
  /**
   * Unique identifier of the business connection on behalf of which to read the
   * message
   */
  business_connection_id: string

  /**
   * Unique identifier of the chat in which the message was received. The chat
   * must have been active in the last 24 hours.
   */
  chat_id: number

  /**
   * Unique identifier of the message to mark as read
   */
  message_id: number
}

/**
 * Parameters for `deleteBusinessMessages`.
 *
 * @see https://corefork.telegram.org/bots/api#deletebusinessmessages
 */
export interface DeleteBusinessMessagesParams {
  /**
   * Unique identifier of the business connection on behalf of which to delete
   * the messages
   */
  business_connection_id: string

  /**
   * A JSON-serialized list of 1-100 identifiers of messages to delete. All
   * messages must be from the same chat. See deleteMessage for limitations on
   * which messages can be deleted.
   */
  message_ids: number[]
}

/**
 * Parameters for `setBusinessAccountName`.
 *
 * @see https://corefork.telegram.org/bots/api#setbusinessaccountname
 */
export interface SetBusinessAccountNameParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * The new value of the first name for the business account; 1-64 characters
   */
  first_name: string

  /**
   * The new value of the last name for the business account; 0-64 characters
   */
  last_name?: string | undefined
}

/**
 * Parameters for `setBusinessAccountUsername`.
 *
 * @see https://corefork.telegram.org/bots/api#setbusinessaccountusername
 */
export interface SetBusinessAccountUsernameParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * The new value of the username for the business account; 0-32 characters
   */
  username?: string | undefined
}

/**
 * Parameters for `setBusinessAccountBio`.
 *
 * @see https://corefork.telegram.org/bots/api#setbusinessaccountbio
 */
export interface SetBusinessAccountBioParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * The new value of the bio for the business account; 0-140 characters
   */
  bio?: string | undefined
}

/**
 * Parameters for `setBusinessAccountProfilePhoto`.
 *
 * @see https://corefork.telegram.org/bots/api#setbusinessaccountprofilephoto
 */
export interface SetBusinessAccountProfilePhotoParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * The new profile photo to set
   */
  photo: InputProfilePhoto

  /**
   * Pass True to set the public photo, which will be visible even if the main
   * photo is hidden by the business account's privacy settings. An account can
   * have only one public photo.
   */
  is_public?: boolean | undefined
}

/**
 * Parameters for `removeBusinessAccountProfilePhoto`.
 *
 * @see https://corefork.telegram.org/bots/api#removebusinessaccountprofilephoto
 */
export interface RemoveBusinessAccountProfilePhotoParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Pass True to remove the public photo, which is visible even if the main
   * photo is hidden by the business account's privacy settings. After the main
   * photo is removed, the previous profile photo (if present) becomes the main
   * photo.
   */
  is_public?: boolean | undefined
}

/**
 * Parameters for `setBusinessAccountGiftSettings`.
 *
 * @see https://corefork.telegram.org/bots/api#setbusinessaccountgiftsettings
 */
export interface SetBusinessAccountGiftSettingsParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Pass True if a button for sending a gift to the user or by the business
   * account must always be shown in the input field
   */
  show_gift_button: boolean

  /**
   * Types of gifts accepted by the business account
   */
  accepted_gift_types: AcceptedGiftTypes
}

/**
 * Parameters for `getBusinessAccountStarBalance`.
 *
 * @see https://corefork.telegram.org/bots/api#getbusinessaccountstarbalance
 */
export interface GetBusinessAccountStarBalanceParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string
}

/**
 * Parameters for `transferBusinessAccountStars`.
 *
 * @see https://corefork.telegram.org/bots/api#transferbusinessaccountstars
 */
export interface TransferBusinessAccountStarsParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Number of Telegram Stars to transfer; 1-10000
   */
  star_count: number
}

/**
 * Parameters for `getBusinessAccountGifts`.
 *
 * @see https://corefork.telegram.org/bots/api#getbusinessaccountgifts
 */
export interface GetBusinessAccountGiftsParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Pass True to exclude gifts that aren't saved to the account's profile page
   */
  exclude_unsaved?: boolean | undefined

  /**
   * Pass True to exclude gifts that are saved to the account's profile page
   */
  exclude_saved?: boolean | undefined

  /**
   * Pass True to exclude gifts that can be purchased an unlimited number of
   * times
   */
  exclude_unlimited?: boolean | undefined

  /**
   * Pass True to exclude gifts that can be purchased a limited number of times
   * and can be upgraded to unique
   */
  exclude_limited_upgradable?: boolean | undefined

  /**
   * Pass True to exclude gifts that can be purchased a limited number of times
   * and can't be upgraded to unique
   */
  exclude_limited_non_upgradable?: boolean | undefined

  /**
   * Pass True to exclude unique gifts
   */
  exclude_unique?: boolean | undefined

  /**
   * Pass True to exclude gifts that were assigned from the TON blockchain and
   * can't be resold or transferred in Telegram
   */
  exclude_from_blockchain?: boolean | undefined

  /**
   * Pass True to sort results by gift price instead of send date. Sorting is
   * applied before pagination.
   */
  sort_by_price?: boolean | undefined

  /**
   * Offset of the first entry to return as received from the previous request;
   * use empty string to get the first chunk of results
   */
  offset?: string | undefined

  /**
   * The maximum number of gifts to be returned; 1-100. Defaults to 100.
   */
  limit?: number | undefined
}

/**
 * Parameters for `getUserGifts`.
 *
 * @see https://corefork.telegram.org/bots/api#getusergifts
 */
export interface GetUserGiftsParams {
  /**
   * Unique identifier of the user
   */
  user_id: number

  /**
   * Pass True to exclude gifts that can be purchased an unlimited number of
   * times
   */
  exclude_unlimited?: boolean | undefined

  /**
   * Pass True to exclude gifts that can be purchased a limited number of times
   * and can be upgraded to unique
   */
  exclude_limited_upgradable?: boolean | undefined

  /**
   * Pass True to exclude gifts that can be purchased a limited number of times
   * and can't be upgraded to unique
   */
  exclude_limited_non_upgradable?: boolean | undefined

  /**
   * Pass True to exclude gifts that were assigned from the TON blockchain and
   * can't be resold or transferred in Telegram
   */
  exclude_from_blockchain?: boolean | undefined

  /**
   * Pass True to exclude unique gifts
   */
  exclude_unique?: boolean | undefined

  /**
   * Pass True to sort results by gift price instead of send date. Sorting is
   * applied before pagination.
   */
  sort_by_price?: boolean | undefined

  /**
   * Offset of the first entry to return as received from the previous request;
   * use an empty string to get the first chunk of results
   */
  offset?: string | undefined

  /**
   * The maximum number of gifts to be returned; 1-100. Defaults to 100.
   */
  limit?: number | undefined
}

/**
 * Parameters for `getChatGifts`.
 *
 * @see https://corefork.telegram.org/bots/api#getchatgifts
 */
export interface GetChatGiftsParams {
  /**
   * Unique identifier for the target chat or username of the target channel in
   * the format @username
   */
  chat_id: number | string

  /**
   * Pass True to exclude gifts that aren't saved to the chat's profile page.
   * Always True, unless the bot has the can_post_messages administrator right in
   * the channel.
   */
  exclude_unsaved?: boolean | undefined

  /**
   * Pass True to exclude gifts that are saved to the chat's profile page. Always
   * False, unless the bot has the can_post_messages administrator right in the
   * channel.
   */
  exclude_saved?: boolean | undefined

  /**
   * Pass True to exclude gifts that can be purchased an unlimited number of
   * times
   */
  exclude_unlimited?: boolean | undefined

  /**
   * Pass True to exclude gifts that can be purchased a limited number of times
   * and can be upgraded to unique
   */
  exclude_limited_upgradable?: boolean | undefined

  /**
   * Pass True to exclude gifts that can be purchased a limited number of times
   * and can't be upgraded to unique
   */
  exclude_limited_non_upgradable?: boolean | undefined

  /**
   * Pass True to exclude gifts that were assigned from the TON blockchain and
   * can't be resold or transferred in Telegram
   */
  exclude_from_blockchain?: boolean | undefined

  /**
   * Pass True to exclude unique gifts
   */
  exclude_unique?: boolean | undefined

  /**
   * Pass True to sort results by gift price instead of send date. Sorting is
   * applied before pagination.
   */
  sort_by_price?: boolean | undefined

  /**
   * Offset of the first entry to return as received from the previous request;
   * use an empty string to get the first chunk of results
   */
  offset?: string | undefined

  /**
   * The maximum number of gifts to be returned; 1-100. Defaults to 100.
   */
  limit?: number | undefined
}

/**
 * Parameters for `convertGiftToStars`.
 *
 * @see https://corefork.telegram.org/bots/api#convertgifttostars
 */
export interface ConvertGiftToStarsParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Unique identifier of the regular gift that should be converted to Telegram
   * Stars
   */
  owned_gift_id: string
}

/**
 * Parameters for `upgradeGift`.
 *
 * @see https://corefork.telegram.org/bots/api#upgradegift
 */
export interface UpgradeGiftParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Unique identifier of the regular gift that should be upgraded to a unique
   * one
   */
  owned_gift_id: string

  /**
   * Pass True to keep the original gift text, sender and receiver in the
   * upgraded gift
   */
  keep_original_details?: boolean | undefined

  /**
   * The amount of Telegram Stars that will be paid for the upgrade from the
   * business account balance. If gift.prepaid_upgrade_star_count > 0, then pass
   * 0, otherwise, the can_transfer_stars business bot right is required and
   * gift.upgrade_star_count must be passed.
   */
  star_count?: number | undefined
}

/**
 * Parameters for `transferGift`.
 *
 * @see https://corefork.telegram.org/bots/api#transfergift
 */
export interface TransferGiftParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Unique identifier of the regular gift that should be transferred
   */
  owned_gift_id: string

  /**
   * Unique identifier of the chat which will own the gift. The chat must be
   * active in the last 24 hours.
   */
  new_owner_chat_id: number

  /**
   * The amount of Telegram Stars that will be paid for the transfer from the
   * business account balance. If positive, then the can_transfer_stars business
   * bot right is required.
   */
  star_count?: number | undefined
}

/**
 * Parameters for `postStory`.
 *
 * @see https://corefork.telegram.org/bots/api#poststory
 */
export interface PostStoryParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Content of the story
   */
  content: InputStoryContent

  /**
   * Period after which the story is moved to the archive, in seconds; must be
   * one of 6 * 3600, 12 * 3600, 86400, or 2 * 86400
   */
  active_period: number

  /**
   * Caption of the story, 0-2048 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the story caption. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * A JSON-serialized list of clickable areas to be shown on the story
   */
  areas?: StoryArea[] | undefined

  /**
   * Pass True to keep the story accessible after it expires
   */
  post_to_chat_page?: boolean | undefined

  /**
   * Pass True if the content of the story must be protected from forwarding and
   * screenshotting
   */
  protect_content?: boolean | undefined
}

/**
 * Parameters for `repostStory`.
 *
 * @see https://corefork.telegram.org/bots/api#repoststory
 */
export interface RepostStoryParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Unique identifier of the chat which posted the story that should be reposted
   */
  from_chat_id: number

  /**
   * Unique identifier of the story that should be reposted
   */
  from_story_id: number

  /**
   * Period after which the story is moved to the archive, in seconds; must be
   * one of 6 * 3600, 12 * 3600, 86400, or 2 * 86400
   */
  active_period: number

  /**
   * Pass True to keep the story accessible after it expires
   */
  post_to_chat_page?: boolean | undefined

  /**
   * Pass True if the content of the story must be protected from forwarding and
   * screenshotting
   */
  protect_content?: boolean | undefined
}

/**
 * Parameters for `editStory`.
 *
 * @see https://corefork.telegram.org/bots/api#editstory
 */
export interface EditStoryParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Unique identifier of the story to edit
   */
  story_id: number

  /**
   * Content of the story
   */
  content: InputStoryContent

  /**
   * Caption of the story, 0-2048 characters after entities parsing
   */
  caption?: string | undefined

  /**
   * Mode for parsing entities in the story caption. See formatting options for
   * more details.
   */
  parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the caption, which
   * can be specified instead of parse_mode
   */
  caption_entities?: MessageEntity[] | undefined

  /**
   * A JSON-serialized list of clickable areas to be shown on the story
   */
  areas?: StoryArea[] | undefined
}

/**
 * Parameters for `deleteStory`.
 *
 * @see https://corefork.telegram.org/bots/api#deletestory
 */
export interface DeleteStoryParams {
  /**
   * Unique identifier of the business connection
   */
  business_connection_id: string

  /**
   * Unique identifier of the story to delete
   */
  story_id: number
}

/**
 * Parameters for `answerWebAppQuery`.
 *
 * @see https://corefork.telegram.org/bots/api#answerwebappquery
 */
export interface AnswerWebAppQueryParams {
  /**
   * Unique identifier for the query to be answered
   */
  web_app_query_id: string

  /**
   * A JSON-serialized object describing the message to be sent
   */
  result: InlineQueryResult
}

/**
 * Parameters for `savePreparedInlineMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#savepreparedinlinemessage
 */
export interface SavePreparedInlineMessageParams {
  /**
   * Unique identifier of the target user that can use the prepared message
   */
  user_id: number

  /**
   * A JSON-serialized object describing the message to be sent
   */
  result: InlineQueryResult

  /**
   * Pass True if the message can be sent to private chats with users
   */
  allow_user_chats?: boolean | undefined

  /**
   * Pass True if the message can be sent to private chats with bots
   */
  allow_bot_chats?: boolean | undefined

  /**
   * Pass True if the message can be sent to group and supergroup chats
   */
  allow_group_chats?: boolean | undefined

  /**
   * Pass True if the message can be sent to channel chats
   */
  allow_channel_chats?: boolean | undefined
}

/**
 * Parameters for `savePreparedKeyboardButton`.
 *
 * @see https://corefork.telegram.org/bots/api#savepreparedkeyboardbutton
 */
export interface SavePreparedKeyboardButtonParams {
  /**
   * Unique identifier of the target user that can use the button
   */
  user_id: number

  /**
   * A JSON-serialized object describing the button to be saved. The button must
   * be of the type request_users, request_chat, or request_managed_bot.
   */
  button: KeyboardButton
}
