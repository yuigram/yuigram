// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_b$ from '../root/b.js'
import type * as root_d$ from '../root/d.js'
import type * as root_m$ from '../root/m.js'
import type * as root_p$ from '../root/p.js'
import type * as root_r$ from '../root/r.js'
import type * as root_w$ from '../root/w.js'
import type { TlObject } from '../../../../tl/object.js'

/** `textAnchor#35553762` */
export interface TextAnchor {
  readonly _: 'textAnchor'
  readonly text: root_r$.TypeRichText
  readonly name: string
}

/** `textBold#6724abc4` */
export interface TextBold {
  readonly _: 'textBold'
  readonly text: root_r$.TypeRichText
}

/** `textConcat#7e6260d7` */
export interface TextConcat {
  readonly _: 'textConcat'
  readonly texts: readonly root_r$.TypeRichText[]
}

/** `textEmail#de5a0dd6` */
export interface TextEmail {
  readonly _: 'textEmail'
  readonly text: root_r$.TypeRichText
  readonly email: string
}

/** `textEmpty#dc3d824f` */
export interface TextEmpty {
  readonly _: 'textEmpty'
}

/** `textFixed#6c3f19b9` */
export interface TextFixed {
  readonly _: 'textFixed'
  readonly text: root_r$.TypeRichText
}

/** `textImage#081ccf4f` */
export interface TextImage {
  readonly _: 'textImage'
  readonly document_id: bigint
  readonly w: number
  readonly h: number
}

/** `textItalic#d912a59c` */
export interface TextItalic {
  readonly _: 'textItalic'
  readonly text: root_r$.TypeRichText
}

/** `textMarked#034b8621` */
export interface TextMarked {
  readonly _: 'textMarked'
  readonly text: root_r$.TypeRichText
}

/** `textPhone#1ccb966a` */
export interface TextPhone {
  readonly _: 'textPhone'
  readonly text: root_r$.TypeRichText
  readonly phone: string
}

/** `textPlain#744694e0` */
export interface TextPlain {
  readonly _: 'textPlain'
  readonly text: string
}

/** `textStrike#9bf8bb95` */
export interface TextStrike {
  readonly _: 'textStrike'
  readonly text: root_r$.TypeRichText
}

/** `textSubscript#ed6a8504` */
export interface TextSubscript {
  readonly _: 'textSubscript'
  readonly text: root_r$.TypeRichText
}

/** `textSuperscript#c7fb5e01` */
export interface TextSuperscript {
  readonly _: 'textSuperscript'
  readonly text: root_r$.TypeRichText
}

/** `textUnderline#c12622c4` */
export interface TextUnderline {
  readonly _: 'textUnderline'
  readonly text: root_r$.TypeRichText
}

/** `textUrl#3c2884c1` */
export interface TextUrl {
  readonly _: 'textUrl'
  readonly text: root_r$.TypeRichText
  readonly url: string
  readonly webpage_id: bigint
}

/** `textWithEntities#751f3146` */
export interface TextWithEntities {
  readonly _: 'textWithEntities'
  readonly text: string
  readonly entities: readonly root_m$.TypeMessageEntity[]
}

/** `theme#a00e67d6` */
export interface Theme {
  readonly _: 'theme'
  readonly creator?: true
  readonly default?: true
  readonly for_chat?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly slug: string
  readonly title: string
  readonly document?: root_d$.TypeDocument
  readonly settings?: readonly TypeThemeSettings[]
  readonly emoticon?: string
  readonly installs_count?: number
}

/** `themeSettings#fa58b6d4` */
export interface ThemeSettings {
  readonly _: 'themeSettings'
  readonly message_colors_animated?: true
  readonly base_theme: root_b$.TypeBaseTheme
  readonly accent_color: number
  readonly outbox_accent_color?: number
  readonly message_colors?: readonly number[]
  readonly wallpaper?: root_w$.TypeWallPaper
}

/** `timezone#ff9289f5` */
export interface Timezone {
  readonly _: 'timezone'
  readonly id: string
  readonly name: string
  readonly utc_offset: number
}

