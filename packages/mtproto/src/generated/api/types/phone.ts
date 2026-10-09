// GENERATED FILE — do not edit.
// TL types for phone
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_g$ from './root/g.js'
import type * as root_i$ from './root/i.js'
import type * as root_p$ from './root/p.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `phone.acceptCall#3bd2b4a0` */
export interface AcceptCall {
  readonly _: 'phone.acceptCall'
  readonly peer: root_i$.TypeInputPhoneCall
  readonly g_b: Uint8Array
  readonly protocol: root_p$.TypePhoneCallProtocol
}

/** `phone.checkGroupCall#b59cf977` */
export interface CheckGroupCall {
  readonly _: 'phone.checkGroupCall'
  readonly call: root_i$.TypeInputGroupCall
  readonly sources: readonly number[]
}

/** `phone.confirmCall#2efe1722` */
export interface ConfirmCall {
  readonly _: 'phone.confirmCall'
  readonly peer: root_i$.TypeInputPhoneCall
  readonly g_a: Uint8Array
  readonly key_fingerprint: bigint
  readonly protocol: root_p$.TypePhoneCallProtocol
}

/** `phone.createConferenceCall#7d0444bb` */
export interface CreateConferenceCall {
  readonly _: 'phone.createConferenceCall'
  readonly muted?: true
  readonly video_stopped?: true
  readonly join?: true
  readonly random_id: number
  readonly public_key?: Uint8Array
  readonly block?: Uint8Array
  readonly params?: root_d$.TypeDataJSON
}

/** `phone.createGroupCall#48cdc6d8` */
export interface CreateGroupCall {
  readonly _: 'phone.createGroupCall'
  readonly rtmp_stream?: true
  readonly peer: root_i$.TypeInputPeer
  readonly random_id: number
  readonly title?: string
  readonly schedule_date?: number
}

/** `phone.declineConferenceCallInvite#3c479971` */
export interface DeclineConferenceCallInvite {
  readonly _: 'phone.declineConferenceCallInvite'
  readonly msg_id: number
}

/** `phone.deleteConferenceCallParticipants#8ca60525` */
export interface DeleteConferenceCallParticipants {
  readonly _: 'phone.deleteConferenceCallParticipants'
  readonly only_left?: true
  readonly kick?: true
  readonly call: root_i$.TypeInputGroupCall
  readonly ids: readonly bigint[]
  readonly block: Uint8Array
}

/** `phone.deleteGroupCallMessages#f64f54f7` */
export interface DeleteGroupCallMessages {
  readonly _: 'phone.deleteGroupCallMessages'
  readonly report_spam?: true
  readonly call: root_i$.TypeInputGroupCall
  readonly messages: readonly number[]
}

/** `phone.deleteGroupCallParticipantMessages#1dbfeca0` */
export interface DeleteGroupCallParticipantMessages {
  readonly _: 'phone.deleteGroupCallParticipantMessages'
  readonly report_spam?: true
  readonly call: root_i$.TypeInputGroupCall
  readonly participant: root_i$.TypeInputPeer
}

/** `phone.discardCall#b2cbc1c0` */
export interface DiscardCall {
  readonly _: 'phone.discardCall'
  readonly video?: true
  readonly peer: root_i$.TypeInputPhoneCall
  readonly duration: number
  readonly reason: root_p$.TypePhoneCallDiscardReason
  readonly connection_id: bigint
}

/** `phone.discardGroupCall#7a777135` */
export interface DiscardGroupCall {
  readonly _: 'phone.discardGroupCall'
  readonly call: root_i$.TypeInputGroupCall
}

/** `phone.editGroupCallParticipant#a5273abf` */
export interface EditGroupCallParticipant {
  readonly _: 'phone.editGroupCallParticipant'
  readonly call: root_i$.TypeInputGroupCall
  readonly participant: root_i$.TypeInputPeer
  readonly muted?: boolean
  readonly volume?: number
  readonly raise_hand?: boolean
  readonly video_stopped?: boolean
  readonly video_paused?: boolean
  readonly presentation_paused?: boolean
}

