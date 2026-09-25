/**
 * Reading what a message carried besides its text.
 *
 * The cases that matter are the six that arrive as the same constructor. A
 * video, a voice note, a sticker, an animation, a music track and a plain file
 * are all `messageMediaDocument`, and what separates them is an entry in a
 * vector of attributes — which is exactly the search a reader should not have
 * to write, and exactly the place an ordering mistake hides.
 */

import { describe, expect, it } from 'vitest'
import { MediaView, readMedia } from '../src/entities/media.js'
import type {
  MessageMediaDocument,
  TypeDocumentAttribute,
  TypeMessageMedia,
} from '../src/generated/api/types/index.js'

/** A document carrying the attributes a case is about. */
const documentWith = (attributes: readonly TypeDocumentAttribute[]): MessageMediaDocument => ({
  _: 'messageMediaDocument',
  document: {
    _: 'document',
    id: 10n,
    access_hash: 20n,
    file_reference: new Uint8Array([1]),
    date: 1_700_000_000,
    mime_type: 'application/octet-stream',
    size: 4096n,
    dc_id: 2,
    attributes,
  },
})

describe('telling the document kinds apart', () => {
  it('calls a bare document a document', () => {
    const media = new MediaView(
      documentWith([{ _: 'documentAttributeFilename', file_name: 'a.bin' }]),
    )

    expect(media.kind).toBe('document')
    expect(media.fileName).toBe('a.bin')
  })

  it('calls one with a video attribute a video', () => {
    const media = new MediaView(
      documentWith([
        { _: 'documentAttributeVideo', duration: 12.5, w: 640, h: 480, supports_streaming: true },
      ]),
    )

    expect(media.kind).toBe('video')
    expect(media.duration).toBe(12.5)
    expect(media.width).toBe(640)
    expect(media.height).toBe(480)
    expect(media.supportsStreaming).toBe(true)
    expect(media.isRound).toBe(false)
  })

  it('knows a round video recorded from a camera', () => {
    const media = new MediaView(
      documentWith([
        { _: 'documentAttributeVideo', duration: 4, w: 240, h: 240, round_message: true },
      ]),
    )

    expect(media.kind).toBe('video')
    expect(media.isRound).toBe(true)
  })

  it('separates a voice note from a music track by a flag, not a constructor', () => {
    // Both are audio attributes. The `voice` flag is the whole difference, and a
    // reader should not need to know that.
    const voice = new MediaView(
      documentWith([
        {
          _: 'documentAttributeAudio',
          duration: 3,
          voice: true,
          waveform: new Uint8Array([7, 8]),
        },
      ]),
    )
    const music = new MediaView(
      documentWith([
        { _: 'documentAttributeAudio', duration: 200, title: 'Song', performer: 'Someone' },
      ]),
    )

    expect(voice.kind).toBe('voice')
    expect(voice.waveform).toEqual(new Uint8Array([7, 8]))
    expect(music.kind).toBe('audio')
    expect(music.title).toBe('Song')
    expect(music.performer).toBe('Someone')
  })

  it('calls a sticker a sticker even though it also carries a size', () => {
    // A sticker carries an image size too, so a reader checking that first
    // would call every sticker a plain document.
    const media = new MediaView(
      documentWith([
        { _: 'documentAttributeImageSize', w: 512, h: 512 },
        {
          _: 'documentAttributeSticker',
          alt: '😀',
          stickerset: { _: 'inputStickerSetEmpty' },
        },
      ]),
    )

    expect(media.kind).toBe('sticker')
    expect(media.emoji).toBe('😀')
    expect(media.width).toBe(512)
  })

  it('calls a custom emoji a sticker', () => {
    const media = new MediaView(
      documentWith([
        { _: 'documentAttributeCustomEmoji', alt: '🎉', stickerset: { _: 'inputStickerSetEmpty' } },
      ]),
    )

    expect(media.kind).toBe('sticker')
    expect(media.emoji).toBe('🎉')
  })

  it('calls an animation an animation even though it also carries a video attribute', () => {
    // The animated attribute has to win, or every silent looping clip reads as
    // an ordinary video.
    const media = new MediaView(
      documentWith([
        { _: 'documentAttributeVideo', duration: 2, w: 320, h: 240, nosound: true },
        { _: 'documentAttributeAnimated' },
      ]),
    )

    expect(media.kind).toBe('animation')
  })

  it('times a video by its picture rather than by its sound track', () => {
    // A video with sound carries both attributes, and they do not have to
    // agree. The picture is what a duration means here.
    const media = new MediaView(
      documentWith([
        { _: 'documentAttributeVideo', duration: 30, w: 640, h: 480 },
        { _: 'documentAttributeAudio', duration: 29 },
      ]),
    )

    expect(media.duration).toBe(30)
  })

  it('reads what every document kind shares', () => {
    const media = new MediaView(documentWith([]))

    expect(media.mimeType).toBe('application/octet-stream')
    expect(media.fileSize).toBe(4096n)
    expect(media.isDownloadable).toBe(true)
  })
})

