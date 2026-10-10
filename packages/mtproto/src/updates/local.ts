// SPDX-License-Identifier: MIT

/**
 * Telling what this account did from what happened.
 *
 * A call that changes something is answered with what it changed: the message
 * a send created, the edit an edit made, the position a deletion moved a
 * sequence to. That belongs in the sequence like anything the connection
 * reports. Left out, it leaves the account's position behind Telegram's, the
 * next update looks like a gap, and the catch-up that follows hands the account
 * its own doing back as news.
 *
 * It does not belong in front of the handlers. The caller already holds the
 * answer, and a handler told about it again is told about something nobody
 * else did. So what an answer reports about what the call acted on is applied
 * and withheld, and anything else in it — an answer describes whatever happened
 * at the same moment, which can be news about another conversation or about
 * the account as a whole — is delivered as the connection would have delivered
 * it.
 *
 * What the call acted on is read from the call: the conversations it names, the
 * messages it names, the deduplication keys it drew. Nothing is inferred from
 * the answer alone, because the answer is not only about the call.
 */

import type { TlValue } from '../tl/index.js'

/** What a call this account made acted on, read from the call itself. */
export interface CallScope {
  /** The conversations it names, as `user:<id>`, `chat:<id>` or `channel:<id>`. */
  readonly conversations: ReadonlySet<string>
  /** The messages it names, or nothing when it names none. */
  readonly messages: ReadonlySet<number> | undefined
  /** The deduplication keys it drew. */
  readonly randomIds: ReadonlySet<bigint>
  /**
   * Made on behalf of a business connection. What its answer reports belongs to
   * the conversations of the account that granted the connection, and to none
   * of this account's sequences.
   */
  readonly delegated: boolean
  /** The method, once any wrapping is taken off. */
  readonly method: string
}

/**
 * Wrappers that change how a call is made but not what it does.
 *
 * The call that matters is the one inside, under `query`.
 */
const WRAPPERS: ReadonlySet<string> = new Set([
  'invokeAfterMsg',
  'invokeAfterMsgs',
  'invokeWithLayer',
  'initConnection',
  'invokeWithoutUpdates',
  'invokeWithMessagesRange',
  'invokeWithTakeout',
  'invokeWithApnsSecret',
  'invokeWithGooglePlayIntegrity',
  'invokeWithReCaptcha',
])

/**
 * Calls that bring a conversation into being, or bring the account into one,
 * without naming it — there is nothing to name before the answer exists. The
 * conversation they acted on is the one their answer describes.
 */
const CREATING: ReadonlySet<string> = new Set([
  'messages.createChat',
  'messages.migrateChat',
  'messages.importChatInvite',
  'channels.createChannel',
  'communities.create',
])

/**
 * Calls whose position answer belongs to the common sequence whatever peer
 * they name: saved messages and call history are this account's own, not the
 * named conversation's.
 */
const COMMON_POSITION: ReadonlySet<string> = new Set([
  'messages.deleteSavedHistory',
  'messages.deletePhoneCallHistory',
  'messages.deleteMessages',
  'messages.readMessageContents',
])

/** Constructors of the update containers an answer can be. */
export const UPDATES: ReadonlySet<string> = new Set([
  'updates',
  'updatesCombined',
  'updateShort',
  'updateShortMessage',
  'updateShortChatMessage',
  'updateShortSentMessage',
  'updatesTooLong',
])

/** Constructors of the answers that are a position and nothing else. */
const POSITIONS: ReadonlySet<string> = new Set([
  'messages.affectedMessages',
  'messages.affectedHistory',
  'messages.affectedFoundMessages',
])

/** Updates that bring a message into existence. */
const CREATIONS: ReadonlySet<string> = new Set([
  'updateNewMessage',
  'updateNewChannelMessage',
  'updateNewScheduledMessage',
  'updateShortMessage',
  'updateShortChatMessage',
])

