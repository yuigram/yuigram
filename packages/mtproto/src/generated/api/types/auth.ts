// GENERATED FILE — do not edit.
// TL types for auth
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as help$ from './help.js'
import type * as root_d$ from './root/d.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

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

/** `auth.exportedAuthorization#b434e2b8` */
export interface ExportedAuthorization {
  readonly _: 'auth.exportedAuthorization'
  readonly id: bigint
  readonly bytes: Uint8Array
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
