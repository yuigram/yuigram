// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as messages$ from '../messages.js'
import type * as root_b$ from '../root/b.js'
import type * as root_c$ from '../root/c.js'
import type * as root_d$ from '../root/d.js'
import type * as root_f$ from '../root/f.js'
import type * as root_g$ from '../root/g.js'
import type * as root_i$ from '../root/i.js'
import type * as root_p$ from '../root/p.js'
import type * as root_r$ from '../root/r.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type * as root_w$ from '../root/w.js'
import type { TlObject } from '../../../../tl/object.js'

/** `maskCoords#aed6dbb2` */
export interface MaskCoords {
  readonly _: 'maskCoords'
  readonly n: number
  readonly x: number
  readonly y: number
  readonly zoom: number
}

/** `mediaAreaChannelPost#770416af` */
export interface MediaAreaChannelPost {
  readonly _: 'mediaAreaChannelPost'
  readonly coordinates: TypeMediaAreaCoordinates
  readonly channel_id: bigint
  readonly msg_id: number
}

/** `mediaAreaCoordinates#cfc9e002` */
export interface MediaAreaCoordinates {
  readonly _: 'mediaAreaCoordinates'
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly rotation: number
  readonly radius?: number
}

/** `mediaAreaGeoPoint#cad5452d` */
export interface MediaAreaGeoPoint {
  readonly _: 'mediaAreaGeoPoint'
  readonly coordinates: TypeMediaAreaCoordinates
  readonly geo: root_g$.TypeGeoPoint
  readonly address?: root_g$.TypeGeoPointAddress
}

/** `mediaAreaStarGift#5787686d` */
export interface MediaAreaStarGift {
  readonly _: 'mediaAreaStarGift'
  readonly coordinates: TypeMediaAreaCoordinates
  readonly slug: string
}

/** `mediaAreaSuggestedReaction#14455871` */
export interface MediaAreaSuggestedReaction {
  readonly _: 'mediaAreaSuggestedReaction'
  readonly dark?: true
  readonly flipped?: true
  readonly coordinates: TypeMediaAreaCoordinates
  readonly reaction: root_r$.TypeReaction
}

/** `mediaAreaUrl#37381085` */
export interface MediaAreaUrl {
  readonly _: 'mediaAreaUrl'
  readonly coordinates: TypeMediaAreaCoordinates
  readonly url: string
}

/** `mediaAreaVenue#be82db9c` */
export interface MediaAreaVenue {
  readonly _: 'mediaAreaVenue'
  readonly coordinates: TypeMediaAreaCoordinates
  readonly geo: root_g$.TypeGeoPoint
  readonly title: string
  readonly address: string
  readonly provider: string
  readonly venue_id: string
  readonly venue_type: string
}

/** `mediaAreaWeather#49a6549c` */
export interface MediaAreaWeather {
  readonly _: 'mediaAreaWeather'
  readonly coordinates: TypeMediaAreaCoordinates
  readonly emoji: string
  readonly temperature_c: number
  readonly color: number
}

/** `message#7600b9d3` */
export interface Message {
  readonly _: 'message'
  readonly out?: true
  readonly mentioned?: true
  readonly media_unread?: true
  readonly silent?: true
  readonly post?: true
  readonly from_scheduled?: true
  readonly legacy?: true
  readonly edit_hide?: true
  readonly pinned?: true
  readonly noforwards?: true
  readonly invert_media?: true
  readonly offline?: true
  readonly video_processing_pending?: true
  readonly paid_suggested_post_stars?: true
  readonly paid_suggested_post_ton?: true
  readonly id: number
  readonly from_id?: root_p$.TypePeer
  readonly from_boosts_applied?: number
  readonly from_rank?: string
  readonly peer_id: root_p$.TypePeer
  readonly saved_peer_id?: root_p$.TypePeer
  readonly fwd_from?: TypeMessageFwdHeader
  readonly via_bot_id?: bigint
  readonly via_business_bot_id?: bigint
  readonly guestchat_via_from?: root_p$.TypePeer
  readonly reply_to?: TypeMessageReplyHeader
  readonly date: number
  readonly message: string
  readonly media?: TypeMessageMedia
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly entities?: readonly TypeMessageEntity[]
  readonly views?: number
  readonly forwards?: number
  readonly replies?: TypeMessageReplies
  readonly edit_date?: number
  readonly post_author?: string
  readonly grouped_id?: bigint
  readonly reactions?: TypeMessageReactions
  readonly restriction_reason?: readonly root_r$.TypeRestrictionReason[]
  readonly ttl_period?: number
  readonly quick_reply_shortcut_id?: number
  readonly effect?: bigint
  readonly factcheck?: root_f$.TypeFactCheck
  readonly report_delivery_until_date?: number
  readonly paid_message_stars?: bigint
  readonly suggested_post?: root_s$.TypeSuggestedPost
  readonly schedule_repeat_period?: number
  readonly summary_from_language?: string
  readonly rich_message?: root_r$.TypeRichMessage
}

/** `messageActionBoostApply#cc02aa6d` */
export interface MessageActionBoostApply {
  readonly _: 'messageActionBoostApply'
  readonly boosts: number
}

/** `messageActionBotAllowed#c516d679` */
export interface MessageActionBotAllowed {
  readonly _: 'messageActionBotAllowed'
  readonly attach_menu?: true
  readonly from_request?: true
  readonly domain?: string
  readonly app?: root_b$.TypeBotApp
}

/** `messageActionChangeCommunity#5d20bae8` */
export interface MessageActionChangeCommunity {
  readonly _: 'messageActionChangeCommunity'
  readonly community_id?: bigint
}

/** `messageActionChangeCreator#e188503b` */
export interface MessageActionChangeCreator {
  readonly _: 'messageActionChangeCreator'
  readonly new_creator_id: bigint
}

/** `messageActionChannelCreate#95d2ac92` */
export interface MessageActionChannelCreate {
  readonly _: 'messageActionChannelCreate'
  readonly title: string
}

