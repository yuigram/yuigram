/**
 * When plugins install.
 *
 * Installation happens when the client is constructed, not in `poll()`. Tying
 * it to polling would leave a webhook deployment — the production shape — with
 * nothing installed: `bot.extend(session(…))` would compile, run, and do
 * nothing, with no error to say so. Installation belongs to dispatch, because
 * dispatch is what every transport has in common.
 */

import { createLogger, definePlugin, PluginInstallError, silentSink } from '@yuigram/core'
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
    // A webhook client never reaches the `running` state, so a `stop()` that
    // returned immediately from `idle` would abandon every handler still in
    // flight while reporting a clean shutdown. The drain is what a SIGTERM
    // depends on.
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

describe('an install that fails', () => {
  it('fails the update with the plugin named, disposes what was installed, and stays failed', async () => {
    const { bot } = testBot()
    const trail: string[] = []
    let handled = 0

    bot.extend(
      definePlugin<'pool', string, Bot>({
        name: 'pool',
        install: () => {
          trail.push('open pool')
          return 'pool'
        },
        dispose: (value) => void trail.push(`close ${value}`),
      }),
    )
    bot.extend(
      definePlugin<'broken', undefined, Bot>({
        name: 'broken',
        dependsOn: ['pool'],
        install: () => {
          trail.push('broken')
          throw new Error('missing configuration')
        },
      }),
    )
    bot.onMessage(() => {
      handled += 1
    })

    const first = await bot.handleUpdate(update(1)).catch((error: unknown) => error)
    const second = await bot.handleUpdate(update(2)).catch((error: unknown) => error)

    expect(first).toBeInstanceOf(PluginInstallError)
    expect(first).toMatchObject({ plugin: 'broken' })
    expect(((first as Error).cause as Error).message).toBe('missing configuration')
    expect(second).toBe(first)
    expect(trail).toEqual(['open pool', 'broken', 'close pool'])
    expect(handled).toBe(0)
  })

  it('refuses to start polling rather than running with part of its plugins', async () => {
    const { bot, transport } = testBot()
    bot.extend(
      definePlugin<'broken', undefined, Bot>({
        name: 'broken',
        install: () => {
          throw new Error('no')
        },
      }),
    )

    await expect(bot.start()).rejects.toBeInstanceOf(PluginInstallError)
    expect(transport.count('getUpdates')).toBe(0)
  })

  it('leaves another bot with the same plugin descriptor unaffected', async () => {
    const failing = testBot()
    const working = testBot()
    const seen: string[] = []
    // One descriptor, installed on two clients: it fails only on the first.
    const picky = definePlugin<'picky', undefined, Bot>({
      name: 'picky',
      install: (target) => {
        if (target === failing.bot) throw new Error('not on this one')
        target.use(async (_event, next) => {
          seen.push('picky')
          await next()
        })
        return undefined
      },
    })

    failing.bot.extend(picky)
    working.bot.extend(picky)
    working.bot.onMessage(() => void seen.push('handled'))

    await expect(failing.bot.handleUpdate(update(1))).rejects.toBeInstanceOf(PluginInstallError)
    await working.bot.handleUpdate(update(1))

    expect(seen).toEqual(['picky', 'handled'])
  })
})
