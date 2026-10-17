// SPDX-License-Identifier: MIT

/**
 * Holding a name, and what happens when it is taken from you.
 *
 * The guards are the one place this framework claims mutual exclusion, so what
 * they claim has to be exact. Two properties are checked here and nothing
 * softer: a name is held by one holder at a time within the guard's reach, and
 * **a holder that loses the name has finished what it started before the next
 * one begins**. The second is the one that is easy to get wrong, because
 * marking a hold lost is instant and the work it admitted is not.
 *
 * The Web Locks half runs against a stand-in rather than a browser, and the
 * stand-in is written to the API's own rules — `ifAvailable` answers `null`
 * rather than waiting, a steal rejects the request that held the lock — so that
 * a pass here means the same thing a pass in `tools/browser` does. The browser
 * harness is what shows the real API behaves this way; this is what shows the
 * guard reacts correctly when it does.
 */

import { describe, expect, it } from 'vitest'
import {
  type AcquireOptions,
  type Guard,
  type GuardHold,
  processGuard,
  webLocksGuard,
} from '../src/index.js'

/** What the stand-in keeps for one lock. */
interface Granted {
  /** Rejects the request that holds the lock, which is what a steal does. */
  readonly lose: (reason: Error) => void
}

/**
 * The Web Locks API, as much of it as a guard uses, to its own rules.
 *
 * Faithful in the three ways that matter here. A name is held by one request at
 * a time. `ifAvailable` on a held name calls back with `null` immediately
 * instead of queueing. And `steal` takes the lock from whoever has it and
 * *rejects* that holder's request promise — abruptly, with nothing asked of it
 * and no chance for it to finish.
 */
function lockManagerStandIn() {
  const held = new Map<string, Granted>()

  return {
    /** Whether a name is held, for a case to assert against. */
    isHeld: (name: string): boolean => held.has(name),

    manager: {
      request(
        name: string,
        options: {
          readonly mode?: 'exclusive'
          readonly ifAvailable?: boolean
          readonly steal?: boolean
        },
        callback: (lock: unknown) => Promise<void>,
      ): Promise<void> {
        const incumbent = held.get(name)

        if (incumbent !== undefined) {
          if (options.steal === true) {
            held.delete(name)
            incumbent.lose(new Error('AbortError: the lock was stolen'))
          } else if (options.ifAvailable === true) {
            return callback(null)
          } else {
            return Promise.reject(new Error('this stand-in does not queue'))
          }
        }

        return new Promise<void>((resolve, reject) => {
          const own: Granted = {
            lose: (reason) => {
              reject(reason)
            },
          }
          held.set(name, own)

          // Only this request's own grant is cleared when it finishes. One that
          // was stolen from finishes afterwards too, and must not release the
          // lock the thief now holds.
          const letGo = (): void => {
            if (held.get(name) === own) held.delete(name)
          }

          void callback({ name }).then(
            () => {
              letGo()
              resolve()
            },
            (error: unknown) => {
              letGo()
              reject(error as Error)
            },
          )
        })
      },
    },
  }
}

/** A hold, plus a switch that decides when what it admitted finishes. */
function holdWithWork(hold: GuardHold) {
  let outstanding = 0
  let wake: Array<() => void> = []
  let finish = (): void => {}
  const allowed = new Promise<void>((resolve) => {
    finish = resolve
  })

  hold.drains(async () => {
    while (outstanding > 0) {
      await new Promise<void>((resolve) => {
        wake = [...wake, resolve]
      })
    }
  })

  return {
    /** Begin something under this hold that will not finish until told. */
    begin(): Promise<void> {
      outstanding += 1

      return allowed.then(() => {
        outstanding -= 1
        if (outstanding === 0) for (const one of wake.splice(0)) one()
      })
    },
    /** Let it finish. */
    finish,
  }
}

/** Let everything that can run without waiting on anything, run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** The two guards answer the same questions, so they are asked together. */
const guards: Array<[string, () => Guard]> = [
  ['a process registry', () => processGuard()],
  ['the Web Locks API', () => webLocksGuard(lockManagerStandIn().manager)],
]

describe.each(guards)('%s', (_label, build) => {
  it('gives a free name to whoever asks', async () => {
    const guard = build()
    const hold = await guard.acquire('a')

    expect(hold?.held).toBe(true)
    await hold?.release()
  })

  it('refuses a name something else holds', async () => {
    const guard = build()
    const first = await guard.acquire('a')

    expect(await guard.acquire('a')).toBeUndefined()
    await first?.release()
  })

  it('gives the name up when the holder releases it', async () => {
    const guard = build()
    const first = await guard.acquire('a')
    await first?.release()

    const second = await guard.acquire('a')
    expect(second?.held).toBe(true)
    await second?.release()
  })

  it('keeps different names apart', async () => {
    const guard = build()
    const a = await guard.acquire('a')
    const b = await guard.acquire('b')

    expect(a?.held).toBe(true)
    expect(b?.held).toBe(true)
    await a?.release()
    await b?.release()
  })

  it('tells a superseded holder it no longer holds the name', async () => {
    const guard = build()
    const first = await guard.acquire('a')
    const second = await guard.acquire('a', { steal: true })

    expect(first?.held).toBe(false)
    expect(second?.held).toBe(true)
    await second?.release()
  })

  it('does not let a superseded holder free its successor’s name', async () => {
    // A hold that was taken over releasing later must not delete the entry the
    // new holder owns, or a third contender would find the name free while the
    // second is still using it.
    const guard = build()
    const first = await guard.acquire('a')
    const second = await guard.acquire('a', { steal: true })

    await first?.release()

    expect(second?.held).toBe(true)
    expect(await guard.acquire('a')).toBeUndefined()
    await second?.release()
  })

  it('declares whether a steal it grants has drained the holder', () => {
    // The property the storage areas refuse a takeover without. Both guards
    // uphold it; a guard that cannot must say so rather than be assumed.
    expect(build().drainsOnSteal).toBe(true)
  })

  it('waits for what the superseded holder admitted before granting the steal', async () => {
    // The invariant. Marking a hold lost stops it admitting anything new and
    // does nothing about what it admitted a moment ago — so the successor is
    // not given the name until the old holder says it has nothing left.
    const guard = build()
    const first = await guard.acquire('a')
    const work = holdWithWork(first as GuardHold)
    const running = work.begin()

    let taken: GuardHold | undefined
    let arrived = false
    const taking = guard.acquire('a', { steal: true }).then((hold) => {
      taken = hold
      arrived = true
    })

    await settle()
    expect(arrived, 'the successor was given the name while a write was in flight').toBe(false)

    work.finish()
    await running
    await taking

    expect(arrived).toBe(true)
    expect(taken?.held).toBe(true)
    await taken?.release()
  })

  it('waits for what the holder admitted before an orderly release lets go', async () => {
    const guard = build()
    const first = await guard.acquire('a')
    const work = holdWithWork(first as GuardHold)
    const running = work.begin()

    let released = false
    const releasing = first?.release().then(() => {
      released = true
    })

    await settle()
    expect(released, 'the name was let go while a write was in flight').toBe(false)

    work.finish()
    await running
    await releasing

    expect(released).toBe(true)
  })
})

