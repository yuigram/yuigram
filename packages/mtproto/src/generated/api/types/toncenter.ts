// GENERATED FILE — do not edit.
// TL types for toncenter
// Source: Telegram TL layer 232, schemas/tl/api.232.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_d$ from './root/d.js'
import type { TlObject } from '../../../tl/object.js'

/** `toncenter.apiResponse#ac8dfe19` */
export interface ApiResponse {
  readonly _: 'toncenter.apiResponse'
  readonly response: root_d$.TypeDataJSON
}

/** `toncenter.getStreamingUrl#cdaf63c7` */
export interface GetStreamingUrl {
  readonly _: 'toncenter.getStreamingUrl'
}

/** `toncenter.performApiRequest#8d7bdd61` */
export interface PerformApiRequest {
  readonly _: 'toncenter.performApiRequest'
  readonly post?: true
  readonly endpoint: string
  readonly query?: string
  readonly payload?: string
}

/** `toncenter.streamingUrl#19887601` */
export interface StreamingUrl {
  readonly _: 'toncenter.streamingUrl'
  readonly url: string
  readonly expires: number
}

/** Any `toncenter.ApiResponse`. */
export type TypeApiResponse =
  | ApiResponse

/** Any `toncenter.StreamingUrl`. */
export type TypeStreamingUrl =
  | StreamingUrl
