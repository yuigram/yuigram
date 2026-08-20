/**
 * A bot wired to an in-process Telegram.
 *
 * Drives the **real** pipeline — normalization, promotion, middleware,
 * dispatch, context construction — with only the network replaced. A harness
 * that shortcut any of that would let a test pass while the code path a user
 * actually hits stays broken.
 *
 * Exported from `@yuigram/bot-api/testing` so applications test their bots the
 * same way Yuigram tests itself.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { Bot, type BotOptions } from '../bot.js'
import type { Chat, Update, User } from '../generated/types/index.js'
import {
  type CallbackQueryOptions,
  callbackQueryUpdate,
  type MessageOptions,
  messageUpdate,
  resetFixtureIds,
} from './fixtures.js'
import { type MockTransport, mockTransport, ok } from './mock-transport.js'

/** A token that satisfies validation without being anyone's real token. */
const TEST_TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

/** Ways to feed updates into the bot. */
export interface Sender {
  /** Deliver a raw update, exactly as Telegram would. */
  update(update: Update): Promise<void>
  /** Deliver a text message. */
  message(text: string, options?: MessageOptions): Promise<void>
  /** Deliver a command, including any `@bot` suffix you write into it. */
  command(text: string, options?: MessageOptions): Promise<void>
  /** Deliver a callback query. */
  callback(data: string, options?: CallbackQueryOptions): Promise<void>
}

/** What {@link mockBot} hands back. */
export interface MockBot {
  /** The bot under test. Register handlers on it as usual. */
  readonly bot: Bot
  /** Feed updates in. */
  readonly send: Sender
  /** Everything the bot asked Telegram to do. */
  readonly calls: MockTransport
  /** Script a response for an API method. */
  on: MockTransport['on']
  /** Release resources. */
  dispose(): Promise<void>
}

/** Options for {@link mockBot}. */
export interface MockBotOptions extends Omit<BotOptions, 'client'> {
  /** Who the bot appears to be. Its username drives `@bot` command matching. */
  readonly me?: Partial<User>
  /** Default chat for generated updates. */
  readonly chat?: Chat
}

/**
 * Create a bot backed by an in-process Telegram.
 *
 * ```ts
 * const { bot, send, calls } = mockBot()
 * bot.command('start', (ctx) => ctx.reply('hi'))
 *
 * await send.command('/start')
 * expect(calls.last('sendMessage')?.params).toMatchObject({ text: 'hi' })
 * ```
 */
export function mockBot(options: MockBotOptions = {}): MockBot {
  resetFixtureIds()

  const transport = mockTransport()

  const me: User = {
    id: 1,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
    ...options.me,
  }

  // Scripted so a handler that replies does not fail on an unscripted method.
  transport.on('getMe', ok(me))
  transport.on('sendMessage', (request) =>
    ok({
      message_id: 9000,
      date: Math.floor(Date.now() / 1000),
      chat: { id: request.params['chat_id'], type: 'private' },
      text: request.params['text'],
    }),
  )
  transport.on('answerCallbackQuery', ok(true))

  const bot = new Bot(TEST_TOKEN, {
    ...options,
    client: transport,
    log: options.log ?? createLogger({ sink: silentSink() }),
  })

  // `command` matching depends on the bot's own username, which normally
  // arrives from `getMe` during start(). A harness that never starts would
  // otherwise silently fail every `@bot`-suffixed command.
  const identify = async (): Promise<void> => {
    if (bot.me === undefined) await bot.identify()
  }

  const deliver = async (update: Update): Promise<void> => {
    await identify()
    await bot.handleUpdate(update)
  }

  const withDefaults = (given: MessageOptions): MessageOptions =>
    options.chat === undefined ? given : { chat: options.chat, ...given }

  return {
    bot,
    calls: transport,
    on: transport.on.bind(transport),

    send: {
      update: deliver,
      message: (text, messageOptions = {}) =>
        deliver(messageUpdate({ ...withDefaults(messageOptions), text })),
      command: (text, messageOptions = {}) =>
        deliver(messageUpdate({ ...withDefaults(messageOptions), text })),
      callback: (data, callbackOptions = {}) =>
        deliver(callbackQueryUpdate({ ...callbackOptions, data })),
    },

    async dispose() {
      if (bot.state === 'running') await bot.stop({ timeout: 100 })
    },
  }
}
