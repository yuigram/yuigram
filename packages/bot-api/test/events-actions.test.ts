/**
 * Context actions.
 *
 * These check what actually reaches Telegram, because every defect in this
 * layer is a message going to the wrong place — a reply landing in the general
 * chat instead of the forum topic it came from, or sent as the bot instead of
 * as the business account.
 *
 * The inheritance cases are the load-bearing ones. They are invisible in a
 * one-to-one chat and immediately wrong everywhere else.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api.js'
import { createEventContext, messageBearingKinds } from '../src/events/create.js'
import type { CallbackQueryContext, MessageContext } from '../src/events/types.js'
import { PAYLOAD_ALIASES } from '../src/generated/contexts.js'
import { UPDATE_EVENTS } from '../src/generated/events.js'
import type { Update } from '../src/generated/types/index.js'
import { normalizeUpdate } from '../src/normalize.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const log = createLogger({ sink: silentSink() })

/** Build a context for an update, through the real normalizer. */
function contextFor(update: unknown) {
  const transport = mockTransport()
  transport.on('sendMessage', ok({ message_id: 99 }))
  transport.on('editMessageText', ok({ message_id: 1 }))
  transport.on('forwardMessage', ok({ message_id: 100 }))
  transport.on('deleteMessage', ok(true))
  transport.on('setMessageReaction', ok(true))
  transport.on('pinChatMessage', ok(true))
  transport.on('unpinChatMessage', ok(true))
  transport.on('answerCallbackQuery', ok(true))

  const api = createApi({ client: transport })
  const context = createEventContext({
    normalized: normalizeUpdate(update as Update),
    api,
    log,
  })

  return { context, transport }
}

/** A plain message in a private chat. */
const plainMessage = {
  update_id: 1,
  message: {
    message_id: 42,
    date: 1,
    chat: { id: -100, type: 'supergroup' },
    from: { id: 7, is_bot: false, first_name: 'A' },
    text: 'hello',
  },
}

describe('reply', () => {
  it('quotes the message it was called on', async () => {
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).reply('hi')

    const params = transport.last('sendMessage')?.params
    expect(params?.['chat_id']).toBe(-100)
    expect(params?.['text']).toBe('hi')
    expect(params?.['reply_parameters']).toMatchObject({ message_id: 42 })
  })

  it('inherits the forum topic', async () => {
    // Without this a reply inside a topic lands in the general chat, which is
    // invisible in a one-to-one chat and wrong in every forum.
    const { context, transport } = contextFor({
      update_id: 1,
      message: { ...plainMessage.message, message_thread_id: 555 },
    })

    await (context as MessageContext).reply('hi')

    expect(transport.last('sendMessage')?.params['message_thread_id']).toBe(555)
  })

  it('inherits the business connection', async () => {
    // Without this a reply on a business account is sent as the bot.
    const { context, transport } = contextFor({
      update_id: 1,
      business_message: { ...plainMessage.message, business_connection_id: 'bc-1' },
    })

    await (context as MessageContext).reply('hi')

    expect(transport.last('sendMessage')?.params['business_connection_id']).toBe('bc-1')
  })

  it('omits the business connection when there is none', async () => {
    // Sending an explicit undefined is not the same as omitting the field.
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).reply('hi')

    expect(transport.last('sendMessage')?.params).not.toHaveProperty('business_connection_id')
  })

  it('lets the caller override an inherited field', async () => {
    const { context, transport } = contextFor({
      update_id: 1,
      message: { ...plainMessage.message, message_thread_id: 555 },
    })

    await (context as MessageContext).reply('hi', { message_thread_id: 777 })

    expect(transport.last('sendMessage')?.params['message_thread_id']).toBe(777)
  })

  it('keeps the quoted message while merging other reply parameters', async () => {
    // The message being replied to is not negotiable; everything else is.
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).reply('hi', {
      reply_parameters: { quote: 'hel', allow_sending_without_reply: true },
    })

    expect(transport.last('sendMessage')?.params['reply_parameters']).toEqual({
      message_id: 42,
      quote: 'hel',
      allow_sending_without_reply: true,
    })
  })
})

describe('send', () => {
  it('goes to the same chat without quoting', async () => {
    // The difference from reply is visible at the call site, which is where a
    // developer notices they quoted when they meant not to.
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).send('hi')

    const params = transport.last('sendMessage')?.params
    expect(params?.['chat_id']).toBe(-100)
    expect(params).not.toHaveProperty('reply_parameters')
  })

  it('still inherits the thread', async () => {
    const { context, transport } = contextFor({
      update_id: 1,
      message: { ...plainMessage.message, message_thread_id: 555 },
    })

    await (context as MessageContext).send('hi')

    expect(transport.last('sendMessage')?.params['message_thread_id']).toBe(555)
  })
})

