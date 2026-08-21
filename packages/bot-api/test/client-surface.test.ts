/**
 * The redesigned client surface.
 *
 * These drive the real pipeline — normalization, context construction,
 * middleware, dispatch — with only the network replaced, so they check what a
 * user's handler actually receives rather than what the client was asked to do.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Update } from '../src/generated/types/index.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

const ME = { id: 1, is_bot: true, first_name: 'Test', username: 'test_bot' }

/** A client wired to an in-process Telegram. */
function client(options: { username?: string } = {}) {
  const transport = mockTransport()
  transport.on('getMe', ok({ ...ME, username: options.username ?? ME.username }))
  transport.on('sendMessage', (request) =>
    ok({
      message_id: 9000,
      date: 1,
      chat: { id: 1, type: 'private' },
      text: request.params['text'],
    }),
  )
  transport.on('answerCallbackQuery', ok(true))
  transport.on('setMessageReaction', ok(true))

  const bot = Bot.fromToken(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })

  return { bot, transport }
}

/** A text message update. */
function messageUpdate(text: string, extra: Record<string, unknown> = {}): Update {
  return {
    update_id: 1,
    message: {
      message_id: 42,
      date: 1,
      chat: { id: -100, type: 'supergroup' },
      from: { id: 7, is_bot: false, first_name: 'A' },
      text,
      ...extra,
    },
  } as unknown as Update
}

describe('construction', () => {
  it('builds from a token through the named factory', () => {
    const bot = Bot.fromToken(TOKEN, { client: mockTransport() })

    expect(bot).toBeInstanceOf(Bot)
    expect(bot.state).toBe('idle')
  })

  it('still builds through the constructor for full configuration', () => {
    const bot = new Bot(TOKEN, { client: mockTransport(), name: 'support' })

    expect(bot.name).toBe('support')
  })

  it('does not expose the token', () => {
    const bot = Bot.fromToken(TOKEN, { client: mockTransport() })

    expect(JSON.stringify(bot)).not.toContain('TEST_TOKEN')
  })
})

describe('onMessage', () => {
  it('receives the message with its chat', async () => {
    const { bot } = client()
    let seen: { chatId?: number; text?: string | undefined } = {}

    bot.onMessage((message) => {
      // `chat` is a Chat, not a Chat | undefined — the whole point of the
      // redesign, checked here at runtime as well as in the type tests.
      seen = { chatId: message.chat.id, text: message.text }
    })

    await bot.handleUpdate(messageUpdate('hello'))

    expect(seen).toEqual({ chatId: -100, text: 'hello' })
  })

  it('can reply straight from the context', async () => {
    const { bot, transport } = client()

    bot.onMessage((message) => message.reply('hi'))
    await bot.handleUpdate(messageUpdate('hello'))

    expect(transport.last('sendMessage')?.params).toMatchObject({
      chat_id: -100,
      text: 'hi',
      reply_parameters: { message_id: 42 },
    })
  })

  it('fires for a message with no text', async () => {
    const { bot } = client()
    let fired = false

    bot.onMessage(() => {
      fired = true
    })

    await bot.handleUpdate({
      update_id: 1,
      message: { message_id: 1, date: 1, chat: { id: 1, type: 'private' }, photo: [] },
    } as unknown as Update)

    expect(fired).toBe(true)
  })
})

