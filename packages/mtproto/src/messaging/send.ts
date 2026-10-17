// SPDX-License-Identifier: MIT

/**
 * Saying something, to a conversation of the caller's choosing.
 *
 * Answering an update already works: an event knows the conversation it arrived
 * in and binds `reply`, `edit` and `delete` to it. Starting a conversation did
 * not. Every send had to be assembled by hand — which meant knowing that
 * `random_id` exists, that Telegram deduplicates on it, that it must not be a
 * counter, and that the answer names the message only by matching that same
 * number back out of a list of updates.
 *
 * ```
 *   sendText(account, '@someone', 'hi')
 *        └── resolve ──> input peer
 *        └── random  ──> deduplication key
 *        └── send    ──> updates
 *        └── match   ──> the message this call sent
 * ```
 *
 * **These reach the network.** They take the client rather than living on a
 * value, for the same reason the walks do: an operation that acts needs an
 * account, and a passive view must not own one.
 *
 * Where Telegram splits a method in two — one for channels, one for everything
 * else — that split is hidden here. It is a property of how the protocol is
 * addressed rather than of what the caller is doing, and getting it wrong is a
 * refused call rather than a wrong answer.
 */

import type { MtprotoApi } from '../api.js'
import { PeerError, ValidationError } from '../core.js'
import { MessageView } from '../entities/message.js'
import type { FormattedText } from '../format/text.js'
import type {
  TypeInlineBotSwitchPM,
  TypeInputBotInlineResult,
  TypeInputMedia,
  TypeInputPeer,
  TypeInputReplyTo,
  TypeMessageEntity,
  TypeReaction,
  TypeReplyMarkup,
  TypeSendMessageAction,
  TypeShippingOption,
} from '../generated/api/types/index.js'
import { channelFor, userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import { randomId, type SentMessage, sentMessage } from '../normalize/sent.js'

/**
 * What sending needs from a client.
 *
 * Structural rather than the `Account` class, so these can be driven by a fake
 * and tested without a connection.
 */
export interface Sending {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
  /** Bytes for the deduplication key. Telegram refuses a send without one. */
  random(length: number): Uint8Array
}

/**
 * What to say: plain text, or text whose formatting has already been worked out.
 *
 * The second is what `fromHtml` and `fromMarkdown` return, so writing a
 * formatted message is one call rather than two fields a caller has to keep in
 * step.
 */
export type MessageBody = string | FormattedText

/**
 * A section of the message being answered, shown in the answer.
 *
 * The text must appear in that message exactly, formatting included, or
 * Telegram refuses the quote. {@link quoteOf} cuts one out of a message so the
 * two cannot disagree.
 */
export interface Quote {
  /** The quoted section, with the formatting it has in the message. */
  readonly text: MessageBody
  /** Where the section starts in the message, in UTF-16 code units. */
  readonly offset?: number
}

/** How to say it. */
export interface SendOptions {
  /**
   * Answer this message, by its number in the conversation it is in — this one,
   * or the one {@link SendOptions.replyIn} names.
   */
  readonly replyTo?: number
  /**
   * The conversation the answered message is in, where it is not this one.
   *
   * Telegram allows this only where that conversation does not protect its
   * content.
   */
  readonly replyIn?: string | PeerRef
  /** Quote a section of the answered message. Needs {@link SendOptions.replyTo}. */
  readonly quote?: Quote
  /**
   * Comment on a channel post, by its number in the channel.
   *
   * The peer a send names is then the channel, and the message goes to the
   * discussion group linked to it, into the post's thread. `replyTo` answers a
   * comment already in that thread, by its number in the group.
   */
  readonly commentOn?: number
  /** The forum topic to send into, where the conversation has topics. */
  readonly topicId?: number
  /** Send without a notification. */
  readonly silent?: boolean
  /** Refuse forwarding of what this sends. */
  readonly protectContent?: boolean
  /** Do not show a preview for a link in the text. */
  readonly noWebpagePreview?: boolean
  /** Show media above the text rather than below it. */
  readonly invertMedia?: boolean
  /**
   * Send at this time, in Unix seconds, rather than now — or `'online'`, the
   * next time the person comes online, which Telegram offers only in a private
   * conversation with somebody whose last-seen time is visible.
   */
  readonly scheduleDate?: number | 'online'
  /** Buttons to attach. */
  readonly markup?: TypeReplyMarkup
  /** The animation to play when it arrives. */
  readonly effect?: bigint
  /** Clear the saved draft for the conversation. */
  readonly clearDraft?: boolean
}

/** Split a body into the two fields a send carries. */
export function bodyOf(body: MessageBody): {
  readonly message: string
  readonly entities: readonly TypeMessageEntity[] | undefined
} {
  if (typeof body === 'string') return { message: body, entities: undefined }

  return {
    message: body.text,
    entities: body.entities.length === 0 ? undefined : body.entities,
  }
}

/** A deduplication key for this send. */
export function keyFor(client: Sending): bigint {
  return randomId((length) => client.random(length))
}

/** The topic every forum has, whose messages carry no reply header at all. */
const GENERAL_TOPIC = 1

/** The schedule date Telegram reads as "when the person next comes online". */
const WHEN_ONLINE = 0x7ffffffe

/** The reply header for a message answering `replyTo`, in `topicId`, quoting `quote`. */
export function replyHeader(
  options: Pick<SendOptions, 'replyTo' | 'topicId' | 'quote'> | undefined,
  replyPeer?: TypeInputPeer,
): TypeInputReplyTo | undefined {
  const topicId = options?.topicId
  const general = topicId === GENERAL_TOPIC
  // A message sent into a topic and answering nothing answers the message that
  // opened the topic, which is how Telegram files it there. The General topic
  // was opened by nothing, and a message in it carries no header.
  const answering = options?.replyTo ?? (general ? undefined : topicId)

  if (answering === undefined) return undefined

  const quote = options?.quote === undefined ? undefined : bodyOf(options.quote.text)

  return {
    _: 'inputReplyToMessage',
    reply_to_msg_id: answering,
    // Only where the answered message is not the topic's own first message, and
    // never for General: Telegram's rule for the field, which otherwise names a
    // topic the header already implies.
    ...(topicId !== undefined && !general && answering !== topicId ? { top_msg_id: topicId } : {}),
    ...(replyPeer === undefined ? {} : { reply_to_peer_id: replyPeer }),
    ...(quote === undefined ? {} : { quote_text: quote.message }),
    ...(quote?.entities === undefined ? {} : { quote_entities: quote.entities }),
    ...(options?.quote?.offset === undefined ? {} : { quote_offset: options.quote.offset }),
  }
}

/** Refuse targeting options that contradict each other, before anything is resolved. */
function checkTargeting(options: SendOptions | undefined): void {
  if (options === undefined) return

  if (options.quote !== undefined && options.replyTo === undefined) {
    throw new ValidationError('a quote needs replyTo: the message it is a section of')
  }
  const offset = options.quote?.offset
  if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
    throw new ValidationError('a quote offset is a whole number of UTF-16 code units from 0')
  }
  if (options.replyIn !== undefined && options.replyTo === undefined) {
    throw new ValidationError('replyIn names where the answered message is, and needs replyTo')
  }
  if (
    options.commentOn !== undefined &&
    (options.replyIn !== undefined || options.topicId !== undefined)
  ) {
    throw new ValidationError(
      "a comment goes into the post's own thread, so it takes no replyIn or topicId",
    )
  }
  const date = options.scheduleDate
  if (date !== undefined && date !== 'online' && (!Number.isInteger(date) || date <= 0)) {
    throw new ValidationError("a schedule date is a Unix time in whole seconds, or 'online'")
  }
}

