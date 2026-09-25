/**
 * Reading what a message carried besides its text.
 *
 * `MessageMedia` is nineteen constructors, and the one that matters most is the
 * least informative: `messageMediaDocument` covers a video, a voice note, a
 * sticker, an animation, a music track and a file somebody attached. What it
 * actually is lives in the document's `attributes`, a vector whose entries a
 * reader has to search.
 *
 * ```
 *   messageMediaDocument ──> document ──> attributes ──> documentAttributeVideo
 *                                                   └──> documentAttributeAudio { voice }
 *                                                   └──> documentAttributeSticker
 * ```
 *
 * So {@link MediaView.kind} is the question this exists to answer: one name for
 * what arrived, derived from the constructor and, where the constructor will
 * not say, from the attributes. Everything else hangs off that — a duration
 * means one thing on a voice note and nothing on a photo, and asking for it in
 * the wrong place is how a reader ends up with `undefined` and no idea why.
 *
 * As with every view here: it holds the value, computes on access, caches
 * nothing and reaches nothing. Downloading what it describes is a call, and
 * calls belong on the client.
 */

import type {
  messages,
  TypeDocument,
  TypeDocumentAttribute,
  TypeGame,
  TypeGeoPoint,
  TypeInputGroupCall,
  TypeMessageExtendedMedia,
  TypeMessageMedia,
  TypePhoto,
  TypePoll,
  TypePollResults,
  TypeStoryItem,
  TypeTodoCompletion,
  TypeTodoList,
  TypeWebDocument,
  TypeWebPage,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'
import {
  type GameDetails,
  type LocationDetails,
  type PollDetails,
  readGame,
  readLocation,
  readPoll,
  readSticker,
  readTodo,
  readWebPage,
  type StickerDetails,
  type TodoDetails,
  type WebPageDetails,
} from './media-details.js'

/**
 * What arrived, in one word.
 *
 * The document kinds are separated because a reader asking "is this a voice
 * note" should not have to know that a voice note is a document with an audio
 * attribute whose `voice` flag is set.
 */
export type MediaKind =
  | 'none'
  | 'photo'
  | 'video'
  | 'animation'
  | 'voice'
  | 'audio'
  | 'sticker'
  | 'document'
  | 'geo'
  | 'live-geo'
  | 'venue'
  | 'contact'
  | 'poll'
  | 'dice'
  | 'game'
  | 'invoice'
  | 'webpage'
  | 'story'
  | 'giveaway'
  | 'giveaway-results'
  | 'paid'
  | 'todo'
  | 'stream'
  | 'unsupported'

/** Find one kind of attribute on a document. */
function attribute<K extends TypeDocumentAttribute['_']>(
  document: TypeDocument | undefined,
  kind: K,
): Extract<TypeDocumentAttribute, { _: K }> | undefined {
  if (document?._ !== 'document') return undefined

  return document.attributes.find(
    (one): one is Extract<TypeDocumentAttribute, { _: K }> => one._ === kind,
  )
}

/**
 * Which of the document kinds a document is.
 *
 * Order matters. A sticker carries an image size as well, an animation carries
 * a video attribute, and a voice note carries an audio one — so the most
 * specific answer has to be tried first or every sticker reads as a photo.
 */
function documentKind(document: TypeDocument | undefined): MediaKind {
  if (attribute(document, 'documentAttributeSticker') !== undefined) return 'sticker'
  if (attribute(document, 'documentAttributeCustomEmoji') !== undefined) return 'sticker'

  const audio = attribute(document, 'documentAttributeAudio')
  if (audio !== undefined) return audio.voice === true ? 'voice' : 'audio'

  if (attribute(document, 'documentAttributeAnimated') !== undefined) return 'animation'
  if (attribute(document, 'documentAttributeVideo') !== undefined) return 'video'

  return 'document'
}

/** A message's media, read. */
export class MediaView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeMessageMedia

  constructor(value: TypeMessageMedia) {
    this.raw = value
  }

  /**
   * What arrived.
   *
   * `none` for the empty constructor, and `unsupported` for media this build of
   * the schema has no name for — which is a real answer rather than a failure,
   * and the case a reader should expect as Telegram adds things.
   */
  get kind(): MediaKind {
    switch (this.raw._) {
      case 'messageMediaEmpty':
        return 'none'
      case 'messageMediaPhoto':
        return 'photo'
      case 'messageMediaDocument':
        return documentKind(this.raw.document)
      case 'messageMediaGeo':
        return 'geo'
      case 'messageMediaGeoLive':
        return 'live-geo'
      case 'messageMediaVenue':
        return 'venue'
      case 'messageMediaContact':
        return 'contact'
      case 'messageMediaPoll':
        return 'poll'
      case 'messageMediaDice':
        return 'dice'
      case 'messageMediaGame':
        return 'game'
      case 'messageMediaInvoice':
        return 'invoice'
      case 'messageMediaWebPage':
        return 'webpage'
      case 'messageMediaStory':
        return 'story'
      case 'messageMediaGiveaway':
        return 'giveaway'
      case 'messageMediaGiveawayResults':
        return 'giveaway-results'
      case 'messageMediaPaidMedia':
        return 'paid'
      case 'messageMediaToDo':
        return 'todo'
      case 'messageMediaVideoStream':
        return 'stream'
      default:
        return 'unsupported'
    }
  }

  /** Whether the media is hidden behind a spoiler until tapped. */
  get isSpoiler(): boolean {
    if (this.raw._ === 'messageMediaPhoto' || this.raw._ === 'messageMediaDocument') {
      return this.raw.spoiler === true
    }

    return false
  }

  /**
   * How long the media lives after being opened, in seconds.
   *
   * Set on media sent to be seen once. The file is gone after that, which is
   * why a reader that intends to download should check this first.
   */
  get ttlSeconds(): number | undefined {
    if (this.raw._ === 'messageMediaPhoto' || this.raw._ === 'messageMediaDocument') {
      return this.raw.ttl_seconds
    }

    return undefined
  }

  /** The photo, where one arrived. */
  get photo(): TypePhoto | undefined {
    return this.raw._ === 'messageMediaPhoto' ? this.raw.photo : undefined
  }

  /** The document, where one arrived — whatever {@link MediaView.kind} calls it. */
  get document(): TypeDocument | undefined {
    return this.raw._ === 'messageMediaDocument' ? this.raw.document : undefined
  }

  /** What the file is called, where it was sent with a name. */
  get fileName(): string | undefined {
    return attribute(this.document, 'documentAttributeFilename')?.file_name
  }

  /** The media type Telegram recorded for it. */
  get mimeType(): string | undefined {
    const document = this.document

    return document?._ === 'document' ? document.mime_type : undefined
  }

  /** How large the file is, in bytes. */
  get fileSize(): bigint | undefined {
    const document = this.document

    return document?._ === 'document' ? document.size : undefined
  }

  /**
   * How long it plays, in seconds.
   *
   * A video's duration is fractional in the schema and an audio track's is
   * whole. Both are answered here in seconds, because the distinction is about
   * how Telegram stores them rather than about what was asked.
   */
  get duration(): number | undefined {
    const video = attribute(this.document, 'documentAttributeVideo')
    if (video !== undefined) return video.duration

    return attribute(this.document, 'documentAttributeAudio')?.duration
  }

  /** How wide it is, in pixels, for anything with a picture. */
  get width(): number | undefined {
    const video = attribute(this.document, 'documentAttributeVideo')
    if (video !== undefined) return video.w

    return attribute(this.document, 'documentAttributeImageSize')?.w
  }

  /** How tall it is, in pixels, for anything with a picture. */
  get height(): number | undefined {
    const video = attribute(this.document, 'documentAttributeVideo')
    if (video !== undefined) return video.h

    return attribute(this.document, 'documentAttributeImageSize')?.h
  }

  /** Whether a video is the round kind recorded from a camera. */
  get isRound(): boolean {
    return attribute(this.document, 'documentAttributeVideo')?.round_message === true
  }

  /** Whether a video can be played before it has finished downloading. */
  get supportsStreaming(): boolean {
    return attribute(this.document, 'documentAttributeVideo')?.supports_streaming === true
  }

  /** The track's title, for music. */
  get title(): string | undefined {
    if (this.raw._ === 'messageMediaVenue') return this.raw.title
    if (this.raw._ === 'messageMediaInvoice') return this.raw.title

    return attribute(this.document, 'documentAttributeAudio')?.title
  }

  /** Who performed it, for music. */
  get performer(): string | undefined {
    return attribute(this.document, 'documentAttributeAudio')?.performer
  }

  /** The shape of a voice note's sound, for drawing it. */
  get waveform(): Uint8Array | undefined {
    return attribute(this.document, 'documentAttributeAudio')?.waveform
  }

  /**
   * The emoji this stands for.
   *
   * A sticker's is the one it was filed under; a dice's is the animation that
   * was rolled. Both answer the same question — which picture is this — so both
   * are here.
   */
  get emoji(): string | undefined {
    if (this.raw._ === 'messageMediaDice') return this.raw.emoticon

    const sticker = attribute(this.document, 'documentAttributeSticker')
    if (sticker !== undefined) return sticker.alt

    return attribute(this.document, 'documentAttributeCustomEmoji')?.alt
  }

  /** What a rolled dice landed on. */
  get diceValue(): number | undefined {
    return this.raw._ === 'messageMediaDice' ? this.raw.value : undefined
  }

  /** Where on the map, for anything that names a place. */
  get geo(): TypeGeoPoint | undefined {
    if (this.raw._ === 'messageMediaGeo' || this.raw._ === 'messageMediaGeoLive')
      return this.raw.geo
    if (this.raw._ === 'messageMediaVenue') return this.raw.geo

    return undefined
  }

  /** How long a shared live location keeps updating, in seconds. */
  get livePeriod(): number | undefined {
    return this.raw._ === 'messageMediaGeoLive' ? this.raw.period : undefined
  }

  /** Which way the sender was facing, in degrees, for a live location. */
  get heading(): number | undefined {
    return this.raw._ === 'messageMediaGeoLive' ? this.raw.heading : undefined
  }

  /** The street address of a venue. */
  get address(): string | undefined {
    return this.raw._ === 'messageMediaVenue' ? this.raw.address : undefined
  }

  /** Who the venue's details came from, and its identifier there. */
  get venueProvider(): { readonly provider: string; readonly id: string } | undefined {
    return this.raw._ === 'messageMediaVenue'
      ? { provider: this.raw.provider, id: this.raw.venue_id }
      : undefined
  }

  /** The person a shared contact names. */
  get contact():
    | {
        readonly phone: string
        readonly firstName: string
        readonly lastName: string
        readonly userId: bigint
        readonly vcard: string
      }
    | undefined {
    if (this.raw._ !== 'messageMediaContact') return undefined

    return {
      phone: this.raw.phone_number,
      firstName: this.raw.first_name,
      lastName: this.raw.last_name,
      userId: this.raw.user_id,
      vcard: this.raw.vcard,
    }
  }

  /** The poll that was asked. */
  get poll(): TypePoll | undefined {
    return this.raw._ === 'messageMediaPoll' ? this.raw.poll : undefined
  }

  /** How the poll has been answered so far. */
  get pollResults(): TypePollResults | undefined {
    return this.raw._ === 'messageMediaPoll' ? this.raw.results : undefined
  }

  /** The game that was shared. */
  get game(): TypeGame | undefined {
    return this.raw._ === 'messageMediaGame' ? this.raw.game : undefined
  }

  /** The link that was previewed. */
  get webpage(): TypeWebPage | undefined {
    return this.raw._ === 'messageMediaWebPage' ? this.raw.webpage : undefined
  }

  /** What an invoice is asking for, as a description. */
  get description(): string | undefined {
    return this.raw._ === 'messageMediaInvoice' ? this.raw.description : undefined
  }

  /** What an invoice costs, in the smallest unit of its currency. */
  get amount(): bigint | undefined {
    return this.raw._ === 'messageMediaInvoice' ? this.raw.total_amount : undefined
  }

  /** Which currency an invoice is in. */
  get currency(): string | undefined {
    return this.raw._ === 'messageMediaInvoice' ? this.raw.currency : undefined
  }

  /** Who posted the story this points at. */
  get storyPeer(): PeerRef | undefined {
    return this.raw._ === 'messageMediaStory' ? peerRefOf(this.raw.peer) : undefined
  }

  /** Which story this points at. */
  get storyId(): number | undefined {
    return this.raw._ === 'messageMediaStory' ? this.raw.id : undefined
  }

  /** What paid media costs to unlock, in stars. */
  get paidStars(): bigint | undefined {
    return this.raw._ === 'messageMediaPaidMedia' ? this.raw.stars_amount : undefined
  }

  /**
   * Whether a premium animation is refused to accounts without Premium.
   *
   * Set on the sender's side. An account without Premium sees a still image.
   */
  get isPremiumOnly(): boolean {
    return this.raw._ === 'messageMediaDocument' ? this.raw.nopremium === true : false
  }

  /**
   * Whether the media says it is a video, apart from what its attributes say.
   *
   * Telegram added these flags to the media so a client can tell what arrived
   * without reading the document, and they are answered separately from
   * {@link MediaView.kind} because a flag and a derived answer can disagree —
   * which is worth being able to see rather than worth hiding.
   */
  get flaggedVideo(): boolean {
    return this.raw._ === 'messageMediaDocument' ? this.raw.video === true : false
  }

  /** Whether the media says it is a round video, apart from its attributes. */
  get flaggedRound(): boolean {
    return this.raw._ === 'messageMediaDocument' ? this.raw.round === true : false
  }

  /** Whether the media says it is a voice note, apart from its attributes. */
  get flaggedVoice(): boolean {
    return this.raw._ === 'messageMediaDocument' ? this.raw.voice === true : false
  }

  /** The other qualities the same video is available in. */
  get alternateDocuments(): readonly TypeDocument[] | undefined {
    return this.raw._ === 'messageMediaDocument' ? this.raw.alt_documents : undefined
  }

  /** The still shown for a video before it plays. */
  get videoCover(): TypePhoto | undefined {
    return this.raw._ === 'messageMediaDocument' ? this.raw.video_cover : undefined
  }

  /** How far into a video to start playing, in seconds. */
  get videoTimestamp(): number | undefined {
    return this.raw._ === 'messageMediaDocument' ? this.raw.video_timestamp : undefined
  }

  /** How close somebody must come before a live location notifies, in metres. */
  get proximityRadius(): number | undefined {
    return this.raw._ === 'messageMediaGeoLive' ? this.raw.proximity_notification_radius : undefined
  }

  /** What kind of place a venue is, in the provider's own vocabulary. */
  get venueType(): string | undefined {
    return this.raw._ === 'messageMediaVenue' ? this.raw.venue_type : undefined
  }

  /** How a dice-like game came out, where the animation is a game. */
  get gameOutcome(): messages.TypeEmojiGameOutcome | undefined {
    return this.raw._ === 'messageMediaDice' ? this.raw.game_outcome : undefined
  }

  /** Whether an invoice asks for somewhere to ship to. */
  get needsShippingAddress(): boolean {
    return this.raw._ === 'messageMediaInvoice'
      ? this.raw.shipping_address_requested === true
      : false
  }

  /** Whether an invoice is against a test payment provider rather than a real one. */
  get isTestInvoice(): boolean {
    return this.raw._ === 'messageMediaInvoice' ? this.raw.test === true : false
  }

  /** The picture shown with an invoice. */
  get invoicePhoto(): TypeWebDocument | undefined {
    return this.raw._ === 'messageMediaInvoice' ? this.raw.photo : undefined
  }

  /** The receipt for an invoice already paid, by its message number. */
  get receiptMessageId(): number | undefined {
    return this.raw._ === 'messageMediaInvoice' ? this.raw.receipt_msg_id : undefined
  }

  /** The parameter a bot receives when somebody opens an invoice. */
  get startParameter(): string | undefined {
    return this.raw._ === 'messageMediaInvoice' ? this.raw.start_param : undefined
  }

  /**
   * The media behind a paywall, as much of it as this account may see.
   *
   * A preview until it is paid for, and the media itself afterwards. Invoices
   * carry one; paid media carries several.
   */
  get extendedMedia(): readonly TypeMessageExtendedMedia[] | undefined {
    if (this.raw._ === 'messageMediaPaidMedia') return this.raw.extended_media

    if (this.raw._ === 'messageMediaInvoice') {
      return this.raw.extended_media === undefined ? undefined : [this.raw.extended_media]
    }

    return undefined
  }

  /** Whether a story is here because the message mentioned its author. */
  get storyViaMention(): boolean {
    return this.raw._ === 'messageMediaStory' ? this.raw.via_mention === true : false
  }

  /** The story itself, where the answer carried it rather than only pointing at it. */
  get story(): TypeStoryItem | undefined {
    return this.raw._ === 'messageMediaStory' ? this.raw.story : undefined
  }

  /** How a preview is shown, where the sender asked for something in particular. */
  get webpagePreview():
    | {
        readonly large: boolean
        readonly small: boolean
        readonly manual: boolean
        readonly safe: boolean
      }
    | undefined {
    if (this.raw._ !== 'messageMediaWebPage') return undefined

    return {
      large: this.raw.force_large_media === true,
      small: this.raw.force_small_media === true,
      manual: this.raw.manual === true,
      safe: this.raw.safe === true,
    }
  }

  /** The prize draw, where one arrived. */
  get giveaway():
    | {
        readonly channels: readonly bigint[]
        readonly quantity: number
        readonly untilDate: number
        readonly onlyNewSubscribers: boolean
        readonly winnersAreVisible: boolean
        readonly countries: readonly string[] | undefined
        readonly prizeDescription: string | undefined
        readonly months: number | undefined
        readonly stars: bigint | undefined
      }
    | undefined {
    if (this.raw._ !== 'messageMediaGiveaway') return undefined

    return {
      channels: this.raw.channels,
      quantity: this.raw.quantity,
      untilDate: this.raw.until_date,
      onlyNewSubscribers: this.raw.only_new_subscribers === true,
      winnersAreVisible: this.raw.winners_are_visible === true,
      countries: this.raw.countries_iso2,
      prizeDescription: this.raw.prize_description,
      months: this.raw.months,
      stars: this.raw.stars,
    }
  }

  /** How a prize draw came out, where the results arrived. */
  get giveawayResults():
    | {
        readonly channelId: bigint
        readonly launchMessageId: number
        readonly winners: readonly bigint[]
        readonly winnersCount: number
        readonly unclaimedCount: number
        readonly additionalPeersCount: number | undefined
        readonly untilDate: number
        readonly onlyNewSubscribers: boolean
        readonly refunded: boolean
        readonly prizeDescription: string | undefined
        readonly months: number | undefined
        readonly stars: bigint | undefined
      }
    | undefined {
    if (this.raw._ !== 'messageMediaGiveawayResults') return undefined

    return {
      channelId: this.raw.channel_id,
      launchMessageId: this.raw.launch_msg_id,
      winners: this.raw.winners,
      winnersCount: this.raw.winners_count,
      unclaimedCount: this.raw.unclaimed_count,
      additionalPeersCount: this.raw.additional_peers_count,
      untilDate: this.raw.until_date,
      onlyNewSubscribers: this.raw.only_new_subscribers === true,
      refunded: this.raw.refunded === true,
      prizeDescription: this.raw.prize_description,
      months: this.raw.months,
      stars: this.raw.stars,
    }
  }

  /** The list of things to do, where one arrived. */
  get todo(): TypeTodoList | undefined {
    return this.raw._ === 'messageMediaToDo' ? this.raw.todo : undefined
  }

  /** Which of a to-do list's entries are done, and by whom. */
  get todoCompletions(): readonly TypeTodoCompletion[] | undefined {
    return this.raw._ === 'messageMediaToDo' ? this.raw.completions : undefined
  }

  /** The call a live stream is being broadcast into. */
  get streamCall(): TypeInputGroupCall | undefined {
    return this.raw._ === 'messageMediaVideoStream' ? this.raw.call : undefined
  }

  /** Whether a live stream is being sent in over RTMP rather than from the app. */
  get isRtmpStream(): boolean {
    return this.raw._ === 'messageMediaVideoStream' ? this.raw.rtmp_stream === true : false
  }

  /**
   * A poll with its tally joined to its answers: which answer has how many
   * votes, which this account chose, which is right. See {@link readPoll}.
   */
  get pollDetails(): PollDetails | undefined {
    if (this.raw._ !== 'messageMediaPoll') return undefined

    return readPoll(this.raw.poll, this.raw.results, this.raw.attached_media)
  }

  /** A checklist with who finished which task. See {@link readTodo}. */
  get todoDetails(): TodoDetails | undefined {
    if (this.raw._ !== 'messageMediaToDo') return undefined

    return readTodo(this.raw.todo, this.raw.completions)
  }

  /** What a link preview shows, once Telegram has built it. See {@link readWebPage}. */
  get webpageDetails(): WebPageDetails | undefined {
    return this.raw._ === 'messageMediaWebPage' ? readWebPage(this.raw.webpage) : undefined
  }

  /** A game's name, text and pictures. */
  get gameDetails(): GameDetails | undefined {
    return this.raw._ === 'messageMediaGame' ? readGame(this.raw.game) : undefined
  }

  /**
   * What makes a sticker or a custom emoji one: its type, how it is drawn, its
   * set, and where a mask sits. See {@link readSticker}.
   */
  get stickerDetails(): StickerDetails | undefined {
    return this.kind === 'sticker' ? readSticker(this.document) : undefined
  }

  /** Where a point, a live location or a venue is, in degrees. */
  get location(): LocationDetails | undefined {
    return readLocation(this.geo)
  }

  /** The codec a video is encoded with, where Telegram says. */
  get videoCodec(): string | undefined {
    return attribute(this.document, 'documentAttributeVideo')?.video_codec
  }

  /** Where a video's own preview frame is, in seconds from its start. */
  get videoStartTimestamp(): number | undefined {
    return attribute(this.document, 'documentAttributeVideo')?.video_start_ts
  }

  /** Whether a video has no sound. */
  get isSilentVideo(): boolean {
    return attribute(this.document, 'documentAttributeVideo')?.nosound === true
  }

  /** How many bytes a player should fetch before it starts, where Telegram says. */
  get preloadPrefixSize(): number | undefined {
    return attribute(this.document, 'documentAttributeVideo')?.preload_prefix_size
  }

  /**
   * Whether this is something a file can be fetched for.
   *
   * True for a photo or any document kind. A poll, a venue and a dice describe
   * themselves entirely and have nothing to download.
   */
  get isDownloadable(): boolean {
    return this.photo !== undefined || this.document !== undefined
  }

  /** The value again, so serializing a view serializes what it reads. */
  toJSON(): TypeMessageMedia {
    return this.raw
  }
}

/** Read a message's media. Takes what a message carries, including nothing. */
export function readMedia(value: TypeMessageMedia | undefined): MediaView | undefined {
  return value === undefined ? undefined : new MediaView(value)
}
