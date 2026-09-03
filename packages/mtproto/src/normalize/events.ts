/**
 * Which Yuigram event a TL update becomes.
 *
 * The seam between the protocol and the framework. Below it, updates are
 * Telegram's constructors and there is nothing to share with the Bot API; above
 * it, an event is an event and dispatch, filters and middleware do not know
 * which transport produced it.
 *
 * Two vocabularies meet here. Four kinds mean the same thing on both transports
 * and keep the shared names, because a handler written for one should not have
 * to be rewritten for the other. Everything else an account can see has no Bot
 * API counterpart at all — nobody is typing at a bot — so those keep the
 * `mtproto:` prefix, which is what makes their availability visible in the name
 * rather than discovered at runtime.
 *
 * Several constructors map to one kind on purpose. Telegram distinguishes a
 * message in a channel from a message in a chat by constructor; a reader does
 * not care, and one that does has the constructor in `raw`.
 */

/** An update this build has no kind for, carried through rather than dropped. */
export const RAW_KIND = 'mtproto:raw'

/**
 * Kinds that mean the same thing whichever transport produced them.
 *
 * Named without a prefix because a handler for one of these is portable, which
 * is the whole claim the shared vocabulary makes.
 */
export const SHARED_KINDS = [
  'message',
  'message_edited',
  'message_deleted',
  'message_reaction',
] as const

/** Kinds only an account can produce. */
export const ACCOUNT_KINDS = [
  'mtproto:typing',
  'mtproto:user_status',
  'mtproto:read_history',
  'mtproto:draft',
  'mtproto:dialog_pinned',
  'mtproto:dialog_unpinned',
  'mtproto:folder',
  'mtproto:call',
  RAW_KIND,
] as const

/** Every kind the normalizer can produce. */
export type MtprotoEventKind = (typeof SHARED_KINDS)[number] | (typeof ACCOUNT_KINDS)[number]

/**
 * Which kind each update constructor becomes.
 *
 * Written out rather than derived from a naming pattern: the constructors that
 * carry a message are not the ones whose names contain `Message`, and a rule
 * clever enough to get that right would be harder to check than a table.
 *
 * `updateDialogPinned` appears once and produces two kinds, because whether a
 * dialog was pinned or unpinned is a flag rather than a constructor.
 */
export const UPDATE_EVENTS: Readonly<Record<string, MtprotoEventKind>> = {
  updateNewMessage: 'message',
  updateNewChannelMessage: 'message',
  // The compact forms. Telegram sends these instead of a full container when a
  // message needs no accompanying peers, which for a private chat is most of
  // the time — so a client that ignored them would miss ordinary conversation.
  updateShortMessage: 'message',
  updateShortChatMessage: 'message',
  updateEditMessage: 'message_edited',
  updateEditChannelMessage: 'message_edited',
  updateDeleteMessages: 'message_deleted',
  updateDeleteChannelMessages: 'message_deleted',
  updateMessageReactions: 'message_reaction',
  updateUserTyping: 'mtproto:typing',
  updateChatUserTyping: 'mtproto:typing',
  updateChannelUserTyping: 'mtproto:typing',
  updateUserStatus: 'mtproto:user_status',
  updateReadHistoryInbox: 'mtproto:read_history',
  updateReadHistoryOutbox: 'mtproto:read_history',
  updateReadChannelInbox: 'mtproto:read_history',
  updateReadChannelOutbox: 'mtproto:read_history',
  updateDraftMessage: 'mtproto:draft',
  updateDialogPinned: 'mtproto:dialog_pinned',
  updateFolderPeers: 'mtproto:folder',
  updatePhoneCall: 'mtproto:call',
}

/** Constructors whose payload is a `Message` under a `message` field. */
export const MESSAGE_UPDATES: ReadonlySet<string> = new Set([
  'updateNewMessage',
  'updateNewChannelMessage',
  'updateEditMessage',
  'updateEditChannelMessage',
])

/** Constructors carrying a message inline rather than as a nested object. */
export const SHORT_MESSAGE_UPDATES: ReadonlySet<string> = new Set([
  'updateShortMessage',
  'updateShortChatMessage',
])
