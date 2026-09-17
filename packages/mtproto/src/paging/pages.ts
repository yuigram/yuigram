/**
 * One page of a list, with everything the answer said about the rest of it.
 *
 * A walk hands items over and keeps its place to itself. That is the right
 * shape for reading a list, and the wrong one for three things a program also
 * does with lists: showing how many there are, stopping now and carrying on
 * later, and knowing whether the list ended or merely paused. So each list here
 * has a page read beside its walk, and the walk is a loop over the page read —
 * one implementation of each list's continuation rule rather than two.
 *
 * ```
 *   const first = await account.historyPage(chat, { size: 50 })
 *   first.total      // { count: 1873, precision: 'exact' }
 *   first.next       // a cursor, or undefined at the end
 *   const second = await account.historyPage(chat, { cursor: first.next })
 * ```
 *
 * **Totals are what Telegram said, and only that.** Three kinds:
 *
 * - `exact` — the answer states the count and does not flag it as estimated,
 *   or the answer is the complete list and says so by its form;
 * - `approximate` — the answer flags its own count as inexact, which the
 *   message searches do for large results;
 * - `reported` — the answer carries a count and says nothing about its
 *   precision, which is most lists. It is Telegram's number, not a guarantee.
 *
 * Where the answer carries no count the total is `undefined`. It is never taken
 * from the length of the page, and never zero standing in for "not said".
 *
 * **A cursor is opaque, not secret.** It is base64 over a small record: which
 * list it belongs to, a fingerprint of the query that produced it, and the
 * offset fields Telegram expects back — with 64-bit values kept as integers
 * rather than numbers, so nothing is rounded. Anybody can decode it and anybody
 * can forge one; what the record buys is that a cursor handed to the wrong list,
 * or to the same list with a different query, is refused by name instead of
 * silently continuing some other sequence. Peers inside a cursor are references
 * — kind and identifier — and are resolved through the account reading the
 * next page, so a cursor never carries an access hash and means nothing to an
 * account that has not met the peer.
 *
 * **The end, and a pause, are different.** `next` is `undefined` only when the
 * answer described nowhere further to go. A page with no items and a cursor is
 * a list that continues past an empty stretch. A cursor that would ask for the
 * page just read is treated as the end, because following it would repeat that
 * page for ever.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import type { Folder } from '../chats/folders.js'
import { fromBase64, toBase64 } from '../crypto/encoding.js'
import {
  ChatEventView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
} from '../entities/chat.js'
import { DialogView } from '../entities/dialog.js'
import { MemberView } from '../entities/member.js'
import { MessageView, ReactionView } from '../entities/message.js'
import { ChatView, PeerIndex } from '../entities/peer.js'
import { PeerStoriesView, StoryView, StoryViewerView } from '../entities/story.js'
import type {
  Boost,
  messages,
  Photo,
  SavedStarGift,
  StarsTransaction,
  TypeDialogFilter,
  TypeDocument,
  TypeInputPeer,
  TypeInputUser,
  TypeSearchPostsFlood,
  TypeStarsAmount,
  TypeStoriesStealthMode,
} from '../generated/api/types/index.js'
import { channelFor, userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import { nextDialogs } from '../normalize/paging.js'
import type {
  AllStoriesFilter,
  BoostFilter,
  ChatEventFilter,
  DialogFilter,
  GiftFilter,
  GlobalSearchFilter,
  HistoryFilter,
  ImporterFilter,
  InviteFilter,
  MemberFilter,
  PageOptions,
  Paging,
  PostSearchFilter,
  ReactionFilter,
  SearchFilter,
  StarsFilter,
  StoryFilter,
  TopicFilter,
  ViewerFilter,
  WalkOptions,
} from './walk.js'
import { CursorError } from './walk.js'

/** How many to ask for when the caller does not say. */
const DEFAULT_SIZE = 100

/* -------------------------------------------------------------------------- */
/* The shape                                                                   */
/* -------------------------------------------------------------------------- */

/** How far a total can be relied on. */
export type TotalPrecision = 'exact' | 'approximate' | 'reported'

/** How many there are altogether, as the answer said. */
export interface PageTotal {
  readonly count: number
  readonly precision: TotalPrecision
}

/** One page of a list. */
export interface PageOf<T> {
  /** What this page holds, in the order the list has them. */
  readonly items: readonly T[]
  /** How many there are altogether, or `undefined` where the answer did not say. */
  readonly total: PageTotal | undefined
  /** Where to continue from, or `undefined` where the list ends here. */
  readonly next: string | undefined
}

/** A page that also carries the peers its answer described. */
export interface PeeredPage<T> extends PageOf<T> {
  /**
   * The users and conversations the answer described alongside the items.
   *
   * The same records the account writes into its peer store, handed over so a
   * caller naming the sender of a message on this page does not have to look
   * them up again.
   */
  readonly peers: PeerIndex
}

/* -------------------------------------------------------------------------- */
/* Cursors                                                                     */
/* -------------------------------------------------------------------------- */

/** The cursor format this writes and reads. */
const CURSOR_VERSION = 1

/** The record a cursor encodes. */
interface CursorRecord {
  readonly v: number
  readonly k: string
  readonly f: string
  readonly o: unknown
}

/** Keep 64-bit integers integers on the way through JSON. */
function replace(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? { $n: value.toString() } : value
}

/** And bring them back. */
function revive(_key: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value

  const keys = Object.keys(value)
  const text = (value as { $n?: unknown }).$n
  if (keys.length !== 1 || typeof text !== 'string') return value
  if (!/^-?\d{1,20}$/.test(text)) throw new CursorError('this cursor carries a malformed integer')

  return BigInt(text)
}

/** Base64 with the URL alphabet and no padding. */
function urlSafe(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A cursor for a position in one list, as produced by one query. */
function writeCursor(kind: string, fingerprint: string, offset: object): string {
  const record: CursorRecord = { v: CURSOR_VERSION, k: kind, f: fingerprint, o: offset }

  return urlSafe(new TextEncoder().encode(JSON.stringify(record, replace)))
}

/**
 * Read a cursor back, refusing one that belongs somewhere else.
 *
 * The checks are for mistakes, not for attacks: a cursor from a different list,
 * from the same list with a different query, from a newer format, or damaged in
 * transit. Each is refused with a message saying which, because a continuation
 * that silently started over is indistinguishable from one that worked.
 */
function readCursor<O>(
  text: string,
  kind: string,
  fingerprint: string,
  shape: (offset: Record<string, unknown>) => O,
): O {
  let record: CursorRecord

  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), revive)
  } catch (error) {
    if (error instanceof CursorError) throw error

    throw new CursorError('this cursor is not one: it could not be decoded')
  }

  if (typeof record !== 'object' || record === null) {
    throw new CursorError('this cursor is not one: it decodes to no record')
  }

  if (record.v !== CURSOR_VERSION) {
    throw new CursorError(
      `this cursor is format ${String(record.v)}, and this reads ${CURSOR_VERSION}`,
    )
  }

  if (record.k !== kind) {
    throw new CursorError(
      `this cursor continues a ${String(record.k)} list, and was given to a ${kind} list`,
    )
  }

  if (record.f !== fingerprint) {
    throw new CursorError(
      `this cursor was produced by a different ${kind} query — another conversation, ` +
        'another search, or other filters — and continuing with it would read a different list',
    )
  }

  if (typeof record.o !== 'object' || record.o === null || Array.isArray(record.o)) {
    throw new CursorError('this cursor carries no position')
  }

  return shape(record.o as Record<string, unknown>)
}

