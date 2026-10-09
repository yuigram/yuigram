// SPDX-License-Identifier: MPL-2.0

/**
 * The curated filters.
 *
 * Presence is generated; everything here needs a judgement a schema cannot
 * make — what "a private chat" means, which entity types count as a link, that
 * a command is text with a particular shape. Each is small, and each is the
 * thing a bot would otherwise write by hand in every project.
 *
 * ## Why no `match` on the context
 *
 * A reference implementation attaches the `RegExpMatchArray` to the update, so
 * a pattern filter leaves `update.match` behind for the handler. Yuigram does
 * not, because a filter that writes to the context writes to a context every
 * *later* handler for that update also sees — including handlers that have
 * nothing to do with the pattern that produced it. `onCommand` supplies its
 * parsed command through a derived context precisely to avoid that, and a
 * handler that wants capture groups can run the pattern it already has.
 */

import type { Filter } from '@yuigram/core'
import type {
  AnyEventContext,
  CallbackQueryContext,
  ContextFor,
  MessageContext,
  PreCheckoutQueryContext,
  ShippingQueryContext,
} from '../events/index.js'
import { filter } from '../filter.js'
import type { UpdateEventKind } from '../generated/events.js'
import type {
  Chat,
  ChatMember,
  Message,
  MessageEntity,
  ReactionType,
  SuccessfulPayment,
  User,
} from '../generated/types/index.js'
import { has, MESSAGE_BEARING_KINDS } from './presence.js'

/** A string or pattern to match text against. */
export type TextMatch = string | RegExp

/** Whether a value matches, by equality or by pattern. */
function matches(value: string, match: TextMatch): boolean {
  return typeof match === 'string' ? value === match : match.test(value)
}

