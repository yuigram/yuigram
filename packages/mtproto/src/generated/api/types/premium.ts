// GENERATED FILE — do not edit.
// TL types for premium
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_b$ from './root/b.js'
import type * as root_c$ from './root/c.js'
import type * as root_m$ from './root/m.js'
import type * as root_p$ from './root/p.js'
import type * as root_s$ from './root/s.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `premium.boostsList#86f8613c` */
export interface BoostsList {
  readonly _: 'premium.boostsList'
  readonly count: number
  readonly boosts: readonly root_b$.TypeBoost[]
  readonly next_offset?: string
  readonly users: readonly root_u$.TypeUser[]
}

/** `premium.boostsStatus#4959427a` */
export interface BoostsStatus {
  readonly _: 'premium.boostsStatus'
  readonly my_boost?: true
  readonly level: number
  readonly current_level_boosts: number
  readonly boosts: number
  readonly gift_boosts?: number
  readonly next_level_boosts?: number
  readonly premium_audience?: root_s$.TypeStatsPercentValue
  readonly boost_url: string
  readonly prepaid_giveaways?: readonly root_p$.TypePrepaidGiveaway[]
  readonly my_boost_slots?: readonly number[]
}

/** `premium.myBoosts#9ae228e2` */
export interface MyBoosts {
  readonly _: 'premium.myBoosts'
  readonly my_boosts: readonly root_m$.TypeMyBoost[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** Any `premium.BoostsList`. */
export type TypeBoostsList =
  | BoostsList

/** Any `premium.BoostsStatus`. */
export type TypeBoostsStatus =
  | BoostsStatus

/** Any `premium.MyBoosts`. */
export type TypeMyBoosts =
  | MyBoosts
