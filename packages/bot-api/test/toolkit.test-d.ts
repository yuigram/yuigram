/**
 * The convenience layer, at the type level.
 *
 * Filters must narrow, keyboards must be markup, media must be accepted where
 * Telegram expects a file. None of that is observable at runtime, and all of it
 * is the difference between a helper that saves typing and one that saves
 * mistakes.
 */

import { and } from '@yuigram/core'
import { assertType, describe, expectTypeOf, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { f, has } from '../src/filters/index.js'
import { html, md, raw } from '../src/format.js'
import type {
  InlineKeyboardMarkup,
  Message,
  PhotoSize,
  ReplyKeyboardMarkup,
} from '../src/generated/types/index.js'
import { InlineKeyboard, Keyboard } from '../src/keyboards.js'
import { media } from '../src/media.js'

const bot = Bot.fromToken('1:x')

describe('presence filters narrow', () => {
  it('proves a field is there', () => {
    bot.on(has.photo, (message) => {
      // No `?.` and no `!`: the registration proved it.
      expectTypeOf(message.photo).toEqualTypeOf<PhotoSize[]>()
    })
  })

  it('proves text through the media alias too', () => {
    bot.on(f.media.video, (message) => {
      expectTypeOf(message.video).not.toEqualTypeOf<undefined>()
    })
  })

  it('narrows through a composition', () => {
    const staffPhoto = and(f.sender.id(1), f.media.photo)

    bot.on(staffPhoto, (message) => {
      expectTypeOf(message.photo).toEqualTypeOf<PhotoSize[]>()
    })
  })

  it('narrows text and caption to strings', () => {
    bot.on(f.text(/^\d+$/), (message) => {
      expectTypeOf(message.text).toEqualTypeOf<string>()
    })

    bot.on(f.caption(), (message) => {
      expectTypeOf(message.caption).toEqualTypeOf<string>()
    })
  })

  it('narrows callback data', () => {
    bot.on(f.callback.data(/^buy:/), (query) => {
      expectTypeOf(query.data).toEqualTypeOf<string>()
    })
  })
})

describe('keyboards are markup', () => {
  it('passes straight into reply_markup with no build step', () => {
    const inline = new InlineKeyboard().text('a', 'a')
    const reply = new Keyboard().text('a')

    assertType<InlineKeyboardMarkup>(inline)
    assertType<ReplyKeyboardMarkup>(reply)

    bot.onMessage((message) => {
      assertType<Promise<Message>>(message.reply('pick', { reply_markup: inline }))
      assertType<Promise<Message>>(message.sendMessage({ text: 'pick', reply_markup: reply }))
    })
  })

  it('chains, so a keyboard is one expression', () => {
    expectTypeOf(new InlineKeyboard().text('a', 'a').row()).toEqualTypeOf<InlineKeyboard>()
    expectTypeOf(new Keyboard().text('a').resized()).toEqualTypeOf<Keyboard>()
  })
})

describe('media sources fit where a file goes', () => {
  it('is accepted by a generated media parameter', () => {
    bot.onMessage((message) => {
      assertType<Promise<Message>>(message.sendPhoto({ photo: media.path('./cat.jpg') }))
      assertType<Promise<Message>>(message.sendPhoto({ photo: media.url('https://e.com/c.jpg') }))
      assertType<Promise<Message>>(message.sendPhoto({ photo: media.id('file-id') }))
      assertType<Promise<Message>>(
        message.sendDocument({ document: media.buffer(new Uint8Array(), 'a.bin') }),
      )
    })
  })
})

describe('formatting', () => {
  it('produces strings a text parameter accepts', () => {
    expectTypeOf(html`<b>${'x'}</b>`).toEqualTypeOf<string>()
    expectTypeOf(md`*${'x'}*`).toEqualTypeOf<string>()

    bot.onMessage((message) => {
      assertType<Promise<Message>>(
        message.reply(html`Hi ${message.sender?.first_name}`, { parse_mode: 'HTML' }),
      )
    })
  })

  it('accepts already-formatted text without escaping it again', () => {
    const link = html`<a href="https://e.com">e</a>`
    expectTypeOf(html`See ${raw(link)}`).toEqualTypeOf<string>()
  })
})

describe('replying with media', () => {
  it('types the options for the method the key chose', () => {
    bot.onMessage((message) => {
      assertType<Promise<Message>>(message.reply({ photo: 'id', caption: 'c' }))
      assertType<Promise<Message>>(message.reply({ video: 'id', duration: 10 }))
      assertType<Promise<Message>>(message.send({ document: media.path('./a.pdf') }))

      // @ts-expect-error the chat comes from the update and is never passed,
      // so it is not a key of any member of the union.
      message.reply({ photo: 'id', chat_id: 5 })

      // An option belonging to a *different* member — `duration` on a photo —
      // is accepted: TypeScript's excess-property check admits a key present in
      // any member of a union. Telegram ignores it, so the cost is a silently
      // useless parameter rather than a wrong call. Splitting `reply` into
      // eight names would catch it, at the price of eight names.
      message.reply({ photo: 'id', duration: 10 })
    })
  })

  it('keeps the text form, with its own options', () => {
    bot.onMessage((message) => {
      assertType<Promise<Message>>(message.reply('hi', { parse_mode: 'HTML' }))

      // @ts-expect-error a typo in an option is a typo, not an extra field.
      message.reply('hi', { parse_moed: 'HTML' })
    })
  })
})

describe('hooks', () => {
  it('takes a call and a continuation', () => {
    bot.hook(async (call, next) => {
      expectTypeOf(call.method).toEqualTypeOf<string>()
      expectTypeOf(call.attempt).toEqualTypeOf<number>()
      return next()
    })
  })
})