/** Read what a call acted on. `self` stands for the account in an `inputPeerSelf`. */
export function scopeOf(query: TlValue, self?: bigint): CallScope {
  const { call, delegated } = unwrapped(query)
  const named = [...numbers(call['id']), ...numbers(call['msg_id'])]

  return {
    conversations: conversationsNamed(call, self),
    messages: named.length === 0 ? undefined : new Set(named),
    randomIds: keysDrawn(call),
    delegated,
    method: call._,
  }
}

/** The call inside whatever wraps it, and whether a business connection does. */
function unwrapped(query: TlValue): { readonly call: TlValue; readonly delegated: boolean } {
  let call = query
  let delegated = false

  // Bounded: a wrapper wraps a call, and a chain longer than the wrappers
  // there are is not a call anybody made.
  for (let depth = 0; depth <= WRAPPERS.size; depth += 1) {
    const business = call._ === 'invokeWithBusinessConnection'
    const inner = call['query']
    if (!(business || WRAPPERS.has(call._)) || !isValue(inner)) break

    delegated ||= business
    call = inner
  }

  return { call, delegated }
}

/** The conversations a call names, by whichever of its fields name one. */
function conversationsNamed(call: TlValue, self: bigint | undefined): ReadonlySet<string> {
  const conversations = new Set<string>()
  const add = (value: unknown): void => {
    const key = conversationOfInput(value, self)
    if (key !== undefined) conversations.add(key)
  }

  add(call['peer'])
  add(call['to_peer'])
  add(call['channel'])
  add(call['user_id'])
  add(call['id'])
  const chat = call['chat_id']
  if (typeof chat === 'bigint') conversations.add(`chat:${chat}`)
  for (const peer of asArray(call['peers'])) {
    add(isValue(peer) && peer._ === 'inputDialogPeer' ? peer['peer'] : peer)
  }
  for (const entry of asArray(call['folder_peers'])) add(isValue(entry) ? entry['peer'] : undefined)

  return conversations
}

/** The deduplication keys a call drew: one, a list, or one per album item. */
function keysDrawn(call: TlValue): ReadonlySet<bigint> {
  const keys = new Set<bigint>(bigints(call['random_id']))
  for (const media of asArray(call['multi_media'])) {
    if (isValue(media)) for (const key of bigints(media['random_id'])) keys.add(key)
  }

  return keys
}

/**
 * The scope, widened by the conversation a creating call's answer describes.
 *
 * Only for calls that create or join, which cannot name what they act on.
 */
export function widenedBy(scope: CallScope, carried: TlValue): CallScope {
  if (!CREATING.has(scope.method)) return scope

  const conversations = new Set(scope.conversations)
  for (const chat of asArray(carried['chats'])) {
    if (!isValue(chat) || typeof chat['id'] !== 'bigint') continue
    if (chat._ === 'chat' || chat._ === 'chatForbidden') conversations.add(`chat:${chat['id']}`)
    if (chat._ === 'channel' || chat._ === 'channelForbidden') {
      conversations.add(`channel:${chat['id']}`)
    }
  }

  return { ...scope, conversations }
}

/** The container of updates an answer carries, directly or under `updates`, if any. */
export function carriedUpdates(answer: unknown): TlValue | undefined {
  if (!isValue(answer)) return undefined
  if (UPDATES.has(answer._)) return answer

  const inner = answer['updates']

  return isValue(inner) && UPDATES.has(inner._) ? inner : undefined
}

/** The position an answer reports instead of updates, if it is one of those answers. */
export function answeredPosition(
  answer: unknown,
): { readonly pts: number; readonly count: number } | undefined {
  if (!isValue(answer) || !POSITIONS.has(answer._)) return undefined

  const pts = answer['pts']
  const count = answer['pts_count']
  if (!isCount(pts) || !isCount(count)) return undefined

  return { pts, count }
}

