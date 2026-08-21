/**
 * Long polling.
 *
 * Calls `getUpdates` in a loop, advancing the offset past everything received.
 * Telegram maintains the queue, the ordering and the deduplication server-side,
 * so this layer only has to be careful about three things:
 *
 * - **Advancing the offset exactly once per batch.** Advancing too early loses
 *   updates; too late replays them.
 * - **Backing off on failure** rather than hammering a struggling API.
 * - **Not stopping.** A polling loop that exits on error takes the bot down for
 *   a transient network blip.
 */

import type { Logger } from '@yuigram/core'
import { FloodError } from '@yuigram/core'
import type { RawApi } from './api.js'
import { BotApiError } from './errors.js'
import type { Update } from './generated/types/index.js'
import { createScheduler } from './scheduler.js'

/** Options for {@link createPolling}. */
export interface PollingOptions {
  /** The API surface to poll through. */
  readonly api: RawApi
  /** Called for each update, in the order Telegram sent them. */
  readonly onUpdate: (update: Update) => Promise<void> | void
  /** Reports a failure the loop recovered from. */
  readonly onError?: (error: unknown) => void
  /**
   * Reports the error that stopped the loop.
   *
   * Distinct from {@link onError} because the two demand different responses:
   * a recovered failure is worth logging, while a fatal one means the bot is
   * no longer receiving updates and needs an operator.
   */
  readonly onFatal?: (error: unknown) => void
  readonly log?: Logger

  /**
   * Update kinds to subscribe to.
   *
   * Passing the minimal set matters beyond bandwidth: Telegram does not deliver
   * `message_reaction` or `chat_member` at all unless they are requested, so an
   * over-broad default hides the problem while an over-narrow one causes the
   * classic "my handler never fires".
   */
  readonly allowedUpdates?: readonly string[]

  /**
   * Seconds Telegram holds a request open with no updates.
   *
   * `0` is short polling: the call returns immediately, so {@link idleDelay}
   * paces the loop instead.
   */
  readonly timeout?: number
  /**
   * Milliseconds to wait after an empty batch that returned immediately.
   *
   * Without this a short-polling loop spins as fast as the network allows and
   * pegs a CPU core. It applies whenever a poll comes back empty far sooner
   * than the hold it asked for, which covers short polling and also a local
   * Bot API server or proxy that ignores `timeout` — where the loop would
   * otherwise spin just as hard while looking like it was long polling.
   */
  readonly idleDelay?: number

  /**
   * Milliseconds allowed for the request beyond the hold it asks for.
   *
   * The request has to outlive the poll it carries. With equal budgets a
   * healthy empty long poll races its own timeout and aborts as often as it
   * returns, so a working bot reports constant failures.
   */
  readonly requestGrace?: number
  /** Maximum updates per batch, 1–100. */
  readonly limit?: number
  /**
   * Most handlers running at once.
   *
   * Updates for one chat always run in order; unrelated chats run in parallel
   * up to this bound. `1` restores strictly sequential delivery, which is
   * simplest to reason about and slowest under load.
   *
   * A bound rather than "as many as arrive", because a batch of a hundred slow
   * handlers would otherwise open a hundred connections to whatever they
   * depend on.
   */
  readonly concurrency?: number
  /**
   * Most updates accepted before the loop stops fetching.
   *
   * Defaults to four times `concurrency`, and is never below it.
   *
   * The check happens before a fetch, and a fetch returns a whole batch, so
   * the outstanding work peaks at roughly **half the capacity plus one batch**
   * rather than at the capacity exactly. That is deliberate: trimming the
   * batch to fit would trade a bounded, predictable peak for more round trips
   * and a slower bot. What matters is that the peak is a constant, not a
   * function of how long the bot has been running.
   */
  readonly capacity?: number
  /** First backoff delay in milliseconds. */
  readonly backoffBase?: number
  /** Longest backoff delay in milliseconds. */
  readonly backoffMax?: number
  /** Drop updates queued before startup. */
  readonly dropPending?: boolean
}

