// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_a$ from '../root/a.js'
import type * as root_d$ from '../root/d.js'
import type * as root_i$ from '../root/i.js'
import type * as root_l$ from '../root/l.js'
import type * as root_m$ from '../root/m.js'
import type * as root_p$ from '../root/p.js'
import type * as root_r$ from '../root/r.js'
import type * as root_t$ from '../root/t.js'
import type * as root_w$ from '../root/w.js'
import type { TlObject } from '../../../../tl/object.js'

/** `savedDialog#bd87cb6c` */
export interface SavedDialog {
  readonly _: 'savedDialog'
  readonly pinned?: true
  readonly peer: root_p$.TypePeer
  readonly top_message: number
}

/** `savedPhoneContact#1142bd56` */
export interface SavedPhoneContact {
  readonly _: 'savedPhoneContact'
  readonly phone: string
  readonly first_name: string
  readonly last_name: string
  readonly date: number
}

/** `savedReactionTag#cb6ff828` */
export interface SavedReactionTag {
  readonly _: 'savedReactionTag'
  readonly reaction: root_r$.TypeReaction
  readonly title?: string
  readonly count: number
}

/** `savedStarGift#41df43fc` */
export interface SavedStarGift {
  readonly _: 'savedStarGift'
  readonly name_hidden?: true
  readonly unsaved?: true
  readonly refunded?: true
  readonly can_upgrade?: true
  readonly pinned_to_top?: true
  readonly upgrade_separate?: true
  readonly from_id?: root_p$.TypePeer
  readonly date: number
  readonly gift: TypeStarGift
  readonly message?: root_t$.TypeTextWithEntities
  readonly msg_id?: number
  readonly saved_id?: bigint
  readonly convert_stars?: bigint
  readonly upgrade_stars?: bigint
  readonly can_export_at?: number
  readonly transfer_stars?: bigint
  readonly can_transfer_at?: number
  readonly can_resell_at?: number
  readonly collection_id?: readonly number[]
  readonly prepaid_upgrade_hash?: string
  readonly drop_original_details_stars?: bigint
  readonly gift_num?: number
  readonly can_craft_at?: number
}

/** `searchPostsFlood#3e0b5b6a` */
export interface SearchPostsFlood {
  readonly _: 'searchPostsFlood'
  readonly query_is_free?: true
  readonly total_daily: number
  readonly remains: number
  readonly wait_till?: number
  readonly stars_amount: bigint
}

/** `searchResultPosition#7f648b67` */
export interface SearchResultPosition {
  readonly _: 'searchResultPosition'
  readonly msg_id: number
  readonly date: number
  readonly offset: number
}

/** `searchResultsCalendarPeriod#c9b0539f` */
export interface SearchResultsCalendarPeriod {
  readonly _: 'searchResultsCalendarPeriod'
  readonly date: number
  readonly min_msg_id: number
  readonly max_msg_id: number
  readonly count: number
}

/** `secureCredentialsEncrypted#33f0ea47` */
export interface SecureCredentialsEncrypted {
  readonly _: 'secureCredentialsEncrypted'
  readonly data: Uint8Array
  readonly hash: Uint8Array
  readonly secret: Uint8Array
}

/** `secureData#8aeabec3` */
export interface SecureData {
  readonly _: 'secureData'
  readonly data: Uint8Array
  readonly data_hash: Uint8Array
  readonly secret: Uint8Array
}

/** `secureFile#7d09c27e` */
export interface SecureFile {
  readonly _: 'secureFile'
  readonly id: bigint
  readonly access_hash: bigint
  readonly size: bigint
  readonly dc_id: number
  readonly date: number
  readonly file_hash: Uint8Array
  readonly secret: Uint8Array
}

/** `secureFileEmpty#64199744` */
export interface SecureFileEmpty {
  readonly _: 'secureFileEmpty'
}

/** `securePasswordKdfAlgoPBKDF2HMACSHA512iter100000#bbf2dda0` */
export interface SecurePasswordKdfAlgoPBKDF2HMACSHA512iter100000 {
  readonly _: 'securePasswordKdfAlgoPBKDF2HMACSHA512iter100000'
  readonly salt: Uint8Array
}

/** `securePasswordKdfAlgoSHA512#86471d92` */
export interface SecurePasswordKdfAlgoSHA512 {
  readonly _: 'securePasswordKdfAlgoSHA512'
  readonly salt: Uint8Array
}

/** `securePasswordKdfAlgoUnknown#004a8537` */
export interface SecurePasswordKdfAlgoUnknown {
  readonly _: 'securePasswordKdfAlgoUnknown'
}

/** `securePlainEmail#21ec5a5f` */
export interface SecurePlainEmail {
  readonly _: 'securePlainEmail'
  readonly email: string
}

/** `securePlainPhone#7d6099dd` */
export interface SecurePlainPhone {
  readonly _: 'securePlainPhone'
  readonly phone: string
}

/** `secureRequiredType#829d99da` */
export interface SecureRequiredType {
  readonly _: 'secureRequiredType'
  readonly native_names?: true
  readonly selfie_required?: true
  readonly translation_required?: true
  readonly type: TypeSecureValueType
}

/** `secureRequiredTypeOneOf#027477b4` */
export interface SecureRequiredTypeOneOf {
  readonly _: 'secureRequiredTypeOneOf'
  readonly types: readonly TypeSecureRequiredType[]
}

/** `secureSecretSettings#1527bcac` */
export interface SecureSecretSettings {
  readonly _: 'secureSecretSettings'
  readonly secure_algo: TypeSecurePasswordKdfAlgo
  readonly secure_secret: Uint8Array
  readonly secure_secret_id: bigint
}

/** `secureValue#187fa0ca` */
export interface SecureValue {
  readonly _: 'secureValue'
  readonly type: TypeSecureValueType
  readonly data?: TypeSecureData
  readonly front_side?: TypeSecureFile
  readonly reverse_side?: TypeSecureFile
  readonly selfie?: TypeSecureFile
  readonly translation?: readonly TypeSecureFile[]
  readonly files?: readonly TypeSecureFile[]
  readonly plain_data?: TypeSecurePlainData
  readonly hash: Uint8Array
}

/** `secureValueError#869d758f` */
export interface SecureValueError {
  readonly _: 'secureValueError'
  readonly type: TypeSecureValueType
  readonly hash: Uint8Array
  readonly text: string
}

