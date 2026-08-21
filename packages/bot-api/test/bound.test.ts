/**
 * The generated bound-method surface.
 *
 * The risk here is not that a method is missing — the table is generated, so it
 * cannot be — but that a bound value is *wrong*: the destination chat used as
 * the source, a forum thread dropped so a reply lands in the general chat, or a
 * caller's explicit argument silently ignored. Each of those is a bug a user
 * sees and a test cannot infer from the schema, so each is pinned here.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { createBoundPrototype, UnresolvedBindingError } from '../src/events/bound.js'
import { CHAT_BOUND, MESSAGE_BOUND, SOURCE_BOUND } from '../src/generated/bindings.js'
import type { Update } from '../src/generated/types/index.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

const CHAT = { id: -1001, type: 'supergroup' } as const
const SENT = { message_id: 9000, date: 1, chat: CHAT }

/** A client whose transport records every call and answers plausibly. */
function client() {
  const transport = mockTransport()

  for (const method of [
    'sendMessage',
    'sendPhoto',
    'sendDocument',
    'forwardMessage',
    'copyMessage',
  ]) {
    transport.on(method, ok(SENT))
  }
  for (const method of [
    'banChatMember',
    'deleteMessage',
    'setMessageReaction',
    'answerCallbackQuery',
    'answerInlineQuery',
    'sendChatAction',
  ]) {
    transport.on(method, ok(true))
  }
  transport.on('getChatMember', ok({ status: 'member', user: { id: 7, is_bot: false } }))
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'Test', username: 'test_bot' }))

  const bot = Bot.fromToken(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })

  return { bot, transport }
}

/** A message update, with anything extra merged onto the message. */
function messageUpdate(extra: Record<string, unknown> = {}): Update {
  return {
    update_id: 1,
    message: {
      message_id: 42,
      date: 1,
      chat: CHAT,
      from: { id: 7, is_bot: false, first_name: 'A' },
      text: 'hi',
      ...extra,
    },
  } as unknown as Update
}

describe('addressing', () => {
  it('supplies the chat from the message', async () => {
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.banChatMember({ user_id: 7 })
    })

    await bot.handleUpdate(messageUpdate())

    expect(transport.last('banChatMember')?.params).toEqual({ chat_id: CHAT.id, user_id: 7 })
  })

  it('supplies both the chat and the message for a message-addressed method', async () => {
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.deleteMessage()
    })

    await bot.handleUpdate(messageUpdate())

    expect(transport.last('deleteMessage')?.params).toEqual({
      chat_id: CHAT.id,
      message_id: 42,
    })
  })

  it('takes no arguments when the context supplies every required parameter', async () => {
    const { bot, transport } = client()

    // The call below is the assertion: it does not compile with an argument
    // required, and `deleteMessage()` is the shape a user will reach for.
    bot.onMessage(async (message) => {
      await message.deleteMessage()
    })

    await bot.handleUpdate(messageUpdate())
    expect(transport.count('deleteMessage')).toBe(1)
  })
})

describe('inheritance', () => {
  it('carries the forum topic onto a send', async () => {
    // Without this a reply inside a topic lands in the general chat, which is
    // invisible until someone runs the bot in a forum.
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.sendMessage({ text: 'in the topic' })
    })

    await bot.handleUpdate(messageUpdate({ message_thread_id: 77 }))

    expect(transport.last('sendMessage')?.params).toMatchObject({
      chat_id: CHAT.id,
      message_thread_id: 77,
      text: 'in the topic',
    })
  })

  it('carries the business connection onto a send', async () => {
    // Without this the reply is sent by the bot rather than by the account.
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.sendMessage({ text: 'as the account' })
    })

    await bot.handleUpdate(messageUpdate({ business_connection_id: 'bc-1' }))

    expect(transport.last('sendMessage')?.params).toMatchObject({
      business_connection_id: 'bc-1',
    })
  })

  it('omits an absent value rather than sending undefined', async () => {
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.sendMessage({ text: 'plain' })
    })

    await bot.handleUpdate(messageUpdate())

    const params = transport.last('sendMessage')?.params ?? {}
    expect(Object.keys(params)).not.toContain('message_thread_id')
    expect(Object.keys(params)).not.toContain('business_connection_id')
  })

  it('lets an explicit argument override what the context would supply', async () => {
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.sendMessage({ chat_id: 555, text: 'elsewhere' })
    })

    await bot.handleUpdate(messageUpdate())

    expect(transport.last('sendMessage')?.params).toMatchObject({ chat_id: 555 })
  })
})

