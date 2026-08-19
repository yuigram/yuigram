/**
 * Dispatcher behaviour.
 *
 * The band-ordering and reserved-slot cases encode the guarantee plugins rely
 * on: a session plugin registering `high` runs before application handlers
 * regardless of when the user installed it. The `collectKinds` cases guard a
 * subscription decision where being too narrow silently drops updates.
 */

import { describe, expect, it, vi } from 'vitest'
import { Dispatcher } from '../src/dispatch/dispatcher.js'
import { defineAsyncFilter, defineFilter } from '../src/filter/index.js'
import type { Middleware } from '../src/middleware/compose.js'

interface Ctx {
  kind: string
  trail: string[]
  text?: string
}

function ctx(kind: string, text?: string): Ctx {
  return text === undefined ? { kind, trail: [] } : { kind, trail: [], text }
}

function tracer(label: string): Middleware<Ctx> {
  return async (c, next) => {
    c.trail.push(`>${label}`)
    await next()
    c.trail.push(`<${label}`)
  }
}

describe('handler registration', () => {
  it('runs a handler registered for a kind', async () => {
    const d = new Dispatcher<Ctx>()
    d.on('message', (c) => void c.trail.push('handled'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['handled'])
  })

  it('skips handlers for other kinds', async () => {
    const d = new Dispatcher<Ctx>()
    d.on('message', (c) => void c.trail.push('message'))

    const c = ctx('callback')
    await d.dispatch(c)

    expect(c.trail).toEqual([])
  })

  it('accepts a list of kinds', async () => {
    const d = new Dispatcher<Ctx>()
    d.on(['message', 'edited'], (c) => void c.trail.push('handled'))

    for (const kind of ['message', 'edited']) {
      const c = ctx(kind)
      await d.dispatch(c)
      expect(c.trail).toEqual(['handled'])
    }
  })

  it('runs every matching handler, not only the first', async () => {
    // Independent concerns must compose without knowing about each other.
    const d = new Dispatcher<Ctx>()
    d.on('message', (c) => void c.trail.push('a'))
    d.on('message', (c) => void c.trail.push('b'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['a', 'b'])
  })

  it('runs handlers in registration order', async () => {
    const d = new Dispatcher<Ctx>()
    for (const label of ['1', '2', '3']) {
      d.on('message', (c) => void c.trail.push(label))
    }

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['1', '2', '3'])
  })

  it('awaits asynchronous handlers', async () => {
    const d = new Dispatcher<Ctx>()
    d.on('message', async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      c.trail.push('slow')
    })

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['slow'])
  })
})

