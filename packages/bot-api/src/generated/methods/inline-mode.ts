// GENERATED FILE — do not edit.
// Bot API method parameters: Inline mode
// Source: Telegram Bot API 9.4, schemas/bot-api/9.4.json

import type { InlineQueryResult, InlineQueryResultsButton } from '../types/index.js'

/**
 * Parameters for `answerInlineQuery`.
 *
 * @see https://corefork.telegram.org/bots/api#answerinlinequery
 */
export interface AnswerInlineQueryParams {
  /**
   * Unique identifier for the answered query
   */
  inline_query_id: string

  /**
   * A JSON-serialized array of results for the inline query
   */
  results: InlineQueryResult[]

  /**
   * The maximum amount of time in seconds that the result of the inline query
   * may be cached on the server. Defaults to 300.
   */
  cache_time?: number | undefined

  /**
   * Pass True if results may be cached on the server side only for the user that
   * sent the query. By default, results may be returned to any user who sends
   * the same query.
   */
  is_personal?: boolean | undefined

  /**
   * Pass the offset that a client should send in the next query with the same
   * text to receive more results. Pass an empty string if there are no more
   * results or if you don't support pagination. Offset length can't exceed 64
   * bytes.
   */
  next_offset?: string | undefined

  /**
   * A JSON-serialized object describing a button to be shown above inline query
   * results
   */
  button?: InlineQueryResultsButton | undefined
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
