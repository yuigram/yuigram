// SPDX-License-Identifier: MIT

/**
 * The surface a handler installed across clients is written against.
 *
 * The claim Phase 10 rests on: one registration, both transports, and the
 * common operations reachable without first asking which transport it is. If
 * this stops holding, a handler that used to work starts needing a branch.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  Account,
  AnyEventContext,
  BaseContext,
  Bot,
  ContextActions,
  MessageContext,
  MtprotoContext,
  UnifiedContext,
} from '../src/index.js'
import { App } from '../src/index.js'

declare const bot: Bot
declare const user: Account

describe('what both transports agree on', () => {
  it('lets an account satisfy the unified surface', () => {
    expectTypeOf<MtprotoContext>().toExtend<UnifiedContext>()
  })

  it('lets a bot message satisfy the unified surface', () => {
    // Assignability in the direction that matters: a bot's message context can
    // stand where the unified surface is expected.
    const held: UnifiedContext = {} as MessageContext
    expectTypeOf(held).not.toBeAny()
  })

  it('is an action surface rather than an entity model', () => {
    // Neither peer model, and neither timestamp. Those stay where they are
    // modelled and are reached by narrowing.
    expectTypeOf<UnifiedContext>().not.toHaveProperty('chat')
    expectTypeOf<UnifiedContext>().not.toHaveProperty('sender')
    expectTypeOf<UnifiedContext>().not.toHaveProperty('date')
  })

  it('carries the two operations and the text they act on', () => {
    expectTypeOf<UnifiedContext['text']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<ContextActions['reply']>().toBeFunction()
    expectTypeOf<ContextActions['react']>().toBeFunction()
  })

  it('keeps the client structural', () => {
    expectTypeOf<UnifiedContext['client']>().toEqualTypeOf<{ readonly name: string }>()
  })
})

describe('an application written against it', () => {
  it('holds a client of either kind', () => {
    // The application's own type has to describe every event any client can
    // produce, which is wider than the unified surface: a poll answer carries
    // no message to answer.
    const app = new App<AnyEventContext | MtprotoContext>()
    app.add(bot)
    app.add(user)
    expectTypeOf(app).not.toBeAny()
  })

  it('answers either of them without asking which', () => {
    const app = new App<AnyEventContext | MtprotoContext>()
    app.add(bot)
    app.add(user)
    app.on<UnifiedContext>('message', async (event) => {
      // No branch on `transport` anywhere in here. That is the whole claim.
      await event.reply(`heard on ${event.transport}`)
      await event.react('👍')
      expectTypeOf(event.text).toEqualTypeOf<string | undefined>()
      expectTypeOf(event.client.name).toEqualTypeOf<string>()
    })
  })

  it('describes every client by default, so application middleware can log', () => {
    // No type argument. Every event either subsystem produces carries the
    // base context, so that is what a container assumes when told nothing —
    // enough to log and route without naming the union.
    const app = new App()
    app.add(bot)
    app.add(user)
    app.use(async (event, next) => {
      expectTypeOf(event).toEqualTypeOf<BaseContext>()
      event.log.info('handled', { client: event.client.name, kind: event.kind })
      await next()
    })
    app.onError(({ client, error }) => {
      expectTypeOf(client.name).toEqualTypeOf<string>()
      expectTypeOf(error).toBeUnknown()
    })
  })

  it('still lets a handler narrow when it wants what only one has', () => {
    const app = new App<AnyEventContext | MtprotoContext>()
    app.on('message', (event) => {
      if (event.transport === 'mtproto') expectTypeOf(event).toExtend<MtprotoContext>()
    })
  })
})
