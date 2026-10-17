// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_b$ from '../root/b.js'
import type * as root_d$ from '../root/d.js'
import type * as root_e$ from '../root/e.js'
import type * as root_f$ from '../root/f.js'
import type * as root_g$ from '../root/g.js'
import type * as root_i$ from '../root/i.js'
import type * as root_m$ from '../root/m.js'
import type * as root_p$ from '../root/p.js'
import type * as root_r$ from '../root/r.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type * as root_u$ from '../root/u.js'
import type * as root_w$ from '../root/w.js'
import type { TlObject } from '../../../../tl/object.js'

/** `cdnConfig#5725e40a` */
export interface CdnConfig {
  readonly _: 'cdnConfig'
  readonly public_keys: readonly TypeCdnPublicKey[]
}

/** `cdnPublicKey#c982eaba` */
export interface CdnPublicKey {
  readonly _: 'cdnPublicKey'
  readonly dc_id: number
  readonly public_key: string
}

/** `channel#d49f34c6` */
export interface Channel {
  readonly _: 'channel'
  readonly creator?: true
  readonly left?: true
  readonly broadcast?: true
  readonly verified?: true
  readonly megagroup?: true
  readonly restricted?: true
  readonly signatures?: true
  readonly min?: true
  readonly scam?: true
  readonly has_link?: true
  readonly has_geo?: true
  readonly slowmode_enabled?: true
  readonly call_active?: true
  readonly call_not_empty?: true
  readonly fake?: true
  readonly gigagroup?: true
  readonly noforwards?: true
  readonly join_to_send?: true
  readonly join_request?: true
  readonly forum?: true
  readonly stories_hidden?: true
  readonly stories_hidden_min?: true
  readonly stories_unavailable?: true
  readonly signature_profiles?: true
  readonly autotranslation?: true
  readonly broadcast_messages_allowed?: true
  readonly monoforum?: true
  readonly forum_tabs?: true
  readonly id: bigint
  readonly access_hash?: bigint
  readonly title: string
  readonly username?: string
  readonly photo: TypeChatPhoto
  readonly date: number
  readonly restriction_reason?: readonly root_r$.TypeRestrictionReason[]
  readonly admin_rights?: TypeChatAdminRights
  readonly banned_rights?: TypeChatBannedRights
  readonly default_banned_rights?: TypeChatBannedRights
  readonly participants_count?: number
  readonly usernames?: readonly root_u$.TypeUsername[]
  readonly stories_max_id?: root_r$.TypeRecentStory
  readonly color?: root_p$.TypePeerColor
  readonly profile_color?: root_p$.TypePeerColor
  readonly emoji_status?: root_e$.TypeEmojiStatus
  readonly level?: number
  readonly subscription_until_date?: number
  readonly bot_verification_icon?: bigint
  readonly send_paid_messages_stars?: bigint
  readonly linked_monoforum_id?: bigint
  readonly linked_community_id?: bigint
}

/** `channelAdminLogEvent#1fad68cd` */
export interface ChannelAdminLogEvent {
  readonly _: 'channelAdminLogEvent'
  readonly id: bigint
  readonly date: number
  readonly user_id: bigint
  readonly action: TypeChannelAdminLogEventAction
}

/** `channelAdminLogEventActionChangeAbout#55188a2e` */
export interface ChannelAdminLogEventActionChangeAbout {
  readonly _: 'channelAdminLogEventActionChangeAbout'
  readonly prev_value: string
  readonly new_value: string
}

/** `channelAdminLogEventActionChangeAvailableReactions#be4e0ef8` */
export interface ChannelAdminLogEventActionChangeAvailableReactions {
  readonly _: 'channelAdminLogEventActionChangeAvailableReactions'
  readonly prev_value: TypeChatReactions
  readonly new_value: TypeChatReactions
}

/** `channelAdminLogEventActionChangeEmojiStatus#3ea9feb1` */
export interface ChannelAdminLogEventActionChangeEmojiStatus {
  readonly _: 'channelAdminLogEventActionChangeEmojiStatus'
  readonly prev_value: root_e$.TypeEmojiStatus
  readonly new_value: root_e$.TypeEmojiStatus
}

/** `channelAdminLogEventActionChangeEmojiStickerSet#46d840ab` */
export interface ChannelAdminLogEventActionChangeEmojiStickerSet {
  readonly _: 'channelAdminLogEventActionChangeEmojiStickerSet'
  readonly prev_stickerset: root_i$.TypeInputStickerSet
  readonly new_stickerset: root_i$.TypeInputStickerSet
}

/** `channelAdminLogEventActionChangeHistoryTTL#6e941a38` */
export interface ChannelAdminLogEventActionChangeHistoryTTL {
  readonly _: 'channelAdminLogEventActionChangeHistoryTTL'
  readonly prev_value: number
  readonly new_value: number
}

/** `channelAdminLogEventActionChangeLinkedChat#050c7ac8` */
export interface ChannelAdminLogEventActionChangeLinkedChat {
  readonly _: 'channelAdminLogEventActionChangeLinkedChat'
  readonly prev_value: bigint
  readonly new_value: bigint
}

/** `channelAdminLogEventActionChangeLocation#0e6b76ae` */
export interface ChannelAdminLogEventActionChangeLocation {
  readonly _: 'channelAdminLogEventActionChangeLocation'
  readonly prev_value: TypeChannelLocation
  readonly new_value: TypeChannelLocation
}

/** `channelAdminLogEventActionChangePeerColor#5796e780` */
export interface ChannelAdminLogEventActionChangePeerColor {
  readonly _: 'channelAdminLogEventActionChangePeerColor'
  readonly prev_value: root_p$.TypePeerColor
  readonly new_value: root_p$.TypePeerColor
}

/** `channelAdminLogEventActionChangePhoto#434bd2af` */
export interface ChannelAdminLogEventActionChangePhoto {
  readonly _: 'channelAdminLogEventActionChangePhoto'
  readonly prev_photo: root_p$.TypePhoto
  readonly new_photo: root_p$.TypePhoto
}

