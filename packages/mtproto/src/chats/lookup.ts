// SPDX-License-Identifier: MIT

/**
 * Reading conversations, rather than changing them.
 *
 * Two kinds of question. "Who is this" is answered from what the account has
 * already written down wherever possible — resolving a peer harvests it, so a
 * conversation seen once is readable without a call. "Everything about this" is
 * a second, heavier request that carries the description, the counts, the
 * pinned message and the settings, and it differs between the two families.
 *
 * ```
 *   fetchChat      ──> the peer store, or one resolution
 *   fetchFullChat  ──> messages.getFullChat / channels.getFullChannel
 * ```
 *
 * The full form is limited more tightly than the plain one, so a program
 * reading it in a loop over a member list will be told so. That is the reason
 * the two are separate calls rather than one with a flag.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { DialogView } from '../entities/dialog.js'
import { ChatView, UserView } from '../entities/peer.js'
import type { TypeChatFull } from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { Chatting } from './common.js'
import { asChannel, groupIdOf, kindOf } from './common.js'

/**
 * Read a conversation this account can name.
 *
 * ```ts
 * const chat = await fetchChat(account, '@channel')
 * ```
 *
 * Resolving is what finds it, and resolving writes down what it found — so the
 * users and chats the answer described are addressable afterwards. A peer this
 * account has never seen and cannot look up is refused by name.
 */
export async function fetchChat(client: Chatting, chat: string | PeerRef): Promise<ChatView> {
  const full = await fetchFullChat(client, chat)

  return full.chat
}

/**
 * Read several conversations at once.
 *
 * Positional, like `resolveMany`, with a gap where one could not be named. Each
 * is a full read, so this is several requests rather than one — the protocol
 * has no batch form that carries the descriptions.
 */
export async function fetchChats(
  client: Chatting,
  chats: readonly (string | PeerRef)[],
): Promise<(ChatView | undefined)[]> {
  const found: (ChatView | undefined)[] = []

  for (const chat of chats) {
    try {
      found.push(await fetchChat(client, chat))
    } catch (error) {
      if (error instanceof PeerError) {
        found.push(undefined)
        continue
      }

      throw error
    }
  }

  return found
}

/** Everything the full description of a conversation carries. */
export interface FullChat {
  /** The conversation itself. */
  readonly chat: ChatView
  /** What it says about itself. */
  readonly description: string | undefined
  /** How many are in it, where the description states it. */
  readonly members: number | undefined
  /** How many are online, for a conversation that reports it. */
  readonly online: number | undefined
  /** The pinned message's number, where one is pinned. */
  readonly pinnedMessageId: number | undefined
  /** How long messages live in it, in seconds, where a limit is set. */
  readonly messageTtl: number | undefined
  /** How long a member must wait between messages, where slow mode is on. */
  readonly slowMode: number | undefined
  /** The supergroup attached to a channel for comments, where there is one. */
  readonly linkedChat: PeerRef | undefined
  /** The people the answer described, so a caller need not resolve them again. */
  readonly users: UserView[]
  /** The whole answer, for a field this does not name. */
  readonly raw: TypeChatFull
}

/**
 * Read everything Telegram will say about a conversation.
 *
 * ```ts
 * const full = await fetchFullChat(account, '@channel')
 * console.log(full.description, full.members)
 * ```
 *
 * A second request beyond naming it, and limited more tightly. Worth making
 * when the extra fields are wanted and not in a loop.
 */
export async function fetchFullChat(client: Chatting, chat: string | PeerRef): Promise<FullChat> {
  const resolved = await client.resolve(chat)

  if (kindOf(resolved) === 'user') {
    throw new ValidationError(
      'this names a person rather than a conversation; read a profile instead',
    )
  }

  const group = groupIdOf(resolved)
  const answer =
    group === undefined
      ? await client.api.channels.getFullChannel({
          channel: await asChannel(client, chat, 'reading a conversation'),
        })
      : await client.api.messages.getFullChat({ chat_id: group })

  const full = answer.full_chat
  const described = answer.chats.find((one) => one._ === 'chat' || one._ === 'channel')

  if (described === undefined) {
    throw new ValidationError('the answer described no conversation')
  }

  const asChannelFull = full as {
    participants_count?: number
    online_count?: number
    slowmode_seconds?: number
    linked_chat_id?: bigint
  }

  return {
    chat: new ChatView(described),
    description: full.about,
    members: asChannelFull.participants_count ?? membersOf(full),
    online: asChannelFull.online_count,
    // A community's full description is a different constructor with neither
    // field: it describes a group of chats rather than a conversation.
    pinnedMessageId: full._ === 'communityFull' ? undefined : full.pinned_msg_id,
    messageTtl: full._ === 'communityFull' ? undefined : full.ttl_period,
    slowMode: asChannelFull.slowmode_seconds,
    linkedChat:
      asChannelFull.linked_chat_id === undefined
        ? undefined
        : { kind: 'channel', id: asChannelFull.linked_chat_id },
    users: answer.users.filter((user) => user._ === 'user').map((user) => new UserView(user)),
    raw: full,
  }
}

