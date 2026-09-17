// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as root_f$ from '../root/f.js'
import type * as root_i$ from '../root/i.js'
import type * as root_m$ from '../root/m.js'
import type * as root_p$ from '../root/p.js'
import type * as root_r$ from '../root/r.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type * as root_v$ from '../root/v.js'
import type { TlObject } from '../../../../tl/object.js'

/** `dataJSON#7d748d04` */
export interface DataJSON {
  readonly _: 'dataJSON'
  readonly data: string
}

/** `dcOption#18b7a10d` */
export interface DcOption {
  readonly _: 'dcOption'
  readonly ipv6?: true
  readonly media_only?: true
  readonly tcpo_only?: true
  readonly cdn?: true
  readonly static?: true
  readonly this_port_only?: true
  readonly id: number
  readonly ip_address: string
  readonly port: number
  readonly secret?: Uint8Array
}

/** `defaultHistoryTTL#43b46b20` */
export interface DefaultHistoryTTL {
  readonly _: 'defaultHistoryTTL'
  readonly period: number
}

/** `dialog#fc89f7f3` */
export interface Dialog {
  readonly _: 'dialog'
  readonly pinned?: true
  readonly unread_mark?: true
  readonly view_forum_as_messages?: true
  readonly peer: root_p$.TypePeer
  readonly top_message: number
  readonly read_inbox_max_id: number
  readonly read_outbox_max_id: number
  readonly unread_count: number
  readonly unread_mentions_count: number
  readonly unread_reactions_count: number
  readonly unread_poll_votes_count: number
  readonly notify_settings: root_p$.TypePeerNotifySettings
  readonly pts?: number
  readonly draft?: TypeDraftMessage
  readonly folder_id?: number
  readonly ttl_period?: number
}

/** `dialogCommunity#f78a0973` */
export interface DialogCommunity {
  readonly _: 'dialogCommunity'
  readonly pinned?: true
  readonly community_id: bigint
  readonly notify_settings: root_p$.TypePeerNotifySettings
}

/** `dialogFilter#aa472651` */
export interface DialogFilter {
  readonly _: 'dialogFilter'
  readonly contacts?: true
  readonly non_contacts?: true
  readonly groups?: true
  readonly broadcasts?: true
  readonly bots?: true
  readonly exclude_muted?: true
  readonly exclude_read?: true
  readonly exclude_archived?: true
  readonly title_noanimate?: true
  readonly id: number
  readonly title: root_t$.TypeTextWithEntities
  readonly emoticon?: string
  readonly color?: number
  readonly pinned_peers: readonly root_i$.TypeInputPeer[]
  readonly include_peers: readonly root_i$.TypeInputPeer[]
  readonly exclude_peers: readonly root_i$.TypeInputPeer[]
}

/** `dialogFilterChatlist#96537bd7` */
export interface DialogFilterChatlist {
  readonly _: 'dialogFilterChatlist'
  readonly has_my_invites?: true
  readonly title_noanimate?: true
  readonly id: number
  readonly title: root_t$.TypeTextWithEntities
  readonly emoticon?: string
  readonly color?: number
  readonly pinned_peers: readonly root_i$.TypeInputPeer[]
  readonly include_peers: readonly root_i$.TypeInputPeer[]
}

/** `dialogFilterDefault#363293ae` */
export interface DialogFilterDefault {
  readonly _: 'dialogFilterDefault'
}

/** `dialogFilterSuggested#77744d4a` */
export interface DialogFilterSuggested {
  readonly _: 'dialogFilterSuggested'
  readonly filter: TypeDialogFilter
  readonly description: string
}

/** `dialogFolder#71bd134c` */
export interface DialogFolder {
  readonly _: 'dialogFolder'
  readonly pinned?: true
  readonly folder: root_f$.TypeFolder
  readonly peer: root_p$.TypePeer
  readonly top_message: number
  readonly unread_muted_peers_count: number
  readonly unread_unmuted_peers_count: number
  readonly unread_muted_messages_count: number
  readonly unread_unmuted_messages_count: number
}

/** `dialogPeer#e56dbf05` */
export interface DialogPeer {
  readonly _: 'dialogPeer'
  readonly peer: root_p$.TypePeer
}

/** `dialogPeerCommunity#2f65c8e4` */
export interface DialogPeerCommunity {
  readonly _: 'dialogPeerCommunity'
  readonly community_id: bigint
}

/** `dialogPeerFolder#514519e2` */
export interface DialogPeerFolder {
  readonly _: 'dialogPeerFolder'
  readonly folder_id: number
}

/** `disallowedGiftsSettings#71f276c4` */
export interface DisallowedGiftsSettings {
  readonly _: 'disallowedGiftsSettings'
  readonly disallow_unlimited_stargifts?: true
  readonly disallow_limited_stargifts?: true
  readonly disallow_unique_stargifts?: true
  readonly disallow_premium_gifts?: true
  readonly disallow_stargifts_from_channels?: true
}