/** Where a send goes and what it answers, with every name in it resolved. */
export interface Target {
  readonly peer: TypeInputPeer
  readonly reply: TypeInputReplyTo | undefined
}

/**
 * Resolve where a send goes.
 *
 * One place for every send, so a quote, an answer in another conversation and a
 * comment mean the same thing whatever is being sent.
 */
export async function targetOf(
  client: Sending,
  peer: string | PeerRef,
  options: SendOptions | undefined,
): Promise<Target> {
  checkTargeting(options)

  if (options?.commentOn !== undefined) {
    // Loaded when a comment is sent: finding a post's thread is a request of
    // its own that nothing else here needs.
    const { commentTarget } = await import('./compose.js')

    return await commentTarget(client, peer, options.commentOn, options)
  }

  const target = await client.resolve(peer)
  const replyPeer =
    options?.replyIn === undefined ? undefined : await client.resolve(options.replyIn)

  return { peer: target, reply: replyHeader(options, replyPeer) }
}

/** The flags every send shares, in the shape the call wants them. */
export function flagsOf(options: SendOptions | undefined) {
  const date = options?.scheduleDate

  return {
    ...(options?.silent === true ? { silent: true as const } : {}),
    ...(options?.protectContent === true ? { noforwards: true as const } : {}),
    ...(options?.invertMedia === true ? { invert_media: true as const } : {}),
    ...(options?.clearDraft === true ? { clear_draft: true as const } : {}),
    ...(date === undefined ? {} : { schedule_date: date === 'online' ? WHEN_ONLINE : date }),
    ...(options?.markup === undefined ? {} : { reply_markup: options.markup }),
    ...(options?.effect === undefined ? {} : { effect: options.effect }),
  }
}

