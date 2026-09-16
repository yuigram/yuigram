/**
 * Reading a list that arrives one page at a time, as one sequence.
 *
 * `normalize/paging.ts` works out where the next page begins and deliberately
 * does not fetch it: "how many pages to ask for, how fast, and what to do with
 * them are the caller's, and a list that reads itself would be deciding all
 * three." That still holds, and it is why these are async generators rather
 * than methods returning arrays.
 *
 * A generator decides none of the three. It is pull-driven: nothing is
 * requested until the caller asks for the next item, stopping the loop stops
 * the fetching, and `limit` is the caller's answer to how much it wants. What
 * it removes is the offset arithmetic — three fields that have to agree, and
 * which a caller writing the loop by hand gets wrong in ways that produce a
 * page starting somewhere other than where the last one ended.
 *
 * ```
 *   for await (const dialog of walkDialogs(account)) { ... }
 *                              └── one call per page, on demand
 * ```
 *
 * **These reach the network.** Unlike the views in `entities/`, walking a list
 * is a sequence of requests, which is why this takes the client rather than
 * living on a value. An account that iterates its whole history is making
 * hundreds of calls, and Telegram limits accounts that do — pacing belongs to
 * the caller, which is another thing a generator leaves where it was.
 */

import { PeerError } from '@yuigram/core'
import type { MtprotoApi } from '../api.js'
import {
  ChatEventView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
} from '../entities/chat.js'
import { DialogView } from '../entities/dialog.js'
import { MemberView } from '../entities/member.js'
import { MessageView, ReactionView } from '../entities/message.js'
import { PeerStoriesView, StoryView, StoryViewerView } from '../entities/story.js'
import type {
  Boost,
  ForumTopic,
  messages,
  Photo,
  SavedStarGift,
  StarsTransaction,
  TypeChannelAdminLogEventsFilter,
  TypeChannelParticipantsFilter,
  TypeInputPeer,
  TypeInputUser,
  TypeMessagesFilter,
  TypeReaction,
  TypeUser,
} from '../generated/api/types/index.js'
import { channelFor, userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import { nextDialogs } from '../normalize/paging.js'

/** How many to ask for at a time when the caller says nothing. */
const PAGE = 100

/**
 * What walking a list needs from a client.
 *
 * Structural rather than the `Account` class, so the walk can be driven by
 * anything that can make the call — which is what makes it testable without a
 * connection.
 */
export interface Paging {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
}

/** How much of a list to read, and how much to ask for at once. */
export interface WalkOptions {
  /**
   * Stop after this many.
   *
   * Omitted means to the end of the list, which for an account with a long
   * history is a great many requests.
   */
  readonly limit?: number
  /**
   * How many to ask for per request.
   *
   * Larger is fewer round trips and a longer wait for the first item. Telegram
   * caps this per method and quietly returns fewer rather than refusing.
   */
  readonly pageSize?: number
}

/** How many of a list have been handed over so far. */
interface Counted {
  taken: number
}

/**
 * Hand a page's items over, and say whether that was the last of them wanted.
 *
 * Every walk here stops at `limit` in the middle of a page as well as between
 * pages, because a page is whatever the server chose to send and stopping only
 * at its end would hand over more than was asked for. Written once: the check
 * is the same wherever it appears, and repeating it inside each loop is what
 * made several of these hard to read.
 *
 * Returns true when the limit has been reached, so a caller writes
 * `if (yield* handOver(...)) return` and has one exit rather than two.
 */
async function* handOver<T>(
  items: Iterable<T>,
  counted: Counted,
  limit: number | undefined,
): AsyncGenerator<T, boolean, undefined> {
  for (const item of items) {
    yield item
    counted.taken += 1

    if (limit !== undefined && counted.taken >= limit) return true
  }

  return false
}

/** How many to ask for on the next request, never more than is still wanted. */
function askFor(options: WalkOptions | undefined, taken: number): number {
  const page = options?.pageSize ?? PAGE
  const limit = options?.limit

  return limit === undefined ? page : Math.min(page, limit - taken)
}

/**
 * Walk this account's conversations, most recent first.
 *
 * ```ts
 * for await (const dialog of walkDialogs(account, { limit: 50 })) {
 *   console.log(dialog.peer, dialog.unreadCount)
 * }
 * ```
 *
 * Yields the row rather than the conversation: naming what a row points at
 * means reading the answer's peers, and every answer along the way is harvested
 * into the account's peer store, so `account.resolve(dialog.peer)` works
 * afterwards for anything seen.
 *
 * Stops at the end of the list and at `limit`. A page carrying no rows needs no
 * separate check: the next offset is assembled from the last row of a page, so
 * a page without one describes nowhere to continue from and ends the walk.
 */
export async function* walkDialogs(
  client: Paging,
  options?: WalkOptions,
): AsyncGenerator<DialogView, void, undefined> {
  let offset: { date: number; id: number; peer: TypeInputPeer } = {
    date: 0,
    id: 0,
    peer: { _: 'inputPeerEmpty' },
  }
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    const answer = await client.api.messages.getDialogs({
      offset_date: offset.date,
      offset_id: offset.id,
      offset_peer: offset.peer,
      limit: askFor(options, taken),
      hash: 0n,
    })

    // Answered when nothing has changed since the hash the caller sent. Nothing
    // is sent here, so it means the list is empty rather than unchanged.
    if (answer._ === 'messages.dialogsNotModified') return

    for (const row of answer.dialogs) {
      yield new DialogView(row)
      taken += 1

      if (options?.limit !== undefined && taken >= options.limit) return
    }

    const next = nextDialogs(answer)
    // Only a slice can be continued: the complete form is the whole list, and
    // asking again would fetch its first page a second time.
    if (next === undefined) return

    offset = { date: next.date, id: next.id, peer: await client.resolve(next.peer) }
  }
}