/**
 * Whether an error makes further polling pointless.
 *
 * These are not transient, so retrying neither helps nor eventually succeeds:
 *
 * - `401` — the token is not valid, and will not become valid by waiting.
 * - `404` — the bot no longer exists.
 * - `409` — another consumer is calling `getUpdates` with the same token.
 *   Retrying leaves two instances fighting over one queue, each stealing
 *   updates from the other, which is worse than stopping.
 *
 * Everything else, including 5xx and network failures, is treated as transient
 * and retried with backoff.
 */
export function isFatalPollingError(error: unknown): boolean {
  if (!(error instanceof BotApiError)) return false
  return error.code === 401 || error.code === 404 || error.code === 409
}

/** A running polling loop. */
/** Options for {@link Polling.stop}. */
export interface PollingStopOptions {
  /**
   * Gives up waiting for handlers when aborted.
   *
   * The caller owns the deadline. Without one here, a handler that never
   * settles keeps `stop` from returning, whatever timeout the caller set.
   */
  readonly signal?: AbortSignal
}

export interface Polling {
  /** Begin polling. Resolves once the loop is running. */
  start(): Promise<void>
  /**
   * Stop polling, then wait for handlers already running.
   *
   * Returns whether they finished: `false` means the deadline passed and work
   * was abandoned, which the caller must not report as a clean stop.
   */
  stop(options?: PollingStopOptions): Promise<boolean>
  /** Whether the loop is running. */
  readonly running: boolean
  /** Updates scheduled but not yet finished. */
  readonly pending: number
}

