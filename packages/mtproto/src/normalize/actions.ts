/**
 * What a handler can do with an update it just received.
 *
 * Every operation here addresses the peer the update came from. That is what
 * makes them safe: an account cannot name a peer it has never met — every
 * reference needs an access hash that is per-account and cannot be derived — but
 * a peer that just spoke is one it has already written down. Addressing somebody
 * out of the blue is a different problem with a different answer, and it does
 * not belong here.
 *
 * The account supplies the way to reach a datacenter and the peers it has
 * learned. Nothing here holds either: this is the step between an update and a
 * request, not a second owner of the network or of the peer table.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import type { DownloadRequest } from '../files/download.js'
import { documentFile, photoFile } from '../files/media.js'
import type { ManagedLocation } from '../files/references.js'
import type { TypeInputChannel, TypeInputPeer } from '../generated/api/types/index.js'
import { inputChannel, inputPeer } from '../network/peers.js'
import type { PeerKind, PeerStore } from '../storage/peers.js'
import type { TlValue } from '../tl/index.js'
import type { NormalizedUpdate } from './normalize.js'
import { randomId, type SentMessage, sentMessage } from './sent.js'

/** Which of the two media a message can carry a file under. */
type MediaKind = 'document' | 'photo'

/** What acting on an update needs from the account it arrived on. */
export interface ActionContext {
  /** The peers this account has learned, which is where a reference comes from. */
  readonly peers: PeerStore
  /** Make a call. Throws while the account is not connected. */
  invoke(query: TlValue): Promise<TlValue>
  /** Randomness for the identifier a send is deduplicated by. */
  random(length: number): Uint8Array
  /**
   * Fetch a file, on the connections kept for transfers.
   *
   * Supplied by the account because reaching a datacenter for a transfer is the
   * account's to arrange, and taking a managed location because refreshing a
   * refused reference is not: only something holding the message the reference
   * came from can do that, and that is this layer.
   */
  fetch(request: DownloadRequest, references: ManagedLocation): Promise<Uint8Array>
}

/** The operations an update can be acted on with, bound to one update. */
export interface UpdateActions {
  reply(text: string): Promise<SentMessage>
  react(emoji: string): Promise<TlValue>
  edit(text: string): Promise<TlValue>
  delete(): Promise<TlValue>
  download(): Promise<Uint8Array>
}

/**
 * Name the peer an update came from.
 *
 * Read from the peer table rather than from the update: the update says which
 * peer, and the table says how to refer to it. A peer that is not there is
 * refused rather than guessed at — a reference built without its hash is one
 * Telegram rejects, and the failure would describe the call rather than the
 * peer.
 */
async function peerOf(update: NormalizedUpdate, context: ActionContext): Promise<TypeInputPeer> {
  const chat = update.chat
  if (chat === undefined) {
    throw new PeerError(`a '${update.kind}' event names no conversation to address`)
  }

  const record = await context.peers.byId(chat.kind, chat.id)
  if (record === undefined) {
    throw new PeerError(`${chat.kind} ${chat.id} is not known to this account`)
  }

  return inputPeer(record)
}

/**
 * The media the update's own message carried, and where its bytes live.
 *
 * A document is one file. A photo is the same picture at several sizes and the
 * largest that has to be fetched is taken, which is the answer this project
 * already gives the same question on the other transport. Anything else — a
 * poll, a contact, a location — carries no file at all.
 */
function fileOf(update: NormalizedUpdate): {
  request: DownloadRequest
  id: bigint
  kind: MediaKind
} {
  const media = update.message?._ === 'message' ? update.message.media : undefined
  if (media === undefined) {
    throw new ValidationError(`a '${update.kind}' event carries no media to fetch`)
  }

  if (media._ === 'messageMediaDocument' && media.document?._ === 'document') {
    return { request: documentFile(media.document), id: media.document.id, kind: 'document' }
  }

  if (media._ === 'messageMediaPhoto' && media.photo?._ === 'photo') {
    return { request: photoFile(media.photo), id: media.photo.id, kind: 'photo' }
  }

  throw new ValidationError(`a '${media._}' carries no file this can fetch`)
}

/**
 * A location that can produce itself again after a refusal.
 *
 * A file reference expires on the datacenter's own schedule and nothing
 * announces it, so the request that carried a stale one is refused for a reason
 * that has nothing to do with the file. The way back is the message the
 * reference arrived in: refetched, it carries a current one.
 *
 * This layer is the only one that can do it. The transfer knows the document
 * and not where it came from, and `docs/mtproto.md` §11 keeps the origin tables
 * keyed by the message — which is what an update carries and nothing below it
 * does.
 */
function managed(
  update: NormalizedUpdate,
  context: ActionContext,
  request: DownloadRequest,
  id: bigint,
  kind: MediaKind,
): ManagedLocation {
  let reference = request.location['file_reference'] as Uint8Array

  return {
    current: () => ({ ...request.location, file_reference: reference }),

    async refresh(used: Uint8Array) {
      // A caller that lost a race is not made to wait for a refetch it does not
      // need: the reference it was refused is already the old one.
      if (!sameBytes(used, reference)) return

      reference = await refetch(update, context, id, kind)
    },
  }
}

/**
 * Ask for the message again, and read the reference it carries now.
 *
 * Once, and only for the message this update is about. A message that no longer
 * carries the document is reported rather than retried, because there is
 * nothing left to ask for.
 */
