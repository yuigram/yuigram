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

import type { DcPurpose } from '../network/dc.js'
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
  'mtproto:membership',
  'mtproto:callback_query',
  'mtproto:inline_query',
  'mtproto:inline_chosen',
  'mtproto:shipping_query',
  'mtproto:precheckout_query',
  'mtproto:join_request',
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
  // Somebody joining, leaving, being promoted or being restricted. Seven
  // constructors for one question, because Telegram kept the basic-group forms
  // when it added the ones carrying a before and an after.
  updateChatParticipant: 'mtproto:membership',
  updateChannelParticipant: 'mtproto:membership',
  updateChatParticipants: 'mtproto:membership',
  updateChatParticipantAdd: 'mtproto:membership',
  updateChatParticipantDelete: 'mtproto:membership',
  updateChatParticipantAdmin: 'mtproto:membership',
  updateChatParticipantRank: 'mtproto:membership',
  // An account signed in with a bot token receives these over this transport,
  // not over the Bot API. Nothing else can answer them: a query that arrived
  // here is answered here, with the identifier it arrived with.
  updateBotCallbackQuery: 'mtproto:callback_query',
  updateInlineBotCallbackQuery: 'mtproto:callback_query',
  updateBotInlineQuery: 'mtproto:inline_query',
  updateBotInlineSend: 'mtproto:inline_chosen',
  // A payment in progress. Both stall the checkout until they are answered, and
  // the second is the last point at which the charge can still be refused.
  updateBotShippingQuery: 'mtproto:shipping_query',
  updateBotPrecheckoutQuery: 'mtproto:precheckout_query',
  // Somebody asking to be let in. Unlike the queries above this one stands
  // until it is decided rather than expiring.
  updateBotChatInviteRequester: 'mtproto:join_request',
  updateDialogPinned: 'mtproto:dialog_pinned',
  updateFolderPeers: 'mtproto:folder',
  updatePhoneCall: 'mtproto:call',
}

/**
 * What the server sends when it is telling the client something.
 *
 * Every one of the seven constructors of the `Updates` type, written out. The
 * stream carries these and only these: a bare `Update` never arrives at the top
 * level, it arrives inside one of them.
 *
 * Named so that the layer taking messages off a connection can tell an update
 * from everything else that arrives unasked — a pong, an acknowledgement, an
 * answer to a call nobody is waiting for any more. The sequence treats anything
 * it is handed as an update, so handing it one of those would dispatch a
 * transport message to a handler as though Telegram had said something.
 */
export const UPDATE_CONTAINERS: ReadonlySet<string> = new Set([
  'updates',
  'updatesCombined',
  'updateShort',
  'updateShortMessage',
  'updateShortChatMessage',
  // The answer to a send rather than a stream item, so it arrives as a result.
  // Listed because it is one of the seven, and because a server is free to send
  // one where the client did not expect it.
  'updateShortSentMessage',
  // Not an update at all: the server saying it has stopped keeping the stream
  // and the client must ask what it missed.
  'updatesTooLong',
])

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

/**
 * Which connection an account's update stream arrives on.
 *
 * Here for the same reason `UPDATE_CONTAINERS` is: both answer "does this count
 * as an update for this account", one by what the message is and the other by
 * where it came from, and neither needs anything from the layers it judges.
 *
 * That last part is the constraint. `Account` reaches for this rule on the way
 * up, and a static edge from there into the connection layer would pull the
 * channel, the session and the codec tables into every program that loads the
 * framework — including a bot that never speaks this protocol. So the
 * connection is named structurally rather than imported. `eager-surfaces` holds
 * that boundary.
 */

/** As much of a connection as the rule reads. */
export interface ConnectionIdentity {
  readonly dcId: number
  readonly purpose: DcPurpose
  readonly slot: number
}

/**
 * Whether what arrives on a connection is an account's update stream.
 *
 * A client holds more than one connection, and on the wire they are
 * indistinguishable: the same framing, the same envelope, the same key
 * exchange, sealed under keys the same datacenter issued. Exactly one of them is
 * the account's update stream, and this says which.
 *
 * It follows from where the state lives. The common box is a property of the
 * account at the datacenter it belongs to, and `updates.getState` and
 * `updates.getDifference` are answered there — so a position advanced by
 * anything else is a position a difference fetched at home would contradict.
 *
 * Three conditions, each ruling out something different:
 *
 * - **the purpose.** A transfer connection exists to move bytes, and a delivery
 *   node is not Telegram at all: its authorization is good for fetching ranges
 *   and nothing else, so treating what arrives there as this account's stream
 *   would let a cache decide where the account is in it.
 * - **the slot.** A second connection at the same address is a second opinion
 *   about what has happened. The pool allows one main connection for exactly
 *   that reason, and this is the same rule stated where it is relied on rather
 *   than inherited from how the pool happens to number its slots.
 * - **the datacenter.** A main connection elsewhere is a call being made where
 *   the account does not live — a redirected sign-in, a file or a channel held
 *   at another datacenter. It carries no common box.
 *
 * The home datacenter is passed rather than read, because it changes: a
 * migration moves it, and the connection that becomes the stream is the one at
 * the datacenter the account moved to.
 *
 * Two of the three are redundant for the connections a pool builds, since it
 * numbers transfer slots away from zero. They are not redundant for the layer:
 * `Connections.get` takes a purpose and a slot from whoever asks, and a rule
 * that held only because of another module's numbering would stop holding the
 * day that numbering changed.
 */
export function isUpdateSource(connection: ConnectionIdentity, homeDcId: number): boolean {
  return connection.purpose === 'main' && connection.slot === 0 && connection.dcId === homeDcId
}
