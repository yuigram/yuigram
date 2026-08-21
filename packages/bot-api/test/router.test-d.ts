/**
 * Routers, at the type level.
 *
 * The property worth having is the one a runtime test cannot show: a router
 * declares what it needs every context to carry, and a client that does not
 * provide it cannot install the router. That compile error is what replaces
 * discovering in production that `session` is undefined inside a module nobody
 * checked.
 */

import type { SessionFlavor } from '@yuigram/core'
import { assertType, describe, expectTypeOf, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Chat, Message } from '../src/generated/types/index.js'
import { Router } from '../src/router.js'

interface Cart {
  items: string[]
}

interface Locale {
  locale: string
}

type WithCart = SessionFlavor<Cart>

describe('what a router hands its handlers', () => {
  it('types by kind, exactly as the client does', () => {
    const router = new Router()

    router.onMessage((message) => {
      expectTypeOf(message.kind).toEqualTypeOf<'message'>()
      expectTypeOf(message.chat).toEqualTypeOf<Chat>()
      assertType<Promise<Message>>(message.reply('hi'))
    })

    router.onCommand('ban', (message) => {
      expectTypeOf(message.command.name).toEqualTypeOf<string>()
      expectTypeOf(message.text).toEqualTypeOf<string>()
    })

    router.onPollAnswer((event) => {
      // @ts-expect-error a poll answer is not a message and cannot reply.
      event.reply('nowhere')
    })
  })

  it('carries the bound methods a context has', () => {
    const router = new Router()

    router.onMessage((message) => {
      assertType<Promise<true>>(message.banChatMember({ user_id: 1 }))
    })
  })

  it('carries what the router declares plugins add', () => {
    const router = new Router<WithCart>()

    router.onMessage((message) => {
      expectTypeOf(message.session.items).toEqualTypeOf<string[]>()
    })
  })
})

describe('installing', () => {
  it('accepts a router asking for nothing', () => {
    const bot = Bot.fromToken('1:x')
    expectTypeOf(bot.extend(new Router())).toEqualTypeOf<typeof bot>()
  })

  it('accepts a router whose needs the client meets', () => {
    const bot = Bot.fromToken<WithCart>('1:x')
    bot.extend(new Router<WithCart>())
  })

  it('accepts a router needing less than the client provides', () => {
    // A client with sessions and locales can host a router that only wants
    // sessions: the handler is handed more than it asked for, which is safe.
    const bot = Bot.fromToken<WithCart & Locale>('1:x')
    bot.extend(new Router<WithCart>())
  })

  it('refuses a router needing more than the client provides', () => {
    const bot = Bot.fromToken('1:x')

    // @ts-expect-error the client installs no session, so `message.session`
    // inside this router would be undefined at runtime.
    bot.extend(new Router<WithCart>())
  })
})

describe('the surface', () => {
  it('chains like the client does', () => {
    const router = new Router()
    expectTypeOf(router.onMessage(() => {})).toEqualTypeOf<typeof router>()
  })

  it('has the generated registrations the client has', () => {
    expectTypeOf<Router>().toHaveProperty('onChatMemberJoined')
    expectTypeOf<Router>().toHaveProperty('onForumTopicCreated')
    expectTypeOf<Router>().toHaveProperty('onMessageEdited')
  })

  it('has no lifecycle of its own', () => {
    // A router is mounted, not run: `poll`, `webhook` and `stop` belong to the
    // client that owns the connection.
    expectTypeOf<Router>().not.toHaveProperty('poll')
    expectTypeOf<Router>().not.toHaveProperty('webhook')
    expectTypeOf<Router>().not.toHaveProperty('stop')
  })
})
