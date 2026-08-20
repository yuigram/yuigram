/**
 * Handler and middleware ergonomics.
 *
 * These assert that the most natural way to write the most common handler
 * bodies actually typechecks. A `void` return type rejects
 * `(ctx) => ctx.reply('hi')` for returning the message it just sent, which is
 * the single most common line in any Telegram bot.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { Dispatcher } from '../src/dispatch/index.js'
import type { Handler, Middleware } from '../src/index.js'

interface Ctx {
  kind: string
  reply(text: string): Promise<{ message_id: number }>
}

describe('Handler', () => {
  it('accepts an expression body returning a promise', () => {
    const handler: Handler<Ctx> = (ctx) => ctx.reply('hi')
    expectTypeOf(handler).toBeFunction()
  })

  it('accepts an expression body returning a value', () => {
    const seen: string[] = []
    // `Array.push` returns a number; requiring void would reject this.
    const handler: Handler<Ctx> = (ctx) => seen.push(ctx.kind)
    expectTypeOf(handler).toBeFunction()
  })

  it('accepts a plain block body', () => {
    const handler: Handler<Ctx> = () => {}
    expectTypeOf(handler).toBeFunction()
  })

  it('accepts an async body', () => {
    const handler: Handler<Ctx> = async (ctx) => {
      await ctx.reply('hi')
    }
    expectTypeOf(handler).toBeFunction()
  })
})

describe('Middleware', () => {
  it('accepts an expression body returning next()', () => {
    const middleware: Middleware<Ctx> = (_ctx, next) => next()
    expectTypeOf(middleware).toBeFunction()
  })

  it('accepts an async body', () => {
    const middleware: Middleware<Ctx> = async (_ctx, next) => {
      await next()
    }
    expectTypeOf(middleware).toBeFunction()
  })
})

describe('registration', () => {
  it('accepts every body shape at the call site', () => {
    const dispatcher = new Dispatcher<Ctx>()

    dispatcher.on('message', (ctx) => ctx.reply('hi'))
    dispatcher.on('message', () => {})
    dispatcher.on('message', async () => {})
    dispatcher.use((_ctx, next) => next())

    expectTypeOf(dispatcher.on).toBeFunction()
  })
})
