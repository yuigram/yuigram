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
import type { CallbackQueryContext, MessageContext } from '../events/index.js'
import { filter } from '../filter.js'
import type { Chat, MessageEntity, User } from '../generated/types/index.js'
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
