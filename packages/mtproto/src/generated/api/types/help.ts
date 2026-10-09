// GENERATED FILE — do not edit.
// TL types for help
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_i$ from './root/i.js'
import type * as root_j$ from './root/j.js'
import type * as root_m$ from './root/m.js'
import type * as root_p$ from './root/p.js'
import type * as root_r$ from './root/r.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `help.acceptTermsOfService#ee72f79a` */
export interface AcceptTermsOfService {
  readonly _: 'help.acceptTermsOfService'
  readonly id: root_d$.TypeDataJSON
}

/** `help.appConfig#dd18782e` */
export interface AppConfig {
  readonly _: 'help.appConfig'
  readonly hash: number
  readonly config: root_j$.TypeJSONValue
}

/** `help.appConfigNotModified#7cde641d` */
export interface AppConfigNotModified {
  readonly _: 'help.appConfigNotModified'
}

/** `help.appUpdate#ccbbce30` */
export interface AppUpdate {
  readonly _: 'help.appUpdate'
  readonly can_not_skip?: true
  readonly id: number
  readonly version: string
  readonly text: string
  readonly entities: readonly root_m$.TypeMessageEntity[]
  readonly document?: root_d$.TypeDocument
  readonly url?: string
  readonly sticker?: root_d$.TypeDocument
}

/** `help.countriesList#87d0759e` */
export interface CountriesList {
  readonly _: 'help.countriesList'
  readonly countries: readonly TypeCountry[]
  readonly hash: number
}

/** `help.countriesListNotModified#93cc1f32` */
export interface CountriesListNotModified {
  readonly _: 'help.countriesListNotModified'
}

/** `help.country#c3878e23` */
export interface Country {
  readonly _: 'help.country'
  readonly hidden?: true
  readonly iso2: string
  readonly default_name: string
  readonly name?: string
  readonly country_codes: readonly TypeCountryCode[]
}

/** `help.countryCode#4203c5ef` */
export interface CountryCode {
  readonly _: 'help.countryCode'
  readonly country_code: string
  readonly prefixes?: readonly string[]
  readonly patterns?: readonly string[]
}

/** `help.deepLinkInfo#6a4ee832` */
export interface DeepLinkInfo {
  readonly _: 'help.deepLinkInfo'
  readonly update_app?: true
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
}

/** `help.deepLinkInfoEmpty#66afa166` */
export interface DeepLinkInfoEmpty {
  readonly _: 'help.deepLinkInfoEmpty'
}

/** `help.dismissSuggestion#f50dbaa1` */
export interface DismissSuggestion {
  readonly _: 'help.dismissSuggestion'
  readonly peer: root_i$.TypeInputPeer
  readonly suggestion: string
}

/** `help.editUserInfo#66b91b70` */
export interface EditUserInfo {
  readonly _: 'help.editUserInfo'
  readonly user_id: root_i$.TypeInputUser
  readonly message: string
  readonly entities: readonly root_m$.TypeMessageEntity[]
}

/** `help.getAppConfig#61e3f854` */
export interface GetAppConfig {
  readonly _: 'help.getAppConfig'
  readonly hash: number
}

/** `help.getAppUpdate#522d5a7d` */
export interface GetAppUpdate {
  readonly _: 'help.getAppUpdate'
  readonly source: string
}

/** `help.getCdnConfig#52029342` */
export interface GetCdnConfig {
  readonly _: 'help.getCdnConfig'
}

/** `help.getConfig#c4f9186b` */
export interface GetConfig {
  readonly _: 'help.getConfig'
}

/** `help.getCountriesList#735787a8` */
export interface GetCountriesList {
  readonly _: 'help.getCountriesList'
  readonly lang_code: string
  readonly hash: number
}

/** `help.getDeepLinkInfo#3fedc75f` */
export interface GetDeepLinkInfo {
  readonly _: 'help.getDeepLinkInfo'
  readonly path: string
}

/** `help.getInviteText#4d392343` */
export interface GetInviteText {
  readonly _: 'help.getInviteText'
}

/** `help.getNearestDc#1fb33026` */
export interface GetNearestDc {
  readonly _: 'help.getNearestDc'
}

/** `help.getPassportConfig#c661ad08` */
export interface GetPassportConfig {
  readonly _: 'help.getPassportConfig'
  readonly hash: number
}

/** `help.getPeerColors#da80f42f` */
export interface GetPeerColors {
  readonly _: 'help.getPeerColors'
  readonly hash: number
}

