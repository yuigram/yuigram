// SPDX-License-Identifier: MPL-2.0

/**
 * The links people join a conversation by, and the requests they produce.
 *
 * A conversation has one permanent link and any number of others, each with its
 * own limits. Reading them is a walk — `account.inviteLinks` — and this is the
 * other half: making them, changing them, withdrawing them, and deciding who
 * gets in when a link needs approval.
 *
 * ```
 *   create ──> a link with limits ──> people use it ──> requests ──> approve
 *                     │                                                 │
 *                  revoke                                            or refuse
 * ```
 *
 * **A link is a credential.** Anybody holding one can join what it opens, up to
 * its limits, without this account being asked again. `docs/security.md` §2
 * says what follows about logging one.
 *
 * **Revoking is editing.** The protocol has no separate call: a link is
 * withdrawn by editing it with the revoked flag, and a revoked link cannot be
 * un-revoked. Creating a replacement is the only way back, which is why
 * {@link revokeInviteLink} hands the new permanent link back when it withdrew
 * the old permanent one.
 */

import { ValidationError } from '@yuigram/core'
import { InviteLinkView } from '../entities/chat.js'
import { ChatView, UserView } from '../entities/peer.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { Chatting } from './common.js'
import { applyUpdates, asUser } from './common.js'

/** The limits a new link carries. */
export interface NewInviteLink {
  /** A name for it, shown only to administrators. */
  readonly title?: string
  /** When it stops working, in Unix seconds. Without one it does not expire. */
  readonly expires?: number
  /** How many may use it in total. Without one it is unlimited. */
  readonly usageLimit?: number
  /**
   * Make joining through it need approval.
   *
   * Incompatible with a usage limit, which Telegram refuses rather than
   * reconciling: a link that admits a fixed number and also queues people has
   * no consistent meaning. Refused here by name instead.
   */
  readonly needsApproval?: boolean
}

/**
 * Make a new invite link.
 *
 * ```ts
 * const link = await createInviteLink(account, '@channel', { usageLimit: 10 })
 * console.log(link.link)
 * ```
 *
 * The conversation's permanent link is not replaced; this makes an additional
 * one. {@link primaryInviteLink} is the permanent one.
 */
export async function createInviteLink(
  client: Chatting,
  chat: string | PeerRef,
  options: NewInviteLink = {},
): Promise<InviteLinkView> {
  if (options.needsApproval === true && options.usageLimit !== undefined) {
    throw new ValidationError(
      'a link cannot both admit a fixed number of people and queue them for approval',
    )
  }

  const answer = await client.api.messages.exportChatInvite({
    peer: await client.resolve(chat),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.expires === undefined ? {} : { expire_date: options.expires }),
    ...(options.usageLimit === undefined ? {} : { usage_limit: options.usageLimit }),
    ...(options.needsApproval === true ? { request_needed: true } : {}),
  })

  return new InviteLinkView(answer)
}

/**
 * Replace the conversation's permanent link.
 *
 * ```ts
 * const fresh = await exportInviteLink(account, '@channel')
 * ```
 *
 * The old permanent link stops working. That is the point of it: a permanent
 * link that has leaked is replaced rather than edited, and every other link the
 * conversation has is left alone.
 */
export async function exportInviteLink(
  client: Chatting,
  chat: string | PeerRef,
): Promise<InviteLinkView> {
  const answer = await client.api.messages.exportChatInvite({
    peer: await client.resolve(chat),
    legacy_revoke_permanent: true,
  })

  return new InviteLinkView(answer)
}

/** What to change about a link. Anything omitted is left as it is. */
export interface InviteLinkEdit {
  readonly title?: string
  /** When it stops working. Zero removes the expiry. */
  readonly expires?: number
  /** How many may use it. Zero removes the limit. */
  readonly usageLimit?: number
  readonly needsApproval?: boolean
}

/**
 * Change a link's limits.
 *
 * ```ts
 * await editInviteLink(account, '@channel', link, { usageLimit: 0 })
 * ```
 *
 * Zero clears a limit rather than setting one, which is the protocol's own
 * convention: there is no way to say "no expiry" other than a zero date, so a
 * caller removing a limit passes zero and one leaving it alone passes nothing.
 */
