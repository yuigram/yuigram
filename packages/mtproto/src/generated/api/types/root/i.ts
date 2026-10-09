// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_b$ from '../root/b.js'
import type * as root_d$ from '../root/d.js'
import type * as root_j$ from '../root/j.js'
import type * as root_l$ from '../root/l.js'
import type * as root_m$ from '../root/m.js'
import type * as root_n$ from '../root/n.js'
import type * as root_p$ from '../root/p.js'
import type * as root_r$ from '../root/r.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type * as root_v$ from '../root/v.js'
import type * as root_w$ from '../root/w.js'
import type { TlObject } from '../../../../tl/object.js'

/** `importedContact#c13e3c50` */
export interface ImportedContact {
  readonly _: 'importedContact'
  readonly user_id: bigint
  readonly client_id: bigint
}

/** `initConnection#c1cd5ea9` */
export interface InitConnection {
  readonly _: 'initConnection'
  readonly api_id: number
  readonly device_model: string
  readonly system_version: string
  readonly app_version: string
  readonly system_lang_code: string
  readonly lang_pack: string
  readonly lang_code: string
  readonly proxy?: TypeInputClientProxy
  readonly params?: root_j$.TypeJSONValue
  readonly query: TlObject
}

/** `inlineBotSwitchPM#3c20629f` */
export interface InlineBotSwitchPM {
  readonly _: 'inlineBotSwitchPM'
  readonly text: string
  readonly start_param: string
}

/** `inlineBotWebView#b57295d5` */
export interface InlineBotWebView {
  readonly _: 'inlineBotWebView'
  readonly text: string
  readonly url: string
}

/** `inlineButtonTypeBuy#48bad7a5` */
export interface InlineButtonTypeBuy {
  readonly _: 'inlineButtonTypeBuy'
}

/** `inlineButtonTypeCallback#2955bc38` */
export interface InlineButtonTypeCallback {
  readonly _: 'inlineButtonTypeCallback'
  readonly requires_password?: true
  readonly data: Uint8Array
}

/** `inlineButtonTypeCopy#b41d3272` */
export interface InlineButtonTypeCopy {
  readonly _: 'inlineButtonTypeCopy'
  readonly copy_text: string
}

/** `inlineButtonTypeDisabled#a438619d` */
export interface InlineButtonTypeDisabled {
  readonly _: 'inlineButtonTypeDisabled'
}

/** `inlineButtonTypeGame#5cd3709d` */
export interface InlineButtonTypeGame {
  readonly _: 'inlineButtonTypeGame'
}

/** `inlineButtonTypeSwitchInline#93773ff5` */
export interface InlineButtonTypeSwitchInline {
  readonly _: 'inlineButtonTypeSwitchInline'
  readonly same_peer?: true
  readonly query: string
  readonly peer_types?: readonly TypeInlineQueryPeerType[]
}

/** `inlineButtonTypeUrl#eca4f8d4` */
export interface InlineButtonTypeUrl {
  readonly _: 'inlineButtonTypeUrl'
  readonly url: string
}

/** `inlineButtonTypeUrlAuth#bfd02da2` */
export interface InlineButtonTypeUrlAuth {
  readonly _: 'inlineButtonTypeUrlAuth'
  readonly fwd_text?: string
  readonly url: string
  readonly button_id: number
}

/** `inlineButtonTypeUserProfile#3fa33fcf` */
export interface InlineButtonTypeUserProfile {
  readonly _: 'inlineButtonTypeUserProfile'
  readonly user_id: bigint
}

/** `inlineButtonTypeWebView#3bcab5b4` */
export interface InlineButtonTypeWebView {
  readonly _: 'inlineButtonTypeWebView'
  readonly url: string
}

/** `inlineQueryPeerTypeBotPM#0e3b2d0c` */
export interface InlineQueryPeerTypeBotPM {
  readonly _: 'inlineQueryPeerTypeBotPM'
}

/** `inlineQueryPeerTypeBroadcast#6334ee9a` */
export interface InlineQueryPeerTypeBroadcast {
  readonly _: 'inlineQueryPeerTypeBroadcast'
}

/** `inlineQueryPeerTypeChat#d766c50a` */
export interface InlineQueryPeerTypeChat {
  readonly _: 'inlineQueryPeerTypeChat'
}

/** `inlineQueryPeerTypeMegagroup#5ec4be43` */
export interface InlineQueryPeerTypeMegagroup {
  readonly _: 'inlineQueryPeerTypeMegagroup'
}

/** `inlineQueryPeerTypePM#833c0fac` */
export interface InlineQueryPeerTypePM {
  readonly _: 'inlineQueryPeerTypePM'
}

/** `inlineQueryPeerTypeSameBotPM#3081ed9d` */
export interface InlineQueryPeerTypeSameBotPM {
  readonly _: 'inlineQueryPeerTypeSameBotPM'
}

/** `inputAiComposeToneDefault#1fe9a9bf` */
export interface InputAiComposeToneDefault {
  readonly _: 'inputAiComposeToneDefault'
  readonly tone: string
}