/**
 * Walk pages of messages that are ordered and continued by message number.
 *
 * History and an in-conversation search page identically — newest first, each
 * request asking for what sits before the oldest of the last page — so they
 * share this rather than each carrying the termination rule separately.
 */
async function* walkByMessageId(
  fetch: (before: number, limit: number) => Promise<messages.TypeMessages>,
  options: WalkOptions | undefined,
): AsyncGenerator<MessageView, void, undefined> {
  let before = 0
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    const answer = await fetch(before, askFor(options, taken))

    if (answer._ === 'messages.messagesNotModified') return
    if (answer.messages.length === 0) return

    let oldest: number | undefined

    for (const value of answer.messages) {
      const message = new MessageView(value)

      yield message
      taken += 1

      if (oldest === undefined || message.id < oldest) oldest = message.id
      if (options?.limit !== undefined && taken >= options.limit) return
    }

    const further = reachedFurther(answer._, oldest, before)
    if (further === undefined) return

    before = further
  }
}

/**
 * Walk a conversation's messages, most recent first.
 *
 * ```ts
 * for await (const message of walkHistory(account, '@someone', { limit: 200 })) {
 *   if (!message.isService) console.log(message.text)
 * }
 * ```
 *
 * The peer is resolved once rather than per page. Paging is by message number:
 * each request asks for what sits before the oldest message of the last page,
 * which is the ordering this method guarantees.
 *
 * Stops at the beginning of the conversation, at `limit`, or when a page fails
 * to reach further back than the last one did — a conversation whose oldest
 * message keeps coming back would otherwise be walked forever.
 */
export async function* walkHistory(
  client: Paging,
  peer: string | PeerRef,
  options?: WalkOptions,
): AsyncGenerator<MessageView, void, undefined> {
  const target = await client.resolve(peer)

  yield* walkByMessageId(
    async (before, limit) =>
      await client.api.messages.getHistory({
        peer: target,
        offset_id: before,
        offset_date: 0,
        add_offset: 0,
        limit,
        max_id: 0,
        min_id: 0,
        hash: 0n,
      }),
    options,
  )
}

/**
 * Where the next request should start, or nothing when this page was the end.
 *
 * Two ways a page is the last one. `messages.messages` is the whole
 * conversation rather than a page of it — only the slice forms continue, and
 * asking again after the complete form would fetch its first page a second
 * time. And a page that did not reach further back than the last one is the
 * end however many messages it carried, which is also what stops a conversation
 * whose oldest message keeps coming back from being walked forever.
 */
function reachedFurther(
  form: string,
  oldest: number | undefined,
  before: number,
): number | undefined {
  if (form === 'messages.messages') return undefined
  if (oldest === undefined) return undefined

  return before !== 0 && oldest >= before ? undefined : oldest
}

/** What to search for, and where to stop. */
export interface SearchOptions extends WalkOptions {
  /** Only messages of this kind. Every kind when omitted. */
  readonly filter?: TypeMessagesFilter
  /** Only messages from this sender, within the conversation. */
  readonly from?: string | PeerRef
  /** Only messages in this forum topic. */
  readonly topicId?: number
  /** Only messages at or after this moment, in Unix seconds. */
  readonly since?: number
  /** Only messages at or before this moment, in Unix seconds. */
  readonly until?: number
}

/**
 * Walk the messages in one conversation that match a search.
 *
 * ```ts
 * for await (const found of walkSearch(account, chat, 'invoice', { limit: 20 })) {
 *   console.log(found.id, found.text)
 * }
 * ```
 *
 * Paged the same way history is — by message number, newest first — because it
 * is the same ordering over the same conversation. A filtered search returns
 * fewer messages per page than it was asked for without that meaning the end,
 * so a short page is not an exhaustion signal here; the cursor failing to
 * advance is.
 */
export async function* walkSearch(
  client: Paging,
  peer: string | PeerRef,
  query: string,
  options?: SearchOptions,
): AsyncGenerator<MessageView, void, undefined> {
  const target = await client.resolve(peer)
  const from = options?.from === undefined ? undefined : await client.resolve(options.from)

  yield* walkByMessageId(
    async (before, limit) =>
      await client.api.messages.search({
        peer: target,
        q: query,
        filter: options?.filter ?? { _: 'inputMessagesFilterEmpty' },
        min_date: options?.since ?? 0,
        max_date: options?.until ?? 0,
        offset_id: before,
        add_offset: 0,
        limit,
        max_id: 0,
        min_id: 0,
        hash: 0n,
        ...(from === undefined ? {} : { from_id: from }),
        ...(options?.topicId === undefined ? {} : { top_msg_id: options.topicId }),
      }),
    options,
  )
}

