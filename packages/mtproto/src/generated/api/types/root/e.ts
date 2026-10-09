// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from '../root/c.js'
import type * as root_i$ from '../root/i.js'
import type * as root_m$ from '../root/m.js'
import type * as root_p$ from '../root/p.js'
import type * as root_r$ from '../root/r.js'
import type { TlObject } from '../../../../tl/object.js'

/** `emailVerificationApple#96d074fd` */
export interface EmailVerificationApple {
  readonly _: 'emailVerificationApple'
  readonly token: string
}

/** `emailVerificationCode#922e55a9` */
export interface EmailVerificationCode {
  readonly _: 'emailVerificationCode'
  readonly code: string
}

/** `emailVerificationGoogle#db909ec2` */
export interface EmailVerificationGoogle {
  readonly _: 'emailVerificationGoogle'
  readonly token: string
}

/** `emailVerifyPurposeLoginChange#527d22eb` */
export interface EmailVerifyPurposeLoginChange {
  readonly _: 'emailVerifyPurposeLoginChange'
}

/** `emailVerifyPurposeLoginSetup#4345be73` */
export interface EmailVerifyPurposeLoginSetup {
  readonly _: 'emailVerifyPurposeLoginSetup'
  readonly phone_number: string
  readonly phone_code_hash: string
}

/** `emailVerifyPurposePassport#bbf51685` */
export interface EmailVerifyPurposePassport {
  readonly _: 'emailVerifyPurposePassport'
}

/** `emojiGroup#7a9abda9` */
export interface EmojiGroup {
  readonly _: 'emojiGroup'
  readonly title: string
  readonly icon_emoji_id: bigint
  readonly emoticons: readonly string[]
}

/** `emojiGroupGreeting#80d26cc7` */
export interface EmojiGroupGreeting {
  readonly _: 'emojiGroupGreeting'
  readonly title: string
  readonly icon_emoji_id: bigint
  readonly emoticons: readonly string[]
}

/** `emojiGroupPremium#093bcf34` */
export interface EmojiGroupPremium {
  readonly _: 'emojiGroupPremium'
  readonly title: string
  readonly icon_emoji_id: bigint
}

/** `emojiKeyword#d5b3b9f9` */
export interface EmojiKeyword {
  readonly _: 'emojiKeyword'
  readonly keyword: string
  readonly emoticons: readonly string[]
}

/** `emojiKeywordDeleted#236df622` */
export interface EmojiKeywordDeleted {
  readonly _: 'emojiKeywordDeleted'
  readonly keyword: string
  readonly emoticons: readonly string[]
}

/** `emojiKeywordsDifference#5cc761bd` */
export interface EmojiKeywordsDifference {
  readonly _: 'emojiKeywordsDifference'
  readonly lang_code: string
  readonly from_version: number
  readonly version: number
  readonly keywords: readonly TypeEmojiKeyword[]
}

/** `emojiLanguage#b3fb5361` */
export interface EmojiLanguage {
  readonly _: 'emojiLanguage'
  readonly lang_code: string
}

/** `emojiList#7a1e11d1` */
export interface EmojiList {
  readonly _: 'emojiList'
  readonly hash: bigint
  readonly document_id: readonly bigint[]
}

/** `emojiListNotModified#481eadfa` */
export interface EmojiListNotModified {
  readonly _: 'emojiListNotModified'
}

/** `emojiStatus#e7ff068a` */
export interface EmojiStatus {
  readonly _: 'emojiStatus'
  readonly document_id: bigint
  readonly until?: number
}

/** `emojiStatusCollectible#7184603b` */
export interface EmojiStatusCollectible {
  readonly _: 'emojiStatusCollectible'
  readonly collectible_id: bigint
  readonly document_id: bigint
  readonly title: string
  readonly slug: string
  readonly pattern_document_id: bigint
  readonly center_color: number
  readonly edge_color: number
  readonly pattern_color: number
  readonly text_color: number
  readonly until?: number
}

/** `emojiStatusEmpty#2de11aae` */
export interface EmojiStatusEmpty {
  readonly _: 'emojiStatusEmpty'
}

/** `emojiURL#a575739d` */
export interface EmojiURL {
  readonly _: 'emojiURL'
  readonly url: string
}

/** `encryptedChat#61f0d4c7` */
export interface EncryptedChat {
  readonly _: 'encryptedChat'
  readonly id: number
  readonly access_hash: bigint
  readonly date: number
  readonly admin_id: bigint
  readonly participant_id: bigint
  readonly g_a_or_b: Uint8Array
  readonly key_fingerprint: bigint
}

/** `encryptedChatDiscarded#1e1c7c45` */
export interface EncryptedChatDiscarded {
  readonly _: 'encryptedChatDiscarded'
  readonly history_deleted?: true
  readonly id: number
}

/** `encryptedChatEmpty#ab7ec0a0` */
export interface EncryptedChatEmpty {
  readonly _: 'encryptedChatEmpty'
  readonly id: number
}

/** `encryptedChatRequested#48f1d94c` */
export interface EncryptedChatRequested {
  readonly _: 'encryptedChatRequested'
  readonly folder_id?: number
  readonly id: number
  readonly access_hash: bigint
  readonly date: number
  readonly admin_id: bigint
  readonly participant_id: bigint
  readonly g_a: Uint8Array
}

