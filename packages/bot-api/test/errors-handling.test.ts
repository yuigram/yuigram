/**
 * Error handling and context hygiene.
 *
 * Both cases here were found by auditing shipped code rather than by writing
 * tests first, so they are pinned deliberately.
 */

import { describe, expect, it, vi } from 'vitest'
import { mockBot } from '../src/testing/mock-bot.js'

describe('context hygiene', () => {
  it('does not leak `command` onto unrelated handlers', async () => {
    // Assigning onto the shared context left a `command` property visible to
    // every later handler for the same update.
    const { bot, send } = mockBot()
    let leaked: unknown = 'not-run'

    bot.command('start', () => {})
    bot.text('/start', (ctx) => {
      leaked = (ctx as unknown as Record<string, unknown>)['command']
    })

    await send.command('/start')

    expect(leaked).toBeUndefined()
  })

  it('still gives the command handler its parsed command', async () => {
    const { bot, send, calls } = mockBot()
    bot.command('give', (ctx) => ctx.reply(ctx.command.args.join(',')))

    await send.command('/give a b')

    expect(calls.last('sendMessage')?.params['text']).toBe('a,b')
  })

  it('gives each update its own context', async () => {
    const { bot, send } = mockBot()
    const seen: unknown[] = []

    bot.command('start', (ctx) => {
      seen.push(ctx.command.rest)
    })

    await send.command('/start one')
    await send.command('/start two')

    expect(seen).toEqual(['one', 'two'])
  })
})

describe('error handling', () => {
  it('does not propagate a handler error to the caller', async () => {
    // A throwing handler must not take down the polling loop or the webhook
    // response that dispatched it.
    const { bot, send } = mockBot()
    bot.command('boom', () => {
      throw new Error('handler exploded')
    })

    await expect(send.command('/boom')).resolves.toBeUndefined()
  })

  it('routes the error to a registered catcher', async () => {
    const { bot, send } = mockBot()
    const caught: unknown[] = []

    bot.catch((error) => {
      caught.push((error as Error).message)
    })
    bot.command('boom', () => {
      throw new Error('handler exploded')
    })

    await send.command('/boom')

    expect(caught).toEqual(['handler exploded'])
  })

  it('gives the catcher the context that failed', async () => {
    const { bot, send } = mockBot()
    let kind: string | undefined

    bot.catch((_error, ctx) => {
      kind = ctx.kind
    })
    bot.command('boom', () => {
      throw new Error('x')
    })

    await send.command('/boom')

    expect(kind).toBe('message')
  })

  it('keeps running later handlers after one throws', async () => {
    // Independent concerns that happened to match the same update must not
    // take each other down.
    const { bot, send } = mockBot()
    const ran: string[] = []

    bot.catch(() => {})
    bot.on('message', () => {
      ran.push('first')
      throw new Error('boom')
    })
    bot.on('message', () => {
      ran.push('second')
    })

    await send.message('hi')

    expect(ran).toEqual(['first', 'second'])
  })

  it('catches an error thrown by middleware', async () => {
    const { bot, send } = mockBot()
    const caught: unknown[] = []

    bot.catch((error) => {
      caught.push((error as Error).message)
    })
    bot.use(() => {
      throw new Error('middleware exploded')
    })

    await send.message('hi')

    expect(caught).toEqual(['middleware exploded'])
  })

  it('reports an error thrown by the catcher itself', async () => {
    // A failing error handler cannot be reported to itself.
    const { bot, send } = mockBot()

    bot.catch(() => {
      throw new Error('catcher exploded')
    })
    bot.on('message', () => {
      throw new Error('original')
    })

    await expect(send.message('hi')).resolves.toBeUndefined()
  })

  it('runs every registered catcher', async () => {
    const { bot, send } = mockBot()
    const first = vi.fn()
    const second = vi.fn()

    bot.catch(first)
    bot.catch(second)
    bot.on('message', () => {
      throw new Error('boom')
    })

    await send.message('hi')

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })
})
