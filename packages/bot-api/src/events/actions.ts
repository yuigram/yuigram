/**
 * What a context can do.
 *
 * Every action here operates on the message that arrived, so none of them takes
 * a chat: the chat came with the update. That is the whole boundary — an action
 * that would need a peer the update never mentioned belongs on the client,
 * where peer resolution lives.
 *
 * Three things are inherited from the originating message, and getting any of
 * them wrong is a bug users see:
 *
 * - **`message_thread_id`**, or a reply inside a forum topic lands in the
 *   general chat.
 * - **`business_connection_id`**, or a reply on a business account is sent as
 *   the bot rather than as the account.
 * - **`chat_id`**, obviously, but note it is taken from the message rather than
 *   from anything the caller passes.
 *
 * Caller options are spread *after* the inherited fields, so an explicit
 * argument always wins — except `reply_parameters`, which is merged so the
 * quoted message id survives while `quote` and the rest stay overridable.
 */

import { ValidationError } from '@yuigram/core'
import type { RawApi } from '../api.js'
import type { CallbackQuery, Message, ReactionType } from '../generated/types/index.js'
import type { CallbackQueryActions, MessageActions, SendOptions } from './types.js'

/** What building the message actions needs. */
export interface MessageActionDeps {
  readonly api: RawApi
  readonly message: Message
}

/**
 * Fields an action inherits from the message it acts on.
 *
 * `business_connection_id` is included only when present: sending an explicit
 * `undefined` is not the same as omitting it for every Bot API client, and the
 * difference has bitten enough libraries to be worth avoiding.
 */
function inherited(message: Message): Record<string, unknown> {
  const fields: Record<string, unknown> = { chat_id: message.chat.id }

  if (message.message_thread_id !== undefined) {
    fields['message_thread_id'] = message.message_thread_id
  }
  if (message.business_connection_id !== undefined) {
    fields['business_connection_id'] = message.business_connection_id
  }

  return fields
}

/** Normalize the two accepted reaction forms into what Telegram expects. */
function toReactions(reaction: string | readonly ReactionType[]): ReactionType[] {
  if (typeof reaction !== 'string') return [...reaction]

  // The common case: a bare emoji. An empty string clears the reaction, which
  // is what Telegram does with an empty list.
  return reaction === '' ? [] : [{ type: 'emoji', emoji: reaction } as ReactionType]
}

/** Build the actions for a context carrying a message. */
export function messageActions(deps: MessageActionDeps): MessageActions {
  const { api, message } = deps

  return {
    reply(text: string, options: SendOptions = {}): Promise<Message> {
      const { reply_parameters, ...rest } = options

      return api.sendMessage({
        ...inherited(message),
        text,
        ...rest,
        // Merged rather than replaced: the quoted message is this one, but a
        // caller may still set `quote` or `allow_sending_without_reply`.
        reply_parameters: {
          message_id: message.message_id,
          ...(reply_parameters as Record<string, unknown> | undefined),
        },
      } as never) as Promise<Message>
    },

    send(text: string, options: SendOptions = {}): Promise<Message> {
      return api.sendMessage({
        ...inherited(message),
        text,
        ...options,
      } as never) as Promise<Message>
    },

    edit(text: string, options: SendOptions = {}): Promise<Message | true> {
      // Editing addresses the message itself, so the thread is irrelevant and
      // only the business connection carries over.
      const business =
        message.business_connection_id === undefined
          ? {}
          : { business_connection_id: message.business_connection_id }

      return api.editMessageText({
        chat_id: message.chat.id,
        message_id: message.message_id,
        ...business,
        text,
        ...options,
      } as never) as Promise<Message | true>
    },

    delete(): Promise<true> {
      return api.deleteMessage({
        chat_id: message.chat.id,
        message_id: message.message_id,
      }) as Promise<true>
    },

    forward(to: number | string, options: SendOptions = {}): Promise<Message> {
      return api.forwardMessage({
        chat_id: to,
        from_chat_id: message.chat.id,
        message_id: message.message_id,
        ...options,
      } as never) as Promise<Message>
    },

    react(reaction: string | readonly ReactionType[], options: SendOptions = {}): Promise<true> {
      return api.setMessageReaction({
        chat_id: message.chat.id,
        message_id: message.message_id,
        reaction: toReactions(reaction),
        ...options,
      } as never) as Promise<true>
    },

    pin(options: SendOptions = {}): Promise<true> {
      return api.pinChatMessage({
        chat_id: message.chat.id,
        message_id: message.message_id,
        ...options,
      } as never) as Promise<true>
    },

    unpin(): Promise<true> {
      return api.unpinChatMessage({
        chat_id: message.chat.id,
        message_id: message.message_id,
      } as never) as Promise<true>
    },
  }
}

/**
 * Build the actions for a callback query context.
 *
 * A callback query reaches its chat through the message the button sits on,
 * which Telegram sends in one of two mutually exclusive ways: `message` for a
 * button on a chat message, `inline_message_id` for one on an inline-mode
 * result. Neither is guaranteed, so each action states which it needs.
 *
 * They are on the context rather than behind a check the caller writes, because
 * a callback query kind *can* do these things — the button was pressed
 * somewhere. Whether a particular query can is a call-time question, answered
 * with an error that names the reason rather than a `TypeError` about a missing
 * function. Kinds that can never reach a chat, such as `poll_answer`, do not
 * carry these actions at all.
 */
export function callbackQueryActions(api: RawApi, query: CallbackQuery): CallbackQueryActions {
  const message = query.message

  /** The chat the button lives in, or an error explaining why there is none. */
  function requireMessage(action: string): Message {
    if (message === undefined) {
      throw new ValidationError(
        `cannot ${action} from this callback query: it came from an inline message, which has no chat. Check \`query.message\` first, or use \`query.edit()\`, which works for both.`,
      )
    }

    // An InaccessibleMessage still carries `chat` and `message_id` — only its
    // content is withheld — so addressing it works even when reading it does not.
    return message as Message
  }

  return {
    answer(text?: string, options: SendOptions = {}): Promise<true> {
      return api.answerCallbackQuery({
        callback_query_id: query.id,
        ...(text === undefined ? {} : { text }),
        ...options,
      } as never) as Promise<true>
    },

    // These four are `async` so that a missing message rejects the promise
    // rather than throwing before one exists. A method that returns a promise
    // on the happy path and throws synchronously on the unhappy one cannot be
    // handled with `.catch()`, which is how most callers would write it.
    async reply(text: string, options: SendOptions = {}): Promise<Message> {
      return messageActions({ api, message: requireMessage('reply') }).reply(text, options)
    },

    async send(text: string, options: SendOptions = {}): Promise<Message> {
      return messageActions({ api, message: requireMessage('send') }).send(text, options)
    },

    async edit(text: string, options: SendOptions = {}): Promise<Message | true> {
      // The one action that works for both forms, which is why the error above
      // points at it.
      if (query.inline_message_id !== undefined) {
        return api.editMessageText({
          inline_message_id: query.inline_message_id,
          text,
          ...options,
        } as never) as Promise<Message | true>
      }

      return messageActions({ api, message: requireMessage('edit') }).edit(text, options)
    },

    async delete(): Promise<true> {
      return messageActions({ api, message: requireMessage('delete the message') }).delete()
    },
  }
}
