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
import { DialogView } from '../entities/dialog.js'
import { MemberView } from '../entities/member.js'
import { MessageView } from '../entities/message.js'
import type {
  messages,
  TypeChannelParticipantsFilter,
  TypeInputPeer,
  TypeMessagesFilter,
} from '../generated/api/types/index.js'
import { channelFor } from '../network/peers.js'
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
