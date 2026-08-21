/**
 * Limiting what one user can ask of the bot.
 *
 * The opposite direction from `throttle`, and a different problem. Throttling
 * paces what the bot sends so Telegram does not refuse it; this caps what one
 * user can make the bot do, so a person holding the enter key does not occupy
 * the handler loop, the database and the API budget on everyone else's behalf.
 *
 * ```ts
 * bot.use(rateLimit({ limit: 5, windowMs: 10_000 }))
 * ```
 *
 * Middleware rather than a hook, because it gates updates coming *in*, and
 * that is a different pipeline from the one calls go out on.
 *
 * ## What happens when the limit is hit
 *
 * Nothing, by default: the update is dropped and dispatch stops there. Telling
 * the user is the obvious alternative and is deliberately not the default —
 * answering every message over the limit is itself a message per message over
 * the limit, which is how a flood becomes a flood in both directions. Pass
 * `onLimited` to say something, and it will be called once per offending
 * update so the decision stays yours.
 */

import type { BaseContext, Middleware } from '@yuigram/core'

/** How a request is attributed. Returning `undefined` skips the limit. */
export type RateLimitKey<C> = (context: C) => string | number | undefined

/** What a limiter knows about the caller it is about to refuse. */
export interface RateLimitInfo {
  /** The key that was over its limit. */
  readonly key: string
  /** Requests already counted in the window. */
  readonly count: number
  /** Milliseconds until the window resets. */
  readonly resetMs: number
}

/** Options for {@link rateLimit}. */
export interface RateLimitOptions<C> {
  /** Requests allowed per window. */
  readonly limit: number
  /** Window length, in milliseconds. */
  readonly windowMs: number
  /**
   * How a request is attributed. Defaults to the sender.
   *
   * Per user rather than per chat: a busy group is not abuse, and limiting by
   * chat would let one member's flood silence everyone else in it.
   */
  readonly key?: RateLimitKey<C>
  /** Called for each update that goes over. Omit to drop silently. */
  readonly onLimited?: (context: C, info: RateLimitInfo) => void | Promise<void>
  /**
   * Kinds this applies to. Defaults to everything.
   *
   * A bot that only wants to limit commands, or only callback queries, says so
   * here rather than checking inside the limiter.
   */
  readonly kinds?: readonly string[]
}

/** One key's window. */
interface Counter {
  count: number
  /** When the window closes, in epoch milliseconds. */
  resetAt: number
}

/** Read the sender from any context that has one. */
function defaultKey(context: unknown): string | number | undefined {
  const sender = (context as { sender?: { id?: number } }).sender
  return sender?.id
}

/**
 * How often expired counters are dropped.
 *
 * Sweeping walks every tracked key, so it stays off the per-update path for
 * the same reason the throttle's does.
 */
const SWEEP_INTERVAL_MS = 60_000

/**
 * Limit how often one key may reach the handlers.
 *
 * A fixed window rather than a sliding one: the question here is "has this
 * person had their allowance recently", where the exact boundary matters far
 * less than it does for Telegram's own enforcement, and a fixed window costs
 * one integer per key instead of a list of timestamps.
 *
 * ```ts
 * bot.use(
 *   rateLimit({
 *     limit: 5,
 *     windowMs: 10_000,
 *     onLimited: (event, info) =>
 *       'reply' in event ? event.reply(`Slow down — ${Math.ceil(info.resetMs / 1000)}s`) : undefined,
 *   }),
 * )
 * ```
 */
export function rateLimit<C extends BaseContext>(options: RateLimitOptions<C>): Middleware<C> {
  const { limit, windowMs, key = defaultKey as RateLimitKey<C>, onLimited, kinds } = options

  const counters = new Map<string, Counter>()
  const only = kinds === undefined ? undefined : new Set(kinds)
  let lastSweep = 0

  return async (context, next) => {
    if (only !== undefined && !only.has(context.kind)) {
      await next()
      return
    }

    const raw = key(context)

    // No key means nothing to attribute the request to — a channel post, an
    // anonymous admin. Limiting those by some invented key would group
    // unrelated traffic together.
    if (raw === undefined) {
      await next()
      return
    }

    const now = Date.now()

    if (now - lastSweep > SWEEP_INTERVAL_MS) {
      lastSweep = now
      for (const [id, counter] of counters) {
        if (counter.resetAt <= now) counters.delete(id)
      }
    }

    const id = String(raw)
    let counter = counters.get(id)

    if (counter === undefined || counter.resetAt <= now) {
      counter = { count: 0, resetAt: now + windowMs }
      counters.set(id, counter)
    }

    counter.count += 1

    if (counter.count > limit) {
      await onLimited?.(context, {
        key: id,
        count: counter.count,
        resetMs: Math.max(0, counter.resetAt - now),
      })
      return
    }

    await next()
  }
}
