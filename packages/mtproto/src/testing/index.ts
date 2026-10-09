// SPDX-License-Identifier: MPL-2.0

/**
 * Test helpers for MTProto account code.
 *
 * Exported from `@yuigram/mtproto/testing` so applications test the handlers
 * they register on an account the way they test a bot: through the real
 * account, with only the connection to Telegram replaced.
 */

export {
  type AccountCalls,
  type AccountMessageOptions,
  type AccountSender,
  type Answer,
  type Answered,
  type MockAccount,
  type MockAccountOptions,
  mockAccount,
  type RecordedInvoke,
  rpcError,
  type TestUser,
} from './mock-account.js'