/** Where the next page of a global search begins. */
interface GlobalCursor {
  readonly rate: number
  readonly peer: TypeInputPeer
  readonly id: number
}

/**
 * Walk messages matching a search across every conversation.
 *
 * Paged differently from everything else here, because the results are not in
 * one conversation and a message number means nothing across them. Telegram
 * returns a rate with each page and expects it back with the last message's
 * conversation and number — three fields that have to agree, like the dialog
 * offset and unlike the history one.
 *
 * A page that reports no rate to continue from is the end, whatever else it
 * carried.
 */
export async function* walkGlobalSearch(
  client: Paging,
  query: string,
  options?: SearchOptions,
): AsyncGenerator<MessageView, void, undefined> {
  let cursor: GlobalCursor = { rate: 0, peer: { _: 'inputPeerEmpty' }, id: 0 }
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    const answer = await client.api.messages.searchGlobal({
      q: query,
      filter: options?.filter ?? { _: 'inputMessagesFilterEmpty' },
      min_date: options?.since ?? 0,
      max_date: options?.until ?? 0,
      offset_rate: cursor.rate,
      offset_peer: cursor.peer,
      offset_id: cursor.id,
      limit: askFor(options, taken),
    })

    if (answer._ === 'messages.messagesNotModified') return
    if (answer.messages.length === 0) return

    let last: MessageView | undefined

    for (const value of answer.messages) {
      const message = new MessageView(value)

      yield message
      taken += 1
      last = message

      if (options?.limit !== undefined && taken >= options.limit) return
    }

    // Only the slice form carries a rate, and without one there is nowhere to
    // continue from — which is the end regardless of how full the page looked.
    const rate = answer._ === 'messages.messagesSlice' ? answer.next_rate : undefined
    const where = last?.chat

    if (rate === undefined || last === undefined || where === undefined) return

    cursor = { rate, peer: await client.resolve(where), id: last.id }
  }
}

/** Which members to walk. */
export interface MemberOptions extends WalkOptions {
  /**
   * Which of them.
   *
   * Everyone recently active when omitted, which is Telegram's own default and
   * the only filter that answers for an ordinary member.
   */
  readonly filter?: TypeChannelParticipantsFilter
}

/**
 * Walk the members of a channel or supergroup.
 *
 * Paged by how many have already been seen rather than by an identifier, which
 * is a third policy again — and the one that makes this list the least stable
 * of the three. Somebody joining or leaving while the walk is in progress
 * shifts every later position, so an entry can be seen twice or missed. That is
 * a property of counting into a live list rather than something this could fix,
 * and no snapshot is claimed.
 *
 * Only a channel or supergroup keeps members this way; a basic group carries
 * them in its full description instead.
 */
export async function* walkMembers(
  client: Paging,
  peer: string | PeerRef,
  options?: MemberOptions,
): AsyncGenerator<MemberView, void, undefined> {
  const target = await client.resolve(peer)
  const channel = channelFor(target)

  if (channel === undefined) {
    throw new PeerError('only a channel or supergroup keeps its members as a list')
  }

  let seen = 0
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    const answer = await client.api.channels.getParticipants({
      channel,
      filter: options?.filter ?? { _: 'channelParticipantsRecent' },
      offset: seen,
      limit: askFor(options, taken),
      hash: 0n,
    })

    if (answer._ === 'channels.channelParticipantsNotModified') return
    if (answer.participants.length === 0) return

    for (const value of answer.participants) {
      yield new MemberView(value)
      taken += 1

      if (options?.limit !== undefined && taken >= options.limit) return
    }

    seen += answer.participants.length
  }
}

// ---------------------------------------------------------------------------
// Lists continued by a cursor the server chooses
// ---------------------------------------------------------------------------

/**
 * Walk a list the server continues with an opaque cursor.
 *
 * Five endpoints page exactly this way: the answer carries the items and a
 * string to send back, and the absence of that string is the end. The string
 * means nothing to a client — it is not a date, a number or a position, and
 * deriving one would be inventing a cursor the server did not give.
 *
 * Shared because it is one policy rather than several that resemble each other.
 * The lists paged by an identifier, by a count, or by several fields that have
 * to agree each have their own termination rule and are written out separately
 * below, because a helper covering all of them would have to be told which rule
 * to apply — which is the rule being written down anyway, one indirection
 * further from where it matters.
 *
 * Two ways to stop, and both are needed. A server that names no cursor has
 * given the last page. A server that names one and returns nothing has given a
 * page that cannot be continued past without asking for the same empty page
 * forever, which is what an implementation without this check does.
 */
async function* walkByCursor<T>(
  fetch: (cursor: string, limit: number) => Promise<{ items: readonly T[]; next?: string }>,
  options: WalkOptions | undefined,
  start = '',
): AsyncGenerator<T, void, undefined> {
  let cursor = start
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    const page = await fetch(cursor, askFor(options, taken))

    if (page.items.length === 0) return

    for (const item of page.items) {
      yield item
      taken += 1

      if (options?.limit !== undefined && taken >= options.limit) return
    }

    // An empty string is not a cursor. Telegram writes the end of a list as an
    // absent field, and a server that sent one back would send the first page
    // again.
    if (page.next === undefined || page.next === '') return

    cursor = page.next
  }
}