/** `phone.editGroupCallTitle#1ca6ac0a` */
export interface EditGroupCallTitle {
  readonly _: 'phone.editGroupCallTitle'
  readonly call: root_i$.TypeInputGroupCall
  readonly title: string
}

/** `phone.exportGroupCallInvite#e6aa647f` */
export interface ExportGroupCallInvite {
  readonly _: 'phone.exportGroupCallInvite'
  readonly can_self_unmute?: true
  readonly call: root_i$.TypeInputGroupCall
}

/** `phone.exportedGroupCallInvite#204bd158` */
export interface ExportedGroupCallInvite {
  readonly _: 'phone.exportedGroupCallInvite'
  readonly link: string
}

/** `phone.getCallConfig#55451fa9` */
export interface GetCallConfig {
  readonly _: 'phone.getCallConfig'
}

/** `phone.getGroupCall#041845db` */
export interface GetGroupCall {
  readonly _: 'phone.getGroupCall'
  readonly call: root_i$.TypeInputGroupCall
  readonly limit: number
}

/** `phone.getGroupCallChainBlocks#ee9f88a6` */
export interface GetGroupCallChainBlocks {
  readonly _: 'phone.getGroupCallChainBlocks'
  readonly call: root_i$.TypeInputGroupCall
  readonly sub_chain_id: number
  readonly offset: number
  readonly limit: number
}

/** `phone.getGroupCallJoinAs#ef7c213a` */
export interface GetGroupCallJoinAs {
  readonly _: 'phone.getGroupCallJoinAs'
  readonly peer: root_i$.TypeInputPeer
}

/** `phone.getGroupCallStars#6f636302` */
export interface GetGroupCallStars {
  readonly _: 'phone.getGroupCallStars'
  readonly call: root_i$.TypeInputGroupCall
}

/** `phone.getGroupCallStreamChannels#1ab21940` */
export interface GetGroupCallStreamChannels {
  readonly _: 'phone.getGroupCallStreamChannels'
  readonly call: root_i$.TypeInputGroupCall
}

/** `phone.getGroupCallStreamRtmpUrl#5af4c73a` */
export interface GetGroupCallStreamRtmpUrl {
  readonly _: 'phone.getGroupCallStreamRtmpUrl'
  readonly live_story?: true
  readonly peer: root_i$.TypeInputPeer
  readonly revoke: boolean
}

/** `phone.getGroupParticipants#c558d8ab` */
export interface GetGroupParticipants {
  readonly _: 'phone.getGroupParticipants'
  readonly call: root_i$.TypeInputGroupCall
  readonly ids: readonly root_i$.TypeInputPeer[]
  readonly sources: readonly number[]
  readonly offset: string
  readonly limit: number
}