describe('onText', () => {
  it('fires only for messages carrying text', async () => {
    const { bot } = client()
    let count = 0

    bot.onText(() => {
      count += 1
    })

    await bot.handleUpdate(messageUpdate('hello'))
    await bot.handleUpdate({
      update_id: 2,
      message: { message_id: 2, date: 1, chat: { id: 1, type: 'private' }, photo: [] },
    } as unknown as Update)

    expect(count).toBe(1)
  })

  it('matches exact text', async () => {
    const { bot, transport } = client()

    bot.onText('ping', (message) => message.reply('pong'))

    await bot.handleUpdate(messageUpdate('ping'))
    await bot.handleUpdate(messageUpdate('pinged'))

    expect(transport.count('sendMessage')).toBe(1)
  })

  it('matches a pattern', async () => {
    const { bot, transport } = client()

    bot.onText(/^\d+$/, (message) => message.reply('a number'))
    await bot.handleUpdate(messageUpdate('42'))

    expect(transport.last('sendMessage')?.params['text']).toBe('a number')
  })

  it('fires on an edited message too', async () => {
    // The seven message-bearing kinds share one shape, so a text handler
    // written once covers edits and channel posts.
    const { bot, transport } = client()

    bot.onText((message) => message.reply(message.text))

    await bot.handleUpdate({
      update_id: 3,
      edited_message: { message_id: 5, date: 1, chat: { id: 1, type: 'private' }, text: 'fixed' },
    } as unknown as Update)

    expect(transport.last('sendMessage')?.params['text']).toBe('fixed')
  })
})

describe('onCommand', () => {
  it('runs and exposes the parsed command', async () => {
    const { bot, transport } = client()

    bot.onCommand('give', (message) => message.reply(message.command.args.join('+')))
    await bot.identify()
    await bot.handleUpdate(messageUpdate('/give 10 gold'))

    expect(transport.last('sendMessage')?.params['text']).toBe('10+gold')
  })

  it('answers a command addressed to this bot', async () => {
    const { bot, transport } = client({ username: 'my_bot' })

    bot.onCommand('start', (message) => message.reply('hi'))
    await bot.identify()
    await bot.handleUpdate(messageUpdate('/start@my_bot'))

    expect(transport.count('sendMessage')).toBe(1)
  })

  it('ignores a command addressed to another bot', async () => {
    // Two bots in one group: only the named one should answer.
    const { bot, transport } = client({ username: 'my_bot' })

    bot.onCommand('start', (message) => message.reply('hi'))
    await bot.identify()
    await bot.handleUpdate(messageUpdate('/start@other_bot'))

    expect(transport.count('sendMessage')).toBe(0)
  })

  it('does not leak the parsed command onto later handlers', async () => {
    // Assigning onto the shared context would leave `command` visible to every
    // handler for this update, including ones unrelated to commands.
    const { bot } = client()
    let leaked: unknown = 'not-run'

    bot.onCommand('start', () => {})
    bot.onMessage((message) => {
      leaked = (message as unknown as { command?: unknown }).command
    })

    await bot.identify()
    await bot.handleUpdate(messageUpdate('/start'))

    expect(leaked).toBeUndefined()
  })
})

describe('onCallbackQuery', () => {
  const callback = (data: string): Update =>
    ({
      update_id: 4,
      callback_query: {
        id: 'cbq-1',
        from: { id: 7, is_bot: false, first_name: 'A' },
        chat_instance: 'ci',
        data,
      },
    }) as unknown as Update

  it('answers the query', async () => {
    const { bot, transport } = client()

    bot.onCallbackQuery((query) => query.answer('got it'))
    await bot.handleUpdate(callback('buy:1'))

    expect(transport.last('answerCallbackQuery')?.params).toMatchObject({
      callback_query_id: 'cbq-1',
      text: 'got it',
    })
  })

  it('matches on the data', async () => {
    const { bot, transport } = client()

    bot.onCallbackQuery(/^buy:/, (query) => query.answer(query.data))
    await bot.handleUpdate(callback('buy:1'))
    await bot.handleUpdate(callback('sell:1'))

    expect(transport.count('answerCallbackQuery')).toBe(1)
  })

  it('does not fire a text handler on callback data', async () => {
    // The two are separate fields precisely so a text filter cannot fire on a
    // button press.
    const { bot, transport } = client()

    bot.onText('buy:1', (message) => message.reply('should not happen'))
    await bot.handleUpdate(callback('buy:1'))

    expect(transport.count('sendMessage')).toBe(0)
  })
})