/**
 * How many are in a basic group.
 *
 * A basic group states its members as a list rather than a count, so the count
 * is the length of it. The list has its own forms — one of them says only that
 * the account cannot see it — and that one is a count nobody knows rather than
 * zero.
 */
function membersOf(full: TypeChatFull): number | undefined {
  if (full._ !== 'chatFull') return undefined

  const participants = full.participants

  return participants._ === 'chatParticipants' ? participants.participants.length : undefined
}

/**
 * What a public conversation looks like from outside it.
 *
 * ```ts
 * const preview = await previewChat(account, 'somechannel')
 * ```
 *
 * Takes the public name rather than a peer, because the point is to look at
 * something this account has not joined and may not be able to resolve.
 */
export async function previewChat(
  client: Chatting,
  username: string,
): Promise<ChatView | undefined> {
  const answer = await client.api.contacts.resolveUsername({
    username: username.replace(/^@/, ''),
  })

  // The conversation the name belongs to, not the first one in the answer: an
  // answer can carry others beside it, such as a channel's discussion group.
  // A name that belongs to a person names no conversation.
  const peer = answer.peer
  if (peer._ === 'peerUser') return undefined
  const id = peer._ === 'peerChannel' ? peer.channel_id : peer.chat_id
  const found = answer.chats.find((chat) => chat._ !== 'chatEmpty' && chat.id === id)

  return found === undefined ? undefined : new ChatView(found)
}

/**
 * Channels Telegram thinks are like this one.
 *
 * ```ts
 * for (const like of await similarChannels(account, '@channel')) console.log(like.title)
 * ```
 *
 * Telegram's own recommendation rather than anything computed here. A
 * non-premium account is shown fewer than the full list, which the server
 * decides.
 */
export async function similarChannels(
  client: Chatting,
  chat: string | PeerRef,
): Promise<ChatView[]> {
  const answer = await client.api.channels.getChannelRecommendations({
    channel: await asChannel(client, chat, 'finding similar channels'),
  })

  if (answer._ === 'messages.chatsSlice') {
    return answer.chats.map((one) => new ChatView(one))
  }

  return answer.chats.map((one) => new ChatView(one))
}

/**
 * Who wrote a post in a channel that signs its posts.
 *
 * ```ts
 * const author = await messageAuthor(account, '@channel', 42)
 * ```
 *
 * A channel post is attributed to the channel, and only an administrator can
 * see which person actually sent it — which is what this asks, and what the
 * server refuses for anybody else.
 */
export async function messageAuthor(
  client: Chatting,
  chat: string | PeerRef,
  messageId: number,
): Promise<UserView | undefined> {
  const answer = await client.api.channels.getMessageAuthor({
    channel: await asChannel(client, chat, 'reading a post author'),
    id: messageId,
  })

  return answer._ === 'user' ? new UserView(answer) : undefined
}

/**
 * Read this account's own record about particular conversations.
 *
 * ```ts
 * const [one] = await fetchDialogs(account, ['@someone'])
 * ```
 *
 * The row in the conversation list — unread counts, the pinned state, the draft
 * — rather than the conversation itself. `account.dialogs()` walks all of them;
 * this asks about the ones named.
 */
export async function fetchDialogs(
  client: Chatting,
  chats: readonly (string | PeerRef)[],
): Promise<DialogView[]> {
  if (chats.length === 0) return []

  const peers = []
  for (const chat of chats) {
    peers.push({ _: 'inputDialogPeer' as const, peer: await client.resolve(chat) })
  }

  const answer = await client.api.messages.getPeerDialogs({ peers })

  return answer.dialogs.map((dialog) => new DialogView(dialog))
}
