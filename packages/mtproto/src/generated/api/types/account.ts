// GENERATED FILE — do not edit.
// TL types for account
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as auth$ from './auth.js'
import type * as root_a$ from './root/a.js'
import type * as root_b$ from './root/b.js'
import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_e$ from './root/e.js'
import type * as root_m$ from './root/m.js'
import type * as root_p$ from './root/p.js'
import type * as root_s$ from './root/s.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type * as root_w$ from './root/w.js'
import type { TlObject } from '../../../tl/object.js'

/** `account.authorizationForm#ad2e1cd8` */
export interface AuthorizationForm {
  readonly _: 'account.authorizationForm'
  readonly required_types: readonly root_s$.TypeSecureRequiredType[]
  readonly values: readonly root_s$.TypeSecureValue[]
  readonly errors: readonly root_s$.TypeSecureValueError[]
  readonly users: readonly root_u$.TypeUser[]
  readonly privacy_policy_url?: string
}

/** `account.authorizations#4bff8ea0` */
export interface Authorizations {
  readonly _: 'account.authorizations'
  readonly authorization_ttl_days: number
  readonly authorizations: readonly root_a$.TypeAuthorization[]
}

/** `account.autoDownloadSettings#63cacf26` */
export interface AutoDownloadSettings {
  readonly _: 'account.autoDownloadSettings'
  readonly low: root_a$.TypeAutoDownloadSettings
  readonly medium: root_a$.TypeAutoDownloadSettings
  readonly high: root_a$.TypeAutoDownloadSettings
}

