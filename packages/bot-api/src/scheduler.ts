/**
 * Running handlers concurrently without reordering a conversation, and without
 * accepting more work than can be finished.
 *
 * Delivering a batch strictly in order is safe and slow: one handler that waits
 * on a database holds up every other user in the same batch, and the next poll
 * behind them. Delivering it all at once is fast and wrong: two messages from
 * the same person can be answered out of order, which is the one reordering a
 * user actually notices.
 *
 * So both, on different axes:
 *
 * ```
 * chat A   ──> update ──> update ──> update      serial within a chat
 * chat B   ──> update ──> update                 concurrent across chats
 * chat C   ──> update
 *              └─────── at most `limit` in flight overall ───────┘
 * ```
 *
 * Ordering is per **key**, and the key is the chat. Updates with no chat — a
 * poll answer, an inline query — are independent of everything, so they take
 * the unkeyed path and only meet the global limit.
 *
 * ## Backpressure belongs here
 *
 * `limit` bounds what *runs*; without a second bound, what is *accepted* grows
 * without limit — a producer that always has more updates outruns the handlers
 * and the backlog is the process's memory. Bounding only the running set hides
 * that rather than fixing it.
 *
 * So the scheduler also states when it is full, and the producer waits:
 *
 * ```
 * pending >= capacity   ──>  producer waits on `whenReady()`
 * pending <= resumeAt   ──>  waiters wake, producer fetches again
 * ```
 *
 * Two watermarks rather than one, because resuming at the same level the
 * producer stopped at makes it fetch one update at a time forever. This is the
 * only place the bound belongs: the scheduler is what knows the depth, and any
 * ingestion source — a poll loop today, an MTProto updates manager later — can
 * wait on the same gate without knowing anything about the other.
 */

import type { Update } from './generated/types/index.js'

/** Options for {@link createScheduler}. */
export interface SchedulerOptions {
  /**
   * Most updates handled at once.
   *
   * A bound rather than "as many as arrive": a batch of a hundred slow
   * handlers would otherwise open a hundred database connections at once,
   * which is how a bot takes down the thing it depends on.
   */
  readonly limit: number
  /**
   * Most updates accepted before the producer is asked to wait.
   *
   * Defaults to four batches' worth of the concurrency limit, which keeps the
   * handlers fed across a fetch without letting a permanently full transport
   * accumulate. Never below `limit`, since a scheduler that cannot hold what
   * it runs would stall.
   */
  readonly capacity?: number
  /** How an update is keyed for ordering. Defaults to its chat. */
  readonly keyOf?: (update: Update) => string | undefined
}

/** Options for {@link Scheduler.drain}. */
export interface DrainOptions {
  /**
   * Gives up waiting when aborted.
   *
   * Abandoned work keeps running — nothing can cancel a promise — so `drain`
   * reports `false` rather than pretending it finished.
   */
  readonly signal?: AbortSignal
}

/** Schedules update handling. */
export interface Scheduler {
  /** Run `work` for `update`, respecting order and the concurrency bound. */
  run(update: Update, work: () => Promise<void>): void
  /**
   * Wait until there is room to accept more work.
   *
   * Resolves immediately when the scheduler is below its capacity, so a
   * producer keeping up never pays for the check. Rejects if the signal is
   * aborted, which is how a shutdown stops a waiting producer.
   */
  whenReady(signal?: AbortSignal): Promise<void>
  /**
   * Resolve once everything scheduled so far has finished.
   *
   * Returns whether it actually finished: `false` means the signal fired first
   * and work was abandoned, which the caller must not report as a clean stop.
   */
  drain(options?: DrainOptions): Promise<boolean>
  /** How many are running or queued. */
  readonly pending: number
  /** Whether the scheduler is at or above its capacity. */
  readonly saturated: boolean
}

/**
 * The chat an update belongs to, as a key.
 *
 * Read from the payload rather than from a normalized context, because
 * scheduling happens before a context exists — the whole point is to decide
 * how many contexts to build at once.
 */