/** `document#8fd4c4d8` */
export interface Document {
  readonly _: 'document'
  readonly id: bigint
  readonly access_hash: bigint
  readonly file_reference: Uint8Array
  readonly date: number
  readonly mime_type: string
  readonly size: bigint
  readonly thumbs?: readonly root_p$.TypePhotoSize[]
  readonly video_thumbs?: readonly root_v$.TypeVideoSize[]
  readonly dc_id: number
  readonly attributes: readonly TypeDocumentAttribute[]
}

/** `documentAttributeAnimated#11b58939` */
export interface DocumentAttributeAnimated {
  readonly _: 'documentAttributeAnimated'
}

/** `documentAttributeAudio#9852f9c6` */
export interface DocumentAttributeAudio {
  readonly _: 'documentAttributeAudio'
  readonly voice?: true
  readonly duration: number
  readonly title?: string
  readonly performer?: string
  readonly waveform?: Uint8Array
}

/** `documentAttributeCustomEmoji#fd149899` */
export interface DocumentAttributeCustomEmoji {
  readonly _: 'documentAttributeCustomEmoji'
  readonly free?: true
  readonly text_color?: true
  readonly alt: string
  readonly stickerset: root_i$.TypeInputStickerSet
}

/** `documentAttributeFilename#15590068` */
export interface DocumentAttributeFilename {
  readonly _: 'documentAttributeFilename'
  readonly file_name: string
}

/** `documentAttributeHasStickers#9801d2f7` */
export interface DocumentAttributeHasStickers {
  readonly _: 'documentAttributeHasStickers'
}

/** `documentAttributeImageSize#6c37c15c` */
export interface DocumentAttributeImageSize {
  readonly _: 'documentAttributeImageSize'
  readonly w: number
  readonly h: number
}

/** `documentAttributeSticker#6319d612` */
export interface DocumentAttributeSticker {
  readonly _: 'documentAttributeSticker'
  readonly mask?: true
  readonly alt: string
  readonly stickerset: root_i$.TypeInputStickerSet
  readonly mask_coords?: root_m$.TypeMaskCoords
}

/** `documentAttributeVideo#43c57c48` */
export interface DocumentAttributeVideo {
  readonly _: 'documentAttributeVideo'
  readonly round_message?: true
  readonly supports_streaming?: true
  readonly nosound?: true
  readonly duration: number
  readonly w: number
  readonly h: number
  readonly preload_prefix_size?: number
  readonly video_start_ts?: number
  readonly video_codec?: string
}

/** `documentEmpty#36f8c871` */
export interface DocumentEmpty {
  readonly _: 'documentEmpty'
  readonly id: bigint
}

/** `draftMessage#60fe3294` */
export interface DraftMessage {
  readonly _: 'draftMessage'
  readonly no_webpage?: true
  readonly invert_media?: true
  readonly reply_to?: root_i$.TypeInputReplyTo
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly media?: root_i$.TypeInputMedia
  readonly date: number
  readonly effect?: bigint
  readonly suggested_post?: root_s$.TypeSuggestedPost
  readonly rich_message?: root_r$.TypeRichMessage
}

/** `draftMessageEmpty#1b0c841a` */
export interface DraftMessageEmpty {
  readonly _: 'draftMessageEmpty'
  readonly date?: number
}

/** Any `DataJSON`. */
export type TypeDataJSON =
  | DataJSON

/** Any `DcOption`. */
export type TypeDcOption =
  | DcOption

/** Any `DefaultHistoryTTL`. */
export type TypeDefaultHistoryTTL =
  | DefaultHistoryTTL

/** Any `Dialog`. */
export type TypeDialog =
  | Dialog
  | DialogCommunity
  | DialogFolder

/** Any `DialogFilter`. */
export type TypeDialogFilter =
  | DialogFilter
  | DialogFilterChatlist
  | DialogFilterDefault

/** Any `DialogFilterSuggested`. */
export type TypeDialogFilterSuggested =
  | DialogFilterSuggested

/** Any `DialogPeer`. */
export type TypeDialogPeer =
  | DialogPeer
  | DialogPeerCommunity
  | DialogPeerFolder

/** Any `DisallowedGiftsSettings`. */
export type TypeDisallowedGiftsSettings =
  | DisallowedGiftsSettings

/** Any `Document`. */
export type TypeDocument =
  | Document
  | DocumentEmpty

/** Any `DocumentAttribute`. */
export type TypeDocumentAttribute =
  | DocumentAttributeAnimated
  | DocumentAttributeAudio
  | DocumentAttributeCustomEmoji
  | DocumentAttributeFilename
  | DocumentAttributeHasStickers
  | DocumentAttributeImageSize
  | DocumentAttributeSticker
  | DocumentAttributeVideo

/** Any `DraftMessage`. */
export type TypeDraftMessage =
  | DraftMessage
  | DraftMessageEmpty
