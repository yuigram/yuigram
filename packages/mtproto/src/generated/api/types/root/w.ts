// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_d$ from '../root/d.js'
import type * as root_i$ from '../root/i.js'
import type * as root_p$ from '../root/p.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type { TlObject } from '../../../../tl/object.js'

/** Any `WallPaper`. */
export type TypeWallPaper =
  | WallPaper
  | WallPaperNoFile

/** Any `WallPaperSettings`. */
export type TypeWallPaperSettings =
  | WallPaperSettings

/** Any `WebAuthorization`. */
export type TypeWebAuthorization =
  | WebAuthorization

/** Any `WebDocument`. */
export type TypeWebDocument =
  | WebDocument
  | WebDocumentNoProxy

/** Any `WebDomainException`. */
export type TypeWebDomainException =
  | WebDomainException

/** Any `WebPage`. */
export type TypeWebPage =
  | WebPage
  | WebPageEmpty
  | WebPageNotModified
  | WebPagePending

/** Any `WebPageAttribute`. */
export type TypeWebPageAttribute =
  | WebPageAttributeAiComposeTone
  | WebPageAttributeStarGiftAuction
  | WebPageAttributeStarGiftCollection
  | WebPageAttributeStickerSet
  | WebPageAttributeStory
  | WebPageAttributeTheme
  | WebPageAttributeUniqueStarGift

/** Any `WebViewMessageSent`. */
export type TypeWebViewMessageSent =
  | WebViewMessageSent

/** Any `WebViewResult`. */
export type TypeWebViewResult =
  | WebViewResultUrl

/** `wallPaper#a437c3ed` */
export interface WallPaper {
  readonly _: 'wallPaper'
  readonly id: bigint
  readonly creator?: true
  readonly default?: true
  readonly pattern?: true
  readonly dark?: true
  readonly access_hash: bigint
  readonly slug: string
  readonly document: root_d$.TypeDocument
  readonly settings?: TypeWallPaperSettings
}

/** `wallPaperNoFile#e0804116` */
export interface WallPaperNoFile {
  readonly _: 'wallPaperNoFile'
  readonly id: bigint
  readonly default?: true
  readonly dark?: true
  readonly settings?: TypeWallPaperSettings
}

/** `wallPaperSettings#372efcd0` */
export interface WallPaperSettings {
  readonly _: 'wallPaperSettings'
  readonly blur?: true
  readonly motion?: true
  readonly background_color?: number
  readonly second_background_color?: number
  readonly third_background_color?: number
  readonly fourth_background_color?: number
  readonly intensity?: number
  readonly rotation?: number
  readonly emoticon?: string
}

/** `webAuthorization#a6f8f452` */
export interface WebAuthorization {
  readonly _: 'webAuthorization'
  readonly hash: bigint
  readonly bot_id: bigint
  readonly domain: string
  readonly browser: string
  readonly platform: string
  readonly date_created: number
  readonly date_active: number
  readonly ip: string
  readonly region: string
}

/** `webDocument#1c570ed1` */
export interface WebDocument {
  readonly _: 'webDocument'
  readonly url: string
  readonly access_hash: bigint
  readonly size: number
  readonly mime_type: string
  readonly attributes: readonly root_d$.TypeDocumentAttribute[]
}

/** `webDocumentNoProxy#f9c8bcc6` */
export interface WebDocumentNoProxy {
  readonly _: 'webDocumentNoProxy'
  readonly url: string
  readonly size: number
  readonly mime_type: string
  readonly attributes: readonly root_d$.TypeDocumentAttribute[]
}

/** `webDomainException#933ca597` */
export interface WebDomainException {
  readonly _: 'webDomainException'
  readonly domain: string
  readonly url: string
  readonly title: string
  readonly favicon?: bigint
}

/** `webPage#e89c45b2` */
export interface WebPage {
  readonly _: 'webPage'
  readonly has_large_media?: true
  readonly video_cover_photo?: true
  readonly id: bigint
  readonly url: string
  readonly display_url: string
  readonly hash: number
  readonly type?: string
  readonly site_name?: string
  readonly title?: string
  readonly description?: string
  readonly photo?: root_p$.TypePhoto
  readonly embed_url?: string
  readonly embed_type?: string
  readonly embed_width?: number
  readonly embed_height?: number
  readonly duration?: number
  readonly author?: string
  readonly document?: root_d$.TypeDocument
  readonly cached_page?: root_p$.TypePage
  readonly attributes?: readonly TypeWebPageAttribute[]
}

/** `webPageAttributeAiComposeTone#7781fe18` */
export interface WebPageAttributeAiComposeTone {
  readonly _: 'webPageAttributeAiComposeTone'
  readonly emoji_id: bigint
}

/** `webPageAttributeStarGiftAuction#01c641c2` */
export interface WebPageAttributeStarGiftAuction {
  readonly _: 'webPageAttributeStarGiftAuction'
  readonly gift: root_s$.TypeStarGift
  readonly end_date: number
}

/** `webPageAttributeStarGiftCollection#31cad303` */
export interface WebPageAttributeStarGiftCollection {
  readonly _: 'webPageAttributeStarGiftCollection'
  readonly icons: readonly root_d$.TypeDocument[]
}

/** `webPageAttributeStickerSet#50cc03d3` */
export interface WebPageAttributeStickerSet {
  readonly _: 'webPageAttributeStickerSet'
  readonly emojis?: true
  readonly text_color?: true
  readonly stickers: readonly root_d$.TypeDocument[]
}

/** `webPageAttributeStory#2e94c3e7` */
export interface WebPageAttributeStory {
  readonly _: 'webPageAttributeStory'
  readonly peer: root_p$.TypePeer
  readonly id: number
  readonly story?: root_s$.TypeStoryItem
}

/** `webPageAttributeTheme#54b56617` */
export interface WebPageAttributeTheme {
  readonly _: 'webPageAttributeTheme'
  readonly documents?: readonly root_d$.TypeDocument[]
  readonly settings?: root_t$.TypeThemeSettings
}

/** `webPageAttributeUniqueStarGift#cf6f6db8` */
export interface WebPageAttributeUniqueStarGift {
  readonly _: 'webPageAttributeUniqueStarGift'
  readonly gift: root_s$.TypeStarGift
}

/** `webPageEmpty#211a1788` */
export interface WebPageEmpty {
  readonly _: 'webPageEmpty'
  readonly id: bigint
  readonly url?: string
}

/** `webPageNotModified#7311ca11` */
export interface WebPageNotModified {
  readonly _: 'webPageNotModified'
  readonly cached_page_views?: number
}

/** `webPagePending#b0d13e47` */
export interface WebPagePending {
  readonly _: 'webPagePending'
  readonly id: bigint
  readonly url?: string
  readonly date: number
}

/** `webViewMessageSent#0c94511c` */
export interface WebViewMessageSent {
  readonly _: 'webViewMessageSent'
  readonly msg_id?: root_i$.TypeInputBotInlineMessageID
}

/** `webViewResultUrl#4d22ff98` */
export interface WebViewResultUrl {
  readonly _: 'webViewResultUrl'
  readonly fullsize?: true
  readonly fullscreen?: true
  readonly same_origin?: true
  readonly query_id?: bigint
  readonly url: string
}