export function chatKeyOf(update: Update): string | undefined {
  for (const value of Object.values(update as unknown as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue

    const payload = value as Record<string, unknown>
    const chat = (payload['chat'] ??
      (payload['message'] as Record<string, unknown> | undefined)?.['chat']) as
      | { id?: unknown }
      | undefined

    if (chat?.id !== undefined) return String(chat.id)
  }

  return undefined
}

/**
 * Build a scheduler.
 *
 * `run` returns immediately: the caller is an ingestion loop that must get back
 * to its transport rather than wait for handlers. `whenReady` is how it learns
 * to slow down, and `drain` is what shutdown awaits.
 */
export function createScheduler(options: SchedulerOptions): Scheduler {
  const { limit, keyOf = chatKeyOf } = options

  const capacity = Math.max(limit, options.capacity ?? limit * 4)
  // Resuming at the level the producer stopped at makes it fetch one update at
  // a time forever, so it resumes at half depth and refills in batches.
  const resumeAt = Math.max(1, Math.floor(capacity / 2))

  /** Tail of each key's chain, so one chat's updates stay in order. */
  const chains = new Map<string, Promise<void>>()
  /** Everything not yet settled, so `drain` can wait for it. */
  const inFlight = new Set<Promise<void>>()
  /** Callers waiting for a slot under the concurrency bound. */
  const waitingForSlot: Array<() => void> = []
  /** Producers waiting for the backlog to fall. */
  const waitingForRoom: Array<() => void> = []
  let running = 0

  /** Take a slot, waiting if the bound is reached. */
  const acquire = async (): Promise<void> => {
    if (running < limit) {
      running += 1
      return
    }

    await new Promise<void>((resolve) => waitingForSlot.push(resolve))
    running += 1
  }

  /** Give a slot back, waking the longest-waiting caller. */
  const release = (): void => {
    running -= 1
    waitingForSlot.shift()?.()
  }

  /** Wake every producer once the backlog has fallen far enough. */
  const admitProducers = (): void => {
    if (inFlight.size > resumeAt || waitingForRoom.length === 0) return

    // Woken all at once rather than one per completion: they re-check the
    // depth themselves, and waking one at a time would serialize fetches.
    const woken = waitingForRoom.splice(0, waitingForRoom.length)
    for (const wake of woken) wake()
  }

  const schedule = (key: string | undefined, work: () => Promise<void>): Promise<void> => {
    const run = async (): Promise<void> => {
      await acquire()
      try {
        await work()
      } finally {
        release()
      }
    }

    if (key === undefined) return run()

    // Chained behind whatever is already queued for this chat, so two messages
    // from one person are answered in the order they were sent.
    const previous = chains.get(key) ?? Promise.resolve()
    const next = previous.then(run, run)

    // Swallowed so one failure does not cascade into the next update for the
    // same chat; the caller's own `work` is where errors are reported.
    const tail = next.catch(() => undefined)
    chains.set(key, tail)

    void tail.then(() => {
      // Drop the entry only while this task is still the tail, so a chat the
      // bot has stopped hearing from is not remembered forever.
      if (chains.get(key) === tail) chains.delete(key)
    })

    return next
  }

  return {
    run(update, work) {
      const task = schedule(keyOf(update), work).catch(() => undefined)

      inFlight.add(task)
      void task.then(() => {
        inFlight.delete(task)
        admitProducers()
      })
    },

    whenReady(signal) {
      if (signal?.aborted === true) return Promise.reject(signal.reason as Error)
      if (inFlight.size < capacity) return Promise.resolve()

      return new Promise<void>((resolve, reject) => {
        const wake = (): void => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }

        function onAbort(): void {
          const index = waitingForRoom.indexOf(wake)
          if (index !== -1) waitingForRoom.splice(index, 1)
          reject(signal?.reason as Error)
        }

        waitingForRoom.push(wake)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },

    async drain(drainOptions = {}) {
      const { signal } = drainOptions

      // Repeated because draining one wave can schedule another — a handler
      // that sends a message which produces an update is ordinary.
      while (inFlight.size > 0) {
        if (signal?.aborted === true) return false

        const settled = Promise.all([...inFlight]).then(() => true)

        if (signal === undefined) {
          await settled
          continue
        }

        const abandoned = new Promise<boolean>((resolve) => {
          signal.addEventListener('abort', () => resolve(false), { once: true })
        })

        // Whichever comes first. Losing the race leaves the work running —
        // nothing can cancel a promise — so the caller is told `false` rather
        // than being allowed to report a clean stop.
        if (!(await Promise.race([settled, abandoned]))) return false
      }

      return true
    },

    get pending() {
      return inFlight.size
    },

    get saturated() {
      return inFlight.size >= capacity
    },
  }
}
