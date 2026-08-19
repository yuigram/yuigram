// GENERATED FILE — do not edit.
// Bot API types: Rich messages
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { Animation, Audio, InputMediaAnimation, InputMediaAudio, InputMediaPhoto, InputMediaVideo, InputMediaVoiceNote, Location, PhotoSize, User, Video, Voice } from './available-types.js'

/**
 * Rich formatted message.
 *
 * @see https://corefork.telegram.org/bots/api#richmessage
 */
export interface RichMessage {
  /**
   * Content of the message
   */
  readonly blocks: RichBlock[]

  /**
   * True, if the rich message must be shown right-to-left
   */
  readonly is_rtl?: boolean | undefined
}

/**
 * Describes a rich message to be sent. Exactly one of the fields html,
 * markdown, or blocks must be used.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichmessage
 */
export interface InputRichMessage {
  /**
   * Content of the rich message to send described as a list of blocks
   */
  readonly blocks?: InputRichBlock[] | undefined

  /**
   * Content of the rich message to send described using HTML formatting. See
   * rich message formatting options for more details. Use media field to specify
   * the media used in the message.
   */
  readonly html?: string | undefined

  /**
   * Content of the rich message to send described using Markdown formatting. See
   * rich message formatting options for more details. Use media field to specify
   * the media used in the message.
   */
  readonly markdown?: string | undefined

  /**
   * List of media that are specified in the markdown or html fields using
   * tg://photo?id=, tg://video?id=, and tg://audio?id= links
   */
  readonly media?: InputRichMessageMedia[] | undefined

  /**
   * Pass True if the rich message must be shown right-to-left
   */
  readonly is_rtl?: boolean | undefined

  /**
   * Pass True to skip automatic detection of entities (e.g., URLs, email
   * addresses, username mentions, hashtags, cashtags, bot commands, or phone
   * numbers) in the text
   */
  readonly skip_entity_detection?: boolean | undefined
}

/**
 * Describes a media element embedded in an outgoing rich message.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichmessagemedia
 */
export interface InputRichMessageMedia {
  /**
   * Unique identifier of the media used in a tg://photo?id=, tg://video?id=, or
   * tg://audio?id= link. 1-64 characters, only A-Z, a-z, 0-9, _ and - are
   * allowed.
   */
  readonly id: string

  /**
   * The media to be sent. Everything except the media itself and its properties
   * is ignored.
   */
  readonly media: InputMediaAnimation | InputMediaAudio | InputMediaPhoto | InputMediaVideo | InputMediaVoiceNote
}

/**
 * This object represents a rich formatted text. Currently, it can be either a
 * String for plain text, an Array of RichText, or any of the following types:
 *
 * @see https://corefork.telegram.org/bots/api#richtext
 */
export type RichText =
  | RichTextAnchor
  | RichTextAnchorLink
  | RichTextBankCardNumber
  | RichTextBold
  | RichTextBotCommand
  | RichTextCashtag
  | RichTextCode
  | RichTextCustomEmoji
  | RichTextDateTime
  | RichTextEmailAddress
  | RichTextHashtag
  | RichTextItalic
  | RichTextMarked
  | RichTextMathematicalExpression
  | RichTextMention
  | RichTextPhoneNumber
  | RichTextReference
  | RichTextReferenceLink
  | RichTextSpoiler
  | RichTextStrikethrough
  | RichTextSubscript
  | RichTextSuperscript
  | RichTextTextMention
  | RichTextUnderline
  | RichTextUrl

/**
 * A bold text.
 *
 * @see https://corefork.telegram.org/bots/api#richtextbold
 */
export interface RichTextBold {
  /**
   * Type of the rich text, always “bold”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * An italicized text.
 *
 * @see https://corefork.telegram.org/bots/api#richtextitalic
 */
export interface RichTextItalic {
  /**
   * Type of the rich text, always “italic”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * An underlined text.
 *
 * @see https://corefork.telegram.org/bots/api#richtextunderline
 */
export interface RichTextUnderline {
  /**
   * Type of the rich text, always “underline”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * A strikethrough text.
 *
 * @see https://corefork.telegram.org/bots/api#richtextstrikethrough
 */
export interface RichTextStrikethrough {
  /**
   * Type of the rich text, always “strikethrough”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * A text covered by a spoiler.
 *
 * @see https://corefork.telegram.org/bots/api#richtextspoiler
 */
export interface RichTextSpoiler {
  /**
   * Type of the rich text, always “spoiler”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * Formatted date and time.
 *
 * @see https://corefork.telegram.org/bots/api#richtextdatetime
 */
export interface RichTextDateTime {
  /**
   * Type of the rich text, always “date_time”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The Unix time associated with the entity
   */
  readonly unix_time: number

