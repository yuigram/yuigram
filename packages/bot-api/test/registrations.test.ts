/**
 * Named registrations.
 *
 * `bot.onChatMemberJoined(handler)` is `bot.on('chat_member_joined', handler)`
 * with the kind fixed. Seventy-nine of them are generated from the taxonomy the
 * dispatcher indexes, so what these check is not that each one exists — the
 * list guarantees that — but that the installation is faithful: the right kind,
 * the same dispatch path, and no cost paid per instance.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { REGISTRATIONS } from '../src/generated/registrations.js'
import type { Update } from '../src/generated/types/index.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

function bot() {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))

  return Bot.fromToken(TOKEN, {
    client: transport,
    log: createLogger({ sink: silentSink() }),
  })
}

describe('installation', () => {
  it('installs one method per generated entry', () => {
    const client = bot()

    for (const [method] of REGISTRATIONS) {
      expect(typeof (client as unknown as Record<string, unknown>)[method]).toBe('function')
    }

    expect(REGISTRATIONS.length).toBeGreaterThan(70)
  })

  it('keeps them off the instance', () => {
    // Installed on the prototype, so a bot inspects as its own fields rather
    // than as eighty functions, and none of them is paid for per client.
    const client = bot()

    expect(Object.keys(client)).toEqual(['api', 'name'])
  })

  it('covers every kind the taxonomy declares, minus the hand-written ones', () => {
    const named = new Set(REGISTRATIONS.map(([, kind]) => kind))

    expect(named.has('message')).toBe(true)
    expect(named.has('chat_member_joined')).toBe(true)
    expect(named.has('forum_topic_created')).toBe(true)
    // `onText`, `onCommand` and `onCallbackQuery` match as well as select, so
    // they are written by hand and excluded from generation.
    expect(named.has('callback_query')).toBe(false)
  })
})

describe('dispatch', () => {
  it('routes to the kind it names', async () => {
    const client = bot()
    const seen: string[] = []

    client.onMessage((message) => seen.push(`message:${message.text ?? ''}`))
    client.onMessageEdited((message) => seen.push(`edited:${message.text ?? ''}`))

    await client.handleUpdate({
      update_id: 1,
      message: { message_id: 1, date: 1, chat: { id: 1, type: 'private' }, text: 'new' },
    } as unknown as Update)

    await client.handleUpdate({
      update_id: 2,
      edited_message: { message_id: 1, date: 1, chat: { id: 1, type: 'private' }, text: 'changed' },
    } as unknown as Update)

    expect(seen).toEqual(['message:new', 'edited:changed'])
  })

  it('reaches a promoted service kind', async () => {
    const client = bot()
    let joined = 0

    client.onChatMemberJoined(() => {
      joined += 1
    })

    await client.handleUpdate({
      update_id: 3,
      message: {
        message_id: 2,
        date: 1,
        chat: { id: -1, type: 'supergroup' },
        new_chat_members: [{ id: 9, is_bot: false, first_name: 'C' }],
      },
    } as unknown as Update)

    expect(joined).toBe(1)
  })

  it('returns the client, so registrations chain', () => {
    const client = bot()

    expect(client.onMessage(() => {}).onChannelPost(() => {})).toBe(client)
  })

  it('shares the dispatch path with on(), so off() still removes it', async () => {
    const client = bot()
    let calls = 0
    const handler = () => {
      calls += 1
    }

    client.onMessage(handler)
    expect(client.off(handler)).toBe(true)

    await client.handleUpdate({
      update_id: 4,
      message: { message_id: 3, date: 1, chat: { id: 1, type: 'private' }, text: 'x' },
    } as unknown as Update)

    expect(calls).toBe(0)
  })

  it('narrows the update subscription like on() does', async () => {
    // Named registrations must feed `allowed_updates`, or a bot that used only
    // them would subscribe to everything — or, worse, inherit whatever a
    // previous run configured.
    const transport = mockTransport()
    transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))
    transport.on('getUpdates', ok([]))

    const client = Bot.fromToken(TOKEN, {
      client: transport,
      allowedUpdates: 'auto',
      log: createLogger({ sink: silentSink() }),
    })

    client.onChatMemberJoined(() => {})

    await client.poll()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await client.stop({ timeout: 100 })

    // A promoted service kind can arrive inside any message-bearing field — a
    // member joins a channel's discussion group as readily as a group — so the
    // subscription covers all of them and nothing else.
    const asked = transport.last('getUpdates')?.params['allowed_updates'] as string[]

    expect(asked).toContain('message')
    expect(asked).toContain('channel_post')
    expect(asked).not.toContain('callback_query')
    expect(asked).not.toContain('poll_answer')
  })
})
