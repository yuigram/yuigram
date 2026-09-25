/**
 * Filters for an account's events.
 *
 * Built on core's filters, so they compose with `and`, `or` and `not` like any
 * other and their proof reaches the handler: `account.on(f.text(), …)` hands
 * the handler a context whose `text` is a string.
 *
 * They read what an MTProto update carries, which is not what a Bot API update
 * carries — a chat here is a sort of peer and a 64-bit number, a message may
 * arrive in its compact form with its fields spread across the update, and
 * callback data is bytes. Written for this transport rather than shared with
 * the Bot API's `f`, because a filter that pretended the two were one would be
 * wrong on both.
 *
 * Its own entry point, so a program that never filters an account never loads
 * it:
 *
 * ```ts
 * import { f } from '@yuigram/mtproto/filters'
 *
 * account.on('message', f.command('ping', { prefixes: '.' }), (event) => event.reply('pong'))
 * ```
 */

import { type AnyFilter, and, defineFilter, type Filter, not, or } from '@yuigram/core'
import type { ServiceAction, ServiceActionKind, ServiceActionOf } from '../entities/action.js'
import { type MediaKind, readMedia } from '../entities/media.js'
import type { TypeMessageMedia } from '../generated/api/types/index.js'
import type { MtprotoContext } from '../normalize/context.js'
import { type MtprotoEventKind, SHORT_MESSAGE_UPDATES } from '../normalize/events.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { PeerKind } from '../storage/peers.js'

/** What text is matched against: the whole of it, or a pattern. */
export type TextMatch = string | RegExp

/** The kinds that carry a message's text. */
const TEXT_KINDS: readonly MtprotoEventKind[] = [
  'message',
  'message_edited',
  'mtproto:ephemeral_message',
  'mtproto:ephemeral_message_edited',
]

/** The kinds that carry a whole message, in one form or the other. */
const MESSAGE_KINDS: readonly MtprotoEventKind[] = ['message', 'message_edited']

function matches(value: string, match: TextMatch): boolean {
  if (typeof match === 'string') return value === match
  // A global or sticky pattern remembers where it stopped; starting from the
  // beginning every time is what makes a filter answer the same way twice.
  match.lastIndex = 0

  return match.test(value)
}

function contextOf(value: unknown): MtprotoContext {
  return value as MtprotoContext
}

/**
 * A field of the message an event carries, whichever form it arrived in.
 *
 * A whole message nests its fields; the compact forms Telegram sends for most
 * private chats spread them across the update itself. A filter asking whether
 * a message is outgoing must get the same answer from both.
 */
function messageField(context: MtprotoContext, field: string): unknown {
  const message = context.message
  if (message !== undefined && message._ !== 'messageEmpty') {
    return (message as unknown as Record<string, unknown>)[field]
  }

  const raw = context.raw as unknown as Record<string, unknown>
  if (typeof raw['_'] === 'string' && SHORT_MESSAGE_UPDATES.has(raw['_'])) return raw[field]

  return undefined
}

/** Events of these kinds. */
export function kind<K extends MtprotoEventKind>(...kinds: readonly K[]): Filter<MtprotoContext> {
  return defineFilter<MtprotoContext>(
    `kind(${kinds.join(', ')})`,
    (value) => (kinds as readonly string[]).includes(contextOf(value).kind),
    { kinds },
  )
}

/** A message with text, or whose text matches. */
export function text(match?: TextMatch): Filter<MtprotoContext, { text: string }> {
  return defineFilter<MtprotoContext, { text: string }>(
    match === undefined ? 'text' : `text(${String(match)})`,
    (value) => {
      const current = contextOf(value).text
      if (current === undefined) return false

      return match === undefined || matches(current, match)
    },
    { kinds: TEXT_KINDS },
  )
}

/** How a command is recognised. */
export interface CommandOptions {
  /**
   * The characters a command may begin with. `'/'` unless given.
   *
   * An account run by a person usually answers commands it types itself, and
   * those are commonly `.` or `!` so they do not look like a bot's.
   */
  readonly prefixes?: string | readonly string[]
  /**
   * The username a suffixed command must name, as `/start@name`.
   *
   * Compared without regard to case. Without one, a command carrying a
   * suffix does not match: it was addressed to somebody, and nothing here
   * says it was this account.
   */
  readonly username?: string
  /** Compare the command's name without regard to case. */
  readonly ignoreCase?: boolean
}

