// GENERATED FILE — do not edit.
// Bot API method parameters: Games
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { InlineKeyboardMarkup, ReplyParameters } from '../types/index.js'

/**
 * Parameters for `sendGame`.
 *
 * @see https://corefork.telegram.org/bots/api#sendgame
 */
export interface SendGameParams {
  /**
   * Unique identifier of the business connection on behalf of which the message
   * will be sent
   */
  business_connection_id?: string | undefined

  /**
   * Unique identifier for the target chat or username of the target bot in the
   * format @username. Games can't be sent to channel direct messages chats and
   * channel chats.
   */
  chat_id: number | string

  /**
   * Unique identifier for the target message thread (topic) of a forum; for
   * forum supergroups and private chats of bots with forum topic mode enabled
   * only
   */
  message_thread_id?: number | undefined

  /**
   * Short name of the game, serves as the unique identifier for the game. Set up
   * your games via @BotFather.
   */
  game_short_name: string

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
   * A JSON-serialized object for an inline keyboard. If empty, one 'Play
   * game_title' button will be shown. If not empty, the first button must launch
   * the game.
   */
  reply_markup?: InlineKeyboardMarkup | undefined
}

/**
 * Parameters for `setGameScore`.
 *
 * @see https://corefork.telegram.org/bots/api#setgamescore
 */
export interface SetGameScoreParams {
  /**
   * User identifier
   */
  user_id: number

  /**
   * New score, must be non-negative
   */
  score: number

  /**
   * Pass True if the high score is allowed to decrease. This can be useful when
   * fixing mistakes or banning cheaters.
   */
  force?: boolean | undefined

  /**
   * Pass True if the game message should not be automatically edited to include
   * the current scoreboard
   */
  disable_edit_message?: boolean | undefined

  /**
   * Required if inline_message_id is not specified. Unique identifier for the
   * target chat.
   */
  chat_id?: number | undefined

  /**
   * Required if inline_message_id is not specified. Identifier of the sent
   * message.
   */
  message_id?: number | undefined

  /**
   * Required if chat_id and message_id are not specified. Identifier of the
   * inline message.
   */
  inline_message_id?: string | undefined
}

/**
 * Parameters for `getGameHighScores`.
 *
 * @see https://corefork.telegram.org/bots/api#getgamehighscores
 */
export interface GetGameHighScoresParams {
  /**
   * Target user id
   */
  user_id: number

  /**
   * Required if inline_message_id is not specified. Unique identifier for the
   * target chat.
   */
  chat_id?: number | undefined

  /**
   * Required if inline_message_id is not specified. Identifier of the sent
   * message.
   */
  message_id?: number | undefined

  /**
   * Required if chat_id and message_id are not specified. Identifier of the
   * inline message.
   */
  inline_message_id?: string | undefined
}
