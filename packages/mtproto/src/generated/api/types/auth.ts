// GENERATED FILE — do not edit.
// TL types for auth
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as account$ from './account.js'
import type * as help$ from './help.js'
import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_e$ from './root/e.js'
import type * as root_i$ from './root/i.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `auth.acceptLoginToken#e894ad4d` */
export interface AcceptLoginToken {
  readonly _: 'auth.acceptLoginToken'
  readonly token: Uint8Array
}

/** `auth.authorization#2ea2c0d4` */
export interface Authorization {
  readonly _: 'auth.authorization'
  readonly setup_password_required?: true
  readonly otherwise_relogin_days?: number
  readonly tmp_sessions?: number
  readonly future_auth_token?: Uint8Array
  readonly user: root_u$.TypeUser
}

/** `auth.authorizationSignUpRequired#44747e9a` */
export interface AuthorizationSignUpRequired {
  readonly _: 'auth.authorizationSignUpRequired'
  readonly terms_of_service?: help$.TypeTermsOfService
}

/** `auth.bindTempAuthKey#cdd42a05` */
export interface BindTempAuthKey {
  readonly _: 'auth.bindTempAuthKey'
  readonly perm_auth_key_id: bigint
  readonly nonce: bigint
  readonly expires_at: number
  readonly encrypted_message: Uint8Array
}

/** `auth.cancelCode#1f040578` */
export interface CancelCode {
  readonly _: 'auth.cancelCode'
  readonly phone_number: string
  readonly phone_code_hash: string
}

/** `auth.checkPaidAuth#56e59f9c` */
export interface CheckPaidAuth {
  readonly _: 'auth.checkPaidAuth'
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly form_id: bigint
}

/** `auth.checkPassword#d18b4d16` */
export interface CheckPassword {
  readonly _: 'auth.checkPassword'
  readonly password: root_i$.TypeInputCheckPasswordSRP
}

/** `auth.checkRecoveryPassword#0d36bf79` */
export interface CheckRecoveryPassword {
  readonly _: 'auth.checkRecoveryPassword'
  readonly code: string
}

/** `auth.codeTypeCall#741cd3e3` */
export interface CodeTypeCall {
  readonly _: 'auth.codeTypeCall'
}

/** `auth.codeTypeFlashCall#226ccefb` */
export interface CodeTypeFlashCall {
  readonly _: 'auth.codeTypeFlashCall'
}

/** `auth.codeTypeFragmentSms#06ed998c` */
export interface CodeTypeFragmentSms {
  readonly _: 'auth.codeTypeFragmentSms'
}

/** `auth.codeTypeMissedCall#d61ad6ee` */
export interface CodeTypeMissedCall {
  readonly _: 'auth.codeTypeMissedCall'
}

/** `auth.codeTypeSms#72a3158c` */
export interface CodeTypeSms {
  readonly _: 'auth.codeTypeSms'
}

/** `auth.dropTempAuthKeys#8e48a188` */
export interface DropTempAuthKeys {
  readonly _: 'auth.dropTempAuthKeys'
  readonly except_auth_keys: readonly bigint[]
}

/** `auth.exportAuthorization#e5bfffcd` */
export interface ExportAuthorization {
  readonly _: 'auth.exportAuthorization'
  readonly dc_id: number
}

/** `auth.exportLoginToken#b7e085fe` */
export interface ExportLoginToken {
  readonly _: 'auth.exportLoginToken'
  readonly api_id: number
  readonly api_hash: string
  readonly except_ids: readonly bigint[]
}

/** `auth.exportedAuthorization#b434e2b8` */
export interface ExportedAuthorization {
  readonly _: 'auth.exportedAuthorization'
  readonly id: bigint
  readonly bytes: Uint8Array
}

/** `auth.finishPasskeyLogin#9857ad07` */
export interface FinishPasskeyLogin {
  readonly _: 'auth.finishPasskeyLogin'
  readonly credential: root_i$.TypeInputPasskeyCredential
  readonly from_dc_id?: number
  readonly from_auth_key_id?: bigint
}

/** `auth.importAuthorization#a57a7dad` */
export interface ImportAuthorization {
  readonly _: 'auth.importAuthorization'
  readonly id: bigint
  readonly bytes: Uint8Array
}

/** `auth.importBotAuthorization#67a3ff2c` */
export interface ImportBotAuthorization {
  readonly _: 'auth.importBotAuthorization'
  readonly flags: number
  readonly api_id: number
  readonly api_hash: string
  readonly bot_auth_token: string
}

