/**
 * What every operation on a conversation needs before it can do anything.
 *
 * Three things are shared by the whole `chats` family and none of them is the
 * call itself.
 *
 * **Naming the conversation.** Telegram has three kinds and they are not
 * interchangeable. A *basic group* is addressed by a bare number and managed
 * through `messages.*`; a *channel* and a *supergroup* are the same construct
 * to the protocol, addressed by an identifier and an access hash and managed
 * through `channels.*`. Most operations exist in both families under different
 * names and slightly different shapes, so "set the title" is two calls and
 * choosing between them is the operation's job rather than the caller's.
 *
 * ```
 *   '@name' ──> resolve ──> inputPeer ──┬─> inputPeerChat    ──> messages.*
 *                                       └─> inputPeerChannel ──> channels.*
 * ```
 *
 * **Rights.** Administrator and restriction rights are flag records where every
 * field is `true`-or-absent, and absent means "no". A caller thinking in
 * booleans would have to know that `false` is spelled by leaving the field out,
 * and a record built with `false` values is rejected by the encoder rather than
 * by the server. So rights are taken as booleans here and written as flags.
 *
 * **What the answer did.** Many of these are answered with the updates the
 * change caused rather than with a result, and those updates are how an account
 * learns that its own membership changed, that a title is different, that
 * somebody joined. Forwarding the RPC and dropping the answer would leave the
 * account's own handlers unaware of a change it made itself, so every operation
 * that is answered with updates hands them to the account.
 */

import { PeerError } from '@yuigram/core'
import type { MtprotoApi } from '../api.js'
import type {
  TypeChatAdminRights,
  TypeChatBannedRights,
  TypeInputChannel,
  TypeInputPeer,
  TypeInputUser,
  TypeUpdates,
} from '../generated/api/types/index.js'
import { channelFor, userFor } from '../network/peers.js'
import { UPDATE_CONTAINERS } from '../normalize/events.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { TlValue } from '../tl/index.js'

/** What operating on a conversation needs from a client. */
export interface Chatting {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
  /**
   * Take updates an answer carried, so the account learns what it just did.
   *
   * The same door updates from the connection come through, so a change this
   * account made reaches its own handlers exactly as one somebody else made
   * would — and the sequence's record of what it has already handed out keeps
   * it from being dispatched twice when the same change arrives over the wire.
   */
  feed(value: TlValue): Promise<void>
}

/** Which of the three kinds a resolved peer is. */
export type ChatKind = 'user' | 'group' | 'channel'

/** What kind of conversation a resolved peer names. */
export function kindOf(peer: TypeInputPeer): ChatKind {
  if (peer._ === 'inputPeerChat') return 'group'
  if (peer._ === 'inputPeerChannel' || peer._ === 'inputPeerChannelFromMessage') return 'channel'

  return 'user'
}

/** The bare number a basic group is addressed by. */
export function groupIdOf(peer: TypeInputPeer): bigint | undefined {
  return peer._ === 'inputPeerChat' ? peer.chat_id : undefined
}

/**
 * Resolve a peer and insist it is a channel or supergroup.
 *
 * Named separately from the resolution because the message matters: an
 * operation that exists only for channels, given a basic group, should say
 * which kind it needed rather than letting the server answer with something
 * about the request.
 */
export async function asChannel(
  client: Chatting,
  peer: string | PeerRef,
  what: string,
): Promise<TypeInputChannel> {
  const resolved = await client.resolve(peer)
  const channel = channelFor(resolved)

  if (channel === undefined) {
    throw new PeerError(
      `${what} is only possible in a channel or supergroup, and this names a ${kindOf(resolved)}`,
    )
  }

  return channel
}

/** Resolve a peer and insist it is a person. */
export async function asUser(
  client: Chatting,
  peer: string | PeerRef,
  what: string,
): Promise<TypeInputUser> {
  const resolved = await client.resolve(peer)
  const user = userFor(resolved)

  if (user === undefined) {
    throw new PeerError(`${what} names a person, and this names a ${kindOf(resolved)}`)
  }

  return user
}

/**
 * Resolve a peer and insist it is a conversation of some kind.
 *
 * A private chat with one person is a conversation for the purposes of history
 * and drafts, so this admits a user — what it refuses is nothing at all.
 */
export async function asChat(client: Chatting, peer: string | PeerRef): Promise<TypeInputPeer> {
  return await client.resolve(peer)
}

/**
 * Hand an answer to the account when it is one carrying updates.
 *
 * Answers of other shapes pass through untouched. Which constructors count is
 * the same list the connection uses, so an answer and a pushed update are
 * judged by one rule rather than two that could drift.
 */
export async function applyUpdates(client: Chatting, answer: unknown): Promise<void> {
  if (typeof answer !== 'object' || answer === null) return

  const value = answer as TlValue
  if (typeof value._ !== 'string' || !UPDATE_CONTAINERS.has(value._)) return

  await client.feed(value)
}

/** What an administrator may do. Anything left out is a right they do not have. */
export interface AdminRights {
  /** Change the title, photo and description. */
  readonly changeInfo?: boolean
  /** Post to a broadcast channel. */
  readonly postMessages?: boolean
  /** Edit anybody's posts in a broadcast channel. */
  readonly editMessages?: boolean
  readonly deleteMessages?: boolean
  /** Restrict, ban and unban members. */
  readonly banUsers?: boolean
  /** Add members and create invite links. */
  readonly inviteUsers?: boolean
  readonly pinMessages?: boolean
  /** Promote other administrators, up to their own rights. */
  readonly addAdmins?: boolean
  /** Act as the conversation rather than as themselves. */
  readonly anonymous?: boolean
  readonly manageCall?: boolean
  /** Manage forum topics. */
  readonly manageTopics?: boolean
  readonly postStories?: boolean
  readonly editStories?: boolean
  readonly deleteStories?: boolean
  /**
   * Nothing in particular, and enough to be listed as an administrator.
   *
   * Telegram's own `other`. An administrator with no other right still appears
   * in the list and still counts as one, which is how a title is given to
   * somebody without giving them anything to do.
   */
  readonly other?: boolean
}

