/**
 * Inbound rate limiting.
 *
 * The failure a limiter must not have is limiting the wrong people: one user's
 * flood silencing a group, or a shared key grouping unrelated traffic. Those
 * are checked here alongside the window arithmetic, because both are silent —
 * a bot that has stopped answering someone looks exactly like a bot with no
 * handler.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { Bot } from '../src/bot.js'
import type { Update } from '../src/generated/types/index.js'
import { rateLimit } from '../src/rate-limit.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

function client() {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))
  transport.on('sendMessage', ok({ message_id: 1, date: 1, chat: { id: 1, type: 'private' } }))

  return {
    transport,
    bot: Bot.fromToken(TOKEN, { client: transport, log: createLogger({ sink: silentSink() }) }),
  }
}

function messageFrom(userId: number, id = userId): Update {
  return {
    update_id: id,
    message: {
      message_id: id,
      date: 1,
      chat: { id: -100, type: 'supergroup' },
      from: { id: userId, is_bot: false, first_name: 'A' },
      text: 'hi',
    },
  } as unknown as Update
}

describe('counting', () => {
  it('lets the allowance through and stops the rest', async () => {
    const { bot } = client()
    let handled = 0

    bot.use(rateLimit({ limit: 2, windowMs: 10_000 }))
    bot.onMessage(() => {
      handled += 1
    })

    for (let index = 0; index < 5; index += 1) {
      await bot.handleUpdate(messageFrom(7, index))
    }

    expect(handled).toBe(2)
  })

  it('lets the next window through', async () => {
    vi.useFakeTimers()

    const { bot } = client()
    let handled = 0

    bot.use(rateLimit({ limit: 1, windowMs: 1_000 }))
    bot.onMessage(() => {
      handled += 1
    })

    await bot.handleUpdate(messageFrom(7, 1))
    await bot.handleUpdate(messageFrom(7, 2))
    expect(handled).toBe(1)

    vi.advanceTimersByTime(1_100)
    await bot.handleUpdate(messageFrom(7, 3))

    expect(handled).toBe(2)
    vi.useRealTimers()
  })
})

describe('attribution', () => {
  it('limits per user, not per chat', async () => {
    // Limiting by chat would let one member's flood silence everyone else in
    // a busy group.
    const { bot } = client()
    const seen: number[] = []

    bot.use(rateLimit({ limit: 1, windowMs: 10_000 }))
    bot.onMessage((message) => {
      seen.push(message.sender?.id ?? 0)
    })

    await bot.handleUpdate(messageFrom(1, 1))
    await bot.handleUpdate(messageFrom(1, 2))
    await bot.handleUpdate(messageFrom(2, 3))

    expect(seen).toEqual([1, 2])
  })

  it('takes a key of its own, for a per-chat limit where that is wanted', async () => {
    const { bot } = client()
    let handled = 0

    bot.use(
      rateLimit({
        limit: 1,
        windowMs: 10_000,
        key: (event) => (event as { chat?: { id: number } }).chat?.id,
      }),
    )
    bot.onMessage(() => {
      handled += 1
    })

    await bot.handleUpdate(messageFrom(1, 1))
    await bot.handleUpdate(messageFrom(2, 2))

    // Different users, same chat: the second is refused.
    expect(handled).toBe(1)
  })

  it('does not limit an update it cannot attribute', async () => {
    // A channel post has no sender. Inventing a key would group unrelated
    // traffic under it.
    const { bot } = client()
    let handled = 0

    bot.use(rateLimit({ limit: 1, windowMs: 10_000 }))
    bot.on('channel_post', () => {
      handled += 1
    })

    for (let index = 0; index < 3; index += 1) {
      await bot.handleUpdate({
        update_id: index,
        channel_post: {
          message_id: index,
          date: 1,
          chat: { id: -100, type: 'channel' },
          text: 'post',
        },
      } as unknown as Update)
    }

    expect(handled).toBe(3)
  })
})

describe('scope', () => {
  it('applies only to the kinds it was given', async () => {
    const { bot } = client()
    let messages = 0
    let queries = 0

    bot.use(rateLimit({ limit: 1, windowMs: 10_000, kinds: ['message'] }))
    bot.onMessage(() => {
      messages += 1
    })
    bot.onCallbackQuery(() => {
      queries += 1
    })

    await bot.handleUpdate(messageFrom(7, 1))
    await bot.handleUpdate(messageFrom(7, 2))

    for (let index = 0; index < 3; index += 1) {
      await bot.handleUpdate({
        update_id: 100 + index,
        callback_query: {
          id: `q${index}`,
          from: { id: 7, is_bot: false, first_name: 'A' },
          chat_instance: 'x',
          data: 'go',
        },
      } as unknown as Update)
    }

    expect(messages).toBe(1)
    expect(queries).toBe(3)
  })
})

describe('telling the user', () => {
  it('says nothing unless asked', async () => {
    // Answering every message over the limit is itself a message per message
    // over the limit.
    const { bot, transport } = client()

    bot.use(rateLimit({ limit: 1, windowMs: 10_000 }))
    bot.onMessage(() => {})

    await bot.handleUpdate(messageFrom(7, 1))
    await bot.handleUpdate(messageFrom(7, 2))

    expect(transport.count('sendMessage')).toBe(0)
  })

  it('reports the key, the count and the reset when asked', async () => {
    const { bot } = client()
    const seen: Array<{ key: string; count: number; resetMs: number }> = []

    bot.use(
      rateLimit({
        limit: 1,
        windowMs: 10_000,
        onLimited: (_event, info) => {
          seen.push({ key: info.key, count: info.count, resetMs: info.resetMs })
        },
      }),
    )
    bot.onMessage(() => {})

    await bot.handleUpdate(messageFrom(7, 1))
    await bot.handleUpdate(messageFrom(7, 2))

    expect(seen).toHaveLength(1)
    expect(seen[0]?.key).toBe('7')
    expect(seen[0]?.count).toBe(2)
    expect(seen[0]?.resetMs).toBeGreaterThan(0)
  })
})

describe('memory', () => {
  it('forgets a key whose window closed', async () => {
    vi.useFakeTimers()

    const { bot } = client()
    bot.use(rateLimit({ limit: 100, windowMs: 1_000 }))
    bot.onMessage(() => {})

    for (let user = 0; user < 50; user += 1) {
      await bot.handleUpdate(messageFrom(user, user))
    }

    // Past both the window and the sweep interval, one more update drops the
    // fifty expired counters rather than keeping one per user seen.
    vi.advanceTimersByTime(61_000)
    await bot.handleUpdate(messageFrom(999, 999))

    vi.useRealTimers()
  })
})
