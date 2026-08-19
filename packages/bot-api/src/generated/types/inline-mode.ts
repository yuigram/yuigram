// GENERATED FILE — do not edit.
// Bot API types: Inline mode
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { InlineKeyboardMarkup, LinkPreviewOptions, Location, MessageEntity, User, WebAppInfo } from './available-types.js'
import type { LabeledPrice } from './payments.js'
import type { InputRichMessage } from './rich-messages.js'

/**
 * This object represents an incoming inline query. When the user sends an
 * empty query, your bot could return some default or trending results.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequery
 */
export interface InlineQuery {
  /**
   * Unique identifier for this query
   */
  readonly id: string

  /**
   * Sender
   */
  readonly from: User

  /**
   * Text of the query (up to 256 characters)
   */
  readonly query: string

  /**
   * Offset of the results to be returned, can be controlled by the bot
   */
  readonly offset: string

  /**
   * Type of the chat from which the inline query was sent. Can be either
   * “sender” for a private chat with the inline query sender, “private”,
   * “group”, “supergroup”, or “channel”. The chat type should be always known
   * for requests sent from official clients and most third-party clients, unless
   * the request was sent from a secret chat.
   */
  readonly chat_type?: string | undefined

  /**
   * Sender location, only for bots that request user location
   */
  readonly location?: Location | undefined
}

/**
 * This object represents a button to be shown above inline query results. You
 * must use exactly one of the optional fields.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultsbutton
 */
export interface InlineQueryResultsButton {
  /**
   * Label text on the button
   */
  readonly text: string

  /**
   * Description of the Web App that will be launched when the user presses the
   * button. The Web App will be able to switch back to the inline mode using the
   * method switchInlineQuery inside the Web App.
   */
  readonly web_app?: WebAppInfo | undefined

  /**
   * Deep-linking parameter for the /start message sent to the bot when a user
   * presses the button. 1-64 characters, only A-Z, a-z, 0-9, _ and - are
   * allowed. Example: An inline bot that sends YouTube videos can ask the user
   * to connect the bot to their YouTube account to adapt search results
   * accordingly. To do this, it displays a 'Connect your YouTube account' button
   * above the results, or even before showing any. The user presses the button,
   * switches to a private chat with the bot and, in doing so, passes a start
   * parameter that instructs the bot to return an OAuth link. Once done, the bot
   * can offer a switch_inline button so that the user can easily return to the
   * chat where they wanted to use the bot's inline capabilities.
   */
  readonly start_parameter?: string | undefined
}

/**
 * This object represents one result of an inline query. Telegram clients
 * currently support results of the following 20 types: Note: All URLs passed
 * in inline query results will be available to end users and therefore must be
 * assumed to be public.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresult
 */
export type InlineQueryResult =
  | InlineQueryResultArticle
  | InlineQueryResultAudio
  | InlineQueryResultCachedAudio
  | InlineQueryResultCachedDocument
  | InlineQueryResultCachedGif
  | InlineQueryResultCachedMpeg4Gif
  | InlineQueryResultCachedPhoto
  | InlineQueryResultCachedSticker
  | InlineQueryResultCachedVideo
  | InlineQueryResultCachedVoice
  | InlineQueryResultContact
  | InlineQueryResultDocument
  | InlineQueryResultGame
  | InlineQueryResultGif
  | InlineQueryResultLocation
  | InlineQueryResultMpeg4Gif
  | InlineQueryResultPhoto
  | InlineQueryResultVenue
  | InlineQueryResultVideo
  | InlineQueryResultVoice

/**
 * Represents a link to an article or web page.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultarticle
 */
export interface InlineQueryResultArticle {
  /**
   * Type of the result, must be article
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 Bytes
   */
  readonly id: string

  /**
   * Title of the result
   */
  readonly title: string

  /**
   * Content of the message to be sent
   */
  readonly input_message_content: InputMessageContent

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * URL of the result
   */
  readonly url?: string | undefined

  /**
   * Short description of the result
   */
  readonly description?: string | undefined

