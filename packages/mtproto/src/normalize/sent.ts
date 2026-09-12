/**
 * Reading what was sent out of the answer a send produces.
 *
 * MTProto does not answer a send with the message. It answers with the updates
 * the send caused — which describe the message, among whatever else happened at
 * the same moment — and leaves the caller to find it. That is a protocol shape
 * rather than a product one: the other transport this project ships answers a
 * send with the message it created, and a handler that has just replied wants
 * the same thing here.
 *
 * ```
 *   updates ──> updateMessageID   which identifier this send was given
 *           └─> updateNewMessage  the message, when the answer carries one
 *
 *   updateShortSentMessage        the identifier alone, no message at all
 * ```
 *
 * Two answers and two shapes. The long form ties the identifier to the send by
 * the random number the send was deduplicated by, which is what makes it safe
 * to read: an answer can describe several messages, and any other one belongs
 * to something else. The short form is the answer to this call and nothing
 * else, so its identifier needs no tie — and it carries no message, which is
 * why nothing here promises one.
 */

import type { TypeMessage } from '../generated/api/types/index.js'
import type { TlObject, TlValue } from '../tl/index.js'

/** What a send came to. */
export interface SentMessage {
  /**
   * The identifier Telegram gave it, where the answer said.
   *
   * Absent rather than invented. A server that answers a send by saying the
   * client is too far behind to be told — `updatesTooLong` — has still sent the
   * message, and reporting that as a failure would be worse than reporting that
   * the identifier is not known.
   */
  readonly id: number | undefined
  /**
   * The whole message, where the answer carried one.
   *
   * The short answer carries none, so this is absent for it. Nothing is
   * assembled from the fields around it: a message built here would be one the
   * server never wrote down.
   */
  readonly message: TypeMessage | undefined
  /** The answer, untouched. */
  readonly raw: TlValue
}

/** The constructors that carry a whole message the answer is about. */
const CARRIES_MESSAGE: ReadonlySet<string> = new Set([
  'updateNewMessage',
  'updateNewChannelMessage',
  'updateNewScheduledMessage',
])

/**
 * Find the message a send produced in the answer it produced.
 *
 * The random number is the one the send carried. Telegram deduplicates by it
 * and reports the identifier it settled on against it, so it is the only thing
 * in the answer that says which of the messages described is this one.
 *
 * ```ts
 * const answer = await account.api.messages.sendMessage({ peer, message, random_id })
 * const { id } = sentMessage(answer, random_id)
 * ```
 *
 * Nothing here fails. An answer that says nothing about the message is reported
 * as saying nothing, because the send itself has already succeeded by the time
 * there is an answer to read.
 */
export function sentMessage(source: TlObject, randomId: bigint): SentMessage {
  // Taken as the constructor alone and read as fields from here. Both public
  // surfaces produce one: a typed method hands back the shape the schema names,
  // and `call` hands back the shape the decoder produced — the same value,
  // described to the type system twice.
  const answer = source as TlValue

  if (answer._ === 'updateShortSentMessage') {
    const id = answer['id']

    return { id: typeof id === 'number' ? id : undefined, message: undefined, raw: answer }
  }

  const carried = updatesIn(answer)
  const id = identifierIn(carried, randomId)

  return {
    id,
    message: id === undefined ? undefined : messageIn(carried, id),
    raw: answer,
  }
}

/**
 * The updates an answer carries, however it carries them.
 *
 * Three of the four shapes hold a list; `updateShort` holds one on its own,
 * which is the same thing counted differently.
 */
function updatesIn(answer: TlValue): readonly TlValue[] {
  if (answer._ === 'updateShort') {
    const only = answer['update']

    return isValue(only) ? [only] : []
  }

  const list = answer['updates']

  return Array.isArray(list) ? list.filter(isValue) : []
}

/** The identifier reported against the number this send was deduplicated by. */
function identifierIn(updates: readonly TlValue[], randomId: bigint): number | undefined {
  for (const update of updates) {
    if (update._ !== 'updateMessageID') continue
    if (update['random_id'] !== randomId) continue

    const id = update['id']
    if (typeof id === 'number') return id
  }

  return undefined
}

/** The message with that identifier, where the answer describes one. */
function messageIn(updates: readonly TlValue[], id: number): TypeMessage | undefined {
  for (const update of updates) {
    if (!CARRIES_MESSAGE.has(update._)) continue

    const message = update['message']
    if (isValue(message) && message['id'] === id) return message as unknown as TypeMessage
  }

  return undefined
}

/** Whether a decoded field is an object naming a constructor. */
function isValue(value: unknown): value is TlValue {
  return typeof value === 'object' && value !== null && typeof (value as TlValue)._ === 'string'
}
