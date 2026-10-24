// GENERATED FILE — do not edit.
// TL types for stats
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from './root/c.js'
import type * as root_i$ from './root/i.js'
import type * as root_p$ from './root/p.js'
import type * as root_s$ from './root/s.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `stats.broadcastStats#396ca5fc` */
export interface BroadcastStats {
  readonly _: 'stats.broadcastStats'
  readonly period: root_s$.TypeStatsDateRangeDays
  readonly followers: root_s$.TypeStatsAbsValueAndPrev
  readonly views_per_post: root_s$.TypeStatsAbsValueAndPrev
  readonly shares_per_post: root_s$.TypeStatsAbsValueAndPrev
  readonly reactions_per_post: root_s$.TypeStatsAbsValueAndPrev
  readonly views_per_story: root_s$.TypeStatsAbsValueAndPrev
  readonly shares_per_story: root_s$.TypeStatsAbsValueAndPrev
  readonly reactions_per_story: root_s$.TypeStatsAbsValueAndPrev
  readonly enabled_notifications: root_s$.TypeStatsPercentValue
  readonly growth_graph: root_s$.TypeStatsGraph
  readonly followers_graph: root_s$.TypeStatsGraph
  readonly mute_graph: root_s$.TypeStatsGraph
  readonly top_hours_graph: root_s$.TypeStatsGraph
  readonly interactions_graph: root_s$.TypeStatsGraph
  readonly iv_interactions_graph: root_s$.TypeStatsGraph
  readonly views_by_source_graph: root_s$.TypeStatsGraph
  readonly new_followers_by_source_graph: root_s$.TypeStatsGraph
  readonly languages_graph: root_s$.TypeStatsGraph
  readonly reactions_by_emotion_graph: root_s$.TypeStatsGraph
  readonly story_interactions_graph: root_s$.TypeStatsGraph
  readonly story_reactions_by_emotion_graph: root_s$.TypeStatsGraph
  readonly recent_posts_interactions: readonly root_p$.TypePostInteractionCounters[]
}

/** `stats.getBroadcastStats#ab42441a` */
export interface GetBroadcastStats {
  readonly _: 'stats.getBroadcastStats'
  readonly dark?: true
  readonly channel: root_i$.TypeInputChannel
}

/** `stats.getMegagroupStats#dcdf8607` */
export interface GetMegagroupStats {
  readonly _: 'stats.getMegagroupStats'
  readonly dark?: true
  readonly channel: root_i$.TypeInputChannel
}

/** `stats.getMessagePublicForwards#5f150144` */
export interface GetMessagePublicForwards {
  readonly _: 'stats.getMessagePublicForwards'
  readonly channel: root_i$.TypeInputChannel
  readonly msg_id: number
  readonly offset: string
  readonly limit: number
}

/** `stats.getMessageStats#b6e0a3f5` */
export interface GetMessageStats {
  readonly _: 'stats.getMessageStats'
  readonly dark?: true
  readonly channel: root_i$.TypeInputChannel
  readonly msg_id: number
}

/** `stats.getPollStats#c27dfa68` */
export interface GetPollStats {
  readonly _: 'stats.getPollStats'
  readonly dark?: true
  readonly peer: root_i$.TypeInputPeer
  readonly msg_id: number
}

/** `stats.getStoryPublicForwards#a6437ef6` */
export interface GetStoryPublicForwards {
  readonly _: 'stats.getStoryPublicForwards'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly offset: string
  readonly limit: number
}

/** `stats.getStoryStats#374fef40` */
export interface GetStoryStats {
  readonly _: 'stats.getStoryStats'
  readonly dark?: true
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
}

/** `stats.loadAsyncGraph#621d5fa0` */
export interface LoadAsyncGraph {
  readonly _: 'stats.loadAsyncGraph'
  readonly token: string
  readonly x?: bigint
}

/** `stats.megagroupStats#ef7ff916` */
export interface MegagroupStats {
  readonly _: 'stats.megagroupStats'
  readonly period: root_s$.TypeStatsDateRangeDays
  readonly members: root_s$.TypeStatsAbsValueAndPrev
  readonly messages: root_s$.TypeStatsAbsValueAndPrev
  readonly viewers: root_s$.TypeStatsAbsValueAndPrev
  readonly posters: root_s$.TypeStatsAbsValueAndPrev
  readonly growth_graph: root_s$.TypeStatsGraph
  readonly members_graph: root_s$.TypeStatsGraph
  readonly new_members_by_source_graph: root_s$.TypeStatsGraph
  readonly languages_graph: root_s$.TypeStatsGraph
  readonly messages_graph: root_s$.TypeStatsGraph
  readonly actions_graph: root_s$.TypeStatsGraph
  readonly top_hours_graph: root_s$.TypeStatsGraph
  readonly weekdays_graph: root_s$.TypeStatsGraph
  readonly top_posters: readonly root_s$.TypeStatsGroupTopPoster[]
  readonly top_admins: readonly root_s$.TypeStatsGroupTopAdmin[]
  readonly top_inviters: readonly root_s$.TypeStatsGroupTopInviter[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `stats.messageStats#7fe91c14` */
export interface MessageStats {
  readonly _: 'stats.messageStats'
  readonly views_graph: root_s$.TypeStatsGraph
  readonly reactions_by_emotion_graph: root_s$.TypeStatsGraph
}

/** `stats.pollStats#2999beed` */
export interface PollStats {
  readonly _: 'stats.pollStats'
  readonly votes_graph: root_s$.TypeStatsGraph
}

/** `stats.publicForwards#93037e20` */
export interface PublicForwards {
  readonly _: 'stats.publicForwards'
  readonly count: number
  readonly forwards: readonly root_p$.TypePublicForward[]
  readonly next_offset?: string
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `stats.storyStats#50cd067c` */
export interface StoryStats {
  readonly _: 'stats.storyStats'
  readonly views_graph: root_s$.TypeStatsGraph
  readonly reactions_by_emotion_graph: root_s$.TypeStatsGraph
}

/** Any `stats.BroadcastStats`. */
export type TypeBroadcastStats =
  | BroadcastStats

/** Any `stats.MegagroupStats`. */
export type TypeMegagroupStats =
  | MegagroupStats

/** Any `stats.MessageStats`. */
export type TypeMessageStats =
  | MessageStats

/** Any `stats.PollStats`. */
export type TypePollStats =
  | PollStats

/** Any `stats.PublicForwards`. */
export type TypePublicForwards =
  | PublicForwards

/** Any `stats.StoryStats`. */
export type TypeStoryStats =
  | StoryStats
