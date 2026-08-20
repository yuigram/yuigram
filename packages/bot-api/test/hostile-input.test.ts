/**
 * Hostile and malformed input.
 *
 * A webhook endpoint is public by necessity: anyone who learns the URL can post
 * arbitrary JSON to it, and the secret token is the only thing between them and
 * the pipeline. Even behind a correct secret, a proxy can mangle a body.
 *
 * These pin the properties that must hold whatever arrives — no prototype
 * pollution, no crash on wrong types, no stack overflow on a nested body, and
 * nothing injected reaching a handler as though Telegram had sent it.
 */

import { describe, expect, it } from 'vitest'
import { normalizeUpdate } from '../src/normalize.js'
import { mockBot } from '../src/testing/mock-bot.js'
import { createWebhookHandler } from '../src/webhook/handler.js'

describe('a hostile update payload', () => {
  it('does not pollute Object.prototype through __proto__', async () => {
    // A webhook endpoint accepts arbitrary JSON from anyone who learns the URL.
    const body = JSON.parse(
      '{"update_id":1,"message":{"message_id":1,"date":1,"chat":{"id":1,"type":"private"},"text":"x","__proto__":{"polluted":true}}}',
    )

    normalizeUpdate(body)

    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('does not pollute through constructor.prototype', async () => {
    const body = JSON.parse(
      '{"update_id":1,"message":{"message_id":1,"date":1,"chat":{"id":1,"type":"private"},"constructor":{"prototype":{"pwned":true}}}}',
    )

    normalizeUpdate(body)

    expect(({} as Record<string, unknown>)['pwned']).toBeUndefined()
  })

  it('survives an update whose fields are the wrong types', async () => {
    // Nothing guarantees a proxy in front of the bot sends well-formed data.
    for (const body of [
      { update_id: 1, message: 'not an object' },
      { update_id: 1, message: { chat: 42, text: [] } },
      { update_id: 1, message: null },
      { update_id: 1, message: { date: 'yesterday' } },
      { update_id: 'not a number' },
      {},
    ]) {
      expect(() => normalizeUpdate(body as never)).not.toThrow()
    }
  })

  it('survives a deeply nested payload', async () => {
    // A crafted body should not blow the stack.
    let nested: Record<string, unknown> = { text: 'deep' }
    for (let i = 0; i < 5000; i += 1) nested = { nested }

    expect(() => normalizeUpdate({ update_id: 1, message: nested } as never)).not.toThrow()
  })

  it('does not dispatch a hostile update into a handler as a real message', async () => {
    const { bot, send, calls } = mockBot()
    bot.on('message', (ctx) => ctx.reply(String(ctx.text)))

    await send.update(
      JSON.parse('{"update_id":9,"message":{"__proto__":{"text":"injected"}}}') as never,
    )

    expect(calls.last('sendMessage')?.params['text']).not.toBe('injected')
  })

  it('rejects a webhook body that is an array', async () => {
    const handler = createWebhookHandler({ onUpdate: () => {} })

    const response = await handler({ method: 'POST', headers: {}, body: [1, 2, 3] })

    expect(response.status).toBe(400)
  })
})