/** Which reactions to walk. */
export interface ReactionWalkOptions extends WalkOptions {
  /**
   * Only accounts that reacted with this one.
   *
   * Every reaction when omitted, which is what a caller asking who reacted to a
   * message usually means.
   */
  readonly reaction?: TypeReaction
}

/**
 * Walk the accounts that reacted to a message.
 *
 * ```ts
 * for await (const who of walkReactions(account, chat, 123, { limit: 50 })) {
 *   console.log(who.peer, who.identity.emoji)
 * }
 * ```
 *
 * Yields one entry per account per reaction, so an account that reacted twice
 * appears twice — which is what the list is, rather than a duplicate.
 */
export async function* walkReactions(
  client: Paging,
  peer: string | PeerRef,
  messageId: number,
  options?: ReactionWalkOptions,
): AsyncGenerator<ReactionView, void, undefined> {
  const target = await client.resolve(peer)

  yield* walkByCursor(async (cursor, limit) => {
    const answer = await client.api.messages.getMessageReactionsList({
      peer: target,
      id: messageId,
      limit,
      ...(cursor === '' ? {} : { offset: cursor }),
      ...(options?.reaction === undefined ? {} : { reaction: options.reaction }),
    })

    return {
      items: answer.reactions.map((value) => new ReactionView(value)),
      ...(answer.next_offset === undefined ? {} : { next: answer.next_offset }),
    }
  }, options)
}

/** Which boosts to walk. */
export interface BoostWalkOptions extends WalkOptions {
  /** Only boosts that came from a gift or a giveaway. */
  readonly giftsOnly?: boolean
}

/**
 * Walk the boosts a channel has been given.
 *
 * ```ts
 * for await (const boost of walkBoosts(account, '@channel')) {
 *   console.log(boost.user_id, boost.expires)
 * }
 * ```
 *
 * Yields the entry as the server described it. A boost is a flat record — who,
 * when, until when, and whether it came from a giveaway — with nothing to
 * interpret, so there is no view to put between a caller and it.
 */
export async function* walkBoosts(
  client: Paging,
  peer: string | PeerRef,
  options?: BoostWalkOptions,
): AsyncGenerator<Boost, void, undefined> {
  const target = await client.resolve(peer)

  yield* walkByCursor(async (cursor, limit) => {
    const answer = await client.api.premium.getBoostsList({
      peer: target,
      offset: cursor,
      limit,
      ...(options?.giftsOnly === true ? { gifts: true } : {}),
    })

    return {
      items: answer.boosts,
      ...(answer.next_offset === undefined ? {} : { next: answer.next_offset }),
    }
  }, options)
}

/** Which transactions to walk. */
export interface StarsWalkOptions extends WalkOptions {
  /** Only what came in, or only what went out. Both when omitted. */
  readonly direction?: 'incoming' | 'outgoing'
  /** Oldest first rather than newest first. */
  readonly ascending?: boolean
  /** Only the transactions belonging to one subscription. */
  readonly subscriptionId?: string
}

/**
 * Walk an account's star transactions.
 *
 * ```ts
 * for await (const entry of walkStarsTransactions(account, 'me', { limit: 20 })) {
 *   console.log(entry.id, entry.stars)
 * }
 * ```
 *
 * The answer carries the current balance as well as the page, and the balance
 * is not part of a sequence — it is one value that is the same on every page.
 * Reading it is `account.api.payments.getStarsTransactions` directly.
 */
export async function* walkStarsTransactions(
  client: Paging,
  peer: string | PeerRef,
  options?: StarsWalkOptions,
): AsyncGenerator<StarsTransaction, void, undefined> {
  const target = await client.resolve(peer)

  yield* walkByCursor(async (cursor, limit) => {
    const answer = await client.api.payments.getStarsTransactions({
      peer: target,
      offset: cursor,
      limit,
      ...(options?.direction === 'incoming' ? { inbound: true } : {}),
      ...(options?.direction === 'outgoing' ? { outbound: true } : {}),
      ...(options?.ascending === true ? { ascending: true } : {}),
      ...(options?.subscriptionId === undefined ? {} : { subscription_id: options.subscriptionId }),
    })

    return {
      items: answer.history ?? [],
      ...(answer.next_offset === undefined ? {} : { next: answer.next_offset }),
    }
  }, options)
}

/** Which gifts to walk. */
export interface GiftWalkOptions extends WalkOptions {
  /** Leave out the ones the owner has hidden from their profile. */
  readonly excludeUnsaved?: boolean
  /** Leave out the ones the owner is showing. */
  readonly excludeSaved?: boolean
  /** Most valuable first rather than newest first. */
  readonly byValue?: boolean
}

/**
 * Walk the gifts an account is keeping.
 *
 * ```ts
 * for await (const gift of walkSavedGifts(account, 'me')) {
 *   console.log(gift.date)
 * }
 * ```
 */