describe('edit', () => {
  it('addresses the message itself', async () => {
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).edit('changed')

    const params = transport.last('editMessageText')?.params
    expect(params?.['chat_id']).toBe(-100)
    expect(params?.['message_id']).toBe(42)
    expect(params?.['text']).toBe('changed')
  })

  it('does not carry the thread, which does not apply to an edit', async () => {
    const { context, transport } = contextFor({
      update_id: 1,
      message: { ...plainMessage.message, message_thread_id: 555 },
    })

    await (context as MessageContext).edit('changed')

    expect(transport.last('editMessageText')?.params).not.toHaveProperty('message_thread_id')
  })

  it('does carry the business connection', async () => {
    const { context, transport } = contextFor({
      update_id: 1,
      business_message: { ...plainMessage.message, business_connection_id: 'bc-1' },
    })

    await (context as MessageContext).edit('changed')

    expect(transport.last('editMessageText')?.params['business_connection_id']).toBe('bc-1')
  })
})

describe('delete, forward, pin', () => {
  it('deletes the message it was called on', async () => {
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).delete()

    expect(transport.last('deleteMessage')?.params).toMatchObject({
      chat_id: -100,
      message_id: 42,
    })
  })

  it('forwards from this chat to another', async () => {
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).forward(555)

    expect(transport.last('forwardMessage')?.params).toMatchObject({
      from_chat_id: -100,
      chat_id: 555,
      message_id: 42,
    })
  })

  it('pins and unpins', async () => {
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).pin()
    await (context as MessageContext).unpin()

    expect(transport.last('pinChatMessage')?.params).toMatchObject({ message_id: 42 })
    expect(transport.last('unpinChatMessage')?.params).toMatchObject({ message_id: 42 })
  })
})

describe('react', () => {
  it('accepts a bare emoji for the common case', async () => {
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).react('👍')

    expect(transport.last('setMessageReaction')?.params['reaction']).toEqual([
      { type: 'emoji', emoji: '👍' },
    ])
  })

  it('accepts explicit reaction objects for custom emoji', async () => {
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).react([
      { type: 'custom_emoji', custom_emoji_id: 'abc' } as never,
    ])

    expect(transport.last('setMessageReaction')?.params['reaction']).toEqual([
      { type: 'custom_emoji', custom_emoji_id: 'abc' },
    ])
  })

  it('clears the reaction on an empty string', async () => {
    const { context, transport } = contextFor(plainMessage)

    await (context as MessageContext).react('')

    expect(transport.last('setMessageReaction')?.params['reaction']).toEqual([])
  })
})

describe('callback query', () => {
  const callbackUpdate = {
    update_id: 2,
    callback_query: {
      id: 'cbq-1',
      from: { id: 7, is_bot: false, first_name: 'A' },
      chat_instance: 'ci',
      data: 'buy:1',
      // The message the button sits on. Telegram sends this for a button in a
      // chat, and `inline_message_id` instead for one on an inline result.
      message: {
        message_id: 55,
        date: 1,
        chat: { id: -100, type: 'supergroup' },
      },
    },
  }

  it('answers the query it was called on', async () => {
    const { context, transport } = contextFor(callbackUpdate)

    await (context as CallbackQueryContext).answer('done')

    expect(transport.last('answerCallbackQuery')?.params).toMatchObject({
      callback_query_id: 'cbq-1',
      text: 'done',
    })
  })

  it('answers with no text, which is still required to clear the spinner', async () => {
    const { context, transport } = contextFor(callbackUpdate)

    await (context as CallbackQueryContext).answer()

    const params = transport.last('answerCallbackQuery')?.params
    expect(params?.['callback_query_id']).toBe('cbq-1')
    expect(params).not.toHaveProperty('text')
  })

  it('reaches the chat the button lives in', async () => {
    // A button was pressed somewhere, so the kind can send — which is why the
    // actions are on the context rather than behind a check the caller writes.
    const { context, transport } = contextFor(callbackUpdate)

    await (context as unknown as { reply(text: string): Promise<unknown> }).reply('Ordered')

    expect(transport.last('sendMessage')?.params).toMatchObject({
      chat_id: -100,
      text: 'Ordered',
    })
  })

  it('names the reason when the query came from an inline message', async () => {
    // An inline-mode button has an `inline_message_id` and no chat at all, so
    // there is nothing to send to. The error says so; a missing method would
    // only produce a TypeError about `reply`.
    const { context } = contextFor({
      update_id: 1,
      callback_query: {
        id: 'cbq-2',
        from: { id: 7, is_bot: false, first_name: 'A' },
        chat_instance: 'ci',
        inline_message_id: 'inline-1',
        data: 'buy:1',
      },
    } as never)

    await expect(
      (context as unknown as { reply(text: string): Promise<unknown> }).reply('nope'),
    ).rejects.toThrow(/inline message, which has no chat/)
  })

  it('edits an inline message through its own identifier', async () => {
    // The one action that works for both forms, which is what the error above
    // points the caller at.
    const { context, transport } = contextFor({
      update_id: 1,
      callback_query: {
        id: 'cbq-3',
        from: { id: 7, is_bot: false, first_name: 'A' },
        chat_instance: 'ci',
        inline_message_id: 'inline-1',
      },
    } as never)

    await (context as unknown as { edit(text: string): Promise<unknown> }).edit('done')

    expect(transport.last('editMessageText')?.params).toMatchObject({
      inline_message_id: 'inline-1',
      text: 'done',
    })
  })
})

