// SPDX-License-Identifier: MPL-2.0

/**
 * Which account a store's contents belong to, and which run owns them now.
 *
 * An account divides the store it is given by purpose — authorizations, the
 * datacenter list, peers, the place in the update stream — and every one of
 * those keys is the same for every account. Two accounts given the same store
 * therefore write to the same keys, and the second to reach a datacenter
 * overwrites the first one's authorization for it. Nothing failed, nothing was
 * logged, and the symptom arrived later and somewhere else.
 *
 * Three things fix that, and all three are needed.
 *
 * **An area per account.** Everything an account keeps lives under its own
 * name, so two accounts sharing one store do not collide at all. The name is
 * the one the caller already gives an account: stable across a restart, chosen
 * before anything is known about who will sign in, and not a Telegram user id —
 * an account has no user id until it has signed in, and the first thing it needs
 * a store for is the authorization that lets it sign in.
 *
 * ```
 *   store
 *    └─ accounts:<name>:            one per account
 *        ├─ claim                   who holds it, and whether it is running
 *        ├─ auth:…                  authorizations
 *        ├─ dcs:…                   the datacenter list
 *        ├─ peers:…                 peers this account has seen
 *        └─ updates:…               the place in the stream
 * ```
 *
 * **A guard around taking one.** An area keeps two accounts apart only when
 * they have different names. Two with the same name — the same program started
 * twice, two tabs of a page, two `Account`s built from one configuration — land
 * on the same keys, and a record written into the store cannot keep them apart
 * by itself: reading it, finding it free and writing your own is three steps,
 * and two runs doing that together both read "free" before either writes. So
 * the name is taken through a {@link Guard} first, and everything below happens
 * with it held.
 *
 * **A lease that can be lost.** Holding the guard is not the same as holding it
 * forever. A run can be superseded, and a write it began before that must not
 * land after it — so the area handed back refuses writes the moment the lease
 * is over, rather than trusting that nothing is in flight.
 *
 * **A store that fences, where there is one.** A store that can lease an area
 * of itself — SQLite, Redis — is asked for a lease as well as the guard, and
 * then answers for every process that reaches it: the lease is numbered above
 * every one before it, and the store checks that number in the same atomic step
 * as every write. A run paused past its lease, whose successor has begun, finds
 * its writes refused by the store rather than landing. Its lease is renewed
 * while it runs, and the caller is told once when it is lost.
 *
 * **What is still not promised.** A guard reaches as far as it reaches, and
 * says so. `navigator.locks` covers every page of an origin, which is also
 * everyone who can reach that origin's storage, so a browser gets real mutual
 * exclusion. Everywhere else the guard is a registry inside one process: it
 * excludes two `Account`s in that process exactly, and — over a store that does
 * not lease — a second process opened over the same directory not at all. For
 * that case the claim record is what is left — it turns silent corruption into
 * a refusal naming the account that holds the area — and `takeOverStorage` is
 * how a caller that knows the other run is gone says so. None of that is
 * exclusion, and this module does not call it exclusion.
 *
 * **What a takeover is, and what it is not.** The invariant is that a successor
 * must not begin using an area while the run before it can still complete a
 * conflicting write, and `takeOverStorage` is held to it rather than excused
 * from it. It recovers an area whose holder has *gone*; it does not take one
 * away from a holder that is going. The three cases are separated by what can
 * be established rather than by what would be convenient:
 *
 * ```
 *   the previous run released    ──> drained on the way out; adopted
 *   it ended abruptly            ──> its writes ended with it; adopted
 *   it is live and reachable     ──> drained first, then handed on
 *   it is live and unreachable   ──> refused, naming what holds it
 * ```
 *
 * The last row is the one that used to be a silent steal. In a browser it is
 * another page of the origin: its lock is live, the Web Locks API would take
 * the lock and tell that page *afterwards*, and a page that is told afterwards
 * is a page that was still writing. So it is refused. Nothing is lost by that,
 * because a page that closed or crashed has already had its lock released by
 * the browser, and that is the second row — reached by an ordinary acquire,
 * with no flag and nobody asked to confirm anything.
 *
 * Over a store that leases, a takeover from another process is safe for the
 * reason a drain is: the store refuses every write the superseded run makes
 * from the moment the new lease is granted, so nothing it began can land after
 * its successor starts.
 *
 * The limit this leaves is the honest one, and it is a limit of the adapter
 * rather than of the guard: where the other run is in **another process** over a
 * persistent store that does not lease, nothing here can see it at all — not to
 * drain it, and not to know whether it exists. `takeOverStorage` is a caller's
 * assertion that it has ended, and a run that has ended cannot complete a
 * write. A run that has *not* ended was never excluded by a process-scoped
 * guard in the first place, which is what {@link AreaLease.scope} reports so
 * that nothing downstream assumes otherwise. See §4 of `docs/storage.md`.
 */

