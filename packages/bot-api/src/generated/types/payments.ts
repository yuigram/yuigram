// GENERATED FILE — do not edit.
// Bot API types: Payments
// Source: Telegram Bot API 10.3, schemas/bot-api/10.3.json
// The code is licensed under MIT (see LICENSE). Descriptions are quoted from
// Telegram's Bot API documentation, which that licence does not cover.

import type { Chat, Gift, PaidMedia, User } from './available-types.js'

/**
 * This object represents a portion of the price for goods or services.
 *
 * @see https://corefork.telegram.org/bots/api#labeledprice
 */
export interface LabeledPrice {
  /**
   * Portion label, non-empty
   */
  readonly label: string

  /**
   * Price of the product in the smallest units of the currency (integer, not
   * float/double). For example, for a price of US$ 1.45 pass amount = 145. See
   * the exp parameter in currencies.json, it shows the number of digits past the
   * decimal point for each currency (2 for the majority of currencies).
   */
  readonly amount: number
}

/**
 * This object contains basic information about an invoice.
 *
 * @see https://corefork.telegram.org/bots/api#invoice
 */
export interface Invoice {
  /**
   * Product name
   */
  readonly title: string

  /**
   * Product description
   */
  readonly description: string

  /**
   * Unique bot deep-linking parameter that can be used to generate this invoice
   */
  readonly start_parameter: string

  /**
   * Three-letter ISO 4217 currency code, or "XTR" for payments in Telegram Stars
   */
  readonly currency: string

  /**
   * Total price in the smallest units of the currency (integer, not
   * float/double). For example, for a price of US$ 1.45 pass amount = 145. See
   * the exp parameter in currencies.json, it shows the number of digits past the
   * decimal point for each currency (2 for the majority of currencies).
   */
  readonly total_amount: number
}

/**
 * This object represents a shipping address.
 *
 * @see https://corefork.telegram.org/bots/api#shippingaddress
 */
export interface ShippingAddress {
  /**
   * Two-letter ISO 3166-1 alpha-2 country code
   */
  readonly country_code: string

  /**
   * State, if applicable
   */
  readonly state: string

  /**
   * City
   */
  readonly city: string

  /**
   * First line for the address
   */
  readonly street_line1: string

  /**
   * Second line for the address
   */
  readonly street_line2: string

  /**
   * Address post code
   */
  readonly post_code: string
}

/**
 * This object represents information about an order.
 *
 * @see https://corefork.telegram.org/bots/api#orderinfo
 */
export interface OrderInfo {
  /**
   * User name
   */
  readonly name?: string | undefined

  /**
   * User's phone number
   */
  readonly phone_number?: string | undefined

  /**
   * User email
   */
  readonly email?: string | undefined

  /**
   * User shipping address
   */
  readonly shipping_address?: ShippingAddress | undefined
}

/**
 * This object represents one shipping option.
 *
 * @see https://corefork.telegram.org/bots/api#shippingoption
 */
export interface ShippingOption {
  /**
   * Shipping option identifier, non-empty
   */
  readonly id: string

  /**
   * Option title, non-empty
   */
  readonly title: string

  /**
   * List of price portions
   */
  readonly prices: LabeledPrice[]
}

/**
 * This object contains basic information about a successful payment. Note that
 * if the buyer initiates a chargeback with the relevant payment provider
 * following this transaction, the funds may be debited from your balance. This
 * is outside of Telegram's control.
 *
 * @see https://corefork.telegram.org/bots/api#successfulpayment
 */
export interface SuccessfulPayment {
  /**
   * Three-letter ISO 4217 currency code, or "XTR" for payments in Telegram Stars
   */
  readonly currency: string

  /**
   * Total price in the smallest units of the currency (integer, not
   * float/double). For example, for a price of US$ 1.45 pass amount = 145. See
   * the exp parameter in currencies.json, it shows the number of digits past the
   * decimal point for each currency (2 for the majority of currencies).
   */
  readonly total_amount: number

  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload: string

  /**
   * Identifier of the shipping option chosen by the user
   */
  readonly shipping_option_id?: string | undefined

  /**
   * Order information provided by the user
   */
  readonly order_info?: OrderInfo | undefined

  /**
   * Telegram payment identifier
   */
  readonly telegram_payment_charge_id: string

  /**
   * Provider payment identifier
   */
  readonly provider_payment_charge_id: string