describe('filters', () => {
  const hasText = defineFilter<Ctx, { text: string }>(
    'hasText',
    (v) => (v as Ctx).text !== undefined,
  )
  const isMessage = defineFilter<Ctx>('message', (v) => (v as Ctx).kind === 'message', {
    kinds: ['message'],
  })

  it('runs only when the filter matches', async () => {
    const d = new Dispatcher<Ctx>()
    d.on(hasText, (c) => void c.trail.push('has text'))

    const withText = ctx('message', 'hi')
    const without = ctx('message')

    await d.dispatch(withText)
    await d.dispatch(without)

    expect(withText.trail).toEqual(['has text'])
    expect(without.trail).toEqual([])
  })

  it('uses the kinds hint to skip predicate evaluation', async () => {
    const predicate = vi.fn(() => true)
    const scoped = defineFilter('scoped', predicate, { kinds: ['message'] })

    const d = new Dispatcher<Ctx>()
    d.on(scoped, () => {})

    await d.dispatch(ctx('callback'))

    expect(predicate).not.toHaveBeenCalled()
  })

  it('evaluates predicates for kinds within the hint', async () => {
    const predicate = vi.fn(() => true)
    const scoped = defineFilter('scoped', predicate, { kinds: ['message'] })

    const d = new Dispatcher<Ctx>()
    d.on(scoped, () => {})

    await d.dispatch(ctx('message'))

    expect(predicate).toHaveBeenCalledOnce()
  })

  it('supports composed filters', async () => {
    const d = new Dispatcher<Ctx>()
    d.on(isMessage.and(hasText), (c) => void c.trail.push('both'))

    const match = ctx('message', 'hi')
    const noText = ctx('message')
    const wrongKind = ctx('callback', 'hi')

    for (const c of [match, noText, wrongKind]) await d.dispatch(c)

    expect(match.trail).toEqual(['both'])
    expect(noText.trail).toEqual([])
    expect(wrongKind.trail).toEqual([])
  })

  it('awaits async filters', async () => {
    const allowed = defineAsyncFilter('allowed', async (v) => (v as Ctx).kind === 'message')

    const d = new Dispatcher<Ctx>()
    d.on(allowed, (c) => void c.trail.push('allowed'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['allowed'])
  })
})

describe('middleware bands', () => {
  it('runs high before normal before handlers before low', async () => {
    const d = new Dispatcher<Ctx>()

    d.use(tracer('low'), { priority: 'low' })
    d.use(tracer('normal'))
    d.use(tracer('high'), { priority: 'high' })
    d.on('message', (c) => void c.trail.push('handler'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['>high', '>normal', 'handler', '>low', '<low', '<normal', '<high'])
  })

  it('places handlers correctly regardless of registration order', async () => {
    // The guarantee a plugin relies on: declaring `high` is enough, with no
    // requirement to be installed before application code.
    const d = new Dispatcher<Ctx>()

    d.on('message', (c) => void c.trail.push('handler'))
    d.use(tracer('high'), { priority: 'high' })

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['>high', 'handler', '<high'])
  })

  it('runs middleware even when no handler matches', async () => {
    const d = new Dispatcher<Ctx>()
    d.use(tracer('mw'))
    d.on('message', () => {})

    const c = ctx('callback')
    await d.dispatch(c)

    expect(c.trail).toEqual(['>mw', '<mw'])
  })

  it('lets middleware short-circuit before handlers', async () => {
    const d = new Dispatcher<Ctx>()
    d.use((c) => void c.trail.push('blocked'), { priority: 'high' })
    d.on('message', (c) => void c.trail.push('handler'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['blocked'])
  })

  it('preserves registration order within a band', async () => {
    const d = new Dispatcher<Ctx>()
    d.use(tracer('1'))
    d.use(tracer('2'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['>1', '>2', '<2', '<1'])
  })
})

describe('once', () => {
  it('runs a once handler a single time', async () => {
    const d = new Dispatcher<Ctx>()
    d.once('message', (c) => void c.trail.push('once'))

    const first = ctx('message')
    const second = ctx('message')
    await d.dispatch(first)
    await d.dispatch(second)

    expect(first.trail).toEqual(['once'])
    expect(second.trail).toEqual([])
  })

  it('does not consume the registration on a non-match', async () => {
    const d = new Dispatcher<Ctx>()
    d.once('message', (c) => void c.trail.push('once'))

    await d.dispatch(ctx('callback'))
    const later = ctx('message')
    await d.dispatch(later)

    expect(later.trail).toEqual(['once'])
  })

  it('reduces the registration count once consumed', async () => {
    const d = new Dispatcher<Ctx>()
    d.once('message', () => {})
    expect(d.size).toBe(1)

    await d.dispatch(ctx('message'))
    expect(d.size).toBe(0)
  })

  it('does not remove a permanent registration sharing the same function', async () => {
    // Removing by handler identity would drop both registrations, silently
    // disabling a permanent handler the first time a once handler fired.
    const d = new Dispatcher<Ctx>()
    const handler = (c: Ctx): void => void c.trail.push('run')

    d.on('message', handler)
    d.once('message', handler)

    const first = ctx('message')
    await d.dispatch(first)
    expect(first.trail).toEqual(['run', 'run'])

    const second = ctx('message')
    await d.dispatch(second)
    expect(second.trail).toEqual(['run'])
    expect(d.size).toBe(1)
  })
})

describe('off', () => {
  it('removes a handler', async () => {
    const d = new Dispatcher<Ctx>()
    const handler = (c: Ctx): void => void c.trail.push('handled')

    d.on('message', handler)
    expect(d.off(handler)).toBe(true)

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual([])
  })

  it('reports when nothing matched', () => {
    expect(new Dispatcher<Ctx>().off(() => {})).toBe(false)
  })
})

describe('collectKinds', () => {
  it('reports the kinds handlers are registered for', () => {
    const d = new Dispatcher<Ctx>()
    d.on('message', () => {})
    d.on(['callback', 'inline'], () => {})

    const coverage = d.collectKinds()

    expect([...coverage.kinds].sort()).toEqual(['callback', 'inline', 'message'])
    expect(coverage.opaque).toBe(false)
  })

  it('takes the hint from a filter', () => {
    const d = new Dispatcher<Ctx>()
    d.on(
      defineFilter('scoped', () => true, { kinds: ['message'] }),
      () => {},
    )

    expect([...d.collectKinds().kinds]).toEqual(['message'])
    expect(d.collectKinds().opaque).toBe(false)
  })

  it('becomes opaque for a filter with no hint', () => {
    // A subscription narrower than the handler set silently drops updates,
    // so an unconstrained filter must widen it back to everything.
    const d = new Dispatcher<Ctx>()
    d.on('message', () => {})
    d.on(
      defineFilter('anything', () => true),
      () => {},
    )

    expect(d.collectKinds().opaque).toBe(true)
  })

  it('reports nothing for an empty dispatcher', () => {
    const coverage = new Dispatcher<Ctx>().collectKinds()
    expect(coverage.kinds.size).toBe(0)
    expect(coverage.opaque).toBe(false)
  })
})

describe('reentrancy', () => {
  it('does not run a handler registered during the same dispatch', async () => {
    // Registering mid-pass must not change the pass in flight, or a handler
    // that registers another can loop.
    const d = new Dispatcher<Ctx>()
    d.on('message', (c) => {
      c.trail.push('first')
      d.on('message', (inner) => void inner.trail.push('added'))
    })

    const first = ctx('message')
    await d.dispatch(first)
    expect(first.trail).toEqual(['first'])

    const second = ctx('message')
    await d.dispatch(second)
    expect(second.trail).toEqual(['first', 'added'])
  })

  it('propagates a handler error to the caller', async () => {
    const d = new Dispatcher<Ctx>()
    d.on('message', () => {
      throw new Error('handler failed')
    })

    await expect(d.dispatch(ctx('message'))).rejects.toThrow('handler failed')
  })
})
