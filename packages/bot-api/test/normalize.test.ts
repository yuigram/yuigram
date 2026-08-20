/**
 * Update normalization.
 *
 * The promotion cases encode the reason this layer exists: raw, a member join
 * arrives as a message with no text, and every application ends up writing the
 * same defensive branching inside its message handler.
 *
 * The unknown-kind cases matter for a different reason — Telegram ships new
 * update types before a client regenerates, and a framework that discards them
 * loses data it was trusted to deliver.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Update } from '../src/generated/types/index.js'
import { normalizeUpdate, UNKNOWN_KIND } from '../src/normalize.js'
import {
  callbackQueryUpdate,
  editedMessageUpdate,
  groupChat,
  memberJoinedUpdate,
  messageUpdate,
  resetFixtureIds,
  unknownUpdate,
  user,
} from '../src/testing/fixtures.js'

describe('top-level kinds', () => {
  it('normalizes a message', () => {
    resetFixtureIds()
    const normalized = normalizeUpdate(messageUpdate({ text: 'hi' }))

    expect(normalized.kind).toBe('message')
    expect(normalized.text).toBe('hi')
    expect(normalized.field).toBe('message')
  })

  it('renames edited_message to the subject-first form', () => {
    // Yuigram groups the message family so it sorts and autocompletes together.
    expect(normalizeUpdate(editedMessageUpdate({ text: 'x' })).kind).toBe('message_edited')
  })

  it('normalizes a callback query', () => {
    const normalized = normalizeUpdate(callbackQueryUpdate({ data: 'buy:1' }))

    expect(normalized.kind).toBe('callback_query')
    expect(normalized.text).toBe('buy:1')
  })

  it('carries the update id for deduplication', () => {
    const update = messageUpdate()
    expect(normalizeUpdate(update).updateId).toBe(update.update_id)
  })

  it('preserves the untouched payload', () => {
    const update = messageUpdate({ text: 'hi' })
    expect(normalizeUpdate(update).raw).toBe(update)
  })
})

describe('service-message promotion', () => {
  it('promotes a member join', () => {
    const normalized = normalizeUpdate(memberJoinedUpdate())

    expect(normalized.kind).toBe('chat_member_joined')
    // Still delivered on the `message` field: promotion changes the kind, not
    // where the payload came from.
    expect(normalized.field).toBe('message')
  })

  it('leaves an ordinary message unpromoted', () => {
    expect(normalizeUpdate(messageUpdate({ text: 'hi' })).kind).toBe('message')
  })

  it('promotes a pinned message', () => {
    const update = {
      update_id: 1,
      message: { message_id: 2, date: 1, chat: groupChat(), pinned_message: { message_id: 1 } },
    } as unknown as Update

    expect(normalizeUpdate(update).kind).toBe('message_pinned')
  })

  it('promotes a forum topic creation', () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 2,
        date: 1,
        chat: groupChat(),
        forum_topic_created: { name: 'General', icon_color: 1 },
      },
    } as unknown as Update

    expect(normalizeUpdate(update).kind).toBe('forum_topic_created')
  })

  it('promotes a service message on a channel post too', () => {
    const update = {
      update_id: 1,
      channel_post: { message_id: 2, date: 1, chat: groupChat(), new_chat_title: 'Renamed' },
    } as unknown as Update

    expect(normalizeUpdate(update).kind).toBe('chat_title_changed')
  })

  it('does not promote from a non-message payload', () => {
    // A callback query has no service markers, and scanning it would be a
    // category error.
    expect(normalizeUpdate(callbackQueryUpdate({ data: 'x' })).kind).toBe('callback_query')
  })
})

describe('common fields', () => {
  it('reads chat and sender from a message', () => {
    const from = user({ id: 55 })
    const chat = groupChat({ id: -100 })
    const normalized = normalizeUpdate(messageUpdate({ from, chat, text: 'hi' }))

    expect(normalized.sender?.id).toBe(55)
    expect(normalized.chat?.id).toBe(-100)
  })

  it('reads the chat through a callback query message', () => {
    const normalized = normalizeUpdate(callbackQueryUpdate({ data: 'x' }))
    expect(normalized.chat).toBeDefined()
  })

  it('converts the timestamp to a Date', () => {
    const normalized = normalizeUpdate(messageUpdate({ date: 1_700_000_000 }))
    expect(normalized.date.getTime()).toBe(1_700_000_000 * 1000)
  })

  it('falls back to now for a payload with no timestamp', () => {
    // A callback query carries none, and an invalid Date would poison filters.
    const normalized = normalizeUpdate(callbackQueryUpdate({ data: 'x' }))
    expect(Number.isNaN(normalized.date.getTime())).toBe(false)
  })

  it('leaves text undefined when there is none', () => {
    expect(normalizeUpdate(memberJoinedUpdate()).text).toBeUndefined()
  })
})

describe('unknown kinds', () => {
  it('carries an unrecognised update through', () => {
    const normalized = normalizeUpdate(unknownUpdate('some_future_update'))

    expect(normalized.kind).toBe(UNKNOWN_KIND)
    expect(normalized.field).toBe('some_future_update')
    expect(normalized.payload).toEqual({ anything: true })
  })

  it('logs the unrecognised kind at debug rather than warning', () => {
    // A new update type is expected, not a fault; warning on every one would
    // train users to ignore warnings.
    const debug = vi.fn()
    const log = { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    normalizeUpdate(unknownUpdate('brand_new'), {
      ...log,
      child: () => ({ ...log, child: () => log, isEnabled: () => true }) as never,
      isEnabled: () => true,
    } as never)

    expect(debug).toHaveBeenCalled()
  })

  it('handles an update with no payload at all', () => {
    const normalized = normalizeUpdate({ update_id: 7 } as Update)

    expect(normalized.kind).toBe(UNKNOWN_KIND)
    expect(normalized.updateId).toBe(7)
  })
})
