/**
 * A whole bot, end to end.
 *
 * This is the shape a user's own test takes, so it doubles as a check that the
 * documented harness actually delivers what `docs/testing.md` §3.1 promised.
 */

import { memory } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { mockBot } from '../src/testing/mock-bot.js'

describe('a realistic bot', () => {
  it('handles commands, buttons and state together', async () => {
    const { bot, send, calls } = mockBot({ me: { username: 'shop_bot' } })
    const carts = memory<number>()

    bot.command('start', (ctx) => ctx.reply('Welcome! Send /add to fill your cart.'))

    bot.command('add', async (ctx) => {
      const key = String(ctx.sender?.id)
      const count = ((await carts.get(key)) ?? 0) + 1
      await carts.set(key, count)
      await ctx.reply(`Cart: ${count}`)
    })

    bot.callback(/^buy:/, async (ctx) => {
      await ctx.api.answerCallbackQuery({ callback_query_id: '1', text: 'Ordered' })
      await ctx.reply(`Ordered ${ctx.data?.slice(4)}`)
    })

    bot.on('chat_member_joined', (ctx) => ctx.reply('Welcome to the group!'))

    await send.command('/start')
    expect(calls.last('sendMessage')?.params['text']).toContain('Welcome!')

    const from = { id: 42, is_bot: false, first_name: 'Ada' }
    await send.command('/add', { from })
    await send.command('/add', { from })
    expect(calls.last('sendMessage')?.params['text']).toBe('Cart: 2')

    await send.callback('buy:widget')
    expect(calls.last('answerCallbackQuery')?.params['text']).toBe('Ordered')
    expect(calls.last('sendMessage')?.params['text']).toBe('Ordered widget')

    // A promoted service message never reaches the message handlers above.
    await send.update({
      update_id: 9999,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: -100, type: 'supergroup', title: 'G' },
        new_chat_members: [from],
      },
    } as never)
    expect(calls.last('sendMessage')?.params['text']).toBe('Welcome to the group!')

    expect(calls.count('sendMessage')).toBe(5)
  })

  it('lets a test script an API failure', async () => {
    const { bot, send, calls, on } = mockBot()
    const seen: string[] = []

    on('sendMessage', { status: 403, body: { ok: false, error_code: 403, description: 'blocked' } })

    bot.command('start', async (ctx) => {
      try {
        await ctx.reply('hi')
      } catch (error) {
        seen.push((error as Error).name)
      }
    })

    await send.command('/start')

    expect(seen).toEqual(['BotApiError'])
    expect(calls.count('sendMessage')).toBe(1)
  })
})
