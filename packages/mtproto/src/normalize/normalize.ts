/**
 * Turning a TL update into the shape dispatch consumes.
 *
 * An update says what happened in Telegram's vocabulary and in Telegram's
 * shape: which constructor it is decides where the chat is, whether there is a
 * sender at all, and whether the thing that changed is nested or spread across
 * the update's own fields. A handler should not have to know any of that, so
 * this reads it once and produces a kind plus the few fields every reader wants.
 *
 * ```
 *   TL update ──> kind ──┬── chat, sender   as peer references
 *                        ├── message, text, date
 *                        └── raw            untouched
 * ```
 *
 * **Peers are referenced, not resolved.** An update names a peer by number; the
 * full entity, with the hash needed to address it, lives in the peer store and
 * is fetched. Doing that here would make the seam asynchronous and give it an
 * opinion about storage, and it would still not be enough — addressing a peer
 * is something a client does, and there is no client below this layer. What an
 * update genuinely carries is the reference, so that is what comes out.
 *
 * **Nothing is dropped.** Telegram ships update kinds before a client is
 * regenerated to know them. An unrecognised constructor arrives as `mtproto:raw`
 * with the payload intact, because a framework trusted to deliver a stream that
 * quietly discards part of it is worse than one that admits it does not know.
 */

import type { TypeMessage } from '../generated/api/types/index.js'
import type { PeerKind } from '../storage/peers.js'
import type { TlValue } from '../tl/index.js'
import {
  EPHEMERAL_MESSAGE_UPDATES,
  MESSAGE_UPDATES,
  type MtprotoEventKind,
  RAW_KIND,
  SHORT_MESSAGE_UPDATES,
  UPDATE_EVENTS,
} from './events.js'

/** A peer as an update names it: which sort of peer, and which one. */
export interface PeerRef {
  readonly kind: PeerKind
  readonly id: bigint
}

/** One update, read into the fields dispatch and filters share. */
export interface NormalizedUpdate {
  /** Which event this is. */
  readonly kind: MtprotoEventKind
  /** The conversation this concerns, where the update names one. */
  readonly chat: PeerRef | undefined
  /**
   * Who caused it, where the update says.
   *
   * Absent for anything the account itself did, and for updates that are about
   * a conversation rather than about somebody acting in it — a read horizon
   * moving has no author.
   */
  readonly sender: PeerRef | undefined
  /** The message, for the kinds that carry a whole one. */
  readonly message: TypeMessage | undefined
  /** The messages a deletion names. */
  readonly messageIds: readonly number[] | undefined
  /** Message text, where the update carries a message with any. */
  readonly text: string | undefined
  /** When it happened, where the update says. Absent rather than invented. */
  readonly date: number | undefined
  /** The untouched update. */
  readonly raw: TlValue
}

/** Read a TL update into its normalized form. */
export function normalizeUpdate(update: TlValue): NormalizedUpdate {
  const kind = kindOf(update)

  if (MESSAGE_UPDATES.has(update._)) return fromMessage(update, kind)
  if (SHORT_MESSAGE_UPDATES.has(update._)) return fromShortMessage(update, kind)
  if (EPHEMERAL_MESSAGE_UPDATES.has(update._)) return fromEphemeral(update, kind)

  if (update._ === 'updateDeleteEphemeralMessages') {
    return {
      kind,
      chat: peerRefOf(update['peer']),
      sender: undefined,
      message: undefined,
      // Named `ids` here rather than `messages`, and meaningful only for the
      // person the messages were shown to.
      messageIds: readIntVector(update['ids']),
      text: undefined,
      date: undefined,
      raw: update,
    }
  }

  return {
    kind,
    chat: chatOf(update),
    sender: senderOf(update),
    message: undefined,
    messageIds: readIntVector(update['messages']),
    text: undefined,
    date: readDate(update['date']),
    raw: update,
  }
}

/**
 * Which kind an update is.
 *
 * Almost always the constructor alone. A pinned dialog is the exception: one
 * constructor says both that a dialog was pinned and that it was unpinned, and
 * which of those happened is the only thing a reader cares about.
 */
function kindOf(update: TlValue): MtprotoEventKind {
  const mapped = UPDATE_EVENTS[update._]
  if (mapped === undefined) return RAW_KIND

  if (update._ === 'updateDialogPinned') {
    return update['pinned'] === true ? 'mtproto:dialog_pinned' : 'mtproto:dialog_unpinned'
  }

  return mapped
}

/**
 * Read an update carrying an ephemeral message.
 *
 * The conversation and the author come out of the message rather than the
 * update, as they do for an ordinary one — but `message` stays undefined,
 * because that field holds a `Message` and this is not one. The whole payload
 * is in `raw`, which is where `EphemeralMessageView` reads it from.
 */