async function refetch(
  update: NormalizedUpdate,
  context: ActionContext,
  id: bigint,
  kind: MediaKind,
): Promise<Uint8Array> {
  const msgId = messageIdOf(update, 'refresh the reference of')
  const chat = update.chat
  if (chat === undefined) {
    throw new PeerError(`a '${update.kind}' event names no conversation to ask again`)
  }

  const wanted = [{ _: 'inputMessageID', id: msgId }]
  const answer =
    chat.kind === 'channel'
      ? await context.invoke({
          _: 'channels.getMessages',
          channel: await channelOf(chat, context),
          id: wanted,
        })
      : await context.invoke({ _: 'messages.getMessages', id: wanted })

  const messages = answer['messages']
  const found = Array.isArray(messages) ? messages : []
  for (const entry of found) {
    const media = (entry as TlValue)['media'] as TlValue | undefined
    // Matched on both what sort of media it is and which one. An answer may
    // describe several messages, each with media of its own, and a reference
    // taken from any other is one issued for a different file — which is a
    // request that is well formed and refused.
    const carried = media?.[kind] as TlValue | undefined
    if (carried?.['id'] === id && carried['file_reference'] instanceof Uint8Array) {
      return carried['file_reference']
    }
  }

  throw new ValidationError(`message ${msgId} no longer carries the file that was asked for`)
}

/** Whether two references are the same bytes. */
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, at) => byte === right[at])
}

/**
 * Name a channel, which is not the same as naming a peer.
 *
 * The channel methods take a reference of their own, carrying the same
 * identifier and hash an `inputPeerChannel` would but under a different
 * constructor. A peer that was only seen in passing is refused here for the
 * reason it is refused everywhere: its hash means something only where it
 * arrived, and a reference built from it is one Telegram rejects as a problem
 * with the call rather than with the peer.
 */
async function channelOf(
  chat: { readonly kind: PeerKind; readonly id: bigint },
  context: ActionContext,
): Promise<TypeInputChannel> {
  const record = await context.peers.byId(chat.kind, chat.id)
  if (record === undefined) {
    throw new PeerError(`${chat.kind} ${chat.id} is not known to this account`)
  }

  return inputChannel(record)
}

/** The identifier of the message an update carries, where it carries one. */
function messageIdOf(update: NormalizedUpdate, what: string): number {
  const id = update.message?.['id']
  if (typeof id !== 'number') {
    throw new ValidationError(`a '${update.kind}' event carries no message to ${what}`)
  }

  return id
}

/**
 * Bind the two operations to one update.
 *
 * Nothing is resolved until an operation is called. A handler that reads an
 * update and answers nothing must not pay for a peer lookup, and one that runs
 * while the account is down must fail when it acts rather than when it is
 * given the update.
 */
export function updateActions(update: NormalizedUpdate, context: ActionContext): UpdateActions {
  return {
    async reply(text: string): Promise<SentMessage> {
      // The message first: it is the cheaper check and the more specific
      // answer, and an event with nothing to answer is not about the peer.
      const replyTo = messageIdOf(update, 'answer')
      const peer = await peerOf(update, context)

      // Kept, because it is the only thing in the answer that says which of the
      // messages described is the one this call sent.
      const random = randomId(context.random)
      const answer = await context.invoke({
        _: 'messages.sendMessage',
        peer,
        message: text,
        random_id: random,
        reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: replyTo },
      })

      return sentMessage(answer, random)
    },

    async edit(text: string): Promise<TlValue> {
      // The same two things every operation here needs, read the same way: the
      // message the update carried, and the conversation it arrived in. What is
      // editable is Telegram's business — somebody else's message, or one past
      // the window, is refused there rather than guessed at here.
      const id = messageIdOf(update, 'edit')
      const peer = await peerOf(update, context)

      return await context.invoke({
        _: 'messages.editMessage',
        peer,
        id,
        message: text,
      })
    },

    async delete(): Promise<TlValue> {
      const id = messageIdOf(update, 'delete')
      const chat = update.chat
      if (chat === undefined) {
        throw new PeerError(`a '${update.kind}' event names no conversation to delete from`)
      }

      // Two methods, and which applies is decided by what sort of conversation
      // the update arrived in. A channel keeps its messages under the channel
      // rather than in the account's own numbering, so the ordinary method
      // would name a message somewhere else entirely.
      if (chat.kind === 'channel') {
        return await context.invoke({
          _: 'channels.deleteMessages',
          channel: await channelOf(chat, context),
          id: [id],
        })
      }

      // Gone for everyone, which is the only thing the channel method does and
      // the only thing the other transport's `delete` means. Removing a message
      // from this account's own view alone is a different operation, and
      // `account.api.messages.deleteMessages` is where it lives.
      return await context.invoke({
        _: 'messages.deleteMessages',
        revoke: true,
        id: [id],
      })
    },

    async download(): Promise<Uint8Array> {
      const { request, id, kind } = fileOf(update)

      return await context.fetch(request, managed(update, context, request, id, kind))
    },

    async react(emoji: string): Promise<TlValue> {
      const msgId = messageIdOf(update, 'react to')
      const peer = await peerOf(update, context)

      return await context.invoke({
        _: 'messages.sendReaction',
        peer,
        msg_id: msgId,
        // An empty reaction clears whatever was there, which is the same
        // meaning the Bot API gives an empty one.
        reaction: emoji === '' ? [] : [{ _: 'reactionEmoji', emoticon: emoji }],
      })
    },
  }
}
