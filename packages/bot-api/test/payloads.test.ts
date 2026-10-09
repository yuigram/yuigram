// SPDX-License-Identifier: MPL-2.0

/**
 * The payload builders.
 *
 * What is worth asserting is the payload, field for field, because a builder
 * that produces almost the right object is worse than no builder: the request
 * goes out and Telegram refuses it for a reason that names a field the caller
 * never wrote. So each case compares the whole object rather than matching part
 * of it, and the refusals are the ones that would otherwise be refused far from
 * where the mistake was made.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  adminRights,
  attach,
  botCommands,
  content,
  invoice,
  media,
  menuButton,
  newSticker,
  permissions,
  pollOption,
  preview,
  price,
  reaction,
  replyTo,
  shipping,
} from '../src/index.js'

describe('media payloads', () => {
  it('builds each kind with the type Telegram names it by', () => {
    expect(attach.photo('file_id')).toEqual({ type: 'photo', media: 'file_id' })
    expect(attach.video('a', { width: 10, supports_streaming: true })).toEqual({
      type: 'video',
      media: 'a',
      width: 10,
      supports_streaming: true,
    })
    expect(attach.animation('a')).toEqual({ type: 'animation', media: 'a' })
    expect(attach.audio('a', { performer: 'x' })).toEqual({
      type: 'audio',
      media: 'a',
      performer: 'x',
    })
    expect(attach.document('a')).toEqual({ type: 'document', media: 'a' })
    expect(attach.livePhoto('a', 'still')).toEqual({
      type: 'live_photo',
      media: 'a',
      photo: 'still',
    })
  })

  it('takes a file as it comes from the file helpers', () => {
    const file = media.text('hello', 'note.txt')

    expect(attach.document(file)).toEqual({ type: 'document', media: file })
  })

  it('captions an album once, on the item a client shows it from', () => {
    const album = attach.photos(['a', 'b', 'c'], { caption: 'all three' })

    expect(album).toEqual([
      { type: 'photo', media: 'a', caption: 'all three' },
      { type: 'photo', media: 'b' },
      { type: 'photo', media: 'c' },
    ])
  })

  it('puts the caption on the item named, with its parse mode', () => {
    expect(
      attach.videos(['a', 'b'], { caption: '<b>b</b>', captionIndex: 1, parse_mode: 'HTML' }),
    ).toEqual([
      { type: 'video', media: 'a' },
      { type: 'video', media: 'b', caption: '<b>b</b>', parse_mode: 'HTML' },
    ])
  })

  it('builds an album of documents and of audio files', () => {
    expect(attach.documents(['a'])).toEqual([{ type: 'document', media: 'a' }])
    expect(attach.audios(['a'])).toEqual([{ type: 'audio', media: 'a' }])
  })

  it('refuses an album Telegram would not accept, and a caption on no item', () => {
    expect(() => attach.photos([])).toThrow(/1 to 10/)
    expect(() => attach.photos(Array(11).fill('a'))).toThrow(/not 11/)
    expect(() => attach.photos(['a', 'b'], { caption: 'x', captionIndex: 2 })).toThrow(/0 to 1/)
    expect(() => attach.photos(['a'], { caption: 'x', captionIndex: -1 })).toThrow(ValidationError)
  })

  it('names a sticker by the format it is, not by a field', () => {
    expect(newSticker.static('a', ['🐱'], { keywords: ['cat'] })).toEqual({
      sticker: 'a',
      format: 'static',
      emoji_list: ['🐱'],
      keywords: ['cat'],
    })
    expect(newSticker.animated('a', ['🐱'])).toMatchObject({ format: 'animated' })
    expect(newSticker.video('a', ['🐱'])).toMatchObject({ format: 'video' })
  })
})

describe('message payloads', () => {
  it('builds what an inline result sends', () => {
    expect(content.text('hi', { parse_mode: 'HTML' })).toEqual({
      message_text: 'hi',
      parse_mode: 'HTML',
    })
    expect(content.location(55.75, 37.61, { live_period: 60 })).toEqual({
      latitude: 55.75,
      longitude: 37.61,
      live_period: 60,
    })
    expect(content.venue({ latitude: 1, longitude: 2 }, 'Place', 'Street')).toEqual({
      latitude: 1,
      longitude: 2,
      title: 'Place',
      address: 'Street',
    })
    expect(content.contact('+15551234567', 'Ada', { last_name: 'L' })).toEqual({
      phone_number: '+15551234567',
      first_name: 'Ada',
      last_name: 'L',
    })
  })

  it('checks an invoice content the same way a sent invoice is checked', () => {
    const body = {
      title: 'Coffee',
      description: 'A cup',
      payload: 'order-1',
      currency: 'XTR',
      prices: [price('cup', 1)],
    }

    expect(content.invoice(body)).toBe(body)
    expect(() => content.invoice({ ...body, prices: [price('a', 1), price('b', 2)] })).toThrow(
      /exactly one line/,
    )
  })

  it('builds the link preview choices', () => {
    expect(preview.off()).toEqual({ is_disabled: true })
    expect(preview.url('https://example.com')).toEqual({ url: 'https://example.com' })
    expect(preview.large('https://example.com', { show_above_text: true })).toEqual({
      url: 'https://example.com',
      prefer_large_media: true,
      show_above_text: true,
    })
    // Without a URL it applies to whatever link the text has.
    expect(preview.small()).toEqual({ prefer_small_media: true })
  })

  it('builds a reply target, a cross-chat one, and a quote', () => {
    expect(replyTo(42)).toEqual({ message_id: 42 })
    expect(replyTo(42, { allow_sending_without_reply: true })).toEqual({
      message_id: 42,
      allow_sending_without_reply: true,
    })
    expect(replyTo.inChat('@channel', 7)).toEqual({ message_id: 7, chat_id: '@channel' })
    expect(replyTo.quoting(42, 'exactly this', { quote_position: 10 })).toEqual({
      message_id: 42,
      quote: 'exactly this',
      quote_position: 10,
    })
  })

  it('builds the three kinds of reaction', () => {
    expect(reaction.emoji('👍')).toEqual({ type: 'emoji', emoji: '👍' })
    expect(reaction.custom('5368')).toEqual({ type: 'custom_emoji', custom_emoji_id: '5368' })
    expect(reaction.paid()).toEqual({ type: 'paid' })
  })

  it('builds a poll option, with its own formatting where it has any', () => {
    expect(pollOption('yes')).toEqual({ text: 'yes' })
    expect(pollOption('<b>yes</b>', { text_parse_mode: 'HTML' })).toEqual({
      text: '<b>yes</b>',
      text_parse_mode: 'HTML',
    })
  })
})

describe('payment payloads', () => {
  it('prices in the smallest unit, and refuses a fraction of one', () => {
    expect(price('cup', 145)).toEqual({ label: 'cup', amount: 145 })
    expect(() => price('cup', 1.45)).toThrow(/smallest unit/)
  })

  it('builds an invoice paid in money', () => {
    const built = invoice.fiat({
      title: 'Coffee',
      description: 'A good cup',
      payload: 'order-42',
      provider_token: 'provider-token',
      currency: 'EUR',
      prices: [price('cup', 500), price('delivery', 150)],
      is_flexible: true,
    })

    expect(built).toEqual({
      title: 'Coffee',
      description: 'A good cup',
      payload: 'order-42',
      provider_token: 'provider-token',
      currency: 'EUR',
      prices: [
        { label: 'cup', amount: 500 },
        { label: 'delivery', amount: 150 },
      ],
      is_flexible: true,
    })
  })

  it('builds an invoice paid in Stars, in the currency and with the provider Stars need', () => {
    const built = invoice.stars({
      title: 'Pro',
      description: 'A month',
      payload: 'sub-pro',
      prices: [price('1 month', 250)],
      subscription_period: 2_592_000,
    })

    expect(built).toEqual({
      title: 'Pro',
      description: 'A month',
      payload: 'sub-pro',
      currency: 'XTR',
      provider_token: '',
      prices: [{ label: '1 month', amount: 250 }],
      subscription_period: 2_592_000,
    })
  })

  it('keeps the two ways of being paid apart', () => {
    const base = { title: 't', description: 'd', payload: 'p', prices: [price('a', 1)] }

    expect(() => invoice.fiat({ ...base, provider_token: 'x', currency: 'XTR' })).toThrow(
      /currency of Stars/,
    )
    expect(() => invoice.fiat({ ...base, provider_token: '', currency: 'EUR' })).toThrow(/provider/)
    expect(() => invoice.stars({ ...base, prices: [price('a', 1), price('b', 2)] })).toThrow(
      /exactly one line/,
    )
    expect(() => invoice.stars({ ...base, prices: [] })).toThrow(/at least one price/)
  })

  it('builds a delivery choice, which needs a price even when it is free', () => {
    expect(shipping('express', 'Express', [price('shipping', 0)])).toEqual({
      id: 'express',
      title: 'Express',
      prices: [{ label: 'shipping', amount: 0 }],
    })
    expect(() => shipping('free', 'Free', [])).toThrow(/at least one price/)
  })
})

describe('configuration payloads', () => {
  it('builds the menu button variants', () => {
    expect(menuButton.default()).toEqual({ type: 'default' })
    expect(menuButton.commands()).toEqual({ type: 'commands' })
    expect(menuButton.webApp('Open', 'https://example.com')).toEqual({
      type: 'web_app',
      text: 'Open',
      web_app: { url: 'https://example.com' },
    })
    expect(menuButton.webApp('Open', { url: 'https://example.com' })).toMatchObject({
      web_app: { url: 'https://example.com' },
    })
  })

  it('builds commands and every scope they can apply to', () => {
    expect(botCommands.of('start', 'Begin')).toEqual({ command: 'start', description: 'Begin' })
    expect(
      botCommands.list([
        ['start', 'Begin'],
        ['help', 'Explain'],
      ]),
    ).toEqual([
      { command: 'start', description: 'Begin' },
      { command: 'help', description: 'Explain' },
    ])

    const { scope } = botCommands
    expect(scope.default()).toEqual({ type: 'default' })
    expect(scope.allPrivateChats()).toEqual({ type: 'all_private_chats' })
    expect(scope.allGroupChats()).toEqual({ type: 'all_group_chats' })
    expect(scope.allChatAdministrators()).toEqual({ type: 'all_chat_administrators' })
    expect(scope.chat(-100)).toEqual({ type: 'chat', chat_id: -100 })
    expect(scope.chatAdministrators('@group')).toEqual({
      type: 'chat_administrators',
      chat_id: '@group',
    })
    expect(scope.chatMember('@group', 7)).toEqual({
      type: 'chat_member',
      chat_id: '@group',
      user_id: 7,
    })
  })

  it('names every permission, because an absent one is a withheld one', () => {
    const all = permissions.all()
    const none = permissions.none()

    expect(Object.keys(all).sort()).toEqual(Object.keys(none).sort())
    expect(Object.values(all).every((value) => value === true)).toBe(true)
    expect(Object.values(none).every((value) => value === false)).toBe(true)
    expect(all.can_send_messages).toBe(true)
    expect(all.can_manage_topics).toBe(true)
    expect(none.can_react_to_messages).toBe(false)
  })

  it('takes a permission set back to a read-only chat that can still react', () => {
    const set = permissions.none({ can_react_to_messages: true })

    expect(set.can_react_to_messages).toBe(true)
    expect(set.can_send_messages).toBe(false)
  })

  it('names every administrator right, anonymity included', () => {
    const all = adminRights.all()
    const none = adminRights.none({ can_delete_messages: true })

    expect(Object.keys(all)).toHaveLength(17)
    expect(all.is_anonymous).toBe(true)
    expect(all.can_manage_tags).toBe(true)
    expect(none.can_delete_messages).toBe(true)
    expect(none.can_promote_members).toBe(false)
  })
})