/** `channelAdminLogEventActionChangeProfilePeerColor#5e477b25` */
export interface ChannelAdminLogEventActionChangeProfilePeerColor {
  readonly _: 'channelAdminLogEventActionChangeProfilePeerColor'
  readonly prev_value: root_p$.TypePeerColor
  readonly new_value: root_p$.TypePeerColor
}

/** `channelAdminLogEventActionChangeStickerSet#b1c3caa7` */
export interface ChannelAdminLogEventActionChangeStickerSet {
  readonly _: 'channelAdminLogEventActionChangeStickerSet'
  readonly prev_stickerset: root_i$.TypeInputStickerSet
  readonly new_stickerset: root_i$.TypeInputStickerSet
}

/** `channelAdminLogEventActionChangeTitle#e6dfb825` */
export interface ChannelAdminLogEventActionChangeTitle {
  readonly _: 'channelAdminLogEventActionChangeTitle'
  readonly prev_value: string
  readonly new_value: string
}

/** `channelAdminLogEventActionChangeUsername#6a4afc38` */
export interface ChannelAdminLogEventActionChangeUsername {
  readonly _: 'channelAdminLogEventActionChangeUsername'
  readonly prev_value: string
  readonly new_value: string
}

/** `channelAdminLogEventActionChangeUsernames#f04fb3a9` */
export interface ChannelAdminLogEventActionChangeUsernames {
  readonly _: 'channelAdminLogEventActionChangeUsernames'
  readonly prev_value: readonly string[]
  readonly new_value: readonly string[]
}

/** `channelAdminLogEventActionChangeWallpaper#31bb5d52` */
export interface ChannelAdminLogEventActionChangeWallpaper {
  readonly _: 'channelAdminLogEventActionChangeWallpaper'
  readonly prev_value: root_w$.TypeWallPaper
  readonly new_value: root_w$.TypeWallPaper
}

/** `channelAdminLogEventActionCreateTopic#58707d28` */
export interface ChannelAdminLogEventActionCreateTopic {
  readonly _: 'channelAdminLogEventActionCreateTopic'
  readonly topic: root_f$.TypeForumTopic
}

/** `channelAdminLogEventActionDefaultBannedRights#2df5fc0a` */
export interface ChannelAdminLogEventActionDefaultBannedRights {
  readonly _: 'channelAdminLogEventActionDefaultBannedRights'
  readonly prev_banned_rights: TypeChatBannedRights
  readonly new_banned_rights: TypeChatBannedRights
}

/** `channelAdminLogEventActionDeleteMessage#42e047bb` */
export interface ChannelAdminLogEventActionDeleteMessage {
  readonly _: 'channelAdminLogEventActionDeleteMessage'
  readonly message: root_m$.TypeMessage
}

/** `channelAdminLogEventActionDeleteTopic#ae168909` */
export interface ChannelAdminLogEventActionDeleteTopic {
  readonly _: 'channelAdminLogEventActionDeleteTopic'
  readonly topic: root_f$.TypeForumTopic
}

/** `channelAdminLogEventActionDiscardGroupCall#db9f9140` */
export interface ChannelAdminLogEventActionDiscardGroupCall {
  readonly _: 'channelAdminLogEventActionDiscardGroupCall'
  readonly call: root_i$.TypeInputGroupCall
}

/** `channelAdminLogEventActionEditMessage#709b2405` */
export interface ChannelAdminLogEventActionEditMessage {
  readonly _: 'channelAdminLogEventActionEditMessage'
  readonly prev_message: root_m$.TypeMessage
  readonly new_message: root_m$.TypeMessage
}

/** `channelAdminLogEventActionEditTopic#f06fe208` */
export interface ChannelAdminLogEventActionEditTopic {
  readonly _: 'channelAdminLogEventActionEditTopic'
  readonly prev_topic: root_f$.TypeForumTopic
  readonly new_topic: root_f$.TypeForumTopic
}

/** `channelAdminLogEventActionExportedInviteDelete#5a50fca4` */
export interface ChannelAdminLogEventActionExportedInviteDelete {
  readonly _: 'channelAdminLogEventActionExportedInviteDelete'
  readonly invite: root_e$.TypeExportedChatInvite
}

/** `channelAdminLogEventActionExportedInviteEdit#e90ebb59` */
export interface ChannelAdminLogEventActionExportedInviteEdit {
  readonly _: 'channelAdminLogEventActionExportedInviteEdit'
  readonly prev_invite: root_e$.TypeExportedChatInvite
  readonly new_invite: root_e$.TypeExportedChatInvite
}

/** `channelAdminLogEventActionExportedInviteRevoke#410a134e` */
export interface ChannelAdminLogEventActionExportedInviteRevoke {
  readonly _: 'channelAdminLogEventActionExportedInviteRevoke'
  readonly invite: root_e$.TypeExportedChatInvite
}

/** `channelAdminLogEventActionParticipantEditRank#5806b4ec` */
export interface ChannelAdminLogEventActionParticipantEditRank {
  readonly _: 'channelAdminLogEventActionParticipantEditRank'
  readonly user_id: bigint
  readonly prev_rank: string
  readonly new_rank: string
}

/** `channelAdminLogEventActionParticipantInvite#e31c34d8` */
export interface ChannelAdminLogEventActionParticipantInvite {
  readonly _: 'channelAdminLogEventActionParticipantInvite'
  readonly participant: TypeChannelParticipant
}

/** `channelAdminLogEventActionParticipantJoin#183040d3` */
export interface ChannelAdminLogEventActionParticipantJoin {
  readonly _: 'channelAdminLogEventActionParticipantJoin'
}

