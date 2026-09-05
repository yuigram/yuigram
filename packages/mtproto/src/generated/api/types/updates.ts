// GENERATED FILE — do not edit.
// TL types for updates
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_e$ from './root/e.js'
import type * as root_i$ from './root/i.js'
import type * as root_m$ from './root/m.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `updates.channelDifference#2064674e` */
export interface ChannelDifference {
  readonly _: 'updates.channelDifference'
  readonly final?: true
  readonly pts: number
  readonly timeout?: number
  readonly new_messages: readonly root_m$.TypeMessage[]
  readonly other_updates: readonly root_u$.TypeUpdate[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `updates.channelDifferenceEmpty#3e11affb` */
export interface ChannelDifferenceEmpty {
  readonly _: 'updates.channelDifferenceEmpty'
  readonly final?: true
  readonly pts: number
  readonly timeout?: number
}

/** `updates.channelDifferenceTooLong#a4bcc6fe` */
export interface ChannelDifferenceTooLong {
  readonly _: 'updates.channelDifferenceTooLong'
  readonly final?: true
  readonly timeout?: number
  readonly dialog: root_d$.TypeDialog
  readonly messages: readonly root_m$.TypeMessage[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `updates.difference#00f49ca0` */
export interface Difference {
  readonly _: 'updates.difference'
  readonly new_messages: readonly root_m$.TypeMessage[]
  readonly new_encrypted_messages: readonly root_e$.TypeEncryptedMessage[]
  readonly other_updates: readonly root_u$.TypeUpdate[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly state: TypeState
}

/** `updates.differenceEmpty#5d75a138` */
export interface DifferenceEmpty {
  readonly _: 'updates.differenceEmpty'
  readonly date: number
  readonly seq: number
}

/** `updates.differenceSlice#a8fb1981` */
export interface DifferenceSlice {
  readonly _: 'updates.differenceSlice'
  readonly new_messages: readonly root_m$.TypeMessage[]
  readonly new_encrypted_messages: readonly root_e$.TypeEncryptedMessage[]
  readonly other_updates: readonly root_u$.TypeUpdate[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly intermediate_state: TypeState
}

/** `updates.differenceTooLong#4afe8f6d` */
export interface DifferenceTooLong {
  readonly _: 'updates.differenceTooLong'
  readonly pts: number
}

/** `updates.getChannelDifference#03173d78` */
export interface GetChannelDifference {
  readonly _: 'updates.getChannelDifference'
  readonly force?: true
  readonly channel: root_i$.TypeInputChannel
  readonly filter: root_c$.TypeChannelMessagesFilter
  readonly pts: number
  readonly limit: number
}

/** `updates.getDifference#19c2f763` */
export interface GetDifference {
  readonly _: 'updates.getDifference'
  readonly pts: number
  readonly pts_limit?: number
  readonly pts_total_limit?: number
  readonly date: number
  readonly qts: number
  readonly qts_limit?: number
}

/** `updates.getState#edd4882a` */
export interface GetState {
  readonly _: 'updates.getState'
}

/** `updates.state#a56c2a3e` */
export interface State {
  readonly _: 'updates.state'
  readonly pts: number
  readonly qts: number
  readonly date: number
  readonly seq: number
  readonly unread_count: number
}

/** Any `updates.ChannelDifference`. */
export type TypeChannelDifference =
  | ChannelDifference
  | ChannelDifferenceEmpty
  | ChannelDifferenceTooLong

/** Any `updates.Difference`. */
export type TypeDifference =
  | Difference
  | DifferenceEmpty
  | DifferenceSlice
  | DifferenceTooLong

/** Any `updates.State`. */
export type TypeState =
  | State
