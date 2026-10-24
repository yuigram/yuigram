// SPDX-License-Identifier: MIT

/**
 * Dispatcher behaviour.
 *
 * The band-ordering and reserved-slot cases encode the guarantee plugins rely
 * on: a session plugin registering `high` runs before application handlers
 * regardless of when the user installed it. The `collectKinds` cases guard a
 * subscription decision where being too narrow silently drops updates.
 */

import { describe, expect, it, vi } from 'vitest'
import { Dispatcher, Propagation } from '../src/dispatch/dispatcher.js'
import { ConfigError } from '../src/errors/errors.js'
import { defineAsyncFilter, defineFilter } from '../src/filter/define.js'
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

describe('error responsibility', () => {
  it('propagates when nothing has claimed responsibility', () => {
    // A bare dispatcher with no catcher and no reporter must not swallow the
    // failure. Silence is the one outcome worse than either alternative.
    const d = new Dispatcher<Ctx>()
    d.on('message', () => {
      throw new Error('boom')
    })

    return expect(d.dispatch(ctx('message'))).rejects.toThrow('boom')
  })

  it('reports instead of propagating when a reporter is configured', async () => {
    const seen: unknown[] = []
    const d = new Dispatcher<Ctx>({ onUnhandled: (error) => seen.push(error) })
    d.on('message', () => {
      throw new Error('boom')
    })

    await d.dispatch(ctx('message'))

    expect(seen).toHaveLength(1)
  })

  it('prefers a catcher over the reporter', async () => {
    const reported: unknown[] = []
    const caught: unknown[] = []
    const d = new Dispatcher<Ctx>({ onUnhandled: (error) => reported.push(error) })
    d.catch((error) => caught.push(error))
    d.on('message', () => {
      throw new Error('boom')
    })

    await d.dispatch(ctx('message'))

    expect(caught).toHaveLength(1)
    expect(reported).toEqual([])
  })
})

/** A promise and the function that settles it. */
function gate(): { readonly promise: Promise<void>; readonly open: () => void } {
  let open: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })

  return { promise, open }
}

describe('once, with dispatches running alongside each other', () => {
  it('runs a once-handler a single time when two matching updates evaluate its filter together', async () => {
    const d = new Dispatcher<Ctx>()
    const held = gate()
    const slow = defineAsyncFilter('slow', async () => {
      await held.promise
      return true
    })
    let runs = 0
    d.once(slow, () => {
      runs += 1
    })

    const first = d.dispatch(ctx('message'))
    const second = d.dispatch(ctx('message'))
    held.open()
    await Promise.all([first, second])

    expect(runs).toBe(1)
    expect(d.size).toBe(0)
  })
})

describe('off, during a dispatch', () => {
  it('stops a handler that has not had its turn yet, and lets a running one finish', async () => {
    const d = new Dispatcher<Ctx>()
    const trail: string[] = []
    const later = (): void => {
      trail.push('later')
    }
    d.on('message', async () => {
      trail.push('first starts')
      d.off(later)
      d.off(first)
      trail.push('first finishes')
    })
    const first = (): void => {
      trail.push('removed while running')
    }
    d.on('message', first)
    d.on('message', later)

    await d.dispatch(ctx('message'))

    expect(trail).toEqual(['first starts', 'first finishes'])
  })
})

describe('groups', () => {
  it('runs groups in ascending order, and only the first match in each', async () => {
    const d = new Dispatcher<Ctx>()
    d.on('message', (c) => void c.trail.push('g1 a'), { group: 1 })
    d.on('message', (c) => void c.trail.push('g1 b'), { group: 1 })
    d.on('message', (c) => void c.trail.push('g-1'), { group: -1 })
    d.on('message', (c) => void c.trail.push('ungrouped'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['g-1', 'ungrouped', 'g1 a'])
  })

  it('lets the next handler of a group run when one returns Continue', async () => {
    const d = new Dispatcher<Ctx>()
    d.on(
      'message',
      (c) => {
        c.trail.push('a')
        return Propagation.Continue
      },
      { group: 0 },
    )
    d.on('message', (c) => void c.trail.push('b'), { group: 0 })
    d.on('message', (c) => void c.trail.push('c'), { group: 0 })

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['a', 'b'])
  })

  it('passes over a group member whose filter declines, to the next that matches', async () => {
    const d = new Dispatcher<Ctx>()
    d.on(
      defineFilter('never', () => false),
      (c) => void c.trail.push('never'),
      { group: 2 },
    )
    d.on('message', (c) => void c.trail.push('second'), { group: 2 })

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['second'])
  })
})