/**
 * A command, and what follows it.
 *
 * Matches when the text begins with one of the prefixes and a name, followed
 * by whitespace or nothing. `event.command` is then the name, and
 * `event.args` the rest split on whitespace — so a handler does not parse the
 * same text a second time.
 */
export function command(
  name?: TextMatch | readonly string[],
  options: CommandOptions = {},
): Filter<MtprotoContext, { text: string; command: string; args: readonly string[] }> {
  const prefixes = typeof options.prefixes === 'string' ? [...options.prefixes] : options.prefixes
  const allowed = prefixes ?? ['/']
  const username = options.username?.toLowerCase()

  return defineFilter<MtprotoContext, { text: string; command: string; args: readonly string[] }>(
    name === undefined ? 'command' : `command(${String(name)})`,
    (value) => {
      const context = contextOf(value)
      const current = context.text
      if (current === undefined) return false

      const prefix = allowed.find((candidate) => current.startsWith(candidate))
      if (prefix === undefined) return false

      const parsed = /^([\p{L}\p{N}_]+)(?:@([A-Za-z0-9_]+))?(?:\s+|$)/u.exec(
        current.slice(prefix.length),
      )
      if (parsed === null) return false

      const [whole, found = '', addressed] = parsed
      if (addressed !== undefined && addressed.toLowerCase() !== username) return false
      if (!namesCommand(found, name, options.ignoreCase === true)) return false

      const rest = current.slice(prefix.length + whole.length).trim()
      Object.defineProperties(context, {
        command: { value: found, configurable: true, enumerable: true },
        args: {
          value: rest.length === 0 ? [] : rest.split(/\s+/u),
          configurable: true,
          enumerable: true,
        },
      })

      return true
    },
    { kinds: TEXT_KINDS },
  )
}

function namesCommand(
  found: string,
  name: TextMatch | readonly string[] | undefined,
  ignoreCase: boolean,
): boolean {
  if (name === undefined) return true
  if (name instanceof RegExp) return matches(found, name)

  const names = typeof name === 'string' ? [name] : name
  const wanted = ignoreCase ? found.toLowerCase() : found

  return names.some((one) => (ignoreCase ? one.toLowerCase() : one) === wanted)
}

/**
 * Text a pattern finds something in.
 *
 * What it found is `event.match`, the result of `exec`, so the groups a
 * pattern captured reach the handler without matching twice.
 */
export function regex(pattern: RegExp): Filter<MtprotoContext, { match: RegExpExecArray }> {
  return defineFilter<MtprotoContext, { match: RegExpExecArray }>(
    `regex(${String(pattern)})`,
    (value) => {
      const context = contextOf(value)
      if (context.text === undefined) return false

      pattern.lastIndex = 0
      const found = pattern.exec(context.text)
      if (found === null) return false

      Object.defineProperty(context, 'match', {
        value: found,
        configurable: true,
        enumerable: true,
      })

      return true
    },
    { kinds: TEXT_KINDS },
  )
}

/** Which peer a peer filter wants: a sort, one peer, or any of several. */
export type PeerMatch = PeerKind | bigint | readonly bigint[]

function peerMatches(peer: PeerRef, match: PeerMatch | undefined): boolean {
  if (match === undefined) return true
  if (typeof match === 'string') return peer.kind === match
  if (typeof match === 'bigint') return peer.id === match

  return match.includes(peer.id)
}

function named(match: PeerMatch | undefined): string {
  if (match === undefined) return ''
  if (typeof match === 'string') return match
  if (typeof match === 'bigint') return match.toString()

  return match.map(String).join(', ')
}

/**
 * An event in a conversation, or in one of a sort or with an identifier.
 *
 * `f.chat('user')` is a private chat, `f.chat('chat')` a basic group and
 * `f.chat('channel')` a channel or supergroup. A number is compared with the
 * conversation's own identifier, which for a channel is its bare one rather
 * than the Bot API's `-100…` form.
 */
