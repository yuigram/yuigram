// GENERATED FILE — do not edit.
// TL types for payments
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

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

/** `payments.applyGiftCode#f6e26854` */
export interface ApplyGiftCode {
  readonly _: 'payments.applyGiftCode'
  readonly slug: string
}

/** `payments.assignAppStoreTransaction#80ed747d` */
export interface AssignAppStoreTransaction {
  readonly _: 'payments.assignAppStoreTransaction'
  readonly receipt: Uint8Array
  readonly purpose: root_i$.TypeInputStorePaymentPurpose
}

/** `payments.assignPlayMarketTransaction#dffd50d3` */
export interface AssignPlayMarketTransaction {
  readonly _: 'payments.assignPlayMarketTransaction'
  readonly receipt: root_d$.TypeDataJSON
  readonly purpose: root_i$.TypeInputStorePaymentPurpose
}

/** `payments.bankCardData#3e24e573` */
export interface BankCardData {
  readonly _: 'payments.bankCardData'
  readonly title: string
  readonly open_urls: readonly root_b$.TypeBankCardOpenUrl[]
}

/** `payments.botCancelStarsSubscription#6dfa0622` */
export interface BotCancelStarsSubscription {
  readonly _: 'payments.botCancelStarsSubscription'
  readonly restore?: true
  readonly user_id: root_i$.TypeInputUser
  readonly charge_id: string
}

/** `payments.canPurchaseStore#4fdc5ea7` */
export interface CanPurchaseStore {
  readonly _: 'payments.canPurchaseStore'
  readonly purpose: root_i$.TypeInputStorePaymentPurpose
}

/** `payments.changeStarsSubscription#c7770878` */
export interface ChangeStarsSubscription {
  readonly _: 'payments.changeStarsSubscription'
  readonly peer: root_i$.TypeInputPeer
  readonly subscription_id: string
  readonly canceled?: boolean
}