function fromEphemeral(update: TlValue, kind: MtprotoEventKind): NormalizedUpdate {
  const message = asValue(update['message'])

  return {
    kind,
    // Absent in a guest chat, where the message belongs to a query rather than
    // to a conversation.
    chat: message === undefined ? undefined : peerRefOf(message['peer_id']),
    sender: message === undefined ? undefined : peerRefOf(message['from_id']),
    message: undefined,
    // A send is not a deletion, so this stays empty; the message's own number
    // is in `raw`, where it belongs to the ephemeral message rather than to the
    // conversation.
    messageIds: undefined,
    text: message === undefined ? undefined : readString(message['message']),
    date: message === undefined ? undefined : readDate(message['date']),
    raw: update,
  }
}

/** Read an update whose payload is a whole message. */
function fromMessage(update: TlValue, kind: MtprotoEventKind): NormalizedUpdate {
  // The update's own field, which the schema declares as a boxed `Message`.
  // Narrowed once here rather than by every handler that reads it: what the
  // decoder produced is what the table said the constructor carries, and
  // `events.md` §5 asks for the payload's own fields with the payload's own
  // optionality rather than a shape the framework guessed at.
  const message = asValue(update['message']) as TypeMessage | undefined

  return {
    kind,
    chat: peerRefOf(message?.peer_id),
    // Outgoing messages carry no author: the account itself sent them, and the
    // account is not something an update needs to name.
    sender:
      message === undefined || message._ === 'messageEmpty'
        ? undefined
        : peerRefOf(message.from_id),
    message,
    messageIds: undefined,
    // Only an ordinary message carries text. A service message describes
    // something that happened and an empty one is a hole where a message the
    // account cannot see used to be, and inventing an empty string for either
    // would make a handler testing for text believe there was some.
    text: message?._ === 'message' ? readString(message.message) : undefined,
    date:
      message === undefined || message._ === 'messageEmpty' ? undefined : readDate(message.date),
    raw: update,
  }
}

/**
 * Read a compact message update.
 *
 * These carry the message spread across the update instead of nested, and name
 * their peers by number rather than as peer objects — so the same fields are
 * all present and none of them are in the same place.
 */
function fromShortMessage(update: TlValue, kind: MtprotoEventKind): NormalizedUpdate {
  const outgoing = update['out'] === true
  const chatId = readBigInt(update['chat_id'])
  const userId = readBigInt(update['user_id'])

  const chat: PeerRef | undefined =
    chatId !== undefined
      ? { kind: 'chat', id: chatId }
      : userId !== undefined
        ? { kind: 'user', id: userId }
        : undefined

  // In a private chat the other party is both the conversation and the author,
  // unless the account is the one who wrote it. In a basic group the author is
  // named separately.
  const fromId = readBigInt(update['from_id'])
  const sender: PeerRef | undefined =
    fromId !== undefined
      ? { kind: 'user', id: fromId }
      : outgoing || userId === undefined
        ? undefined
        : { kind: 'user', id: userId }

  return {
    kind,
    chat,
    sender,
    // There is no message object to hand back — the update is the message.
    message: undefined,
    messageIds: undefined,
    text: readString(update['message']),
    date: readDate(update['date']),
    raw: update,
  }
}

/**
 * The conversation an update concerns.
 *
 * Every update names it differently, and some name it not at all: a deletion
 * outside a channel says only which message numbers went, because message
 * numbers are unique to the account outside channels and the peer is not needed
 * to find them.
 */
/**
 * The updates whose `user_id` is the person asking rather than the subject.
 *
 * Named rather than inferred, and used for two things. The person is the
 * sender, because nobody else acted. And the person is *not* the conversation:
 * an inline query, a payment step or a request to join is a standing question
 * addressed to the account, not something said in a chat. Half of these name a
 * conversation of their own and half genuinely have none, so falling back to
 * `user_id` here would invent a private chat that the query never happened in.
 *
 * The distinction matters because several other updates carry a `user_id`
 * meaning something else entirely, and reading it as the sender on those would
 * attribute an event to whoever it happened to be about.
 */
const ASKED_BY_USER: ReadonlySet<string> = new Set([
  'updateBotCallbackQuery',
  'updateInlineBotCallbackQuery',
  'updateBotInlineQuery',
  'updateBotInlineSend',
  'updateBotShippingQuery',
  'updateBotPrecheckoutQuery',
  'updateBotChatInviteRequester',
])