/** `channelAdminLogEventActionParticipantJoinByInvite#fe9fc158` */
export interface ChannelAdminLogEventActionParticipantJoinByInvite {
  readonly _: 'channelAdminLogEventActionParticipantJoinByInvite'
  readonly via_chatlist?: true
  readonly invite: root_e$.TypeExportedChatInvite
}

/** `channelAdminLogEventActionParticipantJoinByRequest#afb6144a` */
export interface ChannelAdminLogEventActionParticipantJoinByRequest {
  readonly _: 'channelAdminLogEventActionParticipantJoinByRequest'
  readonly invite: root_e$.TypeExportedChatInvite
  readonly approved_by: bigint
}

/** `channelAdminLogEventActionParticipantLeave#f89777f2` */
export interface ChannelAdminLogEventActionParticipantLeave {
  readonly _: 'channelAdminLogEventActionParticipantLeave'
}

/** `channelAdminLogEventActionParticipantMute#f92424d2` */
export interface ChannelAdminLogEventActionParticipantMute {
  readonly _: 'channelAdminLogEventActionParticipantMute'
  readonly participant: root_g$.TypeGroupCallParticipant
}

/** `channelAdminLogEventActionParticipantSubExtend#64642db3` */
export interface ChannelAdminLogEventActionParticipantSubExtend {
  readonly _: 'channelAdminLogEventActionParticipantSubExtend'
  readonly prev_participant: TypeChannelParticipant
  readonly new_participant: TypeChannelParticipant
}

/** `channelAdminLogEventActionParticipantToggleAdmin#d5676710` */
export interface ChannelAdminLogEventActionParticipantToggleAdmin {
  readonly _: 'channelAdminLogEventActionParticipantToggleAdmin'
  readonly prev_participant: TypeChannelParticipant
  readonly new_participant: TypeChannelParticipant
}

/** `channelAdminLogEventActionParticipantToggleBan#e6d83d7e` */
export interface ChannelAdminLogEventActionParticipantToggleBan {
  readonly _: 'channelAdminLogEventActionParticipantToggleBan'
  readonly prev_participant: TypeChannelParticipant
  readonly new_participant: TypeChannelParticipant
}

/** `channelAdminLogEventActionParticipantUnmute#e64429c0` */
export interface ChannelAdminLogEventActionParticipantUnmute {
  readonly _: 'channelAdminLogEventActionParticipantUnmute'
  readonly participant: root_g$.TypeGroupCallParticipant
}

/** `channelAdminLogEventActionParticipantVolume#3e7f6847` */
export interface ChannelAdminLogEventActionParticipantVolume {
  readonly _: 'channelAdminLogEventActionParticipantVolume'
  readonly participant: root_g$.TypeGroupCallParticipant
}

/** `channelAdminLogEventActionPinTopic#5d8d353b` */
export interface ChannelAdminLogEventActionPinTopic {
  readonly _: 'channelAdminLogEventActionPinTopic'
  readonly prev_topic?: root_f$.TypeForumTopic
  readonly new_topic?: root_f$.TypeForumTopic
}

/** `channelAdminLogEventActionSendMessage#278f2868` */
export interface ChannelAdminLogEventActionSendMessage {
  readonly _: 'channelAdminLogEventActionSendMessage'
  readonly message: root_m$.TypeMessage
}

/** `channelAdminLogEventActionStartGroupCall#23209745` */
export interface ChannelAdminLogEventActionStartGroupCall {
  readonly _: 'channelAdminLogEventActionStartGroupCall'
  readonly call: root_i$.TypeInputGroupCall
}

/** `channelAdminLogEventActionStopPoll#8f079643` */
export interface ChannelAdminLogEventActionStopPoll {
  readonly _: 'channelAdminLogEventActionStopPoll'
  readonly message: root_m$.TypeMessage
}

/** `channelAdminLogEventActionToggleAntiSpam#64f36dfc` */
export interface ChannelAdminLogEventActionToggleAntiSpam {
  readonly _: 'channelAdminLogEventActionToggleAntiSpam'
  readonly new_value: boolean
}

/** `channelAdminLogEventActionToggleAutotranslation#c517f77e` */
export interface ChannelAdminLogEventActionToggleAutotranslation {
  readonly _: 'channelAdminLogEventActionToggleAutotranslation'
  readonly new_value: boolean
}

/** `channelAdminLogEventActionToggleForum#02cc6383` */
export interface ChannelAdminLogEventActionToggleForum {
  readonly _: 'channelAdminLogEventActionToggleForum'
  readonly new_value: boolean
}

/** `channelAdminLogEventActionToggleGroupCallSetting#56d6a247` */
export interface ChannelAdminLogEventActionToggleGroupCallSetting {
  readonly _: 'channelAdminLogEventActionToggleGroupCallSetting'
  readonly join_muted: boolean
}

/** `channelAdminLogEventActionToggleInvites#1b7907ae` */
export interface ChannelAdminLogEventActionToggleInvites {
  readonly _: 'channelAdminLogEventActionToggleInvites'
  readonly new_value: boolean
}

/** `channelAdminLogEventActionToggleNoForwards#cb2ac766` */
export interface ChannelAdminLogEventActionToggleNoForwards {
  readonly _: 'channelAdminLogEventActionToggleNoForwards'
  readonly new_value: boolean
}

/** `channelAdminLogEventActionTogglePreHistoryHidden#5f5c95f1` */
export interface ChannelAdminLogEventActionTogglePreHistoryHidden {
  readonly _: 'channelAdminLogEventActionTogglePreHistoryHidden'
  readonly new_value: boolean
}

/** `channelAdminLogEventActionToggleSignatureProfiles#60a79c79` */
export interface ChannelAdminLogEventActionToggleSignatureProfiles {
  readonly _: 'channelAdminLogEventActionToggleSignatureProfiles'
  readonly new_value: boolean
}

/** `channelAdminLogEventActionToggleSignatures#26ae0971` */
export interface ChannelAdminLogEventActionToggleSignatures {
  readonly _: 'channelAdminLogEventActionToggleSignatures'
  readonly new_value: boolean
}

