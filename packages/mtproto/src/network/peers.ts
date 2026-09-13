/**
 * Learning who a peer is, and being able to say so again.
 *
 * A reference to a peer is an identifier and an access hash, and the hash is
 * issued per account and cannot be worked out. Telegram hands them over inside
 * the answers to unrelated calls: almost every result carries `users` and
 * `chats` arrays describing everyone it mentions. Reading those is the only way
 * an account ever learns how to name anybody.
 *
 * ```
 *   any answer ──> users / chats ──> store
 *   @name      ──> resolve       ──> store ──> reference
 * ```
 *
 * So peers are harvested rather than fetched. Anything that answers a call
 * hands what it received to this, and what could be named is written down; a
 * name is resolved only when nothing was harvested for it.
 *
 * **A reduced peer is never treated as a complete one.** Telegram sends a
 * shortened form of a peer the account cannot otherwise reach, carrying a hash
 * that is valid only in the context it arrived in. Such a peer can be named
 * where it was seen and nowhere else, so it never overwrites a complete record
 * and never produces an ordinary reference — asking for one raises rather than
 * hands back something that will be refused later for no visible reason.
 */

import { PeerError } from '@yuigram/core'
import type { TypeInputChannel, TypeInputPeer } from '../generated/api/types/index.js'
import type { PeerKind, PeerRecord, PeerStore } from '../storage/peers.js'
import type { TlValue } from '../tl/index.js'
import type { Callable } from './migration.js'

/** The constructors that describe a user well enough to name it. */
const USER_KINDS = new Set(['user'])

/** The constructors that describe a group or a channel well enough to name it. */
const CHAT_KINDS = new Set(['chat', 'chatForbidden', 'channel', 'channelForbidden'])

/**
 * Read every peer an answer describes.
 *
 * Answers carry the peers they mention whether or not the caller asked about
 * them, which is what makes harvesting worthwhile: a client that reads them
 * accumulates the ability to name peers it has never looked up.
 *
 * Empty and unknown constructors are skipped rather than refused. An answer
 * naming a peer this client cannot describe is not a malformed answer — it is
 * an answer about something else — and refusing it would lose the peers
 * alongside it.
 */
export function readPeers(value: TlValue): PeerRecord[] {
  const found: PeerRecord[] = []

  for (const entry of asArray(value['users'])) {
    const record = readUser(entry)
    if (record !== undefined) found.push(record)
  }

  for (const entry of asArray(value['chats'])) {
    const record = readChat(entry)
    if (record !== undefined) found.push(record)
  }

  return found
}

/** Read every peer an answer describes, and write them down. */
export async function harvest(store: PeerStore, value: TlValue): Promise<PeerRecord[]> {
  const found = readPeers(value)
  for (const record of found) await store.save(record)

  return found
}

/**
 * Find the peer answering to a name, asking Telegram if nothing was harvested.
 *
 * The answer describes the peer and everything it mentions, so it is harvested
 * whole before the one that was asked for is picked out of it — a name usually
 * resolves to a peer whose own answer names others, and discarding them would
 * mean asking again for something already received.
 */
export async function resolveUsername(options: {
  readonly store: PeerStore
  readonly peer: Callable
  readonly username: string
}): Promise<PeerRecord> {
  const cached = await options.store.byUsername(options.username)
  if (cached !== undefined && !cached.min) return cached

  const answer = await options.peer.invoke({
    _: 'contacts.resolveUsername',
    username: options.username.trim().replace(/^@/, ''),
  })

  if (answer._ !== 'contacts.resolvedPeer') {
    throw new PeerError(`expected a resolved peer, received '${answer._}'`)
  }

  await harvest(options.store, answer)

  const named = readPeerReference(answer['peer'])
  const record = await options.store.byId(named.kind, named.id)
  if (record === undefined) {
    // The answer named a peer it did not describe, so nothing was learned about
    // how to reach it. Reporting that is the only honest thing available.
    throw new PeerError(`'${options.username}' resolved to a peer that was not described`)
  }

  return record
}

