// GENERATED FILE — do not edit.
// TL types for channels
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_c$ from './root/c.js'
import type * as root_e$ from './root/e.js'
import type * as root_i$ from './root/i.js'
import type * as root_p$ from './root/p.js'
import type * as root_s$ from './root/s.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `channels.adminLogResults#ed8af74d` */
export interface AdminLogResults {
  readonly _: 'channels.adminLogResults'
  readonly events: readonly root_c$.TypeChannelAdminLogEvent[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `channels.channelParticipant#dfb80317` */
export interface ChannelParticipant {
  readonly _: 'channels.channelParticipant'
  readonly participant: root_c$.TypeChannelParticipant
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `channels.channelParticipants#9ab0feaf` */
export interface ChannelParticipants {
  readonly _: 'channels.channelParticipants'
  readonly count: number
  readonly participants: readonly root_c$.TypeChannelParticipant[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `channels.channelParticipantsNotModified#f0173fe9` */
export interface ChannelParticipantsNotModified {
  readonly _: 'channels.channelParticipantsNotModified'
}

/** `channels.checkSearchPostsFlood#22567115` */
export interface CheckSearchPostsFlood {
  readonly _: 'channels.checkSearchPostsFlood'
  readonly query?: string
}

/** `channels.checkUsername#10e6bd2c` */
export interface CheckUsername {
  readonly _: 'channels.checkUsername'
  readonly channel: root_i$.TypeInputChannel
  readonly username: string
}

/** `channels.convertToGigagroup#0b290c69` */
export interface ConvertToGigagroup {
  readonly _: 'channels.convertToGigagroup'
  readonly channel: root_i$.TypeInputChannel
}

/** `channels.createChannel#91006707` */
export interface CreateChannel {
  readonly _: 'channels.createChannel'
  readonly broadcast?: true
  readonly megagroup?: true
  readonly for_import?: true
  readonly forum?: true
  readonly title: string
  readonly about: string
  readonly geo_point?: root_i$.TypeInputGeoPoint
  readonly address?: string
  readonly ttl_period?: number
}

/** `channels.deactivateAllUsernames#0a245dd3` */
export interface DeactivateAllUsernames {
  readonly _: 'channels.deactivateAllUsernames'
  readonly channel: root_i$.TypeInputChannel
}

/** `channels.deleteChannel#c0111fe3` */
export interface DeleteChannel {
  readonly _: 'channels.deleteChannel'
  readonly channel: root_i$.TypeInputChannel
}

/** `channels.deleteHistory#9baa9647` */
export interface DeleteHistory {
  readonly _: 'channels.deleteHistory'
  readonly for_everyone?: true
  readonly channel: root_i$.TypeInputChannel
  readonly max_id: number
}

/** `channels.deleteMessages#84c1fd4e` */
export interface DeleteMessages {
  readonly _: 'channels.deleteMessages'
  readonly channel: root_i$.TypeInputChannel
  readonly id: readonly number[]
}

/** `channels.deleteParticipantHistory#367544db` */
export interface DeleteParticipantHistory {
  readonly _: 'channels.deleteParticipantHistory'
  readonly channel: root_i$.TypeInputChannel
  readonly participant: root_i$.TypeInputPeer
}

/** `channels.editAdmin#9a98ad68` */
export interface EditAdmin {
  readonly _: 'channels.editAdmin'
  readonly channel: root_i$.TypeInputChannel
  readonly user_id: root_i$.TypeInputUser
  readonly admin_rights: root_c$.TypeChatAdminRights
  readonly rank?: string
}

/** `channels.editBanned#96e6cd81` */
export interface EditBanned {
  readonly _: 'channels.editBanned'
  readonly channel: root_i$.TypeInputChannel
  readonly participant: root_i$.TypeInputPeer
  readonly banned_rights: root_c$.TypeChatBannedRights
}

/** `channels.editLocation#58e63f6d` */
export interface EditLocation {
  readonly _: 'channels.editLocation'
  readonly channel: root_i$.TypeInputChannel
  readonly geo_point: root_i$.TypeInputGeoPoint
  readonly address: string
}

/** `channels.editPhoto#f12e57c9` */
export interface EditPhoto {
  readonly _: 'channels.editPhoto'
  readonly channel: root_i$.TypeInputChannel
  readonly photo: root_i$.TypeInputChatPhoto
}

/** `channels.editTitle#566decd0` */
export interface EditTitle {
  readonly _: 'channels.editTitle'
  readonly channel: root_i$.TypeInputChannel
  readonly title: string
}

/** `channels.exportMessageLink#e63fadeb` */
export interface ExportMessageLink {
  readonly _: 'channels.exportMessageLink'
  readonly grouped?: true
  readonly thread?: true
  readonly channel: root_i$.TypeInputChannel
  readonly id: number
}

/** `channels.getAdminLog#33ddf480` */
export interface GetAdminLog {
  readonly _: 'channels.getAdminLog'
  readonly channel: root_i$.TypeInputChannel
  readonly q: string
  readonly events_filter?: root_c$.TypeChannelAdminLogEventsFilter
  readonly admins?: readonly root_i$.TypeInputUser[]
  readonly max_id: bigint
  readonly min_id: bigint
  readonly limit: number
}

/** `channels.getAdminedPublicChannels#f8b036af` */
export interface GetAdminedPublicChannels {
  readonly _: 'channels.getAdminedPublicChannels'
  readonly by_location?: true
  readonly check_limit?: true
  readonly for_personal?: true
}

/** `channels.getChannelRecommendations#25a71742` */
export interface GetChannelRecommendations {
  readonly _: 'channels.getChannelRecommendations'
  readonly channel?: root_i$.TypeInputChannel
}

/** `channels.getChannels#0a7f6bbb` */
export interface GetChannels {
  readonly _: 'channels.getChannels'
  readonly id: readonly root_i$.TypeInputChannel[]
}

/** `channels.getFullChannel#08736a09` */
export interface GetFullChannel {
  readonly _: 'channels.getFullChannel'
  readonly channel: root_i$.TypeInputChannel
}

/** `channels.getGroupsForDiscussion#f5dad378` */
export interface GetGroupsForDiscussion {
  readonly _: 'channels.getGroupsForDiscussion'
}

/** `channels.getInactiveChannels#11e831ee` */
export interface GetInactiveChannels {
  readonly _: 'channels.getInactiveChannels'
}

/** `channels.getLeftChannels#8341ecc0` */
export interface GetLeftChannels {
  readonly _: 'channels.getLeftChannels'
  readonly offset: number
}

/** `channels.getMessageAuthor#ece2a0e6` */
export interface GetMessageAuthor {
  readonly _: 'channels.getMessageAuthor'
  readonly channel: root_i$.TypeInputChannel
  readonly id: number
}

/** `channels.getMessages#ad8c9a23` */
export interface GetMessages {
  readonly _: 'channels.getMessages'
  readonly channel: root_i$.TypeInputChannel
  readonly id: readonly root_i$.TypeInputMessage[]
}

/** `channels.getParticipant#a0ab6cc6` */
export interface GetParticipant {
  readonly _: 'channels.getParticipant'
  readonly channel: root_i$.TypeInputChannel
  readonly participant: root_i$.TypeInputPeer
}

/** `channels.getParticipants#77ced9d0` */
export interface GetParticipants {
  readonly _: 'channels.getParticipants'
  readonly channel: root_i$.TypeInputChannel
  readonly filter: root_c$.TypeChannelParticipantsFilter
  readonly offset: number
  readonly limit: number
  readonly hash: bigint
}

/** `channels.getSendAs#e785a43f` */
export interface GetSendAs {
  readonly _: 'channels.getSendAs'
  readonly for_paid_reactions?: true
  readonly for_live_stories?: true
  readonly peer: root_i$.TypeInputPeer
}

/** `channels.inviteToChannel#c9e33d54` */
export interface InviteToChannel {
  readonly _: 'channels.inviteToChannel'
  readonly channel: root_i$.TypeInputChannel
  readonly users: readonly root_i$.TypeInputUser[]
}

/** `channels.joinChannel#24b524c5` */
export interface JoinChannel {
  readonly _: 'channels.joinChannel'
  readonly channel: root_i$.TypeInputChannel
}

/** `channels.leaveChannel#f836aa95` */
export interface LeaveChannel {
  readonly _: 'channels.leaveChannel'
  readonly channel: root_i$.TypeInputChannel
}

/** `channels.readHistory#cc104937` */
export interface ReadHistory {
  readonly _: 'channels.readHistory'
  readonly channel: root_i$.TypeInputChannel
  readonly max_id: number
}

/** `channels.readMessageContents#eab5dc38` */
export interface ReadMessageContents {
  readonly _: 'channels.readMessageContents'
  readonly channel: root_i$.TypeInputChannel
  readonly id: readonly number[]
}

/** `channels.reorderUsernames#b45ced1d` */
export interface ReorderUsernames {
  readonly _: 'channels.reorderUsernames'
  readonly channel: root_i$.TypeInputChannel
  readonly order: readonly string[]
}

/** `channels.reportAntiSpamFalsePositive#a850a693` */
export interface ReportAntiSpamFalsePositive {
  readonly _: 'channels.reportAntiSpamFalsePositive'
  readonly channel: root_i$.TypeInputChannel
  readonly msg_id: number
}

/** `channels.reportSpam#f44a8315` */
export interface ReportSpam {
  readonly _: 'channels.reportSpam'
  readonly channel: root_i$.TypeInputChannel
  readonly participant: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `channels.restrictSponsoredMessages#9ae91519` */
export interface RestrictSponsoredMessages {
  readonly _: 'channels.restrictSponsoredMessages'
  readonly channel: root_i$.TypeInputChannel
  readonly restricted: boolean
}

/** `channels.searchPosts#f2c4f24d` */
export interface SearchPosts {
  readonly _: 'channels.searchPosts'
  readonly hashtag?: string
  readonly query?: string
  readonly offset_rate: number
  readonly offset_peer: root_i$.TypeInputPeer
  readonly offset_id: number
  readonly limit: number
  readonly allow_paid_stars?: bigint
}

/** `channels.sendAsPeers#f496b0c6` */
export interface SendAsPeers {
  readonly _: 'channels.sendAsPeers'
  readonly peers: readonly root_s$.TypeSendAsPeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `channels.setBoostsToUnblockRestrictions#ad399cee` */
export interface SetBoostsToUnblockRestrictions {
  readonly _: 'channels.setBoostsToUnblockRestrictions'
  readonly channel: root_i$.TypeInputChannel
  readonly boosts: number
}

/** `channels.setDiscussionGroup#40582bb2` */
export interface SetDiscussionGroup {
  readonly _: 'channels.setDiscussionGroup'
  readonly broadcast: root_i$.TypeInputChannel
  readonly group: root_i$.TypeInputChannel
}

/** `channels.setEmojiStickers#3cd930b7` */
export interface SetEmojiStickers {
  readonly _: 'channels.setEmojiStickers'
  readonly channel: root_i$.TypeInputChannel
  readonly stickerset: root_i$.TypeInputStickerSet
}

/** `channels.setMainProfileTab#3583fcb1` */
export interface SetMainProfileTab {
  readonly _: 'channels.setMainProfileTab'
  readonly channel: root_i$.TypeInputChannel
  readonly tab: root_p$.TypeProfileTab
}

/** `channels.setStickers#ea8ca4f9` */
export interface SetStickers {
  readonly _: 'channels.setStickers'
  readonly channel: root_i$.TypeInputChannel
  readonly stickerset: root_i$.TypeInputStickerSet
}

/** `channels.sponsoredMessageReportResultAdsHidden#3e3bcf2f` */
export interface SponsoredMessageReportResultAdsHidden {
  readonly _: 'channels.sponsoredMessageReportResultAdsHidden'
}

/** `channels.sponsoredMessageReportResultChooseOption#846f9e42` */
export interface SponsoredMessageReportResultChooseOption {
  readonly _: 'channels.sponsoredMessageReportResultChooseOption'
  readonly title: string
  readonly options: readonly root_s$.TypeSponsoredMessageReportOption[]
}

/** `channels.sponsoredMessageReportResultReported#ad798849` */
export interface SponsoredMessageReportResultReported {
  readonly _: 'channels.sponsoredMessageReportResultReported'
}

/** `channels.toggleAntiSpam#68f3e4eb` */
export interface ToggleAntiSpam {
  readonly _: 'channels.toggleAntiSpam'
  readonly channel: root_i$.TypeInputChannel
  readonly enabled: boolean
}

/** `channels.toggleAutotranslation#167fc0a1` */
export interface ToggleAutotranslation {
  readonly _: 'channels.toggleAutotranslation'
  readonly channel: root_i$.TypeInputChannel
  readonly enabled: boolean
}

/** `channels.toggleForum#3ff75734` */
export interface ToggleForum {
  readonly _: 'channels.toggleForum'
  readonly channel: root_i$.TypeInputChannel
  readonly enabled: boolean
  readonly tabs: boolean
}

/** `channels.toggleJoinRequest#4c2985b6` */
export interface ToggleJoinRequest {
  readonly _: 'channels.toggleJoinRequest'
  readonly channel: root_i$.TypeInputChannel
  readonly enabled: boolean
}

/** `channels.toggleJoinToSend#e4cb9580` */
export interface ToggleJoinToSend {
  readonly _: 'channels.toggleJoinToSend'
  readonly channel: root_i$.TypeInputChannel
  readonly enabled: boolean
}

/** `channels.toggleParticipantsHidden#6a6e7854` */
export interface ToggleParticipantsHidden {
  readonly _: 'channels.toggleParticipantsHidden'
  readonly channel: root_i$.TypeInputChannel
  readonly enabled: boolean
}

/** `channels.togglePreHistoryHidden#eabbb94c` */
export interface TogglePreHistoryHidden {
  readonly _: 'channels.togglePreHistoryHidden'
  readonly channel: root_i$.TypeInputChannel
  readonly enabled: boolean
}

/** `channels.toggleSignatures#418d549c` */
export interface ToggleSignatures {
  readonly _: 'channels.toggleSignatures'
  readonly signatures_enabled?: true
  readonly profiles_enabled?: true
  readonly channel: root_i$.TypeInputChannel
}

/** `channels.toggleSlowMode#edd49ef0` */
export interface ToggleSlowMode {
  readonly _: 'channels.toggleSlowMode'
  readonly channel: root_i$.TypeInputChannel
  readonly seconds: number
}

/** `channels.toggleUsername#50f24105` */
export interface ToggleUsername {
  readonly _: 'channels.toggleUsername'
  readonly channel: root_i$.TypeInputChannel
  readonly username: string
  readonly active: boolean
}

/** `channels.toggleViewForumAsMessages#9738bb15` */
export interface ToggleViewForumAsMessages {
  readonly _: 'channels.toggleViewForumAsMessages'
  readonly channel: root_i$.TypeInputChannel
  readonly enabled: boolean
}

/** Any `channels.AdminLogResults`. */
export type TypeAdminLogResults =
  | AdminLogResults

/** Any `channels.ChannelParticipant`. */
export type TypeChannelParticipant =
  | ChannelParticipant

/** Any `channels.ChannelParticipants`. */
export type TypeChannelParticipants =
  | ChannelParticipants
  | ChannelParticipantsNotModified

/** Any `channels.SendAsPeers`. */
export type TypeSendAsPeers =
  | SendAsPeers

/** Any `channels.SponsoredMessageReportResult`. */
export type TypeSponsoredMessageReportResult =
  | SponsoredMessageReportResultAdsHidden
  | SponsoredMessageReportResultChooseOption
  | SponsoredMessageReportResultReported

/** `channels.updateColor#d8aa3671` */
export interface UpdateColor {
  readonly _: 'channels.updateColor'
  readonly for_profile?: true
  readonly channel: root_i$.TypeInputChannel
  readonly color?: number
  readonly background_emoji_id?: bigint
}

/** `channels.updateEmojiStatus#f0d3e6a8` */
export interface UpdateEmojiStatus {
  readonly _: 'channels.updateEmojiStatus'
  readonly channel: root_i$.TypeInputChannel
  readonly emoji_status: root_e$.TypeEmojiStatus
}

/** `channels.updatePaidMessagesPrice#4b12327b` */
export interface UpdatePaidMessagesPrice {
  readonly _: 'channels.updatePaidMessagesPrice'
  readonly broadcast_messages_allowed?: true
  readonly channel: root_i$.TypeInputChannel
  readonly send_paid_messages_stars: bigint
}

/** `channels.updateUsername#3514b3de` */
export interface UpdateUsername {
  readonly _: 'channels.updateUsername'
  readonly channel: root_i$.TypeInputChannel
  readonly username: string
}