/** `channelAdminLogEventActionToggleSlowMode#53909779` */
export interface ChannelAdminLogEventActionToggleSlowMode {
  readonly _: 'channelAdminLogEventActionToggleSlowMode'
  readonly prev_value: number
  readonly new_value: number
}

/** `channelAdminLogEventActionUpdatePinned#e9e82c18` */
export interface ChannelAdminLogEventActionUpdatePinned {
  readonly _: 'channelAdminLogEventActionUpdatePinned'
  readonly message: root_m$.TypeMessage
}

/** `channelAdminLogEventsFilter#ea107ae4` */
export interface ChannelAdminLogEventsFilter {
  readonly _: 'channelAdminLogEventsFilter'
  readonly join?: true
  readonly leave?: true
  readonly invite?: true
  readonly ban?: true
  readonly unban?: true
  readonly kick?: true
  readonly unkick?: true
  readonly promote?: true
  readonly demote?: true
  readonly info?: true
  readonly settings?: true
  readonly pinned?: true
  readonly edit?: true
  readonly delete?: true
  readonly group_call?: true
  readonly invites?: true
  readonly send?: true
  readonly forums?: true
  readonly sub_extend?: true
  readonly edit_rank?: true
}

/** `channelForbidden#17d493d5` */
export interface ChannelForbidden {
  readonly _: 'channelForbidden'
  readonly broadcast?: true
  readonly megagroup?: true
  readonly monoforum?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly title: string
  readonly until_date?: number
}

/** `channelFull#a04e8d3a` */
export interface ChannelFull {
  readonly _: 'channelFull'
  readonly can_view_participants?: true
  readonly can_set_username?: true
  readonly can_set_stickers?: true
  readonly hidden_prehistory?: true
  readonly can_set_location?: true
  readonly has_scheduled?: true
  readonly can_view_stats?: true
  readonly blocked?: true
  readonly can_delete_channel?: true
  readonly antispam?: true
  readonly participants_hidden?: true
  readonly translations_disabled?: true
  readonly stories_pinned_available?: true
  readonly view_forum_as_messages?: true
  readonly restricted_sponsored?: true
  readonly can_view_revenue?: true
  readonly paid_media_allowed?: true
  readonly can_view_stars_revenue?: true
  readonly paid_reactions_available?: true
  readonly stargifts_available?: true
  readonly paid_messages_available?: true
  readonly has_welcome_messages?: true
  readonly id: bigint
  readonly about: string
  readonly participants_count?: number
  readonly admins_count?: number
  readonly kicked_count?: number
  readonly banned_count?: number
  readonly online_count?: number
  readonly read_inbox_max_id: number
  readonly read_outbox_max_id: number
  readonly unread_count: number
  readonly chat_photo: root_p$.TypePhoto
  readonly notify_settings: root_p$.TypePeerNotifySettings
  readonly exported_invite?: root_e$.TypeExportedChatInvite
  readonly bot_info: readonly root_b$.TypeBotInfo[]
  readonly migrated_from_chat_id?: bigint
  readonly migrated_from_max_id?: number
  readonly pinned_msg_id?: number
  readonly stickerset?: root_s$.TypeStickerSet
  readonly available_min_id?: number
  readonly folder_id?: number
  readonly linked_chat_id?: bigint
  readonly location?: TypeChannelLocation
  readonly slowmode_seconds?: number
  readonly slowmode_next_send_date?: number
  readonly stats_dc?: number
  readonly pts: number
  readonly call?: root_i$.TypeInputGroupCall
  readonly ttl_period?: number
  readonly pending_suggestions?: readonly string[]
  readonly groupcall_default_join_as?: root_p$.TypePeer
  readonly theme_emoticon?: string
  readonly requests_pending?: number
  readonly recent_requesters?: readonly bigint[]
  readonly default_send_as?: root_p$.TypePeer
  readonly available_reactions?: TypeChatReactions
  readonly reactions_limit?: number
  readonly stories?: root_p$.TypePeerStories
  readonly wallpaper?: root_w$.TypeWallPaper
  readonly boosts_applied?: number
  readonly boosts_unrestrict?: number
  readonly emojiset?: root_s$.TypeStickerSet
  readonly bot_verification?: root_b$.TypeBotVerification
  readonly stargifts_count?: number
  readonly send_paid_messages_stars?: bigint
  readonly main_tab?: root_p$.TypeProfileTab
  readonly guard_bot_id?: bigint
}

/** `channelLocation#209b82db` */
export interface ChannelLocation {
  readonly _: 'channelLocation'
  readonly geo_point: root_g$.TypeGeoPoint
  readonly address: string
}

/** `channelLocationEmpty#bfb5ad8b` */
export interface ChannelLocationEmpty {
  readonly _: 'channelLocationEmpty'
}

/** `channelMessagesFilter#cd77d957` */
export interface ChannelMessagesFilter {
  readonly _: 'channelMessagesFilter'
  readonly exclude_new_messages?: true
  readonly ranges: readonly root_m$.TypeMessageRange[]
}

/** `channelMessagesFilterEmpty#94d42ee7` */
export interface ChannelMessagesFilterEmpty {
  readonly _: 'channelMessagesFilterEmpty'
}

/** `channelParticipant#1bd54456` */
export interface ChannelParticipant {
  readonly _: 'channelParticipant'
  readonly user_id: bigint
  readonly date: number
  readonly subscription_until_date?: number
  readonly rank?: string
}

/** `channelParticipantAdmin#34c3bb53` */
export interface ChannelParticipantAdmin {
  readonly _: 'channelParticipantAdmin'
  readonly can_edit?: true
  readonly self?: true
  readonly user_id: bigint
  readonly inviter_id?: bigint
  readonly promoted_by: bigint
  readonly date: number
  readonly admin_rights: TypeChatAdminRights
  readonly rank?: string
}

