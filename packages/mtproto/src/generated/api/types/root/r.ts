// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as root_c$ from '../root/c.js'
import type * as root_d$ from '../root/d.js'
import type * as root_i$ from '../root/i.js'
import type * as root_k$ from '../root/k.js'
import type * as root_m$ from '../root/m.js'
import type * as root_n$ from '../root/n.js'
import type * as root_p$ from '../root/p.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type { TlObject } from '../../../../tl/object.js'

/** `reactionCount#a3d1cb80` */
export interface ReactionCount {
  readonly _: 'reactionCount'
  readonly chosen_order?: number
  readonly reaction: TypeReaction
  readonly count: number
}

/** `reactionCustomEmoji#8935fc73` */
export interface ReactionCustomEmoji {
  readonly _: 'reactionCustomEmoji'
  readonly document_id: bigint
}

/** `reactionEmoji#1b2286b8` */
export interface ReactionEmoji {
  readonly _: 'reactionEmoji'
  readonly emoticon: string
}

/** `reactionEmpty#79f5d419` */
export interface ReactionEmpty {
  readonly _: 'reactionEmpty'
}

/** `reactionNotificationsFromAll#4b9e22a0` */
export interface ReactionNotificationsFromAll {
  readonly _: 'reactionNotificationsFromAll'
}

/** `reactionNotificationsFromContacts#bac3a61a` */
export interface ReactionNotificationsFromContacts {
  readonly _: 'reactionNotificationsFromContacts'
}

/** `reactionPaid#523da4eb` */
export interface ReactionPaid {
  readonly _: 'reactionPaid'
}

/** `reactionsNotifySettings#71e4ea58` */
export interface ReactionsNotifySettings {
  readonly _: 'reactionsNotifySettings'
  readonly messages_notify_from?: TypeReactionNotificationsFrom
  readonly stories_notify_from?: TypeReactionNotificationsFrom
  readonly poll_votes_notify_from?: TypeReactionNotificationsFrom
  readonly sound: root_n$.TypeNotificationSound
  readonly show_previews: boolean
}

/** `readParticipantDate#4a4ff172` */
export interface ReadParticipantDate {
  readonly _: 'readParticipantDate'
  readonly user_id: bigint
  readonly date: number
}

/** `receivedNotifyMessage#a384b779` */
export interface ReceivedNotifyMessage {
  readonly _: 'receivedNotifyMessage'
  readonly id: number
  readonly flags: number
}

/** `recentMeUrlChat#b2da71d2` */
export interface RecentMeUrlChat {
  readonly _: 'recentMeUrlChat'
  readonly url: string
  readonly chat_id: bigint
}

/** `recentMeUrlChatInvite#eb49081d` */
export interface RecentMeUrlChatInvite {
  readonly _: 'recentMeUrlChatInvite'
  readonly url: string
  readonly chat_invite: root_c$.TypeChatInvite
}

/** `recentMeUrlStickerSet#bc0a57dc` */
export interface RecentMeUrlStickerSet {
  readonly _: 'recentMeUrlStickerSet'
  readonly url: string
  readonly set: root_s$.TypeStickerSetCovered
}

/** `recentMeUrlUnknown#46e1d13d` */
export interface RecentMeUrlUnknown {
  readonly _: 'recentMeUrlUnknown'
  readonly url: string
}

/** `recentMeUrlUser#b92c09e2` */
export interface RecentMeUrlUser {
  readonly _: 'recentMeUrlUser'
  readonly url: string
  readonly user_id: bigint
}

/** `recentStory#711d692d` */
export interface RecentStory {
  readonly _: 'recentStory'
  readonly live?: true
  readonly max_id?: number
}

/** `replyInlineMarkup#b2b15770` */
export interface ReplyInlineMarkup {
  readonly _: 'replyInlineMarkup'
  readonly force_reply?: true
  readonly rows: readonly root_k$.TypeKeyboardInlineButtonRow[]
}

/** `replyKeyboardForceReply#86b40b08` */
export interface ReplyKeyboardForceReply {
  readonly _: 'replyKeyboardForceReply'
  readonly single_use?: true
  readonly selective?: true
  readonly placeholder?: string
}

/** `replyKeyboardHide#a03e5b85` */
export interface ReplyKeyboardHide {
  readonly _: 'replyKeyboardHide'
  readonly selective?: true
}

