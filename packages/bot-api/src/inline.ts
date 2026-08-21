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

import type {
  InlineQueryResultArticle,
  InlineQueryResultAudio,
  InlineQueryResultCachedSticker,
  InlineQueryResultContact,
  InlineQueryResultDocument,
  InlineQueryResultGif,
  InlineQueryResultLocation,
  InlineQueryResultPhoto,
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

/**
 * Every inline result builder, under one name.
 *
 * The eleven shapes a bot actually answers with. The other nine — the cached
 * variants of each media type — are one field different from their URL
 * counterparts and are written directly, since the generated types describe
 * them completely.
 */
export const inline = Object.freeze({
  article,
  photo,
  gif,
  video,
  audio,
  voice,
  document,
  location,
  venue,
  contact,
  sticker,
  id: resultId,
})