/** A whole number field of a cursor's position. */
function int(offset: Record<string, unknown>, field: string): number {
  const value = offset[field]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new CursorError(`this cursor's '${field}' is not a whole number`)
  }

  return value
}

/** A 64-bit field of a cursor's position. */
function big(offset: Record<string, unknown>, field: string): bigint {
  const value = offset[field]
  if (typeof value !== 'bigint') throw new CursorError(`this cursor's '${field}' is not an integer`)

  return value
}

/** A text field of a cursor's position. */
function str(offset: Record<string, unknown>, field: string): string {
  const value = offset[field]
  if (typeof value !== 'string') throw new CursorError(`this cursor's '${field}' is not text`)

  return value
}

/** A peer reference in a cursor's position, or nothing where it holds none. */
function ref(offset: Record<string, unknown>, field: string): PeerRef | undefined {
  const value = offset[field]
  if (value === null || value === undefined) return undefined

  const record = value as { kind?: unknown; id?: unknown }
  if (
    (record.kind !== 'user' && record.kind !== 'chat' && record.kind !== 'channel') ||
    typeof record.id !== 'bigint'
  ) {
    throw new CursorError(`this cursor's '${field}' is not a peer reference`)
  }

  return { kind: record.kind, id: record.id }
}

/**
 * A fingerprint of what a query asked for.
 *
 * FNV-1a over a canonical rendering: keys sorted, integers as text. Short on
 * purpose and not collision-resistant, which is enough for its one job —
 * noticing that a cursor is being reused with a different query — and says
 * nothing about integrity, which a cursor does not claim.
 */
function fingerprint(query: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (typeof value === 'bigint') return `${value}n`
    if (Array.isArray(value)) return value.map(canonical)
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
          .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
      )
    }

    return value
  }

  let hash = 0x81_1c_9d_c5
  for (const byte of new TextEncoder().encode(JSON.stringify(canonical(query)))) {
    hash ^= byte
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

/** The identity of a resolved peer, for a fingerprint or a cursor. */
function identity(peer: TypeInputPeer): PeerRef | null {
  switch (peer._) {
    case 'inputPeerUser':
    case 'inputPeerUserFromMessage':
      return { kind: 'user', id: peer.user_id }
    case 'inputPeerChat':
      return { kind: 'chat', id: peer.chat_id }
    case 'inputPeerChannel':
    case 'inputPeerChannelFromMessage':
      return { kind: 'channel', id: peer.channel_id }
    default:
      return null
  }
}

/** The request options, without the ones that do not change which list is read. */
function queryOf(options: object | undefined): Record<string, unknown> {
  const {
    cursor: _cursor,
    size: _size,
    signal: _signal,
    limit: _limit,
    pageSize: _pageSize,
    startId: _startId,
    startDate: _startDate,
    shift: _shift,
    ...rest
  } = (options ?? {}) as Record<string, unknown>

  return rest
}

/**
 * The cursor for a next page, unless it would ask for the page just read.
 *
 * Compared as encoded text, which is exact: two positions are the same
 * position exactly when their records are.
 */
function onward(
  kind: string,
  print: string,
  offset: object | undefined,
  current: string | undefined,
) {
  if (offset === undefined) return undefined

  const next = writeCursor(kind, print, offset)

  return next === current ? undefined : next
}

/** Refuse to make a request that has already been abandoned. */
function checkSignal(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
  }
}

/** How many to ask for. */
function sizeOf(options: PageOptions | undefined): number {
  const size = options?.size ?? DEFAULT_SIZE
  if (!Number.isInteger(size) || size < 1) {
    throw new ValidationError(`a page size is a whole number above zero, not ${String(size)}`)
  }

  return size
}

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The total a message list reports.
 *
 * The complete form is the whole list, and says so by being that form; only on
 * a first request, though — the same form answering a continuation would be
 * the rest of the list, and its length would not be the total.
 */
function messagesTotal(answer: messages.TypeMessages, first: boolean): PageTotal | undefined {
  switch (answer._) {
    case 'messages.messages':
      return first ? { count: answer.messages.length, precision: 'exact' } : undefined
    case 'messages.messagesSlice':
    case 'messages.channelMessages':
      return { count: answer.count, precision: answer.inexact === true ? 'approximate' : 'exact' }
    default:
      return undefined
  }
}

/** A count the answer gave without saying how precise it is. */
const reported = (count: number): PageTotal => ({ count, precision: 'reported' })

/** The peers a message answer described. */
function peersOf(answer: { users?: readonly unknown[]; chats?: readonly unknown[] }): PeerIndex {
  return new PeerIndex(answer as ConstructorParameters<typeof PeerIndex>[0])
}

/* -------------------------------------------------------------------------- */
/* Conversations                                                               */
/* -------------------------------------------------------------------------- */

/** A page of the conversation list. */
export type DialogPage = PeeredPage<DialogView>

/**
 * One page of this account's conversations, most recent first.
 *
 * The total is Telegram's count of the list the request named: the main list,
 * the archive, or both. A complete answer on a first request is the whole list,
 * and its length is exact.
 */
export async function dialogsPage(
  client: Paging,
  options?: PageOptions & DialogFilter,
): Promise<DialogPage> {
  const print = fingerprint(queryOf(options))
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'dialogs', print, (o) => ({
          date: int(o, 'date'),
          id: int(o, 'id'),
          peer: ref(o, 'peer'),
        }))

  checkSignal(options?.signal)

  const folder = folderOf(options)

  if (options?.pinned === 'only') {
    // The pinned conversations are a list of their own with a request of their
    // own, complete in one answer: the pinned block cannot be longer than
    // Telegram allows pinning.
    const answer = await client.api.messages.getPinnedDialogs({ folder_id: folder ?? 0 })

    return {
      items: answer.dialogs.map((row) => new DialogView(row)),
      total: { count: answer.dialogs.length, precision: 'exact' },
      next: undefined,
      peers: peersOf(answer),
    }
  }

  const answer = await client.api.messages.getDialogs({
    offset_date: start?.date ?? 0,
    offset_id: start?.id ?? 0,
    offset_peer:
      start?.peer === undefined ? { _: 'inputPeerEmpty' } : await client.resolve(start.peer),
    limit: sizeOf(options),
    hash: 0n,
    ...(folder === undefined ? {} : { folder_id: folder }),
    ...(options?.pinned === 'exclude' ? { exclude_pinned: true } : {}),
  })

  if (answer._ === 'messages.dialogsNotModified') {
    return { items: [], total: undefined, next: undefined, peers: new PeerIndex({}) }
  }

  return {
    items: answer.dialogs.map((row) => new DialogView(row)),
    total:
      answer._ === 'messages.dialogsSlice'
        ? reported(answer.count)
        : start === undefined
          ? { count: answer.dialogs.length, precision: 'exact' }
          : undefined,
    next: onward('dialogs', print, nextDialogs(answer), options?.cursor),
    peers: peersOf(answer),
  }
}