/** `replyKeyboardMarkup#85dd99d1` */
export interface ReplyKeyboardMarkup {
  readonly _: 'replyKeyboardMarkup'
  readonly resize?: true
  readonly single_use?: true
  readonly selective?: true
  readonly persistent?: true
  readonly force_reply?: true
  readonly rows: readonly root_k$.TypeKeyboardButtonRow[]
  readonly placeholder?: string
}

/** `reportResultAddComment#6f09ac31` */
export interface ReportResultAddComment {
  readonly _: 'reportResultAddComment'
  readonly optional?: true
  readonly option: Uint8Array
}

/** `reportResultChooseOption#f0e4e0b6` */
export interface ReportResultChooseOption {
  readonly _: 'reportResultChooseOption'
  readonly title: string
  readonly options: readonly root_m$.TypeMessageReportOption[]
}

/** `reportResultReported#8db33c4b` */
export interface ReportResultReported {
  readonly _: 'reportResultReported'
}

/** `requestPeerTypeBroadcast#339bef6c` */
export interface RequestPeerTypeBroadcast {
  readonly _: 'requestPeerTypeBroadcast'
  readonly creator?: true
  readonly has_username?: boolean
  readonly user_admin_rights?: root_c$.TypeChatAdminRights
  readonly bot_admin_rights?: root_c$.TypeChatAdminRights
}

/** `requestPeerTypeChat#c9f06e1b` */
export interface RequestPeerTypeChat {
  readonly _: 'requestPeerTypeChat'
  readonly creator?: true
  readonly bot_participant?: true
  readonly has_username?: boolean
  readonly forum?: boolean
  readonly user_admin_rights?: root_c$.TypeChatAdminRights
  readonly bot_admin_rights?: root_c$.TypeChatAdminRights
}

/** `requestPeerTypeCreateBot#3e81e078` */
export interface RequestPeerTypeCreateBot {
  readonly _: 'requestPeerTypeCreateBot'
  readonly bot_managed?: true
  readonly suggested_name?: string
  readonly suggested_username?: string
}

/** `requestPeerTypeUser#5f3b8a00` */
export interface RequestPeerTypeUser {
  readonly _: 'requestPeerTypeUser'
  readonly bot?: boolean
  readonly premium?: boolean
}

/** `requestedPeerChannel#8ba403e4` */
export interface RequestedPeerChannel {
  readonly _: 'requestedPeerChannel'
  readonly channel_id: bigint
  readonly title?: string
  readonly username?: string
  readonly photo?: root_p$.TypePhoto
}

/** `requestedPeerChat#7307544f` */
export interface RequestedPeerChat {
  readonly _: 'requestedPeerChat'
  readonly chat_id: bigint
  readonly title?: string
  readonly photo?: root_p$.TypePhoto
}

/** `requestedPeerUser#d62ff46a` */
export interface RequestedPeerUser {
  readonly _: 'requestedPeerUser'
  readonly user_id: bigint
  readonly first_name?: string
  readonly last_name?: string
  readonly username?: string
  readonly photo?: root_p$.TypePhoto
}

/** `requirementToContactEmpty#050a9839` */
export interface RequirementToContactEmpty {
  readonly _: 'requirementToContactEmpty'
}

/** `requirementToContactPaidMessages#b4f67e93` */
export interface RequirementToContactPaidMessages {
  readonly _: 'requirementToContactPaidMessages'
  readonly stars_amount: bigint
}

/** `requirementToContactPremium#e581e4e9` */
export interface RequirementToContactPremium {
  readonly _: 'requirementToContactPremium'
}

/** `restrictionReason#d072acb4` */
export interface RestrictionReason {
  readonly _: 'restrictionReason'
  readonly platform: string
  readonly reason: string
  readonly text: string
}

/** `richButtonStyle#03c610bd` */
export interface RichButtonStyle {
  readonly _: 'richButtonStyle'
  readonly bg_primary?: true
  readonly bg_danger?: true
  readonly bg_success?: true
  readonly link?: true
}

/** `richMessage#baf39d8b` */
export interface RichMessage {
  readonly _: 'richMessage'
  readonly rtl?: true
  readonly part?: true
  readonly blocks: readonly root_p$.TypePageBlock[]
  readonly photos: readonly root_p$.TypePhoto[]
  readonly documents: readonly root_d$.TypeDocument[]
}

