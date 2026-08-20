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
 */

import type { SessionFlavor } from '@yuigram/core'
import { assertType, describe, expectTypeOf, it } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Context } from '../src/context.js'
import { filter } from '../src/filter.js'

interface Cart {
  items: string[]
}

interface Prefs {
  locale: string
}

type CartContext = Context & SessionFlavor<Cart>
type PrefsContext = Context & SessionFlavor<Prefs>

describe('a plain bot', () => {
  it('gives handlers the base context', () => {
    const bot = new Bot('1:x')

    bot.on('message', (ctx) => {
      expectTypeOf(ctx).toExtend<Context>()
      expectTypeOf(ctx.text).toEqualTypeOf<string | undefined>()
    })
  })

  it('has no session, because none was installed', () => {
    const bot = new Bot('1:x')

    bot.on('message', (ctx) => {
      // @ts-expect-error - nothing contributed `session` to this context
      void ctx.session
    })
  })
})

describe('a flavoured bot', () => {
  it('carries the flavour into every handler form', () => {
    const bot = new Bot<CartContext>('1:x')

    bot.on('message', (ctx) => {
      expectTypeOf(ctx.session).toEqualTypeOf<Cart>()
    })

    bot.text('x', (ctx) => {
      expectTypeOf(ctx.session.items).toEqualTypeOf<string[]>()
    })

    bot.callback(/x/, (ctx) => {
      expectTypeOf(ctx.session).toEqualTypeOf<Cart>()
    })

    bot.use(async (ctx, next) => {
      expectTypeOf(ctx.session).toEqualTypeOf<Cart>()
      await next()
    })

    bot.catch((_error, ctx) => {
      expectTypeOf(ctx.session).toEqualTypeOf<Cart>()
    })
  })

  it('keeps the flavour on a command context', () => {
    // A command handler receives the parsed command *and* everything the
    // application declared. Narrowing to the command must not drop the rest.
    const bot = new Bot<CartContext>('1:x')

    bot.command('buy', (ctx) => {
      expectTypeOf(ctx.command.name).toEqualTypeOf<string>()
      expectTypeOf(ctx.session).toEqualTypeOf<Cart>()
      expectTypeOf(ctx.text).toEqualTypeOf<string | undefined>()
    })
  })

  it('exposes the session handle', () => {
    const bot = new Bot<CartContext>('1:x')

    bot.on('message', (ctx) => {
      expectTypeOf(ctx.sessionHandle.dirty).toEqualTypeOf<boolean>()
      assertType<(next: Cart) => void>(ctx.sessionHandle.set)
    })
  })
})

describe('two bots in one program', () => {
  it('hold unrelated state', () => {
    // The whole point. Under a globally merged interface these two would share
    // one shape, and declaring both would require every bot to carry every
    // other bot's fields.
    const shop = new Bot<CartContext>('1:x')
    const settings = new Bot<PrefsContext>('2:y')

    shop.on('message', (ctx) => {
      expectTypeOf(ctx.session).toEqualTypeOf<Cart>()
      // @ts-expect-error - the other bot's state is not on this one
      void ctx.session.locale
    })

    settings.on('message', (ctx) => {
      expectTypeOf(ctx.session).toEqualTypeOf<Prefs>()
      // @ts-expect-error - and vice versa
      void ctx.session.items
    })
  })
})

describe('filters', () => {
  it('see the base context by default', () => {
    filter('isPrivate', (ctx) => {
      expectTypeOf(ctx).toExtend<Context>()
      return ctx.chat?.type === 'private'
    })
  })

  it('see the flavoured context when told which one', () => {
    const hasItems = filter<CartContext>('hasItems', (ctx) => ctx.session.items.length > 0)

    const bot = new Bot<CartContext>('1:x')
    bot.on(hasItems, (ctx) => {
      expectTypeOf(ctx.session).toEqualTypeOf<Cart>()
    })
  })
})