/** `help.getPeerProfileColors#abcfa9fd` */
export interface GetPeerProfileColors {
  readonly _: 'help.getPeerProfileColors'
  readonly hash: number
}

/** `help.getPremiumPromo#b81b93d4` */
export interface GetPremiumPromo {
  readonly _: 'help.getPremiumPromo'
}

/** `help.getPromoData#c0977421` */
export interface GetPromoData {
  readonly _: 'help.getPromoData'
}

/** `help.getRecentMeUrls#3dc0f114` */
export interface GetRecentMeUrls {
  readonly _: 'help.getRecentMeUrls'
  readonly referer: string
}

/** `help.getSupport#9cdf08cd` */
export interface GetSupport {
  readonly _: 'help.getSupport'
}

/** `help.getSupportName#d360e72c` */
export interface GetSupportName {
  readonly _: 'help.getSupportName'
}

/** `help.getTermsOfServiceUpdate#2ca51fd1` */
export interface GetTermsOfServiceUpdate {
  readonly _: 'help.getTermsOfServiceUpdate'
}

/** `help.getTimezonesList#49b30240` */
export interface GetTimezonesList {
  readonly _: 'help.getTimezonesList'
  readonly hash: number
}

/** `help.getUserInfo#038a08d3` */
export interface GetUserInfo {
  readonly _: 'help.getUserInfo'
  readonly user_id: root_i$.TypeInputUser
}

/** `help.hidePromoData#1e251c95` */
export interface HidePromoData {
  readonly _: 'help.hidePromoData'
  readonly peer: root_i$.TypeInputPeer
}

/** `help.inviteText#18cb9f78` */
export interface InviteText {
  readonly _: 'help.inviteText'
  readonly message: string
}

/** `help.noAppUpdate#c45a6536` */
export interface NoAppUpdate {
  readonly _: 'help.noAppUpdate'
}

/** `help.passportConfig#a098d6af` */
export interface PassportConfig {
  readonly _: 'help.passportConfig'
  readonly hash: number
  readonly countries_langs: root_d$.TypeDataJSON
}

/** `help.passportConfigNotModified#bfb9f457` */
export interface PassportConfigNotModified {
  readonly _: 'help.passportConfigNotModified'
}

/** `help.peerColorOption#adec6ebe` */
export interface PeerColorOption {
  readonly _: 'help.peerColorOption'
  readonly hidden?: true
  readonly color_id: number
  readonly colors?: TypePeerColorSet
  readonly dark_colors?: TypePeerColorSet
  readonly channel_min_level?: number
  readonly group_min_level?: number
}

/** `help.peerColorProfileSet#767d61eb` */
export interface PeerColorProfileSet {
  readonly _: 'help.peerColorProfileSet'
  readonly palette_colors: readonly number[]
  readonly bg_colors: readonly number[]
  readonly story_colors: readonly number[]
}

/** `help.peerColorSet#26219a58` */
export interface PeerColorSet {
  readonly _: 'help.peerColorSet'
  readonly colors: readonly number[]
}

/** `help.peerColors#00f8ed08` */
export interface PeerColors {
  readonly _: 'help.peerColors'
  readonly hash: number
  readonly colors: readonly TypePeerColorOption[]
}

/** `help.peerColorsNotModified#2ba1f5ce` */
export interface PeerColorsNotModified {
  readonly _: 'help.peerColorsNotModified'
}