/**
 * Build the reference a call carries to name a peer.
 *
 * A reduced peer has no reference of its own: its hash means something only
 * where it arrived, so the reference has to name that context instead. Refused
 * here rather than built and refused by Telegram, which would report a problem
 * with the call rather than with the peer.
 */
export function inputPeer(record: PeerRecord): TypeInputPeer {
  if (record.kind === 'chat') return { _: 'inputPeerChat', chat_id: record.id }

  if (record.min) {
    throw new PeerError(
      `${record.kind} ${record.id} was only seen in passing and cannot be named on its own`,
    )
  }

  if (record.accessHash === undefined) {
    throw new PeerError(`${record.kind} ${record.id} has no access hash to be named with`)
  }

  return record.kind === 'user'
    ? { _: 'inputPeerUser', user_id: record.id, access_hash: record.accessHash }
    : { _: 'inputPeerChannel', channel_id: record.id, access_hash: record.accessHash }
}

/**
 * Build the reference the channel methods take.
 *
 * Not an `InputPeer`. Two thirds of the `channels` namespace addresses a channel
 * by a reference of its own, carrying the same identifier and hash an
 * `inputPeerChannel` would but under a different constructor — so a caller
 * holding a peer reference still has nothing those methods accept.
 *
 * ```ts
 * const record = await account.peers.byId('channel', id)
 * await account.api.channels.getMessages({
 *   channel: inputChannel(record),
 *   id: [{ _: 'inputMessageID', id: 77 }],
 * })
 * ```
 *
 * Refused for the same reasons naming a peer is refused, and with the same
 * words: a record that is not a channel names nothing this constructor can
 * carry, and one seen only in passing carries a hash that means something only
 * where it arrived — a reference built from either is one Telegram rejects as a
 * problem with the call rather than with the channel.
 *
 * Whether the record exists at all stays with whoever looked it up. What a
 * missing one means depends on what was being attempted, and the catch-up that
 * cannot name a channel and the handler that cannot delete in one do not want
 * the same sentence.
 */
/**
 * The channel a resolved peer names, or nothing where it names something else.
 *
 * Several methods are split in two — one addressing a channel, one addressing
 * everything else — and which to use is a property of the conversation rather
 * than of the request. This is that question, asked once: reading it off an
 * input peer rather than off a stored record, because by the time a call is
 * being built the peer has already been resolved.
 */
export function channelFor(peer: TypeInputPeer): TypeInputChannel | undefined {
  if (peer._ === 'inputPeerChannel') {
    return { _: 'inputChannel', channel_id: peer.channel_id, access_hash: peer.access_hash }
  }

  if (peer._ === 'inputPeerChannelFromMessage') {
    return {
      _: 'inputChannelFromMessage',
      peer: peer.peer,
      msg_id: peer.msg_id,
      channel_id: peer.channel_id,
    }
  }

  return undefined
}

export function inputChannel(record: PeerRecord): TypeInputChannel {
  if (record.kind !== 'channel') {
    throw new PeerError(`${record.kind} ${record.id} is not a channel`)
  }

  if (record.min) {
    throw new PeerError(
      `channel ${record.id} was only seen in passing and cannot be named on its own`,
    )
  }

  if (record.accessHash === undefined) {
    throw new PeerError(`channel ${record.id} has no access hash to be named with`)
  }

  return { _: 'inputChannel', channel_id: record.id, access_hash: record.accessHash }
}

/**
 * Build the reference that names a reduced peer by where it was seen.
 *
 * The context is the peer whose message mentioned this one, and the message
 * that did. Telegram checks that the peer really was mentioned there, which is
 * why a context that did not mention it is not a reference that can be made up.
 *
 * ```ts
 * // A sender seen inside a channel's message, which is where reduced peers
 * // mostly come from.
 * const record = await account.peers.byId(event.sender.kind, event.sender.id)
 * const peer = inputPeerFromMessage({
 *   record,
 *   context: await account.resolve(event.chat),
 *   messageId: event.message.id,
 * })
 * ```
 *
 * **The context is the caller's.** A record says a peer is reduced and not
 * where it was seen, so nothing here can supply one; an update holds both, and
 * whoever held the update is the only thing that still does. Storing the origin
 * against the record would mean attributing a peer to a message out of whatever
 * an answer happened to describe, and a wrong attribution is a reference
 * Telegram refuses — `docs/mtproto.md` §10.
 */
