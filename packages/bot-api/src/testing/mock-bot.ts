// SPDX-License-Identifier: MIT

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

import { createLogger, type LogFields, type Logger, silentSink } from '@yuigram/core'
import { Bot, type BotOptions } from '../bot.js'
import type { Chat, Message, Update, User } from '../generated/types/index.js'
import {
  type CallbackQueryOptions,
  callbackQueryUpdate,
  type MessageOptions,
  messageUpdate,
  resetFixtureIds,
  user,
} from './fixtures.js'
import { type MockTransport, mockTransport, ok, type Responder } from './mock-transport.js'

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
  /** Deliver a callback query, as built; see {@link Sender.press} for one on a sent message. */
  callback(data: string, options?: CallbackQueryOptions): Promise<void>
  /**
   * Press a button on a message the bot sent.
   *
   * The message is the latest one the bot sent with an inline keyboard, unless
   * one is named. A button carrying `data` must be on it: pressing one that is
   * not there fails the test here, rather than delivering a query no person
   * could have sent.
   */
  press(data: string, options?: { readonly message?: Message; readonly from?: User }): Promise<void>
}

/**
 * What {@link mockBot} hands back.
 *
 * `Ext` is the flavour the bot's plugins add to its contexts, as
 * `Bot.fromToken<Ext>` takes it, so code written for an extended bot is tested
 * without a cast.
 */
