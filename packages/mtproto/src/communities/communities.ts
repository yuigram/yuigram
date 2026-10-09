// SPDX-License-Identifier: MIT

/**
 * Communities.
 *
 * A community is not a conversation. Nothing is said in one: it holds other
 * chats and channels, keeps its own list of participants, and decides which of
 * the chats it holds a given participant can see. Telegram models it as a
 * `Chat` constructor and addresses it through `inputChannel`, which is the only
 * thing it has in common with a supergroup.
 *
 * ```
 *   community ──┬── linked peers   ──> chats and channels, each visible or not
 *               ├── link requests  ──> a chat asking to be listed, pending
 *               └── participants   ──> people, bannable, each with their own
 *                                       view of the linked chats
 * ```
 *
 * So the operations here take a community *and* something else — a peer to
 * link, a participant to ban — and none of them sends, reads history or edits.
 * A caller holding a community and reaching for {@link Account.sendText} has the
 * wrong object, which is what {@link ChatView.isCommunity} is for.
 *
 * Three of Telegram's methods serve two operations each: linking and unlinking
 * are one call with a flag, as are banning and unbanning, and approving and
 * declining. They are separate functions here because "link" and "unlink" are
 * separate intentions, and a boolean parameter at the call site reads as
 * neither.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import type { MtprotoApi } from '../api.js'
import { ChatView } from '../entities/peer.js'
import type {
  TypeChat,
  TypeCommunityPeer,
  TypeCommunityPeerRequest,
  TypeInputChannel,
  TypeInputPeer,
} from '../generated/api/types/index.js'
import { channelFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'
import type { TlValue } from '../tl/index.js'

/** What operating on a community needs from a client. */
export interface Communing {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
  /** Take updates an answer carried, so the account learns what it just did. */
  feed(value: TlValue): Promise<void>
}

/**
 * Resolve a peer and insist it can be addressed as a community.
 *
 * A community is named by `inputChannel`, so this is the same shape a channel
 * takes and the server is what ultimately decides. The check is worth making
 * anyway: a basic group or a user given here is a mistake that would otherwise
 * surface as a server error naming a field rather than the argument.
 */
async function asCommunity(client: Communing, peer: string | PeerRef): Promise<TypeInputChannel> {
  const resolved = await client.resolve(peer)
  const channel = channelFor(resolved)

  if (channel === undefined) {
    throw new PeerError('a community is addressed by identifier and access hash, and this is not')
  }

  return channel
}

/* -------------------------------------------------------------------------- */
/* Reading a community                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A chat or channel listed in a community.
 *
 * Whether it is visible is three-valued on purpose: Telegram sends a `Bool`
 * that may be absent, and absent means the account is not being told, which is
 * a different thing from being told it is hidden.
 */
export class CommunityPeerView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeCommunityPeer

  constructor(value: TypeCommunityPeer) {
    this.raw = value
  }

  /** The chat or channel that is linked. */
  get peer(): PeerRef | undefined {
    return peerRefOf(this.raw.peer)
  }

  /** Whether it is shown in the community's list, where the answer says. */
  get isVisible(): boolean | undefined {
    return this.raw.visible
  }

  /** Whether this account may read what was said in it. */
  get canViewHistory(): boolean {
    return this.raw.can_view_history === true
  }
}

/** A chat asking to be listed in a community. */
export class CommunityLinkRequestView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeCommunityPeerRequest

  constructor(value: TypeCommunityPeerRequest) {
    this.raw = value
  }

  /** The chat or channel that asked. */
  get peer(): PeerRef | undefined {
    return peerRefOf(this.raw.peer)
  }

  /** Who asked for it. */
  get requestedBy(): PeerRef {
    return { kind: 'user', id: this.raw.requested_by }
  }

  /** Whether it asked to be shown in the community's list. */
  get isVisible(): boolean {
    return this.raw.visible === true
  }

  /** When it asked, in Unix seconds. */
  get date(): number {
    return this.raw.date
  }
}

/**
 * Read the communities out of an answer that carries chats.
 *
 * Telegram answers these calls with every chat it mentions, communities among
 * them. Only the communities are of interest here, and a caller wanting the
 * linked chats has them through {@link getCommunityParticipantChats}.
 */
