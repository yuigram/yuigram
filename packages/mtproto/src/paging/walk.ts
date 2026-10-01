/**
 * Reading a list that arrives one page at a time, as one sequence or one page.
 *
 * `normalize/paging.ts` works out where the next page begins and deliberately
 * does not fetch it: "how many pages to ask for, how fast, and what to do with
 * them are the caller's, and a list that reads itself would be deciding all
 * three." That still holds, and it is why the walks are async generators rather
 * than methods returning arrays.
 *
 * A generator decides none of the three. It is pull-driven: nothing is
 * requested until the caller asks for the next item, stopping the loop stops
 * the fetching, and `limit` is the caller's answer to how much it wants.
 *
 * ```
 *   for await (const dialog of walkDialogs(account)) { ... }
 *                              └── one page read, on demand
 * ```
 *
 * Each walk is a loop over the page read of the same name in `pages.ts`, so a
 * list's continuation rule is written once and a walk and a page can never
 * disagree about where a list goes next. A page is what a caller wants when the
 * list has to be shown with its total, or stopped now and resumed later from a
 * cursor; `cursor` on a walk starts it from such a place.
 *
 * The page reads are loaded when a list is first read rather than when the
 * package is: every walk is already asynchronous, so the load is part of the
 * first request's wait rather than of every program's startup.
 *
 * **These reach the network.** Unlike the views in `entities/`, walking a list
 * is a sequence of requests, which is why this takes the client rather than
 * living on a value. An account that iterates its whole history is making
 * hundreds of calls, and Telegram limits accounts that do — pacing belongs to
 * the caller, which is another thing a generator leaves where it was.
 */

import type { MtprotoApi } from '../api.js'
import type { Folder } from '../chats/folders.js'
import { ValidationError } from '../core.js'
import type {
  ChatEventView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
} from '../entities/chat.js'
import type { DialogView } from '../entities/dialog.js'
import type { MemberView } from '../entities/member.js'
import type { MessageView, ReactionView } from '../entities/message.js'
import type { PeerStoriesView, StoryView, StoryViewerView } from '../entities/story.js'
import type {
  Boost,
  Photo,
  SavedStarGift,
  StarsTransaction,
  TypeChannelAdminLogEventsFilter,
  TypeChannelParticipantsFilter,
  TypeDialogFilter,
  TypeDocument,
  TypeInputPeer,
  TypeMessagesFilter,
  TypeReaction,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import type {
  AllStoriesPage,
  BoostPage,
  ChatEventPage,
  DialogPage,
  GiftPage,
  InviteLinkPage,
  InviteMemberPage,
  MemberPage,
  MessagePage,
  MusicPage,
  PhotoPage,
  PostPage,
  ProfileStoriesPage,
  ReactionPage,
  SimilarChannelsPage,
  StarsPage,
  StoryViewerPage,
  TopicPage,
} from './pages.js'

export type {
  AllStoriesPage,
  BoostPage,
  ChatEventPage,
  DialogPage,
  GiftPage,
  InviteLinkPage,
  InviteMemberPage,
  MemberPage,
  MessagePage,
  MusicPage,
  PageOf,
  PageTotal,
  PeeredPage,
  PhotoPage,
  PostPage,
  ProfileStoriesPage,
  ReactionPage,
  SimilarChannelsPage,
  StarsPage,
  StoryViewerPage,
  TopicPage,
  TotalPrecision,
} from './pages.js'

/** How many to ask for at a time when the caller says nothing. */
const PAGE = 100

/**
 * A cursor that cannot continue the list it was given to.
 *
 * Refused when it belongs to a different list, to the same list read with
 * different filters, to a format this does not read, or when it is not a cursor
 * at all. A validation failure, and reported as one: `name` stays
 * `ValidationError`, so code that already handles bad input handles this.
 */
export class CursorError extends ValidationError {}

/**
 * What reading a list needs from a client.
 *
 * Structural rather than the `Account` class, so a list can be read by anything
 * that can make the call — which is what makes it testable without a
 * connection.
 */
export interface Paging {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
}

/** How much of a list to read, from where, and how much to ask for at once. */
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
  /**
   * Start from here rather than from the beginning.
   *
   * The `next` of a page read of the same list with the same filters. A cursor
   * from a different list, or from different filters, is refused rather than
   * followed.
   */
  readonly cursor?: string
  /**
   * Stop asking once this is aborted.
   *
   * Checked before each request. A request already on its way completes, and
   * its answer is not handed over.
   */
  readonly signal?: AbortSignal
}

