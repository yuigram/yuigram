// GENERATED FILE — do not edit.
// TL types for fragment
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlObject } from '../../../tl/object.js'

/** `fragment.collectibleInfo#6ebdff91` */
export interface CollectibleInfo {
  readonly _: 'fragment.collectibleInfo'
  readonly purchase_date: number
  readonly currency: string
  readonly amount: bigint
  readonly crypto_currency: string
  readonly crypto_amount: bigint
  readonly url: string
}

/** Any `fragment.CollectibleInfo`. */
export type TypeCollectibleInfo =
  | CollectibleInfo
