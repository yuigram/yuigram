// GENERATED FILE — do not edit.
// TL types for smsjobs
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlObject } from '../../../tl/object.js'

/** `smsjobs.eligibleToJoin#dc8b44cf` */
export interface EligibleToJoin {
  readonly _: 'smsjobs.eligibleToJoin'
  readonly terms_url: string
  readonly monthly_sent_sms: number
}

/** `smsjobs.status#2aee9191` */
export interface Status {
  readonly _: 'smsjobs.status'
  readonly allow_international?: true
  readonly recent_sent: number
  readonly recent_since: number
  readonly recent_remains: number
  readonly total_sent: number
  readonly total_since: number
  readonly last_gift_slug?: string
  readonly terms_url: string
}

/** Any `smsjobs.EligibilityToJoin`. */
export type TypeEligibilityToJoin =
  | EligibleToJoin

/** Any `smsjobs.Status`. */
export type TypeStatus =
  | Status
