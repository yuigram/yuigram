// SPDX-License-Identifier: MPL-2.0

/**
 * Holding a name exclusively, and saying how far that exclusion reaches.
 *
 * A record written into a store is not a lock. Reading it, deciding it is free
 * and writing your own is three steps, and two runs doing that together both
 * read "free" before either writes — so both start, both believe they own the
 * thing, and the store ends up with whichever wrote last while *both* keep
 * writing. No amount of care inside those three steps closes the window,
 * because the window is between them.
 *
 * What closes it is a primitive the environment provides, which is what this
 * is. There is no single one that works everywhere, so this names the contract
 * and each environment supplies what it has.
 *
 * ```
 *   a browser page   ──> navigator.locks   every page of the origin
 *   anywhere else    ──> a registry        this process, and no further
 * ```
 *
 * **The reach is reported rather than assumed.** That is the whole point of
 * {@link Guard.scope}. A registry inside one process excludes two `Account`s in
 * that process and knows nothing about a second process opened over the same
 * directory; saying otherwise would be worse than not excluding at all, because
 * a caller would stop being careful. Whatever consumes a guard decides what its
 * scope is good enough for — `@yuigram/mtproto`'s storage areas do exactly that
 * — and nothing here promises more than it holds.
 */

/**
 * How far a guard's exclusion reaches.
 *
 * - `process` — this process. Two things in it cannot both hold a name;
 *   anything outside it is unaffected.
 * - `origin` — every page, worker and tab of one web origin, which is also
 *   exactly who can reach that origin's storage.
 */
export type GuardScope = 'process' | 'origin'

/** A name held. Holding it is what the holder has; losing it is observable. */
export interface GuardHold {
  /**
   * Whether this hold is still the one that owns the name.
   *
   * False once released, and false once something else took the name from it.
   * Anything protected by a hold has to read this rather than assume it, which
   * is what stops a write begun before a takeover from landing after one.
   */
  readonly held: boolean
  /** Give the name up. Releasing twice is not an error. */
  release(): Promise<void>
  /**
   * Say how to wait for whatever this hold protects to go quiet.
   *
   * Registered by the consumer, because only it knows what "in flight" means.
   * A guard that can see the hold it is superseding waits for this before
   * handing the name on — which is what stops work admitted under the old
   * holder from completing after the new one has started.
   *
   * Optional, and honestly so: a guard whose reach does not include the other
   * holder — another process, another machine — cannot wait for something it
   * cannot see, and says as much rather than pretending.
   */
  drains(quiet: () => Promise<void>): void
}

/** How a name is taken. */
export interface AcquireOptions {
  /**
   * Take the name from whatever holds it.
   *
   * For a holder that is gone and cannot say so. The superseded hold reports
   * `held: false` from then on where the environment can tell it — which a
   * registry and the Web Locks API both can, within their own scope.
   */
  readonly steal?: boolean
}

/** Something that can hold a name exclusively within some reach. */
export interface Guard {
  /** How far this guard's exclusion reaches. Never widen this. */
  readonly scope: GuardScope
  /**
   * Whether a granted steal means the superseded holder has finished.
   *
   * The property that makes {@link AcquireOptions.steal} safe to use for
   * anything that must not be written by two holders at once. `true` says this
   * guard will not hand a stolen name on until the holder it supersedes has
   * drained — so a successor that is given the name knows the work admitted
   * before it cannot still land. `false` says a steal is abrupt: the old holder
   * is told it lost the name and may still be inside an operation it began.
   *
   * Declared rather than inferred, because a consumer cannot tell by looking. A
   * guard that answers `false` is not broken — an abrupt steal is the right
   * answer for plenty of things — but a consumer guarding state that two
   * writers would corrupt should refuse one rather than hope.
   */
  readonly drainsOnSteal: boolean
  /** Take a name, or answer nothing when something else holds it. */
  acquire(name: string, options?: AcquireOptions): Promise<GuardHold | undefined>
}

