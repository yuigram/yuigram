/**
 * Runtime behaviour of the filter machinery.
 *
 * The `kinds` assertions matter most: the dispatcher uses that hint to skip
 * predicate evaluation, so a hint that is too narrow means a handler silently
 * never fires. That failure is invisible at runtime, which is exactly the kind
 * this suite exists to prevent.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  and,
  defineAsyncFilter,
  defineFilter,
  every,
  isAsyncFilter,
  isFilter,
  not,
  or,
  some,
} from '../src/filter/index.js'

interface Value {
  kind: string
  text?: string
}

const isMessage = defineFilter('message', (v) => (v as Value).kind === 'message', {
  kinds: ['message'],
})
const isCallback = defineFilter('callback', (v) => (v as Value).kind === 'callback', {
  kinds: ['callback'],
})
const hasText = defineFilter('hasText', (v) => (v as Value).text !== undefined)

const message: Value = { kind: 'message', text: 'hi' }
const silentMessage: Value = { kind: 'message' }
const callback: Value = { kind: 'callback' }

describe('defineFilter', () => {
  it('evaluates its predicate', () => {
    expect(isMessage(message)).toBe(true)
    expect(isMessage(callback)).toBe(false)
  })

  it('carries name and kinds', () => {
    expect(isMessage.name).toBe('message')
    expect(isMessage.kinds).toEqual(['message'])
  })

  it('leaves kinds undefined when unconstrained', () => {
    expect(hasText.kinds).toBeUndefined()
  })

  it('is recognised by isFilter', () => {
    expect(isFilter(isMessage)).toBe(true)
    expect(isFilter(() => true)).toBe(false)
    expect(isFilter(null)).toBe(false)
    expect(isFilter({})).toBe(false)
  })
})

describe('and', () => {
  it('matches only when both match', () => {
    const f = isMessage.and(hasText)
    expect(f(message)).toBe(true)
    expect(f(silentMessage)).toBe(false)
    expect(f(callback)).toBe(false)
  })

  it('short-circuits on the first failure', () => {
    const second = vi.fn(() => true)
    const f = and(
      defineFilter('never', () => false),
      defineFilter('second', second),
    )
    expect(f(message)).toBe(false)
    expect(second).not.toHaveBeenCalled()
  })

  it('intersects kind hints', () => {
    const f = and(
      defineFilter('a', () => true, { kinds: ['message', 'callback'] }),
      defineFilter('b', () => true, { kinds: ['callback', 'inline'] }),
    )
    expect(f.kinds).toEqual(['callback'])
  })

  it('inherits the hint when only one side is constrained', () => {
    expect(isMessage.and(hasText).kinds).toEqual(['message'])
    expect(hasText.and(isMessage).kinds).toEqual(['message'])
  })

  it('produces an empty hint for disjoint kinds', () => {
    // A filter that can never match is worth representing honestly rather than
    // widening it back to "may match anything".
    expect(isMessage.and(isCallback).kinds).toEqual([])
  })

  it('names the composition readably', () => {
    expect(isMessage.and(hasText).name).toBe('message and hasText')
  })
})

describe('or', () => {
  it('matches when either matches', () => {
    const f = isMessage.or(isCallback)
    expect(f(message)).toBe(true)
    expect(f(callback)).toBe(true)
    expect(f({ kind: 'inline' })).toBe(false)
  })

  it('short-circuits on the first success', () => {
    const second = vi.fn(() => true)
    const f = or(
      defineFilter('always', () => true),
      defineFilter('second', second),
    )
    expect(f(message)).toBe(true)
    expect(second).not.toHaveBeenCalled()
  })

  it('unions kind hints', () => {
    expect(isMessage.or(isCallback).kinds).toEqual(['message', 'callback'])
  })

  it('drops the hint when either side is unconstrained', () => {
    // If one branch may match anything, so may the union. Keeping the other
    // branch's hint here would make the dispatcher skip updates it must see.
    expect(isMessage.or(hasText).kinds).toBeUndefined()
    expect(hasText.or(isMessage).kinds).toBeUndefined()
  })
})

describe('not', () => {
  it('inverts the predicate', () => {
    const f = isMessage.not()
    expect(f(message)).toBe(false)
    expect(f(callback)).toBe(true)
  })

  it('always drops the kind hint', () => {
    // `not(isMessage)` matches every kind except message — not expressible as
    // a list, so the dispatcher must evaluate it against everything.
    expect(isMessage.not().kinds).toBeUndefined()
    expect(not(isMessage).kinds).toBeUndefined()
  })
})

describe('every / some', () => {
  it('every matches when all match', () => {
    expect(every(isMessage, hasText)(message)).toBe(true)
    expect(every(isMessage, hasText)(silentMessage)).toBe(false)
  })

  it('some matches when any match', () => {
    expect(some(isMessage, isCallback)(callback)).toBe(true)
    expect(some(isMessage, isCallback)({ kind: 'inline' })).toBe(false)
  })

  it('handles the empty case as the identity of each operation', () => {
    expect(every()(message)).toBe(true)
    expect(some()(message)).toBe(false)
  })
})

describe('async filters', () => {
  const allowed = defineAsyncFilter('allowed', async (v) => (v as Value).kind === 'message')

  it('resolves a boolean', async () => {
    await expect(allowed(message)).resolves.toBe(true)
    await expect(allowed(callback)).resolves.toBe(false)
  })

  it('is identified by isAsyncFilter', () => {
    expect(isAsyncFilter(allowed)).toBe(true)
    expect(isAsyncFilter(isMessage)).toBe(false)
  })

  it('makes composition asynchronous', async () => {
    const f = allowed.and(hasText)
    expect(isAsyncFilter(f)).toBe(true)
    await expect(f(message)).resolves.toBe(true)
    await expect(f(silentMessage)).resolves.toBe(false)
  })

  it('short-circuits like the sync variants', async () => {
    const second = vi.fn(async () => true)
    const f = and(
      defineAsyncFilter('never', async () => false),
      defineAsyncFilter('second', second),
    )
    await expect(f(message)).resolves.toBe(false)
    expect(second).not.toHaveBeenCalled()
  })

  it('merges kind hints the same way', () => {
    const f = defineAsyncFilter('a', async () => true, { kinds: ['message'] }).and(isCallback)
    expect(f.kinds).toEqual([])
  })

  it('inverts correctly', async () => {
    await expect(allowed.not()(message)).resolves.toBe(false)
    await expect(allowed.not()(callback)).resolves.toBe(true)
  })
})