describe('actions are attached only where they apply', () => {
  it('attaches message actions to every message-bearing kind', async () => {
    for (const kind of messageBearingKinds()) {
      // Build the update field name back from the kind the normalizer produces.
      const field =
        {
          message: 'message',
          message_edited: 'edited_message',
          channel_post: 'channel_post',
          channel_post_edited: 'edited_channel_post',
          business_message: 'business_message',
          business_message_edited: 'edited_business_message',
          guest_message: 'guest_message',
        }[kind] ?? kind

      const { context } = contextFor({ update_id: 1, [field]: plainMessage.message })

      expect(context, `${kind} should carry message actions`).toHaveProperty('reply')
      expect(context, `${kind} should carry message actions`).toHaveProperty('react')
    }
  })

  it('does not attach them to an unrelated kind', async () => {
    const { context } = contextFor({
      update_id: 3,
      poll_answer: {
        poll_id: 'p',
        option_ids: [0],
        user: { id: 7, is_bot: false, first_name: 'A' },
      },
    })

    expect(context).not.toHaveProperty('reply')
  })
})

describe('the runtime and the generated types agree', () => {
  it('stores every payload under the alias the types declare', () => {
    // The types say `boostUpdate`; if the runtime wrote `boost`, every access
    // would compile and be undefined. Both now come from one generated table,
    // and this proves the context actually uses it.
    const cases: ReadonlyArray<readonly [string, string, unknown]> = [
      ['message', 'message', plainMessage.message],
      [
        'callback_query',
        'callback_query',
        { id: 'x', from: { id: 1, is_bot: false, first_name: 'A' }, chat_instance: 'ci' },
      ],
      [
        'chat_boost',
        'chat_boost',
        {
          chat: { id: 1, type: 'channel' },
          boost: { boost_id: 'b', add_date: 1, expiration_date: 2, source: {} },
        },
      ],
    ]

    for (const [kind, field, payload] of cases) {
      const { context } = contextFor({ update_id: 1, [field]: payload })
      const alias = (PAYLOAD_ALIASES as Readonly<Record<string, string>>)[
        normalizeUpdate({ update_id: 1, [field]: payload } as Update).kind
      ]

      expect(alias, `${kind} should have a generated alias`).toBeDefined()
      expect(
        (context as unknown as Record<string, unknown>)[alias as string],
        `${kind} should store its payload under '${alias}'`,
      ).toBe(payload)
    }
  })

  it('covers every event kind with an alias', () => {
    // A Telegram release adding a kind must not leave a context with its
    // payload unreachable.
    const aliases = PAYLOAD_ALIASES as Readonly<Record<string, string>>

    for (const kind of Object.keys(UPDATE_EVENTS).map(
      (field) => (UPDATE_EVENTS as Readonly<Record<string, string>>)[field] as string,
    )) {
      expect(aliases[kind], `${kind} has no payload alias`).toBeDefined()
    }
  })

  it('exposes the sender under one name whatever Telegram calls it', () => {
    // `from` on a message, `user` on a poll answer.
    const message = contextFor(plainMessage).context as unknown as Record<string, unknown>
    const answer = contextFor({
      update_id: 1,
      poll_answer: {
        poll_id: 'p',
        option_ids: [0],
        user: { id: 7, is_bot: false, first_name: 'A' },
      },
    }).context as unknown as Record<string, unknown>

    expect((message['sender'] as { id: number }).id).toBe(7)
    expect((answer['sender'] as { id: number }).id).toBe(7)
  })

  it('does not let a payload field shadow the discriminant', () => {
    // A payload carrying a field called `kind` must not overwrite the event
    // kind the dispatcher routed on.
    const { context } = contextFor({
      update_id: 1,
      message: { ...plainMessage.message, kind: 'not-a-real-kind' },
    })

    expect(context.kind).toBe('message')
  })
})
