/**
 * The payloads a method takes, built rather than written out.
 *
 * The generated types describe every payload the Bot API accepts, which is
 * enough to write one correctly and not enough to write one quickly: a photo in
 * an album is `{ type: 'photo', media: … }`, a reaction is
 * `{ type: 'emoji', emoji: '👍' }`, and a permission set is sixteen booleans
 * that have to be named in full to mean "none of them".
 *
 * ```ts
 * await bot.api.sendMediaGroup({
 *   chat_id: chat,
 *   media: attach.photos([media.path('a.jpg'), media.path('b.jpg')], { caption: 'both' }),
 * })
 *
 * await bot.api.setChatPermissions({ chat_id: chat, permissions: permissions.none() })
 * ```
 *
 * Each builder returns the payload the schema declares, with nothing added: a
 * value from here is the same object a caller would have written, so it can be
 * spread, edited and mixed with hand-written payloads. Files go in as they
 * come from `media.*` — an upload nested inside a payload is rewritten to
 * `attach://` when the request is encoded, so nothing here has to know it is
 * being uploaded.
 *
 * Nothing here validates what only Telegram can judge — whether a file decodes
 * as a video, whether a provider token is live. What is refused is what would
 * otherwise go out as a payload the API rejects for a reason that names the
 * wrong thing: an album past its limit, a Stars invoice priced in two lines.
 */

import { ValidationError } from '@yuigram/core'
import type {
  BotCommand,
  BotCommandScopeAllChatAdministrators,
  BotCommandScopeAllGroupChats,
  BotCommandScopeAllPrivateChats,
  BotCommandScopeChat,
  BotCommandScopeChatAdministrators,
  BotCommandScopeChatMember,
  BotCommandScopeDefault,
  ChatAdministratorRights,
  ChatPermissions,
  InputContactMessageContent,
  InputInvoiceMessageContent,
  InputLocationMessageContent,
  InputMediaAnimation,
  InputMediaAudio,
  InputMediaDocument,
  InputMediaLivePhoto,
  InputMediaPhoto,
  InputMediaVideo,
  InputMediaVoiceNote,
  InputPollOption,
  InputRichBlock,
  InputRichMessage,
  InputRichMessageMedia,
  InputSticker,
  InputTextMessageContent,
  InputVenueMessageContent,
  LabeledPrice,
  LinkPreviewOptions,
  MenuButtonCommands,
  MenuButtonDefault,
  MenuButtonWebApp,
  ReactionTypeCustomEmoji,
  ReactionTypeEmoji,
  ReactionTypePaid,
  ReplyParameters,
  ShippingOption,
  WebAppInfo,
} from './generated/types/index.js'
import type { InputFile } from './input-file.js'

/** A file for a payload: an upload, a URL, or a `file_id` Telegram already has. */
export type PayloadFile = InputFile | string

/** The fields of a payload a builder does not supply itself. */
type Extra<T, Supplied extends keyof T> = Omit<T, Supplied | 'type'>

/** The most items one album holds. */
const MAX_ALBUM = 10

/* -------------------------------------------------------------------------- */
/* Media                                                                       */
/* -------------------------------------------------------------------------- */

/** How to caption an album built in one call. */
export interface AlbumCaption {
  /** A caption for the album, which Telegram shows from one item only. */
  readonly caption?: string
  /** Which item carries it. The first by default, which is where a client looks. */
  readonly captionIndex?: number
  readonly parse_mode?: string
}

function item<T>(type: string, media: PayloadFile, extra: object): T {
  return { type, media, ...extra } as T
}

