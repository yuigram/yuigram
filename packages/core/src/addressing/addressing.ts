/**
 * How a Telegram peer, message or bot feature is written down outside a session.
 *
 * Two notations, both of which travel through places that know nothing about
 * either transport — configuration, databases, Bot API payloads, a link pasted
 * into a message:
 *
 * ```
 *   a marked identifier   -1001234567890        the Bot API's `chat_id`
 *   a link                t.me/c/1234567890/7   what a person shares
 * ```
 *
 * **Three things, kept apart.** A *peer identity* is a kind and a bare
 * identifier: user 42, channel 1234567890. A *marked identifier* is the same
 * identity folded into one signed number, which is what the Bot API calls a
 * chat id. A *resolved input peer* is what an MTProto request needs: the
 * identity plus an access hash that only an account which has met the peer
 * holds. This module converts between the first two, exactly, and never
 * produces the third — an identifier is enough to name a peer and never enough
 * to reach one. An account turns an identity into a request with
 * `account.resolve(identity)`, using its own stored hash.
 *
 * **The ranges are Telegram's.** The marked form partitions one number line:
 *
 * ```
 *   user          1 … 2^40 − 1                                bare = marked
 *   basic group   −(10^12 − 1) … −1                           bare = −marked
 *   channel       −2·10^12 + 2^31 + 1 … −10^12 − 1            bare = −10^12 − marked
 *   secret chat   −2·10^12 − 2^31 … −2·10^12 + 2^31 − 1, except −2·10^12
 *   monoforum     −4·10^12 + 1 … −2·10^12 − 2^31 − 1          bare = −10^12 − marked
 * ```
 *
 * The ranges do not overlap, and the few values between them — each zero point
 * and the top a range reserves — name nothing. Every valid identifier is well
 * inside 2^53, so a `number` that is not a safe integer cannot be one: it is
 * refused rather than rounded, because rounding names a different peer.
 *
 * **Links follow Telegram's grammar and its clients.** Where the published
 * link syntax is silent — which argument wins when a link carries two, what a
 * malformed value does — a link is read the way Telegram's own apps read it:
 * the first argument that forms a link decides, and an argument whose value is
 * malformed is passed over rather than failing the link. Reading is pure: it
 * describes a string. Nothing here resolves a username, joins a chat or starts
 * a bot — those are requests, and they belong to a client.
 */

import { ValidationError } from '../errors/errors.js'

/* -------------------------------------------------------------------------- */
/* Marked identifiers                                                          */
/* -------------------------------------------------------------------------- */

/** What kind of peer an identity names. */
export type PeerIdentityKind = 'user' | 'chat' | 'channel'

/**
 * A peer, named by kind and bare identifier.
 *
 * The same shape as an account's peer reference, so either can be passed where
 * the other is expected. It names a peer and carries no access hash.
 */
export interface PeerIdentity {
  readonly kind: PeerIdentityKind
  readonly id: bigint
}

/** An identifier that is not one, or a peer that cannot be written as one. */
export class PeerIdError extends ValidationError {}

/** Where channel identifiers start on the marked line. */
const ZERO_CHANNEL = -1_000_000_000_000n
/** The centre of the secret chat range on the marked line. */
const ZERO_SECRET_CHAT = -2_000_000_000_000n
const MAX_USER = (1n << 40n) - 1n
const MAX_CHAT = 999_999_999_999n
/** One past the largest ordinary channel: the top 2^31 below 10^12 border the secret chats. */
const CHANNEL_LIMIT = 1_000_000_000_000n - (1n << 31n)
const MIN_MONOFORUM = 1_000_000_000_000n + (1n << 31n) + 1n
/** One past the largest monoforum channel. */
const MONOFORUM_LIMIT = 3_000_000_000_000n
const INT32_MIN = -(1n << 31n)
const INT32_MAX = (1n << 31n) - 1n

/** Whether a bare identifier is one a peer of this kind can have. */
function validBare(kind: PeerIdentityKind, id: bigint): boolean {
  switch (kind) {
    case 'user':
      return id > 0n && id <= MAX_USER
    case 'chat':
      return id > 0n && id <= MAX_CHAT
    default:
      return (id > 0n && id < CHANNEL_LIMIT) || (id >= MIN_MONOFORUM && id < MONOFORUM_LIMIT)
  }
}

/**
 * An exact integer, or a refusal.
 *
 * Accepts the three forms an identifier arrives in: a `bigint`, a safe-integer
 * `number` from JSON, and canonical decimal text from configuration or a
 * database column.
 */
function exact(value: number | bigint | string, what: string): bigint {
  if (typeof value === 'bigint') return value

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new PeerIdError(
        `${what} ${String(value)} is not a safe integer: a number that large has already lost ` +
          'precision, so pass it as a bigint or as text',
      )
    }

    return BigInt(value)
  }

  if (!/^-?(?:0|[1-9]\d{0,19})$/.test(value)) {
    throw new PeerIdError(`${what} ${JSON.stringify(value)} is not a whole number in decimal`)
  }

  return BigInt(value)
}

/** What a marked identifier names, including the one kind that is not a peer. */
export type MarkedKind = PeerIdentityKind | 'secret-chat'

/**
 * What kind of thing a marked identifier names, or nothing.
 *
 * ```ts
 * markedKind(-1001234567890) // 'channel'
 * markedKind(-2000000000001) // 'secret-chat'
 * markedKind(0)              // undefined
 * ```
 *
 * Secret chats are told apart here because they have a range of their own:
 * reading every value below the channel zero as a channel names a different
 * conversation.
 */