function communitiesOf(chats: readonly TypeChat[]): readonly ChatView[] {
  return chats.map((chat) => new ChatView(chat)).filter((view) => view.isCommunity)
}

/** The communities this account has joined. */
export async function getJoinedCommunities(client: Communing): Promise<readonly ChatView[]> {
  const answer = await client.api.communities.getJoinedCommunities()

  return communitiesOf(answer.chats)
}

/** One page of the chats waiting to be listed in a community. */
export interface LinkRequestsPage {
  readonly requests: readonly CommunityLinkRequestView[]
  /** How many are waiting altogether. */
  readonly total: number
  /** Where the next page begins, absent where this was the last. */
  readonly next?: string
}

/**
 * The chats asking to be listed in a community, a page at a time.
 *
 * Continued by an opaque offset Telegram hands back, so a caller pages by
 * passing the previous page's `next` rather than by counting.
 */
export async function getCommunityLinkRequests(
  client: Communing,
  community: string | PeerRef,
  options?: { readonly from?: string; readonly limit?: number },
): Promise<LinkRequestsPage> {
  const limit = options?.limit ?? 100
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ValidationError(`a page holds a positive whole number of requests, not ${limit}`)
  }

  const answer = await client.api.communities.getPeerLinkRequests({
    community: await asCommunity(client, community),
    offset: options?.from ?? '',
    limit,
  })

  return {
    requests: answer.requests.map((one) => new CommunityLinkRequestView(one)),
    total: answer.total_count,
    ...(answer.next_offset === undefined ? {} : { next: answer.next_offset }),
  }
}

/** The chats one participant has in a community, told apart by how they got there. */
export interface ParticipantChats {
  /** Linked chats this participant created. */
  readonly created: readonly ChatView[]
  /** Linked chats this participant joined. */
  readonly joined: readonly ChatView[]
}

/**
 * Which of a community's chats a participant has created or joined.
 *
 * The answer names the chats by identifier in two lists and describes them once
 * in a third, so the two are put back together here — a caller should not have
 * to index an array by hand to learn what it asked for.
 */
export async function getCommunityParticipantChats(
  client: Communing,
  community: string | PeerRef,
  participant: string | PeerRef,
): Promise<ParticipantChats> {
  const answer = await client.api.communities.getParticipantJoinedChats({
    community: await asCommunity(client, community),
    participant: await client.resolve(participant),
  })

  const described = new Map(answer.chats.map((chat) => [chat.id, new ChatView(chat)]))
  const pick = (ids: readonly bigint[]): readonly ChatView[] =>
    ids.flatMap((id) => {
      const chat = described.get(id)

      return chat === undefined ? [] : [chat]
    })

  return { created: pick(answer.creator_chat_ids), joined: pick(answer.joined_chat_ids) }
}

/* -------------------------------------------------------------------------- */
/* Making and arranging communities                                            */
/* -------------------------------------------------------------------------- */

/** What a new community is made of. */
export interface NewCommunity {
  readonly title: string
  /** The chat it starts with. A community with nothing in it cannot be made. */
  readonly chat: string | PeerRef
  readonly about?: string
  /** Whether it starts hidden from the people in that chat. */
  readonly hidden?: boolean
}

/**
 * Make a community around a chat.
 *
 * The chat is not optional: Telegram makes a community *from* a conversation,
 * and the community it answers with already has that one linked.
 */
export async function createCommunity(
  client: Communing,
  community: NewCommunity,
): Promise<ChatView> {
  if (community.title.trim() === '') throw new ValidationError('a community needs a title')

  const answer = await client.api.communities.create({
    title: community.title,
    peer: await client.resolve(community.chat),
    ...(community.about === undefined ? {} : { about: community.about }),
    ...(community.hidden === true ? { hidden: true } : {}),
  })

  await client.feed(answer as unknown as TlValue)

  const made = madeCommunity(answer as unknown as TlValue)
  if (made === undefined) {
    throw new PeerError('Telegram did not describe the community it made')
  }

  return made
}

/** Find the community in the updates a creation answered with. */
function madeCommunity(answer: TlValue): ChatView | undefined {
  const chats = answer['chats']
  if (!Array.isArray(chats)) return undefined

  return communitiesOf(chats as readonly TypeChat[])[0]
}

