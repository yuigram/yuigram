/**
 * Counting what somebody does, and refusing past an allowance.
 *
 * One engine behind four forms: a middleware that drops what is over the limit,
 * a filter a handler can be registered behind, a check or wait a handler calls
 * itself, and the counter underneath all three. The same limiter serves a bot
 * and an account, because what it counts is a key and the key is read from the
 * context the same way on both.
 *
 * ```
 *   limiter({ storage })
 *     .middleware({ limit: 5, windowMs: 10_000 })        drop the rest
 *     .filter({ limit: 1, windowMs: 60_000, bucket: 'report' })
 *     .check(context, rule) / .wait(key, rule)           from a handler
 * ```
 *
 * **Windows are fixed.** A window opens with the first hit and closes
 * `windowMs` later, and every hit inside it counts. That is coarser than a
 * sliding window and far cheaper to keep in a store: one small record per key
 * per bucket, which expires with its window.
 *
 * **A shared store shares counts, not atomicity.** Kept in a store two
 * processes read, one person's hits in both are counted together. The store
 * has no compare-and-set, so two processes counting the same key at the same
 * moment can each read the same count; one process serialises its own hits per
 * key, which is where nearly all contention is. The failure is a hit or two
 * let through, never one refused that should not be.
 */

import type { BaseContext } from '../context/types.js'
import { type AddressedPeer, addressPart } from '../conversation/identity.js'
import { CancelledError, ValidationError } from '../errors/errors.js'
import { defineAsyncFilter } from '../filter/define.js'
import type { AsyncFilter } from '../filter/types.js'
import type { Middleware } from '../middleware/compose.js'
import { memory } from '../storage/memory.js'
import type { KV } from '../storage/types.js'

/** What a store keeps for one key in one bucket. */
export interface RateLimitEntry {
  /** Hits counted in the current window, the one over the limit included. */
  readonly count: number
  /** When the window closes, in milliseconds since the epoch. */
  readonly resetAt: number
}

/** How a key is read from a context. `undefined` leaves the update uncounted. */
export type RateLimitKey<C> = (context: C) => string | number | bigint | undefined

/** One allowance: so many hits in so long, counted apart from other buckets. */
export interface RateLimitRule {
  readonly limit: number
  readonly windowMs: number
  /**
   * The name this allowance is counted under.
   *
   * One person gets a separate count in each bucket, so a limit on reports and
   * a limit on everything else do not spend each other's allowance.
   */
  readonly bucket?: string
}

/** What counting one hit decided. */
export interface RateLimitDecision {
  readonly allowed: boolean
  /** The key it was counted under, as the key function gave it. */
  readonly key: string
  /** Hits in this window, this one included. */
  readonly count: number
  /** How long until the window closes, in milliseconds. */
  readonly resetMs: number
}

/** What an over-limit report is told. */
export interface RateLimitInfo {
  readonly key: string
  readonly count: number
  readonly resetMs: number
}

