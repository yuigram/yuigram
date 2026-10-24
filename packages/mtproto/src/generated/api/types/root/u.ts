// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as auth$ from '../auth.js'
import type * as messages$ from '../messages.js'
import type * as root_b$ from '../root/b.js'
import type * as root_c$ from '../root/c.js'
import type * as root_d$ from '../root/d.js'
import type * as root_e$ from '../root/e.js'
import type * as root_f$ from '../root/f.js'
import type * as root_g$ from '../root/g.js'
import type * as root_i$ from '../root/i.js'
import type * as root_j$ from '../root/j.js'
import type * as root_l$ from '../root/l.js'
import type * as root_m$ from '../root/m.js'
import type * as root_n$ from '../root/n.js'
import type * as root_p$ from '../root/p.js'
import type * as root_q$ from '../root/q.js'
import type * as root_r$ from '../root/r.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type * as root_w$ from '../root/w.js'
import type { TlObject } from '../../../../tl/object.js'

/** Any `Update`. */
export type TypeUpdate =
  | UpdateAiComposeTones
  | UpdateAttachMenuBots
  | UpdateAutoSaveSettings
  | UpdateBotBusinessConnect
  | UpdateBotCallbackQuery
  | UpdateBotChatBoost
  | UpdateBotChatInviteRequester
  | UpdateBotCommands
  | UpdateBotDeleteBusinessMessage
  | UpdateBotEditBusinessMessage
  | UpdateBotGuestChatQuery
  | UpdateBotInlineQuery
  | UpdateBotInlineSend
  | UpdateBotMenuButton
  | UpdateBotMessageReaction
  | UpdateBotMessageReactions
  | UpdateBotNewBusinessMessage
  | UpdateBotPrecheckoutQuery
  | UpdateBotPurchasedPaidMedia
  | UpdateBotShippingQuery
  | UpdateBotStarsSubscription
  | UpdateBotStopped
  | UpdateBotWebhookJSON
  | UpdateBotWebhookJSONQuery
  | UpdateBusinessBotCallbackQuery
  | UpdateChannel
  | UpdateChannelAvailableMessages
  | UpdateChannelMessageForwards
  | UpdateChannelMessageViews
  | UpdateChannelParticipant
  | UpdateChannelReadMessagesContents
  | UpdateChannelTooLong
  | UpdateChannelUserTyping
  | UpdateChannelViewForumAsMessages
  | UpdateChannelWebPage
  | UpdateChat
  | UpdateChatDefaultBannedRights
  | UpdateChatParticipant
  | UpdateChatParticipantAdd
  | UpdateChatParticipantAdmin
  | UpdateChatParticipantDelete
  | UpdateChatParticipantRank
  | UpdateChatParticipants
  | UpdateChatUserTyping
  | UpdateConfig
  | UpdateContactsReset
  | UpdateDcOptions
  | UpdateDeleteChannelMessages
  | UpdateDeleteEphemeralMessages
  | UpdateDeleteGroupCallMessages
  | UpdateDeleteMessages
  | UpdateDeleteQuickReply
  | UpdateDeleteQuickReplyMessages
  | UpdateDeleteScheduledMessages
  | UpdateDialogFilter
  | UpdateDialogFilterOrder
  | UpdateDialogFilters
  | UpdateDialogPinned
  | UpdateDialogUnreadMark
  | UpdateDraftMessage
  | UpdateEditChannelMessage
  | UpdateEditEphemeralMessage
  | UpdateEditMessage
  | UpdateEmojiGameInfo
  | UpdateEncryptedChatTyping
  | UpdateEncryptedMessagesRead
  | UpdateEncryption
  | UpdateEphemeralBotCallbackQuery
  | UpdateFavedStickers
  | UpdateFolderPeers
  | UpdateGeoLiveViewed
  | UpdateGroupCall
  | UpdateGroupCallChainBlocks
  | UpdateGroupCallConnection
  | UpdateGroupCallEncryptedMessage
  | UpdateGroupCallMessage
  | UpdateGroupCallParticipants
  | UpdateInlineBotCallbackQuery
  | UpdateJoinChatWebViewDecision
  | UpdateLangPack
  | UpdateLangPackTooLong
  | UpdateLoginToken
  | UpdateManagedBot
  | UpdateMessageExtendedMedia
  | UpdateMessageID
  | UpdateMessagePoll
  | UpdateMessagePollVote
  | UpdateMessageReactions
  | UpdateMonoForumNoPaidException
  | UpdateMoveStickerSetToTop
  | UpdateNewAuthorization
  | UpdateNewBotConnection
  | UpdateNewChannelMessage
  | UpdateNewEncryptedMessage
  | UpdateNewEphemeralMessage
  | UpdateNewMessage
  | UpdateNewQuickReply
  | UpdateNewScheduledMessage
  | UpdateNewStickerSet
  | UpdateNewStoryReaction
  | UpdateNotifySettings
  | UpdatePaidReactionPrivacy
  | UpdatePeerBlocked
  | UpdatePeerHistoryTTL
  | UpdatePeerLocated
  | UpdatePeerSettings
  | UpdatePeerWallpaper
  | UpdatePendingJoinRequests
  | UpdatePhoneCall
  | UpdatePhoneCallSignalingData
  | UpdatePinnedChannelMessages
  | UpdatePinnedDialogs
  | UpdatePinnedForumTopic
  | UpdatePinnedForumTopics
  | UpdatePinnedMessages
  | UpdatePinnedSavedDialogs
  | UpdatePrivacy
  | UpdatePtsChanged
  | UpdateQuickReplies
  | UpdateQuickReplyMessage
  | UpdateReadChannelDiscussionInbox
  | UpdateReadChannelDiscussionOutbox
  | UpdateReadChannelInbox
  | UpdateReadChannelOutbox
  | UpdateReadFeaturedEmojiStickers
  | UpdateReadFeaturedStickers
  | UpdateReadHistoryInbox
  | UpdateReadHistoryOutbox
  | UpdateReadMessagesContents
  | UpdateReadMonoForumInbox
  | UpdateReadMonoForumOutbox
  | UpdateReadStories
  | UpdateRecentEmojiStatuses
  | UpdateRecentReactions
  | UpdateRecentStickers
  | UpdateSavedDialogPinned
  | UpdateSavedGifs
  | UpdateSavedReactionTags
  | UpdateSavedRingtones
  | UpdateSentPhoneCode
  | UpdateSentStoryReaction
  | UpdateServiceNotification
  | UpdateSmsJob
  | UpdateStarGiftAuctionState
  | UpdateStarGiftAuctionUserState
  | UpdateStarGiftCraftFail
  | UpdateStarsBalance
  | UpdateStarsRevenueStatus
  | UpdateStickerSets
  | UpdateStickerSetsOrder
  | UpdateStoriesStealthMode
  | UpdateStory
  | UpdateStoryID
  | UpdateTheme
  | UpdateTranscribedAudio
  | UpdateUser
  | UpdateUserEmojiStatus
  | UpdateUserName
  | UpdateUserPhone
  | UpdateUserStatus
  | UpdateUserTyping
  | UpdateWebBrowserException
  | UpdateWebBrowserSettings
  | UpdateWebPage
  | UpdateWebViewResultSent

/** Any `Updates`. */
export type TypeUpdates =
  | UpdateShort
  | UpdateShortChatMessage
  | UpdateShortMessage
  | UpdateShortSentMessage
  | Updates
  | UpdatesCombined
  | UpdatesTooLong