export interface MockBot<Ext = unknown> {
  /** The bot under test. Register handlers on it as usual. */
  readonly bot: Bot<Ext>
  /** Feed updates in. */
  readonly send: Sender
  /** Everything the bot asked Telegram to do. */
  readonly calls: MockTransport
  /**
   * The messages the bot sent, as Telegram answered them, oldest first.
   *
   * An edit through the harness changes the message here too, so a test reads
   * what a person would now see.
   */
  readonly sent: readonly Message[]
  /**
   * Errors a handler threw that nothing caught, in the order they happened.
   *
   * What the bot would otherwise only log. Collected from the bot's logger,
   * so a handler registered with `bot.onError` still takes what it takes.
   */
  readonly errors: readonly unknown[]
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

/** The methods that send a message and are answered with it. */
const SENDING = [
  'sendMessage',
  'sendPhoto',
  'sendVideo',
  'sendAnimation',
  'sendAudio',
  'sendDocument',
  'sendVoice',
  'sendVideoNote',
  'sendSticker',
  'sendLocation',
  'sendVenue',
  'sendContact',
  'sendPoll',
  'sendDice',
  'forwardMessage',
] as const

/** The methods that edit a message and are answered with it, or `true` for an inline one. */
const EDITING = [
  'editMessageText',
  'editMessageCaption',
  'editMessageReplyMarkup',
  'editMessageMedia',
] as const

/** The methods answered with `true` and nothing else. */
const CONFIRMING = [
  'answerCallbackQuery',
  'answerInlineQuery',
  'answerPreCheckoutQuery',
  'answerShippingQuery',
  'deleteMessage',
  'deleteMessages',
  'setMessageReaction',
  'sendChatAction',
  'pinChatMessage',
  'unpinChatMessage',
  'unpinAllChatMessages',
  'approveChatJoinRequest',
  'declineChatJoinRequest',
  'banChatMember',
  'unbanChatMember',
  'restrictChatMember',
  'promoteChatMember',
  'leaveChat',
] as const

/**
 * A logger that forwards to another and keeps what no handler caught.
 *
 * Children forward and keep too: a client logs through children named for its
 * parts, and an error logged by one of them is still the bot's.
 */
function capturing(target: Logger, errors: unknown[]): Logger {
  const keep = (message: string, fields: LogFields | undefined): void => {
    if (message === 'unhandled error while dispatching an update') errors.push(fields?.['error'])
  }

  return {
    debug: (message, fields) => target.debug(message, fields),
    info: (message, fields) => target.info(message, fields),
    warn: (message, fields) => target.warn(message, fields),
    error: (message, fields) => {
      keep(message, fields)
      target.error(message, fields)
    },
    child: (name, fields) => capturing(target.child(name, fields), errors),
    isEnabled: (level) => level === 'error' || target.isEnabled(level),
  }
}

/**
 * Create a bot backed by an in-process Telegram.
 *
 * ```ts
 * const { bot, send, calls } = mockBot()
 * bot.onCommand('start', (ctx) => ctx.reply('hi'))
 *
 * await send.command('/start')
 * expect(calls.last('sendMessage')?.params).toMatchObject({ text: 'hi' })
 * ```
 *
 * The methods a handler most often calls are answered without being scripted:
 * sending and forwarding with the message as Telegram would build it, editing
 * with the edited message, and confirmations with `true`. Anything else, or
 * anything a case wants answered differently, is scripted with `on`.
 *
 * A bot whose plugins add to its contexts names their flavour, as it would with
 * `Bot.fromToken`: `mockBot<ConversationFlavour>()`.
 */
export function mockBot<Ext = unknown>(options: MockBotOptions = {}): MockBot<Ext> {
  resetFixtureIds()

  const transport = mockTransport()
  const sent: Message[] = []
  const errors: unknown[] = []
  let nextMessageId = 9000

  const me: User = {
    id: 1,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
    ...options.me,
  }

  const chatOf = (chatId: unknown): Chat =>
    ({
      id: chatId,
      type: typeof chatId === 'number' && chatId < 0 ? 'supergroup' : 'private',
    }) as Chat

  // A message as Telegram answers a send: the bot's, in the chat asked for, with
  // the text or caption and the keyboard it was sent with.
  const sending: Responder = (request) => {
    const params = request.params
    const built = {
      message_id: nextMessageId++,
      date: Math.floor(Date.now() / 1000),
      chat: chatOf(params['chat_id']),
      from: me,
      ...(typeof params['text'] === 'string' ? { text: params['text'] } : {}),
      ...(typeof params['caption'] === 'string' ? { caption: params['caption'] } : {}),
      ...(params['reply_markup'] === undefined ? {} : { reply_markup: params['reply_markup'] }),
    } as Message
    sent.push(built)
    return ok(built)
  }

  const editing: Responder = (request) => {
    const params = request.params
    if (params['inline_message_id'] !== undefined) return ok(true)

    const index = sent.findIndex(
      (one) => one.message_id === params['message_id'] && one.chat.id === params['chat_id'],
    )
    const before = index === -1 ? undefined : sent[index]
    const after = {
      ...(before ?? {
        message_id: params['message_id'],
        date: Math.floor(Date.now() / 1000),
        chat: chatOf(params['chat_id']),
        from: me,
      }),
      edit_date: Math.floor(Date.now() / 1000),
      ...(typeof params['text'] === 'string' ? { text: params['text'] } : {}),
      ...(typeof params['caption'] === 'string' ? { caption: params['caption'] } : {}),
      ...(params['reply_markup'] === undefined ? {} : { reply_markup: params['reply_markup'] }),
    } as Message
    if (index !== -1) sent[index] = after
    return ok(after)
  }

  transport.on('getMe', ok(me))
  for (const method of SENDING) transport.on(method, sending)
  for (const method of EDITING) transport.on(method, editing)
  for (const method of CONFIRMING) transport.on(method, ok(true))
  transport.on('copyMessage', () => ok({ message_id: nextMessageId++ }))

  const bot = new Bot<Ext>(TEST_TOKEN, {
    ...options,
    client: transport,
    log: capturing(options.log ?? createLogger({ sink: silentSink() }), errors),
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

  const press: Sender['press'] = async (data, pressOptions = {}) => {
    const target =
      pressOptions.message ??
      sent.findLast((one) => one.reply_markup?.inline_keyboard !== undefined)
    if (target === undefined) {
      throw new Error(`there is no message with buttons to press '${data}' on`)
    }

    const buttons = target.reply_markup?.inline_keyboard.flat() ?? []
    if (!buttons.some((button) => button.callback_data === data)) {
      throw new Error(`no button on message ${target.message_id} sends '${data}'`)
    }

    const from =
      pressOptions.from ??
      (target.chat.type === 'private' ? user({ id: Number(target.chat.id) }) : user())
    await deliver(callbackQueryUpdate({ data, from, message: target }))
  }

  return {
    bot,
    calls: transport,
    sent,
    errors,
    on: transport.on.bind(transport),

    send: {
      update: deliver,
      message: (text, messageOptions = {}) =>
        deliver(messageUpdate({ ...withDefaults(messageOptions), text })),
      command: (text, messageOptions = {}) =>
        deliver(messageUpdate({ ...withDefaults(messageOptions), text })),
      callback: (data, callbackOptions = {}) =>
        deliver(callbackQueryUpdate({ ...callbackOptions, data })),
      press,
    },

    async dispose() {
      if (bot.state === 'running') await bot.stop({ timeout: 100 })
    },
  }
}
