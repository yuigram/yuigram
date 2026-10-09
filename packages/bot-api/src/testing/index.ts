// SPDX-License-Identifier: MPL-2.0

/**
 * Test helpers for Bot API code.
 *
 * Exported from `@yuigram/bot-api/testing` so applications can use the same
 * harness Yuigram tests itself with, rather than reimplementing a stand-in.
 */

export {
  botUser,
  type CallbackQueryOptions,
  callbackQueryUpdate,
  channelPostUpdate,
  chatJoinRequestUpdate,
  chosenInlineResultUpdate,
  editedMessageUpdate,
  groupChat,
  inlineQueryUpdate,
  type MessageOptions,
  memberJoinedUpdate,
  message,
  messageReactionUpdate,
  messageUpdate,
  pollAnswerUpdate,
  preCheckoutQueryUpdate,
  privateChat,
  type ReactionOptions,
  resetFixtureIds,
  unknownUpdate,
  user,
} from './fixtures.js'
export {
  type MockBot,
  type MockBotOptions,
  mockBot,
  type Sender,
} from './mock-bot.js'
export {
  apiError,
  floodWait,
  MockNetworkError,
  type MockTransport,
  type MockTransportOptions,
  migrated,
  mockTransport,
  ok,
  type RecordedCall,
  type Responder,
  serverError,
} from './mock-transport.js'