  /**
   * Url of the thumbnail for the result
   */
  readonly thumbnail_url?: string | undefined

  /**
   * Thumbnail width
   */
  readonly thumbnail_width?: number | undefined

  /**
   * Thumbnail height
   */
  readonly thumbnail_height?: number | undefined
}

/**
 * Represents a link to a photo. By default, this photo will be sent by the
 * user with optional caption. Alternatively, you can use input_message_content
 * to send a message with the specified content instead of the photo.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultphoto
 */
export interface InlineQueryResultPhoto {
  /**
   * Type of the result, must be photo
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid URL of the photo. Photo must be in JPEG format. Photo size must not
   * exceed 5MB.
   */
  readonly photo_url: string

  /**
   * URL of the thumbnail for the photo
   */
  readonly thumbnail_url: string

  /**
   * Width of the photo
   */
  readonly photo_width?: number | undefined

  /**
   * Height of the photo
   */
  readonly photo_height?: number | undefined

  /**
   * Title for the result
   */
  readonly title?: string | undefined

  /**
   * Short description of the result
   */
  readonly description?: string | undefined

  /**
   * Caption of the photo to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the photo caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the photo
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to an animated GIF file. By default, this animated GIF
 * file will be sent by the user with optional caption. Alternatively, you can
 * use input_message_content to send a message with the specified content
 * instead of the animation.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultgif
 */
export interface InlineQueryResultGif {
  /**
   * Type of the result, must be gif
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid URL for the GIF file
   */
  readonly gif_url: string

  /**
   * Width of the GIF
   */
  readonly gif_width?: number | undefined

  /**
   * Height of the GIF
   */
  readonly gif_height?: number | undefined

  /**
   * Duration of the GIF in seconds
   */
  readonly gif_duration?: number | undefined

  /**
   * URL of the static (JPEG or GIF) or animated (MPEG4) thumbnail for the result
   */
  readonly thumbnail_url: string

  /**
   * MIME type of the thumbnail, must be one of “image/jpeg”, “image/gif”, or
   * “video/mp4”. Defaults to “image/jpeg”.
   */
  readonly thumbnail_mime_type?: string | undefined

  /**
   * Title for the result
   */
  readonly title?: string | undefined

  /**
   * Caption of the GIF file to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the caption. See formatting options for more
   * details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the GIF animation
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a video animation (H.264/MPEG-4 AVC video without
 * sound). By default, this animated MPEG-4 file will be sent by the user with
 * optional caption. Alternatively, you can use input_message_content to send a
 * message with the specified content instead of the animation.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultmpeg4gif
 */
export interface InlineQueryResultMpeg4Gif {
  /**
   * Type of the result, must be mpeg4_gif
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid URL for the MPEG4 file
   */
  readonly mpeg4_url: string

  /**
   * Video width
   */
  readonly mpeg4_width?: number | undefined

  /**
   * Video height
   */
  readonly mpeg4_height?: number | undefined

  /**
   * Video duration in seconds
   */
  readonly mpeg4_duration?: number | undefined

  /**
   * URL of the static (JPEG or GIF) or animated (MPEG4) thumbnail for the result
   */
  readonly thumbnail_url: string

  /**
   * MIME type of the thumbnail, must be one of “image/jpeg”, “image/gif”, or
   * “video/mp4”. Defaults to “image/jpeg”.
   */
  readonly thumbnail_mime_type?: string | undefined

  /**
   * Title for the result
   */
  readonly title?: string | undefined

  /**
   * Caption of the MPEG-4 file to be sent, 0-1024 characters after entities
   * parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the caption. See formatting options for more
   * details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the video animation
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a page containing an embedded video player or a video
 * file. By default, this video file will be sent by the user with an optional
 * caption. Alternatively, you can use input_message_content to send a message
 * with the specified content instead of the video. If an
 * InlineQueryResultVideo message contains an embedded video (e.g., YouTube),
 * you must replace its content using input_message_content.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultvideo
 */
export interface InlineQueryResultVideo {
  /**
   * Type of the result, must be video
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid URL for the embedded video player or video file
   */
  readonly video_url: string