/** Spread an album's caption onto the item that carries it. */
function captioned<T>(items: readonly T[], caption: AlbumCaption | undefined): T[] {
  if (items.length === 0 || items.length > MAX_ALBUM) {
    throw new ValidationError(`an album holds 1 to ${MAX_ALBUM} items, not ${items.length}`)
  }
  if (caption?.caption === undefined) return [...items]

  const at = caption.captionIndex ?? 0
  if (!Number.isInteger(at) || at < 0 || at >= items.length) {
    throw new ValidationError(
      `the caption belongs to an item of the album: 0 to ${items.length - 1}`,
    )
  }

  return items.map((one, index) =>
    index === at
      ? {
          ...one,
          caption: caption.caption,
          ...(caption.parse_mode === undefined ? {} : { parse_mode: caption.parse_mode }),
        }
      : one,
  )
}

/**
 * The media a message carries, and the albums built out of it.
 *
 * `attach.photo(file)` is one item; `attach.photos([…])` is a whole album,
 * captioned once, because Telegram shows a single caption for an album and
 * putting it on the wrong item hides it.
 */
export const attach = Object.freeze({
  photo: (media: PayloadFile, extra: Extra<InputMediaPhoto, 'media'> = {}): InputMediaPhoto =>
    item('photo', media, extra),

  video: (media: PayloadFile, extra: Extra<InputMediaVideo, 'media'> = {}): InputMediaVideo =>
    item('video', media, extra),

  animation: (
    media: PayloadFile,
    extra: Extra<InputMediaAnimation, 'media'> = {},
  ): InputMediaAnimation => item('animation', media, extra),

  audio: (media: PayloadFile, extra: Extra<InputMediaAudio, 'media'> = {}): InputMediaAudio =>
    item('audio', media, extra),

  document: (
    media: PayloadFile,
    extra: Extra<InputMediaDocument, 'media'> = {},
  ): InputMediaDocument => item('document', media, extra),

  /** A voice note, which only a rich message carries this way. */
  voiceNote: (
    media: PayloadFile,
    extra: Extra<InputMediaVoiceNote, 'media'> = {},
  ): InputMediaVoiceNote => item('voice_note', media, extra),

  /** A live photo: the still, and the short video that plays with it. */
  livePhoto: (
    media: PayloadFile,
    photo: PayloadFile,
    extra: Extra<InputMediaLivePhoto, 'media' | 'photo'> = {},
  ): InputMediaLivePhoto => ({ type: 'live_photo', media, photo, ...extra }) as InputMediaLivePhoto,

  /** An album of photos, captioned once. */
  photos: (files: readonly PayloadFile[], caption?: AlbumCaption): InputMediaPhoto[] =>
    captioned(
      files.map((file) => attach.photo(file)),
      caption,
    ),

  /** An album of videos, captioned once. */
  videos: (files: readonly PayloadFile[], caption?: AlbumCaption): InputMediaVideo[] =>
    captioned(
      files.map((file) => attach.video(file)),
      caption,
    ),

  /** An album of documents, captioned once. */
  documents: (files: readonly PayloadFile[], caption?: AlbumCaption): InputMediaDocument[] =>
    captioned(
      files.map((file) => attach.document(file)),
      caption,
    ),

  /** An album of audio files, captioned once. */
  audios: (files: readonly PayloadFile[], caption?: AlbumCaption): InputMediaAudio[] =>
    captioned(
      files.map((file) => attach.audio(file)),
      caption,
    ),
})

/**
 * A sticker for a set being created or added to.
 *
 * The format is the builder rather than a field, because it is not a detail of
 * the sticker: a file that is a video sticker cannot be added as a static one.
 */
