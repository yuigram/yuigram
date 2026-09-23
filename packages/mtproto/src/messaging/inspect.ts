/**
 * Finding messages, and what hangs off them.
 *
 * The album a message belongs to, the message it answers, the one a link names,
 * the one a tapped button was on; the reactions and fact checks on several at
 * once; what Telegram would preview for a link; the effects a send may name.
 *
 * Loaded when one of them is called. Answers that name several things are
 * positional — one entry per thing asked for, in the order asked, with a gap
 * where there is nothing — because a caller pairing them up by position must
 * not be handed a shorter list that pairs them wrongly.
 */

import { PeerError, readLink, ValidationError } from '@yuigram/core'
import { MessageView } from '../entities/message.js'
import type {
  TypeAvailableEffect,
  TypeDocument,
  TypeFactCheck,
  TypeInputMessage,
  TypeInputPeer,
  TypeMessage,
  TypeMessageMedia,
  TypeMessageReactions,
} from '../generated/api/types/index.js'
import { channelFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { TlValue } from '../tl/index.js'
import { bodyOf, getMessages, type MessageBody, type Sending } from './send.js'

/** Fetch messages by any of the ways a message can be named, from the right table. */
async function fetchNamed(
  client: Sending,
  peer: TypeInputPeer,
  wanted: readonly TypeInputMessage[],
): Promise<readonly MessageView[]> {
  const channel = channelFor(peer)
  const answer =
    channel === undefined
      ? await client.api.messages.getMessages({ id: [...wanted] })
      : await client.api.channels.getMessages({ channel, id: [...wanted] })

  if (answer._ === 'messages.messagesNotModified') return []

  return answer.messages.map((value: TypeMessage) => new MessageView(value))
}

/** The first message of an answer, where it is one this account can see. */
function present(views: readonly MessageView[]): MessageView | undefined {
  const [first] = views

  return first === undefined || first.isEmpty ? undefined : first
}

/* -------------------------------------------------------------------------- */
/* Albums, replies, links and buttons                                          */
/* -------------------------------------------------------------------------- */

/** How far either side of a message an album can reach. */
function albumReach(peer: TypeInputPeer): number {
  // An album is at most ten messages, sent together. In a channel the numbers
  // are the channel's own and nine either side covers any album the message is
  // in. Elsewhere they are shared with every other private chat and basic group
  // on the account, so something sent to another conversation in the same
  // moment can sit between two items; the window is wider for that.
  return channelFor(peer) === undefined ? 19 : 9
}

/**
 * Every message of the album one message belongs to, in the album's order.
 *
 * Refused for a message that is not in an album, which is a different answer
 * from an album of one.
 */
export async function getMessageGroup(
  client: Sending,
  peer: string | PeerRef,
  id: number,
): Promise<readonly MessageView[]> {
  const target = await client.resolve(peer)
  const reach = albumReach(target)
  const ids: number[] = []
  for (let at = Math.max(1, id - reach); at <= id + reach; at += 1) ids.push(at)

  const views = await fetchNamed(
    client,
    target,
    ids.map((one) => ({ _: 'inputMessageID' as const, id: one })),
  )
  const group = views.find((view) => view.id === id)?.groupedId

  if (group === undefined) throw new ValidationError(`message ${id} is not part of an album`)

  return views.filter((view) => view.groupedId === group).sort((a, b) => a.id - b.id)
}

/**
 * The message a message answers.
 *
 * Asked for as "whatever this one replies to" rather than by the number in its
 * reply header, because the header's number may belong to another
 * conversation and Telegram knows which. Nothing where the message answers
 * nothing, or where what it answered is gone.
 */
export async function getReplyTo(
  client: Sending,
  message: MessageView,
): Promise<MessageView | undefined> {
  if (message.replyToMessageId === undefined) return undefined

  const chat = message.chat
  if (chat === undefined) throw new PeerError('the message names no conversation to look in')

  const target = await client.resolve(chat)

  return present(await fetchNamed(client, target, [{ _: 'inputMessageReplyTo', id: message.id }]))
}

/**
 * The message a tapped button was on.
 *
 * A bot is told which query and which message, and asks for the message
 * through the query — the only way to be shown a message in a conversation it
 * could otherwise not read. Nothing where the message is gone.
 */
export async function getCallbackQueryMessage(
  client: Sending,
  query: { readonly peer: string | PeerRef; readonly messageId: number; readonly queryId: bigint },
): Promise<MessageView | undefined> {
  const target = await client.resolve(query.peer)

  return present(
    await fetchNamed(client, target, [
      { _: 'inputMessageCallbackQuery', id: query.messageId, query_id: query.queryId },
    ]),
  )
}

/**
 * The message a link names.
 *
 * Reading the link is pure; finding what it names is not. A public link is
 * resolved by its username. A private one names a channel by number, which this
 * account can only reach if it has met the channel — a private link does not
 * grant access, and is refused rather than guessed at. A link to a comment
 * finds the comment in the post's discussion group.
 */
export async function getMessageByLink(
  client: Sending,
  link: string,
): Promise<MessageView | undefined> {
  const read = readLink(link)

  if (read?.kind !== 'message') {
    throw new ValidationError(`${JSON.stringify(link)} is not a link to a message`)
  }

  const chat: string | PeerRef = 'username' in read.chat ? read.chat.username : read.chat.channel

  if (read.comment !== undefined) {
    const { discussionOf } = await import('./compose.js')
    const discussion = await discussionOf(client, chat, read.id)
    const [comment] = await getMessages(client, discussion.chat, [read.comment])

    return comment === undefined || comment.isEmpty ? undefined : comment
  }

  const [found] = await getMessages(client, chat, [read.id])

  return found === undefined || found.isEmpty ? undefined : found
}

/**
 * Messages outside channels, by number alone.
 *
 * In private chats and basic groups a message's number is unique to the
 * account rather than to the conversation, so it can be fetched without saying
 * where it is: a number names at most one message the account can see, and
 * which conversation it is in comes back with it. Channels number their own messages, so a channel message cannot be
 * found this way — it comes back as a gap.
 */
export async function getMessagesOutsideChannels(
  client: Sending,
  ids: readonly number[],
): Promise<readonly (MessageView | undefined)[]> {
  if (ids.length === 0) return []

  const answer = await client.api.messages.getMessages({
    id: ids.map((id) => ({ _: 'inputMessageID' as const, id })),
  })
  if (answer._ === 'messages.messagesNotModified') return ids.map(() => undefined)

  const found = new Map<number, MessageView>()
  for (const value of answer.messages) {
    const view = new MessageView(value)
    if (!view.isEmpty) found.set(view.id, view)
  }

  return ids.map((id) => found.get(id))
}

/* -------------------------------------------------------------------------- */
/* Reactions and fact checks                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The reactions on several messages of one conversation.
 *
 * One entry per message asked for; a gap where Telegram had nothing to say
 * about one, which is what a message with no reactions and a message that is
 * gone both look like.
 */
export async function getMessageReactions(
  client: Sending & { feed?(value: TlValue): Promise<void> },
  peer: string | PeerRef,
  ids: readonly number[],
): Promise<readonly (TypeMessageReactions | undefined)[]> {
  if (ids.length === 0) return []

  const target = await client.resolve(peer)
  const answer = await client.api.messages.getMessagesReactions({ peer: target, id: [...ids] })
  // The answer is updates: the same ones a reaction arriving over the
  // connection would be, and the account keeps its own record of reactions.
  await client.feed?.(answer as unknown as TlValue)

  const found = new Map<number, TypeMessageReactions>()
  const value = answer as unknown as TlValue
  const updates =
    value._ === 'updateShort'
      ? [value['update'] as TlValue]
      : ((value['updates'] as TlValue[] | undefined) ?? [])

  for (const update of updates) {
    if (update._ !== 'updateMessageReactions') continue

    const id = update['msg_id']
    if (typeof id === 'number') found.set(id, update['reactions'] as TypeMessageReactions)
  }

  return ids.map((id) => found.get(id))
}

/**
 * The reactions on messages that may be in different conversations.
 *
 * Asked for one conversation at a time, because the protocol asks that way,
 * and answered in the order the messages were given.
 */
export async function getReactionsOf(
  client: Sending & { feed?(value: TlValue): Promise<void> },
  messages: readonly MessageView[],
): Promise<readonly (TypeMessageReactions | undefined)[]> {
  const byChat = new Map<string, { chat: PeerRef; ids: number[] }>()

  for (const message of messages) {
    const chat = message.chat
    if (chat === undefined) continue

    const key = `${chat.kind}:${chat.id}`
    const entry = byChat.get(key) ?? { chat, ids: [] }
    entry.ids.push(message.id)
    byChat.set(key, entry)
  }

  const answers = new Map<string, TypeMessageReactions | undefined>()
  for (const [key, { chat, ids }] of byChat) {
    const found = await getMessageReactions(client, chat, ids)
    for (const [at, id] of ids.entries()) answers.set(`${key}:${id}`, found[at])
  }

  return messages.map((message) => {
    const chat = message.chat

    return chat === undefined ? undefined : answers.get(`${chat.kind}:${chat.id}:${message.id}`)
  })
}

/**
 * The fact checks on several messages of one conversation.
 *
 * One entry per message, in the order asked. A fact check that exists but has
 * not been written yet — Telegram marks it as needing one — comes back as it
 * is, because "a check is pending" and "there is no check" are different
 * answers.
 */
export async function getFactCheck(
  client: Sending,
  peer: string | PeerRef,
  ids: readonly number[],
): Promise<readonly TypeFactCheck[]> {
  if (ids.length === 0) return []

  const target = await client.resolve(peer)
  const answer = await client.api.messages.getFactCheck({ peer: target, msg_id: [...ids] })

  if (answer.length !== ids.length) {
    throw new ValidationError(
      `asked about ${ids.length} messages and Telegram answered ${answer.length}`,
    )
  }

  return answer
}

/* -------------------------------------------------------------------------- */
/* Previews and effects                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What Telegram would show under a message with this text.
 *
 * Nothing where the text has no link Telegram would preview. The preview is
 * Telegram's reading of the link — its title, its picture — and asking for it
 * sends nothing anywhere.
 */
export async function getWebPagePreview(
  client: Sending,
  text: MessageBody,
): Promise<Extract<TypeMessageMedia, { _: 'messageMediaWebPage' }> | undefined> {
  const { message, entities } = bodyOf(text)
  const answer = await client.api.messages.getWebPagePreview({
    message,
    ...(entities === undefined ? {} : { entities }),
  })

  const media = answer.media
  if (media._ !== 'messageMediaWebPage' || media.webpage._ === 'webPageEmpty') return undefined

  return media
}

/** The animations a send may name, and the documents they are drawn from. */
export interface MessageEffects {
  readonly effects: readonly TypeAvailableEffect[]
  readonly documents: readonly TypeDocument[]
  /** The list's version, to pass back so an unchanged list is not sent again. */
  readonly hash: number
}

/**
 * The animations a send may name with its `effect` option.
 *
 * Given the version already held, answers nothing when the list has not
 * changed — which is how Telegram says "what you have is current".
 */
export async function getAvailableMessageEffects(
  client: Sending,
  hash = 0,
): Promise<MessageEffects | undefined> {
  const answer = await client.api.messages.getAvailableEffects({ hash })

  if (answer._ === 'messages.availableEffectsNotModified') return undefined

  return { effects: answer.effects, documents: answer.documents, hash: answer.hash }
}
