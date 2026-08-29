// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlObject } from '../../../../tl/object.js'

/** `quickReply#0697102b` */
export interface QuickReply {
  readonly _: 'quickReply'
  readonly shortcut_id: number
  readonly shortcut: string
  readonly top_message: number
  readonly count: number
}

/** Any `QuickReply`. */
export type TypeQuickReply =
  | QuickReply
