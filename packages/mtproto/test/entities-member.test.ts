// SPDX-License-Identifier: MIT

/**
 * Reading somebody's standing in a conversation.
 *
 * The six constructors do not share a shape, and two of the differences matter.
 * A banned or departed entry names a peer rather than a user, because a channel
 * can be banned from another channel — a reader that assumed a user would be
 * reading a channel's number as a person's. And the same constructor covers
 * somebody restricted and somebody removed, separated only by a flag.
 */

import { describe, expect, it } from 'vitest'
import { MemberView, readMember } from '../src/entities/member.js'
import type { TypeChannelParticipant } from '../src/generated/api/types/index.js'

const RIGHTS = {
  _: 'chatAdminRights',
  change_info: true,
  delete_messages: true,
} as const

describe('which of the six an entry is', () => {
  it('names each one', () => {
    const cases: readonly (readonly [TypeChannelParticipant, string])[] = [
      [{ _: 'channelParticipant', user_id: 1n, date: 0 }, 'member'],
      [{ _: 'channelParticipantSelf', user_id: 2n, inviter_id: 9n, date: 0 }, 'self'],
      [{ _: 'channelParticipantCreator', user_id: 3n, admin_rights: RIGHTS }, 'creator'],
      [
        {
          _: 'channelParticipantAdmin',
          user_id: 4n,
          promoted_by: 9n,
          date: 0,
          admin_rights: RIGHTS,
        },
        'administrator',
      ],
      [
        {
          _: 'channelParticipantBanned',
          peer: { _: 'peerUser', user_id: 5n },
          kicked_by: 9n,
          date: 0,
          banned_rights: { _: 'chatBannedRights', until_date: 0 },
        },
        'restricted',
      ],
      [{ _: 'channelParticipantLeft', peer: { _: 'peerUser', user_id: 6n } }, 'left'],
    ]

    for (const [value, standing] of cases) {
      expect(new MemberView(value).standing).toBe(standing)
    }
  })
})

describe('who an entry is about', () => {
  it('reads a user from the constructors that name one', () => {
    const member = new MemberView({ _: 'channelParticipant', user_id: 7n, date: 0 })

    expect(member.peer).toEqual({ kind: 'user', id: 7n })
    expect(member.isUser).toBe(true)
  })

  it('reads a peer from the two that can name a conversation', () => {
    // A channel banned from another channel is not a person, and reading its
    // number as a user id would name somebody else entirely.
    const banned = new MemberView({
      _: 'channelParticipantBanned',
      peer: { _: 'peerChannel', channel_id: 55n },
      kicked_by: 9n,
      date: 0,
      banned_rights: { _: 'chatBannedRights', until_date: 0 },
    })
    const left = new MemberView({
      _: 'channelParticipantLeft',
      peer: { _: 'peerChannel', channel_id: 66n },
    })

    expect(banned.peer).toEqual({ kind: 'channel', id: 55n })
    expect(banned.isUser).toBe(false)
    expect(left.peer).toEqual({ kind: 'channel', id: 66n })
  })
})

describe('what each standing carries', () => {
  it('separates somebody restricted from somebody removed', () => {
    // One constructor, two meanings, told apart by a flag: a restricted member
    // is still in the conversation with less to do, and a removed one is not.
    const base = {
      _: 'channelParticipantBanned' as const,
      peer: { _: 'peerUser' as const, user_id: 5n },
      kicked_by: 9n,
      date: 1_700_000_000,
      banned_rights: {
        _: 'chatBannedRights' as const,
        until_date: 0,
        send_messages: true as const,
      },
    }

    expect(new MemberView(base).wasRemoved).toBe(false)
    expect(new MemberView({ ...base, left: true }).wasRemoved).toBe(true)
    expect(new MemberView(base).restrictedBy).toBe(9n)
    expect(new MemberView(base).bannedRights).toBe(base.banned_rights)
    expect(new MemberView(base).adminRights).toBeUndefined()
  })

  it('reads administrator rights from the two that carry them', () => {
    const creator = new MemberView({
      _: 'channelParticipantCreator',
      user_id: 3n,
      admin_rights: RIGHTS,
      rank: 'Owner',
    })
    const admin = new MemberView({
      _: 'channelParticipantAdmin',
      user_id: 4n,
      promoted_by: 9n,
      inviter_id: 8n,
      date: 0,
      admin_rights: RIGHTS,
      can_edit: true,
      rank: 'Mod',
    })

    expect(creator.adminRights).toBe(RIGHTS)
    expect(creator.rank).toBe('Owner')
    expect(creator.promotedBy).toBeUndefined()
    expect(admin.adminRights).toBe(RIGHTS)
    expect(admin.promotedBy).toBe(9n)
    expect(admin.invitedBy).toBe(8n)
    expect(admin.canEdit).toBe(true)
    expect(admin.rank).toBe('Mod')
  })

  it('answers whether an entry is about this account from either place it can say so', () => {
    const own = new MemberView({
      _: 'channelParticipantSelf',
      user_id: 2n,
      inviter_id: 9n,
      date: 0,
      via_request: true,
    })
    const admin = new MemberView({
      _: 'channelParticipantAdmin',
      user_id: 4n,
      promoted_by: 9n,
      date: 0,
      admin_rights: RIGHTS,
      self: true,
    })
    const other = new MemberView({ _: 'channelParticipant', user_id: 1n, date: 0 })

    expect(own.isSelf).toBe(true)
    expect(own.joinedByRequest).toBe(true)
    expect(admin.isSelf).toBe(true)
    expect(other.isSelf).toBe(false)
  })

  it('reads when somebody joined, where the entry says', () => {
    expect(
      new MemberView({ _: 'channelParticipant', user_id: 1n, date: 1_700_000_000 }).joinedAt,
    ).toBe(1_700_000_000)
    expect(
      new MemberView({ _: 'channelParticipantLeft', peer: { _: 'peerUser', user_id: 6n } })
        .joinedAt,
    ).toBeUndefined()
  })

  it('reads a paid subscription where one applies', () => {
    const member = new MemberView({
      _: 'channelParticipant',
      user_id: 1n,
      date: 0,
      subscription_until_date: 1_700_100_000,
    })

    expect(member.subscriptionUntil).toBe(1_700_100_000)
  })

  it('says nothing for a departed entry, which carries only a peer', () => {
    const left = new MemberView({
      _: 'channelParticipantLeft',
      peer: { _: 'peerUser', user_id: 6n },
    })

    expect(left.rank).toBeUndefined()
    expect(left.adminRights).toBeUndefined()
    expect(left.bannedRights).toBeUndefined()
    expect(left.invitedBy).toBeUndefined()
    expect(left.subscriptionUntil).toBeUndefined()
    expect(left.wasRemoved).toBe(false)
    expect(left.canEdit).toBe(false)
  })
})

describe('building a member view', () => {
  it('takes what an answer carries, including nothing', () => {
    expect(readMember(undefined)).toBeUndefined()
    expect(readMember({ _: 'channelParticipant', user_id: 1n, date: 0 })?.standing).toBe('member')
  })

  it('copies nothing', () => {
    const value: TypeChannelParticipant = { _: 'channelParticipant', user_id: 1n, date: 0 }

    expect(readMember(value)?.raw).toBe(value)
    expect(new MemberView(value).toJSON()).toBe(value)
  })
})
