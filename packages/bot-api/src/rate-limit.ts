// SPDX-License-Identifier: MPL-2.0

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
 * that is a different pipeline from the one calls go out on. The counting is
 * the shared `limiter` underneath; this is its middleware form with the
 * options in one object, and `limiter` itself offers the filter, the check a
 * handler makes, and the wait.
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

import {
  type BaseContext,
  type KV,
  limiter,
  type Middleware,
  type RateLimitEntry,
  type RateLimitInfo,
  type RateLimitKey,
} from './core.js'

export type { RateLimitInfo, RateLimitKey } from '@yuigram/core'

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
  /**
   * Where counts are kept. Memory unless given.
   *
   * A store several instances share limits one user across all of them.
   */
  readonly storage?: KV<RateLimitEntry>
  /**
   * The name counts are kept under, so two limits in one store — one on
   * everything, one on a costly command — do not spend each other's allowance.
   */
  readonly bucket?: string
}

/**
 * Limit how often one key may reach the handlers.
 *
 * A fixed window rather than a sliding one: the question here is "has this
 * person had their allowance recently", where the exact boundary matters far
 * less than it does for Telegram's own enforcement, and a fixed window costs
 * one small record per key instead of a list of timestamps.
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
  const { storage, key, ...rule } = options

  return limiter<C>({
    ...(storage === undefined ? {} : { storage }),
    ...(key === undefined ? {} : { key }),
  }).middleware(rule)
}
