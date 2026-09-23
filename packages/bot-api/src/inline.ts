/**
 * Answering an inline query.
 *
 * An inline result is a plain object, and the generated types describe every
 * one of the twenty shapes. What they cannot do is fill in the two fields that
 * are required, repetitive and meaningless to the caller:
 *
 * - **`type`**, which is fixed by the shape and can only be got wrong
 * - **`id`**, which Telegram requires, must be unique within the answer, and
 *   almost never means anything to the bot
 *
 * ```ts
 * bot.on('inline_query', (query) =>
 *   query.answerInlineQuery({
 *     results: [
 *       inline.article('Yuigram', { message_text: 'A Telegram framework' }),
 *       inline.photo('https://example.com/cat.jpg', { caption: 'a cat' }),
 *     ],
 *   }),
 * )
 * ```
 *
 * The builders are hand-written rather than generated because the choice of
 * which field becomes the positional argument is a judgement — a photo is
 * identified by its URL, an article by its title — and a generator has nothing
 * to derive that from.
 */

import { ValidationError } from '@yuigram/core'
import type {
  InlineQueryResultArticle,
  InlineQueryResultAudio,
  InlineQueryResultCachedAudio,
  InlineQueryResultCachedDocument,
  InlineQueryResultCachedGif,
  InlineQueryResultCachedMpeg4Gif,
  InlineQueryResultCachedPhoto,
  InlineQueryResultCachedSticker,
  InlineQueryResultCachedVideo,
  InlineQueryResultCachedVoice,
  InlineQueryResultContact,
  InlineQueryResultDocument,
  InlineQueryResultGame,
  InlineQueryResultGif,
  InlineQueryResultLocation,
  InlineQueryResultMpeg4Gif,
  InlineQueryResultPhoto,
  InlineQueryResultsButton,
  InlineQueryResultVenue,
  InlineQueryResultVideo,
  InlineQueryResultVoice,
  InputTextMessageContent,
} from './generated/types/index.js'

/** Counter behind the generated ids, so two results in one answer differ. */
let sequence = 0

/**
 * An id that is unique within this process.
 *
 * Telegram requires an id per result and rejects a duplicate, so a bot
 * building results in a loop has to invent one. The value is opaque: a bot
 * that wants a meaningful id — to recognise it in `chosen_inline_result` —
 * passes its own.
 */
export function resultId(): string {
  sequence += 1
  return `r${Date.now().toString(36)}${sequence.toString(36)}`
}

/** Fill in `type` and `id` unless the caller named them. */
function build<T>(type: string, base: object, extra: object): T {
  return { type, id: resultId(), ...base, ...extra } as T
}

/**
 * Options for a result, minus what the builder supplies.
 *
 * `Supplied` is removed — passing it again could only contradict the argument
 * it came from. `Defaulted` is made optional rather than removed: a thumbnail
 * defaulting to the media is right nearly always and wrong sometimes, and the
 * caller must be able to say so.
 */
type Extra<T, Supplied extends keyof T, Defaulted extends keyof T = never> = Omit<
  T,
  Supplied | Defaulted | 'type' | 'id'
> &
  Partial<Pick<T, Defaulted>> & {
    /** Set one to recognise this result in `chosen_inline_result`. */
    readonly id?: string
  }

/**
 * A text result.
 *
 * The second argument is the message it sends — a string for the common case,
 * or the full content object when the message needs formatting or a preview
 * setting of its own.
 */
export function article(
  title: string,
  message: string | InputTextMessageContent,
  extra: Extra<InlineQueryResultArticle, 'title' | 'input_message_content'> = {},
): InlineQueryResultArticle {
  return build(
    'article',
    {
      title,
      input_message_content: typeof message === 'string' ? { message_text: message } : message,
    },
    extra,
  )
}

/** A photo, by URL. `thumbnail_url` defaults to the photo itself. */
export function photo(
  url: string,
  extra: Extra<InlineQueryResultPhoto, 'photo_url', 'thumbnail_url'> = {},
): InlineQueryResultPhoto {
  return build('photo', { photo_url: url, thumbnail_url: url }, extra)
}

/** An animation, by URL. */
export function gif(
  url: string,
  extra: Extra<InlineQueryResultGif, 'gif_url', 'thumbnail_url'> = {},
): InlineQueryResultGif {
  return build('gif', { gif_url: url, thumbnail_url: url }, extra)
}

/**
 * A silent MPEG-4 animation, by URL. `thumbnail_url` defaults to the animation
 * itself, as it does for a GIF.
 */
export function mpeg4Gif(
  url: string,
  extra: Extra<InlineQueryResultMpeg4Gif, 'mpeg4_url', 'thumbnail_url'> = {},
): InlineQueryResultMpeg4Gif {
  return build('mpeg4_gif', { mpeg4_url: url, thumbnail_url: url }, extra)
}

/**
 * A video, by URL.
 *
 * `mime_type` and `title` are required by Telegram and have no sensible
 * default, so they stay in the options where the compiler asks for them.
 */
export function video(
  url: string,
  extra: Extra<InlineQueryResultVideo, 'video_url', 'thumbnail_url'>,
): InlineQueryResultVideo {
  return build('video', { video_url: url, thumbnail_url: url }, extra)
}

/** An audio track, by URL. */
export function audio(
  url: string,
  title: string,
  extra: Extra<InlineQueryResultAudio, 'audio_url' | 'title'> = {},
): InlineQueryResultAudio {
  return build('audio', { audio_url: url, title }, extra)
}

