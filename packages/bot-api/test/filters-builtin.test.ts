/**
 * The built-in filter namespace.
 *
 * Two halves with two failure modes. The generated presence filters cannot be
 * individually wrong — they are one loop over a list — but the *list* can be,
 * so what is checked is that it names the fields a context actually carries.
 * The curated filters each encode a judgement, and those are checked one by
 * one, because a filter that quietly matches nothing is indistinguishable from
 * a bot with no handler.
 */

import { and, not, or } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { f, has, MESSAGE_BEARING_KINDS } from '../src/filters/index.js'
import { MESSAGE_FIELDS } from '../src/generated/field-lists.js'

/** A message context, near enough for a predicate. */
function message(fields: Record<string, unknown> = {}): never {
  return {
    kind: 'message',
    transport: 'bot-api',
    chat: { id: -100, type: 'supergroup' },
    sender: { id: 7, is_bot: false, first_name: 'A' },
    ...fields,
  } as never
}

/** A callback query context. */
function query(fields: Record<string, unknown> = {}): never {
  return { kind: 'callback_query', transport: 'bot-api', id: 'q', ...fields } as never
}

describe('generated presence', () => {
  it('names a filter for every optional field of the shape', () => {
    for (const field of MESSAGE_FIELDS) {
      expect(typeof (has as unknown as Record<string, unknown>)[field]).toBe('function')
    }

    expect(MESSAGE_FIELDS.length).toBeGreaterThan(100)
  })

  it('matches when the field is present and not when it is absent', () => {
    expect(has.photo(message({ photo: [{ file_id: 'a' }] }))).toBe(true)
    expect(has.photo(message())).toBe(false)
  })

  it('carries a kind hint so an unrelated update never evaluates it', () => {
    expect(has.photo.kinds).toBe(MESSAGE_BEARING_KINDS)
    expect(has.photo.kinds).toContain('message')
  })

  it('covers the service kinds a message can be promoted to', () => {
    // `new_chat_members` only ever arrives on a promoted kind, so a hint of
    // just the message kinds would make exactly these filters match nothing.
    expect(MESSAGE_BEARING_KINDS).toContain('chat_member_joined')
    expect(has.new_chat_members(message({ new_chat_members: [{ id: 1 }] }))).toBe(true)
  })

  it('names the sender as the context does, not as the payload does', () => {
    // The payload calls it `from`; every context calls it `sender`. A filter
    // named for the payload would compile and never match.
    expect(MESSAGE_FIELDS).toContain('sender')
    expect(MESSAGE_FIELDS).not.toContain('from')
    expect(has.sender(message())).toBe(true)
  })
})

describe('text', () => {
  it('matches presence, an exact string, and a pattern', () => {
    expect(f.text()(message({ text: 'anything' }))).toBe(true)
    expect(f.text()(message())).toBe(false)
    expect(f.text('ping')(message({ text: 'ping' }))).toBe(true)
    expect(f.text('ping')(message({ text: 'pong' }))).toBe(false)
    expect(f.text(/^\d+$/)(message({ text: '42' }))).toBe(true)
  })

  it('does not treat a caption as text', () => {
    // They are different fields, and a bot that conflates them replies to
    // photo captions it never meant to read.
    expect(f.text()(message({ caption: 'a photo' }))).toBe(false)
    expect(f.caption()(message({ caption: 'a photo' }))).toBe(true)
  })

  it('reads either through anyText', () => {
    expect(f.anyText()(message({ caption: 'a photo' }))).toBe(true)
    expect(f.anyText('hi')(message({ text: 'hi' }))).toBe(true)
  })
})

describe('command', () => {
  it('matches the shape and the name', () => {
    expect(f.command()(message({ text: '/start' }))).toBe(true)
    expect(f.command()(message({ text: 'start' }))).toBe(false)
    expect(f.command('start')(message({ text: '/start now' }))).toBe(true)
    expect(f.command('start')(message({ text: '/stop' }))).toBe(false)
    expect(f.command(/^adm/)(message({ text: '/admin' }))).toBe(true)
  })

  it('accepts the name with or without a slash', () => {
    expect(f.command('/start')(message({ text: '/start' }))).toBe(true)
  })

  it('ignores the @bot suffix, which only a client can resolve', () => {
    // A module-level filter cannot know which bot will run it. `onCommand`
    // performs the mention check, and that is the registration to use.
    expect(f.command('start')(message({ text: '/start@anybot' }))).toBe(true)
  })
})

describe('chat', () => {
  it('distinguishes the chat types', () => {
    expect(f.chat.private(message({ chat: { id: 1, type: 'private' } }))).toBe(true)
    expect(f.chat.group(message({ chat: { id: -1, type: 'group' } }))).toBe(true)
    expect(f.chat.supergroup(message())).toBe(true)
    expect(f.chat.channel(message({ chat: { id: -1, type: 'channel' } }))).toBe(true)
  })

  it('treats a group and a supergroup as one thing where that is what is meant', () => {
    // Telegram upgrades a group silently, so a bot checking only `group`
    // stops working the day someone promotes an admin.
    expect(f.chat.anyGroup(message({ chat: { id: -1, type: 'group' } }))).toBe(true)
    expect(f.chat.anyGroup(message({ chat: { id: -1, type: 'supergroup' } }))).toBe(true)
    expect(f.chat.anyGroup(message({ chat: { id: 1, type: 'private' } }))).toBe(false)
  })

  it('matches a chat by id or username', () => {
    expect(f.chat.id(-100)(message())).toBe(true)
    expect(f.chat.id(-999)(message())).toBe(false)
    expect(
      f.chat.id('@news')(message({ chat: { id: -1, type: 'channel', username: '@news' } })),
    ).toBe(true)
  })

  it('recognises a forum', () => {
    expect(f.chat.forum(message({ chat: { id: -1, type: 'supergroup', is_forum: true } }))).toBe(
      true,
    )
    expect(f.chat.forum(message())).toBe(false)
  })
})