export async function editInviteLink(
  client: Chatting,
  chat: string | PeerRef,
  link: string | InviteLinkView,
  edit: InviteLinkEdit,
): Promise<InviteLinkView> {
  const answer = await client.api.messages.editExportedChatInvite({
    peer: await client.resolve(chat),
    link: linkOf(link),
    ...(edit.title === undefined ? {} : { title: edit.title }),
    ...(edit.expires === undefined ? {} : { expire_date: edit.expires }),
    ...(edit.usageLimit === undefined ? {} : { usage_limit: edit.usageLimit }),
    ...(edit.needsApproval === undefined ? {} : { request_needed: edit.needsApproval }),
  })

  return readEdited(answer)
}

/**
 * Withdraw a link.
 *
 * ```ts
 * const { link: replacement } = await revokeInviteLink(account, '@channel', old)
 * ```
 *
 * A revoked link cannot be restored. Withdrawing the *permanent* link makes
 * Telegram issue a replacement, which is the second value the answer carries —
 * so a caller that revoked the permanent link is handed the one that replaced
 * it rather than having to go and ask.
 */
export async function revokeInviteLink(
  client: Chatting,
  chat: string | PeerRef,
  link: string | InviteLinkView,
): Promise<{ readonly revoked: InviteLinkView; readonly replacement: InviteLinkView | undefined }> {
  const answer = await client.api.messages.editExportedChatInvite({
    peer: await client.resolve(chat),
    link: linkOf(link),
    revoked: true,
  })

  if (answer._ === 'messages.exportedChatInviteReplaced') {
    return {
      revoked: new InviteLinkView(answer.invite),
      replacement: new InviteLinkView(answer.new_invite),
    }
  }

  return { revoked: new InviteLinkView(answer.invite), replacement: undefined }
}

/** Read one link by its text. */
export async function readInviteLink(
  client: Chatting,
  chat: string | PeerRef,
  link: string,
): Promise<InviteLinkView> {
  const answer = await client.api.messages.getExportedChatInvite({
    peer: await client.resolve(chat),
    link,
  })

  return readEdited(answer)
}

/**
 * The conversation's permanent link.
 *
 * ```ts
 * const permanent = await primaryInviteLink(account, '@channel')
 * ```
 *
 * Read rather than made: asking for the list of one and taking it. There is no
 * call that names the permanent link directly, and exporting one *replaces* it
 * — so a caller that only wanted to read it must not use {@link exportInviteLink}.
 */
export async function primaryInviteLink(
  client: Chatting,
  chat: string | PeerRef,
): Promise<InviteLinkView | undefined> {
  const answer = await client.api.messages.getExportedChatInvites({
    peer: await client.resolve(chat),
    admin_id: { _: 'inputUserSelf' },
    limit: 1,
  })

  const [first] = answer.invites

  return first === undefined ? undefined : new InviteLinkView(first)
}

/**
 * Let one person in, or turn them away.
 *
 * ```ts
 * await decideJoinRequest(account, '@channel', '@somebody', true)
 * ```
 *
 * For a conversation whose link needs approval. Refusing does not ban them —
 * they may ask again, which is the difference from {@link banMember} and the
 * reason this is a decision rather than a removal.
 */
export async function decideJoinRequest(
  client: Chatting,
  chat: string | PeerRef,
  person: string | PeerRef,
  approve: boolean,
): Promise<void> {
  const answer = await client.api.messages.hideChatJoinRequest({
    peer: await client.resolve(chat),
    user_id: await asUser(client, person, 'deciding a join request'),
    ...(approve ? { approved: true } : {}),
  })

  await applyUpdates(client, answer)
}

/**
 * Decide every pending request at once.
 *
 * ```ts
 * await decideAllJoinRequests(account, '@channel', true)
 * ```
 *
 * Naming a link decides only the requests that came through that one, which is
 * how a conversation with several links keeps them apart.
 */
export async function decideAllJoinRequests(
  client: Chatting,
  chat: string | PeerRef,
  approve: boolean,
  options: { readonly link?: string | InviteLinkView } = {},
): Promise<void> {
  const answer = await client.api.messages.hideAllChatJoinRequests({
    peer: await client.resolve(chat),
    ...(approve ? { approved: true } : {}),
    ...(options.link === undefined ? {} : { link: linkOf(options.link) }),
  })

  await applyUpdates(client, answer)
}

/** What a link opens, before joining it. */
export interface InvitePreview {
  /** What it is called. */
  readonly title: string
  /** How many are already in. */
  readonly members: number
  /** Whether joining needs approval. */
  readonly needsApproval: boolean
  /** Whether this account is already in it. */
  readonly alreadyIn: boolean
  /** The conversation itself, for a link this account is already in. */
  readonly chat: ChatView | undefined
  /** A few of the people in it, where Telegram offered them. */
  readonly sample: UserView[]
}