/** The folder number a dialog filter names, where it names one. */
function folderOf(options: DialogFilter | undefined): number | undefined {
  if (options?.peerFolder !== undefined) return options.peerFolder

  switch (options?.archived) {
    case 'only':
      return 1
    case 'exclude':
      return 0
    default:
      return undefined
  }
}

/** A folder of the rule-based kind, as opposed to the default or a shared one. */
type DialogFilterRule = Extract<TypeDialogFilter, { _: 'dialogFilter' }>

/** A chat folder, as the schema describes it. */
function ruleOf(folder: Folder | TypeDialogFilter): TypeDialogFilter {
  return '_' in folder ? folder : folder.raw
}

/** The key a peer is matched by, inside a folder's rules. */
function keyOf(peer: TypeInputPeer | PeerRef | undefined): string | undefined {
  if (peer === undefined) return undefined
  const named = 'kind' in peer ? peer : identity(peer)

  return named === null ? undefined : `${named.kind}:${named.id}`
}

/**
 * Whether a conversation belongs in a chat folder, by the folder's rules.
 *
 * Telegram's order of precedence: a conversation named as always in the folder
 * is in it, whatever else is true; one named as never in it is not; after that
 * the read, muted and archived exclusions apply, and finally the kinds of
 * conversation the folder includes. A conversation matching none of it is not
 * in the folder.
 *
 * A folder's pinned conversations are read first by the walk, so they are left
 * out here unless `keepPinned` says they should fall where the list has them.
 */
function belongs(
  folder: TypeDialogFilter,
  peers: PeerIndex,
  keepPinned: boolean,
  now: number,
): (dialog: DialogView) => boolean {
  if (folder._ === 'dialogFilterDefault') return () => true

  const pinned = new Set(folder.pinned_peers.map(keyOf))
  const included = new Set(folder.include_peers.map(keyOf))

  if (folder._ === 'dialogFilterChatlist') {
    return (dialog) => {
      const key = keyOf(dialog.peer)
      if (!keepPinned && pinned.has(key)) return false

      return included.has(key) || pinned.has(key)
    }
  }

  const excluded = new Set(folder.exclude_peers.map(keyOf))

  return (dialog) => {
    const key = keyOf(dialog.peer)
    if (included.has(key)) return true
    if (excluded.has(key) || (!keepPinned && pinned.has(key))) return false
    if (leftOutByState(folder, dialog, now)) return false

    return matchesKind(folder, peers, dialog)
  }
}

/** Whether a folder's read, muted or archived exclusion leaves a conversation out. */
function leftOutByState(folder: DialogFilterRule, dialog: DialogView, now: number): boolean {
  const unread = (dialog.unreadCount ?? 0) > 0 || dialog.isMarkedUnread
  const muted = (dialog.notifySettings?.mute_until ?? 0) > now

  return (
    (folder.exclude_read === true && !unread) ||
    (folder.exclude_muted === true && muted) ||
    (folder.exclude_archived === true && dialog.folderId === 1)
  )
}

/** Whether a conversation is one of the kinds a folder includes. */
function matchesKind(folder: DialogFilterRule, peers: PeerIndex, dialog: DialogView): boolean {
  const peer = dialog.peer

  if (peer?.kind === 'user') {
    // A bot is only ever matched as a bot, and this account counts as its own
    // contact — the rules Telegram's own clients apply, so a folder shows the
    // same conversations here as it does there.
    const user = peers.user(peer)
    if (user === undefined) return false
    if (user.isBot) return folder.bots === true
    if (user.isContact || user.isSelf) return folder.contacts === true

    return folder.non_contacts === true
  }

  const chat = peers.chat(peer)
  if (chat === undefined) return false

  return chat.isBroadcast ? folder.broadcasts === true : folder.groups === true
}

/** Read the rows for a list of peers directly, in pages of `size`. */
async function* rowsFor(
  client: Paging,
  peers: readonly TypeInputPeer[],
  size: number,
  signal: AbortSignal | undefined,
  pinned: boolean,
): AsyncGenerator<DialogView, void, undefined> {
  for (let from = 0; from < peers.length; from += size) {
    checkSignal(signal)

    const answer = await client.api.messages.getPeerDialogs({
      peers: peers
        .slice(from, from + size)
        .map((peer) => ({ _: 'inputDialogPeer' as const, peer })),
    })

    for (const row of answer.dialogs) {
      // A folder's pinned conversation is pinned in the folder whether or not it
      // is pinned in the main list, and the row says so.
      yield new DialogView(pinned ? { ...row, pinned: true } : row)
    }
  }
}

/**
 * Walk the conversations a chat folder holds, by the folder's rules.
 *
 * Pinned conversations come first, read directly, unless the walk is resuming
 * from a cursor or `pinned` says otherwise. The rest are the conversation list
 * with the folder's rules applied. A shared folder is a fixed list of peers and
 * is read directly; it has no cursor to resume from, and one given is refused.
 */
export async function* dialogsInFolder(
  client: Paging,
  folder: Folder | TypeDialogFilter,
  options?: WalkOptions & DialogFilter,
): AsyncGenerator<DialogView, void, undefined> {
  const rule = ruleOf(folder)
  const limit = options?.limit
  let taken = 0

  const sources = [directRows(client, rule, options)]
  if (readsList(rule, options?.pinned)) sources.push(listRows(client, rule, options))

  for (const source of sources) {
    for await (const row of source) {
      yield row
      taken += 1

      if (limit !== undefined && taken >= limit) return
    }
  }
}

/** Whether a folder's conversations include ones found by reading the list. */
function readsList(rule: TypeDialogFilter, pinned: DialogFilter['pinned']): boolean {
  if (rule._ === 'dialogFilterChatlist') return false

  return !(rule._ === 'dialogFilter' && pinned === 'only')
}

/**
 * The conversations of a folder that are read by naming them.
 *
 * A shared folder is all of these: its pinned conversations, then the rest.
 * A rule-based folder has its pinned ones here, first, unless resuming from a
 * cursor or told to leave them where they fall.
 */
async function* directRows(
  client: Paging,
  rule: TypeDialogFilter,
  options: (WalkOptions & DialogFilter) | undefined,
): AsyncGenerator<DialogView, void, undefined> {
  const size = sizeOf({ size: options?.pageSize ?? DEFAULT_SIZE })
  const pinned = options?.pinned ?? 'include'

  if (rule._ === 'dialogFilterChatlist') {
    if (options?.cursor !== undefined) {
      throw new ValidationError(
        'a shared folder is a fixed list of conversations and has no cursor',
      )
    }
    if (pinned !== 'exclude') yield* rowsFor(client, rule.pinned_peers, size, options?.signal, true)
    if (pinned !== 'only') yield* rowsFor(client, rule.include_peers, size, options?.signal, false)

    return
  }

  if (rule._ !== 'dialogFilter') return

  const first = pinned === 'only' || (pinned === 'include' && options?.cursor === undefined)
  if (first) yield* rowsFor(client, rule.pinned_peers, size, options?.signal, true)
}

