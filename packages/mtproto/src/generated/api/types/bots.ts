// GENERATED FILE — do not edit.
// TL types for bots
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_b$ from './root/b.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `bots.botInfo#e8a775b0` */
export interface BotInfo {
  readonly _: 'bots.botInfo'
  readonly name: string
  readonly about: string
  readonly description: string
}

/** `bots.popularAppBots#1991b13b` */
export interface PopularAppBots {
  readonly _: 'bots.popularAppBots'
  readonly next_offset?: string
  readonly users: readonly root_u$.TypeUser[]
}

/** `bots.previewInfo#0ca71d64` */
export interface PreviewInfo {
  readonly _: 'bots.previewInfo'
  readonly media: readonly root_b$.TypeBotPreviewMedia[]
  readonly lang_codes: readonly string[]
}

/** Any `bots.BotInfo`. */
export type TypeBotInfo =
  | BotInfo

/** Any `bots.PopularAppBots`. */
export type TypePopularAppBots =
  | PopularAppBots

/** Any `bots.PreviewInfo`. */
export type TypePreviewInfo =
  | PreviewInfo