describe('on()', () => {
  it('routes by kind', async () => {
    const { bot } = client()
    let kind = ''

    bot.on('message_reaction', (event) => {
      kind = event.kind
    })

    await bot.handleUpdate({
      update_id: 5,
      message_reaction: {
        chat: { id: 1, type: 'private' },
        message_id: 1,
        date: 1,
        old_reaction: [],
        new_reaction: [],
      },
    } as unknown as Update)

    expect(kind).toBe('message_reaction')
  })

  it('accepts several kinds at once', async () => {
    const { bot } = client()
    let count = 0

    bot.on(['message', 'channel_post'], () => {
      count += 1
    })

    await bot.handleUpdate(messageUpdate('a'))
    await bot.handleUpdate({
      update_id: 6,
      channel_post: { message_id: 1, date: 1, chat: { id: 1, type: 'channel' }, text: 'b' },
    } as unknown as Update)

    expect(count).toBe(2)
  })
})

describe('onError', () => {
  it('receives a handler failure and lets dispatch continue', async () => {
    const { bot } = client()
    const seen: unknown[] = []
    let laterRan = false

    bot.onError((error) => seen.push(error))
    bot.onMessage(() => {
      throw new Error('handler exploded')
    })
    bot.onMessage(() => {
      laterRan = true
    })

    await bot.handleUpdate(messageUpdate('hello'))

    expect(seen).toHaveLength(1)
    expect(laterRan).toBe(true)
  })

  it('does not propagate to the caller', async () => {
    const { bot } = client()

    bot.onError(() => {})
    bot.onMessage(() => {
      throw new Error('boom')
    })

    await expect(bot.handleUpdate(messageUpdate('hello'))).resolves.toBeUndefined()
  })
})

describe('middleware', () => {
  it('wraps handlers in onion order', async () => {
    const { bot } = client()
    const order: string[] = []

    bot.use(async (_context, next) => {
      order.push('in')
      await next()
      order.push('out')
    })
    bot.onMessage(() => {
      order.push('handler')
    })

    await bot.handleUpdate(messageUpdate('hello'))

    expect(order).toEqual(['in', 'handler', 'out'])
  })

  it('can end the chain before any handler runs', async () => {
    const { bot } = client()
    let ran = false

    bot.use(async () => {})
    bot.onMessage(() => {
      ran = true
    })

    await bot.handleUpdate(messageUpdate('hello'))

    expect(ran).toBe(false)
  })
})

describe('identify', () => {
  it('shares one request between concurrent callers', async () => {
    const { bot, transport } = client()

    await Promise.all(Array.from({ length: 8 }, () => bot.identify()))

    expect(transport.count('getMe')).toBe(1)
  })
})

describe('service messages', () => {
  /** Someone joining a group: promoted to its own kind, still a message. */
  const joined: Update = {
    update_id: 7,
    message: {
      message_id: 3,
      date: 1,
      chat: { id: -100, type: 'supergroup' },
      new_chat_members: [{ id: 8, is_bot: false, first_name: 'B' }],
    },
  } as unknown as Update

  it('routes to the promoted kind', async () => {
    const { bot } = client()
    let kind = ''

    bot.on('chat_member_joined', (event) => {
      kind = event.kind
    })

    await bot.handleUpdate(joined)

    expect(kind).toBe('chat_member_joined')
  })

  it('still carries the message actions', async () => {
    // The promoted kind is absent from MESSAGE_KINDS, so deciding by kind
    // rather than by payload left exactly these updates without `reply`.
    const { bot, transport } = client()

    bot.on('chat_member_joined', (event) => event.reply('Welcome.'))
    await bot.handleUpdate(joined)

    expect(transport.last('sendMessage')?.params).toMatchObject({
      chat_id: -100,
      text: 'Welcome.',
      reply_parameters: { message_id: 3 },
    })
  })

  it('exposes the payload under the message alias', async () => {
    const { bot } = client()
    let members: unknown

    bot.on('chat_member_joined', (event) => {
      members = event.message.new_chat_members
    })

    await bot.handleUpdate(joined)

    expect(members).toHaveLength(1)
  })

  it('does not also fire the plain message handler', async () => {
    // A service message is not an ordinary one: an echo bot should not echo
    // "user joined the group".
    const { bot } = client()
    let fired = false

    bot.onMessage(() => {
      fired = true
    })

    await bot.handleUpdate(joined)

    expect(fired).toBe(false)
  })
})
