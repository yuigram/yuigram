/**
 * The bound-method surface, at the type level.
 *
 * The runtime tests prove the right values are sent. These prove the signatures
 * are worth having: a supplied parameter is optional rather than absent, a
 * parameter the context cannot know is still required, and the return type
 * survives the binding. None of that is observable at runtime, and all of it is
 * what makes a hundred generated methods usable rather than merely present.
 */

import { assertType, describe, expectTypeOf, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { MessageContext } from '../src/events/index.js'
import type { Message } from '../src/generated/types/index.js'

const bot = Bot.fromToken('1:x')

describe('supplied parameters', () => {
  it('drops the requirement without removing the parameter', () => {
    bot.onMessage((message) => {
      // The chat comes from the update, so naming it is unnecessary…
      assertType<Promise<Message>>(message.sendMessage({ text: 'hi' }))
      // …but still allowed, for the case where a handler means somewhere else.
      assertType<Promise<Message>>(message.sendMessage({ chat_id: 5, text: 'hi' }))
    })
  })

  it('keeps a parameter the context cannot know required', () => {
    bot.onMessage((message) => {
      // @ts-expect-error `user_id` names a person the update did not identify.
      message.banChatMember({})
      assertType<Promise<true>>(message.banChatMember({ user_id: 7 }))
    })
  })

  it('makes the whole argument optional once nothing is left to supply', () => {
    bot.onMessage((message) => {
      assertType<Promise<true>>(message.deleteMessage())
      assertType<Promise<true>>(message.deleteMessage({ chat_id: 9 }))
    })
  })

  it('preserves the return type of the method it binds', () => {
    bot.onMessage((message) => {
      expectTypeOf(message.sendPhoto).returns.toEqualTypeOf<Promise<Message>>()
      expectTypeOf(message.getChatMemberCount).returns.toEqualTypeOf<Promise<number>>()
      expectTypeOf(message.leaveChat).returns.toEqualTypeOf<Promise<true>>()
    })
  })

  it('still accepts per-call options', () => {
    bot.onMessage((message) => {
      assertType<Promise<Message>>(
        message.sendMessage({ text: 'hi' }, { signal: AbortSignal.timeout(1_000) }),
      )
    })
  })
})

describe('relocation', () => {
  it('requires the destination and supplies the source', () => {
    bot.onMessage((message) => {
      // @ts-expect-error the destination is the caller's to choose.
      message.forwardMessage({})
      assertType<Promise<Message>>(message.forwardMessage({ chat_id: 999 }))
    })
  })
})

describe('what a kind does and does not carry', () => {
  it('gives a callback query its answer method', () => {
    bot.onCallbackQuery((query) => {
      assertType<Promise<true>>(query.answerCallbackQuery({ text: 'ok' }))
    })
  })

  it('does not put chat methods on a context with no chat', () => {
    bot.on('poll_answer', (event) => {
      // @ts-expect-error a poll answer addresses no chat, so nothing is bound.
      event.sendMessage({ text: 'nowhere' })
    })
  })

  it('does not put message methods on an inline query', () => {
    bot.on('inline_query', (query) => {
      assertType<Promise<true>>(query.answerInlineQuery({ results: [] }))
      // @ts-expect-error an inline query has no chat to send to.
      query.sendMessage({ text: 'nowhere' })
    })
  })
})

describe('composition with the curated actions', () => {
  it('keeps both layers on the same context', () => {
    bot.onMessage((message) => {
      // Hand-written, named for the operation rather than for the method, and
      // overloaded so text and media are one entry point.
      assertType<Promise<Message>>(message.reply('text'))
      assertType<Promise<Message>>(message.reply({ photo: 'id' }))
      // Generated, named for the method it binds.
      expectTypeOf(message.setMessageReaction).toBeFunction()
    })
  })

  it('is reachable from the exported context type', () => {
    expectTypeOf<MessageContext>().toHaveProperty('banChatMember')
    expectTypeOf<MessageContext>().toHaveProperty('reply')
  })
})