export function markedKind(marked: number | bigint | string): MarkedKind | undefined {
  let value: bigint
  try {
    value = exact(marked, 'a marked identifier')
  } catch {
    return undefined
  }

  if (value > 0n) return value <= MAX_USER ? 'user' : undefined
  if (value === 0n) return undefined
  if (value >= -MAX_CHAT) return 'chat'
  if (value < ZERO_CHANNEL && value > ZERO_CHANNEL - CHANNEL_LIMIT) return 'channel'

  if (value >= ZERO_SECRET_CHAT + INT32_MIN && value <= ZERO_SECRET_CHAT + INT32_MAX) {
    return value === ZERO_SECRET_CHAT ? undefined : 'secret-chat'
  }

  const bare = ZERO_CHANNEL - value

  return bare >= MIN_MONOFORUM && bare < MONOFORUM_LIMIT ? 'channel' : undefined
}

/** Whether a value is a marked identifier of a user, a group or a channel. */
export function isMarkedPeerId(value: unknown): value is number | bigint | string {
  if (typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'string') {
    return false
  }

  const kind = markedKind(value)

  return kind !== undefined && kind !== 'secret-chat'
}

/**
 * The peer a marked identifier names.
 *
 * ```ts
 * peerIdentity(-1001234567890) // { kind: 'channel', id: 1234567890n }
 * peerIdentity('-42')          // { kind: 'chat', id: 42n }
 * ```
 *
 * Refused for a value in no range; for a secret chat, which exists only on the
 * device holding its key and has no identity a request could name; and for a
 * `number` too large to be exact.
 */
export function peerIdentity(marked: number | bigint | string): PeerIdentity {
  const value = exact(marked, 'a marked identifier')

  switch (markedKind(value)) {
    case 'user':
      return { kind: 'user', id: value }
    case 'chat':
      return { kind: 'chat', id: -value }
    case 'channel':
      return { kind: 'channel', id: ZERO_CHANNEL - value }
    case 'secret-chat':
      throw new PeerIdError(
        `${String(value)} names a secret chat, which has no peer identity: it exists only on the ` +
          'device holding its key',
      )
    default:
      throw new PeerIdError(`${String(value)} is not the marked identifier of any peer`)
  }
}

/**
 * The marked identifier the Bot API uses for a peer.
 *
 * ```ts
 * botApiId({ kind: 'channel', id: 1234567890n }) // -1001234567890
 * ```
 *
 * A `number`, because that is what a Bot API payload carries, and every valid
 * value is exact as one. Refused for an identifier outside its kind's range: a
 * basic group numbered past 10^12 would otherwise come out as a channel's
 * marked identifier, which names a different conversation.
 */
export function botApiId(identity: {
  readonly kind: PeerIdentityKind
  readonly id: bigint | number | string
}): number {
  const id = exact(identity.id, `a ${identity.kind} identifier`)

  if (!validBare(identity.kind, id)) {
    throw new PeerIdError(`${String(id)} is not a valid ${identity.kind} identifier`)
  }

  switch (identity.kind) {
    case 'user':
      return Number(id)
    case 'chat':
      return Number(-id)
    default:
      return Number(ZERO_CHANNEL - id)
  }
}

/* -------------------------------------------------------------------------- */
/* Link descriptions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * An administrator right a bot asks for when it is added through a link, in the
 * spelling links use. Each is one flag of `chatAdminRights`; `manage_tags` is
 * the flag the schema calls `manage_ranks`.
 */
export type LinkAdminRight =
  | 'change_info'
  | 'post_messages'
  | 'edit_messages'
  | 'delete_messages'
  | 'restrict_members'
  | 'invite_users'
  | 'pin_messages'
  | 'manage_topics'
  | 'promote_members'
  | 'manage_video_chats'
  | 'anonymous'
  | 'manage_chat'
  | 'post_stories'
  | 'edit_stories'
  | 'delete_stories'
  | 'manage_direct_messages'
  | 'manage_tags'
  | 'send_welcome_messages'

const ADMIN_RIGHTS: ReadonlySet<string> = new Set<LinkAdminRight>([
  'change_info',
  'post_messages',
  'edit_messages',
  'delete_messages',
  'restrict_members',
  'invite_users',
  'pin_messages',
  'manage_topics',
  'promote_members',
  'manage_video_chats',
  'anonymous',
  'manage_chat',
  'post_stories',
  'edit_stories',
  'delete_stories',
  'manage_direct_messages',
  'manage_tags',
  'send_welcome_messages',
])

/** The kinds of conversation a person may pick to open an attachment menu in. */
export type AttachTarget = 'users' | 'bots' | 'groups' | 'channels'

const ATTACH_TARGETS: ReadonlySet<string> = new Set<AttachTarget>([
  'users',
  'bots',
  'groups',
  'channels',
])

/** How a mini app opens, where the link says. */
export type MiniAppMode = 'compact' | 'fullscreen'

/** A conversation named in a link: publicly by username, or privately by channel. */
export type LinkChat = { readonly username: string } | { readonly channel: PeerIdentity }