/** A voice recording, by URL. */
export function voice(
  url: string,
  title: string,
  extra: Extra<InlineQueryResultVoice, 'voice_url' | 'title'> = {},
): InlineQueryResultVoice {
  return build('voice', { voice_url: url, title }, extra)
}

/** A file, by URL. `mime_type` is required by Telegram. */
export function document(
  url: string,
  title: string,
  extra: Extra<InlineQueryResultDocument, 'document_url' | 'title'>,
): InlineQueryResultDocument {
  return build('document', { document_url: url, title }, extra)
}

/** A point on the map. */
export function location(
  latitude: number,
  longitude: number,
  title: string,
  extra: Extra<InlineQueryResultLocation, 'latitude' | 'longitude' | 'title'> = {},
): InlineQueryResultLocation {
  return build('location', { latitude, longitude, title }, extra)
}

/** A place. */
export function venue(
  latitude: number,
  longitude: number,
  title: string,
  address: string,
  extra: Extra<InlineQueryResultVenue, 'latitude' | 'longitude' | 'title' | 'address'> = {},
): InlineQueryResultVenue {
  return build('venue', { latitude, longitude, title, address }, extra)
}

/** A phone contact. */
export function contact(
  phoneNumber: string,
  firstName: string,
  extra: Extra<InlineQueryResultContact, 'phone_number' | 'first_name'> = {},
): InlineQueryResultContact {
  return build('contact', { phone_number: phoneNumber, first_name: firstName }, extra)
}

/** A sticker already on Telegram's servers. */
export function sticker(
  fileId: string,
  extra: Extra<InlineQueryResultCachedSticker, 'sticker_file_id'> = {},
): InlineQueryResultCachedSticker {
  return build('sticker', { sticker_file_id: fileId }, extra)
}

/** A game, by the short name it was registered under. */
export function game(
  shortName: string,
  extra: Extra<InlineQueryResultGame, 'game_short_name'> = {},
): InlineQueryResultGame {
  return build('game', { game_short_name: shortName }, extra)
}

/**
 * Results for files Telegram already holds, named by `file_id`.
 *
 * Each has the same `type` as its URL counterpart — Telegram tells the two
 * apart by which field names the file — so the builders are grouped rather
 * than suffixed. A video, a voice recording and a document need a title, which
 * is positional here as it is for their URL forms.
 */
export const cached = Object.freeze({
  photo: (
    fileId: string,
    extra: Extra<InlineQueryResultCachedPhoto, 'photo_file_id'> = {},
  ): InlineQueryResultCachedPhoto => build('photo', { photo_file_id: fileId }, extra),

  gif: (
    fileId: string,
    extra: Extra<InlineQueryResultCachedGif, 'gif_file_id'> = {},
  ): InlineQueryResultCachedGif => build('gif', { gif_file_id: fileId }, extra),

  mpeg4Gif: (
    fileId: string,
    extra: Extra<InlineQueryResultCachedMpeg4Gif, 'mpeg4_file_id'> = {},
  ): InlineQueryResultCachedMpeg4Gif => build('mpeg4_gif', { mpeg4_file_id: fileId }, extra),

  video: (
    fileId: string,
    title: string,
    extra: Extra<InlineQueryResultCachedVideo, 'video_file_id' | 'title'> = {},
  ): InlineQueryResultCachedVideo => build('video', { video_file_id: fileId, title }, extra),

  audio: (
    fileId: string,
    extra: Extra<InlineQueryResultCachedAudio, 'audio_file_id'> = {},
  ): InlineQueryResultCachedAudio => build('audio', { audio_file_id: fileId }, extra),

  voice: (
    fileId: string,
    title: string,
    extra: Extra<InlineQueryResultCachedVoice, 'voice_file_id' | 'title'> = {},
  ): InlineQueryResultCachedVoice => build('voice', { voice_file_id: fileId, title }, extra),

  document: (
    fileId: string,
    title: string,
    extra: Extra<InlineQueryResultCachedDocument, 'document_file_id' | 'title'> = {},
  ): InlineQueryResultCachedDocument =>
    build('document', { document_file_id: fileId, title }, extra),

  sticker,
})

/** What a deep-link parameter may be made of, from the Bot API's description of it. */
const START_PARAMETER = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The button shown above an answer's results.
 *
 * It either opens a Web App or sends the bot `/start` with a parameter, and
 * Telegram takes exactly one of the two, so each is its own builder.
 */
export const button = Object.freeze({
  /** Open a Web App, which can hand the user back with `switchInlineQuery`. */
  webApp: (text: string, url: string): InlineQueryResultsButton => ({
    text,
    web_app: { url },
  }),

  /** Open the chat with the bot and send `/start` with this parameter. */
  start: (text: string, parameter: string): InlineQueryResultsButton => {
    if (!START_PARAMETER.test(parameter)) {
      throw new ValidationError('a start parameter is 1 to 64 characters of A-Z, a-z, 0-9, _ and -')
    }

    return { text, start_parameter: parameter }
  },
})

/**
 * Every inline result builder, under one name.
 *
 * All twenty result shapes: twelve described or linked by URL, and under
 * `cached` the eight that name a file Telegram already holds. A sticker exists
 * only in the cached form and is also offered at the top level, where it has
 * always been. `button` builds the one control an answer carries above its
 * results.
 */
export const inline = Object.freeze({
  article,
  photo,
  gif,
  mpeg4Gif,
  video,
  audio,
  voice,
  document,
  location,
  venue,
  contact,
  sticker,
  game,
  cached,
  button,
  id: resultId,
})