  /**
   * The string that defines the formatting of the date and time. See date-time
   * entity formatting for more details.
   */
  readonly date_time_format: string
}

/**
 * A mention of a Telegram user by their identifier.
 *
 * @see https://corefork.telegram.org/bots/api#richtexttextmention
 */
export interface RichTextTextMention {
  /**
   * Type of the rich text, always “text_mention”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The mentioned user
   */
  readonly user: User
}

/**
 * A subscript text.
 *
 * @see https://corefork.telegram.org/bots/api#richtextsubscript
 */
export interface RichTextSubscript {
  /**
   * Type of the rich text, always “subscript”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * A superscript text.
 *
 * @see https://corefork.telegram.org/bots/api#richtextsuperscript
 */
export interface RichTextSuperscript {
  /**
   * Type of the rich text, always “superscript”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * A marked text.
 *
 * @see https://corefork.telegram.org/bots/api#richtextmarked
 */
export interface RichTextMarked {
  /**
   * Type of the rich text, always “marked”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * A monowidth text.
 *
 * @see https://corefork.telegram.org/bots/api#richtextcode
 */
export interface RichTextCode {
  /**
   * Type of the rich text, always “code”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText
}

/**
 * A custom emoji.
 *
 * @see https://corefork.telegram.org/bots/api#richtextcustomemoji
 */
export interface RichTextCustomEmoji {
  /**
   * Type of the rich text, always “custom_emoji”
   */
  readonly type: string

  /**
   * Unique identifier of the custom emoji. Use getCustomEmojiStickers to get
   * full information about the sticker.
   */
  readonly custom_emoji_id: string

  /**
   * Alternative emoji for the custom emoji
   */
  readonly alternative_text: string
}

/**
 * A mathematical expression.
 *
 * @see https://corefork.telegram.org/bots/api#richtextmathematicalexpression
 */
export interface RichTextMathematicalExpression {
  /**
   * Type of the rich text, always “mathematical_expression”
   */
  readonly type: string

  /**
   * The expression in LaTeX format
   */
  readonly expression: string
}

/**
 * A text with a link.
 *
 * @see https://corefork.telegram.org/bots/api#richtexturl
 */
export interface RichTextUrl {
  /**
   * Type of the rich text, always “url”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * URL of the link
   */
  readonly url: string
}

/**
 * A text with an email address.
 *
 * @see https://corefork.telegram.org/bots/api#richtextemailaddress
 */
export interface RichTextEmailAddress {
  /**
   * Type of the rich text, always “email_address”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The email address
   */
  readonly email_address: string
}

/**
 * A text with a phone number.
 *
 * @see https://corefork.telegram.org/bots/api#richtextphonenumber
 */
export interface RichTextPhoneNumber {
  /**
   * Type of the rich text, always “phone_number”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The phone number
   */
  readonly phone_number: string
}

/**
 * A text with a bank card number.
 *
 * @see https://corefork.telegram.org/bots/api#richtextbankcardnumber
 */
export interface RichTextBankCardNumber {
  /**
   * Type of the rich text, always “bank_card_number”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The bank card number
   */
  readonly bank_card_number: string
}

/**
 * A mention by a username.
 *
 * @see https://corefork.telegram.org/bots/api#richtextmention
 */
export interface RichTextMention {
  /**
   * Type of the rich text, always “mention”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The username
   */
  readonly username: string
}

/**
 * A hashtag.
 *
 * @see https://corefork.telegram.org/bots/api#richtexthashtag
 */
export interface RichTextHashtag {
  /**
   * Type of the rich text, always “hashtag”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The hashtag
   */
  readonly hashtag: string
}

/**
 * A cashtag.
 *
 * @see https://corefork.telegram.org/bots/api#richtextcashtag
 */
export interface RichTextCashtag {
  /**
   * Type of the rich text, always “cashtag”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The cashtag
   */
  readonly cashtag: string
}

/**
 * A bot command.
 *
 * @see https://corefork.telegram.org/bots/api#richtextbotcommand
 */
export interface RichTextBotCommand {
  /**
   * Type of the rich text, always “bot_command”
   */
  readonly type: string

