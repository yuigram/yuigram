// GENERATED FILE — do not edit.
// TL types for aicompose
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_a$ from './root/a.js'
import type * as root_i$ from './root/i.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `aicompose.createTone#4aa83913` */
export interface CreateTone {
  readonly _: 'aicompose.createTone'
  readonly display_author?: true
  readonly emoji_id: bigint
  readonly title: string
  readonly prompt: string
}

/** `aicompose.deleteTone#dd39316a` */
export interface DeleteTone {
  readonly _: 'aicompose.deleteTone'
  readonly tone: root_i$.TypeInputAiComposeTone
}

/** `aicompose.getTone#b2e8ba03` */
export interface GetTone {
  readonly _: 'aicompose.getTone'
  readonly tone: root_i$.TypeInputAiComposeTone
}

/** `aicompose.getToneExample#d1b4ab14` */
export interface GetToneExample {
  readonly _: 'aicompose.getToneExample'
  readonly tone: root_i$.TypeInputAiComposeTone
  readonly num: number
}

/** `aicompose.getTones#abd59201` */
export interface GetTones {
  readonly _: 'aicompose.getTones'
  readonly hash: bigint
}

/** `aicompose.saveTone#1782cbb1` */
export interface SaveTone {
  readonly _: 'aicompose.saveTone'
  readonly tone: root_i$.TypeInputAiComposeTone
  readonly unsave: boolean
}

/** `aicompose.tones#6c9d0efe` */
export interface Tones {
  readonly _: 'aicompose.tones'
  readonly hash: bigint
  readonly tones: readonly root_a$.TypeAiComposeTone[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `aicompose.tonesNotModified#c1f46103` */
export interface TonesNotModified {
  readonly _: 'aicompose.tonesNotModified'
}

/** Any `aicompose.Tones`. */
export type TypeTones =
  | Tones
  | TonesNotModified

/** `aicompose.updateTone#903bcf59` */
export interface UpdateTone {
  readonly _: 'aicompose.updateTone'
  readonly tone: root_i$.TypeInputAiComposeTone
  readonly display_author?: boolean
  readonly emoji_id?: bigint
  readonly title?: string
  readonly prompt?: string
}