/**
 * Cut a quote out of a message.
 *
 * ```ts
 * await account.sendText(chat, 'agreed', { replyTo: message.id, quote: quoteOf(message, 0, 12) })
 * ```
 *
 * `start` and `end` are UTF-16 positions in the message's text, `end` exclusive.
 * The formatting inside the section comes along, cut to it; formatting that
 * only begins or ends outside is cut at the edge. A position between the two
 * halves of a surrogate pair is refused, because it splits a character.
 */
export function quoteOf(
  message: {
    readonly text?: string | undefined
    readonly entities?: readonly TypeMessageEntity[] | undefined
  },
  start: number,
  end: number,
): Quote {
  const text = message.text ?? ''

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > text.length ||
    start >= end
  ) {
    throw new ValidationError(`a quote spans part of the text: 0 ≤ start < end ≤ ${text.length}`)
  }
  if (splitsPair(text, start) || splitsPair(text, end)) {
    throw new ValidationError('a quote cannot start or end in the middle of a character')
  }

  const entities: TypeMessageEntity[] = []
  for (const entity of message.entities ?? []) {
    const from = Math.max(entity.offset, start)
    const to = Math.min(entity.offset + entity.length, end)
    if (to > from) entities.push({ ...entity, offset: from - start, length: to - from })
  }

  return { text: { text: text.slice(start, end), entities }, offset: start }
}

/** Whether a position falls between a high and a low surrogate. */
function splitsPair(text: string, position: number): boolean {
  const before = text.charCodeAt(position - 1)
  const after = text.charCodeAt(position)

  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
}

/**
 * The topic a message is in, to send beside it.
 *
 * ```ts
 * await account.sendText(message.chat, 'noted', { ...sameTopic(message) })
 * ```
 *
 * Nothing for a message outside topics or in General, which is where a message
 * with no topic goes anyway.
 */
export function sameTopic(message: {
  readonly id: number
  readonly isTopicMessage: boolean
  readonly replyToTopId?: number | undefined
  readonly replyToMessageId?: number | undefined
  readonly action?: { readonly _: string } | undefined
}): { readonly topicId?: number } {
  // The message that opened a topic is the topic.
  if (message.action?._ === 'messageActionTopicCreate') return { topicId: message.id }
  if (!message.isTopicMessage) return {}

  const topicId = message.replyToTopId ?? message.replyToMessageId

  return topicId === undefined || topicId === GENERAL_TOPIC ? {} : { topicId }
}

