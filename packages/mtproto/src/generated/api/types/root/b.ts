// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_d$ from '../root/d.js'
import type * as root_g$ from '../root/g.js'
import type * as root_i$ from '../root/i.js'
import type * as root_m$ from '../root/m.js'
import type * as root_p$ from '../root/p.js'
import type * as root_r$ from '../root/r.js'
import type * as root_w$ from '../root/w.js'
import type { TlObject } from '../../../../tl/object.js'

/** `bankCardOpenUrl#f568028a` */
export interface BankCardOpenUrl {
  readonly _: 'bankCardOpenUrl'
  readonly url: string
  readonly name: string
}

/** `baseThemeArctic#5b11125a` */
export interface BaseThemeArctic {
  readonly _: 'baseThemeArctic'
}

/** `baseThemeClassic#c3a12462` */
export interface BaseThemeClassic {
  readonly _: 'baseThemeClassic'
}

/** `baseThemeDay#fbd81688` */
export interface BaseThemeDay {
  readonly _: 'baseThemeDay'
}

/** `baseThemeNight#b7b31ea8` */
export interface BaseThemeNight {
  readonly _: 'baseThemeNight'
}

/** `baseThemeTinted#6d5f77ee` */
export interface BaseThemeTinted {
  readonly _: 'baseThemeTinted'
}

/** `birthday#6c8e1e06` */
export interface Birthday {
  readonly _: 'birthday'
  readonly day: number
  readonly month: number
  readonly year?: number
}

/** `boost#4b3e14d6` */
export interface Boost {
  readonly _: 'boost'
  readonly gift?: true
  readonly giveaway?: true
  readonly unclaimed?: true
  readonly id: string
  readonly user_id?: bigint
  readonly giveaway_msg_id?: number
  readonly date: number
  readonly expires: number
  readonly used_gift_slug?: string
  readonly multiplier?: number
  readonly stars?: bigint
}

/** `botApp#95fcd1d6` */
export interface BotApp {
  readonly _: 'botApp'
  readonly id: bigint
  readonly access_hash: bigint
  readonly short_name: string
  readonly title: string
  readonly description: string
  readonly photo: root_p$.TypePhoto
  readonly document?: root_d$.TypeDocument
  readonly hash: bigint
}

/** `botAppNotModified#5da674b7` */
export interface BotAppNotModified {
  readonly _: 'botAppNotModified'
}

/** `botAppSettings#c99b1950` */
export interface BotAppSettings {
  readonly _: 'botAppSettings'
  readonly placeholder_path?: Uint8Array
  readonly background_color?: number
  readonly background_dark_color?: number
  readonly header_color?: number
  readonly header_dark_color?: number
}

/** `botBusinessConnection#8f34b2f5` */
export interface BotBusinessConnection {
  readonly _: 'botBusinessConnection'
  readonly disabled?: true
  readonly connection_id: string
  readonly user_id: bigint
  readonly dc_id: number
  readonly date: number
  readonly rights?: TypeBusinessBotRights
}

/** `botCommand#c27ac8c7` */
export interface BotCommand {
  readonly _: 'botCommand'
  readonly command: string
  readonly description: string
}

/** `botCommandScopeChatAdmins#b9aa606a` */
export interface BotCommandScopeChatAdmins {
  readonly _: 'botCommandScopeChatAdmins'
}

/** `botCommandScopeChats#6fe1a881` */
export interface BotCommandScopeChats {
  readonly _: 'botCommandScopeChats'
}

/** `botCommandScopeDefault#2f6cb2ab` */
export interface BotCommandScopeDefault {
  readonly _: 'botCommandScopeDefault'
}

/** `botCommandScopePeer#db9d897d` */
export interface BotCommandScopePeer {
  readonly _: 'botCommandScopePeer'
  readonly peer: root_i$.TypeInputPeer
}

/** `botCommandScopePeerAdmins#3fd863d1` */
export interface BotCommandScopePeerAdmins {
  readonly _: 'botCommandScopePeerAdmins'
  readonly peer: root_i$.TypeInputPeer
}

