/**
 * Reading who peers are in bulk, and finding ones an account has not named yet.
 *
 * Resolving a peer answers *how to address it* — an identifier and an access
 * hash. That is not the same as knowing anything about it, and the two are
 * separate steps because they have different costs and different failures.
 * This module is the second: given peers an account can address, read the
 * records that describe them.
 *
 * **Several at once is one request per family, not one per peer.** Telegram has
 * three bulk reads and they do not mix — people through `users.getUsers`, basic
 * groups through `messages.getChats`, channels and supergroups through
 * `channels.getChannels`. So a mixed list is sorted into three, each family is
 * asked in pages, and the answers are put back where they came from.
 *
 * ```
 *   ['@a', ref, '@c', …]  ──> resolve ──┬─> users.getUsers       ┐
 *                                       ├─> messages.getChats    ├─> in order
 *                                       └─> channels.getChannels ┘
 * ```
 *
 * **Positional, with a gap.** A peer that cannot be named and one Telegram
 * declines to describe are both `undefined` at that index, so the answer lines
 * up with what was asked for. The alternative — dropping the misses — loses
 * which ones they were, and a caller with twelve names and eleven answers has
 * nowhere to look it up.
 *
 * **Finding is a search, not a lookup.** {@link findDialogs} takes things an
 * account might not be able to address at all and looks for them in the
 * conversation list. That is a walk over the network rather than a read from a
 * cache: whatever *can* be addressed is asked about directly in one request,
 * and only what is left drives the walk, which stops the moment the last one
 * turns up.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { DialogView } from '../entities/dialog.js'
import { ChatView, UserView } from '../entities/peer.js'
import type {
  TypeChat,
  TypeInputChannel,
  TypeInputPeer,
  TypeUser,
} from '../generated/api/types/index.js'
import { channelFor, userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { PeerStore } from '../storage/peers.js'
import type { Chatting } from './common.js'
import { kindOf } from './common.js'
import type { Folder } from './folders.js'

/**
 * How many peers of one family travel in a single request.
 *
 * Telegram accepts more for some of them, and asking for more is not obviously
 * better: the answers carry whole records, so a request big enough to matter is
 * one big enough to be worth retrying in pieces when it fails. Fifty is inside
 * every one of the three limits, so all three use it and none has a number of
 * its own to remember.
 */
const AT_ONCE = 50

/** What reading peers needs beyond what operating on a conversation needs. */
export interface PeerReading extends Chatting {
  /** Where peers already encountered are written down. */
  readonly peers: PeerStore
  /** Address several peers at once, leaving a gap where one cannot be named. */
  resolveMany(peers: readonly (string | PeerRef)[]): Promise<(TypeInputPeer | undefined)[]>
  /** Walk this account's conversation list, most recent first. */
  dialogs(): AsyncGenerator<DialogView, void, undefined>
}

/** A person or a conversation, as whichever one it turned out to be. */
export type PeerView = UserView | ChatView

/** One request, and where in the answer it belongs. */
interface Wanted {
  readonly at: number
  readonly input: TypeInputPeer
}

/**
 * Read who several peers are, in as few requests as the families allow.
 *
 * ```ts
 * const [me, channel, stranger] = await fetchPeers(account, ['me', '@news', ref])
 * ```
 *
 * Positional: entry `n` of the answer describes peer `n` of the request, and is
 * `undefined` where that peer could not be named or Telegram would not describe
 * it. A peer asked for twice costs one lookup.
 */
export async function fetchPeers(
  client: PeerReading,
  peers: readonly (string | PeerRef)[],
): Promise<(PeerView | undefined)[]> {
  if (peers.length === 0) return []

  const addressed = await client.resolveMany(peers)
  const answers: (PeerView | undefined)[] = Array.from({ length: peers.length })

  const people: Wanted[] = []
  const groups: Wanted[] = []
  const channels: Wanted[] = []

  for (let at = 0; at < addressed.length; at += 1) {
    const input = addressed[at]
    if (input === undefined) continue

    const kind = kindOf(input)
    const bucket = kind === 'user' ? people : kind === 'group' ? groups : channels
    bucket.push({ at, input })
  }

  // The three families are independent requests, so they travel together.
  await Promise.all([
    fillUsers(client, people, answers),
    fillGroups(client, groups, answers),
    fillChannels(client, channels, answers),
  ])

  return answers
}

