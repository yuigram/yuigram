/**
 * The Bot API context.
 *
 * What a handler receives. Built by the normalizer, extended by plugins, and
 * carrying the small set of actions that are safe on any update that has a
 * chat — anything more specific belongs on the client, where its availability
 * is a compile-time fact rather than a runtime surprise.
 */

import type { BaseContext, Logger } from '@yuigram/core'
import type { RawApi } from './api.js'
import type { Chat, Message, Update, User } from './generated/types/index.js'
import type { NormalizedUpdate } from './normalize.js'

/** Parameters accepted when replying. */
export interface ReplyParams {
  readonly parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  readonly reply_to_message_id?: number
  readonly disable_notification?: boolean
  readonly message_thread_id?: number
  readonly [key: string]: unknown
}

/** What every Bot API handler receives. */
export interface BotContext extends BaseContext {
  /** Always `bot-api` here; the discriminant a cross-client handler branches on. */
  readonly transport: 'bot-api'

  /** The raw API surface, for anything the context does not wrap. */
  readonly api: RawApi

  /** Telegram's update identifier. */
  readonly updateId: number
  /** The chat this concerns, where there is one. */
  readonly chat: Chat | undefined
  /** Who caused it, where that is known. */
  readonly sender: User | undefined
  /** Message text or caption. Never callback data — see `data`. */
  readonly text: string | undefined
  /** Callback data, for a callback query. */
  readonly data: string | undefined
  /** The typed query, for an inline query. */
  readonly query: string | undefined
  /** The payload of whichever field carried this update. */
  readonly payload: unknown
  /**
   * The message this update is, where it is one.
   *
   * Covers every message-bearing update kind - a plain message, an edit, a
   * channel post, a business message - so a handler reaching for `photo`,
   * `entities` or `reply_to_message` does not have to know which field
   * delivered it. Undefined for updates that are not messages.
   */
  readonly message: Message | undefined
  /** The untouched update. */
  readonly raw: Update

  /**
   * Reply in the chat this update came from.
   *
   * Safe because the chat came from the update itself; addressing a peer out
   * of the blue is a client-level operation.
   */
  reply(text: string, params?: ReplyParams): Promise<Message>
}

/**
 * The context a bot handler receives.
 *
 * An alias for {@link BotContext}, and the name to build on: an application
 * intersects the flavours of whatever plugins it installs and hands the result
 * to the client.
 *
 * ```ts
 * type MyContext = Context & SessionFlavor<Cart>
 *
 * const bot = new Bot<MyContext>(token)
 * ```
 */
export type Context = BotContext

/** Options for {@link createContext}. */
export interface CreateContextOptions {
  readonly normalized: NormalizedUpdate
  readonly api: RawApi
  readonly log: Logger
}

/** Build a context from a normalized update. */
export function createContext(options: CreateContextOptions): BotContext {
  const { normalized, api, log } = options

  return {
    transport: 'bot-api',
    api,
    log,
    kind: normalized.kind,
    date: normalized.date,
    updateId: normalized.updateId,
    chat: normalized.chat,
    sender: normalized.sender,
    text: normalized.text,
    data: normalized.data,
    query: normalized.query,
    payload: normalized.payload,
    message: normalized.message,
    raw: normalized.raw,

    async reply(text, params = {}) {
      if (normalized.chat === undefined) {
        throw new TypeError(
          `cannot reply to a '${normalized.kind}' update: it carries no chat. Use ctx.api to address a chat explicitly.`,
        )
      }

      return api.sendMessage({ chat_id: normalized.chat.id, text, ...params }) as Promise<Message>
    },
  }
}
