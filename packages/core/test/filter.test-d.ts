/**
 * Type-level assertions for the filter machinery.
 *
 * These retire the Phase 2 blocking risk: the whole routing design assumes
 * `Filter<Base, Mod>` narrowing survives composition and chained access. If it
 * does not, the design changes, and it is far cheaper to learn that here than
 * after the dispatcher is built on top of it.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { AsyncFilter, Filter, FilterMatch, Modify } from '../src/filter/index.js'
import { and, defineAsyncFilter, defineFilter, not, or } from '../src/filter/index.js'

/** A context shape with the optional fields real updates have. */
interface Ctx {
  kind: string
  text?: string | undefined
  caption?: string | undefined
  chatId: number
}

interface MessageCtx extends Ctx {
  kind: 'message'
}

interface CallbackCtx extends Ctx {
  kind: 'callback'
  data?: string | undefined
}

const isMessage = defineFilter<MessageCtx>('message', (v) => (v as Ctx).kind === 'message', {
  kinds: ['message'],
})
const isCallback = defineFilter<CallbackCtx>('callback', (v) => (v as Ctx).kind === 'callback', {
  kinds: ['callback'],
})
const hasText = defineFilter<Ctx, { text: string }>('hasText', (v) => (v as Ctx).text !== undefined)
const hasCaption = defineFilter<Ctx, { caption: string }>(
  'hasCaption',
  (v) => (v as Ctx).caption !== undefined,
)

describe('Modify', () => {
  it('removes optionality from a refined field', () => {
    expectTypeOf<Modify<Ctx, { text: string }>['text']>().toEqualTypeOf<string>()
  })

  it('replaces call signatures instead of building an overload set', () => {
    // This is the case that justifies `Omit` over a naive intersection.
    // `Base & Mod` on a method yields an overload accepting *either* shape,
    // which silently permits the calls the refinement was meant to rule out.
    interface WithMethod {
      reply(text: string): Promise<void>
    }
    interface Narrowed {
      reply(text: string, extra: number): Promise<void>
    }

    expectTypeOf<Modify<WithMethod, Narrowed>['reply']>().toEqualTypeOf<Narrowed['reply']>()
    expectTypeOf<WithMethod & Narrowed>().not.toEqualTypeOf<Modify<WithMethod, Narrowed>>()
  })

  it('leaves untouched keys alone', () => {
    expectTypeOf<Modify<Ctx, { text: string }>['chatId']>().toEqualTypeOf<number>()
    expectTypeOf<Modify<Ctx, { text: string }>['caption']>().toEqualTypeOf<string | undefined>()
  })

  it('collapses to Base when Mod is unknown', () => {
    expectTypeOf<Modify<Ctx, unknown>>().toEqualTypeOf<Ctx>()
  })
})

describe('defineFilter', () => {
  it('produces a type guard that narrows Base', () => {
    const value: Ctx = { kind: 'message', chatId: 1 }
    if (isMessage(value)) {
      expectTypeOf(value).toEqualTypeOf<MessageCtx>()
    }
  })

  it('carries both type parameters', () => {
    expectTypeOf(hasText).toEqualTypeOf<Filter<Ctx, { text: string }>>()
  })
})

describe('FilterMatch', () => {
  it('applies Mod over Base', () => {
    expectTypeOf<FilterMatch<typeof hasText>>().toEqualTypeOf<Modify<Ctx, { text: string }>>()
    expectTypeOf<FilterMatch<typeof hasText>['text']>().toEqualTypeOf<string>()
  })

  it('is just Base for an unrefined filter', () => {
    expectTypeOf<FilterMatch<typeof isMessage>>().toEqualTypeOf<MessageCtx>()
  })
})

describe('and', () => {
  it('intersects Base and Mod', () => {
    const f = isMessage.and(hasText)
    expectTypeOf(f).toEqualTypeOf<Filter<MessageCtx & Ctx, { text: string }>>()
  })

  it('yields a handler type where the refined field is required', () => {
    type Match = FilterMatch<ReturnType<typeof isMessage.and<Ctx, { text: string }>>>
    expectTypeOf<Match['text']>().toEqualTypeOf<string>()
  })

  it('survives chained composition', () => {
    // Three-deep composition is the case most likely to lose the refinement.
    const f = isMessage.and(hasText).and(hasCaption)
    type Match = FilterMatch<typeof f>
    expectTypeOf<Match['text']>().toEqualTypeOf<string>()
    expectTypeOf<Match['caption']>().toEqualTypeOf<string>()
    expectTypeOf<Match['kind']>().toEqualTypeOf<'message'>()
  })

  it('narrows at a raw call site', () => {
    const value: Ctx = { kind: 'message', chatId: 1 }
    const f = isMessage.and(hasText)
    if (f(value)) {
      // A type predicate can only express Base, so `text` stays optional here.
      // Handler registration applies Modify; this asserts the documented split.
      expectTypeOf(value).toEqualTypeOf<MessageCtx & Ctx>()
    }
  })

  it('composes via the free function identically', () => {
    expectTypeOf(and(isMessage, hasText)).toEqualTypeOf<
      Filter<MessageCtx & Ctx, { text: string }>
    >()
  })
})

describe('or', () => {
  it('unions Base and Mod', () => {
    const f = isMessage.or(isCallback)
    expectTypeOf(f).toEqualTypeOf<Filter<MessageCtx | CallbackCtx, unknown>>()
  })

  it('discards a refinement the other branch does not guarantee', () => {
    // `{ text: string } | unknown` is `unknown`: if one branch proves nothing,
    // the union proves nothing. Anything else would be unsound.
    const f = hasText.or(isMessage)
    expectTypeOf<FilterMatch<typeof f>>().toEqualTypeOf<Ctx | MessageCtx>()
  })

  it('keeps a refinement both branches guarantee', () => {
    const f = hasText.or(hasText)
    expectTypeOf<FilterMatch<typeof f>['text']>().toEqualTypeOf<string>()
  })

  it('composes via the free function identically', () => {
    expectTypeOf(or(isMessage, isCallback)).toEqualTypeOf<
      Filter<MessageCtx | CallbackCtx, unknown>
    >()
  })
})

describe('not', () => {
  it('drops both narrowings', () => {
    expectTypeOf(isMessage.not()).toEqualTypeOf<Filter<unknown, unknown>>()
    expectTypeOf(not(hasText)).toEqualTypeOf<Filter<unknown, unknown>>()
  })
})

describe('async filters', () => {
  const isAllowed = defineAsyncFilter<Ctx, { chatId: number }>('isAllowed', async () => true)

  it('does not narrow at the call site', () => {
    expectTypeOf(isAllowed).returns.toEqualTypeOf<Promise<boolean>>()
  })

  it('infects composition with a sync filter', () => {
    const f = isAllowed.and(isMessage)
    expectTypeOf(f).toEqualTypeOf<AsyncFilter<Ctx & MessageCtx, { chatId: number }>>()
  })

  it('still carries Mod through to FilterMatch', () => {
    expectTypeOf<FilterMatch<typeof isAllowed>['chatId']>().toEqualTypeOf<number>()
  })
})
