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

import type { MtprotoApi } from '../api.js'
import { DialogView } from '../entities/dialog.js'
import { MessageView } from '../entities/message.js'
import type { TypeInputPeer } from '../generated/api/types/index.js'
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

  let before = 0
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    const answer = await client.api.messages.getHistory({
      peer: target,
      offset_id: before,
      offset_date: 0,
      add_offset: 0,
      limit: askFor(options, taken),
      max_id: 0,
      min_id: 0,
      hash: 0n,
    })

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