import {
  canLease,
  type DescribedKV,
  defaultGuard,
  type Guard,
  type GuardScope,
  type KV,
  type LeasableKV,
  namespaced,
  type SetOptions,
  StorageOwnershipError,
  type StoreLease,
  ValidationError,
} from '../core.js'

export { StorageOwnershipError }

/** Where an account's own area begins. */
const AREA = 'accounts:'

/** How long a store lease outlives a run that stopped without releasing it. */
const DEFAULT_LEASE_MS = 30_000

/** What the claim is stored under, inside the area. */
const CLAIM = 'claim'

/** The prefixes an account used before areas existed. */
const LEGACY_PREFIXES = ['auth:', 'dcs:', 'peers:', 'updates:'] as const

/** What an account writes to say it holds an area. */
interface Claim {
  /** The account that holds it. */
  readonly name: string
  /**
   * The run that has it open, absent once that run has stopped.
   *
   * A value rather than a flag so that a run can tell its own claim from
   * another's: a program restarted after a crash finds a token that is not the
   * one it would have written, which is what distinguishes "somebody else is
   * running" from "I left this behind".
   */
  readonly holder?: string
}

/**
 * The area of a store belonging to one account.
 *
 * The name is encoded rather than pasted in, for the reason the application
 * container encodes its own: an account called `a` and one called `a:b` would
 * otherwise be able to write to the same key.
 */
export function areaFor(name: string): string {
  return `${AREA}${encodeURIComponent(name)}:`
}

/** Read a claim, or nothing where the area has never been claimed. */
async function readClaim(area: KV<unknown>): Promise<Claim | undefined> {
  const stored = await area.get(CLAIM)
  if (stored === undefined) return undefined

  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new StorageOwnershipError('the stored claim is not a record')
  }

  const record = stored as Record<string, unknown>
  const name = record['name']
  if (typeof name !== 'string') {
    throw new StorageOwnershipError('the stored claim names no account')
  }

  const holder = record['holder']
  if (holder !== undefined && typeof holder !== 'string') {
    throw new StorageOwnershipError('the stored claim names a holder that is not a token')
  }

  return holder === undefined ? { name } : { name, holder }
}

/** Whether anything an account would have written is present under a prefix. */
async function hasAnything(store: KV<unknown>, prefix: string): Promise<boolean> {
  const scoped = namespaced(store, prefix)
  const keys = scoped.keys?.()
  if (keys === undefined) return false

  for await (const _ of keys) return true

  return false
}