  /**
   * MIME type of the content of the video URL, “text/html” or “video/mp4”
   */
  readonly mime_type: string

  /**
   * URL of the thumbnail (JPEG only) for the video
   */
  readonly thumbnail_url: string

  /**
   * Title for the result
   */
  readonly title: string

  /**
   * Caption of the video to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the video caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Video width
   */
  readonly video_width?: number | undefined

  /**
   * Video height
   */
  readonly video_height?: number | undefined

  /**
   * Video duration in seconds
   */
  readonly video_duration?: number | undefined

  /**
   * Short description of the result
   */
  readonly description?: string | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the video. This field is
   * required if InlineQueryResultVideo is used to send an HTML-page as a result
   * (e.g., a YouTube video).
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to an MP3 audio file. By default, this audio file will be
 * sent by the user. Alternatively, you can use input_message_content to send a
 * message with the specified content instead of the audio.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultaudio
 */
export interface InlineQueryResultAudio {
  /**
   * Type of the result, must be audio
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid URL for the audio file
   */
  readonly audio_url: string

  /**
   * Title
   */
  readonly title: string

  /**
   * Caption, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the audio caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Performer
   */
  readonly performer?: string | undefined

  /**
   * Audio duration in seconds
   */
  readonly audio_duration?: number | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the audio
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a voice recording in an .OGG container encoded with
 * OPUS. By default, this voice recording will be sent by the user.
 * Alternatively, you can use input_message_content to send a message with the
 * specified content instead of the the voice message.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultvoice
 */
export interface InlineQueryResultVoice {
  /**
   * Type of the result, must be voice
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid URL for the voice recording
   */
  readonly voice_url: string

  /**
   * Recording title
   */
  readonly title: string

  /**
   * Caption, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the voice message caption. See formatting
   * options for more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Recording duration in seconds
   */
  readonly voice_duration?: number | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the voice recording
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a file. By default, this file will be sent by the user
 * with an optional caption. Alternatively, you can use input_message_content
 * to send a message with the specified content instead of the file. Currently,
 * only .PDF and .ZIP files can be sent using this method.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultdocument
 */
export interface InlineQueryResultDocument {
  /**
   * Type of the result, must be document
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * Title for the result
   */
  readonly title: string

  /**
   * Caption of the document to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the document caption. See formatting options
   * for more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * A valid URL for the file
   */
  readonly document_url: string

  /**
   * MIME type of the content of the file, either “application/pdf” or
   * “application/zip”
   */
  readonly mime_type: string

  /**
   * Short description of the result
   */
  readonly description?: string | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the file
   */
  readonly input_message_content?: InputMessageContent | undefined

  /**
   * URL of the thumbnail (JPEG only) for the file
   */
  readonly thumbnail_url?: string | undefined

  /**
   * Thumbnail width
   */
  readonly thumbnail_width?: number | undefined

  /**
   * Thumbnail height
   */
  readonly thumbnail_height?: number | undefined
}

/**
 * Represents a location on a map. By default, the location will be sent by the
 * user. Alternatively, you can use input_message_content to send a message
 * with the specified content instead of the location.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultlocation
 */
export interface InlineQueryResultLocation {
  /**
   * Type of the result, must be location
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 Bytes
   */
  readonly id: string

  /**
   * Location latitude in degrees
   */
  readonly latitude: number

  /**
   * Location longitude in degrees
   */
  readonly longitude: number

  /**
   * Location title
   */
  readonly title: string

  /**
   * The radius of uncertainty for the location, measured in meters; 0-1500
   */
  readonly horizontal_accuracy?: number | undefined

  /**
   * Period in seconds during which the location can be updated, must be between
   * 60 and 86400, or 0x7FFFFFFF for live locations that can be edited
   * indefinitely
   */
  readonly live_period?: number | undefined

  /**
   * For live locations, a direction in which the user is moving, in degrees.
   * Must be between 1 and 360 if specified.
   */
  readonly heading?: number | undefined

