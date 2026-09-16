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
 * **What is still not promised.** A guard reaches as far as it reaches, and
 * says so. `navigator.locks` covers every page of an origin, which is also
 * everyone who can reach that origin's storage, so a browser gets real mutual
 * exclusion. Everywhere else the guard is a registry inside one process: it
 * excludes two `Account`s in that process exactly, and a second process opened
 * over the same directory not at all. For that case the claim record is what is
 * left — it turns silent corruption into a refusal naming the account that
 * holds the area — and `takeOverStorage` is how a caller that knows the other
 * run is gone says so. None of that is exclusion, and this module does not call
 * it exclusion.
 */

import {
  type DescribedKV,
  defaultGuard,
  type Guard,
  type GuardHold,
  type GuardScope,
  type KV,
  namespaced,
  type SetOptions,
  YuigramError,
} from '@yuigram/core'

/** Where an account's own area begins. */
const AREA = 'accounts:'

/** What the claim is stored under, inside the area. */
const CLAIM = 'claim'

/** The prefixes an account used before areas existed. */
const LEGACY_PREFIXES = ['auth:', 'dcs:', 'peers:', 'updates:'] as const

/** Raised when a store is already spoken for, or is no longer this run's. */
export class StorageOwnershipError extends YuigramError {
  override readonly name = 'StorageOwnershipError'
}

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
   * `origin` means every page of a web origin, which is everyone who can reach
   * that origin's storage. `process` means this process and nothing outside it.
   * Reported so that nothing downstream assumes more than was established.
   */
  readonly scope: GuardScope
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
function fenced(area: KV<unknown>, hold: GuardHold, name: string): Fenced {
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
    if (!hold.held) refuse()
    inFlight += 1

    try {
      return await run()
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
  const area = namespaced(store, areaFor(options.name))
  const exclusive = coversEveryReader(guard, store)

  const hold = await guard.acquire(guardName(store, options.name), {
    ...(options.takeOver === true ? { steal: true } : {}),
  })

  if (hold === undefined) {
    throw new StorageOwnershipError(
      `the account '${options.name}' is already open on this storage in this ` +
        `${guard.scope === 'origin' ? 'browser origin' : 'process'}. Two runs writing one ` +
        'area overwrite each other’s authorization keys. Give this account a store or a ' +
        'name of its own, or stop the run that has it.',
    )
  }

  const guarded = fenced(area, hold, options.name)
  // Registered before anything is written, so a takeover arriving at any point
  // from here on waits for what this run has in flight.
  hold.drains(async () => await guarded.quiet())

  try {
    await settleClaim({ area, store, options, exclusive })
  } catch (error) {
    // The guard is given back before the failure travels, or a caller that
    // handles the refusal and retries would find the name held by the attempt
    // that refused.
    await hold.release()
    throw error
  }

  return {
    storage: guarded,
    get held() {
      return hold.held
    },
    scope: guard.scope,
    async release() {
      // Drained first. Handing the area on while this run still has a write
      // inside the adapter is exactly the case the fence cannot catch: it was
      // admitted while this run owned the area, and it would land after the
      // next one had started.
      await guarded.quiet()

      // Only a run that still owns the area may clear the claim. One that was
      // superseded — possibly while draining, just above — must not free what
      // took it over.
      if (hold.held) {
        const current = await readClaim(area)
        if (current?.holder === options.holder) await area.set(CLAIM, { name: options.name })
      }

      await hold.release()
    },
  }
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
