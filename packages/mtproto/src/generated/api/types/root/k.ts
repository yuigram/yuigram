// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as root_b$ from '../root/b.js'
import type * as root_i$ from '../root/i.js'
import type { TlObject } from '../../../../tl/object.js'

/** `keyboardButton#2f67a72f` */
export interface KeyboardButton {
  readonly _: 'keyboardButton'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly type: root_b$.TypeButtonType
}

/** `keyboardButtonRow#77608b83` */
export interface KeyboardButtonRow {
  readonly _: 'keyboardButtonRow'
  readonly buttons: readonly TypeKeyboardButton[]
}

/** `keyboardButtonStyle#4fdd3430` */
export interface KeyboardButtonStyle {
  readonly _: 'keyboardButtonStyle'
  readonly bg_primary?: true
  readonly bg_danger?: true
  readonly bg_success?: true
  readonly icon?: bigint
}

/** `keyboardInlineButton#11c1a322` */
export interface KeyboardInlineButton {
  readonly _: 'keyboardInlineButton'
  readonly style?: TypeKeyboardButtonStyle
  readonly text: string
  readonly type: root_i$.TypeInlineButtonType
}

/** `keyboardInlineButtonRow#19420af6` */
export interface KeyboardInlineButtonRow {
  readonly _: 'keyboardInlineButtonRow'
  readonly buttons: readonly TypeKeyboardInlineButton[]
}

/** Any `KeyboardButton`. */
export type TypeKeyboardButton =
  | KeyboardButton

/** Any `KeyboardButtonRow`. */
export type TypeKeyboardButtonRow =
  | KeyboardButtonRow

/** Any `KeyboardButtonStyle`. */
export type TypeKeyboardButtonStyle =
  | KeyboardButtonStyle

/** Any `KeyboardInlineButton`. */
export type TypeKeyboardInlineButton =
  | KeyboardInlineButton

/** Any `KeyboardInlineButtonRow`. */
export type TypeKeyboardInlineButtonRow =
  | KeyboardInlineButtonRow
