/**
 * What a handler receives.
 *
 * One context type per event kind, so a handler registered for `message` gets a
 * `chat` that is a `Chat` — not a `Chat | undefined`. The single shared context
 * this replaces had to degrade every field to its weakest case, because one
 * type served twenty-six kinds.
 *
 * The split is deliberate and load-bearing:
 *
 * - **Fields are generated.** `EventFieldsByKind` comes from the schema, so the
 *   optionality here is Telegram's own. Nothing is asserted that Telegram does
 *   not guarantee, and nothing Telegram does guarantee is thrown away.
 * - **Behaviour is hand-written.** `reply`, `edit`, `react` cannot be derived
 *   from a schema: which fields an action must inherit from the originating
 *   message is a judgement, not a lookup.
 *
 * Actions live on the context because the update already addressed something —
 * the chat and the message id came with it. Addressing a peer that did not
 * arrive in an update is a client operation, since it needs resolution the
 * context cannot do. That boundary is what keeps the same shape working when
 * MTProto arrives, where resolving a peer needs an access hash the client owns.
 */

import type { Logger } from '@yuigram/core'
import type { RawApi } from '../api.js'
import type { EventFieldsByKind, MessageEventFields } from '../generated/contexts.js'
import type {
  BotEventKind,
  MESSAGE_KINDS,
  ServiceEventKind,
  UpdateEventKind,
} from '../generated/events.js'
import type {
  AnswerCallbackQueryParams,
  EditMessageTextParams,
  ForwardMessageParams,
  PinChatMessageParams,
  SendAnimationParams,
  SendAudioParams,
  SendDocumentParams,
  SendMessageParams,
  SendPhotoParams,
  SendStickerParams,
  SendVideoNoteParams,
  SendVideoParams,
  SendVoiceParams,
  SetMessageReactionParams,
} from '../generated/methods/index.js'
import type { Message, ReactionType, Update } from '../generated/types/index.js'
import type {
  CallbackQueryBoundApi,
  InlineQueryBoundApi,
  MessageBoundApi,
  PreCheckoutQueryBoundApi,
  ShippingQueryBoundApi,
} from './bound.js'

/** Update kinds whose payload is a `Message`. Generated, so it cannot drift. */
export type MessageEventKind = (typeof MESSAGE_KINDS)[number]

/**
 * Every kind that arrives carrying a `Message`.
 *
 * A service message — someone joined, the title changed, a topic was created —
 * is promoted to its own kind so a handler can select it directly, but it is
 * still a message in an ordinary chat. It therefore gets the message context,
 * with `reply` and the rest, exactly like the kind it was promoted from.
 */
export type AnyMessageEventKind = MessageEventKind | ServiceEventKind

/** What every context carries, whatever the event. */
export interface EventContext<K extends BotEventKind = BotEventKind> {
  /** Which event this is. A literal type, so it discriminates. */
  readonly kind: K
  /**
   * Always `'bot-api'` here.
   *
   * The discriminant for code that sees events from more than one subsystem.
   * Telegram's own timestamp is not normalized onto the context: it belongs to
   * the payload, in the units Telegram sends, and is reachable there.
   */
  readonly transport: 'bot-api'
  /** Telegram's update identifier. */
  readonly updateId: number
  /** The untouched update, for anything the context does not model. */
  readonly raw: Update
  /** The full API surface, for anything the actions do not cover. */
  readonly api: RawApi
  /** Scoped logger. */
  readonly log: Logger
}

/**
 * Options for an action, as the method's own parameters minus what the context
 * supplies.
 *
 * Derived from the generated parameter types rather than listed by hand, so
 * every option Telegram accepts is offered with its own documentation and its
 * own type — and a parameter added in a future Bot API appears without anyone
 * editing this file. The earlier hand-written shape had five fields and an
 * index signature, which accepted `parse_moed` as readily as `parse_mode`.
 */
export type OptionsFor<Params, Supplied extends keyof Params> = Omit<Params, Supplied>

/** Options accepted when replying. `reply_parameters` is merged, not replaced. */
export type ReplyOptions = OptionsFor<SendMessageParams, 'chat_id' | 'text'>

/** Options accepted when sending into the same chat. */
export type SendOptions = OptionsFor<SendMessageParams, 'chat_id' | 'text'>

/**
 * One media send, as its own parameters with the file required.
 *
 * The union of these is what lets `reply({ photo })` and `reply({ video })` be
 * one method with the right options for each, instead of eight `replyWith…`
 * variants that differ only in a word.
 */