/** What a Telegram link names, for the kinds read and written here. */
export type TelegramLink =
  /** A user, group, channel or bot, by username. */
  | {
      readonly kind: 'username'
      readonly username: string
      /** Text to put in the message box. */
      readonly text?: string
      /** Open the profile rather than the conversation. */
      readonly profile?: true
    }
  /** A person, by phone number: digits only. */
  | {
      readonly kind: 'phone'
      readonly phone: string
      readonly text?: string
      readonly profile?: true
    }
  /** An invitation to a group or channel. */
  | { readonly kind: 'invite'; readonly hash: string }
  /** A shared chat folder. */
  | { readonly kind: 'chat-folder'; readonly slug: string }
  /** A message, or a forum topic — which is the message that created it. */
  | {
      readonly kind: 'message'
      readonly chat: LinkChat
      readonly id: number
      /** The thread the message is in. */
      readonly thread?: number
      /** A comment on the channel post `id`, numbered in the discussion group. */
      readonly comment?: number
      /** One item of an album rather than the whole album. */
      readonly single?: true
      /** Where to start playing the message's media, in seconds. */
      readonly mediaTimestamp?: number
      /** A checklist task to highlight. */
      readonly task?: number
      /** A poll option to highlight, base64url as the link carries it. */
      readonly option?: string
    }
  /** A URL, and optionally text, to share into a conversation the person picks. */
  | { readonly kind: 'share'; readonly url: string; readonly text?: string }
  /** A group's video chat or a channel's live stream. */
  | {
      readonly kind: 'video-chat'
      readonly username: string
      readonly live: boolean
      readonly hash?: string
    }
  | { readonly kind: 'sticker-set'; readonly name: string }
  | { readonly kind: 'emoji-set'; readonly name: string }
  | { readonly kind: 'story'; readonly username: string; readonly id: number }
  /** Boosting a channel. */
  | { readonly kind: 'boost'; readonly chat: LinkChat }
  /** Starting a bot, with a start parameter where one is given. */
  | { readonly kind: 'bot-start'; readonly bot: string; readonly payload?: string }
  /** Adding a bot to a group, as an administrator where rights are given. */
  | {
      readonly kind: 'group-bot'
      readonly bot: string
      readonly payload?: string
      readonly admin?: readonly LinkAdminRight[]
    }
  /** Adding a bot to a channel as an administrator. */
  | {
      readonly kind: 'channel-bot'
      readonly bot: string
      readonly admin: readonly LinkAdminRight[]
    }
  /** A bot's main mini app, or one of its named mini apps. */
  | {
      readonly kind: 'mini-app'
      readonly bot: string
      readonly app?: string
      readonly payload?: string
      readonly mode?: MiniAppMode
    }
  /** A bot's attachment menu: in the open chat, or in one the person picks. */
  | {
      readonly kind: 'attach'
      readonly bot: string
      readonly payload?: string
      readonly choose?: readonly AttachTarget[]
    }
  /** A bot's attachment menu, in a particular chat. */
  | {
      readonly kind: 'attach-in-chat'
      readonly chat: { readonly username: string } | { readonly phone: string }
      readonly bot: string
      readonly payload?: string
    }
  | { readonly kind: 'game'; readonly bot: string; readonly name: string }

/** A link description that breaks Telegram's rules, so no link can be written for it. */
export class LinkError extends ValidationError {}

const BASE64URL = /^[A-Za-z0-9_-]*$/
const MAX_MESSAGE_ID = 2_147_483_647
const MAX_STORY_ID = 1_999_999_999
const MAX_MEDIA_TIMESTAMP = 10_000_000
/** The prefix that makes a start parameter an affiliate program referral instead. */
const REFERRAL_PREFIX = '_tgr_'

/**
 * A username as links carry it: a letter, then letters, digits and single
 * underscores, at most 32 characters, not ending in an underscore.
 */
function validUsername(value: string): boolean {
  return (
    value.length <= 32 && /^[A-Za-z](?:[A-Za-z0-9]|_(?!_))*$/.test(value) && !value.endsWith('_')
  )
}

/** A mini app or game short name: a username of at least three characters. */
function validShortName(value: string): boolean {
  return value.length >= 3 && validUsername(value)
}

function validPhone(value: string): boolean {
  return /^\d{1,32}$/.test(value)
}

/** A positive 32-bit identifier in canonical decimal. */
function serverId(text: string | null | undefined, max = MAX_MESSAGE_ID): number | undefined {
  if (text === null || text === undefined || !/^[1-9]\d{0,9}$/.test(text)) return undefined
  const value = Number(text)

  return value <= max ? value : undefined
}

/**
 * The number a path segment starts with, in canonical decimal, the way Telegram's
 * apps read one: `12abc` is 12. Nothing where there are no leading digits or
 * they make zero.
 */
function leading(text: string | null | undefined): string | undefined {
  const digits = text === null || text === undefined ? '' : (/^\d+/.exec(text)?.[0] ?? '')
  const canonical = digits.replace(/^0+/, '')

  return canonical === '' ? undefined : canonical
}

/** A channel written in a link, where it is one. */
function channelOf(text: string | null | undefined): PeerIdentity | undefined {
  if (text === null || text === undefined || !/^[1-9]\d{0,15}$/.test(text)) return undefined
  const id = BigInt(text)

  return validBare('channel', id) ? { kind: 'channel', id } : undefined
}

/** Whether base64url text decodes, and decodes to valid UTF-8. */
function decodes(text: string): { bytes: boolean; utf8: boolean } {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return { bytes: false, utf8: false }

  const standard = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)

    return { bytes: true, utf8: true }
  } catch {
    return { bytes: true, utf8: false }
  }
}

/* -------------------------------------------------------------------------- */
/* Writing links                                                               */
/* -------------------------------------------------------------------------- */

function ensure(ok: boolean, message: string): void {
  if (!ok) throw new LinkError(message)
}

function ensureUsername(value: string, what: string): void {
  ensure(validUsername(value), `${what} ${JSON.stringify(value)} is not a username`)
}

function ensureToken(value: string | undefined, what: string): void {
  if (value !== undefined) {
    ensure(value.length > 0 && BASE64URL.test(value), `${what} is base64url text`)
  }
}

function ensurePayload(value: string | undefined, limit?: number): void {
  if (value === undefined) return

  ensure(
    value.length > 0 && BASE64URL.test(value) && (limit === undefined || value.length <= limit),
    `a start parameter is ${limit === undefined ? '' : `1 to ${limit} `}characters of A-Z, a-z, 0-9, _ and -`,
  )
}

function ensureId(value: number | undefined, what: string, max = MAX_MESSAGE_ID): void {
  if (value !== undefined) {
    ensure(
      Number.isInteger(value) && value > 0 && value <= max,
      `${what} must be a whole number from 1 to ${max}`,
    )
  }
}