/** Sleep, resolving early if the signal aborts. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/** Create a polling loop. */
export function createPolling(options: PollingOptions): Polling {
  const {
    api,
    onUpdate,
    onError,
    onFatal,
    log,
    allowedUpdates,
    timeout = 30,
    idleDelay = 300,
    limit = 100,
    requestGrace = 15_000,
    backoffBase = 1000,
    backoffMax = 60_000,
    dropPending = false,
    concurrency = 16,
    capacity,
  } = options

  const scheduler = createScheduler({
    limit: Math.max(1, concurrency),
    ...(capacity === undefined ? {} : { capacity }),
  })

  let offset = 0
  let running = false
  let loop: Promise<void> | undefined
  let controller = new AbortController()

  /** Fetch one batch, translating a flood wait into its own delay. */
  const fetchBatch = async (): Promise<Update[]> => {
    const params: Record<string, unknown> = { offset, limit, timeout }
    if (allowedUpdates !== undefined) params['allowed_updates'] = allowedUpdates

    // Two controls, for two different jobs. The signal makes shutdown prompt:
    // without it, `stop` waits out the long poll. The timeout has to exceed
    // the hold Telegram was asked for, or the request aborts at the moment a
    // healthy empty poll would have returned.
    return (
      (await api.call<Update[]>('getUpdates', params, {
        signal: controller.signal,
        timeout: timeout * 1000 + requestGrace,
      })) ?? []
    )
  }

  /** Discard anything queued before startup. */
  const drainPending = async (): Promise<void> => {
    const updates = await api.call<Update[]>('getUpdates', { offset: -1, limit: 1, timeout: 0 })
    const last = updates?.at(-1)
    if (last !== undefined) offset = last.update_id + 1
    log?.debug('dropped pending updates', { offset })
  }

  /**
   * Deliver one batch.
   *
   * The offset advances before each handler runs. A handler that throws must
   * not cause Telegram to resend the update forever; delivery is at-most-once
   * by design, and durability is the application's job.
   *
   * Handlers run through the scheduler rather than one after another: a
   * conversation stays in order, unrelated ones do not wait for each other, and
   * the loop gets back to `getUpdates` instead of holding the batch open behind
   * its slowest handler.
   */
  const deliver = (updates: readonly Update[]): void => {
    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1)

      scheduler.run(update, async () => {
        try {
          await onUpdate(update)
        } catch (error) {
          log?.error('update handler failed', { updateId: update.update_id, error })
          onError?.(error)
        }
      })
    }
  }

  /**
   * How long to wait after a failed poll.
   *
   * A flood wait states its own delay; anything else backs off exponentially so
   * a struggling API is not hammered.
   */
  const backoffFor = (error: unknown, failures: number): number =>
    error instanceof FloodError
      ? Math.max(error.retryAfter * 1000, backoffBase)
      : Math.min(backoffBase * 2 ** failures, backoffMax)

  /** Record a fatal error and take the loop down. */
  const fail = (error: unknown): void => {
    running = false
    log?.error('polling stopped: unrecoverable error', { error })
    onFatal?.(error)
  }

  /**
   * Whether an empty batch came back sooner than the hold it asked for.
   *
   * That is short polling by design, and a server ignoring `timeout` by
   * accident; both spin a CPU core without pacing. A `timeout` of zero requests
   * no hold at all, so every empty batch under it is early - comparing against
   * half of zero would pace nothing.
   */
  const returnedEarly = (began: number): boolean => {
    const held = timeout * 1000
    return held === 0 || Date.now() - began < held / 2
  }

  /** One successful pass: deliver, then pace if the batch came back empty and early. */
  const servePass = async (): Promise<void> => {
    // Asking before fetching is what bounds the whole pipeline. The offset
    // advances when an update is scheduled, so Telegram hands over the next
    // batch as soon as this one is taken — and a producer that never pauses
    // turns a backlog into the process's memory. The wait is on a promise the
    // scheduler resolves, not a poll of its depth.
    await scheduler.whenReady(controller.signal)

    const began = Date.now()
    const updates = await fetchBatch()

    deliver(updates)

    if (updates.length === 0 && returnedEarly(began) && idleDelay > 0) {
      await delay(idleDelay, controller.signal)
    }
  }

  /** Decide what a failed pass means. Returns false when the loop should end. */
  const recover = async (error: unknown, failures: number): Promise<boolean> => {
    if (!running) return false

    // An abort is the shutdown path, not a failure.
    if (controller.signal.aborted) return false

    if (isFatalPollingError(error)) {
      fail(error)
      return false
    }

    onError?.(error)

    const wait = backoffFor(error, failures)
    log?.warn('polling failed, retrying', { waitMs: wait, error })
    await delay(wait, controller.signal)

    return true
  }

  const run = async (): Promise<void> => {
    let failures = 0

    while (running) {
      try {
        await servePass()
        failures = 0
      } catch (error) {
        // Every failure widens the delay. Counting only the retryable ones left
        // a permanent failure retrying at the base delay forever.
        const shouldContinue = await recover(error, failures)
        failures += 1

        if (!shouldContinue) break
      }
    }
  }

  return {
    get running() {
      return running
    },

    get pending() {
      return scheduler.pending
    },

    async start() {
      if (running) return

      controller = new AbortController()
      running = true

      if (dropPending) await drainPending()

      log?.info('polling started', { allowedUpdates })
      loop = run()
    },

    async stop(stopOptions = {}) {
      if (!running) return true

      running = false
      controller.abort()

      // Awaited so a caller that stops and inspects state does not race the
      // final iteration.
      await loop
      loop = undefined

      // Handlers scheduled by the last batch are still running: cutting them
      // off mid-reply is what draining exists to prevent. Bounded by the
      // caller's deadline, because an unbounded wait here would defeat it —
      // and the caller is a lifecycle that promised one.
      const drained = await scheduler.drain(
        stopOptions.signal === undefined ? {} : { signal: stopOptions.signal },
      )

      if (!drained) {
        log?.warn('polling stopped with handlers still running', {
          offset,
          abandoned: scheduler.pending,
        })
      } else {
        log?.info('polling stopped', { offset })
      }

      return drained
    },
  }
}