/** `botCommandScopePeerUser#0a1321f3` */
export interface BotCommandScopePeerUser {
  readonly _: 'botCommandScopePeerUser'
  readonly peer: root_i$.TypeInputPeer
  readonly user_id: root_i$.TypeInputUser
}

/** `botCommandScopeUsers#3c4f04d8` */
export interface BotCommandScopeUsers {
  readonly _: 'botCommandScopeUsers'
}

/** `botInfo#4d8a0299` */
export interface BotInfo {
  readonly _: 'botInfo'
  readonly has_preview_medias?: true
  readonly user_id?: bigint
  readonly description?: string
  readonly description_photo?: root_p$.TypePhoto
  readonly description_document?: root_d$.TypeDocument
  readonly commands?: readonly TypeBotCommand[]
  readonly menu_button?: TypeBotMenuButton
  readonly privacy_policy_url?: string
  readonly app_settings?: TypeBotAppSettings
  readonly verifier_settings?: TypeBotVerifierSettings
}

/** `botInlineMediaResult#17db940b` */
export interface BotInlineMediaResult {
  readonly _: 'botInlineMediaResult'
  readonly id: string
  readonly type: string
  readonly photo?: root_p$.TypePhoto
  readonly document?: root_d$.TypeDocument
  readonly title?: string
  readonly description?: string
  readonly send_message: TypeBotInlineMessage
}