/** Which page of a list to read, and how much of it. */
export interface PageOptions {
  /** Continue from here: the `next` of an earlier page of this same list. */
  readonly cursor?: string
  /** How many to ask for. Telegram may send fewer. */
  readonly size?: number
  /** Do not make the request if this has been aborted. */
  readonly signal?: AbortSignal
}

/** Which of this account's conversations to read. */
export interface DialogFilter {
  /**
   * The main list, the archive, or both.
   *
   * When omitted no peer folder is named in the request, which is what reading
   * the list has always asked.
   */
  readonly archived?: 'exclude' | 'only' | 'keep'
  /** A peer folder by number: 0 is the main list, 1 the archive. Overrides `archived`. */
  readonly peerFolder?: number
  /**
   * What to do with pinned conversations.
   *
   * - `include` — the default: pinned conversations where Telegram places them.
   * - `exclude` — asks Telegram to leave them out.
   * - `only` — just the pinned ones, through the request that lists them.
   * - `keep` — inside a chat folder, leave the folder's pinned conversations
   *   where they fall rather than reading them first.
   */
  readonly pinned?: 'include' | 'exclude' | 'only' | 'keep'
}

/** Where the first page of a message list begins, when not from a cursor. */
export interface MessageStart {
  /**
   * Begin at this message: before it newest first, at it oldest first.
   *
   * Ignored when continuing from a cursor, which already says where to go.
   */
  readonly startId?: number
  /** Begin at messages sent before this moment, in Unix seconds. Ignored with a cursor. */
  readonly startDate?: number
  /**
   * Move the first request's window by this many messages.
   *
   * Negative reads messages newer than the start; `startId: 500, shift: -20,
   * size: 20` is the twenty after message 500. Applies to the first page only,
   * and is ignored with a cursor.
   */
  readonly shift?: number
}

/** Which messages of a conversation to read, and in which direction. */
export interface HistoryFilter extends MessageStart {
  /** Only messages with a number above this. */
  readonly minId?: number
  /** Only messages with a number below this. */
  readonly maxId?: number
  /** Oldest first rather than newest first. */
  readonly reverse?: boolean
}

/** What to search for, and where to stop. */
export interface SearchFilter extends Pick<MessageStart, 'startId' | 'shift'> {
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
  /** Only messages with a number above this. */
  readonly minId?: number
  /** Only messages with a number below this. */
  readonly maxId?: number
}

/** What to search for across every conversation. */
export interface GlobalSearchFilter {
  /** Only messages of this kind. Every kind when omitted. */
  readonly filter?: TypeMessagesFilter
  /** Only messages at or after this moment, in Unix seconds. */
  readonly since?: number
  /** Only messages at or before this moment, in Unix seconds. */
  readonly until?: number
  /** Only in channels, only in groups, or only in private conversations. */
  readonly only?: 'channels' | 'groups' | 'users'
  /** Only in this peer folder: 0 is the main list, 1 the archive. */
  readonly peerFolder?: number
}

/** How to search public posts. */
export interface PostSearchFilter {
  /**
   * Stars this account agrees to spend if the free searches are used up.
   *
   * Leaving it out is agreeing to nothing: an exhausted allowance is then an
   * answer saying so, in `searchFlood`, rather than a charge.
   */
  readonly payStars?: bigint
}

/** Which members to read. */
export interface MemberFilter {
  /**
   * Which of them.
   *
   * Everyone recently active when omitted, which is Telegram's own default and
   * the only filter that answers for an ordinary member. A basic group has no
   * filters and refuses one.
   */
  readonly filter?: TypeChannelParticipantsFilter
}

/** Which reactions to read. */
export interface ReactionFilter {
  /** Only accounts that reacted with this one. Every reaction when omitted. */
  readonly reaction?: TypeReaction
}

/** Which boosts to read. */
export interface BoostFilter {
  /** Only boosts that came from a gift or a giveaway. */
  readonly giftsOnly?: boolean
}

