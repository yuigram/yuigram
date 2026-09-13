/**
 * Reading a message without narrowing three constructors by hand.
 *
 * `TypeMessage` is a union: an ordinary message, a service message describing
 * something that happened, and an empty one — a hole where a message the
 * account cannot see used to be. Every field a reader wants sits behind that
 * union, and most of them behind an optional as well, so the shortest honest
 * way to ask "who sent this" is several lines of narrowing repeated at every
 * call site.
 *
 * ```
 *   message | messageService | messageEmpty  ──> one set of accessors
 * ```
 *
 * **This is a view, not a copy.** It holds the value it was given and computes
 * on access, so building one allocates almost nothing and reading a field costs
 * what reading the field costs. Nothing is cached, nothing is fetched, and the
 * value stays reachable as {@link MessageView.raw} — a reader that wants
 * something this does not expose is not blocked by it.
 *
 * **It reaches nothing.** No store, no account, no network: every accessor is a
 * function of the value alone. That is what makes it safe to build one from a
 * message that arrived in any answer, on any account, without asking which.
 * Operations that need an account stay where they already are — on the event
 * the message arrived with, which is the only thing that knows how to address
 * the conversation it belongs to.
 *
 * Timestamps stay as Telegram sends them, in Unix seconds. `docs/events.md` §5
 * records why: converting on every message for every reader is a cost paid by
 * everyone for the benefit of a few, and `new Date(seconds * 1000)` is one line
 * where it is actually wanted.
 */

