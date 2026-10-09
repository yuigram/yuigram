// SPDX-License-Identifier: MPL-2.0

/**
 * Reading somebody's standing in a conversation.
 *
 * Six constructors, and which one arrived is most of the answer: an ordinary
 * member, this account, the creator, an administrator, somebody banned or
 * restricted, and somebody who has left. They do not share a shape — a banned
 * entry names a peer rather than a user, because a channel can ban another
 * channel, and only two of the six carry administrator rights.
 *
 * ```
 *   channelParticipantAdmin  ──> user_id, admin_rights, promoted_by, rank
 *   channelParticipantBanned ──> peer, banned_rights, kicked_by
 *   channelParticipantLeft   ──> peer, and nothing else
 * ```
 *
 * A basic group describes its members with three constructors of its own —
 * `chatParticipant`, `chatParticipantAdmin`, `chatParticipantCreator` — which
 * carry less: no rights, no bans, nobody who has left. The same view reads both
 * families, so a caller listing members does not have to know which kind of
 * group it is looking at, and what a basic group cannot say reads as absent.
 *
 * As with every view here: it holds the value, computes on access, and reaches
 * nothing. Naming the person means reading the answer's users through
 * {@link PeerIndex}, and changing their standing is a call.
 */

import type {
  TypeChannelParticipant,
  TypeChatAdminRights,
  TypeChatBannedRights,
  TypeChatParticipant,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'

/** What somebody is in a conversation. */
export type MemberStanding = 'member' | 'self' | 'creator' | 'administrator' | 'restricted' | 'left'

/** Somebody's standing in a conversation, read. */
export class MemberView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeChannelParticipant | TypeChatParticipant

  constructor(value: TypeChannelParticipant | TypeChatParticipant) {
    this.raw = value
  }

  /** Whether this entry came from a basic group rather than a channel or supergroup. */
  get inBasicGroup(): boolean {
    return this.raw._.startsWith('chatParticipant')
  }

  /** Which of the six this is. */
  get standing(): MemberStanding {
    switch (this.raw._) {
      case 'channelParticipantSelf':
        return 'self'
      case 'channelParticipantCreator':
      case 'chatParticipantCreator':
        return 'creator'
      case 'channelParticipantAdmin':
      case 'chatParticipantAdmin':
        return 'administrator'
      case 'channelParticipantBanned':
        return 'restricted'
      case 'channelParticipantLeft':
        return 'left'
      default:
        return 'member'
    }
  }

  /**
   * Who this is about.
   *
   * A reference rather than a number, because two of the six name a peer rather
   * than a user — a channel can be banned from another channel, and a reader
   * that assumed a user would be reading a channel's number as a person's.
   */
  get peer(): PeerRef | undefined {
    if (this.raw._ === 'channelParticipantBanned' || this.raw._ === 'channelParticipantLeft') {
      return peerRefOf(this.raw.peer)
    }

    return { kind: 'user', id: this.raw.user_id }
  }

  /** Whether this entry is about a user rather than another conversation. */
  get isUser(): boolean {
    return this.peer?.kind === 'user'
  }

  /** When they joined, in Unix seconds, where the entry says. */
  get joinedAt(): number | undefined {
    if (
      this.raw._ === 'channelParticipant' ||
      this.raw._ === 'channelParticipantSelf' ||
      this.raw._ === 'channelParticipantAdmin' ||
      this.raw._ === 'channelParticipantBanned' ||
      this.raw._ === 'chatParticipant' ||
      this.raw._ === 'chatParticipantAdmin'
    ) {
      return this.raw.date
    }

    return undefined
  }

  /** Who invited them, where the entry says. */
  get invitedBy(): bigint | undefined {
    switch (this.raw._) {
      case 'channelParticipantSelf':
      case 'channelParticipantAdmin':
      case 'chatParticipant':
      case 'chatParticipantAdmin':
        return this.raw.inviter_id
      default:
        return undefined
    }
  }

  /** Who made them an administrator, for one who is. */
  get promotedBy(): bigint | undefined {
    return this.raw._ === 'channelParticipantAdmin' ? this.raw.promoted_by : undefined
  }

  /** Who restricted them, for one who is. */
  get restrictedBy(): bigint | undefined {
    return this.raw._ === 'channelParticipantBanned' ? this.raw.kicked_by : undefined
  }

  /** The title shown beside their name, where they have been given one. */
  get rank(): string | undefined {
    if (this.raw._ === 'channelParticipantLeft') return undefined

    return this.raw.rank
  }

  /** What they may do as an administrator, for one who is. */
  get adminRights(): TypeChatAdminRights | undefined {
    if (this.raw._ === 'channelParticipantCreator') return this.raw.admin_rights
    if (this.raw._ === 'channelParticipantAdmin') return this.raw.admin_rights

    return undefined
  }

  /** What they are barred from doing, for one who is restricted. */
  get bannedRights(): TypeChatBannedRights | undefined {
    return this.raw._ === 'channelParticipantBanned' ? this.raw.banned_rights : undefined
  }

  /**
   * Whether they were removed rather than merely restricted.
   *
   * The same constructor covers both. A restricted member is still in the
   * conversation with less to do; one who was removed is not in it.
   */
  get wasRemoved(): boolean {
    return this.raw._ === 'channelParticipantBanned' ? this.raw.left === true : false
  }

  /**
   * Whether this entry is about the signed-in account.
   *
   * An administrator entry says so directly. The dedicated constructor for
   * this account says it by being that constructor, so both are answered here
   * rather than leaving a reader to check two things.
   */
  get isSelf(): boolean {
    if (this.raw._ === 'channelParticipantSelf') return true

    return this.raw._ === 'channelParticipantAdmin' ? this.raw.self === true : false
  }

  /** Whether this account may change their administrator rights. */
  get canEdit(): boolean {
    return this.raw._ === 'channelParticipantAdmin' ? this.raw.can_edit === true : false
  }

  /** Whether they joined by a request somebody approved. */
  get joinedByRequest(): boolean {
    return this.raw._ === 'channelParticipantSelf' ? this.raw.via_request === true : false
  }

  /** When a paid subscription of theirs runs out, where they have one. */
  get subscriptionUntil(): number | undefined {
    if (this.raw._ === 'channelParticipant') return this.raw.subscription_until_date
    if (this.raw._ === 'channelParticipantSelf') return this.raw.subscription_until_date

    return undefined
  }

  /** The value again, so serializing a view serializes what it reads. */
  toJSON(): TypeChannelParticipant | TypeChatParticipant {
    return this.raw
  }
}

/** Read one standing. Takes what an answer carries, including nothing. */
export function readMember(
  value: TypeChannelParticipant | TypeChatParticipant | undefined,
): MemberView | undefined {
  return value === undefined ? undefined : new MemberView(value)
}
