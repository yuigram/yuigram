// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_d$ from '../root/d.js'
import type * as root_p$ from '../root/p.js'
import type * as root_t$ from '../root/t.js'
import type * as root_u$ from '../root/u.js'
import type { TlObject } from '../../../../tl/object.js'

/** `accountDaysTTL#b8d0afdf` */
export interface AccountDaysTTL {
  readonly _: 'accountDaysTTL'
  readonly days: number
}

/** `aiComposeTone#cff63ea9` */
export interface AiComposeTone {
  readonly _: 'aiComposeTone'
  readonly creator?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly slug: string
  readonly title: string
  readonly emoji_id?: bigint
  readonly prompt?: string
  readonly installs_count?: number
  readonly author_id?: bigint
  readonly example_english?: TypeAiComposeToneExample
}

/** `aiComposeToneDefault#9bad6414` */
export interface AiComposeToneDefault {
  readonly _: 'aiComposeToneDefault'
  readonly tone: string
  readonly emoji_id: bigint
  readonly title: string
}

/** `aiComposeToneExample#f1d628ec` */
export interface AiComposeToneExample {
  readonly _: 'aiComposeToneExample'
  readonly from: root_t$.TypeTextWithEntities
  readonly to: root_t$.TypeTextWithEntities
}

/** `attachMenuBot#d90d8dfe` */
export interface AttachMenuBot {
  readonly _: 'attachMenuBot'
  readonly inactive?: true
  readonly has_settings?: true
  readonly request_write_access?: true
  readonly show_in_attach_menu?: true
  readonly show_in_side_menu?: true
  readonly side_menu_disclaimer_needed?: true
  readonly bot_id: bigint
  readonly short_name: string
  readonly peer_types?: readonly TypeAttachMenuPeerType[]
  readonly icons: readonly TypeAttachMenuBotIcon[]
}

/** `attachMenuBotIcon#b2a7386b` */
export interface AttachMenuBotIcon {
  readonly _: 'attachMenuBotIcon'
  readonly name: string
  readonly icon: root_d$.TypeDocument
  readonly colors?: readonly TypeAttachMenuBotIconColor[]
}

/** `attachMenuBotIconColor#4576f3f0` */
export interface AttachMenuBotIconColor {
  readonly _: 'attachMenuBotIconColor'
  readonly name: string
  readonly color: number
}