  /**
   * The text
   */
  readonly text: RichText

  /**
   * The bot command
   */
  readonly bot_command: string
}

/**
 * An anchor.
 *
 * @see https://corefork.telegram.org/bots/api#richtextanchor
 */
export interface RichTextAnchor {
  /**
   * Type of the rich text, always “anchor”
   */
  readonly type: string

  /**
   * The name of the anchor
   */
  readonly name: string
}

/**
 * A link to an anchor.
 *
 * @see https://corefork.telegram.org/bots/api#richtextanchorlink
 */
export interface RichTextAnchorLink {
  /**
   * Type of the rich text, always “anchor_link”
   */
  readonly type: string

  /**
   * The link text
   */
  readonly text: RichText

  /**
   * The name of the anchor. If the name is empty, then the link brings back to
   * the top of the message.
   */
  readonly anchor_name: string
}

/**
 * A reference.
 *
 * @see https://corefork.telegram.org/bots/api#richtextreference
 */
export interface RichTextReference {
  /**
   * Type of the rich text, always “reference”
   */
  readonly type: string

  /**
   * Text of the reference
   */
  readonly text: RichText

  /**
   * The name of the reference
   */
  readonly name: string
}

/**
 * A link to a reference.
 *
 * @see https://corefork.telegram.org/bots/api#richtextreferencelink
 */
export interface RichTextReferenceLink {
  /**
   * Type of the rich text, always “reference_link”
   */
  readonly type: string

  /**
   * The link text
   */
  readonly text: RichText

  /**
   * The name of the reference
   */
  readonly reference_name: string
}

/**
 * Caption of a rich formatted block.
 *
 * @see https://corefork.telegram.org/bots/api#richblockcaption
 */
export interface RichBlockCaption {
  /**
   * Block caption
   */
  readonly text: RichText

  /**
   * Block credit which corresponds to the HTML tag <cite>
   */
  readonly credit?: RichText | undefined
}

/**
 * Cell in a table.
 *
 * @see https://corefork.telegram.org/bots/api#richblocktablecell
 */
export interface RichBlockTableCell {
  /**
   * Text in the cell. If omitted, then the cell is invisible.
   */
  readonly text?: RichText | undefined

  /**
   * True, if the cell is a header cell
   */
  readonly is_header?: true | undefined

  /**
   * The number of columns the cell spans if it is bigger than 1
   */
  readonly colspan?: number | undefined

  /**
   * The number of rows the cell spans if it is bigger than 1
   */
  readonly rowspan?: number | undefined

  /**
   * Horizontal cell content alignment. Currently, must be one of “left”,
   * “center”, or “right”.
   */
  readonly align: string

  /**
   * Vertical cell content alignment. Currently, must be one of “top”, “middle”,
   * or “bottom”.
   */
  readonly valign: string
}

/**
 * An item of a list.
 *
 * @see https://corefork.telegram.org/bots/api#richblocklistitem
 */
export interface RichBlockListItem {
  /**
   * Label of the item
   */
  readonly label: string

  /**
   * The content of the item
   */
  readonly blocks: RichBlock[]

  /**
   * True, if the item has a checkbox
   */
  readonly has_checkbox?: true | undefined

  /**
   * True, if the item has a checked checkbox
   */
  readonly is_checked?: true | undefined

  /**
   * For ordered lists, the numeric value of the item label
   */
  readonly value?: number | undefined

