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
  editedMessageUpdate,
  groupChat,
  inlineQueryUpdate,
  type MessageOptions,
  memberJoinedUpdate,
  message,
  messageUpdate,
  privateChat,
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