/** How a limiter is built. */
export interface LimiterOptions<C> {
  /**
   * Where counts are kept. Memory unless given.
   *
   * A store several processes share counts one person's hits in all of them.
   * Each record expires with its window, so a store with expiry stays small.
   */
  readonly storage?: KV<RateLimitEntry>
  /**
   * How a context names who is counted. The sender unless given, so a person
   * is limited wherever they write rather than per chat.
   */
  readonly key?: RateLimitKey<C>
  /** The time, in milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /** Wait so long, for {@link Limiter.wait}. Replaced only to make a test deterministic. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** A middleware's allowance, and what it does about the rest. */
export interface RateLimitMiddlewareRule<C> extends RateLimitRule {
  /** Told about each update dropped over the limit. */
  readonly onLimited?: (context: C, info: RateLimitInfo) => void | Promise<void>
  /** Count only these kinds; everything else passes uncounted. */
  readonly kinds?: readonly string[]
}

/** The counter, and the forms over it. */
export interface Limiter<C> {
  /** Count one hit for a key. */
  hit(key: string | number | bigint, rule: RateLimitRule): Promise<RateLimitDecision>
  /**
   * Count one hit for whoever a context names.
   *
   * `undefined` for a context that names nobody, which is not counted.
   */
  check(context: C, rule: RateLimitRule): Promise<RateLimitDecision | undefined>
  /**
   * Wait until a key is within its allowance, then count the hit.
   *
   * Throttles rather than refuses: for work that should happen, only not too
   * often. A signal abandons the wait with a `CancelledError`.
   */
  wait(
    key: string | number | bigint,
    rule: RateLimitRule,
    signal?: AbortSignal,
  ): Promise<RateLimitDecision>
  /** Forget a key's count in a bucket, so its next hit opens a fresh window. */
  reset(key: string | number | bigint, bucket?: string): Promise<void>
  /** Drop what is over the limit before it reaches a handler. */
  middleware(rule: RateLimitMiddlewareRule<C>): Middleware<C>
  /**
   * A filter that matches while whoever a context names is within the
   * allowance. Evaluating it counts the hit, so a handler registered behind it
   * spends the allowance only on updates it was offered.
   */
  filter(rule: RateLimitRule & { readonly kinds?: readonly string[] }): AsyncFilter<C>
}

/** Who sent something, written the way conversation keys write a peer. */
function senderOf(context: unknown): string | number | undefined {
  return addressPart((context as { readonly sender?: AddressedPeer }).sender)
}

function checkRule(rule: RateLimitRule): void {
  if (!Number.isInteger(rule.limit) || rule.limit < 1) {
    throw new ValidationError(`a limit is a whole number of hits, at least one, not ${rule.limit}`)
  }
  if (!Number.isFinite(rule.windowMs) || rule.windowMs <= 0) {
    throw new ValidationError(
      `a window lasts a positive number of milliseconds, not ${rule.windowMs}`,
    )
  }
  if (rule.bucket !== undefined && (rule.bucket === '' || rule.bucket.includes(':'))) {
    throw new ValidationError(`a bucket is a non-empty name without ':', not '${rule.bucket}'`)
  }
}

/** How often the default store is walked for records whose window closed. */
const SWEEP_INTERVAL_MS = 60_000

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new CancelledError('the wait was cancelled'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new CancelledError('the wait was cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/**
 * A limiter over a store.
 *
 * ```ts
 * const limits = limiter<MessageContext>({ storage: redisBackedKv })
 * bot.use(limits.middleware({ limit: 20, windowMs: 60_000 }))
 * bot.on(limits.filter({ limit: 1, windowMs: 3_600_000, bucket: 'report' }), report)
 * ```
 */
export function limiter<C extends BaseContext>(options: LimiterOptions<C> = {}): Limiter<C> {
  // Read at each hit rather than captured, so a clock replaced later is seen.
  const now = options.now ?? (() => Date.now())
  // The default store keeps time by the same clock, so a record expires just
  // as its window closes by the limiter's own reckoning.
  const storage = options.storage ?? memory<RateLimitEntry>({ now })
  // The default store forgets an expired record only when it is read again,
  // and most keys are never read again once their window closes. Walking it
  // now and then drops them, as a store with its own expiry would.
  const sweeps = options.storage === undefined
  let lastSweep = 0
  const keyOf = options.key ?? (senderOf as RateLimitKey<C>)
  const sleep = options.sleep ?? defaultSleep
  // One chain per stored key: this process's hits on a key happen one at a
  // time, so two cannot both read the same count.
  const turns = new Map<string, Promise<unknown>>()

  const serially = async <T>(slot: string, work: () => Promise<T>): Promise<T> => {
    const ahead = turns.get(slot) ?? Promise.resolve()
    const mine = ahead.then(work, work)
    const settled = mine.then(
      () => undefined,
      () => undefined,
    )
    turns.set(slot, settled)
    try {
      return await mine
    } finally {
      if (turns.get(slot) === settled) turns.delete(slot)
    }
  }

  const slotOf = (key: string, bucket: string | undefined): string =>
    `${bucket ?? 'default'}:${key}`

  const hit = async (
    raw: string | number | bigint,
    rule: RateLimitRule,
  ): Promise<RateLimitDecision> => {
    checkRule(rule)
    const key = String(raw)
    const slot = slotOf(key, rule.bucket)

    return await serially(slot, async () => {
      const at = now()
      if (sweeps && at - lastSweep > SWEEP_INTERVAL_MS) {
        lastSweep = at
        for await (const _ of storage.keys?.() ?? []) {
          // Listing is what drops the expired ones.
        }
      }
      const found = await storage.get(slot)
      const open = found !== undefined && found.resetAt > at
      const entry: RateLimitEntry = open
        ? { count: found.count + 1, resetAt: found.resetAt }
        : { count: 1, resetAt: at + rule.windowMs }
      const resetMs = Math.max(0, entry.resetAt - at)

      // Expires with its window, so a store that honours expiry forgets it.
      await storage.set(slot, entry, { ttl: Math.max(1, Math.ceil(resetMs / 1000)) })

      return { allowed: entry.count <= rule.limit, key, count: entry.count, resetMs }
    })
  }

  const check = async (context: C, rule: RateLimitRule): Promise<RateLimitDecision | undefined> => {
    const raw = keyOf(context)

    return raw === undefined ? undefined : await hit(raw, rule)
  }

  return {
    hit,
    check,

    async wait(raw, rule, signal) {
      for (;;) {
        if (signal?.aborted === true) throw new CancelledError('the wait was cancelled')
        const decision = await hit(raw, rule)
        if (decision.allowed) return decision
        // A refused hit counts too; the next window is where this one fits.
        await sleep(Math.max(1, decision.resetMs), signal)
      }
    },

    async reset(raw, bucket) {
      await storage.delete(slotOf(String(raw), bucket))
    },

    middleware(rule) {
      checkRule(rule)
      const only = rule.kinds === undefined ? undefined : new Set(rule.kinds)

      return async (context, next) => {
        if (only !== undefined && !only.has(context.kind)) {
          await next()
          return
        }

        // No key means nothing to attribute the request to — a channel post,
        // an anonymous admin. Limiting those by some invented key would group
        // unrelated traffic together.
        const decision = await check(context, rule)
        if (decision === undefined || decision.allowed) {
          await next()
          return
        }

        await rule.onLimited?.(context, {
          key: decision.key,
          count: decision.count,
          resetMs: decision.resetMs,
        })
      }
    },

    filter(rule) {
      checkRule(rule)
      const name = `rateLimit(${rule.limit}/${rule.windowMs}ms${rule.bucket === undefined ? '' : `, ${rule.bucket}`})`

      return defineAsyncFilter<C>(
        name,
        async (value) => {
          // A context naming nobody is not counted, and not refused: the limit
          // is about somebody, and there is nobody here to hold to it.
          const decision = await check(value as C, rule)

          return decision === undefined || decision.allowed
        },
        rule.kinds === undefined ? {} : { kinds: rule.kinds },
      )
    },
  }
}
