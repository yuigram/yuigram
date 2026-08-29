// GENERATED FILE — do not edit.
// TL types for payments
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_b$ from './root/b.js'
import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_i$ from './root/i.js'
import type * as root_p$ from './root/p.js'
import type * as root_s$ from './root/s.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type * as root_w$ from './root/w.js'
import type { TlObject } from '../../../tl/object.js'

/** `payments.bankCardData#3e24e573` */
export interface BankCardData {
  readonly _: 'payments.bankCardData'
  readonly title: string
  readonly open_urls: readonly root_b$.TypeBankCardOpenUrl[]
}

/** `payments.checkCanSendGiftResultFail#d5e58274` */
export interface CheckCanSendGiftResultFail {
  readonly _: 'payments.checkCanSendGiftResultFail'
  readonly reason: root_t$.TypeTextWithEntities
}

/** `payments.checkCanSendGiftResultOk#374fa7ad` */
export interface CheckCanSendGiftResultOk {
  readonly _: 'payments.checkCanSendGiftResultOk'
}

/** `payments.checkedGiftCode#eb983f8f` */
export interface CheckedGiftCode {
  readonly _: 'payments.checkedGiftCode'
  readonly via_giveaway?: true
  readonly from_id?: root_p$.TypePeer
  readonly giveaway_msg_id?: number
  readonly to_id?: bigint
  readonly date: number
  readonly days: number
  readonly used_date?: number
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.connectedStarRefBots#98d5ea1d` */
export interface ConnectedStarRefBots {
  readonly _: 'payments.connectedStarRefBots'
  readonly count: number
  readonly connected_bots: readonly root_c$.TypeConnectedBotStarRef[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.exportedInvoice#aed0cbd9` */
export interface ExportedInvoice {
  readonly _: 'payments.exportedInvoice'
  readonly url: string
}

/** `payments.giveawayInfo#4367daa0` */
export interface GiveawayInfo {
  readonly _: 'payments.giveawayInfo'
  readonly participating?: true
  readonly preparing_results?: true
  readonly start_date: number
  readonly joined_too_early_date?: number
  readonly admin_disallowed_chat_id?: bigint
  readonly disallowed_country?: string
}

/** `payments.giveawayInfoResults#e175e66f` */
export interface GiveawayInfoResults {
  readonly _: 'payments.giveawayInfoResults'
  readonly winner?: true
  readonly refunded?: true
  readonly start_date: number
  readonly gift_code_slug?: string
  readonly stars_prize?: bigint
  readonly finish_date: number
  readonly winners_count: number
  readonly activated_count?: number
}

/** `payments.paymentForm#a0058751` */
export interface PaymentForm {
  readonly _: 'payments.paymentForm'
  readonly can_save_credentials?: true
  readonly password_missing?: true
  readonly form_id: bigint
  readonly bot_id: bigint
  readonly title: string
  readonly description: string
  readonly photo?: root_w$.TypeWebDocument
  readonly invoice: root_i$.TypeInvoice
  readonly provider_id: bigint
  readonly url: string
  readonly native_provider?: string
  readonly native_params?: root_d$.TypeDataJSON
  readonly additional_methods?: readonly root_p$.TypePaymentFormMethod[]
  readonly saved_info?: root_p$.TypePaymentRequestedInfo
  readonly saved_credentials?: readonly root_p$.TypePaymentSavedCredentials[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.paymentFormStarGift#b425cfe1` */
export interface PaymentFormStarGift {
  readonly _: 'payments.paymentFormStarGift'
  readonly form_id: bigint
  readonly invoice: root_i$.TypeInvoice
}

/** `payments.paymentFormStars#7bf6b15c` */
export interface PaymentFormStars {
  readonly _: 'payments.paymentFormStars'
  readonly form_id: bigint
  readonly bot_id: bigint
  readonly title: string
  readonly description: string
  readonly photo?: root_w$.TypeWebDocument
  readonly invoice: root_i$.TypeInvoice
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.paymentReceipt#70c4fe03` */
export interface PaymentReceipt {
  readonly _: 'payments.paymentReceipt'
  readonly date: number
  readonly bot_id: bigint
  readonly provider_id: bigint
  readonly title: string
  readonly description: string
  readonly photo?: root_w$.TypeWebDocument
  readonly invoice: root_i$.TypeInvoice
  readonly info?: root_p$.TypePaymentRequestedInfo
  readonly shipping?: root_s$.TypeShippingOption
  readonly tip_amount?: bigint
  readonly currency: string
  readonly total_amount: bigint
  readonly credentials_title: string
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.paymentReceiptStars#dabbf83a` */
export interface PaymentReceiptStars {
  readonly _: 'payments.paymentReceiptStars'
  readonly date: number
  readonly bot_id: bigint
  readonly title: string
  readonly description: string
  readonly photo?: root_w$.TypeWebDocument
  readonly invoice: root_i$.TypeInvoice
  readonly currency: string
  readonly total_amount: bigint
  readonly transaction_id: string
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.paymentResult#4e5f810d` */
export interface PaymentResult {
  readonly _: 'payments.paymentResult'
  readonly updates: root_u$.TypeUpdates
}

/** `payments.paymentVerificationNeeded#d8411139` */
export interface PaymentVerificationNeeded {
  readonly _: 'payments.paymentVerificationNeeded'
  readonly url: string
}

/** `payments.resaleStarGifts#947a12df` */
export interface ResaleStarGifts {
  readonly _: 'payments.resaleStarGifts'
  readonly count: number
  readonly gifts: readonly root_s$.TypeStarGift[]
  readonly next_offset?: string
  readonly attributes?: readonly root_s$.TypeStarGiftAttribute[]
  readonly attributes_hash?: bigint
  readonly chats: readonly root_c$.TypeChat[]
  readonly counters?: readonly root_s$.TypeStarGiftAttributeCounter[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.savedInfo#fb8fe43c` */
export interface SavedInfo {
  readonly _: 'payments.savedInfo'
  readonly has_saved_credentials?: true
  readonly saved_info?: root_p$.TypePaymentRequestedInfo
}

/** `payments.savedStarGifts#95f389b1` */
export interface SavedStarGifts {
  readonly _: 'payments.savedStarGifts'
  readonly count: number
  readonly chat_notifications_enabled?: boolean
  readonly gifts: readonly root_s$.TypeSavedStarGift[]
  readonly next_offset?: string
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.starGiftActiveAuctions#aef6abbc` */
export interface StarGiftActiveAuctions {
  readonly _: 'payments.starGiftActiveAuctions'
  readonly auctions: readonly root_s$.TypeStarGiftActiveAuctionState[]
  readonly users: readonly root_u$.TypeUser[]
  readonly chats: readonly root_c$.TypeChat[]
}

/** `payments.starGiftActiveAuctionsNotModified#db33dad0` */
export interface StarGiftActiveAuctionsNotModified {
  readonly _: 'payments.starGiftActiveAuctionsNotModified'
}

/** `payments.starGiftAuctionAcquiredGifts#7d5bd1f0` */
export interface StarGiftAuctionAcquiredGifts {
  readonly _: 'payments.starGiftAuctionAcquiredGifts'
  readonly gifts: readonly root_s$.TypeStarGiftAuctionAcquiredGift[]
  readonly users: readonly root_u$.TypeUser[]
  readonly chats: readonly root_c$.TypeChat[]
}

/** `payments.starGiftAuctionState#6b39f4ec` */
export interface StarGiftAuctionState {
  readonly _: 'payments.starGiftAuctionState'
  readonly gift: root_s$.TypeStarGift
  readonly state: root_s$.TypeStarGiftAuctionState
  readonly user_state: root_s$.TypeStarGiftAuctionUserState
  readonly timeout: number
  readonly users: readonly root_u$.TypeUser[]
  readonly chats: readonly root_c$.TypeChat[]
}

/** `payments.starGiftCollections#8a2932f3` */
export interface StarGiftCollections {
  readonly _: 'payments.starGiftCollections'
  readonly collections: readonly root_s$.TypeStarGiftCollection[]
}

/** `payments.starGiftCollectionsNotModified#a0ba4f17` */
export interface StarGiftCollectionsNotModified {
  readonly _: 'payments.starGiftCollectionsNotModified'
}

/** `payments.starGiftUpgradeAttributes#46c6e36f` */
export interface StarGiftUpgradeAttributes {
  readonly _: 'payments.starGiftUpgradeAttributes'
  readonly attributes: readonly root_s$.TypeStarGiftAttribute[]
}

/** `payments.starGiftUpgradePreview#3de1dfed` */
export interface StarGiftUpgradePreview {
  readonly _: 'payments.starGiftUpgradePreview'
  readonly sample_attributes: readonly root_s$.TypeStarGiftAttribute[]
  readonly prices: readonly root_s$.TypeStarGiftUpgradePrice[]
  readonly next_prices: readonly root_s$.TypeStarGiftUpgradePrice[]
}

/** `payments.starGiftWithdrawalUrl#84aa3a9c` */
export interface StarGiftWithdrawalUrl {
  readonly _: 'payments.starGiftWithdrawalUrl'
  readonly url: string
}

/** `payments.starGifts#2ed82995` */
export interface StarGifts {
  readonly _: 'payments.starGifts'
  readonly hash: number
  readonly gifts: readonly root_s$.TypeStarGift[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.starGiftsNotModified#a388a368` */
export interface StarGiftsNotModified {
  readonly _: 'payments.starGiftsNotModified'
}

/** `payments.starsRevenueAdsAccountUrl#394e7f21` */
export interface StarsRevenueAdsAccountUrl {
  readonly _: 'payments.starsRevenueAdsAccountUrl'
  readonly url: string
}

/** `payments.starsRevenueStats#6c207376` */
export interface StarsRevenueStats {
  readonly _: 'payments.starsRevenueStats'
  readonly top_hours_graph?: root_s$.TypeStatsGraph
  readonly revenue_graph: root_s$.TypeStatsGraph
  readonly status: root_s$.TypeStarsRevenueStatus
  readonly usd_rate: number
}

/** `payments.starsRevenueWithdrawalUrl#1dab80b7` */
export interface StarsRevenueWithdrawalUrl {
  readonly _: 'payments.starsRevenueWithdrawalUrl'
  readonly url: string
}

/** `payments.starsStatus#6c9ce8ed` */
export interface StarsStatus {
  readonly _: 'payments.starsStatus'
  readonly balance: root_s$.TypeStarsAmount
  readonly subscriptions?: readonly root_s$.TypeStarsSubscription[]
  readonly subscriptions_next_offset?: string
  readonly subscriptions_missing_balance?: bigint
  readonly history?: readonly root_s$.TypeStarsTransaction[]
  readonly next_offset?: string
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.suggestedStarRefBots#b4d5d859` */
export interface SuggestedStarRefBots {
  readonly _: 'payments.suggestedStarRefBots'
  readonly count: number
  readonly suggested_bots: readonly root_s$.TypeStarRefProgram[]
  readonly users: readonly root_u$.TypeUser[]
  readonly next_offset?: string
}

/** Any `payments.BankCardData`. */
export type TypeBankCardData =
  | BankCardData

/** Any `payments.CheckCanSendGiftResult`. */
export type TypeCheckCanSendGiftResult =
  | CheckCanSendGiftResultFail
  | CheckCanSendGiftResultOk

/** Any `payments.CheckedGiftCode`. */
export type TypeCheckedGiftCode =
  | CheckedGiftCode

/** Any `payments.ConnectedStarRefBots`. */
export type TypeConnectedStarRefBots =
  | ConnectedStarRefBots

/** Any `payments.ExportedInvoice`. */
export type TypeExportedInvoice =
  | ExportedInvoice

/** Any `payments.GiveawayInfo`. */
export type TypeGiveawayInfo =
  | GiveawayInfo
  | GiveawayInfoResults

/** Any `payments.PaymentForm`. */
export type TypePaymentForm =
  | PaymentForm
  | PaymentFormStarGift
  | PaymentFormStars

/** Any `payments.PaymentReceipt`. */
export type TypePaymentReceipt =
  | PaymentReceipt
  | PaymentReceiptStars

/** Any `payments.PaymentResult`. */
export type TypePaymentResult =
  | PaymentResult
  | PaymentVerificationNeeded

/** Any `payments.ResaleStarGifts`. */
export type TypeResaleStarGifts =
  | ResaleStarGifts

/** Any `payments.SavedInfo`. */
export type TypeSavedInfo =
  | SavedInfo

/** Any `payments.SavedStarGifts`. */
export type TypeSavedStarGifts =
  | SavedStarGifts

/** Any `payments.StarGiftActiveAuctions`. */
export type TypeStarGiftActiveAuctions =
  | StarGiftActiveAuctions
  | StarGiftActiveAuctionsNotModified

/** Any `payments.StarGiftAuctionAcquiredGifts`. */
export type TypeStarGiftAuctionAcquiredGifts =
  | StarGiftAuctionAcquiredGifts

/** Any `payments.StarGiftAuctionState`. */
export type TypeStarGiftAuctionState =
  | StarGiftAuctionState

/** Any `payments.StarGiftCollections`. */
export type TypeStarGiftCollections =
  | StarGiftCollections
  | StarGiftCollectionsNotModified

/** Any `payments.StarGiftUpgradeAttributes`. */
export type TypeStarGiftUpgradeAttributes =
  | StarGiftUpgradeAttributes

/** Any `payments.StarGiftUpgradePreview`. */
export type TypeStarGiftUpgradePreview =
  | StarGiftUpgradePreview

/** Any `payments.StarGiftWithdrawalUrl`. */
export type TypeStarGiftWithdrawalUrl =
  | StarGiftWithdrawalUrl

/** Any `payments.StarGifts`. */
export type TypeStarGifts =
  | StarGifts
  | StarGiftsNotModified

/** Any `payments.StarsRevenueAdsAccountUrl`. */
export type TypeStarsRevenueAdsAccountUrl =
  | StarsRevenueAdsAccountUrl

/** Any `payments.StarsRevenueStats`. */
export type TypeStarsRevenueStats =
  | StarsRevenueStats

/** Any `payments.StarsRevenueWithdrawalUrl`. */
export type TypeStarsRevenueWithdrawalUrl =
  | StarsRevenueWithdrawalUrl

/** Any `payments.StarsStatus`. */
export type TypeStarsStatus =
  | StarsStatus

/** Any `payments.SuggestedStarRefBots`. */
export type TypeSuggestedStarRefBots =
  | SuggestedStarRefBots

/** Any `payments.UniqueStarGift`. */
export type TypeUniqueStarGift =
  | UniqueStarGift

/** Any `payments.UniqueStarGiftValueInfo`. */
export type TypeUniqueStarGiftValueInfo =
  | UniqueStarGiftValueInfo

/** Any `payments.ValidatedRequestedInfo`. */
export type TypeValidatedRequestedInfo =
  | ValidatedRequestedInfo

/** `payments.uniqueStarGift#416c56e8` */
export interface UniqueStarGift {
  readonly _: 'payments.uniqueStarGift'
  readonly gift: root_s$.TypeStarGift
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.uniqueStarGiftValueInfo#512fe446` */
export interface UniqueStarGiftValueInfo {
  readonly _: 'payments.uniqueStarGiftValueInfo'
  readonly last_sale_on_fragment?: true
  readonly value_is_average?: true
  readonly currency: string
  readonly value: bigint
  readonly initial_sale_date: number
  readonly initial_sale_stars: bigint
  readonly initial_sale_price: bigint
  readonly last_sale_date?: number
  readonly last_sale_price?: bigint
  readonly floor_price?: bigint
  readonly average_price?: bigint
  readonly listed_count?: number
  readonly fragment_listed_count?: number
  readonly fragment_listed_url?: string
}

/** `payments.validatedRequestedInfo#d1451883` */
export interface ValidatedRequestedInfo {
  readonly _: 'payments.validatedRequestedInfo'
  readonly id?: string
  readonly shipping_options?: readonly root_s$.TypeShippingOption[]
}