export const newSticker = Object.freeze({
  static: (
    sticker: PayloadFile,
    emoji: readonly string[],
    extra: Extra<InputSticker, 'sticker' | 'emoji_list' | 'format'> = {},
  ): InputSticker =>
    ({ sticker, format: 'static', emoji_list: [...emoji], ...extra }) as InputSticker,

  animated: (
    sticker: PayloadFile,
    emoji: readonly string[],
    extra: Extra<InputSticker, 'sticker' | 'emoji_list' | 'format'> = {},
  ): InputSticker =>
    ({ sticker, format: 'animated', emoji_list: [...emoji], ...extra }) as InputSticker,

  video: (
    sticker: PayloadFile,
    emoji: readonly string[],
    extra: Extra<InputSticker, 'sticker' | 'emoji_list' | 'format'> = {},
  ): InputSticker =>
    ({ sticker, format: 'video', emoji_list: [...emoji], ...extra }) as InputSticker,
})

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/** What an inline result sends when it is picked. */
export const content = Object.freeze({
  text: (
    text: string,
    extra: Extra<InputTextMessageContent, 'message_text'> = {},
  ): InputTextMessageContent => ({ message_text: text, ...extra }),

  location: (
    latitude: number,
    longitude: number,
    extra: Extra<InputLocationMessageContent, 'latitude' | 'longitude'> = {},
  ): InputLocationMessageContent => ({ latitude, longitude, ...extra }),

  venue: (
    place: { readonly latitude: number; readonly longitude: number },
    title: string,
    address: string,
    extra: Extra<InputVenueMessageContent, 'latitude' | 'longitude' | 'title' | 'address'> = {},
  ): InputVenueMessageContent => ({ ...place, title, address, ...extra }),

  contact: (
    phone: string,
    firstName: string,
    extra: Extra<InputContactMessageContent, 'phone_number' | 'first_name'> = {},
  ): InputContactMessageContent => ({ phone_number: phone, first_name: firstName, ...extra }),

  invoice: (params: InputInvoiceMessageContent): InputInvoiceMessageContent => {
    checkPrices(params)

    return params
  },
})

/* -------------------------------------------------------------------------- */
/* Rich messages                                                               */
/* -------------------------------------------------------------------------- */

/** The most media one rich message carries. */
const MAX_RICH_MEDIA = 50

/** What a rich message's media id may be made of. */
const RICH_MEDIA_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The four link forms a rich message's text names its media by. */
export type RichMediaLink = 'photo' | 'video' | 'audio' | 'document'

/**
 * The link form each kind of media is named by.
 *
 * Telegram documents four link forms for six kinds of media. An animation is
 * played as a video and a voice note as audio — the formatting examples put
 * the one in a video element and the other in an audio element — so each is
 * named by the link its player takes.
 */
const LINK_OF: Readonly<Record<string, RichMediaLink>> = {
  photo: 'photo',
  video: 'video',
  animation: 'video',
  audio: 'audio',
  voice_note: 'audio',
  document: 'document',
}

function checkMediaId(id: string): void {
  if (!RICH_MEDIA_ID.test(id)) {
    throw new ValidationError(
      `a rich message's media id is 1 to 64 characters of A-Z, a-z, 0-9, _ and -, not ${JSON.stringify(id)}`,
    )
  }
}

function richEntry(id: string, media: InputRichMessageMedia['media']): InputRichMessageMedia {
  checkMediaId(id)

  return { id, media }
}

function linkOf(entry: InputRichMessageMedia): RichMediaLink {
  const kind = LINK_OF[entry.media.type]
  if (kind === undefined) {
    throw new ValidationError(`a rich message cannot name media of type ${entry.media.type}`)
  }

  return kind
}

/**
 * The media a rich message written as HTML or Markdown refers to.
 *
 * Each entry is a file under an id, and the text names it with a
 * `tg://<kind>?id=<id>` link. `richMedia.link(entry)` writes that link from the
 * entry itself, so the id is written once and the kind cannot disagree with
 * the file:
 *
 * ```ts
 * const chart = richMedia.photo('chart', media.path('chart.png'))
 *
 * await bot.api.sendRichMessage({
 *   chat_id: chat,
 *   rich_message: richMessage.html(`<img src="${richMedia.link(chart)}"/>`, { media: [chart] }),
 * })
 * ```
 *
 * A file uploaded here is attached when the request is encoded, as it is for
 * an album.
 */