/** `payments.checkCanSendGift#c0c4edc9` */
export interface CheckCanSendGift {
  readonly _: 'payments.checkCanSendGift'
  readonly gift_id: bigint
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

/** `payments.checkGiftCode#8e51b4c1` */
export interface CheckGiftCode {
  readonly _: 'payments.checkGiftCode'
  readonly slug: string
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

/** `payments.clearSavedInfo#d83d70c1` */
export interface ClearSavedInfo {
  readonly _: 'payments.clearSavedInfo'
  readonly credentials?: true
  readonly info?: true
}

/** `payments.connectStarRefBot#7ed5348a` */
export interface ConnectStarRefBot {
  readonly _: 'payments.connectStarRefBot'
  readonly peer: root_i$.TypeInputPeer
  readonly bot: root_i$.TypeInputUser
}

/** `payments.connectedStarRefBots#98d5ea1d` */
export interface ConnectedStarRefBots {
  readonly _: 'payments.connectedStarRefBots'
  readonly count: number
  readonly connected_bots: readonly root_c$.TypeConnectedBotStarRef[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `payments.convertStarGift#74bf076b` */
export interface ConvertStarGift {
  readonly _: 'payments.convertStarGift'
  readonly stargift: root_i$.TypeInputSavedStarGift
}

/** `payments.craftStarGift#b0f9684f` */
export interface CraftStarGift {
  readonly _: 'payments.craftStarGift'
  readonly stargift: readonly root_i$.TypeInputSavedStarGift[]
}

/** `payments.createStarGiftCollection#1f4a0e87` */
export interface CreateStarGiftCollection {
  readonly _: 'payments.createStarGiftCollection'
  readonly peer: root_i$.TypeInputPeer
  readonly title: string
  readonly stargift: readonly root_i$.TypeInputSavedStarGift[]
}

/** `payments.deleteStarGiftCollection#ad5648e8` */
export interface DeleteStarGiftCollection {
  readonly _: 'payments.deleteStarGiftCollection'
  readonly peer: root_i$.TypeInputPeer
  readonly collection_id: number
}

/** `payments.editConnectedStarRefBot#e4fca4a3` */
export interface EditConnectedStarRefBot {
  readonly _: 'payments.editConnectedStarRefBot'
  readonly revoked?: true
  readonly peer: root_i$.TypeInputPeer
  readonly link: string
}

/** `payments.exportInvoice#0f91b065` */
export interface ExportInvoice {
  readonly _: 'payments.exportInvoice'
  readonly invoice_media: root_i$.TypeInputMedia
}

/** `payments.exportedInvoice#aed0cbd9` */
export interface ExportedInvoice {
  readonly _: 'payments.exportedInvoice'
  readonly url: string
}

/** `payments.fulfillStarsSubscription#cc5bebb3` */
export interface FulfillStarsSubscription {
  readonly _: 'payments.fulfillStarsSubscription'
  readonly peer: root_i$.TypeInputPeer
  readonly subscription_id: string
}

/** `payments.getBankCardData#2e79d779` */
export interface GetBankCardData {
  readonly _: 'payments.getBankCardData'
  readonly number: string
}

/** `payments.getConnectedStarRefBot#b7d998f0` */
export interface GetConnectedStarRefBot {
  readonly _: 'payments.getConnectedStarRefBot'
  readonly peer: root_i$.TypeInputPeer
  readonly bot: root_i$.TypeInputUser
}

/** `payments.getConnectedStarRefBots#5869a553` */
export interface GetConnectedStarRefBots {
  readonly _: 'payments.getConnectedStarRefBots'
  readonly peer: root_i$.TypeInputPeer
  readonly offset_date?: number
  readonly offset_link?: string
  readonly limit: number
}

/** `payments.getCraftStarGifts#fd05dd00` */
export interface GetCraftStarGifts {
  readonly _: 'payments.getCraftStarGifts'
  readonly gift_id: bigint
  readonly offset: string
  readonly limit: number
}

/** `payments.getGiveawayInfo#f4239425` */
export interface GetGiveawayInfo {
  readonly _: 'payments.getGiveawayInfo'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
}

/** `payments.getPaymentForm#37148dbb` */
export interface GetPaymentForm {
  readonly _: 'payments.getPaymentForm'
  readonly invoice: root_i$.TypeInputInvoice
  readonly theme_params?: root_d$.TypeDataJSON
}

/** `payments.getPaymentReceipt#2478d1cc` */
export interface GetPaymentReceipt {
  readonly _: 'payments.getPaymentReceipt'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
}

/** `payments.getPremiumGiftCodeOptions#2757ba54` */
export interface GetPremiumGiftCodeOptions {
  readonly _: 'payments.getPremiumGiftCodeOptions'
  readonly boost_peer?: root_i$.TypeInputPeer
}

/** `payments.getResaleStarGifts#7a5fa236` */
export interface GetResaleStarGifts {
  readonly _: 'payments.getResaleStarGifts'
  readonly sort_by_price?: true
  readonly sort_by_num?: true
  readonly for_craft?: true
  readonly stars_only?: true
  readonly attributes_hash?: bigint
  readonly gift_id: bigint
  readonly attributes?: readonly root_s$.TypeStarGiftAttributeId[]
  readonly offset: string
  readonly limit: number
}

/** `payments.getSavedInfo#227d824b` */
export interface GetSavedInfo {
  readonly _: 'payments.getSavedInfo'
}

/** `payments.getSavedStarGift#b455a106` */
export interface GetSavedStarGift {
  readonly _: 'payments.getSavedStarGift'
  readonly stargift: readonly root_i$.TypeInputSavedStarGift[]
}

/** `payments.getSavedStarGifts#a319e569` */
export interface GetSavedStarGifts {
  readonly _: 'payments.getSavedStarGifts'
  readonly exclude_unsaved?: true
  readonly exclude_saved?: true
  readonly exclude_unlimited?: true
  readonly exclude_unique?: true
  readonly sort_by_value?: true
  readonly exclude_upgradable?: true
  readonly exclude_unupgradable?: true
  readonly peer_color_available?: true
  readonly exclude_hosted?: true
  readonly peer: root_i$.TypeInputPeer
  readonly collection_id?: number
  readonly offset: string
  readonly limit: number
}

/** `payments.getStarGiftActiveAuctions#a5d0514d` */
export interface GetStarGiftActiveAuctions {
  readonly _: 'payments.getStarGiftActiveAuctions'
  readonly hash: bigint
}

/** `payments.getStarGiftAuctionAcquiredGifts#6ba2cbec` */
export interface GetStarGiftAuctionAcquiredGifts {
  readonly _: 'payments.getStarGiftAuctionAcquiredGifts'
  readonly gift_id: bigint
}

/** `payments.getStarGiftAuctionState#5c9ff4d6` */
export interface GetStarGiftAuctionState {
  readonly _: 'payments.getStarGiftAuctionState'
  readonly auction: root_i$.TypeInputStarGiftAuction
  readonly version: number
}

/** `payments.getStarGiftCollections#981b91dd` */
export interface GetStarGiftCollections {
  readonly _: 'payments.getStarGiftCollections'
  readonly peer: root_i$.TypeInputPeer
  readonly hash: bigint
}

/** `payments.getStarGiftUpgradeAttributes#6d038b58` */
export interface GetStarGiftUpgradeAttributes {
  readonly _: 'payments.getStarGiftUpgradeAttributes'
  readonly gift_id: bigint
}

/** `payments.getStarGiftUpgradePreview#9c9abcb1` */
export interface GetStarGiftUpgradePreview {
  readonly _: 'payments.getStarGiftUpgradePreview'
  readonly gift_id: bigint
}

/** `payments.getStarGiftWithdrawalUrl#d06e93a8` */
export interface GetStarGiftWithdrawalUrl {
  readonly _: 'payments.getStarGiftWithdrawalUrl'
  readonly stargift: root_i$.TypeInputSavedStarGift
  readonly password: root_i$.TypeInputCheckPasswordSRP
}

/** `payments.getStarGifts#c4563590` */
export interface GetStarGifts {
  readonly _: 'payments.getStarGifts'
  readonly hash: number
}

/** `payments.getStarsGiftOptions#d3c96bc8` */
export interface GetStarsGiftOptions {
  readonly _: 'payments.getStarsGiftOptions'
  readonly user_id?: root_i$.TypeInputUser
}

/** `payments.getStarsGiveawayOptions#bd1efd3e` */
export interface GetStarsGiveawayOptions {
  readonly _: 'payments.getStarsGiveawayOptions'
}

/** `payments.getStarsRevenueAdsAccountUrl#d1d7efc5` */
export interface GetStarsRevenueAdsAccountUrl {
  readonly _: 'payments.getStarsRevenueAdsAccountUrl'
  readonly peer: root_i$.TypeInputPeer
}

/** `payments.getStarsRevenueStats#d91ffad6` */
export interface GetStarsRevenueStats {
  readonly _: 'payments.getStarsRevenueStats'
  readonly dark?: true
  readonly ton?: true
  readonly peer: root_i$.TypeInputPeer
}

/** `payments.getStarsRevenueWithdrawalUrl#2433dc92` */
export interface GetStarsRevenueWithdrawalUrl {
  readonly _: 'payments.getStarsRevenueWithdrawalUrl'
  readonly ton?: true
  readonly peer: root_i$.TypeInputPeer
  readonly amount?: bigint
  readonly password: root_i$.TypeInputCheckPasswordSRP
}

/** `payments.getStarsStatus#4ea9b3bf` */
export interface GetStarsStatus {
  readonly _: 'payments.getStarsStatus'
  readonly ton?: true
  readonly peer: root_i$.TypeInputPeer
}

/** `payments.getStarsSubscriptions#032512c5` */
export interface GetStarsSubscriptions {
  readonly _: 'payments.getStarsSubscriptions'
  readonly missing_balance?: true
  readonly peer: root_i$.TypeInputPeer
  readonly offset: string
}

/** `payments.getStarsTopupOptions#c00ec7d3` */
export interface GetStarsTopupOptions {
  readonly _: 'payments.getStarsTopupOptions'
}

/** `payments.getStarsTransactions#69da4557` */
export interface GetStarsTransactions {
  readonly _: 'payments.getStarsTransactions'
  readonly inbound?: true
  readonly outbound?: true
  readonly ascending?: true
  readonly ton?: true
  readonly subscription_id?: string
  readonly peer: root_i$.TypeInputPeer
  readonly offset: string
  readonly limit: number
}

/** `payments.getStarsTransactionsByID#2dca16b8` */
export interface GetStarsTransactionsByID {
  readonly _: 'payments.getStarsTransactionsByID'
  readonly ton?: true
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly root_i$.TypeInputStarsTransaction[]
}

/** `payments.getSuggestedStarRefBots#0d6b48f7` */
export interface GetSuggestedStarRefBots {
  readonly _: 'payments.getSuggestedStarRefBots'
  readonly order_by_revenue?: true
  readonly order_by_date?: true
  readonly peer: root_i$.TypeInputPeer
  readonly offset: string
  readonly limit: number
}

/** `payments.getUniqueStarGift#a1974d72` */
export interface GetUniqueStarGift {
  readonly _: 'payments.getUniqueStarGift'
  readonly slug: string
}

/** `payments.getUniqueStarGiftValueInfo#4365af6b` */
export interface GetUniqueStarGiftValueInfo {
  readonly _: 'payments.getUniqueStarGiftValueInfo'
  readonly slug: string
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

/** `payments.launchPrepaidGiveaway#5ff58f20` */
export interface LaunchPrepaidGiveaway {
  readonly _: 'payments.launchPrepaidGiveaway'
  readonly peer: root_i$.TypeInputPeer
  readonly giveaway_id: bigint
  readonly purpose: root_i$.TypeInputStorePaymentPurpose
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

/** `payments.refundStarsCharge#25ae8f4a` */
export interface RefundStarsCharge {
  readonly _: 'payments.refundStarsCharge'
  readonly user_id: root_i$.TypeInputUser
  readonly charge_id: string
}

/** `payments.reorderStarGiftCollections#c32af4cc` */
export interface ReorderStarGiftCollections {
  readonly _: 'payments.reorderStarGiftCollections'
  readonly peer: root_i$.TypeInputPeer
  readonly order: readonly number[]
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

/** `payments.resolveStarGiftOffer#e9ce781c` */
export interface ResolveStarGiftOffer {
  readonly _: 'payments.resolveStarGiftOffer'
  readonly decline?: true
  readonly offer_msg_id: number
}

/** `payments.saveStarGift#2a2a697c` */
export interface SaveStarGift {
  readonly _: 'payments.saveStarGift'
  readonly unsave?: true
  readonly stargift: root_i$.TypeInputSavedStarGift
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

/** `payments.sendPaymentForm#2d03522f` */
export interface SendPaymentForm {
  readonly _: 'payments.sendPaymentForm'
  readonly form_id: bigint
  readonly invoice: root_i$.TypeInputInvoice
  readonly requested_info_id?: string
  readonly shipping_option_id?: string
  readonly credentials: root_i$.TypeInputPaymentCredentials
  readonly tip_amount?: bigint
}

/** `payments.sendStarGiftOffer#8fb86b41` */
export interface SendStarGiftOffer {
  readonly _: 'payments.sendStarGiftOffer'
  readonly peer: root_i$.TypeInputPeer
  readonly slug: string
  readonly price: root_s$.TypeStarsAmount
  readonly duration: number
  readonly random_id: bigint
  readonly allow_paid_stars?: bigint
}

/** `payments.sendStarsForm#7998c914` */
export interface SendStarsForm {
  readonly _: 'payments.sendStarsForm'
  readonly form_id: bigint
  readonly invoice: root_i$.TypeInputInvoice
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

/** `payments.toggleChatStarGiftNotifications#60eaefa1` */
export interface ToggleChatStarGiftNotifications {
  readonly _: 'payments.toggleChatStarGiftNotifications'
  readonly enabled?: true
  readonly peer: root_i$.TypeInputPeer
}

/** `payments.toggleStarGiftsPinnedToTop#1513e7b0` */
export interface ToggleStarGiftsPinnedToTop {
  readonly _: 'payments.toggleStarGiftsPinnedToTop'
  readonly peer: root_i$.TypeInputPeer
  readonly stargift: readonly root_i$.TypeInputSavedStarGift[]
}

/** `payments.transferStarGift#7f18176a` */
export interface TransferStarGift {
  readonly _: 'payments.transferStarGift'
  readonly stargift: root_i$.TypeInputSavedStarGift
  readonly to_id: root_i$.TypeInputPeer
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

/** `payments.updateStarGiftCollection#4fddbee7` */
export interface UpdateStarGiftCollection {
  readonly _: 'payments.updateStarGiftCollection'
  readonly peer: root_i$.TypeInputPeer
  readonly collection_id: number
  readonly title?: string
  readonly delete_stargift?: readonly root_i$.TypeInputSavedStarGift[]
  readonly add_stargift?: readonly root_i$.TypeInputSavedStarGift[]
  readonly order?: readonly root_i$.TypeInputSavedStarGift[]
}

/** `payments.updateStarGiftPrice#edbe6ccb` */
export interface UpdateStarGiftPrice {
  readonly _: 'payments.updateStarGiftPrice'
  readonly stargift: root_i$.TypeInputSavedStarGift
  readonly resell_amount: root_s$.TypeStarsAmount
}

/** `payments.upgradeStarGift#aed6e4f5` */
export interface UpgradeStarGift {
  readonly _: 'payments.upgradeStarGift'
  readonly keep_original_details?: true
  readonly stargift: root_i$.TypeInputSavedStarGift
}

/** `payments.validateRequestedInfo#b6c8f12b` */
export interface ValidateRequestedInfo {
  readonly _: 'payments.validateRequestedInfo'
  readonly save?: true
  readonly invoice: root_i$.TypeInputInvoice
  readonly info: root_p$.TypePaymentRequestedInfo
}

/** `payments.validatedRequestedInfo#d1451883` */
export interface ValidatedRequestedInfo {
  readonly _: 'payments.validatedRequestedInfo'
  readonly id?: string
  readonly shipping_options?: readonly root_s$.TypeShippingOption[]
}
