// GENERATED FILE — do not edit.
// TL types for phone
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_c$ from './root/c.js'
import type * as root_g$ from './root/g.js'
import type * as root_p$ from './root/p.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `phone.exportedGroupCallInvite#204bd158` */
export interface ExportedGroupCallInvite {
  readonly _: 'phone.exportedGroupCallInvite'
  readonly link: string
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

/** `phone.joinAsPeers#afe5623f` */
export interface JoinAsPeers {
  readonly _: 'phone.joinAsPeers'
  readonly peers: readonly root_p$.TypePeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `phone.phoneCall#ec82e140` */
export interface PhoneCall {
  readonly _: 'phone.phoneCall'
  readonly phone_call: root_p$.TypePhoneCall
  readonly users: readonly root_u$.TypeUser[]
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