/** `messageActionChannelMigrateFrom#ea3948e9` */
export interface MessageActionChannelMigrateFrom {
  readonly _: 'messageActionChannelMigrateFrom'
  readonly title: string
  readonly chat_id: bigint
}

/** `messageActionChatAddUser#15cefd00` */
export interface MessageActionChatAddUser {
  readonly _: 'messageActionChatAddUser'
  readonly users: readonly bigint[]
}

/** `messageActionChatCreate#bd47cbad` */
export interface MessageActionChatCreate {
  readonly _: 'messageActionChatCreate'
  readonly title: string
  readonly users: readonly bigint[]
}

/** `messageActionChatDeletePhoto#95e3fbef` */
export interface MessageActionChatDeletePhoto {
  readonly _: 'messageActionChatDeletePhoto'
}

/** `messageActionChatDeleteUser#a43f30cc` */
export interface MessageActionChatDeleteUser {
  readonly _: 'messageActionChatDeleteUser'
  readonly user_id: bigint
}

/** `messageActionChatEditPhoto#7fcb13a8` */
export interface MessageActionChatEditPhoto {
  readonly _: 'messageActionChatEditPhoto'
  readonly photo: root_p$.TypePhoto
}

/** `messageActionChatEditTitle#b5a1ce5a` */
export interface MessageActionChatEditTitle {
  readonly _: 'messageActionChatEditTitle'
  readonly title: string
}

/** `messageActionChatJoinedByLink#031224c3` */
export interface MessageActionChatJoinedByLink {
  readonly _: 'messageActionChatJoinedByLink'
  readonly inviter_id: bigint
}

/** `messageActionChatJoinedByRequest#ebbca3cb` */
export interface MessageActionChatJoinedByRequest {
  readonly _: 'messageActionChatJoinedByRequest'
}

/** `messageActionChatJoinedViaCommunity#4a8bfe80` */
export interface MessageActionChatJoinedViaCommunity {
  readonly _: 'messageActionChatJoinedViaCommunity'
  readonly community_id: bigint
}

/** `messageActionChatMigrateTo#e1037f92` */
export interface MessageActionChatMigrateTo {
  readonly _: 'messageActionChatMigrateTo'
  readonly channel_id: bigint
}

/** `messageActionConferenceCall#2ffe2f7a` */
export interface MessageActionConferenceCall {
  readonly _: 'messageActionConferenceCall'
  readonly missed?: true
  readonly active?: true
  readonly video?: true
  readonly call_id: bigint
  readonly duration?: number
  readonly other_participants?: readonly root_p$.TypePeer[]
}

/** `messageActionContactSignUp#f3f25f76` */
export interface MessageActionContactSignUp {
  readonly _: 'messageActionContactSignUp'
}

/** `messageActionCustomAction#fae69f56` */
export interface MessageActionCustomAction {
  readonly _: 'messageActionCustomAction'
  readonly message: string
}

/** `messageActionEmpty#b6aef7b0` */
export interface MessageActionEmpty {
  readonly _: 'messageActionEmpty'
}

/** `messageActionGameScore#92a72876` */
export interface MessageActionGameScore {
  readonly _: 'messageActionGameScore'
  readonly game_id: bigint
  readonly score: number
}

/** `messageActionGeoProximityReached#98e0d697` */
export interface MessageActionGeoProximityReached {
  readonly _: 'messageActionGeoProximityReached'
  readonly from_id: root_p$.TypePeer
  readonly to_id: root_p$.TypePeer
  readonly distance: number
}

/** `messageActionGiftCode#31c48347` */
export interface MessageActionGiftCode {
  readonly _: 'messageActionGiftCode'
  readonly via_giveaway?: true
  readonly unclaimed?: true
  readonly boost_peer?: root_p$.TypePeer
  readonly days: number
  readonly slug: string
  readonly currency?: string
  readonly amount?: bigint
  readonly crypto_currency?: string
  readonly crypto_amount?: bigint
  readonly message?: root_t$.TypeTextWithEntities
}

/** `messageActionGiftPremium#48e91302` */
export interface MessageActionGiftPremium {
  readonly _: 'messageActionGiftPremium'
  readonly currency: string
  readonly amount: bigint
  readonly days: number
  readonly crypto_currency?: string
  readonly crypto_amount?: bigint
  readonly message?: root_t$.TypeTextWithEntities
}

/** `messageActionGiftStars#45d5b021` */
export interface MessageActionGiftStars {
  readonly _: 'messageActionGiftStars'
  readonly currency: string
  readonly amount: bigint
  readonly stars: bigint
  readonly crypto_currency?: string
  readonly crypto_amount?: bigint
  readonly transaction_id?: string
}

/** `messageActionGiftTon#a8a3c699` */
export interface MessageActionGiftTon {
  readonly _: 'messageActionGiftTon'
  readonly currency: string
  readonly amount: bigint
  readonly crypto_currency: string
  readonly crypto_amount: bigint
  readonly transaction_id?: string
}

/** `messageActionGiveawayLaunch#a80f51e4` */
export interface MessageActionGiveawayLaunch {
  readonly _: 'messageActionGiveawayLaunch'
  readonly stars?: bigint
}

/** `messageActionGiveawayResults#87e2f155` */
export interface MessageActionGiveawayResults {
  readonly _: 'messageActionGiveawayResults'
  readonly stars?: true
  readonly winners_count: number
  readonly unclaimed_count: number
}

/** `messageActionGroupCall#7a0d7f42` */
export interface MessageActionGroupCall {
  readonly _: 'messageActionGroupCall'
  readonly call: root_i$.TypeInputGroupCall
  readonly duration?: number
}

/** `messageActionGroupCallScheduled#b3a07661` */
export interface MessageActionGroupCallScheduled {
  readonly _: 'messageActionGroupCallScheduled'
  readonly call: root_i$.TypeInputGroupCall
  readonly schedule_date: number
}

/** `messageActionHistoryClear#9fbab604` */
export interface MessageActionHistoryClear {
  readonly _: 'messageActionHistoryClear'
}