/** `secureValueErrorData#e8a40bd9` */
export interface SecureValueErrorData {
  readonly _: 'secureValueErrorData'
  readonly type: TypeSecureValueType
  readonly data_hash: Uint8Array
  readonly field: string
  readonly text: string
}

/** `secureValueErrorFile#7a700873` */
export interface SecureValueErrorFile {
  readonly _: 'secureValueErrorFile'
  readonly type: TypeSecureValueType
  readonly file_hash: Uint8Array
  readonly text: string
}

/** `secureValueErrorFiles#666220e9` */
export interface SecureValueErrorFiles {
  readonly _: 'secureValueErrorFiles'
  readonly type: TypeSecureValueType
  readonly file_hash: readonly Uint8Array[]
  readonly text: string
}

/** `secureValueErrorFrontSide#00be3dfa` */
export interface SecureValueErrorFrontSide {
  readonly _: 'secureValueErrorFrontSide'
  readonly type: TypeSecureValueType
  readonly file_hash: Uint8Array
  readonly text: string
}

/** `secureValueErrorReverseSide#868a2aa5` */
export interface SecureValueErrorReverseSide {
  readonly _: 'secureValueErrorReverseSide'
  readonly type: TypeSecureValueType
  readonly file_hash: Uint8Array
  readonly text: string
}

/** `secureValueErrorSelfie#e537ced6` */
export interface SecureValueErrorSelfie {
  readonly _: 'secureValueErrorSelfie'
  readonly type: TypeSecureValueType
  readonly file_hash: Uint8Array
  readonly text: string
}

/** `secureValueErrorTranslationFile#a1144770` */
export interface SecureValueErrorTranslationFile {
  readonly _: 'secureValueErrorTranslationFile'
  readonly type: TypeSecureValueType
  readonly file_hash: Uint8Array
  readonly text: string
}

/** `secureValueErrorTranslationFiles#34636dd8` */
export interface SecureValueErrorTranslationFiles {
  readonly _: 'secureValueErrorTranslationFiles'
  readonly type: TypeSecureValueType
  readonly file_hash: readonly Uint8Array[]
  readonly text: string
}

/** `secureValueHash#ed1ecdb0` */
export interface SecureValueHash {
  readonly _: 'secureValueHash'
  readonly type: TypeSecureValueType
  readonly hash: Uint8Array
}

/** `secureValueTypeAddress#cbe31e26` */
export interface SecureValueTypeAddress {
  readonly _: 'secureValueTypeAddress'
}

/** `secureValueTypeBankStatement#89137c0d` */
export interface SecureValueTypeBankStatement {
  readonly _: 'secureValueTypeBankStatement'
}

/** `secureValueTypeDriverLicense#06e425c4` */
export interface SecureValueTypeDriverLicense {
  readonly _: 'secureValueTypeDriverLicense'
}

/** `secureValueTypeEmail#8e3ca7ee` */
export interface SecureValueTypeEmail {
  readonly _: 'secureValueTypeEmail'
}

/** `secureValueTypeIdentityCard#a0d0744b` */
export interface SecureValueTypeIdentityCard {
  readonly _: 'secureValueTypeIdentityCard'
}

/** `secureValueTypeInternalPassport#99a48f23` */
export interface SecureValueTypeInternalPassport {
  readonly _: 'secureValueTypeInternalPassport'
}

/** `secureValueTypePassport#3dac6a00` */
export interface SecureValueTypePassport {
  readonly _: 'secureValueTypePassport'
}

/** `secureValueTypePassportRegistration#99e3806a` */
export interface SecureValueTypePassportRegistration {
  readonly _: 'secureValueTypePassportRegistration'
}

/** `secureValueTypePersonalDetails#9d2a81e3` */
export interface SecureValueTypePersonalDetails {
  readonly _: 'secureValueTypePersonalDetails'
}

/** `secureValueTypePhone#b320aadb` */
export interface SecureValueTypePhone {
  readonly _: 'secureValueTypePhone'
}

/** `secureValueTypeRentalAgreement#8b883488` */
export interface SecureValueTypeRentalAgreement {
  readonly _: 'secureValueTypeRentalAgreement'
}

/** `secureValueTypeTemporaryRegistration#ea02ec33` */
export interface SecureValueTypeTemporaryRegistration {
  readonly _: 'secureValueTypeTemporaryRegistration'
}

/** `secureValueTypeUtilityBill#fc36954e` */
export interface SecureValueTypeUtilityBill {
  readonly _: 'secureValueTypeUtilityBill'
}

/** `sendAsPeer#b81c7034` */
export interface SendAsPeer {
  readonly _: 'sendAsPeer'
  readonly premium_required?: true
  readonly peer: root_p$.TypePeer
}

/** `sendMessageCancelAction#fd5ec8f5` */
export interface SendMessageCancelAction {
  readonly _: 'sendMessageCancelAction'
}

/** `sendMessageChooseContactAction#628cbc6f` */
export interface SendMessageChooseContactAction {
  readonly _: 'sendMessageChooseContactAction'
}

/** `sendMessageChooseStickerAction#b05ac6b1` */
export interface SendMessageChooseStickerAction {
  readonly _: 'sendMessageChooseStickerAction'
}

/** `sendMessageEmojiInteraction#25972bcb` */
export interface SendMessageEmojiInteraction {
  readonly _: 'sendMessageEmojiInteraction'
  readonly emoticon: string
  readonly msg_id: number
  readonly interaction: root_d$.TypeDataJSON
}

/** `sendMessageEmojiInteractionSeen#b665902e` */
export interface SendMessageEmojiInteractionSeen {
  readonly _: 'sendMessageEmojiInteractionSeen'
  readonly emoticon: string
}

/** `sendMessageGamePlayAction#dd6a8f48` */
export interface SendMessageGamePlayAction {
  readonly _: 'sendMessageGamePlayAction'
}

/** `sendMessageGeoLocationAction#176f8ba1` */
export interface SendMessageGeoLocationAction {
  readonly _: 'sendMessageGeoLocationAction'
}

/** `sendMessageHistoryImportAction#dbda9246` */
export interface SendMessageHistoryImportAction {
  readonly _: 'sendMessageHistoryImportAction'
  readonly progress: number
}

