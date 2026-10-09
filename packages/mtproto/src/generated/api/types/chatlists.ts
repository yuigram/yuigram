// GENERATED FILE — do not edit.
// TL types for chatlists
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_e$ from './root/e.js'
import type * as root_i$ from './root/i.js'
import type * as root_p$ from './root/p.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `chatlists.chatlistInvite#f10ece2f` */
export interface ChatlistInvite {
  readonly _: 'chatlists.chatlistInvite'
  readonly title_noanimate?: true
  readonly title: root_t$.TypeTextWithEntities
  readonly emoticon?: string
  readonly peers: readonly root_p$.TypePeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `chatlists.chatlistInviteAlready#fa87f659` */
export interface ChatlistInviteAlready {
  readonly _: 'chatlists.chatlistInviteAlready'
  readonly filter_id: number
  readonly missing_peers: readonly root_p$.TypePeer[]
  readonly already_peers: readonly root_p$.TypePeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `chatlists.chatlistUpdates#93bd878d` */
export interface ChatlistUpdates {
  readonly _: 'chatlists.chatlistUpdates'
  readonly missing_peers: readonly root_p$.TypePeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `chatlists.checkChatlistInvite#41c10fff` */
export interface CheckChatlistInvite {
  readonly _: 'chatlists.checkChatlistInvite'
  readonly slug: string
}

/** `chatlists.deleteExportedInvite#719c5c5e` */
export interface DeleteExportedInvite {
  readonly _: 'chatlists.deleteExportedInvite'
  readonly chatlist: root_i$.TypeInputChatlist
  readonly slug: string
}

/** `chatlists.editExportedInvite#653db63d` */
export interface EditExportedInvite {
  readonly _: 'chatlists.editExportedInvite'
  readonly chatlist: root_i$.TypeInputChatlist
  readonly slug: string
  readonly title?: string
  readonly peers?: readonly root_i$.TypeInputPeer[]
}

/** `chatlists.exportChatlistInvite#8472478e` */
export interface ExportChatlistInvite {
  readonly _: 'chatlists.exportChatlistInvite'
  readonly chatlist: root_i$.TypeInputChatlist
  readonly title: string
  readonly peers: readonly root_i$.TypeInputPeer[]
}

/** `chatlists.exportedChatlistInvite#10e6e3a6` */
export interface ExportedChatlistInvite {
  readonly _: 'chatlists.exportedChatlistInvite'
  readonly filter: root_d$.TypeDialogFilter
  readonly invite: root_e$.TypeExportedChatlistInvite
}

/** `chatlists.exportedInvites#10ab6dc7` */
export interface ExportedInvites {
  readonly _: 'chatlists.exportedInvites'
  readonly invites: readonly root_e$.TypeExportedChatlistInvite[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `chatlists.getChatlistUpdates#89419521` */
export interface GetChatlistUpdates {
  readonly _: 'chatlists.getChatlistUpdates'
  readonly chatlist: root_i$.TypeInputChatlist
}

/** `chatlists.getExportedInvites#ce03da83` */
export interface GetExportedInvites {
  readonly _: 'chatlists.getExportedInvites'
  readonly chatlist: root_i$.TypeInputChatlist
}

/** `chatlists.getLeaveChatlistSuggestions#fdbcd714` */
export interface GetLeaveChatlistSuggestions {
  readonly _: 'chatlists.getLeaveChatlistSuggestions'
  readonly chatlist: root_i$.TypeInputChatlist
}

/** `chatlists.hideChatlistUpdates#66e486fb` */
export interface HideChatlistUpdates {
  readonly _: 'chatlists.hideChatlistUpdates'
  readonly chatlist: root_i$.TypeInputChatlist
}

/** `chatlists.joinChatlistInvite#a6b1e39a` */
export interface JoinChatlistInvite {
  readonly _: 'chatlists.joinChatlistInvite'
  readonly slug: string
  readonly peers: readonly root_i$.TypeInputPeer[]
}

/** `chatlists.joinChatlistUpdates#e089f8f5` */
export interface JoinChatlistUpdates {
  readonly _: 'chatlists.joinChatlistUpdates'
  readonly chatlist: root_i$.TypeInputChatlist
  readonly peers: readonly root_i$.TypeInputPeer[]
}

/** `chatlists.leaveChatlist#74fae13a` */
export interface LeaveChatlist {
  readonly _: 'chatlists.leaveChatlist'
  readonly chatlist: root_i$.TypeInputChatlist
  readonly peers: readonly root_i$.TypeInputPeer[]
}

/** Any `chatlists.ChatlistInvite`. */
export type TypeChatlistInvite =
  | ChatlistInvite
  | ChatlistInviteAlready

/** Any `chatlists.ChatlistUpdates`. */
export type TypeChatlistUpdates =
  | ChatlistUpdates

/** Any `chatlists.ExportedChatlistInvite`. */
export type TypeExportedChatlistInvite =
  | ExportedChatlistInvite

/** Any `chatlists.ExportedInvites`. */
export type TypeExportedInvites =
  | ExportedInvites