describe('the kinds that are their own constructor', () => {
  it('names each one', () => {
    const cases: readonly (readonly [TypeMessageMedia, string])[] = [
      [{ _: 'messageMediaEmpty' }, 'none'],
      [{ _: 'messageMediaUnsupported' }, 'unsupported'],
      [{ _: 'messageMediaPhoto' }, 'photo'],
      [{ _: 'messageMediaGeo', geo: { _: 'geoPointEmpty' } }, 'geo'],
      [{ _: 'messageMediaGeoLive', geo: { _: 'geoPointEmpty' }, period: 900 }, 'live-geo'],
      [
        {
          _: 'messageMediaVenue',
          geo: { _: 'geoPointEmpty' },
          title: 'Place',
          address: '1 Street',
          provider: 'foursquare',
          venue_id: 'v1',
          venue_type: 'cafe',
        },
        'venue',
      ],
      [
        {
          _: 'messageMediaContact',
          phone_number: '15551234',
          first_name: 'Ada',
          last_name: 'Lovelace',
          vcard: '',
          user_id: 5n,
        },
        'contact',
      ],
      [{ _: 'messageMediaDice', value: 4, emoticon: '🎲' }, 'dice'],
      [{ _: 'messageMediaPaidMedia', stars_amount: 50n, extended_media: [] }, 'paid'],
    ]

    for (const [value, kind] of cases) {
      expect(new MediaView(value).kind).toBe(kind)
    }
  })

  it('reads a venue as a place with an address and a provider', () => {
    const media = new MediaView({
      _: 'messageMediaVenue',
      geo: { _: 'geoPoint', long: 1, lat: 2, access_hash: 3n },
      title: 'Place',
      address: '1 Street',
      provider: 'foursquare',
      venue_id: 'v1',
      venue_type: 'cafe',
    })

    expect(media.title).toBe('Place')
    expect(media.address).toBe('1 Street')
    expect(media.venueProvider).toEqual({ provider: 'foursquare', id: 'v1' })
    expect(media.geo).toEqual({ _: 'geoPoint', long: 1, lat: 2, access_hash: 3n })
    expect(media.isDownloadable).toBe(false)
  })

  it('reads a live location as one that keeps updating', () => {
    const media = new MediaView({
      _: 'messageMediaGeoLive',
      geo: { _: 'geoPointEmpty' },
      period: 900,
      heading: 270,
    })

    expect(media.livePeriod).toBe(900)
    expect(media.heading).toBe(270)
  })

  it('reads a shared contact as a person', () => {
    const media = new MediaView({
      _: 'messageMediaContact',
      phone_number: '15551234',
      first_name: 'Ada',
      last_name: 'Lovelace',
      vcard: 'BEGIN:VCARD',
      user_id: 5n,
    })

    expect(media.contact).toEqual({
      phone: '15551234',
      firstName: 'Ada',
      lastName: 'Lovelace',
      userId: 5n,
      vcard: 'BEGIN:VCARD',
    })
  })

  it('reads a dice as a roll with a face', () => {
    const media = new MediaView({ _: 'messageMediaDice', value: 4, emoticon: '🎲' })

    expect(media.diceValue).toBe(4)
    expect(media.emoji).toBe('🎲')
  })

  it('reads what paid media costs', () => {
    const media = new MediaView({
      _: 'messageMediaPaidMedia',
      stars_amount: 50n,
      extended_media: [],
    })

    expect(media.paidStars).toBe(50n)
  })
})

