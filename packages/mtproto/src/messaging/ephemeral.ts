// SPDX-License-Identifier: MIT

/**
 * Ephemeral and welcome messages.
 *
 * An ephemeral message is shown to exactly one person in a conversation and is
 * never part of that conversation's history. Nobody else sees it, it does not
 * count towards anybody's unread total, and Telegram keeps no copy to read
 * back — which is why there is no method here that fetches one. The only
 * ephemeral messages that can be read again are the welcome templates a chat
 * keeps on purpose.
 *
 * ```
 *   ordinary message   ──> lives in the chat's history, has a message id
 *                          everybody shares, can be searched, forwarded, read
 *
 *   ephemeral message  ──> lives in one viewer's client, addressed by
 *                          (chat, receiver, id) because the id alone means
 *                          nothing outside that viewer's view
 *
 *   welcome message    ──> an ephemeral message the chat stores as a template
 *                          and shows to people as they arrive
 * ```
 *
 * The addressing is the thing to get right. Every operation names the receiver
 * as well as the message, because two people can hold different messages under
 * the same number. Guest chats are the exception: a bot answering a guest query
 * has no chat to name and uses the query's identifier instead, which is why
 * `chat` is nullable rather than merely optional.
 *
 * Nothing here is written down. The identifiers are meaningful only while the
 * message is on screen, and an account that stored them would be keeping a
 * record of something Telegram deliberately does not keep.
 */

import { ValidationError } from '@yuigram/core'
import type { MtprotoApi } from '../api.js'
import type {
  TypeEphemeralMessage,
  TypeInputMedia,
  TypeInputPeer,
  TypeInputReplyTo,
  TypeInputRichMessage,
  TypeInputUser,
  TypeMessageEntity,
  TypeMessageMedia,
  TypeReplyMarkup,
} from '../generated/api/types/index.js'
import { userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'
import type { TlValue } from '../tl/index.js'
import { bodyOf, type MessageBody } from './send.js'

/** What sending an ephemeral message needs from a client. */
export interface Ephemeral {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
  /** Bytes for the deduplication key. Telegram refuses a send without one. */
  random(length: number): Uint8Array
}

/**
 * One ephemeral message, read.
 *
 * Held apart from {@link MessageView} rather than folded into it: this is a
 * different TL type carrying a different set of fields, and the one that
 * matters most — the person it is visible to — has no counterpart on an
 * ordinary message at all.
 */
export class EphemeralMessageView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeEphemeralMessage

  constructor(value: TypeEphemeralMessage) {
    this.raw = value
  }

  /**
   * Its number, which means something only together with the receiver.
   *
   * Two people can hold different ephemeral messages under the same number, so
   * this is not an address on its own.
   */
  get id(): number {
    return this.raw.id
  }

  /** The person this message is visible to. */
  get receiver(): PeerRef {
    return { kind: 'user', id: this.raw.receiver_id }
  }

  /** Who sent it. */
  get sender(): PeerRef | undefined {
    return peerRefOf(this.raw.from_id)
  }

  /** The conversation it was shown in, absent in a guest chat. */
  get chat(): PeerRef | undefined {
    return this.raw.peer_id === undefined ? undefined : peerRefOf(this.raw.peer_id)
  }

  /** Whether this account sent it. */
  get isOutgoing(): boolean {
    return this.raw.out === true
  }

  /** Whether the chat keeps this as a welcome template rather than showing it once. */
  get isWelcomeTemplate(): boolean {
    return this.raw.welcome_template === true
  }

  /** The text, which is empty for a message carrying only media. */
  get text(): string {
    return this.raw.message
  }

  /** The formatting ranges over the text, where it has any. */
  get entities(): readonly TypeMessageEntity[] | undefined {
    return this.raw.entities
  }

  /** What it carries besides text, where it carries anything. */
  get media(): TypeMessageMedia | undefined {
    return this.raw.media
  }

  /** The buttons under it, where it has any. */
  get replyMarkup(): TypeReplyMarkup | undefined {
    return this.raw.reply_markup
  }

  /** When it was sent, in Unix seconds. */
  get date(): number {
    return this.raw.date
  }

  /** The forum topic it belongs to, where the conversation has topics. */
  get topicId(): number | undefined {
    return this.raw.top_msg_id
  }

  /** The message it is anchored to, where it follows one. */
  get anchorMessageId(): number | undefined {
    return this.raw.anchor_msg_id
  }
}

/**
 * Where an ephemeral message is addressed.
 *
 * `chat` is `null` rather than absent for a guest chat, so leaving it out is a
 * mistake the compiler catches instead of a silent send to the wrong place.
 */
export interface EphemeralTarget {
  /** The conversation, or `null` in a guest chat where the query names it. */
  readonly chat: string | PeerRef | null
  /** The person the message is visible to. */
  readonly receiver: string | PeerRef
}