  /**
   * For ordered lists, the type of the item label; must be one of “a” for
   * lowercase letters, “A” for uppercase letters, “i” for lowercase Roman
   * numerals, “I” for uppercase Roman numerals, or “1” for decimal numbers
   */
  readonly type?: string | undefined
}

/**
 * This object represents a block in a rich formatted message. Currently, it
 * can be any of the following types:
 *
 * @see https://corefork.telegram.org/bots/api#richblock
 */
export type RichBlock =
  | RichBlockAnchor
  | RichBlockAnimation
  | RichBlockAudio
  | RichBlockBlockQuotation
  | RichBlockCollage
  | RichBlockDetails
  | RichBlockDivider
  | RichBlockFooter
  | RichBlockList
  | RichBlockMap
  | RichBlockMathematicalExpression
  | RichBlockParagraph
  | RichBlockPhoto
  | RichBlockPreformatted
  | RichBlockPullQuotation
  | RichBlockSectionHeading
  | RichBlockSlideshow
  | RichBlockTable
  | RichBlockThinking
  | RichBlockVideo
  | RichBlockVoiceNote

/**
 * A text paragraph, corresponding to the HTML tag <p>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockparagraph
 */
export interface RichBlockParagraph {
  /**
   * Type of the block, always “paragraph”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText
}

/**
 * A section heading, corresponding to the HTML tags <h1>, <h2>, <h3>, <h4>,
 * <h5>, or <h6>.
 *
 * @see https://corefork.telegram.org/bots/api#richblocksectionheading
 */
export interface RichBlockSectionHeading {
  /**
   * Type of the block, always “heading”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText

  /**
   * Relative size of the text font; 1-6, 1 is the largest, 6 is the smallest
   */
  readonly size: number
}

/**
 * A preformatted text block, corresponding to the nested HTML tags <pre> and
 * <code>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockpreformatted
 */
export interface RichBlockPreformatted {
  /**
   * Type of the block, always “pre”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText

  /**
   * The programming language of the text
   */
  readonly language?: string | undefined
}

/**
 * A footer, corresponding to the HTML tag <footer>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockfooter
 */
export interface RichBlockFooter {
  /**
   * Type of the block, always “footer”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText
}

/**
 * A divider, corresponding to the HTML tag <hr/>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockdivider
 */
export interface RichBlockDivider {
  /**
   * Type of the block, always “divider”
   */
  readonly type: string
}

/**
 * A block with a mathematical expression in LaTeX format, corresponding to the
 * custom HTML tag <tg-math-block>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockmathematicalexpression
 */
export interface RichBlockMathematicalExpression {
  /**
   * Type of the block, always “mathematical_expression”
   */
  readonly type: string

  /**
   * The mathematical expression in LaTeX format
   */
  readonly expression: string
}

/**
 * A block with an anchor, corresponding to the HTML tag <a> with the attribute
 * name.
 *
 * @see https://corefork.telegram.org/bots/api#richblockanchor
 */
export interface RichBlockAnchor {
  /**
   * Type of the block, always “anchor”
   */
  readonly type: string

  /**
   * The name of the anchor
   */
  readonly name: string
}

/**
 * A list of blocks, corresponding to the HTML tag <ul> or <ol> with multiple
 * nested tags <li>.
 *
 * @see https://corefork.telegram.org/bots/api#richblocklist
 */
export interface RichBlockList {
  /**
   * Type of the block, always “list”
   */
  readonly type: string

  /**
   * Items of the list
   */
  readonly items: RichBlockListItem[]
}

/**
 * A block quotation, corresponding to the HTML tag <blockquote>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockblockquotation
 */
export interface RichBlockBlockQuotation {
  /**
   * Type of the block, always “blockquote”
   */
  readonly type: string

  /**
   * Content of the block
   */
  readonly blocks: RichBlock[]

  /**
   * Credit of the block
   */
  readonly credit?: RichText | undefined
}

/**
 * A quotation with centered text, loosely corresponding to the HTML tag
 * <aside>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockpullquotation
 */
export interface RichBlockPullQuotation {
  /**
   * Type of the block, always “pullquote”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText

  /**
   * Credit of the block
   */
  readonly credit?: RichText | undefined
}

/**
 * A collage, corresponding to the custom HTML tag <tg-collage>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockcollage
 */
export interface RichBlockCollage {
  /**
   * Type of the block, always “collage”
   */
  readonly type: string

  /**
   * Elements of the collage
   */
  readonly blocks: RichBlock[]

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A slideshow, corresponding to the custom HTML tag <tg-slideshow>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockslideshow
 */
export interface RichBlockSlideshow {
  /**
   * Type of the block, always “slideshow”
   */
  readonly type: string

  /**
   * Elements of the slideshow
   */
  readonly blocks: RichBlock[]

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A table, corresponding to the HTML tag <table>.
 *
 * @see https://corefork.telegram.org/bots/api#richblocktable
 */
export interface RichBlockTable {
  /**
   * Type of the block, always “table”
   */
  readonly type: string