/**
 * Say something in a conversation.
 *
 * ```ts
 * await sendText(account, '@someone', 'hello')
 * await sendText(account, chat, fromHtml`<b>hello</b>`, { replyTo: 42 })
 * ```
 *
 * The answer names the message that was sent, where Telegram said which — see
 * {@link SentMessage} for when it does not.
 */
export async function sendText(
  client: Sending,
  peer: string | PeerRef,
  body: MessageBody,
  options?: SendOptions,
): Promise<SentMessage> {
  return await sendTextTo(client, await targetOf(client, peer, options), body, options)
}

/** {@link sendText}, to a target already resolved. */
export async function sendTextTo(
  client: Sending,
  target: Target,
  body: MessageBody,
  options?: SendOptions,
): Promise<SentMessage> {
  const key = keyFor(client)
  const { message, entities } = bodyOf(body)

  const answer = await client.api.messages.sendMessage({
    peer: target.peer,
    message,
    random_id: key,
    ...(entities === undefined ? {} : { entities }),
    ...(target.reply === undefined ? {} : { reply_to: target.reply }),
    ...(options?.noWebpagePreview === true ? { no_webpage: true as const } : {}),
    ...flagsOf(options),
  })

  return sentMessage(answer, key)
}

/**
 * Send something that is not only text.
 *
 * The media is built by the helpers in `files/` — a photo or document already
 * on Telegram, or one uploaded first. The caption and its formatting travel in
 * `body`, which is why this takes the same one as {@link sendText}.
 */
export async function sendMedia(
  client: Sending,
  peer: string | PeerRef,
  media: TypeInputMedia,
  body?: MessageBody,
  options?: SendOptions,
): Promise<SentMessage> {
  return await sendMediaTo(client, await targetOf(client, peer, options), media, body, options)
}

/** {@link sendMedia}, to a target already resolved. */
export async function sendMediaTo(
  client: Sending,
  target: Target,
  media: TypeInputMedia,
  body?: MessageBody,
  options?: SendOptions,
): Promise<SentMessage> {
  const key = keyFor(client)
  const { message, entities } = bodyOf(body ?? '')

  const answer = await client.api.messages.sendMedia({
    peer: target.peer,
    media,
    message,
    random_id: key,
    ...(entities === undefined ? {} : { entities }),
    ...(target.reply === undefined ? {} : { reply_to: target.reply }),
    ...flagsOf(options),
  })

  return sentMessage(answer, key)
}

/** How to change a message. */
export interface EditOptions {
  /** Replace what it carried besides text. */
  readonly media?: TypeInputMedia
  /** Replace its buttons. */
  readonly markup?: TypeReplyMarkup
  /** Do not show a preview for a link in the text. */
  readonly noWebpagePreview?: boolean
  /** Show media above the text rather than below it. */
  readonly invertMedia?: boolean
}

/**
 * Change a message already sent.
 *
 * What may be edited is Telegram's business — somebody else's message, or one
 * past the window it allows, is refused there rather than guessed at here.
 */
export async function editMessage(
  client: Sending,
  peer: string | PeerRef,
  id: number,
  body?: MessageBody,
  options?: EditOptions,
): Promise<SentMessage> {
  const target = await client.resolve(peer)
  const written = body === undefined ? undefined : bodyOf(body)

  const answer = await client.api.messages.editMessage({
    peer: target,
    id,
    ...(written === undefined ? {} : { message: written.message }),
    ...(written?.entities === undefined ? {} : { entities: written.entities }),
    ...(options?.media === undefined ? {} : { media: options.media }),
    ...(options?.markup === undefined ? {} : { reply_markup: options.markup }),
    ...(options?.noWebpagePreview === true ? { no_webpage: true as const } : {}),
    ...(options?.invertMedia === true ? { invert_media: true as const } : {}),
  })

  // An edit carries no deduplication key, so nothing matches on one. The
  // message still comes back in the updates, and a key no send used matches
  // none of them — which is the honest answer rather than a wrong message.
  return sentMessage(answer, 0n)
}

