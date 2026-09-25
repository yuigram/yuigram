/**
 * Update fixtures.
 *
 * Builders that produce well-formed Bot API payloads with sensible defaults, so
 * a test states only what it cares about. Everything is deterministic —
 * identifiers increment from a seed rather than coming from a clock or a
 * random source — because a flaky fixture is worse than no fixture.
 */

import type { CallbackQuery, Chat, Message, Update, User } from '../generated/types/index.js'

/** Deterministic identifier source, reset per builder set. */
let nextId = 1

/** Reset the identifier sequence, so a suite starts from a known state. */
export function resetFixtureIds(): void {
  nextId = 1
}

/** Allocate the next identifier. */
function id(): number {
  return nextId++
}

/** A fixed instant, so payloads never depend on the wall clock. */
const EPOCH = 1_700_000_000

/** Build a user. */
export function user(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id ?? id(),
    is_bot: false,
    first_name: 'Test',
    ...overrides,
  }
}

/** Build a bot user, which several methods return. */
export function botUser(overrides: Partial<User> = {}): User {
  return user({ is_bot: true, first_name: 'TestBot', username: 'test_bot', ...overrides })
}

/** Build a private chat. */
export function privateChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: overrides.id ?? id(),
    type: 'private',
    first_name: 'Test',
    ...overrides,
  } as Chat
}

/** Build a group chat. */
export function groupChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: overrides.id ?? -id(),
    type: 'supergroup',
    title: 'Test Group',
    ...overrides,
  } as Chat
}

/** Options accepted by the message builder. */
export interface MessageOptions {
  readonly text?: string
  readonly from?: User
  readonly chat?: Chat
  readonly messageId?: number
  readonly date?: number
}

/** Build a message. */
export function message(options: MessageOptions = {}): Message {
  const from = options.from ?? user()
  const chat = options.chat ?? privateChat({ id: from.id })

  return {
    message_id: options.messageId ?? id(),
    date: options.date ?? EPOCH,
    chat,
    from,
    ...(options.text === undefined ? {} : { text: options.text }),
  } as Message
}

/** Wrap a payload as an `Update`. */
function update(payload: Partial<Update>): Update {
  return { update_id: id(), ...payload } as Update
}

/** An update carrying a new message. */
export function messageUpdate(options: MessageOptions = {}): Update {
  return update({ message: message(options) })
}

/** An update carrying an edited message. */
export function editedMessageUpdate(options: MessageOptions = {}): Update {
  return update({ edited_message: message(options) })
}

/** An update carrying a channel post. */
export function channelPostUpdate(options: MessageOptions = {}): Update {
  return update({ channel_post: message(options) })
}

/** Options accepted by the callback-query builder. */
export interface CallbackQueryOptions {
  readonly data?: string
  readonly from?: User
  readonly message?: Message
}

/** An update carrying a callback query. */
export function callbackQueryUpdate(options: CallbackQueryOptions = {}): Update {
  const from = options.from ?? user()

  const query = {
    id: String(id()),
    from,
    chat_instance: String(id()),
    message: options.message ?? message({ from }),
    ...(options.data === undefined ? {} : { data: options.data }),
  } as CallbackQuery

  return update({ callback_query: query })
}

/** An update carrying an inline query. */
export function inlineQueryUpdate(query = '', from: User = user()): Update {
  return update({
    inline_query: { id: String(id()), from, query, offset: '' },
  } as Partial<Update>)
}

/**
 * An update of a kind the installed schema does not know.
 *
 * Telegram ships new update types before a client regenerates, so the pipeline
 * must carry them through rather than discarding them.
 */
export function unknownUpdate(kind = 'some_future_update'): Update {
  return { update_id: id(), [kind]: { anything: true } } as unknown as Update
}

/** A service message promoting a member join, which the Bot API sends as a message. */
export function memberJoinedUpdate(joined: User = user(), chat: Chat = groupChat()): Update {
  return update({
    message: {
      message_id: id(),
      date: EPOCH,
      chat,
      new_chat_members: [joined],
    } as unknown as Message,
  })
}

/** An update carrying the inline result a person picked. */
export function chosenInlineResultUpdate(
  resultId: string,
  options: {
    readonly query?: string
    readonly from?: User
    readonly inlineMessageId?: string
  } = {},
): Update {
  return update({
    chosen_inline_result: {
      result_id: resultId,
      from: options.from ?? user(),
      query: options.query ?? '',
      ...(options.inlineMessageId === undefined
        ? {}
        : { inline_message_id: options.inlineMessageId }),
    },
  } as Partial<Update>)
}

/** Options accepted by the reaction builder. */
export interface ReactionOptions {
  /** The message reacted to. */
  readonly messageId: number
  readonly chat?: Chat
  readonly user?: User
  /** Emoji set before, and after. Each a plain emoji. */
  readonly old?: readonly string[]
  readonly new: readonly string[]
}

/** An update carrying one person's change of reaction to a message. */
export function messageReactionUpdate(options: ReactionOptions): Update {
  const who = options.user ?? user()
  const emoji = (list: readonly string[] = []) => list.map((one) => ({ type: 'emoji', emoji: one }))

  return update({
    message_reaction: {
      chat: options.chat ?? privateChat({ id: who.id }),
      message_id: options.messageId,
      user: who,
      date: EPOCH,
      old_reaction: emoji(options.old),
      new_reaction: emoji(options.new),
    },
  } as Partial<Update>)
}

/** An update asking a bot to confirm a checkout before the payment is taken. */
export function preCheckoutQueryUpdate(options: {
  readonly payload: string
  readonly currency?: string
  readonly totalAmount?: number
  readonly from?: User
}): Update {
  return update({
    pre_checkout_query: {
      id: String(id()),
      from: options.from ?? user(),
      currency: options.currency ?? 'XTR',
      total_amount: options.totalAmount ?? 1,
      invoice_payload: options.payload,
    },
  } as Partial<Update>)
}

/** An update carrying a vote in a non-anonymous poll. */
export function pollAnswerUpdate(options: {
  readonly pollId: string
  readonly optionIds: readonly number[]
  readonly user?: User
}): Update {
  return update({
    poll_answer: {
      poll_id: options.pollId,
      user: options.user ?? user(),
      option_ids: [...options.optionIds],
      option_persistent_ids: options.optionIds.map(String),
    },
  } as Partial<Update>)
}

/** An update carrying somebody asking to join a chat the bot manages. */
export function chatJoinRequestUpdate(
  options: { readonly chat?: Chat; readonly from?: User; readonly bio?: string } = {},
): Update {
  const from = options.from ?? user()

  return update({
    chat_join_request: {
      chat: options.chat ?? groupChat(),
      from,
      user_chat_id: from.id,
      date: EPOCH,
      ...(options.bio === undefined ? {} : { bio: options.bio }),
    },
  } as Partial<Update>)
}
