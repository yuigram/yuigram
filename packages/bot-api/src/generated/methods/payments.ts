// GENERATED FILE — do not edit.
// Bot API method parameters: Payments
// Source: Telegram Bot API 10.3, schemas/bot-api/10.3.json

import type { InlineKeyboardMarkup, LabeledPrice, ReplyParameters, ShippingOption, SuggestedPostParameters } from '../types/index.js'

/**
 * Parameters for `sendInvoice`.
 *
 * @see https://corefork.telegram.org/bots/api#sendinvoice
 */
export interface SendInvoiceParams {
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
   * Product name, 1-32 characters
   */
  title: string

  /**
   * Product description, 1-255 characters
   */
  description: string

  /**
   * Bot-defined invoice payload, 1-128 bytes. This will not be displayed to the
   * user, use it for your internal processes.
   */
  payload: string

  /**
   * Payment provider token, obtained via @BotFather. Pass an empty string for
   * payments in Telegram Stars.
   */
  provider_token?: string | undefined

  /**
   * Three-letter ISO 4217 currency code, see more on currencies. Pass “XTR” for
   * payments in Telegram Stars.
   */
  currency: string

  /**
   * Price breakdown, a JSON-serialized list of components (e.g. product price,
   * tax, discount, delivery cost, delivery tax, bonus, etc.). Must contain
   * exactly one item for payments in Telegram Stars.
   */
  prices: LabeledPrice[]

  /**
   * The maximum accepted amount for tips in the smallest units of the currency
   * (integer, not float/double). For example, for a maximum tip of US$ 1.45 pass
   * max_tip_amount = 145. See the exp parameter in currencies.json, it shows the
   * number of digits past the decimal point for each currency (2 for the
   * majority of currencies). Defaults to 0. Not supported for payments in
   * Telegram Stars.
   */
  max_tip_amount?: number | undefined

  /**
   * A JSON-serialized Array of suggested amounts of tips in the smallest units
   * of the currency (integer, not float/double). At most 4 suggested tip amounts
   * can be specified. The suggested tip amounts must be positive, passed in a
   * strictly increased order and must not exceed max_tip_amount.
   */
  suggested_tip_amounts?: number[] | undefined

  /**
   * Unique deep-linking parameter. If left empty, forwarded copies of the sent
   * message will have a Pay button, allowing multiple users to pay directly from
   * the forwarded message, using the same invoice. If non-empty, forwarded
   * copies of the sent message will have a URL button with a deep link to the
   * bot (instead of a Pay button), with the value used as the start parameter.
   */
  start_parameter?: string | undefined

  /**
   * JSON-serialized data about the invoice, which will be shared with the
   * payment provider. A detailed description of required fields should be
   * provided by the payment provider.
   */
  provider_data?: string | undefined

  /**
   * URL of the product photo for the invoice. Can be a photo of the goods or a
   * marketing image for a service. People like it better when they see what they
   * are paying for.
   */
  photo_url?: string | undefined

  /**
   * Photo size in bytes
   */
  photo_size?: number | undefined

  /**
   * Photo width
   */
  photo_width?: number | undefined

  /**
   * Photo height
   */
  photo_height?: number | undefined

  /**
   * Pass True if you require the user's full name to complete the order. Ignored
   * for payments in Telegram Stars.
   */
  need_name?: boolean | undefined

  /**
   * Pass True if you require the user's phone number to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  need_phone_number?: boolean | undefined

  /**
   * Pass True if you require the user's email address to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  need_email?: boolean | undefined

  /**
   * Pass True if you require the user's shipping address to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  need_shipping_address?: boolean | undefined

  /**
   * Pass True if the user's phone number should be sent to the provider. Ignored
   * for payments in Telegram Stars.
   */
  send_phone_number_to_provider?: boolean | undefined

  /**
   * Pass True if the user's email address should be sent to the provider.
   * Ignored for payments in Telegram Stars.
   */
  send_email_to_provider?: boolean | undefined

  /**
   * Pass True if the final price depends on the shipping method. Ignored for
   * payments in Telegram Stars.
   */
  is_flexible?: boolean | undefined

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
   * A JSON-serialized object for an inline keyboard. If empty, one 'Pay total
   * price' button will be shown. If not empty, the first button must be a Pay
   * button.
   */
  reply_markup?: InlineKeyboardMarkup | undefined
}

/**
 * Parameters for `createInvoiceLink`.
 *
 * @see https://corefork.telegram.org/bots/api#createinvoicelink
 */
export interface CreateInvoiceLinkParams {
  /**
   * Unique identifier of the business connection on behalf of which the link
   * will be created. For payments in Telegram Stars only.
   */
  business_connection_id?: string | undefined

  /**
   * Product name, 1-32 characters
   */
  title: string

  /**
   * Product description, 1-255 characters
   */
  description: string

  /**
   * Bot-defined invoice payload, 1-128 bytes. This will not be displayed to the
   * user, use it for your internal processes.
   */
  payload: string

  /**
   * Payment provider token, obtained via @BotFather. Pass an empty string for
   * payments in Telegram Stars.
   */
  provider_token?: string | undefined

  /**
   * Three-letter ISO 4217 currency code, see more on currencies. Pass “XTR” for
   * payments in Telegram Stars.
   */
  currency: string

  /**
   * Price breakdown, a JSON-serialized list of components (e.g. product price,
   * tax, discount, delivery cost, delivery tax, bonus, etc.). Must contain
   * exactly one item for payments in Telegram Stars.
   */
  prices: LabeledPrice[]

