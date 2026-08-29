// GENERATED FILE — do not edit.
// TL types for stories
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_c$ from './root/c.js'
import type * as root_f$ from './root/f.js'
import type * as root_p$ from './root/p.js'
import type * as root_s$ from './root/s.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

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

/** `stories.canSendStoryCount#c387c04e` */
export interface CanSendStoryCount {
  readonly _: 'stories.canSendStoryCount'
  readonly count_remains: number
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

/** `stories.peerStories#cae68768` */
export interface PeerStories {
  readonly _: 'stories.peerStories'
  readonly stories: root_p$.TypePeerStories
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
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