describe('propagation', () => {
  it('stops this dispatcher’s handlers on Stop, and still runs its children', async () => {
    const d = new Dispatcher<Ctx>()
    const child = new Dispatcher<Ctx>()
    child.on('message', (c) => void c.trail.push('child'))
    d.addChild(child)
    d.on('message', (c) => {
      c.trail.push('stopper')
      return Propagation.Stop
    })
    d.on('message', (c) => void c.trail.push('after stop'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['stopper', 'child'])
  })

  it('skips the children too on StopChildren', async () => {
    const d = new Dispatcher<Ctx>()
    const child = new Dispatcher<Ctx>()
    child.on('message', (c) => void c.trail.push('child'))
    d.addChild(child)
    d.on('message', () => Propagation.StopChildren)

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual([])
  })

  it('does not read a returned string as an instruction', async () => {
    const d = new Dispatcher<Ctx>()
    d.on('message', () => 'stop', { group: 0 })
    d.on('message', (c) => void c.trail.push('next group'), { group: 1 })

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['next group'])
  })

  it('obeys a before hook that stops, and tells after hooks whether anything ran', async () => {
    const d = new Dispatcher<Ctx>()
    const told: boolean[] = []
    d.before((c) => (c.text === 'skip' ? Propagation.Stop : undefined))
    d.after((handled) => {
      told.push(handled)
    })
    d.on('message', (c) => void c.trail.push('handled'))

    expect(await d.dispatch(ctx('message', 'skip'))).toBe(false)
    expect(await d.dispatch(ctx('message', 'go'))).toBe(true)
    expect(told).toEqual([false, true])
  })
})

describe('children', () => {
  it('runs children after the parent, in the order they were added, each with its own middleware', async () => {
    const d = new Dispatcher<Ctx>()
    const one = new Dispatcher<Ctx>().use(tracer('one'))
    const two = new Dispatcher<Ctx>()
    one.on('message', (c) => void c.trail.push('one'))
    two.on('message', (c) => void c.trail.push('two'))
    d.addChild(one).addChild(two)
    d.on('message', (c) => void c.trail.push('parent'))

    const c = ctx('message')
    const handled = await d.dispatch(c)

    expect(handled).toBe(true)
    expect(c.trail).toEqual(['parent', '>one', 'one', '<one', 'two'])
  })

  it('refuses a second parent and a cycle', () => {
    const a = new Dispatcher<Ctx>()
    const b = new Dispatcher<Ctx>()
    const c = new Dispatcher<Ctx>()
    a.addChild(b)
    b.addChild(c)

    expect(() => c.addChild(a)).toThrow(/cycle/)
    expect(() => new Dispatcher<Ctx>().addChild(b)).toThrow(/already the child/)
    expect(b.removeChild(c)).toBe(true)
    expect(c.parent).toBeUndefined()
  })

  it('reports the kinds its children handle', () => {
    const d = new Dispatcher<Ctx>()
    const child = new Dispatcher<Ctx>()
    child.on('callback_query', () => {})
    d.addChild(child)

    expect([...d.collectKinds().kinds]).toEqual(['callback_query'])
  })
})

