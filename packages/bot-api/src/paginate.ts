// SPDX-License-Identifier: MPL-2.0

/**
 * Reading a list the Bot API returns a page at a time.
 *
 * Six methods page: a user's profile photos and audios, the bot's star
 * transactions, and three lists of gifts. The first three count by position,
 * the gifts by a cursor Telegram hands back. Both are read here as one
 * sequence that fetches a page only when the loop asks for the next item:
 *
 * ```ts
 * for await (const gift of bot.userGifts(userId, { limit: 50 })) { ... }
 * const photos = await bot.profilePhotos(userId).collect()
 * console.log(photos.length, 'of', photos.total)
 * ```
 *
 * ```
 *   by position   offset 0 ──► page ──► offset += page length ──► …   until a short or empty page,
 *                                                                     or the total is reached
 *   by cursor     ''       ──► page ──► cursor = next_offset   ──► …   until no next cursor,
 *                                                                     or an empty page
 * ```
 *
 * The same options the account's list walks take: `limit` stops after that
 * many items, `pageSize` is how many to ask for at a time, and `signal` stops
 * the walk between requests and cancels the one in flight. A cursor that comes
 * back unchanged is an error rather than a loop that never ends.
 *
 * This is data pagination — every item, read in order. Showing a list to a
 * person a screen at a time, with buttons to move between screens, is
 * {@link pager}'s.
 */

import type { RawApi } from './api.js'
import { CancelledError, ValidationError } from './core.js'
import type {
  GetBusinessAccountGiftsParams,
  GetChatGiftsParams,
  GetUserGiftsParams,
} from './generated/methods/index.js'
import type { Audio, OwnedGift, PhotoSize, StarTransaction } from './generated/types/index.js'

/** One page, as a list method answers it. */
export interface Page<T> {
  readonly items: readonly T[]
  /** How many the whole list holds, where Telegram says. */
  readonly total?: number | undefined
  /** Where the next page begins, for a list read by cursor. */
  readonly next?: string | undefined
}

/** How much of a list to read, and how. */
export interface PageOptions {
  /** Stop after this many items. The whole list unless given. */
  readonly limit?: number
  /** How many to ask for per request. The method's maximum unless given. */
  readonly pageSize?: number
  /** Stops the walk between requests, and cancels the one in flight. */
  readonly signal?: AbortSignal
}

/** A list read in full, with the total Telegram gave for it. */
export type Collected<T> = T[] & { readonly total: number | undefined }

/** A list being read, one item at a time. */
export interface Pages<T> extends AsyncIterableIterator<T> {
  /** How many the whole list holds, once the first page says; `undefined` before or if it never does. */
  readonly total: number | undefined
  /** Read the rest into an array. */
  collect(): Promise<Collected<T>>
}

/** Fetches one page by position. */
export type OffsetFetch<T> = (
  offset: number,
  limit: number,
  signal?: AbortSignal,
) => Promise<Page<T>>

/** Fetches one page by cursor. */
export type CursorFetch<T> = (
  cursor: string,
  limit: number,
  signal?: AbortSignal,
) => Promise<Page<T>>

function checkOptions(options: PageOptions, maxPageSize: number): number {
  const { limit, pageSize = maxPageSize } = options
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new ValidationError(`a limit is a whole number of items, not ${limit}`)
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
    throw new ValidationError(`a page holds 1 to ${maxPageSize} items, not ${pageSize}`)
  }
  return pageSize
}

function stopIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new CancelledError('the list was abandoned')
}

/** Wrap a generator as a list with a total and `collect`. */
function listOf<T>(source: (seen: { total: number | undefined }) => AsyncGenerator<T>): Pages<T> {
  const seen: { total: number | undefined } = { total: undefined }
  const items = source(seen)

  // A property with a getter, not a copied value: the total is known only
  // after the first page, and reading it must say what is known then.
  Object.defineProperty(items, 'total', { get: () => seen.total, enumerable: true })

  return Object.assign(items, {
    async collect(): Promise<Collected<T>> {
      const all: T[] = []
      for await (const item of items) all.push(item)
      return Object.assign(all, { total: seen.total })
    },
  }) as unknown as Pages<T>
}

/** How one kind of list is fetched and continued. */
interface Step<T> {
  /** Whether the list is known to be over before asking. */
  over(total: number | undefined): boolean
  fetch(wanted: number, signal: AbortSignal | undefined): Promise<Page<T>>
  /** Move past a page; `false` when it was the last. */
  advance(page: Page<T>, wanted: number): boolean
}

/** Read pages through a step until it ends or the limit is reached. */
function walkPages<T>(options: PageOptions, pageSize: number, step: Step<T>): Pages<T> {
  return listOf(async function* (seen) {
    let yielded = 0

    for (;;) {
      const wanted =
        options.limit === undefined ? pageSize : Math.min(pageSize, options.limit - yielded)
      if (wanted <= 0 || step.over(seen.total)) return

      stopIfAborted(options.signal)
      const page = await step.fetch(wanted, options.signal)
      if (page.total !== undefined) seen.total = page.total

      // Never more than asked for, whatever a page holds.
      const taken =
        options.limit === undefined ? page.items : page.items.slice(0, options.limit - yielded)
      yield* taken
      yielded += taken.length

      if (!step.advance(page, wanted)) return
    }
  })
}

/**
 * A list read by position: each request names how many to skip.
 *
 * Ends on a page shorter than asked for, an empty page, or once the total
 * Telegram gave has been reached — whichever comes first.
 */
