// SPDX-License-Identifier: MPL-2.0

/**
 * What a registration may say its handler receives.
 *
 * An application's own type has to describe every event any of its clients can
 * produce, which is wider than any one registration — a poll answer carries no
 * message to answer — so a registration names what its kinds actually carry.
 * That is a claim the caller makes, and the constraint is what keeps it a claim
 * about an event rather than about anything at all: without one, naming a type
 * unrelated to a context would compile and hand a handler something the
 * compiler had been told was a `string`.
 *
 * Everything here is a compile-time assertion. There is nothing to run.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  Account,
  AnyEventContext,
  Bot,
  MessageContext,
  MtprotoContext,
  SessionFlavor,
  UnifiedContext,
} from '../src/index.js'
import { App } from '../src/index.js'

declare const bot: Bot
declare const user: Account

/** What an application holding both kinds of client is typed as. */
type Both = AnyEventContext | MtprotoContext

describe('a registration that says nothing', () => {
  it('receives what the application was declared with', () => {
    const app = new App<Both>()
    app.on('message', (event) => expectTypeOf(event).toEqualTypeOf<Both>())
    app.once('message', (event) => expectTypeOf(event).toEqualTypeOf<Both>())
  })

  it('is unchanged for an application holding one kind of client', () => {
    const bots = new App<AnyEventContext>()
    bots.add(bot)
    bots.on('message', (event) => expectTypeOf(event).toEqualTypeOf<AnyEventContext>())

    const accounts = new App<MtprotoContext>()
    accounts.add(user)
    accounts.on('message', (event) => expectTypeOf(event).toEqualTypeOf<MtprotoContext>())
  })
})

describe('a registration that names what its kinds carry', () => {
  it('takes the unified surface', () => {
    const app = new App<Both>()
    app.add(bot)
    app.add(user)

    app.on<UnifiedContext>('message', async (event) => {
      expectTypeOf(event).toEqualTypeOf<UnifiedContext>()
      await event.reply('answered')
      await event.react('🔥')
    })
  })

  it('takes the unified surface for a handler that runs once', () => {
    const app = new App<Both>()
    app.once<UnifiedContext>('message', async (event) => {
      await event.reply('answered')
    })
  })

  it('takes a context belonging to one transport', () => {
    const app = new App<Both>()
    app.on<MessageContext>('message', (event) => {
      expectTypeOf(event.updateId).toEqualTypeOf<number>()
    })
    app.on<MtprotoContext>('message', (event) => {
      expectTypeOf(event.transport).toEqualTypeOf<'mtproto'>()
    })
  })

  it('takes a context a plugin has extended', () => {
    // The constraint must not reject what an application actually writes: a
    // flavour intersected onto a context is still an event.
    const app = new App<Both>()
    app.on<UnifiedContext & SessionFlavor<{ count: number }>>('message', (event) => {
      expectTypeOf(event.session.count).toEqualTypeOf<number>()
    })
  })
})

describe('a registration that names something that is not an event', () => {
  it('refuses a primitive', () => {
    const app = new App<Both>()

    // @ts-expect-error a string is not an event, and the handler would be given
    // an object while the compiler had been told otherwise.
    app.on<string>('message', () => {})
    // @ts-expect-error the same, for a handler that runs once.
    app.once<string>('message', () => {})
  })

  it('refuses an unrelated object', () => {
    const app = new App<Both>()

    // @ts-expect-error nothing dispatched carries this, so no event could ever
    // satisfy it.
    app.on<{ alsoNonsense: number }>('message', () => {})
  })

  it('refuses a shape whose discriminator is the wrong type', () => {
    const app = new App<Both>()

    // @ts-expect-error every dispatched event is discriminated by a string.
    app.on<{ kind: number }>('message', () => {})
  })
})