/**
 * The channel whose sequence a position answer belongs to, or nothing for the
 * common one.
 *
 * A conversation's history operations answer in that conversation's sequence:
 * a channel's own, or the common one every other conversation shares.
 */
export function positionChannel(scope: CallScope): bigint | undefined {
  if (COMMON_POSITION.has(scope.method)) return undefined

  const channels = [...scope.conversations].filter((key) => key.startsWith('channel:'))
  if (channels.length !== 1) return undefined

  return BigInt((channels[0] as string).slice('channel:'.length))
}

/** The updates inside a container, in the order it carries them. */
export function updatesIn(container: TlValue): readonly TlValue[] {
  if (container._ === 'updates' || container._ === 'updatesCombined') {
    return asArray(container['updates']).filter(isValue)
  }
  if (container._ === 'updateShort') {
    const update = container['update']

    return isValue(update) ? [update] : []
  }
  if (container._ === 'updatesTooLong') return []

  return [container]
}

/**
 * The updates of an answer that report what the call itself did.
 *
 * - A short sent message is this call's and nothing else's.
 * - Anything carrying a deduplication key is the call's when the key is one
 *   the call drew; a message is the call's when Telegram matched it to one.
 * - A call that drew no key can still create messages — a service message
 *   saying a title changed, a gift was sent, a topic was opened. Those are the
 *   outgoing messages of the conversations it named.
 * - Anything else is the call's when it is about a conversation the call
 *   named and, where both name messages, about those messages.
 *
 * What is about nothing the call named — another conversation, the account as
 * a whole, a poll's running count — is not the call's, and is delivered.
 */
export function ownEffects(updates: readonly TlValue[], scope: CallScope): ReadonlySet<TlValue> {
  const matched = matchedMessages(updates, scope)

  return new Set(updates.filter((update) => isOwn(update, scope, matched)))
}

/** The messages Telegram matched to keys the call drew. */
function matchedMessages(updates: readonly TlValue[], scope: CallScope): ReadonlySet<number> {
  const matched = new Set<number>()
  for (const update of updates) {
    if (update._ !== 'updateMessageID') continue
    const key = update['random_id']
    const id = update['id']
    if (typeof key === 'bigint' && scope.randomIds.has(key) && typeof id === 'number') {
      matched.add(id)
    }
  }

  return matched
}

/** Whether one update reports what the call did; see {@link ownEffects}. */
function isOwn(update: TlValue, scope: CallScope, matched: ReadonlySet<number>): boolean {
  if (update._ === 'updateShortSentMessage') return true

  const key = update['random_id']
  if (typeof key === 'bigint') return scope.randomIds.has(key)

  if (CREATIONS.has(update._)) return ownCreation(update, scope, matched)

  const conversations = conversationsOf(update)
  const ids = messagesOf(update)
  const named = (id: number) => scope.messages?.has(id) === true

  if (conversations.length === 0) {
    // Only the common sequence's message operations say nothing about where:
    // a deletion, a read of contents. They are the call's when they are about
    // the messages it named, outside any channel.
    const inChannelOnly =
      scope.conversations.size > 0 &&
      [...scope.conversations].every((conversation) => conversation.startsWith('channel:'))

    return !inChannelOnly && ids.some(named)
  }

  if (!conversations.some((conversation) => scope.conversations.has(conversation))) return false

  return ids.length === 0 || scope.messages === undefined || ids.some(named)
}

/** Whether a message an answer reports was created by the call. */
function ownCreation(update: TlValue, scope: CallScope, matched: ReadonlySet<number>): boolean {
  const id = createdId(update)
  if (id !== undefined && matched.has(id)) return true

  // A call that drew a key creates the messages matched to it and no others.
  if (scope.randomIds.size > 0 || !outgoing(update)) return false

  return conversationsOf(update).some((conversation) => scope.conversations.has(conversation))
}

