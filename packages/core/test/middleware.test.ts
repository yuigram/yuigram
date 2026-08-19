/**
 * Middleware composition behaviour.
 *
 * The ordering assertions encode the onion model, and the `next()` guard case
 * is the one that catches a real bug class: a double call silently re-runs
 * every downstream middleware, duplicating side effects such as a sent reply.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Middleware } from '../src/middleware/compose.js'
import { compose, MiddlewareError, run, when } from '../src/middleware/compose.js'

interface Ctx {
  trail: string[]
  kind?: string
}

function ctx(): Ctx {
  return { trail: [] }
}

/** Middleware that records entry and exit around its continuation. */
function tracer(label: string): Middleware<Ctx> {
  return async (c, next) => {
    c.trail.push(`>${label}`)
    await next()
    c.trail.push(`<${label}`)
  }
}

describe('compose', () => {
  it('runs middleware in onion order', () => {
    const c = ctx()
    return run([tracer('a'), tracer('b'), tracer('c')], c).then(() => {
      expect(c.trail).toEqual(['>a', '>b', '>c', '<c', '<b', '<a'])
    })
  })

  it('short-circuits when middleware does not call next', async () => {
    const c = ctx()
    const stop: Middleware<Ctx> = (inner) => {
      inner.trail.push('stop')
    }

    await run([tracer('a'), stop, tracer('never')], c)

    expect(c.trail).toEqual(['>a', 'stop', '<a'])
  })

  it('awaits asynchronous middleware before continuing', async () => {
    const c = ctx()
    const slow: Middleware<Ctx> = async (inner, next) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      inner.trail.push('slow')
      await next()
    }

    await run([slow, tracer('after')], c)

    expect(c.trail).toEqual(['slow', '>after', '<after'])
  })

  it('does nothing for an empty chain', async () => {
    const c = ctx()
    await run([], c)
    expect(c.trail).toEqual([])
  })

  it('passes the same context to every middleware', async () => {
    const seen: Ctx[] = []
    const capture: Middleware<Ctx> = async (inner, next) => {
      seen.push(inner)
      await next()
    }

    const c = ctx()
    await run([capture, capture], c)

    expect(seen).toEqual([c, c])
  })

  describe('error propagation', () => {
    it('propagates an error outward', async () => {
      const boom: Middleware<Ctx> = () => {
        throw new Error('boom')
      }
      await expect(run([tracer('a'), boom], ctx())).rejects.toThrow('boom')
    })

    it('lets an outer middleware catch what an inner one threw', async () => {
      const c = ctx()
      const guard: Middleware<Ctx> = async (inner, next) => {
        try {
          await next()
        } catch {
          inner.trail.push('caught')
        }
      }
      const boom: Middleware<Ctx> = () => {
        throw new Error('boom')
      }

      await run([guard, boom], c)

      expect(c.trail).toEqual(['caught'])
    })

    it('skips the unwinding half of middleware below the throw', async () => {
      const c = ctx()
      const boom: Middleware<Ctx> = () => {
        throw new Error('boom')
      }

      await expect(run([tracer('a'), boom], c)).rejects.toThrow()

      // '<a' never runs: the throw unwinds past it.
      expect(c.trail).toEqual(['>a'])
    })
  })

  describe('next() guard', () => {
    it('rejects a second next() call', async () => {
      const twice: Middleware<Ctx> = async (_c, next) => {
        await next()
        await next()
      }

      await expect(run([twice], ctx())).rejects.toBeInstanceOf(MiddlewareError)
    })

    it('names the offending position', async () => {
      const twice: Middleware<Ctx> = async (_c, next) => {
        await next()
        await next()
      }

      await expect(run([tracer('a'), twice], ctx())).rejects.toThrow(/index 1/)
    })

    it('allows next() once per middleware across a long chain', async () => {
      const chain = Array.from({ length: 20 }, (_, i) => tracer(String(i)))
      await expect(run(chain, ctx())).resolves.toBeUndefined()
    })
  })

  describe('nesting', () => {
    it('runs a composed chain as one link of another', async () => {
      const c = ctx()
      const inner = compose<Ctx>([tracer('i1'), tracer('i2')])

      await run([tracer('outer'), inner, tracer('tail')], c)

      expect(c.trail).toEqual(['>outer', '>i1', '>i2', '>tail', '<tail', '<i2', '<i1', '<outer'])
    })

    it('reaches the downstream continuation when the inner chain is empty', async () => {
      const c = ctx()
      await run([compose<Ctx>([]), tracer('tail')], c)
      expect(c.trail).toEqual(['>tail', '<tail'])
    })
  })

  it('is unaffected by later mutation of the source array', async () => {
    // The chain is captured at composition time; a caller appending afterwards
    // must not retroactively change a chain already handed out.
    const source: Array<Middleware<Ctx>> = [tracer('a')]
    const composed = compose(source)
    source.push(tracer('b'))

    const c = ctx()
    await composed(c, async () => {})

    expect(c.trail).toEqual(['>a', '<a'])
  })
})

describe('when', () => {
  it('runs the middleware on a match', async () => {
    const c = ctx()
    c.kind = 'message'

    await run([when<Ctx>((inner) => inner.kind === 'message', tracer('gated'))], c)

    expect(c.trail).toEqual(['>gated', '<gated'])
  })

  it('skips to next on a non-match without stopping the chain', async () => {
    // A gated middleware that blocked on a non-match would be unsafe to place
    // anywhere but last.
    const c = ctx()
    c.kind = 'callback'

    await run([when<Ctx>((inner) => inner.kind === 'message', tracer('gated')), tracer('after')], c)

    expect(c.trail).toEqual(['>after', '<after'])
  })

  it('accepts an async predicate', async () => {
    const c = ctx()
    c.kind = 'message'

    await run([when<Ctx>(async (inner) => inner.kind === 'message', tracer('gated'))], c)

    expect(c.trail).toEqual(['>gated', '<gated'])
  })

  it('evaluates the predicate once per pass', async () => {
    const predicate = vi.fn(() => true)
    await run([when<Ctx>(predicate, tracer('gated'))], ctx())
    expect(predicate).toHaveBeenCalledTimes(1)
  })
})