describe('what is hidden or expires', () => {
  it('knows a spoiler on a photo and on a document', () => {
    expect(new MediaView({ _: 'messageMediaPhoto', spoiler: true }).isSpoiler).toBe(true)
    expect(new MediaView({ ...documentWith([]), spoiler: true }).isSpoiler).toBe(true)
    expect(new MediaView({ _: 'messageMediaPhoto' }).isSpoiler).toBe(false)
  })

  it('knows media sent to be seen once', () => {
    // A reader intending to download should ask this first: the file is gone
    // after it is opened.
    const media = new MediaView({ _: 'messageMediaPhoto', ttl_seconds: 5 })

    expect(media.ttlSeconds).toBe(5)
    expect(new MediaView({ _: 'messageMediaPhoto' }).ttlSeconds).toBeUndefined()
  })

  it('answers no for the kinds that cannot carry either', () => {
    const media = new MediaView({ _: 'messageMediaDice', value: 1, emoticon: '🎲' })

    expect(media.isSpoiler).toBe(false)
    expect(media.ttlSeconds).toBeUndefined()
  })
})

describe('asking the wrong kind', () => {
  it('says nothing rather than guessing', () => {
    // A duration means something on a voice note and nothing on a venue. The
    // answer is absence, not zero.
    const venue = new MediaView({
      _: 'messageMediaVenue',
      geo: { _: 'geoPointEmpty' },
      title: 'Place',
      address: '1 Street',
      provider: 'p',
      venue_id: 'v',
      venue_type: 't',
    })

    expect(venue.duration).toBeUndefined()
    expect(venue.fileName).toBeUndefined()
    expect(venue.mimeType).toBeUndefined()
    expect(venue.fileSize).toBeUndefined()
    expect(venue.document).toBeUndefined()
    expect(venue.photo).toBeUndefined()
    expect(venue.contact).toBeUndefined()
    expect(venue.diceValue).toBeUndefined()
  })

  it('reports nothing downloadable where there is no file', () => {
    expect(new MediaView({ _: 'messageMediaEmpty' }).isDownloadable).toBe(false)
    expect(new MediaView({ _: 'messageMediaDice', value: 1, emoticon: '🎲' }).isDownloadable).toBe(
      false,
    )
  })
})

describe('building a media view', () => {
  it('takes what a message carries, including nothing', () => {
    expect(readMedia(undefined)).toBeUndefined()
    expect(readMedia({ _: 'messageMediaEmpty' })?.kind).toBe('none')
  })

  it('copies nothing', () => {
    const value: TypeMessageMedia = { _: 'messageMediaEmpty' }

    expect(readMedia(value)?.raw).toBe(value)
    expect(new MediaView(value).toJSON()).toBe(value)
  })
})