/** Any `UrlAuthResult`. */
export type TypeUrlAuthResult =
  | UrlAuthResultAccepted
  | UrlAuthResultDefault
  | UrlAuthResultRequest

/** Any `User`. */
export type TypeUser =
  | User
  | UserEmpty

/** Any `UserFull`. */
export type TypeUserFull =
  | UserFull

/** Any `UserProfilePhoto`. */
export type TypeUserProfilePhoto =
  | UserProfilePhoto
  | UserProfilePhotoEmpty

/** Any `UserStatus`. */
export type TypeUserStatus =
  | UserStatusEmpty
  | UserStatusLastMonth
  | UserStatusLastWeek
  | UserStatusOffline
  | UserStatusOnline
  | UserStatusRecently

/** Any `Username`. */
export type TypeUsername =
  | Username

/** `updateAiComposeTones#8c0f91fb` */
export interface UpdateAiComposeTones {
  readonly _: 'updateAiComposeTones'
}

/** `updateAttachMenuBots#17b7a20b` */
export interface UpdateAttachMenuBots {
  readonly _: 'updateAttachMenuBots'
}

/** `updateAutoSaveSettings#ec05b097` */
export interface UpdateAutoSaveSettings {
  readonly _: 'updateAutoSaveSettings'
}

/** `updateBotBusinessConnect#8ae5c97a` */
export interface UpdateBotBusinessConnect {
  readonly _: 'updateBotBusinessConnect'
  readonly connection: root_b$.TypeBotBusinessConnection
  readonly qts: number
}

/** `updateBotCallbackQuery#b9cfc48d` */
export interface UpdateBotCallbackQuery {
  readonly _: 'updateBotCallbackQuery'
  readonly query_id: bigint
  readonly user_id: bigint
  readonly peer: root_p$.TypePeer
  readonly msg_id: number
  readonly chat_instance: bigint
  readonly data?: Uint8Array
  readonly game_short_name?: string
}

/** `updateBotChatBoost#904dd49c` */
export interface UpdateBotChatBoost {
  readonly _: 'updateBotChatBoost'
  readonly peer: root_p$.TypePeer
  readonly boost: root_b$.TypeBoost
  readonly qts: number
}

/** `updateBotChatInviteRequester#7cb34d79` */
export interface UpdateBotChatInviteRequester {
  readonly _: 'updateBotChatInviteRequester'
  readonly peer: root_p$.TypePeer
  readonly date: number
  readonly user_id: bigint
  readonly about: string
  readonly invite: root_e$.TypeExportedChatInvite
  readonly qts: number
  readonly query_id?: bigint
}

/** `updateBotCommands#4d712f2e` */
export interface UpdateBotCommands {
  readonly _: 'updateBotCommands'
  readonly peer: root_p$.TypePeer
  readonly bot_id: bigint
  readonly commands: readonly root_b$.TypeBotCommand[]
}

/** `updateBotDeleteBusinessMessage#a02a982e` */
export interface UpdateBotDeleteBusinessMessage {
  readonly _: 'updateBotDeleteBusinessMessage'
  readonly connection_id: string
  readonly peer: root_p$.TypePeer
  readonly messages: readonly number[]
  readonly qts: number
}

/** `updateBotEditBusinessMessage#07df587c` */
export interface UpdateBotEditBusinessMessage {
  readonly _: 'updateBotEditBusinessMessage'
  readonly connection_id: string
  readonly message: root_m$.TypeMessage
  readonly reply_to_message?: root_m$.TypeMessage
  readonly qts: number
}

/** `updateBotGuestChatQuery#cdd4093d` */
export interface UpdateBotGuestChatQuery {
  readonly _: 'updateBotGuestChatQuery'
  readonly query_id: bigint
  readonly message: root_m$.TypeMessage
  readonly reference_messages?: readonly root_m$.TypeMessage[]
  readonly qts: number
}

/** `updateBotInlineQuery#496f379c` */
export interface UpdateBotInlineQuery {
  readonly _: 'updateBotInlineQuery'
  readonly query_id: bigint
  readonly user_id: bigint
  readonly query: string
  readonly geo?: root_g$.TypeGeoPoint
  readonly peer_type?: root_i$.TypeInlineQueryPeerType
  readonly offset: string
}

/** `updateBotInlineSend#12f12a07` */
export interface UpdateBotInlineSend {
  readonly _: 'updateBotInlineSend'
  readonly user_id: bigint
  readonly query: string
  readonly geo?: root_g$.TypeGeoPoint
  readonly id: string
  readonly msg_id?: root_i$.TypeInputBotInlineMessageID
}

/** `updateBotMenuButton#14b85813` */
export interface UpdateBotMenuButton {
  readonly _: 'updateBotMenuButton'
  readonly bot_id: bigint
  readonly button: root_b$.TypeBotMenuButton
}

/** `updateBotMessageReaction#ac21d3ce` */
export interface UpdateBotMessageReaction {
  readonly _: 'updateBotMessageReaction'
  readonly peer: root_p$.TypePeer
  readonly msg_id: number
  readonly date: number
  readonly actor: root_p$.TypePeer
  readonly old_reactions: readonly root_r$.TypeReaction[]
  readonly new_reactions: readonly root_r$.TypeReaction[]
  readonly qts: number
}

/** `updateBotMessageReactions#09cb7759` */
export interface UpdateBotMessageReactions {
  readonly _: 'updateBotMessageReactions'
  readonly peer: root_p$.TypePeer
  readonly msg_id: number
  readonly date: number
  readonly reactions: readonly root_r$.TypeReactionCount[]
  readonly qts: number
}

/** `updateBotNewBusinessMessage#9ddb347c` */
export interface UpdateBotNewBusinessMessage {
  readonly _: 'updateBotNewBusinessMessage'
  readonly connection_id: string
  readonly message: root_m$.TypeMessage
  readonly reply_to_message?: root_m$.TypeMessage
  readonly qts: number
}

/** `updateBotPrecheckoutQuery#8caa9a96` */
export interface UpdateBotPrecheckoutQuery {
  readonly _: 'updateBotPrecheckoutQuery'
  readonly query_id: bigint
  readonly user_id: bigint
  readonly payload: Uint8Array
  readonly info?: root_p$.TypePaymentRequestedInfo
  readonly shipping_option_id?: string
  readonly currency: string
  readonly total_amount: bigint
}

/** `updateBotPurchasedPaidMedia#283bd312` */
export interface UpdateBotPurchasedPaidMedia {
  readonly _: 'updateBotPurchasedPaidMedia'
  readonly user_id: bigint
  readonly payload: string
  readonly qts: number
}

/** `updateBotShippingQuery#b5aefd7d` */
export interface UpdateBotShippingQuery {
  readonly _: 'updateBotShippingQuery'
  readonly query_id: bigint
  readonly user_id: bigint
  readonly payload: Uint8Array
  readonly shipping_address: root_p$.TypePostAddress
}

/** `updateBotStarsSubscription#6c0d8e23` */
export interface UpdateBotStarsSubscription {
  readonly _: 'updateBotStarsSubscription'
  readonly canceled?: true
  readonly payment_failed?: true
  readonly restored?: true
  readonly user_id: bigint
  readonly payload: Uint8Array
  readonly qts: number
}

/** `updateBotStopped#c4870a49` */
export interface UpdateBotStopped {
  readonly _: 'updateBotStopped'
  readonly user_id: bigint
  readonly date: number
  readonly stopped: boolean
  readonly qts: number
}