/** `account.autoSaveSettings#4c3e069d` */
export interface AutoSaveSettings {
  readonly _: 'account.autoSaveSettings'
  readonly users_settings: root_a$.TypeAutoSaveSettings
  readonly chats_settings: root_a$.TypeAutoSaveSettings
  readonly broadcasts_settings: root_a$.TypeAutoSaveSettings
  readonly exceptions: readonly root_a$.TypeAutoSaveException[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `account.businessChatLinks#ec43a2d1` */
export interface BusinessChatLinks {
  readonly _: 'account.businessChatLinks'
  readonly links: readonly root_b$.TypeBusinessChatLink[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `account.chatThemes#be098173` */
export interface ChatThemes {
  readonly _: 'account.chatThemes'
  readonly hash: bigint
  readonly themes: readonly root_c$.TypeChatTheme[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly next_offset?: string
}

/** `account.chatThemesNotModified#e011e1c4` */
export interface ChatThemesNotModified {
  readonly _: 'account.chatThemesNotModified'
}

/** `account.connectedBots#17d7f87b` */
export interface ConnectedBots {
  readonly _: 'account.connectedBots'
  readonly connected_bots: readonly root_c$.TypeConnectedBot[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `account.contentSettings#57e28221` */
export interface ContentSettings {
  readonly _: 'account.contentSettings'
  readonly sensitive_enabled?: true
  readonly sensitive_can_change?: true
}

/** `account.emailVerified#2b96cd1b` */
export interface EmailVerified {
  readonly _: 'account.emailVerified'
  readonly email: string
}

/** `account.emailVerifiedLogin#e1bb0d61` */
export interface EmailVerifiedLogin {
  readonly _: 'account.emailVerifiedLogin'
  readonly email: string
  readonly sent_code: auth$.TypeSentCode
}

/** `account.emojiStatuses#90c467d1` */
export interface EmojiStatuses {
  readonly _: 'account.emojiStatuses'
  readonly hash: bigint
  readonly statuses: readonly root_e$.TypeEmojiStatus[]
}

/** `account.emojiStatusesNotModified#d08ce645` */
export interface EmojiStatusesNotModified {
  readonly _: 'account.emojiStatusesNotModified'
}

/** `account.paidMessagesRevenue#1e109708` */
export interface PaidMessagesRevenue {
  readonly _: 'account.paidMessagesRevenue'
  readonly stars_amount: bigint
}

/** `account.passkeyRegistrationOptions#e16b5ce1` */
export interface PasskeyRegistrationOptions {
  readonly _: 'account.passkeyRegistrationOptions'
  readonly options: root_d$.TypeDataJSON
}

/** `account.passkeys#f8e0aa1c` */
export interface Passkeys {
  readonly _: 'account.passkeys'
  readonly passkeys: readonly root_p$.TypePasskey[]
}

/** `account.password#957b50fb` */
export interface Password {
  readonly _: 'account.password'
  readonly has_recovery?: true
  readonly has_secure_values?: true
  readonly has_password?: true
  readonly current_algo?: root_p$.TypePasswordKdfAlgo
  readonly srp_B?: Uint8Array
  readonly srp_id?: bigint
  readonly hint?: string
  readonly email_unconfirmed_pattern?: string
  readonly new_algo: root_p$.TypePasswordKdfAlgo
  readonly new_secure_algo: root_s$.TypeSecurePasswordKdfAlgo
  readonly secure_random: Uint8Array
  readonly pending_reset_date?: number
  readonly login_email_pattern?: string
}

/** `account.passwordInputSettings#c23727c9` */
export interface PasswordInputSettings {
  readonly _: 'account.passwordInputSettings'
  readonly new_algo?: root_p$.TypePasswordKdfAlgo
  readonly new_password_hash?: Uint8Array
  readonly hint?: string
  readonly email?: string
  readonly new_secure_settings?: root_s$.TypeSecureSecretSettings
}

/** `account.passwordSettings#9a5c33e5` */
export interface PasswordSettings {
  readonly _: 'account.passwordSettings'
  readonly email?: string
  readonly secure_settings?: root_s$.TypeSecureSecretSettings
}

/** `account.privacyRules#50a04e45` */
export interface PrivacyRules {
  readonly _: 'account.privacyRules'
  readonly rules: readonly root_p$.TypePrivacyRule[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `account.resetPasswordFailedWait#e3779861` */
export interface ResetPasswordFailedWait {
  readonly _: 'account.resetPasswordFailedWait'
  readonly retry_date: number
}

/** `account.resetPasswordOk#e926d63e` */
export interface ResetPasswordOk {
  readonly _: 'account.resetPasswordOk'
}

/** `account.resetPasswordRequestedWait#e9effc7d` */
export interface ResetPasswordRequestedWait {
  readonly _: 'account.resetPasswordRequestedWait'
  readonly until_date: number
}

/** `account.resolvedBusinessChatLinks#9a23af21` */
export interface ResolvedBusinessChatLinks {
  readonly _: 'account.resolvedBusinessChatLinks'
  readonly peer: root_p$.TypePeer
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `account.savedMusicIds#998d6636` */
export interface SavedMusicIds {
  readonly _: 'account.savedMusicIds'
  readonly ids: readonly bigint[]
}

/** `account.savedMusicIdsNotModified#4fc81d6e` */
export interface SavedMusicIdsNotModified {
  readonly _: 'account.savedMusicIdsNotModified'
}

/** `account.savedRingtone#b7263f6d` */
export interface SavedRingtone {
  readonly _: 'account.savedRingtone'
}

/** `account.savedRingtoneConverted#1f307eb7` */
export interface SavedRingtoneConverted {
  readonly _: 'account.savedRingtoneConverted'
  readonly document: root_d$.TypeDocument
}

/** `account.savedRingtones#c1e92cc5` */
export interface SavedRingtones {
  readonly _: 'account.savedRingtones'
  readonly hash: bigint
  readonly ringtones: readonly root_d$.TypeDocument[]
}

/** `account.savedRingtonesNotModified#fbf6e8b1` */
export interface SavedRingtonesNotModified {
  readonly _: 'account.savedRingtonesNotModified'
}

/** `account.sentEmailCode#811f854f` */
export interface SentEmailCode {
  readonly _: 'account.sentEmailCode'
  readonly email_pattern: string
  readonly length: number
}

/** `account.takeout#4dba4501` */
export interface Takeout {
  readonly _: 'account.takeout'
  readonly id: bigint
}

/** `account.themes#9a3d8c6d` */
export interface Themes {
  readonly _: 'account.themes'
  readonly hash: bigint
  readonly themes: readonly root_t$.TypeTheme[]
}

/** `account.themesNotModified#f41eb622` */
export interface ThemesNotModified {
  readonly _: 'account.themesNotModified'
}

/** `account.tmpPassword#db64fd34` */
export interface TmpPassword {
  readonly _: 'account.tmpPassword'
  readonly tmp_password: Uint8Array
  readonly valid_until: number
}

/** Any `account.AuthorizationForm`. */
export type TypeAuthorizationForm =
  | AuthorizationForm

/** Any `account.Authorizations`. */
export type TypeAuthorizations =
  | Authorizations

/** Any `account.AutoDownloadSettings`. */
export type TypeAutoDownloadSettings =
  | AutoDownloadSettings

/** Any `account.AutoSaveSettings`. */
export type TypeAutoSaveSettings =
  | AutoSaveSettings

/** Any `account.BusinessChatLinks`. */
export type TypeBusinessChatLinks =
  | BusinessChatLinks

/** Any `account.ChatThemes`. */
export type TypeChatThemes =
  | ChatThemes
  | ChatThemesNotModified

/** Any `account.ConnectedBots`. */
export type TypeConnectedBots =
  | ConnectedBots

/** Any `account.ContentSettings`. */
export type TypeContentSettings =
  | ContentSettings

/** Any `account.EmailVerified`. */
export type TypeEmailVerified =
  | EmailVerified
  | EmailVerifiedLogin

/** Any `account.EmojiStatuses`. */
export type TypeEmojiStatuses =
  | EmojiStatuses
  | EmojiStatusesNotModified

/** Any `account.PaidMessagesRevenue`. */
export type TypePaidMessagesRevenue =
  | PaidMessagesRevenue

/** Any `account.PasskeyRegistrationOptions`. */
export type TypePasskeyRegistrationOptions =
  | PasskeyRegistrationOptions

/** Any `account.Passkeys`. */
export type TypePasskeys =
  | Passkeys

/** Any `account.Password`. */
export type TypePassword =
  | Password

/** Any `account.PasswordInputSettings`. */
export type TypePasswordInputSettings =
  | PasswordInputSettings

/** Any `account.PasswordSettings`. */
export type TypePasswordSettings =
  | PasswordSettings

/** Any `account.PrivacyRules`. */
export type TypePrivacyRules =
  | PrivacyRules

/** Any `account.ResetPasswordResult`. */
export type TypeResetPasswordResult =
  | ResetPasswordFailedWait
  | ResetPasswordOk
  | ResetPasswordRequestedWait

/** Any `account.ResolvedBusinessChatLinks`. */
export type TypeResolvedBusinessChatLinks =
  | ResolvedBusinessChatLinks

/** Any `account.SavedMusicIds`. */
export type TypeSavedMusicIds =
  | SavedMusicIds
  | SavedMusicIdsNotModified

/** Any `account.SavedRingtone`. */
export type TypeSavedRingtone =
  | SavedRingtone
  | SavedRingtoneConverted

/** Any `account.SavedRingtones`. */
export type TypeSavedRingtones =
  | SavedRingtones
  | SavedRingtonesNotModified

/** Any `account.SentEmailCode`. */
export type TypeSentEmailCode =
  | SentEmailCode

/** Any `account.Takeout`. */
export type TypeTakeout =
  | Takeout

/** Any `account.Themes`. */
export type TypeThemes =
  | Themes
  | ThemesNotModified

/** Any `account.TmpPassword`. */
export type TypeTmpPassword =
  | TmpPassword

/** Any `account.WallPapers`. */
export type TypeWallPapers =
  | WallPapers
  | WallPapersNotModified

/** Any `account.WebAuthorizations`. */
export type TypeWebAuthorizations =
  | WebAuthorizations

/** `account.wallPapers#cdc3858c` */
export interface WallPapers {
  readonly _: 'account.wallPapers'
  readonly hash: bigint
  readonly wallpapers: readonly root_w$.TypeWallPaper[]
}

/** `account.wallPapersNotModified#1c199183` */
export interface WallPapersNotModified {
  readonly _: 'account.wallPapersNotModified'
}

/** `account.webAuthorizations#ed56c9fc` */
export interface WebAuthorizations {
  readonly _: 'account.webAuthorizations'
  readonly authorizations: readonly root_w$.TypeWebAuthorization[]
  readonly users: readonly root_u$.TypeUser[]
}