  /**
   * True, if the payment is a recurring payment for a subscription
   */
  readonly is_recurring?: true | undefined

  /**
   * True, if the payment is the first payment for a subscription
   */
  readonly is_first_recurring?: true | undefined

  /**
   * Expiration date of the subscription, in Unix time; for recurring payments
   * only
   */
  readonly subscription_expiration_date?: number | undefined
}

/**
 * This object contains basic information about a refunded payment.
 *
 * @see https://corefork.telegram.org/bots/api#refundedpayment
 */
export interface RefundedPayment {
  /**
   * Three-letter ISO 4217 currency code, or "XTR" for payments in Telegram
   * Stars. Currently, always "XTR".
   */
  readonly currency: string

  /**
   * Total refunded price in the smallest units of the currency (integer, not
   * float/double). For example, for a price of US$ 1.45, total_amount = 145. See
   * the exp parameter in currencies.json, it shows the number of digits past the
   * decimal point for each currency (2 for the majority of currencies).
   */
  readonly total_amount: number

  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload: string

  /**
   * Telegram payment identifier
   */
  readonly telegram_payment_charge_id: string

  /**
   * Provider payment identifier
   */
  readonly provider_payment_charge_id?: string | undefined
}

/**
 * This object contains information about an incoming shipping query.
 *
 * @see https://corefork.telegram.org/bots/api#shippingquery
 */
export interface ShippingQuery {
  /**
   * Unique query identifier
   */
  readonly id: string

  /**
   * User who sent the query
   */
  readonly from: User

  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload: string

  /**
   * User specified shipping address
   */
  readonly shipping_address: ShippingAddress
}

/**
 * This object contains information about an incoming pre-checkout query.
 *
 * @see https://corefork.telegram.org/bots/api#precheckoutquery
 */
export interface PreCheckoutQuery {
  /**
   * Unique query identifier
   */
  readonly id: string

  /**
   * User who sent the query
   */
  readonly from: User

  /**
   * Three-letter ISO 4217 currency code, or "XTR" for payments in Telegram Stars
   */
  readonly currency: string

  /**
   * Total price in the smallest units of the currency (integer, not
   * float/double). For example, for a price of US$ 1.45 pass amount = 145. See
   * the exp parameter in currencies.json, it shows the number of digits past the
   * decimal point for each currency (2 for the majority of currencies).
   */
  readonly total_amount: number

  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload: string

  /**
   * Identifier of the shipping option chosen by the user
   */
  readonly shipping_option_id?: string | undefined

  /**
   * Order information provided by the user
   */
  readonly order_info?: OrderInfo | undefined
}

/**
 * This object contains information about a paid media purchase.
 *
 * @see https://corefork.telegram.org/bots/api#paidmediapurchased
 */
export interface PaidMediaPurchased {
  /**
   * User who purchased the media
   */
  readonly from: User

  /**
   * Bot-specified paid media payload
   */
  readonly paid_media_payload: string
}

/**
 * This object describes the state of a revenue withdrawal operation.
 * Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#revenuewithdrawalstate
 */
export type RevenueWithdrawalState =
  | RevenueWithdrawalStateFailed
  | RevenueWithdrawalStatePending
  | RevenueWithdrawalStateSucceeded

/**
 * The withdrawal is in progress.
 *
 * @see https://corefork.telegram.org/bots/api#revenuewithdrawalstatepending
 */
export interface RevenueWithdrawalStatePending {
  /**
   * Type of the state, always "pending"
   */
  readonly type: string
}

/**
 * The withdrawal succeeded.
 *
 * @see https://corefork.telegram.org/bots/api#revenuewithdrawalstatesucceeded
 */
export interface RevenueWithdrawalStateSucceeded {
  /**
   * Type of the state, always "succeeded"
   */
  readonly type: string

  /**
   * Date the withdrawal was completed in Unix time
   */
  readonly date: number

  /**
   * An HTTPS URL that can be used to see transaction details
   */
  readonly url: string
}

/**
 * The withdrawal failed and the transaction was refunded.
 *
 * @see https://corefork.telegram.org/bots/api#revenuewithdrawalstatefailed
 */
export interface RevenueWithdrawalStateFailed {
  /**
   * Type of the state, always "failed"
   */
  readonly type: string
}