/** What somebody is forbidden from doing. Anything left out is allowed. */
export interface Restrictions {
  /** Cannot read at all, which is what banning is. */
  readonly viewMessages?: boolean
  readonly sendMessages?: boolean
  readonly sendMedia?: boolean
  readonly sendStickers?: boolean
  readonly sendGifs?: boolean
  readonly sendGames?: boolean
  readonly sendInline?: boolean
  readonly embedLinks?: boolean
  readonly sendPolls?: boolean
  readonly changeInfo?: boolean
  readonly inviteUsers?: boolean
  readonly pinMessages?: boolean
  readonly manageTopics?: boolean
  readonly sendPhotos?: boolean
  readonly sendVideos?: boolean
  readonly sendRoundvideos?: boolean
  readonly sendAudios?: boolean
  readonly sendVoices?: boolean
  readonly sendDocs?: boolean
  readonly sendPlain?: boolean
  /**
   * When the restriction lifts, in Unix seconds.
   *
   * Zero, or absent, means forever — which is the protocol's own convention and
   * the reason this is not spelled as an optional date. A value in the past is
   * treated by Telegram as forever too, which is worth knowing before computing
   * one from a duration.
   */
  readonly until?: number
}

/** The flag record `chatAdminRights` is, built from booleans. */
export function adminRights(rights: AdminRights): TypeChatAdminRights {
  return {
    _: 'chatAdminRights',
    ...flag('change_info', rights.changeInfo),
    ...flag('post_messages', rights.postMessages),
    ...flag('edit_messages', rights.editMessages),
    ...flag('delete_messages', rights.deleteMessages),
    ...flag('ban_users', rights.banUsers),
    ...flag('invite_users', rights.inviteUsers),
    ...flag('pin_messages', rights.pinMessages),
    ...flag('add_admins', rights.addAdmins),
    ...flag('anonymous', rights.anonymous),
    ...flag('manage_call', rights.manageCall),
    ...flag('manage_topics', rights.manageTopics),
    ...flag('post_stories', rights.postStories),
    ...flag('edit_stories', rights.editStories),
    ...flag('delete_stories', rights.deleteStories),
    ...flag('other', rights.other),
  }
}

/** The flag record `chatBannedRights` is, built from booleans. */
export function bannedRights(restrictions: Restrictions): TypeChatBannedRights {
  return {
    _: 'chatBannedRights',
    until_date: restrictions.until ?? 0,
    ...flag('view_messages', restrictions.viewMessages),
    ...flag('send_messages', restrictions.sendMessages),
    ...flag('send_media', restrictions.sendMedia),
    ...flag('send_stickers', restrictions.sendStickers),
    ...flag('send_gifs', restrictions.sendGifs),
    ...flag('send_games', restrictions.sendGames),
    ...flag('send_inline', restrictions.sendInline),
    ...flag('embed_links', restrictions.embedLinks),
    ...flag('send_polls', restrictions.sendPolls),
    ...flag('change_info', restrictions.changeInfo),
    ...flag('invite_users', restrictions.inviteUsers),
    ...flag('pin_messages', restrictions.pinMessages),
    ...flag('manage_topics', restrictions.manageTopics),
    ...flag('send_photos', restrictions.sendPhotos),
    ...flag('send_videos', restrictions.sendVideos),
    ...flag('send_roundvideos', restrictions.sendRoundvideos),
    ...flag('send_audios', restrictions.sendAudios),
    ...flag('send_voices', restrictions.sendVoices),
    ...flag('send_docs', restrictions.sendDocs),
    ...flag('send_plain', restrictions.sendPlain),
  }
}

/**
 * One flag, present only when it is set.
 *
 * These fields are `true`-or-absent in the protocol: absent *is* false, and
 * writing `false` is not something the encoder will accept. So a boolean the
 * caller gave as `false` and one they did not give at all produce the same
 * thing, which is the truth about what the server will be told.
 */
function flag(name: string, value: boolean | undefined): Record<string, true> {
  return value === true ? { [name]: true } : {}
}

/** Nothing forbidden, which is what lifting every restriction looks like. */
export const NO_RESTRICTIONS: TypeChatBannedRights = {
  _: 'chatBannedRights',
  until_date: 0,
}

/** Everything forbidden, which is what a ban is. */
export const BANNED: TypeChatBannedRights = {
  _: 'chatBannedRights',
  until_date: 0,
  view_messages: true,
  send_messages: true,
  send_media: true,
  send_stickers: true,
  send_gifs: true,
  send_games: true,
  send_inline: true,
  embed_links: true,
  send_polls: true,
  change_info: true,
  invite_users: true,
  pin_messages: true,
}

/** Whether an answer is one of the update containers. */
export const carriesUpdates = (answer: unknown): answer is TypeUpdates =>
  typeof answer === 'object' &&
  answer !== null &&
  typeof (answer as TlValue)._ === 'string' &&
  UPDATE_CONTAINERS.has((answer as TlValue)._)