/** `updateBotWebhookJSON#8317c0c3` */
export interface UpdateBotWebhookJSON {
  readonly _: 'updateBotWebhookJSON'
  readonly data: root_d$.TypeDataJSON
}

/** `updateBotWebhookJSONQuery#9b9240a6` */
export interface UpdateBotWebhookJSONQuery {
  readonly _: 'updateBotWebhookJSONQuery'
  readonly query_id: bigint
  readonly data: root_d$.TypeDataJSON
  readonly timeout: number
}

/** `updateBusinessBotCallbackQuery#1ea2fda7` */
export interface UpdateBusinessBotCallbackQuery {
  readonly _: 'updateBusinessBotCallbackQuery'
  readonly query_id: bigint
  readonly user_id: bigint
  readonly connection_id: string
  readonly message: root_m$.TypeMessage
  readonly reply_to_message?: root_m$.TypeMessage
  readonly chat_instance: bigint
  readonly data?: Uint8Array
}

/** `updateChannel#635b4c09` */
export interface UpdateChannel {
  readonly _: 'updateChannel'
  readonly channel_id: bigint
}

/** `updateChannelAvailableMessages#b23fc698` */
export interface UpdateChannelAvailableMessages {
  readonly _: 'updateChannelAvailableMessages'
  readonly channel_id: bigint
  readonly available_min_id: number
}

/** `updateChannelMessageForwards#d29a27f4` */
export interface UpdateChannelMessageForwards {
  readonly _: 'updateChannelMessageForwards'
  readonly channel_id: bigint
  readonly id: number
  readonly forwards: number
}

/** `updateChannelMessageViews#f226ac08` */
export interface UpdateChannelMessageViews {
  readonly _: 'updateChannelMessageViews'
  readonly channel_id: bigint
  readonly id: number
  readonly views: number
}

/** `updateChannelParticipant#985d3abb` */
export interface UpdateChannelParticipant {
  readonly _: 'updateChannelParticipant'
  readonly via_chatlist?: true
  readonly channel_id: bigint
  readonly date: number
  readonly actor_id: bigint
  readonly user_id: bigint
  readonly prev_participant?: root_c$.TypeChannelParticipant
  readonly new_participant?: root_c$.TypeChannelParticipant
  readonly invite?: root_e$.TypeExportedChatInvite
  readonly qts: number
}

/** `updateChannelReadMessagesContents#25f324f7` */
export interface UpdateChannelReadMessagesContents {
  readonly _: 'updateChannelReadMessagesContents'
  readonly channel_id: bigint
  readonly top_msg_id?: number
  readonly saved_peer_id?: root_p$.TypePeer
  readonly messages: readonly number[]
}

/** `updateChannelTooLong#108d941f` */
export interface UpdateChannelTooLong {
  readonly _: 'updateChannelTooLong'
  readonly channel_id: bigint
  readonly pts?: number
}

/** `updateChannelUserTyping#8c88c923` */
export interface UpdateChannelUserTyping {
  readonly _: 'updateChannelUserTyping'
  readonly channel_id: bigint
  readonly top_msg_id?: number
  readonly from_id: root_p$.TypePeer
  readonly action: root_s$.TypeSendMessageAction
}

/** `updateChannelViewForumAsMessages#07b68920` */
export interface UpdateChannelViewForumAsMessages {
  readonly _: 'updateChannelViewForumAsMessages'
  readonly channel_id: bigint
  readonly enabled: boolean
}

/** `updateChannelWebPage#2f2ba99f` */
export interface UpdateChannelWebPage {
  readonly _: 'updateChannelWebPage'
  readonly channel_id: bigint
  readonly webpage: root_w$.TypeWebPage
  readonly pts: number
  readonly pts_count: number
}

/** `updateChat#f89a6a4e` */
export interface UpdateChat {
  readonly _: 'updateChat'
  readonly chat_id: bigint
}

/** `updateChatDefaultBannedRights#54c01850` */
export interface UpdateChatDefaultBannedRights {
  readonly _: 'updateChatDefaultBannedRights'
  readonly peer: root_p$.TypePeer
  readonly default_banned_rights: root_c$.TypeChatBannedRights
  readonly version: number
}

/** `updateChatParticipant#d087663a` */
export interface UpdateChatParticipant {
  readonly _: 'updateChatParticipant'
  readonly chat_id: bigint
  readonly date: number
  readonly actor_id: bigint
  readonly user_id: bigint
  readonly prev_participant?: root_c$.TypeChatParticipant
  readonly new_participant?: root_c$.TypeChatParticipant
  readonly invite?: root_e$.TypeExportedChatInvite
  readonly qts: number
}

/** `updateChatParticipantAdd#3dda5451` */
export interface UpdateChatParticipantAdd {
  readonly _: 'updateChatParticipantAdd'
  readonly chat_id: bigint
  readonly user_id: bigint
  readonly inviter_id: bigint
  readonly date: number
  readonly version: number
}

/** `updateChatParticipantAdmin#d7ca61a2` */
export interface UpdateChatParticipantAdmin {
  readonly _: 'updateChatParticipantAdmin'
  readonly chat_id: bigint
  readonly user_id: bigint
  readonly is_admin: boolean
  readonly version: number
}

/** `updateChatParticipantDelete#e32f3d77` */
export interface UpdateChatParticipantDelete {
  readonly _: 'updateChatParticipantDelete'
  readonly chat_id: bigint
  readonly user_id: bigint
  readonly version: number
}

/** `updateChatParticipantRank#bd8367b9` */
export interface UpdateChatParticipantRank {
  readonly _: 'updateChatParticipantRank'
  readonly chat_id: bigint
  readonly user_id: bigint
  readonly rank: string
  readonly version: number
}

/** `updateChatParticipants#07761198` */
export interface UpdateChatParticipants {
  readonly _: 'updateChatParticipants'
  readonly participants: root_c$.TypeChatParticipants
}

/** `updateChatUserTyping#83487af0` */
export interface UpdateChatUserTyping {
  readonly _: 'updateChatUserTyping'
  readonly chat_id: bigint
  readonly from_id: root_p$.TypePeer
  readonly action: root_s$.TypeSendMessageAction
}

/** `updateConfig#a229dd06` */
export interface UpdateConfig {
  readonly _: 'updateConfig'
}

/** `updateContactsReset#7084a7be` */
export interface UpdateContactsReset {
  readonly _: 'updateContactsReset'
}

/** `updateDcOptions#8e5e9873` */
export interface UpdateDcOptions {
  readonly _: 'updateDcOptions'
  readonly dc_options: readonly root_d$.TypeDcOption[]
}

/** `updateDeleteChannelMessages#c32d5b12` */
export interface UpdateDeleteChannelMessages {
  readonly _: 'updateDeleteChannelMessages'
  readonly channel_id: bigint
  readonly messages: readonly number[]
  readonly pts: number
  readonly pts_count: number
}

/** `updateDeleteEphemeralMessages#56dbfcf8` */
export interface UpdateDeleteEphemeralMessages {
  readonly _: 'updateDeleteEphemeralMessages'
  readonly peer: root_p$.TypePeer
  readonly ids: readonly number[]
}

/** `updateDeleteGroupCallMessages#3e85e92c` */
export interface UpdateDeleteGroupCallMessages {
  readonly _: 'updateDeleteGroupCallMessages'
  readonly call: root_i$.TypeInputGroupCall
  readonly messages: readonly number[]
}

/** `updateDeleteMessages#a20db0e5` */
export interface UpdateDeleteMessages {
  readonly _: 'updateDeleteMessages'
  readonly messages: readonly number[]
  readonly pts: number
  readonly pts_count: number
}

