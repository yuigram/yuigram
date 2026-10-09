// SPDX-License-Identifier: MPL-2.0

/**
 * How an account arranges its conversation list.
 *
 * Folders, the archive, the unread mark and the draft a conversation is holding
 * — everything that is this account's own view of its list rather than anything
 * the other side can see.
 *
 * ```
 *   folders       ──> messages.getDialogFilters   the whole set, ordered
 *   archive       ──> folders.editPeerFolders     folder 1 is the archive
 *   unread mark   ──> messages.markDialogUnread   a flag, not a message count
 *   draft         ──> messages.saveDraft          text kept per conversation
 * ```
 *
 * **Folders are replaced, not patched.** `messages.updateDialogFilter` takes the
 * whole folder, so changing one field means sending all of them — which is why
 * {@link editFolder} reads the current set first. A caller that built a folder
 * from nothing and sent it would silently drop whatever it did not mention.
 *
 * **The archive is a folder with a fixed number.** Telegram reserves 1 for it,
 * and moving a conversation in or out is the same call with 1 or 0. That is why
 * archiving is here rather than beside the other per-conversation settings.
 */

import { ValidationError } from '@yuigram/core'
import type {
  TypeDialogFilter,
  TypeInputPeer,
  TypeMessageEntity,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { Chatting } from './common.js'
import { applyUpdates } from './common.js'

/** The folder number Telegram reserves for the archive. */
const ARCHIVE = 1

/** The main list, which is the absence of a folder rather than a folder. */
const MAIN = 0

/** One folder, as this account arranged it. */
export interface Folder {
  /** The number identifying it. Chosen by the client that made it. */
  readonly id: number
  /** What it is called. */
  readonly title: string
  /** Whether this is the one Telegram keeps for the archive. */
  readonly isArchive: boolean
  /** Conversations always in it, in the order they were pinned. */
  readonly pinned: TypeInputPeer[]
  /** Conversations always in it. */
  readonly included: TypeInputPeer[]
  /** Conversations never in it, whatever the rules say. */
  readonly excluded: TypeInputPeer[]
  /** The folder as the schema describes it, for a field this does not name. */
  readonly raw: TypeDialogFilter
}

/**
 * Every folder this account has, in the order they are shown.
 *
 * ```ts
 * for (const folder of await readFolders(account)) console.log(folder.title)
 * ```
 *
 * The default folder — the one holding everything not in another — is part of
 * the answer and has no rules of its own, which is how Telegram represents
 * "all chats" sitting among the rest.
 */
export async function readFolders(client: Chatting): Promise<Folder[]> {
  const answer = await client.api.messages.getDialogFilters()

  return answer.filters.map((filter) => readFolder(filter))
}

/** Read one folder into the shape a caller works with. */
function readFolder(filter: TypeDialogFilter): Folder {
  if (filter._ === 'dialogFilterDefault') {
    return {
      id: MAIN,
      title: '',
      isArchive: false,
      pinned: [],
      included: [],
      excluded: [],
      raw: filter,
    }
  }

  const title = filter.title
  const excluded = filter._ === 'dialogFilterChatlist' ? [] : [...filter.exclude_peers]

  return {
    id: filter.id,
    // Newer schemas describe a folder's name as text with entities; only the
    // text is kept, because a folder name is rendered as a label.
    title: typeof title === 'string' ? title : title.text,
    isArchive: filter.id === ARCHIVE,
    pinned: [...filter.pinned_peers],
    included: [...filter.include_peers],
    excluded,
    raw: filter,
  }
}

/** What a new folder holds. */
export interface NewFolder {
  /** The number to give it. Must not be one this account already uses. */
  readonly id: number
  readonly title: string
  readonly pinned?: readonly (string | PeerRef)[]
  readonly included?: readonly (string | PeerRef)[]
  readonly excluded?: readonly (string | PeerRef)[]
}

/**
 * Make a folder.
 *
 * ```ts
 * await createFolder(account, { id: 2, title: 'Work', included: ['@team'] })
 * ```
 *
 * The number is the caller's to choose because Telegram does not allocate one:
 * a folder is identified by whatever the client that made it decided, and 0 and
 * 1 are taken by the main list and the archive.
 */
export async function createFolder(client: Chatting, folder: NewFolder): Promise<void> {
  if (folder.id === MAIN || folder.id === ARCHIVE) {
    throw new ValidationError(
      `${String(folder.id)} is reserved — 0 is the main list and 1 is the archive`,
    )
  }

  await client.api.messages.updateDialogFilter({
    id: folder.id,
    filter: {
      _: 'dialogFilter',
      id: folder.id,
      title: { _: 'textWithEntities', text: folder.title, entities: [] },
      pinned_peers: await resolveAll(client, folder.pinned),
      include_peers: await resolveAll(client, folder.included),
      exclude_peers: await resolveAll(client, folder.excluded),
    },
  })
}

/**
 * Change a folder.
 *
 * ```ts
 * await editFolder(account, 2, { title: 'Work things' })
 * ```
 *
 * The current folder is read first and the change applied on top, because the
 * call replaces the whole folder — a caller sending only the changed field
 * would clear everything else. What that costs is one extra request, which is
 * cheaper than the surprise.
 */
export async function editFolder(
  client: Chatting,
  id: number,
  edit: {
    readonly title?: string
    readonly pinned?: readonly (string | PeerRef)[]
    readonly included?: readonly (string | PeerRef)[]
    readonly excluded?: readonly (string | PeerRef)[]
  },
): Promise<void> {
  const existing = (await readFolders(client)).find((folder) => folder.id === id)

  if (existing === undefined) {
    throw new ValidationError(`this account has no folder ${String(id)}`)
  }

  await client.api.messages.updateDialogFilter({
    id,
    filter: {
      _: 'dialogFilter',
      id,
      title: { _: 'textWithEntities', text: edit.title ?? existing.title, entities: [] },
      pinned_peers:
        edit.pinned === undefined ? existing.pinned : await resolveAll(client, edit.pinned),
      include_peers:
        edit.included === undefined ? existing.included : await resolveAll(client, edit.included),
      exclude_peers:
        edit.excluded === undefined ? existing.excluded : await resolveAll(client, edit.excluded),
    },
  })
}

/**
 * Remove a folder.
 *
 * The conversations in it are not affected: a folder is a view, and removing it
 * removes the view. Spelled as an update with nothing in it, which is the
 * protocol's own way of saying "this folder is gone".
 */
export async function deleteFolder(client: Chatting, id: number): Promise<void> {
  await client.api.messages.updateDialogFilter({ id })
}

/**
 * Put the folders in a given order.
 *
 * The list is the whole statement, so a folder left out of it is left where it
 * was rather than removed — but the result is then not what the caller
 * described, so passing every folder is the only sensible use.
 */
export async function setFolderOrder(client: Chatting, order: readonly number[]): Promise<void> {
  await client.api.messages.updateDialogFiltersOrder({ order })
}

/**
 * Move conversations into the archive, or back out of it.
 *
 * ```ts
 * await archiveChats(account, ['@noisy'], true)
 * ```
 *
 * The archive is folder 1 and the main list is folder 0, so archiving and
 * unarchiving are one call with a different number.
 */
export async function archiveChats(
  client: Chatting,
  chats: readonly (string | PeerRef)[],
  archived: boolean,
): Promise<void> {
  if (chats.length === 0) return

  const folder_peers = []
  for (const chat of chats) {
    folder_peers.push({
      _: 'inputFolderPeer' as const,
      peer: await client.resolve(chat),
      folder_id: archived ? ARCHIVE : MAIN,
    })
  }

  const answer = await client.api.folders.editPeerFolders({ folder_peers })

  await applyUpdates(client, answer)
}

/**
 * Mark a conversation as unread, or clear the mark.
 *
 * A flag rather than a count: it makes the conversation look unread without
 * changing which messages this account has read, and reading anything in it
 * clears it.
 */
export async function markChatUnread(
  client: Chatting,
  chat: string | PeerRef,
  unread: boolean,
): Promise<void> {
  await client.api.messages.markDialogUnread({
    peer: { _: 'inputDialogPeer', peer: await client.resolve(chat) },
    ...(unread ? { unread: true } : {}),
  })
}

/**
 * Keep an unsent message against a conversation.
 *
 * ```ts
 * await saveDraft(account, '@someone', 'half a thought')
 * ```
 *
 * Drafts live on Telegram rather than in a client, which is how the same
 * half-written message appears on a phone and a desktop. Passing nothing clears
 * it.
 *
 * The text is plain: formatting is a list of ranges, and building those is
 * `fromHtml`/`fromMarkdown` — so a caller that wants a formatted draft passes
 * the entities it produced.
 */
export async function saveDraft(
  client: Chatting,
  chat: string | PeerRef,
  text: string | undefined,
  options: { readonly entities?: readonly TypeMessageEntity[]; readonly replyTo?: number } = {},
): Promise<void> {
  await client.api.messages.saveDraft({
    peer: await client.resolve(chat),
    message: text ?? '',
    ...(options.entities === undefined || options.entities.length === 0
      ? {}
      : { entities: options.entities }),
    ...(options.replyTo === undefined
      ? {}
      : { reply_to: { _: 'inputReplyToMessage' as const, reply_to_msg_id: options.replyTo } }),
  })
}

/** Resolve a list of peers, or nothing for an absent one. */
async function resolveAll(
  client: Chatting,
  peers: readonly (string | PeerRef)[] | undefined,
): Promise<TypeInputPeer[]> {
  if (peers === undefined) return []

  const resolved: TypeInputPeer[] = []
  for (const peer of peers) resolved.push(await client.resolve(peer))

  return resolved
}
