// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlObject } from '../../../tl/object.js'

/** `boolFalse#bc799737` */
export interface BoolFalse {
  readonly _: 'boolFalse'
}

/** `boolTrue#997275b5` */
export interface BoolTrue {
  readonly _: 'boolTrue'
}

/** `error#c4b9f9bb` */
export interface Error {
  readonly _: 'error'
  readonly code: number
  readonly text: string
}

/** `null#56730bcc` */
export interface Null {
  readonly _: 'null'
}

/** `true#3fedd339` */
export interface True {
  readonly _: 'true'
}

/** Any `Error`. */
export type TypeError =
  | Error

/** Any `Null`. */
export type TypeNull =
  | Null

/** Any `True`. */
export type TypeTrue =
  | True

/** Any `Vector`. */
export type TypeVector =
  | Vector

/** `vector#1cb5c415` */
export interface Vector {
  readonly _: 'vector'
  readonly _0: number
  readonly _1: readonly TlObject[]
}