/** `updateDeleteQuickReply#53e6f1ec` */
export interface UpdateDeleteQuickReply {
  readonly _: 'updateDeleteQuickReply'
  readonly shortcut_id: number
}

/** `updateDeleteQuickReplyMessages#566fe7cd` */
export interface UpdateDeleteQuickReplyMessages {
  readonly _: 'updateDeleteQuickReplyMessages'
  readonly shortcut_id: number
  readonly messages: readonly number[]
}

/** `updateDeleteScheduledMessages#f2a71983` */
export interface UpdateDeleteScheduledMessages {
  readonly _: 'updateDeleteScheduledMessages'
  readonly peer: root_p$.TypePeer
  readonly messages: readonly number[]
  readonly sent_messages?: readonly number[]
}

/** `updateDialogFilter#26ffde7d` */
export interface UpdateDialogFilter {
  readonly _: 'updateDialogFilter'
  readonly id: number
  readonly filter?: root_d$.TypeDialogFilter
}

/** `updateDialogFilterOrder#a5d72105` */
export interface UpdateDialogFilterOrder {
  readonly _: 'updateDialogFilterOrder'
  readonly order: readonly number[]
}

/** `updateDialogFilters#3504914f` */
export interface UpdateDialogFilters {
  readonly _: 'updateDialogFilters'
}

/** `updateDialogPinned#6e6fe51c` */
export interface UpdateDialogPinned {
  readonly _: 'updateDialogPinned'
  readonly pinned?: true
  readonly folder_id?: number
  readonly peer: root_d$.TypeDialogPeer
}

/** `updateDialogUnreadMark#b658f23e` */
export interface UpdateDialogUnreadMark {
  readonly _: 'updateDialogUnreadMark'
  readonly unread?: true
  readonly peer: root_d$.TypeDialogPeer
  readonly saved_peer_id?: root_p$.TypePeer
}

/** `updateDraftMessage#edfc111e` */
export interface UpdateDraftMessage {
  readonly _: 'updateDraftMessage'
  readonly peer: root_p$.TypePeer
  readonly top_msg_id?: number
  readonly saved_peer_id?: root_p$.TypePeer
  readonly draft: root_d$.TypeDraftMessage
}

/** `updateEditChannelMessage#1b3f4df7` */
export interface UpdateEditChannelMessage {
  readonly _: 'updateEditChannelMessage'
  readonly message: root_m$.TypeMessage
  readonly pts: number
  readonly pts_count: number
}

/** `updateEditEphemeralMessage#4bbb8f01` */
export interface UpdateEditEphemeralMessage {
  readonly _: 'updateEditEphemeralMessage'
  readonly message: root_e$.TypeEphemeralMessage
}

/** `updateEditMessage#e40370a3` */
export interface UpdateEditMessage {
  readonly _: 'updateEditMessage'
  readonly message: root_m$.TypeMessage
  readonly pts: number
  readonly pts_count: number
}

/** `updateEmojiGameInfo#fb9c547a` */
export interface UpdateEmojiGameInfo {
  readonly _: 'updateEmojiGameInfo'
  readonly info: messages$.TypeEmojiGameInfo
}

/** `updateEncryptedChatTyping#1710f156` */
export interface UpdateEncryptedChatTyping {
  readonly _: 'updateEncryptedChatTyping'
  readonly chat_id: number
}

/** `updateEncryptedMessagesRead#38fe25b7` */
export interface UpdateEncryptedMessagesRead {
  readonly _: 'updateEncryptedMessagesRead'
  readonly chat_id: number
  readonly max_date: number
  readonly date: number
}

/** `updateEncryption#b4a2e88d` */
export interface UpdateEncryption {
  readonly _: 'updateEncryption'
  readonly chat: root_e$.TypeEncryptedChat
  readonly date: number
}

/** `updateEphemeralBotCallbackQuery#7c1079d6` */
export interface UpdateEphemeralBotCallbackQuery {
  readonly _: 'updateEphemeralBotCallbackQuery'
  readonly query_id: bigint
  readonly user_id: bigint
  readonly peer?: root_p$.TypePeer
  readonly msg_id: number
  readonly data: Uint8Array
  readonly chat_instance?: bigint
  readonly message: root_e$.TypeEphemeralMessage
}

/** `updateFavedStickers#e511996d` */
export interface UpdateFavedStickers {
  readonly _: 'updateFavedStickers'
}

/** `updateFolderPeers#19360dc0` */
export interface UpdateFolderPeers {
  readonly _: 'updateFolderPeers'
  readonly folder_peers: readonly root_f$.TypeFolderPeer[]
  readonly pts: number
  readonly pts_count: number
}

/** `updateGeoLiveViewed#871fb939` */
export interface UpdateGeoLiveViewed {
  readonly _: 'updateGeoLiveViewed'
  readonly peer: root_p$.TypePeer
  readonly msg_id: number
}

/** `updateGroupCall#9d2216e0` */
export interface UpdateGroupCall {
  readonly _: 'updateGroupCall'
  readonly live_story?: true
  readonly peer?: root_p$.TypePeer
  readonly call: root_g$.TypeGroupCall
}

/** `updateGroupCallChainBlocks#a477288f` */
export interface UpdateGroupCallChainBlocks {
  readonly _: 'updateGroupCallChainBlocks'
  readonly call: root_i$.TypeInputGroupCall
  readonly sub_chain_id: number
  readonly blocks: readonly Uint8Array[]
  readonly next_offset: number
}

/** `updateGroupCallConnection#0b783982` */
export interface UpdateGroupCallConnection {
  readonly _: 'updateGroupCallConnection'
  readonly presentation?: true
  readonly params: root_d$.TypeDataJSON
}

/** `updateGroupCallEncryptedMessage#c957a766` */
export interface UpdateGroupCallEncryptedMessage {
  readonly _: 'updateGroupCallEncryptedMessage'
  readonly call: root_i$.TypeInputGroupCall
  readonly from_id: root_p$.TypePeer
  readonly encrypted_message: Uint8Array
}

/** `updateGroupCallMessage#d8326f0d` */
export interface UpdateGroupCallMessage {
  readonly _: 'updateGroupCallMessage'
  readonly call: root_i$.TypeInputGroupCall
  readonly message: root_g$.TypeGroupCallMessage
}

/** `updateGroupCallParticipants#f2ebdb4e` */
export interface UpdateGroupCallParticipants {
  readonly _: 'updateGroupCallParticipants'
  readonly call: root_i$.TypeInputGroupCall
  readonly participants: readonly root_g$.TypeGroupCallParticipant[]
  readonly version: number
}

/** `updateInlineBotCallbackQuery#691e9052` */
export interface UpdateInlineBotCallbackQuery {
  readonly _: 'updateInlineBotCallbackQuery'
  readonly query_id: bigint
  readonly user_id: bigint
  readonly msg_id: root_i$.TypeInputBotInlineMessageID
  readonly chat_instance: bigint
  readonly data?: Uint8Array
  readonly game_short_name?: string
}

/** `updateJoinChatWebViewDecision#bdac7e70` */
export interface UpdateJoinChatWebViewDecision {
  readonly _: 'updateJoinChatWebViewDecision'
  readonly peer: root_p$.TypePeer
  readonly query_id: bigint
  readonly result: root_j$.TypeJoinChatBotResult
}

/** `updateLangPack#56022f4d` */
export interface UpdateLangPack {
  readonly _: 'updateLangPack'
  readonly difference: root_l$.TypeLangPackDifference
}