describe('the rest of what each constructor carries', () => {
  it('reads the flags the media sets apart from what the document says', () => {
    // Telegram added these so a client can tell what arrived without reading
    // the document. They are answered separately from `kind` because a flag and
    // a derived answer can disagree, and that is worth being able to see.
    const media = new MediaView({
      ...documentWith([{ _: 'documentAttributeFilename', file_name: 'clip.mp4' }]),
      video: true,
      round: true,
      voice: true,
      nopremium: true,
      video_timestamp: 12,
    })

    expect(media.flaggedVideo).toBe(true)
    expect(media.flaggedRound).toBe(true)
    expect(media.flaggedVoice).toBe(true)
    expect(media.isPremiumOnly).toBe(true)
    expect(media.videoTimestamp).toBe(12)
    // Nothing in the attributes says video, so the derived answer differs.
    expect(media.kind).toBe('document')
  })

  it('reads the other qualities a video is available in', () => {
    const alternate = {
      _: 'document' as const,
      id: 11n,
      access_hash: 21n,
      file_reference: new Uint8Array([2]),
      date: 1_700_000_000,
      mime_type: 'video/mp4',
      size: 1024n,
      dc_id: 2,
      attributes: [],
    }
    const media = new MediaView({ ...documentWith([]), alt_documents: [alternate] })

    expect(media.alternateDocuments).toEqual([alternate])
    expect(new MediaView(documentWith([])).alternateDocuments).toBeUndefined()
  })

  it('reads how close a live location notifies from', () => {
    const media = new MediaView({
      _: 'messageMediaGeoLive',
      geo: { _: 'geoPointEmpty' },
      period: 900,
      proximity_notification_radius: 500,
    })

    expect(media.proximityRadius).toBe(500)
  })

  it('reads what kind of place a venue is', () => {
    const media = new MediaView({
      _: 'messageMediaVenue',
      geo: { _: 'geoPointEmpty' },
      title: 'Place',
      address: '1 Street',
      provider: 'foursquare',
      venue_id: 'v1',
      venue_type: 'cafe',
    })

    expect(media.venueType).toBe('cafe')
  })

  it('reads an invoice down to what it is asking for', () => {
    const media = new MediaView({
      _: 'messageMediaInvoice',
      title: 'Thing',
      description: 'A thing',
      currency: 'USD',
      total_amount: 999n,
      start_param: 'buy-thing',
      test: true,
      shipping_address_requested: true,
      receipt_msg_id: 77,
    })

    expect(media.kind).toBe('invoice')
    expect(media.title).toBe('Thing')
    expect(media.description).toBe('A thing')
    expect(media.currency).toBe('USD')
    expect(media.amount).toBe(999n)
    expect(media.startParameter).toBe('buy-thing')
    expect(media.isTestInvoice).toBe(true)
    expect(media.needsShippingAddress).toBe(true)
    expect(media.receiptMessageId).toBe(77)
  })

  it('reads media behind a paywall from either place it can arrive', () => {
    // Paid media carries several; an invoice carries one. Both answer the same
    // question, so both come back as a list.
    const preview = { _: 'messageExtendedMediaPreview' as const }
    const paid = new MediaView({
      _: 'messageMediaPaidMedia',
      stars_amount: 50n,
      extended_media: [preview],
    })
    const invoice = new MediaView({
      _: 'messageMediaInvoice',
      title: 'T',
      description: 'D',
      currency: 'USD',
      total_amount: 1n,
      start_param: '',
      extended_media: preview,
    })

    expect(paid.extendedMedia).toEqual([preview])
    expect(invoice.extendedMedia).toEqual([preview])
    expect(new MediaView({ _: 'messageMediaEmpty' }).extendedMedia).toBeUndefined()
  })

  it('reads a story it points at, and one it carries', () => {
    const pointing = new MediaView({
      _: 'messageMediaStory',
      peer: { _: 'peerUser', user_id: 9n },
      id: 3,
      via_mention: true,
    })

    expect(pointing.kind).toBe('story')
    expect(pointing.storyPeer).toEqual({ kind: 'user', id: 9n })
    expect(pointing.storyId).toBe(3)
    expect(pointing.storyViaMention).toBe(true)
    expect(pointing.story).toBeUndefined()
  })

  it('reads how a link preview was asked to be shown', () => {
    const media = new MediaView({
      _: 'messageMediaWebPage',
      webpage: { _: 'webPageEmpty', id: 4n },
      force_large_media: true,
      safe: true,
    })

    expect(media.kind).toBe('webpage')
    expect(media.webpagePreview).toEqual({ large: true, small: false, manual: false, safe: true })

    // And each flag answers no on its own rather than inheriting a yes.
    const plain = new MediaView({
      _: 'messageMediaWebPage',
      webpage: { _: 'webPageEmpty', id: 4n },
      force_small_media: true,
      manual: true,
    })

    expect(plain.webpagePreview).toEqual({ large: false, small: true, manual: true, safe: false })
    expect(new MediaView({ _: 'messageMediaEmpty' }).webpagePreview).toBeUndefined()
  })

  it('reads a prize draw and its results', () => {
    const draw = new MediaView({
      _: 'messageMediaGiveaway',
      channels: [55n],
      quantity: 5,
      until_date: 1_700_100_000,
      only_new_subscribers: true,
      months: 3,
    })
    const results = new MediaView({
      _: 'messageMediaGiveawayResults',
      channel_id: 55n,
      launch_msg_id: 12,
      winners: [7n, 8n],
      winners_count: 2,
      unclaimed_count: 0,
      until_date: 1_700_100_000,
      refunded: true,
    })

    expect(draw.kind).toBe('giveaway')
    expect(draw.giveaway).toMatchObject({ channels: [55n], quantity: 5, onlyNewSubscribers: true })
    expect(results.kind).toBe('giveaway-results')
    expect(results.giveawayResults).toMatchObject({ winnersCount: 2, refunded: true })
    expect(draw.giveawayResults).toBeUndefined()
    expect(results.giveaway).toBeUndefined()
  })

  it('reads a list of things to do, and what has been done', () => {
    const list = {
      _: 'todoList' as const,
      title: { _: 'textWithEntities' as const, text: 'T', entities: [] },
      list: [],
    }
    const media = new MediaView({ _: 'messageMediaToDo', todo: list, completions: [] })

    expect(media.kind).toBe('todo')
    expect(media.todo).toBe(list)
    expect(media.todoCompletions).toEqual([])
  })

  it('reads a live stream and how it is being sent', () => {
    const call = { _: 'inputGroupCall' as const, id: 1n, access_hash: 2n }
    const media = new MediaView({ _: 'messageMediaVideoStream', call, rtmp_stream: true })

    expect(media.kind).toBe('stream')
    expect(media.streamCall).toBe(call)
    expect(media.isRtmpStream).toBe(true)
  })
})

