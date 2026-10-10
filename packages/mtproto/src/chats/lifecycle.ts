// SPDX-License-Identifier: MIT

/**
 * Making conversations and taking them away.
 *
 * Creation is the one place in this family where the answer matters more than
 * the fact it succeeded: the new conversation's identifier and access hash are
 * in the updates the call returns, and a caller with nothing to address cannot
 * do the next thing. So each of these reads the conversation out of its own
 * answer and hands it back; the account takes the updates into its sequences as
 * it takes every answer's.
 *
 * ```
 *   createGroup      ──> messages.createChat      ──> a basic group
 *   createSupergroup ──> channels.createChannel   ──> megagroup
 *   createChannel    ──> channels.createChannel   ──> broadcast
 * ```
 *
 * **A supergroup and a channel are one construct.** The protocol makes both
 * with the same call and one flag between them, which is why converting a basic
 * group to a supergroup produces a *different* conversation with a different
 * identifier rather than changing the one that was there.
 *
 * **Deleting is not leaving.** Deleting a channel removes it for everybody and
 * cannot be undone; {@link leaveChat} only removes this account. They are named
 * far enough apart that neither is reached for by accident.
 */

import { ValidationError } from '@yuigram/core'
import { ChatView } from '../entities/peer.js'
import type { TypeUpdates } from '../generated/api/types/index.js'
import { channelFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { Chatting } from './common.js'
import { asChannel, asUser, groupIdOf, removeInStages } from './common.js'

/** How a new conversation starts out. */
export interface NewChat {
  readonly title: string
  /** What it says about itself. Channels and supergroups only. */
  readonly description?: string
  /**
   * How long messages live in it, in seconds.
   *
   * Set at creation rather than afterwards, so the first message is already
   * covered by it.
   */
  readonly ttl?: number
}

/**
 * Make a basic group.
 *
 * ```ts
 * const group = await createGroup(account, { title: 'Weekend' }, ['@ann', '@bo'])
 * ```
 *
 * A basic group needs people at creation: Telegram has no empty one. Anybody
 * whose privacy settings refuse the invitation is left out, and the group is
 * still made — so the answer is the group rather than a failure, and who did
 * not make it in is read from the members afterwards.
 */
export async function createGroup(
  client: Chatting,
  chat: NewChat,
  people: readonly (string | PeerRef)[],
): Promise<ChatView> {
  if (people.length === 0) {
    throw new ValidationError(
      'a basic group is made with the people in it; Telegram has no empty one',
    )
  }

  const users = []
  for (const person of people) users.push(await asUser(client, person, 'a member of a new group'))

  const answer = await client.api.messages.createChat({
    users,
    title: chat.title,
    ...(chat.ttl === undefined ? {} : { ttl_period: chat.ttl }),
  })

  return createdChat(answer.updates, 'messages.createChat')
}

/**
 * Make a supergroup.
 *
 * ```ts
 * const group = await createSupergroup(account, { title: 'Project', description: 'ours' })
 * ```
 *
 * Starts empty, unlike a basic group, and members are added afterwards. A
 * forum is a supergroup with topics turned on, which is what `forum` says.
 */
export async function createSupergroup(
  client: Chatting,
  chat: NewChat & { readonly forum?: boolean },
): Promise<ChatView> {
  const answer = await client.api.channels.createChannel({
    megagroup: true,
    title: chat.title,
    about: chat.description ?? '',
    ...(chat.forum === true ? { forum: true } : {}),
    ...(chat.ttl === undefined ? {} : { ttl_period: chat.ttl }),
  })

  return createdChat(answer, 'channels.createChannel')
}

/**
 * Make a broadcast channel.
 *
 * ```ts
 * const channel = await createChannel(account, { title: 'Announcements' })
 * ```
 *
 * The same call a supergroup is made with and the other flag. A channel
 * broadcasts: members read and only administrators write.
 */
export async function createChannel(client: Chatting, chat: NewChat): Promise<ChatView> {
  const answer = await client.api.channels.createChannel({
    broadcast: true,
    title: chat.title,
    about: chat.description ?? '',
    ...(chat.ttl === undefined ? {} : { ttl_period: chat.ttl }),
  })

  return createdChat(answer, 'channels.createChannel')
}

/**
 * Read the conversation a creation call just made, out of its own answer.
 *
 * The updates carry it because everything that happened is in them — there is
 * no separate result. Refused by name when they do not, because handing back a
 * conversation nobody can address would be worse than saying so.
 */
function createdChat(updates: TypeUpdates, what: string): ChatView {
  const chats =
    updates._ === 'updates' || updates._ === 'updatesCombined' ? updates.chats : undefined

  const made = chats?.find((chat) => chat._ === 'chat' || chat._ === 'channel')

  if (made === undefined) {
    throw new ValidationError(`${what} did not describe the conversation it made`)
  }

  return new ChatView(made)
}

/**
 * Delete a channel or supergroup for everybody.
 *
 * Irreversible, and possible only for the creator. {@link leaveChat} is the one
 * that removes this account and leaves the conversation standing.
 */
export async function deleteChannel(client: Chatting, chat: string | PeerRef): Promise<void> {
  await client.api.channels.deleteChannel({
    channel: await asChannel(client, chat, 'deleting a channel'),
  })
}

/**
 * Delete a basic group for everybody.
 *
 * Every member is removed first, which is what the protocol requires: a basic
 * group is deleted by emptying it, and the call that empties it takes one
 * member at a time. This account goes last, because removing it first would
 * leave nobody able to remove the rest.
 */
export async function deleteGroup(client: Chatting, chat: string | PeerRef): Promise<void> {
  const resolved = await client.resolve(chat)
  const group = groupIdOf(resolved)

  if (group === undefined) {
    throw new ValidationError('this is not a basic group; a channel is deleted with deleteChannel')
  }

  await client.api.messages.deleteChat({ chat_id: group })
}

/** How much of a conversation's history to remove. */
export interface HistoryRemoval {
  /**
   * Remove it for everybody rather than only for this account.
   *
   * Only possible where Telegram allows it — a private chat within its time
   * limit, or a conversation this account administers. Refused by the server
   * otherwise rather than silently downgraded.
   */
  readonly forEveryone?: boolean
  /** Stop at this message number, keeping anything newer. */
  readonly upTo?: number
  /** Keep the conversation in the list, removing only what was said in it. */
  readonly keepChat?: boolean
}

/**
 * Remove what was said in a conversation.
 *
 * ```ts
 * await deleteHistory(account, '@someone', { forEveryone: true })
 * ```
 *
 * By default this removes the conversation from the list as well.
 * `keepChat` leaves the conversation and empties it, which is the difference
 * between "I am done with this person" and "start again".
 *
 * A private chat or basic group is emptied in as many stages as Telegram asks
 * for, and this returns once the last is done. A channel or supergroup takes
 * the channel call instead, where `forEveryone` removes the history for every
 * member.
 */
export async function deleteHistory(
  client: Chatting,
  chat: string | PeerRef,
  options: HistoryRemoval = {},
): Promise<void> {
  const peer = await client.resolve(chat)
  const channel = channelFor(peer)

  // A channel or supergroup keeps its history under a call of its own, which
  // removes it in one request and answers with updates; `keepChat` has no
  // meaning there, since leaving is a separate operation.
  if (channel !== undefined) {
    await client.api.channels.deleteHistory({
      channel,
      max_id: options.upTo ?? 0,
      ...(options.forEveryone === true ? { for_everyone: true } : {}),
    })
    return
  }

  await removeInStages(() =>
    client.api.messages.deleteHistory({
      peer,
      max_id: options.upTo ?? 0,
      ...(options.forEveryone === true ? { revoke: true } : {}),
      ...(options.keepChat === true ? { just_clear: true } : {}),
    }),
  )
}

/**
 * Remove everything one person said in a channel or supergroup.
 *
 * ```ts
 * await deleteMemberHistory(account, '@group', '@spammer')
 * ```
 *
 * What a moderator reaches for after a ban: the ban stops them saying more and
 * this removes what they already said. Two operations because they are two
 * decisions, and one is not undone by the other.
 */
export async function deleteMemberHistory(
  client: Chatting,
  chat: string | PeerRef,
  member: string | PeerRef,
): Promise<void> {
  const channel = await asChannel(client, chat, "removing one member's messages")
  const participant = await client.resolve(member)

  // Removed in stages like any long history, and each stage advances the
  // channel's own sequence.
  await removeInStages(() => client.api.channels.deleteParticipantHistory({ channel, participant }))
}