/** `updateLangPackTooLong#46560264` */
export interface UpdateLangPackTooLong {
  readonly _: 'updateLangPackTooLong'
  readonly lang_code: string
}

/** `updateLoginToken#564fe691` */
export interface UpdateLoginToken {
  readonly _: 'updateLoginToken'
}

/** `updateManagedBot#4880ed9a` */
export interface UpdateManagedBot {
  readonly _: 'updateManagedBot'
  readonly user_id: bigint
  readonly bot_id: bigint
  readonly qts: number
}

/** `updateMessageExtendedMedia#d5a41724` */
export interface UpdateMessageExtendedMedia {
  readonly _: 'updateMessageExtendedMedia'
  readonly peer: root_p$.TypePeer
  readonly msg_id: number
  readonly extended_media: readonly root_m$.TypeMessageExtendedMedia[]
}

/** `updateMessageID#4e90bfd6` */
export interface UpdateMessageID {
  readonly _: 'updateMessageID'
  readonly id: number
  readonly random_id: bigint
}

/** `updateMessagePoll#d64c522b` */
export interface UpdateMessagePoll {
  readonly _: 'updateMessagePoll'
  readonly peer?: root_p$.TypePeer
  readonly msg_id?: number
  readonly top_msg_id?: number
  readonly poll_id: bigint
  readonly poll?: root_p$.TypePoll
  readonly results: root_p$.TypePollResults
}

/** `updateMessagePollVote#7699f014` */
export interface UpdateMessagePollVote {
  readonly _: 'updateMessagePollVote'
  readonly poll_id: bigint
  readonly peer: root_p$.TypePeer
  readonly options: readonly Uint8Array[]
  readonly positions: readonly number[]
  readonly qts: number
}

/** `updateMessageReactions#1e297bfa` */
export interface UpdateMessageReactions {
  readonly _: 'updateMessageReactions'
  readonly peer: root_p$.TypePeer
  readonly msg_id: number
  readonly top_msg_id?: number
  readonly saved_peer_id?: root_p$.TypePeer
  readonly reactions: root_m$.TypeMessageReactions
}

/** `updateMonoForumNoPaidException#9f812b08` */
export interface UpdateMonoForumNoPaidException {
  readonly _: 'updateMonoForumNoPaidException'
  readonly exception?: true
  readonly channel_id: bigint
  readonly saved_peer_id: root_p$.TypePeer
}

/** `updateMoveStickerSetToTop#86fccf85` */
export interface UpdateMoveStickerSetToTop {
  readonly _: 'updateMoveStickerSetToTop'
  readonly masks?: true
  readonly emojis?: true
  readonly stickerset: bigint
}

/** `updateNewAuthorization#8951abef` */
export interface UpdateNewAuthorization {
  readonly _: 'updateNewAuthorization'
  readonly unconfirmed?: true
  readonly hash: bigint
  readonly date?: number
  readonly device?: string
  readonly location?: string
}

/** `updateNewBotConnection#b22083a6` */
export interface UpdateNewBotConnection {
  readonly _: 'updateNewBotConnection'
  readonly confirmed?: true
  readonly bot_id: bigint
  readonly date?: number
  readonly device?: string
  readonly location?: string
}

/** `updateNewChannelMessage#62ba04d9` */
export interface UpdateNewChannelMessage {
  readonly _: 'updateNewChannelMessage'
  readonly message: root_m$.TypeMessage
  readonly pts: number
  readonly pts_count: number
}

/** `updateNewEncryptedMessage#12bcbd9a` */
export interface UpdateNewEncryptedMessage {
  readonly _: 'updateNewEncryptedMessage'
  readonly message: root_e$.TypeEncryptedMessage
  readonly qts: number
}

/** `updateNewEphemeralMessage#20bcbba1` */
export interface UpdateNewEphemeralMessage {
  readonly _: 'updateNewEphemeralMessage'
  readonly message: root_e$.TypeEphemeralMessage
}

/** `updateNewMessage#1f2b0afd` */
export interface UpdateNewMessage {
  readonly _: 'updateNewMessage'
  readonly message: root_m$.TypeMessage
  readonly pts: number
  readonly pts_count: number
}

/** `updateNewQuickReply#f53da717` */
export interface UpdateNewQuickReply {
  readonly _: 'updateNewQuickReply'
  readonly quick_reply: root_q$.TypeQuickReply
}

/** `updateNewScheduledMessage#39a51dfb` */
export interface UpdateNewScheduledMessage {
  readonly _: 'updateNewScheduledMessage'
  readonly message: root_m$.TypeMessage
}

/** `updateNewStickerSet#688a30aa` */
export interface UpdateNewStickerSet {
  readonly _: 'updateNewStickerSet'
  readonly stickerset: messages$.TypeStickerSet
}

/** `updateNewStoryReaction#1824e40b` */
export interface UpdateNewStoryReaction {
  readonly _: 'updateNewStoryReaction'
  readonly story_id: number
  readonly peer: root_p$.TypePeer
  readonly reaction: root_r$.TypeReaction
}

/** `updateNotifySettings#bec268ef` */
export interface UpdateNotifySettings {
  readonly _: 'updateNotifySettings'
  readonly peer: root_n$.TypeNotifyPeer
  readonly notify_settings: root_p$.TypePeerNotifySettings
}

/** `updatePaidReactionPrivacy#8b725fce` */
export interface UpdatePaidReactionPrivacy {
  readonly _: 'updatePaidReactionPrivacy'
  readonly private: root_p$.TypePaidReactionPrivacy
}

/** `updatePeerBlocked#ebe07752` */
export interface UpdatePeerBlocked {
  readonly _: 'updatePeerBlocked'
  readonly blocked?: true
  readonly blocked_my_stories_from?: true
  readonly peer_id: root_p$.TypePeer
}

/** `updatePeerHistoryTTL#bb9bb9a5` */
export interface UpdatePeerHistoryTTL {
  readonly _: 'updatePeerHistoryTTL'
  readonly peer: root_p$.TypePeer
  readonly ttl_period?: number
}

/** `updatePeerLocated#b4afcfb0` */
export interface UpdatePeerLocated {
  readonly _: 'updatePeerLocated'
  readonly peers: readonly root_p$.TypePeerLocated[]
}

/** `updatePeerSettings#6a7e7366` */
export interface UpdatePeerSettings {
  readonly _: 'updatePeerSettings'
  readonly peer: root_p$.TypePeer
  readonly settings: root_p$.TypePeerSettings
}

/** `updatePeerWallpaper#ae3f101d` */
export interface UpdatePeerWallpaper {
  readonly _: 'updatePeerWallpaper'
  readonly wallpaper_overridden?: true
  readonly peer: root_p$.TypePeer
  readonly wallpaper?: root_w$.TypeWallPaper
}

/** `updatePendingJoinRequests#7063c3db` */
export interface UpdatePendingJoinRequests {
  readonly _: 'updatePendingJoinRequests'
  readonly peer: root_p$.TypePeer
  readonly requests_pending: number
  readonly recent_requesters: readonly bigint[]
}

/** `updatePhoneCall#ab0f6b1e` */
export interface UpdatePhoneCall {
  readonly _: 'updatePhoneCall'
  readonly phone_call: root_p$.TypePhoneCall
}

/** `updatePhoneCallSignalingData#2661bf09` */
export interface UpdatePhoneCallSignalingData {
  readonly _: 'updatePhoneCallSignalingData'
  readonly phone_call_id: bigint
  readonly data: Uint8Array
}

