// SPDX-License-Identifier: MIT

/**
 * Changing what a conversation is, rather than who is in it.
 *
 * The title, the picture, the description, the public name, and the settings
 * that decide how people may behave in it. Most exist in both families and are
 * different calls — a basic group's title is `messages.editChatTitle`, a
 * channel's is `channels.editTitle` — and the ones that exist only for channels
 * say so by name rather than letting the server answer about the request.
 *
 * ```
 *   title, photo   ──> both families, different calls
 *   description    ──> one call taking a peer
 *   username       ──> channels only: a basic group has no public name
 *   slow mode      ──> supergroups only
 * ```
 *
 * **Every setting here changes what other people see or may do**, so each is
 * answered with the updates it caused and those go to the account: a program
 * that renames a channel should see the rename arrive through its own handlers
 * exactly as one somebody else made would.
 */

import { ValidationError } from '@yuigram/core'
import type { UploadedFile } from '../files/upload.js'
import type { TypePeerColor } from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { Chatting, Restrictions } from './common.js'
import { applyUpdates, asChannel, bannedRights, groupIdOf } from './common.js'

/**
 * Rename a conversation.
 *
 * ```ts
 * await setChatTitle(account, '@channel', 'A better name')
 * ```
 */
export async function setChatTitle(
  client: Chatting,
  chat: string | PeerRef,
  title: string,
): Promise<void> {
  const resolved = await client.resolve(chat)
  const group = groupIdOf(resolved)

  const answer =
    group === undefined
      ? await client.api.channels.editTitle({
          channel: await asChannel(client, chat, 'renaming'),
          title,
        })
      : await client.api.messages.editChatTitle({ chat_id: group, title })

  await applyUpdates(client, answer)
}

/**
 * Change what a conversation says about itself.
 *
 * ```ts
 * await setChatDescription(account, '@channel', 'What this is for')
 * ```
 *
 * One call for both families. Passing nothing clears it.
 */
export async function setChatDescription(
  client: Chatting,
  chat: string | PeerRef,
  description: string | undefined,
): Promise<void> {
  await client.api.messages.editChatAbout({
    peer: await client.resolve(chat),
    about: description ?? '',
  })
}

/**
 * Put a picture on a conversation.
 *
 * ```ts
 * await setChatPhoto(account, '@channel', { photo: await account.upload({ source }) })
 * ```
 *
 * Takes an uploaded file rather than doing the upload, for the reason every
 * other send does: what to upload and from where is the caller's, and an
 * operation that swallowed it would grow every option `upload` already has.
 *
 * A video makes an animated picture, and `videoStart` says which second is the
 * still frame.
 */
export async function setChatPhoto(
  client: Chatting,
  chat: string | PeerRef,
  options: {
    readonly photo?: UploadedFile
    readonly video?: UploadedFile
    readonly videoStart?: number
  },
): Promise<void> {
  if (options.photo === undefined && options.video === undefined) {
    throw new ValidationError('a conversation photo needs a photo or a video to be made from')
  }

  const photo = {
    _: 'inputChatUploadedPhoto' as const,
    ...(options.photo === undefined ? {} : { file: options.photo.file }),
    ...(options.video === undefined ? {} : { video: options.video.file }),
    ...(options.videoStart === undefined ? {} : { video_start_ts: options.videoStart }),
  }

  await writePhoto(client, chat, photo)
}

/**
 * Take the picture off a conversation.
 *
 * The protocol spells this as setting the empty photo rather than as a removal,
 * which is why it is the same call.
 */
export async function deleteChatPhoto(client: Chatting, chat: string | PeerRef): Promise<void> {
  await writePhoto(client, chat, { _: 'inputChatPhotoEmpty' })
}

/** Both families' photo calls, chosen by what the peer is. */
async function writePhoto(
  client: Chatting,
  chat: string | PeerRef,
  photo: Parameters<Chatting['api']['channels']['editPhoto']>[0]['photo'],
): Promise<void> {
  const resolved = await client.resolve(chat)
  const group = groupIdOf(resolved)

  const answer =
    group === undefined
      ? await client.api.channels.editPhoto({
          channel: await asChannel(client, chat, 'changing the photo'),
          photo,
        })
      : await client.api.messages.editChatPhoto({ chat_id: group, photo })

  await applyUpdates(client, answer)
}

/**
 * Give a channel a public name, or take it away.
 *
 * ```ts
 * await setChatUsername(account, channel, 'my-channel')
 * await setChatUsername(account, channel, undefined)
 * ```
 *
 * Channels and supergroups only: a basic group has no public name, and giving
 * one a name means converting it to a supergroup first — which is a different
 * conversation with a different identifier, so nothing here does it silently.
 */
export async function setChatUsername(
  client: Chatting,
  chat: string | PeerRef,
  username: string | undefined,
): Promise<void> {
  await client.api.channels.updateUsername({
    channel: await asChannel(client, chat, 'a public name'),
    username: username ?? '',
  })
}

/**
 * Turn one of a conversation's additional usernames on or off.
 *
 * A channel may hold several names, of which one is primary and the rest are
 * either active or reserved. This switches one without giving it up.
 */
