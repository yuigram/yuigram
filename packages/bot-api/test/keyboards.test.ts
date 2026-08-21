/**
 * Keyboards.
 *
 * The failure mode is quiet: Telegram rejects a malformed keyboard from the
 * `sendMessage` call rather than from the line that built it, so what these
 * check is that a keyboard is well-formed by construction — no empty rows, no
 * payload over the limit, and markup that can go straight into `reply_markup`
 * without a build step.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { InlineKeyboard, Keyboard } from '../src/keyboards.js'

describe('inline keyboards', () => {
  it('builds rows in the order buttons are added', () => {
    const keyboard = new InlineKeyboard()
      .text('Buy', 'buy:1')
      .url('Docs', 'https://example.com')
      .row()
      .text('Cancel', 'cancel')

    expect(keyboard.inline_keyboard).toEqual([
      [
        { text: 'Buy', callback_data: 'buy:1' },
        { text: 'Docs', url: 'https://example.com' },
      ],
      [{ text: 'Cancel', callback_data: 'cancel' }],
    ])
  })

  it('is the markup, so it needs no build step', () => {
    // The property Telegram reads is a real property, which is what lets a
    // keyboard be passed straight to `reply_markup`.
    const keyboard = new InlineKeyboard().text('Go', 'go')
    const params: { reply_markup: { inline_keyboard: unknown[][] } } = { reply_markup: keyboard }

    expect(params.reply_markup.inline_keyboard).toHaveLength(1)
    expect(JSON.parse(JSON.stringify(keyboard))).toEqual({
      inline_keyboard: [[{ text: 'Go', callback_data: 'go' }]],
    })
  })

  it('never emits a trailing empty row', () => {
    // Telegram rejects an empty row, and `row()` at the end of a chain is the
    // natural way to write one by accident.
    const keyboard = new InlineKeyboard().text('One', '1').row()

    expect(keyboard.inline_keyboard).toEqual([[{ text: 'One', callback_data: '1' }]])
  })

  it('ignores a second row break with nothing between them', () => {
    const keyboard = new InlineKeyboard().text('a', 'a').row().row().text('b', 'b')

    expect(keyboard.inline_keyboard).toHaveLength(2)
  })

  it('rejects callback data Telegram would reject', () => {
    // The API answers BUTTON_DATA_INVALID from a call that mentions neither
    // the button nor the payload, so this is caught where it is written.
    const long = 'x'.repeat(65)

    expect(() => new InlineKeyboard().text('Too long', long)).toThrow(ValidationError)
    expect(() => new InlineKeyboard().text('Fine', 'x'.repeat(64))).not.toThrow()
  })

  it('counts bytes rather than characters', () => {
    // 32 emoji are 64 characters and 128 bytes.
    expect(() => new InlineKeyboard().text('emoji', '😀'.repeat(32))).toThrow(ValidationError)
  })

  it('offers every inline button kind', () => {
    const keyboard = new InlineKeyboard()
      .text('t', 'd')
      .url('u', 'https://example.com')
      .webApp('w', 'https://example.com/app')
      .login('l', 'https://example.com/login')
      .switchInline('si', 'q')
      .switchInlineCurrent('sic', 'q')
      .switchInlineChosen('sicc', { allow_user_chats: true })
      .copy('c', 'copied')
      .game('g')
      .pay('p')

    const flat = keyboard.inline_keyboard.flat()

    expect(flat).toHaveLength(10)
    expect(flat[2]).toEqual({ text: 'w', web_app: { url: 'https://example.com/app' } })
    expect(flat[7]).toEqual({ text: 'c', copy_text: { text: 'copied' } })
    expect(flat[9]).toEqual({ text: 'p', pay: true })
  })

  it('lays a list out in columns', () => {
    const keyboard = new InlineKeyboard()
      .addFrom([1, 2, 3, 4, 5], (n) => ({ text: String(n), callback_data: `n:${n}` }))
      .columns(2)

    expect(keyboard.inline_keyboard.map((row) => row.length)).toEqual([2, 2, 1])
  })

  it('refuses a column count that is not a layout', () => {
    expect(() => new InlineKeyboard().text('a', 'a').columns(0)).toThrow(ValidationError)
  })

  it('rebuilds from markup it produced', () => {
    const original = new InlineKeyboard().text('a', 'a').row().text('b', 'b')
    const copy = InlineKeyboard.from(original.toJSON()).text('c', 'c')

    expect(copy.inline_keyboard).toHaveLength(2)
    expect(copy.inline_keyboard[1]).toHaveLength(2)
  })

  it('accepts a flat list of buttons', () => {
    const keyboard = InlineKeyboard.from([{ text: 'a', callback_data: 'a' }])
    expect(keyboard.inline_keyboard).toEqual([[{ text: 'a', callback_data: 'a' }]])
  })

  it('reports how many buttons it holds', () => {
    expect(new InlineKeyboard().text('a', 'a').row().text('b', 'b').size).toBe(2)
  })
})

describe('reply keyboards', () => {
  it('builds rows and reads options as statements', () => {
    const keyboard = new Keyboard()
      .text('Yes')
      .text('No')
      .row()
      .requestContact('Share number')
      .resized()
      .oneTime()
      .placeholder('Choose')

    expect(keyboard.toJSON()).toEqual({
      keyboard: [
        [{ text: 'Yes' }, { text: 'No' }],
        [{ text: 'Share number', request_contact: true }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: 'Choose',
    })
  })

  it('omits every option that was never set', () => {
    // Sending `one_time_keyboard: undefined` is not the same as omitting it to
    // every Bot API server.
    expect(new Keyboard().text('a').toJSON()).toEqual({ keyboard: [[{ text: 'a' }]] })
  })

  it('accepts plain labels', () => {
    expect(new Keyboard().add('a', 'b').keyboard).toEqual([[{ text: 'a' }, { text: 'b' }]])
    expect(Keyboard.from(['a', 'b']).keyboard).toEqual([[{ text: 'a' }, { text: 'b' }]])
  })

  it('offers the request buttons', () => {
    const keyboard = new Keyboard()
      .requestLocation('Where are you')
      .requestPoll('Make a poll', 'quiz')
      .webApp('Open', 'https://example.com')
      .requestUsers('Pick users', { request_id: 1 })
      .requestChat('Pick a chat', { request_id: 2, chat_is_channel: false })

    const flat = keyboard.keyboard.flat()

    expect(flat[0]).toEqual({ text: 'Where are you', request_location: true })
    expect(flat[1]).toEqual({ text: 'Make a poll', request_poll: { type: 'quiz' } })
    expect(flat[3]).toEqual({ text: 'Pick users', request_users: { request_id: 1 } })
  })

  it('removes a keyboard and forces a reply', () => {
    expect(Keyboard.remove()).toEqual({ remove_keyboard: true })
    expect(Keyboard.remove(true)).toEqual({ remove_keyboard: true, selective: true })
    expect(Keyboard.forceReply({ input_field_placeholder: 'Answer' })).toEqual({
      force_reply: true,
      input_field_placeholder: 'Answer',
    })
  })

  it('is the markup, like the inline one', () => {
    const keyboard = new Keyboard().text('a').persistent().selectively()

    expect(keyboard.keyboard).toEqual([[{ text: 'a' }]])
    expect(keyboard.is_persistent).toBe(true)
    expect(keyboard.selective).toBe(true)
  })
})