function ensureList(
  values: readonly string[] | undefined,
  allowed: ReadonlySet<string>,
  what: string,
): void {
  if (values === undefined) return

  ensure(values.length > 0, `a list of ${what}s cannot be empty; leave it out instead`)
  for (const value of values)
    ensure(allowed.has(value), `${JSON.stringify(value)} is not a known ${what}`)
}

type QueryPart = readonly [name: string, value?: string | undefined] | false

/** A query string: a name alone for a flag, a name and its value otherwise. */
function query(...parts: readonly QueryPart[]): string {
  const rendered: string[] = []
  for (const part of parts) {
    if (part !== false) rendered.push(part[1] === undefined ? part[0] : `${part[0]}=${part[1]}`)
  }

  return rendered.length === 0 ? '' : `?${rendered.join('&')}`
}

function chatPath(chat: LinkChat): string {
  if ('username' in chat) {
    ensureUsername(chat.username, 'a chat')

    return chat.username
  }

  ensure(
    chat.channel.kind === 'channel' && validBare('channel', chat.channel.id),
    'a private link names a channel or supergroup by a valid channel identifier',
  )

  return `c/${String(chat.channel.id)}`
}

function draft(link: { readonly text?: string; readonly profile?: true }): string {
  return query(
    link.text !== undefined && link.text !== '' && ['text', encodeURIComponent(link.text)],
    link.profile === true && ['profile'],
  )
}

/**
 * Write a Telegram link.
 *
 * ```ts
 * writeLink({ kind: 'bot-start', bot: 'shop_bot', payload: 'spring' })
 * // 'https://t.me/shop_bot?start=spring'
 * ```
 *
 * Always an `https://t.me/` link, in the form Telegram documents. Refused where
 * the description breaks Telegram's rules — a start parameter with characters
 * no client accepts, a right that does not exist, a channel link with no rights,
 * an invite hash of digits alone, which every client reads as a phone number —
 * rather than written as a link that opens something else.
 */
export function writeLink(link: TelegramLink): string {
  const base = 'https://t.me/'

  switch (link.kind) {
    case 'username':
      ensureUsername(link.username, 'a username')

      return `${base}${link.username}${draft(link)}`

    case 'phone':
      ensure(validPhone(link.phone), 'a phone number in a link is 1 to 32 digits, without a plus')

      return `${base}+${link.phone}${draft(link)}`

    case 'invite':
      ensureToken(link.hash, 'an invite hash')
      ensure(!validPhone(link.hash), 'an invite hash of digits alone is read as a phone number')

      return `${base}+${link.hash}`

    case 'chat-folder':
      ensureToken(link.slug, 'a folder slug')

      return `${base}addlist/${link.slug}`

    case 'message':
      return writeMessage(link)

    case 'share':
      ensure(
        link.url !== '' && link.url.trim() === link.url,
        'a share link needs a URL without surrounding space',
      )
      ensure(link.text !== '', 'leave out empty share text')

      return `${base}share/url${query(
        ['url', encodeURIComponent(link.url)],
        link.text !== undefined && ['text', encodeURIComponent(link.text)],
      )}`

    case 'video-chat':
      ensureUsername(link.username, 'a chat')
      ensureToken(link.hash, 'a video chat hash')

      return `${base}${link.username}${query([link.live ? 'livestream' : 'videochat', link.hash])}`

    case 'sticker-set':
    case 'emoji-set':
      ensureToken(link.name, 'a set name')

      return `${base}${link.kind === 'sticker-set' ? 'addstickers' : 'addemoji'}/${link.name}`

    case 'story':
      ensureUsername(link.username, 'a username')
      ensure(Number.isInteger(link.id), 'a story link needs the story')
      ensureId(link.id, 'a story identifier', MAX_STORY_ID)

      return `${base}${link.username}/s/${link.id}`

    case 'boost':
      return 'username' in link.chat
        ? `${base}boost/${chatPath(link.chat)}`
        : `${base}boost${query(['c', chatPath(link.chat).slice('c/'.length)])}`

    default:
      return writeBotLink(link)
  }
}

function writeMessage(link: Extract<TelegramLink, { kind: 'message' }>): string {
  ensure(Number.isInteger(link.id), 'a message link needs the message')
  ensureId(link.id, 'a message identifier')
  ensureId(link.thread, 'a thread identifier')
  ensureId(link.comment, 'a comment identifier')
  ensureId(link.task, 'a task identifier')
  ensureId(link.mediaTimestamp, 'a media timestamp', MAX_MEDIA_TIMESTAMP)
  if (link.option !== undefined) {
    ensure(decodes(link.option).utf8 && link.option !== '', 'a poll option is base64url UTF-8')
  }

  const thread = link.thread === undefined ? '' : `/${link.thread}`

  return `https://t.me/${chatPath(link.chat)}${thread}/${link.id}${query(
    link.single === true && ['single'],
    link.comment !== undefined && ['comment', String(link.comment)],
    link.mediaTimestamp !== undefined && ['t', String(link.mediaTimestamp)],
    link.task !== undefined && ['task', String(link.task)],
    link.option !== undefined && ['option', link.option],
  )}`
}