  /**
   * Cells of the table
   */
  readonly cells: RichBlockTableCell[][]

  /**
   * True, if the table has borders
   */
  readonly is_bordered?: true | undefined

  /**
   * True, if the table is striped
   */
  readonly is_striped?: true | undefined

  /**
   * Caption of the table
   */
  readonly caption?: RichText | undefined
}

/**
 * An expandable block for details disclosure, corresponding to the HTML tag
 * <details>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockdetails
 */
export interface RichBlockDetails {
  /**
   * Type of the block, always “details”
   */
  readonly type: string

  /**
   * Always shown summary of the block
   */
  readonly summary: RichText

  /**
   * Content of the block
   */
  readonly blocks: RichBlock[]

  /**
   * True, if the content of the block is visible by default
   */
  readonly is_open?: true | undefined
}

/**
 * A block with a map, corresponding to the custom HTML tag <tg-map>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockmap
 */
export interface RichBlockMap {
  /**
   * Type of the block, always “map”
   */
  readonly type: string

  /**
   * Location of the center of the map
   */
  readonly location: Location

  /**
   * Map zoom level; 13-20
   */
  readonly zoom: number

  /**
   * Expected width of the map
   */
  readonly width: number

  /**
   * Expected height of the map
   */
  readonly height: number

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with an animation, corresponding to the HTML tag <video>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockanimation
 */
export interface RichBlockAnimation {
  /**
   * Type of the block, always “animation”
   */
  readonly type: string

  /**
   * The animation
   */
  readonly animation: Animation

  /**
   * True, if the media preview is covered by a spoiler animation
   */
  readonly has_spoiler?: true | undefined

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a music file, corresponding to the HTML tag <audio>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockaudio
 */
export interface RichBlockAudio {
  /**
   * Type of the block, always “audio”
   */
  readonly type: string

  /**
   * The audio
   */
  readonly audio: Audio

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a photo, corresponding to the HTML tag <img>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockphoto
 */
export interface RichBlockPhoto {
  /**
   * Type of the block, always “photo”
   */
  readonly type: string

  /**
   * Available sizes of the photo
   */
  readonly photo: PhotoSize[]

  /**
   * True, if the media preview is covered by a spoiler animation
   */
  readonly has_spoiler?: true | undefined

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a video, corresponding to the HTML tag <video>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockvideo
 */
export interface RichBlockVideo {
  /**
   * Type of the block, always “video”
   */
  readonly type: string

  /**
   * The video
   */
  readonly video: Video

  /**
   * True, if the media preview is covered by a spoiler animation
   */
  readonly has_spoiler?: true | undefined

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a voice note, corresponding to the HTML tag <audio>.
 *
 * @see https://corefork.telegram.org/bots/api#richblockvoicenote
 */
export interface RichBlockVoiceNote {
  /**
   * Type of the block, always “voice_note”
   */
  readonly type: string

  /**
   * The voice note
   */
  readonly voice_note: Voice

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a “Thinking…” placeholder, corresponding to the custom HTML tag
 * <tg-thinking>. The block may be used only in sendRichMessageDraft, therefore
 * it can't be received in messages. See https://t.me/addemoji/AIActions for
 * examples of custom emoji that are recommended for usage in the block.
 *
 * @see https://corefork.telegram.org/bots/api#richblockthinking
 */
export interface RichBlockThinking {
  /**
   * Type of the block, always “thinking”
   */
  readonly type: string

  /**
   * Text of the block. See https://t.me/addemoji/AIActions for examples of
   * custom emoji that are recommended for usage in the block.
   */
  readonly text: RichText
}

/**
 * An item of a list to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblocklistitem
 */
export interface InputRichBlockListItem {
  /**
   * The content of the item
   */
  readonly blocks: InputRichBlock[]

  /**
   * Pass True if the item has a checkbox
   */
  readonly has_checkbox?: true | undefined

  /**
   * Pass True if the item has a checked checkbox
   */
  readonly is_checked?: true | undefined

  /**
   * For ordered lists, the numeric value of the item label
   */
  readonly value?: number | undefined