describe('relocation', () => {
  it('binds this chat as the source, leaving the destination to the caller', async () => {
    // The trap the classification exists for: `forwardMessage` takes `chat_id`
    // as the destination, so binding it to the incoming chat would forward
    // every message back to itself.
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.forwardMessage({ chat_id: 999 })
    })

    await bot.handleUpdate(messageUpdate())

    expect(transport.last('forwardMessage')?.params).toEqual({
      chat_id: 999,
      from_chat_id: CHAT.id,
      message_id: 42,
    })
  })

  it('leaves the message list to the caller for the plural form', async () => {
    expect(SOURCE_BOUND.forwardMessages).toEqual(['from_chat_id'])
    expect(SOURCE_BOUND.copyMessages).toEqual(['from_chat_id'])
  })
})

describe('queries', () => {
  it('answers a callback query with its own id', async () => {
    const { bot, transport } = client()

    bot.onCallbackQuery(async (query) => {
      await query.answerCallbackQuery({ text: 'done' })
    })

    await bot.handleUpdate({
      update_id: 2,
      callback_query: {
        id: 'cbq-1',
        from: { id: 7, is_bot: false, first_name: 'A' },
        chat_instance: 'x',
        data: 'go',
      },
    } as unknown as Update)

    expect(transport.last('answerCallbackQuery')?.params).toEqual({
      callback_query_id: 'cbq-1',
      text: 'done',
    })
  })

  it('answers an inline query with its own id', async () => {
    const { bot, transport } = client()

    bot.on('inline_query', async (query) => {
      await query.answerInlineQuery({ results: [] })
    })

    await bot.handleUpdate({
      update_id: 3,
      inline_query: {
        id: 'iq-1',
        from: { id: 7, is_bot: false, first_name: 'A' },
        query: 'search',
        offset: '',
      },
    } as unknown as Update)

    expect(transport.last('answerInlineQuery')?.params).toEqual({
      inline_query_id: 'iq-1',
      results: [],
    })
  })
})

describe('coverage', () => {
  it('binds a service message the same as an ordinary one', async () => {
    // A promoted service kind is still a message in a chat, so it addresses the
    // same things. Deciding by kind rather than by payload is what left exactly
    // these updates without actions once before.
    const { bot, transport } = client()

    bot.on('chat_member_joined', async (event) => {
      await event.sendMessage({ text: 'welcome' })
    })

    await bot.handleUpdate({
      update_id: 4,
      message: {
        message_id: 43,
        date: 1,
        chat: CHAT,
        new_chat_members: [{ id: 8, is_bot: false, first_name: 'B' }],
      },
    } as unknown as Update)

    expect(transport.last('sendMessage')?.params).toMatchObject({ chat_id: CHAT.id })
  })

  it('leaves a context that addresses nothing without bound methods', async () => {
    const { bot } = client()
    let seen: unknown

    bot.on('poll_answer', (event) => {
      seen = (event as unknown as Record<string, unknown>)['sendMessage']
    })

    await bot.handleUpdate({
      update_id: 5,
      poll_answer: { poll_id: 'p', option_ids: [0] },
    } as unknown as Update)

    expect(seen).toBeUndefined()
  })

  it('offers every method the tables name', async () => {
    const { bot } = client()
    const names: string[] = []

    bot.onMessage((message) => {
      for (const method of Object.keys({ ...MESSAGE_BOUND, ...CHAT_BOUND, ...SOURCE_BOUND })) {
        if (typeof (message as unknown as Record<string, unknown>)[method] === 'function') {
          names.push(method)
        }
      }
    })

    await bot.handleUpdate(messageUpdate())

    const expected = Object.keys({ ...MESSAGE_BOUND, ...CHAT_BOUND, ...SOURCE_BOUND })
    expect(names).toHaveLength(expected.length)
    expect(names.length).toBeGreaterThan(90)
  })
})