export function chat(match?: PeerMatch): Filter<MtprotoContext, { chat: PeerRef }> {
  return defineFilter<MtprotoContext, { chat: PeerRef }>(
    match === undefined ? 'chat' : `chat(${named(match)})`,
    (value) => {
      const current = contextOf(value).chat

      return current !== undefined && peerMatches(current, match)
    },
  )
}

/** An event somebody caused, or that a sort of peer or a given one caused. */
export function sender(match?: PeerMatch): Filter<MtprotoContext, { sender: PeerRef }> {
  return defineFilter<MtprotoContext, { sender: PeerRef }>(
    match === undefined ? 'sender' : `sender(${named(match)})`,
    (value) => {
      const current = contextOf(value).sender

      return current !== undefined && peerMatches(current, match)
    },
  )
}

/** A message this account sent, from here or from another of its sessions. */
export const outgoing: Filter<MtprotoContext> = defineFilter<MtprotoContext>(
  'outgoing',
  (value) => messageField(contextOf(value), 'out') === true,
  { kinds: MESSAGE_KINDS },
)

/** A message somebody else sent. */
export const incoming: Filter<MtprotoContext> = defineFilter<MtprotoContext>(
  'incoming',
  (value) => {
    const context = contextOf(value)
    if (context.message?._ === 'messageEmpty') return false
    if (context.message === undefined && messageField(context, 'id') === undefined) return false

    return messageField(context, 'out') !== true
  },
  { kinds: MESSAGE_KINDS },
)

/** A message answering another. */
export const reply: Filter<MtprotoContext> = defineFilter<MtprotoContext>(
  'reply',
  (value) => messageField(contextOf(value), 'reply_to') !== undefined,
  { kinds: MESSAGE_KINDS },
)

/** A message forwarded from somewhere. */
export const forward: Filter<MtprotoContext> = defineFilter<MtprotoContext>(
  'forward',
  (value) => messageField(contextOf(value), 'fwd_from') !== undefined,
  { kinds: MESSAGE_KINDS },
)

/** A message mentioning this account, or replying to one of its messages. */
export const mentioned: Filter<MtprotoContext> = defineFilter<MtprotoContext>(
  'mentioned',
  (value) => messageField(contextOf(value), 'mentioned') === true,
  { kinds: MESSAGE_KINDS },
)

/** A message silent by its sender's choice. */
export const silent: Filter<MtprotoContext> = defineFilter<MtprotoContext>(
  'silent',
  (value) => messageField(contextOf(value), 'silent') === true,
  { kinds: MESSAGE_KINDS },
)

/**
 * A message carrying media, or media of these kinds.
 *
 * The kinds are the ones `MediaView.kind` names, so a voice note is `'voice'`
 * rather than a document with an attribute. A link preview is media to
 * Telegram but not to a person reading, and is only matched when asked for by
 * name.
 */
export function media(...kinds: readonly MediaKind[]): Filter<MtprotoContext> {
  return defineFilter<MtprotoContext>(
    kinds.length === 0 ? 'media' : `media(${kinds.join(', ')})`,
    (value) => {
      const raw = messageField(contextOf(value), 'media') as TypeMessageMedia | undefined
      const view = readMedia(raw)
      if (view === undefined || view.kind === 'none') return false
      if (kinds.length === 0) return view.kind !== 'webpage'

      return kinds.includes(view.kind)
    },
    { kinds: MESSAGE_KINDS },
  )
}

/**
 * A service message, or one saying one of these things happened.
 *
 * The kinds are the ones `ServiceAction.kind` names, and the handler is given
 * the action narrowed to them: after `f.action('members-added')`,
 * `event.action.users` is there to read.
 *
 * ```ts
 * account.on('message', f.action('members-added', 'joined-by-link'), (event) => …)
 * ```
 */
export function action(): Filter<MtprotoContext, { action: ServiceAction }>
export function action<K extends ServiceActionKind>(
  ...kinds: readonly [K, ...K[]]
): Filter<MtprotoContext, { action: ServiceActionOf<K> }>
export function action(
  ...kinds: readonly ServiceActionKind[]
): Filter<MtprotoContext, { action: ServiceAction }> {
  return defineFilter<MtprotoContext, { action: ServiceAction }>(
    kinds.length === 0 ? 'action' : `action(${kinds.join(', ')})`,
    (value) => {
      const current = contextOf(value).action
      if (current === undefined) return false

      return kinds.length === 0 || kinds.includes(current.kind)
    },
    { kinds: MESSAGE_KINDS },
  )
}

