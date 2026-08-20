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
import { isRetryable } from './errors.js'
import type { Update } from './generated/types/index.js'

/** Options for {@link createPolling}. */
export interface PollingOptions {
  /** The API surface to poll through. */
  readonly api: RawApi
  /** Called for each update, in the order Telegram sent them. */
  readonly onUpdate: (update: Update) => Promise<void> | void
  /** Reports a failure the loop recovered from. */
  readonly onError?: (error: unknown) => void
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
   * Milliseconds to wait after an empty batch when {@link timeout} is `0`.
   *
   * Without this a short-polling loop spins as fast as the network allows and
   * pegs a CPU core. Ignored while long polling, where Telegram already
   * provides the pacing.
   */
  readonly idleDelay?: number
  /** Maximum updates per batch, 1–100. */
  readonly limit?: number
  /** First backoff delay in milliseconds. */
  readonly backoffBase?: number
  /** Longest backoff delay in milliseconds. */
  readonly backoffMax?: number
  /** Drop updates queued before startup. */
  readonly dropPending?: boolean
}

/** A running polling loop. */
export interface Polling {
  /** Begin polling. Resolves once the loop is running. */
  start(): Promise<void>
  /** Stop polling and wait for the in-flight request to settle. */
  stop(): Promise<void>
  /** Whether the loop is running. */
  readonly running: boolean
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
    log,
    allowedUpdates,
    timeout = 30,
    idleDelay = 300,
    limit = 100,
    backoffBase = 1000,
    backoffMax = 60_000,
    dropPending = false,
  } = options

  let offset = 0
  let running = false
  let loop: Promise<void> | undefined
  let controller = new AbortController()

  /** Fetch one batch, translating a flood wait into its own delay. */
  const fetchBatch = async (): Promise<Update[]> => {
    const params: Record<string, unknown> = { offset, limit, timeout }
    if (allowedUpdates !== undefined) params['allowed_updates'] = allowedUpdates

    return (await api.call<Update[]>('getUpdates', params)) ?? []
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
   */
  const deliver = async (updates: readonly Update[]): Promise<void> => {
    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1)

      try {
        await onUpdate(update)
      } catch (error) {
        log?.error('update handler failed', { updateId: update.update_id, error })
        onError?.(error)
      }
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

  const run = async (): Promise<void> => {
    let failures = 0

    while (running) {
      try {
        const updates = await fetchBatch()
        failures = 0

        // Short polling returns immediately, so without a pause here the loop
        // would spin as fast as the network allows.
        if (updates.length === 0 && timeout === 0 && idleDelay > 0) {
          await delay(idleDelay, controller.signal)
        }

        await deliver(updates)
      } catch (error) {
        if (!running) break

        onError?.(error)

        const wait = backoffFor(error, failures)
        failures = isRetryable(error) ? failures + 1 : failures

        log?.warn('polling failed, retrying', { waitMs: wait, error })
        await delay(wait, controller.signal)
      }
    }
  }

  return {
    get running() {
      return running
    },

    async start() {
      if (running) return

      controller = new AbortController()
      running = true

      if (dropPending) await drainPending()

      log?.info('polling started', { allowedUpdates })
      loop = run()
    },

    async stop() {
      if (!running) return

      running = false
      controller.abort()

      // Awaited so a caller that stops and inspects state does not race the
      // final iteration.
      await loop
      loop = undefined

      log?.info('polling stopped', { offset })
    },
  }
}
