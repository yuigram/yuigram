// SPDX-License-Identifier: MIT

/**
 * Events the application raises.
 *
 * An emitted event is meant to get everything an update gets — plugins,
 * middleware, sessions, routing, error handling, a clean stop — and nothing
 * that makes it one: no update identifier, no subscription, no effect on
 * polling. Each case checks one side of that line.
 */

import {
  type CustomEvent,
  createLogger,
  createSession,
  defineEvent,
  definePlugin,
  memory,
  type SessionFlavor,
  silentSink,
  userChatKey,
  ValidationError,
} from '@yuigram/core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

function testBot(options: { allowedUpdates?: 'auto' } = {}) {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))
  transport.on('getUpdates', ok([]))
  transport.on('deleteWebhook', ok(true))
  const bot = Bot.fromToken(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
    ...options,
  })
  return { bot, transport }
}

const orderPaid = defineEvent<{ orderId: string; amount: number }>('order_paid')
const reminderDue = defineEvent<{ text: string }>('reminder_due')

describe('raising an event', () => {
  it('reaches its handlers with the payload it was raised with, and no one else’s', async () => {
    const { bot } = testBot()
    const seen: unknown[] = []

    bot.on(orderPaid, (event) => {
      expectTypeOf(event.payload).toEqualTypeOf<{ orderId: string; amount: number }>()
      seen.push(['paid', event.payload.orderId, event.payload.amount, event.transport])
    })
    bot.on(reminderDue, (event) => void seen.push(['reminder', event.payload.text]))
    bot.onMessage(() => void seen.push('a message handler'))

    await bot.emit(orderPaid, { orderId: 'A-17', amount: 500 })

    expect(seen).toEqual([['paid', 'A-17', 500, 'custom']])
  })

  it('runs the bot’s middleware around it, which can tell it from an update', async () => {
    const { bot } = testBot()
    const trail: string[] = []

    bot.use(async (event, next) => {
      trail.push(`> ${event.transport} ${event.kind}`)
      await next()
      trail.push('<')
    })
    bot.on(orderPaid, (event) => {
      const custom = event as unknown as CustomEvent<unknown>
      trail.push(`handler, update id: ${String((custom.raw as { update_id?: number }).update_id)}`)
    })

    await bot.emit(orderPaid, { orderId: 'A', amount: 1 })

    expect(trail).toEqual(['> custom order_paid', 'handler, update id: undefined', '<'])
  })

  it('installs the bot’s plugins first, as an update would', async () => {
    const { bot } = testBot()
    const trail: string[] = []
    bot.extend(
      definePlugin<'marker', undefined, Bot>({
        name: 'marker',
        install: (target) => {
          target.use(async (_event, next) => {
            trail.push('plugin middleware')
            await next()
          })
          return undefined
        },
      }),
    )
    bot.on(orderPaid, () => void trail.push('handler'))

    await bot.emit(orderPaid, { orderId: 'A', amount: 1 })

    expect(trail).toEqual(['plugin middleware', 'handler'])
  })

  it('loads the session of whoever it names', async () => {
    const { bot: plain } = testBot()
    const bot = plain as unknown as Bot<SessionFlavor<{ paid: number }>>
    const storage = memory<{ paid: number }>()
    bot.use(createSession({ storage, key: userChatKey, initial: () => ({ paid: 0 }) }) as never)
    bot.on(orderPaid, (event) => {
      event.session.paid += event.payload.amount
    })

    await bot.emit(orderPaid, { orderId: 'A', amount: 5 }, { chat: { id: 42 }, sender: { id: 42 } })
    await bot.emit(orderPaid, { orderId: 'B', amount: 7 }, { chat: { id: 42 }, sender: { id: 42 } })

    expect(await storage.get('42:42')).toEqual({ paid: 12 })
  })
})

describe('when a handler fails', () => {
  it('hands the error to the bot’s error handler, and the emit still resolves', async () => {
    const { bot } = testBot()
    const caught: unknown[] = []
    const failure = new Error('the ledger is unavailable')
    bot.onError((error) => void caught.push(error))
    bot.on(orderPaid, () => {
      throw failure
    })

    await expect(bot.emit(orderPaid, { orderId: 'A', amount: 1 })).resolves.toBeUndefined()
    expect(caught).toEqual([failure])
  })
})

describe('what it is not', () => {
  it('refuses a kind Telegram also sends', () => {
    const { bot } = testBot()

    expect(() => bot.on(defineEvent('message'), () => undefined)).toThrow(ValidationError)
    expect(() => bot.on(defineEvent('callback_query'), () => undefined)).toThrow(
      /a kind of update Telegram sends/,
    )
    expect(() => defineEvent('Not A Kind')).toThrow(ValidationError)
  })

  it('is left out of the updates a bot subscribes to', async () => {
    const { bot, transport } = testBot({ allowedUpdates: 'auto' })
    bot.onMessage(() => undefined)
    bot.on(orderPaid, () => undefined)

    await bot.poll()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await bot.stop({ timeout: 100 })

    expect(transport.last('getUpdates')?.params['allowed_updates']).toEqual(['message'])
  })

  it('is waited for when the bot stops', async () => {
    const { bot } = testBot()
    let finished = false
    bot.on(reminderDue, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      finished = true
    })

    const emitted = bot.emit(reminderDue, { text: 'stand up' })
    await bot.stop()

    expect(finished).toBe(true)
    await emitted
  })
})