/** How an area is taken. */
export interface ClaimOptions {
  /** The account taking it. */
  readonly name: string
  /** Distinguishes this run from another; a fresh value per `connect`. */
  readonly holder: string
  /**
   * Take an area a previous run left open.
   *
   * Needed only where the guard cannot see the other run. A guard whose reach
   * covers everyone who could touch this store already answers the question —
   * if it granted the name, nobody live holds it — and a claim left behind by a
   * run that is gone is adopted without anybody being asked. Where the guard
   * does not reach that far, a claim naming another run might belong to a live
   * process, and this is how a caller that knows better says otherwise.
   *
   * **It is recovery, not eviction.** It will not hand the area on while the run
   * before it is live and still reachable-but-undrainable — another page of the
   * same origin — and it will not accept a guard that takes names abruptly. Both
   * refuse with a message saying what holds the area. What it does do is stop
   * asking for confirmation once the previous holder has genuinely finished.
   *
   * It does not let one account take another's area. That is not a stale claim,
   * it is the wrong store, and no flag here makes it the right one.
   */
  readonly takeOver?: boolean
  /**
   * What holds the name while this run has the area.
   *
   * Defaults to the strongest one the runtime offers. Supplied by a test that
   * needs a particular reach, or by a caller that has a better primitive than
   * the runtime advertises.
   */
  readonly guard?: Guard
  /**
   * How long a store lease outlives a run that stopped without releasing it,
   * in milliseconds. 30 seconds unless given; renewed every third of that.
   *
   * Used only where the store leases areas itself. It bounds how long a crashed
   * run keeps its successor waiting, not whether a late write can land: a run
   * that was paused past it is refused by the store, not trusted.
   */
  readonly leaseMs?: number
  /**
   * Told once, when a store lease turns out to be lost — a renewal or a write
   * found a later holder, or the lease expired while this run was paused.
   * Nothing this run writes lands after that; what to do about it is the
   * caller's.
   */
  readonly onLost?: (error: StorageOwnershipError) => void
}

/** An account's area, for as long as this run owns it. */
export interface AreaLease {
  /**
   * The area itself, which refuses writes once the lease is over.
   *
   * Reads are still answered. What a superseded run reads is its own account's
   * data, so nothing is disclosed by allowing it, and a diagnostic that cannot
   * read is a diagnostic nobody writes.
   */
  readonly storage: KV<unknown>
  /** Whether this run still owns the area. */
  readonly held: boolean
  /**
   * How far the exclusion around this area actually reaches.
   *
   * `store` means everyone who reaches the same database, whichever process or
   * machine: the store leases the area and refuses a superseded holder's
   * writes itself. `origin` means every page of a web origin, which is everyone
   * who can reach that origin's storage. `process` means this process and
   * nothing outside it. Reported so that nothing downstream assumes more than
   * was established.
   */
  readonly scope: GuardScope | 'store'
  /** Give up the area, leaving its contents where they are. */
  release(): Promise<void>
}

/**
 * Whether a granted guard is evidence that nobody else holds this area.
 *
 * Two cases where it is. An origin-wide guard covers everyone who can reach an
 * origin's storage, so being granted the name means no page holds it. And a
 * store that says it does not survive its process cannot be reached from
 * another one, so a guard over this process covers everyone who could.
 *
 * Everywhere else — a directory, a database — a process-wide guard says only
 * that nothing *here* holds the name, and a claim naming another run may well
 * be a live one. An adapter that reports `persistent: false` while being shared
 * is misdeclaring itself, and gets the weaker answer this rule gives it.
 */
function coversEveryReader(guard: Guard, store: KV<unknown>): boolean {
  if (guard.scope === 'origin') return true

  const described = store as Partial<DescribedKV<unknown>>

  return described.info?.persistent === false
}

/** The name a guard holds for one account's area of one store. */
function guardName(store: KV<unknown>, name: string): string {
  const described = store as Partial<DescribedKV<unknown>>
  const driver = described.info?.driver ?? 'store'

  // The driver is included so that two stores of different kinds in one page do
  // not exclude each other. Two of the *same* kind still share a name, which
  // over-excludes rather than under-excludes: the second is refused with a
  // message naming the account, which is a worse morning than it needs to be
  // and a better one than two runs writing one area.
  return `yuigram:account:${encodeURIComponent(driver)}:${encodeURIComponent(name)}`
}

/**
 * An area that stops accepting writes when the lease behind it is over.
 *
 * The lease is what makes the guard worth holding. Without this a write begun
 * before a takeover lands after it, into an area another run now owns, and the
 * exclusion bought by the guard is spent between the check and the write.
 */