/**
 * Remove messages.
 *
 * `revoke` removes them for everybody rather than only for this account, which
 * is the default because it is what deleting usually means. It does not apply
 * to a channel, where a deletion is always for everybody.
 */
export async function deleteMessages(
  client: Sending,
  peer: string | PeerRef,
  ids: readonly number[],
  options?: { readonly revoke?: boolean },
): Promise<void> {
  const target = await client.resolve(peer)
  const channel = channelFor(target)

  if (channel !== undefined) {
    await client.api.channels.deleteMessages({ channel, id: ids })

    return
  }

  await client.api.messages.deleteMessages({
    id: ids,
    ...(options?.revoke === false ? {} : { revoke: true as const }),
  })
}

/** How to forward. */
export interface ForwardOptions {
  /** Send without a notification. */
  readonly silent?: boolean
  /** Leave off who wrote them. */
  readonly dropAuthor?: boolean
  /** Leave off their captions. */
  readonly dropCaptions?: boolean
  /** Refuse forwarding of the copies. */
  readonly protectContent?: boolean
  /** Send at this time, in Unix seconds, rather than now. */
  readonly scheduleDate?: number
  /** The forum topic to forward into. */
  readonly topicId?: number
}

/**
 * Copy messages from one conversation into another.
 *
 * One deduplication key per message, because Telegram matches them one for one
 * and a short list would be refused.
 */
export async function forwardMessages(
  client: Sending,
  request: {
    readonly from: string | PeerRef
    readonly to: string | PeerRef
    readonly ids: readonly number[]
  },
  options?: ForwardOptions,
): Promise<void> {
  const [from, to] = await Promise.all([client.resolve(request.from), client.resolve(request.to)])

  await client.api.messages.forwardMessages({
    from_peer: from,
    to_peer: to,
    id: request.ids,
    random_id: request.ids.map(() => keyFor(client)),
    ...(options?.silent === true ? { silent: true as const } : {}),
    ...(options?.dropAuthor === true ? { drop_author: true as const } : {}),
    ...(options?.dropCaptions === true ? { drop_media_captions: true as const } : {}),
    ...(options?.protectContent === true ? { noforwards: true as const } : {}),
    ...(options?.scheduleDate === undefined ? {} : { schedule_date: options.scheduleDate }),
    ...(options?.topicId === undefined ? {} : { top_msg_id: options.topicId }),
  })
}

/**
 * What to react with: an emoji, a custom one by its document, or nothing.
 *
 * Nothing removes whatever this account had reacted, which is the same call
 * with an empty list rather than a separate operation.
 */
export type ReactionInput = string | bigint | undefined

/** Turn what a caller said into the reaction a call carries. */
function reactionsOf(reaction: ReactionInput): readonly TypeReaction[] {
  if (reaction === undefined) return []
  if (typeof reaction === 'string') return [{ _: 'reactionEmoji', emoticon: reaction }]

  return [{ _: 'reactionCustomEmoji', document_id: reaction }]
}

/**
 * React to a message, or take a reaction back.
 *
 * ```ts
 * await react(account, chat, 42, '👍')
 * await react(account, chat, 42, undefined) // takes it back
 * ```
 */
export async function react(
  client: Sending,
  peer: string | PeerRef,
  id: number,
  reaction: ReactionInput,
  options?: { readonly big?: boolean },
): Promise<void> {
  const target = await client.resolve(peer)

  await client.api.messages.sendReaction({
    peer: target,
    msg_id: id,
    reaction: reactionsOf(reaction),
    ...(options?.big === true ? { big: true as const } : {}),
  })
}