/** `sendMessageRecordAudioAction#d52f73f7` */
export interface SendMessageRecordAudioAction {
  readonly _: 'sendMessageRecordAudioAction'
}

/** `sendMessageRecordRoundAction#88f27fbc` */
export interface SendMessageRecordRoundAction {
  readonly _: 'sendMessageRecordRoundAction'
}

/** `sendMessageRecordVideoAction#a187d66f` */
export interface SendMessageRecordVideoAction {
  readonly _: 'sendMessageRecordVideoAction'
}

/** `sendMessageRichMessageDraftAction#52564893` */
export interface SendMessageRichMessageDraftAction {
  readonly _: 'sendMessageRichMessageDraftAction'
  readonly can_stop?: true
  readonly keep_on_stop?: true
  readonly random_id: bigint
  readonly rich_message: root_r$.TypeRichMessage
}

/** `sendMessageStopDraftAction#fbf902b0` */
export interface SendMessageStopDraftAction {
  readonly _: 'sendMessageStopDraftAction'
  readonly random_id: bigint
}

/** `sendMessageTextDraftAction#3630b85a` */
export interface SendMessageTextDraftAction {
  readonly _: 'sendMessageTextDraftAction'
  readonly can_stop?: true
  readonly keep_on_stop?: true
  readonly random_id: bigint
  readonly text: root_t$.TypeTextWithEntities
}

/** `sendMessageTypingAction#16bf744e` */
export interface SendMessageTypingAction {
  readonly _: 'sendMessageTypingAction'
}

/** `sendMessageUploadAudioAction#f351d7ab` */
export interface SendMessageUploadAudioAction {
  readonly _: 'sendMessageUploadAudioAction'
  readonly progress: number
}

/** `sendMessageUploadDocumentAction#aa0cd9e4` */
export interface SendMessageUploadDocumentAction {
  readonly _: 'sendMessageUploadDocumentAction'
  readonly progress: number
}

/** `sendMessageUploadPhotoAction#d1d34a26` */
export interface SendMessageUploadPhotoAction {
  readonly _: 'sendMessageUploadPhotoAction'
  readonly progress: number
}

/** `sendMessageUploadRoundAction#243e1c66` */
export interface SendMessageUploadRoundAction {
  readonly _: 'sendMessageUploadRoundAction'
  readonly progress: number
}

/** `sendMessageUploadVideoAction#e9763aec` */
export interface SendMessageUploadVideoAction {
  readonly _: 'sendMessageUploadVideoAction'
  readonly progress: number
}

/** `shippingOption#b6213cdf` */
export interface ShippingOption {
  readonly _: 'shippingOption'
  readonly id: string
  readonly title: string
  readonly prices: readonly root_l$.TypeLabeledPrice[]
}

/** `smsJob#e6a1eeb8` */
export interface SmsJob {
  readonly _: 'smsJob'
  readonly job_id: string
  readonly phone_number: string
  readonly text: string
}

/** `speakingInGroupCallAction#d92c2285` */
export interface SpeakingInGroupCallAction {
  readonly _: 'speakingInGroupCallAction'
}

/** `sponsoredMessage#7dbf8673` */
export interface SponsoredMessage {
  readonly _: 'sponsoredMessage'
  readonly recommended?: true
  readonly can_report?: true
  readonly random_id: Uint8Array
  readonly url: string
  readonly title: string
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly photo?: root_p$.TypePhoto
  readonly media?: root_m$.TypeMessageMedia
  readonly color?: root_p$.TypePeerColor
  readonly button_text: string
  readonly sponsor_info?: string
  readonly additional_info?: string
  readonly min_display_duration?: number
  readonly max_display_duration?: number
}

/** `sponsoredMessageReportOption#430d3150` */
export interface SponsoredMessageReportOption {
  readonly _: 'sponsoredMessageReportOption'
  readonly text: string
  readonly option: Uint8Array
}

/** `sponsoredPeer#c69708d3` */
export interface SponsoredPeer {
  readonly _: 'sponsoredPeer'
  readonly random_id: Uint8Array
  readonly peer: root_p$.TypePeer
  readonly sponsor_info?: string
  readonly additional_info?: string
}

/** `starGift#313a9547` */
export interface StarGift {
  readonly _: 'starGift'
  readonly limited?: true
  readonly sold_out?: true
  readonly birthday?: true
  readonly require_premium?: true
  readonly limited_per_user?: true
  readonly peer_color_available?: true
  readonly auction?: true
  readonly id: bigint
  readonly sticker: root_d$.TypeDocument
  readonly stars: bigint
  readonly availability_remains?: number
  readonly availability_total?: number
  readonly availability_resale?: bigint
  readonly convert_stars: bigint
  readonly first_sale_date?: number
  readonly last_sale_date?: number
  readonly upgrade_stars?: bigint
  readonly resell_min_stars?: bigint
  readonly title?: string
  readonly released_by?: root_p$.TypePeer
  readonly per_user_total?: number
  readonly per_user_remains?: number
  readonly locked_until_date?: number
  readonly auction_slug?: string
  readonly gifts_per_round?: number
  readonly auction_start_date?: number
  readonly upgrade_variants?: number
  readonly background?: TypeStarGiftBackground
}

/** `starGiftActiveAuctionState#d31bc45d` */
export interface StarGiftActiveAuctionState {
  readonly _: 'starGiftActiveAuctionState'
  readonly gift: TypeStarGift
  readonly state: TypeStarGiftAuctionState
  readonly user_state: TypeStarGiftAuctionUserState
}

/** `starGiftAttributeBackdrop#9f2504e4` */
export interface StarGiftAttributeBackdrop {
  readonly _: 'starGiftAttributeBackdrop'
  readonly name: string
  readonly backdrop_id: number
  readonly center_color: number
  readonly edge_color: number
  readonly pattern_color: number
  readonly text_color: number
  readonly rarity: TypeStarGiftAttributeRarity
}

/** `starGiftAttributeCounter#2eb1b658` */
export interface StarGiftAttributeCounter {
  readonly _: 'starGiftAttributeCounter'
  readonly attribute: TypeStarGiftAttributeId
  readonly count: number
}

/** `starGiftAttributeIdBackdrop#1f01c757` */
export interface StarGiftAttributeIdBackdrop {
  readonly _: 'starGiftAttributeIdBackdrop'
  readonly backdrop_id: number
}

