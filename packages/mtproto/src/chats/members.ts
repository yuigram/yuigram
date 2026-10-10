// SPDX-License-Identifier: MIT

/**
 * Who is in a conversation, and what they may do there.
 *
 * Every operation here exists in two families, because Telegram keeps basic
 * groups and channels apart: adding somebody is `messages.addChatUser` in one
 * and `channels.inviteToChannel` in the other, removing them is
 * `messages.deleteChatUser` or a full restriction, and a basic group has no
 * notion of administrator rights beyond a rank at all. Choosing between them is
 * this module's job.
 *
 * ```
 *   basic group   ──> messages.addChatUser / deleteChatUser / editChatParticipantRank
 *   channel       ──> channels.inviteToChannel / editBanned / editAdmin
 * ```
 *
 * **Banning and restricting are the same call.** Telegram expresses both as a
 * set of things somebody may not do, and a ban is that set with everything in
 * it — `view_messages` included, which is what makes it a ban rather than a
 * mute. Unbanning is the same call with the set empty. That is why
 * {@link banMember}, {@link restrictMember} and {@link unbanMember} are three
 * names over one request: the distinction is real to a caller and does not
 * exist in the protocol.
 *
 * **Removing is not banning.** Somebody removed from a channel may rejoin; a
 * banned one may not. {@link kickMember} is the first: it restricts and then
 * immediately lifts the restriction, which is how the protocol spells "out, but
 * not barred", and it is two calls because there is no single one.
 */

import { ValidationError } from '@yuigram/core'
import { MemberView } from '../entities/member.js'
import type { TypeChatAdminRights } from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { TlValue } from '../tl/index.js'
import type { AdminRights, Chatting, Restrictions } from './common.js'
import {
  adminRights,
  asChannel,
  asUser,
  BANNED,
  bannedRights,
  groupIdOf,
  kindOf,
  NO_RESTRICTIONS,
} from './common.js'

/** How somebody is added to a conversation. */
export interface AddOptions {
  /**
   * How much of the history the new member can see, in messages.
   *
   * Basic groups only, and ignored elsewhere: a channel decides visibility by
   * its own setting rather than per member. Zero shows them nothing that came
   * before, which is the safe default for adding somebody to an existing
   * conversation.
   */
  readonly history?: number
}

/** Somebody who could not be added, and why the server said so. */
export interface NotAdded {
  /** Who. */
  readonly userId: bigint
  /**
   * Whether their privacy settings are the reason.
   *
   * The common case: an account that only accepts invitations from contacts.
   * Nothing a caller can do about it except invite them by link instead.
   */
  readonly privacy: boolean
  /** Whether they have to be invited by a link because the chat is full. */
  readonly needsPremium: boolean
}

/**
 * Add people to a conversation.
 *
 * ```ts
 * const missed = await addMembers(account, '@group', ['@ann', '@bo'])
 * ```
 *
 * Answers the people who were *not* added rather than the ones who were, which
 * is the useful half: Telegram reports each refusal with a reason, and a caller
 * that wants to fall back to an invite link needs to know which names to put in
 * it. An empty array means everybody went in.
 *
 * Adding somebody who is already there is not an error and not a refusal.
 */
export async function addMembers(
  client: Chatting,
  chat: string | PeerRef,
  people: readonly (string | PeerRef)[],
  options: AddOptions = {},
): Promise<NotAdded[]> {
  if (people.length === 0) return []

  const resolved = await client.resolve(chat)
  const users = []
  for (const person of people) users.push(await asUser(client, person, 'adding a member'))

  const group = groupIdOf(resolved)

  if (group !== undefined) {
    // A basic group takes one at a time, and says nothing about the rest if one
    // fails — so they go separately and the refusals are collected.
    const missing: NotAdded[] = []

    for (const user of users) {
      const answer = await client.api.messages.addChatUser({
        chat_id: group,
        user_id: user,
        fwd_limit: options.history ?? 0,
      })

      missing.push(...refusals(answer.missing_invitees))
    }

    return missing
  }

  const answer = await client.api.channels.inviteToChannel({
    channel: await asChannel(client, chat, 'adding members'),
    users,
  })

  return refusals(answer.missing_invitees)
}

/** Read the server's reasons into the shape a caller acts on. */
function refusals(
  missing: readonly {
    user_id: bigint
    premium_would_allow?: true
    premium_required_for_pm?: true
  }[],
): NotAdded[] {
  return missing.map((one) => ({
    userId: one.user_id,
    privacy: one.premium_would_allow !== true && one.premium_required_for_pm !== true,
    needsPremium: one.premium_would_allow === true || one.premium_required_for_pm === true,
  }))
}

/**
 * Bar somebody from a channel or supergroup.
 *
 * ```ts
 * await banMember(account, '@channel', '@spammer')
 * ```
 *
 * A ban is every restriction at once, `view_messages` included — that is what
 * separates it from a mute, and what stops them rejoining. `until` makes it
 * temporary; without one it is forever, which is the protocol's own meaning for
 * a zero deadline.
 *
 * A basic group cannot bar anybody: it can only remove them, which
 * {@link kickMember} does.
 */