  /**
   * For ordered lists, the type of the item label; must be one of “a” for
   * lowercase letters, “A” for uppercase letters, “i” for lowercase Roman
   * numerals, “I” for uppercase Roman numerals, or “1” for decimal numbers
   */
  readonly type?: string | undefined
}

/**
 * This object represents a block in a rich formatted message to be sent.
 * Currently, it can be any of the following types:
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblock
 */
export type InputRichBlock =
  | InputRichBlockAnchor
  | InputRichBlockAnimation
  | InputRichBlockAudio
  | InputRichBlockBlockQuotation
  | InputRichBlockCollage
  | InputRichBlockDetails
  | InputRichBlockDivider
  | InputRichBlockFooter
  | InputRichBlockList
  | InputRichBlockMap
  | InputRichBlockMathematicalExpression
  | InputRichBlockParagraph
  | InputRichBlockPhoto
  | InputRichBlockPreformatted
  | InputRichBlockPullQuotation
  | InputRichBlockSectionHeading
  | InputRichBlockSlideshow
  | InputRichBlockTable
  | InputRichBlockThinking
  | InputRichBlockVideo
  | InputRichBlockVoiceNote

/**
 * A text paragraph, corresponding to the HTML tag <p>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockparagraph
 */
export interface InputRichBlockParagraph {
  /**
   * Type of the block, always “paragraph”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText
}

/**
 * A section heading, corresponding to the HTML tags <h1>, <h2>, <h3>, <h4>,
 * <h5>, or <h6>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblocksectionheading
 */
export interface InputRichBlockSectionHeading {
  /**
   * Type of the block, always “heading”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText

  /**
   * Relative size of the text font; 1-6, 1 is the largest, 6 is the smallest
   */
  readonly size: number
}

/**
 * A preformatted text block, corresponding to the nested HTML tags <pre> and
 * <code>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockpreformatted
 */
export interface InputRichBlockPreformatted {
  /**
   * Type of the block, always “pre”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText

  /**
   * The programming language of the text
   */
  readonly language?: string | undefined
}

/**
 * A footer, corresponding to the HTML tag <footer>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockfooter
 */
export interface InputRichBlockFooter {
  /**
   * Type of the block, always “footer”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText
}

/**
 * A divider, corresponding to the HTML tag <hr/>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockdivider
 */
export interface InputRichBlockDivider {
  /**
   * Type of the block, always “divider”
   */
  readonly type: string
}

/**
 * A block with a mathematical expression in LaTeX format, corresponding to the
 * custom HTML tag <tg-math-block>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockmathematicalexpression
 */
export interface InputRichBlockMathematicalExpression {
  /**
   * Type of the block, always “mathematical_expression”
   */
  readonly type: string

  /**
   * The mathematical expression in LaTeX format
   */
  readonly expression: string
}

/**
 * A block with an anchor, corresponding to the HTML tag <a> with the attribute
 * name.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockanchor
 */
export interface InputRichBlockAnchor {
  /**
   * Type of the block, always “anchor”
   */
  readonly type: string

  /**
   * The name of the anchor
   */
  readonly name: string
}

/**
 * A list of blocks, corresponding to the HTML tag <ul> or <ol> with multiple
 * nested tags <li>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblocklist
 */
export interface InputRichBlockList {
  /**
   * Type of the block, always “list”
   */
  readonly type: string

  /**
   * Items of the list
   */
  readonly items: InputRichBlockListItem[]
}

/**
 * A block quotation, corresponding to the HTML tag <blockquote>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockblockquotation
 */
export interface InputRichBlockBlockQuotation {
  /**
   * Type of the block, always “blockquote”
   */
  readonly type: string

  /**
   * Content of the block
   */
  readonly blocks: InputRichBlock[]

  /**
   * Credit of the block
   */
  readonly credit?: RichText | undefined
}

/**
 * A quotation with centered text, loosely corresponding to the HTML tag
 * <aside>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockpullquotation
 */
export interface InputRichBlockPullQuotation {
  /**
   * Type of the block, always “pullquote”
   */
  readonly type: string

  /**
   * Text of the block
   */
  readonly text: RichText

  /**
   * Credit of the block
   */
  readonly credit?: RichText | undefined
}

/**
 * A collage, corresponding to the custom HTML tag <tg-collage>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockcollage
 */
export interface InputRichBlockCollage {
  /**
   * Type of the block, always “collage”
   */
  readonly type: string

