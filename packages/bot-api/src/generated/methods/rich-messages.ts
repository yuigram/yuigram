// GENERATED FILE — do not edit.
// Bot API method parameters: Rich messages
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { ForceReply, InlineKeyboardMarkup, InputRichMessage, ReplyKeyboardMarkup, ReplyKeyboardRemove, ReplyParameters, SuggestedPostParameters } from '../types/index.js'

/**
 * Parameters for `sendRichMessage`.
 *
 * @see https://corefork.telegram.org/bots/api#sendrichmessage
 */
export interface SendRichMessageParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be sent. Bot can send rich messages on behalf of a business account
   * only if the corresponding user can send rich messages.
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
   * The message to be sent
   */
  rich_message: InputRichMessage

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
 * Parameters for `sendRichMessageDraft`.
 *
 * @see https://corefork.telegram.org/bots/api#sendrichmessagedraft
 */
export interface SendRichMessageDraftParams {
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
   * The partial message to be streamed. Direct upload of new files isn't
   * supported.
   */
  rich_message: InputRichMessage
}