import type {
  TypeFactCheck,
  TypeMessage,
  TypeMessageAction,
  TypeMessageEntity,
  TypeMessageFwdHeader,
  TypeMessageMedia,
  TypeMessageReactions,
  TypeMessageReplies,
  TypeMessageReplyHeader,
  TypeReplyMarkup,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'

/**
 * Which of the three a message is.
 *
 * Worth having as a value rather than only as a set of predicates: a reader
 * switching on it is told by the compiler when it has missed one, which is how
 * an empty message stops being the case nobody handled.
 */
export type MessageForm = 'ordinary' | 'service' | 'empty'

/**
 * A message, read.
 *
 * Accessors are `undefined` where the message does not carry the field rather
 * than where it could not be read: a service message has no text, and saying so
 * with `undefined` is the same answer the schema gives.
 */
export class MessageView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeMessage

  constructor(value: TypeMessage) {
    this.raw = value
  }

  /** Which of the three constructors this is. */
  get form(): MessageForm {
    if (this.raw._ === 'message') return 'ordinary'

    return this.raw._ === 'messageService' ? 'service' : 'empty'
  }

  /** Whether this describes something that happened rather than something said. */
  get isService(): boolean {
    return this.raw._ === 'messageService'
  }

  /**
   * Whether this is a hole where a message used to be.
   *
   * An empty message is what an answer carries for a message the account may
   * not see — deleted, or in a conversation it has no access to. It has an
   * identifier and nothing else worth reading.
   */
  get isEmpty(): boolean {
    return this.raw._ === 'messageEmpty'
  }

  /** The number this message is known by inside its conversation. */
  get id(): number {
    return this.raw.id
  }

  /**
   * The conversation it belongs to.
   *
   * Present on every form but the empty one, where the schema makes it
   * optional: an answer may name a message it cannot place.
   */
  get chat(): PeerRef | undefined {
    return peerRefOf(this.raw.peer_id)
  }

  /**
   * Who sent it, where the message says.
   *
   * Absent on a channel post, which is signed by the channel rather than by a
   * person, and on an empty message. A reader that wants "the channel" for a
   * post wants {@link MessageView.chat}.
   */
  get sender(): PeerRef | undefined {
    return this.raw._ === 'messageEmpty' ? undefined : peerRefOf(this.raw.from_id)
  }

  /** When it happened, in Unix seconds. Absent on an empty message. */
  get date(): number | undefined {
    return this.raw._ === 'messageEmpty' ? undefined : this.raw.date
  }

  /**
   * What it said.
   *
   * Only an ordinary message has text. A service message describes an action
   * and an empty one says nothing, and inventing `''` for either would make a
   * reader testing for text believe there was some.
   */
  get text(): string | undefined {
    return this.raw._ === 'message' ? this.raw.message : undefined
  }

  /** The formatting the text carries, where it carries any. */
  get entities(): readonly TypeMessageEntity[] | undefined {
    return this.raw._ === 'message' ? this.raw.entities : undefined
  }

  /** What it carried besides text. */
  get media(): TypeMessageMedia | undefined {
    return this.raw._ === 'message' ? this.raw.media : undefined
  }

  /** What happened, for a service message. */
  get action(): TypeMessageAction | undefined {
    return this.raw._ === 'messageService' ? this.raw.action : undefined
  }

  /** Whether this account sent it. */
  get isOutgoing(): boolean {
    return this.raw._ === 'messageEmpty' ? false : this.raw.out === true
  }

  /** Whether it mentions this account. */
  get isMentioned(): boolean {
    return this.raw._ === 'messageEmpty' ? false : this.raw.mentioned === true
  }

  /** Whether it arrived without a notification. */
  get isSilent(): boolean {
    return this.raw._ === 'messageEmpty' ? false : this.raw.silent === true
  }

  /** Whether it is a channel post rather than something a person sent. */
  get isPost(): boolean {
    return this.raw._ === 'message' ? this.raw.post === true : false
  }

  /** Whether it is pinned in its conversation. */
  get isPinned(): boolean {
    return this.raw._ === 'message' ? this.raw.pinned === true : false
  }

  /** Whether forwarding it is refused. */
  get isContentProtected(): boolean {
    return this.raw._ === 'message' ? this.raw.noforwards === true : false
  }

  /** Whether media on it has not been opened yet. */
  get hasUnreadMedia(): boolean {
    return this.raw._ === 'messageEmpty' ? false : this.raw.media_unread === true
  }

  /** Whether the media is shown above the text rather than below it. */
  get invertMedia(): boolean {
    return this.raw._ === 'message' ? this.raw.invert_media === true : false
  }

  /** Whether it was sent by a schedule rather than directly. */
  get isFromScheduled(): boolean {
    return this.raw._ === 'message' ? this.raw.from_scheduled === true : false
  }

  /** Whether the sender was away when it was sent. */
  get isFromOffline(): boolean {
    return this.raw._ === 'message' ? this.raw.offline === true : false
  }

  /** Whether an edit to it is shown without the usual mark. */
  get hideEditMark(): boolean {
    return this.raw._ === 'message' ? this.raw.edit_hide === true : false
  }

  /** When it was last edited, in Unix seconds. */
  get editDate(): number | undefined {
    return this.raw._ === 'message' ? this.raw.edit_date : undefined
  }

  /** How many times it has been seen, where the conversation counts that. */
  get views(): number | undefined {
    return this.raw._ === 'message' ? this.raw.views : undefined
  }

  /** How many times it has been forwarded, where the conversation counts that. */
  get forwards(): number | undefined {
    return this.raw._ === 'message' ? this.raw.forwards : undefined
  }

  /** Where it came from, when it was forwarded from somewhere. */
  get forwardedFrom(): TypeMessageFwdHeader | undefined {
    return this.raw._ === 'message' ? this.raw.fwd_from : undefined
  }

  /** Whether it was forwarded rather than written here. */
  get isForwarded(): boolean {
    return this.forwardedFrom !== undefined
  }

  /** What it answers, where it answers something. */
  get replyTo(): TypeMessageReplyHeader | undefined {
    return this.raw._ === 'messageEmpty' ? undefined : this.raw.reply_to
  }

  /**
   * The message this one answers, where it answers one in the same conversation.
   *
   * Only the identifier, because that is all the header carries. Reading the
   * message itself means asking for it, which is a call rather than a field.
   */
  get replyToMessageId(): number | undefined {
    const header = this.replyTo
    if (header?._ !== 'messageReplyHeader') return undefined

    return header.reply_to_msg_id
  }

  /** Whether it answers another message. */
  get isReply(): boolean {
    return this.replyToMessageId !== undefined
  }

  /**
   * Which album it belongs to, where it belongs to one.
   *
   * Several messages sent together share this, which is the only thing that
   * says they were one send rather than several that arrived at once.
   */
  get groupedId(): bigint | undefined {
    return this.raw._ === 'message' ? this.raw.grouped_id : undefined
  }

  /** Whether it was sent through a bot, and which. */
  get viaBotId(): bigint | undefined {
    return this.raw._ === 'message' ? this.raw.via_bot_id : undefined
  }

  /** The name a channel post is signed with, where it is signed. */
  get postAuthor(): string | undefined {
    return this.raw._ === 'message' ? this.raw.post_author : undefined
  }

  /** The sender's rank in the conversation, where the conversation gives ranks. */
  get senderRank(): string | undefined {
    return this.raw._ === 'message' ? this.raw.from_rank : undefined
  }

  /** The buttons attached to it, where it has any. */
  get markup(): TypeReplyMarkup | undefined {
    return this.raw._ === 'message' ? this.raw.reply_markup : undefined
  }

  /** What has been reacted to it, where anything has. */
  get reactions(): TypeMessageReactions | undefined {
    return this.raw._ === 'message' ? this.raw.reactions : undefined
  }

  /** The thread under it, where it has one. */
  get replies(): TypeMessageReplies | undefined {
    return this.raw._ === 'message' ? this.raw.replies : undefined
  }

  /** What has been said about its accuracy, where anything has. */
  get factCheck(): TypeFactCheck | undefined {
    return this.raw._ === 'message' ? this.raw.factcheck : undefined
  }

  /** How long it lives after being read, where it is set to expire. */
  get ttlPeriod(): number | undefined {
    return this.raw._ === 'messageEmpty' ? undefined : this.raw.ttl_period
  }

  /** The animation played when it arrived, where one was chosen. */
  get effectId(): bigint | undefined {
    return this.raw._ === 'message' ? this.raw.effect : undefined
  }

  /**
   * The value again, so serializing a view serializes what it reads.
   *
   * Without it `JSON.stringify` of a view produces `{}` — accessors are on the
   * prototype and the only own property is the value itself under a name a
   * reader did not choose.
   */
  toJSON(): TypeMessage {
    return this.raw
  }
}

/**
 * Read a message.
 *
 * ```ts
 * account.onMessage((event) => {
 *   const message = readMessage(event.message)
 *   if (message === undefined || message.isService) return
 *
 *   console.log(message.sender?.id, message.text)
 * })
 * ```
 *
 * Takes what an event or an answer carries, including nothing: a kind of update
 * that names no message hands over `undefined`, and a reader should not have to
 * check that before asking.
 */
export function readMessage(value: TypeMessage | undefined): MessageView | undefined {
  return value === undefined ? undefined : new MessageView(value)
}

/**
 * Whether two views read the same message.
 *
 * Views are built on demand, so two of them for one message are two objects and
 * `===` says nothing. A message is identified by its number and the
 * conversation it belongs to — the number alone is not enough, because
 * numbering restarts per channel.
 */
export function sameMessage(left: MessageView, right: MessageView): boolean {
  if (left.id !== right.id) return false

  const here = left.chat
  const there = right.chat

  if (here === undefined || there === undefined) return here === there

  return here.kind === there.kind && here.id === there.id
}