  /**
   * Elements of the collage
   */
  readonly blocks: InputRichBlock[]

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A slideshow, corresponding to the custom HTML tag <tg-slideshow>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockslideshow
 */
export interface InputRichBlockSlideshow {
  /**
   * Type of the block, always “slideshow”
   */
  readonly type: string

  /**
   * Elements of the slideshow
   */
  readonly blocks: InputRichBlock[]

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A table, corresponding to the HTML tag <table>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblocktable
 */
export interface InputRichBlockTable {
  /**
   * Type of the block, always “table”
   */
  readonly type: string

  /**
   * Cells of the table
   */
  readonly cells: RichBlockTableCell[][]

  /**
   * Pass True if the table has borders
   */
  readonly is_bordered?: true | undefined

  /**
   * Pass True if the table is striped
   */
  readonly is_striped?: true | undefined

  /**
   * Caption of the table
   */
  readonly caption?: RichText | undefined
}

/**
 * An expandable block for details disclosure, corresponding to the HTML tag
 * <details>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockdetails
 */
export interface InputRichBlockDetails {
  /**
   * Type of the block, always “details”
   */
  readonly type: string

  /**
   * Always shown summary of the block
   */
  readonly summary: RichText

  /**
   * Content of the block
   */
  readonly blocks: InputRichBlock[]

  /**
   * Pass True if the content of the block is visible by default
   */
  readonly is_open?: true | undefined
}

/**
 * A block with a map, corresponding to the custom HTML tag <tg-map>. The map's
 * width and height must not exceed 10000 in total. The width and height ratio
 * must be at most 20.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockmap
 */
export interface InputRichBlockMap {
  /**
   * Type of the block, always “map”
   */
  readonly type: string

  /**
   * Location of the center of the map
   */
  readonly location: Location

  /**
   * Map zoom level; 0-24
   */
  readonly zoom: number

  /**
   * Map width; 0-10000
   */
  readonly width: number

  /**
   * Map height; 0-10000
   */
  readonly height: number

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with an animation, corresponding to the HTML tag <video>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockanimation
 */
export interface InputRichBlockAnimation {
  /**
   * Type of the block, always “animation”
   */
  readonly type: string

  /**
   * The animation. Caption is ignored.
   */
  readonly animation: InputMediaAnimation

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a music file, corresponding to the HTML tag <audio>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockaudio
 */
export interface InputRichBlockAudio {
  /**
   * Type of the block, always “audio”
   */
  readonly type: string

  /**
   * The audio. Caption is ignored.
   */
  readonly audio: InputMediaAudio

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a photo, corresponding to the HTML tag <img>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockphoto
 */
export interface InputRichBlockPhoto {
  /**
   * Type of the block, always “photo”
   */
  readonly type: string

  /**
   * The photo. Caption is ignored.
   */
  readonly photo: InputMediaPhoto

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a video, corresponding to the HTML tag <video>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockvideo
 */
export interface InputRichBlockVideo {
  /**
   * Type of the block, always “video”
   */
  readonly type: string

  /**
   * The video. Caption is ignored.
   */
  readonly video: InputMediaVideo

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a voice note, corresponding to the HTML tag <audio>.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockvoicenote
 */
export interface InputRichBlockVoiceNote {
  /**
   * Type of the block, always “voice_note”
   */
  readonly type: string

  /**
   * The voice note. Caption is ignored.
   */
  readonly voice_note: InputMediaVoiceNote

  /**
   * Caption of the block
   */
  readonly caption?: RichBlockCaption | undefined
}

/**
 * A block with a “Thinking…” placeholder, corresponding to the custom HTML tag
 * <tg-thinking>. The block may be used only in sendRichMessageDraft, therefore
 * it can't be received in messages. See https://t.me/addemoji/AIActions for
 * examples of custom emoji that are recommended for usage in the block.
 *
 * @see https://corefork.telegram.org/bots/api#inputrichblockthinking
 */
export interface InputRichBlockThinking {
  /**
   * Type of the block, always “thinking”
   */
  readonly type: string

  /**
   * Text of the block. See https://t.me/addemoji/AIActions for examples of
   * custom emoji that are recommended for usage in the block.
   */
  readonly text: RichText
}
