// GENERATED FILE — do not edit.
// TL types for ephemeral
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as root_e$ from './root/e.js'
import type * as root_i$ from './root/i.js'
import type * as root_m$ from './root/m.js'
import type * as root_r$ from './root/r.js'
import type { TlObject } from '../../../tl/object.js'

/** `ephemeral.deleteAllWelcomeMessages#734f9721` */
export interface DeleteAllWelcomeMessages {
  readonly _: 'ephemeral.deleteAllWelcomeMessages'
  readonly peer: root_i$.TypeInputPeer
}

/** `ephemeral.deleteMessage#92f6e797` */
export interface DeleteMessage {
  readonly _: 'ephemeral.deleteMessage'
  readonly peer?: root_i$.TypeInputPeer
  readonly receiver_id: root_i$.TypeInputUser
  readonly id: number
}

/** `ephemeral.deleteWelcomeMessage#e882a9e1` */
export interface DeleteWelcomeMessage {
  readonly _: 'ephemeral.deleteWelcomeMessage'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
}

/** `ephemeral.editMessage#cf9c725b` */
export interface EditMessage {
  readonly _: 'ephemeral.editMessage'
  readonly invert_media?: true
  readonly welcome?: true
  readonly peer?: root_i$.TypeInputPeer
  readonly receiver_id: root_i$.TypeInputUser
  readonly id: number
  readonly message?: string
  readonly media?: root_i$.TypeInputMedia
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly rich_message?: root_i$.TypeInputRichMessage
}

/** `ephemeral.getCallbackAnswer#3fa464c8` */
export interface GetCallbackAnswer {
  readonly _: 'ephemeral.getCallbackAnswer'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly data?: Uint8Array
}

/** `ephemeral.getWelcomeMessages#db9ac18d` */
export interface GetWelcomeMessages {
  readonly _: 'ephemeral.getWelcomeMessages'
  readonly peer: root_i$.TypeInputPeer
  readonly hash: bigint
}

/** `ephemeral.reportMessage#8704f2bf` */
export interface ReportMessage {
  readonly _: 'ephemeral.reportMessage'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly option: Uint8Array
  readonly message: string
}

/** `ephemeral.sendMessage#ba8d5f35` */
export interface SendMessage {
  readonly _: 'ephemeral.sendMessage'
  readonly invert_media?: true
  readonly welcome?: true
  readonly anchor?: true
  readonly noforwards?: true
  readonly peer?: root_i$.TypeInputPeer
  readonly receiver_id: root_i$.TypeInputUser
  readonly query_id?: bigint
  readonly message: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly media?: root_i$.TypeInputMedia
  readonly reply_markup?: root_r$.TypeReplyMarkup
  readonly rich_message?: root_i$.TypeInputRichMessage
  readonly random_id: bigint
  readonly reply_to?: root_i$.TypeInputReplyTo
}

/** Any `ephemeral.WelcomeMessages`. */
export type TypeWelcomeMessages =
  | WelcomeMessages
  | WelcomeMessagesNotModified

/** `ephemeral.welcomeMessages#104fc872` */
export interface WelcomeMessages {
  readonly _: 'ephemeral.welcomeMessages'
  readonly hash: bigint
  readonly messages: readonly root_e$.TypeEphemeralMessage[]
}

/** `ephemeral.welcomeMessagesNotModified#59ffdb31` */
export interface WelcomeMessagesNotModified {
  readonly _: 'ephemeral.welcomeMessagesNotModified'
}
