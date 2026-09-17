// GENERATED FILE — do not edit.
// TL types for communities
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as root_c$ from './root/c.js'
import type * as root_i$ from './root/i.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `communities.create#a63859ec` */
export interface Create {
  readonly _: 'communities.create'
  readonly hidden?: true
  readonly title: string
  readonly about?: string
  readonly peer: root_i$.TypeInputPeer
}

/** `communities.getJoinedCommunities#a663e830` */
export interface GetJoinedCommunities {
  readonly _: 'communities.getJoinedCommunities'
}

/** `communities.getParticipantJoinedChats#f87eabab` */
export interface GetParticipantJoinedChats {
  readonly _: 'communities.getParticipantJoinedChats'
  readonly community: root_i$.TypeInputChannel
  readonly participant: root_i$.TypeInputPeer
}

/** `communities.getPeerLinkRequests#93773344` */
export interface GetPeerLinkRequests {
  readonly _: 'communities.getPeerLinkRequests'
  readonly community: root_i$.TypeInputChannel
  readonly offset: string
  readonly limit: number
}

/** `communities.participantJoinedChats#8d78512a` */
export interface ParticipantJoinedChats {
  readonly _: 'communities.participantJoinedChats'
  readonly creator_chat_ids: readonly bigint[]
  readonly joined_chat_ids: readonly bigint[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `communities.peerLinkRequests#2244afad` */
export interface PeerLinkRequests {
  readonly _: 'communities.peerLinkRequests'
  readonly total_count: number
  readonly requests: readonly root_c$.TypeCommunityPeerRequest[]
  readonly next_offset?: string
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `communities.toggleAllPeerLinkRequestApproval#bfe3dd3d` */
export interface ToggleAllPeerLinkRequestApproval {
  readonly _: 'communities.toggleAllPeerLinkRequestApproval'
  readonly reject?: true
  readonly community: root_i$.TypeInputChannel
}

/** `communities.toggleCommunityCollapsedInDialogs#d766e3ea` */
export interface ToggleCommunityCollapsedInDialogs {
  readonly _: 'communities.toggleCommunityCollapsedInDialogs'
  readonly collapsed?: true
  readonly community: root_i$.TypeInputChannel
}

/** `communities.toggleParticipantBanned#9967ad0f` */
export interface ToggleParticipantBanned {
  readonly _: 'communities.toggleParticipantBanned'
  readonly unban?: true
  readonly community: root_i$.TypeInputChannel
  readonly participant: root_i$.TypeInputPeer
}

/** `communities.togglePeerLink#736dcfea` */
export interface TogglePeerLink {
  readonly _: 'communities.togglePeerLink'
  readonly visible?: true
  readonly hidden?: true
  readonly deleted?: true
  readonly community: root_i$.TypeInputChannel
  readonly peer: root_i$.TypeInputPeer
}

/** `communities.togglePeerLinkRequestApproval#8c8219a8` */
export interface TogglePeerLinkRequestApproval {
  readonly _: 'communities.togglePeerLinkRequestApproval'
  readonly reject?: true
  readonly community: root_i$.TypeInputChannel
  readonly peer: root_i$.TypeInputPeer
}

/** Any `communities.ParticipantJoinedChats`. */
export type TypeParticipantJoinedChats =
  | ParticipantJoinedChats

/** Any `communities.PeerLinkRequests`. */
export type TypePeerLinkRequests =
  | PeerLinkRequests
