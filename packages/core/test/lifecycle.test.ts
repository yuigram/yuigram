/**
 * Lifecycle and draining.
 *
 * The drain cases encode the shutdown contract: in-flight work is awaited
 * rather than severed, but a stuck handler must not prevent shutdown. Both
 * halves matter — one loses work, the other hangs a deployment.
 */

import { describe, expect, it, vi } from 'vitest'
import { Lifecycle, LifecycleError } from '../src/lifecycle/lifecycle.js'

/** A promise plus the handles to settle it. */
function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('state transitions', () => {
  it('starts idle', () => {
    expect(new Lifecycle().state).toBe('idle')
  })

  it('reaches running after start', async () => {
    const lifecycle = new Lifecycle()
    await lifecycle.start()

    expect(lifecycle.state).toBe('running')
    expect(lifecycle.isRunning).toBe(true)
  })

  it('returns to idle after stop', async () => {
    const lifecycle = new Lifecycle()
    await lifecycle.start()
    await lifecycle.stop()

    expect(lifecycle.state).toBe('idle')
  })

  it('runs the start hook', async () => {
    const onStart = vi.fn()
    await new Lifecycle({ onStart }).start()
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('runs the stop hook after draining', async () => {
    const order: string[] = []
    const work = deferred()

    const lifecycle = new Lifecycle({
      onStop: () => {
        order.push('stop hook')
      },
    })

    await lifecycle.start()
    lifecycle.track(
      work.promise.then(() => {
        order.push('work done')
      }),
    )

    const stopping = lifecycle.stop()
    work.resolve()
    await stopping

    expect(order).toEqual(['work done', 'stop hook'])
  })

  it('moves to failed when the start hook throws', async () => {
    const lifecycle = new Lifecycle({
      onStart: () => {
        throw new Error('cannot connect')
      },
    })

    await expect(lifecycle.start()).rejects.toThrow('cannot connect')
    expect(lifecycle.state).toBe('failed')
  })

  it('can be restarted after a synchronous start failure', async () => {
    // A hook that throws synchronously runs the whole async body before the
    // in-flight promise is stored. Clearing that slot from inside the body
    // would leave the rejected promise cached, and every later start() would
    // replay the original failure forever.
    let attempts = 0
    const lifecycle = new Lifecycle({
      onStart: () => {
        attempts++
        if (attempts === 1) throw new Error('first attempt failed')
      },
    })

    await expect(lifecycle.start()).rejects.toThrow('first attempt failed')
    await lifecycle.start()

    expect(lifecycle.state).toBe('running')
    expect(attempts).toBe(2)
  })

  it('can be restarted after an asynchronous start failure', async () => {
    let attempts = 0
    const lifecycle = new Lifecycle({
      onStart: async () => {
        attempts++
        await new Promise((resolve) => setTimeout(resolve, 1))
        if (attempts === 1) throw new Error('first attempt failed')
      },
    })

    await expect(lifecycle.start()).rejects.toThrow('first attempt failed')
    await lifecycle.start()

    expect(lifecycle.state).toBe('running')
  })

  it('rejects every concurrent caller when the start fails', async () => {
    const lifecycle = new Lifecycle({
      onStart: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        throw new Error('cannot connect')
      },
    })

    const results = await Promise.allSettled([lifecycle.start(), lifecycle.start()])

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(lifecycle.state).toBe('failed')
  })

  it('is idempotent while running', async () => {
    const onStart = vi.fn()
    const lifecycle = new Lifecycle({ onStart })

    await lifecycle.start()
    await lifecycle.start()

    expect(onStart).toHaveBeenCalledOnce()
  })

  it('shares one attempt between concurrent starts', async () => {
    // Starting from two places must not open two connections.
    const onStart = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    const lifecycle = new Lifecycle({ onStart })

    await Promise.all([lifecycle.start(), lifecycle.start(), lifecycle.start()])

    expect(onStart).toHaveBeenCalledOnce()
  })

  it('ignores stop when never started', async () => {
    const onStop = vi.fn()
    await new Lifecycle({ onStop }).stop()
    expect(onStop).not.toHaveBeenCalled()
  })

  it('refuses to start while stopping', async () => {
    const work = deferred()
    const lifecycle = new Lifecycle()

    await lifecycle.start()
    lifecycle.track(work.promise)

    const stopping = lifecycle.stop({ timeout: 50 })
    await expect(lifecycle.start()).rejects.toBeInstanceOf(LifecycleError)

    work.resolve()
    await stopping
  })
})

describe('in-flight tracking', () => {
  it('counts unsettled work', async () => {
    const work = deferred()
    const lifecycle = new Lifecycle()

    lifecycle.track(work.promise)
    expect(lifecycle.inFlight).toBe(1)

    work.resolve()
    await work.promise
    await Promise.resolve()

    expect(lifecycle.inFlight).toBe(0)
  })

  it('returns the original promise unchanged', async () => {
    const lifecycle = new Lifecycle()
    const original = Promise.resolve('value')

    expect(await lifecycle.track(original)).toBe('value')
  })

  it('stops counting work that rejected', async () => {
    const lifecycle = new Lifecycle()
    const failing = Promise.reject(new Error('failed'))

    // The rejection remains the caller's to handle; tracking must not swallow it.
    await expect(lifecycle.track(failing)).rejects.toThrow('failed')
    await Promise.resolve()

    expect(lifecycle.inFlight).toBe(0)
  })

  it('does not let a rejection break draining', async () => {
    const lifecycle = new Lifecycle()
    await lifecycle.start()

    const failing = Promise.reject(new Error('failed'))
    lifecycle.track(failing).catch(() => undefined)

    await expect(lifecycle.stop()).resolves.toBeUndefined()
  })
})

describe('drain', () => {
  it('resolves immediately with nothing in flight', async () => {
    expect(await new Lifecycle().drain()).toBe(true)
  })

  it('waits for in-flight work', async () => {
    const work = deferred()
    const lifecycle = new Lifecycle()
    lifecycle.track(work.promise)

    let drained = false
    const draining = lifecycle.drain(1000).then((result) => {
      drained = result
    })

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(drained).toBe(false)

    work.resolve()
    await draining

    expect(drained).toBe(true)
  })

  it('gives up after the timeout', async () => {
    // A stuck handler must not hang a deployment.
    const stuck = deferred()
    const lifecycle = new Lifecycle()
    lifecycle.track(stuck.promise)

    expect(await lifecycle.drain(10)).toBe(false)

    stuck.resolve()
  })

  it('does not drain when the timeout is zero', async () => {
    const stuck = deferred()
    const lifecycle = new Lifecycle()
    lifecycle.track(stuck.promise)

    expect(await lifecycle.drain(0)).toBe(false)

    stuck.resolve()
  })

  it('stops even when work never settles', async () => {
    const stuck = deferred()
    const lifecycle = new Lifecycle()

    await lifecycle.start()
    lifecycle.track(stuck.promise)

    await expect(lifecycle.stop({ timeout: 10 })).resolves.toBeUndefined()
    expect(lifecycle.state).toBe('idle')

    stuck.resolve()
  })

  it('waits for several operations', async () => {
    const a = deferred()
    const b = deferred()
    const lifecycle = new Lifecycle()

    lifecycle.track(a.promise)
    lifecycle.track(b.promise)
    expect(lifecycle.inFlight).toBe(2)

    const draining = lifecycle.drain(1000)
    a.resolve()
    b.resolve()

    expect(await draining).toBe(true)
  })
})

describe('fail', () => {
  it('forces the failed state', async () => {
    const lifecycle = new Lifecycle()
    await lifecycle.start()

    lifecycle.fail()

    expect(lifecycle.state).toBe('failed')
    expect(lifecycle.isRunning).toBe(false)
  })
})