/** `messageActionInviteToGroupCall#502f92f7` */
export interface MessageActionInviteToGroupCall {
  readonly _: 'messageActionInviteToGroupCall'
  readonly call: root_i$.TypeInputGroupCall
  readonly users: readonly bigint[]
}

/** `messageActionManagedBotCreated#16605e3e` */
export interface MessageActionManagedBotCreated {
  readonly _: 'messageActionManagedBotCreated'
  readonly bot_id: bigint
}

/** `messageActionNewCreatorPending#b07ed085` */
export interface MessageActionNewCreatorPending {
  readonly _: 'messageActionNewCreatorPending'
  readonly new_creator_id: bigint
}

/** `messageActionNoForwardsRequest#3e2793ba` */
export interface MessageActionNoForwardsRequest {
  readonly _: 'messageActionNoForwardsRequest'
  readonly expired?: true
  readonly prev_value: boolean
  readonly new_value: boolean
}

/** `messageActionNoForwardsToggle#bf7d6572` */
export interface MessageActionNoForwardsToggle {
  readonly _: 'messageActionNoForwardsToggle'
  readonly prev_value: boolean
  readonly new_value: boolean
}

/** `messageActionPaidMessagesPrice#84b88578` */
export interface MessageActionPaidMessagesPrice {
  readonly _: 'messageActionPaidMessagesPrice'
  readonly broadcast_messages_allowed?: true
  readonly stars: bigint
}

/** `messageActionPaidMessagesRefunded#ac1f1fcd` */
export interface MessageActionPaidMessagesRefunded {
  readonly _: 'messageActionPaidMessagesRefunded'
  readonly count: number
  readonly stars: bigint
}

/** `messageActionPaymentRefunded#41b3e202` */
export interface MessageActionPaymentRefunded {
  readonly _: 'messageActionPaymentRefunded'
  readonly peer: root_p$.TypePeer
  readonly currency: string
  readonly total_amount: bigint
  readonly payload?: Uint8Array
  readonly charge: root_p$.TypePaymentCharge
}

/** `messageActionPaymentSent#c624b16e` */
export interface MessageActionPaymentSent {
  readonly _: 'messageActionPaymentSent'
  readonly recurring_init?: true
  readonly recurring_used?: true
  readonly currency: string
  readonly total_amount: bigint
  readonly invoice_slug?: string
  readonly subscription_until_date?: number
}

/** `messageActionPaymentSentMe#ffa00ccc` */
export interface MessageActionPaymentSentMe {
  readonly _: 'messageActionPaymentSentMe'
  readonly recurring_init?: true
  readonly recurring_used?: true
  readonly currency: string
  readonly total_amount: bigint
  readonly payload: Uint8Array
  readonly info?: root_p$.TypePaymentRequestedInfo
  readonly shipping_option_id?: string
  readonly charge: root_p$.TypePaymentCharge
  readonly subscription_until_date?: number
}

/** `messageActionPhoneCall#80e11a7f` */
export interface MessageActionPhoneCall {
  readonly _: 'messageActionPhoneCall'
  readonly video?: true
  readonly call_id: bigint
  readonly reason?: root_p$.TypePhoneCallDiscardReason
  readonly duration?: number
}

/** `messageActionPinMessage#94bd38ed` */
export interface MessageActionPinMessage {
  readonly _: 'messageActionPinMessage'
}

/** `messageActionPollAppendAnswer#9da1cd6c` */
export interface MessageActionPollAppendAnswer {
  readonly _: 'messageActionPollAppendAnswer'
  readonly answer: root_p$.TypePollAnswer
}

/** `messageActionPollDeleteAnswer#399674dc` */
export interface MessageActionPollDeleteAnswer {
  readonly _: 'messageActionPollDeleteAnswer'
  readonly answer: root_p$.TypePollAnswer
}

/** `messageActionPrizeStars#b00c47a2` */
export interface MessageActionPrizeStars {
  readonly _: 'messageActionPrizeStars'
  readonly unclaimed?: true
  readonly stars: bigint
  readonly transaction_id: string
  readonly boost_peer: root_p$.TypePeer
  readonly giveaway_msg_id: number
}

/** `messageActionRequestedPeer#31518e9b` */
export interface MessageActionRequestedPeer {
  readonly _: 'messageActionRequestedPeer'
  readonly button_id: number
  readonly peers: readonly root_p$.TypePeer[]
}

/** `messageActionRequestedPeerSentMe#93b31848` */
export interface MessageActionRequestedPeerSentMe {
  readonly _: 'messageActionRequestedPeerSentMe'
  readonly button_id: number
  readonly peers: readonly root_r$.TypeRequestedPeer[]
}

/** `messageActionScreenshotTaken#4792929b` */
export interface MessageActionScreenshotTaken {
  readonly _: 'messageActionScreenshotTaken'
}

/** `messageActionSecureValuesSent#d95c6154` */
export interface MessageActionSecureValuesSent {
  readonly _: 'messageActionSecureValuesSent'
  readonly types: readonly root_s$.TypeSecureValueType[]
}

/** `messageActionSecureValuesSentMe#1b287353` */
export interface MessageActionSecureValuesSentMe {
  readonly _: 'messageActionSecureValuesSentMe'
  readonly values: readonly root_s$.TypeSecureValue[]
  readonly credentials: root_s$.TypeSecureCredentialsEncrypted
}

/** `messageActionSetChatTheme#b91bbd3a` */
export interface MessageActionSetChatTheme {
  readonly _: 'messageActionSetChatTheme'
  readonly theme: root_c$.TypeChatTheme
}

/** `messageActionSetChatWallPaper#5060a3f4` */
export interface MessageActionSetChatWallPaper {
  readonly _: 'messageActionSetChatWallPaper'
  readonly same?: true
  readonly for_both?: true
  readonly wallpaper: root_w$.TypeWallPaper
}

/** `messageActionSetMessagesTTL#3c134d7b` */
export interface MessageActionSetMessagesTTL {
  readonly _: 'messageActionSetMessagesTTL'
  readonly period: number
  readonly auto_setting_from?: bigint
}