/** `auth.importLoginToken#95ac5ce4` */
export interface ImportLoginToken {
  readonly _: 'auth.importLoginToken'
  readonly token: Uint8Array
}

/** `auth.importWebTokenAuthorization#2db873a9` */
export interface ImportWebTokenAuthorization {
  readonly _: 'auth.importWebTokenAuthorization'
  readonly api_id: number
  readonly api_hash: string
  readonly web_auth_token: string
}

/** `auth.initPasskeyLogin#518ad0b7` */
export interface InitPasskeyLogin {
  readonly _: 'auth.initPasskeyLogin'
  readonly api_id: number
  readonly api_hash: string
}

/** `auth.logOut#3e72ba19` */
export interface LogOut {
  readonly _: 'auth.logOut'
}

/** `auth.loggedOut#c3a2835f` */
export interface LoggedOut {
  readonly _: 'auth.loggedOut'
  readonly future_auth_token?: Uint8Array
}

/** `auth.loginToken#629f1980` */
export interface LoginToken {
  readonly _: 'auth.loginToken'
  readonly expires: number
  readonly token: Uint8Array
}

/** `auth.loginTokenMigrateTo#068e9916` */
export interface LoginTokenMigrateTo {
  readonly _: 'auth.loginTokenMigrateTo'
  readonly dc_id: number
  readonly token: Uint8Array
}

/** `auth.loginTokenSuccess#390d5c5e` */
export interface LoginTokenSuccess {
  readonly _: 'auth.loginTokenSuccess'
  readonly authorization: TypeAuthorization
}

/** `auth.passkeyLoginOptions#e2037789` */
export interface PasskeyLoginOptions {
  readonly _: 'auth.passkeyLoginOptions'
  readonly options: root_d$.TypeDataJSON
}

/** `auth.passwordRecovery#137948a5` */
export interface PasswordRecovery {
  readonly _: 'auth.passwordRecovery'
  readonly email_pattern: string
}

/** `auth.recoverPassword#37096c70` */
export interface RecoverPassword {
  readonly _: 'auth.recoverPassword'
  readonly code: string
  readonly new_settings?: account$.TypePasswordInputSettings
}

/** `auth.reportMissingCode#cb9deff6` */
export interface ReportMissingCode {
  readonly _: 'auth.reportMissingCode'
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly mnc: string
}

/** `auth.requestFirebaseSms#8e39261e` */
export interface RequestFirebaseSms {
  readonly _: 'auth.requestFirebaseSms'
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly safety_net_token?: string
  readonly play_integrity_token?: string
  readonly ios_push_secret?: string
}

/** `auth.requestPasswordRecovery#d897bc66` */
export interface RequestPasswordRecovery {
  readonly _: 'auth.requestPasswordRecovery'
}

/** `auth.resendCode#cae47523` */
export interface ResendCode {
  readonly _: 'auth.resendCode'
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly reason?: string
}

/** `auth.resetAuthorizations#9fab0d1a` */
export interface ResetAuthorizations {
  readonly _: 'auth.resetAuthorizations'
}

/** `auth.resetLoginEmail#7e960193` */
export interface ResetLoginEmail {
  readonly _: 'auth.resetLoginEmail'
  readonly phone_number: string
  readonly phone_code_hash: string
}

/** `auth.sendCode#a677244f` */
export interface SendCode {
  readonly _: 'auth.sendCode'
  readonly phone_number: string
  readonly api_id: number
  readonly api_hash: string
  readonly settings: root_c$.TypeCodeSettings
}

/** `auth.sentCode#5e002502` */
export interface SentCode {
  readonly _: 'auth.sentCode'
  readonly type: TypeSentCodeType
  readonly phone_code_hash: string
  readonly next_type?: TypeCodeType
  readonly timeout?: number
}

/** `auth.sentCodePaymentRequired#e0955a3c` */
export interface SentCodePaymentRequired {
  readonly _: 'auth.sentCodePaymentRequired'
  readonly store_product: string
  readonly phone_code_hash: string
  readonly support_email_address: string
  readonly support_email_subject: string
  readonly currency: string
  readonly amount: bigint
}

/** `auth.sentCodeSuccess#2390fe44` */
export interface SentCodeSuccess {
  readonly _: 'auth.sentCodeSuccess'
  readonly authorization: TypeAuthorization
}

/** `auth.sentCodeTypeApp#3dbb5986` */
export interface SentCodeTypeApp {
  readonly _: 'auth.sentCodeTypeApp'
  readonly length: number
}

/** `auth.sentCodeTypeCall#5353e5a7` */
export interface SentCodeTypeCall {
  readonly _: 'auth.sentCodeTypeCall'
  readonly length: number
}

