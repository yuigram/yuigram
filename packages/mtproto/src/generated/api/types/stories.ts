// GENERATED FILE — do not edit.
// TL types for stories
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from './root/c.js'
import type * as root_f$ from './root/f.js'
import type * as root_i$ from './root/i.js'
import type * as root_m$ from './root/m.js'
import type * as root_p$ from './root/p.js'
import type * as root_r$ from './root/r.js'
import type * as root_s$ from './root/s.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `stories.activateStealthMode#57bbd166` */
export interface ActivateStealthMode {
  readonly _: 'stories.activateStealthMode'
  readonly past?: true
  readonly future?: true
}

/** `stories.albums#c3987a3a` */
export interface Albums {
  readonly _: 'stories.albums'
  readonly hash: bigint
  readonly albums: readonly root_s$.TypeStoryAlbum[]
}

/** `stories.albumsNotModified#564edaeb` */
export interface AlbumsNotModified {
  readonly _: 'stories.albumsNotModified'
}

/** `stories.allStories#6efc5e81` */
export interface AllStories {
  readonly _: 'stories.allStories'
  readonly has_more?: true
  readonly count: number
  readonly state: string
  readonly peer_stories: readonly root_p$.TypePeerStories[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly stealth_mode: root_s$.TypeStoriesStealthMode
}

/** `stories.allStoriesNotModified#1158fe3e` */
export interface AllStoriesNotModified {
  readonly _: 'stories.allStoriesNotModified'
  readonly state: string
  readonly stealth_mode: root_s$.TypeStoriesStealthMode
}

/** `stories.canSendStory#30eb63f0` */
export interface CanSendStory {
  readonly _: 'stories.canSendStory'
  readonly peer: root_i$.TypeInputPeer
}

/** `stories.canSendStoryCount#c387c04e` */
export interface CanSendStoryCount {
  readonly _: 'stories.canSendStoryCount'
  readonly count_remains: number
}

/** `stories.createAlbum#a36396e5` */
export interface CreateAlbum {
  readonly _: 'stories.createAlbum'
  readonly peer: root_i$.TypeInputPeer
  readonly title: string
  readonly stories: readonly number[]
}

/** `stories.deleteAlbum#8d3456d0` */
export interface DeleteAlbum {
  readonly _: 'stories.deleteAlbum'
  readonly peer: root_i$.TypeInputPeer
  readonly album_id: number
}

/** `stories.deleteStories#ae59db5f` */
export interface DeleteStories {
  readonly _: 'stories.deleteStories'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `stories.editStory#2c63a72b` */
export interface EditStory {
  readonly _: 'stories.editStory'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly media?: root_i$.TypeInputMedia
  readonly media_areas?: readonly root_m$.TypeMediaArea[]
  readonly caption?: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly privacy_rules?: readonly root_i$.TypeInputPrivacyRule[]
  readonly music?: root_i$.TypeInputDocument
}

/** `stories.exportStoryLink#7b8def20` */
export interface ExportStoryLink {
  readonly _: 'stories.exportStoryLink'
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
}

/** `stories.foundStories#e2de7737` */
export interface FoundStories {
  readonly _: 'stories.foundStories'
  readonly count: number
  readonly stories: readonly root_f$.TypeFoundStory[]
  readonly next_offset?: string
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `stories.getAlbumStories#ac806d61` */
export interface GetAlbumStories {
  readonly _: 'stories.getAlbumStories'
  readonly peer: root_i$.TypeInputPeer
  readonly album_id: number
  readonly offset: number
  readonly limit: number
}

/** `stories.getAlbums#25b3eac7` */
export interface GetAlbums {
  readonly _: 'stories.getAlbums'
  readonly peer: root_i$.TypeInputPeer
  readonly hash: bigint
}

/** `stories.getAllReadPeerStories#9b5ae7f9` */
export interface GetAllReadPeerStories {
  readonly _: 'stories.getAllReadPeerStories'
}

/** `stories.getAllStories#eeb0d625` */
export interface GetAllStories {
  readonly _: 'stories.getAllStories'
  readonly next?: true
  readonly hidden?: true
  readonly state?: string
}

/** `stories.getChatsToSend#a56a8b60` */
export interface GetChatsToSend {
  readonly _: 'stories.getChatsToSend'
}

/** `stories.getPeerMaxIDs#78499170` */
export interface GetPeerMaxIDs {
  readonly _: 'stories.getPeerMaxIDs'
  readonly id: readonly root_i$.TypeInputPeer[]
}

/** `stories.getPeerStories#2c4ada50` */
export interface GetPeerStories {
  readonly _: 'stories.getPeerStories'
  readonly peer: root_i$.TypeInputPeer
}

/** `stories.getPinnedStories#5821a5dc` */
export interface GetPinnedStories {
  readonly _: 'stories.getPinnedStories'
  readonly peer: root_i$.TypeInputPeer
  readonly offset_id: number
  readonly limit: number
}

/** `stories.getStoriesArchive#b4352016` */
export interface GetStoriesArchive {
  readonly _: 'stories.getStoriesArchive'
  readonly peer: root_i$.TypeInputPeer
  readonly offset_id: number
  readonly limit: number
}

/** `stories.getStoriesByID#5774ca74` */
export interface GetStoriesByID {
  readonly _: 'stories.getStoriesByID'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `stories.getStoriesViews#28e16cc8` */
export interface GetStoriesViews {
  readonly _: 'stories.getStoriesViews'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `stories.getStoryReactionsList#b9b2881f` */
export interface GetStoryReactionsList {
  readonly _: 'stories.getStoryReactionsList'
  readonly forwards_first?: true
  readonly peer: root_i$.TypeInputPeer
  readonly id: number
  readonly reaction?: root_r$.TypeReaction
  readonly offset?: string
  readonly limit: number
}

/** `stories.getStoryViewsList#7ed23c57` */
export interface GetStoryViewsList {
  readonly _: 'stories.getStoryViewsList'
  readonly just_contacts?: true
  readonly reactions_first?: true
  readonly forwards_first?: true
  readonly peer: root_i$.TypeInputPeer
  readonly q?: string
  readonly id: number
  readonly offset: string
  readonly limit: number
}

/** `stories.incrementStoryViews#b2028afb` */
export interface IncrementStoryViews {
  readonly _: 'stories.incrementStoryViews'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** `stories.peerStories#cae68768` */
export interface PeerStories {
  readonly _: 'stories.peerStories'
  readonly stories: root_p$.TypePeerStories
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `stories.readStories#a556dac8` */
export interface ReadStories {
  readonly _: 'stories.readStories'
  readonly peer: root_i$.TypeInputPeer
  readonly max_id: number
}

/** `stories.reorderAlbums#8535fbd9` */
export interface ReorderAlbums {
  readonly _: 'stories.reorderAlbums'
  readonly peer: root_i$.TypeInputPeer
  readonly order: readonly number[]
}

/** `stories.report#19d8eb45` */
export interface Report {
  readonly _: 'stories.report'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
  readonly option: Uint8Array
  readonly message: string
}

/** `stories.searchPosts#d1810907` */
export interface SearchPosts {
  readonly _: 'stories.searchPosts'
  readonly hashtag?: string
  readonly area?: root_m$.TypeMediaArea
  readonly peer?: root_i$.TypeInputPeer
  readonly offset: string
  readonly limit: number
}

/** `stories.sendReaction#7fd736b2` */
export interface SendReaction {
  readonly _: 'stories.sendReaction'
  readonly add_to_recent?: true
  readonly peer: root_i$.TypeInputPeer
  readonly story_id: number
  readonly reaction: root_r$.TypeReaction
}

/** `stories.sendStory#8f9e6898` */
export interface SendStory {
  readonly _: 'stories.sendStory'
  readonly pinned?: true
  readonly noforwards?: true
  readonly fwd_modified?: true
  readonly peer: root_i$.TypeInputPeer
  readonly media: root_i$.TypeInputMedia
  readonly media_areas?: readonly root_m$.TypeMediaArea[]
  readonly caption?: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly privacy_rules: readonly root_i$.TypeInputPrivacyRule[]
  readonly random_id: bigint
  readonly period?: number
  readonly fwd_from_id?: root_i$.TypeInputPeer
  readonly fwd_from_story?: number
  readonly albums?: readonly number[]
  readonly music?: root_i$.TypeInputDocument
}

/** `stories.startLive#d069ccde` */
export interface StartLive {
  readonly _: 'stories.startLive'
  readonly pinned?: true
  readonly noforwards?: true
  readonly rtmp_stream?: true
  readonly peer: root_i$.TypeInputPeer
  readonly caption?: string
  readonly entities?: readonly root_m$.TypeMessageEntity[]
  readonly privacy_rules: readonly root_i$.TypeInputPrivacyRule[]
  readonly random_id: bigint
  readonly messages_enabled?: boolean
  readonly send_paid_messages_stars?: bigint
}

/** `stories.stories#63c3dd0a` */
export interface Stories {
  readonly _: 'stories.stories'
  readonly count: number
  readonly stories: readonly root_s$.TypeStoryItem[]
  readonly pinned_to_top?: readonly number[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `stories.storyReactionsList#aa5f789c` */
export interface StoryReactionsList {
  readonly _: 'stories.storyReactionsList'
  readonly count: number
  readonly reactions: readonly root_s$.TypeStoryReaction[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly next_offset?: string
}

/** `stories.storyViews#de9eed1d` */
export interface StoryViews {
  readonly _: 'stories.storyViews'
  readonly views: readonly root_s$.TypeStoryViews[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `stories.storyViewsList#59d78fc5` */
export interface StoryViewsList {
  readonly _: 'stories.storyViewsList'
  readonly count: number
  readonly views_count: number
  readonly forwards_count: number
  readonly reactions_count: number
  readonly views: readonly root_s$.TypeStoryView[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
  readonly next_offset?: string
}

/** `stories.toggleAllStoriesHidden#7c2557c4` */
export interface ToggleAllStoriesHidden {
  readonly _: 'stories.toggleAllStoriesHidden'
  readonly hidden: boolean
}

/** `stories.togglePeerStoriesHidden#bd0415c4` */
export interface TogglePeerStoriesHidden {
  readonly _: 'stories.togglePeerStoriesHidden'
  readonly peer: root_i$.TypeInputPeer
  readonly hidden: boolean
}

/** `stories.togglePinned#9a75a1ef` */
export interface TogglePinned {
  readonly _: 'stories.togglePinned'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
  readonly pinned: boolean
}

/** `stories.togglePinnedToTop#0b297e9b` */
export interface TogglePinnedToTop {
  readonly _: 'stories.togglePinnedToTop'
  readonly peer: root_i$.TypeInputPeer
  readonly id: readonly number[]
}

/** Any `stories.Albums`. */
export type TypeAlbums =
  | Albums
  | AlbumsNotModified

/** Any `stories.AllStories`. */
export type TypeAllStories =
  | AllStories
  | AllStoriesNotModified

/** Any `stories.CanSendStoryCount`. */
export type TypeCanSendStoryCount =
  | CanSendStoryCount

/** Any `stories.FoundStories`. */
export type TypeFoundStories =
  | FoundStories

/** Any `stories.PeerStories`. */
export type TypePeerStories =
  | PeerStories

/** Any `stories.Stories`. */
export type TypeStories =
  | Stories

/** Any `stories.StoryReactionsList`. */
export type TypeStoryReactionsList =
  | StoryReactionsList

/** Any `stories.StoryViews`. */
export type TypeStoryViews =
  | StoryViews

/** Any `stories.StoryViewsList`. */
export type TypeStoryViewsList =
  | StoryViewsList

/** `stories.updateAlbum#5e5259b6` */
export interface UpdateAlbum {
  readonly _: 'stories.updateAlbum'
  readonly peer: root_i$.TypeInputPeer
  readonly album_id: number
  readonly title?: string
  readonly delete_stories?: readonly number[]
  readonly add_stories?: readonly number[]
  readonly order?: readonly number[]
}
