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
import type { MESSAGE_KINDS, UpdateEventKind } from '../generated/events.js'
import type { Message, ReactionType, Update } from '../generated/types/index.js'

/** Update kinds whose payload is a `Message`. Generated, so it cannot drift. */
export type MessageEventKind = (typeof MESSAGE_KINDS)[number]

/** What every context carries, whatever the event. */
export interface EventContext<K extends UpdateEventKind = UpdateEventKind> {
  /** Which event this is. A literal type, so it discriminates. */
  readonly kind: K
  /** Telegram's update identifier. */
  readonly updateId: number
  /** The untouched update, for anything the context does not model. */
  readonly raw: Update
  /** The full API surface, for anything the actions do not cover. */
  readonly api: RawApi
  /** Scoped logger. */
  readonly log: Logger
}

/** Options accepted when replying or sending. */
export interface SendOptions {
  readonly parse_mode?: string | undefined
  readonly reply_markup?: unknown
  readonly disable_notification?: boolean | undefined
  readonly protect_content?: boolean | undefined
  readonly message_effect_id?: string | undefined
  readonly [key: string]: unknown
}

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
  reply(text: string, options?: SendOptions): Promise<Message>

  /**
   * Send to the same chat without quoting.
   *
   * The distinction from `reply` is visible at the call site, which is where a
   * developer notices they quoted when they meant not to.
   */
  send(text: string, options?: SendOptions): Promise<Message>

  /** Edit this message's text. */
  edit(text: string, options?: SendOptions): Promise<Message | true>

  /** Delete this message. */
  delete(): Promise<true>

  /** Forward this message to another chat. */
  forward(to: number | string, options?: SendOptions): Promise<Message>

  /**
   * React to this message.
   *
   * Takes an emoji for the common case; pass reaction objects for custom emoji.
   * An empty array clears the bot's reaction.
   */
  react(reaction: string | readonly ReactionType[], options?: SendOptions): Promise<true>

  /** Pin this message in its chat. */
  pin(options?: SendOptions): Promise<true>

  /** Unpin this message. */
  unpin(): Promise<true>
}

/** A context for any update whose payload is a `Message`. */
export interface MessageContext<K extends MessageEventKind = MessageEventKind>
  extends EventContext<K>,
    MessageEventFields,
    MessageActions {}

/**
 * A message already known to carry text.
 *
 * `text` is a plain `string` here, earned by a narrower registration rather
 * than asserted for every message — a photo without a caption is a message with
 * no text, and `onMessage` cannot promise otherwise.
 */
export interface TextMessageContext<K extends MessageEventKind = MessageEventKind>
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
export interface CommandContext<K extends MessageEventKind = MessageEventKind>
  extends TextMessageContext<K> {
  readonly command: ParsedCommand
}

/** Actions available on a callback query. */
export interface CallbackQueryActions {
  /**
   * Answer the query.
   *
   * Telegram shows a loading state on the button until this is called, so it
   * should be called even with no text.
   */
  answer(text?: string, options?: SendOptions): Promise<true>
}

/** A context for a callback query. */
export interface CallbackQueryContext extends EventContext<'callback_query'>, CallbackQueryActions {
  readonly query: EventFieldsByKind['callback_query']['query']
  readonly sender: EventFieldsByKind['callback_query']['sender']
  readonly data: EventFieldsByKind['callback_query']['data']
  readonly message: EventFieldsByKind['callback_query']['message']
}

/**
 * The context a given event kind produces.
 *
 * Message kinds get the message actions; a callback query gets `answer`;
 * everything else gets its generated fields on the base context. Registration
 * selects the shape, so a handler for one kind never sees another kind's
 * optionality.
 */
export type ContextFor<K extends UpdateEventKind> = K extends MessageEventKind
  ? MessageContext<K>
  : K extends 'callback_query'
    ? CallbackQueryContext
    : EventContext<K> & EventFieldsByKind[K]

/** Anything a handler can receive. */
export type AnyEventContext = ContextFor<UpdateEventKind>
