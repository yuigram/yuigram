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

import { PeerError } from '@yuigram/core'
import type { MtprotoApi } from '../api.js'
import { MessageView } from '../entities/message.js'
import type { FormattedText } from '../format/text.js'
import type {
  TypeInlineBotSwitchPM,
  TypeInputBotInlineResult,
  TypeInputMedia,
  TypeInputPeer,
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

/** How to say it. */
export interface SendOptions {
  /** Answer this message, by its number in the same conversation. */
  readonly replyTo?: number
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
  /** Send at this time, in Unix seconds, rather than now. */
  readonly scheduleDate?: number
  /** Buttons to attach. */
  readonly markup?: TypeReplyMarkup
  /** The animation to play when it arrives. */
  readonly effect?: bigint
  /** Clear the saved draft for the conversation. */
  readonly clearDraft?: boolean
}

/** Split a body into the two fields a send carries. */
function bodyOf(body: MessageBody): {
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
function keyFor(client: Sending): bigint {
  return randomId((length) => client.random(length))
}

/** The reply header a send carries, where it answers something or sits in a topic. */
function replyOf(options: SendOptions | undefined) {
  const topicId = options?.topicId
  // A message sent into a topic and answering nothing still answers the message
  // that opened the topic, which is how Telegram files it there.
  const answering = options?.replyTo ?? topicId

  if (answering === undefined) return undefined

  return {
    _: 'inputReplyToMessage' as const,
    reply_to_msg_id: answering,
    ...(topicId === undefined ? {} : { top_msg_id: topicId }),
  }
}

/** The flags every send shares, in the shape the call wants them. */
function flagsOf(options: SendOptions | undefined) {
  return {
    ...(options?.silent === true ? { silent: true as const } : {}),
    ...(options?.protectContent === true ? { noforwards: true as const } : {}),
    ...(options?.invertMedia === true ? { invert_media: true as const } : {}),
    ...(options?.clearDraft === true ? { clear_draft: true as const } : {}),
    ...(options?.scheduleDate === undefined ? {} : { schedule_date: options.scheduleDate }),
    ...(options?.markup === undefined ? {} : { reply_markup: options.markup }),
    ...(options?.effect === undefined ? {} : { effect: options.effect }),
  }
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
  const target = await client.resolve(peer)
  const key = keyFor(client)
  const { message, entities } = bodyOf(body)
  const reply = replyOf(options)

  const answer = await client.api.messages.sendMessage({
    peer: target,
    message,
    random_id: key,
    ...(entities === undefined ? {} : { entities }),
    ...(reply === undefined ? {} : { reply_to: reply }),
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
  const target = await client.resolve(peer)
  const key = keyFor(client)
  const { message, entities } = bodyOf(body ?? '')
  const reply = replyOf(options)

  const answer = await client.api.messages.sendMedia({
    peer: target,
    media,
    message,
    random_id: key,
    ...(entities === undefined ? {} : { entities }),
    ...(reply === undefined ? {} : { reply_to: reply }),
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