/** `updatePinnedChannelMessages#5bb98608` */
export interface UpdatePinnedChannelMessages {
  readonly _: 'updatePinnedChannelMessages'
  readonly pinned?: true
  readonly channel_id: bigint
  readonly messages: readonly number[]
  readonly pts: number
  readonly pts_count: number
}

/** `updatePinnedDialogs#fa0f3ca2` */
export interface UpdatePinnedDialogs {
  readonly _: 'updatePinnedDialogs'
  readonly folder_id?: number
  readonly order?: readonly root_d$.TypeDialogPeer[]
}

/** `updatePinnedForumTopic#683b2c52` */
export interface UpdatePinnedForumTopic {
  readonly _: 'updatePinnedForumTopic'
  readonly pinned?: true
  readonly peer: root_p$.TypePeer
  readonly topic_id: number
}

/** `updatePinnedForumTopics#def143d0` */
export interface UpdatePinnedForumTopics {
  readonly _: 'updatePinnedForumTopics'
  readonly peer: root_p$.TypePeer
  readonly order?: readonly number[]
}

/** `updatePinnedMessages#ed85eab5` */
export interface UpdatePinnedMessages {
  readonly _: 'updatePinnedMessages'
  readonly pinned?: true
  readonly peer: root_p$.TypePeer
  readonly messages: readonly number[]
  readonly pts: number
  readonly pts_count: number
}

/** `updatePinnedSavedDialogs#686c85a6` */
export interface UpdatePinnedSavedDialogs {
  readonly _: 'updatePinnedSavedDialogs'
  readonly order?: readonly root_d$.TypeDialogPeer[]
}

/** `updatePrivacy#ee3b272a` */
export interface UpdatePrivacy {
  readonly _: 'updatePrivacy'
  readonly key: root_p$.TypePrivacyKey
  readonly rules: readonly root_p$.TypePrivacyRule[]
}

/** `updatePtsChanged#3354678f` */
export interface UpdatePtsChanged {
  readonly _: 'updatePtsChanged'
}

/** `updateQuickReplies#f9470ab2` */
export interface UpdateQuickReplies {
  readonly _: 'updateQuickReplies'
  readonly quick_replies: readonly root_q$.TypeQuickReply[]
}

/** `updateQuickReplyMessage#3e050d0f` */
export interface UpdateQuickReplyMessage {
  readonly _: 'updateQuickReplyMessage'
  readonly message: root_m$.TypeMessage
}

/** `updateReadChannelDiscussionInbox#d6b19546` */
export interface UpdateReadChannelDiscussionInbox {
  readonly _: 'updateReadChannelDiscussionInbox'
  readonly channel_id: bigint
  readonly top_msg_id: number
  readonly read_max_id: number
  readonly broadcast_id?: bigint
  readonly broadcast_post?: number
}

/** `updateReadChannelDiscussionOutbox#695c9e7c` */
export interface UpdateReadChannelDiscussionOutbox {
  readonly _: 'updateReadChannelDiscussionOutbox'
  readonly channel_id: bigint
  readonly top_msg_id: number
  readonly read_max_id: number
}

/** `updateReadChannelInbox#922e6e10` */
export interface UpdateReadChannelInbox {
  readonly _: 'updateReadChannelInbox'
  readonly folder_id?: number
  readonly channel_id: bigint
  readonly max_id: number
  readonly still_unread_count: number
  readonly pts: number
}

/** `updateReadChannelOutbox#b75f99a9` */
export interface UpdateReadChannelOutbox {
  readonly _: 'updateReadChannelOutbox'
  readonly channel_id: bigint
  readonly max_id: number
}

/** `updateReadFeaturedEmojiStickers#fb4c496c` */
export interface UpdateReadFeaturedEmojiStickers {
  readonly _: 'updateReadFeaturedEmojiStickers'
}

/** `updateReadFeaturedStickers#571d2742` */
export interface UpdateReadFeaturedStickers {
  readonly _: 'updateReadFeaturedStickers'
}

/** `updateReadHistoryInbox#9e84bc99` */
export interface UpdateReadHistoryInbox {
  readonly _: 'updateReadHistoryInbox'
  readonly folder_id?: number
  readonly peer: root_p$.TypePeer
  readonly top_msg_id?: number
  readonly max_id: number
  readonly still_unread_count: number
  readonly pts: number
  readonly pts_count: number
}

/** `updateReadHistoryOutbox#2f2f21bf` */
export interface UpdateReadHistoryOutbox {
  readonly _: 'updateReadHistoryOutbox'
  readonly peer: root_p$.TypePeer
  readonly max_id: number
  readonly pts: number
  readonly pts_count: number
}

/** `updateReadMessagesContents#f8227181` */
export interface UpdateReadMessagesContents {
  readonly _: 'updateReadMessagesContents'
  readonly messages: readonly number[]
  readonly pts: number
  readonly pts_count: number
  readonly date?: number
}

/** `updateReadMonoForumInbox#77b0e372` */
export interface UpdateReadMonoForumInbox {
  readonly _: 'updateReadMonoForumInbox'
  readonly channel_id: bigint
  readonly saved_peer_id: root_p$.TypePeer
  readonly read_max_id: number
}

/** `updateReadMonoForumOutbox#a4a79376` */
export interface UpdateReadMonoForumOutbox {
  readonly _: 'updateReadMonoForumOutbox'
  readonly channel_id: bigint
  readonly saved_peer_id: root_p$.TypePeer
  readonly read_max_id: number
}

/** `updateReadStories#f74e932b` */
export interface UpdateReadStories {
  readonly _: 'updateReadStories'
  readonly peer: root_p$.TypePeer
  readonly max_id: number
}

/** `updateRecentEmojiStatuses#30f443db` */
export interface UpdateRecentEmojiStatuses {
  readonly _: 'updateRecentEmojiStatuses'
}

/** `updateRecentReactions#6f7863f4` */
export interface UpdateRecentReactions {
  readonly _: 'updateRecentReactions'
}

/** `updateRecentStickers#9a422c20` */
export interface UpdateRecentStickers {
  readonly _: 'updateRecentStickers'
}

/** `updateSavedDialogPinned#aeaf9e74` */
export interface UpdateSavedDialogPinned {
  readonly _: 'updateSavedDialogPinned'
  readonly pinned?: true
  readonly peer: root_d$.TypeDialogPeer
}

/** `updateSavedGifs#9375341e` */
export interface UpdateSavedGifs {
  readonly _: 'updateSavedGifs'
}

/** `updateSavedReactionTags#39c67432` */
export interface UpdateSavedReactionTags {
  readonly _: 'updateSavedReactionTags'
}

/** `updateSavedRingtones#74d8be99` */
export interface UpdateSavedRingtones {
  readonly _: 'updateSavedRingtones'
}

/** `updateSentPhoneCode#504aa18f` */
export interface UpdateSentPhoneCode {
  readonly _: 'updateSentPhoneCode'
  readonly sent_code: auth$.TypeSentCode
}

/** `updateSentStoryReaction#7d627683` */
export interface UpdateSentStoryReaction {
  readonly _: 'updateSentStoryReaction'
  readonly peer: root_p$.TypePeer
  readonly story_id: number
  readonly reaction: root_r$.TypeReaction
}

/** `updateServiceNotification#ebe46819` */
export interface UpdateServiceNotification {
  readonly _: 'updateServiceNotification'
  readonly popup?: true
  readonly invert_media?: true
  readonly inbox_date?: number
  readonly type: string
  readonly message: string
  readonly media: root_m$.TypeMessageMedia
  readonly entities: readonly root_m$.TypeMessageEntity[]
}