/** `channelParticipantBanned#d5f0ad91` */
export interface ChannelParticipantBanned {
  readonly _: 'channelParticipantBanned'
  readonly left?: true
  readonly peer: root_p$.TypePeer
  readonly kicked_by: bigint
  readonly date: number
  readonly banned_rights: TypeChatBannedRights
  readonly rank?: string
}

/** `channelParticipantCreator#2fe601d3` */
export interface ChannelParticipantCreator {
  readonly _: 'channelParticipantCreator'
  readonly user_id: bigint
  readonly admin_rights: TypeChatAdminRights
  readonly rank?: string
}

/** `channelParticipantLeft#1b03f006` */
export interface ChannelParticipantLeft {
  readonly _: 'channelParticipantLeft'
  readonly peer: root_p$.TypePeer
}

/** `channelParticipantSelf#a9478a1a` */
export interface ChannelParticipantSelf {
  readonly _: 'channelParticipantSelf'
  readonly via_request?: true
  readonly user_id: bigint
  readonly inviter_id: bigint
  readonly date: number
  readonly subscription_until_date?: number
  readonly rank?: string
}

/** `channelParticipantsAdmins#b4608969` */
export interface ChannelParticipantsAdmins {
  readonly _: 'channelParticipantsAdmins'
}

/** `channelParticipantsBanned#1427a5e1` */
export interface ChannelParticipantsBanned {
  readonly _: 'channelParticipantsBanned'
  readonly q: string
}

/** `channelParticipantsBots#b0d1865b` */
export interface ChannelParticipantsBots {
  readonly _: 'channelParticipantsBots'
}

/** `channelParticipantsContacts#bb6ae88d` */
export interface ChannelParticipantsContacts {
  readonly _: 'channelParticipantsContacts'
  readonly q: string
}

/** `channelParticipantsKicked#a3b54985` */
export interface ChannelParticipantsKicked {
  readonly _: 'channelParticipantsKicked'
  readonly q: string
}

/** `channelParticipantsMentions#e04b5ceb` */
export interface ChannelParticipantsMentions {
  readonly _: 'channelParticipantsMentions'
  readonly q?: string
  readonly top_msg_id?: number
}

/** `channelParticipantsRecent#de3f3c79` */
export interface ChannelParticipantsRecent {
  readonly _: 'channelParticipantsRecent'
}

/** `channelParticipantsSearch#0656ac4b` */
export interface ChannelParticipantsSearch {
  readonly _: 'channelParticipantsSearch'
  readonly q: string
}

/** `chat#41cbf256` */
export interface Chat {
  readonly _: 'chat'
  readonly creator?: true
  readonly left?: true
  readonly deactivated?: true
  readonly call_active?: true
  readonly call_not_empty?: true
  readonly noforwards?: true
  readonly id: bigint
  readonly title: string
  readonly photo: TypeChatPhoto
  readonly participants_count: number
  readonly date: number
  readonly version: number
  readonly migrated_to?: root_i$.TypeInputChannel
  readonly admin_rights?: TypeChatAdminRights
  readonly default_banned_rights?: TypeChatBannedRights
}

/** `chatAdminRights#5fb224d5` */
export interface ChatAdminRights {
  readonly _: 'chatAdminRights'
  readonly change_info?: true
  readonly post_messages?: true
  readonly edit_messages?: true
  readonly delete_messages?: true
  readonly ban_users?: true
  readonly invite_users?: true
  readonly pin_messages?: true
  readonly add_admins?: true
  readonly anonymous?: true
  readonly manage_call?: true
  readonly other?: true
  readonly manage_topics?: true
  readonly post_stories?: true
  readonly edit_stories?: true
  readonly delete_stories?: true
  readonly manage_direct_messages?: true
  readonly manage_ranks?: true
  readonly manage_linked_peers?: true
  readonly manage_welcome_messages?: true
}

/** `chatAdminWithInvites#f2ecef23` */
export interface ChatAdminWithInvites {
  readonly _: 'chatAdminWithInvites'
  readonly admin_id: bigint
  readonly invites_count: number
  readonly revoked_invites_count: number
}

/** `chatBannedRights#9f120418` */
export interface ChatBannedRights {
  readonly _: 'chatBannedRights'
  readonly view_messages?: true
  readonly send_messages?: true
  readonly send_media?: true
  readonly send_stickers?: true
  readonly send_gifs?: true
  readonly send_games?: true
  readonly send_inline?: true
  readonly embed_links?: true
  readonly send_polls?: true
  readonly change_info?: true
  readonly invite_users?: true
  readonly pin_messages?: true
  readonly manage_topics?: true
  readonly send_photos?: true
  readonly send_videos?: true
  readonly send_roundvideos?: true
  readonly send_audios?: true
  readonly send_voices?: true
  readonly send_docs?: true
  readonly send_plain?: true
  readonly edit_rank?: true
  readonly send_reactions?: true
  readonly manage_linked_peers?: true
  readonly until_date: number
}

/** `chatEmpty#29562865` */
export interface ChatEmpty {
  readonly _: 'chatEmpty'
  readonly id: bigint
}

/** `chatForbidden#6592a1a7` */
export interface ChatForbidden {
  readonly _: 'chatForbidden'
  readonly id: bigint
  readonly title: string
}

/** `chatFull#2633421b` */
export interface ChatFull {
  readonly _: 'chatFull'
  readonly can_set_username?: true
  readonly has_scheduled?: true
  readonly translations_disabled?: true
  readonly has_welcome_messages?: true
  readonly id: bigint
  readonly about: string
  readonly participants: TypeChatParticipants
  readonly chat_photo?: root_p$.TypePhoto
  readonly notify_settings: root_p$.TypePeerNotifySettings
  readonly exported_invite?: root_e$.TypeExportedChatInvite
  readonly bot_info?: readonly root_b$.TypeBotInfo[]
  readonly pinned_msg_id?: number
  readonly folder_id?: number
  readonly call?: root_i$.TypeInputGroupCall
  readonly ttl_period?: number
  readonly groupcall_default_join_as?: root_p$.TypePeer
  readonly theme_emoticon?: string
  readonly requests_pending?: number
  readonly recent_requesters?: readonly bigint[]
  readonly available_reactions?: TypeChatReactions
  readonly reactions_limit?: number
}

