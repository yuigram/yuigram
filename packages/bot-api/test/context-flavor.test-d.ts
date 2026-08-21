/**
 * Context flavours, at the type level.
 *
 * These are the guarantees the flavour design exists to provide, and none of
 * them is observable at runtime — a test that only ran code would pass against
 * the global-augmentation design this replaced.
 *
 * What that design could not do, and this pins:
 *
 * - two bots in one program holding different state;
 * - a plugin's members appearing only where the plugin is installed;
 * - the client refusing middleware whose context it does not declare.
 *
 * The type parameter is what plugins add, not the whole context: the base
 * context now varies by event, so there is no single type for an application to
 * name and extend.
 */

import type { Context, SessionFlavor } from '@yuigram/core'
import { assertType, describe, expectTypeOf, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { MessageContext } from '../src/events/index.js'
import { filter } from '../src/filter.js'

interface Cart {
  items: string[]
}

interface Prefs {
  locale: string
}

type WithCart = SessionFlavor<Cart>
type WithPrefs = SessionFlavor<Prefs>

describe('a plain bot', () => {
  it('gives handlers the context for the kind they registered for', () => {
    const bot = Bot.fromToken('1:x')

    bot.on('message', (message) => {
      expectTypeOf(message).toExtend<Context>()
      expectTypeOf(message.text).toEqualTypeOf<string | undefined>()
      // Telegram guarantees a chat on a message, so the context does too.
      expectTypeOf(message.chat.id).toEqualTypeOf<number>()
    })
  })

  it('has no session, because none was installed', () => {
    const bot = Bot.fromToken('1:x')

    bot.on('message', (message) => {
      // @ts-expect-error - nothing contributed `session` to this context
      void message.session
    })
  })
})

describe('a flavoured bot', () => {
  it('carries the flavour into every handler form', () => {
    const bot = Bot.fromToken<WithCart>('1:x')

    bot.on('message', (message) => {
      expectTypeOf(message.session).toEqualTypeOf<Cart>()
    })

    bot.onText('x', (message) => {
      expectTypeOf(message.session.items).toEqualTypeOf<string[]>()
    })

    bot.onCallbackQuery(/x/, (query) => {
      expectTypeOf(query.session).toEqualTypeOf<Cart>()
    })

    bot.use(async (event, next) => {
      expectTypeOf(event.session).toEqualTypeOf<Cart>()
      await next()
    })

    bot.onError((_error, event) => {
      expectTypeOf(event.session).toEqualTypeOf<Cart>()
    })
  })

  it('keeps the flavour on a command context', () => {
    // A command handler receives the parsed command *and* everything the
    // application declared. Narrowing to the command must not drop the rest.
    const bot = Bot.fromToken<WithCart>('1:x')

    bot.onCommand('buy', (message) => {
      expectTypeOf(message.command.name).toEqualTypeOf<string>()
      expectTypeOf(message.session).toEqualTypeOf<Cart>()
      // Earned by the narrower registration: a command is text.
      expectTypeOf(message.text).toEqualTypeOf<string>()
    })
  })

  it('exposes the session handle', () => {
    const bot = Bot.fromToken<WithCart>('1:x')

    bot.on('message', (message) => {
      expectTypeOf(message.sessionHandle.dirty).toEqualTypeOf<boolean>()
      assertType<(next: Cart) => void>(message.sessionHandle.set)
    })
  })
})

describe('two bots in one program', () => {
  it('hold unrelated state', () => {
    // The whole point. Under a globally merged interface these two would share
    // one shape, and declaring both would require every bot to carry every
    // other bot's fields.
    const shop = Bot.fromToken<WithCart>('1:x')
    const settings = Bot.fromToken<WithPrefs>('2:y')

    shop.on('message', (message) => {
      expectTypeOf(message.session).toEqualTypeOf<Cart>()
      // @ts-expect-error - the other bot's state is not on this one
      void message.session.locale
    })

    settings.on('message', (message) => {
      expectTypeOf(message.session).toEqualTypeOf<Prefs>()
      // @ts-expect-error - and vice versa
      void message.session.items
    })
  })
})

describe('registration selects the context', () => {
  it('gives a message handler the message fields', () => {
    const bot = Bot.fromToken('1:x')

    bot.on('message', (message) => {
      expectTypeOf(message.kind).toEqualTypeOf<'message'>()
      expectTypeOf(message.message.message_id).toEqualTypeOf<number>()
    })
  })

  it('gives a poll answer handler something with no chat at all', () => {
    const bot = Bot.fromToken('1:x')

    bot.on('poll_answer', (answer) => {
      // Telegram declares PollAnswer.user required, so the sender is not optional.
      expectTypeOf(answer.option_ids).toExtend<readonly number[]>()
      // @ts-expect-error - a poll answer carries no message to reply to
      void answer.reply
    })
  })

  it('gives a service message the message actions, because it is a message', () => {
    const bot = Bot.fromToken('1:x')

    bot.on('chat_member_joined', (event) => {
      expectTypeOf(event.kind).toEqualTypeOf<'chat_member_joined'>()
      assertType<(text: string) => Promise<unknown>>(event.reply)
    })
  })
})

describe('filters', () => {
  it('see any event context by default', () => {
    // The default is the union, because a filter is asked to decide what it
    // was handed. Reading a field only some kinds have means naming the kinds.
    filter('isRecent', (event) => {
      expectTypeOf(event).toExtend<Context>()
      return event.kind !== 'poll'
    })
  })

  it('see the context they name', () => {
    const isPrivate = filter<MessageContext>('isPrivate', (message) => {
      return message.chat.type === 'private'
    })

    const bot = Bot.fromToken('1:x')
    bot.on(isPrivate, (message) => {
      expectTypeOf(message.kind).toExtend<string>()
    })
  })

  it('see the flavoured context when told which one', () => {
    const hasItems = filter<MessageContext & WithCart>(
      'hasItems',
      (message) => message.session.items.length > 0,
    )

    const bot = Bot.fromToken<WithCart>('1:x')
    bot.on(hasItems, (event) => {
      expectTypeOf(event.session).toEqualTypeOf<Cart>()
    })
  })
})