/** `help.premiumPromo#5334759c` */
export interface PremiumPromo {
  readonly _: 'help.premiumPromo'
  readonly status_text: string
  readonly status_entities: readonly root_m$.TypeMessageEntity[]
  readonly video_sections: readonly string[]
  readonly videos: readonly root_d$.TypeDocument[]
  readonly period_options: readonly root_p$.TypePremiumSubscriptionOption[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `help.promoData#08a4d87a` */
export interface PromoData {
  readonly _: 'help.promoData'
  readonly proxy?: true
  readonly expires: number
  readonly peer?: root_p$.TypePeer
  readonly psa_type?: string
  readonly psa_message?: string
  readonly pending_suggestions: readonly string[]
  readonly dismissed_suggestions: readonly string[]
  readonly custom_pending_suggestion?: root_p$.TypePendingSuggestion
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `help.promoDataEmpty#98f6ac75` */
export interface PromoDataEmpty {
  readonly _: 'help.promoDataEmpty'
  readonly expires: number
}

/** `help.recentMeUrls#0e0310d7` */
export interface RecentMeUrls {
  readonly _: 'help.recentMeUrls'
  readonly urls: readonly root_r$.TypeRecentMeUrl[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `help.saveAppLog#6f02f748` */
export interface SaveAppLog {
  readonly _: 'help.saveAppLog'
  readonly events: readonly root_i$.TypeInputAppEvent[]
}

/** `help.setBotUpdatesStatus#ec22cfcd` */
export interface SetBotUpdatesStatus {
  readonly _: 'help.setBotUpdatesStatus'
  readonly pending_updates_count: number
  readonly message: string
}

/** `help.support#17c6b5f6` */
export interface Support {
  readonly _: 'help.support'
  readonly phone_number: string
  readonly user: root_u$.TypeUser
}

/** `help.supportName#8c05f1c9` */
export interface SupportName {
  readonly _: 'help.supportName'
  readonly name: string
}

/** `help.termsOfService#780a0310` */
export interface TermsOfService {
  readonly _: 'help.termsOfService'
  readonly popup?: true
  readonly id: root_d$.TypeDataJSON
  readonly text: string
  readonly entities: readonly root_m$.TypeMessageEntity[]
  readonly min_age_confirm?: number
}

/** `help.termsOfServiceUpdate#28ecf961` */
export interface TermsOfServiceUpdate {
  readonly _: 'help.termsOfServiceUpdate'
  readonly expires: number
  readonly terms_of_service: TypeTermsOfService
}

/** `help.termsOfServiceUpdateEmpty#e3309f7f` */
export interface TermsOfServiceUpdateEmpty {
  readonly _: 'help.termsOfServiceUpdateEmpty'
  readonly expires: number
}

/** `help.timezonesList#7b74ed71` */
export interface TimezonesList {
  readonly _: 'help.timezonesList'
  readonly timezones: readonly root_t$.TypeTimezone[]
  readonly hash: number
}

/** `help.timezonesListNotModified#970708cc` */
export interface TimezonesListNotModified {
  readonly _: 'help.timezonesListNotModified'
}

/** Any `help.AppConfig`. */
export type TypeAppConfig =
  | AppConfig
  | AppConfigNotModified

/** Any `help.AppUpdate`. */
export type TypeAppUpdate =
  | AppUpdate
  | NoAppUpdate

/** Any `help.CountriesList`. */
export type TypeCountriesList =
  | CountriesList
  | CountriesListNotModified

/** Any `help.Country`. */
export type TypeCountry =
  | Country

/** Any `help.CountryCode`. */
export type TypeCountryCode =
  | CountryCode

/** Any `help.DeepLinkInfo`. */
export type TypeDeepLinkInfo =
  | DeepLinkInfo
  | DeepLinkInfoEmpty

/** Any `help.InviteText`. */
export type TypeInviteText =
  | InviteText

/** Any `help.PassportConfig`. */
export type TypePassportConfig =
  | PassportConfig
  | PassportConfigNotModified

/** Any `help.PeerColorOption`. */
export type TypePeerColorOption =
  | PeerColorOption

/** Any `help.PeerColorSet`. */
export type TypePeerColorSet =
  | PeerColorProfileSet
  | PeerColorSet

/** Any `help.PeerColors`. */
export type TypePeerColors =
  | PeerColors
  | PeerColorsNotModified

/** Any `help.PremiumPromo`. */
export type TypePremiumPromo =
  | PremiumPromo

/** Any `help.PromoData`. */
export type TypePromoData =
  | PromoData
  | PromoDataEmpty

/** Any `help.RecentMeUrls`. */
export type TypeRecentMeUrls =
  | RecentMeUrls

/** Any `help.Support`. */
export type TypeSupport =
  | Support

/** Any `help.SupportName`. */
export type TypeSupportName =
  | SupportName

/** Any `help.TermsOfService`. */
export type TypeTermsOfService =
  | TermsOfService

/** Any `help.TermsOfServiceUpdate`. */
export type TypeTermsOfServiceUpdate =
  | TermsOfServiceUpdate
  | TermsOfServiceUpdateEmpty

/** Any `help.TimezonesList`. */
export type TypeTimezonesList =
  | TimezonesList
  | TimezonesListNotModified

/** Any `help.UserInfo`. */
export type TypeUserInfo =
  | UserInfo
  | UserInfoEmpty

/** `help.userInfo#01eb3758` */
export interface UserInfo {
  readonly _: 'help.userInfo'
  readonly message: string
  readonly entities: readonly root_m$.TypeMessageEntity[]
  readonly author: string
  readonly date: number
}

/** `help.userInfoEmpty#f3ae2eed` */
export interface UserInfoEmpty {
  readonly _: 'help.userInfoEmpty'
}