/** `messageActionStarGift#ea2c31d3` */
export interface MessageActionStarGift {
  readonly _: 'messageActionStarGift'
  readonly name_hidden?: true
  readonly saved?: true
  readonly converted?: true
  readonly upgraded?: true
  readonly refunded?: true
  readonly can_upgrade?: true
  readonly prepaid_upgrade?: true
  readonly upgrade_separate?: true
  readonly auction_acquired?: true
  readonly gift: root_s$.TypeStarGift
  readonly message?: root_t$.TypeTextWithEntities
  readonly convert_stars?: bigint
  readonly upgrade_msg_id?: number
  readonly upgrade_stars?: bigint
  readonly from_id?: root_p$.TypePeer
  readonly peer?: root_p$.TypePeer
  readonly saved_id?: bigint
  readonly prepaid_upgrade_hash?: string
  readonly gift_msg_id?: number
  readonly to_id?: root_p$.TypePeer
  readonly gift_num?: number
}

/** `messageActionStarGiftPurchaseOffer#774278d4` */
export interface MessageActionStarGiftPurchaseOffer {
  readonly _: 'messageActionStarGiftPurchaseOffer'
  readonly accepted?: true
  readonly declined?: true
  readonly gift: root_s$.TypeStarGift
  readonly price: root_s$.TypeStarsAmount
  readonly expires_at: number
}

/** `messageActionStarGiftPurchaseOfferDeclined#73ada76b` */
export interface MessageActionStarGiftPurchaseOfferDeclined {
  readonly _: 'messageActionStarGiftPurchaseOfferDeclined'
  readonly expired?: true
  readonly gift: root_s$.TypeStarGift
  readonly price: root_s$.TypeStarsAmount
}

/** `messageActionStarGiftUnique#7e1c1187` */
export interface MessageActionStarGiftUnique {
  readonly _: 'messageActionStarGiftUnique'
  readonly upgrade?: true
  readonly transferred?: true
  readonly saved?: true
  readonly refunded?: true
  readonly prepaid_upgrade?: true
  readonly assigned?: true
  readonly from_offer?: true
  readonly craft?: true
  readonly name_hidden?: true
  readonly gift: root_s$.TypeStarGift
  readonly can_export_at?: number
  readonly transfer_stars?: bigint
  readonly from_id?: root_p$.TypePeer
  readonly peer?: root_p$.TypePeer
  readonly saved_id?: bigint
  readonly resale_amount?: root_s$.TypeStarsAmount
  readonly can_transfer_at?: number
  readonly can_resell_at?: number
  readonly drop_original_details_stars?: bigint
  readonly can_craft_at?: number
  readonly message?: root_t$.TypeTextWithEntities
}

/** `messageActionSuggestBirthday#2c8f2a25` */
export interface MessageActionSuggestBirthday {
  readonly _: 'messageActionSuggestBirthday'
  readonly birthday: root_b$.TypeBirthday
}

/** `messageActionSuggestProfilePhoto#57de635e` */
export interface MessageActionSuggestProfilePhoto {
  readonly _: 'messageActionSuggestProfilePhoto'
  readonly photo: root_p$.TypePhoto
}

/** `messageActionSuggestedPostApproval#ee7a1596` */
export interface MessageActionSuggestedPostApproval {
  readonly _: 'messageActionSuggestedPostApproval'
  readonly rejected?: true
  readonly balance_too_low?: true
  readonly reject_comment?: string
  readonly schedule_date?: number
  readonly price?: root_s$.TypeStarsAmount
}

/** `messageActionSuggestedPostRefund#69f916f8` */
export interface MessageActionSuggestedPostRefund {
  readonly _: 'messageActionSuggestedPostRefund'
  readonly payer_initiated?: true
}

/** `messageActionSuggestedPostSuccess#95ddcf69` */
export interface MessageActionSuggestedPostSuccess {
  readonly _: 'messageActionSuggestedPostSuccess'
  readonly price: root_s$.TypeStarsAmount
}

/** `messageActionTodoAppendTasks#c7edbc83` */
export interface MessageActionTodoAppendTasks {
  readonly _: 'messageActionTodoAppendTasks'
  readonly list: readonly root_t$.TypeTodoItem[]
}

/** `messageActionTodoCompletions#cc7c5c89` */
export interface MessageActionTodoCompletions {
  readonly _: 'messageActionTodoCompletions'
  readonly completed: readonly number[]
  readonly incompleted: readonly number[]
}

/** `messageActionTopicCreate#0d999256` */
export interface MessageActionTopicCreate {
  readonly _: 'messageActionTopicCreate'
  readonly title_missing?: true
  readonly title: string
  readonly icon_color: number
  readonly icon_emoji_id?: bigint
}

/** `messageActionTopicEdit#c0944820` */
export interface MessageActionTopicEdit {
  readonly _: 'messageActionTopicEdit'
  readonly title?: string
  readonly icon_emoji_id?: bigint
  readonly closed?: boolean
  readonly hidden?: boolean
}

/** `messageActionWebViewDataSent#b4c38cb5` */
export interface MessageActionWebViewDataSent {
  readonly _: 'messageActionWebViewDataSent'
  readonly text: string
}

/** `messageActionWebViewDataSentMe#47dd8079` */
export interface MessageActionWebViewDataSentMe {
  readonly _: 'messageActionWebViewDataSentMe'
  readonly text: string
  readonly data: string
}

/** `messageEmpty#90a6ca84` */
export interface MessageEmpty {
  readonly _: 'messageEmpty'
  readonly id: number
  readonly peer_id?: root_p$.TypePeer
}

/** `messageEntityBankCard#761e6af4` */
export interface MessageEntityBankCard {
  readonly _: 'messageEntityBankCard'
  readonly offset: number
  readonly length: number
}

/** `messageEntityBlockquote#f1ccaaac` */
export interface MessageEntityBlockquote {
  readonly _: 'messageEntityBlockquote'
  readonly collapsed?: true
  readonly offset: number
  readonly length: number
}