/** Which transactions to read. */
export interface StarsFilter {
  /** Only what came in, or only what went out. Both when omitted. */
  readonly direction?: 'incoming' | 'outgoing'
  /** Oldest first rather than newest first. */
  readonly ascending?: boolean
  /** Only the transactions belonging to one subscription. */
  readonly subscriptionId?: string
  /** TON transactions rather than Stars. */
  readonly ton?: boolean
}

/** Which gifts to read. */
export interface GiftFilter {
  /** Leave out the ones the owner has hidden from their profile. */
  readonly excludeUnsaved?: boolean
  /** Leave out the ones the owner is showing. */
  readonly excludeSaved?: boolean
  /** Leave out gifts with no limited edition. */
  readonly excludeUnlimited?: boolean
  /** Leave out unique gifts. */
  readonly excludeUnique?: boolean
  /** Leave out gifts that could still be upgraded. */
  readonly excludeUpgradable?: boolean
  /** Leave out gifts that could not be upgraded. */
  readonly excludeUnupgradable?: boolean
  /** Leave out gifts held on the blockchain rather than on Telegram. */
  readonly excludeHosted?: boolean
  /** Only gifts that can set a name colour. */
  readonly peerColorAvailable?: boolean
  /** Most valuable first rather than newest first. */
  readonly byValue?: boolean
  /** Only the gifts in one of the owner's collections. */
  readonly collectionId?: number
}

/** Which viewers to read, and in what order. */
export interface ViewerFilter {
  /** Only accounts in this account's contacts. */
  readonly contactsOnly?: boolean
  /** Those who reacted first, rather than the most recent first. */
  readonly reactionsFirst?: boolean
  /** Those who forwarded or reposted first. Not together with `reactionsFirst`. */
  readonly forwardsFirst?: boolean
  /** Only accounts whose name matches. */
  readonly query?: string
}

/** Which topics to read. */
export interface TopicFilter {
  /** Only topics whose title matches. */
  readonly query?: string
}

/** Which links to read. */
export interface InviteFilter {
  /** The withdrawn ones rather than the working ones. */
  readonly revoked?: boolean
  /** Only the ones this person created. This account's own when omitted. */
  readonly createdBy?: string | PeerRef
}

/** Which of the people who came through a link to read. */
export interface ImporterFilter {
  /** One link rather than all of them. */
  readonly link?: string
  /** Those waiting for approval rather than those already in. */
  readonly pending?: boolean
  /** Only those whose name matches. Implies `pending`, as the server does. */
  readonly query?: string
}

/** Which of somebody's stories to read. */
export interface StoryFilter {
  /**
   * The archive rather than what is on the profile.
   *
   * Only this account's own archive can be read; asking for somebody else's is
   * refused by the server.
   */
  readonly archived?: boolean
}

/** Which stories to read, across the accounts this one follows. */
export interface AllStoriesFilter {
  /** The accounts this one has hidden from the story list, rather than the rest. */
  readonly archived?: boolean
}

/** Which entries of the administration log to read. */
export interface ChatEventFilter {
  /** Only entries matching this text. */
  readonly query?: string
  /** Only the kinds of act this names. Every kind when omitted. */
  readonly filter?: TypeChannelAdminLogEventsFilter
  /** Only what these accounts did. */
  readonly by?: readonly (string | PeerRef)[]
  /** Only entries with an identifier above this. */
  readonly minId?: bigint
  /** Only entries with an identifier below this. */
  readonly maxId?: bigint
}

