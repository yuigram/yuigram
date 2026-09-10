/**
 * The context an account's events arrive as.
 *
 * Core owns the contract and the transports own the construction, so this is
 * where the MTProto side satisfies `BaseContext`: a kind to dispatch on, the
 * transport that produced it, a scoped logger, and the untouched update.
 *
 * What it deliberately does not carry is a way to answer. Replying means
 * addressing a peer, addressing a peer means the hash that goes with it, and
 * both belong to the client — which is a layer above this one and does not
 * exist yet. A context with a `reply` that could not send would be worse than
 * one without: the absence is a compile error, the hollow method is a runtime
 * surprise.
 */

import {
  type BaseContext,
  type ContextActions,
  LifecycleError,
  type Logger,
  PeerError,
} from '@yuigram/core'
import { type MtprotoApi, rawApi } from '../api.js'
import type { TypeMessage } from '../generated/api/types/index.js'
import { type BoundApi, boundApi, noPeer } from '../here.js'
import { inputPeer } from '../network/peers.js'
import type { TlValue } from '../tl/index.js'
import { type ActionContext, updateActions } from './actions.js'
import type { MtprotoEventKind } from './events.js'
import { type NormalizedUpdate, normalizeUpdate, type PeerRef } from './normalize.js'

/** One event from an account, ready for dispatch. */
export interface MtprotoContext extends BaseContext, ContextActions {
  /** Which event this is. A literal type, so it discriminates. */
  readonly kind: MtprotoEventKind
  /**
   * Always `'mtproto'` here.
   *
   * What a handler installed on more than one client branches on before it
   * reads anything else, because the two transports model the same
   * conversation differently.
   */
  readonly transport: 'mtproto'
  /** The conversation this concerns, as the update named it. */
  readonly chat: PeerRef | undefined
  /** Who caused it, where the update says. */
  readonly sender: PeerRef | undefined
  /** The message, for the kinds that carry a whole one. */
  readonly message: TypeMessage | undefined
  /** The messages a deletion names. */
  readonly messageIds: readonly number[] | undefined
  /** Message text, where there is any. */
  readonly text: string | undefined
  /** When it happened, where the update says. */
  readonly date: number | undefined
  /** The untouched update, for everything this does not model. */
  readonly raw: TlValue
  /** The client this update arrived on. */
  readonly client: { readonly name: string }
  /**
   * Answer the message this event carries, in the conversation it arrived in.
   *
   * Safe because the peer came from the update: an account already holds a
   * reference to somebody it just heard from. An event that carries no message,
   * or names a peer this account has never written down, is refused rather than
   * sent as something else.
   */
  reply(text: string): Promise<TlValue>
  /** React to the message this event carries. An empty emoji clears it. */
  react(emoji: string): Promise<TlValue>
  /**
   * Replace the text of the message this event carries.
   *
   * The same message and the same conversation {@link MtprotoContext.reply}
   * answers, so it needs neither named. Whether the message may be edited at
   * all — whose it is, and how long ago it was sent — is Telegram's to decide,
   * and it refuses rather than being guessed at here.
   */
  edit(text: string): Promise<TlValue>
  /**
   * Delete the message this event carries, for everyone.
   *
   * Which method that takes is decided by the conversation the event arrived
   * in, because a channel keeps its messages under the channel rather than in
   * this account's own numbering. Both mean the same thing to a reader: the
   * message is gone.
   *
   * Removing a message from this account's own view alone is a different
   * operation, and `account.api.messages.deleteMessages` is where it lives.
   */
  delete(): Promise<TlValue>
  /**
   * Fetch the document this event's message carried.
   *
   * The reference a message carries expires on the datacenter's own schedule
   * and nothing announces it. A refused one is answered by asking for the
   * message again and fetching with the reference it carries now — once, and
   * invisibly, which is what `docs/mtproto.md` §11 asks for.
   *
   * Documents alone. A photo is the same picture at several sizes and which one
   * to fetch is a choice this framework does not make, so it is refused by name
   * rather than answered with a guess.
   */
  download(): Promise<Uint8Array>
  /**
   * Call a method this build does not model, on the account this arrived on.
   *
   * The same surface {@link Account.api} carries, per `docs/api-design.md` §12,
   * so a handler reaching for something the actions do not cover does not have
   * to reach back to the client it was registered on. It is here rather than on
   * the unified context because the Bot API's escape hatch is a different type
   * universe — see `docs/unified-model.md` §5.
   */
  readonly api: MtprotoApi
  /**
   * The methods addressed to the peer this event arrived from.
   *
   * `docs/api-decisions.md` Decision 11: a context holds what the update
   * carried, and anything needing a peer to be resolved belongs to the client.
   * So the peer is supplied from the update and cannot be overridden, and a
   * method the schema does not address by peer is not on this surface at all.
   *
   * ```ts
   * const history = await event.here.messages.getHistory({ limit: 10 })
   * ```
   *
   * The reference comes from what the account wrote down when the update
   * arrived, so nothing here reaches the network to find a peer. An event that
   * names none, or one whose peer was only seen in passing, is refused with the
   * reason.
   */
  readonly here: BoundApi
}

/** What building a context needs beyond the update itself. */
export interface ContextOptions {
  /** The client the update arrived on. */
  readonly client: { readonly name: string }
  /** Logger scoped to this update. */
  readonly log: Logger
  /**
   * How this event acts on what it came from.
   *
   * Supplied by the account, which owns the peers and the way to reach a
   * datacenter. Without it the two operations refuse rather than pretend: a
   * context built outside an account can be read, and reading is all it can
   * honestly offer.
   */
  readonly actions?: ActionContext
}

/** Build the context for one update, normalizing it on the way. */
export function mtprotoContext(update: TlValue, options: ContextOptions): MtprotoContext {
  return contextFor(normalizeUpdate(update), options)
}

/** Build the context for an update that has already been normalized. */
export function contextFor(normalized: NormalizedUpdate, options: ContextOptions): MtprotoContext {
  return {
    kind: normalized.kind,
    transport: 'mtproto',
    chat: normalized.chat,
    sender: normalized.sender,
    message: normalized.message,
    messageIds: normalized.messageIds,
    text: normalized.text,
    date: normalized.date,
    raw: normalized.raw,
    client: options.client,
    log: options.log,
    ...actionsFor(normalized, options),
  }
}

/**
 * The operations an event can be acted on with, or ones that say why they
 * cannot run.
 *
 * A context is a shape a handler is given, so the members exist either way —
 * one that dropped them where an account was not supplied would fail with a
 * missing property rather than with a reason.
 */
function actionsFor(normalized: NormalizedUpdate, options: ContextOptions) {
  const context = options.actions
  if (context !== undefined) {
    return {
      ...updateActions(normalized, context),
      api: rawApi(context.invoke),
      here: boundApi({
        invoke: context.invoke,
        peer: async () => {
          const chat = normalized.chat
          if (chat === undefined) throw noPeer(normalized.kind)

          const known = await context.peers.byId(chat.kind, chat.id)
          if (known === undefined) {
            throw new PeerError(
              `the ${chat.kind} this '${normalized.kind}' arrived in was never written down`,
            )
          }

          return inputPeer(known) as never
        },
      }),
    }
  }

  const refuse = async (): Promise<never> => {
    throw new LifecycleError(`an event built outside an account cannot act on '${normalized.kind}'`)
  }

  return {
    reply: refuse,
    react: refuse,
    edit: refuse,
    delete: refuse,
    download: refuse,
    api: rawApi(refuse),
    here: boundApi({ invoke: refuse, peer: refuse }),
  }
}