type MediaSend<K extends keyof P & string, P> = {
  readonly [Key in K]-?: NonNullable<P[Key]>
} & Omit<P, 'chat_id' | K>

/**
 * What a reply or a send can carry besides text.
 *
 * Only the methods that take exactly one file are here: `sendMediaGroup` and
 * `sendPaidMedia` take a list, so there is no single key to dispatch on and
 * they stay explicit calls.
 */
export type SendContent =
  | MediaSend<'photo', SendPhotoParams>
  | MediaSend<'video', SendVideoParams>
  | MediaSend<'animation', SendAnimationParams>
  | MediaSend<'audio', SendAudioParams>
  | MediaSend<'document', SendDocumentParams>
  | MediaSend<'voice', SendVoiceParams>
  | MediaSend<'video_note', SendVideoNoteParams>
  | MediaSend<'sticker', SendStickerParams>

/** Options accepted when editing this message's text. */
export type EditOptions = OptionsFor<EditMessageTextParams, 'chat_id' | 'message_id' | 'text'>

/** Options accepted when forwarding this message. */
export type ForwardOptions = OptionsFor<
  ForwardMessageParams,
  'chat_id' | 'from_chat_id' | 'message_id'
>

/** Options accepted when reacting to this message. */
export type ReactOptions = OptionsFor<
  SetMessageReactionParams,
  'chat_id' | 'message_id' | 'reaction'
>

/** Options accepted when pinning this message. */
export type PinOptions = OptionsFor<PinChatMessageParams, 'chat_id' | 'message_id'>

/** Options accepted when answering a callback query. */
export type AnswerOptions = OptionsFor<AnswerCallbackQueryParams, 'callback_query_id' | 'text'>

/**
 * Actions available on any update that carried a message.
 *
 * Every one of these operates on the message that arrived. None of them takes a
 * chat, because the chat is already known — passing one would invite addressing
 * a peer the update never mentioned, which is a client-level concern.
 */
export interface MessageActions {
  /**
   * Reply, quoting this message.
   *
   * Inherits the thread and business connection from the original. Without
   * that, a reply inside a forum topic lands in the general chat and a reply on
   * a business account is sent as the bot instead.
   */
  reply(text: string, options?: ReplyOptions): Promise<Message>

  /**
   * Reply with media rather than text.
   *
   * The key decides the method — `{ photo }` sends a photo, `{ video }` a video
   * — and the rest of the object is that method's own options, typed for it.
   * One entry point instead of eight `replyWith…` names that differ by a word,
   * which is fewer names to choose wrongly between for a person and for an
   * assistant reading the types.
   */
  reply(content: SendContent): Promise<Message>

  /**
   * Send to the same chat without quoting.
   *
   * The distinction from `reply` is visible at the call site, which is where a
   * developer notices they quoted when they meant not to.
   */
  send(text: string, options?: SendOptions): Promise<Message>

  /** Send media to the same chat without quoting. */
  send(content: SendContent): Promise<Message>

  /** Edit this message's text. */
  edit(text: string, options?: EditOptions): Promise<Message | true>

  /** Delete this message. */
  delete(): Promise<true>

  /** Forward this message to another chat. */
  forward(to: number | string, options?: ForwardOptions): Promise<Message>

  /**
   * React to this message.
   *
   * Takes an emoji for the common case; pass reaction objects for custom emoji.
   * An empty array clears the bot's reaction.
   */
  react(reaction: string | readonly ReactionType[], options?: ReactOptions): Promise<true>

  /** Pin this message in its chat. */
  pin(options?: PinOptions): Promise<true>

  /** Unpin this message. */
  unpin(): Promise<true>
}

/**
 * A context for any update whose payload is a `Message`.
 *
 * Three layers, in the order a reader meets them: the payload's own fields, the
 * curated actions, and every API method that this message or its chat can
 * address, pre-filled. The third layer is generated from the schema — see
 * {@link MessageBoundApi} — so it stays complete without being maintained.
 */
export interface MessageContext<K extends AnyMessageEventKind = AnyMessageEventKind>
  extends EventContext<K>,
    MessageEventFields,
    MessageActions,
    MessageBoundApi {}

/**
 * A message already known to carry text.
 *
 * `text` is a plain `string` here, earned by a narrower registration rather
 * than asserted for every message — a photo without a caption is a message with
 * no text, and `onMessage` cannot promise otherwise.
 */