export interface DialogOptions extends WalkOptions, DialogFilter {
  /**
   * Only the conversations a chat folder holds, by the folder's own rules.
   *
   * A folder as `account.folders()` reads it, or its schema value. Telegram
   * keeps a folder as rules — conversations always in it, never in it, pinned
   * in it, and kinds to include or leave out — and applies them on the device,
   * so this reads the conversation list and applies them here: pinned
   * conversations first, then the rest in list order. A shared folder is a
   * fixed list of conversations, read directly and not continued from a cursor.
   */
  readonly folder?: Folder | TypeDialogFilter
}
export interface HistoryOptions extends WalkOptions, HistoryFilter {}
export interface SearchOptions extends WalkOptions, SearchFilter {}
export interface GlobalSearchOptions extends WalkOptions, GlobalSearchFilter {}
export interface PostSearchOptions extends WalkOptions, PostSearchFilter {}
export interface MemberOptions extends WalkOptions, MemberFilter {}
export interface ReactionWalkOptions extends WalkOptions, ReactionFilter {}
export interface BoostWalkOptions extends WalkOptions, BoostFilter {}
export interface StarsWalkOptions extends WalkOptions, StarsFilter {}
export interface GiftWalkOptions extends WalkOptions, GiftFilter {}
export interface ViewerWalkOptions extends WalkOptions, ViewerFilter {}
export interface TopicWalkOptions extends WalkOptions, TopicFilter {}
export interface InviteWalkOptions extends WalkOptions, InviteFilter {}
export interface ImporterWalkOptions extends WalkOptions, ImporterFilter {}
export interface StoryWalkOptions extends WalkOptions, StoryFilter {}
export interface ChatEventOptions extends WalkOptions, ChatEventFilter {}

/**
 * Which stories to walk, across the accounts this one follows.
 *
 * No page size: Telegram decides how much a page of this list holds. `limit`
 * counts peers rather than stories — the list is one entry per account.
 */
export interface AllStoriesOptions extends Omit<WalkOptions, 'pageSize'>, AllStoriesFilter {}

/** The page reads, loaded when a list is first read. */
const pages = async () => await import('./pages.js')

/**
 * The client, resolving each peer once for the length of one walk.
 *
 * A page read resolves what it is given, because a page stands alone. A walk
 * reads many pages of one list, and naming the same conversation again for
 * each would be a store read or a request per page for an answer that cannot
 * have changed. A failed resolution is not remembered, so it is not repeated
 * as a failure.
 */
function resolvingOnce(client: Paging): Paging {
  const known = new Map<string, Promise<TypeInputPeer>>()

  return {
    api: client.api,
    resolve(peer) {
      const key = typeof peer === 'string' ? `name:${peer}` : `${peer.kind}:${peer.id}`
      let found = known.get(key)

      if (found === undefined) {
        found = client.resolve(peer)
        known.set(key, found)
        found.catch(() => known.delete(key))
      }

      return found
    },
  }
}

/** How many to ask for on the next request, never more than is still wanted. */
function askFor(options: WalkOptions | undefined, taken: number): number {
  const page = options?.pageSize ?? PAGE
  const limit = options?.limit

  return limit === undefined ? page : Math.min(page, limit - taken)
}

/** Stop before a request that is no longer wanted. */
function stopIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
  }
}

/**
 * The page options a walk hands its page read: filters, the cursor, the size.
 *
 * The walk's own fields — `limit` and `pageSize` — are the walk's, and do not
 * change which list is read, so they are not passed on.
 */
function pageOptions<F extends object>(
  options: (WalkOptions & F) | undefined,
  cursor: string | undefined,
  size: number | undefined,
): PageOptions & F {
  const {
    limit: _limit,
    pageSize: _pageSize,
    cursor: _cursor,
    ...rest
  } = (options ?? {}) as WalkOptions & F

  return {
    ...(rest as unknown as F),
    ...(cursor === undefined ? {} : { cursor }),
    ...(size === undefined ? {} : { size }),
  }
}

/**
 * Walk a list by reading its pages.
 *
 * Every walk is this loop. It hands items over until `limit`, including in the
 * middle of a page, and moves to the next page only where the last one named a
 * cursor — so a page with nothing on it and a cursor is walked past, and a page
 * without a cursor is the end however full it was.
 */