/** `chatInvite#5c9d3702` */
export interface ChatInvite {
  readonly _: 'chatInvite'
  readonly channel?: true
  readonly broadcast?: true
  readonly public?: true
  readonly megagroup?: true
  readonly request_needed?: true
  readonly verified?: true
  readonly scam?: true
  readonly fake?: true
  readonly can_refulfill_subscription?: true
  readonly title: string
  readonly about?: string
  readonly photo: root_p$.TypePhoto
  readonly participants_count: number
  readonly participants?: readonly root_u$.TypeUser[]
  readonly color: number
  readonly subscription_pricing?: root_s$.TypeStarsSubscriptionPricing
  readonly subscription_form_id?: bigint
  readonly bot_verification?: root_b$.TypeBotVerification
}

/** `chatInviteAlready#5a686d7c` */
export interface ChatInviteAlready {
  readonly _: 'chatInviteAlready'
  readonly chat: TypeChat
}

/** `chatInviteExported#a22cbd96` */
export interface ChatInviteExported {
  readonly _: 'chatInviteExported'
  readonly revoked?: true
  readonly permanent?: true
  readonly request_needed?: true
  readonly link: string
  readonly admin_id: bigint
  readonly date: number
  readonly start_date?: number
  readonly expire_date?: number
  readonly usage_limit?: number
  readonly usage?: number
  readonly requested?: number
  readonly subscription_expired?: number
  readonly title?: string
  readonly subscription_pricing?: root_s$.TypeStarsSubscriptionPricing
}

/** `chatInviteImporter#8c5adfd9` */
export interface ChatInviteImporter {
  readonly _: 'chatInviteImporter'
  readonly requested?: true
  readonly via_chatlist?: true
  readonly user_id: bigint
  readonly date: number
  readonly about?: string
  readonly approved_by?: bigint
}

/** `chatInvitePeek#61695cb0` */
export interface ChatInvitePeek {
  readonly _: 'chatInvitePeek'
  readonly chat: TypeChat
  readonly expires: number
}

/** `chatInvitePublicJoinRequests#ed107ab7` */
export interface ChatInvitePublicJoinRequests {
  readonly _: 'chatInvitePublicJoinRequests'
}

/** `chatOnlines#f041e250` */
export interface ChatOnlines {
  readonly _: 'chatOnlines'
  readonly onlines: number
}

/** `chatParticipant#38e79fde` */
export interface ChatParticipant {
  readonly _: 'chatParticipant'
  readonly user_id: bigint
  readonly inviter_id: bigint
  readonly date: number
  readonly rank?: string
}

/** `chatParticipantAdmin#0360d5d2` */
export interface ChatParticipantAdmin {
  readonly _: 'chatParticipantAdmin'
  readonly user_id: bigint
  readonly inviter_id: bigint
  readonly date: number
  readonly rank?: string
}

/** `chatParticipantCreator#e1f867b8` */
export interface ChatParticipantCreator {
  readonly _: 'chatParticipantCreator'
  readonly user_id: bigint
  readonly rank?: string
}

/** `chatParticipants#3cbc93f8` */
export interface ChatParticipants {
  readonly _: 'chatParticipants'
  readonly chat_id: bigint
  readonly participants: readonly TypeChatParticipant[]
  readonly version: number
}

/** `chatParticipantsForbidden#8763d3e1` */
export interface ChatParticipantsForbidden {
  readonly _: 'chatParticipantsForbidden'
  readonly chat_id: bigint
  readonly self_participant?: TypeChatParticipant
}

/** `chatPhoto#1c6e1c11` */
export interface ChatPhoto {
  readonly _: 'chatPhoto'
  readonly has_video?: true
  readonly photo_id: bigint
  readonly stripped_thumb?: Uint8Array
  readonly dc_id: number
}

/** `chatPhotoEmpty#37c1011c` */
export interface ChatPhotoEmpty {
  readonly _: 'chatPhotoEmpty'
}

/** `chatReactionsAll#52928bca` */
export interface ChatReactionsAll {
  readonly _: 'chatReactionsAll'
  readonly allow_custom?: true
}

/** `chatReactionsNone#eafc32bc` */
export interface ChatReactionsNone {
  readonly _: 'chatReactionsNone'
}

/** `chatReactionsSome#661d4037` */
export interface ChatReactionsSome {
  readonly _: 'chatReactionsSome'
  readonly reactions: readonly root_r$.TypeReaction[]
}

/** `chatTheme#c3dffc04` */
export interface ChatTheme {
  readonly _: 'chatTheme'
  readonly emoticon: string
}

/** `chatThemeUniqueGift#3458f9c8` */
export interface ChatThemeUniqueGift {
  readonly _: 'chatThemeUniqueGift'
  readonly gift: root_s$.TypeStarGift
  readonly theme_settings: readonly root_t$.TypeThemeSettings[]
}

/** `codeSettings#ad253d78` */
export interface CodeSettings {
  readonly _: 'codeSettings'
  readonly allow_flashcall?: true
  readonly current_number?: true
  readonly allow_app_hash?: true
  readonly allow_missed_call?: true
  readonly allow_firebase?: true
  readonly unknown_number?: true
  readonly logout_tokens?: readonly Uint8Array[]
  readonly token?: string
  readonly app_sandbox?: boolean
}