/** `phone.groupCall#9e727aad` */
export interface GroupCall {
  readonly _: 'phone.groupCall'
  readonly call: root_g$.TypeGroupCall
  readonly participants: readonly root_g$.TypeGroupCallParticipant[]
  readonly participants_next_offset: string
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `phone.groupCallStars#9d1dbd26` */
export interface GroupCallStars {
  readonly _: 'phone.groupCallStars'
  readonly total_stars: bigint
  readonly top_donors: readonly root_g$.TypeGroupCallDonor[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `phone.groupCallStreamChannels#d0e482b2` */
export interface GroupCallStreamChannels {
  readonly _: 'phone.groupCallStreamChannels'
  readonly channels: readonly root_g$.TypeGroupCallStreamChannel[]
}

/** `phone.groupCallStreamRtmpUrl#2dbf3432` */
export interface GroupCallStreamRtmpUrl {
  readonly _: 'phone.groupCallStreamRtmpUrl'
  readonly url: string
  readonly key: string
}

/** `phone.groupParticipants#f47751b6` */
export interface GroupParticipants {
  readonly _: 'phone.groupParticipants'
  readonly count: number
  readonly participants: readonly root_g$.TypeGroupCallParticipant[]
  readonly next_offset: string
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly version: number
}

/** `phone.inviteConferenceCallParticipant#bcf22685` */
export interface InviteConferenceCallParticipant {
  readonly _: 'phone.inviteConferenceCallParticipant'
  readonly video?: true
  readonly call: root_i$.TypeInputGroupCall
  readonly user_id: root_i$.TypeInputUser
}

/** `phone.inviteToGroupCall#7b393160` */
export interface InviteToGroupCall {
  readonly _: 'phone.inviteToGroupCall'
  readonly call: root_i$.TypeInputGroupCall
  readonly users: readonly root_i$.TypeInputUser[]
}

/** `phone.joinAsPeers#afe5623f` */
export interface JoinAsPeers {
  readonly _: 'phone.joinAsPeers'
  readonly peers: readonly root_p$.TypePeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `phone.joinGroupCall#8fb53057` */
export interface JoinGroupCall {
  readonly _: 'phone.joinGroupCall'
  readonly muted?: true
  readonly video_stopped?: true
  readonly call: root_i$.TypeInputGroupCall
  readonly join_as: root_i$.TypeInputPeer
  readonly invite_hash?: string
  readonly public_key?: Uint8Array
  readonly block?: Uint8Array
  readonly params: root_d$.TypeDataJSON
}

/** `phone.joinGroupCallPresentation#cbea6bc4` */
export interface JoinGroupCallPresentation {
  readonly _: 'phone.joinGroupCallPresentation'
  readonly call: root_i$.TypeInputGroupCall
  readonly params: root_d$.TypeDataJSON
}

/** `phone.leaveGroupCall#500377f9` */
export interface LeaveGroupCall {
  readonly _: 'phone.leaveGroupCall'
  readonly call: root_i$.TypeInputGroupCall
  readonly source: number
}

/** `phone.leaveGroupCallPresentation#1c50d144` */
export interface LeaveGroupCallPresentation {
  readonly _: 'phone.leaveGroupCallPresentation'
  readonly call: root_i$.TypeInputGroupCall
}

/** `phone.phoneCall#ec82e140` */
export interface PhoneCall {
  readonly _: 'phone.phoneCall'
  readonly phone_call: root_p$.TypePhoneCall
  readonly users: readonly root_u$.TypeUser[]
}

/** `phone.receivedCall#17d54f61` */
export interface ReceivedCall {
  readonly _: 'phone.receivedCall'
  readonly peer: root_i$.TypeInputPhoneCall
}

/** `phone.requestCall#42ff96ed` */
export interface RequestCall {
  readonly _: 'phone.requestCall'
  readonly video?: true
  readonly user_id: root_i$.TypeInputUser
  readonly random_id: number
  readonly g_a_hash: Uint8Array
  readonly protocol: root_p$.TypePhoneCallProtocol
}

/** `phone.saveCallDebug#277add7e` */
export interface SaveCallDebug {
  readonly _: 'phone.saveCallDebug'
  readonly peer: root_i$.TypeInputPhoneCall
  readonly debug: root_d$.TypeDataJSON
}

/** `phone.saveCallLog#41248786` */
export interface SaveCallLog {
  readonly _: 'phone.saveCallLog'
  readonly peer: root_i$.TypeInputPhoneCall
  readonly file: root_i$.TypeInputFile
}

/** `phone.saveDefaultGroupCallJoinAs#575e1f8c` */
export interface SaveDefaultGroupCallJoinAs {
  readonly _: 'phone.saveDefaultGroupCallJoinAs'
  readonly peer: root_i$.TypeInputPeer
  readonly join_as: root_i$.TypeInputPeer
}

/** `phone.saveDefaultSendAs#4167add1` */
export interface SaveDefaultSendAs {
  readonly _: 'phone.saveDefaultSendAs'
  readonly call: root_i$.TypeInputGroupCall
  readonly send_as: root_i$.TypeInputPeer
}

/** `phone.sendConferenceCallBroadcast#c6701900` */
export interface SendConferenceCallBroadcast {
  readonly _: 'phone.sendConferenceCallBroadcast'
  readonly call: root_i$.TypeInputGroupCall
  readonly block: Uint8Array
}

/** `phone.sendGroupCallEncryptedMessage#e5afa56d` */
export interface SendGroupCallEncryptedMessage {
  readonly _: 'phone.sendGroupCallEncryptedMessage'
  readonly call: root_i$.TypeInputGroupCall
  readonly encrypted_message: Uint8Array
}

/** `phone.sendGroupCallMessage#b1d11410` */
export interface SendGroupCallMessage {
  readonly _: 'phone.sendGroupCallMessage'
  readonly call: root_i$.TypeInputGroupCall
  readonly random_id: bigint
  readonly message: root_t$.TypeTextWithEntities
  readonly allow_paid_stars?: bigint
  readonly send_as?: root_i$.TypeInputPeer
}

/** `phone.sendSignalingData#ff7a9383` */
export interface SendSignalingData {
  readonly _: 'phone.sendSignalingData'
  readonly peer: root_i$.TypeInputPhoneCall
  readonly data: Uint8Array
}

/** `phone.setCallRating#59ead627` */
export interface SetCallRating {
  readonly _: 'phone.setCallRating'
  readonly user_initiative?: true
  readonly peer: root_i$.TypeInputPhoneCall
  readonly rating: number
  readonly comment: string
}

/** `phone.startScheduledGroupCall#5680e342` */
export interface StartScheduledGroupCall {
  readonly _: 'phone.startScheduledGroupCall'
  readonly call: root_i$.TypeInputGroupCall
}

/** `phone.toggleGroupCallRecord#f128c708` */
export interface ToggleGroupCallRecord {
  readonly _: 'phone.toggleGroupCallRecord'
  readonly start?: true
  readonly video?: true
  readonly call: root_i$.TypeInputGroupCall
  readonly title?: string
  readonly video_portrait?: boolean
}

/** `phone.toggleGroupCallSettings#974392f2` */
export interface ToggleGroupCallSettings {
  readonly _: 'phone.toggleGroupCallSettings'
  readonly reset_invite_hash?: true
  readonly call: root_i$.TypeInputGroupCall
  readonly join_muted?: boolean
  readonly messages_enabled?: boolean
  readonly send_paid_messages_stars?: bigint
}

/** `phone.toggleGroupCallStartSubscription#219c34e6` */
export interface ToggleGroupCallStartSubscription {
  readonly _: 'phone.toggleGroupCallStartSubscription'
  readonly call: root_i$.TypeInputGroupCall
  readonly subscribed: boolean
}

/** Any `phone.ExportedGroupCallInvite`. */
export type TypeExportedGroupCallInvite =
  | ExportedGroupCallInvite

/** Any `phone.GroupCall`. */
export type TypeGroupCall =
  | GroupCall

/** Any `phone.GroupCallStars`. */
export type TypeGroupCallStars =
  | GroupCallStars

/** Any `phone.GroupCallStreamChannels`. */
export type TypeGroupCallStreamChannels =
  | GroupCallStreamChannels

/** Any `phone.GroupCallStreamRtmpUrl`. */
export type TypeGroupCallStreamRtmpUrl =
  | GroupCallStreamRtmpUrl

/** Any `phone.GroupParticipants`. */
export type TypeGroupParticipants =
  | GroupParticipants

/** Any `phone.JoinAsPeers`. */
export type TypeJoinAsPeers =
  | JoinAsPeers

/** Any `phone.PhoneCall`. */
export type TypePhoneCall =
  | PhoneCall