/**
 * Contains information about the affiliate that received a commission via this
 * transaction.
 *
 * @see https://corefork.telegram.org/bots/api#affiliateinfo
 */
export interface AffiliateInfo {
  /**
   * The bot or the user that received an affiliate commission if it was received
   * by a bot or a user
   */
  readonly affiliate_user?: User | undefined

  /**
   * The chat that received an affiliate commission if it was received by a chat
   */
  readonly affiliate_chat?: Chat | undefined

  /**
   * The number of Telegram Stars received by the affiliate for each 1000
   * Telegram Stars received by the bot from referred users
   */
  readonly commission_per_mille: number

  /**
   * Integer amount of Telegram Stars received by the affiliate from the
   * transaction, rounded to 0; can be negative for refunds
   */
  readonly amount: number

  /**
   * The number of 1/1000000000 shares of Telegram Stars received by the
   * affiliate, from -999999999 to 999999999; can be negative for refunds
   */
  readonly nanostar_amount?: number | undefined
}

/**
 * This object describes the source of a transaction, or its recipient for
 * outgoing transactions. Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#transactionpartner
 */
export type TransactionPartner =
  | TransactionTypeAffiliateProgramCommission
  | TransactionTypeBotInvoiceSale
  | TransactionTypeBotPaidMediaSale
  | TransactionTypeBotSubscriptionSale
  | TransactionTypeBusinessBotTransferReceive
  | TransactionTypeFragmentDeposit
  | TransactionTypeFragmentWithdrawal
  | TransactionTypeGiftPurchase
  | TransactionTypePremiumPurchase
  | TransactionTypeTelegramAdsWithdrawal
  | TransactionTypeTelegramApiUsage
  | TransactionTypeUnsupported

/**
 * Describes a deposit of Telegram Stars from Fragment.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypefragmentdeposit
 */
export interface TransactionTypeFragmentDeposit {
  /**
   * Type of the transaction partner, always "fragment"
   */
  readonly type: string
}

/**
 * Describes a withdrawal of Telegram Stars to Fragment.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypefragmentwithdrawal
 */
export interface TransactionTypeFragmentWithdrawal {
  /**
   * Type of the transaction partner, always "fragment"
   */
  readonly type: string

  /**
   * State of the transaction if the transaction is outgoing
   */
  readonly withdrawal_state?: RevenueWithdrawalState | undefined
}

/**
 * Describes a purchase of paid media by a user.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypebotpaidmediasale
 */
export interface TransactionTypeBotPaidMediaSale {
  /**
   * Type of the transaction, always "paid_media_payment"
   */
  readonly transaction_type: string

  /**
   * Type of the transaction partner, always "user"
   */
  readonly type: string

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * Information about the paid media bought by the user
   */
  readonly paid_media: PaidMedia[]

  /**
   * Bot-specified paid media payload
   */
  readonly paid_media_payload?: string | undefined

  /**
   * Information about the affiliate that received a commission via this
   * transaction
   */
  readonly affiliate?: AffiliateInfo | undefined
}

/**
 * Describes a payment by a user for an invoice.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypebotinvoicesale
 */
export interface TransactionTypeBotInvoiceSale {
  /**
   * Type of the transaction, always "invoice_payment"
   */
  readonly transaction_type: string

  /**
   * Type of the transaction partner, always "user"
   */
  readonly type: string

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload?: string | undefined

  /**
   * Information about the affiliate that received a commission via this
   * transaction
   */
  readonly affiliate?: AffiliateInfo | undefined
}

/**
 * Describes a payment by a user for a subscription.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypebotsubscriptionsale
 */
export interface TransactionTypeBotSubscriptionSale {
  /**
   * Type of the transaction, always "invoice_payment"
   */
  readonly transaction_type: string

  /**
   * Type of the transaction partner, always "user"
   */
  readonly type: string

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload?: string | undefined

  /**
   * The duration of the paid subscription
   */
  readonly subscription_period?: number | undefined

  /**
   * Information about the affiliate that received a commission via this
   * transaction
   */
  readonly affiliate?: AffiliateInfo | undefined
}

/**
 * Describes a withdrawal of Telegram Stars to the Telegram Ads platform.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypetelegramadswithdrawal
 */
export interface TransactionTypeTelegramAdsWithdrawal {
  /**
   * Type of the transaction partner, always "telegram_ads"
   */
  readonly type: string
}