function writeBotLink(link: Extract<TelegramLink, { bot: string }>): string {
  ensureUsername(link.bot, 'a bot')
  const base = `https://t.me/${link.bot}`

  switch (link.kind) {
    case 'bot-start':
      ensurePayload(link.payload, 64)
      ensure(
        link.payload === undefined || !link.payload.startsWith(REFERRAL_PREFIX),
        `a start parameter beginning ${REFERRAL_PREFIX} is read as an affiliate referral`,
      )

      return `${base}${query(['start', link.payload])}`

    case 'group-bot':
      ensurePayload(link.payload, 64)
      ensureList(link.admin, ADMIN_RIGHTS, 'administrator right')

      return `${base}${query(
        ['startgroup', link.payload],
        link.admin !== undefined && ['admin', link.admin.join('+')],
      )}`

    case 'channel-bot':
      ensureList(link.admin, ADMIN_RIGHTS, 'administrator right')

      return `${base}${query(['startchannel'], ['admin', link.admin.join('+')])}`

    case 'mini-app':
      ensurePayload(link.payload)
      if (link.app === undefined) {
        return `${base}${query(['startapp', link.payload], link.mode !== undefined && ['mode', link.mode])}`
      }
      ensure(validShortName(link.app), `${JSON.stringify(link.app)} is not a mini app short name`)

      return `${base}/${link.app}${query(
        link.payload !== undefined && ['startapp', link.payload],
        link.mode !== undefined && ['mode', link.mode],
      )}`

    case 'attach':
      ensurePayload(link.payload)
      ensureList(link.choose, ATTACH_TARGETS, 'attachment target')

      return `${base}${query(
        ['startattach', link.payload],
        link.choose !== undefined && ['choose', link.choose.join('+')],
      )}`

    case 'attach-in-chat': {
      ensurePayload(link.payload)
      let where: string
      if ('username' in link.chat) {
        ensureUsername(link.chat.username, 'a chat')
        where = link.chat.username
      } else {
        ensure(validPhone(link.chat.phone), 'a phone number in a link is 1 to 32 digits')
        where = `+${link.chat.phone}`
      }

      return `https://t.me/${where}${query(
        ['attach', link.bot],
        link.payload !== undefined && ['startattach', link.payload],
      )}`
    }

    default:
      ensure(validShortName(link.name), `${JSON.stringify(link.name)} is not a game short name`)

      return `${base}${query(['game', link.name])}`
  }
}

/* -------------------------------------------------------------------------- */
/* Reading links                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What one part of a link settles: a link; `null` for a Telegram link of a kind
 * not read here; `undefined` where it settles nothing and reading goes on.
 */
type Reading = TelegramLink | null | undefined

/** First path segments that are Telegram features of kinds not read here. */
const OTHER_FEATURES: ReadonlySet<string> = new Set([
  'addstyle',
  'addtheme',
  'auction',
  'bg',
  'call',
  'confirmphone',
  'contact',
  'giftcode',
  'invoice',
  'iv',
  'login',
  'm',
  'newbot',
  'nft',
  'proxy',
  'setlanguage',
  'socks',
])

/** `<name>.t.me` subdomains that are Telegram features rather than usernames. */
const FEATURE_SUBDOMAINS: ReadonlySet<string> = new Set([
  'addemoji',
  'addlist',
  'addstickers',
  'addstyle',
  'addtheme',
  'auction',
  'auth',
  'boost',
  'call',
  'confirmphone',
  'contact',
  'giftcode',
  'invoice',
  'joinchat',
  'login',
  'nft',
  'proxy',
  'setlanguage',
  'share',
  'socks',
  'web',
])

const WEB_HOSTS: ReadonlySet<string> = new Set(['t.me', 'telegram.me', 'telegram.dog'])

/** For each query read, the names whose value is not UTF-8 text once decoded. */
const NOT_TEXT = new WeakMap<URLSearchParams, ReadonlySet<string>>()

/** Whether a raw query value decodes to valid UTF-8. */
function isText(raw: string): boolean {
  const bytes: number[] = []
  for (const part of raw.replace(/\+/g, ' ').split(/(%[0-9A-Fa-f]{2})/)) {
    if (/^%[0-9A-Fa-f]{2}$/.test(part)) bytes.push(Number.parseInt(part.slice(1), 16))
    else bytes.push(...new TextEncoder().encode(part))
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))

    return true
  } catch {
    return false
  }
}

/**
 * A link's query, remembering which values are not text.
 *
 * Decoding replaces bytes that are not UTF-8, which would turn a malformed
 * message draft into a different one; Telegram's apps leave such a draft out.
 */
function queryOf(raw: string): URLSearchParams {
  const params = new URLSearchParams(raw)
  const seen = new Set<string>()
  const notText = new Set<string>()

  for (const pair of raw.split('&')) {
    const [entry] = new URLSearchParams(pair)
    if (entry === undefined || seen.has(entry[0])) continue

    seen.add(entry[0])
    const cut = pair.indexOf('=')
    if (cut !== -1 && !isText(pair.slice(cut + 1))) notText.add(entry[0])
  }

  NOT_TEXT.set(params, notText)

  return params
}

/** A non-empty query value that is text, where there is one. */
function textOf(params: URLSearchParams, name: string): string | undefined {
  return NOT_TEXT.get(params)?.has(name) === true ? undefined : given(params, name)
}

/** A non-empty query value. */
function given(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)

  return value === null || value === '' ? undefined : value
}

/**
 * Read a Telegram link.
 *
 * ```ts
 * readLink('https://t.me/c/1234567890/7?single')
 * // { kind: 'message', chat: { channel: { kind: 'channel', id: 1234567890n } }, id: 7, single: true }
 * ```
 *
 * Accepts `t.me`, `telegram.me` and `telegram.dog` links with or without a
 * scheme, `<username>.t.me`, and the `tg:` forms of the same kinds. Answers
 * `undefined` for anything that is not a Telegram link of a kind read here —
 * including Telegram links of other kinds, such as proxies or themes, which are
 * left unread rather than mistaken for a username.
 */
export function readLink(input: string): TelegramLink | undefined {
  const text = input.trim()

  return (/^tg:/i.test(text) ? readTg(text) : readWeb(text)) ?? undefined
}