/** `inputAiComposeToneID#0773c080` */
export interface InputAiComposeToneID {
  readonly _: 'inputAiComposeToneID'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputAiComposeToneSingleUse#0e0c35af` */
export interface InputAiComposeToneSingleUse {
  readonly _: 'inputAiComposeToneSingleUse'
  readonly custom_prompt: string
}

/** `inputAiComposeToneSlug#1fa01357` */
export interface InputAiComposeToneSlug {
  readonly _: 'inputAiComposeToneSlug'
  readonly slug: string
}

/** `inputAppEvent#1d1b1245` */
export interface InputAppEvent {
  readonly _: 'inputAppEvent'
  readonly time: number
  readonly type: string
  readonly peer: bigint
  readonly data: root_j$.TypeJSONValue
}

/** `inputBotAppID#a920bd7a` */
export interface InputBotAppID {
  readonly _: 'inputBotAppID'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputBotAppShortName#908c0407` */
export interface InputBotAppShortName {
  readonly _: 'inputBotAppShortName'
  readonly bot_id: TypeInputUser
  readonly short_name: string
}

/** `inputBotInlineMessageGame#4b425864` */
export interface InputBotInlineMessageGame {
  readonly _: 'inputBotInlineMessageGame'
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `inputBotInlineMessageID#890c3d89` */
export interface InputBotInlineMessageID {
  readonly _: 'inputBotInlineMessageID'
  readonly dc_id: number
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputBotInlineMessageID64#b6d915d7` */
export interface InputBotInlineMessageID64 {
  readonly _: 'inputBotInlineMessageID64'
  readonly dc_id: number
  readonly owner_id: bigint
  readonly id: number
  readonly access_hash: bigint
}

/** `inputBotInlineMessageMediaAuto#3380c786` */
export interface InputBotInlineMessageMediaAuto {
  readonly _: 'inputBotInlineMessageMediaAuto'
  readonly invert_media?: true
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `inputBotInlineMessageMediaContact#a6edbffd` */
export interface InputBotInlineMessageMediaContact {
  readonly _: 'inputBotInlineMessageMediaContact'
  readonly phone_number: string
  readonly first_name: string
  readonly last_name: string
  readonly vcard: string
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `inputBotInlineMessageMediaGeo#96929a85` */
export interface InputBotInlineMessageMediaGeo {
  readonly _: 'inputBotInlineMessageMediaGeo'
  readonly geo_point: TypeInputGeoPoint
  readonly heading?: number
  readonly period?: number
  readonly proximity_notification_radius?: number
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `inputBotInlineMessageMediaInvoice#d7e78225` */
export interface InputBotInlineMessageMediaInvoice {
  readonly _: 'inputBotInlineMessageMediaInvoice'
  readonly title: string
  readonly description: string
  readonly photo?: TypeInputWebDocument
  readonly invoice: TypeInvoice
  readonly payload: Uint8Array
  readonly provider: string
  readonly provider_data: root_d$.TypeDataJSON
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `inputBotInlineMessageMediaVenue#417bbf11` */
export interface InputBotInlineMessageMediaVenue {
  readonly _: 'inputBotInlineMessageMediaVenue'
  readonly geo_point: TypeInputGeoPoint
  readonly title: string
  readonly address: string
  readonly provider: string
  readonly venue_id: string
  readonly venue_type: string
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `inputBotInlineMessageMediaWebPage#bddcc510` */
export interface InputBotInlineMessageMediaWebPage {
  readonly _: 'inputBotInlineMessageMediaWebPage'
  readonly invert_media?: true
  readonly force_large_media?: true
  readonly force_small_media?: true
  readonly optional?: true
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly url: string
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `inputBotInlineMessageRichMessage#b43df56c` */
export interface InputBotInlineMessageRichMessage {
  readonly _: 'inputBotInlineMessageRichMessage'
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly rich_message: TypeInputRichMessage
}

/** `inputBotInlineMessageText#3dcd7a87` */
export interface InputBotInlineMessageText {
  readonly _: 'inputBotInlineMessageText'
  readonly no_webpage?: true
  readonly invert_media?: true
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `inputBotInlineResult#88bf9319` */
export interface InputBotInlineResult {
  readonly _: 'inputBotInlineResult'
  readonly id: string
  readonly type: string
  readonly title?: string
  readonly description?: string
  readonly url?: string
  readonly thumb?: TypeInputWebDocument
  readonly content?: TypeInputWebDocument
  readonly send_message: TypeInputBotInlineMessage
}

/** `inputBotInlineResultDocument#fff8fdc4` */
export interface InputBotInlineResultDocument {
  readonly _: 'inputBotInlineResultDocument'
  readonly id: string
  readonly type: string
  readonly title?: string
  readonly description?: string
  readonly document: TypeInputDocument
  readonly send_message: TypeInputBotInlineMessage
}

/** `inputBotInlineResultGame#4fa417f2` */
export interface InputBotInlineResultGame {
  readonly _: 'inputBotInlineResultGame'
  readonly id: string
  readonly short_name: string
  readonly send_message: TypeInputBotInlineMessage
}

/** `inputBotInlineResultPhoto#a8d864a7` */
export interface InputBotInlineResultPhoto {
  readonly _: 'inputBotInlineResultPhoto'
  readonly id: string
  readonly type: string
  readonly photo: TypeInputPhoto
  readonly send_message: TypeInputBotInlineMessage
}

/** `inputBusinessAwayMessage#832175e0` */
export interface InputBusinessAwayMessage {
  readonly _: 'inputBusinessAwayMessage'
  readonly offline_only?: true
  readonly shortcut_id: number
  readonly schedule: root_b$.TypeBusinessAwayMessageSchedule
  readonly recipients: TypeInputBusinessRecipients
}

/** `inputBusinessBotRecipients#c4e5921e` */
export interface InputBusinessBotRecipients {
  readonly _: 'inputBusinessBotRecipients'
  readonly existing_chats?: true
  readonly new_chats?: true
  readonly contacts?: true
  readonly non_contacts?: true
  readonly exclude_selected?: true
  readonly users?: readonly TypeInputUser[]
  readonly exclude_users?: readonly TypeInputUser[]
}

/** `inputBusinessChatLink#11679fa7` */
export interface InputBusinessChatLink {
  readonly _: 'inputBusinessChatLink'
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly title?: string
}

/** `inputBusinessGreetingMessage#0194cb3b` */
export interface InputBusinessGreetingMessage {
  readonly _: 'inputBusinessGreetingMessage'
  readonly shortcut_id: number
  readonly recipients: TypeInputBusinessRecipients
  readonly no_activity_days: number
}

/** `inputBusinessIntro#09c469cd` */
export interface InputBusinessIntro {
  readonly _: 'inputBusinessIntro'
  readonly title: string
  readonly description: string
  readonly sticker?: TypeInputDocument
}

/** `inputBusinessRecipients#6f8b32aa` */
export interface InputBusinessRecipients {
  readonly _: 'inputBusinessRecipients'
  readonly existing_chats?: true
  readonly new_chats?: true
  readonly contacts?: true
  readonly non_contacts?: true
  readonly exclude_selected?: true
  readonly users?: readonly TypeInputUser[]
}

/** `inputButtonTypeRequestPeer#3fe268fe` */
export interface InputButtonTypeRequestPeer {
  readonly _: 'inputButtonTypeRequestPeer'
  readonly name_requested?: true
  readonly username_requested?: true
  readonly photo_requested?: true
  readonly button_id: number
  readonly peer_type: root_r$.TypeRequestPeerType
  readonly max_quantity: number
}

/** `inputChannel#f35aec28` */
export interface InputChannel {
  readonly _: 'inputChannel'
  readonly channel_id: bigint
  readonly access_hash: bigint
}

/** `inputChannelEmpty#ee8c1e86` */
export interface InputChannelEmpty {
  readonly _: 'inputChannelEmpty'
}

/** `inputChannelFromMessage#5b934f9d` */
export interface InputChannelFromMessage {
  readonly _: 'inputChannelFromMessage'
  readonly peer: TypeInputPeer
  readonly msg_id: number
  readonly channel_id: bigint
}

/** `inputChatPhoto#8953ad37` */
export interface InputChatPhoto {
  readonly _: 'inputChatPhoto'
  readonly id: TypeInputPhoto
}

/** `inputChatPhotoEmpty#1ca48f57` */
export interface InputChatPhotoEmpty {
  readonly _: 'inputChatPhotoEmpty'
}

/** `inputChatTheme#c93de95c` */
export interface InputChatTheme {
  readonly _: 'inputChatTheme'
  readonly emoticon: string
}

/** `inputChatThemeEmpty#83268483` */
export interface InputChatThemeEmpty {
  readonly _: 'inputChatThemeEmpty'
}

/** `inputChatThemeUniqueGift#87e5dfe4` */
export interface InputChatThemeUniqueGift {
  readonly _: 'inputChatThemeUniqueGift'
  readonly slug: string
}

/** `inputChatUploadedPhoto#bdcdaec0` */
export interface InputChatUploadedPhoto {
  readonly _: 'inputChatUploadedPhoto'
  readonly file?: TypeInputFile
  readonly video?: TypeInputFile
  readonly video_start_ts?: number
  readonly video_emoji_markup?: root_v$.TypeVideoSize
}

/** `inputChatlistDialogFilter#f3e0da33` */
export interface InputChatlistDialogFilter {
  readonly _: 'inputChatlistDialogFilter'
  readonly filter_id: number
}

/** `inputCheckPasswordEmpty#9880f658` */
export interface InputCheckPasswordEmpty {
  readonly _: 'inputCheckPasswordEmpty'
}

/** `inputCheckPasswordSRP#d27ff082` */
export interface InputCheckPasswordSRP {
  readonly _: 'inputCheckPasswordSRP'
  readonly srp_id: bigint
  readonly A: Uint8Array
  readonly M1: Uint8Array
}

/** `inputClientProxy#75588b3f` */
export interface InputClientProxy {
  readonly _: 'inputClientProxy'
  readonly address: string
  readonly port: number
}

/** `inputCollectiblePhone#a2e214a4` */
export interface InputCollectiblePhone {
  readonly _: 'inputCollectiblePhone'
  readonly phone: string
}

/** `inputCollectibleUsername#e39460a9` */
export interface InputCollectibleUsername {
  readonly _: 'inputCollectibleUsername'
  readonly username: string
}

/** `inputDialogPeer#fcaafeb7` */
export interface InputDialogPeer {
  readonly _: 'inputDialogPeer'
  readonly peer: TypeInputPeer
}

/** `inputDialogPeerCommunity#69ef72c4` */
export interface InputDialogPeerCommunity {
  readonly _: 'inputDialogPeerCommunity'
  readonly community: TypeInputChannel
}

/** `inputDialogPeerFolder#64600527` */
export interface InputDialogPeerFolder {
  readonly _: 'inputDialogPeerFolder'
  readonly folder_id: number
}

/** `inputDocument#1abfb575` */
export interface InputDocument {
  readonly _: 'inputDocument'
  readonly id: bigint
  readonly access_hash: bigint
  readonly file_reference: Uint8Array
}

/** `inputDocumentEmpty#72f0eaae` */
export interface InputDocumentEmpty {
  readonly _: 'inputDocumentEmpty'
}

/** `inputDocumentFileLocation#bad07584` */
export interface InputDocumentFileLocation {
  readonly _: 'inputDocumentFileLocation'
  readonly id: bigint
  readonly access_hash: bigint
  readonly file_reference: Uint8Array
  readonly thumb_size: string
}

/** `inputEmojiStatusCollectible#07141dbf` */
export interface InputEmojiStatusCollectible {
  readonly _: 'inputEmojiStatusCollectible'
  readonly collectible_id: bigint
  readonly until?: number
}

/** `inputEncryptedChat#f141b5e1` */
export interface InputEncryptedChat {
  readonly _: 'inputEncryptedChat'
  readonly chat_id: number
  readonly access_hash: bigint
}

/** `inputEncryptedFile#5a17b5e5` */
export interface InputEncryptedFile {
  readonly _: 'inputEncryptedFile'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputEncryptedFileBigUploaded#2dc173c8` */
export interface InputEncryptedFileBigUploaded {
  readonly _: 'inputEncryptedFileBigUploaded'
  readonly id: bigint
  readonly parts: number
  readonly key_fingerprint: number
}

/** `inputEncryptedFileEmpty#1837c364` */
export interface InputEncryptedFileEmpty {
  readonly _: 'inputEncryptedFileEmpty'
}

/** `inputEncryptedFileLocation#f5235d55` */
export interface InputEncryptedFileLocation {
  readonly _: 'inputEncryptedFileLocation'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputEncryptedFileUploaded#64bd0306` */
export interface InputEncryptedFileUploaded {
  readonly _: 'inputEncryptedFileUploaded'
  readonly id: bigint
  readonly parts: number
  readonly md5_checksum: string
  readonly key_fingerprint: number
}

/** `inputFile#f52ff27f` */
export interface InputFile {
  readonly _: 'inputFile'
  readonly id: bigint
  readonly parts: number
  readonly name: string
  readonly md5_checksum: string
}

/** `inputFileBig#fa4f0bb5` */
export interface InputFileBig {
  readonly _: 'inputFileBig'
  readonly id: bigint
  readonly parts: number
  readonly name: string
}

/** `inputFileLocation#dfdaabe1` */
export interface InputFileLocation {
  readonly _: 'inputFileLocation'
  readonly volume_id: bigint
  readonly local_id: number
  readonly secret: bigint
  readonly file_reference: Uint8Array
}

/** `inputFileStoryDocument#62dc8b48` */
export interface InputFileStoryDocument {
  readonly _: 'inputFileStoryDocument'
  readonly id: TypeInputDocument
}

/** `inputFolderPeer#fbd2c296` */
export interface InputFolderPeer {
  readonly _: 'inputFolderPeer'
  readonly peer: TypeInputPeer
  readonly folder_id: number
}

/** `inputGameID#032c3e77` */
export interface InputGameID {
  readonly _: 'inputGameID'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputGameShortName#c331e80a` */
export interface InputGameShortName {
  readonly _: 'inputGameShortName'
  readonly bot_id: TypeInputUser
  readonly short_name: string
}

/** `inputGeoPoint#48222faf` */
export interface InputGeoPoint {
  readonly _: 'inputGeoPoint'
  readonly lat: number
  readonly long: number
  readonly accuracy_radius?: number
}

/** `inputGeoPointEmpty#e4c123d6` */
export interface InputGeoPointEmpty {
  readonly _: 'inputGeoPointEmpty'
}

/** `inputGroupCall#d8aa840f` */
export interface InputGroupCall {
  readonly _: 'inputGroupCall'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputGroupCallInviteMessage#8c10603f` */
export interface InputGroupCallInviteMessage {
  readonly _: 'inputGroupCallInviteMessage'
  readonly msg_id: number
}

/** `inputGroupCallSlug#fe06823f` */
export interface InputGroupCallSlug {
  readonly _: 'inputGroupCallSlug'
  readonly slug: string
}

/** `inputGroupCallStream#0598a92a` */
export interface InputGroupCallStream {
  readonly _: 'inputGroupCallStream'
  readonly call: TypeInputGroupCall
  readonly time_ms: bigint
  readonly scale: number
  readonly video_channel?: number
  readonly video_quality?: number
}

/** `inputInlineButtonTypeUrlAuth#9961bcb4` */
export interface InputInlineButtonTypeUrlAuth {
  readonly _: 'inputInlineButtonTypeUrlAuth'
  readonly request_write_access?: true
  readonly fwd_text?: string
  readonly url: string
  readonly bot?: TypeInputUser
}

/** `inputInlineButtonTypeUserProfile#53f3ce5a` */
export interface InputInlineButtonTypeUserProfile {
  readonly _: 'inputInlineButtonTypeUserProfile'
  readonly user_id: TypeInputUser
}

/** `inputInvoiceBusinessBotTransferStars#f4997e42` */
export interface InputInvoiceBusinessBotTransferStars {
  readonly _: 'inputInvoiceBusinessBotTransferStars'
  readonly bot: TypeInputUser
  readonly stars: bigint
}

/** `inputInvoiceChatInviteSubscription#34e793f1` */
export interface InputInvoiceChatInviteSubscription {
  readonly _: 'inputInvoiceChatInviteSubscription'
  readonly hash: string
}

/** `inputInvoiceMessage#c5b56859` */
export interface InputInvoiceMessage {
  readonly _: 'inputInvoiceMessage'
  readonly peer: TypeInputPeer
  readonly msg_id: number
}

/** `inputInvoicePremiumAuthCode#3e77f614` */
export interface InputInvoicePremiumAuthCode {
  readonly _: 'inputInvoicePremiumAuthCode'
  readonly purpose: TypeInputStorePaymentPurpose
}

/** `inputInvoicePremiumGiftCode#98986c0d` */
export interface InputInvoicePremiumGiftCode {
  readonly _: 'inputInvoicePremiumGiftCode'
  readonly purpose: TypeInputStorePaymentPurpose
  readonly option: root_p$.TypePremiumGiftCodeOption
}

/** `inputInvoicePremiumGiftStars#dabab2ef` */
export interface InputInvoicePremiumGiftStars {
  readonly _: 'inputInvoicePremiumGiftStars'
  readonly user_id: TypeInputUser
  readonly months: number
  readonly message?: root_t$.TypeTextWithEntities
}

/** `inputInvoiceSlug#c326caef` */
export interface InputInvoiceSlug {
  readonly _: 'inputInvoiceSlug'
  readonly slug: string
}

/** `inputInvoiceStarGift#e8625e92` */
export interface InputInvoiceStarGift {
  readonly _: 'inputInvoiceStarGift'
  readonly hide_name?: true
  readonly include_upgrade?: true
  readonly peer: TypeInputPeer
  readonly gift_id: bigint
  readonly message?: root_t$.TypeTextWithEntities
}

/** `inputInvoiceStarGiftAuctionBid#1ecafa10` */
export interface InputInvoiceStarGiftAuctionBid {
  readonly _: 'inputInvoiceStarGiftAuctionBid'
  readonly hide_name?: true
  readonly update_bid?: true
  readonly peer?: TypeInputPeer
  readonly gift_id: bigint
  readonly bid_amount: bigint
  readonly message?: root_t$.TypeTextWithEntities
}

/** `inputInvoiceStarGiftDropOriginalDetails#0923d8d1` */
export interface InputInvoiceStarGiftDropOriginalDetails {
  readonly _: 'inputInvoiceStarGiftDropOriginalDetails'
  readonly stargift: TypeInputSavedStarGift
}

/** `inputInvoiceStarGiftPrepaidUpgrade#9a0b48b8` */
export interface InputInvoiceStarGiftPrepaidUpgrade {
  readonly _: 'inputInvoiceStarGiftPrepaidUpgrade'
  readonly peer: TypeInputPeer
  readonly hash: string
}

/** `inputInvoiceStarGiftResale#e9b0c658` */
export interface InputInvoiceStarGiftResale {
  readonly _: 'inputInvoiceStarGiftResale'
  readonly ton?: true
  readonly show_name?: true
  readonly slug: string
  readonly to_id: TypeInputPeer
  readonly message?: root_t$.TypeTextWithEntities
}

/** `inputInvoiceStarGiftTransfer#4a5f5bd9` */
export interface InputInvoiceStarGiftTransfer {
  readonly _: 'inputInvoiceStarGiftTransfer'
  readonly stargift: TypeInputSavedStarGift
  readonly to_id: TypeInputPeer
}

/** `inputInvoiceStarGiftUpgrade#4d818d5d` */
export interface InputInvoiceStarGiftUpgrade {
  readonly _: 'inputInvoiceStarGiftUpgrade'
  readonly keep_original_details?: true
  readonly stargift: TypeInputSavedStarGift
}

/** `inputInvoiceStars#65f00ce3` */
export interface InputInvoiceStars {
  readonly _: 'inputInvoiceStars'
  readonly purpose: TypeInputStorePaymentPurpose
}

/** `inputMediaAreaChannelPost#2271f2bf` */
export interface InputMediaAreaChannelPost {
  readonly _: 'inputMediaAreaChannelPost'
  readonly coordinates: root_m$.TypeMediaAreaCoordinates
  readonly channel: TypeInputChannel
  readonly msg_id: number
}

/** `inputMediaAreaVenue#b282217f` */
export interface InputMediaAreaVenue {
  readonly _: 'inputMediaAreaVenue'
  readonly coordinates: root_m$.TypeMediaAreaCoordinates
  readonly query_id: bigint
  readonly result_id: string
}

/** `inputMediaContact#f8ab7dfb` */
export interface InputMediaContact {
  readonly _: 'inputMediaContact'
  readonly phone_number: string
  readonly first_name: string
  readonly last_name: string
  readonly vcard: string
}

/** `inputMediaDice#e66fbf7b` */
export interface InputMediaDice {
  readonly _: 'inputMediaDice'
  readonly emoticon: string
}

/** `inputMediaDocument#a8763ab5` */
export interface InputMediaDocument {
  readonly _: 'inputMediaDocument'
  readonly spoiler?: true
  readonly id: TypeInputDocument
  readonly video_cover?: TypeInputPhoto
  readonly video_timestamp?: number
  readonly ttl_seconds?: number
  readonly query?: string
}

/** `inputMediaDocumentExternal#779600f9` */
export interface InputMediaDocumentExternal {
  readonly _: 'inputMediaDocumentExternal'
  readonly spoiler?: true
  readonly url: string
  readonly ttl_seconds?: number
  readonly video_cover?: TypeInputPhoto
  readonly video_timestamp?: number
}

/** `inputMediaEmpty#9664f57f` */
export interface InputMediaEmpty {
  readonly _: 'inputMediaEmpty'
}

/** `inputMediaGame#d33f43f3` */
export interface InputMediaGame {
  readonly _: 'inputMediaGame'
  readonly id: TypeInputGame
}

/** `inputMediaGeoLive#971fa843` */
export interface InputMediaGeoLive {
  readonly _: 'inputMediaGeoLive'
  readonly stopped?: true
  readonly geo_point: TypeInputGeoPoint
  readonly heading?: number
  readonly period?: number
  readonly proximity_notification_radius?: number
}

/** `inputMediaGeoPoint#f9c44144` */
export interface InputMediaGeoPoint {
  readonly _: 'inputMediaGeoPoint'
  readonly geo_point: TypeInputGeoPoint
}

/** `inputMediaInvoice#405fef0d` */
export interface InputMediaInvoice {
  readonly _: 'inputMediaInvoice'
  readonly title: string
  readonly description: string
  readonly photo?: TypeInputWebDocument
  readonly invoice: TypeInvoice
  readonly payload: Uint8Array
  readonly provider?: string
  readonly provider_data: root_d$.TypeDataJSON
  readonly start_param?: string
  readonly extended_media?: TypeInputMedia
}

/** `inputMediaPaidMedia#c4103386` */
export interface InputMediaPaidMedia {
  readonly _: 'inputMediaPaidMedia'
  readonly stars_amount: bigint
  readonly extended_media: readonly TypeInputMedia[]
  readonly payload?: string
}

/** `inputMediaPhoto#e3af4434` */
export interface InputMediaPhoto {
  readonly _: 'inputMediaPhoto'
  readonly spoiler?: true
  readonly live_photo?: true
  readonly id: TypeInputPhoto
  readonly ttl_seconds?: number
  readonly video?: TypeInputDocument
}

/** `inputMediaPhotoExternal#e5bbfe1a` */
export interface InputMediaPhotoExternal {
  readonly _: 'inputMediaPhotoExternal'
  readonly spoiler?: true
  readonly url: string
  readonly ttl_seconds?: number
}

/** `inputMediaPoll#883a4108` */
export interface InputMediaPoll {
  readonly _: 'inputMediaPoll'
  readonly poll: root_p$.TypePoll
  readonly correct_answers?: readonly number[]
  readonly attached_media?: TypeInputMedia
  readonly solution?: string
  readonly solution_entities?: readonly root_m$.TypeMessageEntity[]
  readonly solution_media?: TypeInputMedia
}

/** `inputMediaStakeDice#f3a9244a` */
export interface InputMediaStakeDice {
  readonly _: 'inputMediaStakeDice'
  readonly game_hash: string
  readonly ton_amount: bigint
  readonly client_seed: Uint8Array
}

/** `inputMediaStory#89fdd778` */
export interface InputMediaStory {
  readonly _: 'inputMediaStory'
  readonly peer: TypeInputPeer
  readonly id: number
}

/** `inputMediaTodo#9fc55fde` */
export interface InputMediaTodo {
  readonly _: 'inputMediaTodo'
  readonly todo: root_t$.TypeTodoList
}

/** `inputMediaUploadedDocument#037c9330` */
export interface InputMediaUploadedDocument {
  readonly _: 'inputMediaUploadedDocument'
  readonly nosound_video?: true
  readonly force_file?: true
  readonly spoiler?: true
  readonly file: TypeInputFile
  readonly thumb?: TypeInputFile
  readonly mime_type: string
  readonly attributes: readonly root_d$.TypeDocumentAttribute[]
  readonly stickers?: readonly TypeInputDocument[]
  readonly video_cover?: TypeInputPhoto
  readonly video_timestamp?: number
  readonly ttl_seconds?: number
}

/** `inputMediaUploadedPhoto#7d8375da` */
export interface InputMediaUploadedPhoto {
  readonly _: 'inputMediaUploadedPhoto'
  readonly spoiler?: true
  readonly live_photo?: true
  readonly file: TypeInputFile
  readonly stickers?: readonly TypeInputDocument[]
  readonly ttl_seconds?: number
  readonly video?: TypeInputDocument
}

/** `inputMediaVenue#c13d1c11` */
export interface InputMediaVenue {
  readonly _: 'inputMediaVenue'
  readonly geo_point: TypeInputGeoPoint
  readonly title: string
  readonly address: string
  readonly provider: string
  readonly venue_id: string
  readonly venue_type: string
}

/** `inputMediaWebPage#c21b8849` */
export interface InputMediaWebPage {
  readonly _: 'inputMediaWebPage'
  readonly force_large_media?: true
  readonly force_small_media?: true
  readonly optional?: true
  readonly url: string
}

/** `inputMessageCallbackQuery#acfa1a7e` */
export interface InputMessageCallbackQuery {
  readonly _: 'inputMessageCallbackQuery'
  readonly id: number
  readonly query_id: bigint
}

/** `inputMessageEntityMentionName#208e68c9` */
export interface InputMessageEntityMentionName {
  readonly _: 'inputMessageEntityMentionName'
  readonly offset: number
  readonly length: number
  readonly user_id: TypeInputUser
}

/** `inputMessageID#a676a322` */
export interface InputMessageID {
  readonly _: 'inputMessageID'
  readonly id: number
}

/** `inputMessagePinned#86872538` */
export interface InputMessagePinned {
  readonly _: 'inputMessagePinned'
}

/** `inputMessageReadMetric#402b4495` */
export interface InputMessageReadMetric {
  readonly _: 'inputMessageReadMetric'
  readonly msg_id: number
  readonly view_id: bigint
  readonly time_in_view_ms: number
  readonly active_time_in_view_ms: number
  readonly height_to_viewport_ratio_permille: number
  readonly seen_range_ratio_permille: number
}

/** `inputMessageReplyTo#bad88395` */
export interface InputMessageReplyTo {
  readonly _: 'inputMessageReplyTo'
  readonly id: number
}

/** `inputMessagesFilterChatPhotos#3a20ecb8` */
export interface InputMessagesFilterChatPhotos {
  readonly _: 'inputMessagesFilterChatPhotos'
}

/** `inputMessagesFilterContacts#e062db83` */
export interface InputMessagesFilterContacts {
  readonly _: 'inputMessagesFilterContacts'
}

/** `inputMessagesFilterDocument#9eddf188` */
export interface InputMessagesFilterDocument {
  readonly _: 'inputMessagesFilterDocument'
}

/** `inputMessagesFilterEmpty#57e2f66c` */
export interface InputMessagesFilterEmpty {
  readonly _: 'inputMessagesFilterEmpty'
}

/** `inputMessagesFilterGeo#e7026d0d` */
export interface InputMessagesFilterGeo {
  readonly _: 'inputMessagesFilterGeo'
}

/** `inputMessagesFilterGif#ffc86587` */
export interface InputMessagesFilterGif {
  readonly _: 'inputMessagesFilterGif'
}

/** `inputMessagesFilterMusic#3751b49e` */
export interface InputMessagesFilterMusic {
  readonly _: 'inputMessagesFilterMusic'
}

/** `inputMessagesFilterMyMentions#c1f8e69a` */
export interface InputMessagesFilterMyMentions {
  readonly _: 'inputMessagesFilterMyMentions'
}

/** `inputMessagesFilterPhoneCalls#80c99768` */
export interface InputMessagesFilterPhoneCalls {
  readonly _: 'inputMessagesFilterPhoneCalls'
  readonly missed?: true
}

/** `inputMessagesFilterPhotoVideo#56e9f0e4` */
export interface InputMessagesFilterPhotoVideo {
  readonly _: 'inputMessagesFilterPhotoVideo'
}

/** `inputMessagesFilterPhotos#9609a51c` */
export interface InputMessagesFilterPhotos {
  readonly _: 'inputMessagesFilterPhotos'
}

/** `inputMessagesFilterPinned#1bb00451` */
export interface InputMessagesFilterPinned {
  readonly _: 'inputMessagesFilterPinned'
}

/** `inputMessagesFilterPoll#fa2bc90a` */
export interface InputMessagesFilterPoll {
  readonly _: 'inputMessagesFilterPoll'
}

/** `inputMessagesFilterRoundVideo#b549da53` */
export interface InputMessagesFilterRoundVideo {
  readonly _: 'inputMessagesFilterRoundVideo'
}

/** `inputMessagesFilterRoundVoice#7a7c17a4` */
export interface InputMessagesFilterRoundVoice {
  readonly _: 'inputMessagesFilterRoundVoice'
}

/** `inputMessagesFilterUrl#7ef0dd87` */
export interface InputMessagesFilterUrl {
  readonly _: 'inputMessagesFilterUrl'
}

/** `inputMessagesFilterVideo#9fc00e65` */
export interface InputMessagesFilterVideo {
  readonly _: 'inputMessagesFilterVideo'
}

/** `inputMessagesFilterVoice#50f5c392` */
export interface InputMessagesFilterVoice {
  readonly _: 'inputMessagesFilterVoice'
}

/** `inputNotifyBroadcasts#b1db7c7e` */
export interface InputNotifyBroadcasts {
  readonly _: 'inputNotifyBroadcasts'
}

/** `inputNotifyChats#4a95e84e` */
export interface InputNotifyChats {
  readonly _: 'inputNotifyChats'
}

/** `inputNotifyCommunity#27bb1adc` */
export interface InputNotifyCommunity {
  readonly _: 'inputNotifyCommunity'
  readonly community: TypeInputChannel
}

/** `inputNotifyForumTopic#5c467992` */
export interface InputNotifyForumTopic {
  readonly _: 'inputNotifyForumTopic'
  readonly peer: TypeInputPeer
  readonly top_msg_id: number
}

/** `inputNotifyPeer#b8bc5b0c` */
export interface InputNotifyPeer {
  readonly _: 'inputNotifyPeer'
  readonly peer: TypeInputPeer
}

/** `inputNotifyUsers#193b4417` */
export interface InputNotifyUsers {
  readonly _: 'inputNotifyUsers'
}

/** `inputPageBlockMap#574b617f` */
export interface InputPageBlockMap {
  readonly _: 'inputPageBlockMap'
  readonly geo: TypeInputGeoPoint
  readonly zoom: number
  readonly w: number
  readonly h: number
  readonly caption: root_p$.TypePageCaption
}

/** `inputPasskeyCredentialFirebasePNV#5b1ccb28` */
export interface InputPasskeyCredentialFirebasePNV {
  readonly _: 'inputPasskeyCredentialFirebasePNV'
  readonly pnv_token: string
}

/** `inputPasskeyCredentialPublicKey#3c27b78f` */
export interface InputPasskeyCredentialPublicKey {
  readonly _: 'inputPasskeyCredentialPublicKey'
  readonly id: string
  readonly raw_id: string
  readonly response: TypeInputPasskeyResponse
}

/** `inputPasskeyResponseLogin#c31fc14a` */
export interface InputPasskeyResponseLogin {
  readonly _: 'inputPasskeyResponseLogin'
  readonly client_data: root_d$.TypeDataJSON
  readonly authenticator_data: Uint8Array
  readonly signature: Uint8Array
  readonly user_handle: string
}

/** `inputPasskeyResponseRegister#3e63935c` */
export interface InputPasskeyResponseRegister {
  readonly _: 'inputPasskeyResponseRegister'
  readonly client_data: root_d$.TypeDataJSON
  readonly attestation_data: Uint8Array
}

/** `inputPaymentCredentials#3417d728` */
export interface InputPaymentCredentials {
  readonly _: 'inputPaymentCredentials'
  readonly save?: true
  readonly data: root_d$.TypeDataJSON
}

/** `inputPaymentCredentialsApplePay#0aa1c39f` */
export interface InputPaymentCredentialsApplePay {
  readonly _: 'inputPaymentCredentialsApplePay'
  readonly payment_data: root_d$.TypeDataJSON
}

/** `inputPaymentCredentialsGooglePay#8ac32801` */
export interface InputPaymentCredentialsGooglePay {
  readonly _: 'inputPaymentCredentialsGooglePay'
  readonly payment_token: root_d$.TypeDataJSON
}

/** `inputPaymentCredentialsSaved#c10eb2cf` */
export interface InputPaymentCredentialsSaved {
  readonly _: 'inputPaymentCredentialsSaved'
  readonly id: string
  readonly tmp_password: Uint8Array
}

/** `inputPeerChannel#27bcbbfc` */
export interface InputPeerChannel {
  readonly _: 'inputPeerChannel'
  readonly channel_id: bigint
  readonly access_hash: bigint
}

/** `inputPeerChannelFromMessage#bd2a0840` */
export interface InputPeerChannelFromMessage {
  readonly _: 'inputPeerChannelFromMessage'
  readonly peer: TypeInputPeer
  readonly msg_id: number
  readonly channel_id: bigint
}

/** `inputPeerChat#35a95cb9` */
export interface InputPeerChat {
  readonly _: 'inputPeerChat'
  readonly chat_id: bigint
}

/** `inputPeerColorCollectible#b8ea86a9` */
export interface InputPeerColorCollectible {
  readonly _: 'inputPeerColorCollectible'
  readonly collectible_id: bigint
}

/** `inputPeerEmpty#7f3b18ea` */
export interface InputPeerEmpty {
  readonly _: 'inputPeerEmpty'
}

/** `inputPeerNotifySettings#cacb6ae2` */
export interface InputPeerNotifySettings {
  readonly _: 'inputPeerNotifySettings'
  readonly show_previews?: boolean
  readonly silent?: boolean
  readonly mute_until?: number
  readonly sound?: root_n$.TypeNotificationSound
  readonly stories_muted?: boolean
  readonly stories_hide_sender?: boolean
  readonly stories_sound?: root_n$.TypeNotificationSound
}

/** `inputPeerPhotoFileLocation#37257e99` */
export interface InputPeerPhotoFileLocation {
  readonly _: 'inputPeerPhotoFileLocation'
  readonly big?: true
  readonly peer: TypeInputPeer
  readonly photo_id: bigint
}

/** `inputPeerSelf#7da07ec9` */
export interface InputPeerSelf {
  readonly _: 'inputPeerSelf'
}

/** `inputPeerUser#dde8a54c` */
export interface InputPeerUser {
  readonly _: 'inputPeerUser'
  readonly user_id: bigint
  readonly access_hash: bigint
}

/** `inputPeerUserFromMessage#a87b0a1c` */
export interface InputPeerUserFromMessage {
  readonly _: 'inputPeerUserFromMessage'
  readonly peer: TypeInputPeer
  readonly msg_id: number
  readonly user_id: bigint
}

/** `inputPhoneCall#1e36fded` */
export interface InputPhoneCall {
  readonly _: 'inputPhoneCall'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputPhoneContact#6a1dc4be` */
export interface InputPhoneContact {
  readonly _: 'inputPhoneContact'
  readonly client_id: bigint
  readonly phone: string
  readonly first_name: string
  readonly last_name: string
  readonly note?: root_t$.TypeTextWithEntities
}

/** `inputPhoto#3bb3b94a` */
export interface InputPhoto {
  readonly _: 'inputPhoto'
  readonly id: bigint
  readonly access_hash: bigint
  readonly file_reference: Uint8Array
}

/** `inputPhotoEmpty#1cd7bf0d` */
export interface InputPhotoEmpty {
  readonly _: 'inputPhotoEmpty'
}

/** `inputPhotoFileLocation#40181ffe` */
export interface InputPhotoFileLocation {
  readonly _: 'inputPhotoFileLocation'
  readonly id: bigint
  readonly access_hash: bigint
  readonly file_reference: Uint8Array
  readonly thumb_size: string
}

/** `inputPhotoLegacyFileLocation#d83466f3` */
export interface InputPhotoLegacyFileLocation {
  readonly _: 'inputPhotoLegacyFileLocation'
  readonly id: bigint
  readonly access_hash: bigint
  readonly file_reference: Uint8Array
  readonly volume_id: bigint
  readonly local_id: number
  readonly secret: bigint
}

/** `inputPollAnswer#199fed96` */
export interface InputPollAnswer {
  readonly _: 'inputPollAnswer'
  readonly text: root_t$.TypeTextWithEntities
  readonly media?: TypeInputMedia
}

/** `inputPrivacyKeyAbout#3823cc40` */
export interface InputPrivacyKeyAbout {
  readonly _: 'inputPrivacyKeyAbout'
}

/** `inputPrivacyKeyAddedByPhone#d1219bdd` */
export interface InputPrivacyKeyAddedByPhone {
  readonly _: 'inputPrivacyKeyAddedByPhone'
}

/** `inputPrivacyKeyBirthday#d65a11cc` */
export interface InputPrivacyKeyBirthday {
  readonly _: 'inputPrivacyKeyBirthday'
}

/** `inputPrivacyKeyChatInvite#bdfb0426` */
export interface InputPrivacyKeyChatInvite {
  readonly _: 'inputPrivacyKeyChatInvite'
}

/** `inputPrivacyKeyForwards#a4dd4c08` */
export interface InputPrivacyKeyForwards {
  readonly _: 'inputPrivacyKeyForwards'
}

/** `inputPrivacyKeyNoPaidMessages#bdc597b4` */
export interface InputPrivacyKeyNoPaidMessages {
  readonly _: 'inputPrivacyKeyNoPaidMessages'
}

/** `inputPrivacyKeyPhoneCall#fabadc5f` */
export interface InputPrivacyKeyPhoneCall {
  readonly _: 'inputPrivacyKeyPhoneCall'
}

/** `inputPrivacyKeyPhoneNumber#0352dafa` */
export interface InputPrivacyKeyPhoneNumber {
  readonly _: 'inputPrivacyKeyPhoneNumber'
}

/** `inputPrivacyKeyPhoneP2P#db9e70d2` */
export interface InputPrivacyKeyPhoneP2P {
  readonly _: 'inputPrivacyKeyPhoneP2P'
}

/** `inputPrivacyKeyProfilePhoto#5719bacc` */
export interface InputPrivacyKeyProfilePhoto {
  readonly _: 'inputPrivacyKeyProfilePhoto'
}

/** `inputPrivacyKeySavedMusic#4dbe9226` */
export interface InputPrivacyKeySavedMusic {
  readonly _: 'inputPrivacyKeySavedMusic'
}

/** `inputPrivacyKeyStarGiftsAutoSave#e1732341` */
export interface InputPrivacyKeyStarGiftsAutoSave {
  readonly _: 'inputPrivacyKeyStarGiftsAutoSave'
}

/** `inputPrivacyKeyStatusTimestamp#4f96cb18` */
export interface InputPrivacyKeyStatusTimestamp {
  readonly _: 'inputPrivacyKeyStatusTimestamp'
}

/** `inputPrivacyKeyVoiceMessages#aee69d68` */
export interface InputPrivacyKeyVoiceMessages {
  readonly _: 'inputPrivacyKeyVoiceMessages'
}

/** `inputPrivacyValueAllowAll#184b35ce` */
export interface InputPrivacyValueAllowAll {
  readonly _: 'inputPrivacyValueAllowAll'
}

/** `inputPrivacyValueAllowBots#5a4fcce5` */
export interface InputPrivacyValueAllowBots {
  readonly _: 'inputPrivacyValueAllowBots'
}

/** `inputPrivacyValueAllowChatParticipants#840649cf` */
export interface InputPrivacyValueAllowChatParticipants {
  readonly _: 'inputPrivacyValueAllowChatParticipants'
  readonly chats: readonly bigint[]
}

/** `inputPrivacyValueAllowCloseFriends#2f453e49` */
export interface InputPrivacyValueAllowCloseFriends {
  readonly _: 'inputPrivacyValueAllowCloseFriends'
}

/** `inputPrivacyValueAllowContacts#0d09e07b` */
export interface InputPrivacyValueAllowContacts {
  readonly _: 'inputPrivacyValueAllowContacts'
}

/** `inputPrivacyValueAllowPremium#77cdc9f1` */
export interface InputPrivacyValueAllowPremium {
  readonly _: 'inputPrivacyValueAllowPremium'
}

/** `inputPrivacyValueAllowUsers#131cc67f` */
export interface InputPrivacyValueAllowUsers {
  readonly _: 'inputPrivacyValueAllowUsers'
  readonly users: readonly TypeInputUser[]
}

/** `inputPrivacyValueDisallowAll#d66b66c9` */
export interface InputPrivacyValueDisallowAll {
  readonly _: 'inputPrivacyValueDisallowAll'
}

/** `inputPrivacyValueDisallowBots#c4e57915` */
export interface InputPrivacyValueDisallowBots {
  readonly _: 'inputPrivacyValueDisallowBots'
}

/** `inputPrivacyValueDisallowChatParticipants#e94f0f86` */
export interface InputPrivacyValueDisallowChatParticipants {
  readonly _: 'inputPrivacyValueDisallowChatParticipants'
  readonly chats: readonly bigint[]
}

/** `inputPrivacyValueDisallowContacts#0ba52007` */
export interface InputPrivacyValueDisallowContacts {
  readonly _: 'inputPrivacyValueDisallowContacts'
}

/** `inputPrivacyValueDisallowUsers#90110467` */
export interface InputPrivacyValueDisallowUsers {
  readonly _: 'inputPrivacyValueDisallowUsers'
  readonly users: readonly TypeInputUser[]
}

/** `inputQuickReplyShortcut#24596d41` */
export interface InputQuickReplyShortcut {
  readonly _: 'inputQuickReplyShortcut'
  readonly shortcut: string
}

/** `inputQuickReplyShortcutId#01190cf1` */
export interface InputQuickReplyShortcutId {
  readonly _: 'inputQuickReplyShortcutId'
  readonly shortcut_id: number
}

/** `inputReplyToEphemeralMessage#4119b95e` */
export interface InputReplyToEphemeralMessage {
  readonly _: 'inputReplyToEphemeralMessage'
  readonly id: number
}

/** `inputReplyToMessage#3bd4b7c2` */
export interface InputReplyToMessage {
  readonly _: 'inputReplyToMessage'
  readonly reply_to_msg_id: number
  readonly top_msg_id?: number
  readonly reply_to_peer_id?: TypeInputPeer
  readonly quote_text?: string
  readonly quote_entities?: readonly root_m$.TypeMessageEntity[]
  readonly quote_offset?: number
  readonly monoforum_peer_id?: TypeInputPeer
  readonly todo_item_id?: number
  readonly poll_option?: Uint8Array
}

/** `inputReplyToMonoForum#69d66c45` */
export interface InputReplyToMonoForum {
  readonly _: 'inputReplyToMonoForum'
  readonly monoforum_peer_id: TypeInputPeer
}

/** `inputReplyToStory#5881323a` */
export interface InputReplyToStory {
  readonly _: 'inputReplyToStory'
  readonly peer: TypeInputPeer
  readonly story_id: number
}

/** `inputReportReasonChildAbuse#adf44ee3` */
export interface InputReportReasonChildAbuse {
  readonly _: 'inputReportReasonChildAbuse'
}

/** `inputReportReasonCopyright#9b89f93a` */
export interface InputReportReasonCopyright {
  readonly _: 'inputReportReasonCopyright'
}

/** `inputReportReasonFake#f5ddd6e7` */
export interface InputReportReasonFake {
  readonly _: 'inputReportReasonFake'
}

/** `inputReportReasonGeoIrrelevant#dbd4feed` */
export interface InputReportReasonGeoIrrelevant {
  readonly _: 'inputReportReasonGeoIrrelevant'
}

/** `inputReportReasonIllegalDrugs#0a8eb2be` */
export interface InputReportReasonIllegalDrugs {
  readonly _: 'inputReportReasonIllegalDrugs'
}

/** `inputReportReasonOther#c1e4a2b1` */
export interface InputReportReasonOther {
  readonly _: 'inputReportReasonOther'
}

/** `inputReportReasonPersonalDetails#9ec7863d` */
export interface InputReportReasonPersonalDetails {
  readonly _: 'inputReportReasonPersonalDetails'
}

/** `inputReportReasonPornography#2e59d922` */
export interface InputReportReasonPornography {
  readonly _: 'inputReportReasonPornography'
}

/** `inputReportReasonSpam#58dbcab8` */
export interface InputReportReasonSpam {
  readonly _: 'inputReportReasonSpam'
}

/** `inputReportReasonViolence#1e22c78d` */
export interface InputReportReasonViolence {
  readonly _: 'inputReportReasonViolence'
}

/** `inputRichFileDocument#83281dbd` */
export interface InputRichFileDocument {
  readonly _: 'inputRichFileDocument'
  readonly id: string
  readonly document: TypeInputDocument
}

/** `inputRichFilePhoto#9b00622b` */
export interface InputRichFilePhoto {
  readonly _: 'inputRichFilePhoto'
  readonly id: string
  readonly photo: TypeInputPhoto
}

/** `inputRichMessage#e4c449fc` */
export interface InputRichMessage {
  readonly _: 'inputRichMessage'
  readonly rtl?: true
  readonly noautolink?: true
  readonly blocks: readonly root_p$.TypePageBlock[]
  readonly photos?: readonly TypeInputPhoto[]
  readonly documents?: readonly TypeInputDocument[]
  readonly users?: readonly TypeInputUser[]
}

/** `inputRichMessageHTML#dacb836a` */
export interface InputRichMessageHTML {
  readonly _: 'inputRichMessageHTML'
  readonly rtl?: true
  readonly noautolink?: true
  readonly html: string
  readonly files?: readonly TypeInputRichFile[]
}

/** `inputRichMessageMarkdown#004b572c` */
export interface InputRichMessageMarkdown {
  readonly _: 'inputRichMessageMarkdown'
  readonly rtl?: true
  readonly noautolink?: true
  readonly markdown: string
  readonly files?: readonly TypeInputRichFile[]
}

/** `inputSavedStarGiftChat#f101aa7f` */
export interface InputSavedStarGiftChat {
  readonly _: 'inputSavedStarGiftChat'
  readonly peer: TypeInputPeer
  readonly saved_id: bigint
}

/** `inputSavedStarGiftSlug#2085c238` */
export interface InputSavedStarGiftSlug {
  readonly _: 'inputSavedStarGiftSlug'
  readonly slug: string
}

/** `inputSavedStarGiftUser#69279795` */
export interface InputSavedStarGiftUser {
  readonly _: 'inputSavedStarGiftUser'
  readonly msg_id: number
}

/** `inputSecureFile#5367e5be` */
export interface InputSecureFile {
  readonly _: 'inputSecureFile'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputSecureFileLocation#cbc7ee28` */
export interface InputSecureFileLocation {
  readonly _: 'inputSecureFileLocation'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputSecureFileUploaded#3334b0f0` */
export interface InputSecureFileUploaded {
  readonly _: 'inputSecureFileUploaded'
  readonly id: bigint
  readonly parts: number
  readonly md5_checksum: string
  readonly file_hash: Uint8Array
  readonly secret: Uint8Array
}

/** `inputSecureValue#db21d0a7` */
export interface InputSecureValue {
  readonly _: 'inputSecureValue'
  readonly type: root_s$.TypeSecureValueType
  readonly data?: root_s$.TypeSecureData
  readonly front_side?: TypeInputSecureFile
  readonly reverse_side?: TypeInputSecureFile
  readonly selfie?: TypeInputSecureFile
  readonly translation?: readonly TypeInputSecureFile[]
  readonly files?: readonly TypeInputSecureFile[]
  readonly plain_data?: root_s$.TypeSecurePlainData
}

/** `inputSendMessageRichMessageDraftAction#a937c7be` */
export interface InputSendMessageRichMessageDraftAction {
  readonly _: 'inputSendMessageRichMessageDraftAction'
  readonly can_stop?: true
  readonly keep_on_stop?: true
  readonly random_id: bigint
  readonly rich_message: TypeInputRichMessage
}

/** `inputSingleMedia#1cc6e91f` */
export interface InputSingleMedia {
  readonly _: 'inputSingleMedia'
  readonly media: TypeInputMedia
  readonly random_id: bigint
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
}

/** `inputStarGiftAuction#02e16c98` */
export interface InputStarGiftAuction {
  readonly _: 'inputStarGiftAuction'
  readonly gift_id: bigint
}

/** `inputStarGiftAuctionSlug#7ab58308` */
export interface InputStarGiftAuctionSlug {
  readonly _: 'inputStarGiftAuctionSlug'
  readonly slug: string
}

/** `inputStarsTransaction#206ae6d1` */
export interface InputStarsTransaction {
  readonly _: 'inputStarsTransaction'
  readonly refund?: true
  readonly id: string
}

/** `inputStickerSetAnimatedEmoji#028703c8` */
export interface InputStickerSetAnimatedEmoji {
  readonly _: 'inputStickerSetAnimatedEmoji'
}

/** `inputStickerSetAnimatedEmojiAnimations#0cde3739` */
export interface InputStickerSetAnimatedEmojiAnimations {
  readonly _: 'inputStickerSetAnimatedEmojiAnimations'
}

/** `inputStickerSetDice#e67f520e` */
export interface InputStickerSetDice {
  readonly _: 'inputStickerSetDice'
  readonly emoticon: string
}

/** `inputStickerSetEmojiChannelDefaultStatuses#49748553` */
export interface InputStickerSetEmojiChannelDefaultStatuses {
  readonly _: 'inputStickerSetEmojiChannelDefaultStatuses'
}

/** `inputStickerSetEmojiDefaultStatuses#29d0f5ee` */
export interface InputStickerSetEmojiDefaultStatuses {
  readonly _: 'inputStickerSetEmojiDefaultStatuses'
}

/** `inputStickerSetEmojiDefaultTopicIcons#44c1f8e9` */
export interface InputStickerSetEmojiDefaultTopicIcons {
  readonly _: 'inputStickerSetEmojiDefaultTopicIcons'
}

/** `inputStickerSetEmojiGenericAnimations#04c4d4ce` */
export interface InputStickerSetEmojiGenericAnimations {
  readonly _: 'inputStickerSetEmojiGenericAnimations'
}

/** `inputStickerSetEmpty#ffb62b95` */
export interface InputStickerSetEmpty {
  readonly _: 'inputStickerSetEmpty'
}

/** `inputStickerSetID#9de7a269` */
export interface InputStickerSetID {
  readonly _: 'inputStickerSetID'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputStickerSetItem#32da9e9c` */
export interface InputStickerSetItem {
  readonly _: 'inputStickerSetItem'
  readonly document: TypeInputDocument
  readonly emoji: string
  readonly mask_coords?: root_m$.TypeMaskCoords
  readonly keywords?: string
}

/** `inputStickerSetPremiumGifts#c88b3b02` */
export interface InputStickerSetPremiumGifts {
  readonly _: 'inputStickerSetPremiumGifts'
}

/** `inputStickerSetShortName#861cc8a0` */
export interface InputStickerSetShortName {
  readonly _: 'inputStickerSetShortName'
  readonly short_name: string
}

/** `inputStickerSetThumb#9d84f3db` */
export interface InputStickerSetThumb {
  readonly _: 'inputStickerSetThumb'
  readonly stickerset: TypeInputStickerSet
  readonly thumb_version: number
}

/** `inputStickerSetTonGifts#1cf671a0` */
export interface InputStickerSetTonGifts {
  readonly _: 'inputStickerSetTonGifts'
}

/** `inputStickeredMediaDocument#0438865b` */
export interface InputStickeredMediaDocument {
  readonly _: 'inputStickeredMediaDocument'
  readonly id: TypeInputDocument
}

/** `inputStickeredMediaPhoto#4a992157` */
export interface InputStickeredMediaPhoto {
  readonly _: 'inputStickeredMediaPhoto'
  readonly id: TypeInputPhoto
}

/** `inputStorePaymentAuthCode#3fc18057` */
export interface InputStorePaymentAuthCode {
  readonly _: 'inputStorePaymentAuthCode'
  readonly restore?: true
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly premium_days: number
  readonly currency: string
  readonly amount: bigint
}

/** `inputStorePaymentGiftPremium#616f7fe8` */
export interface InputStorePaymentGiftPremium {
  readonly _: 'inputStorePaymentGiftPremium'
  readonly user_id: TypeInputUser
  readonly currency: string
  readonly amount: bigint
}

/** `inputStorePaymentPremiumGiftCode#fb790393` */
export interface InputStorePaymentPremiumGiftCode {
  readonly _: 'inputStorePaymentPremiumGiftCode'
  readonly users: readonly TypeInputUser[]
  readonly boost_peer?: TypeInputPeer
  readonly currency: string
  readonly amount: bigint
  readonly message?: root_t$.TypeTextWithEntities
}

/** `inputStorePaymentPremiumGiveaway#160544ca` */
export interface InputStorePaymentPremiumGiveaway {
  readonly _: 'inputStorePaymentPremiumGiveaway'
  readonly only_new_subscribers?: true
  readonly winners_are_visible?: true
  readonly boost_peer: TypeInputPeer
  readonly additional_peers?: readonly TypeInputPeer[]
  readonly countries_iso2?: readonly string[]
  readonly prize_description?: string
  readonly random_id: bigint
  readonly until_date: number
  readonly currency: string
  readonly amount: bigint
}

/** `inputStorePaymentPremiumSubscription#a6751e66` */
export interface InputStorePaymentPremiumSubscription {
  readonly _: 'inputStorePaymentPremiumSubscription'
  readonly restore?: true
  readonly upgrade?: true
}

/** `inputStorePaymentStarsGift#1d741ef7` */
export interface InputStorePaymentStarsGift {
  readonly _: 'inputStorePaymentStarsGift'
  readonly user_id: TypeInputUser
  readonly stars: bigint
  readonly currency: string
  readonly amount: bigint
}

/** `inputStorePaymentStarsGiveaway#751f08fa` */
export interface InputStorePaymentStarsGiveaway {
  readonly _: 'inputStorePaymentStarsGiveaway'
  readonly only_new_subscribers?: true
  readonly winners_are_visible?: true
  readonly stars: bigint
  readonly boost_peer: TypeInputPeer
  readonly additional_peers?: readonly TypeInputPeer[]
  readonly countries_iso2?: readonly string[]
  readonly prize_description?: string
  readonly random_id: bigint
  readonly until_date: number
  readonly currency: string
  readonly amount: bigint
  readonly users: number
}

/** `inputStorePaymentStarsTopup#f9a2a6cb` */
export interface InputStorePaymentStarsTopup {
  readonly _: 'inputStorePaymentStarsTopup'
  readonly stars: bigint
  readonly currency: string
  readonly amount: bigint
  readonly spend_purpose_peer?: TypeInputPeer
}

/** `inputTakeoutFileLocation#29be5899` */
export interface InputTakeoutFileLocation {
  readonly _: 'inputTakeoutFileLocation'
}

/** `inputTheme#3c5693e9` */
export interface InputTheme {
  readonly _: 'inputTheme'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputThemeSettings#8fde504f` */
export interface InputThemeSettings {
  readonly _: 'inputThemeSettings'
  readonly message_colors_animated?: true
  readonly base_theme: root_b$.TypeBaseTheme
  readonly accent_color: number
  readonly outbox_accent_color?: number
  readonly message_colors?: readonly number[]
  readonly wallpaper?: TypeInputWallPaper
  readonly wallpaper_settings?: root_w$.TypeWallPaperSettings
}

/** `inputThemeSlug#f5890df1` */
export interface InputThemeSlug {
  readonly _: 'inputThemeSlug'
  readonly slug: string
}

/** `inputUser#f21158c6` */
export interface InputUser {
  readonly _: 'inputUser'
  readonly user_id: bigint
  readonly access_hash: bigint
}

/** `inputUserEmpty#b98886cf` */
export interface InputUserEmpty {
  readonly _: 'inputUserEmpty'
}

/** `inputUserFromMessage#1da448e2` */
export interface InputUserFromMessage {
  readonly _: 'inputUserFromMessage'
  readonly peer: TypeInputPeer
  readonly msg_id: number
  readonly user_id: bigint
}

/** `inputUserSelf#f7c1b13f` */
export interface InputUserSelf {
  readonly _: 'inputUserSelf'
}

/** `inputWallPaper#e630b979` */
export interface InputWallPaper {
  readonly _: 'inputWallPaper'
  readonly id: bigint
  readonly access_hash: bigint
}

/** `inputWallPaperNoFile#967a462e` */
export interface InputWallPaperNoFile {
  readonly _: 'inputWallPaperNoFile'
  readonly id: bigint
}

/** `inputWallPaperSlug#72091c80` */
export interface InputWallPaperSlug {
  readonly _: 'inputWallPaperSlug'
  readonly slug: string
}

/** `inputWebDocument#9bed434d` */
export interface InputWebDocument {
  readonly _: 'inputWebDocument'
  readonly url: string
  readonly size: number
  readonly mime_type: string
  readonly attributes: readonly root_d$.TypeDocumentAttribute[]
}

/** `inputWebFileAudioAlbumThumbLocation#f46fe924` */
export interface InputWebFileAudioAlbumThumbLocation {
  readonly _: 'inputWebFileAudioAlbumThumbLocation'
  readonly small?: true
  readonly document?: TypeInputDocument
  readonly title?: string
  readonly performer?: string
}

/** `inputWebFileGeoPointLocation#9f2221c9` */
export interface InputWebFileGeoPointLocation {
  readonly _: 'inputWebFileGeoPointLocation'
  readonly geo_point: TypeInputGeoPoint
  readonly access_hash: bigint
  readonly w: number
  readonly h: number
  readonly zoom: number
  readonly scale: number
}

/** `inputWebFileLocation#c239d686` */
export interface InputWebFileLocation {
  readonly _: 'inputWebFileLocation'
  readonly url: string
  readonly access_hash: bigint
}

/** `invoice#049ee584` */
export interface Invoice {
  readonly _: 'invoice'
  readonly test?: true
  readonly name_requested?: true
  readonly phone_requested?: true
  readonly email_requested?: true
  readonly shipping_address_requested?: true
  readonly flexible?: true
  readonly phone_to_provider?: true
  readonly email_to_provider?: true
  readonly recurring?: true
  readonly currency: string
  readonly prices: readonly root_l$.TypeLabeledPrice[]
  readonly max_tip_amount?: bigint
  readonly suggested_tip_amounts?: readonly bigint[]
  readonly terms_url?: string
  readonly subscription_period?: number
}

/** `invokeAfterMsg#cb9f372d` */
export interface InvokeAfterMsg {
  readonly _: 'invokeAfterMsg'
  readonly msg_id: bigint
  readonly query: TlObject
}

/** `invokeAfterMsgs#3dc4b4f0` */
export interface InvokeAfterMsgs {
  readonly _: 'invokeAfterMsgs'
  readonly msg_ids: readonly bigint[]
  readonly query: TlObject
}

/** `invokeWithApnsSecret#0dae54f8` */
export interface InvokeWithApnsSecret {
  readonly _: 'invokeWithApnsSecret'
  readonly nonce: string
  readonly secret: string
  readonly query: TlObject
}

/** `invokeWithBusinessConnection#dd289f8e` */
export interface InvokeWithBusinessConnection {
  readonly _: 'invokeWithBusinessConnection'
  readonly connection_id: string
  readonly query: TlObject
}

/** `invokeWithGooglePlayIntegrity#1df92984` */
export interface InvokeWithGooglePlayIntegrity {
  readonly _: 'invokeWithGooglePlayIntegrity'
  readonly nonce: string
  readonly token: string
  readonly query: TlObject
}

/** `invokeWithLayer#da9b0d0d` */
export interface InvokeWithLayer {
  readonly _: 'invokeWithLayer'
  readonly layer: number
  readonly query: TlObject
}

/** `invokeWithMessagesRange#365275f2` */
export interface InvokeWithMessagesRange {
  readonly _: 'invokeWithMessagesRange'
  readonly range: root_m$.TypeMessageRange
  readonly query: TlObject
}

/** `invokeWithReCaptcha#adbb0f94` */
export interface InvokeWithReCaptcha {
  readonly _: 'invokeWithReCaptcha'
  readonly token: string
  readonly query: TlObject
}

/** `invokeWithTakeout#aca9fd2e` */
export interface InvokeWithTakeout {
  readonly _: 'invokeWithTakeout'
  readonly takeout_id: bigint
  readonly query: TlObject
}

/** `invokeWithoutUpdates#bf9459b7` */
export interface InvokeWithoutUpdates {
  readonly _: 'invokeWithoutUpdates'
  readonly query: TlObject
}

/** Any `ImportedContact`. */
export type TypeImportedContact =
  | ImportedContact

/** Any `InlineBotSwitchPM`. */
export type TypeInlineBotSwitchPM =
  | InlineBotSwitchPM

/** Any `InlineBotWebView`. */
export type TypeInlineBotWebView =
  | InlineBotWebView

/** Any `InlineButtonType`. */
export type TypeInlineButtonType =
  | InlineButtonTypeBuy
  | InlineButtonTypeCallback
  | InlineButtonTypeCopy
  | InlineButtonTypeDisabled
  | InlineButtonTypeGame
  | InlineButtonTypeSwitchInline
  | InlineButtonTypeUrl
  | InlineButtonTypeUrlAuth
  | InlineButtonTypeUserProfile
  | InlineButtonTypeWebView
  | InputInlineButtonTypeUrlAuth
  | InputInlineButtonTypeUserProfile

/** Any `InlineQueryPeerType`. */
export type TypeInlineQueryPeerType =
  | InlineQueryPeerTypeBotPM
  | InlineQueryPeerTypeBroadcast
  | InlineQueryPeerTypeChat
  | InlineQueryPeerTypeMegagroup
  | InlineQueryPeerTypePM
  | InlineQueryPeerTypeSameBotPM

/** Any `InputAiComposeTone`. */
export type TypeInputAiComposeTone =
  | InputAiComposeToneDefault
  | InputAiComposeToneID
  | InputAiComposeToneSingleUse
  | InputAiComposeToneSlug

/** Any `InputAppEvent`. */
export type TypeInputAppEvent =
  | InputAppEvent

/** Any `InputBotApp`. */
export type TypeInputBotApp =
  | InputBotAppID
  | InputBotAppShortName

/** Any `InputBotInlineMessage`. */
export type TypeInputBotInlineMessage =
  | InputBotInlineMessageGame
  | InputBotInlineMessageMediaAuto
  | InputBotInlineMessageMediaContact
  | InputBotInlineMessageMediaGeo
  | InputBotInlineMessageMediaInvoice
  | InputBotInlineMessageMediaVenue
  | InputBotInlineMessageMediaWebPage
  | InputBotInlineMessageRichMessage
  | InputBotInlineMessageText

/** Any `InputBotInlineMessageID`. */
export type TypeInputBotInlineMessageID =
  | InputBotInlineMessageID
  | InputBotInlineMessageID64

/** Any `InputBotInlineResult`. */
export type TypeInputBotInlineResult =
  | InputBotInlineResult
  | InputBotInlineResultDocument
  | InputBotInlineResultGame
  | InputBotInlineResultPhoto

/** Any `InputBusinessAwayMessage`. */
export type TypeInputBusinessAwayMessage =
  | InputBusinessAwayMessage

/** Any `InputBusinessBotRecipients`. */
export type TypeInputBusinessBotRecipients =
  | InputBusinessBotRecipients

/** Any `InputBusinessChatLink`. */
export type TypeInputBusinessChatLink =
  | InputBusinessChatLink

/** Any `InputBusinessGreetingMessage`. */
export type TypeInputBusinessGreetingMessage =
  | InputBusinessGreetingMessage

/** Any `InputBusinessIntro`. */
export type TypeInputBusinessIntro =
  | InputBusinessIntro

/** Any `InputBusinessRecipients`. */
export type TypeInputBusinessRecipients =
  | InputBusinessRecipients

/** Any `InputChannel`. */
export type TypeInputChannel =
  | InputChannel
  | InputChannelEmpty
  | InputChannelFromMessage

/** Any `InputChatPhoto`. */
export type TypeInputChatPhoto =
  | InputChatPhoto
  | InputChatPhotoEmpty
  | InputChatUploadedPhoto

/** Any `InputChatTheme`. */
export type TypeInputChatTheme =
  | InputChatTheme
  | InputChatThemeEmpty
  | InputChatThemeUniqueGift

/** Any `InputChatlist`. */
export type TypeInputChatlist =
  | InputChatlistDialogFilter

/** Any `InputCheckPasswordSRP`. */
export type TypeInputCheckPasswordSRP =
  | InputCheckPasswordEmpty
  | InputCheckPasswordSRP

/** Any `InputClientProxy`. */
export type TypeInputClientProxy =
  | InputClientProxy

/** Any `InputCollectible`. */
export type TypeInputCollectible =
  | InputCollectiblePhone
  | InputCollectibleUsername

/** Any `InputContact`. */
export type TypeInputContact =
  | InputPhoneContact

/** Any `InputDialogPeer`. */
export type TypeInputDialogPeer =
  | InputDialogPeer
  | InputDialogPeerCommunity
  | InputDialogPeerFolder

/** Any `InputDocument`. */
export type TypeInputDocument =
  | InputDocument
  | InputDocumentEmpty

/** Any `InputEncryptedChat`. */
export type TypeInputEncryptedChat =
  | InputEncryptedChat

/** Any `InputEncryptedFile`. */
export type TypeInputEncryptedFile =
  | InputEncryptedFile
  | InputEncryptedFileBigUploaded
  | InputEncryptedFileEmpty
  | InputEncryptedFileUploaded

/** Any `InputFile`. */
export type TypeInputFile =
  | InputFile
  | InputFileBig
  | InputFileStoryDocument

/** Any `InputFileLocation`. */
export type TypeInputFileLocation =
  | InputDocumentFileLocation
  | InputEncryptedFileLocation
  | InputFileLocation
  | InputGroupCallStream
  | InputPeerPhotoFileLocation
  | InputPhotoFileLocation
  | InputPhotoLegacyFileLocation
  | InputSecureFileLocation
  | InputStickerSetThumb
  | InputTakeoutFileLocation

/** Any `InputFolderPeer`. */
export type TypeInputFolderPeer =
  | InputFolderPeer

/** Any `InputGame`. */
export type TypeInputGame =
  | InputGameID
  | InputGameShortName

/** Any `InputGeoPoint`. */
export type TypeInputGeoPoint =
  | InputGeoPoint
  | InputGeoPointEmpty

/** Any `InputGroupCall`. */
export type TypeInputGroupCall =
  | InputGroupCall
  | InputGroupCallInviteMessage
  | InputGroupCallSlug

/** Any `InputInvoice`. */
export type TypeInputInvoice =
  | InputInvoiceBusinessBotTransferStars
  | InputInvoiceChatInviteSubscription
  | InputInvoiceMessage
  | InputInvoicePremiumAuthCode
  | InputInvoicePremiumGiftCode
  | InputInvoicePremiumGiftStars
  | InputInvoiceSlug
  | InputInvoiceStarGift
  | InputInvoiceStarGiftAuctionBid
  | InputInvoiceStarGiftDropOriginalDetails
  | InputInvoiceStarGiftPrepaidUpgrade
  | InputInvoiceStarGiftResale
  | InputInvoiceStarGiftTransfer
  | InputInvoiceStarGiftUpgrade
  | InputInvoiceStars

/** Any `InputMedia`. */
export type TypeInputMedia =
  | InputMediaContact
  | InputMediaDice
  | InputMediaDocument
  | InputMediaDocumentExternal
  | InputMediaEmpty
  | InputMediaGame
  | InputMediaGeoLive
  | InputMediaGeoPoint
  | InputMediaInvoice
  | InputMediaPaidMedia
  | InputMediaPhoto
  | InputMediaPhotoExternal
  | InputMediaPoll
  | InputMediaStakeDice
  | InputMediaStory
  | InputMediaTodo
  | InputMediaUploadedDocument
  | InputMediaUploadedPhoto
  | InputMediaVenue
  | InputMediaWebPage

/** Any `InputMessage`. */
export type TypeInputMessage =
  | InputMessageCallbackQuery
  | InputMessageID
  | InputMessagePinned
  | InputMessageReplyTo

/** Any `InputMessageReadMetric`. */
export type TypeInputMessageReadMetric =
  | InputMessageReadMetric

/** Any `InputNotifyPeer`. */
export type TypeInputNotifyPeer =
  | InputNotifyBroadcasts
  | InputNotifyChats
  | InputNotifyCommunity
  | InputNotifyForumTopic
  | InputNotifyPeer
  | InputNotifyUsers

/** Any `InputPasskeyCredential`. */
export type TypeInputPasskeyCredential =
  | InputPasskeyCredentialFirebasePNV
  | InputPasskeyCredentialPublicKey

/** Any `InputPasskeyResponse`. */
export type TypeInputPasskeyResponse =
  | InputPasskeyResponseLogin
  | InputPasskeyResponseRegister

/** Any `InputPaymentCredentials`. */
export type TypeInputPaymentCredentials =
  | InputPaymentCredentials
  | InputPaymentCredentialsApplePay
  | InputPaymentCredentialsGooglePay
  | InputPaymentCredentialsSaved

/** Any `InputPeer`. */
export type TypeInputPeer =
  | InputPeerChannel
  | InputPeerChannelFromMessage
  | InputPeerChat
  | InputPeerEmpty
  | InputPeerSelf
  | InputPeerUser
  | InputPeerUserFromMessage

/** Any `InputPeerNotifySettings`. */
export type TypeInputPeerNotifySettings =
  | InputPeerNotifySettings

/** Any `InputPhoneCall`. */
export type TypeInputPhoneCall =
  | InputPhoneCall

/** Any `InputPhoto`. */
export type TypeInputPhoto =
  | InputPhoto
  | InputPhotoEmpty

/** Any `InputPrivacyKey`. */
export type TypeInputPrivacyKey =
  | InputPrivacyKeyAbout
  | InputPrivacyKeyAddedByPhone
  | InputPrivacyKeyBirthday
  | InputPrivacyKeyChatInvite
  | InputPrivacyKeyForwards
  | InputPrivacyKeyNoPaidMessages
  | InputPrivacyKeyPhoneCall
  | InputPrivacyKeyPhoneNumber
  | InputPrivacyKeyPhoneP2P
  | InputPrivacyKeyProfilePhoto
  | InputPrivacyKeySavedMusic
  | InputPrivacyKeyStarGiftsAutoSave
  | InputPrivacyKeyStatusTimestamp
  | InputPrivacyKeyVoiceMessages

/** Any `InputPrivacyRule`. */
export type TypeInputPrivacyRule =
  | InputPrivacyValueAllowAll
  | InputPrivacyValueAllowBots
  | InputPrivacyValueAllowChatParticipants
  | InputPrivacyValueAllowCloseFriends
  | InputPrivacyValueAllowContacts
  | InputPrivacyValueAllowPremium
  | InputPrivacyValueAllowUsers
  | InputPrivacyValueDisallowAll
  | InputPrivacyValueDisallowBots
  | InputPrivacyValueDisallowChatParticipants
  | InputPrivacyValueDisallowContacts
  | InputPrivacyValueDisallowUsers

/** Any `InputQuickReplyShortcut`. */
export type TypeInputQuickReplyShortcut =
  | InputQuickReplyShortcut
  | InputQuickReplyShortcutId

/** Any `InputReplyTo`. */
export type TypeInputReplyTo =
  | InputReplyToEphemeralMessage
  | InputReplyToMessage
  | InputReplyToMonoForum
  | InputReplyToStory

/** Any `InputRichFile`. */
export type TypeInputRichFile =
  | InputRichFileDocument
  | InputRichFilePhoto

/** Any `InputRichMessage`. */
export type TypeInputRichMessage =
  | InputRichMessage
  | InputRichMessageHTML
  | InputRichMessageMarkdown

/** Any `InputSavedStarGift`. */
export type TypeInputSavedStarGift =
  | InputSavedStarGiftChat
  | InputSavedStarGiftSlug
  | InputSavedStarGiftUser

/** Any `InputSecureFile`. */
export type TypeInputSecureFile =
  | InputSecureFile
  | InputSecureFileUploaded

/** Any `InputSecureValue`. */
export type TypeInputSecureValue =
  | InputSecureValue

/** Any `InputSingleMedia`. */
export type TypeInputSingleMedia =
  | InputSingleMedia

/** Any `InputStarGiftAuction`. */
export type TypeInputStarGiftAuction =
  | InputStarGiftAuction
  | InputStarGiftAuctionSlug

/** Any `InputStarsTransaction`. */
export type TypeInputStarsTransaction =
  | InputStarsTransaction

/** Any `InputStickerSet`. */
export type TypeInputStickerSet =
  | InputStickerSetAnimatedEmoji
  | InputStickerSetAnimatedEmojiAnimations
  | InputStickerSetDice
  | InputStickerSetEmojiChannelDefaultStatuses
  | InputStickerSetEmojiDefaultStatuses
  | InputStickerSetEmojiDefaultTopicIcons
  | InputStickerSetEmojiGenericAnimations
  | InputStickerSetEmpty
  | InputStickerSetID
  | InputStickerSetPremiumGifts
  | InputStickerSetShortName
  | InputStickerSetTonGifts

/** Any `InputStickerSetItem`. */
export type TypeInputStickerSetItem =
  | InputStickerSetItem

/** Any `InputStickeredMedia`. */
export type TypeInputStickeredMedia =
  | InputStickeredMediaDocument
  | InputStickeredMediaPhoto

/** Any `InputStorePaymentPurpose`. */
export type TypeInputStorePaymentPurpose =
  | InputStorePaymentAuthCode
  | InputStorePaymentGiftPremium
  | InputStorePaymentPremiumGiftCode
  | InputStorePaymentPremiumGiveaway
  | InputStorePaymentPremiumSubscription
  | InputStorePaymentStarsGift
  | InputStorePaymentStarsGiveaway
  | InputStorePaymentStarsTopup

/** Any `InputTheme`. */
export type TypeInputTheme =
  | InputTheme
  | InputThemeSlug

/** Any `InputThemeSettings`. */
export type TypeInputThemeSettings =
  | InputThemeSettings

/** Any `InputUser`. */
export type TypeInputUser =
  | InputUser
  | InputUserEmpty
  | InputUserFromMessage
  | InputUserSelf

/** Any `InputWallPaper`. */
export type TypeInputWallPaper =
  | InputWallPaper
  | InputWallPaperNoFile
  | InputWallPaperSlug

/** Any `InputWebDocument`. */
export type TypeInputWebDocument =
  | InputWebDocument

/** Any `InputWebFileLocation`. */
export type TypeInputWebFileLocation =
  | InputWebFileAudioAlbumThumbLocation
  | InputWebFileGeoPointLocation
  | InputWebFileLocation

/** Any `Invoice`. */
export type TypeInvoice =
  | Invoice