/** `attachMenuBots#3c4301c0` */
export interface AttachMenuBots {
  readonly _: 'attachMenuBots'
  readonly hash: bigint
  readonly bots: readonly TypeAttachMenuBot[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `attachMenuBotsBot#93bf667f` */
export interface AttachMenuBotsBot {
  readonly _: 'attachMenuBotsBot'
  readonly bot: TypeAttachMenuBot
  readonly users: readonly root_u$.TypeUser[]
}

/** `attachMenuBotsNotModified#f1d88a5c` */
export interface AttachMenuBotsNotModified {
  readonly _: 'attachMenuBotsNotModified'
}

/** `attachMenuPeerTypeBotPM#c32bfa1a` */
export interface AttachMenuPeerTypeBotPM {
  readonly _: 'attachMenuPeerTypeBotPM'
}

/** `attachMenuPeerTypeBroadcast#7bfbdefc` */
export interface AttachMenuPeerTypeBroadcast {
  readonly _: 'attachMenuPeerTypeBroadcast'
}

/** `attachMenuPeerTypeChat#0509113f` */
export interface AttachMenuPeerTypeChat {
  readonly _: 'attachMenuPeerTypeChat'
}

/** `attachMenuPeerTypePM#f146d31f` */
export interface AttachMenuPeerTypePM {
  readonly _: 'attachMenuPeerTypePM'
}

/** `attachMenuPeerTypeSameBotPM#7d6be90e` */
export interface AttachMenuPeerTypeSameBotPM {
  readonly _: 'attachMenuPeerTypeSameBotPM'
}

/** `auctionBidLevel#310240cc` */
export interface AuctionBidLevel {
  readonly _: 'auctionBidLevel'
  readonly pos: number
  readonly amount: bigint
  readonly date: number
}

/** `authorization#ad01d61d` */
export interface Authorization {
  readonly _: 'authorization'
  readonly current?: true
  readonly official_app?: true
  readonly password_pending?: true
  readonly encrypted_requests_disabled?: true
  readonly call_requests_disabled?: true
  readonly unconfirmed?: true
  readonly hash: bigint
  readonly device_model: string
  readonly platform: string
  readonly system_version: string
  readonly api_id: number
  readonly app_name: string
  readonly app_version: string
  readonly date_created: number
  readonly date_active: number
  readonly ip: string
  readonly country: string
  readonly region: string
}

/** `autoDownloadSettings#baa57628` */
export interface AutoDownloadSettings {
  readonly _: 'autoDownloadSettings'
  readonly disabled?: true
  readonly video_preload_large?: true
  readonly audio_preload_next?: true
  readonly phonecalls_less_data?: true
  readonly stories_preload?: true
  readonly photo_size_max: number
  readonly video_size_max: bigint
  readonly file_size_max: bigint
  readonly video_upload_maxbitrate: number
  readonly small_queue_active_operations_max: number
  readonly large_queue_active_operations_max: number
}

/** `autoSaveException#81602d47` */
export interface AutoSaveException {
  readonly _: 'autoSaveException'
  readonly peer: root_p$.TypePeer
  readonly settings: TypeAutoSaveSettings
}

/** `autoSaveSettings#c84834ce` */
export interface AutoSaveSettings {
  readonly _: 'autoSaveSettings'
  readonly photos?: true
  readonly videos?: true
  readonly video_max_size?: bigint
}

/** `availableEffect#93c3e27e` */
export interface AvailableEffect {
  readonly _: 'availableEffect'
  readonly premium_required?: true
  readonly id: bigint
  readonly emoticon: string
  readonly static_icon_id?: bigint
  readonly effect_sticker_id: bigint
  readonly effect_animation_id?: bigint
}

/** `availableReaction#c077ec01` */
export interface AvailableReaction {
  readonly _: 'availableReaction'
  readonly inactive?: true
  readonly premium?: true
  readonly reaction: string
  readonly title: string
  readonly static_icon: root_d$.TypeDocument
  readonly appear_animation: root_d$.TypeDocument
  readonly select_animation: root_d$.TypeDocument
  readonly activate_animation: root_d$.TypeDocument
  readonly effect_animation: root_d$.TypeDocument
  readonly around_animation?: root_d$.TypeDocument
  readonly center_icon?: root_d$.TypeDocument
}

/** Any `AccountDaysTTL`. */
export type TypeAccountDaysTTL =
  | AccountDaysTTL

/** Any `AiComposeTone`. */
export type TypeAiComposeTone =
  | AiComposeTone
  | AiComposeToneDefault

/** Any `AiComposeToneExample`. */
export type TypeAiComposeToneExample =
  | AiComposeToneExample

/** Any `AttachMenuBot`. */
export type TypeAttachMenuBot =
  | AttachMenuBot

/** Any `AttachMenuBotIcon`. */
export type TypeAttachMenuBotIcon =
  | AttachMenuBotIcon

/** Any `AttachMenuBotIconColor`. */
export type TypeAttachMenuBotIconColor =
  | AttachMenuBotIconColor

/** Any `AttachMenuBots`. */
export type TypeAttachMenuBots =
  | AttachMenuBots
  | AttachMenuBotsNotModified

/** Any `AttachMenuBotsBot`. */
export type TypeAttachMenuBotsBot =
  | AttachMenuBotsBot

/** Any `AttachMenuPeerType`. */
export type TypeAttachMenuPeerType =
  | AttachMenuPeerTypeBotPM
  | AttachMenuPeerTypeBroadcast
  | AttachMenuPeerTypeChat
  | AttachMenuPeerTypePM
  | AttachMenuPeerTypeSameBotPM

/** Any `AuctionBidLevel`. */
export type TypeAuctionBidLevel =
  | AuctionBidLevel

/** Any `Authorization`. */
export type TypeAuthorization =
  | Authorization

/** Any `AutoDownloadSettings`. */
export type TypeAutoDownloadSettings =
  | AutoDownloadSettings

/** Any `AutoSaveException`. */
export type TypeAutoSaveException =
  | AutoSaveException

/** Any `AutoSaveSettings`. */
export type TypeAutoSaveSettings =
  | AutoSaveSettings

/** Any `AvailableEffect`. */
export type TypeAvailableEffect =
  | AvailableEffect

/** Any `AvailableReaction`. */
export type TypeAvailableReaction =
  | AvailableReaction
