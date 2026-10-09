// SPDX-License-Identifier: MIT

/**
 * Topics in a forum, which is a supergroup whose messages are filed by thread.
 *
 * A forum splits one conversation into named threads, each with an icon, an
 * order and a state of its own. Every message in such a group belongs to a
 * topic, and a topic is identified by the number of the service message that
 * created it — so "topic 17" and "message 17" are the same number, and a topic
 * identifier is a message identifier that happens to be the first of its
 * thread.
 *
 * ```
 *   a supergroup ──> channels.toggleForum ──> a forum
 *                                              ├─ topic 1  (General, always)
 *                                              ├─ topic 42
 *                                              └─ topic 91
 * ```
 *
 * **The General topic is not like the others.** It is topic 1, it exists from
 * the moment the forum does, and it cannot be renamed by the same call, closed
 * the same way or deleted at all. What it can be is hidden, which is a separate
 * operation here rather than a special case of editing, because the request
 * that hides it is the same one that edits a topic and the difference is
 * entirely in which identifier it names.
 *
 * **Most of these are answered with the service message they caused.** Creating
 * a topic, renaming one, closing one: each of those is a visible event in the
 * conversation, and the answer carries it. So they hand it back — a caller that
 * wants the topic's identifier after creating one has it without a second
 * request — and also feed it to the account, so its own handlers see the change
 * it made.
 */

import { ValidationError } from '@yuigram/core'
import { applyUpdates, type Chatting, removeInStages } from '../chats/common.js'
import { ForumTopicView } from '../entities/chat.js'
import type { TypeForumTopic } from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { randomId, type SentMessage, sentMessage } from '../normalize/sent.js'

/** What a forum operation needs: the `chats` context plus a deduplication key. */
export interface Foruming extends Chatting {
  /** Bytes for the deduplication key a topic creation carries. */
  random(length: number): Uint8Array
}

/** The topic every forum has, from the moment it is one. */
export const GENERAL_TOPIC = 1

/** A topic, by its number or as one already read. */
export type TopicRef = number | ForumTopicView

/** The number identifying a topic, however it was named. */
function topicId(topic: TopicRef): number {
  return typeof topic === 'number' ? topic : topic.id
}

/**
 * The icon a topic is shown with.
 *
 * Two kinds, and Telegram takes them in different fields. A colour is one of
 * the six the client offers; a custom emoji is the identifier of one the
 * account may use. Named as a union here so a caller passes what it has rather
 * than filling in one of two fields and leaving the other out.
 */
export type TopicIcon = { readonly colour: number } | { readonly emoji: bigint }

/** Split an icon into the two fields the request carries. */
function iconOf(icon: TopicIcon | undefined) {
  if (icon === undefined) return {}

  return 'colour' in icon ? { icon_color: icon.colour } : { icon_emoji_id: icon.emoji }
}

/** How a topic is created. */
export interface NewTopic {
  /** What to call it. */
  readonly title: string
  /** The icon to show beside it. */
  readonly icon?: TopicIcon
  /** Post it as this peer rather than as this account. */
  readonly as?: string | PeerRef
}

/**
 * Open a new topic in a forum.
 *
 * ```ts
 * const opened = await createTopic(account, '@forum', { title: 'Releases' })
 * console.log(opened.id) // also the topic's identifier
 * ```
 *
 * Answered with the service message that announced it, whose identifier *is*
 * the new topic's identifier — so nothing further has to be fetched to start
 * posting into it.
 */
export async function createTopic(
  client: Foruming,
  chat: string | PeerRef,
  topic: NewTopic,
): Promise<SentMessage> {
  if (topic.title.length === 0) {
    throw new ValidationError('a forum topic needs a title')
  }

  const key = randomId((length) => client.random(length))
  const answer = await client.api.messages.createForumTopic({
    peer: await client.resolve(chat),
    title: topic.title,
    ...iconOf(topic.icon),
    ...(topic.as === undefined ? {} : { send_as: await client.resolve(topic.as) }),
    random_id: key,
  })

  await applyUpdates(client, answer)

  return sentMessage(answer, key)
}

