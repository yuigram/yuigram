// GENERATED FILE — do not edit.
// Bot API method parameters: Getting updates
// Source: Telegram Bot API 10.3, schemas/bot-api/10.3.json

import type { InputFile } from '../../input-file.js'

/**
 * Parameters for `getUpdates`.
 *
 * @see https://corefork.telegram.org/bots/api#getupdates
 */
export interface GetUpdatesParams {
  /**
   * Identifier of the first update to be returned. Must be greater by one than
   * the highest among the identifiers of previously received updates. By
   * default, updates starting with the earliest unconfirmed update are returned.
   * An update is considered confirmed as soon as getUpdates is called with an
   * offset higher than its update_id. The negative offset can be specified to
   * retrieve updates starting from -offset update from the end of the updates
   * queue. All previous updates will be forgotten.
   */
  offset?: number | undefined

  /**
   * Limits the number of updates to be retrieved. Values between 1-100 are
   * accepted. Defaults to 100.
   */
  limit?: number | undefined

  /**
   * Timeout in seconds for long polling. Defaults to 0, i.e. usual short
   * polling. Should be positive, short polling should be used for testing
   * purposes only.
   */
  timeout?: number | undefined

  /**
   * A JSON-serialized list of the update types you want your bot to receive. For
   * example, specify ["message", "edited_channel_post", "callback_query"] to
   * only receive updates of these types. See Update for a complete list of
   * available update types. Specify an empty list to receive all update types
   * except chat_member, message_reaction, and message_reaction_count (default).
   * If not specified, the previous setting will be used. Please note that this
   * parameter doesn't affect updates created before the call to getUpdates, so
   * unwanted updates may be received for a short period of time.
   */
  allowed_updates?: string[] | undefined
}

/**
 * Parameters for `setWebhook`.
 *
 * @see https://corefork.telegram.org/bots/api#setwebhook
 */
export interface SetWebhookParams {
  /**
   * HTTPS URL to send updates to. Use an empty string to remove webhook
   * integration.
   */
  url: string

  /**
   * Upload your public key certificate so that the root certificate in use can
   * be checked. See our self-signed guide for details.
   */
  certificate?: InputFile | undefined

  /**
   * The fixed IP address which will be used to send webhook requests instead of
   * the IP address resolved through DNS
   */
  ip_address?: string | undefined

  /**
   * The maximum allowed number of simultaneous HTTPS connections to the webhook
   * for update delivery, 1-100. Defaults to 40. Use lower values to limit the
   * load on your bot's server, and higher values to increase your bot's
   * throughput.
   */
  max_connections?: number | undefined

  /**
   * A JSON-serialized list of the update types you want your bot to receive. For
   * example, specify ["message", "edited_channel_post", "callback_query"] to
   * only receive updates of these types. See Update for a complete list of
   * available update types. Specify an empty list to receive all update types
   * except chat_member, message_reaction, and message_reaction_count (default).
   * If not specified, the previous setting will be used. Please note that this
   * parameter doesn't affect updates created before the call to the setWebhook,
   * so unwanted updates may be received for a short period of time.
   */
  allowed_updates?: string[] | undefined

  /**
   * Pass True to drop all pending updates
   */
  drop_pending_updates?: boolean | undefined

  /**
   * A secret token to be sent in a header “X-Telegram-Bot-Api-Secret-Token” in
   * every webhook request, 1-256 characters. Only characters A-Z, a-z, 0-9, _
   * and - are allowed. The header is useful to ensure that the request comes
   * from a webhook set by you.
   */
  secret_token?: string | undefined
}

/**
 * Parameters for `deleteWebhook`.
 *
 * @see https://corefork.telegram.org/bots/api#deletewebhook
 */
export interface DeleteWebhookParams {
  /**
   * Pass True to drop all pending updates
   */
  drop_pending_updates?: boolean | undefined
}

/**
 * Parameters for `getWebhookInfo`.
 *
 * @see https://corefork.telegram.org/bots/api#getwebhookinfo
 */
// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters
export interface GetWebhookInfoParams {}
