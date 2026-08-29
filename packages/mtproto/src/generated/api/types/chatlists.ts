// GENERATED FILE — do not edit.
// TL types for chatlists
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_e$ from './root/e.js'
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
