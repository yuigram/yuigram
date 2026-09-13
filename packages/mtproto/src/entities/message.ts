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
 * Every field the three constructors carry has an accessor except `legacy`,
 * which marks a message sent by a client old enough that its text needs
 * re-fetching before its formatting can be trusted. That is an instruction to
 * the code that fetches, not a fact about the conversation, and a reader acting
 * on it could do nothing useful with the answer.
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
  TypeMessageReactions,
  TypeMessageReplies,
  TypeMessageReplyHeader,
  TypeReplyMarkup,
  TypeRestrictionReason,
  TypeSuggestedPost,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'
import { type MediaView, readMedia } from './media.js'

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

  /**
   * What it carried besides text, read.
   *
   * A view rather than the value, because the value is nineteen constructors
   * and what a reader wants first — is this a voice note — is not one of them.
   * The value is still there, as `media.raw` or as `raw.media`.
   */
  get media(): MediaView | undefined {
    if (this.raw._ !== 'message') return undefined

    return readMedia(this.raw.media)
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

  /**
   * Whether a channel put it here rather than a person forwarding it.
   *
   * A post in a channel with a discussion group appears in that group as a
   * forward the group did not make. The forward header names where the copy was
   * saved from, which is what separates it from someone forwarding the post by
   * hand — that carries no saved origin.
   *
   * The origin peer and the message number share a flag bit in the schema, so
   * either answers for both and checking one is checking the pair.
   */
  get isAutomaticForward(): boolean {
    return this.forwardedFrom?.saved_from_peer !== undefined
  }

  /**
   * Whether forwarding it on is allowed.
   *
   * A service message and an empty one have nothing to forward, so the answer
   * for both is no rather than the absence of a restriction.
   */
  get canBeForwarded(): boolean {
    return this.raw._ === 'message' && this.raw.noforwards !== true
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
   * The conversation the message it answers is in, where that is a different
   * one.
   *
   * A reply normally points inside its own conversation and says nothing here.
   * It is present when the answer crosses conversations — a comment on a
   * channel post, read from the discussion group.
   */
  get replyToPeer(): PeerRef | undefined {
    const header = this.replyTo

    return header?._ === 'messageReplyHeader' ? peerRefOf(header.reply_to_peer_id) : undefined
  }

  /** The message at the top of the thread this one is in, where it is in one. */
  get replyToTopId(): number | undefined {
    const header = this.replyTo

    return header?._ === 'messageReplyHeader' ? header.reply_to_top_id : undefined
  }

  /**
   * The part of the answered message that was quoted, where a part was.
   *
   * Telegram sends the quoted text with the reply rather than only a range into
   * the original, because the original may since have been edited.
   */
  get quote(): string | undefined {
    const header = this.replyTo

    return header?._ === 'messageReplyHeader' ? header.quote_text : undefined
  }

  /** The story it answers, where it answers one. */
  get replyToStoryId(): number | undefined {
    const header = this.replyTo

    return header?._ === 'messageReplyStoryHeader' ? header.story_id : undefined
  }

  /** Whether it sits inside a forum topic rather than in the conversation at large. */
  get isTopicMessage(): boolean {
    const header = this.replyTo

    return header?._ === 'messageReplyHeader' && header.forum_topic === true
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
   * Which conversation it is filed under in saved messages.
   *
   * Present when the message was read out of saved messages, where one dialog
   * holds messages from many conversations and this is the one it came from.
   */
  get savedPeer(): PeerRef | undefined {
    return this.raw._ === 'messageEmpty' ? undefined : peerRefOf(this.raw.saved_peer_id)
  }

  /** How many boosts the sender had applied to the conversation, where it counts them. */
  get senderBoostCount(): number | undefined {
    return this.raw._ === 'message' ? this.raw.from_boosts_applied : undefined
  }

  /** The business bot it was sent through, where it was sent through one. */
  get viaBusinessBotId(): bigint | undefined {
    return this.raw._ === 'message' ? this.raw.via_business_bot_id : undefined
  }

  /**
   * Why it is withheld, and where.
   *
   * Each reason names a platform and a region. A client is expected to hide the
   * message where a reason applies to it, which is a decision only the client
   * can make.
   */
  get restrictions(): readonly TypeRestrictionReason[] | undefined {
    return this.raw._ === 'message' ? this.raw.restriction_reason : undefined
  }

  /** The quick-reply shortcut it belongs to, where it was sent as part of one. */
  get quickReplyShortcutId(): number | undefined {
    return this.raw._ === 'message' ? this.raw.quick_reply_shortcut_id : undefined
  }

  /** What was paid to send it, in stars, where sending it cost something. */
  get paidMessageStars(): bigint | undefined {
    return this.raw._ === 'message' ? this.raw.paid_message_stars : undefined
  }

  /** The terms it was suggested under, where it is a suggested post. */
  get suggestedPost(): TypeSuggestedPost | undefined {
    return this.raw._ === 'message' ? this.raw.suggested_post : undefined
  }

  /**
   * What a suggested post was paid in, where one was paid for.
   *
   * The schema carries this as two flags that are not both set. Reading them as
   * one answer is the difference between asking what it was paid in and asking
   * two questions whose combination has no meaning.
   */
  get suggestedPostPaidIn(): 'stars' | 'ton' | undefined {
    if (this.raw._ !== 'message') return undefined
    if (this.raw.paid_suggested_post_stars === true) return 'stars'

    return this.raw.paid_suggested_post_ton === true ? 'ton' : undefined
  }

  /** How often a scheduled message repeats, in seconds, where it repeats. */
  get scheduleRepeatPeriod(): number | undefined {
    return this.raw._ === 'message' ? this.raw.schedule_repeat_period : undefined
  }

  /** Whether a video on it is still being processed and is not yet playable. */
  get isVideoProcessing(): boolean {
    return this.raw._ === 'message' ? this.raw.video_processing_pending === true : false
  }

  /** Until when delivery of it should be reported, where a report was paid for. */
  get reportDeliveryUntil(): number | undefined {
    return this.raw._ === 'message' ? this.raw.report_delivery_until_date : undefined
  }

  /** The language a summary of it was made from, where one was made. */
  get summaryFromLanguage(): string | undefined {
    return this.raw._ === 'message' ? this.raw.summary_from_language : undefined
  }

  /**
   * Whether it can be reacted to, where the message says.
   *
   * Only a service message carries this. An ordinary message does not say —
   * whether a reaction is allowed depends on the conversation's settings rather
   * than on anything the message holds — so the answer there is `undefined`
   * rather than a guess.
   */
  get reactionsArePossible(): boolean | undefined {
    return this.raw._ === 'messageService' ? this.raw.reactions_are_possible === true : undefined
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
