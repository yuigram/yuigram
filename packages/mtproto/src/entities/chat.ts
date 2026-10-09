// SPDX-License-Identifier: MPL-2.0

/**
 * Reading the administrative furniture of a conversation.
 *
 * Four things that are not the conversation and not its messages: the topics a
 * forum divides itself into, the links people join by, the people who joined by
 * one, and the record of what administrators have done. They live together
 * because they answer the same question — how this conversation is run — and
 * because each is a row of a list that arrives one page at a time.
 *
 * ```
 *   forumTopic            ──> id, title, top_message, unread counts
 *   forumTopicDeleted     ──> id, and nothing else
 *
 *   chatInviteExported           ──> link, admin_id, usage, limits
 *   chatInvitePublicJoinRequests ──> no link: requests to a public chat
 *   chatInviteImporter           ──> user_id, date, approved_by
 *
 *   channelAdminLogEvent  ──> id, date, user_id, action
 *                                              └── one of ~50 constructors
 * ```
 *
 * An invite link is a credential: anybody holding it can join what it opens, up
 * to its limits. `docs/security.md` §2 says what follows about logging one.
 *
 * As with every view here: it holds the value, computes on access, and reaches
 * nothing.
 */

import type {
  TypeChannelAdminLogEvent,
  TypeChannelAdminLogEventAction,
  TypeChatInviteImporter,
  TypeExportedChatInvite,
  TypeForumTopic,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'

/** The topic every forum has, which holds messages sent without one. */
const GENERAL = 1

/** One topic in a forum, read. */
export class ForumTopicView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeForumTopic

  constructor(value: TypeForumTopic) {
    this.raw = value
  }

  /** The number identifying it, which is the message that opened it. */
  get id(): number {
    return this.raw.id
  }

  /** Whether the topic still exists. */
  get isDeleted(): boolean {
    return this.raw._ === 'forumTopicDeleted'
  }

  /** Whether this is the topic a forum always has. */
  get isGeneral(): boolean {
    return this.raw.id === GENERAL
  }

  /** What it is called, for a topic that still exists. */
  get title(): string | undefined {
    return this.raw._ === 'forumTopic' ? this.raw.title : undefined
  }

  /** When it was opened, in Unix seconds. */
  get date(): number | undefined {
    return this.raw._ === 'forumTopic' ? this.raw.date : undefined
  }

  /** Who opened it. */
  get creator(): PeerRef | undefined {
    return this.raw._ === 'forumTopic' ? peerRefOf(this.raw.from_id) : undefined
  }

  /** The newest message in it, by number. */
  get lastMessageId(): number | undefined {
    return this.raw._ === 'forumTopic' ? this.raw.top_message : undefined
  }

  /** How many messages in it this account has not read. */
  get unreadCount(): number | undefined {
    return this.raw._ === 'forumTopic' ? this.raw.unread_count : undefined
  }

  /** Whether no more messages may be sent to it. */
  get isClosed(): boolean {
    return this.raw._ === 'forumTopic' && this.raw.closed === true
  }

  /** Whether it is held at the top of the list. */
  get isPinned(): boolean {
    return this.raw._ === 'forumTopic' && this.raw.pinned === true
  }

  /** Whether this account opened it. */
  get isMine(): boolean {
    return this.raw._ === 'forumTopic' && this.raw.my === true
  }

  /** The custom emoji shown beside the title, where one was chosen. */
  get iconEmojiId(): bigint | undefined {
    return this.raw._ === 'forumTopic' ? this.raw.icon_emoji_id : undefined
  }

  /** The colour shown beside the title, where no emoji was chosen. */
  get iconColor(): number | undefined {
    return this.raw._ === 'forumTopic' ? this.raw.icon_color : undefined
  }
}

/** Read a topic, or nothing where there is none. */
export function readForumTopic(value: TypeForumTopic | undefined): ForumTopicView | undefined {
  return value === undefined ? undefined : new ForumTopicView(value)
}