function readWeb(text: string): Reading {
  let url: URL
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return undefined
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  if (url.username !== '' || url.password !== '') return undefined
  if (url.port !== '' && url.port !== '80' && url.port !== '443') return undefined

  let path: string[]
  try {
    path = url.pathname.split('/').slice(1).map(decodeURIComponent)
  } catch {
    return undefined
  }
  while (path.length > 0 && path.at(-1) === '') path.pop()

  const host = url.hostname
  const subdomain = host.endsWith('.t.me') ? host.slice(0, -'.t.me'.length) : ''
  if (subdomain.length >= 4 && validUsername(subdomain) && !FEATURE_SUBDOMAINS.has(subdomain)) {
    return readPath([subdomain, ...path], queryOf(url.search.slice(1)))
  }

  if (!WEB_HOSTS.has(host.replace(/^www\./, ''))) return undefined

  // `/s/` is the web preview of the same link.
  while (path.length > 1 && path[0] === 's') path.shift()

  return readPath(path, queryOf(url.search.slice(1)))
}

function readPath(path: readonly string[], params: URLSearchParams): Reading {
  const [first = '', second, third, fourth] = path

  switch (first) {
    case '':
      return undefined
    case 'c':
      return readPrivate(second, third, fourth, params)
    case 'joinchat':
      return invite(second) ?? null
    case 'addlist':
    case 'addstickers':
    case 'addemoji':
      return second !== undefined && second !== '' && BASE64URL.test(second)
        ? named(first, second)
        : null
    case 'share':
    case 'msg':
      // The published syntax has `share?url=` beside `share/url?url=` and `msg/url?url=`.
      return second === 'url' || (first === 'share' && second === undefined)
        ? readShare(params)
        : null
    default:
  }

  if (first.startsWith('+') || first.startsWith(' ')) return readPlus(first.slice(1), params)
  if (first.startsWith('$') || OTHER_FEATURES.has(first)) return null
  if (!validUsername(first) || first === 'i') return undefined

  return readUsername(first, path.slice(1), params)
}

/** A chat folder, sticker set or emoji set, by the name its link carries. */
function named(feature: 'addlist' | 'addstickers' | 'addemoji', name: string): TelegramLink {
  switch (feature) {
    case 'addlist':
      return { kind: 'chat-folder', slug: name }
    case 'addstickers':
      return { kind: 'sticker-set', name }
    default:
      return { kind: 'emoji-set', name }
  }
}

function invite(hash: string | undefined): TelegramLink | undefined {
  return hash !== undefined && hash !== '' && !validPhone(hash) && BASE64URL.test(hash)
    ? { kind: 'invite', hash }
    : undefined
}

/** `t.me/+…`: a phone number where it is digits, an invitation otherwise. */
function readPlus(rest: string, params: URLSearchParams): Reading {
  return validPhone(rest) ? readPhone(rest, params) : (invite(rest) ?? null)
}

function readPhone(phone: string, params: URLSearchParams): TelegramLink {
  const bot = params.get('attach') ?? ''

  return validUsername(bot)
    ? attachInChat({ phone }, bot, params)
    : withDraft({ kind: 'phone', phone }, params)
}

function withDraft<L extends { readonly kind: 'username' | 'phone' }>(
  link: L,
  params: URLSearchParams,
): L {
  const text = textOf(params, 'text')

  return {
    ...link,
    ...(text === undefined ? {} : { text }),
    ...(params.has('profile') ? { profile: true } : {}),
  }
}

function attachInChat(
  chat: { readonly username: string } | { readonly phone: string },
  bot: string,
  params: URLSearchParams,
): TelegramLink {
  const payload = given(params, 'startattach')

  return {
    kind: 'attach-in-chat',
    chat,
    bot,
    ...(payload !== undefined && BASE64URL.test(payload) ? { payload } : {}),
  }
}

/** A share: the URL, and where only text is given, the text in the URL's place. */
function readShare(params: URLSearchParams): Reading {
  if (NOT_TEXT.get(params)?.has('url') === true || NOT_TEXT.get(params)?.has('text') === true) {
    return null
  }

  const url = (params.get('url') ?? '').trim()
  const text = (params.get('text') ?? '').replace(/\n+$/, '')

  if (url === '') return text === '' ? null : { kind: 'share', url: text }

  return { kind: 'share', url, ...(text === '' ? {} : { text }) }
}

/** `t.me/c/<channel>/…`: a message in a private chat, or boosting it. */
function readPrivate(
  second: string | undefined,
  third: string | undefined,
  fourth: string | undefined,
  params: URLSearchParams,
): Reading {
  const channelText = leading(second)
  if (channelText === undefined) return null

  const channel = channelOf(channelText)
  const post = leading(third)

  if (post !== undefined) {
    if (channel === undefined) return null
    const inThread = leading(fourth)

    return inThread === undefined
      ? readMessage({ channel }, post, undefined, params)
      : readMessage({ channel }, inThread, post, params)
  }

  if (!params.has('boost')) return null

  return channel === undefined ? null : { kind: 'boost', chat: { channel } }
}

/**
 * A message link's identifiers and parameters.
 *
 * A malformed message, thread, comment, task or poll option makes the link
 * invalid; a media timestamp that cannot be read is ignored, and so is a poll
 * option that decodes to something other than text — the rules Telegram
 * publishes for these links.
 */