/** `updateShort#78d4dec1` */
export interface UpdateShort {
  readonly _: 'updateShort'
  readonly update: TypeUpdate
  readonly date: number
}

/** `updateShortChatMessage#4d6deea5` */
export interface UpdateShortChatMessage {
  readonly _: 'updateShortChatMessage'
  readonly out?: true
  readonly mentioned?: true
  readonly media_unread?: true
  readonly silent?: true
  readonly id: number
  readonly from_id: bigint
  readonly chat_id: bigint
  readonly message: string
  readonly pts: number
  readonly pts_count: number
  readonly date: number
  readonly fwd_from?: root_m$.TypeMessageFwdHeader
  readonly via_bot_id?: bigint
  readonly reply_to?: root_m$.TypeMessageReplyHeader
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly ttl_period?: number
}

/** `updateShortMessage#313bc7f8` */
export interface UpdateShortMessage {
  readonly _: 'updateShortMessage'
  readonly out?: true
  readonly mentioned?: true
  readonly media_unread?: true
  readonly silent?: true
  readonly id: number
  readonly user_id: bigint
  readonly message: string
  readonly pts: number
  readonly pts_count: number
  readonly date: number
  readonly fwd_from?: root_m$.TypeMessageFwdHeader
  readonly via_bot_id?: bigint
  readonly reply_to?: root_m$.TypeMessageReplyHeader
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly ttl_period?: number
}

/** `updateShortSentMessage#9015e101` */
export interface UpdateShortSentMessage {
  readonly _: 'updateShortSentMessage'
  readonly out?: true
  readonly id: number
  readonly pts: number
  readonly pts_count: number
  readonly date: number
  readonly media?: root_m$.TypeMessageMedia
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly ttl_period?: number
}

/** `updateSmsJob#f16269d4` */
export interface UpdateSmsJob {
  readonly _: 'updateSmsJob'
  readonly job_id: string
}

/** `updateStarGiftAuctionState#48e246c2` */
export interface UpdateStarGiftAuctionState {
  readonly _: 'updateStarGiftAuctionState'
  readonly gift_id: bigint
  readonly state: root_s$.TypeStarGiftAuctionState
}

/** `updateStarGiftAuctionUserState#dc58f31e` */
export interface UpdateStarGiftAuctionUserState {
  readonly _: 'updateStarGiftAuctionUserState'
  readonly gift_id: bigint
  readonly user_state: root_s$.TypeStarGiftAuctionUserState
}

/** `updateStarGiftCraftFail#ac072444` */
export interface UpdateStarGiftCraftFail {
  readonly _: 'updateStarGiftCraftFail'
}

/** `updateStarsBalance#4e80a379` */
export interface UpdateStarsBalance {
  readonly _: 'updateStarsBalance'
  readonly balance: root_s$.TypeStarsAmount
}

/** `updateStarsRevenueStatus#a584b019` */
export interface UpdateStarsRevenueStatus {
  readonly _: 'updateStarsRevenueStatus'
  readonly peer: root_p$.TypePeer
  readonly status: root_s$.TypeStarsRevenueStatus
}

/** `updateStickerSets#31c24808` */
export interface UpdateStickerSets {
  readonly _: 'updateStickerSets'
  readonly masks?: true
  readonly emojis?: true
}

/** `updateStickerSetsOrder#0bb2d201` */
export interface UpdateStickerSetsOrder {
  readonly _: 'updateStickerSetsOrder'
  readonly masks?: true
  readonly emojis?: true
  readonly order: readonly bigint[]
}

/** `updateStoriesStealthMode#2c084dc1` */
export interface UpdateStoriesStealthMode {
  readonly _: 'updateStoriesStealthMode'
  readonly stealth_mode: root_s$.TypeStoriesStealthMode
}

/** `updateStory#75b3b798` */
export interface UpdateStory {
  readonly _: 'updateStory'
  readonly peer: root_p$.TypePeer
  readonly story: root_s$.TypeStoryItem
}

/** `updateStoryID#1bf335b9` */
export interface UpdateStoryID {
  readonly _: 'updateStoryID'
  readonly id: number
  readonly random_id: bigint
}

/** `updateTheme#8216fba3` */
export interface UpdateTheme {
  readonly _: 'updateTheme'
  readonly theme: root_t$.TypeTheme
}

/** `updateTranscribedAudio#0084cd5a` */
export interface UpdateTranscribedAudio {
  readonly _: 'updateTranscribedAudio'
  readonly pending?: true
  readonly peer: root_p$.TypePeer
  readonly msg_id: number
  readonly transcription_id: bigint
  readonly text: string
}

/** `updateUser#20529438` */
export interface UpdateUser {
  readonly _: 'updateUser'
  readonly user_id: bigint
}

/** `updateUserEmojiStatus#28373599` */
export interface UpdateUserEmojiStatus {
  readonly _: 'updateUserEmojiStatus'
  readonly user_id: bigint
  readonly emoji_status: root_e$.TypeEmojiStatus
}

/** `updateUserName#a7848924` */
export interface UpdateUserName {
  readonly _: 'updateUserName'
  readonly user_id: bigint
  readonly first_name: string
  readonly last_name: string
  readonly usernames: readonly TypeUsername[]
}

/** `updateUserPhone#05492a13` */
export interface UpdateUserPhone {
  readonly _: 'updateUserPhone'
  readonly user_id: bigint
  readonly phone: string
}

/** `updateUserStatus#e5bdf8de` */
export interface UpdateUserStatus {
  readonly _: 'updateUserStatus'
  readonly user_id: bigint
  readonly status: TypeUserStatus
}

/** `updateUserTyping#2a17bf5c` */
export interface UpdateUserTyping {
  readonly _: 'updateUserTyping'
  readonly user_id: bigint
  readonly top_msg_id?: number
  readonly action: root_s$.TypeSendMessageAction
}

/** `updateWebBrowserException#140502d1` */
export interface UpdateWebBrowserException {
  readonly _: 'updateWebBrowserException'
  readonly delete?: true
  readonly open_external_browser?: boolean
  readonly exception: root_w$.TypeWebDomainException
}

/** `updateWebBrowserSettings#c39a2ade` */
export interface UpdateWebBrowserSettings {
  readonly _: 'updateWebBrowserSettings'
  readonly open_external_browser?: true
  readonly display_close_button?: true
}

/** `updateWebPage#7f891213` */
export interface UpdateWebPage {
  readonly _: 'updateWebPage'
  readonly webpage: root_w$.TypeWebPage
  readonly pts: number
  readonly pts_count: number
}

/** `updateWebViewResultSent#1592b79d` */
export interface UpdateWebViewResultSent {
  readonly _: 'updateWebViewResultSent'
  readonly query_id: bigint
}

