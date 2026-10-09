// GENERATED FILE — do not edit.
// TL types for messages
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_a$ from './root/a.js'
import type * as root_b$ from './root/b.js'
import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_e$ from './root/e.js'
import type * as root_f$ from './root/f.js'
import type * as root_h$ from './root/h.js'
import type * as root_i$ from './root/i.js'
import type * as root_m$ from './root/m.js'
import type * as root_p$ from './root/p.js'
import type * as root_q$ from './root/q.js'
import type * as root_r$ from './root/r.js'
import type * as root_s$ from './root/s.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type * as root_w$ from './root/w.js'
import type * as updates$ from './updates.js'
import type { TlObject } from '../../../tl/object.js'

/** `messages.acceptEncryption#3dbc0415` */
export interface AcceptEncryption {
  readonly _: 'messages.acceptEncryption'
  readonly peer: root_i$.TypeInputEncryptedChat
  readonly g_b: Uint8Array
  readonly key_fingerprint: bigint
}

/** `messages.acceptUrlAuth#67a3f0de` */
export interface AcceptUrlAuth {
  readonly _: 'messages.acceptUrlAuth'
  readonly write_allowed?: true
  readonly share_phone_number?: true
  readonly peer?: root_i$.TypeInputPeer
  readonly msg_id?: number
  readonly button_id?: number
  readonly url?: string
  readonly match_code?: string
}

/** `messages.addChatUser#cbc6d107` */
export interface AddChatUser {
  readonly _: 'messages.addChatUser'
  readonly chat_id: bigint
  readonly user_id: root_i$.TypeInputUser
  readonly fwd_limit: number
}

/** `messages.addPollAnswer#19bc4b6d` */
export interface AddPollAnswer {
  readonly _: 'messages.addPollAnswer'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly answer: root_p$.TypePollAnswer
}

/** `messages.affectedFoundMessages#ef8d3e6c` */
export interface AffectedFoundMessages {
  readonly _: 'messages.affectedFoundMessages'
  readonly pts: number
  readonly pts_count: number
  readonly offset: number
  readonly messages: readonly number[]
}

/** `messages.affectedHistory#b45c69d1` */
export interface AffectedHistory {
  readonly _: 'messages.affectedHistory'
  readonly pts: number
  readonly pts_count: number
  readonly offset: number
}

/** `messages.affectedMessages#84d19185` */
export interface AffectedMessages {
  readonly _: 'messages.affectedMessages'
  readonly pts: number
  readonly pts_count: number
}

/** `messages.allStickers#cdbbcebb` */
export interface AllStickers {
  readonly _: 'messages.allStickers'
  readonly hash: bigint
  readonly sets: readonly root_s$.TypeStickerSet[]
}

/** `messages.allStickersNotModified#e86602c3` */
export interface AllStickersNotModified {
  readonly _: 'messages.allStickersNotModified'
}

/** `messages.appendTodoList#21a61057` */
export interface AppendTodoList {
  readonly _: 'messages.appendTodoList'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly list: readonly root_t$.TypeTodoItem[]
}

/** `messages.archivedStickers#4fcba9c8` */
export interface ArchivedStickers {
  readonly _: 'messages.archivedStickers'
  readonly count: number
  readonly sets: readonly root_s$.TypeStickerSetCovered[]
}

/** `messages.availableEffects#bddb616e` */
export interface AvailableEffects {
  readonly _: 'messages.availableEffects'
  readonly hash: number
  readonly effects: readonly root_a$.TypeAvailableEffect[]
  readonly documents: readonly root_d$.TypeDocument[]
}

/** `messages.availableEffectsNotModified#d1ed9a5b` */
export interface AvailableEffectsNotModified {
  readonly _: 'messages.availableEffectsNotModified'
}

/** `messages.availableReactions#768e3aad` */
export interface AvailableReactions {
  readonly _: 'messages.availableReactions'
  readonly hash: number
  readonly reactions: readonly root_a$.TypeAvailableReaction[]
}

/** `messages.availableReactionsNotModified#9f071957` */
export interface AvailableReactionsNotModified {
  readonly _: 'messages.availableReactionsNotModified'
}

/** `messages.botApp#eb50adf5` */
export interface BotApp {
  readonly _: 'messages.botApp'
  readonly inactive?: true
  readonly request_write_access?: true
  readonly has_settings?: true
  readonly app: root_b$.TypeBotApp
}

/** `messages.botCallbackAnswer#36585ea4` */
export interface BotCallbackAnswer {
  readonly _: 'messages.botCallbackAnswer'
  readonly alert?: true
  readonly has_url?: true
  readonly native_ui?: true
  readonly message?: string
  readonly url?: string
  readonly cache_time: number
}

/** `messages.botPreparedInlineMessage#8ecf0511` */
export interface BotPreparedInlineMessage {
  readonly _: 'messages.botPreparedInlineMessage'
  readonly id: string
  readonly expire_date: number
}