/** Any `Reaction`. */
export type TypeReaction =
  | ReactionCustomEmoji
  | ReactionEmoji
  | ReactionEmpty
  | ReactionPaid

/** Any `ReactionCount`. */
export type TypeReactionCount =
  | ReactionCount

/** Any `ReactionNotificationsFrom`. */
export type TypeReactionNotificationsFrom =
  | ReactionNotificationsFromAll
  | ReactionNotificationsFromContacts

/** Any `ReactionsNotifySettings`. */
export type TypeReactionsNotifySettings =
  | ReactionsNotifySettings

/** Any `ReadParticipantDate`. */
export type TypeReadParticipantDate =
  | ReadParticipantDate

/** Any `ReceivedNotifyMessage`. */
export type TypeReceivedNotifyMessage =
  | ReceivedNotifyMessage

/** Any `RecentMeUrl`. */
export type TypeRecentMeUrl =
  | RecentMeUrlChat
  | RecentMeUrlChatInvite
  | RecentMeUrlStickerSet
  | RecentMeUrlUnknown
  | RecentMeUrlUser

/** Any `RecentStory`. */
export type TypeRecentStory =
  | RecentStory

/** Any `ReplyMarkup`. */
export type TypeReplyMarkup =
  | ReplyInlineMarkup
  | ReplyKeyboardForceReply
  | ReplyKeyboardHide
  | ReplyKeyboardMarkup

/** Any `ReportReason`. */
export type TypeReportReason =
  | root_i$.InputReportReasonChildAbuse
  | root_i$.InputReportReasonCopyright
  | root_i$.InputReportReasonFake
  | root_i$.InputReportReasonGeoIrrelevant
  | root_i$.InputReportReasonIllegalDrugs
  | root_i$.InputReportReasonOther
  | root_i$.InputReportReasonPersonalDetails
  | root_i$.InputReportReasonPornography
  | root_i$.InputReportReasonSpam
  | root_i$.InputReportReasonViolence

/** Any `ReportResult`. */
export type TypeReportResult =
  | ReportResultAddComment
  | ReportResultChooseOption
  | ReportResultReported

/** Any `RequestPeerType`. */
export type TypeRequestPeerType =
  | RequestPeerTypeBroadcast
  | RequestPeerTypeChat
  | RequestPeerTypeCreateBot
  | RequestPeerTypeUser

/** Any `RequestedPeer`. */
export type TypeRequestedPeer =
  | RequestedPeerChannel
  | RequestedPeerChat
  | RequestedPeerUser

/** Any `RequirementToContact`. */
export type TypeRequirementToContact =
  | RequirementToContactEmpty
  | RequirementToContactPaidMessages
  | RequirementToContactPremium

/** Any `RestrictionReason`. */
export type TypeRestrictionReason =
  | RestrictionReason

/** Any `RichButtonStyle`. */
export type TypeRichButtonStyle =
  | RichButtonStyle

/** Any `RichMessage`. */
export type TypeRichMessage =
  | RichMessage

/** Any `RichText`. */
export type TypeRichText =
  | root_t$.TextAnchor
  | root_t$.TextAutoEmail
  | root_t$.TextAutoPhone
  | root_t$.TextAutoUrl
  | root_t$.TextBankCard
  | root_t$.TextBold
  | root_t$.TextBotCommand
  | root_t$.TextButton
  | root_t$.TextCashtag
  | root_t$.TextConcat
  | root_t$.TextCustomEmoji
  | root_t$.TextDate
  | root_t$.TextDiff
  | root_t$.TextEmail
  | root_t$.TextEmpty
  | root_t$.TextFixed
  | root_t$.TextHashtag
  | root_t$.TextImage
  | root_t$.TextItalic
  | root_t$.TextMarked
  | root_t$.TextMath
  | root_t$.TextMention
  | root_t$.TextMentionName
  | root_t$.TextPhone
  | root_t$.TextPlain
  | root_t$.TextSpoiler
  | root_t$.TextStrike
  | root_t$.TextSubscript
  | root_t$.TextSuperscript
  | root_t$.TextUnderline
  | root_t$.TextUrl