/** What a registry keeps for one held name. */
interface Entry {
  held: boolean
  /** How to wait for what this hold protects, once the consumer has said. */
  quiet?: () => Promise<void>
}

/**
 * A guard over one process.
 *
 * Exact within that process and blind outside it. Enough on its own for a store
 * that cannot be reached from outside the process either — an in-memory one —
 * and not enough for a directory or a database, where it tells a caller that
 * nothing *here* holds the name and nothing more.
 */
export function processGuard(): Guard {
  const held = new Map<string, Entry>()

  return {
    scope: 'process',
    // `take` waits for the superseded hold to go quiet before handing the name
    // on, and both holders are in this process, so there is always something
    // there to wait for.
    drainsOnSteal: true,

    acquire(name: string, options: AcquireOptions = {}): Promise<GuardHold | undefined> {
      return take(held, name, options)
    },
  }
}

/**
 * Take a name from a registry, waiting for whatever it supersedes to go quiet.
 *
 * The wait is the part that makes a steal safe. Marking the old hold lost stops
 * it admitting anything new; it does nothing about what it admitted a moment
 * ago and is still finishing. So the successor is handed the name only once the
 * old holder says it has nothing in flight.
 */
async function take(
  held: Map<string, Entry>,
  name: string,
  options: AcquireOptions,
): Promise<GuardHold | undefined> {
  const existing = held.get(name)

  if (existing?.held === true) {
    if (options.steal !== true) return undefined

    // Refuse anything further from the old holder first, so what is waited for
    // below is a set that cannot grow.
    existing.held = false
    await existing.quiet?.()
  }

  const entry: Entry = { held: true }
  held.set(name, entry)

  return {
    get held() {
      return entry.held
    },
    drains(quiet: () => Promise<void>) {
      entry.quiet = quiet
    },
    async release() {
      // What this holder admitted finishes before the name is free, for the
      // same reason a steal waits: the next holder must not begin while this
      // one still has something inside whatever it protects.
      entry.held = false
      await entry.quiet?.()

      // Only the current holder clears the registry. A hold that was taken over
      // releasing later must not free the name its successor holds.
      if (held.get(name) === entry) held.delete(name)
    },
  }
}