/** What about a topic is being changed. Anything left out is left alone. */
export interface TopicEdit {
  /** Rename it. */
  readonly title?: string
  /**
   * Change its icon, or take a custom one away.
   *
   * `null` clears a custom emoji back to the plain icon. Only an emoji can be
   * changed after creation — the colour is fixed when the topic is opened — so
   * this takes an identifier rather than the union a creation takes.
   */
  readonly emoji?: bigint | null
  /** Close it to new messages, or open it again. */
  readonly closed?: boolean
  /** Hide it. Only the General topic can be hidden. */
  readonly hidden?: boolean
}

/**
 * Change a topic: its name, its icon, whether it is closed.
 *
 * ```ts
 * await editTopic(account, '@forum', 42, { title: 'Releases (archive)' })
 * ```
 *
 * Every field is optional and an omitted one is left as it was, which is why
 * they are spelled as absent rather than as `undefined` in the request: a field
 * present and empty is a change to empty, and a field absent is no change.
 * Clearing a custom emoji is the exception and is spelled `null`, because
 * "no emoji" is itself a value Telegram has to be told.
 */
export async function editTopic(
  client: Foruming,
  chat: string | PeerRef,
  topic: TopicRef,
  edit: TopicEdit,
): Promise<SentMessage> {
  if (Object.values(edit).every((value) => value === undefined)) {
    throw new ValidationError('editing a topic needs something to change')
  }

  const answer = await client.api.messages.editForumTopic({
    peer: await client.resolve(chat),
    topic_id: topicId(topic),
    ...(edit.title === undefined ? {} : { title: edit.title }),
    // Zero is how the schema spells "no custom emoji", which is why clearing is
    // a value rather than an omission.
    ...(edit.emoji === undefined ? {} : { icon_emoji_id: edit.emoji ?? 0n }),
    ...(edit.closed === undefined ? {} : { closed: edit.closed }),
    ...(edit.hidden === undefined ? {} : { hidden: edit.hidden }),
  })

  await applyUpdates(client, answer)

  return sentMessage(answer, 0n)
}

/**
 * Close a topic to new messages, or open it again.
 *
 * ```ts
 * await setTopicClosed(account, '@forum', 42, true)
 * ```
 *
 * The same request {@link editTopic} makes, named for what it does, because
 * closing a thread is the common case and spelling it as an edit with one field
 * reads like a rename that forgot its title.
 */
export async function setTopicClosed(
  client: Foruming,
  chat: string | PeerRef,
  topic: TopicRef,
  closed: boolean,
): Promise<SentMessage> {
  return await editTopic(client, chat, topic, { closed })
}

/**
 * Hide the General topic, or show it again.
 *
 * ```ts
 * await setGeneralTopicHidden(account, '@forum', true)
 * ```
 *
 * Only the General topic can be hidden, and it is always topic 1 — so this
 * names no topic. Hiding it is how a forum stops showing the thread that
 * existed before it had threads.
 */
export async function setGeneralTopicHidden(
  client: Foruming,
  chat: string | PeerRef,
  hidden: boolean,
): Promise<SentMessage> {
  return await editTopic(client, chat, GENERAL_TOPIC, { hidden })
}

/**
 * Pin a topic to the top of the forum, or unpin it.
 *
 * ```ts
 * await setTopicPinned(account, '@forum', 42, true)
 * ```
 *
 * Answered with nothing rather than with a message: pinning changes how the
 * list is ordered for everyone and announces nothing in the conversation.
 */
export async function setTopicPinned(
  client: Foruming,
  chat: string | PeerRef,
  topic: TopicRef,
  pinned: boolean,
): Promise<void> {
  await client.api.messages.updatePinnedForumTopic({
    peer: await client.resolve(chat),
    topic_id: topicId(topic),
    pinned,
  })
}

