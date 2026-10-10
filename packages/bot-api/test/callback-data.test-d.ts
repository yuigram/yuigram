// SPDX-License-Identifier: MIT

/**
 * Type-level assertions for typed callback data.
 *
 * The value of a schema is that the compiler knows what a button carries, so
 * these check the inference rather than the runtime: a field declared as a
 * number arrives as a number, a literal narrows to its own set, and a state
 * missing a field does not compile.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { defineCallbackData } from '../src/callback-data.js'
import type { InlineKeyboardButton } from '../src/generated/types/index.js'

const buy = defineCallbackData('buy')
  .number('productId')
  .literal('size', ['small', 'medium', 'large'])
  .boolean('gift')
  .string('note')

describe('what a schema knows about its own data', () => {
  it('gives each field back at the type it was declared with', () => {
    const state = buy.unpack('buy:1:0:1:x')

    // The schema builds its state by intersection as fields are declared, so
    // each field is checked on its own rather than against one flat object.
    expectTypeOf(state).toExtend<Record<string, unknown> | undefined>()
    expectTypeOf(state?.productId).toEqualTypeOf<number | undefined>()
    expectTypeOf(state?.gift).toEqualTypeOf<boolean | undefined>()
    expectTypeOf(state?.note).toEqualTypeOf<string | undefined>()
  })

  it('narrows a literal to its own values rather than to string', () => {
    const size = buy.unpack('buy:1:0:1:x')?.size

    expectTypeOf(size).toEqualTypeOf<'small' | 'medium' | 'large' | undefined>()
  })

  it('builds a button the keyboard types accept', () => {
    expectTypeOf(
      buy.button('Buy', { productId: 1, size: 'small', gift: false, note: 'x' }),
    ).toExtend<InlineKeyboardButton>()
  })

  it('refuses a state that does not match the schema', () => {
    // @ts-expect-error — `note` was declared and is missing
    buy.pack({ productId: 1, size: 'small', gift: false })
    // @ts-expect-error — `size` is not any string
    buy.pack({ productId: 1, size: 'huge', gift: false, note: 'x' })
    // @ts-expect-error — `productId` is a number
    buy.pack({ productId: '1', size: 'small', gift: false, note: 'x' })
  })

  it('takes a partial when repacking, because that is the point', () => {
    expectTypeOf(buy.repack('buy:1:0:1:x', { gift: true })).toEqualTypeOf<string>()
    // @ts-expect-error — still typed: a field that exists, at the wrong type
    buy.repack('buy:1:0:1:x', { gift: 'yes' })
  })

  it('has no fields before any are declared', () => {
    const bare = defineCallbackData('bare')

    expectTypeOf(bare.unpack('bare')).toEqualTypeOf<Record<never, never> | undefined>()
  })
})