export async function* walkSavedGifts(
  client: Paging,
  owner: string | PeerRef,
  options?: GiftWalkOptions,
): AsyncGenerator<SavedStarGift, void, undefined> {
  const target = await client.resolve(owner)

  yield* walkByCursor(async (cursor, limit) => {
    const answer = await client.api.payments.getSavedStarGifts({
      peer: target,
      offset: cursor,
      limit,
      ...(options?.excludeUnsaved === true ? { exclude_unsaved: true } : {}),
      ...(options?.excludeSaved === true ? { exclude_saved: true } : {}),
      ...(options?.byValue === true ? { sort_by_value: true } : {}),
    })

    return {
      items: answer.gifts,
      ...(answer.next_offset === undefined ? {} : { next: answer.next_offset }),
    }
  }, options)
}

/** Which viewers to walk, and in what order. */
export interface ViewerWalkOptions extends WalkOptions {
  /** Only accounts in this account's contacts. */
  readonly contactsOnly?: boolean
  /** Those who reacted first, rather than the most recent first. */
  readonly reactionsFirst?: boolean
  /** Only accounts whose name matches. */
  readonly query?: string
}

/**
 * Walk the accounts that have seen a story.
 *
 * ```ts
 * for await (const viewer of walkStoryViewers(account, 'me', 7)) {
 *   console.log(viewer.kind, viewer.peer)
 * }
 * ```
 *
 * Only the account that posted a story may read this. Asking about somebody
 * else's is refused by the server, which is where that rule belongs.
 */
export async function* walkStoryViewers(
  client: Paging,
  peer: string | PeerRef,
  storyId: number,
  options?: ViewerWalkOptions,
): AsyncGenerator<StoryViewerView, void, undefined> {
  const target = await client.resolve(peer)

  yield* walkByCursor(async (cursor, limit) => {
    const answer = await client.api.stories.getStoryViewsList({
      peer: target,
      id: storyId,
      offset: cursor,
      limit,
      ...(options?.contactsOnly === true ? { just_contacts: true } : {}),
      ...(options?.reactionsFirst === true ? { reactions_first: true } : {}),
      ...(options?.query === undefined ? {} : { q: options.query }),
    })

    return {
      items: answer.views.map((value) => new StoryViewerView(value)),
      ...(answer.next_offset === undefined ? {} : { next: answer.next_offset }),
    }
  }, options)
}

// ---------------------------------------------------------------------------
// Lists continued some other way
// ---------------------------------------------------------------------------

/**
 * Walk somebody's profile photos, newest first.
 *
 * ```ts
 * for await (const photo of walkProfilePhotos(account, '@someone')) {
 *   console.log(photo.id)
 * }
 * ```
 *
 * Paged by how many have already been seen, like the member list and unlike
 * everything else here — and with the same consequence: a photo added or
 * removed while the walk is in progress shifts every later position, so an
 * entry can be seen twice or missed. No snapshot is claimed.
 *
 * Stops at the complete form, which is the whole list rather than a page of it,
 * and at a page that carried nothing.
 */
export async function* walkProfilePhotos(
  client: Paging,
  user: string | PeerRef,
  options?: WalkOptions,
): AsyncGenerator<Photo, void, undefined> {
  const target = await client.resolve(user)
  const person = userFor(target)

  if (person === undefined) {
    throw new PeerError('only a user has a list of profile photos')
  }

  let seen = 0
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    const answer = await client.api.photos.getUserPhotos({
      user_id: person,
      offset: seen,
      max_id: 0n,
      limit: askFor(options, taken),
    })

    if (answer.photos.length === 0) return

    for (const value of answer.photos) {
      // A photo the account may not see arrives as the empty form, which
      // carries an identifier and nothing else. Skipped rather than yielded:
      // it is a hole in the list rather than a photo.
      if (value._ === 'photo') {
        yield value
        taken += 1

        if (options?.limit !== undefined && taken >= options.limit) return
      }
    }

    // Counted by what the page held, including the entries skipped above —
    // the offset is into the server's list, not into what was yielded.
    seen += answer.photos.length

    // The complete form is the whole list. Asking again would fetch its first
    // page a second time.
    if (answer._ === 'photos.photos') return
  }
}

/** Which topics to walk. */
export interface TopicWalkOptions extends WalkOptions {
  /** Only topics whose title matches. */
  readonly query?: string
}

/**
 * Walk the topics of a forum.
 *
 * ```ts
 * for await (const topic of walkForumTopics(account, '@forum')) {
 *   console.log(topic.id, topic.title)
 * }
 * ```
 *
 * Paged by three fields that have to agree — the date, the message number and
 * the topic number of the last topic of the page — like the dialog list and
 * unlike the history one.
 *
 * Which date is a property of the answer rather than of the request: a forum
 * ordered by when topics were created is continued from the topic's own date,
 * and one ordered by activity from the date of its newest message. The newest
 * message is in the same answer, found by the number the topic gives for it, so
 * no second request is made to page the first.
 */