export interface TextMessageContext<K extends AnyMessageEventKind = AnyMessageEventKind>
  extends MessageContext<K> {
  readonly text: string
}

/** A parsed command. */
export interface ParsedCommand {
  /** Command name, without the slash or the `@bot` suffix. */
  readonly name: string
  /** The `@bot` suffix, when present. */
  readonly mention: string | undefined
  /** Everything after the command, unsplit. */
  readonly rest: string
  /** `rest` split on whitespace. */
  readonly args: readonly string[]
}

/** A text message that parsed as a command. */
export interface CommandContext<K extends AnyMessageEventKind = AnyMessageEventKind>
  extends TextMessageContext<K> {
  readonly command: ParsedCommand
}

/**
 * Actions available on a callback query.
 *
 * `answer` always works. The rest go through the message the button sits on,
 * which Telegram supplies as either `message` or `inline_message_id`; an action
 * that needs the one it did not get throws a `ValidationError` naming the
 * reason. `edit` is the exception — it works for both.
 */
export interface CallbackQueryActions {
  /**
   * Answer the query.
   *
   * Telegram shows a loading state on the button until this is called, so it
   * should be called even with no text.
   */
  answer(text?: string, options?: AnswerOptions): Promise<true>

  /** Send into the chat the button lives in, quoting the message it sits on. */
  reply(text: string, options?: ReplyOptions): Promise<Message>

  /**
   * Reply with media rather than text.
   *
   * The key decides the method — `{ photo }` sends a photo, `{ video }` a video
   * — and the rest of the object is that method's own options, typed for it.
   * One entry point instead of eight `replyWith…` names that differ by a word,
   * which is fewer names to choose wrongly between for a person and for an
   * assistant reading the types.
   */
  reply(content: SendContent): Promise<Message>

  /** Send into the chat the button lives in, without quoting. */
  send(text: string, options?: SendOptions): Promise<Message>

  /** Send media to the same chat without quoting. */
  send(content: SendContent): Promise<Message>

  /** Edit the message the button sits on. Works for inline messages too. */
  edit(text: string, options?: EditOptions): Promise<Message | true>

  /** Delete the message the button sits on. */
  delete(): Promise<true>
}

/** A context for a callback query. */
export interface CallbackQueryContext
  extends EventContext<'callback_query'>,
    CallbackQueryActions,
    CallbackQueryBoundApi {
  readonly query: EventFieldsByKind['callback_query']['query']
  readonly sender: EventFieldsByKind['callback_query']['sender']
  readonly data: EventFieldsByKind['callback_query']['data']
  readonly message: EventFieldsByKind['callback_query']['message']
}

/**
 * A context for an inline query.
 *
 * Carries `answerInlineQuery` with the query id supplied. The message families
 * are absent: an inline query has no chat, and offering methods that would
 * always reject is the dishonesty the per-event contexts exist to remove.
 */
export type InlineQueryContext = EventContext<'inline_query'> &
  EventFieldsByKind['inline_query'] &
  InlineQueryBoundApi

/** A context for a shipping query. */
export type ShippingQueryContext = EventContext<'shipping_query'> &
  EventFieldsByKind['shipping_query'] &
  ShippingQueryBoundApi

/** A context for a pre-checkout query. */
export type PreCheckoutQueryContext = EventContext<'pre_checkout_query'> &
  EventFieldsByKind['pre_checkout_query'] &
  PreCheckoutQueryBoundApi

/**
 * The context a given event kind produces.
 *
 * Message kinds — including the service messages promoted out of them — get the
 * message actions and the bound method families; a query kind gets its answer
 * method; everything else gets its generated fields on the base context.
 * Registration selects the shape, so a handler for one kind never sees another
 * kind's optionality.
 */
export type ContextFor<K extends BotEventKind> = K extends AnyMessageEventKind
  ? MessageContext<K>
  : K extends 'callback_query'
    ? CallbackQueryContext
    : K extends 'inline_query'
      ? InlineQueryContext
      : K extends 'shipping_query'
        ? ShippingQueryContext
        : K extends 'pre_checkout_query'
          ? PreCheckoutQueryContext
          : K extends UpdateEventKind
            ? EventContext<K> & EventFieldsByKind[K]
            : never

/** Anything a handler can receive. */
export type AnyEventContext = ContextFor<BotEventKind>
