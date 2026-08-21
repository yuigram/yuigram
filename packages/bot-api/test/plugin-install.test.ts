/**
 * When plugins install.
 *
 * Installation used to happen in `poll()`, which meant a webhook deployment —
 * the production shape — never installed anything. `bot.extend(session(…))`
 * compiled, ran, and did nothing, with no error to say so. Installation belongs
 * to dispatch, because dispatch is what every transport has in common.
 */

import { createLogger, definePlugin, silentSink } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Update } from '../src/generated/types/index.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

function testBot() {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))
  transport.on('getUpdates', ok([]))
  transport.on('sendMessage', ok({ message_id: 1, date: 1, chat: { id: 1, type: 'private' } }))

  const bot = Bot.fromToken(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })

  return { bot, transport }
}

function update(id = 1): Update {
  return {
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 1, type: 'private' }, text: 'hi' },
  } as unknown as Update
}

/** A plugin that records how often it was installed. */
function counter(install: () => void) {
  return definePlugin<'counter', undefined, Bot>({
    name: 'counter',
    install: () => {
      install()
      return undefined
    },
  })
}

describe('installation happens once, whatever the transport', () => {
  it('installs before the first update a webhook delivers', async () => {
    const { bot } = testBot()
    const install = vi.fn()

    bot.extend(counter(install))
    const handler = bot.webhook()

    expect(install).not.toHaveBeenCalled()

    await handler({ method: 'POST', headers: {}, body: update() })
    // The handler acknowledges before dispatching — Telegram retries anything
    // it has not seen acknowledged — so the work is drained rather than
    // awaited at the call site.
    await bot.stop()

    expect(install).toHaveBeenCalledOnce()
  })

  it('installs before the first update handed in directly', async () => {
    const { bot } = testBot()
    const install = vi.fn()

    bot.extend(counter(install))
    await bot.handleUpdate(update())

    expect(install).toHaveBeenCalledOnce()
  })

  it('still installs eagerly on poll, so a failure surfaces at startup', async () => {
    const { bot } = testBot()
    const install = vi.fn()

    bot.extend(counter(install))
    await bot.poll()
    await bot.stop()

    expect(install).toHaveBeenCalledOnce()
  })

  it('installs once when several updates arrive together', async () => {
    // Two updates in flight both see a queued plugin. Without serialization
    // they both install it, and a plugin that registers middleware would
    // register it twice.
    const { bot } = testBot()
    const install = vi.fn()

    bot.extend(counter(install))
    await Promise.all([bot.handleUpdate(update(1)), bot.handleUpdate(update(2))])

    expect(install).toHaveBeenCalledOnce()
  })

  it('costs nothing once there is nothing queued', async () => {
    const { bot } = testBot()
    const install = vi.fn()

    bot.extend(counter(install))
    await bot.handleUpdate(update(1))
    await bot.handleUpdate(update(2))
    await bot.handleUpdate(update(3))

    expect(install).toHaveBeenCalledOnce()
  })
})

describe('what an installed plugin can do', () => {
  it('has its middleware running for updates that follow', async () => {
    const { bot } = testBot()
    const seen: string[] = []

    bot.extend(
      definePlugin<'tracer', undefined, Bot>({
        name: 'tracer',
        install: (target) => {
          target.use(async (_event, next) => {
            seen.push('middleware')
            await next()
          })
          return undefined
        },
      }),
    )

    bot.onMessage(() => seen.push('handler'))

    const handler = bot.webhook()
    await handler({ method: 'POST', headers: {}, body: update() })
    await bot.stop()

    expect(seen).toEqual(['middleware', 'handler'])
  })

  it('has its work drained when the client stops', async () => {
    // The other half of the same defect: a webhook client never reaches the
    // `running` state, and `stop()` used to return immediately from `idle`.
    // A SIGTERM then abandoned every handler still in flight, while reporting
    // a clean shutdown.
    const { bot } = testBot()
    let finished = false

    bot.onMessage(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      finished = true
    })

    const handler = bot.webhook()
    await handler({ method: 'POST', headers: {}, body: update() })

    expect(finished).toBe(false)
    await bot.stop()
    expect(finished).toBe(true)
  })

  it('installs one added after the client is already running', async () => {
    const { bot } = testBot()
    const install = vi.fn()

    await bot.handleUpdate(update(1))
    bot.extend(counter(install))
    await bot.handleUpdate(update(2))

    expect(install).toHaveBeenCalledOnce()
  })
})