/** One invite link, read. */
export class InviteLinkView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeExportedChatInvite

  constructor(value: TypeExportedChatInvite) {
    this.raw = value
  }

  /**
   * The link itself, for an entry that is one.
   *
   * Absent for the form that reports pending requests to a public conversation:
   * there is no link there, and returning an empty string would let a caller
   * post one.
   */
  get link(): string | undefined {
    return this.raw._ === 'chatInviteExported' ? this.raw.link : undefined
  }

  /** Whether this entry describes a link at all. */
  get isLink(): boolean {
    return this.raw._ === 'chatInviteExported'
  }

  /** What it is called, where it was given a name. */
  get title(): string | undefined {
    return this.raw._ === 'chatInviteExported' ? this.raw.title : undefined
  }

  /** Who created it. */
  get createdBy(): bigint | undefined {
    return this.raw._ === 'chatInviteExported' ? this.raw.admin_id : undefined
  }

  /** When it was created, in Unix seconds. */
  get date(): number | undefined {
    return this.raw._ === 'chatInviteExported' ? this.raw.date : undefined
  }

  /** When it stops working, in Unix seconds, where it has an end. */
  get expiresAt(): number | undefined {
    return this.raw._ === 'chatInviteExported' ? this.raw.expire_date : undefined
  }

  /** How many may use it in total, where it is limited. */
  get usageLimit(): number | undefined {
    return this.raw._ === 'chatInviteExported' ? this.raw.usage_limit : undefined
  }

  /** How many have used it. */
  get usage(): number | undefined {
    return this.raw._ === 'chatInviteExported' ? this.raw.usage : undefined
  }

  /** How many are waiting for approval. */
  get requested(): number | undefined {
    return this.raw._ === 'chatInviteExported' ? this.raw.requested : undefined
  }

  /** Whether joining through it has to be approved. */
  get needsApproval(): boolean {
    return this.raw._ === 'chatInviteExported' && this.raw.request_needed === true
  }

  /** Whether it is the conversation's permanent link. */
  get isPermanent(): boolean {
    return this.raw._ === 'chatInviteExported' && this.raw.permanent === true
  }

  /** Whether it has been withdrawn. */
  get isRevoked(): boolean {
    return this.raw._ === 'chatInviteExported' && this.raw.revoked === true
  }
}

/** Somebody who joined through an invite link, read. */
export class InviteImporterView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeChatInviteImporter

  constructor(value: TypeChatInviteImporter) {
    this.raw = value
  }

  /** Who they are. */
  get userId(): bigint {
    return this.raw.user_id
  }

  /** When they joined, or asked to, in Unix seconds. */
  get date(): number {
    return this.raw.date
  }

  /** Whether they are waiting for approval rather than already in. */
  get isPending(): boolean {
    return this.raw.requested === true
  }

  /** Who let them in, for one who needed approval and was given it. */
  get approvedBy(): bigint | undefined {
    return this.raw.approved_by
  }

  /** What they said when asking to join, where they said anything. */
  get about(): string | undefined {
    return this.raw.about
  }
}

/** What every action constructor is named with. */
const PREFIX = 'channelAdminLogEventAction'

/** One entry in a channel's administration log, read. */
export class ChatEventView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeChannelAdminLogEvent

  constructor(value: TypeChannelAdminLogEvent) {
    this.raw = value
  }

  /**
   * The entry's identifier, which is also where the next page begins.
   *
   * A 64-bit integer: the log of a large channel outgrows what a number can
   * hold exactly, and a cursor that lost precision would page in circles.
   */
  get id(): bigint {
    return this.raw.id
  }

  /** When it happened, in Unix seconds. */
  get date(): number {
    return this.raw.date
  }

  /** Who did it. */
  get userId(): bigint {
    return this.raw.user_id
  }

  /**
   * What was done, by name.
   *
   * The action's constructor with its common prefix removed and the first
   * letter lowered — `channelAdminLogEventActionChangeTitle` reads as
   * `changeTitle` — so a caller switches on something readable rather than on a
   * fifty-character string. Anything not carrying the prefix is handed back
   * whole, because renaming it would hide a constructor nobody expected.
   */
  get kind(): string {
    const name = this.raw.action._
    if (!name.startsWith(PREFIX)) return name

    const rest = name.slice(PREFIX.length)

    return rest.charAt(0).toLowerCase() + rest.slice(1)
  }

  /** What was done, whole. */
  get action(): TypeChannelAdminLogEventAction {
    return this.raw.action
  }
}
