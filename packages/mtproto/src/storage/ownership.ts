/**
 * Which account a store's contents belong to.
 *
 * An account divides the store it is given by purpose — authorizations, the
 * datacenter list, peers, the place in the update stream — and every one of
 * those keys is the same for every account. Two accounts given the same store
 * therefore write to the same keys, and the second to reach a datacenter
 * overwrites the first one's authorization for it. Nothing failed, nothing was
 * logged, and the symptom arrived later and somewhere else.
 *
 * Two things fix that, and both are needed.
 *
 * **An area per account.** Everything an account keeps now lives under its own
 * name, so two accounts sharing one store do not collide at all. The name is
 * the one the caller already gives an account: stable across a restart, chosen
 * before anything is known about who will sign in, and not a Telegram user id —
 * an account has no user id until it has signed in, and the first thing it needs
 * a store for is the authorization that lets it sign in.
 *
 * **A claim inside the area.** An area keeps two accounts apart only when they
 * have different names. Two with the same name — the same program started
 * twice, or two `Account`s built from one configuration — still land on the same
 * keys, and no amount of prefixing separates them. So an account records that it
 * holds the area while it is running, and one that finds somebody else's claim
 * says so rather than writing over it.
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
 * The claim is not a lock. Nothing here can stop a write from another process
 * that ignores it, and nothing here tries: what it does is turn a silent
 * corruption into a refusal that names the account already holding the area.
 */

import { type KV, namespaced, YuigramError } from '@yuigram/core'

/** Where an account's own area begins. */
const AREA = 'accounts:'

/** What the claim is stored under, inside the area. */
const CLAIM = 'claim'

/** The prefixes an account used before areas existed. */
const LEGACY_PREFIXES = ['auth:', 'dcs:', 'peers:', 'updates:'] as const

/** Raised when a store is already spoken for. */
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
   * A run that ends without stopping — a crash, a process killed — leaves its
   * claim behind, and the next one cannot tell that from another program
   * running right now. So it refuses, and this is how a caller that knows
   * better says so. It does not override a *different* account's area: that is
   * not a stale claim, it is the wrong store.
   */
  readonly takeOver?: boolean
}

/**
 * Take the area belonging to an account, and hand back the store scoped to it.
 *
 * Refuses rather than writing over somebody else's, and says which account it
 * found. The refusal is the point: the alternative is the corruption this
 * module exists to prevent.
 */
export async function claimArea(store: KV<unknown>, options: ClaimOptions): Promise<KV<unknown>> {
  const area = namespaced(store, areaFor(options.name))
  const existing = await readClaim(area)

  if (existing === undefined) {
    // Nothing has claimed this area. Before claiming it, make sure it is not an
    // account from before areas existed, written flat into this store: adopting
    // those under whichever name happens to be asking first would hand one
    // account's authorizations to another.
    await refuseAmbiguousLegacy(store, options.name)
    await area.set(CLAIM, { name: options.name, holder: options.holder })

    return area
  }

  if (existing.name !== options.name) {
    // Reachable only when a name encodes into another account's area, which
    // the encoding is meant to prevent. Checked because a claim that is never
    // read is a claim that cannot be relied on.
    throw new StorageOwnershipError(
      `this area belongs to the account '${existing.name}', not to '${options.name}'`,
    )
  }

  if (existing.holder !== undefined && existing.holder !== options.holder) {
    if (options.takeOver !== true) {
      throw new StorageOwnershipError(
        `the account '${options.name}' is already open on this storage. Two accounts ` +
          'writing one area overwrite each other’s authorization keys. Give this ' +
          'account a store or a name of its own, or pass `takeOverStorage` if the run ' +
          'that left this claim is gone.',
      )
    }
  }

  await area.set(CLAIM, { name: options.name, holder: options.holder })

  return area
}

/**
 * Give up a claim, leaving what the account stored where it is.
 *
 * Called when an account stops. What it releases is the right to be the one
 * running, not the contents: an account that stops and starts again resumes
 * from what it left.
 */
export async function releaseArea(store: KV<unknown>, name: string, holder: string): Promise<void> {
  const area = namespaced(store, areaFor(name))
  const existing = await readClaim(area)

  // Only the run that holds it may release it. A run that was taken over must
  // not clear the claim of whatever took it over.
  if (existing === undefined || existing.holder !== holder) return

  await area.set(CLAIM, { name })
}

/**
 * Refuse to adopt storage whose owner cannot be established.
 *
 * An account written before areas existed left its keys at the root of the
 * store. There is no way to tell from the store which account they were, so
 * they are not given to one: a caller that knows says so by moving them, and a
 * caller that does not would otherwise be handed somebody else's authorization
 * under a different name.
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
