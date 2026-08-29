// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

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
  | NotifyForumTopic
  | NotifyPeer
  | NotifyUsers