/** `encryptedChatWaiting#66b25953` */
export interface EncryptedChatWaiting {
  readonly _: 'encryptedChatWaiting'
  readonly id: number
  readonly access_hash: bigint
  readonly date: number
  readonly admin_id: bigint
  readonly participant_id: bigint
}

/** `encryptedFile#a8008cd8` */
export interface EncryptedFile {
  readonly _: 'encryptedFile'
  readonly id: bigint
  readonly access_hash: bigint
  readonly size: bigint
  readonly dc_id: number
  readonly key_fingerprint: number
}

/** `encryptedFileEmpty#c21f497e` */
export interface EncryptedFileEmpty {
  readonly _: 'encryptedFileEmpty'
}

/** `encryptedMessage#ed18c118` */
export interface EncryptedMessage {
  readonly _: 'encryptedMessage'
  readonly random_id: bigint
  readonly chat_id: number
  readonly date: number
  readonly bytes: Uint8Array
  readonly file: TypeEncryptedFile
}

/** `encryptedMessageService#23734b06` */
export interface EncryptedMessageService {
  readonly _: 'encryptedMessageService'
  readonly random_id: bigint
  readonly chat_id: number
  readonly date: number
  readonly bytes: Uint8Array
}

/** `ephemeralMessage#dd27bee9` */
export interface EphemeralMessage {
  readonly _: 'ephemeralMessage'
  readonly out?: true
  readonly welcome_template?: true
  readonly invert_media?: true
  readonly noforwards?: true
  readonly id: number
  readonly from_id: root_p$.TypePeer
  readonly peer_id?: root_p$.TypePeer
  readonly receiver_id: bigint
  readonly top_msg_id?: number
  readonly date: number
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly media?: root_m$.TypeMessageMedia
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly reply_to?: root_m$.TypeMessageReplyHeader
  readonly rich_message?: root_r$.TypeRichMessage
  readonly chat_instance?: bigint
  readonly anchor_msg_id?: number
}

/** `exportedChatlistInvite#0c5181ac` */
export interface ExportedChatlistInvite {
  readonly _: 'exportedChatlistInvite'
  readonly title: string
  readonly url: string
  readonly peers: readonly root_p$.TypePeer[]
}

/** `exportedContactToken#41bf109b` */
export interface ExportedContactToken {
  readonly _: 'exportedContactToken'
  readonly url: string
  readonly expires: number
}

/** `exportedMessageLink#5dab1af4` */
export interface ExportedMessageLink {
  readonly _: 'exportedMessageLink'
  readonly link: string
  readonly html: string
}

/** `exportedStoryLink#3fc9053b` */
export interface ExportedStoryLink {
  readonly _: 'exportedStoryLink'
  readonly link: string
}

/** Any `EmailVerification`. */
export type TypeEmailVerification =
  | EmailVerificationApple
  | EmailVerificationCode
  | EmailVerificationGoogle

/** Any `EmailVerifyPurpose`. */
export type TypeEmailVerifyPurpose =
  | EmailVerifyPurposeLoginChange
  | EmailVerifyPurposeLoginSetup
  | EmailVerifyPurposePassport

/** Any `EmojiGroup`. */
export type TypeEmojiGroup =
  | EmojiGroup
  | EmojiGroupGreeting
  | EmojiGroupPremium

/** Any `EmojiKeyword`. */
export type TypeEmojiKeyword =
  | EmojiKeyword
  | EmojiKeywordDeleted

/** Any `EmojiKeywordsDifference`. */
export type TypeEmojiKeywordsDifference =
  | EmojiKeywordsDifference

/** Any `EmojiLanguage`. */
export type TypeEmojiLanguage =
  | EmojiLanguage

/** Any `EmojiList`. */
export type TypeEmojiList =
  | EmojiList
  | EmojiListNotModified

/** Any `EmojiStatus`. */
export type TypeEmojiStatus =
  | EmojiStatus
  | EmojiStatusCollectible
  | EmojiStatusEmpty
  | root_i$.InputEmojiStatusCollectible

/** Any `EmojiURL`. */
export type TypeEmojiURL =
  | EmojiURL

/** Any `EncryptedChat`. */
export type TypeEncryptedChat =
  | EncryptedChat
  | EncryptedChatDiscarded
  | EncryptedChatEmpty
  | EncryptedChatRequested
  | EncryptedChatWaiting

/** Any `EncryptedFile`. */
export type TypeEncryptedFile =
  | EncryptedFile
  | EncryptedFileEmpty

/** Any `EncryptedMessage`. */
export type TypeEncryptedMessage =
  | EncryptedMessage
  | EncryptedMessageService

/** Any `EphemeralMessage`. */
export type TypeEphemeralMessage =
  | EphemeralMessage

/** Any `ExportedChatInvite`. */
export type TypeExportedChatInvite =
  | root_c$.ChatInviteExported
  | root_c$.ChatInvitePublicJoinRequests

/** Any `ExportedChatlistInvite`. */
export type TypeExportedChatlistInvite =
  | ExportedChatlistInvite

/** Any `ExportedContactToken`. */
export type TypeExportedContactToken =
  | ExportedContactToken

/** Any `ExportedMessageLink`. */
export type TypeExportedMessageLink =
  | ExportedMessageLink

/** Any `ExportedStoryLink`. */
export type TypeExportedStoryLink =
  | ExportedStoryLink