/**
 * Read who one peer is.
 *
 * ```ts
 * const who = await fetchPeer(account, '@someone')
 * if (who instanceof UserView) console.log(who.firstName)
 * ```
 *
 * A person comes back as a {@link UserView} and a conversation as a
 * {@link ChatView}, because they are different things that Telegram describes
 * with different records. Refused by name when the peer cannot be addressed or
 * Telegram will not describe it: answering `undefined` for a single read would
 * only move the same question one line down.
 */
export async function fetchPeer(client: PeerReading, peer: string | PeerRef): Promise<PeerView> {
  const [found] = await fetchPeers(client, [peer])

  if (found === undefined) throw new PeerError(`nothing was found for ${describe(peer)}`)

  return found
}

/**
 * Read who one person is.
 *
 * ```ts
 * const who = await fetchUser(account, '@someone')
 * console.log(who.firstName)
 * ```
 *
 * {@link fetchPeer} narrowed to people, so the answer is a {@link UserView}
 * without the caller testing which kind came back. A peer naming a conversation
 * is refused rather than described — a caller who asked for a person and was
 * handed a channel would find out somewhere less convenient.
 */
export async function fetchUser(client: PeerReading, peer: string | PeerRef): Promise<UserView> {
  const found = await fetchPeer(client, peer)

  if (!(found instanceof UserView)) {
    throw new PeerError(`${describe(peer)} names a conversation rather than a person`)
  }

  return found
}

/** Read the people, in pages, and put them back where they were asked for. */
async function fillUsers(
  client: PeerReading,
  wanted: readonly Wanted[],
  answers: (PeerView | undefined)[],
): Promise<void> {
  for (const page of pages(wanted)) {
    const id: ReturnType<typeof userFor>[] = []
    for (const one of page) id.push(userFor(one.input))

    const named = id.filter((one) => one !== undefined)
    if (named.length === 0) continue

    const answer = await client.api.users.getUsers({ id: named })
    const found = new Map<bigint, TypeUser>()
    // A user Telegram will not describe comes back as `userEmpty`, which names
    // the identifier and nothing else. Treated as absent rather than as a
    // record, so the gap in the answer says what actually happened.
    for (const user of answer) if (user._ === 'user') found.set(user.id, user)

    for (const one of page) {
      const record = found.get(identityOf(one.input))
      if (record !== undefined) answers[one.at] = new UserView(record)
    }
  }
}

/** Read the basic groups. They are addressed by a bare number. */
async function fillGroups(
  client: PeerReading,
  wanted: readonly Wanted[],
  answers: (PeerView | undefined)[],
): Promise<void> {
  for (const page of pages(wanted)) {
    const id: bigint[] = []
    for (const one of page) if (one.input._ === 'inputPeerChat') id.push(one.input.chat_id)
    if (id.length === 0) continue

    const answer = await client.api.messages.getChats({ id })
    place(page, answer.chats, answers)
  }
}

/** Read the channels and supergroups. */
async function fillChannels(
  client: PeerReading,
  wanted: readonly Wanted[],
  answers: (PeerView | undefined)[],
): Promise<void> {
  for (const page of pages(wanted)) {
    const id: TypeInputChannel[] = []
    for (const one of page) {
      const named = channelFor(one.input)
      if (named !== undefined) id.push(named)
    }
    if (id.length === 0) continue

    const answer = await client.api.channels.getChannels({ id })
    place(page, answer.chats, answers)
  }
}

/** Match conversation records back to the requests that asked for them. */
function place(
  page: readonly Wanted[],
  chats: readonly TypeChat[],
  answers: (PeerView | undefined)[],
): void {
  const found = new Map<bigint, TypeChat>()
  // `chatEmpty` is the conversation equivalent of `userEmpty` and is left out
  // for the same reason.
  for (const chat of chats) if (chat._ !== 'chatEmpty') found.set(chat.id, chat)

  for (const one of page) {
    const record = found.get(identityOf(one.input))
    if (record !== undefined) answers[one.at] = new ChatView(record)
  }
}