/** `starGiftAttributeIdModel#48aaae3c` */
export interface StarGiftAttributeIdModel {
  readonly _: 'starGiftAttributeIdModel'
  readonly document_id: bigint
}

/** `starGiftAttributeIdPattern#4a162433` */
export interface StarGiftAttributeIdPattern {
  readonly _: 'starGiftAttributeIdPattern'
  readonly document_id: bigint
}

/** `starGiftAttributeModel#565251e2` */
export interface StarGiftAttributeModel {
  readonly _: 'starGiftAttributeModel'
  readonly crafted?: true
  readonly name: string
  readonly document: root_d$.TypeDocument
  readonly rarity: TypeStarGiftAttributeRarity
}

/** `starGiftAttributeOriginalDetails#e0bff26c` */
export interface StarGiftAttributeOriginalDetails {
  readonly _: 'starGiftAttributeOriginalDetails'
  readonly sender_id?: root_p$.TypePeer
  readonly recipient_id: root_p$.TypePeer
  readonly date: number
  readonly message?: root_t$.TypeTextWithEntities
}

/** `starGiftAttributePattern#4e7085ea` */
export interface StarGiftAttributePattern {
  readonly _: 'starGiftAttributePattern'
  readonly name: string
  readonly document: root_d$.TypeDocument
  readonly rarity: TypeStarGiftAttributeRarity
}

/** `starGiftAttributeRarity#36437737` */
export interface StarGiftAttributeRarity {
  readonly _: 'starGiftAttributeRarity'
  readonly permille: number
}

/** `starGiftAttributeRarityEpic#78fbf3a8` */
export interface StarGiftAttributeRarityEpic {
  readonly _: 'starGiftAttributeRarityEpic'
}

/** `starGiftAttributeRarityLegendary#cef7e7a8` */
export interface StarGiftAttributeRarityLegendary {
  readonly _: 'starGiftAttributeRarityLegendary'
}

/** `starGiftAttributeRarityRare#f08d516b` */
export interface StarGiftAttributeRarityRare {
  readonly _: 'starGiftAttributeRarityRare'
}

/** `starGiftAttributeRarityUncommon#dbce6389` */
export interface StarGiftAttributeRarityUncommon {
  readonly _: 'starGiftAttributeRarityUncommon'
}

/** `starGiftAuctionAcquiredGift#42b00348` */
export interface StarGiftAuctionAcquiredGift {
  readonly _: 'starGiftAuctionAcquiredGift'
  readonly name_hidden?: true
  readonly peer: root_p$.TypePeer
  readonly date: number
  readonly bid_amount: bigint
  readonly round: number
  readonly pos: number
  readonly message?: root_t$.TypeTextWithEntities
  readonly gift_num?: number
}

/** `starGiftAuctionRound#3aae0528` */
export interface StarGiftAuctionRound {
  readonly _: 'starGiftAuctionRound'
  readonly num: number
  readonly duration: number
}

/** `starGiftAuctionRoundExtendable#0aa021e5` */
export interface StarGiftAuctionRoundExtendable {
  readonly _: 'starGiftAuctionRoundExtendable'
  readonly num: number
  readonly duration: number
  readonly extend_top: number
  readonly extend_window: number
}

/** `starGiftAuctionState#771a4e66` */
export interface StarGiftAuctionState {
  readonly _: 'starGiftAuctionState'
  readonly version: number
  readonly start_date: number
  readonly end_date: number
  readonly min_bid_amount: bigint
  readonly bid_levels: readonly root_a$.TypeAuctionBidLevel[]
  readonly top_bidders: readonly bigint[]
  readonly next_round_at: number
  readonly last_gift_num: number
  readonly gifts_left: number
  readonly current_round: number
  readonly total_rounds: number
  readonly rounds: readonly TypeStarGiftAuctionRound[]
}

/** `starGiftAuctionStateFinished#972dabbf` */
export interface StarGiftAuctionStateFinished {
  readonly _: 'starGiftAuctionStateFinished'
  readonly start_date: number
  readonly end_date: number
  readonly average_price: bigint
  readonly listed_count?: number
  readonly fragment_listed_count?: number
  readonly fragment_listed_url?: string
}

/** `starGiftAuctionStateNotModified#fe333952` */
export interface StarGiftAuctionStateNotModified {
  readonly _: 'starGiftAuctionStateNotModified'
}

/** `starGiftAuctionUserState#2eeed1c4` */
export interface StarGiftAuctionUserState {
  readonly _: 'starGiftAuctionUserState'
  readonly returned?: true
  readonly bid_amount?: bigint
  readonly bid_date?: number
  readonly min_bid_amount?: bigint
  readonly bid_peer?: root_p$.TypePeer
  readonly acquired_count: number
}

/** `starGiftBackground#aff56398` */
export interface StarGiftBackground {
  readonly _: 'starGiftBackground'
  readonly center_color: number
  readonly edge_color: number
  readonly text_color: number
}

/** `starGiftCollection#9d6b13b0` */
export interface StarGiftCollection {
  readonly _: 'starGiftCollection'
  readonly collection_id: number
  readonly title: string
  readonly icon?: root_d$.TypeDocument
  readonly gifts_count: number
  readonly hash: bigint
}

/** `starGiftUnique#85f0a9cd` */
export interface StarGiftUnique {
  readonly _: 'starGiftUnique'
  readonly require_premium?: true
  readonly resale_ton_only?: true
  readonly theme_available?: true
  readonly burned?: true
  readonly crafted?: true
  readonly id: bigint
  readonly gift_id: bigint
  readonly title: string
  readonly slug: string
  readonly num: number
  readonly owner_id?: root_p$.TypePeer
  readonly owner_name?: string
  readonly owner_address?: string
  readonly attributes: readonly TypeStarGiftAttribute[]
  readonly availability_issued: number
  readonly availability_total: number
  readonly gift_address?: string
  readonly resell_amount?: readonly TypeStarsAmount[]
  readonly released_by?: root_p$.TypePeer
  readonly value_amount?: bigint
  readonly value_currency?: string
  readonly value_usd_amount?: bigint
  readonly theme_peer?: root_p$.TypePeer
  readonly peer_color?: root_p$.TypePeerColor
  readonly host_id?: root_p$.TypePeer
  readonly offer_min_stars?: number
  readonly craft_chance_permille?: number
}