/** `todoCompletion#221bb5e4` */
export interface TodoCompletion {
  readonly _: 'todoCompletion'
  readonly id: number
  readonly completed_by: root_p$.TypePeer
  readonly date: number
}

/** `todoItem#cba9a52f` */
export interface TodoItem {
  readonly _: 'todoItem'
  readonly id: number
  readonly title: TypeTextWithEntities
}

/** `todoList#49b92a26` */
export interface TodoList {
  readonly _: 'todoList'
  readonly others_can_append?: true
  readonly others_can_complete?: true
  readonly title: TypeTextWithEntities
  readonly list: readonly TypeTodoItem[]
}

/** `topPeer#edcdc05b` */
export interface TopPeer {
  readonly _: 'topPeer'
  readonly peer: root_p$.TypePeer
  readonly rating: number
}

/** `topPeerCategoryBotsApp#fd9e7bec` */
export interface TopPeerCategoryBotsApp {
  readonly _: 'topPeerCategoryBotsApp'
}

/** `topPeerCategoryBotsInline#148677e2` */
export interface TopPeerCategoryBotsInline {
  readonly _: 'topPeerCategoryBotsInline'
}

/** `topPeerCategoryBotsPM#ab661b5b` */
export interface TopPeerCategoryBotsPM {
  readonly _: 'topPeerCategoryBotsPM'
}

/** `topPeerCategoryChannels#161d9628` */
export interface TopPeerCategoryChannels {
  readonly _: 'topPeerCategoryChannels'
}

/** `topPeerCategoryCorrespondents#0637b7ed` */
export interface TopPeerCategoryCorrespondents {
  readonly _: 'topPeerCategoryCorrespondents'
}

/** `topPeerCategoryForwardChats#fbeec0f0` */
export interface TopPeerCategoryForwardChats {
  readonly _: 'topPeerCategoryForwardChats'
}

/** `topPeerCategoryForwardUsers#a8406ca9` */
export interface TopPeerCategoryForwardUsers {
  readonly _: 'topPeerCategoryForwardUsers'
}

/** `topPeerCategoryGroups#bd17a14a` */
export interface TopPeerCategoryGroups {
  readonly _: 'topPeerCategoryGroups'
}

/** `topPeerCategoryPeers#fb834291` */
export interface TopPeerCategoryPeers {
  readonly _: 'topPeerCategoryPeers'
  readonly category: TypeTopPeerCategory
  readonly count: number
  readonly peers: readonly TypeTopPeer[]
}

/** `topPeerCategoryPhoneCalls#1e76a78c` */
export interface TopPeerCategoryPhoneCalls {
  readonly _: 'topPeerCategoryPhoneCalls'
}

/** Any `TextWithEntities`. */
export type TypeTextWithEntities =
  | TextWithEntities

/** Any `Theme`. */
export type TypeTheme =
  | Theme

/** Any `ThemeSettings`. */
export type TypeThemeSettings =
  | ThemeSettings

/** Any `Timezone`. */
export type TypeTimezone =
  | Timezone

/** Any `TodoCompletion`. */
export type TypeTodoCompletion =
  | TodoCompletion

/** Any `TodoItem`. */
export type TypeTodoItem =
  | TodoItem

/** Any `TodoList`. */
export type TypeTodoList =
  | TodoList

/** Any `TopPeer`. */
export type TypeTopPeer =
  | TopPeer

/** Any `TopPeerCategory`. */
export type TypeTopPeerCategory =
  | TopPeerCategoryBotsApp
  | TopPeerCategoryBotsInline
  | TopPeerCategoryBotsPM
  | TopPeerCategoryChannels
  | TopPeerCategoryCorrespondents
  | TopPeerCategoryForwardChats
  | TopPeerCategoryForwardUsers
  | TopPeerCategoryGroups
  | TopPeerCategoryPhoneCalls

/** Any `TopPeerCategoryPeers`. */
export type TypeTopPeerCategoryPeers =
  | TopPeerCategoryPeers
