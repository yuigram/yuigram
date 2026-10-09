// GENERATED FILE — do not edit.
// Formatted-text slots (119 across 39 methods)
// Source: Telegram Bot API 10.3, schemas/bot-api/10.3.json
// The code is licensed under MPL-2.0 (see LICENSE). Descriptions are quoted from
// Telegram's Bot API documentation, which that licence does not cover.

/**
 * Where each method takes text with its ranges as a pair of fields.
 *
 * `path` leads from the parameters to the object holding the pair; `*` steps
 * into every element of an array.
 */
export interface FormattableSlot {
  readonly path: readonly string[]
  readonly text: string
  readonly entities: string
}

/** The slots of every method that has any. */
export const FORMATTABLE: Readonly<Record<string, readonly FormattableSlot[]>> = {
  answerGuestQuery: [
    { path: ['result'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content'], text: 'message_text', entities: 'entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'animation'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'audio'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'document'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'photo'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'video'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'voice_note'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'media', '*', 'media'], text: 'caption', entities: 'caption_entities' },
  ],
  answerInlineQuery: [
    { path: ['results', '*'], text: 'caption', entities: 'caption_entities' },
    { path: ['results', '*', 'input_message_content'], text: 'message_text', entities: 'entities' },
    { path: ['results', '*', 'input_message_content', 'rich_message', 'blocks', '*', 'animation'], text: 'caption', entities: 'caption_entities' },
    { path: ['results', '*', 'input_message_content', 'rich_message', 'blocks', '*', 'audio'], text: 'caption', entities: 'caption_entities' },
    { path: ['results', '*', 'input_message_content', 'rich_message', 'blocks', '*', 'document'], text: 'caption', entities: 'caption_entities' },
    { path: ['results', '*', 'input_message_content', 'rich_message', 'blocks', '*', 'photo'], text: 'caption', entities: 'caption_entities' },
    { path: ['results', '*', 'input_message_content', 'rich_message', 'blocks', '*', 'video'], text: 'caption', entities: 'caption_entities' },
    { path: ['results', '*', 'input_message_content', 'rich_message', 'blocks', '*', 'voice_note'], text: 'caption', entities: 'caption_entities' },
    { path: ['results', '*', 'input_message_content', 'rich_message', 'media', '*', 'media'], text: 'caption', entities: 'caption_entities' },
  ],
  answerWebAppQuery: [
    { path: ['result'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content'], text: 'message_text', entities: 'entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'animation'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'audio'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'document'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'photo'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'video'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'voice_note'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'media', '*', 'media'], text: 'caption', entities: 'caption_entities' },
  ],
  copyMessage: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  editEphemeralMessageCaption: [
    { path: [], text: 'caption', entities: 'caption_entities' },
  ],
  editEphemeralMessageMedia: [
    { path: ['media'], text: 'caption', entities: 'caption_entities' },
  ],
  editEphemeralMessageText: [
    { path: [], text: 'text', entities: 'entities' },
    { path: ['rich_message', 'blocks', '*', 'animation'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'audio'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'document'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'photo'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'video'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'voice_note'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'media', '*', 'media'], text: 'caption', entities: 'caption_entities' },
  ],
  editMessageCaption: [
    { path: [], text: 'caption', entities: 'caption_entities' },
  ],
  editMessageChecklist: [
    { path: ['checklist'], text: 'title', entities: 'title_entities' },
    { path: ['checklist', 'tasks', '*'], text: 'text', entities: 'text_entities' },
  ],
  editMessageMedia: [
    { path: ['media'], text: 'caption', entities: 'caption_entities' },
  ],
  editMessageText: [
    { path: [], text: 'text', entities: 'entities' },
    { path: ['rich_message', 'blocks', '*', 'animation'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'audio'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'document'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'photo'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'video'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'voice_note'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'media', '*', 'media'], text: 'caption', entities: 'caption_entities' },
  ],
  editStory: [
    { path: [], text: 'caption', entities: 'caption_entities' },
  ],
  giftPremiumSubscription: [
    { path: [], text: 'text', entities: 'text_entities' },
  ],
  postStory: [
    { path: [], text: 'caption', entities: 'caption_entities' },
  ],
  savePreparedInlineMessage: [
    { path: ['result'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content'], text: 'message_text', entities: 'entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'animation'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'audio'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'document'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'photo'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'video'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'blocks', '*', 'voice_note'], text: 'caption', entities: 'caption_entities' },
    { path: ['result', 'input_message_content', 'rich_message', 'media', '*', 'media'], text: 'caption', entities: 'caption_entities' },
  ],
  sendAnimation: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendAudio: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendChecklist: [
    { path: ['checklist'], text: 'title', entities: 'title_entities' },
    { path: ['checklist', 'tasks', '*'], text: 'text', entities: 'text_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendContact: [
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendDice: [
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendDocument: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendGame: [
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendGift: [
    { path: [], text: 'text', entities: 'text_entities' },
  ],
  sendInvoice: [
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendLivePhoto: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendLocation: [
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendMediaGroup: [
    { path: ['media', '*'], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendMessage: [
    { path: [], text: 'text', entities: 'entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendMessageDraft: [
    { path: [], text: 'text', entities: 'entities' },
  ],
  sendPaidMedia: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendPhoto: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendPoll: [
    { path: [], text: 'question', entities: 'question_entities' },
    { path: [], text: 'explanation', entities: 'explanation_entities' },
    { path: [], text: 'description', entities: 'description_entities' },
    { path: ['options', '*'], text: 'text', entities: 'text_entities' },
    { path: ['options', '*', 'media'], text: 'caption', entities: 'caption_entities' },
    { path: ['explanation_media'], text: 'caption', entities: 'caption_entities' },
    { path: ['media'], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendRichMessage: [
    { path: ['rich_message', 'blocks', '*', 'animation'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'audio'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'document'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'photo'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'video'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'voice_note'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'media', '*', 'media'], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendRichMessageDraft: [
    { path: ['rich_message', 'blocks', '*', 'animation'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'audio'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'document'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'photo'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'video'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'blocks', '*', 'voice_note'], text: 'caption', entities: 'caption_entities' },
    { path: ['rich_message', 'media', '*', 'media'], text: 'caption', entities: 'caption_entities' },
  ],
  sendSticker: [
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendVenue: [
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendVideo: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendVideoNote: [
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
  sendVoice: [
    { path: [], text: 'caption', entities: 'caption_entities' },
    { path: ['reply_parameters'], text: 'quote', entities: 'quote_entities' },
  ],
}
