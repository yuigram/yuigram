// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlObject } from '../../../../tl/object.js'

/** `joinChatBotResultApproved#ae152a69` */
export interface JoinChatBotResultApproved {
  readonly _: 'joinChatBotResultApproved'
}

/** `joinChatBotResultDeclined#0efa0194` */
export interface JoinChatBotResultDeclined {
  readonly _: 'joinChatBotResultDeclined'
}

/** `joinChatBotResultQueued#98a3a840` */
export interface JoinChatBotResultQueued {
  readonly _: 'joinChatBotResultQueued'
}

/** `joinChatBotResultWebView#d6e3b813` */
export interface JoinChatBotResultWebView {
  readonly _: 'joinChatBotResultWebView'
  readonly url: string
}

/** `jsonArray#f7444763` */
export interface JsonArray {
  readonly _: 'jsonArray'
  readonly value: readonly TypeJSONValue[]
}

/** `jsonBool#c7345e6a` */
export interface JsonBool {
  readonly _: 'jsonBool'
  readonly value: boolean
}

/** `jsonNull#3f6d7b68` */
export interface JsonNull {
  readonly _: 'jsonNull'
}

/** `jsonNumber#2be0dfa4` */
export interface JsonNumber {
  readonly _: 'jsonNumber'
  readonly value: number
}

/** `jsonObject#99c1d49d` */
export interface JsonObject {
  readonly _: 'jsonObject'
  readonly value: readonly TypeJSONObjectValue[]
}

/** `jsonObjectValue#c0de1bd9` */
export interface JsonObjectValue {
  readonly _: 'jsonObjectValue'
  readonly key: string
  readonly value: TypeJSONValue
}

/** `jsonString#b71e767a` */
export interface JsonString {
  readonly _: 'jsonString'
  readonly value: string
}

/** Any `JSONObjectValue`. */
export type TypeJSONObjectValue =
  | JsonObjectValue

/** Any `JSONValue`. */
export type TypeJSONValue =
  | JsonArray
  | JsonBool
  | JsonNull
  | JsonNumber
  | JsonObject
  | JsonString

/** Any `JoinChatBotResult`. */
export type TypeJoinChatBotResult =
  | JoinChatBotResultApproved
  | JoinChatBotResultDeclined
  | JoinChatBotResultQueued
  | JoinChatBotResultWebView