export async function toggleChatUsername(
  client: Chatting,
  chat: string | PeerRef,
  username: string,
  active: boolean,
): Promise<void> {
  await client.api.channels.toggleUsername({
    channel: await asChannel(client, chat, 'switching a username'),
    username,
    active,
  })
}

/**
 * Put a conversation's usernames in a given order.
 *
 * The order decides which is shown first. The list is the whole statement, so a
 * name left out of it is not reordered — it is removed from the order, which
 * Telegram refuses rather than doing.
 */
export async function reorderChatUsernames(
  client: Chatting,
  chat: string | PeerRef,
  order: readonly string[],
): Promise<void> {
  await client.api.channels.reorderUsernames({
    channel: await asChannel(client, chat, 'reordering usernames'),
    order,
  })
}

/**
 * How long messages live in a conversation, in seconds.
 *
 * Zero turns it off. This is the conversation's own setting rather than the
 * account-wide default, which is `account.setMessageTtl`.
 */
export async function setChatTtl(
  client: Chatting,
  chat: string | PeerRef,
  seconds: number,
): Promise<void> {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new ValidationError('a message lifetime is a whole number of seconds, or zero')
  }

  const answer = await client.api.messages.setHistoryTTL({
    peer: await client.resolve(chat),
    period: seconds,
  })

  await applyUpdates(client, answer)
}

/**
 * What everybody in a conversation may not do.
 *
 * ```ts
 * await setChatDefaultPermissions(account, '@group', { sendMedia: true })
 * ```
 *
 * The same shape a single member's restrictions take, applied to everybody who
 * is not an administrator. An empty record lets everybody do everything, which
 * is the default state.
 */
export async function setChatDefaultPermissions(
  client: Chatting,
  chat: string | PeerRef,
  restrictions: Restrictions,
): Promise<void> {
  const answer = await client.api.messages.editChatDefaultBannedRights({
    peer: await client.resolve(chat),
    banned_rights: bannedRights(restrictions),
  })

  await applyUpdates(client, answer)
}

/**
 * How long a member must wait between messages, in seconds.
 *
 * Zero turns it off. Supergroups only, and Telegram accepts only certain values
 * — 0, 10, 30, 60, 300, 900, 3600 — refusing anything else, which is left to
 * the server rather than guessed at here.
 */
export async function setSlowMode(
  client: Chatting,
  chat: string | PeerRef,
  seconds: number,
): Promise<void> {
  const answer = await client.api.channels.toggleSlowMode({
    channel: await asChannel(client, chat, 'slow mode'),
    seconds,
  })

  await applyUpdates(client, answer)
}

/**
 * Stop what is said in a conversation being forwarded or copied out of it.
 *
 * Not a security control: it hides the forward and copy buttons, and anybody
 * can still photograph a screen. Telegram's own framing, and worth repeating
 * because the name suggests more.
 */
export async function toggleContentProtection(
  client: Chatting,
  chat: string | PeerRef,
  enabled: boolean,
): Promise<void> {
  const answer = await client.api.messages.toggleNoForwards({
    peer: await client.resolve(chat),
    enabled,
  })

  await applyUpdates(client, answer)
}

/**
 * Make joining a conversation need approval.
 *
 * Applies to the public name and the permanent link. Links made with their own
 * approval setting keep it.
 */
export async function toggleJoinRequests(
  client: Chatting,
  chat: string | PeerRef,
  enabled: boolean,
): Promise<void> {
  const answer = await client.api.channels.toggleJoinRequest({
    channel: await asChannel(client, chat, 'join requests'),
    enabled,
  })

  await applyUpdates(client, answer)
}

/**
 * Require membership before somebody may write.
 *
 * For a supergroup attached to a channel's comments, where a reader may
 * otherwise write without joining.
 */
export async function toggleJoinToSend(
  client: Chatting,
  chat: string | PeerRef,
  enabled: boolean,
): Promise<void> {
  const answer = await client.api.channels.toggleJoinToSend({
    channel: await asChannel(client, chat, 'requiring membership to write'),
    enabled,
  })

  await applyUpdates(client, answer)
}

/**
 * Set the accent colour a conversation is shown in.
 *
 * Passing nothing restores the default. `forProfile` changes the colour of the
 * profile page rather than of the name in a list, which Telegram keeps as two
 * settings.
 */
export async function setChatColor(
  client: Chatting,
  chat: string | PeerRef,
  colour: TypePeerColor | undefined,
  options: { readonly forProfile?: boolean } = {},
): Promise<void> {
  const answer = await client.api.channels.updateColor({
    channel: await asChannel(client, chat, 'setting a colour'),
    ...(colour?._ === 'peerColor' && colour.color !== undefined ? { color: colour.color } : {}),
    ...(colour?._ === 'peerColor' && colour.background_emoji_id !== undefined
      ? { background_emoji_id: colour.background_emoji_id }
      : {}),
    ...(options.forProfile === true ? { for_profile: true } : {}),
  })

  await applyUpdates(client, answer)
}
