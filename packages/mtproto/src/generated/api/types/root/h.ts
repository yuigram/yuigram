// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

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
