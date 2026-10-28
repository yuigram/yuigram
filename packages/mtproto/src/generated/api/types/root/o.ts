// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 232, schemas/tl/api.232.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlObject } from '../../../../tl/object.js'

/** `onrampAvailability#f9c84973` */
export interface OnrampAvailability {
  readonly _: 'onrampAvailability'
  readonly allowed?: true
  readonly buy_allowed?: true
  readonly country_code: string
  readonly state?: string
  readonly methods: readonly TypeOnrampMethodAvailability[]
}

/** `onrampLimits#7be2677e` */
export interface OnrampLimits {
  readonly _: 'onrampLimits'
  readonly base_currency: string
  readonly base_min_amount: string
  readonly base_max_amount: string
  readonly crypto_min_amount: string
  readonly crypto_max_amount: string
  readonly payment_method: string
}

/** `onrampMethodAvailability#9ec8c6a8` */
export interface OnrampMethodAvailability {
  readonly _: 'onrampMethodAvailability'
  readonly available?: true
  readonly payment_method: string
}

/** `onrampProviderInfo#0dc27582` */
export interface OnrampProviderInfo {
  readonly _: 'onrampProviderInfo'
  readonly supports_base_currencies?: true
  readonly supports_limits?: true
  readonly supports_quote?: true
  readonly id: string
  readonly name: string
  readonly crypto_currencies: readonly string[]
}

/** `onrampQuote#7a8011e9` */
export interface OnrampQuote {
  readonly _: 'onrampQuote'
  readonly base_currency: string
  readonly base_amount: string
  readonly crypto_currency: string
  readonly crypto_amount: string
  readonly crypto_price: string
  readonly fee_amount: string
  readonly extra_fee_amount: string
  readonly network_fee_amount: string
  readonly total_amount: string
  readonly payment_method: string
  readonly expires_date: number
}

/** `onrampSession#d1e42e24` */
export interface OnrampSession {
  readonly _: 'onrampSession'
  readonly provider: string
  readonly session_id: string
  readonly url: string
  readonly expires_date: number
}

/** `outboxReadDate#3bb842ac` */
export interface OutboxReadDate {
  readonly _: 'outboxReadDate'
  readonly date: number
}

/** Any `OnrampAvailability`. */
export type TypeOnrampAvailability =
  | OnrampAvailability

/** Any `OnrampLimits`. */
export type TypeOnrampLimits =
  | OnrampLimits

/** Any `OnrampMethodAvailability`. */
export type TypeOnrampMethodAvailability =
  | OnrampMethodAvailability

/** Any `OnrampProviderInfo`. */
export type TypeOnrampProviderInfo =
  | OnrampProviderInfo

/** Any `OnrampQuote`. */
export type TypeOnrampQuote =
  | OnrampQuote

/** Any `OnrampSession`. */
export type TypeOnrampSession =
  | OnrampSession

/** Any `OutboxReadDate`. */
export type TypeOutboxReadDate =
  | OutboxReadDate