  /**
   * For live locations, a maximum distance for proximity alerts about
   * approaching another chat member, in meters. Must be between 1 and 100000 if
   * specified.
   */
  readonly proximity_alert_radius?: number | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the location
   */
  readonly input_message_content?: InputMessageContent | undefined

  /**
   * Url of the thumbnail for the result
   */
  readonly thumbnail_url?: string | undefined

  /**
   * Thumbnail width
   */
  readonly thumbnail_width?: number | undefined

  /**
   * Thumbnail height
   */
  readonly thumbnail_height?: number | undefined
}

/**
 * Represents a venue. By default, the venue will be sent by the user.
 * Alternatively, you can use input_message_content to send a message with the
 * specified content instead of the venue.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultvenue
 */
export interface InlineQueryResultVenue {
  /**
   * Type of the result, must be venue
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 Bytes
   */
  readonly id: string

  /**
   * Latitude of the venue location in degrees
   */
  readonly latitude: number

  /**
   * Longitude of the venue location in degrees
   */
  readonly longitude: number

  /**
   * Title of the venue
   */
  readonly title: string

  /**
   * Address of the venue
   */
  readonly address: string

  /**
   * Foursquare identifier of the venue if known
   */
  readonly foursquare_id?: string | undefined

  /**
   * Foursquare type of the venue, if known. (For example,
   * “arts_entertainment/default”, “arts_entertainment/aquarium” or
   * “food/icecream”.)
   */
  readonly foursquare_type?: string | undefined

  /**
   * Google Places identifier of the venue
   */
  readonly google_place_id?: string | undefined

  /**
   * Google Places type of the venue. (See supported types.)
   */
  readonly google_place_type?: string | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the venue
   */
  readonly input_message_content?: InputMessageContent | undefined

  /**
   * Url of the thumbnail for the result
   */
  readonly thumbnail_url?: string | undefined

  /**
   * Thumbnail width
   */
  readonly thumbnail_width?: number | undefined

  /**
   * Thumbnail height
   */
  readonly thumbnail_height?: number | undefined
}

/**
 * Represents a contact with a phone number. By default, this contact will be
 * sent by the user. Alternatively, you can use input_message_content to send a
 * message with the specified content instead of the contact.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcontact
 */
export interface InlineQueryResultContact {
  /**
   * Type of the result, must be contact
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 Bytes
   */
  readonly id: string

  /**
   * Contact's phone number
   */
  readonly phone_number: string

  /**
   * Contact's first name
   */
  readonly first_name: string

  /**
   * Contact's last name
   */
  readonly last_name?: string | undefined

  /**
   * Additional data about the contact in the form of a vCard, 0-2048 bytes
   */
  readonly vcard?: string | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the contact
   */
  readonly input_message_content?: InputMessageContent | undefined

  /**
   * Url of the thumbnail for the result
   */
  readonly thumbnail_url?: string | undefined

  /**
   * Thumbnail width
   */
  readonly thumbnail_width?: number | undefined

  /**
   * Thumbnail height
   */
  readonly thumbnail_height?: number | undefined
}

/**
 * Represents a Game.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultgame
 */
export interface InlineQueryResultGame {
  /**
   * Type of the result, must be game
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * Short name of the game
   */
  readonly game_short_name: string

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined
}

/**
 * Represents a link to a photo stored on the Telegram servers. By default,
 * this photo will be sent by the user with an optional caption. Alternatively,
 * you can use input_message_content to send a message with the specified
 * content instead of the photo.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcachedphoto
 */
export interface InlineQueryResultCachedPhoto {
  /**
   * Type of the result, must be photo
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid file identifier of the photo
   */
  readonly photo_file_id: string

  /**
   * Title for the result
   */
  readonly title?: string | undefined

  /**
   * Short description of the result
   */
  readonly description?: string | undefined

  /**
   * Caption of the photo to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the photo caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the photo
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to an animated GIF file stored on the Telegram servers. By
 * default, this animated GIF file will be sent by the user with an optional
 * caption. Alternatively, you can use input_message_content to send a message
 * with specified content instead of the animation.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcachedgif
 */
export interface InlineQueryResultCachedGif {
  /**
   * Type of the result, must be gif
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid file identifier for the GIF file
   */
  readonly gif_file_id: string

