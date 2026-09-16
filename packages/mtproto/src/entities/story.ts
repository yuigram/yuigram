/**
 * Reading stories, who posted them, and who has seen them.
 *
 * Three shapes that arrive together and are not the same thing. A story item is
 * a union whose constructor is most of the answer — the story itself, one that
 * has been deleted, and one the server declined to describe because the account
 * is not allowed to see it. A viewer is a second union, and which one arrived
 * decides whether the viewer is named by a user number, by a peer, or by a
 * message they reposted it into. A peer's stories is neither: it is one peer and
 * the items it currently has.
 *
 * ```
 *   storyItem              ──> the story, with media and a caption
 *   storyItemDeleted       ──> the identifier, and nothing else
 *   storyItemSkipped       ──> when it was posted and when it expires
 *
 *   storyView              ──> user_id
 *   storyViewPublicForward ──> a message it was forwarded into
 *   storyViewPublicRepost  ──> peer_id, and the repost
 * ```
 *
 * As with every view here: it holds the value, computes on access, and reaches
 * nothing. Naming a peer means reading the answer's users and chats through
 * {@link PeerIndex}, and fetching a story's media is a call.
 */

import type {
  TypePeerStories,
  TypeReaction,
  TypeStoryItem,
  TypeStoryView,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'
import type { MediaView } from './media.js'
import { readMedia } from './media.js'
import { MessageView } from './message.js'

/** Which of the three forms a story arrived in. */
export type StoryForm = 'story' | 'deleted' | 'hidden'

/** One story, read. */
export class StoryView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeStoryItem

  constructor(value: TypeStoryItem) {
    this.raw = value
  }

  /** Which of the three this is. */
  get form(): StoryForm {
    if (this.raw._ === 'storyItemDeleted') return 'deleted'
    if (this.raw._ === 'storyItemSkipped') return 'hidden'

    return 'story'
  }

  /** The number identifying it within the peer that posted it. */
  get id(): number {
    return this.raw.id
  }

  /**
   * When it was posted, in Unix seconds.
   *
   * Absent for a deleted one, which carries its number and nothing else.
   */
  get date(): number | undefined {
    return this.raw._ === 'storyItemDeleted' ? undefined : this.raw.date
  }

  /** When it stops being visible, in Unix seconds, where the form says. */
  get expiresAt(): number | undefined {
    return this.raw._ === 'storyItemDeleted' ? undefined : this.raw.expire_date
  }

  /** Who posted it, where the story names somebody other than its owner. */
  get sender(): PeerRef | undefined {
    return this.raw._ === 'storyItem' ? peerRefOf(this.raw.from_id) : undefined
  }

  /** The text below it, for a story this account may read. */
  get caption(): string | undefined {
    return this.raw._ === 'storyItem' ? this.raw.caption : undefined
  }

  /** What it shows. */
  get media(): MediaView | undefined {
    return this.raw._ === 'storyItem' ? readMedia(this.raw.media) : undefined
  }

  /** Whether the account that fetched it is the one that posted it. */
  get isMine(): boolean {
    return this.raw._ === 'storyItem' && this.raw.out === true
  }

  /** Whether it was posted to close friends rather than to everyone. */
  get isCloseFriends(): boolean {
    if (this.raw._ === 'storyItemDeleted') return false

    return this.raw.close_friends === true
  }

  /** Whether the peer that posted it has kept it on their profile. */
  get isPinned(): boolean {
    return this.raw._ === 'storyItem' && this.raw.pinned === true
  }

  /** How many accounts have seen it, where the story carries the count. */
  get viewCount(): number | undefined {
    if (this.raw._ !== 'storyItem') return undefined

    return this.raw.views?.views_count
  }

  /** What this account reacted with, where it has. */
  get myReaction(): TypeReaction | undefined {
    return this.raw._ === 'storyItem' ? this.raw.sent_reaction : undefined
  }
}

/** How somebody came to see a story. */
export type ViewerKind = 'viewed' | 'forwarded' | 'reposted'

/**
 * Somebody who has seen a story, read.
 *
 * Only the plain form carries a moment: a forward and a repost are dated by the
 * message that carries them, which is on the message rather than here.
 */
export class StoryViewerView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeStoryView

  constructor(value: TypeStoryView) {
    this.raw = value
  }

  /** Which of the three this is. */
  get kind(): ViewerKind {
    if (this.raw._ === 'storyViewPublicForward') return 'forwarded'
    if (this.raw._ === 'storyViewPublicRepost') return 'reposted'

    return 'viewed'
  }

  /**
   * Who saw it.
   *
   * A reference rather than a number, because only the plain form names a user:
   * a repost names a peer, which may be a channel, and a forward names none at
   * all — it names a message, and who sent that is read off the message.
   */
  get peer(): PeerRef | undefined {
    if (this.raw._ === 'storyView') return { kind: 'user', id: this.raw.user_id }
    if (this.raw._ === 'storyViewPublicRepost') return peerRefOf(this.raw.peer_id)

    return undefined
  }

  /** When they saw it, in Unix seconds, for the form that says. */
  get date(): number | undefined {
    return this.raw._ === 'storyView' ? this.raw.date : undefined
  }

  /** What they reacted with, where they did. */
  get reaction(): TypeReaction | undefined {
    return this.raw._ === 'storyView' ? this.raw.reaction : undefined
  }

  /** Whether this account has blocked them. */
  get isBlocked(): boolean {
    return this.raw.blocked === true
  }

  /**
   * The message that forwarded it, read.
   *
   * A forward names no peer of its own: who saw the story is who sent this, and
   * that is read off the message rather than off the entry.
   */
  get message(): MessageView | undefined {
    return this.raw._ === 'storyViewPublicForward' ? new MessageView(this.raw.message) : undefined
  }

  /** The story as it was reposted, for the form that carries one. */
  get repost(): StoryView | undefined {
    return this.raw._ === 'storyViewPublicRepost' ? new StoryView(this.raw.story) : undefined
  }
}

/** One peer, and the stories it currently has. */
export class PeerStoriesView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypePeerStories

  constructor(value: TypePeerStories) {
    this.raw = value
  }

  /** Whose stories these are. */
  get peer(): PeerRef | undefined {
    return peerRefOf(this.raw.peer)
  }

  /** The stories themselves, in the order the answer gave them. */
  get stories(): StoryView[] {
    return this.raw.stories.map((story) => new StoryView(story))
  }

  /** The newest story this account has already read, where it has read one. */
  get readUpTo(): number | undefined {
    return this.raw.max_read_id
  }
}

/** Read a story, or nothing where there is none. */
export function readStory(value: TypeStoryItem | undefined): StoryView | undefined {
  return value === undefined ? undefined : new StoryView(value)
}
