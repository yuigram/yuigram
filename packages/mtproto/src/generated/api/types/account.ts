// GENERATED FILE — do not edit.
// TL types for account
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as auth$ from './auth.js'
import type * as root_a$ from './root/a.js'
import type * as root_b$ from './root/b.js'
import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_e$ from './root/e.js'
import type * as root_g$ from './root/g.js'
import type * as root_i$ from './root/i.js'
import type * as root_m$ from './root/m.js'
import type * as root_p$ from './root/p.js'
import type * as root_r$ from './root/r.js'
import type * as root_s$ from './root/s.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type * as root_w$ from './root/w.js'
import type { TlObject } from '../../../tl/object.js'

/** `account.acceptAuthorization#f3ed4c73` */
export interface AcceptAuthorization {
  readonly _: 'account.acceptAuthorization'
  readonly bot_id: bigint
  readonly scope: string
  readonly public_key: string
  readonly value_hashes: readonly root_s$.TypeSecureValueHash[]
  readonly credentials: root_s$.TypeSecureCredentialsEncrypted
}

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

/** `account.cancelPasswordEmail#c1cbd5b6` */
export interface CancelPasswordEmail {
  readonly _: 'account.cancelPasswordEmail'
}

/** `account.changeAuthorizationSettings#40f48462` */
export interface ChangeAuthorizationSettings {
  readonly _: 'account.changeAuthorizationSettings'
  readonly confirmed?: true
  readonly hash: bigint
  readonly encrypted_requests_disabled?: boolean
  readonly call_requests_disabled?: boolean
}