/** `auth.sentCodeTypeEmailCode#f450f59b` */
export interface SentCodeTypeEmailCode {
  readonly _: 'auth.sentCodeTypeEmailCode'
  readonly apple_signin_allowed?: true
  readonly google_signin_allowed?: true
  readonly email_pattern: string
  readonly length: number
  readonly reset_available_period?: number
  readonly reset_pending_date?: number
}

/** `auth.sentCodeTypeFirebaseSms#009fd736` */
export interface SentCodeTypeFirebaseSms {
  readonly _: 'auth.sentCodeTypeFirebaseSms'
  readonly nonce?: Uint8Array
  readonly play_integrity_project_id?: bigint
  readonly play_integrity_nonce?: Uint8Array
  readonly receipt?: string
  readonly push_timeout?: number
  readonly length: number
}

/** `auth.sentCodeTypeFlashCall#ab03c6d9` */
export interface SentCodeTypeFlashCall {
  readonly _: 'auth.sentCodeTypeFlashCall'
  readonly pattern: string
}

/** `auth.sentCodeTypeFragmentSms#d9565c39` */
export interface SentCodeTypeFragmentSms {
  readonly _: 'auth.sentCodeTypeFragmentSms'
  readonly url: string
  readonly length: number
}

/** `auth.sentCodeTypeMissedCall#82006484` */
export interface SentCodeTypeMissedCall {
  readonly _: 'auth.sentCodeTypeMissedCall'
  readonly prefix: string
  readonly length: number
}

/** `auth.sentCodeTypeSetUpEmailRequired#a5491dea` */
export interface SentCodeTypeSetUpEmailRequired {
  readonly _: 'auth.sentCodeTypeSetUpEmailRequired'
  readonly apple_signin_allowed?: true
  readonly google_signin_allowed?: true
}

/** `auth.sentCodeTypeSms#c000bba2` */
export interface SentCodeTypeSms {
  readonly _: 'auth.sentCodeTypeSms'
  readonly length: number
}

/** `auth.sentCodeTypeSmsPhrase#b37794af` */
export interface SentCodeTypeSmsPhrase {
  readonly _: 'auth.sentCodeTypeSmsPhrase'
  readonly beginning?: string
}

/** `auth.sentCodeTypeSmsWord#a416ac81` */
export interface SentCodeTypeSmsWord {
  readonly _: 'auth.sentCodeTypeSmsWord'
  readonly beginning?: string
}

/** `auth.signIn#8d52a951` */
export interface SignIn {
  readonly _: 'auth.signIn'
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly phone_code?: string
  readonly email_verification?: root_e$.TypeEmailVerification
}

/** `auth.signUp#aac7b717` */
export interface SignUp {
  readonly _: 'auth.signUp'
  readonly no_joined_notifications?: true
  readonly phone_number: string
  readonly phone_code_hash: string
  readonly first_name: string
  readonly last_name: string
}

/** Any `auth.Authorization`. */
export type TypeAuthorization =
  | Authorization
  | AuthorizationSignUpRequired

/** Any `auth.CodeType`. */
export type TypeCodeType =
  | CodeTypeCall
  | CodeTypeFlashCall
  | CodeTypeFragmentSms
  | CodeTypeMissedCall
  | CodeTypeSms

/** Any `auth.ExportedAuthorization`. */
export type TypeExportedAuthorization =
  | ExportedAuthorization

/** Any `auth.LoggedOut`. */
export type TypeLoggedOut =
  | LoggedOut

/** Any `auth.LoginToken`. */
export type TypeLoginToken =
  | LoginToken
  | LoginTokenMigrateTo
  | LoginTokenSuccess

/** Any `auth.PasskeyLoginOptions`. */
export type TypePasskeyLoginOptions =
  | PasskeyLoginOptions

/** Any `auth.PasswordRecovery`. */
export type TypePasswordRecovery =
  | PasswordRecovery

/** Any `auth.SentCode`. */
export type TypeSentCode =
  | SentCode
  | SentCodePaymentRequired
  | SentCodeSuccess

/** Any `auth.SentCodeType`. */
export type TypeSentCodeType =
  | SentCodeTypeApp
  | SentCodeTypeCall
  | SentCodeTypeEmailCode
  | SentCodeTypeFirebaseSms
  | SentCodeTypeFlashCall
  | SentCodeTypeFragmentSms
  | SentCodeTypeMissedCall
  | SentCodeTypeSetUpEmailRequired
  | SentCodeTypeSms
  | SentCodeTypeSmsPhrase
  | SentCodeTypeSmsWord
