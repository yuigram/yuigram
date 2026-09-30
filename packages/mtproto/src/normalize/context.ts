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
import type { PeerView } from '../chats/peers.js'
import { readAction, type ServiceAction } from '../entities/action.js'
import type {
  TypeInputBotInlineMessageID,
  TypeInputBotInlineResult,
  TypeInputMedia,
  TypeMessage,
} from '../generated/api/types/index.js'
import { type BoundApi, boundApi, noPeer } from '../here.js'
import type { CopyOptions } from '../messaging/compose.js'
import type {
  CallbackAnswer,
  EditOptions,
  ForwardOptions,
  InlineAnswer,
  MessageBody,
  SendOptions,
  ShippingAnswer,
} from '../messaging/send.js'
import { inputPeer } from '../network/peers.js'
import type { TlValue } from '../tl/index.js'
import { type ActionContext, type MediaDownloadOptions, updateActions } from './actions.js'
import type { MtprotoEventKind } from './events.js'
import { type NormalizedUpdate, normalizeUpdate, type PeerRef } from './normalize.js'
import type { SentMessage } from './sent.js'

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
  /**
   * Whom it is about, where that is somebody apart from the conversation and
   * the one who acted — the member an admin promoted, the user whose status
   * changed.
   */
  readonly target: PeerRef | undefined
  /** The message, for the kinds that carry a whole one. */
  readonly message: TypeMessage | undefined
  /**
   * What a service message says happened — a member joining, a title changed,
   * a payment received — read, with a `kind` to switch on. `undefined` for
   * anything that is not a service message. `f.action(...)` matches on it and
   * narrows it.
   */
  readonly action: ServiceAction | undefined
  /** The messages of an album, in order, for `mtproto:album` alone. */
  readonly album: readonly TypeMessage[] | undefined
  /** The messages a deletion names. */
  readonly messageIds: readonly number[] | undefined
  /** Message text, where there is any. */
  readonly text: string | undefined
  /** When it happened, where the update says. */
  readonly date: number | undefined
  /** The forum topic a message was posted in, where the conversation has topics. */
  readonly topicId: number | undefined
  /**
   * What a pressed button carried, read as text.
   *
   * Callback data is bytes over this transport. Data that is not UTF-8 text is
   * left here as `undefined` and stays readable under `raw.data`.
   */
  readonly data: string | undefined
  /** The query an answer goes back to, for the kinds that are questions. */
  readonly queryId: bigint | undefined
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
   *
   * Answers with what was sent. MTProto replies to a send with the updates it
   * caused rather than with the message, so the identifier is picked out of
   * them against the number the send was deduplicated by; the answer itself
   * stays reachable under `raw`.
   */
  reply(body: MessageBody, options?: SendOptions): Promise<SentMessage>
  /**
   * Answer the message this event carries with media, and text beside it.
   *
   * The media is what `account.sendMedia` takes — a photo or document already
   * on Telegram, or one `uploadMedia` has uploaded.
   */
  replyMedia(media: TypeInputMedia, body?: MessageBody, options?: SendOptions): Promise<SentMessage>
  /**
   * Say something in the conversation this event arrived in, answering nothing.
   *
   * For an event with a conversation and no message to quote — a person
   * starting a bot again, a button pressed under an old message.
   */
  send(body: MessageBody, options?: SendOptions): Promise<SentMessage>
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
  edit(body: MessageBody, options?: EditOptions): Promise<TlValue>
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
   * Fetch the file this event's message carried.
   *
   * The reference a message carries expires on the datacenter's own schedule
   * and nothing announces it. A refused one is answered by asking for the
   * message again and fetching with the reference it carries now — once, and
   * invisibly, which is what `docs/mtproto.md` §11 asks for.
   *
   * A document is one file. A photo is the same picture at several sizes, and
   * the largest of the ones that have to be fetched is taken — the answer this
   * project already gives the same question on the other transport. Media that
   * carries no file at all is refused by name.
   *
   * ```ts
   * const preview = await event.download({ thumbnail: 'm' })
   * ```
   *
   * Naming a thumbnail fetches that rendering of the document or photo
   * instead, and a refused reference is put right the same way.
   */
  download(options?: MediaDownloadOptions): Promise<Uint8Array>
  /** Forward the message this event carries, showing where it came from. */
  forward(to: string | PeerRef, options?: ForwardOptions): Promise<void>
  /** Send the message this event carries again, as this account's own. */
  copy(to: string | PeerRef, options?: CopyOptions): Promise<SentMessage>
  /** Pin the message this event carries in its conversation. */
  pin(options?: { readonly silent?: boolean; readonly bothSides?: boolean }): Promise<void>
  /** Unpin it. */
  unpin(): Promise<void>
  /**
   * Answer a pressed button: with nothing, a notice, an alert or a link.
   *
   * A button that is not answered keeps its spinner until Telegram gives up
   * on it.
   */
  answerCallback(answer?: CallbackAnswer): Promise<void>
  /** Answer an inline query with results. */
  answerInline(results: readonly TypeInputBotInlineResult[], answer?: InlineAnswer): Promise<void>
  /** Answer a payment's shipping question. */
  answerShipping(answer: ShippingAnswer): Promise<void>
  /** Accept a payment, or refuse it with a reason the payer is shown. */
  answerPrecheckout(refusal?: string): Promise<void>
  /** Answer a guest chat query with one result, and learn the message it became. */
  answerGuest(result: TypeInputBotInlineResult): Promise<TypeInputBotInlineMessageID>
  /** Let the person asking to join in, or turn them away. */
  decideJoin(approved: boolean): Promise<void>
  /** Read who the conversation is, from Telegram. */
  fetchChat(): Promise<PeerView>
  /** Read who caused this event, from Telegram. */
  fetchSender(): Promise<PeerView>
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
    target: normalized.target,
    message: normalized.message,
    action:
      normalized.message?._ === 'messageService'
        ? readAction(normalized.message.action)
        : undefined,
    album: normalized.album,
    messageIds: normalized.messageIds,
    text: normalized.text,
    date: normalized.date,
    topicId: normalized.topicId,
    data: dataOf(normalized.raw),
    queryId: queryIdOf(normalized.raw),
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
    replyMedia: refuse,
    send: refuse,
    react: refuse,
    edit: refuse,
    delete: refuse,
    download: refuse,
    forward: refuse,
    copy: refuse,
    pin: refuse,
    unpin: refuse,
    answerCallback: refuse,
    answerInline: refuse,
    answerShipping: refuse,
    answerPrecheckout: refuse,
    answerGuest: refuse,
    decideJoin: refuse,
    fetchChat: refuse,
    fetchSender: refuse,
    api: rawApi(refuse),
    here: boundApi({ invoke: refuse, peer: refuse }),
  }
}

/** Callback data, where the update carries some and it is text. */
function dataOf(raw: TlValue): string | undefined {
  const data = (raw as unknown as Record<string, unknown>)['data']
  if (!(data instanceof Uint8Array)) return undefined

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    // Bytes that are not text are the button's own business, and a string
    // made of replacement characters would compare equal to nothing a caller
    // meant.
    return undefined
  }
}

/** The query an update asks, for the kinds that are answered by one. */
function queryIdOf(raw: TlValue): bigint | undefined {
  const id = (raw as unknown as Record<string, unknown>)['query_id']

  return typeof id === 'bigint' ? id : undefined
}