/** `starGiftUpgradePrice#99ea331d` */
export interface StarGiftUpgradePrice {
  readonly _: 'starGiftUpgradePrice'
  readonly date: number
  readonly upgrade_stars: bigint
}

/** `starRefProgram#dd0c66f2` */
export interface StarRefProgram {
  readonly _: 'starRefProgram'
  readonly bot_id: bigint
  readonly commission_permille: number
  readonly duration_months?: number
  readonly end_date?: number
  readonly daily_revenue_per_user?: TypeStarsAmount
}

/** `starsAmount#bbb6b4a3` */
export interface StarsAmount {
  readonly _: 'starsAmount'
  readonly amount: bigint
  readonly nanos: number
}

/** `starsGiftOption#5e0589f1` */
export interface StarsGiftOption {
  readonly _: 'starsGiftOption'
  readonly extended?: true
  readonly stars: bigint
  readonly store_product?: string
  readonly currency: string
  readonly amount: bigint
}

/** `starsGiveawayOption#94ce852a` */
export interface StarsGiveawayOption {
  readonly _: 'starsGiveawayOption'
  readonly extended?: true
  readonly default?: true
  readonly stars: bigint
  readonly yearly_boosts: number
  readonly store_product?: string
  readonly currency: string
  readonly amount: bigint
  readonly winners: readonly TypeStarsGiveawayWinnersOption[]
}

/** `starsGiveawayWinnersOption#54236209` */
export interface StarsGiveawayWinnersOption {
  readonly _: 'starsGiveawayWinnersOption'
  readonly default?: true
  readonly users: number
  readonly per_user_stars: bigint
}

/** `starsRating#1b0e4f07` */
export interface StarsRating {
  readonly _: 'starsRating'
  readonly level: number
  readonly current_level_stars: bigint
  readonly stars: bigint
  readonly next_level_stars?: bigint
}

/** `starsRevenueStatus#febe5491` */
export interface StarsRevenueStatus {
  readonly _: 'starsRevenueStatus'
  readonly withdrawal_enabled?: true
  readonly current_balance: TypeStarsAmount
  readonly available_balance: TypeStarsAmount
  readonly overall_revenue: TypeStarsAmount
  readonly next_withdrawal_at?: number
}

/** `starsSubscription#2e6eab1a` */
export interface StarsSubscription {
  readonly _: 'starsSubscription'
  readonly canceled?: true
  readonly can_refulfill?: true
  readonly missing_balance?: true
  readonly bot_canceled?: true
  readonly id: string
  readonly peer: root_p$.TypePeer
  readonly until_date: number
  readonly pricing: TypeStarsSubscriptionPricing
  readonly chat_invite_hash?: string
  readonly title?: string
  readonly photo?: root_w$.TypeWebDocument
  readonly invoice_slug?: string
}

/** `starsSubscriptionPricing#05416d58` */
export interface StarsSubscriptionPricing {
  readonly _: 'starsSubscriptionPricing'
  readonly period: number
  readonly amount: bigint
}

/** `starsTonAmount#74aee3e0` */
export interface StarsTonAmount {
  readonly _: 'starsTonAmount'
  readonly amount: bigint
}

/** `starsTopupOption#0bd915c0` */
export interface StarsTopupOption {
  readonly _: 'starsTopupOption'
  readonly extended?: true
  readonly stars: bigint
  readonly store_product?: string
  readonly currency: string
  readonly amount: bigint
}

/** `starsTransaction#13659eb0` */
export interface StarsTransaction {
  readonly _: 'starsTransaction'
  readonly refund?: true
  readonly pending?: true
  readonly failed?: true
  readonly gift?: true
  readonly reaction?: true
  readonly stargift_upgrade?: true
  readonly business_transfer?: true
  readonly stargift_resale?: true
  readonly posts_search?: true
  readonly stargift_prepaid_upgrade?: true
  readonly stargift_drop_original_details?: true
  readonly phonegroup_message?: true
  readonly stargift_auction_bid?: true
  readonly offer?: true
  readonly id: string
  readonly amount: TypeStarsAmount
  readonly date: number
  readonly peer: TypeStarsTransactionPeer
  readonly title?: string
  readonly description?: string
  readonly photo?: root_w$.TypeWebDocument
  readonly transaction_date?: number
  readonly transaction_url?: string
  readonly bot_payload?: Uint8Array
  readonly msg_id?: number
  readonly extended_media?: readonly root_m$.TypeMessageMedia[]
  readonly subscription_period?: number
  readonly giveaway_post_id?: number
  readonly stargift?: TypeStarGift
  readonly floodskip_number?: number
  readonly starref_commission_permille?: number
  readonly starref_peer?: root_p$.TypePeer
  readonly starref_amount?: TypeStarsAmount
  readonly paid_messages?: number
  readonly premium_gift_months?: number
  readonly ads_proceeds_from_date?: number
  readonly ads_proceeds_to_date?: number
}

/** `starsTransactionPeer#d80da15d` */
export interface StarsTransactionPeer {
  readonly _: 'starsTransactionPeer'
  readonly peer: root_p$.TypePeer
}

/** `starsTransactionPeerAPI#f9677aad` */
export interface StarsTransactionPeerAPI {
  readonly _: 'starsTransactionPeerAPI'
}

/** `starsTransactionPeerAds#60682812` */
export interface StarsTransactionPeerAds {
  readonly _: 'starsTransactionPeerAds'
}

/** `starsTransactionPeerAppStore#b457b375` */
export interface StarsTransactionPeerAppStore {
  readonly _: 'starsTransactionPeerAppStore'
}

/** `starsTransactionPeerFragment#e92fd902` */
export interface StarsTransactionPeerFragment {
  readonly _: 'starsTransactionPeerFragment'
}

/** `starsTransactionPeerPlayMarket#7b560a0b` */
export interface StarsTransactionPeerPlayMarket {
  readonly _: 'starsTransactionPeerPlayMarket'
}

/** `starsTransactionPeerPremiumBot#250dbaf8` */
export interface StarsTransactionPeerPremiumBot {
  readonly _: 'starsTransactionPeerPremiumBot'
}

/** `starsTransactionPeerUnsupported#95f2bfe4` */
export interface StarsTransactionPeerUnsupported {
  readonly _: 'starsTransactionPeerUnsupported'
}

/** `statsAbsValueAndPrev#cb43acde` */
export interface StatsAbsValueAndPrev {
  readonly _: 'statsAbsValueAndPrev'
  readonly current: number
  readonly previous: number
}

