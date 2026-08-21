/**
 * Chat actions.
 *
 * Telegram clears "typing…" after five seconds, so the only interesting part is
 * the lifetime: it must be re-sent while work runs, it must stop when the work
 * settles including on failure, and a failed refresh must not take down the
 * handler it was decorating.
 */

import { describe, expect, it, vi } from 'vitest'
import { chatAction, withChatAction } from '../src/chat-action.js'

/** A target that records what was sent. */
function target(fail = false) {
  const sent: unknown[] = []

  return {
    sent,
    api: {
      sendChatAction: (params: unknown) => {
        sent.push(params)
        return fail ? Promise.reject(new Error('nope')) : Promise.resolve(true)
      },
    } as never,
    chat: { id: -100 },
  }
}

describe('sending', () => {
  it('sends once immediately, so the action shows without waiting', () => {
    const context = target()
    const running = chatAction(context, 'typing')

    expect(context.sent).toEqual([{ chat_id: -100, action: 'typing' }])
    running.stop()
  })

  it('re-sends while it is running', async () => {
    vi.useFakeTimers()

    const context = target()
    const running = chatAction(context, 'typing', { intervalMs: 100 })

    await vi.advanceTimersByTimeAsync(250)
    running.stop()

    expect(context.sent.length).toBe(3)
    vi.useRealTimers()
  })

  it('stops when told, and stays stopped', async () => {
    vi.useFakeTimers()

    const context = target()
    const running = chatAction(context, 'typing', { intervalMs: 100 })
    running.stop()
    running.stop()

    await vi.advanceTimersByTimeAsync(500)

    expect(context.sent).toHaveLength(1)
    expect(running.active).toBe(false)
    vi.useRealTimers()
  })

  it('carries the forum topic and business connection', () => {
    const context = { ...target(), message_thread_id: 7, business_connection_id: 'bc' }
    chatAction(context, 'upload_photo').stop()

    expect(context.sent[0]).toEqual({
      chat_id: -100,
      action: 'upload_photo',
      message_thread_id: 7,
      business_connection_id: 'bc',
    })
  })
})

describe('withChatAction', () => {
  it('stops when the work finishes', async () => {
    const context = target()

    const result = await withChatAction(context, 'typing', async () => 'done')

    expect(result).toBe('done')
    expect(context.sent).toHaveLength(1)
  })

  it('stops when the work throws, so nothing types forever', async () => {
    vi.useFakeTimers()
    const context = target()

    await expect(
      withChatAction(
        context,
        'typing',
        async () => {
          throw new Error('boom')
        },
        { intervalMs: 50 },
      ),
    ).rejects.toThrow('boom')

    await vi.advanceTimersByTimeAsync(500)
    expect(context.sent).toHaveLength(1)
    vi.useRealTimers()
  })
})

describe('failure', () => {
  it('never lets a failed refresh reach the caller', async () => {
    // The action is a courtesy. Losing it is not a reason to fail the work.
    const context = target(true)
    const onError = vi.fn()

    const result = await withChatAction(context, 'typing', async () => 'fine', { onError })
    await Promise.resolve()

    expect(result).toBe('fine')
    expect(onError).toHaveBeenCalled()
  })
})