/** The conversations of a rule-based folder found by reading the list. */
async function* listRows(
  client: Paging,
  rule: TypeDialogFilter,
  options: (WalkOptions & DialogFilter) | undefined,
): AsyncGenerator<DialogView, void, undefined> {
  const size = sizeOf({ size: options?.pageSize ?? DEFAULT_SIZE })
  const pinned = options?.pinned ?? 'include'
  const archived = rule._ === 'dialogFilter' && rule.exclude_archived === true ? 'exclude' : 'keep'
  const now = Math.floor(Date.now() / 1000)
  let cursor = options?.cursor

  for (;;) {
    checkSignal(options?.signal)

    const page = await dialogsPage(client, {
      archived,
      size,
      ...(pinned === 'exclude' ? { pinned: 'exclude' as const } : {}),
      ...(cursor === undefined ? {} : { cursor }),
    })
    const inFolder = belongs(rule, page.peers, pinned === 'keep', now)

    for (const row of page.items) if (inFolder(row)) yield row

    if (page.next === undefined) return

    cursor = page.next
  }
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/** A page of messages. */
export type MessagePage = PeeredPage<MessageView>

/**
 * The next position of a list continued by message number, newest first.
 *
 * The complete form is the whole list and continues nowhere. Otherwise the next
 * request asks for what sits before the oldest message of this page.
 */
function beforeOldest(answer: messages.TypeMessages, views: readonly MessageView[]) {
  if (answer._ === 'messages.messages' || views.length === 0) return undefined

  return { id: Math.min(...views.map((view) => view.id)) }
}

/**
 * One page of a conversation's messages.
 *
 * Newest first by default. With `reverse`, oldest first: the request asks for
 * the messages at and after a position rather than before it, and the page is
 * put in ascending order before it is handed over, so a caller reading forward
 * through a conversation reads it in the order it happened.
 */
export async function historyPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & HistoryFilter,
): Promise<MessagePage> {
  const target = await client.resolve(peer)
  const print = fingerprint({ peer: identity(target), ...queryOf(options) })
  const reverse = options?.reverse === true
  const size = sizeOf(options)

  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'history', print, (o) => ({ id: int(o, 'id') }))

  checkSignal(options?.signal)

  // Oldest first is the same request with the window moved: starting at a
  // position and reaching `size` messages newer than it. The first position is
  // the one asked for, the message just after the lower bound, or the first
  // message there is. A caller's start and shift apply to the first page only.
  const fresh = start === undefined
  const offsetId =
    start?.id ??
    (reverse ? (options?.startId ?? (options?.minId ?? 0) + 1) : (options?.startId ?? 0))
  const shift = fresh ? (options?.shift ?? 0) : 0

  const answer = await client.api.messages.getHistory({
    peer: target,
    offset_id: offsetId,
    offset_date: fresh ? (options?.startDate ?? 0) : 0,
    add_offset: shift + (reverse ? -size : 0),
    limit: size,
    max_id: options?.maxId ?? 0,
    min_id: options?.minId ?? 0,
    hash: 0n,
  })

  if (answer._ === 'messages.messagesNotModified') {
    return { items: [], total: undefined, next: undefined, peers: new PeerIndex({}) }
  }

  const views = answer.messages.map((value) => new MessageView(value))

  if (reverse) {
    views.sort((a, b) => a.id - b.id)
    const newest = views.at(-1)

    return {
      items: views,
      total: messagesTotal(answer, start === undefined),
      next:
        answer._ === 'messages.messages' || newest === undefined
          ? undefined
          : onward('history', print, { id: newest.id + 1 }, options?.cursor),
      peers: peersOf(answer),
    }
  }

  return {
    items: views,
    total: messagesTotal(answer, start === undefined),
    next: onward('history', print, beforeOldest(answer, views), options?.cursor),
    peers: peersOf(answer),
  }
}

/**
 * One page of the messages in a conversation that match a search.
 *
 * A filtered search returns fewer messages than it was asked for without that
 * meaning the end, so a short page continues; an empty one, or one that would
 * not reach further back, does not.
 */
export async function searchPage(
  client: Paging,
  peer: string | PeerRef,
  query: string,
  options?: PageOptions & SearchFilter,
): Promise<MessagePage> {
  const target = await client.resolve(peer)
  const from = options?.from === undefined ? undefined : await client.resolve(options.from)
  const print = fingerprint({
    peer: identity(target),
    query,
    ...queryOf(options),
    from: from === undefined ? undefined : identity(from),
  })

  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'search', print, (o) => ({ id: int(o, 'id') }))

  checkSignal(options?.signal)

  const answer = await client.api.messages.search({
    peer: target,
    q: query,
    filter: options?.filter ?? { _: 'inputMessagesFilterEmpty' },
    min_date: options?.since ?? 0,
    max_date: options?.until ?? 0,
    offset_id: start?.id ?? options?.startId ?? 0,
    add_offset: start === undefined ? (options?.shift ?? 0) : 0,
    limit: sizeOf(options),
    max_id: options?.maxId ?? 0,
    min_id: options?.minId ?? 0,
    hash: 0n,
    ...(from === undefined ? {} : { from_id: from }),
    ...(options?.topicId === undefined ? {} : { top_msg_id: options.topicId }),
  })

  if (answer._ === 'messages.messagesNotModified') {
    return { items: [], total: undefined, next: undefined, peers: new PeerIndex({}) }
  }

  const views = answer.messages.map((value) => new MessageView(value))

  return {
    items: views,
    total: messagesTotal(answer, start === undefined),
    next: onward('search', print, beforeOldest(answer, views), options?.cursor),
    peers: peersOf(answer),
  }
}

/** Where a list ordered by rate continues: the rate, and the last message's place. */
function afterRate(rate: number | undefined, last: MessageView | undefined) {
  const chat = last?.chat
  if (rate === undefined || last === undefined || chat === undefined) return undefined

  return { rate, peer: chat, id: last.id }
}

/** Read a rate-ordered position out of a cursor. */
const rateShape = (o: Record<string, unknown>) => ({
  rate: int(o, 'rate'),
  peer: ref(o, 'peer'),
  id: int(o, 'id'),
})

/**
 * One page of the messages matching a search across every conversation.
 *
 * Continued by a rate Telegram names, plus the last message's conversation and
 * number. Only an answer that names a rate can be continued; the complete form,
 * or a slice without one, is the end however full it looks.
 */
