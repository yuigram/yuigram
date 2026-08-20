/**
 * The façade's public surface.
 *
 * This is the only file in the repository that tests what a user actually
 * receives from `npm install yuigram`. Everything else imports through deep
 * paths, which is how `Bot` — the main class of the Bot API package — went
 * unexported from its own entry point without a single test noticing.
 */

import { describe, expect, it } from 'vitest'
import * as yuigram from '../src/index.js'
import * as testing from '../src/testing.js'
import * as webhook from '../src/webhook.js'

describe('the entry point', () => {
  it('exports the client', () => {
    expect(typeof yuigram.Bot).toBe('function')
  })

  it('exports the storage adapters', () => {
    expect(typeof yuigram.memory).toBe('function')
    expect(typeof yuigram.file).toBe('function')
  })

  it('exports the session helpers', () => {
    expect(typeof yuigram.createSession).toBe('function')
    expect(typeof yuigram.userChatKey).toBe('function')
  })

  it('exports the filter combinators', () => {
    for (const name of ['and', 'or', 'not', 'every', 'some'] as const) {
      expect(typeof yuigram[name]).toBe('function')
    }
  })

  it('exports the error hierarchy', () => {
    expect(Object.getPrototypeOf(yuigram.FloodError)).toBe(yuigram.TelegramError)
    expect(new yuigram.ValidationError('x')).toBeInstanceOf(yuigram.YuigramError)
  })

  it('exports the logger', () => {
    expect(typeof yuigram.createLogger).toBe('function')
  })
})

describe('the schema version', () => {
  it('names the Bot API version the surface was generated from', () => {
    // A user hitting a method newer than this build needs to know which
    // version they are talking to before reaching for `call()`.
    expect(yuigram.schemaInfo.botApi).toMatch(/^\d+\.\d+$/)
  })

  it('does not claim an MTProto layer it does not have', () => {
    expect(yuigram.schemaInfo.tlLayer).toBeNull()
  })
})

describe('the subpaths', () => {
  it('exposes the testing harness', () => {
    expect(typeof testing.mockBot).toBe('function')
  })

  it('exposes the webhook adapters', () => {
    expect(typeof webhook.nodeWebhook).toBe('function')
    expect(typeof webhook.expressWebhook).toBe('function')
    expect(typeof webhook.fastifyWebhook).toBe('function')
  })

  it('keeps the adapters out of the main entry point', () => {
    // A bot that polls should not carry the webhook adapters.
    expect('nodeWebhook' in yuigram).toBe(false)
  })
})

describe('independence', () => {
  it('names no third-party Telegram library anywhere in its surface', () => {
    // The invariant checks the built declarations. This checks the runtime
    // surface, which is what a user can actually reach.
    const forbidden = ['mtcute', 'puregram', 'grammy', 'telegraf', 'gramjs']

    for (const name of Object.keys({ ...yuigram, ...testing, ...webhook })) {
      for (const library of forbidden) {
        expect(name.toLowerCase()).not.toContain(library)
      }
    }
  })
})

describe('a bot built through the façade', () => {
  it('handles an update end to end', async () => {
    // Proves the re-exports are wired to working implementations rather than
    // to names that merely resolve.
    const { bot, send, calls } = testing.mockBot()

    bot.command('start', (ctx) => ctx.reply('hello'))
    await send.command('/start')

    expect(calls.last('sendMessage')?.params['text']).toBe('hello')
  })
})