/** `statsDateRangeDays#b637edaf` */
export interface StatsDateRangeDays {
  readonly _: 'statsDateRangeDays'
  readonly min_date: number
  readonly max_date: number
}

/** `statsGraph#8ea464b6` */
export interface StatsGraph {
  readonly _: 'statsGraph'
  readonly json: root_d$.TypeDataJSON
  readonly zoom_token?: string
}

/** `statsGraphAsync#4a27eb2d` */
export interface StatsGraphAsync {
  readonly _: 'statsGraphAsync'
  readonly token: string
}

/** `statsGraphError#bedc9822` */
export interface StatsGraphError {
  readonly _: 'statsGraphError'
  readonly error: string
}

/** `statsGroupTopAdmin#d7584c87` */
export interface StatsGroupTopAdmin {
  readonly _: 'statsGroupTopAdmin'
  readonly user_id: bigint
  readonly deleted: number
  readonly kicked: number
  readonly banned: number
}

/** `statsGroupTopInviter#535f779d` */
export interface StatsGroupTopInviter {
  readonly _: 'statsGroupTopInviter'
  readonly user_id: bigint
  readonly invitations: number
}

/** `statsGroupTopPoster#9d04af9b` */
export interface StatsGroupTopPoster {
  readonly _: 'statsGroupTopPoster'
  readonly user_id: bigint
  readonly messages: number
  readonly avg_chars: number
}

/** `statsPercentValue#cbce2fe0` */
export interface StatsPercentValue {
  readonly _: 'statsPercentValue'
  readonly part: number
  readonly total: number
}

/** `statsURL#47a971e0` */
export interface StatsURL {
  readonly _: 'statsURL'
  readonly url: string
}

/** `stickerKeyword#fcfeb29c` */
export interface StickerKeyword {
  readonly _: 'stickerKeyword'
  readonly document_id: bigint
  readonly keyword: readonly string[]
}

/** `stickerPack#12b299d4` */
export interface StickerPack {
  readonly _: 'stickerPack'
  readonly emoticon: string
  readonly documents: readonly bigint[]
}

/** `stickerSet#2dd14edc` */
export interface StickerSet {
  readonly _: 'stickerSet'
  readonly archived?: true
  readonly official?: true
  readonly masks?: true
  readonly emojis?: true
  readonly text_color?: true
  readonly channel_emoji_status?: true
  readonly creator?: true
  readonly installed_date?: number
  readonly id: bigint
  readonly access_hash: bigint
  readonly title: string
  readonly short_name: string
  readonly thumbs?: readonly root_p$.TypePhotoSize[]
  readonly thumb_dc_id?: number
  readonly thumb_version?: number
  readonly thumb_document_id?: bigint
  readonly count: number
  readonly hash: number
}

/** `stickerSetCovered#6410a5d2` */
export interface StickerSetCovered {
  readonly _: 'stickerSetCovered'
  readonly set: TypeStickerSet
  readonly cover: root_d$.TypeDocument
}

/** `stickerSetFullCovered#40d13c0e` */
export interface StickerSetFullCovered {
  readonly _: 'stickerSetFullCovered'
  readonly set: TypeStickerSet
  readonly packs: readonly TypeStickerPack[]
  readonly keywords: readonly TypeStickerKeyword[]
  readonly documents: readonly root_d$.TypeDocument[]
}

/** `stickerSetMultiCovered#3407e51b` */
export interface StickerSetMultiCovered {
  readonly _: 'stickerSetMultiCovered'
  readonly set: TypeStickerSet
  readonly covers: readonly root_d$.TypeDocument[]
}

/** `stickerSetNoCovered#77b15d1c` */
export interface StickerSetNoCovered {
  readonly _: 'stickerSetNoCovered'
  readonly set: TypeStickerSet
}

/** `storiesStealthMode#712e27fd` */
export interface StoriesStealthMode {
  readonly _: 'storiesStealthMode'
  readonly active_until_date?: number
  readonly cooldown_until_date?: number
}

/** `storyAlbum#9325705a` */
export interface StoryAlbum {
  readonly _: 'storyAlbum'
  readonly album_id: number
  readonly title: string
  readonly icon_photo?: root_p$.TypePhoto
  readonly icon_video?: root_d$.TypeDocument
}

/** `storyFwdHeader#b826e150` */
export interface StoryFwdHeader {
  readonly _: 'storyFwdHeader'
  readonly modified?: true
  readonly from?: root_p$.TypePeer
  readonly from_name?: string
  readonly story_id?: number
}

/** `storyItem#16a4b93c` */
export interface StoryItem {
  readonly _: 'storyItem'
  readonly pinned?: true
  readonly public?: true
  readonly close_friends?: true
  readonly min?: true
  readonly noforwards?: true
  readonly edited?: true
  readonly contacts?: true
  readonly selected_contacts?: true
  readonly out?: true
  readonly id: number
  readonly date: number
  readonly from_id?: root_p$.TypePeer
  readonly fwd_from?: TypeStoryFwdHeader
  readonly expire_date: number
  readonly caption?: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly media: root_m$.TypeMessageMedia
  readonly media_areas?: readonly root_m$.TypeMediaArea[]
  readonly privacy?: readonly root_p$.TypePrivacyRule[]
  readonly views?: TypeStoryViews
  readonly sent_reaction?: root_r$.TypeReaction
  readonly albums?: readonly number[]
  readonly music?: root_d$.TypeDocument
}

/** `storyItemDeleted#51e6ee4f` */
export interface StoryItemDeleted {
  readonly _: 'storyItemDeleted'
  readonly id: number
}

/** `storyItemSkipped#ffadc913` */
export interface StoryItemSkipped {
  readonly _: 'storyItemSkipped'
  readonly close_friends?: true
  readonly live?: true
  readonly id: number
  readonly date: number
  readonly expire_date: number
}

/** `storyReaction#6090d6d5` */
export interface StoryReaction {
  readonly _: 'storyReaction'
  readonly peer_id: root_p$.TypePeer
  readonly date: number
  readonly reaction: root_r$.TypeReaction
}

/** `storyReactionPublicForward#bbab2643` */
export interface StoryReactionPublicForward {
  readonly _: 'storyReactionPublicForward'
  readonly message: root_m$.TypeMessage
}