export async function searchGlobalPage(
  client: Paging,
  query: string,
  options?: PageOptions & GlobalSearchFilter,
): Promise<MessagePage> {
  const print = fingerprint({ query, ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'global-search', print, rateShape)

  checkSignal(options?.signal)

  const answer = await client.api.messages.searchGlobal({
    q: query,
    filter: options?.filter ?? { _: 'inputMessagesFilterEmpty' },
    min_date: options?.since ?? 0,
    max_date: options?.until ?? 0,
    offset_rate: start?.rate ?? 0,
    offset_peer:
      start?.peer === undefined ? { _: 'inputPeerEmpty' } : await client.resolve(start.peer),
    offset_id: start?.id ?? 0,
    limit: sizeOf(options),
    ...(options?.only === 'channels' ? { broadcasts_only: true } : {}),
    ...(options?.only === 'groups' ? { groups_only: true } : {}),
    ...(options?.only === 'users' ? { users_only: true } : {}),
    ...(options?.peerFolder === undefined ? {} : { folder_id: options.peerFolder }),
  })

  if (answer._ === 'messages.messagesNotModified') {
    return { items: [], total: undefined, next: undefined, peers: new PeerIndex({}) }
  }

  const views = answer.messages.map((value) => new MessageView(value))
  const rate = answer._ === 'messages.messagesSlice' ? answer.next_rate : undefined

  return {
    items: views,
    total: messagesTotal(answer, start === undefined),
    next: onward('global-search', print, afterRate(rate, views.at(-1)), options?.cursor),
    peers: peersOf(answer),
  }
}

/** A page of public posts, with how much searching is left. */
export interface PostPage extends MessagePage {
  /**
   * How many free searches remain, and what one more costs, where Telegram said.
   *
   * Searching public posts by text is metered. The answer says where the
   * account stands, and a page that exhausted the free allowance is the one a
   * caller needs this on.
   */
  readonly searchFlood: TypeSearchPostsFlood | undefined
}

/**
 * One page of public posts, by hashtag or by text.
 *
 * The rate may be absent from a page that is not the last: Telegram names one
 * only where it has one, and expects the date of the last post back otherwise.
 * So a missing rate continues from that date, and an empty page is the end.
 */
async function postsPage(
  client: Paging,
  kind: 'hashtag-search' | 'post-search',
  search: { readonly hashtag: string } | { readonly query: string },
  options?: PageOptions & PostSearchFilter,
): Promise<PostPage> {
  const print = fingerprint({ ...search, ...queryOf(options) })
  const start =
    options?.cursor === undefined ? undefined : readCursor(options.cursor, kind, print, rateShape)

  checkSignal(options?.signal)

  const answer = await client.api.channels.searchPosts({
    ...search,
    offset_rate: start?.rate ?? 0,
    offset_peer:
      start?.peer === undefined ? { _: 'inputPeerEmpty' } : await client.resolve(start.peer),
    offset_id: start?.id ?? 0,
    limit: sizeOf(options),
    ...(options?.payStars === undefined ? {} : { allow_paid_stars: options.payStars }),
  })

  if (answer._ === 'messages.messagesNotModified') {
    return {
      items: [],
      total: undefined,
      next: undefined,
      peers: new PeerIndex({}),
      searchFlood: undefined,
    }
  }

  const views = answer.messages.map((value) => new MessageView(value))
  const last = views.at(-1)
  const rate = answer._ === 'messages.messagesSlice' ? (answer.next_rate ?? last?.date) : undefined

  return {
    items: views,
    total: messagesTotal(answer, start === undefined),
    next: onward(kind, print, afterRate(rate, last), options?.cursor),
    peers: peersOf(answer),
    searchFlood: answer._ === 'messages.messagesSlice' ? answer.search_flood : undefined,
  }
}

/** One page of public posts carrying a hashtag. */
export async function hashtagPage(
  client: Paging,
  hashtag: string,
  options?: PageOptions & PostSearchFilter,
): Promise<PostPage> {
  return await postsPage(client, 'hashtag-search', { hashtag }, options)
}

/** One page of public posts matching text, which Telegram meters. */
export async function postSearchPage(
  client: Paging,
  query: string,
  options?: PageOptions & PostSearchFilter,
): Promise<PostPage> {
  return await postsPage(client, 'post-search', { query }, options)
}

/** A page of the accounts that reacted to a message. */
export type ReactionPage = PeeredPage<ReactionView>

/** One page of the accounts that reacted to a message. */
export async function reactionsPage(
  client: Paging,
  peer: string | PeerRef,
  messageId: number,
  options?: PageOptions & ReactionFilter,
): Promise<ReactionPage> {
  const target = await client.resolve(peer)
  const print = fingerprint({ peer: identity(target), messageId, ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'reactions', print, (o) => ({ offset: str(o, 'offset') }))

  checkSignal(options?.signal)

  const answer = await client.api.messages.getMessageReactionsList({
    peer: target,
    id: messageId,
    limit: sizeOf(options),
    ...(start === undefined ? {} : { offset: start.offset }),
    ...(options?.reaction === undefined ? {} : { reaction: options.reaction }),
  })

  return {
    items: answer.reactions.map((value) => new ReactionView(value)),
    total: reported(answer.count),
    next: opaque('reactions', print, answer.next_offset, options?.cursor, {
      items: answer.reactions.length,
      count: answer.count,
    }),
    peers: peersOf(answer),
  }
}

/**
 * The cursor for a list Telegram continues with a string of its own.
 *
 * An absent or empty string is the end: Telegram writes the end of such a list
 * by leaving the field out, and an empty one sent back would start it again.
 */
function opaque(
  kind: string,
  print: string,
  next: string | undefined,
  current: string | undefined,
  empty?: { readonly items: number; readonly count: number | undefined },
) {
  if (next === undefined || next === '') return undefined
  // An empty page whose own answer counts nothing is an empty list, whatever
  // cursor came with it. Any other empty page continues: a list can pause over
  // a stretch the server filtered out.
  if (empty !== undefined && empty.items === 0 && empty.count === 0) return undefined

  return onward(kind, print, { offset: next }, current)
}

/* -------------------------------------------------------------------------- */
/* Members and the administration log                                          */
/* -------------------------------------------------------------------------- */

/** A page of members. */
export type MemberPage = PeeredPage<MemberView>

/**
 * One page of a conversation's members.
 *
 * A channel or supergroup keeps members as a list read by position, and its
 * count is Telegram's. A basic group keeps them in its full description, all at
 * once — so the page is a slice of a list that is already whole, and its total
 * is the length of that whole list, which is exact.
 *
 * Positions in a channel shift when somebody joins or leaves between pages, so
 * an entry can be seen twice or missed. That is a property of reading a live
 * list by position, and no snapshot is claimed.
 */
export async function membersPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & MemberFilter,
): Promise<MemberPage> {
  const target = await client.resolve(peer)
  const print = fingerprint({ peer: identity(target), ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'members', print, (o) => ({ seen: int(o, 'seen') }))
  const size = sizeOf(options)
  const seen = start?.seen ?? 0

  checkSignal(options?.signal)

  if (target._ === 'inputPeerChat') {
    if (options?.filter !== undefined) {
      throw new ValidationError(
        'a basic group has no member filters: its members are listed all at once, without roles to search by',
      )
    }

    const full = await client.api.messages.getFullChat({ chat_id: target.chat_id })
    const participants =
      full.full_chat._ === 'chatFull' && full.full_chat.participants._ === 'chatParticipants'
        ? full.full_chat.participants.participants
        : []
    const slice = participants.slice(seen, seen + size)
    const reached = seen + slice.length

    return {
      items: slice.map((value) => new MemberView(value)),
      total: { count: participants.length, precision: 'exact' },
      next:
        reached < participants.length
          ? onward('members', print, { seen: reached }, options?.cursor)
          : undefined,
      peers: peersOf(full),
    }
  }

  const channel = channelFor(target)
  if (channel === undefined) {
    throw new PeerError('only a group, a supergroup or a channel has members')
  }

  const answer = await client.api.channels.getParticipants({
    channel,
    filter: options?.filter ?? { _: 'channelParticipantsRecent' },
    offset: seen,
    limit: size,
    hash: 0n,
  })

  if (answer._ === 'channels.channelParticipantsNotModified') {
    return { items: [], total: undefined, next: undefined, peers: new PeerIndex({}) }
  }

  return {
    items: answer.participants.map((value) => new MemberView(value)),
    total: reported(answer.count),
    next:
      answer.participants.length === 0
        ? undefined
        : onward('members', print, { seen: seen + answer.participants.length }, options?.cursor),
    peers: peersOf(answer),
  }
}

/** A page of the administration log. */
export type ChatEventPage = PeeredPage<ChatEventView>

/**
 * One page of a channel's administration log, newest first.
 *
 * Telegram gives this list no count, so the total is `undefined`. Positions are
 * 64-bit event identifiers, kept as integers end to end: a large channel's log
 * outgrows what a number holds exactly, and a rounded cursor pages in circles.
 */
export async function chatEventsPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & ChatEventFilter,
): Promise<ChatEventPage> {
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

  const print = fingerprint({
    peer: identity(target),
    ...queryOf(options),
    by: admins.map((one) => (one._ === 'inputUser' ? one.user_id : one._)),
  })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'chat-events', print, (o) => ({ before: big(o, 'before') }))

  checkSignal(options?.signal)

  const answer = await client.api.channels.getAdminLog({
    channel,
    q: options?.query ?? '',
    max_id: start?.before ?? options?.maxId ?? 0n,
    min_id: options?.minId ?? 0n,
    limit: sizeOf(options),
    ...(options?.filter === undefined ? {} : { events_filter: options.filter }),
    ...(admins.length === 0 ? {} : { admins }),
  })

  const events = answer.events.map((value) => new ChatEventView(value))
  const oldest = events.reduce<bigint | undefined>(
    (lowest, event) => (lowest === undefined || event.id < lowest ? event.id : lowest),
    undefined,
  )

  return {
    items: events,
    total: undefined,
    next:
      oldest === undefined
        ? undefined
        : onward('chat-events', print, { before: oldest }, options?.cursor),
    peers: peersOf(answer),
  }
}