describe('where an error goes', () => {
  it('goes from a child that has no catcher to the parent’s, and dispatch goes on', async () => {
    const reported: unknown[] = []
    const d = new Dispatcher<Ctx>()
    const child = new Dispatcher<Ctx>()
    const failure = new Error('child broke')
    child.on('message', () => {
      throw failure
    })
    child.on('message', (c) => void c.trail.push('sibling handler'))
    d.addChild(child)
    d.catch((error) => {
      reported.push(error)
    })

    const c = ctx('message')
    await d.dispatch(c)

    expect(reported).toEqual([failure])
    expect(c.trail).toEqual(['sibling handler'])
  })

  it('goes on upwards when a catcher declines it by returning false', async () => {
    const seen: string[] = []
    const d = new Dispatcher<Ctx>({ onUnhandled: () => void seen.push('owner') })
    const child = new Dispatcher<Ctx>()
    child.catch(() => {
      seen.push('child declined')
      return false
    })
    child.on('message', () => {
      throw new Error('x')
    })
    d.addChild(child)

    await d.dispatch(ctx('message'))

    expect(seen).toEqual(['child declined', 'owner'])
  })

  it('treats what a failing catcher threw as unhandled, keeping the original handled', async () => {
    const owner: unknown[] = []
    const d = new Dispatcher<Ctx>({ onUnhandled: (error) => void owner.push(error) })
    const broken = new Error('the catcher broke')
    d.catch(() => {
      throw broken
    })
    d.on('message', () => {
      throw new Error('the handler broke')
    })

    await d.dispatch(ctx('message'))

    expect(owner).toEqual([broken])
  })

  it('propagates to the caller when nothing anywhere takes it', async () => {
    const d = new Dispatcher<Ctx>()
    const child = new Dispatcher<Ctx>()
    child.on('message', () => {
      throw new Error('nobody takes this')
    })
    d.addChild(child)

    await expect(d.dispatch(ctx('message'))).rejects.toThrow('nobody takes this')
  })
})

describe('dependencies', () => {
  it('reaches a value injected here or above, and names one that was not', () => {
    const root = new Dispatcher<Ctx>()
    const child = new Dispatcher<Ctx>()
    root.addChild(child)
    root.inject({ db: 'the database' } as never)
    child.inject('cache' as never, 'the cache' as never)

    const deps = child.deps as unknown as Record<string, unknown>
    expect(deps['db']).toBe('the database')
    expect(deps['cache']).toBe('the cache')
    expect('db' in deps).toBe(true)
    expect(() => deps['missing']).toThrow(/no dependency named 'missing'/)
    expect(() => (root.deps as unknown as Record<string, unknown>)['cache']).toThrow(ConfigError)
  })

  it('keeps each dispatcher tree’s own, with nothing shared through a global', () => {
    const a = new Dispatcher<Ctx>().inject('db' as never, 'a' as never)
    const b = new Dispatcher<Ctx>().inject('db' as never, 'b' as never)

    expect((a.deps as unknown as Record<string, unknown>)['db']).toBe('a')
    expect((b.deps as unknown as Record<string, unknown>)['db']).toBe('b')
  })
})

describe('extend and clone', () => {
  it('takes in another dispatcher’s handlers and middleware as a snapshot', async () => {
    const d = new Dispatcher<Ctx>()
    const other = new Dispatcher<Ctx>().use(tracer('other'))
    other.on('message', (c) => void c.trail.push('from other'))
    d.extend(other)
    other.on('message', (c) => void c.trail.push('added later'))

    const c = ctx('message')
    await d.dispatch(c)

    expect(c.trail).toEqual(['>other', 'from other', '<other'])
  })

  it('clones handlers, and children only when asked', async () => {
    const d = new Dispatcher<Ctx>()
    const child = new Dispatcher<Ctx>()
    child.on('message', (c) => void c.trail.push('child'))
    d.addChild(child)
    d.on('message', (c) => void c.trail.push('own'))

    const shallow = ctx('message')
    await d.clone().dispatch(shallow)
    const deep = ctx('message')
    await d.clone(true).dispatch(deep)

    expect(shallow.trail).toEqual(['own'])
    expect(deep.trail).toEqual(['own', 'child'])
    expect(child.parent).toBe(d)
  })
})
