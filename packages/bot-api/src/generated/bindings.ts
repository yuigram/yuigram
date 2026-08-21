// GENERATED FILE — do not edit.
// Context method bindings (18 message, 79 chat, 4 source)
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

/**
 * Methods addressed to the message that arrived. `chat_id` and `message_id`
 * are its own.
 */
export const MESSAGE_BOUND = {
  approveSuggestedPost: ['chat_id', 'message_id'],
  declineSuggestedPost: ['chat_id', 'message_id'],
  deleteMessage: ['chat_id', 'message_id'],
  deleteMessageReaction: ['chat_id', 'message_id'],
  editMessageCaption: ['chat_id', 'message_id', 'business_connection_id'],
  editMessageChecklist: ['chat_id', 'message_id', 'business_connection_id'],
  editMessageLiveLocation: ['chat_id', 'message_id', 'business_connection_id'],
  editMessageMedia: ['chat_id', 'message_id', 'business_connection_id'],
  editMessageReplyMarkup: ['chat_id', 'message_id', 'business_connection_id'],
  editMessageText: ['chat_id', 'message_id', 'business_connection_id'],
  getGameHighScores: ['chat_id', 'message_id'],
  pinChatMessage: ['chat_id', 'message_id', 'business_connection_id'],
  readBusinessMessage: ['chat_id', 'message_id', 'business_connection_id'],
  setGameScore: ['chat_id', 'message_id'],
  setMessageReaction: ['chat_id', 'message_id'],
  stopMessageLiveLocation: ['chat_id', 'message_id', 'business_connection_id'],
  stopPoll: ['chat_id', 'message_id', 'business_connection_id'],
  unpinChatMessage: ['chat_id', 'message_id', 'business_connection_id'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/**
 * Methods addressed to the chat the update arrived in. Sends also inherit the
 * forum topic and the business connection, so a reply stays where the
 * conversation is.
 */
export const CHAT_BOUND = {
  approveChatJoinRequest: ['chat_id'],
  banChatMember: ['chat_id'],
  banChatSenderChat: ['chat_id'],
  closeForumTopic: ['chat_id', 'message_thread_id'],
  closeGeneralForumTopic: ['chat_id'],
  createChatInviteLink: ['chat_id'],
  createChatSubscriptionInviteLink: ['chat_id'],
  createForumTopic: ['chat_id'],
  declineChatJoinRequest: ['chat_id'],
  deleteAllMessageReactions: ['chat_id'],
  deleteChatPhoto: ['chat_id'],
  deleteChatStickerSet: ['chat_id'],
  deleteEphemeralMessage: ['chat_id'],
  deleteForumTopic: ['chat_id', 'message_thread_id'],
  deleteMessages: ['chat_id'],
  editChatInviteLink: ['chat_id'],
  editChatSubscriptionInviteLink: ['chat_id'],
  editEphemeralMessageCaption: ['chat_id'],
  editEphemeralMessageMedia: ['chat_id'],
  editEphemeralMessageReplyMarkup: ['chat_id'],
  editEphemeralMessageText: ['chat_id'],
  editForumTopic: ['chat_id', 'message_thread_id'],
  editGeneralForumTopic: ['chat_id'],
  exportChatInviteLink: ['chat_id'],
  getChat: ['chat_id'],
  getChatAdministrators: ['chat_id'],
  getChatGifts: ['chat_id'],
  getChatMember: ['chat_id'],
  getChatMemberCount: ['chat_id'],
  getChatMenuButton: ['chat_id'],
  getUserChatBoosts: ['chat_id'],
  hideGeneralForumTopic: ['chat_id'],
  leaveChat: ['chat_id'],
  promoteChatMember: ['chat_id'],
  removeChatVerification: ['chat_id'],
  reopenForumTopic: ['chat_id', 'message_thread_id'],
  reopenGeneralForumTopic: ['chat_id'],
  restrictChatMember: ['chat_id'],
  revokeChatInviteLink: ['chat_id'],
  sendAnimation: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendAudio: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendChatAction: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendChecklist: ['chat_id', 'business_connection_id'],
  sendContact: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendDice: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendDocument: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendGame: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendGift: ['chat_id'],
  sendInvoice: ['chat_id', 'message_thread_id'],
  sendLivePhoto: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendLocation: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendMediaGroup: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendMessage: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendMessageDraft: ['chat_id', 'message_thread_id'],
  sendPaidMedia: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendPhoto: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendPoll: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendRichMessage: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendRichMessageDraft: ['chat_id', 'message_thread_id'],
  sendSticker: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendVenue: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendVideo: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendVideoNote: ['chat_id', 'message_thread_id', 'business_connection_id'],
  sendVoice: ['chat_id', 'message_thread_id', 'business_connection_id'],
  setChatAdministratorCustomTitle: ['chat_id'],
  setChatDescription: ['chat_id'],
  setChatMemberTag: ['chat_id'],
  setChatMenuButton: ['chat_id'],
  setChatPermissions: ['chat_id'],
  setChatPhoto: ['chat_id'],
  setChatStickerSet: ['chat_id'],
  setChatTitle: ['chat_id'],
  unbanChatMember: ['chat_id'],
  unbanChatSenderChat: ['chat_id'],
  unhideGeneralForumTopic: ['chat_id'],
  unpinAllChatMessages: ['chat_id'],
  unpinAllForumTopicMessages: ['chat_id', 'message_thread_id'],
  unpinAllGeneralForumTopicMessages: ['chat_id'],
  verifyChat: ['chat_id'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/**
 * Methods that move this message elsewhere. The destination stays the
 * caller’s; the source is this message.
 */
export const SOURCE_BOUND = {
  copyMessage: ['from_chat_id', 'message_id'],
  copyMessages: ['from_chat_id'],
  forwardMessage: ['from_chat_id', 'message_id'],
  forwardMessages: ['from_chat_id'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/**
 * Methods answering the callback query that arrived.
 */
export const CALLBACK_QUERY_BOUND = {
  answerCallbackQuery: ['callback_query_id'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/**
 * Methods answering the inline query that arrived.
 */
export const INLINE_QUERY_BOUND = {
  answerInlineQuery: ['inline_query_id'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/**
 * Methods answering the shipping query that arrived.
 */
export const SHIPPING_QUERY_BOUND = {
  answerShippingQuery: ['shipping_query_id'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/**
 * Methods answering the pre-checkout query that arrived.
 */
export const PRE_CHECKOUT_QUERY_BOUND = {
  answerPreCheckoutQuery: ['pre_checkout_query_id'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/**
 * Binding tables a message-bearing context installs, in composition order.
 * Later tables never overwrite earlier ones — the check that guarantees it
 * lives with the binder.
 */
export const MESSAGE_CONTEXT_TABLES = [
  MESSAGE_BOUND,
  CHAT_BOUND,
  SOURCE_BOUND,
] as const