/* -------------------------------------------------------------------------- */
/* Invitations                                                                  */
/* -------------------------------------------------------------------------- */

/** A page of invite links. */
export type InviteLinkPage = PeeredPage<InviteLinkView>

/** One page of a conversation's invite links. */
export async function inviteLinksPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & InviteFilter,
): Promise<InviteLinkPage> {
  const target = await client.resolve(peer)
  const creator =
    options?.createdBy === undefined ? undefined : await client.resolve(options.createdBy)
  const admin = creator === undefined ? ({ _: 'inputUserSelf' } as const) : userFor(creator)

  if (admin === undefined) {
    throw new PeerError('an invite link is created by a user, not by a conversation')
  }

  const print = fingerprint({
    peer: identity(target),
    ...queryOf(options),
    createdBy: creator === undefined ? undefined : identity(creator),
  })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'invite-links', print, (o) => ({
          date: int(o, 'date'),
          link: str(o, 'link'),
        }))

  checkSignal(options?.signal)

  const answer = await client.api.messages.getExportedChatInvites({
    peer: target,
    admin_id: admin,
    limit: sizeOf(options),
    ...(options?.revoked === true ? { revoked: true } : {}),
    ...(start === undefined ? {} : { offset_date: start.date, offset_link: start.link }),
  })

  const links = answer.invites.map((value) => new InviteLinkView(value))
  // Only an entry that is a link carries a date and a link to continue from.
  const last = links.at(-1)
  const position =
    last?.date === undefined || last.link === undefined
      ? undefined
      : { date: last.date, link: last.link }

  return {
    items: links,
    total: reported(answer.count),
    next: onward('invite-links', print, position, options?.cursor),
    peers: peersOf(answer),
  }
}

/** A page of the accounts that came through invite links. */
export type InviteMemberPage = PeeredPage<InviteImporterView>

/**
 * One page of the accounts that joined, or asked to join, through invite links.
 *
 * Continued by the date and the user of the last entry. The user is kept in the
 * cursor as a reference and resolved through the account reading the next page
 * — which has met them, because this page described them.
 */
export async function inviteMembersPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & ImporterFilter,
): Promise<InviteMemberPage> {
  const target = await client.resolve(peer)
  const pending = options?.pending === true || options?.query !== undefined
  const print = fingerprint({ peer: identity(target), ...queryOf(options), pending })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'invite-members', print, (o) => ({
          date: int(o, 'date'),
          user: big(o, 'user'),
        }))

  let offsetUser: TypeInputUser = { _: 'inputUserEmpty' }
  if (start !== undefined) {
    // Named through the account, which met this user in the page that produced
    // the cursor. One that cannot name them cannot continue, and says so rather
    // than ending the list early as though it were complete.
    const named = userFor(await client.resolve({ kind: 'user', id: start.user }))
    // Checked as well as looked up: continuing from somebody other than the
    // user the cursor names would read a different stretch of the list.
    if (named === undefined || named._ !== 'inputUser' || named.user_id !== start.user) {
      throw new PeerError(`the account cannot name user ${start.user} to continue this list from`)
    }

    offsetUser = named
  }

  checkSignal(options?.signal)

  const answer = await client.api.messages.getChatInviteImporters({
    peer: target,
    offset_date: start?.date ?? 0,
    offset_user: offsetUser,
    limit: sizeOf(options),
    ...(pending ? { requested: true } : {}),
    ...(options?.link === undefined ? {} : { link: options.link }),
    ...(options?.query === undefined ? {} : { q: options.query }),
  })

  const members = answer.importers.map((value) => new InviteImporterView(value))
  const last = members.at(-1)

  return {
    items: members,
    total: reported(answer.count),
    next:
      last === undefined
        ? undefined
        : onward('invite-members', print, { date: last.date, user: last.userId }, options?.cursor),
    peers: peersOf(answer),
  }
}

/* -------------------------------------------------------------------------- */
/* People and their media                                                      */
/* -------------------------------------------------------------------------- */

/** A page of profile photos. */
export type PhotoPage = PeeredPage<Photo>

/**
 * One page of somebody's profile photos, newest first.
 *
 * A photo the account may not see arrives as the empty form and is left out of
 * `items` — but it still occupies a position in Telegram's list, so the next
 * position counts it. The complete form on a first request is the whole list,
 * counted exactly by what Telegram sent, including those empty entries.
 */