export function inputPeerFromMessage(options: {
  readonly record: PeerRecord
  /** The peer whose message mentioned this one. */
  readonly context: TypeInputPeer
  /** The message that mentioned it. */
  readonly messageId: number
}): TypeInputPeer {
  const { record } = options
  if (record.kind === 'chat') {
    throw new PeerError('a basic group is named by its identifier alone')
  }
  if (!Number.isInteger(options.messageId)) {
    throw new PeerError('a message identifier must be a whole number')
  }

  return record.kind === 'user'
    ? {
        _: 'inputPeerUserFromMessage',
        peer: options.context,
        msg_id: options.messageId,
        user_id: record.id,
      }
    : {
        _: 'inputPeerChannelFromMessage',
        peer: options.context,
        msg_id: options.messageId,
        channel_id: record.id,
      }
}

/** Which peer a `peerUser` / `peerChat` / `peerChannel` names. */
export function readPeerReference(value: unknown): { kind: PeerKind; id: bigint } {
  if (typeof value !== 'object' || value === null) {
    throw new PeerError('a peer reference must be an object')
  }

  const peer = value as TlValue
  const named: Record<string, PeerKind> = {
    peerUser: 'user',
    peerChat: 'chat',
    peerChannel: 'channel',
  }

  const kind = named[peer._]
  if (kind === undefined) {
    throw new PeerError(`'${peer._}' does not name a peer`)
  }

  const field = kind === 'user' ? 'user_id' : kind === 'chat' ? 'chat_id' : 'channel_id'
  const id = peer[field]
  if (typeof id !== 'bigint') {
    throw new PeerError(`'${peer._}.${field}' must be a 64-bit identifier`)
  }

  return { kind, id }
}

/** Read a user, when the constructor describes one that can be named. */
function readUser(value: unknown): PeerRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const user = value as TlValue
  if (!USER_KINDS.has(user._)) return undefined

  const id = user['id']
  if (typeof id !== 'bigint') return undefined

  const hash = user['access_hash']
  const phone = user['phone']

  return {
    kind: 'user',
    id,
    ...(typeof hash === 'bigint' ? { accessHash: hash } : {}),
    min: user['min'] === true,
    usernames: readUsernames(user),
    ...(typeof phone === 'string' && phone.length > 0 ? { phone } : {}),
  }
}

/** Read a group or a channel, when the constructor describes one. */
function readChat(value: unknown): PeerRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const chat = value as TlValue
  if (!CHAT_KINDS.has(chat._)) return undefined

  const id = chat['id']
  if (typeof id !== 'bigint') return undefined

  // A basic group is named by its identifier alone; a channel needs a hash.
  const kind: PeerKind = chat._ === 'chat' || chat._ === 'chatForbidden' ? 'chat' : 'channel'
  const hash = chat['access_hash']

  return {
    kind,
    id,
    ...(kind === 'channel' && typeof hash === 'bigint' ? { accessHash: hash } : {}),
    min: chat['min'] === true,
    usernames: readUsernames(chat),
  }
}

/**
 * Every name a peer answers to.
 *
 * A peer carries one name directly and may carry a list of others, of which
 * only the active ones resolve. Both are read, because a peer that publishes
 * several is reachable by any of them.
 */
function readUsernames(value: TlValue): string[] {
  const names: string[] = []

  const primary = value['username']
  if (typeof primary === 'string' && primary.length > 0) names.push(primary.toLowerCase())

  for (const entry of asArray(value['usernames'])) {
    if (typeof entry !== 'object' || entry === null) continue

    const record = entry as TlValue
    if (record['active'] !== true) continue

    const name = record['username']
    if (typeof name === 'string' && name.length > 0) names.push(name.toLowerCase())
  }

  return [...new Set(names)]
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}
