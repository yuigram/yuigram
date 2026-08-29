// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_i$ from '../root/i.js'
import type * as root_r$ from '../root/r.js'
import type { TlObject } from '../../../../tl/object.js'

/** `keyboardButton#7d170cff` */
export interface KeyboardButton {
  readonly _: 'keyboardButton'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
}

/** `keyboardButtonBuy#3fa53905` */
export interface KeyboardButtonBuy {
  readonly _: 'keyboardButtonBuy'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
}

/** `keyboardButtonCallback#e62bc960` */
export interface KeyboardButtonCallback {
  readonly _: 'keyboardButtonCallback'
  readonly requires_password?: true
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly data: Uint8Array
}

/** `keyboardButtonCopy#bcc4af10` */
export interface KeyboardButtonCopy {
  readonly _: 'keyboardButtonCopy'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly copy_text: string
}

/** `keyboardButtonGame#89c590f9` */
export interface KeyboardButtonGame {
  readonly _: 'keyboardButtonGame'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
}

/** `keyboardButtonRequestGeoLocation#aa40f94d` */
export interface KeyboardButtonRequestGeoLocation {
  readonly _: 'keyboardButtonRequestGeoLocation'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
}

/** `keyboardButtonRequestPeer#5b0f15f5` */
export interface KeyboardButtonRequestPeer {
  readonly _: 'keyboardButtonRequestPeer'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly button_id: number
  readonly peer_type: root_r$.TypeRequestPeerType
  readonly max_quantity: number
}

/** `keyboardButtonRequestPhone#417efd8f` */
export interface KeyboardButtonRequestPhone {
  readonly _: 'keyboardButtonRequestPhone'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
}

/** `keyboardButtonRequestPoll#7a11d782` */
export interface KeyboardButtonRequestPoll {
  readonly _: 'keyboardButtonRequestPoll'
  readonly style?: TypeKeyboardButtonStyle
  readonly quiz?: boolean
  readonly text: string
}

/** `keyboardButtonRow#77608b83` */
export interface KeyboardButtonRow {
  readonly _: 'keyboardButtonRow'
  readonly buttons: readonly TypeKeyboardButton[]
}

/** `keyboardButtonSimpleWebView#e15c4370` */
export interface KeyboardButtonSimpleWebView {
  readonly _: 'keyboardButtonSimpleWebView'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly url: string
}

/** `keyboardButtonStyle#4fdd3430` */
export interface KeyboardButtonStyle {
  readonly _: 'keyboardButtonStyle'
  readonly bg_primary?: true
  readonly bg_danger?: true
  readonly bg_success?: true
  readonly icon?: bigint
}

/** `keyboardButtonSwitchInline#991399fc` */
export interface KeyboardButtonSwitchInline {
  readonly _: 'keyboardButtonSwitchInline'
  readonly same_peer?: true
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly query: string
  readonly peer_types?: readonly root_i$.TypeInlineQueryPeerType[]
}

/** `keyboardButtonUrl#d80c25ec` */
export interface KeyboardButtonUrl {
  readonly _: 'keyboardButtonUrl'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly url: string
}

/** `keyboardButtonUrlAuth#f51006f9` */
export interface KeyboardButtonUrlAuth {
  readonly _: 'keyboardButtonUrlAuth'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly fwd_text?: string
  readonly url: string
  readonly button_id: number
}

/** `keyboardButtonUserProfile#c0fd5d09` */
export interface KeyboardButtonUserProfile {
  readonly _: 'keyboardButtonUserProfile'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly user_id: bigint
}

/** `keyboardButtonWebView#e846b1a0` */
export interface KeyboardButtonWebView {
  readonly _: 'keyboardButtonWebView'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly url: string
}

/** Any `KeyboardButton`. */
export type TypeKeyboardButton =
  | root_i$.InputKeyboardButtonRequestPeer
  | root_i$.InputKeyboardButtonUrlAuth
  | root_i$.InputKeyboardButtonUserProfile
  | KeyboardButton
  | KeyboardButtonBuy
  | KeyboardButtonCallback
  | KeyboardButtonCopy
  | KeyboardButtonGame
  | KeyboardButtonRequestGeoLocation
  | KeyboardButtonRequestPeer
  | KeyboardButtonRequestPhone
  | KeyboardButtonRequestPoll
  | KeyboardButtonSimpleWebView
  | KeyboardButtonSwitchInline
  | KeyboardButtonUrl
  | KeyboardButtonUrlAuth
  | KeyboardButtonUserProfile
  | KeyboardButtonWebView

/** Any `KeyboardButtonRow`. */
export type TypeKeyboardButtonRow =
  | KeyboardButtonRow

/** Any `KeyboardButtonStyle`. */
export type TypeKeyboardButtonStyle =
  | KeyboardButtonStyle