/** Pin a message in its conversation, or take the pin off. */
export async function pinMessage(
  client: Sending,
  peer: string | PeerRef,
  id: number,
  options?: { readonly unpin?: boolean; readonly silent?: boolean; readonly bothSides?: boolean },
): Promise<void> {
  const target = await client.resolve(peer)

  await client.api.messages.updatePinnedMessage({
    peer: target,
    id,
    ...(options?.unpin === true ? { unpin: true as const } : {}),
    ...(options?.silent === true ? { silent: true as const } : {}),
    // Pinning in a private conversation only pins it for this account unless
    // asked otherwise, which is the opposite of what the flag is named after.
    ...(options?.bothSides === true ? {} : { pm_oneside: true as const }),
  })
}

/**
 * Mark a conversation read, up to a message.
 *
 * Up to the newest when no message is named, which is what "read it" means.
 */
export async function readHistory(
  client: Sending,
  peer: string | PeerRef,
  upTo?: number,
): Promise<void> {
  const target = await client.resolve(peer)
  const channel = channelFor(target)
  const max = upTo ?? 0

  if (channel !== undefined) {
    await client.api.channels.readHistory({ channel, max_id: max })

    return
  }

  await client.api.messages.readHistory({ peer: target, max_id: max })
}

/**
 * Show that this account is doing something in a conversation.
 *
 * Typing by default, because that is what it is almost always used for. The
 * indicator lapses on its own after a few seconds, so anything long-running
 * says so again while it works.
 */
export async function setTyping(
  client: Sending,
  peer: string | PeerRef,
  action?: TypeSendMessageAction,
  options?: { readonly topicId?: number },
): Promise<void> {
  const target = await client.resolve(peer)

  await client.api.messages.setTyping({
    peer: target,
    action: action ?? { _: 'sendMessageTypingAction' },
    ...(options?.topicId === undefined ? {} : { top_msg_id: options.topicId }),
  })
}

/**
 * Fetch messages by number.
 *
 * Reads what came back rather than handing over the answer: the whole point of
 * asking for a message by its number is to look at it.
 *
 * A number naming no message this account can see comes back as an empty
 * message rather than as a gap in the list, which is what Telegram sends and
 * what {@link MessageView.isEmpty} is for.
 */
export async function getMessages(
  client: Sending,
  peer: string | PeerRef,
  ids: readonly number[],
): Promise<readonly MessageView[]> {
  const target = await client.resolve(peer)
  const channel = channelFor(target)
  const wanted = ids.map((id) => ({ _: 'inputMessageID' as const, id }))

  const answer =
    channel === undefined
      ? await client.api.messages.getMessages({ id: wanted })
      : await client.api.channels.getMessages({ channel, id: wanted })

  if (answer._ === 'messages.messagesNotModified') return []

  return answer.messages.map((value) => new MessageView(value))
}

/** How to answer a tapped button. */
export interface CallbackAnswer {
  /** What to show the person who tapped. Nothing dismisses the spinner silently. */
  readonly text?: string
  /** Show it as a dialog rather than as a bar along the top. */
  readonly alert?: boolean
  /** Open this instead of showing anything. */
  readonly url?: string
  /** How long a client may reuse this answer, in seconds. */
  readonly cacheTime?: number
}

/**
 * Answer a tapped button.
 *
 * An account signed in with a bot token receives these over this transport, so
 * this is where they are answered — a Bot API client is a different client with
 * a different connection and cannot answer a query that arrived here. The
 * identifier comes from the update and is good only briefly: Telegram shows the
 * person a spinner until it is answered or it expires.
 */
export async function answerCallback(
  client: Sending,
  queryId: bigint,
  answer?: CallbackAnswer,
): Promise<void> {
  await client.api.messages.setBotCallbackAnswer({
    query_id: queryId,
    cache_time: answer?.cacheTime ?? 0,
    ...(answer?.text === undefined ? {} : { message: answer.text }),
    ...(answer?.alert === true ? { alert: true as const } : {}),
    ...(answer?.url === undefined ? {} : { url: answer.url }),
  })
}