  /**
   * Title for the result
   */
  readonly title?: string | undefined

  /**
   * Caption of the GIF file to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the caption. See formatting options for more
   * details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the GIF animation
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a video animation (H.264/MPEG-4 AVC video without
 * sound) stored on the Telegram servers. By default, this animated MPEG-4 file
 * will be sent by the user with an optional caption. Alternatively, you can
 * use input_message_content to send a message with the specified content
 * instead of the animation.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcachedmpeg4gif
 */
export interface InlineQueryResultCachedMpeg4Gif {
  /**
   * Type of the result, must be mpeg4_gif
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid file identifier for the MPEG4 file
   */
  readonly mpeg4_file_id: string

  /**
   * Title for the result
   */
  readonly title?: string | undefined

  /**
   * Caption of the MPEG-4 file to be sent, 0-1024 characters after entities
   * parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the caption. See formatting options for more
   * details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the video animation
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a sticker stored on the Telegram servers. By default,
 * this sticker will be sent by the user. Alternatively, you can use
 * input_message_content to send a message with the specified content instead
 * of the sticker.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcachedsticker
 */
export interface InlineQueryResultCachedSticker {
  /**
   * Type of the result, must be sticker
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid file identifier of the sticker
   */
  readonly sticker_file_id: string

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the sticker
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a file stored on the Telegram servers. By default, this
 * file will be sent by the user with an optional caption. Alternatively, you
 * can use input_message_content to send a message with the specified content
 * instead of the file.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcacheddocument
 */
export interface InlineQueryResultCachedDocument {
  /**
   * Type of the result, must be document
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * Title for the result
   */
  readonly title: string

  /**
   * A valid file identifier for the file
   */
  readonly document_file_id: string

  /**
   * Short description of the result
   */
  readonly description?: string | undefined

  /**
   * Caption of the document to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the document caption. See formatting options
   * for more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the file
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a video file stored on the Telegram servers. By
 * default, this video file will be sent by the user with an optional caption.
 * Alternatively, you can use input_message_content to send a message with the
 * specified content instead of the video.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcachedvideo
 */
export interface InlineQueryResultCachedVideo {
  /**
   * Type of the result, must be video
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid file identifier for the video file
   */
  readonly video_file_id: string

  /**
   * Title for the result
   */
  readonly title: string

  /**
   * Short description of the result
   */
  readonly description?: string | undefined

  /**
   * Caption of the video to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the video caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the video
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to a voice message stored on the Telegram servers. By
 * default, this voice message will be sent by the user. Alternatively, you can
 * use input_message_content to send a message with the specified content
 * instead of the voice message.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcachedvoice
 */
export interface InlineQueryResultCachedVoice {
  /**
   * Type of the result, must be voice
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid file identifier for the voice message
   */
  readonly voice_file_id: string

  /**
   * Voice message title
   */
  readonly title: string

  /**
   * Caption, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the voice message caption. See formatting
   * options for more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the voice message
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * Represents a link to an MP3 audio file stored on the Telegram servers. By
 * default, this audio file will be sent by the user. Alternatively, you can
 * use input_message_content to send a message with the specified content
 * instead of the audio.
 *
 * @see https://corefork.telegram.org/bots/api#inlinequeryresultcachedaudio
 */
export interface InlineQueryResultCachedAudio {
  /**
   * Type of the result, must be audio
   */
  readonly type: string

  /**
   * Unique identifier for this result, 1-64 bytes
   */
  readonly id: string

  /**
   * A valid file identifier for the audio file
   */
  readonly audio_file_id: string

