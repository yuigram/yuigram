// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_p$ from '../root/p.js'
import type { TlObject } from '../../../../tl/object.js'

/** `nearestDc#8e1a1775` */
export interface NearestDc {
  readonly _: 'nearestDc'
  readonly country: string
  readonly this_dc: number
  readonly nearest_dc: number
}

/** `notificationSoundDefault#97e8bebe` */
export interface NotificationSoundDefault {
  readonly _: 'notificationSoundDefault'
}

/** `notificationSoundLocal#830b9ae4` */
export interface NotificationSoundLocal {
  readonly _: 'notificationSoundLocal'
  readonly title: string
  readonly data: string
}

/** `notificationSoundNone#6f0c34df` */
export interface NotificationSoundNone {
  readonly _: 'notificationSoundNone'
}

/** `notificationSoundRingtone#ff6c8049` */
export interface NotificationSoundRingtone {
  readonly _: 'notificationSoundRingtone'
  readonly id: bigint
}

/** `notifyBroadcasts#d612e8ef` */
export interface NotifyBroadcasts {
  readonly _: 'notifyBroadcasts'
}

/** `notifyChats#c007cec3` */
export interface NotifyChats {
  readonly _: 'notifyChats'
}

/** `notifyCommunity#be376999` */
export interface NotifyCommunity {
  readonly _: 'notifyCommunity'
  readonly community_id: bigint
}

/** `notifyForumTopic#226e6308` */
export interface NotifyForumTopic {
  readonly _: 'notifyForumTopic'
  readonly peer: root_p$.TypePeer
  readonly top_msg_id: number
}

/** `notifyPeer#9fd40bd8` */
export interface NotifyPeer {
  readonly _: 'notifyPeer'
  readonly peer: root_p$.TypePeer
}

/** `notifyUsers#b4c83b4c` */
export interface NotifyUsers {
  readonly _: 'notifyUsers'
}

/** Any `NearestDc`. */
export type TypeNearestDc =
  | NearestDc

/** Any `NotificationSound`. */
export type TypeNotificationSound =
  | NotificationSoundDefault
  | NotificationSoundLocal
  | NotificationSoundNone
  | NotificationSoundRingtone

/** Any `NotifyPeer`. */
export type TypeNotifyPeer =
  | NotifyBroadcasts
  | NotifyChats
  | NotifyCommunity
  | NotifyForumTopic
  | NotifyPeer
  | NotifyUsers
