// GENERATED FILE — do not edit.
// TL types for smsjobs
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlObject } from '../../../tl/object.js'

/** `smsjobs.eligibleToJoin#dc8b44cf` */
export interface EligibleToJoin {
  readonly _: 'smsjobs.eligibleToJoin'
  readonly terms_url: string
  readonly monthly_sent_sms: number
}

/** `smsjobs.finishJob#4f1ebf24` */
export interface FinishJob {
  readonly _: 'smsjobs.finishJob'
  readonly job_id: string
  readonly error?: string
}

/** `smsjobs.getSmsJob#778d902f` */
export interface GetSmsJob {
  readonly _: 'smsjobs.getSmsJob'
  readonly job_id: string
}

/** `smsjobs.getStatus#10a698e8` */
export interface GetStatus {
  readonly _: 'smsjobs.getStatus'
}

/** `smsjobs.isEligibleToJoin#0edc39d0` */
export interface IsEligibleToJoin {
  readonly _: 'smsjobs.isEligibleToJoin'
}

/** `smsjobs.join#a74ece2d` */
export interface Join {
  readonly _: 'smsjobs.join'
}

/** `smsjobs.leave#9898ad73` */
export interface Leave {
  readonly _: 'smsjobs.leave'
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

/** `smsjobs.updateSettings#093fa0bf` */
export interface UpdateSettings {
  readonly _: 'smsjobs.updateSettings'
  readonly allow_international?: true
}
