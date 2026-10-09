// GENERATED FILE — do not edit.
// TL types for langpack
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlObject } from '../../../tl/object.js'

/** `langpack.getDifference#cd984aa5` */
export interface GetDifference {
  readonly _: 'langpack.getDifference'
  readonly lang_pack: string
  readonly lang_code: string
  readonly from_version: number
}

/** `langpack.getLangPack#f2f2330a` */
export interface GetLangPack {
  readonly _: 'langpack.getLangPack'
  readonly lang_pack: string
  readonly lang_code: string
}

/** `langpack.getLanguage#6a596502` */
export interface GetLanguage {
  readonly _: 'langpack.getLanguage'
  readonly lang_pack: string
  readonly lang_code: string
}

/** `langpack.getLanguages#42c6978f` */
export interface GetLanguages {
  readonly _: 'langpack.getLanguages'
  readonly lang_pack: string
}

/** `langpack.getStrings#efea3803` */
export interface GetStrings {
  readonly _: 'langpack.getStrings'
  readonly lang_pack: string
  readonly lang_code: string
  readonly keys: readonly string[]
}
