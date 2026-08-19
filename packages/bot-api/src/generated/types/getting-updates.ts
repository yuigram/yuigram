// GENERATED FILE — do not edit.
// Bot API types: Getting updates
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { BotSubscriptionUpdated, BusinessConnection, BusinessMessagesDeleted, CallbackQuery, ChatBoostRemoved, ChatBoostUpdated, ChatJoinRequest, ChatMemberUpdated, ManagedBotUpdated, Message, MessageReactionCountUpdated, MessageReactionUpdated, Poll, PollAnswer } from './available-types.js'
import type { ChosenInlineResult, InlineQuery } from './inline-mode.js'
import type { PaidMediaPurchased, PreCheckoutQuery, ShippingQuery } from './payments.js'

/**
 * This object represents an incoming update. At most one of the optional
 * fields can be present in any given update.
 *
 * @see https://corefork.telegram.org/bots/api#update
 */
export interface Update {
  /**
   * The update's unique identifier. Update identifiers start from a certain
   * positive number and increase sequentially. This identifier becomes
   * especially handy if you're using webhooks, since it allows you to ignore
   * repeated updates or to restore the correct update sequence, should they get
   * out of order. If there are no new updates for at least a week, then
   * identifier of the next update will be chosen randomly instead of
   * sequentially.
   */
  readonly update_id: number

  /**
   * New incoming message of any kind - text, photo, sticker, etc.
   */
  readonly message?: Message | undefined

  /**
   * New version of a message that is known to the bot and was edited. This
   * update may at times be triggered by changes to message fields that are
   * either unavailable or not actively used by your bot.
   */
  readonly edited_message?: Message | undefined

  /**
   * New incoming channel post of any kind - text, photo, sticker, etc.
   */
  readonly channel_post?: Message | undefined

  /**
   * New version of a channel post that is known to the bot and was edited. This
   * update may at times be triggered by changes to message fields that are
   * either unavailable or not actively used by your bot.
   */
  readonly edited_channel_post?: Message | undefined

  /**
   * The bot was connected to or disconnected from a business account, or a user
   * edited an existing connection with the bot
   */
  readonly business_connection?: BusinessConnection | undefined

  /**
   * New message from a connected business account
   */
  readonly business_message?: Message | undefined

  /**
   * New version of a message from a connected business account
   */
  readonly edited_business_message?: Message | undefined

  /**
   * Messages were deleted from a connected business account
   */
  readonly deleted_business_messages?: BusinessMessagesDeleted | undefined

  /**
   * New guest message. The bot can use the field Message.guest_query_id and the
   * method answerGuestQuery to send a message in response.
   */
  readonly guest_message?: Message | undefined

  /**
   * A reaction to a message was changed by a user. The bot must be an
   * administrator in the chat and must explicitly specify "message_reaction" in
   * the list of allowed_updates to receive these updates. The update isn't
   * received for reactions set by bots.
   */
  readonly message_reaction?: MessageReactionUpdated | undefined

  /**
   * Reactions to a message with anonymous reactions were changed. The bot must
   * be an administrator in the chat and must explicitly specify
   * "message_reaction_count" in the list of allowed_updates to receive these
   * updates. The updates are grouped and can be sent with delay up to a few
   * minutes.
   */
  readonly message_reaction_count?: MessageReactionCountUpdated | undefined

  /**
   * New incoming inline query
   */
  readonly inline_query?: InlineQuery | undefined

  /**
   * The result of an inline query that was chosen by a user and sent to their
   * chat partner. Please see our documentation on the feedback collecting for
   * details on how to enable these updates for your bot.
   */
  readonly chosen_inline_result?: ChosenInlineResult | undefined

  /**
   * New incoming callback query
   */
  readonly callback_query?: CallbackQuery | undefined

  /**
   * New incoming shipping query. Only for invoices with flexible price.
   */
  readonly shipping_query?: ShippingQuery | undefined

  /**
   * New incoming pre-checkout query. Contains full information about checkout.
   */
  readonly pre_checkout_query?: PreCheckoutQuery | undefined

  /**
   * A user purchased paid media with a non-empty payload sent by the bot in a
   * non-channel chat
   */
  readonly purchased_paid_media?: PaidMediaPurchased | undefined

  /**
   * New poll state. Bots receive only updates about manually stopped polls and
   * polls, which are sent by the bot.
   */
  readonly poll?: Poll | undefined

  /**
   * A user changed their answer in a non-anonymous poll. Bots receive new votes
   * only in polls that were sent by the bot itself.
   */
  readonly poll_answer?: PollAnswer | undefined

  /**
   * The bot's chat member status was updated in a chat. For private chats, this
   * update is received only when the bot is blocked or unblocked by the user.
   */
  readonly my_chat_member?: ChatMemberUpdated | undefined

  /**
   * A chat member's status was updated in a chat. The bot must be an
   * administrator in the chat and must explicitly specify "chat_member" in the
   * list of allowed_updates to receive these updates.
   */
  readonly chat_member?: ChatMemberUpdated | undefined

  /**
   * A request to join the chat has been sent. The bot must have the
   * can_invite_users administrator right in the chat to receive these updates.
   */
  readonly chat_join_request?: ChatJoinRequest | undefined

  /**
   * A chat boost was added or changed. The bot must be an administrator in the
   * chat to receive these updates.
   */
  readonly chat_boost?: ChatBoostUpdated | undefined

  /**
   * A boost was removed from a chat. The bot must be an administrator in the
   * chat to receive these updates.
   */
  readonly removed_chat_boost?: ChatBoostRemoved | undefined

  /**
   * A new bot was created to be managed by the bot, or token or owner of a
   * managed bot was changed
   */
  readonly managed_bot?: ManagedBotUpdated | undefined

  /**
   * User payment subscription has changed
   */
  readonly subscription?: BotSubscriptionUpdated | undefined
}

/**
 * Describes the current status of a webhook.
 *
 * @see https://corefork.telegram.org/bots/api#webhookinfo
 */
export interface WebhookInfo {
  /**
   * Webhook URL, may be empty if webhook is not set up
   */
  readonly url: string

  /**
   * True, if a custom certificate was provided for webhook certificate checks
   */
  readonly has_custom_certificate: boolean

  /**
   * Number of updates awaiting delivery
   */
  readonly pending_update_count: number

  /**
   * Currently used webhook IP address
   */
  readonly ip_address?: string | undefined

  /**
   * Unix time for the most recent error that happened when trying to deliver an
   * update via webhook
   */
  readonly last_error_date?: number | undefined

  /**
   * Error message in human-readable format for the most recent error that
   * happened when trying to deliver an update via webhook
   */
  readonly last_error_message?: string | undefined

  /**
   * Unix time of the most recent error that happened when trying to synchronize
   * available updates with Telegram datacenters
   */
  readonly last_synchronization_error_date?: number | undefined

  /**
   * The maximum allowed number of simultaneous HTTPS connections to the webhook
   * for update delivery
   */
  readonly max_connections?: number | undefined

  /**
   * A list of update types the bot is subscribed to. Defaults to all update
   * types except chat_member, message_reaction, and message_reaction_count.
   */
  readonly allowed_updates?: string[] | undefined
}