/** `messages.botResults#e021f2f6` */
export interface BotResults {
  readonly _: 'messages.botResults'
  readonly gallery?: true
  readonly query_id: bigint
  readonly next_offset?: string
  readonly switch_pm?: root_i$.TypeInlineBotSwitchPM
  readonly switch_webview?: root_i$.TypeInlineBotWebView
  readonly results: readonly root_b$.TypeBotInlineResult[]
  readonly cache_time: number
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.channelMessages#c776ba4e` */
export interface ChannelMessages {
  readonly _: 'messages.channelMessages'
  readonly inexact?: true
  readonly pts: number
  readonly count: number
  readonly offset_id_offset?: number
  readonly messages: readonly root_m$.TypeMessage[]
  readonly topics: readonly root_f$.TypeForumTopic[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.chatAdminsWithInvites#b69b72d7` */
export interface ChatAdminsWithInvites {
  readonly _: 'messages.chatAdminsWithInvites'
  readonly admins: readonly root_c$.TypeChatAdminWithInvites[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.chatFull#e5d7d19c` */
export interface ChatFull {
  readonly _: 'messages.chatFull'
  readonly full_chat: root_c$.TypeChatFull
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.chatInviteImporters#81b6b00a` */
export interface ChatInviteImporters {
  readonly _: 'messages.chatInviteImporters'
  readonly count: number
  readonly importers: readonly root_c$.TypeChatInviteImporter[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.chatInviteJoinResultOk#445663a7` */
export interface ChatInviteJoinResultOk {
  readonly _: 'messages.chatInviteJoinResultOk'
  readonly updates: root_u$.TypeUpdates
}

/** `messages.chatInviteJoinResultWebView#61ca29d3` */
export interface ChatInviteJoinResultWebView {
  readonly _: 'messages.chatInviteJoinResultWebView'
  readonly bot_id: bigint
  readonly query_id: bigint
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.chats#64ff9fd5` */
export interface Chats {
  readonly _: 'messages.chats'
  readonly chats: readonly root_c$.TypeChat[]
}

/** `messages.chatsSlice#9cd81144` */
export interface ChatsSlice {
  readonly _: 'messages.chatsSlice'
  readonly count: number
  readonly chats: readonly root_c$.TypeChat[]
}

/** `messages.checkChatInvite#3eadb1bb` */
export interface CheckChatInvite {
  readonly _: 'messages.checkChatInvite'
  readonly hash: string
}

/** `messages.checkHistoryImport#43fe19f3` */
export interface CheckHistoryImport {
  readonly _: 'messages.checkHistoryImport'
  readonly import_head: string
}

/** `messages.checkHistoryImportPeer#5dc60f03` */
export interface CheckHistoryImportPeer {
  readonly _: 'messages.checkHistoryImportPeer'
  readonly peer: root_i$.TypeInputPeer
}

/** `messages.checkQuickReplyShortcut#f1d0fbd3` */
export interface CheckQuickReplyShortcut {
  readonly _: 'messages.checkQuickReplyShortcut'
  readonly shortcut: string
}

/** `messages.checkUrlAuthMatchCode#c9a47b0b` */
export interface CheckUrlAuthMatchCode {
  readonly _: 'messages.checkUrlAuthMatchCode'
  readonly url: string
  readonly match_code: string
}

/** `messages.checkedHistoryImportPeer#a24de717` */
export interface CheckedHistoryImportPeer {
  readonly _: 'messages.checkedHistoryImportPeer'
  readonly confirm_text: string
}

/** `messages.clearAllDrafts#7e58ee9c` */
export interface ClearAllDrafts {
  readonly _: 'messages.clearAllDrafts'
}

/** `messages.clearRecentReactions#9dfeefb4` */
export interface ClearRecentReactions {
  readonly _: 'messages.clearRecentReactions'
}

/** `messages.clearRecentStickers#8999602d` */
export interface ClearRecentStickers {
  readonly _: 'messages.clearRecentStickers'
  readonly attached?: true
}

/** `messages.clickSponsoredMessage#8235057e` */
export interface ClickSponsoredMessage {
  readonly _: 'messages.clickSponsoredMessage'
  readonly media?: true
  readonly fullscreen?: true
  readonly random_id: Uint8Array
}

/** `messages.composeMessageWithAI#daecc589` */
export interface ComposeMessageWithAI {
  readonly _: 'messages.composeMessageWithAI'
  readonly proofread?: true
  readonly emojify?: true
  readonly text: root_t$.TypeTextWithEntities
  readonly translate_to_lang?: string
  readonly tone?: root_i$.TypeInputAiComposeTone
}

/** `messages.composeRichMessageWithAI#8d7ae6af` */
export interface ComposeRichMessageWithAI {
  readonly _: 'messages.composeRichMessageWithAI'
  readonly proofread?: true
  readonly emojify?: true
  readonly text?: root_i$.TypeInputRichMessage
  readonly translate_to_lang?: string
  readonly tone?: root_i$.TypeInputAiComposeTone
}

/** `messages.composedMessageWithAI#90d7adfa` */
export interface ComposedMessageWithAI {
  readonly _: 'messages.composedMessageWithAI'
  readonly result_text: root_t$.TypeTextWithEntities
  readonly diff_text?: root_t$.TypeTextWithEntities
}

/** `messages.composedRichMessageWithAI#4c4537c8` */
export interface ComposedRichMessageWithAI {
  readonly _: 'messages.composedRichMessageWithAI'
  readonly result: root_r$.TypeRichMessage
}

/** `messages.createChat#92ceddd4` */
export interface CreateChat {
  readonly _: 'messages.createChat'
  readonly users: readonly root_i$.TypeInputUser[]
  readonly title: string
  readonly ttl_period?: number
}

/** `messages.createForumTopic#2f98c3d5` */
export interface CreateForumTopic {
  readonly _: 'messages.createForumTopic'
  readonly title_missing?: true
  readonly peer: root_i$.TypeInputPeer
  readonly title: string
  readonly icon_color?: number
  readonly icon_emoji_id?: bigint
  readonly random_id: bigint
  readonly send_as?: root_i$.TypeInputPeer
}

/** `messages.declineUrlAuth#35436bbc` */
export interface DeclineUrlAuth {
  readonly _: 'messages.declineUrlAuth'
  readonly url: string
}

/** `messages.deleteChat#5bd0ee50` */
export interface DeleteChat {
  readonly _: 'messages.deleteChat'
  readonly chat_id: bigint
}

/** `messages.deleteChatUser#a2185cab` */
export interface DeleteChatUser {
  readonly _: 'messages.deleteChatUser'
  readonly revoke_history?: true
  readonly chat_id: bigint
  readonly user_id: root_i$.TypeInputUser
}

/** `messages.deleteExportedChatInvite#d464a42b` */
export interface DeleteExportedChatInvite {
  readonly _: 'messages.deleteExportedChatInvite'
  readonly peer: root_i$.TypeInputPeer
  readonly link: string
}

/** `messages.deleteFactCheck#d1da940c` */
export interface DeleteFactCheck {
  readonly _: 'messages.deleteFactCheck'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
}

/** `messages.deleteHistory#b08f922a` */
export interface DeleteHistory {
  readonly _: 'messages.deleteHistory'
  readonly just_clear?: true
  readonly revoke?: true
  readonly peer: root_i$.TypeInputPeer
  readonly max_id: number
  readonly min_date?: number
  readonly max_date?: number
}

/** `messages.deleteMessages#e58e95d2` */
export interface DeleteMessages {
  readonly _: 'messages.deleteMessages'
  readonly revoke?: true
  readonly id: readonly number[]
}

/** `messages.deleteParticipantReaction#e3b7f82c` */
export interface DeleteParticipantReaction {
  readonly _: 'messages.deleteParticipantReaction'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly participant: root_i$.TypeInputPeer
}

/** `messages.deleteParticipantReactions#a0b80cf8` */
export interface DeleteParticipantReactions {
  readonly _: 'messages.deleteParticipantReactions'
  readonly peer: root_i$.TypeInputPeer
  readonly participant: root_i$.TypeInputPeer
}

/** `messages.deletePhoneCallHistory#f9cbe409` */
export interface DeletePhoneCallHistory {
  readonly _: 'messages.deletePhoneCallHistory'
  readonly revoke?: true
}

/** `messages.deletePollAnswer#ac8505a5` */
export interface DeletePollAnswer {
  readonly _: 'messages.deletePollAnswer'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly option: Uint8Array
}

/** `messages.deleteQuickReplyMessages#e105e910` */
export interface DeleteQuickReplyMessages {
  readonly _: 'messages.deleteQuickReplyMessages'
  readonly shortcut_id: number
  readonly id: readonly number[]
}

/** `messages.deleteQuickReplyShortcut#3cc04740` */
export interface DeleteQuickReplyShortcut {
  readonly _: 'messages.deleteQuickReplyShortcut'
  readonly shortcut_id: number
}

/** `messages.deleteRevokedExportedChatInvites#56987bd5` */
export interface DeleteRevokedExportedChatInvites {
  readonly _: 'messages.deleteRevokedExportedChatInvites'
  readonly peer: root_i$.TypeInputPeer
  readonly admin_id: root_i$.TypeInputUser
}

/** `messages.deleteSavedHistory#4dc5085f` */
export interface DeleteSavedHistory {
  readonly _: 'messages.deleteSavedHistory'
  readonly parent_peer?: root_i$.TypeInputPeer
  readonly peer: root_i$.TypeInputPeer
  readonly max_id: number
  readonly min_date?: number
  readonly max_date?: number
}

/** `messages.deleteScheduledMessages#59ae2b16` */
export interface DeleteScheduledMessages {
  readonly _: 'messages.deleteScheduledMessages'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `messages.deleteTopicHistory#d2816f10` */
export interface DeleteTopicHistory {
  readonly _: 'messages.deleteTopicHistory'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id: number
}

/** `messages.dhConfig#2c221edd` */
export interface DhConfig {
  readonly _: 'messages.dhConfig'
  readonly g: number
  readonly p: Uint8Array
  readonly version: number
  readonly random: Uint8Array
}

/** `messages.dhConfigNotModified#c0e24635` */
export interface DhConfigNotModified {
  readonly _: 'messages.dhConfigNotModified'
  readonly random: Uint8Array
}

/** `messages.dialogFilters#2ad93719` */
export interface DialogFilters {
  readonly _: 'messages.dialogFilters'
  readonly tags_enabled?: true
  readonly filters: readonly root_d$.TypeDialogFilter[]
}

/** `messages.dialogs#15ba6c40` */
export interface Dialogs {
  readonly _: 'messages.dialogs'
  readonly dialogs: readonly root_d$.TypeDialog[]
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.dialogsNotModified#f0e3e596` */
export interface DialogsNotModified {
  readonly _: 'messages.dialogsNotModified'
  readonly count: number
}

/** `messages.dialogsSlice#71e094f3` */
export interface DialogsSlice {
  readonly _: 'messages.dialogsSlice'
  readonly count: number
  readonly dialogs: readonly root_d$.TypeDialog[]
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.discardEncryption#f393aea0` */
export interface DiscardEncryption {
  readonly _: 'messages.discardEncryption'
  readonly delete_history?: true
  readonly chat_id: number
}

/** `messages.discussionMessage#a6341782` */
export interface DiscussionMessage {
  readonly _: 'messages.discussionMessage'
  readonly messages: readonly root_m$.TypeMessage[]
  readonly max_id?: number
  readonly read_inbox_max_id?: number
  readonly read_outbox_max_id?: number
  readonly unread_count: number
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.editChatAbout#def60797` */
export interface EditChatAbout {
  readonly _: 'messages.editChatAbout'
  readonly peer: root_i$.TypeInputPeer
  readonly about: string
}

/** `messages.editChatAdmin#a85bd1c2` */
export interface EditChatAdmin {
  readonly _: 'messages.editChatAdmin'
  readonly chat_id: bigint
  readonly user_id: root_i$.TypeInputUser
  readonly is_admin: boolean
}

/** `messages.editChatCreator#f743b857` */
export interface EditChatCreator {
  readonly _: 'messages.editChatCreator'
  readonly peer: root_i$.TypeInputPeer
  readonly user_id: root_i$.TypeInputUser
  readonly password: root_i$.TypeInputCheckPasswordSRP
}

/** `messages.editChatDefaultBannedRights#a5866b41` */
export interface EditChatDefaultBannedRights {
  readonly _: 'messages.editChatDefaultBannedRights'
  readonly peer: root_i$.TypeInputPeer
  readonly banned_rights: root_c$.TypeChatBannedRights
}

/** `messages.editChatParticipantRank#a00f32b0` */
export interface EditChatParticipantRank {
  readonly _: 'messages.editChatParticipantRank'
  readonly peer: root_i$.TypeInputPeer
  readonly participant: root_i$.TypeInputPeer
  readonly rank: string
}

/** `messages.editChatPhoto#35ddd674` */
export interface EditChatPhoto {
  readonly _: 'messages.editChatPhoto'
  readonly chat_id: bigint
  readonly photo: root_i$.TypeInputChatPhoto
}

/** `messages.editChatTitle#73783ffd` */
export interface EditChatTitle {
  readonly _: 'messages.editChatTitle'
  readonly chat_id: bigint
  readonly title: string
}

/** `messages.editExportedChatInvite#bdca2f75` */
export interface EditExportedChatInvite {
  readonly _: 'messages.editExportedChatInvite'
  readonly revoked?: true
  readonly peer: root_i$.TypeInputPeer
  readonly link: string
  readonly expire_date?: number
  readonly usage_limit?: number
  readonly request_needed?: boolean
  readonly title?: string
}

/** `messages.editFactCheck#0589ee75` */
export interface EditFactCheck {
  readonly _: 'messages.editFactCheck'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly text: root_t$.TypeTextWithEntities
}

/** `messages.editForumTopic#cecc1134` */
export interface EditForumTopic {
  readonly _: 'messages.editForumTopic'
  readonly peer: root_i$.TypeInputPeer
  readonly topic_id: number
  readonly title?: string
  readonly icon_emoji_id?: bigint
  readonly closed?: boolean
  readonly hidden?: boolean
}

/** `messages.editInlineBotMessage#a423bb51` */
export interface EditInlineBotMessage {
  readonly _: 'messages.editInlineBotMessage'
  readonly no_webpage?: true
  readonly invert_media?: true
  readonly id: root_i$.TypeInputBotInlineMessageID
  readonly message?: string
  readonly media?: root_i$.TypeInputMedia
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly rich_message?: root_i$.TypeInputRichMessage
}

/** `messages.editMessage#b106e66c` */
export interface EditMessage {
  readonly _: 'messages.editMessage'
  readonly no_webpage?: true
  readonly invert_media?: true
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly message?: string
  readonly media?: root_i$.TypeInputMedia
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly schedule_date?: number
  readonly schedule_repeat_period?: number
  readonly quick_reply_shortcut_id?: number
  readonly rich_message?: root_i$.TypeInputRichMessage
}

/** `messages.editQuickReplyShortcut#5c003cef` */
export interface EditQuickReplyShortcut {
  readonly _: 'messages.editQuickReplyShortcut'
  readonly shortcut_id: number
  readonly shortcut: string
}

/** `messages.emojiGameDiceInfo#44e56023` */
export interface EmojiGameDiceInfo {
  readonly _: 'messages.emojiGameDiceInfo'
  readonly game_hash: string
  readonly prev_stake: bigint
  readonly current_streak: number
  readonly params: readonly number[]
  readonly plays_left?: number
}

/** `messages.emojiGameOutcome#da2ad647` */
export interface EmojiGameOutcome {
  readonly _: 'messages.emojiGameOutcome'
  readonly seed: Uint8Array
  readonly stake_ton_amount: bigint
  readonly ton_amount: bigint
}

/** `messages.emojiGameUnavailable#59e65335` */
export interface EmojiGameUnavailable {
  readonly _: 'messages.emojiGameUnavailable'
}

/** `messages.emojiGroups#881fb94b` */
export interface EmojiGroups {
  readonly _: 'messages.emojiGroups'
  readonly hash: number
  readonly groups: readonly root_e$.TypeEmojiGroup[]
}

/** `messages.emojiGroupsNotModified#6fb4ad87` */
export interface EmojiGroupsNotModified {
  readonly _: 'messages.emojiGroupsNotModified'
}

/** `messages.exportChatInvite#a455de90` */
export interface ExportChatInvite {
  readonly _: 'messages.exportChatInvite'
  readonly legacy_revoke_permanent?: true
  readonly request_needed?: true
  readonly peer: root_i$.TypeInputPeer
  readonly expire_date?: number
  readonly usage_limit?: number
  readonly title?: string
  readonly subscription_pricing?: root_s$.TypeStarsSubscriptionPricing
}

/** `messages.exportedChatInvite#1871be50` */
export interface ExportedChatInvite {
  readonly _: 'messages.exportedChatInvite'
  readonly invite: root_e$.TypeExportedChatInvite
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.exportedChatInviteReplaced#222600ef` */
export interface ExportedChatInviteReplaced {
  readonly _: 'messages.exportedChatInviteReplaced'
  readonly invite: root_e$.TypeExportedChatInvite
  readonly new_invite: root_e$.TypeExportedChatInvite
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.exportedChatInvites#bdc62dcc` */
export interface ExportedChatInvites {
  readonly _: 'messages.exportedChatInvites'
  readonly count: number
  readonly invites: readonly root_e$.TypeExportedChatInvite[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.faveSticker#b9ffc55b` */
export interface FaveSticker {
  readonly _: 'messages.faveSticker'
  readonly id: root_i$.TypeInputDocument
  readonly unfave: boolean
}

/** `messages.favedStickers#2cb51097` */
export interface FavedStickers {
  readonly _: 'messages.favedStickers'
  readonly hash: bigint
  readonly packs: readonly root_s$.TypeStickerPack[]
  readonly stickers: readonly root_d$.TypeDocument[]
}

/** `messages.favedStickersNotModified#9e8fa6d3` */
export interface FavedStickersNotModified {
  readonly _: 'messages.favedStickersNotModified'
}

/** `messages.featuredStickers#be382906` */
export interface FeaturedStickers {
  readonly _: 'messages.featuredStickers'
  readonly premium?: true
  readonly hash: bigint
  readonly count: number
  readonly sets: readonly root_s$.TypeStickerSetCovered[]
  readonly unread: readonly bigint[]
}

/** `messages.featuredStickersNotModified#c6dc0c66` */
export interface FeaturedStickersNotModified {
  readonly _: 'messages.featuredStickersNotModified'
  readonly count: number
}

/** `messages.forumTopics#367617d3` */
export interface ForumTopics {
  readonly _: 'messages.forumTopics'
  readonly order_by_create_date?: true
  readonly count: number
  readonly topics: readonly root_f$.TypeForumTopic[]
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly pts: number
}

/** `messages.forwardMessages#13704a7c` */
export interface ForwardMessages {
  readonly _: 'messages.forwardMessages'
  readonly silent?: true
  readonly background?: true
  readonly with_my_score?: true
  readonly drop_author?: true
  readonly drop_media_captions?: true
  readonly noforwards?: true
  readonly allow_paid_floodskip?: true
  readonly from_ephemeral?: true
  readonly from_peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
  readonly random_id: readonly bigint[]
  readonly to_peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly schedule_date?: number
  readonly schedule_repeat_period?: number
  readonly send_as?: root_i$.TypeInputPeer
  readonly quick_reply_shortcut?: root_i$.TypeInputQuickReplyShortcut
  readonly effect?: bigint
  readonly video_timestamp?: number
  readonly allow_paid_stars?: bigint
  readonly suggested_post?: root_s$.TypeSuggestedPost
}

/** `messages.foundStickerSets#8af09dd2` */
export interface FoundStickerSets {
  readonly _: 'messages.foundStickerSets'
  readonly hash: bigint
  readonly sets: readonly root_s$.TypeStickerSetCovered[]
}

/** `messages.foundStickerSetsNotModified#0d54b65d` */
export interface FoundStickerSetsNotModified {
  readonly _: 'messages.foundStickerSetsNotModified'
}

/** `messages.foundStickers#82c9e290` */
export interface FoundStickers {
  readonly _: 'messages.foundStickers'
  readonly next_offset?: number
  readonly hash: bigint
  readonly stickers: readonly root_d$.TypeDocument[]
}

/** `messages.foundStickersNotModified#6010c534` */
export interface FoundStickersNotModified {
  readonly _: 'messages.foundStickersNotModified'
  readonly next_offset?: number
}

/** `messages.getAdminsWithInvites#3920e6ef` */
export interface GetAdminsWithInvites {
  readonly _: 'messages.getAdminsWithInvites'
  readonly peer: root_i$.TypeInputPeer
}

/** `messages.getAllDrafts#6a3f8d65` */
export interface GetAllDrafts {
  readonly _: 'messages.getAllDrafts'
}

/** `messages.getAllStickers#b8a0a1a8` */
export interface GetAllStickers {
  readonly _: 'messages.getAllStickers'
  readonly hash: bigint
}

/** `messages.getArchivedStickers#57f17692` */
export interface GetArchivedStickers {
  readonly _: 'messages.getArchivedStickers'
  readonly masks?: true
  readonly emojis?: true
  readonly offset_id: bigint
  readonly limit: number
}

/** `messages.getAttachMenuBot#77216192` */
export interface GetAttachMenuBot {
  readonly _: 'messages.getAttachMenuBot'
  readonly bot: root_i$.TypeInputUser
}

/** `messages.getAttachMenuBots#16fcc2cb` */
export interface GetAttachMenuBots {
  readonly _: 'messages.getAttachMenuBots'
  readonly hash: bigint
}

/** `messages.getAttachedStickers#cc5b67cc` */
export interface GetAttachedStickers {
  readonly _: 'messages.getAttachedStickers'
  readonly media: root_i$.TypeInputStickeredMedia
}

/** `messages.getAvailableEffects#dea20a39` */
export interface GetAvailableEffects {
  readonly _: 'messages.getAvailableEffects'
  readonly hash: number
}

/** `messages.getAvailableReactions#18dea0ac` */
export interface GetAvailableReactions {
  readonly _: 'messages.getAvailableReactions'
  readonly hash: number
}

/** `messages.getBotApp#34fdc5c3` */
export interface GetBotApp {
  readonly _: 'messages.getBotApp'
  readonly app: root_i$.TypeInputBotApp
  readonly hash: bigint
}

/** `messages.getBotCallbackAnswer#9342ca07` */
export interface GetBotCallbackAnswer {
  readonly _: 'messages.getBotCallbackAnswer'
  readonly game?: true
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly data?: Uint8Array
  readonly password?: root_i$.TypeInputCheckPasswordSRP
}

/** `messages.getChatInviteImporters#df04dd4e` */
export interface GetChatInviteImporters {
  readonly _: 'messages.getChatInviteImporters'
  readonly requested?: true
  readonly subscription_expired?: true
  readonly peer: root_i$.TypeInputPeer
  readonly link?: string
  readonly q?: string
  readonly offset_date: number
  readonly offset_user: root_i$.TypeInputUser
  readonly limit: number
}

/** `messages.getChats#49e9528f` */
export interface GetChats {
  readonly _: 'messages.getChats'
  readonly id: readonly bigint[]
}

/** `messages.getCommonChats#e40ca104` */
export interface GetCommonChats {
  readonly _: 'messages.getCommonChats'
  readonly user_id: root_i$.TypeInputUser
  readonly max_id: bigint
  readonly limit: number
}

/** `messages.getCustomEmojiDocuments#d9ab0f54` */
export interface GetCustomEmojiDocuments {
  readonly _: 'messages.getCustomEmojiDocuments'
  readonly document_id: readonly bigint[]
}

/** `messages.getDefaultHistoryTTL#658b7188` */
export interface GetDefaultHistoryTTL {
  readonly _: 'messages.getDefaultHistoryTTL'
}

/** `messages.getDefaultTagReactions#bdf93428` */
export interface GetDefaultTagReactions {
  readonly _: 'messages.getDefaultTagReactions'
  readonly hash: bigint
}

/** `messages.getDhConfig#26cf8950` */
export interface GetDhConfig {
  readonly _: 'messages.getDhConfig'
  readonly version: number
  readonly random_length: number
}

/** `messages.getDialogFilters#efd48c89` */
export interface GetDialogFilters {
  readonly _: 'messages.getDialogFilters'
}

/** `messages.getDialogUnreadMarks#21202222` */
export interface GetDialogUnreadMarks {
  readonly _: 'messages.getDialogUnreadMarks'
  readonly parent_peer?: root_i$.TypeInputPeer
}

/** `messages.getDialogs#a0f4cb4f` */
export interface GetDialogs {
  readonly _: 'messages.getDialogs'
  readonly exclude_pinned?: true
  readonly folder_id?: number
  readonly offset_date: number
  readonly offset_id: number
  readonly offset_peer: root_i$.TypeInputPeer
  readonly limit: number
  readonly hash: bigint
}

/** `messages.getDiscussionMessage#446972fd` */
export interface GetDiscussionMessage {
  readonly _: 'messages.getDiscussionMessage'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
}

/** `messages.getDocumentByHash#b1f2061f` */
export interface GetDocumentByHash {
  readonly _: 'messages.getDocumentByHash'
  readonly sha256: Uint8Array
  readonly size: bigint
  readonly mime_type: string
}

/** `messages.getEmojiGameInfo#fb7e8ca7` */
export interface GetEmojiGameInfo {
  readonly _: 'messages.getEmojiGameInfo'
}

/** `messages.getEmojiGroups#7488ce5b` */
export interface GetEmojiGroups {
  readonly _: 'messages.getEmojiGroups'
  readonly hash: number
}

/** `messages.getEmojiKeywords#35a0e062` */
export interface GetEmojiKeywords {
  readonly _: 'messages.getEmojiKeywords'
  readonly lang_code: string
}

/** `messages.getEmojiKeywordsDifference#1508b6af` */
export interface GetEmojiKeywordsDifference {
  readonly _: 'messages.getEmojiKeywordsDifference'
  readonly lang_code: string
  readonly from_version: number
}

/** `messages.getEmojiKeywordsLanguages#4e9963b2` */
export interface GetEmojiKeywordsLanguages {
  readonly _: 'messages.getEmojiKeywordsLanguages'
  readonly lang_codes: readonly string[]
}

/** `messages.getEmojiProfilePhotoGroups#21a548f3` */
export interface GetEmojiProfilePhotoGroups {
  readonly _: 'messages.getEmojiProfilePhotoGroups'
  readonly hash: number
}

/** `messages.getEmojiStatusGroups#2ecd56cd` */
export interface GetEmojiStatusGroups {
  readonly _: 'messages.getEmojiStatusGroups'
  readonly hash: number
}

/** `messages.getEmojiStickerGroups#1dd840f5` */
export interface GetEmojiStickerGroups {
  readonly _: 'messages.getEmojiStickerGroups'
  readonly hash: number
}

/** `messages.getEmojiStickers#fbfca18f` */
export interface GetEmojiStickers {
  readonly _: 'messages.getEmojiStickers'
  readonly hash: bigint
}

/** `messages.getEmojiURL#d5b10c26` */
export interface GetEmojiURL {
  readonly _: 'messages.getEmojiURL'
  readonly lang_code: string
}

/** `messages.getExportedChatInvite#73746f5c` */
export interface GetExportedChatInvite {
  readonly _: 'messages.getExportedChatInvite'
  readonly peer: root_i$.TypeInputPeer
  readonly link: string
}

/** `messages.getExportedChatInvites#a2b5a3f6` */
export interface GetExportedChatInvites {
  readonly _: 'messages.getExportedChatInvites'
  readonly revoked?: true
  readonly peer: root_i$.TypeInputPeer
  readonly admin_id: root_i$.TypeInputUser
  readonly offset_date?: number
  readonly offset_link?: string
  readonly limit: number
}

/** `messages.getExtendedMedia#84f80814` */
export interface GetExtendedMedia {
  readonly _: 'messages.getExtendedMedia'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `messages.getFactCheck#b9cdc5ee` */
export interface GetFactCheck {
  readonly _: 'messages.getFactCheck'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: readonly number[]
}

/** `messages.getFavedStickers#04f1aaa9` */
export interface GetFavedStickers {
  readonly _: 'messages.getFavedStickers'
  readonly hash: bigint
}

/** `messages.getFeaturedEmojiStickers#0ecf6736` */
export interface GetFeaturedEmojiStickers {
  readonly _: 'messages.getFeaturedEmojiStickers'
  readonly hash: bigint
}

/** `messages.getFeaturedStickers#64780b14` */
export interface GetFeaturedStickers {
  readonly _: 'messages.getFeaturedStickers'
  readonly hash: bigint
}

/** `messages.getForumTopics#3ba47bff` */
export interface GetForumTopics {
  readonly _: 'messages.getForumTopics'
  readonly peer: root_i$.TypeInputPeer
  readonly q?: string
  readonly offset_date: number
  readonly offset_id: number
  readonly offset_topic: number
  readonly limit: number
}

/** `messages.getForumTopicsByID#af0a4a08` */
export interface GetForumTopicsByID {
  readonly _: 'messages.getForumTopicsByID'
  readonly peer: root_i$.TypeInputPeer
  readonly topics: readonly number[]
}

/** `messages.getFullChat#aeb00b34` */
export interface GetFullChat {
  readonly _: 'messages.getFullChat'
  readonly chat_id: bigint
}

/** `messages.getFutureChatCreatorAfterLeave#3b7d0ea6` */
export interface GetFutureChatCreatorAfterLeave {
  readonly _: 'messages.getFutureChatCreatorAfterLeave'
  readonly peer: root_i$.TypeInputPeer
}

/** `messages.getGameHighScores#e822649d` */
export interface GetGameHighScores {
  readonly _: 'messages.getGameHighScores'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly user_id: root_i$.TypeInputUser
}

/** `messages.getHistory#4423e6c5` */
export interface GetHistory {
  readonly _: 'messages.getHistory'
  readonly peer: root_i$.TypeInputPeer
  readonly offset_id: number
  readonly offset_date: number
  readonly add_offset: number
  readonly limit: number
  readonly max_id: number
  readonly min_id: number
  readonly hash: bigint
}

/** `messages.getInlineBotResults#514e999d` */
export interface GetInlineBotResults {
  readonly _: 'messages.getInlineBotResults'
  readonly bot: root_i$.TypeInputUser
  readonly peer: root_i$.TypeInputPeer
  readonly geo_point?: root_i$.TypeInputGeoPoint
  readonly query: string
  readonly offset: string
}

/** `messages.getInlineGameHighScores#0f635e1b` */
export interface GetInlineGameHighScores {
  readonly _: 'messages.getInlineGameHighScores'
  readonly id: root_i$.TypeInputBotInlineMessageID
  readonly user_id: root_i$.TypeInputUser
}

/** `messages.getMaskStickers#640f82b8` */
export interface GetMaskStickers {
  readonly _: 'messages.getMaskStickers'
  readonly hash: bigint
}

/** `messages.getMessageEditData#fda68d36` */
export interface GetMessageEditData {
  readonly _: 'messages.getMessageEditData'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
}

/** `messages.getMessageReactionsList#461b3f48` */
export interface GetMessageReactionsList {
  readonly _: 'messages.getMessageReactionsList'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly reaction?: root_r$.TypeReaction
  readonly offset?: string
  readonly limit: number
}

/** `messages.getMessageReadParticipants#31c1c44f` */
export interface GetMessageReadParticipants {
  readonly _: 'messages.getMessageReadParticipants'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
}

/** `messages.getMessages#63c66506` */
export interface GetMessages {
  readonly _: 'messages.getMessages'
  readonly id: readonly root_i$.TypeInputMessage[]
}

/** `messages.getMessagesReactions#8bba90e6` */
export interface GetMessagesReactions {
  readonly _: 'messages.getMessagesReactions'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `messages.getMessagesViews#5784d3e1` */
export interface GetMessagesViews {
  readonly _: 'messages.getMessagesViews'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
  readonly increment: boolean
}

/** `messages.getMyStickers#d0b5e1fc` */
export interface GetMyStickers {
  readonly _: 'messages.getMyStickers'
  readonly offset_id: bigint
  readonly limit: number
}

/** `messages.getOldFeaturedStickers#7ed094a1` */
export interface GetOldFeaturedStickers {
  readonly _: 'messages.getOldFeaturedStickers'
  readonly offset: number
  readonly limit: number
  readonly hash: bigint
}

/** `messages.getOnlines#6e2be050` */
export interface GetOnlines {
  readonly _: 'messages.getOnlines'
  readonly peer: root_i$.TypeInputPeer
}

/** `messages.getOutboxReadDate#8c4bfe5d` */
export interface GetOutboxReadDate {
  readonly _: 'messages.getOutboxReadDate'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
}

/** `messages.getPaidReactionPrivacy#472455aa` */
export interface GetPaidReactionPrivacy {
  readonly _: 'messages.getPaidReactionPrivacy'
}

/** `messages.getPeerDialogs#e470bcfd` */
export interface GetPeerDialogs {
  readonly _: 'messages.getPeerDialogs'
  readonly peers: readonly root_i$.TypeInputDialogPeer[]
}

/** `messages.getPeerSettings#efd9a6a2` */
export interface GetPeerSettings {
  readonly _: 'messages.getPeerSettings'
  readonly peer: root_i$.TypeInputPeer
}

/** `messages.getPersonalChannelHistory#55fb0996` */
export interface GetPersonalChannelHistory {
  readonly _: 'messages.getPersonalChannelHistory'
  readonly user_id: root_i$.TypeInputUser
  readonly limit: number
  readonly max_id: number
  readonly min_id: number
  readonly hash: bigint
}

/** `messages.getPinnedDialogs#d6b94df2` */
export interface GetPinnedDialogs {
  readonly _: 'messages.getPinnedDialogs'
  readonly folder_id: number
}

/** `messages.getPinnedSavedDialogs#d63d94e0` */
export interface GetPinnedSavedDialogs {
  readonly _: 'messages.getPinnedSavedDialogs'
}

/** `messages.getPollResults#eda3e33b` */
export interface GetPollResults {
  readonly _: 'messages.getPollResults'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly poll_hash: bigint
}

/** `messages.getPollVotes#b86e380e` */
export interface GetPollVotes {
  readonly _: 'messages.getPollVotes'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly option?: Uint8Array
  readonly offset?: string
  readonly limit: number
}

/** `messages.getPreparedInlineMessage#857ebdb8` */
export interface GetPreparedInlineMessage {
  readonly _: 'messages.getPreparedInlineMessage'
  readonly bot: root_i$.TypeInputUser
  readonly id: string
}

/** `messages.getQuickReplies#d483f2a8` */
export interface GetQuickReplies {
  readonly _: 'messages.getQuickReplies'
  readonly hash: bigint
}

/** `messages.getQuickReplyMessages#94a495c3` */
export interface GetQuickReplyMessages {
  readonly _: 'messages.getQuickReplyMessages'
  readonly shortcut_id: number
  readonly id?: readonly number[]
  readonly hash: bigint
}

/** `messages.getRecentLocations#702a40e0` */
export interface GetRecentLocations {
  readonly _: 'messages.getRecentLocations'
  readonly peer: root_i$.TypeInputPeer
  readonly limit: number
  readonly hash: bigint
}

/** `messages.getRecentReactions#39461db2` */
export interface GetRecentReactions {
  readonly _: 'messages.getRecentReactions'
  readonly limit: number
  readonly hash: bigint
}

/** `messages.getRecentStickers#9da9403b` */
export interface GetRecentStickers {
  readonly _: 'messages.getRecentStickers'
  readonly attached?: true
  readonly hash: bigint
}

/** `messages.getReplies#22ddd30c` */
export interface GetReplies {
  readonly _: 'messages.getReplies'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly offset_id: number
  readonly offset_date: number
  readonly add_offset: number
  readonly limit: number
  readonly max_id: number
  readonly min_id: number
  readonly hash: bigint
}

/** `messages.getRichMessage#501569cf` */
export interface GetRichMessage {
  readonly _: 'messages.getRichMessage'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
}

/** `messages.getSavedDialogs#1e91fc99` */
export interface GetSavedDialogs {
  readonly _: 'messages.getSavedDialogs'
  readonly exclude_pinned?: true
  readonly parent_peer?: root_i$.TypeInputPeer
  readonly offset_date: number
  readonly offset_id: number
  readonly offset_peer: root_i$.TypeInputPeer
  readonly limit: number
  readonly hash: bigint
}

/** `messages.getSavedDialogsByID#6f6f9c96` */
export interface GetSavedDialogsByID {
  readonly _: 'messages.getSavedDialogsByID'
  readonly parent_peer?: root_i$.TypeInputPeer
  readonly ids: readonly root_i$.TypeInputPeer[]
}

/** `messages.getSavedGifs#5cf09635` */
export interface GetSavedGifs {
  readonly _: 'messages.getSavedGifs'
  readonly hash: bigint
}

/** `messages.getSavedHistory#998ab009` */
export interface GetSavedHistory {
  readonly _: 'messages.getSavedHistory'
  readonly parent_peer?: root_i$.TypeInputPeer
  readonly peer: root_i$.TypeInputPeer
  readonly offset_id: number
  readonly offset_date: number
  readonly add_offset: number
  readonly limit: number
  readonly max_id: number
  readonly min_id: number
  readonly hash: bigint
}

/** `messages.getSavedReactionTags#3637e05b` */
export interface GetSavedReactionTags {
  readonly _: 'messages.getSavedReactionTags'
  readonly peer?: root_i$.TypeInputPeer
  readonly hash: bigint
}

/** `messages.getScheduledHistory#f516760b` */
export interface GetScheduledHistory {
  readonly _: 'messages.getScheduledHistory'
  readonly peer: root_i$.TypeInputPeer
  readonly hash: bigint
}

/** `messages.getScheduledMessages#bdbb0464` */
export interface GetScheduledMessages {
  readonly _: 'messages.getScheduledMessages'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `messages.getSearchCounters#1bbcf300` */
export interface GetSearchCounters {
  readonly _: 'messages.getSearchCounters'
  readonly peer: root_i$.TypeInputPeer
  readonly saved_peer_id?: root_i$.TypeInputPeer
  readonly top_msg_id?: number
  readonly filters: readonly root_m$.TypeMessagesFilter[]
}

/** `messages.getSearchResultsCalendar#6aa3f6bd` */
export interface GetSearchResultsCalendar {
  readonly _: 'messages.getSearchResultsCalendar'
  readonly peer: root_i$.TypeInputPeer
  readonly saved_peer_id?: root_i$.TypeInputPeer
  readonly filter: root_m$.TypeMessagesFilter
  readonly offset_id: number
  readonly offset_date: number
}

/** `messages.getSearchResultsPositions#9c7f2f10` */
export interface GetSearchResultsPositions {
  readonly _: 'messages.getSearchResultsPositions'
  readonly peer: root_i$.TypeInputPeer
  readonly saved_peer_id?: root_i$.TypeInputPeer
  readonly filter: root_m$.TypeMessagesFilter
  readonly offset_id: number
  readonly limit: number
}

/** `messages.getSplitRanges#1cff7e08` */
export interface GetSplitRanges {
  readonly _: 'messages.getSplitRanges'
}

/** `messages.getSponsoredMessages#3d6ce850` */
export interface GetSponsoredMessages {
  readonly _: 'messages.getSponsoredMessages'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id?: number
}

/** `messages.getStickerSet#c8a0ec74` */
export interface GetStickerSet {
  readonly _: 'messages.getStickerSet'
  readonly stickerset: root_i$.TypeInputStickerSet
  readonly hash: number
}

/** `messages.getStickers#d5a5d3a1` */
export interface GetStickers {
  readonly _: 'messages.getStickers'
  readonly emoticon: string
  readonly hash: bigint
}

/** `messages.getSuggestedDialogFilters#a29cd42c` */
export interface GetSuggestedDialogFilters {
  readonly _: 'messages.getSuggestedDialogFilters'
}

/** `messages.getTopReactions#bb8125ba` */
export interface GetTopReactions {
  readonly _: 'messages.getTopReactions'
  readonly limit: number
  readonly hash: bigint
}

/** `messages.getUnreadMentions#f107e790` */
export interface GetUnreadMentions {
  readonly _: 'messages.getUnreadMentions'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
  readonly offset_id: number
  readonly add_offset: number
  readonly limit: number
  readonly max_id: number
  readonly min_id: number
}

/** `messages.getUnreadPollVotes#43286cf2` */
export interface GetUnreadPollVotes {
  readonly _: 'messages.getUnreadPollVotes'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
  readonly offset_id: number
  readonly add_offset: number
  readonly limit: number
  readonly max_id: number
  readonly min_id: number
}

/** `messages.getUnreadReactions#bd7f90ac` */
export interface GetUnreadReactions {
  readonly _: 'messages.getUnreadReactions'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
  readonly saved_peer_id?: root_i$.TypeInputPeer
  readonly offset_id: number
  readonly add_offset: number
  readonly limit: number
  readonly max_id: number
  readonly min_id: number
}

/** `messages.getWebPage#8d9692a3` */
export interface GetWebPage {
  readonly _: 'messages.getWebPage'
  readonly url: string
  readonly hash: number
}

/** `messages.getWebPagePreview#570d6f6f` */
export interface GetWebPagePreview {
  readonly _: 'messages.getWebPagePreview'
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
}

/** `messages.hideAllChatJoinRequests#e085f4ea` */
export interface HideAllChatJoinRequests {
  readonly _: 'messages.hideAllChatJoinRequests'
  readonly approved?: true
  readonly peer: root_i$.TypeInputPeer
  readonly link?: string
}

/** `messages.hideChatJoinRequest#7fe7e815` */
export interface HideChatJoinRequest {
  readonly _: 'messages.hideChatJoinRequest'
  readonly approved?: true
  readonly peer: root_i$.TypeInputPeer
  readonly user_id: root_i$.TypeInputUser
}

/** `messages.hidePeerSettingsBar#4facb138` */
export interface HidePeerSettingsBar {
  readonly _: 'messages.hidePeerSettingsBar'
  readonly peer: root_i$.TypeInputPeer
}

/** `messages.highScores#9a3bfd99` */
export interface HighScores {
  readonly _: 'messages.highScores'
  readonly scores: readonly root_h$.TypeHighScore[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.historyImport#1662af0b` */
export interface HistoryImport {
  readonly _: 'messages.historyImport'
  readonly id: bigint
}

/** `messages.historyImportParsed#5e0fb7b9` */
export interface HistoryImportParsed {
  readonly _: 'messages.historyImportParsed'
  readonly pm?: true
  readonly group?: true
  readonly title?: string
}

/** `messages.importChatInvite#de91436e` */
export interface ImportChatInvite {
  readonly _: 'messages.importChatInvite'
  readonly hash: string
}

/** `messages.inactiveChats#a927fec5` */
export interface InactiveChats {
  readonly _: 'messages.inactiveChats'
  readonly dates: readonly number[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.initHistoryImport#34090c3b` */
export interface InitHistoryImport {
  readonly _: 'messages.initHistoryImport'
  readonly peer: root_i$.TypeInputPeer
  readonly file: root_i$.TypeInputFile
  readonly media_count: number
}

/** `messages.installStickerSet#c78fe460` */
export interface InstallStickerSet {
  readonly _: 'messages.installStickerSet'
  readonly stickerset: root_i$.TypeInputStickerSet
  readonly archived: boolean
}

/** `messages.invitedUsers#7f5defa6` */
export interface InvitedUsers {
  readonly _: 'messages.invitedUsers'
  readonly updates: root_u$.TypeUpdates
  readonly missing_invitees: readonly root_m$.TypeMissingInvitee[]
}

/** `messages.markDialogUnread#8c5006f8` */
export interface MarkDialogUnread {
  readonly _: 'messages.markDialogUnread'
  readonly unread?: true
  readonly parent_peer?: root_i$.TypeInputPeer
  readonly peer: root_i$.TypeInputDialogPeer
}

/** `messages.messageEditData#26b5dde6` */
export interface MessageEditData {
  readonly _: 'messages.messageEditData'
  readonly caption?: true
}

/** `messages.messageReactionsList#31bd492d` */
export interface MessageReactionsList {
  readonly _: 'messages.messageReactionsList'
  readonly count: number
  readonly reactions: readonly root_m$.TypeMessagePeerReaction[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly next_offset?: string
}

/** `messages.messageViews#b6c4f543` */
export interface MessageViews {
  readonly _: 'messages.messageViews'
  readonly views: readonly root_m$.TypeMessageViews[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.messages#1d73e7ea` */
export interface Messages {
  readonly _: 'messages.messages'
  readonly messages: readonly root_m$.TypeMessage[]
  readonly topics: readonly root_f$.TypeForumTopic[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.messagesNotModified#74535f21` */
export interface MessagesNotModified {
  readonly _: 'messages.messagesNotModified'
  readonly count: number
}

/** `messages.messagesSlice#5f206716` */
export interface MessagesSlice {
  readonly _: 'messages.messagesSlice'
  readonly inexact?: true
  readonly count: number
  readonly next_rate?: number
  readonly offset_id_offset?: number
  readonly search_flood?: root_s$.TypeSearchPostsFlood
  readonly messages: readonly root_m$.TypeMessage[]
  readonly topics: readonly root_f$.TypeForumTopic[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.migrateChat#a2875319` */
export interface MigrateChat {
  readonly _: 'messages.migrateChat'
  readonly chat_id: bigint
}

/** `messages.myStickers#faff629d` */
export interface MyStickers {
  readonly _: 'messages.myStickers'
  readonly count: number
  readonly sets: readonly root_s$.TypeStickerSetCovered[]
}

/** `messages.peerDialogs#3371c354` */
export interface PeerDialogs {
  readonly _: 'messages.peerDialogs'
  readonly dialogs: readonly root_d$.TypeDialog[]
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly state: updates$.TypeState
}

/** `messages.peerSettings#6880b94d` */
export interface PeerSettings {
  readonly _: 'messages.peerSettings'
  readonly settings: root_p$.TypePeerSettings
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.preparedInlineMessage#ff57708d` */
export interface PreparedInlineMessage {
  readonly _: 'messages.preparedInlineMessage'
  readonly query_id: bigint
  readonly result: root_b$.TypeBotInlineResult
  readonly peer_types: readonly root_i$.TypeInlineQueryPeerType[]
  readonly cache_time: number
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.prolongWebView#b0d81a83` */
export interface ProlongWebView {
  readonly _: 'messages.prolongWebView'
  readonly silent?: true
  readonly peer: root_i$.TypeInputPeer
  readonly bot: root_i$.TypeInputUser
  readonly query_id: bigint
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly send_as?: root_i$.TypeInputPeer
}

/** `messages.quickReplies#c68d6695` */
export interface QuickReplies {
  readonly _: 'messages.quickReplies'
  readonly quick_replies: readonly root_q$.TypeQuickReply[]
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.quickRepliesNotModified#5f91eb5b` */
export interface QuickRepliesNotModified {
  readonly _: 'messages.quickRepliesNotModified'
}

/** `messages.rateTranscribedAudio#7f1d072f` */
export interface RateTranscribedAudio {
  readonly _: 'messages.rateTranscribedAudio'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly transcription_id: bigint
  readonly good: boolean
}

/** `messages.reactions#eafdf716` */
export interface Reactions {
  readonly _: 'messages.reactions'
  readonly hash: bigint
  readonly reactions: readonly root_r$.TypeReaction[]
}

/** `messages.reactionsNotModified#b06fdbdf` */
export interface ReactionsNotModified {
  readonly _: 'messages.reactionsNotModified'
}

/** `messages.readDiscussion#f731a9f4` */
export interface ReadDiscussion {
  readonly _: 'messages.readDiscussion'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly read_max_id: number
}

/** `messages.readEncryptedHistory#7f4b690a` */
export interface ReadEncryptedHistory {
  readonly _: 'messages.readEncryptedHistory'
  readonly peer: root_i$.TypeInputEncryptedChat
  readonly max_date: number
}

/** `messages.readFeaturedStickers#5b118126` */
export interface ReadFeaturedStickers {
  readonly _: 'messages.readFeaturedStickers'
  readonly id: readonly bigint[]
}

/** `messages.readHistory#0e306d3a` */
export interface ReadHistory {
  readonly _: 'messages.readHistory'
  readonly peer: root_i$.TypeInputPeer
  readonly max_id: number
}

/** `messages.readMentions#36e5bf4d` */
export interface ReadMentions {
  readonly _: 'messages.readMentions'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
}

/** `messages.readMessageContents#36a73f77` */
export interface ReadMessageContents {
  readonly _: 'messages.readMessageContents'
  readonly id: readonly number[]
}

/** `messages.readPollVotes#1720b4d8` */
export interface ReadPollVotes {
  readonly _: 'messages.readPollVotes'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
}

/** `messages.readReactions#9ec44f93` */
export interface ReadReactions {
  readonly _: 'messages.readReactions'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
  readonly saved_peer_id?: root_i$.TypeInputPeer
}

/** `messages.readSavedHistory#ba4a3b5b` */
export interface ReadSavedHistory {
  readonly _: 'messages.readSavedHistory'
  readonly parent_peer: root_i$.TypeInputPeer
  readonly peer: root_i$.TypeInputPeer
  readonly max_id: number
}

/** `messages.receivedMessages#05a954c0` */
export interface ReceivedMessages {
  readonly _: 'messages.receivedMessages'
  readonly max_id: number
}

/** `messages.receivedQueue#55a5bb66` */
export interface ReceivedQueue {
  readonly _: 'messages.receivedQueue'
  readonly max_qts: number
}

/** `messages.recentStickers#88d37c56` */
export interface RecentStickers {
  readonly _: 'messages.recentStickers'
  readonly hash: bigint
  readonly packs: readonly root_s$.TypeStickerPack[]
  readonly stickers: readonly root_d$.TypeDocument[]
  readonly dates: readonly number[]
}

/** `messages.recentStickersNotModified#0b17f890` */
export interface RecentStickersNotModified {
  readonly _: 'messages.recentStickersNotModified'
}

/** `messages.reorderPinnedDialogs#3b1adf37` */
export interface ReorderPinnedDialogs {
  readonly _: 'messages.reorderPinnedDialogs'
  readonly force?: true
  readonly folder_id: number
  readonly order: readonly root_i$.TypeInputDialogPeer[]
}

/** `messages.reorderPinnedForumTopics#0e7841f0` */
export interface ReorderPinnedForumTopics {
  readonly _: 'messages.reorderPinnedForumTopics'
  readonly force?: true
  readonly peer: root_i$.TypeInputPeer
  readonly order: readonly number[]
}

/** `messages.reorderPinnedSavedDialogs#8b716587` */
export interface ReorderPinnedSavedDialogs {
  readonly _: 'messages.reorderPinnedSavedDialogs'
  readonly force?: true
  readonly order: readonly root_i$.TypeInputDialogPeer[]
}

/** `messages.reorderQuickReplies#60331907` */
export interface ReorderQuickReplies {
  readonly _: 'messages.reorderQuickReplies'
  readonly order: readonly number[]
}

/** `messages.reorderStickerSets#78337739` */
export interface ReorderStickerSets {
  readonly _: 'messages.reorderStickerSets'
  readonly masks?: true
  readonly emojis?: true
  readonly order: readonly bigint[]
}

/** `messages.report#fc78af9b` */
export interface Report {
  readonly _: 'messages.report'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
  readonly option: Uint8Array
  readonly message: string
}

/** `messages.reportEncryptedSpam#4b0c8c0f` */
export interface ReportEncryptedSpam {
  readonly _: 'messages.reportEncryptedSpam'
  readonly peer: root_i$.TypeInputEncryptedChat
}

/** `messages.reportMessagesDelivery#5a6d7395` */
export interface ReportMessagesDelivery {
  readonly _: 'messages.reportMessagesDelivery'
  readonly push?: true
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `messages.reportMusicListen#ddbcd819` */
export interface ReportMusicListen {
  readonly _: 'messages.reportMusicListen'
  readonly id: root_i$.TypeInputDocument
  readonly listened_duration: number
}

/** `messages.reportReaction#3f64c076` */
export interface ReportReaction {
  readonly _: 'messages.reportReaction'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly reaction_peer: root_i$.TypeInputPeer
}

/** `messages.reportReadMetrics#4067c5e6` */
export interface ReportReadMetrics {
  readonly _: 'messages.reportReadMetrics'
  readonly peer: root_i$.TypeInputPeer
  readonly metrics: readonly root_i$.TypeInputMessageReadMetric[]
}

/** `messages.reportSpam#cf1592db` */
export interface ReportSpam {
  readonly _: 'messages.reportSpam'
  readonly peer: root_i$.TypeInputPeer
}

/** `messages.reportSponsoredMessage#12cbf0c4` */
export interface ReportSponsoredMessage {
  readonly _: 'messages.reportSponsoredMessage'
  readonly random_id: Uint8Array
  readonly option: Uint8Array
}

/** `messages.requestAppWebView#53618bce` */
export interface RequestAppWebView {
  readonly _: 'messages.requestAppWebView'
  readonly write_allowed?: true
  readonly compact?: true
  readonly fullscreen?: true
  readonly peer: root_i$.TypeInputPeer
  readonly app: root_i$.TypeInputBotApp
  readonly start_param?: string
  readonly theme_params?: root_d$.TypeDataJSON
  readonly platform: string
}

/** `messages.requestChatJoinWebView#ba9ee679` */
export interface RequestChatJoinWebView {
  readonly _: 'messages.requestChatJoinWebView'
  readonly query_id: bigint
  readonly theme_params?: root_d$.TypeDataJSON
  readonly platform: string
}

/** `messages.requestEncryption#f64daf43` */
export interface RequestEncryption {
  readonly _: 'messages.requestEncryption'
  readonly user_id: root_i$.TypeInputUser
  readonly random_id: number
  readonly g_a: Uint8Array
}

/** `messages.requestMainWebView#c9e01e7b` */
export interface RequestMainWebView {
  readonly _: 'messages.requestMainWebView'
  readonly compact?: true
  readonly fullscreen?: true
  readonly peer: root_i$.TypeInputPeer
  readonly bot: root_i$.TypeInputUser
  readonly start_param?: string
  readonly theme_params?: root_d$.TypeDataJSON
  readonly platform: string
}

/** `messages.requestSimpleWebView#413a3e73` */
export interface RequestSimpleWebView {
  readonly _: 'messages.requestSimpleWebView'
  readonly from_switch_webview?: true
  readonly from_side_menu?: true
  readonly compact?: true
  readonly fullscreen?: true
  readonly bot: root_i$.TypeInputUser
  readonly url?: string
  readonly start_param?: string
  readonly theme_params?: root_d$.TypeDataJSON
  readonly platform: string
}

/** `messages.requestUrlAuth#894cc99c` */
export interface RequestUrlAuth {
  readonly _: 'messages.requestUrlAuth'
  readonly peer?: root_i$.TypeInputPeer
  readonly msg_id?: number
  readonly button_id?: number
  readonly url?: string
  readonly in_app_origin?: string
}

/** `messages.requestWebView#269dc2c1` */
export interface RequestWebView {
  readonly _: 'messages.requestWebView'
  readonly from_bot_menu?: true
  readonly silent?: true
  readonly compact?: true
  readonly fullscreen?: true
  readonly peer: root_i$.TypeInputPeer
  readonly bot: root_i$.TypeInputUser
  readonly url?: string
  readonly start_param?: string
  readonly theme_params?: root_d$.TypeDataJSON
  readonly platform: string
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly send_as?: root_i$.TypeInputPeer
}

/** `messages.saveDefaultSendAs#ccfddf96` */
export interface SaveDefaultSendAs {
  readonly _: 'messages.saveDefaultSendAs'
  readonly peer: root_i$.TypeInputPeer
  readonly send_as: root_i$.TypeInputPeer
}

/** `messages.saveDraft#ad0fa15c` */
export interface SaveDraft {
  readonly _: 'messages.saveDraft'
  readonly no_webpage?: true
  readonly invert_media?: true
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly peer: root_i$.TypeInputPeer
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly media?: root_i$.TypeInputMedia
  readonly effect?: bigint
  readonly suggested_post?: root_s$.TypeSuggestedPost
  readonly rich_message?: root_i$.TypeInputRichMessage
}

/** `messages.saveGif#327a30cb` */
export interface SaveGif {
  readonly _: 'messages.saveGif'
  readonly id: root_i$.TypeInputDocument
  readonly unsave: boolean
}

/** `messages.savePreparedInlineMessage#f21f7f2f` */
export interface SavePreparedInlineMessage {
  readonly _: 'messages.savePreparedInlineMessage'
  readonly result: root_i$.TypeInputBotInlineResult
  readonly user_id: root_i$.TypeInputUser
  readonly peer_types?: readonly root_i$.TypeInlineQueryPeerType[]
}

/** `messages.saveRecentSticker#392718f8` */
export interface SaveRecentSticker {
  readonly _: 'messages.saveRecentSticker'
  readonly attached?: true
  readonly id: root_i$.TypeInputDocument
  readonly unsave: boolean
}

/** `messages.savedDialogs#f83ae221` */
export interface SavedDialogs {
  readonly _: 'messages.savedDialogs'
  readonly dialogs: readonly root_s$.TypeSavedDialog[]
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.savedDialogsNotModified#c01f6fe8` */
export interface SavedDialogsNotModified {
  readonly _: 'messages.savedDialogsNotModified'
  readonly count: number
}

/** `messages.savedDialogsSlice#44ba9dd9` */
export interface SavedDialogsSlice {
  readonly _: 'messages.savedDialogsSlice'
  readonly count: number
  readonly dialogs: readonly root_s$.TypeSavedDialog[]
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.savedGifs#84a02a0d` */
export interface SavedGifs {
  readonly _: 'messages.savedGifs'
  readonly hash: bigint
  readonly gifs: readonly root_d$.TypeDocument[]
}

/** `messages.savedGifsNotModified#e8025ca2` */
export interface SavedGifsNotModified {
  readonly _: 'messages.savedGifsNotModified'
}

/** `messages.savedReactionTags#3259950a` */
export interface SavedReactionTags {
  readonly _: 'messages.savedReactionTags'
  readonly tags: readonly root_s$.TypeSavedReactionTag[]
  readonly hash: bigint
}

/** `messages.savedReactionTagsNotModified#889b59ef` */
export interface SavedReactionTagsNotModified {
  readonly _: 'messages.savedReactionTagsNotModified'
}

/** `messages.search#29ee847a` */
export interface Search {
  readonly _: 'messages.search'
  readonly peer: root_i$.TypeInputPeer
  readonly q: string
  readonly from_id?: root_i$.TypeInputPeer
  readonly saved_peer_id?: root_i$.TypeInputPeer
  readonly saved_reaction?: readonly root_r$.TypeReaction[]
  readonly top_msg_id?: number
  readonly filter: root_m$.TypeMessagesFilter
  readonly min_date: number
  readonly max_date: number
  readonly offset_id: number
  readonly add_offset: number
  readonly limit: number
  readonly max_id: number
  readonly min_id: number
  readonly hash: bigint
}

/** `messages.searchCounter#e844ebff` */
export interface SearchCounter {
  readonly _: 'messages.searchCounter'
  readonly inexact?: true
  readonly filter: root_m$.TypeMessagesFilter
  readonly count: number
}

/** `messages.searchCustomEmoji#2c11c0d7` */
export interface SearchCustomEmoji {
  readonly _: 'messages.searchCustomEmoji'
  readonly emoticon: string
  readonly hash: bigint
}

/** `messages.searchEmojiStickerSets#92b4494c` */
export interface SearchEmojiStickerSets {
  readonly _: 'messages.searchEmojiStickerSets'
  readonly exclude_featured?: true
  readonly q: string
  readonly hash: bigint
}

/** `messages.searchGlobal#6126a43c` */
export interface SearchGlobal {
  readonly _: 'messages.searchGlobal'
  readonly broadcasts_only?: true
  readonly groups_only?: true
  readonly users_only?: true
  readonly folder_id?: number
  readonly community?: root_i$.TypeInputChannel
  readonly q: string
  readonly filter: root_m$.TypeMessagesFilter
  readonly min_date: number
  readonly max_date: number
  readonly offset_rate: number
  readonly offset_peer: root_i$.TypeInputPeer
  readonly offset_id: number
  readonly limit: number
}

/** `messages.searchResultsCalendar#147ee23c` */
export interface SearchResultsCalendar {
  readonly _: 'messages.searchResultsCalendar'
  readonly inexact?: true
  readonly count: number
  readonly min_date: number
  readonly min_msg_id: number
  readonly offset_id_offset?: number
  readonly periods: readonly root_s$.TypeSearchResultsCalendarPeriod[]
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.searchResultsPositions#53b22baf` */
export interface SearchResultsPositions {
  readonly _: 'messages.searchResultsPositions'
  readonly count: number
  readonly positions: readonly root_s$.TypeSearchResultsPosition[]
}

/** `messages.searchSentMedia#107e31a0` */
export interface SearchSentMedia {
  readonly _: 'messages.searchSentMedia'
  readonly q: string
  readonly filter: root_m$.TypeMessagesFilter
  readonly limit: number
}

/** `messages.searchStickerSets#35705b8a` */
export interface SearchStickerSets {
  readonly _: 'messages.searchStickerSets'
  readonly exclude_featured?: true
  readonly q: string
  readonly hash: bigint
}

/** `messages.searchStickers#29b1c66a` */
export interface SearchStickers {
  readonly _: 'messages.searchStickers'
  readonly emojis?: true
  readonly q: string
  readonly emoticon: string
  readonly lang_code: readonly string[]
  readonly offset: number
  readonly limit: number
  readonly hash: bigint
}

/** `messages.sendBotRequestedPeer#6c5cf2a7` */
export interface SendBotRequestedPeer {
  readonly _: 'messages.sendBotRequestedPeer'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id?: number
  readonly webapp_req_id?: string
  readonly button_id: number
  readonly requested_peers: readonly root_i$.TypeInputPeer[]
}

/** `messages.sendEncrypted#44fa7a15` */
export interface SendEncrypted {
  readonly _: 'messages.sendEncrypted'
  readonly silent?: true
  readonly peer: root_i$.TypeInputEncryptedChat
  readonly random_id: bigint
  readonly data: Uint8Array
}

/** `messages.sendEncryptedFile#5559481d` */
export interface SendEncryptedFile {
  readonly _: 'messages.sendEncryptedFile'
  readonly silent?: true
  readonly peer: root_i$.TypeInputEncryptedChat
  readonly random_id: bigint
  readonly data: Uint8Array
  readonly file: root_i$.TypeInputEncryptedFile
}

/** `messages.sendEncryptedService#32d439a4` */
export interface SendEncryptedService {
  readonly _: 'messages.sendEncryptedService'
  readonly peer: root_i$.TypeInputEncryptedChat
  readonly random_id: bigint
  readonly data: Uint8Array
}

/** `messages.sendInlineBotResult#c0cf7646` */
export interface SendInlineBotResult {
  readonly _: 'messages.sendInlineBotResult'
  readonly silent?: true
  readonly background?: true
  readonly clear_draft?: true
  readonly hide_via?: true
  readonly peer: root_i$.TypeInputPeer
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly random_id: bigint
  readonly query_id: bigint
  readonly id: string
  readonly schedule_date?: number
  readonly send_as?: root_i$.TypeInputPeer
  readonly quick_reply_shortcut?: root_i$.TypeInputQuickReplyShortcut
  readonly allow_paid_stars?: bigint
}

/** `messages.sendMedia#0330e77f` */
export interface SendMedia {
  readonly _: 'messages.sendMedia'
  readonly silent?: true
  readonly background?: true
  readonly clear_draft?: true
  readonly noforwards?: true
  readonly update_stickersets_order?: true
  readonly invert_media?: true
  readonly allow_paid_floodskip?: true
  readonly peer: root_i$.TypeInputPeer
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly media: root_i$.TypeInputMedia
  readonly message: string
  readonly random_id: bigint
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly schedule_date?: number
  readonly schedule_repeat_period?: number
  readonly send_as?: root_i$.TypeInputPeer
  readonly quick_reply_shortcut?: root_i$.TypeInputQuickReplyShortcut
  readonly effect?: bigint
  readonly allow_paid_stars?: bigint
  readonly suggested_post?: root_s$.TypeSuggestedPost
}

/** `messages.sendMessage#fef48f62` */
export interface SendMessage {
  readonly _: 'messages.sendMessage'
  readonly no_webpage?: true
  readonly silent?: true
  readonly background?: true
  readonly clear_draft?: true
  readonly noforwards?: true
  readonly update_stickersets_order?: true
  readonly invert_media?: true
  readonly allow_paid_floodskip?: true
  readonly peer: root_i$.TypeInputPeer
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly message: string
  readonly random_id: bigint
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly schedule_date?: number
  readonly schedule_repeat_period?: number
  readonly send_as?: root_i$.TypeInputPeer
  readonly quick_reply_shortcut?: root_i$.TypeInputQuickReplyShortcut
  readonly effect?: bigint
  readonly allow_paid_stars?: bigint
  readonly suggested_post?: root_s$.TypeSuggestedPost
  readonly rich_message?: root_i$.TypeInputRichMessage
}

/** `messages.sendMultiMedia#1bf89d74` */
export interface SendMultiMedia {
  readonly _: 'messages.sendMultiMedia'
  readonly silent?: true
  readonly background?: true
  readonly clear_draft?: true
  readonly noforwards?: true
  readonly update_stickersets_order?: true
  readonly invert_media?: true
  readonly allow_paid_floodskip?: true
  readonly peer: root_i$.TypeInputPeer
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly multi_media: readonly root_i$.TypeInputSingleMedia[]
  readonly schedule_date?: number
  readonly send_as?: root_i$.TypeInputPeer
  readonly quick_reply_shortcut?: root_i$.TypeInputQuickReplyShortcut
  readonly effect?: bigint
  readonly allow_paid_stars?: bigint
}

/** `messages.sendPaidReaction#58bbcb50` */
export interface SendPaidReaction {
  readonly _: 'messages.sendPaidReaction'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly count: number
  readonly random_id: bigint
  readonly private?: root_p$.TypePaidReactionPrivacy
}

/** `messages.sendQuickReplyMessages#6c750de1` */
export interface SendQuickReplyMessages {
  readonly _: 'messages.sendQuickReplyMessages'
  readonly peer: root_i$.TypeInputPeer
  readonly shortcut_id: number
  readonly id: readonly number[]
  readonly random_id: readonly bigint[]
}

/** `messages.sendReaction#d30d78d4` */
export interface SendReaction {
  readonly _: 'messages.sendReaction'
  readonly big?: true
  readonly add_to_recent?: true
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly reaction?: readonly root_r$.TypeReaction[]
}

/** `messages.sendScheduledMessages#bd38850a` */
export interface SendScheduledMessages {
  readonly _: 'messages.sendScheduledMessages'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `messages.sendScreenshotNotification#a1405817` */
export interface SendScreenshotNotification {
  readonly _: 'messages.sendScreenshotNotification'
  readonly peer: root_i$.TypeInputPeer
  readonly reply_to: root_i$.TypeInputReplyTo
  readonly random_id: bigint
}

/** `messages.sendVote#10ea6184` */
export interface SendVote {
  readonly _: 'messages.sendVote'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly options: readonly Uint8Array[]
}

/** `messages.sendWebViewData#dc0242c8` */
export interface SendWebViewData {
  readonly _: 'messages.sendWebViewData'
  readonly bot: root_i$.TypeInputUser
  readonly random_id: bigint
  readonly button_text: string
  readonly data: string
}

/** `messages.sendWebViewResultMessage#0a4314f5` */
export interface SendWebViewResultMessage {
  readonly _: 'messages.sendWebViewResultMessage'
  readonly bot_query_id: string
  readonly result: root_i$.TypeInputBotInlineResult
}

/** `messages.sentEncryptedFile#9493ff32` */
export interface SentEncryptedFile {
  readonly _: 'messages.sentEncryptedFile'
  readonly date: number
  readonly file: root_e$.TypeEncryptedFile
}

/** `messages.sentEncryptedMessage#560f8935` */
export interface SentEncryptedMessage {
  readonly _: 'messages.sentEncryptedMessage'
  readonly date: number
}

/** `messages.setBotCallbackAnswer#d58f130a` */
export interface SetBotCallbackAnswer {
  readonly _: 'messages.setBotCallbackAnswer'
  readonly alert?: true
  readonly query_id: bigint
  readonly message?: string
  readonly url?: string
  readonly cache_time: number
}

/** `messages.setBotGuestChatResult#b8f106e3` */
export interface SetBotGuestChatResult {
  readonly _: 'messages.setBotGuestChatResult'
  readonly query_id: bigint
  readonly result: root_i$.TypeInputBotInlineResult
}

/** `messages.setBotPrecheckoutResults#09c2dd95` */
export interface SetBotPrecheckoutResults {
  readonly _: 'messages.setBotPrecheckoutResults'
  readonly success?: true
  readonly query_id: bigint
  readonly error?: string
}

/** `messages.setBotShippingResults#e5f672fa` */
export interface SetBotShippingResults {
  readonly _: 'messages.setBotShippingResults'
  readonly query_id: bigint
  readonly error?: string
  readonly shipping_options?: readonly root_s$.TypeShippingOption[]
}

/** `messages.setChatAvailableReactions#864b2581` */
export interface SetChatAvailableReactions {
  readonly _: 'messages.setChatAvailableReactions'
  readonly peer: root_i$.TypeInputPeer
  readonly available_reactions: root_c$.TypeChatReactions
  readonly reactions_limit?: number
  readonly paid_enabled?: boolean
}

/** `messages.setChatTheme#081202c9` */
export interface SetChatTheme {
  readonly _: 'messages.setChatTheme'
  readonly peer: root_i$.TypeInputPeer
  readonly theme: root_i$.TypeInputChatTheme
}

/** `messages.setChatWallPaper#8ffacae1` */
export interface SetChatWallPaper {
  readonly _: 'messages.setChatWallPaper'
  readonly for_both?: true
  readonly revert?: true
  readonly peer: root_i$.TypeInputPeer
  readonly wallpaper?: root_i$.TypeInputWallPaper
  readonly settings?: root_w$.TypeWallPaperSettings
  readonly id?: number
}

/** `messages.setDefaultHistoryTTL#9eb51445` */
export interface SetDefaultHistoryTTL {
  readonly _: 'messages.setDefaultHistoryTTL'
  readonly period: number
}

/** `messages.setDefaultReaction#4f47a016` */
export interface SetDefaultReaction {
  readonly _: 'messages.setDefaultReaction'
  readonly reaction: root_r$.TypeReaction
}

/** `messages.setEncryptedTyping#791451ed` */
export interface SetEncryptedTyping {
  readonly _: 'messages.setEncryptedTyping'
  readonly peer: root_i$.TypeInputEncryptedChat
  readonly typing: boolean
}

/** `messages.setGameScore#8ef8ecc0` */
export interface SetGameScore {
  readonly _: 'messages.setGameScore'
  readonly edit_message?: true
  readonly force?: true
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly user_id: root_i$.TypeInputUser
  readonly score: number
}

/** `messages.setHistoryTTL#b80e5fe4` */
export interface SetHistoryTTL {
  readonly _: 'messages.setHistoryTTL'
  readonly peer: root_i$.TypeInputPeer
  readonly period: number
}

/** `messages.setInlineBotResults#bb12a419` */
export interface SetInlineBotResults {
  readonly _: 'messages.setInlineBotResults'
  readonly gallery?: true
  readonly private?: true
  readonly query_id: bigint
  readonly results: readonly root_i$.TypeInputBotInlineResult[]
  readonly cache_time: number
  readonly next_offset?: string
  readonly switch_pm?: root_i$.TypeInlineBotSwitchPM
  readonly switch_webview?: root_i$.TypeInlineBotWebView
}

/** `messages.setInlineGameScore#15ad9f64` */
export interface SetInlineGameScore {
  readonly _: 'messages.setInlineGameScore'
  readonly edit_message?: true
  readonly force?: true
  readonly id: root_i$.TypeInputBotInlineMessageID
  readonly user_id: root_i$.TypeInputUser
  readonly score: number
}

/** `messages.setTyping#58943ee2` */
export interface SetTyping {
  readonly _: 'messages.setTyping'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
  readonly action: root_s$.TypeSendMessageAction
}

/** `messages.sponsoredMessages#ffda656d` */
export interface SponsoredMessages {
  readonly _: 'messages.sponsoredMessages'
  readonly posts_between?: number
  readonly start_delay?: number
  readonly between_delay?: number
  readonly messages: readonly root_s$.TypeSponsoredMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.sponsoredMessagesEmpty#1839490f` */
export interface SponsoredMessagesEmpty {
  readonly _: 'messages.sponsoredMessagesEmpty'
}

/** `messages.startBot#e6df7378` */
export interface StartBot {
  readonly _: 'messages.startBot'
  readonly bot: root_i$.TypeInputUser
  readonly peer: root_i$.TypeInputPeer
  readonly random_id: bigint
  readonly start_param: string
}

/** `messages.startHistoryImport#b43df344` */
export interface StartHistoryImport {
  readonly _: 'messages.startHistoryImport'
  readonly peer: root_i$.TypeInputPeer
  readonly import_id: bigint
}

/** `messages.stickerSet#6e153f16` */
export interface StickerSet {
  readonly _: 'messages.stickerSet'
  readonly set: root_s$.TypeStickerSet
  readonly packs: readonly root_s$.TypeStickerPack[]
  readonly keywords: readonly root_s$.TypeStickerKeyword[]
  readonly documents: readonly root_d$.TypeDocument[]
}

/** `messages.stickerSetInstallResultArchive#35e410a8` */
export interface StickerSetInstallResultArchive {
  readonly _: 'messages.stickerSetInstallResultArchive'
  readonly sets: readonly root_s$.TypeStickerSetCovered[]
}

/** `messages.stickerSetInstallResultSuccess#38641628` */
export interface StickerSetInstallResultSuccess {
  readonly _: 'messages.stickerSetInstallResultSuccess'
}

/** `messages.stickerSetNotModified#d3f924eb` */
export interface StickerSetNotModified {
  readonly _: 'messages.stickerSetNotModified'
}

/** `messages.stickers#30a6ec7e` */
export interface Stickers {
  readonly _: 'messages.stickers'
  readonly hash: bigint
  readonly stickers: readonly root_d$.TypeDocument[]
}

/** `messages.stickersNotModified#f1749a22` */
export interface StickersNotModified {
  readonly _: 'messages.stickersNotModified'
}

/** `messages.summarizeText#abbbd346` */
export interface SummarizeText {
  readonly _: 'messages.summarizeText'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly to_lang?: string
  readonly tone?: string
}

/** `messages.toggleBotInAttachMenu#69f59d69` */
export interface ToggleBotInAttachMenu {
  readonly _: 'messages.toggleBotInAttachMenu'
  readonly write_allowed?: true
  readonly bot: root_i$.TypeInputUser
  readonly enabled: boolean
}

/** `messages.toggleDialogFilterTags#fd2dda49` */
export interface ToggleDialogFilterTags {
  readonly _: 'messages.toggleDialogFilterTags'
  readonly enabled: boolean
}

/** `messages.toggleDialogPin#a731e257` */
export interface ToggleDialogPin {
  readonly _: 'messages.toggleDialogPin'
  readonly pinned?: true
  readonly peer: root_i$.TypeInputDialogPeer
}

/** `messages.toggleNoForwards#b2081a35` */
export interface ToggleNoForwards {
  readonly _: 'messages.toggleNoForwards'
  readonly peer: root_i$.TypeInputPeer
  readonly enabled: boolean
  readonly request_msg_id?: number
}

/** `messages.togglePaidReactionPrivacy#435885b5` */
export interface TogglePaidReactionPrivacy {
  readonly _: 'messages.togglePaidReactionPrivacy'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly private: root_p$.TypePaidReactionPrivacy
}

/** `messages.togglePeerTranslations#e47cb579` */
export interface TogglePeerTranslations {
  readonly _: 'messages.togglePeerTranslations'
  readonly disabled?: true
  readonly peer: root_i$.TypeInputPeer
}

/** `messages.toggleSavedDialogPin#ac81bbde` */
export interface ToggleSavedDialogPin {
  readonly _: 'messages.toggleSavedDialogPin'
  readonly pinned?: true
  readonly peer: root_i$.TypeInputDialogPeer
}

/** `messages.toggleStickerSets#b5052fea` */
export interface ToggleStickerSets {
  readonly _: 'messages.toggleStickerSets'
  readonly uninstall?: true
  readonly archive?: true
  readonly unarchive?: true
  readonly stickersets: readonly root_i$.TypeInputStickerSet[]
}

/** `messages.toggleSuggestedPostApproval#8107455c` */
export interface ToggleSuggestedPostApproval {
  readonly _: 'messages.toggleSuggestedPostApproval'
  readonly reject?: true
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly schedule_date?: number
  readonly reject_comment?: string
}

/** `messages.toggleTodoCompleted#d3e03124` */
export interface ToggleTodoCompleted {
  readonly _: 'messages.toggleTodoCompleted'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
  readonly completed: readonly number[]
  readonly incompleted: readonly number[]
}

/** `messages.transcribeAudio#269e9a49` */
export interface TranscribeAudio {
  readonly _: 'messages.transcribeAudio'
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
}

/** `messages.transcribedAudio#cfb9d957` */
export interface TranscribedAudio {
  readonly _: 'messages.transcribedAudio'
  readonly pending?: true
  readonly transcription_id: bigint
  readonly text: string
  readonly trial_remains_num?: number
  readonly trial_remains_until_date?: number
}

/** `messages.translateResult#33db32f8` */
export interface TranslateResult {
  readonly _: 'messages.translateResult'
  readonly result: readonly root_t$.TypeTextWithEntities[]
}

/** `messages.translateRichMessage#1a542004` */
export interface TranslateRichMessage {
  readonly _: 'messages.translateRichMessage'
  readonly peer?: root_i$.TypeInputPeer
  readonly id?: readonly number[]
  readonly text?: readonly root_i$.TypeInputRichMessage[]
  readonly to_lang: string
  readonly tone?: string
}

/** `messages.translateText#a5eec345` */
export interface TranslateText {
  readonly _: 'messages.translateText'
  readonly peer?: root_i$.TypeInputPeer
  readonly id?: readonly number[]
  readonly text?: readonly root_t$.TypeTextWithEntities[]
  readonly to_lang: string
  readonly tone?: string
}

/** `messages.translatedRichMessage#4203998f` */
export interface TranslatedRichMessage {
  readonly _: 'messages.translatedRichMessage'
  readonly result: readonly root_r$.TypeRichMessage[]
}

/** Any `messages.AffectedFoundMessages`. */
export type TypeAffectedFoundMessages =
  | AffectedFoundMessages

/** Any `messages.AffectedHistory`. */
export type TypeAffectedHistory =
  | AffectedHistory

/** Any `messages.AffectedMessages`. */
export type TypeAffectedMessages =
  | AffectedMessages

/** Any `messages.AllStickers`. */
export type TypeAllStickers =
  | AllStickers
  | AllStickersNotModified

/** Any `messages.ArchivedStickers`. */
export type TypeArchivedStickers =
  | ArchivedStickers

/** Any `messages.AvailableEffects`. */
export type TypeAvailableEffects =
  | AvailableEffects
  | AvailableEffectsNotModified

/** Any `messages.AvailableReactions`. */
export type TypeAvailableReactions =
  | AvailableReactions
  | AvailableReactionsNotModified

/** Any `messages.BotApp`. */
export type TypeBotApp =
  | BotApp

/** Any `messages.BotCallbackAnswer`. */
export type TypeBotCallbackAnswer =
  | BotCallbackAnswer

/** Any `messages.BotPreparedInlineMessage`. */
export type TypeBotPreparedInlineMessage =
  | BotPreparedInlineMessage

/** Any `messages.BotResults`. */
export type TypeBotResults =
  | BotResults

/** Any `messages.ChatAdminsWithInvites`. */
export type TypeChatAdminsWithInvites =
  | ChatAdminsWithInvites

/** Any `messages.ChatFull`. */
export type TypeChatFull =
  | ChatFull

/** Any `messages.ChatInviteImporters`. */
export type TypeChatInviteImporters =
  | ChatInviteImporters

/** Any `messages.ChatInviteJoinResult`. */
export type TypeChatInviteJoinResult =
  | ChatInviteJoinResultOk
  | ChatInviteJoinResultWebView

/** Any `messages.Chats`. */
export type TypeChats =
  | Chats
  | ChatsSlice

/** Any `messages.CheckedHistoryImportPeer`. */
export type TypeCheckedHistoryImportPeer =
  | CheckedHistoryImportPeer

/** Any `messages.ComposedMessageWithAI`. */
export type TypeComposedMessageWithAI =
  | ComposedMessageWithAI

/** Any `messages.ComposedRichMessageWithAI`. */
export type TypeComposedRichMessageWithAI =
  | ComposedRichMessageWithAI

/** Any `messages.DhConfig`. */
export type TypeDhConfig =
  | DhConfig
  | DhConfigNotModified

/** Any `messages.DialogFilters`. */
export type TypeDialogFilters =
  | DialogFilters

/** Any `messages.Dialogs`. */
export type TypeDialogs =
  | Dialogs
  | DialogsNotModified
  | DialogsSlice

/** Any `messages.DiscussionMessage`. */
export type TypeDiscussionMessage =
  | DiscussionMessage

/** Any `messages.EmojiGameInfo`. */
export type TypeEmojiGameInfo =
  | EmojiGameDiceInfo
  | EmojiGameUnavailable

/** Any `messages.EmojiGameOutcome`. */
export type TypeEmojiGameOutcome =
  | EmojiGameOutcome

/** Any `messages.EmojiGroups`. */
export type TypeEmojiGroups =
  | EmojiGroups
  | EmojiGroupsNotModified

/** Any `messages.ExportedChatInvite`. */
export type TypeExportedChatInvite =
  | ExportedChatInvite
  | ExportedChatInviteReplaced

/** Any `messages.ExportedChatInvites`. */
export type TypeExportedChatInvites =
  | ExportedChatInvites

/** Any `messages.FavedStickers`. */
export type TypeFavedStickers =
  | FavedStickers
  | FavedStickersNotModified

/** Any `messages.FeaturedStickers`. */
export type TypeFeaturedStickers =
  | FeaturedStickers
  | FeaturedStickersNotModified

/** Any `messages.ForumTopics`. */
export type TypeForumTopics =
  | ForumTopics

/** Any `messages.FoundStickerSets`. */
export type TypeFoundStickerSets =
  | FoundStickerSets
  | FoundStickerSetsNotModified

/** Any `messages.FoundStickers`. */
export type TypeFoundStickers =
  | FoundStickers
  | FoundStickersNotModified

/** Any `messages.HighScores`. */
export type TypeHighScores =
  | HighScores

/** Any `messages.HistoryImport`. */
export type TypeHistoryImport =
  | HistoryImport

/** Any `messages.HistoryImportParsed`. */
export type TypeHistoryImportParsed =
  | HistoryImportParsed

/** Any `messages.InactiveChats`. */
export type TypeInactiveChats =
  | InactiveChats

/** Any `messages.InvitedUsers`. */
export type TypeInvitedUsers =
  | InvitedUsers

/** Any `messages.MessageEditData`. */
export type TypeMessageEditData =
  | MessageEditData

/** Any `messages.MessageReactionsList`. */
export type TypeMessageReactionsList =
  | MessageReactionsList

/** Any `messages.MessageViews`. */
export type TypeMessageViews =
  | MessageViews

/** Any `messages.Messages`. */
export type TypeMessages =
  | ChannelMessages
  | Messages
  | MessagesNotModified
  | MessagesSlice

/** Any `messages.MyStickers`. */
export type TypeMyStickers =
  | MyStickers

/** Any `messages.PeerDialogs`. */
export type TypePeerDialogs =
  | PeerDialogs

/** Any `messages.PeerSettings`. */
export type TypePeerSettings =
  | PeerSettings

/** Any `messages.PreparedInlineMessage`. */
export type TypePreparedInlineMessage =
  | PreparedInlineMessage

/** Any `messages.QuickReplies`. */
export type TypeQuickReplies =
  | QuickReplies
  | QuickRepliesNotModified

/** Any `messages.Reactions`. */
export type TypeReactions =
  | Reactions
  | ReactionsNotModified

/** Any `messages.RecentStickers`. */
export type TypeRecentStickers =
  | RecentStickers
  | RecentStickersNotModified

/** Any `messages.SavedDialogs`. */
export type TypeSavedDialogs =
  | SavedDialogs
  | SavedDialogsNotModified
  | SavedDialogsSlice

/** Any `messages.SavedGifs`. */
export type TypeSavedGifs =
  | SavedGifs
  | SavedGifsNotModified

/** Any `messages.SavedReactionTags`. */
export type TypeSavedReactionTags =
  | SavedReactionTags
  | SavedReactionTagsNotModified

/** Any `messages.SearchCounter`. */
export type TypeSearchCounter =
  | SearchCounter

/** Any `messages.SearchResultsCalendar`. */
export type TypeSearchResultsCalendar =
  | SearchResultsCalendar

/** Any `messages.SearchResultsPositions`. */
export type TypeSearchResultsPositions =
  | SearchResultsPositions

/** Any `messages.SentEncryptedMessage`. */
export type TypeSentEncryptedMessage =
  | SentEncryptedFile
  | SentEncryptedMessage

/** Any `messages.SponsoredMessages`. */
export type TypeSponsoredMessages =
  | SponsoredMessages
  | SponsoredMessagesEmpty

/** Any `messages.StickerSet`. */
export type TypeStickerSet =
  | StickerSet
  | StickerSetNotModified

/** Any `messages.StickerSetInstallResult`. */
export type TypeStickerSetInstallResult =
  | StickerSetInstallResultArchive
  | StickerSetInstallResultSuccess

/** Any `messages.Stickers`. */
export type TypeStickers =
  | Stickers
  | StickersNotModified

/** Any `messages.TranscribedAudio`. */
export type TypeTranscribedAudio =
  | TranscribedAudio

/** Any `messages.TranslatedRichMessage`. */
export type TypeTranslatedRichMessage =
  | TranslatedRichMessage

/** Any `messages.TranslatedText`. */
export type TypeTranslatedText =
  | TranslateResult

/** Any `messages.VotesList`. */
export type TypeVotesList =
  | VotesList

/** Any `messages.WebPage`. */
export type TypeWebPage =
  | WebPage

/** Any `messages.WebPagePreview`. */
export type TypeWebPagePreview =
  | WebPagePreview

/** `messages.uninstallStickerSet#f96e55de` */
export interface UninstallStickerSet {
  readonly _: 'messages.uninstallStickerSet'
  readonly stickerset: root_i$.TypeInputStickerSet
}

/** `messages.unpinAllMessages#062dd747` */
export interface UnpinAllMessages {
  readonly _: 'messages.unpinAllMessages'
  readonly peer: root_i$.TypeInputPeer
  readonly top_msg_id?: number
  readonly saved_peer_id?: root_i$.TypeInputPeer
}

/** `messages.updateDialogFilter#1ad4a04a` */
export interface UpdateDialogFilter {
  readonly _: 'messages.updateDialogFilter'
  readonly id: number
  readonly filter?: root_d$.TypeDialogFilter
}

/** `messages.updateDialogFiltersOrder#c563c1e4` */
export interface UpdateDialogFiltersOrder {
  readonly _: 'messages.updateDialogFiltersOrder'
  readonly order: readonly number[]
}

/** `messages.updatePinnedForumTopic#175df251` */
export interface UpdatePinnedForumTopic {
  readonly _: 'messages.updatePinnedForumTopic'
  readonly peer: root_i$.TypeInputPeer
  readonly topic_id: number
  readonly pinned: boolean
}

/** `messages.updatePinnedMessage#d2aaf7ec` */
export interface UpdatePinnedMessage {
  readonly _: 'messages.updatePinnedMessage'
  readonly silent?: true
  readonly unpin?: true
  readonly pm_oneside?: true
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
}

/** `messages.updateSavedReactionTag#60297dec` */
export interface UpdateSavedReactionTag {
  readonly _: 'messages.updateSavedReactionTag'
  readonly reaction: root_r$.TypeReaction
  readonly title?: string
}

/** `messages.uploadEncryptedFile#5057c497` */
export interface UploadEncryptedFile {
  readonly _: 'messages.uploadEncryptedFile'
  readonly peer: root_i$.TypeInputEncryptedChat
  readonly file: root_i$.TypeInputEncryptedFile
}

/** `messages.uploadImportedMedia#2a862092` */
export interface UploadImportedMedia {
  readonly _: 'messages.uploadImportedMedia'
  readonly peer: root_i$.TypeInputPeer
  readonly import_id: bigint
  readonly file_name: string
  readonly media: root_i$.TypeInputMedia
}

/** `messages.uploadMedia#14967978` */
export interface UploadMedia {
  readonly _: 'messages.uploadMedia'
  readonly business_connection_id?: string
  readonly peer: root_i$.TypeInputPeer
  readonly media: root_i$.TypeInputMedia
}

/** `messages.viewSponsoredMessage#269e3643` */
export interface ViewSponsoredMessage {
  readonly _: 'messages.viewSponsoredMessage'
  readonly random_id: Uint8Array
}

/** `messages.votesList#4899484e` */
export interface VotesList {
  readonly _: 'messages.votesList'
  readonly count: number
  readonly votes: readonly root_m$.TypeMessagePeerVote[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly next_offset?: string
}

/** `messages.webPage#fd5e12bd` */
export interface WebPage {
  readonly _: 'messages.webPage'
  readonly webpage: root_w$.TypeWebPage
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.webPagePreview#8c9a88ac` */
export interface WebPagePreview {
  readonly _: 'messages.webPagePreview'
  readonly media: root_m$.TypeMessageMedia
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}