function chatOf(update: TlValue): PeerRef | undefined {
  const direct = peerRefOf(update['peer'])
  if (direct !== undefined) return direct

  // A dialog names its peer through a wrapper, which also has a form standing
  // for a folder rather than a conversation.
  const dialog = asValue(update['peer'])
  if (dialog !== undefined) {
    const inner = peerRefOf(dialog['peer'])
    if (inner !== undefined) return inner
  }

  const channelId = readBigInt(update['channel_id'])
  if (channelId !== undefined) return { kind: 'channel', id: channelId }

  const chatId = readBigInt(update['chat_id'])
  if (chatId !== undefined) return { kind: 'chat', id: chatId }

  // The oldest membership update names the chat inside the participant list
  // rather than beside it, so the conversation is there to be read even though
  // the update itself carries no identifier at the top level.
  const nested = asValue(update['participants'])
  const nestedId = nested === undefined ? undefined : readBigInt(nested['chat_id'])
  if (nestedId !== undefined) return { kind: 'chat', id: nestedId }

  // A query is not said in a conversation, so it has none rather than one made
  // up from whoever asked.
  if (ASKED_BY_USER.has(update._)) return undefined

  // A user typing in a private chat: the user is the conversation.
  const userId = readBigInt(update['user_id'])

  return userId === undefined ? undefined : { kind: 'user', id: userId }
}

/**
 * Who acted, where an update says.
 *
 * Only where somebody genuinely did something. Reading the peer as the author
 * would make every read horizon and every status change look like an action by
 * whoever the update happens to be about.
 */
function senderOf(update: TlValue): PeerRef | undefined {
  const from = peerRefOf(update['from_id'])
  if (from !== undefined) return from

  if (update._ === 'updateUserTyping' || update._ === 'updateUserStatus') {
    const userId = readBigInt(update['user_id'])
    if (userId !== undefined) return { kind: 'user', id: userId }
  }

  // A query from a bot's point of view: the person who pressed the button or
  // typed the query is who it is from, and there is no other candidate.
  if (ASKED_BY_USER.has(update._)) {
    const userId = readBigInt(update['user_id'])
    if (userId !== undefined) return { kind: 'user', id: userId }
  }

  // A membership change names who made it rather than who it is about: the
  // member is the subject, and the actor is the one who promoted, removed or
  // invited them. Reading `user_id` here would report the person affected as
  // the person responsible.
  const actor = readBigInt(update['actor_id'])
  if (actor !== undefined) return { kind: 'user', id: actor }

  // The basic-group forms predate `actor_id` and name the actor only where they
  // have one to name: whoever added somebody is on the update, whoever removed,
  // promoted or renamed them is not. Absent rather than guessed — an admin
  // change with no actor really is a change nobody is named for.
  const inviter = readBigInt(update['inviter_id'])

  return inviter === undefined ? undefined : { kind: 'user', id: inviter }
}

/** Read a `Peer`, whichever of the three it is. */
/**
 * Which peer a `peerUser` / `peerChat` / `peerChannel` names.
 *
 * Absent rather than raised for anything else, because a reader asking what
 * peer a field names is usually reading a field that may not be there. The
 * raising form lives beside the reference builders, where naming nothing is a
 * caller's mistake rather than an answer's shape.
 */
export function peerRefOf(value: unknown): PeerRef | undefined {
  const peer = asValue(value)
  if (peer === undefined) return undefined

  const user = readBigInt(peer['user_id'])
  if (peer._ === 'peerUser' && user !== undefined) return { kind: 'user', id: user }

  const chat = readBigInt(peer['chat_id'])
  if (peer._ === 'peerChat' && chat !== undefined) return { kind: 'chat', id: chat }

  const channel = readBigInt(peer['channel_id'])
  if (peer._ === 'peerChannel' && channel !== undefined) return { kind: 'channel', id: channel }

  return undefined
}

function asValue(value: unknown): TlValue | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  return typeof (value as TlValue)._ === 'string' ? (value as TlValue) : undefined
}

function readBigInt(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value

  return typeof value === 'number' && Number.isInteger(value) ? BigInt(value) : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readIntVector(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const numbers = value.filter((item): item is number => typeof item === 'number')

  return numbers.length === value.length ? numbers : undefined
}

/**
 * Read a Telegram timestamp, in the units Telegram sends.
 *
 * Seconds, and left that way. `docs/events.md` §5 settles it: a conversion the
 * framework performs on every update, for every handler, is a cost paid by
 * everyone for the benefit of a few, and the value belongs to the payload
 * rather than to the framework's idea of what a time is. A handler that wants a
 * `Date` builds one.
 */
function readDate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}