export function offsetPages<T>(
  fetchPage: OffsetFetch<T>,
  options: PageOptions & { readonly offset?: number; readonly maxPageSize?: number } = {},
): Pages<T> {
  const pageSize = checkOptions(options, options.maxPageSize ?? 100)
  let offset = options.offset ?? 0
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ValidationError(`an offset is a whole number, not ${offset}`)
  }

  return walkPages(options, pageSize, {
    over: (total) => total !== undefined && offset >= total,
    fetch: (wanted, signal) => fetchPage(offset, wanted, signal),
    advance(page, wanted) {
      if (page.items.length === 0 || page.items.length < wanted) return false
      offset += page.items.length
      return true
    },
  })
}

/**
 * A list read by cursor: each page names where the next begins.
 *
 * Ends when a page names no next cursor or holds nothing. A page that names
 * the cursor it was asked for would repeat forever, and is refused.
 */
export function cursorPages<T>(
  fetchPage: CursorFetch<T>,
  options: PageOptions & { readonly cursor?: string; readonly maxPageSize?: number } = {},
): Pages<T> {
  const pageSize = checkOptions(options, options.maxPageSize ?? 100)
  let cursor = options.cursor ?? ''

  return walkPages(options, pageSize, {
    over: () => false,
    fetch: (wanted, signal) => fetchPage(cursor, wanted, signal),
    advance(page) {
      if (page.items.length === 0 || page.next === undefined || page.next === '') return false
      if (page.next === cursor) {
        throw new ValidationError(
          `the list answered with the cursor it was asked for ('${cursor}'), so reading on would never end`,
        )
      }
      cursor = page.next
      return true
    },
  })
}

/** A gift list's own filters: its parameters, less the target and the paging. */
export type GiftFilters<P> = Omit<
  P,
  'offset' | 'limit' | 'user_id' | 'chat_id' | 'business_connection_id'
>

/* -------------------------------------------------------------------------- */
/* The six lists                                                              */
/* -------------------------------------------------------------------------- */

/** A user's profile photos, newest first, each as the sizes it comes in. */
export function profilePhotos(
  api: RawApi,
  userId: number,
  options: PageOptions & { readonly offset?: number } = {},
): Pages<readonly PhotoSize[]> {
  return offsetPages(async (offset, limit, signal) => {
    const answer = await api.getUserProfilePhotos(
      { user_id: userId, offset, limit },
      signal === undefined ? undefined : { signal },
    )
    return { items: answer.photos, total: answer.total_count }
  }, options)
}

/** A user's profile audios, in the order Telegram lists them. */
export function profileAudios(
  api: RawApi,
  userId: number,
  options: PageOptions & { readonly offset?: number } = {},
): Pages<Audio> {
  return offsetPages(async (offset, limit, signal) => {
    const answer = await api.getUserProfileAudios(
      { user_id: userId, offset, limit },
      signal === undefined ? undefined : { signal },
    )
    return { items: answer.audios, total: answer.total_count }
  }, options)
}

/** The bot's star transactions, newest first. Telegram gives no total. */
export function starTransactions(
  api: RawApi,
  options: PageOptions & { readonly offset?: number } = {},
): Pages<StarTransaction> {
  return offsetPages(async (offset, limit, signal) => {
    const answer = await api.getStarTransactions(
      { offset, limit },
      signal === undefined ? undefined : { signal },
    )
    return { items: answer.transactions }
  }, options)
}

/** The gifts a user has received and displays. */
export function userGifts(
  api: RawApi,
  userId: number,
  options: PageOptions & { readonly cursor?: string } & GiftFilters<GetUserGiftsParams> = {},
): Pages<OwnedGift> {
  const { limit, pageSize, signal, cursor, ...filters } = options
  return cursorPages(async (offset, size, abort) => {
    const answer = await api.getUserGifts(
      { ...filters, user_id: userId, offset, limit: size },
      abort === undefined ? undefined : { signal: abort },
    )
    return { items: answer.gifts, total: answer.total_count, next: answer.next_offset }
  }, walkOptions({ limit, pageSize, signal, cursor }))
}

/** The gifts a chat has received. */
export function chatGifts(
  api: RawApi,
  chatId: number | string,
  options: PageOptions & { readonly cursor?: string } & GiftFilters<GetChatGiftsParams> = {},
): Pages<OwnedGift> {
  const { limit, pageSize, signal, cursor, ...filters } = options
  return cursorPages(async (offset, size, abort) => {
    const answer = await api.getChatGifts(
      { ...filters, chat_id: chatId, offset, limit: size },
      abort === undefined ? undefined : { signal: abort },
    )
    return { items: answer.gifts, total: answer.total_count, next: answer.next_offset }
  }, walkOptions({ limit, pageSize, signal, cursor }))
}

/** The gifts a connected business account has received. */
export function businessGifts(
  api: RawApi,
  businessConnectionId: string,
  options: PageOptions & {
    readonly cursor?: string
  } & GiftFilters<GetBusinessAccountGiftsParams> = {},
): Pages<OwnedGift> {
  const { limit, pageSize, signal, cursor, ...filters } = options
  return cursorPages(async (offset, size, abort) => {
    const answer = await api.getBusinessAccountGifts(
      { ...filters, business_connection_id: businessConnectionId, offset, limit: size },
      abort === undefined ? undefined : { signal: abort },
    )
    return { items: answer.gifts, total: answer.total_count, next: answer.next_offset }
  }, walkOptions({ limit, pageSize, signal, cursor }))
}

/** The walk's own options, without the undefined ones. */
function walkOptions(options: {
  limit: number | undefined
  pageSize: number | undefined
  signal: AbortSignal | undefined
  cursor: string | undefined
}): PageOptions & { readonly cursor?: string } {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as PageOptions & { readonly cursor?: string }
}
