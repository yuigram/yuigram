// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_d$ from '../root/d.js'
import type * as root_p$ from '../root/p.js'
import type * as root_t$ from '../root/t.js'
import type { TlObject } from '../../../../tl/object.js'

/** `game#bdf9653b` */
export interface Game {
  readonly _: 'game'
  readonly id: bigint
  readonly access_hash: bigint
  readonly short_name: string
  readonly title: string
  readonly description: string
  readonly photo: root_p$.TypePhoto
  readonly document?: root_d$.TypeDocument
}

/** `geoPoint#b2a2f663` */
export interface GeoPoint {
  readonly _: 'geoPoint'
  readonly long: number
  readonly lat: number
  readonly access_hash: bigint
  readonly accuracy_radius?: number
}

/** `geoPointAddress#de4c5d93` */
export interface GeoPointAddress {
  readonly _: 'geoPointAddress'
  readonly country_iso2: string
  readonly state?: string
  readonly city?: string
  readonly street?: string
}

/** `geoPointEmpty#1117dd5f` */
export interface GeoPointEmpty {
  readonly _: 'geoPointEmpty'
}

/** `globalPrivacySettings#fe41b34f` */
export interface GlobalPrivacySettings {
  readonly _: 'globalPrivacySettings'
  readonly archive_and_mute_new_noncontact_peers?: true
  readonly keep_archived_unmuted?: true
  readonly keep_archived_folders?: true
  readonly hide_read_marks?: true
  readonly new_noncontact_peers_require_premium?: true
  readonly display_gifts_button?: true
  readonly noncontact_peers_paid_stars?: bigint
  readonly disallowed_gifts?: root_d$.TypeDisallowedGiftsSettings
}

/** `groupCall#efb2b617` */
export interface GroupCall {
  readonly _: 'groupCall'
  readonly join_muted?: true
  readonly can_change_join_muted?: true
  readonly join_date_asc?: true
  readonly schedule_start_subscribed?: true
  readonly can_start_video?: true
  readonly record_video_active?: true
  readonly rtmp_stream?: true
  readonly listeners_hidden?: true
  readonly conference?: true
  readonly creator?: true
  readonly messages_enabled?: true
  readonly can_change_messages_enabled?: true
  readonly min?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly participants_count: number
  readonly title?: string
  readonly stream_dc_id?: number
  readonly record_start_date?: number
  readonly schedule_date?: number
  readonly unmuted_video_count?: number
  readonly unmuted_video_limit: number
  readonly version: number
  readonly invite_link?: string
  readonly send_paid_messages_stars?: bigint
  readonly default_send_as?: root_p$.TypePeer
}

/** `groupCallDiscarded#7780bcb4` */
export interface GroupCallDiscarded {
  readonly _: 'groupCallDiscarded'
  readonly id: bigint
  readonly access_hash: bigint
  readonly duration: number
}

/** `groupCallDonor#ee430c85` */
export interface GroupCallDonor {
  readonly _: 'groupCallDonor'
  readonly top?: true
  readonly my?: true
  readonly peer_id?: root_p$.TypePeer
  readonly stars: bigint
}

/** `groupCallMessage#1a8afc7e` */
export interface GroupCallMessage {
  readonly _: 'groupCallMessage'
  readonly from_admin?: true
  readonly id: number
  readonly from_id: root_p$.TypePeer
  readonly date: number
  readonly message: root_t$.TypeTextWithEntities
  readonly paid_message_stars?: bigint
}

/** `groupCallParticipant#2a3dc7ac` */
export interface GroupCallParticipant {
  readonly _: 'groupCallParticipant'
  readonly muted?: true
  readonly left?: true
  readonly can_self_unmute?: true
  readonly just_joined?: true
  readonly versioned?: true
  readonly min?: true
  readonly muted_by_you?: true
  readonly volume_by_admin?: true
  readonly self?: true
  readonly video_joined?: true
  readonly peer: root_p$.TypePeer
  readonly date: number
  readonly active_date?: number
  readonly source: number
  readonly volume?: number
  readonly about?: string
  readonly raise_hand_rating?: bigint
  readonly video?: TypeGroupCallParticipantVideo
  readonly presentation?: TypeGroupCallParticipantVideo
  readonly paid_stars_total?: bigint
}

/** `groupCallParticipantVideo#67753ac8` */
export interface GroupCallParticipantVideo {
  readonly _: 'groupCallParticipantVideo'
  readonly paused?: true
  readonly endpoint: string
  readonly source_groups: readonly TypeGroupCallParticipantVideoSourceGroup[]
  readonly audio_source?: number
}

/** `groupCallParticipantVideoSourceGroup#dcb118b7` */
export interface GroupCallParticipantVideoSourceGroup {
  readonly _: 'groupCallParticipantVideoSourceGroup'
  readonly semantics: string
  readonly sources: readonly number[]
}

/** `groupCallStreamChannel#80eb48af` */
export interface GroupCallStreamChannel {
  readonly _: 'groupCallStreamChannel'
  readonly channel: number
  readonly scale: number
  readonly last_timestamp_ms: bigint
}

/** Any `Game`. */
export type TypeGame =
  | Game

/** Any `GeoPoint`. */
export type TypeGeoPoint =
  | GeoPoint
  | GeoPointEmpty

/** Any `GeoPointAddress`. */
export type TypeGeoPointAddress =
  | GeoPointAddress

/** Any `GlobalPrivacySettings`. */
export type TypeGlobalPrivacySettings =
  | GlobalPrivacySettings

/** Any `GroupCall`. */
export type TypeGroupCall =
  | GroupCall
  | GroupCallDiscarded

/** Any `GroupCallDonor`. */
export type TypeGroupCallDonor =
  | GroupCallDonor

/** Any `GroupCallMessage`. */
export type TypeGroupCallMessage =
  | GroupCallMessage

/** Any `GroupCallParticipant`. */
export type TypeGroupCallParticipant =
  | GroupCallParticipant

/** Any `GroupCallParticipantVideo`. */
export type TypeGroupCallParticipantVideo =
  | GroupCallParticipantVideo

/** Any `GroupCallParticipantVideoSourceGroup`. */
export type TypeGroupCallParticipantVideoSourceGroup =
  | GroupCallParticipantVideoSourceGroup

/** Any `GroupCallStreamChannel`. */
export type TypeGroupCallStreamChannel =
  | GroupCallStreamChannel