/** `updates#74ae4240` */
export interface Updates {
  readonly _: 'updates'
  readonly updates: readonly TypeUpdate[]
  readonly users: readonly TypeUser[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly date: number
  readonly seq: number
}

/** `updatesCombined#725b04c3` */
export interface UpdatesCombined {
  readonly _: 'updatesCombined'
  readonly updates: readonly TypeUpdate[]
  readonly users: readonly TypeUser[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly date: number
  readonly seq_start: number
  readonly seq: number
}

/** `updatesTooLong#e317af7e` */
export interface UpdatesTooLong {
  readonly _: 'updatesTooLong'
}

/** `urlAuthResultAccepted#623a8fa0` */
export interface UrlAuthResultAccepted {
  readonly _: 'urlAuthResultAccepted'
  readonly url?: string
}

/** `urlAuthResultDefault#a9d6db1f` */
export interface UrlAuthResultDefault {
  readonly _: 'urlAuthResultDefault'
}

/** `urlAuthResultRequest#3cd623ec` */
export interface UrlAuthResultRequest {
  readonly _: 'urlAuthResultRequest'
  readonly request_write_access?: true
  readonly request_phone_number?: true
  readonly match_codes_first?: true
  readonly is_app?: true
  readonly bot: TypeUser
  readonly domain: string
  readonly browser?: string
  readonly platform?: string
  readonly ip?: string
  readonly region?: string
  readonly match_codes?: readonly string[]
  readonly user_id_hint?: bigint
  readonly verified_app_name?: string
}

/** `user#b1b8cc83` */
export interface User {
  readonly _: 'user'
  readonly self?: true
  readonly contact?: true
  readonly mutual_contact?: true
  readonly deleted?: true
  readonly bot?: true
  readonly bot_chat_history?: true
  readonly bot_nochats?: true
  readonly verified?: true
  readonly restricted?: true
  readonly min?: true
  readonly bot_inline_geo?: true
  readonly support?: true
  readonly scam?: true
  readonly apply_min_photo?: true
  readonly fake?: true
  readonly bot_attach_menu?: true
  readonly premium?: true
  readonly attach_menu_enabled?: true
  readonly bot_can_edit?: true
  readonly close_friend?: true
  readonly stories_hidden?: true
  readonly stories_unavailable?: true
  readonly contact_require_premium?: true
  readonly bot_business?: true
  readonly bot_has_main_app?: true
  readonly bot_forum_view?: true
  readonly bot_forum_can_manage_topics?: true
  readonly bot_can_manage_bots?: true
  readonly bot_guestchat?: true
  readonly bot_guard?: true
  readonly id: bigint
  readonly access_hash?: bigint
  readonly first_name?: string
  readonly last_name?: string
  readonly username?: string
  readonly phone?: string
  readonly photo?: TypeUserProfilePhoto
  readonly status?: TypeUserStatus
  readonly bot_info_version?: number
  readonly restriction_reason?: readonly root_r$.TypeRestrictionReason[]
  readonly bot_inline_placeholder?: string
  readonly lang_code?: string
  readonly emoji_status?: root_e$.TypeEmojiStatus
  readonly usernames?: readonly TypeUsername[]
  readonly stories_max_id?: root_r$.TypeRecentStory
  readonly color?: root_p$.TypePeerColor
  readonly profile_color?: root_p$.TypePeerColor
  readonly bot_active_users?: number
  readonly bot_verification_icon?: bigint
  readonly send_paid_messages_stars?: bigint
  readonly linked_community_id?: bigint
}

/** `userEmpty#d3bc4b7a` */
export interface UserEmpty {
  readonly _: 'userEmpty'
  readonly id: bigint
}

/** `userFull#06cbe645` */
export interface UserFull {
  readonly _: 'userFull'
  readonly blocked?: true
  readonly phone_calls_available?: true
  readonly phone_calls_private?: true
  readonly can_pin_message?: true
  readonly has_scheduled?: true
  readonly video_calls_available?: true
  readonly voice_messages_forbidden?: true
  readonly translations_disabled?: true
  readonly stories_pinned_available?: true
  readonly blocked_my_stories_from?: true
  readonly wallpaper_overridden?: true
  readonly contact_require_premium?: true
  readonly read_dates_private?: true
  readonly sponsored_enabled?: true
  readonly can_view_revenue?: true
  readonly bot_can_manage_emoji_status?: true
  readonly display_gifts_button?: true
  readonly noforwards_my_enabled?: true
  readonly noforwards_peer_enabled?: true
  readonly unofficial_security_risk?: true
  readonly id: bigint
  readonly about?: string
  readonly settings: root_p$.TypePeerSettings
  readonly personal_photo?: root_p$.TypePhoto
  readonly profile_photo?: root_p$.TypePhoto
  readonly fallback_photo?: root_p$.TypePhoto
  readonly notify_settings: root_p$.TypePeerNotifySettings
  readonly bot_info?: root_b$.TypeBotInfo
  readonly pinned_msg_id?: number
  readonly common_chats_count: number
  readonly folder_id?: number
  readonly ttl_period?: number
  readonly theme?: root_c$.TypeChatTheme
  readonly private_forward_name?: string
  readonly bot_group_admin_rights?: root_c$.TypeChatAdminRights
  readonly bot_broadcast_admin_rights?: root_c$.TypeChatAdminRights
  readonly wallpaper?: root_w$.TypeWallPaper
  readonly stories?: root_p$.TypePeerStories
  readonly business_work_hours?: root_b$.TypeBusinessWorkHours
  readonly business_location?: root_b$.TypeBusinessLocation
  readonly business_greeting_message?: root_b$.TypeBusinessGreetingMessage
  readonly business_away_message?: root_b$.TypeBusinessAwayMessage
  readonly business_intro?: root_b$.TypeBusinessIntro
  readonly birthday?: root_b$.TypeBirthday
  readonly personal_channel_id?: bigint
  readonly personal_channel_message?: number
  readonly stargifts_count?: number
  readonly starref_program?: root_s$.TypeStarRefProgram
  readonly bot_verification?: root_b$.TypeBotVerification
  readonly send_paid_messages_stars?: bigint
  readonly disallowed_gifts?: root_d$.TypeDisallowedGiftsSettings
  readonly stars_rating?: root_s$.TypeStarsRating
  readonly stars_my_pending_rating?: root_s$.TypeStarsRating
  readonly stars_my_pending_rating_date?: number
  readonly main_tab?: root_p$.TypeProfileTab
  readonly saved_music?: root_d$.TypeDocument
  readonly note?: root_t$.TypeTextWithEntities
  readonly bot_manager_id?: bigint
}

/** `userProfilePhoto#82d1f706` */
export interface UserProfilePhoto {
  readonly _: 'userProfilePhoto'
  readonly has_video?: true
  readonly personal?: true
  readonly photo_id: bigint
  readonly stripped_thumb?: Uint8Array
  readonly dc_id: number
}

/** `userProfilePhotoEmpty#4f11bae1` */
export interface UserProfilePhotoEmpty {
  readonly _: 'userProfilePhotoEmpty'
}

/** `userStatusEmpty#09d05049` */
export interface UserStatusEmpty {
  readonly _: 'userStatusEmpty'
}

/** `userStatusLastMonth#65899777` */
export interface UserStatusLastMonth {
  readonly _: 'userStatusLastMonth'
  readonly by_me?: true
}

/** `userStatusLastWeek#541a1d1a` */
export interface UserStatusLastWeek {
  readonly _: 'userStatusLastWeek'
  readonly by_me?: true
}

/** `userStatusOffline#008c703f` */
export interface UserStatusOffline {
  readonly _: 'userStatusOffline'
  readonly was_online: number
}

/** `userStatusOnline#edb93949` */
export interface UserStatusOnline {
  readonly _: 'userStatusOnline'
  readonly expires: number
}

/** `userStatusRecently#7b197dc8` */
export interface UserStatusRecently {
  readonly _: 'userStatusRecently'
  readonly by_me?: true
}

/** `username#b4073647` */
export interface Username {
  readonly _: 'username'
  readonly editable?: true
  readonly active?: true
  readonly username: string
}