function readMessage(
  chat: LinkChat,
  post: string | undefined,
  pathThread: string | undefined,
  params: URLSearchParams,
): Reading {
  const id = serverId(post)
  const threadText = pathThread ?? given(params, 'thread')
  const thread = serverId(threadText)
  const commentText = given(params, 'comment')
  const comment = commentText === '0' ? undefined : serverId(commentText)
  const taskText = given(params, 'task')
  const task = serverId(taskText)
  const optionText = given(params, 'option')
  const option = optionText === undefined ? undefined : decodes(optionText)

  if (
    id === undefined ||
    (threadText !== undefined && thread === undefined) ||
    (commentText !== undefined && commentText !== '0' && comment === undefined) ||
    (taskText !== undefined && task === undefined) ||
    option?.bytes === false
  ) {
    return null
  }

  const mediaTimestamp = timestamp(params.get('t') ?? '')

  return {
    kind: 'message',
    chat,
    id,
    ...(thread === undefined ? {} : { thread }),
    ...(comment === undefined ? {} : { comment }),
    ...(params.has('single') ? { single: true } : {}),
    ...(mediaTimestamp === undefined ? {} : { mediaTimestamp }),
    ...(task === undefined ? {} : { task }),
    ...(option?.utf8 === true && optionText !== undefined ? { option: optionText } : {}),
  }
}

/**
 * A media timestamp, in seconds.
 *
 * Written as seconds (`123`), minutes and seconds (`10:23`), or with units
 * (`1h23m10s`, where a trailing number counts as seconds). Nothing for text that
 * is none of these, for zero, and past 10^7 seconds.
 */
function timestamp(text: string): number | undefined {
  const clock = /^(\d+):(\d{1,2})$/.exec(text)
  const seconds = clock === null ? withUnits(text) : Number(clock[1]) * 60 + Number(clock[2])

  return seconds !== undefined && seconds > 0 && seconds <= MAX_MEDIA_TIMESTAMP
    ? seconds
    : undefined
}

/** `1h23m10s`: numbers each followed by a unit, where the last may leave out `s`. */
function withUnits(text: string): number | undefined {
  if (!/^(?:\d*[hms])*\d*$/i.test(text)) return undefined

  let seconds = 0
  for (const [, digits = '', unit = 's'] of `${text}s`.matchAll(/(\d*)([hms])/gi)) {
    const value = Number(digits)
    const scale = /h/i.test(unit) ? 3600 : /m/i.test(unit) ? 60 : 1
    if (value > MAX_MEDIA_TIMESTAMP) return undefined

    seconds += value * scale
    if (seconds > MAX_MEDIA_TIMESTAMP) return undefined
  }

  return seconds
}

/** A link whose path begins with a username. */
function readUsername(name: string, rest: readonly string[], params: URLSearchParams): Reading {
  const [second, third] = rest

  const post = leading(second)
  if (post !== undefined) {
    const inThread = leading(third)

    return inThread === undefined
      ? readMessage({ username: name }, post, undefined, params)
      : readMessage({ username: name }, inThread, post, params)
  }

  const boost = name.toLowerCase() === 'boost' ? readBoostPath(rest, params) : undefined
  if (boost !== undefined) return boost

  if (rest.length === 2 && (second === 's' || second === 'c' || second === 'a')) {
    const id = serverId(third, MAX_STORY_ID)
    if (second === 's' && id !== undefined) return { kind: 'story', username: name, id }
    // A live story, a gift collection or a story album: kinds not read here.
    if ((second === 's' && third === 'live') || (second !== 's' && serverId(third) !== undefined)) {
      return null
    }
  }

  if (rest.length === 1 && second !== undefined && validShortName(second)) {
    return namedApp(name, second, params)
  }

  return readArguments(name, params, false)
}

/** `t.me/boost/<username>` and `t.me/boost?c=<channel>`. */
function readBoostPath(rest: readonly string[], params: URLSearchParams): Reading {
  const [second] = rest

  if (rest.length === 1 && second !== undefined && validUsername(second)) {
    return { kind: 'boost', chat: { username: second } }
  }

  if (rest.length === 0 && params.has('c')) {
    const channel = channelOf(leading(params.get('c')))

    return channel === undefined ? null : { kind: 'boost', chat: { channel } }
  }

  return undefined
}

function namedApp(bot: string, app: string, params: URLSearchParams): TelegramLink {
  const payload = given(params, 'startapp')

  return {
    kind: 'mini-app',
    bot,
    app,
    ...(payload === undefined ? {} : { payload }),
    ...modeOf(params),
  }
}

function modeOf(params: URLSearchParams): { mode?: MiniAppMode } {
  const mode = params.get('mode')

  return mode === 'compact' || mode === 'fullscreen' ? { mode } : {}
}

/** The known names in a `+`-separated list, once each, in the link's order. */
function listOf<T extends string>(
  text: string | null,
  known: ReadonlySet<string>,
): T[] | undefined {
  const items = [...new Set((text ?? '').split(' '))].filter((item) => known.has(item)) as T[]

  return items.length === 0 ? undefined : items
}

interface Asked {
  readonly name: string
  readonly params: URLSearchParams
  /** A `tg:` link, whose arguments differ slightly from the web form's. */
  readonly tg: boolean
}

type Argument = (value: string, asked: Asked) => Reading

function videoChat(live: boolean): Argument {
  return (value, asked) =>
    BASE64URL.test(value)
      ? { kind: 'video-chat', username: asked.name, live, ...(value === '' ? {} : { hash: value }) }
      : undefined
}

/** A kind not read here, where the argument's value makes it one. */
function otherKind(valid: (value: string) => boolean, tgOnly: boolean): Argument {
  return (value, asked) => ((asked.tg || !tgOnly) && valid(value) ? null : undefined)
}

const start: Argument = (value, asked) => {
  if (!BASE64URL.test(value)) return undefined
  // A start parameter with the referral prefix joins an affiliate program instead.
  if (value.startsWith(REFERRAL_PREFIX) && value.length > REFERRAL_PREFIX.length) return null

  return { kind: 'bot-start', bot: asked.name, ...(value === '' ? {} : { payload: value }) }
}