/**
 * Describes a payment for paid broadcasting.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypetelegramapiusage
 */
export interface TransactionTypeTelegramApiUsage {
  /**
   * Type of the transaction partner, always "telegram_api"
   */
  readonly type: string

  /**
   * The number of successful requests that exceeded regular limits and were
   * therefore billed
   */
  readonly request_count: number
}

/**
 * Describes a gift that the bot bought and sent to a user or a chat.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypegiftpurchase
 */
export interface TransactionTypeGiftPurchase {
  /**
   * Type of the transaction, always "gift_purchase"
   */
  readonly transaction_type?: string | undefined

  /**
   * Type of the transaction partner, currently can be "user" or "chat"
   */
  readonly type: string

  /**
   * Information about the user
   */
  readonly user?: User | undefined

  /**
   * Information about the chat
   */
  readonly chat?: Chat | undefined

  /**
   * The gift that the bot bought and sent
   */
  readonly gift: Gift
}

/**
 * Describes a Telegram Premium subscription gifted by the bot to a user.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypepremiumpurchase
 */
export interface TransactionTypePremiumPurchase {
  /**
   * Type of the transaction, always "premium_purchase"
   */
  readonly transaction_type: string

  /**
   * Type of the transaction partner, always "user"
   */
  readonly type: string

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * Number of months the gifted Telegram Premium subscription will be active for
   */
  readonly premium_subscription_duration: number
}

/**
 * Describes a direct transfer of Telegram Stars from a managed business
 * account.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypebusinessbottransferreceive
 */
export interface TransactionTypeBusinessBotTransferReceive {
  /**
   * Type of the transaction, always "business_account_transfer"
   */
  readonly transaction_type: string

  /**
   * Type of the transaction partner, always "user"
   */
  readonly type: string

  /**
   * Information about the user
   */
  readonly user: User
}

/**
 * Describes an affiliate commission received from an affiliate program.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypeaffiliateprogramcommission
 */
export interface TransactionTypeAffiliateProgramCommission {
  /**
   * Type of the transaction partner, always "affiliate_program"
   */
  readonly type: string

  /**
   * Information about the bot that sponsored the affiliate program
   */
  readonly sponsor_user?: User | undefined

  /**
   * The number of Telegram Stars received by the bot for each 1000 Telegram
   * Stars received by the affiliate program sponsor from referred users
   */
  readonly commission_per_mille: number
}

/**
 * Describes a transaction of an unknown type.
 *
 * @see https://corefork.telegram.org/bots/api#transactiontypeunsupported
 */
export interface TransactionTypeUnsupported {
  /**
   * Type of the transaction partner, always "other"
   */
  readonly type: string
}

/**
 * Describes a Telegram Star transaction. Note that if the buyer initiates a
 * chargeback with the payment provider from whom they acquired Stars (e.g.,
 * Apple, Google) following this transaction, the refunded Stars will be
 * deducted from the bot's balance. This is outside of Telegram's control.
 *
 * @see https://corefork.telegram.org/bots/api#startransaction
 */
export interface StarTransaction {
  /**
   * Unique identifier of the transaction. Coincides with the identifier of the
   * original transaction for refund transactions. Coincides with
   * SuccessfulPayment.telegram_payment_charge_id for successful incoming
   * payments from users.
   */
  readonly id: string

  /**
   * Date the transaction was created in Unix time
   */
  readonly date: number

  /**
   * Source of an incoming transaction (e.g., a user purchasing goods or
   * services, Fragment refunding a failed withdrawal). Only for incoming
   * transactions.
   */
  readonly source?: TransactionPartner | undefined

  /**
   * Receiver of an outgoing transaction (e.g., a user for a purchase refund,
   * Fragment for a withdrawal). Only for outgoing transactions.
   */
  readonly receiver?: TransactionPartner | undefined

  /**
   * Integer amount of Telegram Stars transferred by the transaction
   */
  readonly amount: number

  /**
   * The number of 1/1000000000 shares of Telegram Stars transferred by the
   * transaction, 0-999999999
   */
  readonly nanostar_amount?: number | undefined
}

/**
 * Contains a list of Telegram Star transactions.
 *
 * @see https://corefork.telegram.org/bots/api#startransactions
 */
export interface StarTransactions {
  /**
   * The list of transactions
   */
  readonly transactions: StarTransaction[]
}