/** `messageEntityBold#bd610bc9` */
export interface MessageEntityBold {
  readonly _: 'messageEntityBold'
  readonly offset: number
  readonly length: number
}

/** `messageEntityBotCommand#6cef8ac7` */
export interface MessageEntityBotCommand {
  readonly _: 'messageEntityBotCommand'
  readonly offset: number
  readonly length: number
}

/** `messageEntityCashtag#4c4e743f` */
export interface MessageEntityCashtag {
  readonly _: 'messageEntityCashtag'
  readonly offset: number
  readonly length: number
}

/** `messageEntityCode#28a20571` */
export interface MessageEntityCode {
  readonly _: 'messageEntityCode'
  readonly offset: number
  readonly length: number
}

/** `messageEntityCustomEmoji#c8cf05f8` */
export interface MessageEntityCustomEmoji {
  readonly _: 'messageEntityCustomEmoji'
  readonly offset: number
  readonly length: number
  readonly document_id: bigint
}

/** `messageEntityDiffDelete#0652c1c5` */
export interface MessageEntityDiffDelete {
  readonly _: 'messageEntityDiffDelete'
  readonly offset: number
  readonly length: number
}

/** `messageEntityDiffInsert#71777116` */
export interface MessageEntityDiffInsert {
  readonly _: 'messageEntityDiffInsert'
  readonly offset: number
  readonly length: number
}

/** `messageEntityDiffReplace#c6c1e5a7` */
export interface MessageEntityDiffReplace {
  readonly _: 'messageEntityDiffReplace'
  readonly offset: number
  readonly length: number
  readonly old_text: string
}

/** `messageEntityEmail#64e475c2` */
export interface MessageEntityEmail {
  readonly _: 'messageEntityEmail'
  readonly offset: number
  readonly length: number
}

/** `messageEntityFormattedDate#904ac7c7` */
export interface MessageEntityFormattedDate {
  readonly _: 'messageEntityFormattedDate'
  readonly relative?: true
  readonly short_time?: true
  readonly long_time?: true
  readonly short_date?: true
  readonly long_date?: true
  readonly day_of_week?: true
  readonly offset: number
  readonly length: number
  readonly date: number
}

/** `messageEntityHashtag#6f635b0d` */
export interface MessageEntityHashtag {
  readonly _: 'messageEntityHashtag'
  readonly offset: number
  readonly length: number
}

/** `messageEntityItalic#826f8b60` */
export interface MessageEntityItalic {
  readonly _: 'messageEntityItalic'
  readonly offset: number
  readonly length: number
}

/** `messageEntityMention#fa04579d` */
export interface MessageEntityMention {
  readonly _: 'messageEntityMention'
  readonly offset: number
  readonly length: number
}

/** `messageEntityMentionName#dc7b1140` */
export interface MessageEntityMentionName {
  readonly _: 'messageEntityMentionName'
  readonly offset: number
  readonly length: number
  readonly user_id: bigint
}

/** `messageEntityPhone#9b69e34b` */
export interface MessageEntityPhone {
  readonly _: 'messageEntityPhone'
  readonly offset: number
  readonly length: number
}

/** `messageEntityPre#73924be0` */
export interface MessageEntityPre {
  readonly _: 'messageEntityPre'
  readonly offset: number
  readonly length: number
  readonly language: string
}

/** `messageEntitySpoiler#32ca960f` */
export interface MessageEntitySpoiler {
  readonly _: 'messageEntitySpoiler'
  readonly offset: number
  readonly length: number
}

/** `messageEntityStrike#bf0693d4` */
export interface MessageEntityStrike {
  readonly _: 'messageEntityStrike'
  readonly offset: number
  readonly length: number
}

/** `messageEntityTextUrl#76a6d327` */
export interface MessageEntityTextUrl {
  readonly _: 'messageEntityTextUrl'
  readonly offset: number
  readonly length: number
  readonly url: string
}

/** `messageEntityUnderline#9c4e7e8b` */
export interface MessageEntityUnderline {
  readonly _: 'messageEntityUnderline'
  readonly offset: number
  readonly length: number
}

/** `messageEntityUnknown#bb92ba95` */
export interface MessageEntityUnknown {
  readonly _: 'messageEntityUnknown'
  readonly offset: number
  readonly length: number
}

/** `messageEntityUrl#6ed02538` */
export interface MessageEntityUrl {
  readonly _: 'messageEntityUrl'
  readonly offset: number
  readonly length: number
}

/** `messageExtendedMedia#ee479c64` */
export interface MessageExtendedMedia {
  readonly _: 'messageExtendedMedia'
  readonly media: TypeMessageMedia
}

/** `messageExtendedMediaPreview#ad628cc8` */
export interface MessageExtendedMediaPreview {
  readonly _: 'messageExtendedMediaPreview'
  readonly w?: number
  readonly h?: number
  readonly thumb?: root_p$.TypePhotoSize
  readonly video_duration?: number
}

/** `messageFwdHeader#4e4df4bb` */
export interface MessageFwdHeader {
  readonly _: 'messageFwdHeader'
  readonly imported?: true
  readonly saved_out?: true
  readonly from_id?: root_p$.TypePeer
  readonly from_name?: string
  readonly date: number
  readonly channel_post?: number
  readonly post_author?: string
  readonly saved_from_peer?: root_p$.TypePeer
  readonly saved_from_msg_id?: number
  readonly saved_from_id?: root_p$.TypePeer
  readonly saved_from_name?: string
  readonly saved_date?: number
  readonly psa_type?: string
}

/** `messageMediaContact#70322949` */
export interface MessageMediaContact {
  readonly _: 'messageMediaContact'
  readonly phone_number: string
  readonly first_name: string
  readonly last_name: string
  readonly vcard: string
  readonly user_id: bigint
}

/** `messageMediaDice#08cbec07` */
export interface MessageMediaDice {
  readonly _: 'messageMediaDice'
  readonly value: number
  readonly emoticon: string
  readonly game_outcome?: messages$.TypeEmojiGameOutcome
}

