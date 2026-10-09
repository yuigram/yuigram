// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlObject } from '../../../../tl/object.js'

/** `highScore#73a379eb` */
export interface HighScore {
  readonly _: 'highScore'
  readonly pos: number
  readonly user_id: bigint
  readonly score: number
}

/** Any `HighScore`. */
export type TypeHighScore =
  | HighScore