function fenced(
  area: KV<unknown>,
  held: () => boolean,
  name: string,
  refused: (error: StorageOwnershipError) => void,
): Fenced {
  const refuse = (): never => {
    throw new StorageOwnershipError(
      `this run no longer owns the storage for the account '${name}', so the write was ` +
        'refused. Something else took the area over, and writing now would put this ' +
        "run's state into an area another run is keeping.",
    )
  }

  let inFlight = 0
  // A list rather than one slot: a release and a takeover can both be waiting
  // for the same writes, and a single slot would leave whichever asked first
  // waiting for a wake-up the second had overwritten.
  const waiting: Array<() => void> = []

  /**
   * Run one mutation, counted.
   *
   * The count is what makes draining possible. Reading the lease decides
   * whether a write may *start*; it says nothing about one already inside the
   * adapter, and an adapter is asynchronous — so between admission and the
   * mutation there is a window a takeover could fall into.
   */
  const mutating = async <T>(run: () => Promise<T>): Promise<T> => {
    if (!held()) refuse()
    inFlight += 1

    try {
      return await run()
    } catch (error) {
      // The store's own refusal: a lease it fences is no longer this run's.
      if (error instanceof StorageOwnershipError) refused(error)
      throw error
    } finally {
      inFlight -= 1
      if (inFlight === 0) {
        for (const wake of waiting.splice(0)) wake()
      }
    }
  }

  return {
    get: (key) => area.get(key),

    set: async (key, value, options?: SetOptions) => {
      await mutating(async () => await area.set(key, value, options))
    },

    delete: async (key) => {
      await mutating(async () => await area.delete(key))
    },

    has: async (key) =>
      area.has === undefined ? (await area.get(key)) !== undefined : await area.has(key),

    clear: async (prefix) => {
      await mutating(async () => await area.clear?.(prefix))
    },

    keys: (prefix) => area.keys?.(prefix) ?? empty(),

    async quiet() {
      while (inFlight > 0) {
        await new Promise<void>((resolve) => waiting.push(resolve))
      }
    },
  }
}

/** An area that also says when what it admitted has finished. */
interface Fenced extends KV<unknown> {
  /** Settles once nothing this view admitted is still inside the adapter. */
  quiet(): Promise<void>
}

/** Nothing, for a store that cannot enumerate. */
async function* empty(): AsyncIterable<string> {
  // Deliberately yields nothing.
}

/**
 * Take the area belonging to an account, and hand back a lease on it.
 *
 * The guard comes first, so that everything after it — reading the claim,
 * judging it, writing a new one — happens with the name held, and two runs
 * doing this together cannot both decide the area is free.
 *
 * Refuses rather than writing over somebody else's, and says which account it
 * found. The refusal is the point: the alternative is the corruption this
 * module exists to prevent.
 */