/** `account.changePhone#70c32edb` */
export interface ChangePhone {
  readonly _: 'account.changePhone'
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly phone_code: string
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

/** `account.checkUsername#2714d86c` */
export interface CheckUsername {
  readonly _: 'account.checkUsername'
  readonly username: string
}

/** `account.clearRecentEmojiStatuses#18201aae` */
export interface ClearRecentEmojiStatuses {
  readonly _: 'account.clearRecentEmojiStatuses'
}

/** `account.confirmBotConnection#67ed1f68` */
export interface ConfirmBotConnection {
  readonly _: 'account.confirmBotConnection'
  readonly bot_id: root_i$.TypeInputUser
}

/** `account.confirmPasswordEmail#8fdf1920` */
export interface ConfirmPasswordEmail {
  readonly _: 'account.confirmPasswordEmail'
  readonly code: string
}

/** `account.confirmPhone#5f2178c3` */
export interface ConfirmPhone {
  readonly _: 'account.confirmPhone'
  readonly phone_code_hash: string
  readonly phone_code: string
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

/** `account.createBusinessChatLink#8851e68e` */
export interface CreateBusinessChatLink {
  readonly _: 'account.createBusinessChatLink'
  readonly link: root_i$.TypeInputBusinessChatLink
}

/** `account.createTheme#652e4400` */
export interface CreateTheme {
  readonly _: 'account.createTheme'
  readonly slug: string
  readonly title: string
  readonly document?: root_i$.TypeInputDocument
  readonly settings?: readonly root_i$.TypeInputThemeSettings[]
}

/** `account.declinePasswordReset#4c9409f6` */
export interface DeclinePasswordReset {
  readonly _: 'account.declinePasswordReset'
}

/** `account.deleteAccount#a2c0cf74` */
export interface DeleteAccount {
  readonly _: 'account.deleteAccount'
  readonly reason: string
  readonly password?: root_i$.TypeInputCheckPasswordSRP
}

/** `account.deleteAutoSaveExceptions#53bc0020` */
export interface DeleteAutoSaveExceptions {
  readonly _: 'account.deleteAutoSaveExceptions'
}

/** `account.deleteBusinessChatLink#60073674` */
export interface DeleteBusinessChatLink {
  readonly _: 'account.deleteBusinessChatLink'
  readonly slug: string
}

/** `account.deletePasskey#f5b5563f` */
export interface DeletePasskey {
  readonly _: 'account.deletePasskey'
  readonly id: string
}

/** `account.deleteSecureValue#b880bc4b` */
export interface DeleteSecureValue {
  readonly _: 'account.deleteSecureValue'
  readonly types: readonly root_s$.TypeSecureValueType[]
}

/** `account.deleteWebBrowserSettingsExceptions#86a0765d` */
export interface DeleteWebBrowserSettingsExceptions {
  readonly _: 'account.deleteWebBrowserSettingsExceptions'
}

/** `account.disablePeerConnectedBot#5e437ed9` */
export interface DisablePeerConnectedBot {
  readonly _: 'account.disablePeerConnectedBot'
  readonly peer: root_i$.TypeInputPeer
}

/** `account.editBusinessChatLink#8c3410af` */
export interface EditBusinessChatLink {
  readonly _: 'account.editBusinessChatLink'
  readonly slug: string
  readonly link: root_i$.TypeInputBusinessChatLink
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

/** `account.finishTakeoutSession#1d2652ee` */
export interface FinishTakeoutSession {
  readonly _: 'account.finishTakeoutSession'
  readonly success?: true
}

/** `account.getAccountTTL#08fc711d` */
export interface GetAccountTTL {
  readonly _: 'account.getAccountTTL'
}

/** `account.getAllSecureValues#b288bc7d` */
export interface GetAllSecureValues {
  readonly _: 'account.getAllSecureValues'
}

/** `account.getAuthorizationForm#a929597a` */
export interface GetAuthorizationForm {
  readonly _: 'account.getAuthorizationForm'
  readonly bot_id: bigint
  readonly scope: string
  readonly public_key: string
}

/** `account.getAuthorizations#e320c158` */
export interface GetAuthorizations {
  readonly _: 'account.getAuthorizations'
}

/** `account.getAutoDownloadSettings#56da0b3f` */
export interface GetAutoDownloadSettings {
  readonly _: 'account.getAutoDownloadSettings'
}

/** `account.getAutoSaveSettings#adcbbcda` */
export interface GetAutoSaveSettings {
  readonly _: 'account.getAutoSaveSettings'
}

/** `account.getBotBusinessConnection#76a86270` */
export interface GetBotBusinessConnection {
  readonly _: 'account.getBotBusinessConnection'
  readonly connection_id: string
}

/** `account.getBusinessChatLinks#6f70dde1` */
export interface GetBusinessChatLinks {
  readonly _: 'account.getBusinessChatLinks'
}

/** `account.getChannelDefaultEmojiStatuses#7727a7d5` */
export interface GetChannelDefaultEmojiStatuses {
  readonly _: 'account.getChannelDefaultEmojiStatuses'
  readonly hash: bigint
}

/** `account.getChannelRestrictedStatusEmojis#35a9e0d5` */
export interface GetChannelRestrictedStatusEmojis {
  readonly _: 'account.getChannelRestrictedStatusEmojis'
  readonly hash: bigint
}

/** `account.getChatThemes#d638de89` */
export interface GetChatThemes {
  readonly _: 'account.getChatThemes'
  readonly hash: bigint
}

/** `account.getCollectibleEmojiStatuses#2e7b4543` */
export interface GetCollectibleEmojiStatuses {
  readonly _: 'account.getCollectibleEmojiStatuses'
  readonly hash: bigint
}

/** `account.getConnectedBots#4ea4c80f` */
export interface GetConnectedBots {
  readonly _: 'account.getConnectedBots'
}

/** `account.getContactSignUpNotification#9f07c728` */
export interface GetContactSignUpNotification {
  readonly _: 'account.getContactSignUpNotification'
}

/** `account.getContentSettings#8b9b4dae` */
export interface GetContentSettings {
  readonly _: 'account.getContentSettings'
}

/** `account.getDefaultBackgroundEmojis#a60ab9ce` */
export interface GetDefaultBackgroundEmojis {
  readonly _: 'account.getDefaultBackgroundEmojis'
  readonly hash: bigint
}

/** `account.getDefaultEmojiStatuses#d6753386` */
export interface GetDefaultEmojiStatuses {
  readonly _: 'account.getDefaultEmojiStatuses'
  readonly hash: bigint
}

/** `account.getDefaultGroupPhotoEmojis#915860ae` */
export interface GetDefaultGroupPhotoEmojis {
  readonly _: 'account.getDefaultGroupPhotoEmojis'
  readonly hash: bigint
}

/** `account.getDefaultProfilePhotoEmojis#e2750328` */
export interface GetDefaultProfilePhotoEmojis {
  readonly _: 'account.getDefaultProfilePhotoEmojis'
  readonly hash: bigint
}

/** `account.getGlobalPrivacySettings#eb2b4cf6` */
export interface GetGlobalPrivacySettings {
  readonly _: 'account.getGlobalPrivacySettings'
}

/** `account.getMultiWallPapers#65ad71dc` */
export interface GetMultiWallPapers {
  readonly _: 'account.getMultiWallPapers'
  readonly wallpapers: readonly root_i$.TypeInputWallPaper[]
}

/** `account.getNotifyExceptions#53577479` */
export interface GetNotifyExceptions {
  readonly _: 'account.getNotifyExceptions'
  readonly compare_sound?: true
  readonly compare_stories?: true
  readonly peer?: root_i$.TypeInputNotifyPeer
}

/** `account.getNotifySettings#12b3ad31` */
export interface GetNotifySettings {
  readonly _: 'account.getNotifySettings'
  readonly peer: root_i$.TypeInputNotifyPeer
}

/** `account.getPaidMessagesRevenue#19ba4a67` */
export interface GetPaidMessagesRevenue {
  readonly _: 'account.getPaidMessagesRevenue'
  readonly parent_peer?: root_i$.TypeInputPeer
  readonly user_id: root_i$.TypeInputUser
}

/** `account.getPasskeys#ea1f0c52` */
export interface GetPasskeys {
  readonly _: 'account.getPasskeys'
}

/** `account.getPassword#548a30f5` */
export interface GetPassword {
  readonly _: 'account.getPassword'
}

/** `account.getPasswordSettings#9cd4eaf9` */
export interface GetPasswordSettings {
  readonly _: 'account.getPasswordSettings'
  readonly password: root_i$.TypeInputCheckPasswordSRP
}

/** `account.getPrivacy#dadbc950` */
export interface GetPrivacy {
  readonly _: 'account.getPrivacy'
  readonly key: root_i$.TypeInputPrivacyKey
}

/** `account.getReactionsNotifySettings#06dd654c` */
export interface GetReactionsNotifySettings {
  readonly _: 'account.getReactionsNotifySettings'
}

/** `account.getRecentEmojiStatuses#0f578105` */
export interface GetRecentEmojiStatuses {
  readonly _: 'account.getRecentEmojiStatuses'
  readonly hash: bigint
}

/** `account.getSavedMusicIds#e09d5faf` */
export interface GetSavedMusicIds {
  readonly _: 'account.getSavedMusicIds'
  readonly hash: bigint
}

/** `account.getSavedRingtones#e1902288` */
export interface GetSavedRingtones {
  readonly _: 'account.getSavedRingtones'
  readonly hash: bigint
}

/** `account.getSecureValue#73665bc2` */
export interface GetSecureValue {
  readonly _: 'account.getSecureValue'
  readonly types: readonly root_s$.TypeSecureValueType[]
}

/** `account.getTheme#3a5869ec` */
export interface GetTheme {
  readonly _: 'account.getTheme'
  readonly format: string
  readonly theme: root_i$.TypeInputTheme
}

/** `account.getThemes#7206e458` */
export interface GetThemes {
  readonly _: 'account.getThemes'
  readonly format: string
  readonly hash: bigint
}

/** `account.getTmpPassword#449e0b51` */
export interface GetTmpPassword {
  readonly _: 'account.getTmpPassword'
  readonly password: root_i$.TypeInputCheckPasswordSRP
  readonly period: number
}

/** `account.getUniqueGiftChatThemes#e42ce9c9` */
export interface GetUniqueGiftChatThemes {
  readonly _: 'account.getUniqueGiftChatThemes'
  readonly offset: string
  readonly limit: number
  readonly hash: bigint
}

/** `account.getWallPaper#fc8ddbea` */
export interface GetWallPaper {
  readonly _: 'account.getWallPaper'
  readonly wallpaper: root_i$.TypeInputWallPaper
}

/** `account.getWallPapers#07967d36` */
export interface GetWallPapers {
  readonly _: 'account.getWallPapers'
  readonly hash: bigint
}

/** `account.getWebAuthorizations#182e6d6f` */
export interface GetWebAuthorizations {
  readonly _: 'account.getWebAuthorizations'
}

/** `account.getWebBrowserSettings#56655768` */
export interface GetWebBrowserSettings {
  readonly _: 'account.getWebBrowserSettings'
  readonly hash: bigint
}

/** `account.initPasskeyRegistration#429547e8` */
export interface InitPasskeyRegistration {
  readonly _: 'account.initPasskeyRegistration'
}

/** `account.initTakeoutSession#8ef3eab0` */
export interface InitTakeoutSession {
  readonly _: 'account.initTakeoutSession'
  readonly contacts?: true
  readonly message_users?: true
  readonly message_chats?: true
  readonly message_megagroups?: true
  readonly message_channels?: true
  readonly files?: true
  readonly file_max_size?: bigint
}

/** `account.installTheme#c727bb3b` */
export interface InstallTheme {
  readonly _: 'account.installTheme'
  readonly dark?: true
  readonly theme?: root_i$.TypeInputTheme
  readonly format?: string
  readonly base_theme?: root_b$.TypeBaseTheme
}

/** `account.installWallPaper#feed5769` */
export interface InstallWallPaper {
  readonly _: 'account.installWallPaper'
  readonly wallpaper: root_i$.TypeInputWallPaper
  readonly settings: root_w$.TypeWallPaperSettings
}

/** `account.invalidateSignInCodes#ca8ae8ba` */
export interface InvalidateSignInCodes {
  readonly _: 'account.invalidateSignInCodes'
  readonly codes: readonly string[]
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

/** `account.registerDevice#ec86017a` */
export interface RegisterDevice {
  readonly _: 'account.registerDevice'
  readonly no_muted?: true
  readonly token_type: number
  readonly token: string
  readonly app_sandbox: boolean
  readonly secret: Uint8Array
  readonly other_uids: readonly bigint[]
}

/** `account.registerPasskey#55b41fd6` */
export interface RegisterPasskey {
  readonly _: 'account.registerPasskey'
  readonly credential: root_i$.TypeInputPasskeyCredential
}

/** `account.reorderUsernames#ef500eab` */
export interface ReorderUsernames {
  readonly _: 'account.reorderUsernames'
  readonly order: readonly string[]
}

/** `account.reportPeer#c5ba3d86` */
export interface ReportPeer {
  readonly _: 'account.reportPeer'
  readonly peer: root_i$.TypeInputPeer
  readonly reason: root_r$.TypeReportReason
  readonly message: string
}

/** `account.reportProfilePhoto#fa8cc6f5` */
export interface ReportProfilePhoto {
  readonly _: 'account.reportProfilePhoto'
  readonly peer: root_i$.TypeInputPeer
  readonly photo_id: root_i$.TypeInputPhoto
  readonly reason: root_r$.TypeReportReason
  readonly message: string
}

/** `account.resendPasswordEmail#7a7f2a15` */
export interface ResendPasswordEmail {
  readonly _: 'account.resendPasswordEmail'
}

/** `account.resetAuthorization#df77f3bc` */
export interface ResetAuthorization {
  readonly _: 'account.resetAuthorization'
  readonly hash: bigint
}

/** `account.resetNotifySettings#db7e1747` */
export interface ResetNotifySettings {
  readonly _: 'account.resetNotifySettings'
}

/** `account.resetPassword#9308ce1b` */
export interface ResetPassword {
  readonly _: 'account.resetPassword'
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

/** `account.resetWallPapers#bb3b9804` */
export interface ResetWallPapers {
  readonly _: 'account.resetWallPapers'
}

/** `account.resetWebAuthorization#2d01b9ef` */
export interface ResetWebAuthorization {
  readonly _: 'account.resetWebAuthorization'
  readonly hash: bigint
}

/** `account.resetWebAuthorizations#682d2594` */
export interface ResetWebAuthorizations {
  readonly _: 'account.resetWebAuthorizations'
}

/** `account.resolveBusinessChatLink#5492e5ee` */
export interface ResolveBusinessChatLink {
  readonly _: 'account.resolveBusinessChatLink'
  readonly slug: string
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

/** `account.saveAutoDownloadSettings#76f36233` */
export interface SaveAutoDownloadSettings {
  readonly _: 'account.saveAutoDownloadSettings'
  readonly low?: true
  readonly high?: true
  readonly settings: root_a$.TypeAutoDownloadSettings
}

/** `account.saveAutoSaveSettings#d69b8361` */
export interface SaveAutoSaveSettings {
  readonly _: 'account.saveAutoSaveSettings'
  readonly users?: true
  readonly chats?: true
  readonly broadcasts?: true
  readonly peer?: root_i$.TypeInputPeer
  readonly settings: root_a$.TypeAutoSaveSettings
}

/** `account.saveMusic#b26732a9` */
export interface SaveMusic {
  readonly _: 'account.saveMusic'
  readonly unsave?: true
  readonly id: root_i$.TypeInputDocument
  readonly after_id?: root_i$.TypeInputDocument
}

/** `account.saveRingtone#3dea5b03` */
export interface SaveRingtone {
  readonly _: 'account.saveRingtone'
  readonly id: root_i$.TypeInputDocument
  readonly unsave: boolean
}

/** `account.saveSecureValue#899fe31d` */
export interface SaveSecureValue {
  readonly _: 'account.saveSecureValue'
  readonly value: root_i$.TypeInputSecureValue
  readonly secure_secret_id: bigint
}

/** `account.saveTheme#f257106c` */
export interface SaveTheme {
  readonly _: 'account.saveTheme'
  readonly theme: root_i$.TypeInputTheme
  readonly unsave: boolean
}

/** `account.saveWallPaper#6c5a5b37` */
export interface SaveWallPaper {
  readonly _: 'account.saveWallPaper'
  readonly wallpaper: root_i$.TypeInputWallPaper
  readonly unsave: boolean
  readonly settings: root_w$.TypeWallPaperSettings
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

/** `account.sendChangePhoneCode#82574ae5` */
export interface SendChangePhoneCode {
  readonly _: 'account.sendChangePhoneCode'
  readonly phone_number: string
  readonly settings: root_c$.TypeCodeSettings
}

/** `account.sendConfirmPhoneCode#1b3faa88` */
export interface SendConfirmPhoneCode {
  readonly _: 'account.sendConfirmPhoneCode'
  readonly hash: string
  readonly settings: root_c$.TypeCodeSettings
}

/** `account.sendVerifyEmailCode#98e037bb` */
export interface SendVerifyEmailCode {
  readonly _: 'account.sendVerifyEmailCode'
  readonly purpose: root_e$.TypeEmailVerifyPurpose
  readonly email: string
}

/** `account.sendVerifyPhoneCode#a5a356f9` */
export interface SendVerifyPhoneCode {
  readonly _: 'account.sendVerifyPhoneCode'
  readonly phone_number: string
  readonly settings: root_c$.TypeCodeSettings
}

/** `account.sentEmailCode#811f854f` */
export interface SentEmailCode {
  readonly _: 'account.sentEmailCode'
  readonly email_pattern: string
  readonly length: number
}

/** `account.setAccountTTL#2442485e` */
export interface SetAccountTTL {
  readonly _: 'account.setAccountTTL'
  readonly ttl: root_a$.TypeAccountDaysTTL
}

/** `account.setAuthorizationTTL#bf899aa0` */
export interface SetAuthorizationTTL {
  readonly _: 'account.setAuthorizationTTL'
  readonly authorization_ttl_days: number
}

/** `account.setContactSignUpNotification#cff43f61` */
export interface SetContactSignUpNotification {
  readonly _: 'account.setContactSignUpNotification'
  readonly silent: boolean
}

/** `account.setContentSettings#b574b16b` */
export interface SetContentSettings {
  readonly _: 'account.setContentSettings'
  readonly sensitive_enabled?: true
}

/** `account.setGlobalPrivacySettings#1edaaac2` */
export interface SetGlobalPrivacySettings {
  readonly _: 'account.setGlobalPrivacySettings'
  readonly settings: root_g$.TypeGlobalPrivacySettings
}

/** `account.setMainProfileTab#5dee78b0` */
export interface SetMainProfileTab {
  readonly _: 'account.setMainProfileTab'
  readonly tab: root_p$.TypeProfileTab
}

/** `account.setPrivacy#c9f81ce8` */
export interface SetPrivacy {
  readonly _: 'account.setPrivacy'
  readonly key: root_i$.TypeInputPrivacyKey
  readonly rules: readonly root_i$.TypeInputPrivacyRule[]
}

/** `account.setReactionsNotifySettings#316ce548` */
export interface SetReactionsNotifySettings {
  readonly _: 'account.setReactionsNotifySettings'
  readonly settings: root_r$.TypeReactionsNotifySettings
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

/** `account.toggleConnectedBotPaused#646e1097` */
export interface ToggleConnectedBotPaused {
  readonly _: 'account.toggleConnectedBotPaused'
  readonly peer: root_i$.TypeInputPeer
  readonly paused: boolean
}

/** `account.toggleNoPaidMessagesException#fe2eda76` */
export interface ToggleNoPaidMessagesException {
  readonly _: 'account.toggleNoPaidMessagesException'
  readonly refund_charged?: true
  readonly require_payment?: true
  readonly parent_peer?: root_i$.TypeInputPeer
  readonly user_id: root_i$.TypeInputUser
}

/** `account.toggleSponsoredMessages#b9d9a38d` */
export interface ToggleSponsoredMessages {
  readonly _: 'account.toggleSponsoredMessages'
  readonly enabled: boolean
}

/** `account.toggleUsername#58d6b376` */
export interface ToggleUsername {
  readonly _: 'account.toggleUsername'
  readonly username: string
  readonly active: boolean
}

/** `account.toggleWebBrowserSettingsException#60ed4229` */
export interface ToggleWebBrowserSettingsException {
  readonly _: 'account.toggleWebBrowserSettingsException'
  readonly delete?: true
  readonly open_external_browser?: boolean
  readonly url: string
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

/** Any `account.WebBrowserSettings`. */
export type TypeWebBrowserSettings =
  | WebBrowserSettings
  | WebBrowserSettingsNotModified

/** `account.unregisterDevice#6a0d3206` */
export interface UnregisterDevice {
  readonly _: 'account.unregisterDevice'
  readonly token_type: number
  readonly token: string
  readonly other_uids: readonly bigint[]
}

/** `account.updateBirthday#cc6e0c11` */
export interface UpdateBirthday {
  readonly _: 'account.updateBirthday'
  readonly birthday?: root_b$.TypeBirthday
}

/** `account.updateBusinessAwayMessage#a26a7fa5` */
export interface UpdateBusinessAwayMessage {
  readonly _: 'account.updateBusinessAwayMessage'
  readonly message?: root_i$.TypeInputBusinessAwayMessage
}

/** `account.updateBusinessGreetingMessage#66cdafc4` */
export interface UpdateBusinessGreetingMessage {
  readonly _: 'account.updateBusinessGreetingMessage'
  readonly message?: root_i$.TypeInputBusinessGreetingMessage
}

/** `account.updateBusinessIntro#a614d034` */
export interface UpdateBusinessIntro {
  readonly _: 'account.updateBusinessIntro'
  readonly intro?: root_i$.TypeInputBusinessIntro
}

/** `account.updateBusinessLocation#9e6b131a` */
export interface UpdateBusinessLocation {
  readonly _: 'account.updateBusinessLocation'
  readonly geo_point?: root_i$.TypeInputGeoPoint
  readonly address?: string
}

/** `account.updateBusinessWorkHours#4b00e066` */
export interface UpdateBusinessWorkHours {
  readonly _: 'account.updateBusinessWorkHours'
  readonly business_work_hours?: root_b$.TypeBusinessWorkHours
}

/** `account.updateColor#684d214e` */
export interface UpdateColor {
  readonly _: 'account.updateColor'
  readonly for_profile?: true
  readonly color?: root_p$.TypePeerColor
}

/** `account.updateConnectedBot#66a08c7e` */
export interface UpdateConnectedBot {
  readonly _: 'account.updateConnectedBot'
  readonly deleted?: true
  readonly rights?: root_b$.TypeBusinessBotRights
  readonly bot: root_i$.TypeInputUser
  readonly recipients: root_i$.TypeInputBusinessBotRecipients
}

/** `account.updateDeviceLocked#38df3532` */
export interface UpdateDeviceLocked {
  readonly _: 'account.updateDeviceLocked'
  readonly period: number
}

/** `account.updateEmojiStatus#fbd3de6b` */
export interface UpdateEmojiStatus {
  readonly _: 'account.updateEmojiStatus'
  readonly emoji_status: root_e$.TypeEmojiStatus
}

/** `account.updateNotifySettings#84be5b93` */
export interface UpdateNotifySettings {
  readonly _: 'account.updateNotifySettings'
  readonly peer: root_i$.TypeInputNotifyPeer
  readonly settings: root_i$.TypeInputPeerNotifySettings
}

/** `account.updatePasswordSettings#a59b102f` */
export interface UpdatePasswordSettings {
  readonly _: 'account.updatePasswordSettings'
  readonly password: root_i$.TypeInputCheckPasswordSRP
  readonly new_settings: TypePasswordInputSettings
}

/** `account.updatePersonalChannel#d94305e0` */
export interface UpdatePersonalChannel {
  readonly _: 'account.updatePersonalChannel'
  readonly channel: root_i$.TypeInputChannel
}

/** `account.updateProfile#78515775` */
export interface UpdateProfile {
  readonly _: 'account.updateProfile'
  readonly first_name?: string
  readonly last_name?: string
  readonly about?: string
}

/** `account.updateStatus#6628562c` */
export interface UpdateStatus {
  readonly _: 'account.updateStatus'
  readonly offline: boolean
}

/** `account.updateTheme#2bf40ccc` */
export interface UpdateTheme {
  readonly _: 'account.updateTheme'
  readonly format: string
  readonly theme: root_i$.TypeInputTheme
  readonly slug?: string
  readonly title?: string
  readonly document?: root_i$.TypeInputDocument
  readonly settings?: readonly root_i$.TypeInputThemeSettings[]
}

/** `account.updateUsername#3e0bdd7c` */
export interface UpdateUsername {
  readonly _: 'account.updateUsername'
  readonly username: string
}

/** `account.updateWebBrowserSettings#9adf82fe` */
export interface UpdateWebBrowserSettings {
  readonly _: 'account.updateWebBrowserSettings'
  readonly open_external_browser?: true
  readonly display_close_button?: true
}

/** `account.uploadRingtone#831a83a2` */
export interface UploadRingtone {
  readonly _: 'account.uploadRingtone'
  readonly file: root_i$.TypeInputFile
  readonly file_name: string
  readonly mime_type: string
}

/** `account.uploadTheme#1c3db333` */
export interface UploadTheme {
  readonly _: 'account.uploadTheme'
  readonly file: root_i$.TypeInputFile
  readonly thumb?: root_i$.TypeInputFile
  readonly file_name: string
  readonly mime_type: string
}

/** `account.uploadWallPaper#e39a8f03` */
export interface UploadWallPaper {
  readonly _: 'account.uploadWallPaper'
  readonly for_chat?: true
  readonly file: root_i$.TypeInputFile
  readonly mime_type: string
  readonly settings: root_w$.TypeWallPaperSettings
}

/** `account.verifyEmail#032da4cf` */
export interface VerifyEmail {
  readonly _: 'account.verifyEmail'
  readonly purpose: root_e$.TypeEmailVerifyPurpose
  readonly verification: root_e$.TypeEmailVerification
}

/** `account.verifyPhone#4dd3a7f6` */
export interface VerifyPhone {
  readonly _: 'account.verifyPhone'
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly phone_code: string
}

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

/** `account.webBrowserSettings#79eb8cb3` */
export interface WebBrowserSettings {
  readonly _: 'account.webBrowserSettings'
  readonly open_external_browser?: true
  readonly display_close_button?: true
  readonly external_exceptions: readonly root_w$.TypeWebDomainException[]
  readonly inapp_exceptions: readonly root_w$.TypeWebDomainException[]
  readonly hash: bigint
}

/** `account.webBrowserSettingsNotModified#c31c8f4e` */
export interface WebBrowserSettingsNotModified {
  readonly _: 'account.webBrowserSettingsNotModified'
}
