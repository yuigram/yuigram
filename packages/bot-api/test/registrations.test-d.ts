/**
 * Named registrations, at the type level.
 *
 * The point of generating seventy-nine of them is that each one types its
 * handler for exactly the kind it names. A registration that handed back a
 * widened context would be worse than no registration at all: it would look
 * specific and behave generally, which is the failure the per-event contexts
 * exist to remove.
 */

import type { SessionFlavor } from '@yuigram/core'
import { assertType, describe, expectTypeOf, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Chat, Message, User } from '../src/generated/types/index.js'

const bot = Bot.fromToken('1:x')

describe('what a named registration hands back', () => {
  it('types a message kind as a message', () => {
    bot.onMessage((message) => {
      expectTypeOf(message.kind).toEqualTypeOf<'message'>()
      expectTypeOf(message.chat).toEqualTypeOf<Chat>()
      expectTypeOf(message.text).toEqualTypeOf<string | undefined>()
      assertType<Promise<Message>>(message.reply('hi'))
    })
  })

  it('distinguishes an edit from a new message by its kind', () => {
    bot.onMessageEdited((message) => {
      expectTypeOf(message.kind).toEqualTypeOf<'message_edited'>()
    })
  })

  it('gives a promoted service kind the message surface it still has', () => {
    // A member joining is delivered as a message in an ordinary chat, so it can
    // answer. Deciding otherwise by kind is what once left exactly these
    // updates without `reply`.
    bot.onChatMemberJoined((event) => {
      expectTypeOf(event.kind).toEqualTypeOf<'chat_member_joined'>()
      assertType<Promise<Message>>(event.reply('welcome'))
      expectTypeOf(event.new_chat_members).toEqualTypeOf<User[] | undefined>()
    })
  })

  it('gives a non-message kind only what it carries', () => {
    bot.onPollAnswer((event) => {
      expectTypeOf(event.kind).toEqualTypeOf<'poll_answer'>()
      expectTypeOf(event.answer.poll_id).toEqualTypeOf<string>()
      // @ts-expect-error a poll answer is not a message and cannot reply.
      event.reply('nowhere')
    })
  })

  it('carries the client extensions like on() does', () => {
    const withSession = Bot.fromToken<SessionFlavor<{ count: number }>>('1:x')

    withSession.onMessage((message) => {
      expectTypeOf(message.session.count).toEqualTypeOf<number>()
    })

    withSession.onChatMemberJoined((event) => {
      expectTypeOf(event.session.count).toEqualTypeOf<number>()
    })
  })
})

describe('the shape of the surface', () => {
  it('chains, so registrations compose in one expression', () => {
    expectTypeOf(bot.onMessage(() => {})).toEqualTypeOf<typeof bot>()
  })

  it('does not offer a name for a kind that needs matching', () => {
    // `onCallbackQuery` is hand-written because it accepts a data pattern; the
    // generator must not have claimed the name with a plain delegation.
    expectTypeOf(bot.onCallbackQuery).parameters.toExtend<[string | RegExp, unknown] | [unknown]>()
  })

  it('has dropped the name that disagreed with its own kind', () => {
    // The kind is `message_edited`, so the registration is `onMessageEdited`.
    // `onEditedMessage` said the opposite and is gone.
    expectTypeOf(bot).not.toHaveProperty('onEditedMessage')
    expectTypeOf(bot).toHaveProperty('onMessageEdited')
  })
})