  /**
   * Caption, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the audio caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Inline keyboard attached to the message
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined

  /**
   * Content of the message to be sent instead of the audio
   */
  readonly input_message_content?: InputMessageContent | undefined
}

/**
 * This object represents the content of a message to be sent as a result of an
 * inline query. Telegram clients currently support the following types:
 *
 * @see https://corefork.telegram.org/bots/api#inputmessagecontent
 */
export type InputMessageContent =
  | InputContactMessageContent
  | InputInvoiceMessageContent
  | InputLocationMessageContent
  | InputRichMessageContent
  | InputTextMessageContent
  | InputVenueMessageContent

/**
 * Represents the content of a text message to be sent as the result of an
 * inline query.
 *
 * @see https://corefork.telegram.org/bots/api#inputtextmessagecontent
 */
export interface InputTextMessageContent {
  /**
   * Text of the message to be sent, 1-4096 characters
   */
  readonly message_text: string

  /**
   * Mode for parsing entities in the message text. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in message text, which can be specified
   * instead of parse_mode
   */
  readonly entities?: MessageEntity[] | undefined

  /**
   * Link preview generation options for the message
   */
  readonly link_preview_options?: LinkPreviewOptions | undefined
}

/**
 * Represents the content of a rich message to be sent as the result of an
 * inline query.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichmessagecontent
 */
export interface InputRichMessageContent {
  /**
   * The message to be sent
   */
  readonly rich_message: InputRichMessage
}

/**
 * Represents the content of a location message to be sent as the result of an
 * inline query.
 *
 * @see https://corefork.telegram.org/bots/api#inputlocationmessagecontent
 */
export interface InputLocationMessageContent {
  /**
   * Latitude of the location in degrees
   */
  readonly latitude: number

  /**
   * Longitude of the location in degrees
   */
  readonly longitude: number

  /**
   * The radius of uncertainty for the location, measured in meters; 0-1500
   */
  readonly horizontal_accuracy?: number | undefined

  /**
   * Period in seconds during which the location can be updated, must be between
   * 60 and 86400, or 0x7FFFFFFF for live locations that can be edited
   * indefinitely
   */
  readonly live_period?: number | undefined

  /**
   * For live locations, a direction in which the user is moving, in degrees.
   * Must be between 1 and 360 if specified.
   */
  readonly heading?: number | undefined

  /**
   * For live locations, a maximum distance for proximity alerts about
   * approaching another chat member, in meters. Must be between 1 and 100000 if
   * specified.
   */
  readonly proximity_alert_radius?: number | undefined
}

/**
 * Represents the content of a venue message to be sent as the result of an
 * inline query.
 *
 * @see https://corefork.telegram.org/bots/api#inputvenuemessagecontent
 */
export interface InputVenueMessageContent {
  /**
   * Latitude of the venue in degrees
   */
  readonly latitude: number

  /**
   * Longitude of the venue in degrees
   */
  readonly longitude: number

  /**
   * Name of the venue
   */
  readonly title: string

  /**
   * Address of the venue
   */
  readonly address: string

  /**
   * Foursquare identifier of the venue, if known
   */
  readonly foursquare_id?: string | undefined

  /**
   * Foursquare type of the venue, if known. (For example,
   * “arts_entertainment/default”, “arts_entertainment/aquarium” or
   * “food/icecream”.)
   */
  readonly foursquare_type?: string | undefined

  /**
   * Google Places identifier of the venue
   */
  readonly google_place_id?: string | undefined

  /**
   * Google Places type of the venue. (See supported types.)
   */
  readonly google_place_type?: string | undefined
}

/**
 * Represents the content of a contact message to be sent as the result of an
 * inline query.
 *
 * @see https://corefork.telegram.org/bots/api#inputcontactmessagecontent
 */
export interface InputContactMessageContent {
  /**
   * Contact's phone number
   */
  readonly phone_number: string

  /**
   * Contact's first name
   */
  readonly first_name: string

  /**
   * Contact's last name
   */
  readonly last_name?: string | undefined

  /**
   * Additional data about the contact in the form of a vCard, 0-2048 bytes
   */
  readonly vcard?: string | undefined
}

/**
 * Represents the content of an invoice message to be sent as the result of an
 * inline query.
 *
 * @see https://corefork.telegram.org/bots/api#inputinvoicemessagecontent
 */
export interface InputInvoiceMessageContent {
  /**
   * Product name, 1-32 characters
   */
  readonly title: string