/** `community#65efe954` */
export interface Community {
  readonly _: 'community'
  readonly creator?: true
  readonly left?: true
  readonly min?: true
  readonly collapsed_in_dialogs?: true
  readonly id: bigint
  readonly access_hash?: bigint
  readonly title: string
  readonly photo: TypeChatPhoto
  readonly date: number
  readonly admin_rights?: TypeChatAdminRights
  readonly default_banned_rights?: TypeChatBannedRights
}

/** `communityForbidden#fd3cdab8` */
export interface CommunityForbidden {
  readonly _: 'communityForbidden'
  readonly id: bigint
  readonly access_hash?: bigint
  readonly title: string
}

/** `communityFull#cbb7a507` */
export interface CommunityFull {
  readonly _: 'communityFull'
  readonly id: bigint
  readonly about: string
  readonly chat_photo: root_p$.TypePhoto
  readonly linked_peers: readonly TypeCommunityPeer[]
  readonly admins_count?: number
  readonly kicked_count?: number
  readonly peer_link_requests_pending?: number
}

/** `communityPeer#76141ebd` */
export interface CommunityPeer {
  readonly _: 'communityPeer'
  readonly can_view_history?: true
  readonly visible?: boolean
  readonly peer: root_p$.TypePeer
}

/** `communityPeerRequest#7beafa85` */
export interface CommunityPeerRequest {
  readonly _: 'communityPeerRequest'
  readonly visible?: true
  readonly peer: root_p$.TypePeer
  readonly requested_by: bigint
  readonly date: number
}

/** `config#cc1a241e` */
export interface Config {
  readonly _: 'config'
  readonly default_p2p_contacts?: true
  readonly preload_featured_stickers?: true
  readonly revoke_pm_inbox?: true
  readonly blocked_mode?: true
  readonly force_try_ipv6?: true
  readonly date: number
  readonly expires: number
  readonly test_mode: boolean
  readonly this_dc: number
  readonly dc_options: readonly root_d$.TypeDcOption[]
  readonly dc_txt_domain_name: string
  readonly chat_size_max: number
  readonly megagroup_size_max: number
  readonly forwarded_count_max: number
  readonly online_update_period_ms: number
  readonly offline_blur_timeout_ms: number
  readonly offline_idle_timeout_ms: number
  readonly online_cloud_timeout_ms: number
  readonly notify_cloud_delay_ms: number
  readonly notify_default_delay_ms: number
  readonly push_chat_period_ms: number
  readonly push_chat_limit: number
  readonly edit_time_limit: number
  readonly revoke_time_limit: number
  readonly revoke_pm_time_limit: number
  readonly rating_e_decay: number
  readonly stickers_recent_limit: number
  readonly channels_read_media_period: number
  readonly tmp_sessions?: number
  readonly call_receive_timeout_ms: number
  readonly call_ring_timeout_ms: number
  readonly call_connect_timeout_ms: number
  readonly call_packet_timeout_ms: number
  readonly me_url_prefix: string
  readonly autoupdate_url_prefix?: string
  readonly gif_search_username?: string
  readonly venue_search_username?: string
  readonly img_search_username?: string
  readonly static_maps_provider?: string
  readonly caption_length_max: number
  readonly message_length_max: number
  readonly webfile_dc_id: number
  readonly suggested_lang_code?: string
  readonly lang_pack_version?: number
  readonly base_lang_pack_version?: number
  readonly reactions_default?: root_r$.TypeReaction
  readonly autologin_token?: string
}

/** `connectedBot#033ed001` */
export interface ConnectedBot {
  readonly _: 'connectedBot'
  readonly bot_id: bigint
  readonly recipients: root_b$.TypeBusinessBotRecipients
  readonly rights: root_b$.TypeBusinessBotRights
  readonly device?: string
  readonly date?: number
  readonly location?: string
}

/** `connectedBotStarRef#19a13f71` */
export interface ConnectedBotStarRef {
  readonly _: 'connectedBotStarRef'
  readonly revoked?: true
  readonly url: string
  readonly date: number
  readonly bot_id: bigint
  readonly commission_permille: number
  readonly duration_months?: number
  readonly participants: bigint
  readonly revenue: bigint
}

/** `contact#145ade0b` */
export interface Contact {
  readonly _: 'contact'
  readonly user_id: bigint
  readonly mutual: boolean
}

/** `contactBirthday#1d998733` */
export interface ContactBirthday {
  readonly _: 'contactBirthday'
  readonly contact_id: bigint
  readonly birthday: root_b$.TypeBirthday
}

/** `contactStatus#16d9703b` */
export interface ContactStatus {
  readonly _: 'contactStatus'
  readonly user_id: bigint
  readonly status: root_u$.TypeUserStatus
}

/** Any `CdnConfig`. */
export type TypeCdnConfig =
  | CdnConfig

/** Any `CdnPublicKey`. */
export type TypeCdnPublicKey =
  | CdnPublicKey

/** Any `ChannelAdminLogEvent`. */
export type TypeChannelAdminLogEvent =
  | ChannelAdminLogEvent

