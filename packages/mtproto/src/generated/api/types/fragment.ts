// GENERATED FILE — do not edit.
// TL types for fragment
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as root_i$ from './root/i.js'
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

/** `fragment.getCollectibleInfo#be1e85ba` */
export interface GetCollectibleInfo {
  readonly _: 'fragment.getCollectibleInfo'
  readonly collectible: root_i$.TypeInputCollectible
}

/** Any `fragment.CollectibleInfo`. */
export type TypeCollectibleInfo =
  | CollectibleInfo