/** Resolve the receiver, which is always one person. */
async function receiverOf(client: Ephemeral, receiver: string | PeerRef): Promise<TypeInputUser> {
  const resolved = await client.resolve(receiver)
  const user = userFor(resolved)

  if (user === undefined) {
    throw new ValidationError('an ephemeral message is visible to one person, not a conversation')
  }

  return user
}

/** Resolve the conversation, which a guest chat does not have. */
async function chatOf(
  client: Ephemeral,
  chat: string | PeerRef | null,
): Promise<{ peer?: TypeInputPeer }> {
  if (chat === null) return {}

  return { peer: await client.resolve(chat) }
}

/** What an ephemeral message may carry besides its text. */
export interface EphemeralContent {
  /** Media to attach, already on Telegram or uploaded first. */
  readonly media?: TypeInputMedia
  /** Rich content, sent instead of the plain text. */
  readonly richMessage?: TypeInputRichMessage
  /** The buttons under it. */
  readonly replyMarkup?: TypeReplyMarkup
  /** Show a link preview above the text rather than below it. */
  readonly invertMedia?: boolean
}

/** How an ephemeral message is sent. */
export interface SendEphemeralOptions extends EphemeralContent {
  /** Answer a message in the conversation, by its number. */
  readonly replyTo?: number
  /** Answer another ephemeral message, by its number. */
  readonly replyToEphemeral?: number
  /** In a guest chat, the query this answers. */
  readonly queryId?: bigint
  /** Keep this as the chat's welcome template rather than showing it once. */
  readonly welcome?: boolean
  /** Anchor it to the message it answers, so it moves with it. */
  readonly anchor?: boolean
  /** Refuse forwarding of what this sends. */
  readonly protectContent?: boolean
}

/** Which reply the options ask for, where they ask for one. */
function replyOf(options: SendEphemeralOptions): { reply_to?: TypeInputReplyTo } {
  if (options.replyToEphemeral !== undefined) {
    return { reply_to: { _: 'inputReplyToEphemeralMessage', id: options.replyToEphemeral } }
  }
  if (options.replyTo !== undefined) {
    return { reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: options.replyTo } }
  }

  return {}
}

/**
 * Send a message only one person can see.
 *
 * It is not added to the conversation, so nothing is returned that could be
 * used to find it again: what comes back is the message as sent, and acting on
 * it later means naming the same chat, receiver and number.
 */
export async function sendEphemeralMessage(
  client: Ephemeral,
  target: EphemeralTarget,
  body: MessageBody,
  options: SendEphemeralOptions = {},
): Promise<EphemeralMessageView> {
  const { message, entities } = bodyOf(body)

  if (message === '' && options.media === undefined && options.richMessage === undefined) {
    throw new ValidationError('an ephemeral message needs text, media or rich content')
  }
  if (target.chat === null && options.queryId === undefined) {
    throw new ValidationError('a guest chat names the query this answers rather than a chat')
  }

  const answer = await client.api.ephemeral.sendMessage({
    ...(await chatOf(client, target.chat)),
    receiver_id: await receiverOf(client, target.receiver),
    message,
    random_id: randomKey(client),
    ...(entities === undefined ? {} : { entities: [...entities] }),
    ...(options.media === undefined ? {} : { media: options.media }),
    ...(options.richMessage === undefined ? {} : { rich_message: options.richMessage }),
    ...(options.replyMarkup === undefined ? {} : { reply_markup: options.replyMarkup }),
    ...(options.queryId === undefined ? {} : { query_id: options.queryId }),
    ...(options.welcome === true ? { welcome: true } : {}),
    ...(options.anchor === true ? { anchor: true } : {}),
    ...(options.protectContent === true ? { noforwards: true } : {}),
    ...(options.invertMedia === true ? { invert_media: true } : {}),
    ...replyOf(options),
  })

  return sentEphemeral(answer as unknown as TlValue)
}

/** A deduplication key, read as a signed 64-bit number the way every send does. */
function randomKey(client: Ephemeral): bigint {
  const bytes = client.random(8)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  return view.getBigInt64(0, true)
}

/**
 * Find the ephemeral message in what a send or an edit answered with.
 *
 * These answers carry the message inside an ephemeral update rather than beside
 * the updates, because the message was never added to a conversation and so has
 * nothing else to be attached to.
 */
function sentEphemeral(answer: TlValue): EphemeralMessageView {
  for (const update of updatesOf(answer)) {
    if (update._ === 'updateNewEphemeralMessage' || update._ === 'updateEditEphemeralMessage') {
      return new EphemeralMessageView(update['message'] as TypeEphemeralMessage)
    }
  }

  throw new ValidationError('Telegram did not describe the ephemeral message')
}

/** The updates an answer carries, however it carries them. */
function updatesOf(answer: TlValue): readonly TlValue[] {
  if (answer._ === 'updateShort') return [answer['update'] as TlValue]

  const updates = answer['updates']

  return Array.isArray(updates) ? (updates as TlValue[]) : []
}