export const richMedia = Object.freeze({
  photo: (
    id: string,
    file: PayloadFile,
    extra: Extra<InputMediaPhoto, 'media'> = {},
  ): InputRichMessageMedia => richEntry(id, attach.photo(file, extra)),

  video: (
    id: string,
    file: PayloadFile,
    extra: Extra<InputMediaVideo, 'media'> = {},
  ): InputRichMessageMedia => richEntry(id, attach.video(file, extra)),

  animation: (
    id: string,
    file: PayloadFile,
    extra: Extra<InputMediaAnimation, 'media'> = {},
  ): InputRichMessageMedia => richEntry(id, attach.animation(file, extra)),

  audio: (
    id: string,
    file: PayloadFile,
    extra: Extra<InputMediaAudio, 'media'> = {},
  ): InputRichMessageMedia => richEntry(id, attach.audio(file, extra)),

  voiceNote: (
    id: string,
    file: PayloadFile,
    extra: Extra<InputMediaVoiceNote, 'media'> = {},
  ): InputRichMessageMedia => richEntry(id, attach.voiceNote(file, extra)),

  document: (
    id: string,
    file: PayloadFile,
    extra: Extra<InputMediaDocument, 'media'> = {},
  ): InputRichMessageMedia => richEntry(id, attach.document(file, extra)),

  /** The link the text names an entry by. */
  link: (entry: InputRichMessageMedia): string => `tg://${linkOf(entry)}?id=${entry.id}`,
})

/** How a rich message is shown, whichever way it is written. */
export interface RichMessageOptions {
  /** Shown right to left. */
  readonly is_rtl?: boolean
  /** Leave URLs, mentions, hashtags and the like as plain text. */
  readonly skip_entity_detection?: boolean
}

/** A rich message written as text, with the media its links name. */
export interface RichTextOptions extends RichMessageOptions {
  readonly media?: readonly InputRichMessageMedia[]
}

/** The media links a rich message's text contains. */
const MEDIA_LINK = /tg:\/\/(photo|video|audio|document)\?id=([A-Za-z0-9_-]{1,64})/g

/**
 * Check a written rich message against the media it carries.
 *
 * What is refused is what cannot be displayed: two entries under one id, a
 * link naming an id nothing was attached under, and a link whose kind is not
 * the entry's. An entry no link names is let through — Telegram decides what
 * an unreferenced file means, and it may be named in a form this does not read.
 */
function checkRichMedia(text: string, media: readonly InputRichMessageMedia[]): void {
  if (media.length > MAX_RICH_MEDIA) {
    throw new ValidationError(
      `a rich message carries at most ${MAX_RICH_MEDIA} media, not ${media.length}`,
    )
  }

  const byId = new Map<string, RichMediaLink>()
  for (const entry of media) {
    checkMediaId(entry.id)
    if (byId.has(entry.id)) {
      throw new ValidationError(`two media in one rich message share the id ${entry.id}`)
    }
    byId.set(entry.id, linkOf(entry))
  }

  for (const [, kind, id = ''] of text.matchAll(MEDIA_LINK)) {
    const attached = byId.get(id)
    if (attached === undefined) {
      throw new ValidationError(`the text links to media ${id}, which is not attached`)
    }
    if (attached !== kind) {
      throw new ValidationError(
        `the text links to ${id} as ${kind}, but it is attached as ${attached}: tg://${attached}?id=${id}`,
      )
    }
  }
}

function written(
  form: 'html' | 'markdown',
  text: string,
  options: RichTextOptions,
): InputRichMessage {
  const { media, ...shown } = options
  checkRichMedia(text, media ?? [])

  return {
    [form]: text,
    ...(media === undefined || media.length === 0 ? {} : { media: [...media] }),
    ...shown,
  } as InputRichMessage
}

/**
 * A rich message: headings, lists, tables, media and the rest.
 *
 * Telegram takes exactly one of three forms, and each is its own builder, so a
 * message written in two cannot be built. The written forms carry the media
 * their links name; the block form carries its media inside the blocks.
 */