export async function profilePhotosPage(
  client: Paging,
  user: string | PeerRef,
  options?: PageOptions,
): Promise<PhotoPage> {
  const target = await client.resolve(user)
  const person = userFor(target)
  if (person === undefined) throw new PeerError('only a user has a list of profile photos')

  const print = fingerprint({ peer: identity(target) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'profile-photos', print, (o) => ({ seen: int(o, 'seen') }))
  const seen = start?.seen ?? 0

  checkSignal(options?.signal)

  const answer = await client.api.photos.getUserPhotos({
    user_id: person,
    offset: seen,
    max_id: 0n,
    limit: sizeOf(options),
  })

  const photos = answer.photos.filter((value): value is Photo => value._ === 'photo')
  const complete = answer._ === 'photos.photos'

  return {
    items: photos,
    total:
      answer._ === 'photos.photosSlice'
        ? reported(answer.count)
        : start === undefined
          ? { count: answer.photos.length, precision: 'exact' }
          : undefined,
    next:
      complete || answer.photos.length === 0
        ? undefined
        : onward('profile-photos', print, { seen: seen + answer.photos.length }, options?.cursor),
    peers: peersOf(answer),
  }
}

/** A page of the music on somebody's profile. */
export type MusicPage = PageOf<TypeDocument>

/**
 * One page of the music somebody has put on their profile.
 *
 * Continued by position. Telegram answers "not modified" only against a hash
 * the request sent, and none is sent, so that answer is an empty list.
 */
export async function savedMusicPage(
  client: Paging,
  user: string | PeerRef,
  options?: PageOptions,
): Promise<MusicPage> {
  const target = await client.resolve(user)
  const person = userFor(target)
  if (person === undefined) throw new PeerError('only a user keeps music on a profile')

  const print = fingerprint({ peer: identity(target) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'saved-music', print, (o) => ({ seen: int(o, 'seen') }))
  const seen = start?.seen ?? 0

  checkSignal(options?.signal)

  const answer = await client.api.users.getSavedMusic({
    id: person,
    offset: seen,
    limit: sizeOf(options),
    hash: 0n,
  })

  if (answer._ === 'users.savedMusicNotModified') {
    return { items: [], total: undefined, next: undefined }
  }

  const reached = seen + answer.documents.length

  return {
    items: [...answer.documents],
    total: reported(answer.count),
    next:
      answer.documents.length === 0 || reached >= answer.count
        ? undefined
        : onward('saved-music', print, { seen: reached }, options?.cursor),
  }
}

/** Channels like one, with how many Telegram would recommend. */
export type SimilarChannelsPage = PageOf<ChatView>

/**
 * The channels Telegram recommends alongside one, with the count it gave.
 *
 * One page, always: the request takes no position. A premium account may be
 * shown more of the list than one without, and the count is the length of the
 * list the account could see — which is why it is reported rather than taken
 * from the items.
 */
export async function similarChannelsPage(
  client: Paging,
  chat: string | PeerRef,
  options?: Pick<PageOptions, 'signal'>,
): Promise<SimilarChannelsPage> {
  const channel = channelFor(await client.resolve(chat))
  if (channel === undefined) {
    throw new PeerError('finding similar channels is only possible for a channel or supergroup')
  }

  checkSignal(options?.signal)

  const answer = await client.api.channels.getChannelRecommendations({ channel })
  const items = answer.chats.map((one) => new ChatView(one))

  return {
    items,
    total:
      answer._ === 'messages.chatsSlice'
        ? reported(answer.count)
        : { count: answer.chats.length, precision: 'exact' },
    next: undefined,
  }
}

/* -------------------------------------------------------------------------- */
/* Forums and stories                                                          */
/* -------------------------------------------------------------------------- */

/** A page of forum topics, with how the forum orders them. */
export interface TopicPage extends PeeredPage<ForumTopicView> {
  /** Whether topics are ordered by when they were made rather than by activity. */
  readonly orderedByCreation: boolean
  /** The forum's position in its update sequence as of this answer. */
  readonly pts: number
}

/**
 * One page of a forum's topics.
 *
 * Continued by three fields that have to agree: the date, the message number and
 * the topic number of the last topic. Which date depends on the forum's order —
 * a topic's own for a forum ordered by creation, its newest message's otherwise
 * — and that message is in the same answer, so nothing extra is fetched.
 */
export async function forumTopicsPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & TopicFilter,
): Promise<TopicPage> {
  const target = await client.resolve(peer)
  const print = fingerprint({ peer: identity(target), ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'forum-topics', print, (o) => ({
          date: int(o, 'date'),
          id: int(o, 'id'),
          topic: int(o, 'topic'),
        }))

  checkSignal(options?.signal)

  const answer = await client.api.messages.getForumTopics({
    peer: target,
    offset_date: start?.date ?? 0,
    offset_id: start?.id ?? 0,
    offset_topic: start?.topic ?? 0,
    limit: sizeOf(options),
    ...(options?.query === undefined ? {} : { q: options.query }),
  })

  const topics = answer.topics.map((value) => new ForumTopicView(value))
  const last = topics.at(-1)?.raw
  let position: object | undefined

  if (last !== undefined && last._ === 'forumTopic') {
    const ordered = answer.order_by_create_date === true
    const newest = answer.messages.find(
      (message) => message._ !== 'messageEmpty' && message.id === last.top_message,
    )
    const date =
      ordered || newest === undefined || newest._ === 'messageEmpty' ? last.date : newest.date

    position = { date, id: last.top_message, topic: last.id }
  }

  return {
    items: topics,
    total: reported(answer.count),
    next: onward('forum-topics', print, position, options?.cursor),
    peers: peersOf(answer),
    orderedByCreation: answer.order_by_create_date === true,
    pts: answer.pts,
  }
}

/** A page of the stories on a profile, with which of them are pinned to the top. */
export interface ProfileStoriesPage extends PeeredPage<StoryView> {
  /** The numbers of the stories pinned above the rest, where there are any. */
  readonly pinnedToTop: readonly number[]
}

/** One page of the stories on somebody's profile, or of this account's archive. */
export async function profileStoriesPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & StoryFilter,
): Promise<ProfileStoriesPage> {
  const target = await client.resolve(peer)
  const print = fingerprint({ peer: identity(target), ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'profile-stories', print, (o) => ({ before: int(o, 'before') }))

  checkSignal(options?.signal)

  const request = { peer: target, offset_id: start?.before ?? 0, limit: sizeOf(options) }
  const answer =
    options?.archived === true
      ? await client.api.stories.getStoriesArchive(request)
      : await client.api.stories.getPinnedStories(request)

  const stories = answer.stories.map((value) => new StoryView(value))
  const oldest = stories.length === 0 ? undefined : Math.min(...stories.map((story) => story.id))

  return {
    items: stories,
    total: reported(answer.count),
    next:
      oldest === undefined
        ? undefined
        : onward('profile-stories', print, { before: oldest }, options?.cursor),
    peers: peersOf(answer),
    pinnedToTop: [...(answer.pinned_to_top ?? [])],
  }
}

/** A page of the stories of the accounts this one follows. */
export interface AllStoriesPage extends PeeredPage<PeerStoriesView> {
  /**
   * Whether this account's story views are currently hidden, and until when.
   *
   * Part of every answer to this request rather than a separate read.
   */
  readonly stealthMode: TypeStoriesStealthMode
}

/**
 * One page of the stories of the accounts this one follows, one account per item.
 *
 * Telegram decides how much a page holds; there is no size to ask for. The end
 * is the answer saying there is no more rather than the absence of a state — a
 * last page carries a state too, and continuing from it would start over.
 */
export async function allStoriesPage(
  client: Paging,
  options?: Omit<PageOptions, 'size'> & AllStoriesFilter,
): Promise<AllStoriesPage> {
  const print = fingerprint(queryOf(options))
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'all-stories', print, (o) => ({ state: str(o, 'state') }))

  checkSignal(options?.signal)

  const answer = await client.api.stories.getAllStories({
    ...(start === undefined ? {} : { state: start.state, next: true }),
    ...(options?.archived === true ? { hidden: true } : {}),
  })

  if (answer._ === 'stories.allStoriesNotModified') {
    return {
      items: [],
      total: undefined,
      next: undefined,
      peers: new PeerIndex({}),
      stealthMode: answer.stealth_mode,
    }
  }

  return {
    items: answer.peer_stories.map((value) => new PeerStoriesView(value)),
    total: reported(answer.count),
    next:
      answer.has_more === true
        ? onward('all-stories', print, { state: answer.state }, options?.cursor)
        : undefined,
    peers: peersOf(answer),
    stealthMode: answer.stealth_mode,
  }
}

/** A page of the accounts that saw a story, with the story's counters. */
export interface StoryViewerPage extends PeeredPage<StoryViewerView> {
  /** How many views, forwards and reactions the story has had altogether. */
  readonly counts: { readonly views: number; readonly forwards: number; readonly reactions: number }
}

/** One page of the accounts that have seen a story of this account's. */
export async function storyViewersPage(
  client: Paging,
  peer: string | PeerRef,
  storyId: number,
  options?: PageOptions & ViewerFilter,
): Promise<StoryViewerPage> {
  const target = await client.resolve(peer)
  const print = fingerprint({ peer: identity(target), storyId, ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'story-viewers', print, (o) => ({ offset: str(o, 'offset') }))

  if (options?.reactionsFirst === true && options.forwardsFirst === true) {
    throw new ValidationError('a viewer list is ordered by reactions or by forwards, not both')
  }

  checkSignal(options?.signal)

  const answer = await client.api.stories.getStoryViewsList({
    peer: target,
    id: storyId,
    offset: start?.offset ?? '',
    limit: sizeOf(options),
    ...(options?.contactsOnly === true ? { just_contacts: true } : {}),
    ...(options?.reactionsFirst === true ? { reactions_first: true } : {}),
    ...(options?.forwardsFirst === true ? { forwards_first: true } : {}),
    ...(options?.query === undefined ? {} : { q: options.query }),
  })

  return {
    items: answer.views.map((value) => new StoryViewerView(value)),
    total: reported(answer.count),
    next: opaque('story-viewers', print, answer.next_offset, options?.cursor, {
      items: answer.views.length,
      count: answer.count,
    }),
    peers: peersOf(answer),
    counts: {
      views: answer.views_count,
      forwards: answer.forwards_count,
      reactions: answer.reactions_count,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Boosts, stars and gifts                                                     */
/* -------------------------------------------------------------------------- */

/** A page of a channel's boosts. */
export type BoostPage = PeeredPage<Boost>

/** One page of the boosts a channel has been given. */
export async function boostsPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & BoostFilter,
): Promise<BoostPage> {
  const target = await client.resolve(peer)
  const print = fingerprint({ peer: identity(target), ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'boosts', print, (o) => ({ offset: str(o, 'offset') }))

  checkSignal(options?.signal)

  const answer = await client.api.premium.getBoostsList({
    peer: target,
    offset: start?.offset ?? '',
    limit: sizeOf(options),
    ...(options?.giftsOnly === true ? { gifts: true } : {}),
  })

  return {
    items: [...answer.boosts],
    total: reported(answer.count),
    next: opaque('boosts', print, answer.next_offset, options?.cursor, {
      items: answer.boosts.length,
      count: answer.count,
    }),
    peers: peersOf(answer),
  }
}

/** A page of star transactions, with the balance as of this answer. */
export interface StarsPage extends PeeredPage<StarsTransaction> {
  /** The balance when this page was read. The same answer carries it. */
  readonly balance: TypeStarsAmount
}

/**
 * One page of an account's star transactions, or TON ones.
 *
 * Telegram gives this list no count, so the total is `undefined`; the balance is
 * what the answer has instead.
 */
export async function starsTransactionsPage(
  client: Paging,
  peer: string | PeerRef,
  options?: PageOptions & StarsFilter,
): Promise<StarsPage> {
  const target = await client.resolve(peer)
  const print = fingerprint({ peer: identity(target), ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'stars-transactions', print, (o) => ({
          offset: str(o, 'offset'),
        }))

  checkSignal(options?.signal)

  const answer = await client.api.payments.getStarsTransactions({
    peer: target,
    offset: start?.offset ?? '',
    limit: sizeOf(options),
    ...(options?.direction === 'incoming' ? { inbound: true } : {}),
    ...(options?.direction === 'outgoing' ? { outbound: true } : {}),
    ...(options?.ascending === true ? { ascending: true } : {}),
    ...(options?.ton === true ? { ton: true } : {}),
    ...(options?.subscriptionId === undefined ? {} : { subscription_id: options.subscriptionId }),
  })

  return {
    items: [...(answer.history ?? [])],
    total: undefined,
    // An answer with no history field is a status rather than a page of
    // transactions, and there is nothing in it to continue.
    next:
      answer.history === undefined
        ? undefined
        : opaque('stars-transactions', print, answer.next_offset, options?.cursor),
    peers: peersOf(answer),
    balance: answer.balance,
  }
}

/** A page of the gifts somebody keeps. */
export interface GiftPage extends PeeredPage<SavedStarGift> {
  /**
   * Whether this account is notified of gifts to the channel, where the answer
   * said — which it does only for a channel this account manages.
   */
  readonly notificationsEnabled: boolean | undefined
}

/** One page of the gifts an account or channel is keeping. */
export async function savedGiftsPage(
  client: Paging,
  owner: string | PeerRef,
  options?: PageOptions & GiftFilter,
): Promise<GiftPage> {
  const target = await client.resolve(owner)
  const print = fingerprint({ peer: identity(target), ...queryOf(options) })
  const start =
    options?.cursor === undefined
      ? undefined
      : readCursor(options.cursor, 'saved-gifts', print, (o) => ({ offset: str(o, 'offset') }))

  checkSignal(options?.signal)

  const flag = (on: boolean | undefined, name: string) =>
    on === true ? { [name]: true as const } : {}
  const answer = await client.api.payments.getSavedStarGifts({
    peer: target,
    offset: start?.offset ?? '',
    limit: sizeOf(options),
    ...flag(options?.excludeUnsaved, 'exclude_unsaved'),
    ...flag(options?.excludeSaved, 'exclude_saved'),
    ...flag(options?.excludeUnlimited, 'exclude_unlimited'),
    ...flag(options?.excludeUnique, 'exclude_unique'),
    ...flag(options?.excludeUpgradable, 'exclude_upgradable'),
    ...flag(options?.excludeUnupgradable, 'exclude_unupgradable'),
    ...flag(options?.excludeHosted, 'exclude_hosted'),
    ...flag(options?.peerColorAvailable, 'peer_color_available'),
    ...flag(options?.byValue, 'sort_by_value'),
    ...(options?.collectionId === undefined ? {} : { collection_id: options.collectionId }),
  })

  return {
    items: [...answer.gifts],
    total: reported(answer.count),
    next: opaque('saved-gifts', print, answer.next_offset, options?.cursor, {
      items: answer.gifts.length,
      count: answer.count,
    }),
    peers: peersOf(answer),
    notificationsEnabled: answer.chat_notifications_enabled,
  }
}