/**
 * Show or hide a community in this account's conversation list.
 *
 * Collapsing is this account's own arrangement of its list rather than anything
 * about the community, which is why it takes no rights and affects nobody else.
 */
export async function toggleCommunityCollapsed(
  client: Communing,
  community: string | PeerRef,
  collapsed: boolean,
): Promise<void> {
  const answer = await client.api.communities.toggleCommunityCollapsedInDialogs({
    community: await asCommunity(client, community),
    ...(collapsed ? { collapsed: true } : {}),
  })

  await client.feed(answer as unknown as TlValue)
}

/* -------------------------------------------------------------------------- */
/* The chats a community holds                                                 */
/* -------------------------------------------------------------------------- */

/**
 * List a chat in a community, or change whether it is shown.
 *
 * Calling it again for a chat already listed is how its visibility changes;
 * there is no separate call for that, and Telegram reads the same flags either
 * way.
 */
export async function linkCommunityPeer(
  client: Communing,
  community: string | PeerRef,
  peer: string | PeerRef,
  options?: { readonly hidden?: boolean },
): Promise<void> {
  // Visible and hidden are two flags rather than one with two values, and
  // sending neither leaves Telegram to decide. One of them is always sent, so
  // the result does not depend on what the link was before.
  await client.api.communities.togglePeerLink({
    community: await asCommunity(client, community),
    peer: await client.resolve(peer),
    ...(options?.hidden === true ? { hidden: true } : { visible: true }),
  })
}

/** Take a chat out of a community. */
export async function unlinkCommunityPeer(
  client: Communing,
  community: string | PeerRef,
  peer: string | PeerRef,
): Promise<void> {
  await client.api.communities.togglePeerLink({
    community: await asCommunity(client, community),
    peer: await client.resolve(peer),
    deleted: true,
  })
}

/* -------------------------------------------------------------------------- */
/* Requests and participants                                                   */
/* -------------------------------------------------------------------------- */

/** Accept a chat's request to be listed in a community. */
export async function approveCommunityLinkRequest(
  client: Communing,
  community: string | PeerRef,
  peer: string | PeerRef,
): Promise<void> {
  await hideCommunityLinkRequest(client, community, peer, 'approve')
}

/** Turn down a chat's request to be listed in a community. */
export async function declineCommunityLinkRequest(
  client: Communing,
  community: string | PeerRef,
  peer: string | PeerRef,
): Promise<void> {
  await hideCommunityLinkRequest(client, community, peer, 'decline')
}

/** What to do with a pending link request. */
export type LinkRequestAction = 'approve' | 'decline'

/** Answer one chat's request to be listed in a community. */
export async function hideCommunityLinkRequest(
  client: Communing,
  community: string | PeerRef,
  peer: string | PeerRef,
  action: LinkRequestAction,
): Promise<void> {
  await client.api.communities.togglePeerLinkRequestApproval({
    community: await asCommunity(client, community),
    peer: await client.resolve(peer),
    ...(action === 'decline' ? { reject: true } : {}),
  })
}

/** Answer every pending request to be listed in a community, the same way. */
export async function hideAllCommunityLinkRequests(
  client: Communing,
  community: string | PeerRef,
  action: LinkRequestAction,
): Promise<void> {
  await client.api.communities.toggleAllPeerLinkRequestApproval({
    community: await asCommunity(client, community),
    ...(action === 'decline' ? { reject: true } : {}),
  })
}

/** Ban somebody from a community. */
export async function banCommunityParticipant(
  client: Communing,
  community: string | PeerRef,
  participant: string | PeerRef,
): Promise<void> {
  await client.api.communities.toggleParticipantBanned({
    community: await asCommunity(client, community),
    participant: await client.resolve(participant),
  })
}

/** Let somebody back into a community. */
export async function unbanCommunityParticipant(
  client: Communing,
  community: string | PeerRef,
  participant: string | PeerRef,
): Promise<void> {
  await client.api.communities.toggleParticipantBanned({
    community: await asCommunity(client, community),
    participant: await client.resolve(participant),
    unban: true,
  })
}