export async function* walkForumTopics(
  client: Paging,
  peer: string | PeerRef,
  options?: TopicWalkOptions,
): AsyncGenerator<ForumTopicView, void, undefined> {
  const target = await client.resolve(peer)
  let cursor = { date: 0, id: 0, topic: 0 }
  const counted: Counted = { taken: 0 }

  while (options?.limit === undefined || counted.taken < options.limit) {
    const answer = await client.api.messages.getForumTopics({
      peer: target,
      offset_date: cursor.date,
      offset_id: cursor.id,
      offset_topic: cursor.topic,
      limit: askFor(options, counted.taken),
      ...(options?.query === undefined ? {} : { q: options.query }),
    })

    if (answer.topics.length === 0) return

    const topics = answer.topics.map((value) => new ForumTopicView(value))
    if (yield* handOver(topics, counted, options?.limit)) return

    const next = topics.at(-1)?.raw
    if (next === undefined || next._ !== 'forumTopic') return

    const date = topicDate(answer, next)

    // A cursor that did not move is the end, however full the page looked: the
    // next request would ask for the same page.
    if (date === cursor.date && next.top_message === cursor.id && next.id === cursor.topic) return

    cursor = { date, id: next.top_message, topic: next.id }
  }
}

/**
 * Which date continues a page of topics.
 *
 * A property of the answer rather than of the request: a forum ordered by when
 * topics were created is continued from the topic's own date, and one ordered
 * by activity from the date of its newest message. That message is in the same
 * answer, so nothing is fetched to page the first request.
 */
function topicDate(answer: messages.TypeForumTopics, topic: ForumTopic): number {
  if (answer.order_by_create_date === true) return topic.date

  const newest = answer.messages.find(
    (message) => message._ !== 'messageEmpty' && message.id === topic.top_message,
  )

  return newest !== undefined && newest._ !== 'messageEmpty' ? newest.date : topic.date
}

/** Which links to walk. */
export interface InviteWalkOptions extends WalkOptions {
  /** The withdrawn ones rather than the working ones. */
  readonly revoked?: boolean
  /** Only the ones this account created, when somebody else is meant. */
  readonly createdBy?: string | PeerRef
}

/**
 * Walk the invite links of a conversation.
 *
 * ```ts
 * for await (const link of walkInviteLinks(account, chat)) {
 *   if (!link.isRevoked) console.log(link.link, link.usage)
 * }
 * ```
 *
 * An administrator sees only the links they created unless they can manage the
 * conversation's links, which is the server's rule. `createdBy` names whose to
 * ask for; this account's own when omitted.
 *
 * Paged by the date and the link text of the last entry. Only an entry that is
 * a link carries one — the form reporting pending requests to a public
 * conversation does not — so a page whose last entry is not a link ends the
 * walk rather than continuing from nowhere.
 */
export async function* walkInviteLinks(
  client: Paging,
  peer: string | PeerRef,
  options?: InviteWalkOptions,
): AsyncGenerator<InviteLinkView, void, undefined> {
  const target = await client.resolve(peer)
  const admin =
    options?.createdBy === undefined
      ? ({ _: 'inputUserSelf' } as const)
      : userFor(await client.resolve(options.createdBy))

  if (admin === undefined) {
    throw new PeerError('an invite link is created by a user, not by a conversation')
  }

  let cursor: { date: number; link: string } | undefined
  const counted: Counted = { taken: 0 }

  while (options?.limit === undefined || counted.taken < options.limit) {
    const answer = await client.api.messages.getExportedChatInvites({
      peer: target,
      admin_id: admin,
      limit: askFor(options, counted.taken),
      ...(options?.revoked === true ? { revoked: true } : {}),
      ...(cursor === undefined ? {} : { offset_date: cursor.date, offset_link: cursor.link }),
    })

    if (answer.invites.length === 0) return

    const links = answer.invites.map((value) => new InviteLinkView(value))
    if (yield* handOver(links, counted, options?.limit)) return

    const last = links.at(-1)
    const date = last?.date
    const text = last?.link
    if (date === undefined || text === undefined) return
    if (cursor !== undefined && date === cursor.date && text === cursor.link) return

    cursor = { date, link: text }
  }
}

/** Which of the people who came through a link to walk. */
export interface ImporterWalkOptions extends WalkOptions {
  /** One link rather than all of them. */
  readonly link?: string
  /** Those waiting for approval rather than those already in. */
  readonly pending?: boolean
  /** Only those whose name matches. Implies `pending`, as the server does. */
  readonly query?: string
}

/**
 * Walk the accounts that joined through an invite link.
 *
 * ```ts
 * for await (const member of walkInviteMembers(account, chat, { link })) {
 *   console.log(member.userId, member.date)
 * }
 * ```
 *
 * Paged by the date and the user of the last entry. The user has to be named
 * with the hash that reaches them, and that hash is in the same answer — the
 * page carries the users it describes — so nothing is resolved between pages.
 * A page whose last entry names somebody the answer did not describe ends the
 * walk rather than continuing with a reference the server would refuse.
 */