/**
 * A pressed button, or one whose data matches.
 *
 * Callback data is bytes over this transport. A match compares it as UTF-8
 * text; data that is not text matches only the bare form.
 */
export function callback(match?: TextMatch): Filter<MtprotoContext> {
  return defineFilter<MtprotoContext>(
    match === undefined ? 'callback' : `callback(${String(match)})`,
    (value) => {
      const context = contextOf(value)
      if (match === undefined) return true

      const current = context.data

      return current !== undefined && matches(current, match)
    },
    {
      kinds: [
        'mtproto:callback_query',
        'mtproto:ephemeral_callback_query',
        'mtproto:business_callback_query',
      ],
    },
  )
}

/**
 * What a callback-data schema offers a filter: whether data is its, and what
 * the data says. The Bot API's `defineCallbackData` is one; so is anything
 * with the same two members.
 */
export interface CallbackSchema<State> {
  matches(data: string): boolean
  unpack(data: string): State | undefined
}

/** What a field of the data must be: a value, one of several, or text matching a pattern. */
export type FieldMatch<Value> = Value | readonly Value[] | (Value extends string ? RegExp : never)

function fieldMatches(value: unknown, wanted: unknown): boolean {
  if (Array.isArray(wanted)) return wanted.includes(value)
  if (wanted instanceof RegExp) {
    wanted.lastIndex = 0

    return typeof value === 'string' && wanted.test(value)
  }

  return value === wanted
}

/**
 * A pressed button whose data a schema reads, and whose fields hold what was
 * asked.
 *
 * ```ts
 * const vote = defineCallbackData('vote').literal('answer', ['yes', 'no'])
 * account.on(f.callbackData(vote, { answer: 'yes' }), (event) => event.payload.answer)
 * ```
 *
 * What the schema read is `event.payload`, typed. Reading the data is not
 * trusting it: a button's data comes back from whoever pressed it.
 */
export function callbackData<State extends object>(
  schema: CallbackSchema<State>,
  fields: { readonly [K in keyof State]?: FieldMatch<State[K]> } = {},
): Filter<MtprotoContext, { data: string; payload: State }> {
  return defineFilter<MtprotoContext, { data: string; payload: State }>(
    'callbackData',
    (value) => {
      const context = contextOf(value)
      const data = context.data
      if (data === undefined || !schema.matches(data)) return false

      const payload = schema.unpack(data)
      if (payload === undefined) return false

      for (const [field, wanted] of Object.entries(fields)) {
        if (!fieldMatches((payload as Record<string, unknown>)[field], wanted)) return false
      }

      Object.defineProperty(context, 'payload', {
        value: payload,
        configurable: true,
        enumerable: true,
      })

      return true
    },
    {
      kinds: [
        'mtproto:callback_query',
        'mtproto:ephemeral_callback_query',
        'mtproto:business_callback_query',
      ],
    },
  )
}

/** An inline query, or one whose text matches. */
export function inline(match?: TextMatch): Filter<MtprotoContext> {
  return defineFilter<MtprotoContext>(
    match === undefined ? 'inline' : `inline(${String(match)})`,
    (value) => {
      const query = (contextOf(value).raw as unknown as Record<string, unknown>)['query']
      if (typeof query !== 'string') return false

      return match === undefined || matches(query, match)
    },
    { kinds: ['mtproto:inline_query'] },
  )
}

/**
 * Every filter, under one short name.
 *
 * The composition helpers are here as well, so a combined filter reads as one
 * expression: `f.and(f.chat('user'), f.not(f.outgoing))`.
 */
export const f = Object.freeze({
  kind,
  text,
  command,
  regex,
  chat,
  sender,
  outgoing,
  incoming,
  reply,
  forward,
  mentioned,
  silent,
  media,
  action,
  callback,
  callbackData,
  inline,
  and,
  or,
  not,
})

export type { AnyFilter }