/**
 * Put the pinned topics in a given order.
 *
 * ```ts
 * await reorderPinnedTopics(account, '@forum', [42, 91])
 * ```
 *
 * The order given is the whole order, so a topic left out of it is unpinned.
 * That is Telegram's rule rather than one imposed here, and it is why `force`
 * exists: without it the server refuses an order that would unpin something,
 * which is the right default for a caller that built its list from a page.
 */
export async function reorderPinnedTopics(
  client: Foruming,
  chat: string | PeerRef,
  order: readonly TopicRef[],
  options?: { readonly unpinTheRest?: boolean },
): Promise<void> {
  await client.api.messages.reorderPinnedForumTopics({
    peer: await client.resolve(chat),
    order: order.map(topicId),
    ...(options?.unpinTheRest === true ? { force: true } : {}),
  })
}

/**
 * Delete a topic's messages.
 *
 * ```ts
 * await deleteTopicHistory(account, '@forum', 42)
 * ```
 *
 * Removes the thread's history rather than the topic row. The answer carries
 * the amount the conversation's sequence advanced, which is fed to the account
 * so its place in the stream does not gap on a deletion it performed itself.
 */
export async function deleteTopicHistory(
  client: Foruming,
  chat: string | PeerRef,
  topic: TopicRef,
): Promise<number> {
  const peer = await client.resolve(chat)

  // Not an updates container, so it cannot be fed as one. What it carries is a
  // position and a count in the channel's own sequence — a forum is always a
  // channel — and a long thread is removed in stages, each asked for again
  // until Telegram says the last is done.
  return await removeInStages(client, peer, () =>
    client.api.messages.deleteTopicHistory({ peer, top_msg_id: topicId(topic) }),
  )
}

/**
 * Read particular topics by number.
 *
 * ```ts
 * const [releases] = await fetchTopics(account, '@forum', [42])
 * ```
 *
 * Positional, with a gap where a topic does not exist or was deleted — the same
 * shape the other batched reads have, and for the same reason: a caller with
 * three numbers and two answers has no way to tell which one is missing.
 */
export async function fetchTopics(
  client: Foruming,
  chat: string | PeerRef,
  topics: readonly TopicRef[],
): Promise<(ForumTopicView | undefined)[]> {
  if (topics.length === 0) return []

  const wanted = topics.map(topicId)
  const answer = await client.api.messages.getForumTopicsByID({
    peer: await client.resolve(chat),
    topics: wanted,
  })

  const found = new Map<number, TypeForumTopic>()
  for (const topic of answer.topics) found.set(topic.id, topic)

  return wanted.map((id) => {
    const topic = found.get(id)

    return topic === undefined ? undefined : new ForumTopicView(topic)
  })
}

/** How a supergroup's forum behaviour is set. */
export interface ForumSettings {
  /** Whether the group files its messages by topic at all. */
  readonly enabled: boolean
  /**
   * Show the topics as tabs rather than as a list.
   *
   * Only meaningful while `enabled`. Left alone when omitted.
   */
  readonly asTabs?: boolean
}

/**
 * Turn a supergroup into a forum, or turn it back into an ordinary one.
 *
 * ```ts
 * await setForumSettings(account, '@group', { enabled: true })
 * ```
 *
 * A change to what the conversation *is*, not to a topic in it — so it takes
 * the group rather than a topic, and is answered with the updates the change
 * caused, which reach the account.
 */
export async function setForumSettings(
  client: Foruming,
  chat: string | PeerRef,
  settings: ForumSettings,
): Promise<void> {
  const { asChannel } = await import('../chats/common.js')
  const answer = await client.api.channels.toggleForum({
    channel: await asChannel(client, chat, 'making a conversation a forum'),
    enabled: settings.enabled,
    // Required by the schema rather than optional, so it is always sent and
    // defaults to the list rather than to whatever was there before.
    tabs: settings.asTabs ?? false,
  })

  await applyUpdates(client, answer)
}