const startGroup: Argument = (value, asked) => {
  if (!BASE64URL.test(value)) return undefined
  const admin = listOf<LinkAdminRight>(asked.params.get('admin'), ADMIN_RIGHTS)

  return {
    kind: 'group-bot',
    bot: asked.name,
    ...(value === '' ? {} : { payload: value }),
    ...(admin === undefined ? {} : { admin }),
  }
}

const startChannel: Argument = (_, asked) => {
  const admin = listOf<LinkAdminRight>(asked.params.get('admin'), ADMIN_RIGHTS)

  return admin === undefined ? undefined : { kind: 'channel-bot', bot: asked.name, admin }
}

const story: Argument = (value, asked) => {
  if (!asked.tg) return undefined
  const id = serverId(value, MAX_STORY_ID)
  if (id !== undefined) return { kind: 'story', username: asked.name, id }

  return value === 'live' ? null : undefined
}

const startApp: Argument = (value, asked) => {
  if (!BASE64URL.test(value) || (asked.tg && asked.params.has('appname'))) return undefined

  return {
    kind: 'mini-app',
    bot: asked.name,
    ...(value === '' ? {} : { payload: value }),
    ...modeOf(asked.params),
  }
}

const startAttach: Argument = (value, asked) => {
  if (given(asked.params, 'attach') !== undefined) return undefined
  const choose = listOf<AttachTarget>(asked.params.get('choose'), ATTACH_TARGETS)

  return {
    kind: 'attach',
    bot: asked.name,
    ...(value !== '' && BASE64URL.test(value) ? { payload: value } : {}),
    ...(choose === undefined ? {} : { choose }),
  }
}

/**
 * What each argument of a username link forms, where it forms anything.
 *
 * Arguments are taken in the order the link gives them, and the first that
 * forms a link decides.
 */
const ARGUMENTS: ReadonlyMap<string, Argument> = new Map<string, Argument>([
  ['videochat', videoChat(false)],
  ['voicechat', videoChat(false)],
  ['livestream', videoChat(true)],
  [
    'boost',
    (_, asked) => (asked.tg ? undefined : { kind: 'boost', chat: { username: asked.name } }),
  ],
  ['ref', otherKind((value) => value !== '' && BASE64URL.test(value), false)],
  ['start', start],
  ['startgroup', startGroup],
  ['startchannel', startChannel],
  [
    'game',
    (value, asked) =>
      validShortName(value) ? { kind: 'game', bot: asked.name, name: value } : undefined,
  ],
  [
    'appname',
    (value, asked) =>
      asked.tg && validShortName(value) ? namedApp(asked.name, value, asked.params) : undefined,
  ],
  ['story', story],
  ['startapp', startApp],
  [
    'attach',
    (value, asked) =>
      validUsername(value)
        ? attachInChat({ username: asked.name }, value, asked.params)
        : undefined,
  ],
  ['startattach', startAttach],
  // A channel's direct messages, a gift collection and a story album.
  ['direct', () => null],
  ['collection', otherKind((value) => serverId(value) !== undefined, true)],
  ['album', otherKind((value) => serverId(value) !== undefined, true)],
])

function readArguments(name: string, params: URLSearchParams, tg: boolean): Reading {
  const asked: Asked = { name, params, tg }

  for (const [key, value] of params) {
    const reading = ARGUMENTS.get(key)?.(value, asked)
    if (reading !== undefined) return reading
  }

  return withDraft({ kind: 'username', username: name }, params)
}

/** A `tg:` link, read into the same descriptions as its web form. */
function readTg(text: string): Reading {
  const rest = text.replace(/^tg:(?:\/\/)?/i, '').replace(/#.*$/, '')
  const mark = rest.indexOf('?')
  const action = (mark === -1 ? rest : rest.slice(0, mark)).replace(/\/$/, '')
  const params = queryOf(mark === -1 ? '' : rest.slice(mark + 1))

  switch (action) {
    case '':
      return undefined
    case 'resolve':
      return readResolve(params)
    case 'privatepost': {
      if (given(params, 'channel') === undefined || given(params, 'post') === undefined) return null
      const channel = channelOf(given(params, 'channel'))

      return channel === undefined
        ? null
        : readMessage({ channel }, given(params, 'post'), undefined, params)
    }
    case 'join':
      return invite(given(params, 'invite')) ?? null
    case 'addlist':
    case 'addstickers':
    case 'addemoji':
      return readTgToken(action, params)
    case 'share':
    case 'msg':
    case 'msg_url':
      return readShare(params)
    case 'boost':
      return readTgBoost(params)
    default:
      return null
  }
}

function readTgToken(
  action: 'addlist' | 'addstickers' | 'addemoji',
  params: URLSearchParams,
): Reading {
  const value = given(params, action === 'addlist' ? 'slug' : 'set')

  return value !== undefined && BASE64URL.test(value) ? named(action, value) : null
}

function readTgBoost(params: URLSearchParams): Reading {
  const domain = given(params, 'domain')
  if (domain !== undefined) {
    return validUsername(domain) ? { kind: 'boost', chat: { username: domain } } : null
  }

  const channel = channelOf(given(params, 'channel'))

  return channel === undefined ? null : { kind: 'boost', chat: { channel } }
}

function readResolve(params: URLSearchParams): Reading {
  const domain = params.get('domain') ?? ''

  if (!validUsername(domain)) {
    const phone = (params.get('phone') ?? '').replace(/^ /, '')

    return validPhone(phone) ? readPhone(phone, params) : null
  }

  const post = given(params, 'post')
  if (post !== undefined) return readMessage({ username: domain }, post, undefined, params)

  // A sign-in request and a Passport request: kinds not read here.
  if (
    (domain === 'oauth' && given(params, 'startapp') !== undefined) ||
    domain === 'telegrampassport'
  ) {
    return null
  }

  return readArguments(domain, params, true)
}