  /**
   * The number of seconds the subscription will be active for before the next
   * payment. The currency must be set to “XTR” (Telegram Stars) if the parameter
   * is used. Currently, it must always be 2592000 (30 days) if specified. Any
   * number of subscriptions can be active for a given bot at the same time,
   * including multiple concurrent subscriptions from the same user. Subscription
   * price must no exceed 10000 Telegram Stars.
   */
  subscription_period?: number | undefined

  /**
   * The maximum accepted amount for tips in the smallest units of the currency
   * (integer, not float/double). For example, for a maximum tip of US$ 1.45 pass
   * max_tip_amount = 145. See the exp parameter in currencies.json, it shows the
   * number of digits past the decimal point for each currency (2 for the
   * majority of currencies). Defaults to 0. Not supported for payments in
   * Telegram Stars.
   */
  max_tip_amount?: number | undefined

  /**
   * A JSON-serialized Array of suggested amounts of tips in the smallest units
   * of the currency (integer, not float/double). At most 4 suggested tip amounts
   * can be specified. The suggested tip amounts must be positive, passed in a
   * strictly increased order and must not exceed max_tip_amount.
   */
  suggested_tip_amounts?: number[] | undefined

  /**
   * JSON-serialized data about the invoice, which will be shared with the
   * payment provider. A detailed description of required fields should be
   * provided by the payment provider.
   */
  provider_data?: string | undefined

  /**
   * URL of the product photo for the invoice. Can be a photo of the goods or a
   * marketing image for a service.
   */
  photo_url?: string | undefined

  /**
   * Photo size in bytes
   */
  photo_size?: number | undefined

  /**
   * Photo width
   */
  photo_width?: number | undefined

  /**
   * Photo height
   */
  photo_height?: number | undefined

  /**
   * Pass True if you require the user's full name to complete the order. Ignored
   * for payments in Telegram Stars.
   */
  need_name?: boolean | undefined

  /**
   * Pass True if you require the user's phone number to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  need_phone_number?: boolean | undefined

  /**
   * Pass True if you require the user's email address to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  need_email?: boolean | undefined

  /**
   * Pass True if you require the user's shipping address to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  need_shipping_address?: boolean | undefined

  /**
   * Pass True if the user's phone number should be sent to the provider. Ignored
   * for payments in Telegram Stars.
   */
  send_phone_number_to_provider?: boolean | undefined

  /**
   * Pass True if the user's email address should be sent to the provider.
   * Ignored for payments in Telegram Stars.
   */
  send_email_to_provider?: boolean | undefined

  /**
   * Pass True if the final price depends on the shipping method. Ignored for
   * payments in Telegram Stars.
   */
  is_flexible?: boolean | undefined
}

/**
 * Parameters for `answerShippingQuery`.
 *
 * @see https://corefork.telegram.org/bots/api#answershippingquery
 */
export interface AnswerShippingQueryParams {
  /**
   * Unique identifier for the query to be answered
   */
  shipping_query_id: string

  /**
   * Pass True if delivery to the specified address is possible and False if
   * there are any problems (for example, if delivery to the specified address is
   * not possible)
   */
  ok: boolean

  /**
   * Required if ok is True. A JSON-serialized Array of available shipping
   * options.
   */
  shipping_options?: ShippingOption[] | undefined

  /**
   * Required if ok is False. Error message in human readable form that explains
   * why it is impossible to complete the order (e.g. “Sorry, delivery to your
   * desired address is unavailable”). Telegram will display this message to the
   * user.
   */
  error_message?: string | undefined
}

/**
 * Parameters for `answerPreCheckoutQuery`.
 *
 * @see https://corefork.telegram.org/bots/api#answerprecheckoutquery
 */
export interface AnswerPreCheckoutQueryParams {
  /**
   * Unique identifier for the query to be answered
   */
  pre_checkout_query_id: string

  /**
   * Specify True if everything is alright (goods are available, etc.) and the
   * bot is ready to proceed with the order. Use False if there are any problems.
   */
  ok: boolean

  /**
   * Required if ok is False. Error message in human readable form that explains
   * the reason for failure to proceed with the checkout (e.g. "Sorry, somebody
   * just bought the last of our amazing black T-shirts while you were busy
   * filling out your payment details. Please choose a different color or
   * garment!"). Telegram will display this message to the user.
   */
  error_message?: string | undefined
}

/**
 * Parameters for `getMyStarBalance`.
 *
 * @see https://corefork.telegram.org/bots/api#getmystarbalance
 */
// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters
export interface GetMyStarBalanceParams {}

/**
 * Parameters for `getStarTransactions`.
 *
 * @see https://corefork.telegram.org/bots/api#getstartransactions
 */
export interface GetStarTransactionsParams {
  /**
   * Number of transactions to skip in the response
   */
  offset?: number | undefined

  /**
   * The maximum number of transactions to be retrieved. Values between 1-100 are
   * accepted. Defaults to 100.
   */
  limit?: number | undefined
}

/**
 * Parameters for `refundStarPayment`.
 *
 * @see https://corefork.telegram.org/bots/api#refundstarpayment
 */
export interface RefundStarPaymentParams {
  /**
   * Identifier of the user whose payment will be refunded
   */
  user_id: number

  /**
   * Telegram payment identifier
   */
  telegram_payment_charge_id: string
}

/**
 * Parameters for `editUserStarSubscription`.
 *
 * @see https://corefork.telegram.org/bots/api#edituserstarsubscription
 */
export interface EditUserStarSubscriptionParams {
  /**
   * Identifier of the user whose subscription will be edited
   */
  user_id: number

  /**
   * Telegram payment identifier for the subscription
   */
  telegram_payment_charge_id: string

  /**
   * Pass True to cancel extension of the user subscription; the subscription
   * must be active up to the end of the current subscription period. Pass False
   * to allow the user to re-enable a subscription that was previously canceled
   * by the bot.
   */
  is_canceled: boolean
}
