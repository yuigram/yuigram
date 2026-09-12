/**
 * Continuing a list that arrived one page at a time.
 *
 * A page of dialogs does not say where the next one starts. It says which
 * conversations are on it, and the position the next request has to carry is
 * assembled from the last of them — a date, a message identifier and the peer,
 * three fields that have to agree or the next page starts somewhere else.
 *
 * ```
 *   dialogsSlice ──> last dialog ──> peer        ──┐
 *                              └──> top_message ──┼──> offset of the next page
 *                  messages    ──> its date     ──┘
 * ```
 *
 * **The date is not on the dialog.** A dialog carries the identifier of its
 * most recent message and nothing about when it happened, so the date comes
 * from that message in the same answer. Reading it from anywhere else — the
 * answer's own timestamp, the moment the page arrived — produces an offset that
 * is well formed and names a position nobody has, which Telegram answers with a
 * page that quietly begins somewhere other than where the last one ended.
 *
 * A message is matched on its conversation as well as its number. Identifiers
 * are per conversation for channels, so a page describing two of them can hold
 * two messages numbered the same, and taking either would date the offset by
 * whichever came first in the array.
 *
 * Nothing here iterates. How many pages to ask for, how fast, and what to do
 * with them are the caller's, and a list that reads itself would be deciding
 * all three.
 */

import { readPeerReference } from '../network/peers.js'
import type { TlValue } from '../tl/index.js'
import type { PeerRef } from './normalize.js'

/** Where the next page of dialogs begins. */
export interface DialogsOffset {
  /** `offset_date`: when the last dialog's most recent message happened. */
  readonly date: number
  /** `offset_id`: that message's identifier. */
  readonly id: number
  /**
   * `offset_peer`: the conversation it belongs to.
   *
   * A reference rather than the argument itself, because naming a peer needs an
   * access hash and that is the peer table's to supply — `account.resolve()`
   * turns this into what the call carries.
   */
  readonly peer: PeerRef
}

/**
 * Where to continue a list of dialogs, or nothing when there is nowhere to.
 *
 * ```ts
 * const answer = await account.api.messages.getDialogs({ ... })
 * const next = nextDialogs(answer)
 * if (next !== undefined) {
 *   await account.api.messages.getDialogs({
 *     offset_date: next.date,
 *     offset_id: next.id,
 *     offset_peer: await account.resolve(next.peer),
 *     limit: 100,
 *     hash: 0n,
 *   })
 * }
 * ```
 *
 * Only a slice can be continued. The complete form says it is the whole list,
 * and the unchanged form describes no page at all — both are the end, and
 * asking again would fetch the first page a second time.
 *
 * A dialog whose most recent message the answer does not describe falls back to
 * the one before it. An offset that repeats a dialog costs a caller a duplicate
 * it can see; one that skips past it loses a conversation silently.
 */
export function nextDialogs(answer: TlValue): DialogsOffset | undefined {
  if (answer._ !== 'messages.dialogsSlice') return undefined

  const messages = values(answer['messages'])

  // Latest first: the offset belongs to the last dialog on the page, and an
  // earlier one is only reached when that dialog cannot be dated.
  for (const dialog of values(answer['dialogs']).reverse()) {
    const top = dialog['top_message']
    const peer = dialog['peer']
    if (typeof top !== 'number' || !isValue(peer)) continue

    const named = reference(peer)
    if (named === undefined) continue

    const date = dateOf(messages, top, named)
    if (date === undefined) continue

    return { date, id: top, peer: named }
  }

  return undefined
}

/** When one message happened, matched on its conversation as well as its number. */
function dateOf(messages: readonly TlValue[], id: number, peer: PeerRef): number | undefined {
  for (const message of messages) {
    if (message['id'] !== id) continue

    const where = message['peer_id']
    if (!isValue(where)) continue

    const named = reference(where)
    if (named?.kind !== peer.kind || named.id !== peer.id) continue

    const date = message['date']
    if (typeof date === 'number') return date
  }

  return undefined
}

/**
 * Which peer a reference names, or nothing when it names none.
 *
 * Absent rather than raised: an answer carrying something this does not
 * recognise is an answer about something else, and refusing the whole page over
 * one entry would lose the rest of it.
 */
function reference(value: TlValue): PeerRef | undefined {
  try {
    return readPeerReference(value)
  } catch {
    return undefined
  }
}

/** The objects in a decoded vector, skipping anything that is not one. */
function values(field: unknown): TlValue[] {
  return Array.isArray(field) ? field.filter(isValue) : []
}

/** Whether a decoded field is an object naming a constructor. */
function isValue(value: unknown): value is TlValue {
  return typeof value === 'object' && value !== null && typeof (value as TlValue)._ === 'string'
}