/** `storyReactionPublicRepost#cfcd0f13` */
export interface StoryReactionPublicRepost {
  readonly _: 'storyReactionPublicRepost'
  readonly peer_id: root_p$.TypePeer
  readonly story: TypeStoryItem
}

/** `storyView#b0bdeac5` */
export interface StoryView {
  readonly _: 'storyView'
  readonly blocked?: true
  readonly blocked_my_stories_from?: true
  readonly user_id: bigint
  readonly date: number
  readonly reaction?: root_r$.TypeReaction
}

/** `storyViewPublicForward#9083670b` */
export interface StoryViewPublicForward {
  readonly _: 'storyViewPublicForward'
  readonly blocked?: true
  readonly blocked_my_stories_from?: true
  readonly message: root_m$.TypeMessage
}

/** `storyViewPublicRepost#bd74cf49` */
export interface StoryViewPublicRepost {
  readonly _: 'storyViewPublicRepost'
  readonly blocked?: true
  readonly blocked_my_stories_from?: true
  readonly peer_id: root_p$.TypePeer
  readonly story: TypeStoryItem
}

/** `storyViews#8d595cd6` */
export interface StoryViews {
  readonly _: 'storyViews'
  readonly has_viewers?: true
  readonly views_count: number
  readonly forwards_count?: number
  readonly reactions?: readonly root_r$.TypeReactionCount[]
  readonly reactions_count?: number
  readonly recent_viewers?: readonly bigint[]
}

/** `suggestedPost#0e8e37e5` */
export interface SuggestedPost {
  readonly _: 'suggestedPost'
  readonly accepted?: true
  readonly rejected?: true
  readonly price?: TypeStarsAmount
  readonly schedule_date?: number
}

/** Any `SavedContact`. */
export type TypeSavedContact =
  | SavedPhoneContact

/** Any `SavedDialog`. */
export type TypeSavedDialog =
  | root_m$.MonoForumDialog
  | SavedDialog

/** Any `SavedReactionTag`. */
export type TypeSavedReactionTag =
  | SavedReactionTag

/** Any `SavedStarGift`. */
export type TypeSavedStarGift =
  | SavedStarGift

/** Any `SearchPostsFlood`. */
export type TypeSearchPostsFlood =
  | SearchPostsFlood

/** Any `SearchResultsCalendarPeriod`. */
export type TypeSearchResultsCalendarPeriod =
  | SearchResultsCalendarPeriod

/** Any `SearchResultsPosition`. */
export type TypeSearchResultsPosition =
  | SearchResultPosition

/** Any `SecureCredentialsEncrypted`. */
export type TypeSecureCredentialsEncrypted =
  | SecureCredentialsEncrypted

/** Any `SecureData`. */
export type TypeSecureData =
  | SecureData

/** Any `SecureFile`. */
export type TypeSecureFile =
  | SecureFile
  | SecureFileEmpty

/** Any `SecurePasswordKdfAlgo`. */
export type TypeSecurePasswordKdfAlgo =
  | SecurePasswordKdfAlgoPBKDF2HMACSHA512iter100000
  | SecurePasswordKdfAlgoSHA512
  | SecurePasswordKdfAlgoUnknown

/** Any `SecurePlainData`. */
export type TypeSecurePlainData =
  | SecurePlainEmail
  | SecurePlainPhone

/** Any `SecureRequiredType`. */
export type TypeSecureRequiredType =
  | SecureRequiredType
  | SecureRequiredTypeOneOf

/** Any `SecureSecretSettings`. */
export type TypeSecureSecretSettings =
  | SecureSecretSettings

/** Any `SecureValue`. */
export type TypeSecureValue =
  | SecureValue

/** Any `SecureValueError`. */
export type TypeSecureValueError =
  | SecureValueError
  | SecureValueErrorData
  | SecureValueErrorFile
  | SecureValueErrorFiles
  | SecureValueErrorFrontSide
  | SecureValueErrorReverseSide
  | SecureValueErrorSelfie
  | SecureValueErrorTranslationFile
  | SecureValueErrorTranslationFiles

/** Any `SecureValueHash`. */
export type TypeSecureValueHash =
  | SecureValueHash

/** Any `SecureValueType`. */
export type TypeSecureValueType =
  | SecureValueTypeAddress
  | SecureValueTypeBankStatement
  | SecureValueTypeDriverLicense
  | SecureValueTypeEmail
  | SecureValueTypeIdentityCard
  | SecureValueTypeInternalPassport
  | SecureValueTypePassport
  | SecureValueTypePassportRegistration
  | SecureValueTypePersonalDetails
  | SecureValueTypePhone
  | SecureValueTypeRentalAgreement
  | SecureValueTypeTemporaryRegistration
  | SecureValueTypeUtilityBill

/** Any `SendAsPeer`. */
export type TypeSendAsPeer =
  | SendAsPeer

/** Any `SendMessageAction`. */
export type TypeSendMessageAction =
  | root_i$.InputSendMessageRichMessageDraftAction
  | SendMessageCancelAction
  | SendMessageChooseContactAction
  | SendMessageChooseStickerAction
  | SendMessageEmojiInteraction
  | SendMessageEmojiInteractionSeen
  | SendMessageGamePlayAction
  | SendMessageGeoLocationAction
  | SendMessageHistoryImportAction
  | SendMessageRecordAudioAction
  | SendMessageRecordRoundAction
  | SendMessageRecordVideoAction
  | SendMessageRichMessageDraftAction
  | SendMessageStopDraftAction
  | SendMessageTextDraftAction
  | SendMessageTypingAction
  | SendMessageUploadAudioAction
  | SendMessageUploadDocumentAction
  | SendMessageUploadPhotoAction
  | SendMessageUploadRoundAction
  | SendMessageUploadVideoAction
  | SpeakingInGroupCallAction

/** Any `ShippingOption`. */
export type TypeShippingOption =
  | ShippingOption

/** Any `SmsJob`. */
export type TypeSmsJob =
  | SmsJob

/** Any `SponsoredMessage`. */
export type TypeSponsoredMessage =
  | SponsoredMessage

/** Any `SponsoredMessageReportOption`. */
export type TypeSponsoredMessageReportOption =
  | SponsoredMessageReportOption

/** Any `SponsoredPeer`. */
export type TypeSponsoredPeer =
  | SponsoredPeer