export async function* walkInviteMembers(
  client: Paging,
  peer: string | PeerRef,
  options?: ImporterWalkOptions,
): AsyncGenerator<InviteImporterView, void, undefined> {
  const target = await client.resolve(peer)
  const pending = options?.pending === true || options?.query !== undefined

  let cursor: { date: number; user: TypeInputUser } = {
    date: 0,
    user: { _: 'inputUserEmpty' },
  }
  const counted: Counted = { taken: 0 }

  while (options?.limit === undefined || counted.taken < options.limit) {
    const answer = await client.api.messages.getChatInviteImporters({
      peer: target,
      offset_date: cursor.date,
      offset_user: cursor.user,
      limit: askFor(options, counted.taken),
      ...(pending ? { requested: true } : {}),
      ...(options?.link === undefined ? {} : { link: options.link }),
      ...(options?.query === undefined ? {} : { q: options.query }),
    })

    if (answer.importers.length === 0) return

    const members = answer.importers.map((value) => new InviteImporterView(value))
    if (yield* handOver(members, counted, options?.limit)) return

    const last = members.at(-1)
    if (last === undefined) return

    const user = namedIn(answer.users, last.userId)
    if (user === undefined) return
    // A cursor that did not move is the end: the next request would ask for the
    // page just read.
    if (last.date === cursor.date && sameUser(cursor.user, last.userId)) return

    cursor = { date: last.date, user }
  }
}

/**
 * Name a user with the hash that reaches them, from the answer that described
 * them.
 *
 * A page carries the users it mentions, so paging past one costs no request of
 * its own. Nothing where the answer did not describe them: continuing with a
 * reference that names no hash is a request the server refuses.
 */
function namedIn(users: readonly TypeUser[], id: bigint): TypeInputUser | undefined {
  const described = users.find((user) => user._ === 'user' && user.id === id)
  if (described === undefined || described._ !== 'user') return undefined

  return { _: 'inputUser', user_id: described.id, access_hash: described.access_hash ?? 0n }
}

/** Whether a cursor already stands at this user. */
function sameUser(cursor: TypeInputUser, id: bigint): boolean {
  return cursor._ === 'inputUser' && cursor.user_id === id
}

/** Which of somebody's stories to walk. */
export interface StoryWalkOptions extends WalkOptions {
  /**
   * The archive rather than what is on the profile.
   *
   * Only this account's own archive can be read; asking for somebody else's is
   * refused by the server.
   */
  readonly archived?: boolean
}

/**
 * Walk the stories on somebody's profile, newest first.
 *
 * ```ts
 * for await (const story of walkProfileStories(account, '@someone')) {
 *   console.log(story.id, story.caption)
 * }
 * ```
 *
 * Paged by the number of the last story of the page, so each request asks for
 * what sits before it. A page that failed to reach further back than the last
 * one ends the walk, which is what stops a profile whose oldest story keeps
 * coming back from being walked forever.
 */
export async function* walkProfileStories(
  client: Paging,
  peer: string | PeerRef,
  options?: StoryWalkOptions,
): AsyncGenerator<StoryView, void, undefined> {
  const target = await client.resolve(peer)
  let before = 0
  const counted: Counted = { taken: 0 }

  while (options?.limit === undefined || counted.taken < options.limit) {
    const request = { peer: target, offset_id: before, limit: askFor(options, counted.taken) }
    const answer =
      options?.archived === true
        ? await client.api.stories.getStoriesArchive(request)
        : await client.api.stories.getPinnedStories(request)

    if (answer.stories.length === 0) return

    const stories = answer.stories.map((value) => new StoryView(value))
    // Read before handing anything over, so a caller that stops part-way has
    // still left the cursor describing the whole page rather than its start.
    const oldest = Math.min(...stories.map((story) => story.id))

    if (yield* handOver(stories, counted, options?.limit)) return

    // A page that failed to reach further back than the last one is the end,
    // which is what stops a profile whose oldest story keeps coming back from
    // being walked forever.
    if (before !== 0 && oldest >= before) return

    before = oldest
  }
}

/** Which stories to walk, across the accounts this one follows. */
export interface AllStoriesOptions {
  /**
   * Stop after this many.
   *
   * Counted in peers rather than in stories: the list is one entry per account
   * that has stories, carrying all of theirs.
   */
  readonly limit?: number
  /** The accounts this one has hidden from the story list, rather than the rest. */
  readonly archived?: boolean
}

/**
 * Walk the stories of the accounts this one follows, one account at a time.
 *
 * ```ts
 * for await (const entry of walkAllStories(account)) {
 *   console.log(entry.peer, entry.stories.length)
 * }
 * ```
 *
 * Paged unlike anything else here. There is no limit to ask for — the server
 * decides how much a page holds — and the cursor is a state string that has to
 * be sent back with a flag saying it is a continuation rather than a start,
 * because the same field means "what I had last time" on a first request and
 * "carry on from here" afterwards.
 *
 * The end is the server saying there is no more, not the absence of a cursor: a
 * last page carries a state as well, and continuing from it would fetch the
 * list again from where it ended.
 */
