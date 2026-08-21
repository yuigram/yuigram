/**
 * One deadline for the whole shutdown.
 *
 * The audit finding: `stop({ timeout })` drained tracked work under the
 * timeout, then ran the stop hook — which waited for handlers of its own,
 * without a bound. Two clocks, and the second one had no alarm. A process
 * manager that sends SIGTERM and waits saw a bot that never exited.
 *
 * These pin the contract rather than the sequence: the call returns within its
 * deadline whatever the hook does, says honestly whether everything finished,
 * and leaves the lifecycle usable afterwards.
 */

import { describe, expect, it } from 'vitest'
import { Lifecycle } from '../src/lifecycle/lifecycle.js'

/** A promise that never settles: a hung database call, a lost socket. */
function forever(): Promise<void> {
  return new Promise(() => {})
}

/** A promise that settles after `ms`. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('the deadline binds the whole call', () => {
  it('returns when a stop hook waits forever', async () => {
    const lifecycle = new Lifecycle({ onStop: () => forever() })
    await lifecycle.start()

    const began = Date.now()
    await lifecycle.stop({ timeout: 100 })

    expect(Date.now() - began).toBeLessThan(1_000)
  })

  it('returns when tracked work never settles', async () => {
    const lifecycle = new Lifecycle({})
    lifecycle.track(forever())

    const began = Date.now()
    await lifecycle.stop({ timeout: 100 })

    expect(Date.now() - began).toBeLessThan(1_000)
  })

  it('does not let the drain and the hook each spend the full timeout', async () => {
    // The shape of the original bug: two waits in sequence, each under the
    // timeout, adding up to twice it.
    const lifecycle = new Lifecycle({ onStop: () => forever() })
    lifecycle.track(forever())

    const began = Date.now()
    await lifecycle.stop({ timeout: 150 })
    const elapsed = Date.now() - began

    expect(elapsed).toBeLessThan(400)
  })

  it('hands the hook a signal that fires at the deadline', async () => {
    let aborted = false

    const lifecycle = new Lifecycle({
      onStop: async (context) => {
        context.signal.addEventListener('abort', () => {
          aborted = true
        })
        await new Promise((resolve) => setTimeout(resolve, 300))
      },
    })

    await lifecycle.start()
    await lifecycle.stop({ timeout: 50 })

    expect(aborted).toBe(true)
  })
})

describe('reporting what happened', () => {
  it('reports a clean stop when everything finished', async () => {
    const lifecycle = new Lifecycle({})
    lifecycle.track(after(10))

    await lifecycle.stop({ timeout: 500 })

    expect(lifecycle.stopped).toBe(true)
  })

  it('reports an unclean stop when work was abandoned', async () => {
    // Reporting success here would be reporting something the lifecycle does
    // not know: the work is still running.
    const lifecycle = new Lifecycle({})
    lifecycle.track(forever())

    await lifecycle.stop({ timeout: 50 })

    expect(lifecycle.stopped).toBe(false)
  })

  it('reports a clean stop for work that finishes just inside the deadline', async () => {
    const lifecycle = new Lifecycle({})
    lifecycle.track(after(30))

    await lifecycle.stop({ timeout: 400 })

    expect(lifecycle.stopped).toBe(true)
  })

  it('reports an unclean stop for work that finishes just outside it', async () => {
    const lifecycle = new Lifecycle({})
    lifecycle.track(after(400))

    await lifecycle.stop({ timeout: 40 })

    expect(lifecycle.stopped).toBe(false)
  })

  it('is clean when there was nothing to wait for', async () => {
    const lifecycle = new Lifecycle({})
    await lifecycle.start()
    await lifecycle.stop({ timeout: 500 })

    expect(lifecycle.stopped).toBe(true)
    expect(lifecycle.state).toBe('idle')
  })
})

describe('repeated and concurrent stops', () => {
  it('is safe to call twice', async () => {
    const stops: number[] = []
    const lifecycle = new Lifecycle({
      onStop: () => {
        stops.push(1)
      },
    })

    await lifecycle.start()
    await lifecycle.stop({ timeout: 100 })
    await lifecycle.stop({ timeout: 100 })

    expect(stops).toHaveLength(1)
    expect(lifecycle.state).toBe('idle')
  })

  it('is safe to call concurrently', async () => {
    const stops: number[] = []
    const lifecycle = new Lifecycle({
      onStop: async () => {
        stops.push(1)
        await after(20)
      },
    })

    await lifecycle.start()
    await Promise.all([lifecycle.stop({ timeout: 200 }), lifecycle.stop({ timeout: 200 })])

    // The second call returns rather than running the hook again: two stops
    // must not take a transport down twice.
    expect(stops).toHaveLength(1)
  })

  it('leaves the lifecycle usable after a timed-out stop', async () => {
    const lifecycle = new Lifecycle({})
    lifecycle.track(forever())

    await lifecycle.stop({ timeout: 30 })
    expect(lifecycle.state).toBe('idle')

    // Abandoned work is forgotten rather than counted against the next stop,
    // which would otherwise inherit a drain that can never finish.
    await lifecycle.start()
    await lifecycle.stop({ timeout: 100 })

    expect(lifecycle.stopped).toBe(true)
  })
})

describe('a zero timeout', () => {
  it('closes immediately without waiting', async () => {
    const lifecycle = new Lifecycle({})
    lifecycle.track(forever())

    const began = Date.now()
    await lifecycle.stop({ timeout: 0 })

    expect(Date.now() - began).toBeLessThan(100)
    expect(lifecycle.stopped).toBe(false)
  })
})