/** `botInlineMessageMediaAuto#764cf810` */
export interface BotInlineMessageMediaAuto {
  readonly _: 'botInlineMessageMediaAuto'
  readonly invert_media?: true
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `botInlineMessageMediaContact#18d1cdc2` */
export interface BotInlineMessageMediaContact {
  readonly _: 'botInlineMessageMediaContact'
  readonly phone_number: string
  readonly first_name: string
  readonly last_name: string
  readonly vcard: string
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `botInlineMessageMediaGeo#051846fd` */
export interface BotInlineMessageMediaGeo {
  readonly _: 'botInlineMessageMediaGeo'
  readonly geo: root_g$.TypeGeoPoint
  readonly heading?: number
  readonly period?: number
  readonly proximity_notification_radius?: number
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `botInlineMessageMediaInvoice#354a9b09` */
export interface BotInlineMessageMediaInvoice {
  readonly _: 'botInlineMessageMediaInvoice'
  readonly shipping_address_requested?: true
  readonly test?: true
  readonly title: string
  readonly description: string
  readonly photo?: root_w$.TypeWebDocument
  readonly currency: string
  readonly total_amount: bigint
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `botInlineMessageMediaVenue#8a86659c` */
export interface BotInlineMessageMediaVenue {
  readonly _: 'botInlineMessageMediaVenue'
  readonly geo: root_g$.TypeGeoPoint
  readonly title: string
  readonly address: string
  readonly provider: string
  readonly venue_id: string
  readonly venue_type: string
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `botInlineMessageMediaWebPage#809ad9a6` */
export interface BotInlineMessageMediaWebPage {
  readonly _: 'botInlineMessageMediaWebPage'
  readonly invert_media?: true
  readonly force_large_media?: true
  readonly force_small_media?: true
  readonly manual?: true
  readonly safe?: true
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly url: string
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `botInlineMessageText#8c7f65e2` */
export interface BotInlineMessageText {
  readonly _: 'botInlineMessageText'
  readonly no_webpage?: true
  readonly invert_media?: true
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly reply_markup?: root_r$.TypeReplyMarkup
}

/** `botInlineResult#11965f3a` */
export interface BotInlineResult {
  readonly _: 'botInlineResult'
  readonly id: string
  readonly type: string
  readonly title?: string
  readonly description?: string
  readonly url?: string
  readonly thumb?: root_w$.TypeWebDocument
  readonly content?: root_w$.TypeWebDocument
  readonly send_message: TypeBotInlineMessage
}

/** `botMenuButton#c7b57ce6` */
export interface BotMenuButton {
  readonly _: 'botMenuButton'
  readonly text: string
  readonly url: string
}

/** `botMenuButtonCommands#4258c205` */
export interface BotMenuButtonCommands {
  readonly _: 'botMenuButtonCommands'
}

/** `botMenuButtonDefault#7533a588` */
export interface BotMenuButtonDefault {
  readonly _: 'botMenuButtonDefault'
}

/** `botPreviewMedia#23e91ba3` */
export interface BotPreviewMedia {
  readonly _: 'botPreviewMedia'
  readonly date: number
  readonly media: root_m$.TypeMessageMedia
}

/** `botVerification#f93cd45c` */
export interface BotVerification {
  readonly _: 'botVerification'
  readonly bot_id: bigint
  readonly icon: bigint
  readonly description: string
}

/** `botVerifierSettings#b0cd6617` */
export interface BotVerifierSettings {
  readonly _: 'botVerifierSettings'
  readonly can_modify_custom_description?: true
  readonly icon: bigint
  readonly company: string
  readonly custom_description?: string
}

/** `businessAwayMessage#ef156a5c` */
export interface BusinessAwayMessage {
  readonly _: 'businessAwayMessage'
  readonly offline_only?: true
  readonly shortcut_id: number
  readonly schedule: TypeBusinessAwayMessageSchedule
  readonly recipients: TypeBusinessRecipients
}

/** `businessAwayMessageScheduleAlways#c9b9e2b9` */
export interface BusinessAwayMessageScheduleAlways {
  readonly _: 'businessAwayMessageScheduleAlways'
}

/** `businessAwayMessageScheduleCustom#cc4d9ecc` */
export interface BusinessAwayMessageScheduleCustom {
  readonly _: 'businessAwayMessageScheduleCustom'
  readonly start_date: number
  readonly end_date: number
}

/** `businessAwayMessageScheduleOutsideWorkHours#c3f2f501` */
export interface BusinessAwayMessageScheduleOutsideWorkHours {
  readonly _: 'businessAwayMessageScheduleOutsideWorkHours'
}

/** `businessBotRecipients#b88cf373` */
export interface BusinessBotRecipients {
  readonly _: 'businessBotRecipients'
  readonly existing_chats?: true
  readonly new_chats?: true
  readonly contacts?: true
  readonly non_contacts?: true
  readonly exclude_selected?: true
  readonly users?: readonly bigint[]
  readonly exclude_users?: readonly bigint[]
}

/** `businessBotRights#a0624cf7` */
export interface BusinessBotRights {
  readonly _: 'businessBotRights'
  readonly reply?: true
  readonly read_messages?: true
  readonly delete_sent_messages?: true
  readonly delete_received_messages?: true
  readonly edit_name?: true
  readonly edit_bio?: true
  readonly edit_profile_photo?: true
  readonly edit_username?: true
  readonly view_gifts?: true
  readonly sell_gifts?: true
  readonly change_gift_settings?: true
  readonly transfer_and_upgrade_gifts?: true
  readonly transfer_stars?: true
  readonly manage_stories?: true
}

/** `businessChatLink#b4ae666f` */
export interface BusinessChatLink {
  readonly _: 'businessChatLink'
  readonly link: string
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly title?: string
  readonly views: number
}

/** `businessGreetingMessage#e519abab` */
export interface BusinessGreetingMessage {
  readonly _: 'businessGreetingMessage'
  readonly shortcut_id: number
  readonly recipients: TypeBusinessRecipients
  readonly no_activity_days: number
}

/** `businessIntro#5a0a066d` */
export interface BusinessIntro {
  readonly _: 'businessIntro'
  readonly title: string
  readonly description: string
  readonly sticker?: root_d$.TypeDocument
}

/** `businessLocation#ac5c1af7` */
export interface BusinessLocation {
  readonly _: 'businessLocation'
  readonly geo_point?: root_g$.TypeGeoPoint
  readonly address: string
}

/** `businessRecipients#21108ff7` */
export interface BusinessRecipients {
  readonly _: 'businessRecipients'
  readonly existing_chats?: true
  readonly new_chats?: true
  readonly contacts?: true
  readonly non_contacts?: true
  readonly exclude_selected?: true
  readonly users?: readonly bigint[]
}

/** `businessWeeklyOpen#120b1ab9` */
export interface BusinessWeeklyOpen {
  readonly _: 'businessWeeklyOpen'
  readonly start_minute: number
  readonly end_minute: number
}

/** `businessWorkHours#8c92b098` */
export interface BusinessWorkHours {
  readonly _: 'businessWorkHours'
  readonly open_now?: true
  readonly timezone_id: string
  readonly weekly_open: readonly TypeBusinessWeeklyOpen[]
}

/** Any `BankCardOpenUrl`. */
export type TypeBankCardOpenUrl =
  | BankCardOpenUrl

/** Any `BaseTheme`. */
export type TypeBaseTheme =
  | BaseThemeArctic
  | BaseThemeClassic
  | BaseThemeDay
  | BaseThemeNight
  | BaseThemeTinted

/** Any `Birthday`. */
export type TypeBirthday =
  | Birthday

/** Any `Boost`. */
export type TypeBoost =
  | Boost

/** Any `BotApp`. */
export type TypeBotApp =
  | BotApp
  | BotAppNotModified

/** Any `BotAppSettings`. */
export type TypeBotAppSettings =
  | BotAppSettings

/** Any `BotBusinessConnection`. */
export type TypeBotBusinessConnection =
  | BotBusinessConnection

/** Any `BotCommand`. */
export type TypeBotCommand =
  | BotCommand

/** Any `BotCommandScope`. */
export type TypeBotCommandScope =
  | BotCommandScopeChatAdmins
  | BotCommandScopeChats
  | BotCommandScopeDefault
  | BotCommandScopePeer
  | BotCommandScopePeerAdmins
  | BotCommandScopePeerUser
  | BotCommandScopeUsers

/** Any `BotInfo`. */
export type TypeBotInfo =
  | BotInfo

/** Any `BotInlineMessage`. */
export type TypeBotInlineMessage =
  | BotInlineMessageMediaAuto
  | BotInlineMessageMediaContact
  | BotInlineMessageMediaGeo
  | BotInlineMessageMediaInvoice
  | BotInlineMessageMediaVenue
  | BotInlineMessageMediaWebPage
  | BotInlineMessageText

/** Any `BotInlineResult`. */
export type TypeBotInlineResult =
  | BotInlineMediaResult
  | BotInlineResult

/** Any `BotMenuButton`. */
export type TypeBotMenuButton =
  | BotMenuButton
  | BotMenuButtonCommands
  | BotMenuButtonDefault

/** Any `BotPreviewMedia`. */
export type TypeBotPreviewMedia =
  | BotPreviewMedia

/** Any `BotVerification`. */
export type TypeBotVerification =
  | BotVerification

/** Any `BotVerifierSettings`. */
export type TypeBotVerifierSettings =
  | BotVerifierSettings

/** Any `BusinessAwayMessage`. */
export type TypeBusinessAwayMessage =
  | BusinessAwayMessage

/** Any `BusinessAwayMessageSchedule`. */
export type TypeBusinessAwayMessageSchedule =
  | BusinessAwayMessageScheduleAlways
  | BusinessAwayMessageScheduleCustom
  | BusinessAwayMessageScheduleOutsideWorkHours

/** Any `BusinessBotRecipients`. */
export type TypeBusinessBotRecipients =
  | BusinessBotRecipients

/** Any `BusinessBotRights`. */
export type TypeBusinessBotRights =
  | BusinessBotRights

/** Any `BusinessChatLink`. */
export type TypeBusinessChatLink =
  | BusinessChatLink

/** Any `BusinessGreetingMessage`. */
export type TypeBusinessGreetingMessage =
  | BusinessGreetingMessage

/** Any `BusinessIntro`. */
export type TypeBusinessIntro =
  | BusinessIntro

/** Any `BusinessLocation`. */
export type TypeBusinessLocation =
  | BusinessLocation

/** Any `BusinessRecipients`. */
export type TypeBusinessRecipients =
  | BusinessRecipients

/** Any `BusinessWeeklyOpen`. */
export type TypeBusinessWeeklyOpen =
  | BusinessWeeklyOpen

/** Any `BusinessWorkHours`. */
export type TypeBusinessWorkHours =
  | BusinessWorkHours
