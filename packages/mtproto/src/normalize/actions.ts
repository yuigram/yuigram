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
import { inputPeer } from '../network/peers.js'
import type { PeerStore } from '../storage/peers.js'
import type { TlValue } from '../tl/index.js'
import type { NormalizedUpdate } from './normalize.js'

/** What acting on an update needs from the account it arrived on. */
export interface ActionContext {
  /** The peers this account has learned, which is where a reference comes from. */
  readonly peers: PeerStore
  /** Make a call. Throws while the account is not connected. */
  invoke(query: TlValue): Promise<TlValue>
  /** Randomness for the identifier a send is deduplicated by. */
  random(length: number): Uint8Array
}

/** The operations an update can be acted on with, bound to one update. */
export interface UpdateActions {
  reply(text: string): Promise<TlValue>
  react(emoji: string): Promise<TlValue>
  edit(text: string): Promise<TlValue>
}

/**
 * Read a signed 64-bit identifier out of randomness.
 *
 * Telegram deduplicates a send by this, so it has to differ between calls and
 * must not be a counter that starts again when the process does.
 */
function randomId(random: (length: number) => Uint8Array): bigint {
  return new DataView(random(8).buffer as ArrayBuffer).getBigInt64(0, true)
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
async function peerOf(update: NormalizedUpdate, context: ActionContext): Promise<TlValue> {
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
    async reply(text: string): Promise<TlValue> {
      // The message first: it is the cheaper check and the more specific
      // answer, and an event with nothing to answer is not about the peer.
      const replyTo = messageIdOf(update, 'answer')
      const peer = await peerOf(update, context)

      return await context.invoke({
        _: 'messages.sendMessage',
        peer,
        message: text,
        random_id: randomId(context.random),
        reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: replyTo },
      })
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