/** As much of the Web Locks API as this uses, named rather than pulled in. */
interface LockManagerLike {
  request(
    name: string,
    options: {
      readonly mode?: 'exclusive'
      readonly ifAvailable?: boolean
      readonly steal?: boolean
    },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<void>
}

/** The page's lock manager, where the runtime is one that has it. */
function lockManager(): LockManagerLike | undefined {
  const navigator = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator

  return navigator?.locks
}

/**
 * A guard over every page of one web origin.
 *
 * The Web Locks API is the browser's own mutual exclusion, and its reach is the
 * origin — which is also the reach of the storage a page has. So a lock granted
 * here is evidence that no other page holds the name, and that is the one place
 * this contract can say so.
 *
 * A lock is held for as long as the callback's promise is unsettled, so the
 * callback is given a promise that settles when the hold is released. A page
 * that closes takes its locks with it, which is what makes a crashed tab
 * recoverable without anybody being asked to confirm anything.
 *
 * **A steal is not how this guard hands a name on.** The API has one, and what
 * it does is take the lock and *then* reject the request that held it — the old
 * page learns it lost the lock after the fact, from a realm this one cannot
 * reach into, with whatever it had begun still running. That is precisely the
 * thing {@link Guard.drainsOnSteal} promises not to do, so a caller asking for
 * a steal is answered by the two cases that can be told apart honestly:
 *
 * ```
 *   the holder is this realm  ──> drain it here, then take the lock
 *   the holder is another one ──> the lock is either free, or refused
 * ```
 *
 * The second is not a limitation worked around, it is the right answer. A page
 * that closed or crashed has already released its lock — the browser does that
 * — so ordinary recovery is an ordinary acquire and needs no flag. A lock still
 * held is held by a page that is *running*, and no amount of forcing makes it
 * safe to write that page's storage underneath it.
 */
export function webLocksGuard(manager: LockManagerLike): Guard {
  /**
   * The holds handed out by this guard, in this realm, by name.
   *
   * What makes an in-realm steal separable from a cross-page one. A lock is
   * exclusive across the origin, so a live entry here is proof that no other
   * page holds the name — and being in this realm, it is something that can be
   * drained before the name moves on.
   */
  const mine = new Map<string, Entry>()

  const grant = async (
    name: string,
    request: {
      readonly mode: 'exclusive'
      readonly ifAvailable?: boolean
      readonly steal?: boolean
    },
  ): Promise<GuardHold | undefined> => {
    let release = (): void => {}
    const over = new Promise<void>((resolve) => {
      release = resolve
    })

    const entry: Entry = { held: false }
    let granted = (_: boolean): void => {}
    const decided = new Promise<boolean>((resolve) => {
      granted = resolve
    })

    const requested = manager.request(name, request, async (lock) => {
      // Null means the lock was not available, which `ifAvailable` reports
      // rather than waiting for. Waiting is the wrong answer here: an account
      // whose store is busy should say so, not hang.
      if (lock === null) {
        granted(false)

        return
      }

      entry.held = true
      granted(true)
      await over
    })

    // A lock stolen from underneath rejects the request that held it. Caught so
    // that a superseded hold reports `held: false` rather than producing an
    // unhandled rejection in a page that did nothing wrong.
    requested.catch(() => {
      entry.held = false
      release()
    })

    if (!(await decided)) return undefined

    mine.set(name, entry)

    return {
      get held() {
        return entry.held
      },
      drains(wait: () => Promise<void>) {
        entry.quiet = wait
      },
      async release() {
        entry.held = false
        // What this page admitted finishes before the lock goes, so another
        // page cannot begin while it is still writing.
        await entry.quiet?.()
        if (mine.get(name) === entry) mine.delete(name)
        release()
        await requested.catch(() => undefined)
      },
    }
  }

  return {
    scope: 'origin',
    // Never granted without the superseded holder having drained: either it is
    // in this realm and is drained below, or the lock was already free.
    drainsOnSteal: true,

    async acquire(name: string, options: AcquireOptions = {}): Promise<GuardHold | undefined> {
      const local = options.steal === true ? mine.get(name) : undefined

      if (local?.held === true) {
        // Held here, so nothing outside can have it. Refuse anything further
        // from it, wait for what it already admitted, and only then take the
        // lock out from under what is now an empty hold.
        local.held = false
        await local.quiet?.()

        return await grant(name, { mode: 'exclusive', steal: true })
      }

      // Either free or another page's. `ifAvailable` is what tells those apart,
      // and taking it when free is exactly the recovery a closed page needs.
      return await grant(name, { mode: 'exclusive', ifAvailable: true })
    },
  }
}

/**
 * The strongest guard this runtime offers.
 *
 * Detected rather than built in: the same bundle runs in a page and on a
 * server, and the difference is whether `navigator.locks` is there. No build
 * seam, because there is nothing to substitute — the check is one property
 * read, and a runtime that has the API is one that should use it.
 *
 * **One per process, and that is the point.** A registry excludes two holders
 * by being the same registry; handing out a fresh one per call would give every
 * caller its own and exclude nobody from anything. The Web Locks manager is
 * already the page's, so sharing it changes nothing there and keeps the two
 * paths the same shape.
 */
let shared: Guard | undefined

export function defaultGuard(): Guard {
  shared ??= buildDefault()

  return shared
}

function buildDefault(): Guard {
  const manager = lockManager()

  return manager === undefined ? processGuard() : webLocksGuard(manager)
}
