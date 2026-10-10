// SPDX-License-Identifier: MIT

/**
 * Typed callback data.
 *
 * Telegram measures `callback_data` in bytes of UTF-8 and hands it back
 * verbatim, so the cases that matter are the ones a hand-rolled format gets
 * wrong: a field carrying the separator, a number returning as a string, a
 * button from an older release, and a payload that fits in characters but not
 * in bytes.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  CALLBACK_DATA_LIMIT,
  CallbackDataInvalid,
  CallbackDataTooLong,
  defineCallbackData,
} from '../src/callback-data.js'

const buy = defineCallbackData('buy')
  .number('productId')
  .literal('size', ['small', 'medium', 'large'])
  .boolean('gift')

describe('packing and reading back', () => {
  it('round-trips every field with its own type', () => {
    const packed = buy.pack({ productId: 42, size: 'large', gift: true })

    expect(buy.unpack(packed)).toEqual({ productId: 42, size: 'large', gift: true })
    // A number comes back as a number, not as the text it travelled as.
    expect(typeof buy.unpack(packed)?.productId).toBe('number')
    expect(typeof buy.unpack(packed)?.gift).toBe('boolean')
  })

  it('writes a literal as its position, so a long value costs no more', () => {
    const short = buy.pack({ productId: 1, size: 'small', gift: false })
    const long = buy.pack({ productId: 1, size: 'medium', gift: false })

    expect(short).toHaveLength(long.length)
    expect(buy.unpack(long)?.size).toBe('medium')
  })

  it('handles negative and large whole numbers', () => {
    const schema = defineCallbackData('n').number('value')

    for (const value of [0, -1, 1_000_000, Number.MAX_SAFE_INTEGER]) {
      expect(schema.unpack(schema.pack({ value }))?.value).toBe(value)
    }
  })

  it('builds a button carrying the packed data', () => {
    const button = buy.button('Buy it', { productId: 7, size: 'small', gift: false })

    expect(button.text).toBe('Buy it')
    expect(buy.unpack(button.callback_data as string)).toEqual({
      productId: 7,
      size: 'small',
      gift: false,
    })
  })

  it('changes some fields and leaves the rest', () => {
    const packed = buy.pack({ productId: 42, size: 'small', gift: false })

    expect(buy.unpack(buy.repack(packed, { gift: true }))).toEqual({
      productId: 42,
      size: 'small',
      gift: true,
    })
  })
})

describe('data that is not this schema’s', () => {
  it('is read as nothing rather than as a wrong answer', () => {
    // Another schema's name.
    expect(buy.unpack('sell:42:0:1')).toBeUndefined()
    // This schema as it was before a field was added, and after.
    expect(buy.unpack('buy:42:0')).toBeUndefined()
    expect(buy.unpack('buy:42:0:1:extra')).toBeUndefined()
    // A field whose text is not of its type.
    expect(buy.unpack('buy:notanumber:0:1')).toBeUndefined()
    expect(buy.unpack('buy:42:99:1')).toBeUndefined()
    expect(buy.unpack('buy:42:0:maybe')).toBeUndefined()
    expect(buy.unpack('')).toBeUndefined()
  })

  it('says so when asked to change data it does not own', () => {
    expect(() => buy.repack('sell:1:0:1', { gift: true })).toThrow(CallbackDataInvalid)
  })

  it('matches only its own, which is what the filter reads', () => {
    const packed = buy.pack({ productId: 1, size: 'small', gift: false })

    expect(buy.matches(packed)).toBe(true)
    expect(buy.matches('sell:1:0:0')).toBe(false)
    expect(buy.filter({ data: packed })).toBe(true)
    expect(buy.filter({ data: 'sell:1' })).toBe(false)
    expect(buy.filter({})).toBe(false)
  })
})

describe('the limit Telegram actually enforces', () => {
  it('counts bytes of UTF-8, not characters', () => {
    const schema = defineCallbackData('x').string('note')

    // 62 ASCII characters plus 'x:' is exactly the limit.
    const ascii = 'a'.repeat(CALLBACK_DATA_LIMIT - 2)
    expect(schema.pack({ note: ascii })).toHaveLength(CALLBACK_DATA_LIMIT)
    expect(() => schema.pack({ note: `${ascii}a` })).toThrow(CallbackDataTooLong)

    // An emoji is four bytes and one character in the count that matters.
    const emoji = '🎁'.repeat(15)
    expect(new TextEncoder().encode(emoji).length).toBe(60)
    expect(schema.pack({ note: emoji })).toBeTypeOf('string')
    expect(() => schema.pack({ note: `${emoji}🎁` })).toThrow(CallbackDataTooLong)
    // The same string measured in characters would be well inside the limit.
    expect(`x:${emoji}🎁`.length).toBeLessThan(CALLBACK_DATA_LIMIT)
  })

  it('counts a two-byte letter as two', () => {
    const schema = defineCallbackData('x').string('note')
    const cyrillic = 'д'.repeat(31)

    expect(new TextEncoder().encode(cyrillic).length).toBe(62)
    expect(schema.pack({ note: cyrillic })).toBeTypeOf('string')
    expect(() => schema.pack({ note: `${cyrillic}д` })).toThrow(CallbackDataTooLong)
  })

  it('names the size in the refusal, so the fix is obvious', () => {
    const schema = defineCallbackData('x').string('note')

    expect(() => schema.pack({ note: 'a'.repeat(100) })).toThrow(/102 bytes of UTF-8/)
  })
})

describe('what a schema refuses to be given', () => {
  it('refuses a value carrying the separator, which would split into two fields', () => {
    const schema = defineCallbackData('x').string('note')

    expect(() => schema.pack({ note: 'a:b' })).toThrow(/cannot contain/)
    expect(() => defineCallbackData('a:b')).toThrow(/cannot contain/)
    expect(() => defineCallbackData('')).toThrow(/cannot be empty/)
  })

  it('refuses a number that is not whole, and the wrong type in any field', () => {
    const schema = defineCallbackData('x').number('n').boolean('b').string('s')

    expect(() => schema.pack({ n: 1.5, b: true, s: 'x' })).toThrow(/whole number/)
    expect(() => schema.pack({ n: Number.NaN, b: true, s: 'x' })).toThrow(/whole number/)
    expect(() => schema.pack({ n: 1, b: 'yes' as never, s: 'x' })).toThrow(/yes or no/)
    expect(() => schema.pack({ n: 1, b: true, s: 5 as never })).toThrow(/holds text/)
  })

  it('refuses a literal outside its set, and a set with nothing in it', () => {
    expect(() => buy.pack({ productId: 1, size: 'huge' as never, gift: false })).toThrow(
      /small, medium, large/,
    )
    expect(() => defineCallbackData('x').literal('size', [])).toThrow(/no values/)
  })

  it('refuses a missing field rather than packing a hole', () => {
    expect(() => buy.pack({ productId: 1, size: 'small' } as never)).toThrow(/has no value/)
  })

  it('refuses two fields under one name', () => {
    expect(() =>
      defineCallbackData('x')
        .number('id')
        .string('id' as never),
    ).toThrow(/already declared/)
  })

  it('reports every refusal as a validation failure', () => {
    const schema = defineCallbackData('x').string('note')

    expect(() => schema.pack({ note: 'a:b' })).toThrow(ValidationError)
  })
})

describe('what a schema does not claim', () => {
  it('reads data without saying anything about who may act on it', () => {
    // Parsing is not authorisation: data captured from one person's button is
    // still valid data, and the application decides whether the person
    // pressing it may. The schema's job ends at the shape.
    const mine = buy.pack({ productId: 42, size: 'small', gift: false })
    const replayed = buy.unpack(mine)

    expect(replayed).toEqual({ productId: 42, size: 'small', gift: false })
    expect(buy.fields.map((field) => field.key)).toEqual(['productId', 'size', 'gift'])
  })
})