export async function claimArea(store: KV<unknown>, options: ClaimOptions): Promise<AreaLease> {
  const guard = options.guard ?? defaultGuard()
  // A store that leases its own areas answers for every process that reaches
  // it, which no guard beside it can.
  const leasable = canLease(store)
  const exclusive = leasable || coversEveryReader(guard, store)

  // A takeover through a guard that cannot answer for the holder it replaces is
  // the one thing this refuses outright. Its whole job is to let a successor
  // start; a successor that starts while the old run can still finish a write
  // is the corruption the areas exist to prevent, arrived at deliberately.
  if (options.takeOver === true && !guard.drainsOnSteal) {
    throw new StorageOwnershipError(
      `taking the storage for the account '${options.name}' over was refused: the guard ` +
        'supplied for it takes a name abruptly and cannot say that the previous run has ' +
        'finished writing. A successor that starts while the old run is still inside a ' +
        'write is what areas exist to prevent. Supply a guard that drains what it ' +
        'supersedes, or stop the other run and open this one normally.',
    )
  }

  const hold = await guard.acquire(guardName(store, options.name), {
    ...(options.takeOver === true ? { steal: true } : {}),
  })
  if (hold === undefined) throw refusedByGuard(guard, options)

  // With the guard held, so two contenders in this process do not both ask the
  // store; the store settles it between processes.
  let fence: StoreLease | undefined
  try {
    fence = leasable ? await leaseFromStore(store, options) : undefined
  } catch (error) {
    await hold.release()
    throw error
  }

  const area = fence?.storage ?? namespaced(store, areaFor(options.name))
  const held = (): boolean => hold.held && (fence?.held ?? true)

  let stopRenewing = (): void => {}
  let reported = false
  const lost = (error: StorageOwnershipError): void => {
    stopRenewing()
    if (reported) return
    reported = true
    options.onLost?.(error)
  }

  const guarded = fenced(area, held, options.name, lost)
  // Registered before anything is written, so a takeover arriving at any point
  // from here on waits for what this run has in flight.
  hold.drains(async () => await guarded.quiet())

  try {
    await settleClaim({ area: fence === undefined ? area : guarded, store, options, exclusive })
  } catch (error) {
    // The guard is given back before the failure travels, or a caller that
    // handles the refusal and retries would find the name held by the attempt
    // that refused.
    await fence?.release().catch(() => undefined)
    await hold.release()
    throw error
  }

  if (fence !== undefined) {
    stopRenewing = keepRenewed(fence, options.leaseMs ?? DEFAULT_LEASE_MS, () =>
      lost(
        new StorageOwnershipError(
          `the lease on the storage for the account '${options.name}' was lost: another ` +
            'run took the area over, or this one was paused past its lease. The store ' +
            'refuses every write this run makes from now on.',
        ),
      ),
    )
  }

  return {
    storage: guarded,
    get held() {
      return held()
    },
    scope: fence === undefined ? guard.scope : 'store',
    async release() {
      stopRenewing()
      reported = true

      try {
        // Drained first. Handing the area on while this run still has a write
        // inside the adapter is exactly the case the fence cannot catch: it was
        // admitted while this run owned the area, and it would land after the
        // next one had started.
        await guarded.quiet()

        // Only a run that still owns the area may clear the claim. One that was
        // superseded — possibly while draining, just above — must not free what
        // took it over.
        if (held()) await unclaim(area, options)
        await fence?.release()
      } finally {
        await hold.release()
      }
    },
  }
}

/**
 * Why the guard refused, in words that say what to do.
 *
 * A plain refusal and a refused takeover are different situations and get
 * different answers. Being refused *while asking to take over* means the area
 * is held by a run this guard can see but cannot reach into — another page of
 * this origin — so the holder is live, and there is nothing to recover from.
 */
function refusedByGuard(guard: Guard, options: ClaimOptions): StorageOwnershipError {
  return new StorageOwnershipError(
    options.takeOver === true
      ? `taking the storage for the account '${options.name}' over was refused: another ` +
          `${guard.scope === 'origin' ? 'page of this browser origin' : 'holder in this process'}` +
          ' still holds the area, and a run that still holds it is a run that is still ' +
          'writing to it. `takeOverStorage` recovers an area a previous run left behind; ' +
          'it does not take one away from a run that is going. Close that page, or wait ' +
          'for it to stop — an area whose holder has genuinely gone is reopened without ' +
          'any flag at all.'
      : `the account '${options.name}' is already open on this storage in this ` +
          `${guard.scope === 'origin' ? 'browser origin' : 'process'}. Two runs writing one ` +
          'area overwrite each other’s authorization keys. Give this account a store or a ' +
          'name of its own, or stop the run that has it.',
  )
}

/**
 * Lease the account's area from a store that fences, or refuse naming why.
 *
 * A takeover steals: safe here as nowhere else, because the store refuses the
 * superseded run's writes from the moment the new lease is granted, so nothing
 * it had begun can land after its successor starts.
 */
async function leaseFromStore(
  store: LeasableKV<unknown>,
  options: ClaimOptions,
): Promise<StoreLease> {
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  if (!Number.isInteger(leaseMs) || leaseMs <= 0) {
    throw new ValidationError(
      `a storage lease lasts a positive whole number of milliseconds, not ${leaseMs}`,
    )
  }

  const lease = await store.lease(areaFor(options.name), {
    holder: options.holder,
    ttlMs: leaseMs,
    ...(options.takeOver === true ? { steal: true } : {}),
  })
  if (lease !== undefined) return lease

  throw new StorageOwnershipError(
    `the account '${options.name}' is open on this storage in another process: its ` +
      'lease on the area is live. Stop that run, or pass `takeOverStorage` to supersede ' +
      'it — the store then refuses every write the other run makes. A run that stopped ' +
      'without releasing loses its lease on its own once it lapses.',
  )
}