/** Any `StarGift`. */
export type TypeStarGift =
  | StarGift
  | StarGiftUnique

/** Any `StarGiftActiveAuctionState`. */
export type TypeStarGiftActiveAuctionState =
  | StarGiftActiveAuctionState

/** Any `StarGiftAttribute`. */
export type TypeStarGiftAttribute =
  | StarGiftAttributeBackdrop
  | StarGiftAttributeModel
  | StarGiftAttributeOriginalDetails
  | StarGiftAttributePattern

/** Any `StarGiftAttributeCounter`. */
export type TypeStarGiftAttributeCounter =
  | StarGiftAttributeCounter

/** Any `StarGiftAttributeId`. */
export type TypeStarGiftAttributeId =
  | StarGiftAttributeIdBackdrop
  | StarGiftAttributeIdModel
  | StarGiftAttributeIdPattern

/** Any `StarGiftAttributeRarity`. */
export type TypeStarGiftAttributeRarity =
  | StarGiftAttributeRarity
  | StarGiftAttributeRarityEpic
  | StarGiftAttributeRarityLegendary
  | StarGiftAttributeRarityRare
  | StarGiftAttributeRarityUncommon

/** Any `StarGiftAuctionAcquiredGift`. */
export type TypeStarGiftAuctionAcquiredGift =
  | StarGiftAuctionAcquiredGift

/** Any `StarGiftAuctionRound`. */
export type TypeStarGiftAuctionRound =
  | StarGiftAuctionRound
  | StarGiftAuctionRoundExtendable

/** Any `StarGiftAuctionState`. */
export type TypeStarGiftAuctionState =
  | StarGiftAuctionState
  | StarGiftAuctionStateFinished
  | StarGiftAuctionStateNotModified

/** Any `StarGiftAuctionUserState`. */
export type TypeStarGiftAuctionUserState =
  | StarGiftAuctionUserState

/** Any `StarGiftBackground`. */
export type TypeStarGiftBackground =
  | StarGiftBackground

/** Any `StarGiftCollection`. */
export type TypeStarGiftCollection =
  | StarGiftCollection

/** Any `StarGiftUpgradePrice`. */
export type TypeStarGiftUpgradePrice =
  | StarGiftUpgradePrice

/** Any `StarRefProgram`. */
export type TypeStarRefProgram =
  | StarRefProgram

/** Any `StarsAmount`. */
export type TypeStarsAmount =
  | StarsAmount
  | StarsTonAmount

/** Any `StarsGiftOption`. */
export type TypeStarsGiftOption =
  | StarsGiftOption

/** Any `StarsGiveawayOption`. */
export type TypeStarsGiveawayOption =
  | StarsGiveawayOption

/** Any `StarsGiveawayWinnersOption`. */
export type TypeStarsGiveawayWinnersOption =
  | StarsGiveawayWinnersOption

/** Any `StarsRating`. */
export type TypeStarsRating =
  | StarsRating

/** Any `StarsRevenueStatus`. */
export type TypeStarsRevenueStatus =
  | StarsRevenueStatus

/** Any `StarsSubscription`. */
export type TypeStarsSubscription =
  | StarsSubscription

/** Any `StarsSubscriptionPricing`. */
export type TypeStarsSubscriptionPricing =
  | StarsSubscriptionPricing

/** Any `StarsTopupOption`. */
export type TypeStarsTopupOption =
  | StarsTopupOption

/** Any `StarsTransaction`. */
export type TypeStarsTransaction =
  | StarsTransaction

/** Any `StarsTransactionPeer`. */
export type TypeStarsTransactionPeer =
  | StarsTransactionPeer
  | StarsTransactionPeerAPI
  | StarsTransactionPeerAds
  | StarsTransactionPeerAppStore
  | StarsTransactionPeerFragment
  | StarsTransactionPeerPlayMarket
  | StarsTransactionPeerPremiumBot
  | StarsTransactionPeerUnsupported

/** Any `StatsAbsValueAndPrev`. */
export type TypeStatsAbsValueAndPrev =
  | StatsAbsValueAndPrev

/** Any `StatsDateRangeDays`. */
export type TypeStatsDateRangeDays =
  | StatsDateRangeDays

/** Any `StatsGraph`. */
export type TypeStatsGraph =
  | StatsGraph
  | StatsGraphAsync
  | StatsGraphError

/** Any `StatsGroupTopAdmin`. */
export type TypeStatsGroupTopAdmin =
  | StatsGroupTopAdmin

/** Any `StatsGroupTopInviter`. */
export type TypeStatsGroupTopInviter =
  | StatsGroupTopInviter

/** Any `StatsGroupTopPoster`. */
export type TypeStatsGroupTopPoster =
  | StatsGroupTopPoster

/** Any `StatsPercentValue`. */
export type TypeStatsPercentValue =
  | StatsPercentValue

/** Any `StatsURL`. */
export type TypeStatsURL =
  | StatsURL

/** Any `StickerKeyword`. */
export type TypeStickerKeyword =
  | StickerKeyword

/** Any `StickerPack`. */
export type TypeStickerPack =
  | StickerPack

/** Any `StickerSet`. */
export type TypeStickerSet =
  | StickerSet

/** Any `StickerSetCovered`. */
export type TypeStickerSetCovered =
  | StickerSetCovered
  | StickerSetFullCovered
  | StickerSetMultiCovered
  | StickerSetNoCovered

/** Any `StoriesStealthMode`. */
export type TypeStoriesStealthMode =
  | StoriesStealthMode

/** Any `StoryAlbum`. */
export type TypeStoryAlbum =
  | StoryAlbum

/** Any `StoryFwdHeader`. */
export type TypeStoryFwdHeader =
  | StoryFwdHeader

/** Any `StoryItem`. */
export type TypeStoryItem =
  | StoryItem
  | StoryItemDeleted
  | StoryItemSkipped

/** Any `StoryReaction`. */
export type TypeStoryReaction =
  | StoryReaction
  | StoryReactionPublicForward
  | StoryReactionPublicRepost

/** Any `StoryView`. */
export type TypeStoryView =
  | StoryView
  | StoryViewPublicForward
  | StoryViewPublicRepost

/** Any `StoryViews`. */
export type TypeStoryViews =
  | StoryViews

/** Any `SuggestedPost`. */
export type TypeSuggestedPost =
  | SuggestedPost