/** The bare number inside a resolved peer, whichever kind it is. */
function identityOf(peer: TypeInputPeer): bigint {
  switch (peer._) {
    case 'inputPeerUser':
    case 'inputPeerUserFromMessage':
      return peer.user_id
    case 'inputPeerChat':
      return peer.chat_id
    case 'inputPeerChannel':
    case 'inputPeerChannelFromMessage':
      return peer.channel_id
    default:
      // `inputPeerSelf` and `inputPeerEmpty`, neither of which reaches here:
      // resolving turns the first into a numbered peer and refuses the second.
      return 0n
  }
}

/** Cut a list into requests of the size the protocol accepts. */
function* pages<T>(all: readonly T[]): Generator<readonly T[], void, undefined> {
  for (let from = 0; from < all.length; from += AT_ONCE) {
    yield all.slice(from, from + AT_ONCE)
  }
}

/** Name a peer in a message, without assuming it has a name. */
function describe(peer: string | PeerRef): string {
  return typeof peer === 'string' ? `'${peer}'` : `the ${peer.kind} ${peer.id}`
}

/**
 * Find the conversation-list rows for peers, including ones not yet known.
 *
 * ```ts
 * const [work, news] = await findDialogs(account, ['@work', ref])
 * ```
 *
 * Two ways of finding, in that order. Peers this account can already address
 * are asked about directly, which is one request for all of them together.
 * Whatever is left — a reference never seen, a name that resolves to nothing —
 * is looked for by walking the conversation list, and the walk stops as soon as
 * the last one turns up rather than reading to the end.
 *
 * The walk matches on identifier and on username both, and the username comes
 * from what the walk itself wrote down: a page of the list carries the peers
 * its rows point at, and those are harvested on the way past. So finding by
 * name costs no extra request.
 *
 * Refused by name if any is still missing at the end, because a row absent from
 * the list is a conversation this account does not have.
 */
export async function findDialogs(
  client: PeerReading,
  peers: readonly (string | PeerRef)[],
): Promise<DialogView[]> {
  if (peers.length === 0) return []

  const found: (DialogView | undefined)[] = Array.from({ length: peers.length })
  const search = await sortForSearch(client, peers)

  await askDirectly(client, search.known, found)
  await searchTheList(client, search, found)

  const missing = found
    .map((row, at) => (row === undefined ? describe(peers[at] as string | PeerRef) : undefined))
    .filter((one) => one !== undefined)

  if (missing.length > 0) {
    throw new PeerError(
      `no conversation in this account's list matches ${missing.join(', ')}. A row that is ` +
        'not in the list is a conversation this account does not have.',
    )
  }

  return found as DialogView[]
}

/** What is being looked for, split by how it can be looked for. */
interface Search {
  /** Peers that can be addressed, so can simply be asked about. */
  readonly known: Wanted[]
  /** References that cannot, to be matched against the list by identifier. */
  readonly byId: Map<bigint, number[]>
  /** Names that resolved to nothing, to be matched against the list by name. */
  readonly byName: Map<string, number[]>
}

/** Decide, for each peer asked about, which of the two ways can find it. */
async function sortForSearch(
  client: PeerReading,
  peers: readonly (string | PeerRef)[],
): Promise<Search> {
  const addressed = await client.resolveMany(peers)
  const search: Search = { known: [], byId: new Map(), byName: new Map() }

  for (let at = 0; at < peers.length; at += 1) {
    const input = addressed[at]

    if (input !== undefined) {
      search.known.push({ at, input })
      continue
    }

    const asked = peers[at] as string | PeerRef
    if (typeof asked === 'string') collect(search.byName, bareName(asked), at)
    else collect(search.byId, asked.id, at)
  }

  return search
}

