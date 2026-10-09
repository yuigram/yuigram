// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from '../root/c.js'
import type * as root_d$ from '../root/d.js'
import type * as root_p$ from '../root/p.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type { TlObject } from '../../../../tl/object.js'

/** `factCheck#b89bfccf` */
export interface FactCheck {
  readonly _: 'factCheck'
  readonly need_check?: true
  readonly country?: string
  readonly text?: root_t$.TypeTextWithEntities
  readonly hash: bigint
}

/** `fileHash#f39b035c` */
export interface FileHash {
  readonly _: 'fileHash'
  readonly offset: bigint
  readonly limit: number
  readonly hash: Uint8Array
}

/** `folder#ff544e65` */
export interface Folder {
  readonly _: 'folder'
  readonly autofill_new_broadcasts?: true
  readonly autofill_public_groups?: true
  readonly autofill_new_correspondents?: true
  readonly id: number
  readonly title: string
  readonly photo?: root_c$.TypeChatPhoto
}

/** `folderPeer#e9baa668` */
export interface FolderPeer {
  readonly _: 'folderPeer'
  readonly peer: root_p$.TypePeer
  readonly folder_id: number
}

/** `forumTopic#fcdad815` */
export interface ForumTopic {
  readonly _: 'forumTopic'
  readonly my?: true
  readonly closed?: true
  readonly pinned?: true
  readonly short?: true
  readonly hidden?: true
  readonly title_missing?: true
  readonly id: number
  readonly date: number
  readonly peer: root_p$.TypePeer
  readonly title: string
  readonly icon_color: number
  readonly icon_emoji_id?: bigint
  readonly top_message: number
  readonly read_inbox_max_id: number
  readonly read_outbox_max_id: number
  readonly unread_count: number
  readonly unread_mentions_count: number
  readonly unread_reactions_count: number
  readonly unread_poll_votes_count: number
  readonly from_id: root_p$.TypePeer
  readonly notify_settings: root_p$.TypePeerNotifySettings
  readonly draft?: root_d$.TypeDraftMessage
}

/** `forumTopicDeleted#023f109b` */
export interface ForumTopicDeleted {
  readonly _: 'forumTopicDeleted'
  readonly id: number
}

/** `foundStory#e87acbc0` */
export interface FoundStory {
  readonly _: 'foundStory'
  readonly peer: root_p$.TypePeer
  readonly story: root_s$.TypeStoryItem
}

/** Any `FactCheck`. */
export type TypeFactCheck =
  | FactCheck

/** Any `FileHash`. */
export type TypeFileHash =
  | FileHash

/** Any `Folder`. */
export type TypeFolder =
  | Folder

/** Any `FolderPeer`. */
export type TypeFolderPeer =
  | FolderPeer

/** Any `ForumTopic`. */
export type TypeForumTopic =
  | ForumTopic
  | ForumTopicDeleted

/** Any `FoundStory`. */
export type TypeFoundStory =
  | FoundStory