describe('the structures a message can carry, read', () => {
  const text = (value: string) => ({ _: 'textWithEntities' as const, text: value, entities: [] })

  it('joins a poll’s tally to its answers, and says whether it is complete', () => {
    const poll = {
      _: 'poll' as const,
      id: 1n,
      quiz: true as const,
      question: text('Capital?'),
      answers: [
        { _: 'pollAnswer' as const, text: text('Oslo'), option: Uint8Array.of(0) },
        {
          _: 'pollAnswer' as const,
          text: text('Bergen'),
          option: Uint8Array.of(1),
          added_by: { _: 'peerUser' as const, user_id: 7n },
          date: 5,
        },
      ],
      close_date: 99,
      hash: 0n,
    }
    const full = new MediaView({
      _: 'messageMediaPoll',
      poll,
      results: {
        _: 'pollResults',
        results: [
          { _: 'pollAnswerVoters', option: Uint8Array.of(1), voters: 3 },
          {
            _: 'pollAnswerVoters',
            option: Uint8Array.of(0),
            voters: 5,
            chosen: true,
            correct: true,
          },
        ],
        total_voters: 8,
        recent_voters: [{ _: 'peerUser', user_id: 9n }],
        solution: 'It is Oslo',
      },
    }).pollDetails

    expect(full).toMatchObject({
      id: 1n,
      question: { text: 'Capital?' },
      isQuiz: true,
      isClosed: false,
      closeDate: 99,
      totalVoters: 8,
      recentVoters: [{ kind: 'user', id: 9n }],
      solution: { text: 'It is Oslo', entities: [] },
      partialResults: false,
      voted: true,
    })
    expect(full?.answers).toMatchObject([
      { text: { text: 'Oslo' }, voters: 5, chosen: true, correct: true, addedBy: undefined },
      { text: { text: 'Bergen' }, voters: 3, chosen: false, addedBy: { kind: 'user', id: 7n } },
    ])

    // Right after a vote Telegram sends only which answers were chosen.
    const short = new MediaView({
      _: 'messageMediaPoll',
      poll,
      results: { _: 'pollResults', min: true },
    }).pollDetails
    expect(short).toMatchObject({ partialResults: true, voted: false, totalVoters: undefined })
    expect(short?.answers.map((answer) => answer.voters)).toEqual([undefined, undefined])
  })

  it('joins a checklist’s completions to its tasks', () => {
    const details = new MediaView({
      _: 'messageMediaToDo',
      todo: {
        _: 'todoList',
        others_can_complete: true,
        title: text('Trip'),
        list: [
          { _: 'todoItem', id: 1, title: text('Tickets') },
          { _: 'todoItem', id: 2, title: text('Hotel') },
        ],
      },
      completions: [
        { _: 'todoCompletion', id: 2, completed_by: { _: 'peerUser', user_id: 4n }, date: 10 },
      ],
    }).todoDetails

    expect(details).toMatchObject({
      title: { text: 'Trip' },
      othersCanComplete: true,
      othersCanAppend: false,
      completed: 1,
      items: [
        { id: 1, title: { text: 'Tickets' }, completedBy: undefined, completedAt: undefined },
        { id: 2, completedBy: { kind: 'user', id: 4n }, completedAt: 10 },
      ],
    })
  })

  it('reads a built link preview, and nothing from one still being built', () => {
    const built = new MediaView({
      _: 'messageMediaWebPage',
      webpage: {
        _: 'webPage',
        id: 3n,
        url: 'https://example.com/a',
        display_url: 'example.com/a',
        hash: 0,
        type: 'video',
        site_name: 'Example',
        title: 'A',
        embed_url: 'https://example.com/embed',
        embed_width: 640,
        duration: 30,
        attributes: [
          { _: 'webPageAttributeStory', peer: { _: 'peerChannel', channel_id: 6n }, id: 2 },
        ],
      },
    }).webpageDetails
    const pending = new MediaView({
      _: 'messageMediaWebPage',
      webpage: { _: 'webPagePending', id: 3n, date: 1 },
    })

    expect(built).toMatchObject({
      url: 'https://example.com/a',
      displayUrl: 'example.com/a',
      type: 'video',
      siteName: 'Example',
      duration: 30,
      embed: { url: 'https://example.com/embed', width: 640, height: undefined },
      hasInstantView: false,
      story: { peer: { kind: 'channel', id: 6n }, id: 2 },
    })
    expect(pending.webpageDetails).toBeUndefined()
  })

  it('reads what makes a sticker a sticker, a mask or a custom emoji', () => {
    const set = { _: 'inputStickerSetID' as const, id: 1n, access_hash: 2n }
    const withMime = (
      mime: string,
      attributes: readonly TypeDocumentAttribute[],
      extra: Record<string, unknown> = {},
    ) => {
      const media = documentWith(attributes)
      return new MediaView({
        ...media,
        document: { ...(media.document as object), mime_type: mime, ...extra } as never,
      })
    }

    expect(
      withMime('image/webp', [
        {
          _: 'documentAttributeSticker',
          mask: true,
          alt: '😀',
          stickerset: set,
          mask_coords: { _: 'maskCoords', n: 2, x: 0.5, y: -1, zoom: 1.5 },
        },
      ]).stickerDetails,
    ).toEqual({
      emoji: '😀',
      type: 'mask',
      format: 'static',
      set,
      customEmojiId: undefined,
      isFree: false,
      takesTextColor: false,
      isPremium: false,
      mask: { point: 'mouth', x: 0.5, y: -1, zoom: 1.5 },
    })
    expect(
      withMime('application/x-tgsticker', [
        {
          _: 'documentAttributeCustomEmoji',
          free: true,
          text_color: true,
          alt: '⭐',
          stickerset: set,
        },
      ]).stickerDetails,
    ).toMatchObject({
      type: 'custom-emoji',
      format: 'animated',
      customEmojiId: 10n,
      isFree: true,
      takesTextColor: true,
    })
    expect(
      withMime('video/webm', [{ _: 'documentAttributeSticker', alt: '🎉', stickerset: set }], {
        video_thumbs: [{ _: 'videoSize', type: 'f', w: 1, h: 1, size: 1 }],
      }).stickerDetails,
    ).toMatchObject({ type: 'regular', format: 'video', isPremium: true })
    expect(new MediaView(documentWith([])).stickerDetails).toBeUndefined()
  })

  it('reads a point, a video’s codec and its preview frame, and a game', () => {
    expect(
      new MediaView({
        _: 'messageMediaGeo',
        geo: { _: 'geoPoint', lat: 59.9, long: 10.7, access_hash: 1n, accuracy_radius: 20 },
      }).location,
    ).toEqual({ latitude: 59.9, longitude: 10.7, accuracyRadius: 20 })
    expect(
      new MediaView({ _: 'messageMediaGeo', geo: { _: 'geoPointEmpty' } }).location,
    ).toBeUndefined()

    const video = new MediaView(
      documentWith([
        {
          _: 'documentAttributeVideo',
          duration: 3,
          w: 1,
          h: 1,
          nosound: true,
          video_codec: 'av01',
          video_start_ts: 1.5,
          preload_prefix_size: 1024,
        },
      ]),
    )
    expect([
      video.videoCodec,
      video.videoStartTimestamp,
      video.isSilentVideo,
      video.preloadPrefixSize,
    ]).toEqual(['av01', 1.5, true, 1024])

    const photo = { _: 'photoEmpty' as const, id: 1n }
    expect(
      new MediaView({
        _: 'messageMediaGame',
        game: {
          _: 'game',
          id: 1n,
          access_hash: 2n,
          short_name: 'snake',
          title: 'Snake',
          description: 'Eat',
          photo,
        },
      }).gameDetails,
    ).toEqual({
      id: 1n,
      accessHash: 2n,
      shortName: 'snake',
      title: 'Snake',
      description: 'Eat',
      photo,
      animation: undefined,
    })
  })
})