/** Ask about every peer that can be addressed, in one request. */
async function askDirectly(
  client: PeerReading,
  known: readonly Wanted[],
  found: (DialogView | undefined)[],
): Promise<void> {
  if (known.length === 0) return

  const answer = await client.api.messages.getPeerDialogs({
    peers: known.map((one) => ({ _: 'inputDialogPeer' as const, peer: one.input })),
  })

  // Positional: the answer's rows line up with the peers that were sent, and a
  // peer with no row is one this account has no conversation with.
  for (let at = 0; at < known.length; at += 1) {
    const row = answer.dialogs[at]
    const place = known[at]
    if (row !== undefined && place !== undefined) found[place.at] = new DialogView(row)
  }
}

/**
 * Walk the conversation list for whatever could not be asked about directly.
 *
 * Stops the moment the last one is found rather than reading to the end, which
 * is what keeps this from being a full download for a single missing row.
 */
async function searchTheList(
  client: PeerReading,
  search: Search,
  found: (DialogView | undefined)[],
): Promise<void> {
  let outstanding = count(search.byId) + count(search.byName)
  if (outstanding === 0) return

  for await (const dialog of client.dialogs()) {
    const peer = dialog.peer
    if (peer === undefined) continue

    outstanding -= take(search.byId, peer.id, dialog, found)
    if (outstanding === 0) return

    // A name is only worth comparing for a conversation that has one, and the
    // walk has already written down who its rows point at \u2014 so this is a read
    // from the peer store rather than a request.
    if (search.byName.size > 0) {
      const record = await client.peers.byId(peer.kind, peer.id)
      for (const name of record?.usernames ?? []) {
        outstanding -= take(search.byName, name, dialog, found)
      }
      if (outstanding === 0) return
    }
  }
}

/** Note that position `at` is waiting on `key`. */
function collect<K>(into: Map<K, number[]>, key: K, at: number): void {
  const existing = into.get(key)
  if (existing === undefined) into.set(key, [at])
  else existing.push(at)
}

/** How many positions a map is still waiting on. */
function count<K>(waiting: Map<K, number[]>): number {
  let total = 0
  for (const places of waiting.values()) total += places.length

  return total
}

/** Give a found row to everything waiting on a key, and say how many that was. */
function take<K>(
  waiting: Map<K, number[]>,
  key: K,
  dialog: DialogView,
  found: (DialogView | undefined)[],
): number {
  const places = waiting.get(key)
  if (places === undefined) return 0

  for (const at of places) found[at] = dialog
  waiting.delete(key)

  return places.length
}

/** A username without its decoration, as the peer store writes them down. */
function bareName(asked: string): string {
  return asked.trim().replace(/^@/, '').toLowerCase()
}

/** What a folder is looked for by. At least one of these has to be given. */
export interface FolderQuery {
  /** The number identifying it. */
  readonly id?: number
  /** Its exact name. */
  readonly title?: string
  /** The emoji shown beside it. */
  readonly emoji?: string
}

/**
 * Find one of this account's folders by what it is called or numbered.
 *
 * ```ts
 * const work = await findFolder(account, { title: 'Work' })
 * ```
 *
 * Every criterion given has to match. Answers `undefined` where none does,
 * rather than refusing — "is there one called this" is a question whose answer
 * can legitimately be no.
 *
 * Asking with nothing to match on *is* refused, because it would otherwise
 * answer with whichever folder happens to come first and look like it worked.
 */
export async function findFolder(
  client: Chatting,
  query: FolderQuery,
): Promise<Folder | undefined> {
  if (query.id === undefined && query.title === undefined && query.emoji === undefined) {
    throw new ValidationError(
      'finding a folder needs something to find it by: an id, a title or an emoji',
    )
  }

  const { readFolders } = await import('./folders.js')

  return (await readFolders(client)).find((folder) => {
    if (query.id !== undefined && folder.id !== query.id) return false
    if (query.title !== undefined && folder.title !== query.title) return false
    if (query.emoji !== undefined && emojiOf(folder) !== query.emoji) return false

    return true
  })
}

/** The emoji a folder is shown with, where it has one. */
function emojiOf(folder: Folder): string | undefined {
  return folder.raw._ === 'dialogFilterDefault' ? undefined : folder.raw.emoticon
}