export async function banMember(
  client: Chatting,
  chat: string | PeerRef,
  member: string | PeerRef,
  options: { readonly until?: number } = {},
): Promise<void> {
  await client.api.channels.editBanned({
    channel: await asChannel(client, chat, 'banning somebody'),
    participant: await client.resolve(member),
    banned_rights: options.until === undefined ? BANNED : { ...BANNED, until_date: options.until },
  })
}

/**
 * Lift every restriction on somebody, and let them back in.
 *
 * The same call as a ban with nothing in the set. Somebody unbanned is not
 * re-added: they may join again, which for a private channel still means being
 * invited.
 */
export async function unbanMember(
  client: Chatting,
  chat: string | PeerRef,
  member: string | PeerRef,
): Promise<void> {
  await client.api.channels.editBanned({
    channel: await asChannel(client, chat, 'unbanning somebody'),
    participant: await client.resolve(member),
    banned_rights: NO_RESTRICTIONS,
  })
}

/**
 * Restrict what somebody may do, without removing them.
 *
 * ```ts
 * await restrictMember(account, '@group', '@noisy', {
 *   sendMedia: true,
 *   until: Math.floor(Date.now() / 1000) + 86_400,
 * })
 * ```
 *
 * The record says what they may **not** do; anything left out they may. Passing
 * an empty set lifts everything, which is {@link unbanMember} under another
 * name — spelled separately because the two read differently at a call site.
 */
export async function restrictMember(
  client: Chatting,
  chat: string | PeerRef,
  member: string | PeerRef,
  restrictions: Restrictions,
): Promise<void> {
  await client.api.channels.editBanned({
    channel: await asChannel(client, chat, 'restricting somebody'),
    participant: await client.resolve(member),
    banned_rights: bannedRights(restrictions),
  })
}

/**
 * Remove somebody without barring them from returning.
 *
 * ```ts
 * await kickMember(account, '@channel', '@somebody')
 * ```
 *
 * Two calls in a channel, because the protocol has no single one: the member is
 * restricted out and the restriction is lifted immediately, which leaves them
 * outside and free to rejoin. A basic group has a call for exactly this, so
 * that one is used instead.
 *
 * The lift is attempted even if it is refused, because leaving somebody banned
 * when the caller asked for a kick is the worse failure of the two.
 */
export async function kickMember(
  client: Chatting,
  chat: string | PeerRef,
  member: string | PeerRef,
  options: { readonly deleteHistory?: boolean } = {},
): Promise<void> {
  const resolved = await client.resolve(chat)
  const group = groupIdOf(resolved)

  if (group !== undefined) {
    await client.api.messages.deleteChatUser({
      chat_id: group,
      user_id: await asUser(client, member, 'removing a member'),
      ...(options.deleteHistory === true ? { revoke_history: true } : {}),
    })

    return
  }

  const channel = await asChannel(client, chat, 'removing a member')
  const participant = await client.resolve(member)

  await client.api.channels.editBanned({
    channel,
    participant,
    banned_rights: { ...BANNED, until_date: 0 },
  })

  await client.api.channels.editBanned({
    channel,
    participant,
    banned_rights: NO_RESTRICTIONS,
  })
}

/**
 * Give somebody administrator rights, or take them away.
 *
 * ```ts
 * await setAdminRights(account, '@channel', '@ann', { deleteMessages: true, banUsers: true })
 * await setAdminRights(account, '@channel', '@ann', {})
 * ```
 *
 * An empty record demotes: the rights are the whole statement, so somebody with
 * none of them is not an administrator. That is the protocol's own model and
 * the reason there is no separate demotion call.
 *
 * An account may only grant rights it holds itself, which the server enforces.
 * A rank of its own is set with {@link setMemberRank}; it is a separate call
 * for a channel and part of this one is not.
 */
export async function setAdminRights(
  client: Chatting,
  chat: string | PeerRef,
  member: string | PeerRef,
  rights: AdminRights,
  options: { readonly rank?: string } = {},
): Promise<void> {
  await client.api.channels.editAdmin({
    channel: await asChannel(client, chat, 'changing administrator rights'),
    user_id: await asUser(client, member, 'an administrator'),
    admin_rights: adminRights(rights),
    ...(options.rank === undefined ? {} : { rank: options.rank }),
  })
}

/**
 * Set the title shown beside an administrator's name.
 *
 * ```ts
 * await setMemberRank(account, '@channel', '@ann', 'moderator')
 * ```
 *
 * A label rather than a right: it changes what is displayed and nothing about
 * what they may do. Passing nothing clears it back to the default, which is the
 * word Telegram picks for their role.
 *
 * Works in both families, through different calls.
 */