export const richMessage = Object.freeze({
  html: (html: string, options: RichTextOptions = {}): InputRichMessage =>
    written('html', html, options),

  markdown: (markdown: string, options: RichTextOptions = {}): InputRichMessage =>
    written('markdown', markdown, options),

  blocks: (
    blocks: readonly InputRichBlock[],
    options: RichMessageOptions = {},
  ): InputRichMessage => {
    if (blocks.length === 0) throw new ValidationError('a rich message needs at least one block')

    return { blocks: [...blocks], ...options }
  },
})

/**
 * What to do about the preview of a link in the text.
 *
 * `preview.off()` is the one most reached for. The others choose a URL to
 * preview, which need not be a link in the text, and how large to show it.
 */
export const preview = Object.freeze({
  off: (): LinkPreviewOptions => ({ is_disabled: true }),

  url: (
    url: string,
    extra: Omit<LinkPreviewOptions, 'url' | 'is_disabled'> = {},
  ): LinkPreviewOptions => ({
    url,
    ...extra,
  }),

  large: (url?: string, extra: Omit<LinkPreviewOptions, 'url' | 'prefer_large_media'> = {}) =>
    ({
      ...(url === undefined ? {} : { url }),
      prefer_large_media: true,
      ...extra,
    }) as LinkPreviewOptions,

  small: (url?: string, extra: Omit<LinkPreviewOptions, 'url' | 'prefer_small_media'> = {}) =>
    ({
      ...(url === undefined ? {} : { url }),
      prefer_small_media: true,
      ...extra,
    }) as LinkPreviewOptions,
})

/** What a message answers, and what of it to quote. */
interface ReplyTo {
  (messageId: number, extra?: Extra<ReplyParameters, 'message_id'>): ReplyParameters
  /** Answer a message in another chat, which Telegram allows only where it is public. */
  readonly inChat: (
    chatId: number | string,
    messageId: number,
    extra?: Extra<ReplyParameters, 'message_id' | 'chat_id'>,
  ) => ReplyParameters
  /**
   * Answer a message quoting part of it.
   *
   * The quote must appear in that message exactly, and `quote_position` says
   * where, so the same text appearing twice quotes the right one.
   */
  readonly quoting: (
    messageId: number,
    quote: string,
    extra?: Extra<ReplyParameters, 'message_id' | 'quote'>,
  ) => ReplyParameters
}

export const replyTo: ReplyTo = Object.freeze(
  Object.assign(
    (messageId: number, extra: Extra<ReplyParameters, 'message_id'> = {}): ReplyParameters => ({
      message_id: messageId,
      ...extra,
    }),
    {
      inChat: (
        chatId: number | string,
        messageId: number,
        extra: Extra<ReplyParameters, 'message_id' | 'chat_id'> = {},
      ): ReplyParameters => ({ message_id: messageId, chat_id: chatId, ...extra }),

      quoting: (
        messageId: number,
        quote: string,
        extra: Extra<ReplyParameters, 'message_id' | 'quote'> = {},
      ): ReplyParameters => ({ message_id: messageId, quote, ...extra }),
    },
  ),
)

/** A reaction to a message. */
export const reaction = Object.freeze({
  emoji: (emoji: string): ReactionTypeEmoji => ({ type: 'emoji', emoji }),
  custom: (id: string): ReactionTypeCustomEmoji => ({ type: 'custom_emoji', custom_emoji_id: id }),
  /** A paid reaction, which spends Stars when it is sent. */
  paid: (): ReactionTypePaid => ({ type: 'paid' }),
})