export async function* walkAllStories(
  client: Paging,
  options?: AllStoriesOptions,
): AsyncGenerator<PeerStoriesView, void, undefined> {
  let state: string | undefined
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    const answer = await client.api.stories.getAllStories({
      ...(state === undefined ? {} : { state, next: true }),
      ...(options?.archived === true ? { hidden: true } : {}),
    })

    // Answered when nothing has changed since the state that was sent. Nothing
    // is sent on a first request, so it means there is nothing to walk.
    if (answer._ === 'stories.allStoriesNotModified') return

    for (const value of answer.peer_stories) {
      yield new PeerStoriesView(value)
      taken += 1

      if (options?.limit !== undefined && taken >= options.limit) return
    }

    if (answer.has_more !== true) return

    state = answer.state
  }
}

/** Which entries of the log to walk. */
export interface ChatEventOptions extends WalkOptions {
  /** Only entries matching this text. */
  readonly query?: string
  /** Only the kinds of act this names. Every kind when omitted. */
  readonly filter?: TypeChannelAdminLogEventsFilter
  /** Only what these accounts did. */
  readonly by?: readonly (string | PeerRef)[]
}

/**
 * Walk a channel's administration log, newest first.
 *
 * ```ts
 * for await (const event of walkChatEvents(account, '@channel', { limit: 100 })) {
 *   console.log(event.kind, event.userId)
 * }
 * ```
 *
 * Only somebody who can see the log may read it, which is the server's rule.
 *
 * Paged by the identifier of the oldest entry of the page, which is a 64-bit
 * integer rather than a number: the log of a large channel outgrows what a
 * number holds exactly, and a cursor that lost precision would page in circles.
 * A page that failed to reach further back than the last one ends the walk for
 * the same reason history's does.
 */
export async function* walkChatEvents(
  client: Paging,
  peer: string | PeerRef,
  options?: ChatEventOptions,
): AsyncGenerator<ChatEventView, void, undefined> {
  const target = await client.resolve(peer)
  const channel = channelFor(target)

  if (channel === undefined) {
    throw new PeerError('only a channel or supergroup keeps an administration log')
  }

  const admins: TypeInputUser[] = []

  for (const who of options?.by ?? []) {
    const person = userFor(await client.resolve(who))
    if (person === undefined) throw new PeerError('an administrator is a user')

    admins.push(person)
  }

  let before = 0n
  const counted: Counted = { taken: 0 }

  while (options?.limit === undefined || counted.taken < options.limit) {
    const answer = await client.api.channels.getAdminLog({
      channel,
      q: options?.query ?? '',
      max_id: before,
      min_id: 0n,
      limit: askFor(options, counted.taken),
      ...(options?.filter === undefined ? {} : { events_filter: options.filter }),
      ...(admins.length === 0 ? {} : { admins }),
    })

    if (answer.events.length === 0) return

    const events = answer.events.map((value) => new ChatEventView(value))
    const oldest = events.reduce(
      (lowest, event) => (event.id < lowest ? event.id : lowest),
      events[0]?.id ?? 0n,
    )

    if (yield* handOver(events, counted, options?.limit)) return

    // A page that failed to reach further back than the last one is the end,
    // for the reason history's is.
    if (before !== 0n && oldest >= before) return

    before = oldest
  }
}

/**
 * Walk the public posts carrying a hashtag, across every channel.
 *
 * ```ts
 * for await (const post of walkHashtagSearch(account, 'telegram', { limit: 50 })) {
 *   console.log(post.chat, post.text)
 * }
 * ```
 *
 * Paged like the global search and for the same reason: the results are not in
 * one conversation, so a message number means nothing across them, and Telegram
 * expects a rate back with the last message's conversation and number.
 *
 * Unlike the global search, the rate may be absent from a page that is not the
 * last. Telegram answers this method with a rate only where it has one to give,
 * and the date of the last message is what it expects back otherwise — so a
 * missing rate is not the end here, and a page that carried nothing is.
 */
export async function* walkHashtagSearch(
  client: Paging,
  hashtag: string,
  options?: WalkOptions,
): AsyncGenerator<MessageView, void, undefined> {
  let cursor: GlobalCursor = { rate: 0, peer: { _: 'inputPeerEmpty' }, id: 0 }
  const counted: Counted = { taken: 0 }

  while (options?.limit === undefined || counted.taken < options.limit) {
    const answer = await client.api.channels.searchPosts({
      hashtag,
      offset_rate: cursor.rate,
      offset_peer: cursor.peer,
      offset_id: cursor.id,
      limit: askFor(options, counted.taken),
    })

    if (answer._ === 'messages.messagesNotModified') return
    if (answer.messages.length === 0) return

    const found = answer.messages.map((value) => new MessageView(value))
    if (yield* handOver(found, counted, options?.limit)) return

    const last = found.at(-1)
    const where = last?.chat
    if (last === undefined || where === undefined) return

    // The rate may be absent from a page that is not the last: Telegram answers
    // this method with one only where it has one to give, and expects the date
    // of the last message back otherwise.
    const rate = answer._ === 'messages.messagesSlice' ? (answer.next_rate ?? last.date) : last.date

    if (rate === undefined) return
    // Three fields that have to agree, so a cursor that did not move at all is
    // the end: the next request would ask for the page just read.
    if (rate === cursor.rate && last.id === cursor.id) return

    cursor = { rate, peer: await client.resolve(where), id: last.id }
  }
}
