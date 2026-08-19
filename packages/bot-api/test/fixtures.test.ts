/**
 * Fixture builders.
 *
 * Determinism is the property under test. A fixture that draws from a clock or
 * a random source produces suites that pass locally and fail in CI for reasons
 * unrelated to the change under review.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  botUser,
  callbackQueryUpdate,
  editedMessageUpdate,
  groupChat,
  memberJoinedUpdate,
  message,
  messageUpdate,
  privateChat,
  resetFixtureIds,
  unknownUpdate,
  user,
} from '../src/testing/fixtures.js'

beforeEach(() => {
  resetFixtureIds()
})

describe('determinism', () => {
  it('produces identical output after a reset', () => {
    const first = messageUpdate({ text: 'hi' })
    resetFixtureIds()
    const second = messageUpdate({ text: 'hi' })

    expect(first).toEqual(second)
  })

  it('does not depend on the wall clock', () => {
    expect(message().date).toBe(message().date)
  })

  it('allocates distinct identifiers within a run', () => {
    const a = messageUpdate()
    const b = messageUpdate()

    expect(a.update_id).not.toBe(b.update_id)
  })
})

describe('builders', () => {
  it('builds a plausible user', () => {
    const built = user()
    expect(built.is_bot).toBe(false)
    expect(typeof built.first_name).toBe('string')
  })

  it('marks a bot user', () => {
    expect(botUser().is_bot).toBe(true)
  })

  it('honours overrides', () => {
    expect(user({ id: 42, first_name: 'Ada' })).toMatchObject({ id: 42, first_name: 'Ada' })
  })

  it('builds chats of each shape', () => {
    expect(privateChat().type).toBe('private')
    expect(groupChat().type).toBe('supergroup')
  })

  it('gives a group a negative identifier, as Telegram does', () => {
    expect(groupChat().id).toBeLessThan(0)
  })

  it('defaults a private chat to the sender', () => {
    const from = user({ id: 77 })
    expect(message({ from }).chat.id).toBe(77)
  })

  it('omits text when none was asked for', () => {
    expect('text' in message()).toBe(false)
    expect(message({ text: 'hi' }).text).toBe('hi')
  })
})

describe('update shapes', () => {
  it('wraps a message', () => {
    const update = messageUpdate({ text: 'hi' })
    expect(update.message?.text).toBe('hi')
    expect(update.edited_message).toBeUndefined()
  })

  it('wraps an edited message under its own key', () => {
    const update = editedMessageUpdate({ text: 'changed' })
    expect(update.edited_message?.text).toBe('changed')
    expect(update.message).toBeUndefined()
  })

  it('wraps a callback query with its data', () => {
    const update = callbackQueryUpdate({ data: 'buy:1' })
    expect(update.callback_query?.data).toBe('buy:1')
    expect(update.callback_query?.message).toBeDefined()
  })

  it('builds a service message for a member join', () => {
    // The Bot API delivers this as a message with a service field, which is
    // exactly the shape the normalizer has to promote.
    const update = memberJoinedUpdate()
    expect(update.message?.new_chat_members).toHaveLength(1)
    expect(update.message?.text).toBeUndefined()
  })

  it('builds an update of an unknown kind', () => {
    // Telegram ships new update types before a client regenerates, so the
    // pipeline must carry them rather than discarding them.
    const update = unknownUpdate('some_future_update') as unknown as Record<string, unknown>
    expect(update['some_future_update']).toBeDefined()
    expect(typeof update['update_id']).toBe('number')
  })

  it('carries exactly one payload key besides update_id', () => {
    // The Bot API guarantees at most one populated field per update, and a
    // fixture that broke that would exercise a case the pipeline never sees.
    for (const update of [messageUpdate(), callbackQueryUpdate(), editedMessageUpdate()]) {
      const keys = Object.keys(update).filter((key) => key !== 'update_id')
      expect(keys).toHaveLength(1)
    }
  })
})