describe('a process registry', () => {
  it('reaches this process and says so', () => {
    expect(processGuard().scope).toBe('process')
  })

  it('is a different registry each time one is built', async () => {
    // Which is why the package shares one rather than building them. Two
    // registries exclude nobody from anything, and this is the property that
    // makes that true — asserted so that sharing stays deliberate.
    const first = await processGuard().acquire('a')
    const second = await processGuard().acquire('a')

    expect(first?.held).toBe(true)
    expect(second?.held).toBe(true)
  })
})

describe('the Web Locks API', () => {
  it('reaches the whole origin and says so', () => {
    expect(webLocksGuard(lockManagerStandIn().manager).scope).toBe('origin')
  })

  it('holds the platform lock for as long as the hold lasts', async () => {
    const locks = lockManagerStandIn()
    const guard = webLocksGuard(locks.manager)
    const hold = await guard.acquire('a')

    expect(locks.isHeld('a')).toBe(true)
    await hold?.release()
    await settle()
    expect(locks.isHeld('a')).toBe(false)
  })

  it('refuses to take a name another page holds, however the caller asks', async () => {
    // The case the guard cannot make safe and therefore does not attempt. A
    // lock held by another page belongs to a realm this one cannot reach: its
    // hold is not in this registry, so there is nothing here to drain, and the
    // API's own `steal` takes the lock abruptly and tells that page afterwards.
    // Asking is answered with nothing rather than with an undrained steal.
    const locks = lockManagerStandIn()
    const otherPage = webLocksGuard(locks.manager)
    const thisPage = webLocksGuard(locks.manager)

    const theirs = await otherPage.acquire('a')
    expect(theirs?.held).toBe(true)

    expect(await thisPage.acquire('a', { steal: true })).toBeUndefined()
    expect(theirs?.held, 'the other page lost the name it still holds').toBe(true)

    await theirs?.release()
  })

  it('takes a name another page has let go of', async () => {
    // The other half, and the reason the case above is a refusal rather than a
    // failure. A page that closed took its lock with it, so ordinary recovery
    // is an ordinary acquire and nobody has to confirm anything.
    const locks = lockManagerStandIn()
    const otherPage = webLocksGuard(locks.manager)
    const thisPage = webLocksGuard(locks.manager)

    const theirs = await otherPage.acquire('a')
    await theirs?.release()
    await settle()

    const mine = await thisPage.acquire('a', { steal: true })
    expect(mine?.held).toBe(true)
    await mine?.release()
  })

  it('answers nothing when the lock manager refuses, rather than waiting', async () => {
    const guard = webLocksGuard({
      request: (_name, options, callback) =>
        options.ifAvailable === true ? callback(null) : Promise.resolve(),
    })

    expect(await guard.acquire('a')).toBeUndefined()
  })

  it('reports a hold lost when the platform takes the lock away', async () => {
    // A steal from another page rejects this page's request. Nothing here is
    // asked first — which is exactly why a steal is not how this guard hands a
    // name on, and why a hold reads `held` rather than assuming.
    const locks = lockManagerStandIn()
    const hold = await webLocksGuard(locks.manager).acquire('a')

    expect(hold?.held).toBe(true)
    await locks.manager.request('a', { mode: 'exclusive', steal: true }, async () => {
      await Promise.resolve()
    })
    await settle()

    expect(hold?.held).toBe(false)
  })
})

describe('a guard that cannot drain what it supersedes', () => {
  it('is describable, so a consumer can refuse it', async () => {
    // Nothing in this package builds one. The contract exists so that a guard
    // supplied from outside has to say which kind it is, and so that a consumer
    // holding something that must not be written twice can refuse the ones that
    // cannot answer for the holder they replace.
    const abrupt: Guard = {
      scope: 'process',
      drainsOnSteal: false,
      acquire: (_name: string, _options?: AcquireOptions) =>
        Promise.resolve<GuardHold>({
          held: true,
          release: () => Promise.resolve(),
          drains: () => {},
        }),
    }

    expect(abrupt.drainsOnSteal).toBe(false)
    expect((await abrupt.acquire('a'))?.held).toBe(true)
  })
})
