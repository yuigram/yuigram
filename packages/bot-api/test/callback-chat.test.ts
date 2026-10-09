// SPDX-License-Identifier: MPL-2.0

/**
 * A button press, keyed the way the messages around it are.
 *
 * A callback query carries no chat of its own: the chat is on the message the
 * button sits on. What keys state by chat and sender — sessions, conversations
 * — has to find it there, or a person's presses and their messages end up in
 * two different sessions and a conversation never hears the press it waits for.
 */

import {
  conversationKey,
  createLogger,
  createSession,
  memory,
  type SessionFlavor,
  silentSink,
  userChatKey,
} from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Update } from '../src/generated/types/index.js'
import {
  callbackQueryUpdate,
  message,
  messageUpdate,
  privateChat,
  user,
} from '../src/testing/fixtures.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'
const ada = user({ id: 7 })
const chat = privateChat({ id: 7 })

function testBot() {
  const transport = mockTransport()
  transport.on('answerCallbackQuery', ok(true))
  return Bot.fromToken<SessionFlavor<{ presses: number; messages: number }>>(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })
}

describe('a button press', () => {
  it('carries the chat of the message its button is on', async () => {
    const bot = testBot()
    const seen: unknown[] = []
    bot.onCallbackQuery((query) => void seen.push(query.chat?.id))

    await bot.handleUpdate(
      callbackQueryUpdate({ from: ada, message: message({ chat }), data: 'x' }),
    )

    expect(seen).toEqual([7])
  })

  it('carries no chat when the button is on an inline message', async () => {
    const bot = testBot()
    const seen: unknown[] = []
    bot.onCallbackQuery((query) => void seen.push('chat' in query ? query.chat : 'absent'))

    const inline = {
      update_id: 1,
      callback_query: {
        id: '1',
        from: ada,
        chat_instance: '1',
        inline_message_id: 'abc',
        data: 'x',
      },
    } as unknown as Update
    await bot.handleUpdate(inline)

    expect(seen).toEqual(['absent'])
  })

  it('shares a session and a conversation with the messages in its chat', async () => {
    const bot = testBot()
    const storage = memory<{ presses: number; messages: number }>()
    const keys: Array<string | undefined> = []
    bot.use(
      createSession({
        storage,
        key: userChatKey,
        initial: () => ({ presses: 0, messages: 0 }),
      }) as never,
    )
    bot.onMessage((event) => {
      event.session.messages += 1
      keys.push(conversationKey(event))
    })
    bot.onCallbackQuery((query) => {
      query.session.presses += 1
      keys.push(conversationKey(query))
    })

    await bot.handleUpdate(messageUpdate({ from: ada, chat, text: 'hi' }))
    await bot.handleUpdate(
      callbackQueryUpdate({ from: ada, message: message({ chat }), data: 'x' }),
    )

    expect(await storage.get('7:7')).toEqual({ presses: 1, messages: 1 })
    expect(keys[0]).toBeDefined()
    expect(keys[1]).toBe(keys[0])
  })
})