/** What an edit changes. Only the fields given are sent. */
export interface EditEphemeralOptions extends EphemeralContent {
  /** The new text. */
  readonly text?: MessageBody
  /** Whether it stays the chat's welcome template. */
  readonly welcome?: boolean
}

/** Change an ephemeral message the account sent. */
export async function editEphemeralMessage(
  client: Ephemeral,
  target: EphemeralTarget,
  messageId: number,
  change: EditEphemeralOptions,
): Promise<EphemeralMessageView> {
  const written = change.text === undefined ? undefined : bodyOf(change.text)

  if (
    written === undefined &&
    change.media === undefined &&
    change.richMessage === undefined &&
    change.replyMarkup === undefined
  ) {
    throw new ValidationError('say what to change about the ephemeral message')
  }

  const answer = await client.api.ephemeral.editMessage({
    ...(await chatOf(client, target.chat)),
    receiver_id: await receiverOf(client, target.receiver),
    id: messageId,
    ...(written === undefined ? {} : { message: written.message }),
    ...(written?.entities === undefined ? {} : { entities: [...written.entities] }),
    ...(change.media === undefined ? {} : { media: change.media }),
    ...(change.richMessage === undefined ? {} : { rich_message: change.richMessage }),
    ...(change.replyMarkup === undefined ? {} : { reply_markup: change.replyMarkup }),
    ...(change.welcome === true ? { welcome: true } : {}),
    ...(change.invertMedia === true ? { invert_media: true } : {}),
  })

  return sentEphemeral(answer as unknown as TlValue)
}

/**
 * Take back an ephemeral message.
 *
 * It is gone from the one view it existed in, which is the whole of it: there
 * is no history to remove it from and nobody else was shown it.
 */
export async function deleteEphemeralMessage(
  client: Ephemeral,
  target: EphemeralTarget,
  messageId: number,
): Promise<void> {
  await client.api.ephemeral.deleteMessage({
    ...(await chatOf(client, target.chat)),
    receiver_id: await receiverOf(client, target.receiver),
    id: messageId,
  })
}

/** What a bot answered when a button on an ephemeral message was pressed. */
export interface EphemeralButtonAnswer {
  /** What to show, where the bot said anything. */
  readonly message?: string
  /** Whether to show it as an alert rather than a toast. */
  readonly alert: boolean
  /** A page to open, where the bot named one. */
  readonly url?: string
  /** How long a client may reuse this answer, in seconds. */
  readonly cacheTime: number
}

/**
 * Press a button on an ephemeral message, as the person shown it.
 *
 * The chat is required here even though sending allows none: Telegram routes
 * the query through the conversation, and a guest chat's buttons are answered
 * by the bot that owns the query rather than pressed by this account.
 */
export async function getEphemeralCallbackAnswer(
  client: Ephemeral,
  chat: string | PeerRef,
  messageId: number,
  data?: Uint8Array | string,
): Promise<EphemeralButtonAnswer> {
  const answer = await client.api.ephemeral.getCallbackAnswer({
    peer: await client.resolve(chat),
    id: messageId,
    ...(data === undefined
      ? {}
      : { data: typeof data === 'string' ? new TextEncoder().encode(data) : data }),
  })

  return {
    ...(answer.message === undefined ? {} : { message: answer.message }),
    alert: answer.alert === true,
    ...(answer.url === undefined ? {} : { url: answer.url }),
    cacheTime: answer.cache_time,
  }
}

/* -------------------------------------------------------------------------- */
/* Welcome messages                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The welcome templates a chat shows people as they arrive.
 *
 * These are the only ephemeral messages that can be read back, because the chat
 * keeps them on purpose. Telegram answers a hash-compared read with "not
 * modified"; nothing here holds a previous answer to compare against, so the
 * hash sent is zero and the answer is always the list.
 */
export async function getWelcomeMessages(
  client: Ephemeral,
  chat: string | PeerRef,
): Promise<readonly EphemeralMessageView[]> {
  const answer = await client.api.ephemeral.getWelcomeMessages({
    peer: await client.resolve(chat),
    hash: 0n,
  })

  if (answer._ === 'ephemeral.welcomeMessagesNotModified') {
    throw new ValidationError('Telegram answered that the welcome messages are unchanged')
  }

  return answer.messages.map((one) => new EphemeralMessageView(one))
}

/** Remove one of a chat's welcome templates. */
export async function deleteWelcomeMessage(
  client: Ephemeral,
  chat: string | PeerRef,
  messageId: number,
): Promise<void> {
  await client.api.ephemeral.deleteWelcomeMessage({
    peer: await client.resolve(chat),
    id: messageId,
  })
}

/** Remove every welcome template a chat has. */
export async function deleteAllWelcomeMessages(
  client: Ephemeral,
  chat: string | PeerRef,
): Promise<void> {
  await client.api.ephemeral.deleteAllWelcomeMessages({ peer: await client.resolve(chat) })
}
