// GENERATED FILE — do not edit.
// TL types for messages
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

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

/** `messages.checkedHistoryImportPeer#a24de717` */
export interface CheckedHistoryImportPeer {
  readonly _: 'messages.checkedHistoryImportPeer'
  readonly confirm_text: string
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

/** `messages.inactiveChats#a927fec5` */
export interface InactiveChats {
  readonly _: 'messages.inactiveChats'
  readonly dates: readonly number[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `messages.invitedUsers#7f5defa6` */
export interface InvitedUsers {
  readonly _: 'messages.invitedUsers'
  readonly updates: root_u$.TypeUpdates
  readonly missing_invitees: readonly root_m$.TypeMissingInvitee[]
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

/** `messages.searchCounter#e844ebff` */
export interface SearchCounter {
  readonly _: 'messages.searchCounter'
  readonly inexact?: true
  readonly filter: root_m$.TypeMessagesFilter
  readonly count: number
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

/** Any `messages.Chats`. */
export type TypeChats =
  | Chats
  | ChatsSlice

/** Any `messages.CheckedHistoryImportPeer`. */
export type TypeCheckedHistoryImportPeer =
  | CheckedHistoryImportPeer

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