describe('the context stays data', () => {
  it('keeps bound methods off the own properties', async () => {
    const { bot } = client()
    let serialized = ''

    bot.onMessage((message) => {
      serialized = JSON.stringify(message)
    })

    await bot.handleUpdate(messageUpdate())

    const parsed = JSON.parse(serialized) as Record<string, unknown>
    expect(parsed['text']).toBe('hi')
    expect(parsed['sendMessage']).toBeUndefined()
    expect(Object.keys(parsed)).not.toContain('banChatMember')
  })

  it('shares one prototype across updates from the same client', async () => {
    // The performance claim: a hundred methods cost one lookup, not a hundred
    // closures per update.
    const { bot } = client()
    const prototypes: unknown[] = []

    bot.onMessage((message) => {
      prototypes.push(Object.getPrototypeOf(message))
    })

    await bot.handleUpdate(messageUpdate())
    await bot.handleUpdate(messageUpdate())

    expect(prototypes).toHaveLength(2)
    expect(prototypes[0]).toBe(prototypes[1])
  })

  it('gives two clients different prototypes', async () => {
    const first = client()
    const second = client()
    const seen: unknown[] = []

    first.bot.onMessage((message) => seen.push(Object.getPrototypeOf(message)))
    second.bot.onMessage((message) => seen.push(Object.getPrototypeOf(message)))

    await first.bot.handleUpdate(messageUpdate())
    await second.bot.handleUpdate(messageUpdate())

    expect(seen[0]).not.toBe(seen[1])
  })
})

describe('the binder', () => {
  it('refuses a table naming a parameter nothing can supply', () => {
    const { bot } = client()

    expect(() => createBoundPrototype(bot.api, [{ sendMessage: ['nonexistent_id'] }])).toThrow(
      UnresolvedBindingError,
    )
  })

  it('leaves a hand-written action in place', () => {
    const { bot } = client()
    const prototype = createBoundPrototype(
      bot.api,
      [{ sendMessage: ['chat_id'] }],
      new Set(['sendMessage']),
    )

    expect(Object.keys(prototype)).toHaveLength(0)
  })
})

describe('replying with media', () => {
  it('picks the method from the key', async () => {
    const { bot, transport } = client()
    transport.on('sendVideo', ok(SENT))

    bot.onMessage(async (message) => {
      await message.reply({ photo: 'file-id', caption: 'a photo' })
      await message.reply({ video: 'file-id-2' })
    })

    await bot.handleUpdate(messageUpdate())

    expect(transport.last('sendPhoto')?.params).toMatchObject({
      chat_id: CHAT.id,
      photo: 'file-id',
      caption: 'a photo',
      reply_parameters: { message_id: 42 },
    })
    expect(transport.count('sendVideo')).toBe(1)
  })

  it('quotes on reply and does not on send', async () => {
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.send({ photo: 'file-id' })
    })

    await bot.handleUpdate(messageUpdate())

    expect(transport.last('sendPhoto')?.params['reply_parameters']).toBeUndefined()
  })

  it('inherits the topic and connection like a text reply does', async () => {
    const { bot, transport } = client()

    bot.onMessage(async (message) => {
      await message.reply({ document: 'file-id' })
    })

    await bot.handleUpdate(messageUpdate({ message_thread_id: 77, business_connection_id: 'bc' }))

    expect(transport.last('sendDocument')?.params).toMatchObject({
      message_thread_id: 77,
      business_connection_id: 'bc',
    })
  })

  it('names the keys that would have worked when given none of them', async () => {
    const { bot } = client()
    const failures: unknown[] = []

    bot.onMessage(async (message) => {
      await (message.reply as (content: unknown) => Promise<unknown>)({ nonsense: 1 })
    })
    bot.onError((error) => failures.push(error))

    await bot.handleUpdate(messageUpdate())

    expect(String(failures[0])).toMatch(/photo, video/)
  })
})