/** Any `ChannelAdminLogEventAction`. */
export type TypeChannelAdminLogEventAction =
  | ChannelAdminLogEventActionChangeAbout
  | ChannelAdminLogEventActionChangeAvailableReactions
  | ChannelAdminLogEventActionChangeEmojiStatus
  | ChannelAdminLogEventActionChangeEmojiStickerSet
  | ChannelAdminLogEventActionChangeHistoryTTL
  | ChannelAdminLogEventActionChangeLinkedChat
  | ChannelAdminLogEventActionChangeLocation
  | ChannelAdminLogEventActionChangePeerColor
  | ChannelAdminLogEventActionChangePhoto
  | ChannelAdminLogEventActionChangeProfilePeerColor
  | ChannelAdminLogEventActionChangeStickerSet
  | ChannelAdminLogEventActionChangeTitle
  | ChannelAdminLogEventActionChangeUsername
  | ChannelAdminLogEventActionChangeUsernames
  | ChannelAdminLogEventActionChangeWallpaper
  | ChannelAdminLogEventActionCreateTopic
  | ChannelAdminLogEventActionDefaultBannedRights
  | ChannelAdminLogEventActionDeleteMessage
  | ChannelAdminLogEventActionDeleteTopic
  | ChannelAdminLogEventActionDiscardGroupCall
  | ChannelAdminLogEventActionEditMessage
  | ChannelAdminLogEventActionEditTopic
  | ChannelAdminLogEventActionExportedInviteDelete
  | ChannelAdminLogEventActionExportedInviteEdit
  | ChannelAdminLogEventActionExportedInviteRevoke
  | ChannelAdminLogEventActionParticipantEditRank
  | ChannelAdminLogEventActionParticipantInvite
  | ChannelAdminLogEventActionParticipantJoin
  | ChannelAdminLogEventActionParticipantJoinByInvite
  | ChannelAdminLogEventActionParticipantJoinByRequest
  | ChannelAdminLogEventActionParticipantLeave
  | ChannelAdminLogEventActionParticipantMute
  | ChannelAdminLogEventActionParticipantSubExtend
  | ChannelAdminLogEventActionParticipantToggleAdmin
  | ChannelAdminLogEventActionParticipantToggleBan
  | ChannelAdminLogEventActionParticipantUnmute
  | ChannelAdminLogEventActionParticipantVolume
  | ChannelAdminLogEventActionPinTopic
  | ChannelAdminLogEventActionSendMessage
  | ChannelAdminLogEventActionStartGroupCall
  | ChannelAdminLogEventActionStopPoll
  | ChannelAdminLogEventActionToggleAntiSpam
  | ChannelAdminLogEventActionToggleAutotranslation
  | ChannelAdminLogEventActionToggleForum
  | ChannelAdminLogEventActionToggleGroupCallSetting
  | ChannelAdminLogEventActionToggleInvites
  | ChannelAdminLogEventActionToggleNoForwards
  | ChannelAdminLogEventActionTogglePreHistoryHidden
  | ChannelAdminLogEventActionToggleSignatureProfiles
  | ChannelAdminLogEventActionToggleSignatures
  | ChannelAdminLogEventActionToggleSlowMode
  | ChannelAdminLogEventActionUpdatePinned

/** Any `ChannelAdminLogEventsFilter`. */
export type TypeChannelAdminLogEventsFilter =
  | ChannelAdminLogEventsFilter

/** Any `ChannelLocation`. */
export type TypeChannelLocation =
  | ChannelLocation
  | ChannelLocationEmpty

/** Any `ChannelMessagesFilter`. */
export type TypeChannelMessagesFilter =
  | ChannelMessagesFilter
  | ChannelMessagesFilterEmpty

/** Any `ChannelParticipant`. */
export type TypeChannelParticipant =
  | ChannelParticipant
  | ChannelParticipantAdmin
  | ChannelParticipantBanned
  | ChannelParticipantCreator
  | ChannelParticipantLeft
  | ChannelParticipantSelf

/** Any `ChannelParticipantsFilter`. */
export type TypeChannelParticipantsFilter =
  | ChannelParticipantsAdmins
  | ChannelParticipantsBanned
  | ChannelParticipantsBots
  | ChannelParticipantsContacts
  | ChannelParticipantsKicked
  | ChannelParticipantsMentions
  | ChannelParticipantsRecent
  | ChannelParticipantsSearch

/** Any `Chat`. */
export type TypeChat =
  | Channel
  | ChannelForbidden
  | Chat
  | ChatEmpty
  | ChatForbidden
  | Community
  | CommunityForbidden

/** Any `ChatAdminRights`. */
export type TypeChatAdminRights =
  | ChatAdminRights

/** Any `ChatAdminWithInvites`. */
export type TypeChatAdminWithInvites =
  | ChatAdminWithInvites

/** Any `ChatBannedRights`. */
export type TypeChatBannedRights =
  | ChatBannedRights

/** Any `ChatFull`. */
export type TypeChatFull =
  | ChannelFull
  | ChatFull
  | CommunityFull

/** Any `ChatInvite`. */
export type TypeChatInvite =
  | ChatInvite
  | ChatInviteAlready
  | ChatInvitePeek

/** Any `ChatInviteImporter`. */
export type TypeChatInviteImporter =
  | ChatInviteImporter

/** Any `ChatOnlines`. */
export type TypeChatOnlines =
  | ChatOnlines

/** Any `ChatParticipant`. */
export type TypeChatParticipant =
  | ChatParticipant
  | ChatParticipantAdmin
  | ChatParticipantCreator

/** Any `ChatParticipants`. */
export type TypeChatParticipants =
  | ChatParticipants
  | ChatParticipantsForbidden

/** Any `ChatPhoto`. */
export type TypeChatPhoto =
  | ChatPhoto
  | ChatPhotoEmpty

/** Any `ChatReactions`. */
export type TypeChatReactions =
  | ChatReactionsAll
  | ChatReactionsNone
  | ChatReactionsSome

/** Any `ChatTheme`. */
export type TypeChatTheme =
  | ChatTheme
  | ChatThemeUniqueGift

/** Any `CodeSettings`. */
export type TypeCodeSettings =
  | CodeSettings

/** Any `CommunityPeer`. */
export type TypeCommunityPeer =
  | CommunityPeer

/** Any `CommunityPeerRequest`. */
export type TypeCommunityPeerRequest =
  | CommunityPeerRequest

/** Any `Config`. */
export type TypeConfig =
  | Config

/** Any `ConnectedBot`. */
export type TypeConnectedBot =
  | ConnectedBot

/** Any `ConnectedBotStarRef`. */
export type TypeConnectedBotStarRef =
  | ConnectedBotStarRef

/** Any `Contact`. */
export type TypeContact =
  | Contact

/** Any `ContactBirthday`. */
export type TypeContactBirthday =
  | ContactBirthday

/** Any `ContactStatus`. */
export type TypeContactStatus =
  | ContactStatus
