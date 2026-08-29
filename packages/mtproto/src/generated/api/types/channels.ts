// GENERATED FILE — do not edit.
// TL types for channels
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_c$ from './root/c.js'
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

/** `channels.sendAsPeers#f496b0c6` */
export interface SendAsPeers {
  readonly _: 'channels.sendAsPeers'
  readonly peers: readonly root_s$.TypeSendAsPeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
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