/** One option of a poll, which may carry its own formatting. */
export function pollOption(
  text: string,
  extra: Extra<InputPollOption, 'text'> = {},
): InputPollOption {
  return { text, ...extra }
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One line of an invoice.
 *
 * The amount is in the currency's smallest unit — 145 is $1.45 — because that
 * is what the API takes, and a builder that took 1.45 would have to know how
 * many digits the currency has.
 */
export function price(label: string, amount: number): LabeledPrice {
  if (!Number.isInteger(amount)) {
    throw new ValidationError(
      `a price is a whole number of the currency's smallest unit: ${amount}`,
    )
  }

  return { label, amount }
}

/** What every invoice needs, whichever way it is paid. */
interface InvoiceBase {
  readonly title: string
  readonly description: string
  /** Your own reference, echoed back on every payment update. */
  readonly payload: string
  readonly prices: readonly LabeledPrice[]
}

/** An invoice paid in money, through a payment provider. */
export interface FiatInvoice extends InvoiceBase {
  readonly provider_token: string
  readonly currency: string
  readonly max_tip_amount?: number
  readonly suggested_tip_amounts?: readonly number[]
  readonly provider_data?: string
  readonly is_flexible?: boolean
  readonly need_name?: boolean
  readonly need_phone_number?: boolean
  readonly need_email?: boolean
  readonly need_shipping_address?: boolean
  readonly send_phone_number_to_provider?: boolean
  readonly send_email_to_provider?: boolean
  readonly photo_url?: string
  readonly photo_size?: number
  readonly photo_width?: number
  readonly photo_height?: number
  readonly start_parameter?: string
}

/** An invoice paid in Telegram Stars. */
export interface StarsInvoice extends InvoiceBase {
  readonly subscription_period?: number
  readonly photo_url?: string
  readonly photo_size?: number
  readonly photo_width?: number
  readonly photo_height?: number
  readonly start_parameter?: string
}

/** The currency code Telegram Stars are priced in. */
const STARS = 'XTR'

function checkPrices(invoice: {
  readonly currency: string
  readonly prices: readonly LabeledPrice[]
}): void {
  if (invoice.prices.length === 0) {
    throw new ValidationError('an invoice needs at least one price')
  }
  if (invoice.currency === STARS && invoice.prices.length !== 1) {
    throw new ValidationError(
      `an invoice in Stars is priced in exactly one line, not ${invoice.prices.length}`,
    )
  }
}

/**
 * An invoice, as the fields a payment method takes.
 *
 * Two builders rather than one, because Telegram's two ways of being paid
 * differ in what they accept: Stars are priced in one line, in `XTR`, with no
 * provider and no tips, and money is priced in any number of lines by a
 * provider that has to be named. A caller spreads the result into
 * `sendInvoice`, `createInvoiceLink` or `content.invoice`.
 */
export const invoice = Object.freeze({
  fiat: (params: FiatInvoice) => {
    checkPrices(params)
    if (params.currency === STARS) {
      throw new ValidationError(`${STARS} is the currency of Stars: use invoice.stars`)
    }
    if (params.provider_token === '') {
      throw new ValidationError('an invoice in money names the provider it is paid through')
    }

    return { ...params, prices: [...params.prices] }
  },

  stars: (params: StarsInvoice) => {
    const priced = { ...params, currency: STARS, provider_token: '', prices: [...params.prices] }
    checkPrices(priced)

    return priced
  },
})

/** One delivery choice offered in answer to a shipping query. */
export function shipping(
  id: string,
  title: string,
  prices: readonly LabeledPrice[],
): ShippingOption {
  if (prices.length === 0) {
    throw new ValidationError('a shipping option needs at least one price, even a free one')
  }

  return { id, title, prices: [...prices] }
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

/** The button beside the message box in a chat with the bot. */
export const menuButton = Object.freeze({
  /** Whatever the bot's default button is. */
  default: (): MenuButtonDefault => ({ type: 'default' }),
  /** The bot's list of commands. */
  commands: (): MenuButtonCommands => ({ type: 'commands' }),
  /** A button opening a mini app. */
  webApp: (text: string, app: string | WebAppInfo): MenuButtonWebApp => ({
    type: 'web_app',
    text,
    web_app: typeof app === 'string' ? { url: app } : app,
  }),
})

/** The commands a bot publishes, and where each list applies. */
export const botCommands = Object.freeze({
  /** One command: the word without its slash, and what it does. */
  of: (command: string, description: string): BotCommand => ({ command, description }),

  /** A whole list, written as pairs. */
  list: (commands: readonly (readonly [string, string])[]): BotCommand[] =>
    commands.map(([command, description]) => ({ command, description })),

  /** Where a list of commands applies. */
  scope: Object.freeze({
    default: (): BotCommandScopeDefault => ({ type: 'default' }),
    allPrivateChats: (): BotCommandScopeAllPrivateChats => ({ type: 'all_private_chats' }),
    allGroupChats: (): BotCommandScopeAllGroupChats => ({ type: 'all_group_chats' }),
    allChatAdministrators: (): BotCommandScopeAllChatAdministrators => ({
      type: 'all_chat_administrators',
    }),
    chat: (chatId: number | string): BotCommandScopeChat => ({ type: 'chat', chat_id: chatId }),
    chatAdministrators: (chatId: number | string): BotCommandScopeChatAdministrators => ({
      type: 'chat_administrators',
      chat_id: chatId,
    }),
    chatMember: (chatId: number | string, userId: number): BotCommandScopeChatMember => ({
      type: 'chat_member',
      chat_id: chatId,
      user_id: userId,
    }),
  }),
})

/** Every field of a permission or rights set, so "none" means all of them. */
function everyFlag<T>(fields: readonly string[], value: boolean, overrides: Partial<T>): T {
  return { ...Object.fromEntries(fields.map((field) => [field, value])), ...overrides } as T
}

/** The fields of `ChatPermissions`, as the schema declares them. */
const PERMISSION_FIELDS = [
  'can_send_messages',
  'can_send_audios',
  'can_send_documents',
  'can_send_photos',
  'can_send_videos',
  'can_send_video_notes',
  'can_send_voice_notes',
  'can_send_polls',
  'can_send_other_messages',
  'can_add_web_page_previews',
  'can_react_to_messages',
  'can_edit_tag',
  'can_change_info',
  'can_invite_users',
  'can_pin_messages',
  'can_manage_topics',
] as const

/** The fields of `ChatAdministratorRights`, as the schema declares them. */
const ADMIN_FIELDS = [
  'is_anonymous',
  'can_manage_chat',
  'can_delete_messages',
  'can_manage_video_chats',
  'can_restrict_members',
  'can_promote_members',
  'can_change_info',
  'can_invite_users',
  'can_post_stories',
  'can_edit_stories',
  'can_delete_stories',
  'can_post_messages',
  'can_edit_messages',
  'can_pin_messages',
  'can_manage_topics',
  'can_manage_direct_messages',
  'can_manage_tags',
] as const

/**
 * What everybody in a chat may do.
 *
 * Every field is named, because Telegram reads an absent permission as
 * withheld: a set built by naming only what changed silently withdraws the
 * rest. Start from `all()` or `none()` and say what differs.
 */
export const permissions = Object.freeze({
  all: (overrides: Partial<ChatPermissions> = {}): ChatPermissions =>
    everyFlag(PERMISSION_FIELDS, true, overrides),
  none: (overrides: Partial<ChatPermissions> = {}): ChatPermissions =>
    everyFlag(PERMISSION_FIELDS, false, overrides),
})

/**
 * What an administrator may do.
 *
 * As with permissions, every field is named. `is_anonymous` is one of them, so
 * `all()` promotes anonymously unless told otherwise.
 */
export const adminRights = Object.freeze({
  all: (overrides: Partial<ChatAdministratorRights> = {}): ChatAdministratorRights =>
    everyFlag(ADMIN_FIELDS, true, overrides),
  none: (overrides: Partial<ChatAdministratorRights> = {}): ChatAdministratorRights =>
    everyFlag(ADMIN_FIELDS, false, overrides),
})