/** `messageMediaDocument#52d8ccd9` */
export interface MessageMediaDocument {
  readonly _: 'messageMediaDocument'
  readonly nopremium?: true
  readonly spoiler?: true
  readonly video?: true
  readonly round?: true
  readonly voice?: true
  readonly document?: root_d$.TypeDocument
  readonly alt_documents?: readonly root_d$.TypeDocument[]
  readonly video_cover?: root_p$.TypePhoto
  readonly video_timestamp?: number
  readonly ttl_seconds?: number
}

/** `messageMediaEmpty#3ded6320` */
export interface MessageMediaEmpty {
  readonly _: 'messageMediaEmpty'
}

/** `messageMediaGame#fdb19008` */
export interface MessageMediaGame {
  readonly _: 'messageMediaGame'
  readonly game: root_g$.TypeGame
}

/** `messageMediaGeo#56e0d474` */
export interface MessageMediaGeo {
  readonly _: 'messageMediaGeo'
  readonly geo: root_g$.TypeGeoPoint
}

/** `messageMediaGeoLive#b940c666` */
export interface MessageMediaGeoLive {
  readonly _: 'messageMediaGeoLive'
  readonly geo: root_g$.TypeGeoPoint
  readonly heading?: number
  readonly period: number
  readonly proximity_notification_radius?: number
}

/** `messageMediaGiveaway#aa073beb` */
export interface MessageMediaGiveaway {
  readonly _: 'messageMediaGiveaway'
  readonly only_new_subscribers?: true
  readonly winners_are_visible?: true
  readonly channels: readonly bigint[]
  readonly countries_iso2?: readonly string[]
  readonly prize_description?: string
  readonly quantity: number
  readonly months?: number
  readonly stars?: bigint
  readonly until_date: number
}

/** `messageMediaGiveawayResults#ceaa3ea1` */
export interface MessageMediaGiveawayResults {
  readonly _: 'messageMediaGiveawayResults'
  readonly only_new_subscribers?: true
  readonly refunded?: true
  readonly channel_id: bigint
  readonly additional_peers_count?: number
  readonly launch_msg_id: number
  readonly winners_count: number
  readonly unclaimed_count: number
  readonly winners: readonly bigint[]
  readonly months?: number
  readonly stars?: bigint
  readonly prize_description?: string
  readonly until_date: number
}

/** `messageMediaInvoice#f6a548d3` */
export interface MessageMediaInvoice {
  readonly _: 'messageMediaInvoice'
  readonly shipping_address_requested?: true
  readonly test?: true
  readonly title: string
  readonly description: string
  readonly photo?: root_w$.TypeWebDocument
  readonly receipt_msg_id?: number
  readonly currency: string
  readonly total_amount: bigint
  readonly start_param: string
  readonly extended_media?: TypeMessageExtendedMedia
}

/** `messageMediaPaidMedia#a8852491` */
export interface MessageMediaPaidMedia {
  readonly _: 'messageMediaPaidMedia'
  readonly stars_amount: bigint
  readonly extended_media: readonly TypeMessageExtendedMedia[]
}

/** `messageMediaPhoto#e216eb63` */
export interface MessageMediaPhoto {
  readonly _: 'messageMediaPhoto'
  readonly spoiler?: true
  readonly live_photo?: true
  readonly photo?: root_p$.TypePhoto
  readonly ttl_seconds?: number
  readonly video?: root_d$.TypeDocument
}

/** `messageMediaPoll#773f4e66` */
export interface MessageMediaPoll {
  readonly _: 'messageMediaPoll'
  readonly poll: root_p$.TypePoll
  readonly results: root_p$.TypePollResults
  readonly attached_media?: TypeMessageMedia
}

/** `messageMediaStory#68cb6283` */
export interface MessageMediaStory {
  readonly _: 'messageMediaStory'
  readonly via_mention?: true
  readonly peer: root_p$.TypePeer
  readonly id: number
  readonly story?: root_s$.TypeStoryItem
}

/** `messageMediaToDo#8a53b014` */
export interface MessageMediaToDo {
  readonly _: 'messageMediaToDo'
  readonly todo: root_t$.TypeTodoList
  readonly completions?: readonly root_t$.TypeTodoCompletion[]
}

/** `messageMediaUnsupported#9f84f49e` */
export interface MessageMediaUnsupported {
  readonly _: 'messageMediaUnsupported'
}

/** `messageMediaVenue#2ec0533f` */
export interface MessageMediaVenue {
  readonly _: 'messageMediaVenue'
  readonly geo: root_g$.TypeGeoPoint
  readonly title: string
  readonly address: string
  readonly provider: string
  readonly venue_id: string
  readonly venue_type: string
}

/** `messageMediaVideoStream#ca5cab89` */
export interface MessageMediaVideoStream {
  readonly _: 'messageMediaVideoStream'
  readonly rtmp_stream?: true
  readonly call: root_i$.TypeInputGroupCall
}

/** `messageMediaWebPage#ddf10c3b` */
export interface MessageMediaWebPage {
  readonly _: 'messageMediaWebPage'
  readonly force_large_media?: true
  readonly force_small_media?: true
  readonly manual?: true
  readonly safe?: true
  readonly webpage: root_w$.TypeWebPage
}

/** `messagePeerReaction#8c79b63c` */
export interface MessagePeerReaction {
  readonly _: 'messagePeerReaction'
  readonly big?: true
  readonly unread?: true
  readonly my?: true
  readonly peer_id: root_p$.TypePeer
  readonly date: number
  readonly reaction: root_r$.TypeReaction
}

/** `messagePeerVote#b6cc2d5c` */
export interface MessagePeerVote {
  readonly _: 'messagePeerVote'
  readonly peer: root_p$.TypePeer
  readonly option: Uint8Array
  readonly date: number
}

/** `messagePeerVoteInputOption#74cda504` */
export interface MessagePeerVoteInputOption {
  readonly _: 'messagePeerVoteInputOption'
  readonly peer: root_p$.TypePeer
  readonly date: number
}