/**
 * Renew a lease every third of its lifetime, until told to stop.
 *
 * A renewal that could not reach the store is tried again at the next tick; if
 * the lease lapses meanwhile, that one finds it gone and says so.
 */
function keepRenewed(lease: StoreLease, leaseMs: number, gone: () => void): () => void {
  const timer = setInterval(
    () => {
      lease.renew().then(
        (kept) => {
          if (!kept) gone()
        },
        () => undefined,
      )
    },
    Math.max(1, Math.floor(leaseMs / 3)),
  )
  // Renewing is not a reason for a process to stay alive.
  ;(timer as { unref?: () => void }).unref?.()

  return () => clearInterval(timer)
}

/** Say this run no longer holds the area, if the claim still names it. */
async function unclaim(area: KV<unknown>, options: ClaimOptions): Promise<void> {
  const current = await readClaim(area)
  if (current?.holder !== options.holder) return

  await area.set(CLAIM, { name: options.name }).catch((error: unknown) => {
    // Lost between the check and the write, which the store refused: the claim
    // is the successor's now, and so is what it says.
    if (!(error instanceof StorageOwnershipError)) throw error
  })
}

/** Judge the stored claim and write this run's, with the guard held. */
async function settleClaim(context: {
  readonly area: KV<unknown>
  readonly store: KV<unknown>
  readonly options: ClaimOptions
  readonly exclusive: boolean
}): Promise<void> {
  const { area, store, options, exclusive } = context
  const existing = await readClaim(area)

  if (existing === undefined) {
    // Nothing has claimed this area. Before claiming it, make sure it is not an
    // account from before areas existed, written flat into this store: adopting
    // those under whichever name happens to be asking first would hand one
    // account's authorizations to another.
    await refuseAmbiguousLegacy(store, options.name)
    await area.set(CLAIM, { name: options.name, holder: options.holder })

    return
  }

  if (existing.name !== options.name) {
    // Reachable only when a name encodes into another account's area, which
    // the encoding is meant to prevent. Checked because a claim that is never
    // read is a claim that cannot be relied on.
    throw new StorageOwnershipError(
      `this area belongs to the account '${existing.name}', not to '${options.name}'`,
    )
  }

  const stale = existing.holder !== undefined && existing.holder !== options.holder

  // A claim left behind by a run that is gone. Where the guard covers everyone
  // who could reach this store, being granted the name is the evidence that the
  // run is gone, so the claim is adopted and nobody is asked to confirm
  // anything — an account that crashed reopens the way it would have anyway.
  if (stale && !exclusive && options.takeOver !== true) {
    throw new StorageOwnershipError(
      `the account '${options.name}' was left open on this storage by a run this ` +
        'process cannot see. It may still be running: nothing here excludes another ' +
        'process from the same store. Stop it, or pass `takeOverStorage` if it is gone.',
    )
  }

  await area.set(CLAIM, { name: options.name, holder: options.holder })
}

/**
 * Refuse to adopt storage whose owner cannot be established.
 *
 * An account written before areas existed left its keys at the root of the
 * store. There is no way to tell from the store which account they were, so
 * they are not given to one: a caller that knows says so by moving them, and a
 * caller that does not would otherwise be handed somebody else's authorization
 * under a different name.
 *
 * A store that cannot enumerate cannot be asked, so nothing is found and
 * nothing is refused. That is the safe direction: the alternative is refusing
 * every store that does not implement an optional method.
 */
async function refuseAmbiguousLegacy(store: KV<unknown>, name: string): Promise<void> {
  for (const prefix of LEGACY_PREFIXES) {
    if (!(await hasAnything(store, prefix))) continue

    throw new StorageOwnershipError(
      `this storage holds an account written before accounts had areas, and there is ` +
        `nothing in it saying which account that was — so it is not being given to ` +
        `'${name}'. Point this account at a store of its own, or move the existing ` +
        `'${prefix}' keys under '${areaFor(name)}' to say they are its.`,
    )
  }
}
