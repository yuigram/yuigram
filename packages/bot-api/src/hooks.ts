/**
 * Hooks that ship with the framework.
 *
 * Everything here could be written in an application, and that is the point:
 * they are ordinary `ApiHook`s, included because every production bot needs the
 * first one and writing it correctly is fiddlier than it looks.
 */

import { FloodError, type Logger } from '@yuigram/core'
import type { ApiHook } from './api.js'

/** Options for {@link retryOnFloodWait}. */
export interface FloodWaitOptions {
  /**
   * Longest wait to sit out, in seconds. Longer ones are rethrown.
   *
   * Telegram answers a flood wait with anything from one second to several
   * hours. Sleeping through an hour inside a handler is never what the caller
   * wanted, so there is a ceiling and it is deliberately low.
   */
  readonly maxWait?: number
  /** How many times to retry one call before giving up. */
  readonly attempts?: number
  /** Reports each wait, so a bot hitting limits is visible rather than merely slow. */
  readonly log?: Logger
}

/** Sleep, honouring an abort so a shutdown does not wait out the delay. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason as Error)
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    // A pending sleep must not hold the process open on its own.
    timer.unref?.()

    function onAbort(): void {
      clearTimeout(timer)
      reject(signal?.reason as Error)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Wait out a flood wait and try again.
 *
 * Telegram answers `429` with the number of seconds to wait, and the correct
 * response is to wait exactly that long — backing off further wastes the quota
 * it just granted, and retrying sooner extends the ban. A bot without this
 * turns a routine rate limit into a lost message.
 *
 * ```ts
 * bot.hook(retryOnFloodWait({ maxWait: 30 }))
 * ```
 *
 * The wait is cancellable: a shutdown mid-wait rejects rather than holding the
 * process for the remaining seconds.
 */
export function retryOnFloodWait(options: FloodWaitOptions = {}): ApiHook {
  const { maxWait = 60, attempts = 3, log } = options

  return async (call, next) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await next()
      } catch (error) {
        const isFlood = error instanceof FloodError
        if (!isFlood || attempt >= attempts) throw error

        const wait = error.retryAfter

        // Beyond the ceiling the caller is better served by the error: it can
        // reschedule the work, which is something this hook cannot do.
        if (wait > maxWait) throw error

        log?.warn('flood wait, retrying', { method: call.method, seconds: wait, attempt })
        await sleep(wait * 1000, call.options?.signal)
      }
    }
  }
}

/**
 * Apply parameters to every call that does not set them.
 *
 * The client's `defaults` option covers the static case. This is for values
 * decided per call — a locale, a business connection, a `parse_mode` chosen by
 * whatever the handler is doing.
 */
export function withDefaults(
  compute: (method: string) => Record<string, unknown> | undefined,
): ApiHook {
  return async (call, next) => {
    const extra = compute(call.method)

    // The caller's own arguments win: a default that overrode an explicit
    // parameter would be impossible to opt out of.
    if (extra !== undefined) call.params = { ...extra, ...call.params }

    return next()
  }
}