/** `messagePeerVoteMultiple#4628f6e6` */
export interface MessagePeerVoteMultiple {
  readonly _: 'messagePeerVoteMultiple'
  readonly peer: root_p$.TypePeer
  readonly options: readonly Uint8Array[]
  readonly date: number
}

/** `messageRange#0ae30253` */
export interface MessageRange {
  readonly _: 'messageRange'
  readonly min_id: number
  readonly max_id: number
}

/** `messageReactions#0a339f0b` */
export interface MessageReactions {
  readonly _: 'messageReactions'
  readonly min?: true
  readonly can_see_list?: true
  readonly reactions_as_tags?: true
  readonly results: readonly root_r$.TypeReactionCount[]
  readonly recent_reactions?: readonly TypeMessagePeerReaction[]
  readonly top_reactors?: readonly TypeMessageReactor[]
}

/** `messageReactor#4ba3a95a` */
export interface MessageReactor {
  readonly _: 'messageReactor'
  readonly top?: true
  readonly my?: true
  readonly anonymous?: true
  readonly peer_id?: root_p$.TypePeer
  readonly count: number
}

/** `messageReplies#83d60fc2` */
export interface MessageReplies {
  readonly _: 'messageReplies'
  readonly comments?: true
  readonly replies: number
  readonly replies_pts: number
  readonly recent_repliers?: readonly root_p$.TypePeer[]
  readonly channel_id?: bigint
  readonly max_id?: number
  readonly read_max_id?: number
}

/** `messageReplyHeader#1b97dd66` */
export interface MessageReplyHeader {
  readonly _: 'messageReplyHeader'
  readonly reply_to_scheduled?: true
  readonly forum_topic?: true
  readonly quote?: true
  readonly reply_to_ephemeral?: true
  readonly reply_to_msg_id?: number
  readonly reply_to_peer_id?: root_p$.TypePeer
  readonly reply_from?: TypeMessageFwdHeader
  readonly reply_media?: TypeMessageMedia
  readonly reply_to_top_id?: number
  readonly quote_text?: string
  readonly quote_entities?: readonly TypeMessageEntity[]
  readonly quote_offset?: number
  readonly todo_item_id?: number
  readonly poll_option?: Uint8Array
}

/** `messageReplyStoryHeader#0e5af939` */
export interface MessageReplyStoryHeader {
  readonly _: 'messageReplyStoryHeader'
  readonly peer: root_p$.TypePeer
  readonly story_id: number
}

/** `messageReportOption#7903e3d9` */
export interface MessageReportOption {
  readonly _: 'messageReportOption'
  readonly text: string
  readonly option: Uint8Array
}

/** `messageService#7a800e0a` */
export interface MessageService {
  readonly _: 'messageService'
  readonly out?: true
  readonly mentioned?: true
  readonly media_unread?: true
  readonly reactions_are_possible?: true
  readonly silent?: true
  readonly post?: true
  readonly legacy?: true
  readonly id: number
  readonly from_id?: root_p$.TypePeer
  readonly peer_id: root_p$.TypePeer
  readonly saved_peer_id?: root_p$.TypePeer
  readonly reply_to?: TypeMessageReplyHeader
  readonly date: number
  readonly action: TypeMessageAction
  readonly reactions?: TypeMessageReactions
  readonly ttl_period?: number
}

/** `messageViews#455b853d` */
export interface MessageViews {
  readonly _: 'messageViews'
  readonly views?: number
  readonly forwards?: number
  readonly replies?: TypeMessageReplies
}

/** `missingInvitee#628c9224` */
export interface MissingInvitee {
  readonly _: 'missingInvitee'
  readonly premium_would_allow_invite?: true
  readonly premium_required_for_pm?: true
  readonly user_id: bigint
}

/** `monoForumDialog#64407ea7` */
export interface MonoForumDialog {
  readonly _: 'monoForumDialog'
  readonly unread_mark?: true
  readonly nopaid_messages_exception?: true
  readonly peer: root_p$.TypePeer
  readonly top_message: number
  readonly read_inbox_max_id: number
  readonly read_outbox_max_id: number
  readonly unread_count: number
  readonly unread_reactions_count: number
  readonly draft?: root_d$.TypeDraftMessage
}

/** `myBoost#c448415c` */
export interface MyBoost {
  readonly _: 'myBoost'
  readonly slot: number
  readonly peer?: root_p$.TypePeer
  readonly date: number
  readonly expires: number
  readonly cooldown_until_date?: number
}

/** Any `MaskCoords`. */
export type TypeMaskCoords =
  | MaskCoords

/** Any `MediaArea`. */
export type TypeMediaArea =
  | root_i$.InputMediaAreaChannelPost
  | root_i$.InputMediaAreaVenue
  | MediaAreaChannelPost
  | MediaAreaGeoPoint
  | MediaAreaStarGift
  | MediaAreaSuggestedReaction
  | MediaAreaUrl
  | MediaAreaVenue
  | MediaAreaWeather

/** Any `MediaAreaCoordinates`. */
export type TypeMediaAreaCoordinates =
  | MediaAreaCoordinates

/** Any `Message`. */
export type TypeMessage =
  | Message
  | MessageEmpty
  | MessageService