/** Read a string field from a context. */
function stringField(context: unknown, field: string): string | undefined {
  const value = (context as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

/**
 * Text, optionally matching it.
 *
 * Matching proves the field is a `string`, which is what lets the handler read
 * it without a guard.
 */
export function text(match?: TextMatch): Filter<MessageContext, { text: string }> {
  return filter<MessageContext, { text: string }>(
    match === undefined ? 'text' : `text(${String(match)})`,
    (context) => {
      const value = stringField(context, 'text')
      if (value === undefined) return false
      return match === undefined || matches(value, match)
    },
    { kinds: MESSAGE_BEARING_KINDS },
  )
}

/** A caption, optionally matching it. */
export function caption(match?: TextMatch): Filter<MessageContext, { caption: string }> {
  return filter<MessageContext, { caption: string }>(
    match === undefined ? 'caption' : `caption(${String(match)})`,
    (context) => {
      const value = stringField(context, 'caption')
      if (value === undefined) return false
      return match === undefined || matches(value, match)
    },
    { kinds: MESSAGE_BEARING_KINDS },
  )
}

/**
 * Text or caption, whichever the message carries.
 *
 * A photo with a caption and a text message are the same thing to most bots,
 * and writing the fallback by hand is the sort of line that gets forgotten in
 * one place out of five.
 */
export function anyText(match?: TextMatch): Filter<MessageContext, unknown> {
  return filter<MessageContext>(
    match === undefined ? 'anyText' : `anyText(${String(match)})`,
    (context) => {
      const value = stringField(context, 'text') ?? stringField(context, 'caption')
      if (value === undefined) return false
      return match === undefined || matches(value, match)
    },
    { kinds: MESSAGE_BEARING_KINDS },
  )
}

/** Matches a leading slash-command. Used by the shape families below. */
const COMMAND = /^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s|$)/

/**
 * Any slash-command, or one by name.
 *
 * The `@bot` mention check is deliberately **not** applied here: this filter is
 * composable and module-level, and it cannot know which client will run it.
 * `bot.onCommand` performs the check, which is the registration a bot should
 * use for commands it answers.
 */
export function command(name?: TextMatch): Filter<MessageContext, { text: string }> {
  return filter<MessageContext, { text: string }>(
    name === undefined ? 'command' : `command(${String(name)})`,
    (context) => {
      const value = stringField(context, 'text')
      if (value === undefined) return false

      const parsed = COMMAND.exec(value.trim())
      if (parsed === null) return false
      if (name === undefined) return true

      const commandName = parsed[1] ?? ''
      const wanted = typeof name === 'string' && name.startsWith('/') ? name.slice(1) : name

      return typeof wanted === 'string'
        ? commandName.toLowerCase() === wanted.toLowerCase()
        : wanted.test(commandName)
    },
    { kinds: MESSAGE_BEARING_KINDS },
  )
}

/** Read the chat from a message context. */
function chatOf(context: unknown): Chat | undefined {
  return (context as { chat?: Chat }).chat
}

/** Filters over the chat a message arrived in. */
export const chat = Object.freeze({
  /** A direct conversation with one user. */
  private: filter<MessageContext>('chat.private', (c) => chatOf(c)?.type === 'private', {
    kinds: MESSAGE_BEARING_KINDS,
  }),
  /** A basic group. Most groups are supergroups; see `chat.anyGroup`. */
  group: filter<MessageContext>('chat.group', (c) => chatOf(c)?.type === 'group', {
    kinds: MESSAGE_BEARING_KINDS,
  }),
  /** A supergroup. */
  supergroup: filter<MessageContext>('chat.supergroup', (c) => chatOf(c)?.type === 'supergroup', {
    kinds: MESSAGE_BEARING_KINDS,
  }),
  /**
   * A group of either kind.
   *
   * Telegram upgrades a group to a supergroup silently, so a bot that checks
   * only `group` stops working the day someone adds an admin. Almost every
   * "works in groups" check means this one.
   */
  anyGroup: filter<MessageContext>(
    'chat.anyGroup',
    (c) => {
      const type = chatOf(c)?.type
      return type === 'group' || type === 'supergroup'
    },
    { kinds: MESSAGE_BEARING_KINDS },
  ),
  /** A channel. */
  channel: filter<MessageContext>('chat.channel', (c) => chatOf(c)?.type === 'channel', {
    kinds: MESSAGE_BEARING_KINDS,
  }),
  /** A forum supergroup, where messages belong to topics. */
  forum: filter<MessageContext>('chat.forum', (c) => chatOf(c)?.is_forum === true, {
    kinds: MESSAGE_BEARING_KINDS,
  }),
  /** A specific chat, by id or username. */
  id(...wanted: ReadonlyArray<number | string>): Filter<MessageContext, unknown> {
    const set = new Set<number | string>(wanted)
    return filter<MessageContext>(
      `chat.id(${wanted.join(', ')})`,
      (context) => {
        const target = chatOf(context)
        if (target === undefined) return false
        return set.has(target.id) || (target.username !== undefined && set.has(target.username))
      },
      { kinds: MESSAGE_BEARING_KINDS },
    )
  },
})

/** Read the sender from any context that has one. */
function senderOf(context: unknown): User | undefined {
  return (context as { sender?: User }).sender
}

/** Filters over who sent the update. */
export const sender = Object.freeze({
  /** A specific user, by id or username. */
  id(...wanted: ReadonlyArray<number | string>): Filter<MessageContext, unknown> {
    const set = new Set<number | string>(wanted)
    return filter<MessageContext>(`sender.id(${wanted.join(', ')})`, (context) => {
      const user = senderOf(context)
      if (user === undefined) return false
      return set.has(user.id) || (user.username !== undefined && set.has(user.username))
    })
  },
  /** Sent by a bot. */
  isBot: filter<MessageContext>('sender.isBot', (c) => senderOf(c)?.is_bot === true),
  /** Sent by a user with Telegram Premium. */
  isPremium: filter<MessageContext>('sender.isPremium', (c) => senderOf(c)?.is_premium === true),
  /**
   * Sent on behalf of a chat rather than a person.
   *
   * An anonymous admin, or a channel posting into its discussion group. Both
   * arrive with a `from` that is a placeholder, which is why checking `sender`
   * alone gets this wrong.
   */
  anonymous: filter<MessageContext>(
    'sender.anonymous',
    (c) => (c as { sender_chat?: Chat }).sender_chat !== undefined,
    { kinds: MESSAGE_BEARING_KINDS },
  ),
  /** Sent through an inline bot. */
  viaBot: filter<MessageContext>(
    'sender.viaBot',
    (c) => (c as { via_bot?: User }).via_bot !== undefined,
    {
      kinds: MESSAGE_BEARING_KINDS,
    },
  ),
})

/**
 * Media families.
 *
 * Aliases into the generated presence filters, under the names a developer
 * reaches for. `media.photo` and `has.photo` are the same filter.
 */
export const media = Object.freeze({
  photo: has.photo,
  video: has.video,
  videoNote: has.video_note,
  animation: has.animation,
  audio: has.audio,
  voice: has.voice,
  document: has.document,
  sticker: has.sticker,
  story: has.story,
  contact: has.contact,
  location: has.location,
  venue: has.venue,
  poll: has.poll,
  dice: has.dice,
  game: has.game,
  invoice: has.invoice,
  paidMedia: has.paid_media,
  /** Any of the above that carries a file. */
  any: filter<MessageContext>(
    'media.any',
    (context) => {
      const record = context as unknown as Record<string, unknown>
      return MEDIA_FIELDS.some((field) => record[field] !== undefined)
    },
    { kinds: MESSAGE_BEARING_KINDS },
  ),
})

/** Fields whose presence means the message carries a file. */
const MEDIA_FIELDS: readonly string[] = [
  'photo',
  'video',
  'video_note',
  'animation',
  'audio',
  'voice',
  'document',
  'sticker',
  'paid_media',
]

/** Filters over a callback query. */
export const callback = Object.freeze({
  /** Callback data, optionally matching it. */
  data(match?: TextMatch): Filter<CallbackQueryContext, { data: string }> {
    return filter<CallbackQueryContext, { data: string }>(
      match === undefined ? 'callback.data' : `callback.data(${String(match)})`,
      (context) => {
        const value = stringField(context, 'data')
        if (value === undefined) return false
        return match === undefined || matches(value, match)
      },
      { kinds: ['callback_query'] },
    )
  },
  /** A query from a button on an inline-mode result, which has no chat. */
  inline: filter<CallbackQueryContext>(
    'callback.inline',
    (c) => (c as { inline_message_id?: string }).inline_message_id !== undefined,
    { kinds: ['callback_query'] },
  ),
})

/** Filters over replies. */
export const reply = Object.freeze({
  /** The message replies to another. */
  exists: has.reply_to_message,
  /**
   * The message replies to a particular message, by its number.
   *
   * What routes an answer back to a prompt: keep the identifier a send returned
   * and match replies to that message rather than to any message.
   */
  to(messageId: number): Filter<MessageContext, { reply_to_message: Message }> {
    return filter<MessageContext, { reply_to_message: Message }>(
      `reply.to(${messageId})`,
      (context) => {
        const replied = (context as { reply_to_message?: Message }).reply_to_message

        return replied?.message_id === messageId
      },
      { kinds: MESSAGE_BEARING_KINDS },
    )
  },
  /** The message replies to one of this bot's own messages. */
  toBot: filter<MessageContext>(
    'reply.toBot',
    (context) => {
      const replied = (context as { reply_to_message?: { from?: User } }).reply_to_message
      return replied?.from?.is_bot === true
    },
    { kinds: MESSAGE_BEARING_KINDS },
  ),
})

/** Filters over forwarded messages. */
export const forward = Object.freeze({
  /** The message was forwarded from somewhere. */
  exists: has.forward_origin,
  /** Forwarded from a chat rather than a user. */
  fromChat: filter<MessageContext>(
    'forward.fromChat',
    (context) => {
      const origin = (context as { forward_origin?: { type?: string } }).forward_origin
      return origin?.type === 'channel' || origin?.type === 'chat'
    },
    { kinds: MESSAGE_BEARING_KINDS },
  ),
})

/** Entities of a given type, in text or caption. */
function entityOfType(type: MessageEntity['type']): Filter<MessageContext, unknown> {
  return filter<MessageContext>(
    `entity.${type}`,
    (context) => {
      const record = context as { entities?: MessageEntity[]; caption_entities?: MessageEntity[] }
      const all = [...(record.entities ?? []), ...(record.caption_entities ?? [])]
      return all.some((entity) => entity.type === type)
    },
    { kinds: MESSAGE_BEARING_KINDS },
  )
}

/**
 * Filters over message entities.
 *
 * Both `entities` and `caption_entities` are searched: a link in a photo
 * caption is a link, and a bot that checked only one would miss half of them.
 */
export const entity = Object.freeze({
  url: entityOfType('url'),
  textLink: entityOfType('text_link'),
  mention: entityOfType('mention'),
  textMention: entityOfType('text_mention'),
  hashtag: entityOfType('hashtag'),
  cashtag: entityOfType('cashtag'),
  email: entityOfType('email'),
  phoneNumber: entityOfType('phone_number'),
  code: entityOfType('code'),
  pre: entityOfType('pre'),
  spoiler: entityOfType('spoiler'),
  customEmoji: entityOfType('custom_emoji'),
  /** Any link at all, written out or embedded behind text. */
  anyLink: filter<MessageContext>(
    'entity.anyLink',
    (context) => {
      const record = context as { entities?: MessageEntity[]; caption_entities?: MessageEntity[] }
      const all = [...(record.entities ?? []), ...(record.caption_entities ?? [])]
      return all.some((item) => item.type === 'url' || item.type === 'text_link')
    },
    { kinds: MESSAGE_BEARING_KINDS },
  ),
})

/** Messages that belong to a forum topic. */
export const topic = filter<MessageContext>(
  'topic',
  (context) => (context as { message_thread_id?: number }).message_thread_id !== undefined,
  { kinds: MESSAGE_BEARING_KINDS },
)

/* -------------------------------------------------------------------------- */
/* The updates that are not messages                                           */
/* -------------------------------------------------------------------------- */

/**
 * Everything below reads an update that is not a message: a reaction changing, a
 * member's standing changing, the three moments of a payment, a boost, a chosen
 * inline result — and the two questions that are about routing rather than
 * content, which kinds an update may be and which message a reply answers.
 *
 * Each names the kinds it can match, so the dispatcher skips an update none of
 * them could accept rather than calling every predicate on it.
 */

/** The context each of these updates reaches a handler as. */
type ReactionContext = ContextFor<'message_reaction'>
type MemberContext = ContextFor<'chat_member'>
type BoostContext = ContextFor<'chat_boost'>
type ChosenResultContext = ContextFor<'inline_result_chosen'>

function field<T>(context: unknown, name: string): T | undefined {
  return (context as Record<string, T | undefined>)[name]
}

/* -------------------------------------------------------------------------- */
/* Reactions                                                                   */
/* -------------------------------------------------------------------------- */

const REACTION_KINDS: readonly UpdateEventKind[] = ['message_reaction']

/** Both sides of a reaction change: what was set before, and what is set now. */
function bothSides(context: unknown): { before: ReactionType[]; after: ReactionType[] } {
  return {
    before: field<ReactionType[]>(context, 'old_reaction') ?? [],
    after: field<ReactionType[]>(context, 'new_reaction') ?? [],
  }
}

function anyOf(reactions: readonly ReactionType[], is: (one: ReactionType) => boolean): boolean {
  return reactions.some(is)
}

/**
 * How somebody's reaction to a message changed.
 *
 * A reaction update carries both lists rather than the difference, so these
 * read both: `reaction.emoji('👍')` matches whether the thumb was just added or
 * just taken away, and `added` and `removed` tell those apart.
 */
export const reaction = Object.freeze({
  /** Any reaction change that leaves or removes at least one reaction. */
  any: filter<ReactionContext>(
    'reaction.any',
    (context) => {
      const { before, after } = bothSides(context)

      return before.length > 0 || after.length > 0
    },
    { kinds: REACTION_KINDS },
  ),

  /** One of these emoji, on either side of the change. */
  emoji(...wanted: readonly string[]): Filter<ReactionContext, unknown> {
    const set = new Set(wanted)

    return filter<ReactionContext>(
      `reaction.emoji(${wanted.join(', ')})`,
      (context) => {
        const { before, after } = bothSides(context)
        const is = (one: ReactionType) => {
          const emoji = field<string>(one, 'emoji')

          return one.type === 'emoji' && emoji !== undefined && (set.size === 0 || set.has(emoji))
        }

        return anyOf(before, is) || anyOf(after, is)
      },
      { kinds: REACTION_KINDS },
    )
  },

  /** One of these custom emoji, by identifier, on either side of the change. */
  custom(...wanted: readonly string[]): Filter<ReactionContext, unknown> {
    const set = new Set(wanted)

    return filter<ReactionContext>(
      `reaction.custom(${wanted.join(', ')})`,
      (context) => {
        const { before, after } = bothSides(context)
        const is = (one: ReactionType) => {
          const id = field<string>(one, 'custom_emoji_id')

          return one.type === 'custom_emoji' && id !== undefined && (set.size === 0 || set.has(id))
        }

        return anyOf(before, is) || anyOf(after, is)
      },
      { kinds: REACTION_KINDS },
    )
  },

  /** A paid reaction, which the sender spent Stars on. */
  paid: filter<ReactionContext>(
    'reaction.paid',
    (context) => {
      const { before, after } = bothSides(context)
      const is = (one: ReactionType) => one.type === 'paid'

      return anyOf(before, is) || anyOf(after, is)
    },
    { kinds: REACTION_KINDS },
  ),

  /** More reactions now than before: somebody added one. */
  added: filter<ReactionContext>(
    'reaction.added',
    (context) => {
      const { before, after } = bothSides(context)

      return after.length > before.length
    },
    { kinds: REACTION_KINDS },
  ),

  /** Fewer reactions now than before: somebody took one back. */
  removed: filter<ReactionContext>(
    'reaction.removed',
    (context) => {
      const { before, after } = bothSides(context)

      return before.length > after.length
    },
    { kinds: REACTION_KINDS },
  ),
})

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The three moments a payment reaches a bot, matched by the payload the bot
 * itself put on the invoice.
 *
 * That payload is the only thing tying an update back to what was being bought:
 * it is the bot's own reference, echoed unchanged, which is why each of these
 * takes one rather than a chat or a user.
 */
export const payment = Object.freeze({
  /** A delivery-options request for an invoice with this payload. */
  shipping(payload: TextMatch): Filter<ShippingQueryContext, unknown> {
    return filter<ShippingQueryContext>(
      `payment.shipping(${String(payload)})`,
      (context) => {
        const value = field<string>(context, 'invoice_payload')

        return value !== undefined && matches(value, payload)
      },
      { kinds: ['shipping_query'] },
    )
  },

  /** The last chance to refuse a charge, for an invoice with this payload. */
  preCheckout(payload: TextMatch): Filter<PreCheckoutQueryContext, unknown> {
    return filter<PreCheckoutQueryContext>(
      `payment.preCheckout(${String(payload)})`,
      (context) => {
        const value = field<string>(context, 'invoice_payload')

        return value !== undefined && matches(value, payload)
      },
      { kinds: ['pre_checkout_query'] },
    )
  },

  /**
   * A payment that went through, for an invoice with this payload.
   *
   * This arrives as a service message in the conversation rather than as a
   * query, so it matches a message update and narrows the payment onto it.
   */
  successful(
    payload?: TextMatch,
  ): Filter<MessageContext, { successful_payment: SuccessfulPayment }> {
    return filter<MessageContext, { successful_payment: SuccessfulPayment }>(
      payload === undefined ? 'payment.successful' : `payment.successful(${String(payload)})`,
      (context) => {
        const paid = field<SuccessfulPayment>(context, 'successful_payment')
        if (paid === undefined) return false

        return payload === undefined || matches(paid.invoice_payload, payload)
      },
      { kinds: MESSAGE_BEARING_KINDS },
    )
  },
})

/* -------------------------------------------------------------------------- */
/* Membership                                                                  */
/* -------------------------------------------------------------------------- */

const MEMBER_KINDS: readonly UpdateEventKind[] = ['chat_member', 'my_chat_member']

/** What a member's standing changed into, as a word. */
export type MemberChange =
  | 'joined'
  | 'left'
  | 'promoted'
  | 'demoted'
  | 'banned'
  | 'unbanned'
  | 'restricted'
  | 'subscribed'

/** Whether a status counts as being in the chat. */
function isIn(status: string): boolean {
  return status === 'member' || status === 'administrator' || status === 'creator'
}

/** Which change a transition is, or nothing where it is none of them. */
function changeOf(before: ChatMember, after: ChatMember): readonly MemberChange[] {
  const was = before.status
  const now = after.status
  const changes: MemberChange[] = []

  if (!isIn(was) && isIn(now)) changes.push('joined')
  if (isIn(was) && !isIn(now) && now !== 'kicked') changes.push('left')
  if (
    was !== 'administrator' &&
    was !== 'creator' &&
    (now === 'administrator' || now === 'creator')
  ) {
    changes.push('promoted')
  }
  if (
    (was === 'administrator' || was === 'creator') &&
    now !== 'administrator' &&
    now !== 'creator'
  ) {
    changes.push('demoted')
  }
  if (now === 'kicked') changes.push('banned')
  if (was === 'kicked' && now !== 'kicked') changes.push('unbanned')
  if (now === 'restricted') changes.push('restricted')
  // A member whose membership now has an end date is a subscriber.
  if (isIn(now) && 'until_date' in after && after.until_date !== undefined)
    changes.push('subscribed')

  return changes
}

/** A member update's two sides, where the update carries them. */
function standing(context: unknown): { before: ChatMember; after: ChatMember } | undefined {
  const before = field<ChatMember>(context, 'old_chat_member')
  const after = field<ChatMember>(context, 'new_chat_member')

  return before === undefined || after === undefined ? undefined : { before, after }
}

function changeFilter(change: MemberChange): Filter<MemberContext, unknown> {
  return filter<MemberContext>(
    `member.${change}`,
    (context) => {
      const sides = standing(context)

      return sides !== undefined && changeOf(sides.before, sides.after).includes(change)
    },
    { kinds: MEMBER_KINDS },
  )
}

/**
 * How somebody's standing in a chat changed.
 *
 * Telegram reports the status before and after rather than what happened, so
 * the change is derived from the pair. One transition can be more than one
 * change — an administrator who is banned is both demoted and banned — and each
 * filter matches on its own terms rather than picking a single label.
 */
export const member = Object.freeze({
  /** Any change of standing. */
  any: filter<MemberContext>('member.any', (context) => standing(context) !== undefined, {
    kinds: MEMBER_KINDS,
  }),

  /** A change of standing this bot's own, by the bot's user id. */
  self(botId: number): Filter<MemberContext, unknown> {
    return filter<MemberContext>(
      `member.self(${botId})`,
      (context) => {
        const sides = standing(context)

        return sides?.after.user.id === botId
      },
      { kinds: MEMBER_KINDS },
    )
  },

  /** A named change, for one written out rather than chosen from below. */
  change(change: MemberChange): Filter<MemberContext, unknown> {
    return changeFilter(change)
  },

  joined: changeFilter('joined'),
  left: changeFilter('left'),
  promoted: changeFilter('promoted'),
  demoted: changeFilter('demoted'),
  banned: changeFilter('banned'),
  unbanned: changeFilter('unbanned'),
  restricted: changeFilter('restricted'),
  subscribed: changeFilter('subscribed'),
})

/* -------------------------------------------------------------------------- */
/* Routing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Which kind of update this is.
 *
 * `bot.on('message', …)` already routes by kind, so these are for composing a
 * kind into a larger filter, and for the kinds a plugin added, which the
 * generated list does not know about.
 */
export const kind = Object.freeze({
  /** One of these kinds. */
  in<K extends string>(...kinds: readonly K[]): Filter<AnyEventContext, { kind: K }> {
    const set = new Set<string>(kinds)

    return filter<AnyEventContext, { kind: K }>(
      `kind.in(${kinds.join(', ')})`,
      (context) => {
        const value = field<string>(context, 'kind')

        return value !== undefined && set.has(value)
      },
      { kinds: kinds as readonly string[] as readonly UpdateEventKind[] },
    )
  },

  /**
   * A kind this framework does not generate: one a plugin dispatches.
   *
   * Kept apart from `in` so a misspelt built-in kind is a type error while a
   * plugin's own kind, which no type can know, is not.
   */
  custom<N extends string>(name: N): Filter<AnyEventContext, { kind: N }> {
    return filter<AnyEventContext, { kind: N }>(
      `kind.custom(${name})`,
      (context) => field<string>(context, 'kind') === name,
    )
  },
})

/* -------------------------------------------------------------------------- */
/* Other updates                                                               */
/* -------------------------------------------------------------------------- */

/** A boost on a chat. */
export const boost = Object.freeze({
  /** Any boost added to a chat. */
  any: filter<BoostContext>('boost.any', (context) => field(context, 'boost') !== undefined, {
    kinds: ['chat_boost'],
  }),
})

const BUSINESS_KINDS: readonly UpdateEventKind[] = [
  'business_message',
  'business_message_edited',
  'business_messages_deleted',
]

/**
 * Updates arriving over a connected business account.
 *
 * The connection update itself is excluded: it carries its identifier as `id`
 * rather than as `business_connection_id`, so a filter matching the field would
 * be true for the thing that created the connection as well as for messages
 * over it.
 */
export const business = Object.freeze({
  any: filter<MessageContext, { business_connection_id: string }>(
    'business.any',
    (context) => typeof field<string>(context, 'business_connection_id') === 'string',
    {
      kinds: BUSINESS_KINDS,
    },
  ),

  /** A particular connection, by its identifier. */
  connection(id: string): Filter<MessageContext, { business_connection_id: string }> {
    return filter<MessageContext, { business_connection_id: string }>(
      `business.connection(${id})`,
      (context) => field<string>(context, 'business_connection_id') === id,
      { kinds: BUSINESS_KINDS },
    )
  },
})

/** A game, either as a button press or as a chosen inline result. */
export const game = Object.freeze({
  /** A callback query from a game button, by the game's short name. */
  shortName(match: TextMatch): Filter<CallbackQueryContext, unknown> {
    return filter<CallbackQueryContext>(
      `game.shortName(${String(match)})`,
      (context) => {
        const value = field<string>(context, 'game_short_name')

        return value !== undefined && matches(value, match)
      },
      { kinds: ['callback_query'] },
    )
  },
})

/** An inline result somebody picked, by the identifier the bot gave it. */
export function chosenResult(match: TextMatch): Filter<ChosenResultContext, unknown> {
  return filter<ChosenResultContext>(
    `chosenResult(${String(match)})`,
    (context) => {
      const value = field<string>(context, 'result_id')

      return value !== undefined && matches(value, match)
    },
    { kinds: ['inline_result_chosen'] },
  )
}