describe('sender', () => {
  it('matches by id or username', () => {
    expect(f.sender.id(7)(message())).toBe(true)
    expect(f.sender.id(8)(message())).toBe(false)
    expect(
      f.sender.id('alice')(message({ sender: { id: 9, is_bot: false, username: 'alice' } })),
    ).toBe(true)
  })

  it('recognises bots, premium users and anonymous admins', () => {
    expect(f.sender.isBot(message({ sender: { id: 1, is_bot: true } }))).toBe(true)
    expect(f.sender.isPremium(message({ sender: { id: 1, is_premium: true } }))).toBe(true)
    expect(f.sender.anonymous(message({ sender_chat: { id: -1, type: 'supergroup' } }))).toBe(true)
    expect(f.sender.anonymous(message())).toBe(false)
  })
})

describe('media', () => {
  it('aliases the generated filters rather than reimplementing them', () => {
    expect(f.media.photo).toBe(has.photo)
    expect(f.media.videoNote).toBe(has.video_note)
  })

  it('recognises any media at all', () => {
    expect(f.media.any(message({ video: { file_id: 'v' } }))).toBe(true)
    expect(f.media.any(message({ text: 'no media here' }))).toBe(false)
  })
})

describe('entities', () => {
  it('finds an entity in text or in a caption', () => {
    // A link in a photo caption is a link. Checking only `entities` misses
    // half of them.
    expect(f.entity.url(message({ entities: [{ type: 'url', offset: 0, length: 4 }] }))).toBe(true)
    expect(
      f.entity.url(message({ caption_entities: [{ type: 'url', offset: 0, length: 4 }] })),
    ).toBe(true)
    expect(f.entity.url(message({ text: 'no link' }))).toBe(false)
  })

  it('treats a written link and an embedded one alike where asked', () => {
    expect(
      f.entity.anyLink(message({ entities: [{ type: 'text_link', offset: 0, length: 1 }] })),
    ).toBe(true)
    expect(f.entity.anyLink(message({ entities: [{ type: 'bold', offset: 0, length: 1 }] }))).toBe(
      false,
    )
  })
})

describe('replies and forwards', () => {
  it('recognises a reply and one addressed to the bot', () => {
    expect(f.reply.exists(message({ reply_to_message: { message_id: 1 } }))).toBe(true)
    expect(f.reply.toBot(message({ reply_to_message: { from: { id: 1, is_bot: true } } }))).toBe(
      true,
    )
    expect(f.reply.toBot(message({ reply_to_message: { from: { id: 1, is_bot: false } } }))).toBe(
      false,
    )
  })

  it('recognises a forward and its origin', () => {
    expect(f.forward.exists(message({ forward_origin: { type: 'user' } }))).toBe(true)
    expect(f.forward.fromChat(message({ forward_origin: { type: 'channel' } }))).toBe(true)
    expect(f.forward.fromChat(message({ forward_origin: { type: 'user' } }))).toBe(false)
  })
})

describe('callback queries', () => {
  it('matches data by string and pattern', () => {
    expect(f.callback.data()(query({ data: 'anything' }))).toBe(true)
    expect(f.callback.data('buy')(query({ data: 'buy' }))).toBe(true)
    expect(f.callback.data(/^buy:/)(query({ data: 'buy:1' }))).toBe(true)
    expect(f.callback.data(/^buy:/)(query({ data: 'sell:1' }))).toBe(false)
  })

  it('recognises a query with no chat behind it', () => {
    expect(f.callback.inline(query({ inline_message_id: 'x' }))).toBe(true)
    expect(f.callback.inline(query({ data: 'x' }))).toBe(false)
  })
})

describe('composition', () => {
  it('composes with the core combinators', () => {
    const staffPhoto = and(f.sender.id(7), f.media.photo)

    expect(staffPhoto(message({ photo: [{ file_id: 'a' }] }))).toBe(true)
    expect(staffPhoto(message({ photo: [{ file_id: 'a' }], sender: { id: 8 } }))).toBe(false)

    expect(or(f.media.photo, f.media.video)(message({ video: { file_id: 'v' } }))).toBe(true)
    expect(not(f.media.photo)(message({ text: 'x' }))).toBe(true)
  })

  it('keeps the kind hint through an intersection', () => {
    const composed = and(f.chat.private, f.media.photo)
    expect(composed.kinds).toContain('message')
  })
})

describe('the namespace', () => {
  it('is frozen, so a plugin cannot redefine a built-in', () => {
    expect(Object.isFrozen(f)).toBe(true)
    expect(Object.isFrozen(f.chat)).toBe(true)
  })

  it('names every filter, for diagnostics', () => {
    expect(f.media.photo.name).toBe('has.photo')
    expect(f.chat.private.name).toBe('chat.private')
    expect(f.text('ping').name).toBe('text(ping)')
  })
})