/** How to answer an inline query. */
export interface InlineAnswer {
  /** How long a client may reuse these results, in seconds. */
  readonly cacheTime?: number
  /** Show them as a grid rather than as a list. */
  readonly gallery?: boolean
  /** Cache them for the person who asked rather than for everybody. */
  readonly private?: boolean
  /** The offset a client sends back to ask for the next page. */
  readonly nextOffset?: string
  /** A button offering to open a conversation with the bot instead. */
  readonly switchPm?: TypeInlineBotSwitchPM
}

/**
 * Answer an inline query with results.
 *
 * As with a tapped button: the query arrived on this connection and is answered
 * on it. An empty list is a valid answer and means there is nothing to offer,
 * which is different from not answering at all — that leaves the person waiting
 * until the query expires.
 */
export async function answerInlineQuery(
  client: Sending,
  queryId: bigint,
  results: readonly TypeInputBotInlineResult[],
  answer?: InlineAnswer,
): Promise<void> {
  await client.api.messages.setInlineBotResults({
    query_id: queryId,
    results,
    cache_time: answer?.cacheTime ?? 300,
    ...(answer?.gallery === true ? { gallery: true as const } : {}),
    ...(answer?.private === true ? { private: true as const } : {}),
    ...(answer?.nextOffset === undefined ? {} : { next_offset: answer.nextOffset }),
    ...(answer?.switchPm === undefined ? {} : { switch_pm: answer.switchPm }),
  })
}

/** How to answer a request for delivery options. */
export interface ShippingAnswer {
  /** What can be offered, and what each costs. */
  readonly options?: readonly TypeShippingOption[]
  /**
   * Why nothing can be offered, shown to the person as written.
   *
   * One of the two is required by the protocol: an answer carrying neither
   * offers nothing and gives no reason, which leaves the checkout stuck.
   */
  readonly error?: string
}

/**
 * Answer a request for delivery options.
 *
 * The same rule as a tapped button: the query arrived on this connection, names
 * itself by an identifier, and expires. Telegram asks this only for an invoice
 * that requested an address, and the checkout cannot proceed until it is
 * answered either way.
 */
export async function answerShipping(
  client: Sending,
  queryId: bigint,
  answer: ShippingAnswer,
): Promise<void> {
  if (answer.options === undefined && answer.error === undefined) {
    throw new TypeError('a shipping answer offers options or gives a reason there are none')
  }

  await client.api.messages.setBotShippingResults({
    query_id: queryId,
    ...(answer.error === undefined ? {} : { error: answer.error }),
    ...(answer.options === undefined ? {} : { shipping_options: answer.options }),
  })
}

/**
 * Approve or refuse a payment about to be taken.
 *
 * The last chance to refuse: Telegram charges the card once this succeeds, and
 * refusing needs a reason because the person is shown it. There is no silent
 * refusal, and no answer at all means the payment fails on a timeout with
 * nothing explaining why.
 */
export async function answerPrecheckout(
  client: Sending,
  queryId: bigint,
  refusal?: string,
): Promise<void> {
  await client.api.messages.setBotPrecheckoutResults({
    query_id: queryId,
    ...(refusal === undefined ? { success: true as const } : { error: refusal }),
  })
}

/**
 * Let somebody into a conversation they asked to join, or turn them down.
 *
 * Unlike the query answers this names the chat and the person rather than an
 * identifier, because a join request stands until it is decided rather than
 * expiring. Turning somebody down does not ban them; they may ask again.
 */
export async function decideJoinRequest(
  client: Sending,
  chat: string | PeerRef,
  user: string | PeerRef,
  approved: boolean,
): Promise<void> {
  const peer = await client.resolve(chat)
  const resolved = await client.resolve(user)
  const asUser = userFor(resolved)

  if (asUser === undefined) {
    throw new PeerError('only a person can be let into a conversation')
  }

  await client.api.messages.hideChatJoinRequest({
    peer,
    user_id: asUser,
    ...(approved ? { approved: true as const } : {}),
  })
}