/** The conversation an input reference names, or nothing when it names none. */
export function conversationOfInput(value: unknown, self?: bigint): string | undefined {
  if (!isValue(value)) return undefined

  switch (value._) {
    case 'inputPeerUser':
    case 'inputPeerUserFromMessage':
    case 'inputUser':
    case 'inputUserFromMessage':
      return typeof value['user_id'] === 'bigint' ? `user:${value['user_id']}` : undefined
    case 'inputPeerChat':
      return typeof value['chat_id'] === 'bigint' ? `chat:${value['chat_id']}` : undefined
    case 'inputPeerChannel':
    case 'inputPeerChannelFromMessage':
    case 'inputChannel':
    case 'inputChannelFromMessage':
      return typeof value['channel_id'] === 'bigint' ? `channel:${value['channel_id']}` : undefined
    case 'inputPeerSelf':
    case 'inputUserSelf':
      return self === undefined ? undefined : `user:${self}`
    default:
      return undefined
  }
}

/** The conversations an update is about, from whichever fields it names them by. */
export function conversationsOf(update: TlValue): readonly string[] {
  const found: string[] = []
  const peer = (value: unknown): void => {
    const key = conversationOfPeer(value)
    if (key !== undefined) found.push(key)
  }

  peer(update['peer'])
  peer(update['peer_id'])
  const message = update['message']
  if (isValue(message)) peer(message['peer_id'])
  if (typeof update['channel_id'] === 'bigint') found.push(`channel:${update['channel_id']}`)
  if (typeof update['chat_id'] === 'bigint') found.push(`chat:${update['chat_id']}`)
  const participants = update['participants']
  if (isValue(participants) && typeof participants['chat_id'] === 'bigint') {
    found.push(`chat:${participants['chat_id']}`)
  }
  for (const entry of asArray(update['folder_peers'])) if (isValue(entry)) peer(entry['peer'])
  // The two short forms name their conversation by identifier.
  if (update._ === 'updateShortMessage' && typeof update['user_id'] === 'bigint') {
    found.push(`user:${update['user_id']}`)
  }

  return found
}

/** The conversation a peer names. */
function conversationOfPeer(value: unknown): string | undefined {
  if (!isValue(value)) return undefined
  if (value._ === 'peerUser' && typeof value['user_id'] === 'bigint')
    return `user:${value['user_id']}`
  if (value._ === 'peerChat' && typeof value['chat_id'] === 'bigint')
    return `chat:${value['chat_id']}`
  if (value._ === 'peerChannel' && typeof value['channel_id'] === 'bigint') {
    return `channel:${value['channel_id']}`
  }

  return undefined
}

/** The messages an update names. */
function messagesOf(update: TlValue): readonly number[] {
  const message = update['message']
  if (isValue(message) && typeof message['id'] === 'number') return [message['id']]

  return [...numbers(update['messages']), ...numbers(update['msg_id'])]
}

/** The message a creating update creates. */
function createdId(update: TlValue): number | undefined {
  if (update._ === 'updateShortMessage' || update._ === 'updateShortChatMessage') {
    return typeof update['id'] === 'number' ? update['id'] : undefined
  }
  const message = update['message']

  return isValue(message) && typeof message['id'] === 'number' ? message['id'] : undefined
}

/** Whether a creating update's message is this account's own. */
function outgoing(update: TlValue): boolean {
  if (update['out'] === true) return true
  const message = update['message']

  return isValue(message) && message['out'] === true
}

function isValue(value: unknown): value is TlValue {
  return typeof value === 'object' && value !== null && typeof (value as TlValue)._ === 'string'
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function numbers(value: unknown): readonly number[] {
  if (typeof value === 'number' && Number.isInteger(value)) return [value]

  return asArray(value).filter((item): item is number => typeof item === 'number')
}

function bigints(value: unknown): readonly bigint[] {
  if (typeof value === 'bigint') return [value]

  return asArray(value).filter((item): item is bigint => typeof item === 'bigint')
}
