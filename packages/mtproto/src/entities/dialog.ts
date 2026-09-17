/**
 * Reading a conversation as it appears in a list of them.
 *
 * A dialog is not a conversation: it is this account's row about one — where it
 * has read up to, how much is unread, whether it is pinned, and the number of
 * the most recent message. The conversation itself is the `Chat` or `User` the
 * row points at, which arrives in the same answer and is read through
 * {@link PeerIndex}.
 *
 * ```
 *   dialog ──> peer          ──> the conversation, in the answer's `chats`/`users`
 *          └─> top_message   ──> its newest message, in the answer's `messages`
 * ```
 *
 * Two constructors: an ordinary row, and one standing for a folder of rows
 * rather than a conversation. A reader walking a list meets both, and the
 * second has no unread count of its own worth the name — it has four, counted
 * differently.
 */

import type {
  TypeDialog,
  TypeDraftMessage,
  TypeFolder,
  TypePeerNotifySettings,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'

/**
 * Which of the three a row is.
 *
 * A community row stands for a community rather than for a conversation: it
 * names the community and carries no message, because a community is a group of
 * chats rather than somewhere to write.
 */
export type DialogForm = 'conversation' | 'folder' | 'community'

/**
 * One row in a list of conversations.
 *
 * As with every view here: it holds the value, computes on access, and reaches
 * nothing. Naming the conversation a row points at means reading the answer's
 * peers, and fetching its messages means a call.
 */
export class DialogView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeDialog

  constructor(value: TypeDialog) {
    this.raw = value
  }

  /** Which of the three this is. */
  get form(): DialogForm {
    if (this.raw._ === 'dialogFolder') return 'folder'

    return this.raw._ === 'dialogCommunity' ? 'community' : 'conversation'
  }

  /** Whether this row stands for a folder rather than a conversation. */
  get isFolder(): boolean {
    return this.raw._ === 'dialogFolder'
  }

  /** Whether this row stands for a community rather than a conversation. */
  get isCommunity(): boolean {
    return this.raw._ === 'dialogCommunity'
  }

  /** The community this row is about, where it is about one. */
  get communityId(): bigint | undefined {
    return this.raw._ === 'dialogCommunity' ? this.raw.community_id : undefined
  }

  /**
   * The conversation this row is about.
   *
   * For a folder row this is the peer the folder is filed under rather than
   * somebody to talk to.
   */
  get peer(): PeerRef | undefined {
    return this.raw._ === 'dialogCommunity' ? undefined : peerRefOf(this.raw.peer)
  }

  /**
   * The number of the most recent message in it.
   *
   * Absent on a community row, which has no messages of its own.
   */
  get topMessageId(): number | undefined {
    return this.raw._ === 'dialogCommunity' ? undefined : this.raw.top_message
  }

  /** Whether it is pinned to the top of the list. */
  get isPinned(): boolean {
    return this.raw.pinned === true
  }

  /**
   * How many messages have not been read.
   *
   * A folder row counts muted and unmuted separately and has no single answer,
   * so it gives none rather than adding two numbers that mean different things.
   */
  get unreadCount(): number | undefined {
    return this.raw._ === 'dialog' ? this.raw.unread_count : undefined
  }

  /** How many unread messages mention this account. */
  get unreadMentionsCount(): number | undefined {
    return this.raw._ === 'dialog' ? this.raw.unread_mentions_count : undefined
  }

  /** How many unread reactions there are to this account's messages. */
  get unreadReactionsCount(): number | undefined {
    return this.raw._ === 'dialog' ? this.raw.unread_reactions_count : undefined
  }

  /** Whether it has been marked unread by hand despite having nothing new. */
  get isMarkedUnread(): boolean {
    return this.raw._ === 'dialog' ? this.raw.unread_mark === true : false
  }

  /** The newest message this account has read of what it received. */
  get readInboxMaxId(): number | undefined {
    return this.raw._ === 'dialog' ? this.raw.read_inbox_max_id : undefined
  }

  /** The newest message this account sent that has been read by the other side. */
  get readOutboxMaxId(): number | undefined {
    return this.raw._ === 'dialog' ? this.raw.read_outbox_max_id : undefined
  }

  /** How this account is notified about it. */
  get notifySettings(): TypePeerNotifySettings | undefined {
    return this.raw._ === 'dialog' ? this.raw.notify_settings : undefined
  }

  /** The message typed into it and not sent, where there is one. */
  get draft(): TypeDraftMessage | undefined {
    return this.raw._ === 'dialog' ? this.raw.draft : undefined
  }

  /** The folder it has been filed into, where it has been filed. */
  get folderId(): number | undefined {
    return this.raw._ === 'dialog' ? this.raw.folder_id : undefined
  }

  /** Its place in the update sequence, for a channel that keeps its own. */
  get pts(): number | undefined {
    return this.raw._ === 'dialog' ? this.raw.pts : undefined
  }

  /**
   * How long messages in it live before deleting themselves, in seconds.
   *
   * Set on the conversation rather than on a message: every message sent into
   * it inherits this, which is why it belongs on the row and not only on what
   * the row points at.
   */
  get ttlPeriod(): number | undefined {
    return this.raw._ === 'dialog' ? this.raw.ttl_period : undefined
  }

  /** Whether a forum is shown as a flat list of messages rather than as topics. */
  get viewForumAsMessages(): boolean {
    return this.raw._ === 'dialog' ? this.raw.view_forum_as_messages === true : false
  }

  /** How many muted conversations in a folder have something unread. */
  get folderUnreadMutedPeers(): number | undefined {
    return this.raw._ === 'dialogFolder' ? this.raw.unread_muted_peers_count : undefined
  }

  /** How many unmuted conversations in a folder have something unread. */
  get folderUnreadUnmutedPeers(): number | undefined {
    return this.raw._ === 'dialogFolder' ? this.raw.unread_unmuted_peers_count : undefined
  }

  /** How many unread messages sit in a folder's muted conversations. */
  get folderUnreadMutedMessages(): number | undefined {
    return this.raw._ === 'dialogFolder' ? this.raw.unread_muted_messages_count : undefined
  }

  /** How many unread messages sit in a folder's unmuted conversations. */
  get folderUnreadUnmutedMessages(): number | undefined {
    return this.raw._ === 'dialogFolder' ? this.raw.unread_unmuted_messages_count : undefined
  }

  /** The folder this row stands for, for a folder row. */
  get folder(): TypeFolder | undefined {
    return this.raw._ === 'dialogFolder' ? this.raw.folder : undefined
  }

  /** The value again, so serializing a view serializes what it reads. */
  toJSON(): TypeDialog {
    return this.raw
  }
}

/** Read one row. Takes what an answer carries, including nothing. */
export function readDialog(value: TypeDialog | undefined): DialogView | undefined {
  return value === undefined ? undefined : new DialogView(value)
}