async function* walkPages<T>(
  read: (
    cursor: string | undefined,
    size: number,
  ) => Promise<{
    readonly items: readonly T[]
    readonly next: string | undefined
  }>,
  options: WalkOptions | undefined,
): AsyncGenerator<T, void, undefined> {
  let cursor = options?.cursor
  let taken = 0

  while (options?.limit === undefined || taken < options.limit) {
    stopIfAborted(options?.signal)

    const page = await read(cursor, askFor(options, taken))

    for (const item of page.items) {
      yield item
      taken += 1

      if (options?.limit !== undefined && taken >= options.limit) return
    }

    if (page.next === undefined) return

    cursor = page.next
  }
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
 * Yields the row rather than the conversation: every answer along the way is
 * harvested into the account's peer store, so `account.resolve(dialog.peer)`
 * works afterwards for anything seen.
 */
export async function* walkDialogs(
  client: Paging,
  options?: DialogOptions,
): AsyncGenerator<DialogView, void, undefined> {
  const { dialogsInFolder, dialogsPage } = await pages()
  const once = resolvingOnce(client)

  if (options?.folder !== undefined) {
    yield* dialogsInFolder(once, options.folder, options)

    return
  }

  yield* walkPages(
    async (cursor, size) => await dialogsPage(once, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of this account's conversations. See `pages.ts`. */
export async function dialogsPage(
  client: Paging,
  options?: PageOptions & DialogFilter,
): Promise<DialogPage> {
  return await (await pages()).dialogsPage(client, options)
}

/**
 * Walk a conversation's messages, newest first or oldest first.
 *
 * ```ts
 * for await (const message of walkHistory(account, '@someone', { limit: 200 })) {
 *   if (!message.isService) console.log(message.text)
 * }
 * ```
 *
 * Stops at the end of the conversation, at `limit`, or when a page would not
 * reach past the last one — a conversation whose oldest message keeps coming
 * back would otherwise be walked forever.
 */
export async function* walkHistory(
  client: Paging,
  peer: string | PeerRef,
  options?: HistoryOptions,
): AsyncGenerator<MessageView, void, undefined> {
  const { historyPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await historyPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a conversation's messages. See `pages.ts`. */
export async function historyPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & HistoryFilter,
): Promise<MessagePage> {
  return await (await pages()).historyPage(client, peer, options)
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
 * A filtered search returns fewer messages per page than it was asked for
 * without that meaning the end, so a short page is not an exhaustion signal
 * here; the cursor failing to advance is.
 */
export async function* walkSearch(
  client: Paging,
  peer: string | PeerRef,
  query: string,
  options?: SearchOptions,
): AsyncGenerator<MessageView, void, undefined> {
  const { searchPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await searchPage(once, peer, query, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a search in one conversation. See `pages.ts`. */
export async function searchPage(
  client: Paging,
  peer: string | PeerRef,
  query: string,
  options?: PageOptions & SearchFilter,
): Promise<MessagePage> {
  return await (await pages()).searchPage(client, peer, query, options)
}

/**
 * Walk messages matching a search across every conversation.
 *
 * Paged by a rate Telegram names, plus the last message's conversation and
 * number. A page that names no rate is the end, whatever else it carried.
 */
export async function* walkGlobalSearch(
  client: Paging,
  query: string,
  options?: GlobalSearchOptions,
): AsyncGenerator<MessageView, void, undefined> {
  const { searchGlobalPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await searchGlobalPage(once, query, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a search across every conversation. See `pages.ts`. */
export async function searchGlobalPage(
  client: Paging,
  query: string,
  options?: PageOptions & GlobalSearchFilter,
): Promise<MessagePage> {
  return await (await pages()).searchGlobalPage(client, query, options)
}

/**
 * Walk the public posts carrying a hashtag, across every channel.
 *
 * ```ts
 * for await (const post of walkHashtagSearch(account, 'telegram', { limit: 50 })) {
 *   console.log(post.chat, post.text)
 * }
 * ```
 */
export async function* walkHashtagSearch(
  client: Paging,
  hashtag: string,
  options?: PostSearchOptions,
): AsyncGenerator<MessageView, void, undefined> {
  const { hashtagPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await hashtagPage(once, hashtag, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of public posts carrying a hashtag. See `pages.ts`. */
export async function hashtagPage(
  client: Paging,
  hashtag: string,
  options?: PageOptions & PostSearchFilter,
): Promise<PostPage> {
  return await (await pages()).hashtagPage(client, hashtag, options)
}

/**
 * Walk public posts matching text, across every channel.
 *
 * Telegram meters this search. A walk stops when an answer ends the list,
 * including one that ends it because the free allowance is used up — which a
 * page read reports in `searchFlood`.
 */
export async function* walkPostSearch(
  client: Paging,
  query: string,
  options?: PostSearchOptions,
): AsyncGenerator<MessageView, void, undefined> {
  const { postSearchPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await postSearchPage(once, query, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of public posts matching text. See `pages.ts`. */
export async function postSearchPage(
  client: Paging,
  query: string,
  options?: PageOptions & PostSearchFilter,
): Promise<PostPage> {
  return await (await pages()).postSearchPage(client, query, options)
}

/**
 * Walk the members of a group, supergroup or channel.
 *
 * A channel's members are read by position, which shifts when somebody joins
 * or leaves mid-walk, so an entry can be seen twice or missed. A basic group's
 * members arrive all at once and do not.
 */
export async function* walkMembers(
  client: Paging,
  peer: string | PeerRef,
  options?: MemberOptions,
): AsyncGenerator<MemberView, void, undefined> {
  const { membersPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await membersPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a conversation's members. See `pages.ts`. */
export async function membersPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & MemberFilter,
): Promise<MemberPage> {
  return await (await pages()).membersPage(client, peer, options)
}

/**
 * Walk the accounts that reacted to a message.
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
  const { reactionsPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) =>
      await reactionsPage(once, peer, messageId, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of the accounts that reacted to a message. See `pages.ts`. */
export async function reactionsPage(
  client: Paging,
  peer: string | PeerRef,
  messageId: number,
  options?: PageOptions & ReactionFilter,
): Promise<ReactionPage> {
  return await (await pages()).reactionsPage(client, peer, messageId, options)
}

/** Walk the boosts a channel has been given. */
export async function* walkBoosts(
  client: Paging,
  peer: string | PeerRef,
  options?: BoostWalkOptions,
): AsyncGenerator<Boost, void, undefined> {
  const { boostsPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await boostsPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a channel's boosts. See `pages.ts`. */
export async function boostsPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & BoostFilter,
): Promise<BoostPage> {
  return await (await pages()).boostsPage(client, peer, options)
}

/**
 * Walk an account's star transactions.
 *
 * The balance is not part of the sequence; a page read carries it.
 */
export async function* walkStarsTransactions(
  client: Paging,
  peer: string | PeerRef,
  options?: StarsWalkOptions,
): AsyncGenerator<StarsTransaction, void, undefined> {
  const { starsTransactionsPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) =>
      await starsTransactionsPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of star transactions, with the balance. See `pages.ts`. */
export async function starsTransactionsPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & StarsFilter,
): Promise<StarsPage> {
  return await (await pages()).starsTransactionsPage(client, peer, options)
}

/** Walk the gifts an account or channel is keeping. */
export async function* walkSavedGifts(
  client: Paging,
  owner: string | PeerRef,
  options?: GiftWalkOptions,
): AsyncGenerator<SavedStarGift, void, undefined> {
  const { savedGiftsPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await savedGiftsPage(once, owner, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of the gifts somebody keeps. See `pages.ts`. */
export async function savedGiftsPage(
  client: Paging,
  owner: string | PeerRef,
  options?: PageOptions & GiftFilter,
): Promise<GiftPage> {
  return await (await pages()).savedGiftsPage(client, owner, options)
}

/**
 * Walk the accounts that have seen a story.
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
  const { storyViewersPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) =>
      await storyViewersPage(once, peer, storyId, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a story's viewers, with its counters. See `pages.ts`. */
export async function storyViewersPage(
  client: Paging,
  peer: string | PeerRef,
  storyId: number,
  options?: PageOptions & ViewerFilter,
): Promise<StoryViewerPage> {
  return await (await pages()).storyViewersPage(client, peer, storyId, options)
}

/**
 * Walk somebody's profile photos, newest first.
 *
 * Paged by position, so a photo added or removed mid-walk shifts every later
 * position. No snapshot is claimed.
 */
export async function* walkProfilePhotos(
  client: Paging,
  user: string | PeerRef,
  options?: WalkOptions,
): AsyncGenerator<Photo, void, undefined> {
  const { profilePhotosPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await profilePhotosPage(once, user, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of somebody's profile photos. See `pages.ts`. */
export async function profilePhotosPage(
  client: Paging,
  user: string | PeerRef,
  options?: PageOptions,
): Promise<PhotoPage> {
  return await (await pages()).profilePhotosPage(client, user, options)
}

/** Walk the music on somebody's profile. */
export async function* walkSavedMusic(
  client: Paging,
  user: string | PeerRef,
  options?: WalkOptions,
): AsyncGenerator<TypeDocument, void, undefined> {
  const { savedMusicPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await savedMusicPage(once, user, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of the music on somebody's profile. See `pages.ts`. */
export async function savedMusicPage(
  client: Paging,
  user: string | PeerRef,
  options?: PageOptions,
): Promise<MusicPage> {
  return await (await pages()).savedMusicPage(client, user, options)
}

/** The channels recommended alongside one, with the count Telegram gave. See `pages.ts`. */
export async function similarChannelsPage(
  client: Paging,
  chat: string | PeerRef,
  options?: Pick<PageOptions, 'signal'>,
): Promise<SimilarChannelsPage> {
  return await (await pages()).similarChannelsPage(client, chat, options)
}

/** Walk the topics of a forum. */
export async function* walkForumTopics(
  client: Paging,
  peer: string | PeerRef,
  options?: TopicWalkOptions,
): AsyncGenerator<ForumTopicView, void, undefined> {
  const { forumTopicsPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await forumTopicsPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a forum's topics. See `pages.ts`. */
export async function forumTopicsPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & TopicFilter,
): Promise<TopicPage> {
  return await (await pages()).forumTopicsPage(client, peer, options)
}

/**
 * Walk the invite links of a conversation.
 *
 * An administrator sees only the links they created unless they can manage the
 * conversation's links, which is the server's rule.
 */
export async function* walkInviteLinks(
  client: Paging,
  peer: string | PeerRef,
  options?: InviteWalkOptions,
): AsyncGenerator<InviteLinkView, void, undefined> {
  const { inviteLinksPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await inviteLinksPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a conversation's invite links. See `pages.ts`. */
export async function inviteLinksPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & InviteFilter,
): Promise<InviteLinkPage> {
  return await (await pages()).inviteLinksPage(client, peer, options)
}

/** Walk the accounts that joined, or asked to join, through invite links. */
export async function* walkInviteMembers(
  client: Paging,
  peer: string | PeerRef,
  options?: ImporterWalkOptions,
): AsyncGenerator<InviteImporterView, void, undefined> {
  const { inviteMembersPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await inviteMembersPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of the accounts that came through invite links. See `pages.ts`. */
export async function inviteMembersPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & ImporterFilter,
): Promise<InviteMemberPage> {
  return await (await pages()).inviteMembersPage(client, peer, options)
}

/** Walk the stories on somebody's profile, newest first. */
export async function* walkProfileStories(
  client: Paging,
  peer: string | PeerRef,
  options?: StoryWalkOptions,
): AsyncGenerator<StoryView, void, undefined> {
  const { profileStoriesPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) =>
      await profileStoriesPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of the stories on a profile. See `pages.ts`. */
export async function profileStoriesPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & StoryFilter,
): Promise<ProfileStoriesPage> {
  return await (await pages()).profileStoriesPage(client, peer, options)
}

/**
 * Walk the stories of the accounts this one follows, one account at a time.
 *
 * Telegram decides how much a page holds. The end is the server saying there is
 * no more, not the absence of a state.
 */
export async function* walkAllStories(
  client: Paging,
  options?: AllStoriesOptions,
): AsyncGenerator<PeerStoriesView, void, undefined> {
  const { allStoriesPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor) =>
      await allStoriesPage(once, pageOptions<AllStoriesFilter>(options, cursor, undefined)),
    options,
  )
}

/** One page of the stories of the accounts this one follows. See `pages.ts`. */
export async function allStoriesPage(
  client: Paging,
  options?: Omit<PageOptions, 'size'> & AllStoriesFilter,
): Promise<AllStoriesPage> {
  return await (await pages()).allStoriesPage(client, options)
}

/**
 * Walk a channel's administration log, newest first.
 *
 * Only somebody who can see the log may read it, which is the server's rule.
 */
export async function* walkChatEvents(
  client: Paging,
  peer: string | PeerRef,
  options?: ChatEventOptions,
): AsyncGenerator<ChatEventView, void, undefined> {
  const { chatEventsPage } = await pages()
  const once = resolvingOnce(client)

  yield* walkPages(
    async (cursor, size) => await chatEventsPage(once, peer, pageOptions(options, cursor, size)),
    options,
  )
}

/** One page of a channel's administration log. See `pages.ts`. */
export async function chatEventsPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & ChatEventFilter,
): Promise<ChatEventPage> {
  return await (await pages()).chatEventsPage(client, peer, options)
}