/** Any `MessageAction`. */
export type TypeMessageAction =
  | MessageActionBoostApply
  | MessageActionBotAllowed
  | MessageActionChangeCommunity
  | MessageActionChangeCreator
  | MessageActionChannelCreate
  | MessageActionChannelMigrateFrom
  | MessageActionChatAddUser
  | MessageActionChatCreate
  | MessageActionChatDeletePhoto
  | MessageActionChatDeleteUser
  | MessageActionChatEditPhoto
  | MessageActionChatEditTitle
  | MessageActionChatJoinedByLink
  | MessageActionChatJoinedByRequest
  | MessageActionChatJoinedViaCommunity
  | MessageActionChatMigrateTo
  | MessageActionConferenceCall
  | MessageActionContactSignUp
  | MessageActionCustomAction
  | MessageActionEmpty
  | MessageActionGameScore
  | MessageActionGeoProximityReached
  | MessageActionGiftCode
  | MessageActionGiftPremium
  | MessageActionGiftStars
  | MessageActionGiftTon
  | MessageActionGiveawayLaunch
  | MessageActionGiveawayResults
  | MessageActionGroupCall
  | MessageActionGroupCallScheduled
  | MessageActionHistoryClear
  | MessageActionInviteToGroupCall
  | MessageActionManagedBotCreated
  | MessageActionNewCreatorPending
  | MessageActionNoForwardsRequest
  | MessageActionNoForwardsToggle
  | MessageActionPaidMessagesPrice
  | MessageActionPaidMessagesRefunded
  | MessageActionPaymentRefunded
  | MessageActionPaymentSent
  | MessageActionPaymentSentMe
  | MessageActionPhoneCall
  | MessageActionPinMessage
  | MessageActionPollAppendAnswer
  | MessageActionPollDeleteAnswer
  | MessageActionPrizeStars
  | MessageActionRequestedPeer
  | MessageActionRequestedPeerSentMe
  | MessageActionScreenshotTaken
  | MessageActionSecureValuesSent
  | MessageActionSecureValuesSentMe
  | MessageActionSetChatTheme
  | MessageActionSetChatWallPaper
  | MessageActionSetMessagesTTL
  | MessageActionStarGift
  | MessageActionStarGiftPurchaseOffer
  | MessageActionStarGiftPurchaseOfferDeclined
  | MessageActionStarGiftUnique
  | MessageActionSuggestBirthday
  | MessageActionSuggestProfilePhoto
  | MessageActionSuggestedPostApproval
  | MessageActionSuggestedPostRefund
  | MessageActionSuggestedPostSuccess
  | MessageActionTodoAppendTasks
  | MessageActionTodoCompletions
  | MessageActionTopicCreate
  | MessageActionTopicEdit
  | MessageActionWebViewDataSent
  | MessageActionWebViewDataSentMe

/** Any `MessageEntity`. */
export type TypeMessageEntity =
  | root_i$.InputMessageEntityMentionName
  | MessageEntityBankCard
  | MessageEntityBlockquote
  | MessageEntityBold
  | MessageEntityBotCommand
  | MessageEntityCashtag
  | MessageEntityCode
  | MessageEntityCustomEmoji
  | MessageEntityDiffDelete
  | MessageEntityDiffInsert
  | MessageEntityDiffReplace
  | MessageEntityEmail
  | MessageEntityFormattedDate
  | MessageEntityHashtag
  | MessageEntityItalic
  | MessageEntityMention
  | MessageEntityMentionName
  | MessageEntityPhone
  | MessageEntityPre
  | MessageEntitySpoiler
  | MessageEntityStrike
  | MessageEntityTextUrl
  | MessageEntityUnderline
  | MessageEntityUnknown
  | MessageEntityUrl

/** Any `MessageExtendedMedia`. */
export type TypeMessageExtendedMedia =
  | MessageExtendedMedia
  | MessageExtendedMediaPreview

/** Any `MessageFwdHeader`. */
export type TypeMessageFwdHeader =
  | MessageFwdHeader

/** Any `MessageMedia`. */
export type TypeMessageMedia =
  | MessageMediaContact
  | MessageMediaDice
  | MessageMediaDocument
  | MessageMediaEmpty
  | MessageMediaGame
  | MessageMediaGeo
  | MessageMediaGeoLive
  | MessageMediaGiveaway
  | MessageMediaGiveawayResults
  | MessageMediaInvoice
  | MessageMediaPaidMedia
  | MessageMediaPhoto
  | MessageMediaPoll
  | MessageMediaStory
  | MessageMediaToDo
  | MessageMediaUnsupported
  | MessageMediaVenue
  | MessageMediaVideoStream
  | MessageMediaWebPage

/** Any `MessagePeerReaction`. */
export type TypeMessagePeerReaction =
  | MessagePeerReaction

/** Any `MessagePeerVote`. */
export type TypeMessagePeerVote =
  | MessagePeerVote
  | MessagePeerVoteInputOption
  | MessagePeerVoteMultiple

/** Any `MessageRange`. */
export type TypeMessageRange =
  | MessageRange

/** Any `MessageReactions`. */
export type TypeMessageReactions =
  | MessageReactions

/** Any `MessageReactor`. */
export type TypeMessageReactor =
  | MessageReactor

/** Any `MessageReplies`. */
export type TypeMessageReplies =
  | MessageReplies

/** Any `MessageReplyHeader`. */
export type TypeMessageReplyHeader =
  | MessageReplyHeader
  | MessageReplyStoryHeader

/** Any `MessageReportOption`. */
export type TypeMessageReportOption =
  | MessageReportOption

/** Any `MessageViews`. */
export type TypeMessageViews =
  | MessageViews

/** Any `MessagesFilter`. */
export type TypeMessagesFilter =
  | root_i$.InputMessagesFilterChatPhotos
  | root_i$.InputMessagesFilterContacts
  | root_i$.InputMessagesFilterDocument
  | root_i$.InputMessagesFilterEmpty
  | root_i$.InputMessagesFilterGeo
  | root_i$.InputMessagesFilterGif
  | root_i$.InputMessagesFilterMusic
  | root_i$.InputMessagesFilterMyMentions
  | root_i$.InputMessagesFilterPhoneCalls
  | root_i$.InputMessagesFilterPhotoVideo
  | root_i$.InputMessagesFilterPhotos
  | root_i$.InputMessagesFilterPinned
  | root_i$.InputMessagesFilterPoll
  | root_i$.InputMessagesFilterRoundVideo
  | root_i$.InputMessagesFilterRoundVoice
  | root_i$.InputMessagesFilterUrl
  | root_i$.InputMessagesFilterVideo
  | root_i$.InputMessagesFilterVoice

/** Any `MissingInvitee`. */
export type TypeMissingInvitee =
  | MissingInvitee

/** Any `MyBoost`. */
export type TypeMyBoost =
  | MyBoost