/**
 * Look at what a link opens without joining it.
 *
 * ```ts
 * const preview = await previewInvite(account, 'AbCdEf')
 * ```
 *
 * Takes the hash rather than the whole address — the part after `t.me/+` or
 * `t.me/joinchat/` — because that is what the call takes and extracting it from
 * a URL is a decision about which URL forms to accept.
 */
export async function previewInvite(client: Chatting, hash: string): Promise<InvitePreview> {
  const answer = await client.api.messages.checkChatInvite({ hash })

  if (answer._ === 'chatInviteAlready' || answer._ === 'chatInvitePeek') {
    const chat = new ChatView(answer.chat)

    return {
      title: chat.title ?? '',
      members: 0,
      needsApproval: false,
      alreadyIn: answer._ === 'chatInviteAlready',
      chat,
      sample: [],
    }
  }

  return {
    title: answer.title,
    members: answer.participants_count,
    needsApproval: answer.request_needed === true,
    alreadyIn: false,
    chat: undefined,
    sample: (answer.participants ?? [])
      .filter((user) => user._ === 'user')
      .map((user) => new UserView(user)),
  }
}

/**
 * Join by link.
 *
 * ```ts
 * await joinByLink(account, 'AbCdEf')
 * ```
 *
 * Takes the hash, for the reason {@link previewInvite} does. A link that needs
 * approval does not join: it files a request, and the account is let in when
 * somebody decides — so this returning without error is not the same as being
 * in.
 */
export async function joinByLink(client: Chatting, hash: string): Promise<void> {
  const answer = await client.api.messages.importChatInvite({ hash })

  await applyUpdates(client, answer)
}

/** What a shared folder link would add. */
export interface ChatlistPreview {
  /** What the folder is called. */
  readonly title: string
  /** The conversations it would add that this account is not already in. */
  readonly missing: ChatView[]
  /** Whether this account already has this folder. */
  readonly alreadyHave: boolean
}

/** Look at a shared folder link without joining it. */
export async function previewChatlist(client: Chatting, slug: string): Promise<ChatlistPreview> {
  const answer = await client.api.chatlists.checkChatlistInvite({ slug })

  if (answer._ === 'chatlists.chatlistInviteAlready') {
    return {
      title: '',
      missing: answer.missing_peers
        .map((peer) => answer.chats.find((chat) => named(chat, peer)))
        .filter((chat) => chat !== undefined)
        .map((chat) => new ChatView(chat)),
      alreadyHave: true,
    }
  }

  return {
    // Newer schemas describe a folder's name as text with entities. Only the
    // text is kept: a folder name is shown as a label, and carrying formatting
    // a caller cannot render would be a field that misleads.
    title: typeof answer.title === 'string' ? answer.title : answer.title.text,
    missing: answer.peers
      .map((peer) => answer.chats.find((chat) => named(chat, peer)))
      .filter((chat) => chat !== undefined)
      .map((chat) => new ChatView(chat)),
    alreadyHave: false,
  }
}

/**
 * Join a shared folder, taking some or all of what it offers.
 *
 * The conversations are named explicitly because a folder link is an offer
 * rather than an instruction: a caller reads {@link previewChatlist} and
 * decides which of them to join.
 */
export async function joinChatlist(
  client: Chatting,
  slug: string,
  chats: readonly (string | PeerRef)[],
): Promise<void> {
  const peers = []
  for (const chat of chats) peers.push(await client.resolve(chat))

  const answer = await client.api.chatlists.joinChatlistInvite({ slug, peers })

  await applyUpdates(client, answer)
}

/** Whether a chat is the one a peer names. */
function named(chat: { readonly id: bigint }, peer: unknown): boolean {
  const reference = peer as { channel_id?: bigint; chat_id?: bigint; user_id?: bigint }

  return (
    chat.id === reference.channel_id ||
    chat.id === reference.chat_id ||
    chat.id === reference.user_id
  )
}

/** The text of a link, whether it arrived as one or as a view. */
function linkOf(link: string | InviteLinkView): string {
  if (typeof link === 'string') return link

  const text = link.link
  if (text === undefined) {
    throw new ValidationError('this entry is not a link, so there is nothing to change')
  }

  return text
}

/** Read whichever of the two answer shapes came back. */
function readEdited(answer: { readonly _: string; readonly invite?: unknown }): InviteLinkView {
  const invite = answer.invite
  if (invite === undefined) {
    throw new ValidationError(`${answer._} described no invite link`)
  }

  return new InviteLinkView(invite as ConstructorParameters<typeof InviteLinkView>[0])
}