  /**
   * Product description, 1-255 characters
   */
  readonly description: string

  /**
   * Bot-defined invoice payload, 1-128 bytes. This will not be displayed to the
   * user, use it for your internal processes.
   */
  readonly payload: string

  /**
   * Payment provider token, obtained via @BotFather. Pass an empty string for
   * payments in Telegram Stars.
   */
  readonly provider_token?: string | undefined

  /**
   * Three-letter ISO 4217 currency code, see more on currencies. Pass “XTR” for
   * payments in Telegram Stars.
   */
  readonly currency: string

  /**
   * Price breakdown, a JSON-serialized list of components (e.g. product price,
   * tax, discount, delivery cost, delivery tax, bonus, etc.). Must contain
   * exactly one item for payments in Telegram Stars.
   */
  readonly prices: LabeledPrice[]

  /**
   * The maximum accepted amount for tips in the smallest units of the currency
   * (integer, not float/double). For example, for a maximum tip of US$ 1.45 pass
   * max_tip_amount = 145. See the exp parameter in currencies.json, it shows the
   * number of digits past the decimal point for each currency (2 for the
   * majority of currencies). Defaults to 0. Not supported for payments in
   * Telegram Stars.
   */
  readonly max_tip_amount?: number | undefined

  /**
   * A JSON-serialized Array of suggested amounts of tip in the smallest units of
   * the currency (integer, not float/double). At most 4 suggested tip amounts
   * can be specified. The suggested tip amounts must be positive, passed in a
   * strictly increased order and must not exceed max_tip_amount.
   */
  readonly suggested_tip_amounts?: number[] | undefined

  /**
   * A JSON-serialized object for data about the invoice, which will be shared
   * with the payment provider. A detailed description of the required fields
   * should be provided by the payment provider.
   */
  readonly provider_data?: string | undefined

  /**
   * URL of the product photo for the invoice. Can be a photo of the goods or a
   * marketing image for a service.
   */
  readonly photo_url?: string | undefined

  /**
   * Photo size in bytes
   */
  readonly photo_size?: number | undefined

  /**
   * Photo width
   */
  readonly photo_width?: number | undefined

  /**
   * Photo height
   */
  readonly photo_height?: number | undefined

  /**
   * Pass True if you require the user's full name to complete the order. Ignored
   * for payments in Telegram Stars.
   */
  readonly need_name?: boolean | undefined

  /**
   * Pass True if you require the user's phone number to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  readonly need_phone_number?: boolean | undefined

  /**
   * Pass True if you require the user's email address to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  readonly need_email?: boolean | undefined

  /**
   * Pass True if you require the user's shipping address to complete the order.
   * Ignored for payments in Telegram Stars.
   */
  readonly need_shipping_address?: boolean | undefined

  /**
   * Pass True if the user's phone number should be sent to the provider. Ignored
   * for payments in Telegram Stars.
   */
  readonly send_phone_number_to_provider?: boolean | undefined

  /**
   * Pass True if the user's email address should be sent to the provider.
   * Ignored for payments in Telegram Stars.
   */
  readonly send_email_to_provider?: boolean | undefined

  /**
   * Pass True if the final price depends on the shipping method. Ignored for
   * payments in Telegram Stars.
   */
  readonly is_flexible?: boolean | undefined
}

/**
 * Represents a result of an inline query that was chosen by the user and sent
 * to their chat partner.
 *
 * @see https://corefork.telegram.org/bots/api#choseninlineresult
 */
export interface ChosenInlineResult {
  /**
   * The unique identifier for the result that was chosen
   */
  readonly result_id: string

  /**
   * The user that chose the result
   */
  readonly from: User

  /**
   * Sender location, only for bots that require user location
   */
  readonly location?: Location | undefined

  /**
   * Identifier of the sent inline message. Available only if there is an inline
   * keyboard attached to the message. Will be also received in callback queries
   * and can be used to edit the message.
   */
  readonly inline_message_id?: string | undefined

  /**
   * The query that was used to obtain the result
   */
  readonly query: string
}