export async function setMemberRank(
  client: Chatting,
  chat: string | PeerRef,
  member: string | PeerRef,
  rank: string | undefined,
): Promise<void> {
  await client.api.messages.editChatParticipantRank({
    peer: await client.resolve(chat),
    participant: await client.resolve(member),
    rank: rank ?? '',
  })
}

/**
 * Read one member's standing.
 *
 * ```ts
 * const member = await readChatMember(account, '@channel', '@ann')
 * console.log(member?.standing)
 * ```
 *
 * Answers nothing where they are not in the conversation, which is what
 * Telegram says by refusing — the distinction between "not a member" and "the
 * request was wrong" is worth keeping, so only the first becomes an absence.
 *
 * A basic group keeps its members in its full description rather than as a
 * list, so this reads that and picks one out.
 */
export async function readChatMember(
  client: Chatting,
  chat: string | PeerRef,
  member: string | PeerRef,
): Promise<MemberView | undefined> {
  const resolved = await client.resolve(chat)

  if (kindOf(resolved) === 'group') {
    throw new ValidationError(
      'a basic group keeps its members in its full description; read that instead',
    )
  }

  const answer = await client.api.channels.getParticipant({
    channel: await asChannel(client, chat, 'reading a member'),
    participant: await client.resolve(member),
  })

  return new MemberView(answer.participant)
}

/**
 * Hand a conversation to somebody else.
 *
 * ```ts
 * await transferOwnership(account, '@channel', '@ann', 'my-two-factor-password')
 * ```
 *
 * The password is required by the protocol rather than by this: handing over a
 * channel is irreversible, so Telegram asks the current owner to prove they are
 * at the keyboard. An account with no two-factor password cannot transfer
 * anything until it sets one, which the server says rather than this.
 *
 * The new owner must already be an administrator with every right, and must
 * have been in the conversation long enough — both the server's rules.
 */
export async function transferOwnership(
  client: Chatting,
  chat: string | PeerRef,
  to: string | PeerRef,
  password: string,
): Promise<void> {
  // Loaded when a transfer happens rather than on the way up: this reaches
  // SRP, and a channel being handed over is not something most programs do.
  const { passwordProof, readPasswordChallenge } = await import('../auth/password.js')
  const challenge = readPasswordChallenge(
    (await client.api.account.getPassword()) as unknown as TlValue,
  )

  await client.api.messages.editChatCreator({
    peer: await client.resolve(chat),
    user_id: await asUser(client, to, 'the new owner'),
    password: await passwordProof(password, challenge),
  })
}

/**
 * Join a channel or supergroup this account can already name.
 *
 * ```ts
 * await joinChat(account, '@channel')
 * ```
 *
 * For a public one, or a private one this account has an invite link for —
 * {@link joinByLink} is the one that takes a link. Joining something already
 * joined is not an error.
 */
export async function joinChat(client: Chatting, chat: string | PeerRef): Promise<void> {
  await client.api.channels.joinChannel({
    channel: await asChannel(client, chat, 'joining'),
  })
}

/**
 * Leave a conversation.
 *
 * ```ts
 * await leaveChat(account, '@channel')
 * ```
 *
 * `deleteHistory` removes this account's copy of what was said, which only a
 * basic group offers — a channel keeps its history for everybody and leaving
 * does not change that.
 */
export async function leaveChat(
  client: Chatting,
  chat: string | PeerRef,
  options: { readonly deleteHistory?: boolean } = {},
): Promise<void> {
  const resolved = await client.resolve(chat)
  const group = groupIdOf(resolved)

  if (group !== undefined) {
    await client.api.messages.deleteChatUser({
      chat_id: group,
      user_id: { _: 'inputUserSelf' },
      ...(options.deleteHistory === true ? { revoke_history: true } : {}),
    })

    return
  }

  await client.api.channels.leaveChannel({
    channel: await asChannel(client, chat, 'leaving'),
  })
}

/**
 * Who would own this conversation if this account left it.
 *
 * ```ts
 * const heir = await creatorAfterLeave(account, '@channel')
 * ```
 *
 * Telegram will not leave a conversation without an owner, so it names the
 * administrator who would inherit it. Answers nothing where there is nobody to
 * inherit — which is the answer that matters, because it means leaving would be
 * refused until somebody is promoted.
 */
export async function creatorAfterLeave(
  client: Chatting,
  chat: string | PeerRef,
): Promise<bigint | undefined> {
  const answer = await client.api.messages.getFutureChatCreatorAfterLeave({
    peer: await client.resolve(chat),
  })

  // The empty form is Telegram saying there is nobody to inherit, which is the
  // answer that matters: leaving would be refused until somebody is promoted.
  return answer._ === 'user' ? answer.id : undefined
}

/** Rights nobody has, which is how somebody is demoted. */
export const NO_ADMIN_RIGHTS: TypeChatAdminRights = { _: 'chatAdminRights' }
