/**
 * Staying under Telegram's limits, rather than recovering from them.
 *
 * Telegram publishes three soft limits for bots:
 *
 * | Scope | Limit |
 * |---|---|
 * | Everything | ~30 requests per second |
 * | One chat | ~1 message per second |
 * | One group or channel | ~20 messages per minute |
 *
 * They are soft: bursts are absorbed, and when they stop being absorbed the
 * answer is `429` with `retry_after`. So there are two halves to the problem,
 * and a serious bot wants both:
 *
 * ```ts
 * bot.hook(throttle())                          // proactive: stay under
 * bot.hook(retryOnFloodWait({ maxWait: 30 }))   // reactive: recover anyway
 * ```
 *
 * Without the first, a broadcast loop floods in its first second and earns a
 * wait; without the second, an unlucky burst still fails.
 *
 * ## Sliding windows, not token buckets
 *
 * Telegram's own question is "how many in the last second". A sliding window
 * answers exactly that: timestamps go in, expired ones fall off, and a caller
 * arriving at the limit sleeps until the oldest one leaves. A token bucket
 * approximates the same thing and drifts under bursty traffic, which is
 * precisely the traffic this exists for.
 *
 * ## Fairness
 *
 * Callers queue behind a per-bucket FIFO. Without it, everything parked on one
 * chat wakes at the same moment, races, and one unlucky caller starves —
 * the thundering herd, arriving as "one user's message is always last".
 */

import { type Logger, YuigramError } from '@yuigram/core'
import type { ApiHook } from './api.js'

/** Telegram's published global ceiling, in requests per second. */
export const DEFAULT_GLOBAL_PER_SECOND = 30

/** Telegram's published per-chat ceiling, in messages per second. */
export const DEFAULT_CHAT_PER_SECOND = 1

/** Telegram's published per-group ceiling, in messages per minute. */
export const DEFAULT_GROUP_PER_MINUTE = 20

/**
 * Methods that never count toward a send budget.
 *
 * Control-plane calls: reading updates, asking who we are, shutting down.
 * Throttling `getUpdates` would throttle the bot's own intake, which is the one
 * thing that must not queue behind a broadcast.
 */
export const DEFAULT_EXCLUDED_METHODS: readonly string[] = [
  'getUpdates',
  'getMe',
  'getWebhookInfo',
  'setWebhook',
  'deleteWebhook',
  'close',
  'logOut',
]

/** A sliding window over one bucket. */
export interface SlidingWindow {
  /** How long to wait before another acquire would fit, in milliseconds. */
  delay(now: number): number
  /** Record an acquire. */
  record(now: number): void
  /** Drop expired stamps. Returns whether anything is still tracked. */
  prune(now: number): boolean
  /** Callers currently parked on this window. */
  waiting: number
}

/**
 * A window admitting `limit` acquires per `windowMs`.
 *
 * Exported because a plugin pacing on some other signal — per topic, per user,
 * per API key — should not have to reimplement the primitive.
 */
export function createWindow(limit: number, windowMs: number): SlidingWindow {
  const stamps: number[] = []

  return {
    waiting: 0,

    prune(now) {
      const cutoff = now - windowMs
      while (stamps.length > 0 && (stamps[0] as number) <= cutoff) stamps.shift()
      return stamps.length > 0
    },

    delay(now) {
      this.prune(now)
      if (stamps.length < limit) return 0

      // The oldest stamp is the one whose expiry frees a slot.
      const oldest = stamps[0] as number
      return Math.max(0, oldest + windowMs - now)
    },

    record(now) {
      stamps.push(now)
    },
  }
}

/** Per-method overrides, for calls whose real cost differs. */
export interface MethodLimits {
  readonly chatPerSecond?: number
  readonly groupPerMinute?: number
}

/** Options for {@link throttle}. */
export interface ThrottleOptions {
  /** Global ceiling, requests per second. */
  readonly globalPerSecond?: number
  /** Per-chat ceiling, messages per second. */
  readonly chatPerSecond?: number
  /** Per-group ceiling, messages per minute. */
  readonly groupPerMinute?: number
  /**
   * Overrides for particular methods.
   *
   * A method listed here gets its **own** buckets, so pacing `sendVideo`
   * slowly does not slow `sendMessage` to the same chat. Telegram's own
   * enforcement is method-agnostic, so this is pacing rather than a model of
   * their limits — loosen it only for methods demonstrably outside the message
   * budget.
   */
  readonly perMethod?: Readonly<Record<string, MethodLimits>>
  /** Methods that bypass throttling entirely. */
  readonly exclude?: readonly string[]
  /** Which chat a call targets. Defaults to reading `chat_id`. */
  readonly chatOf?: (method: string, params: Record<string, unknown>) => number | string | undefined
  /**
   * Whether an id names a group or channel.
   *
   * Defaults to Telegram's convention: negative ids are groups and channels.
   */
  readonly isGroup?: (chat: number | string) => boolean
  /**
   * Callers allowed to park on one bucket before {@link ThrottleOptions.mode}
   * applies.
   *
   * Counts callers *waiting*, not the one holding the slot: `maxQueue: 1000`
   * means a thousand may be parked behind whatever is in flight.
   */
  readonly maxQueue?: number
  /**
   * What to do once `maxQueue` is reached.
   *
   * `queue` is patient and correct for a bot answering users. `drop` is for a
   * broadcast script that should fail rather than hold a million pending
   * payloads in memory.
   */
  readonly mode?: 'queue' | 'drop'
  /** Reports waits, so a bot that is constantly pacing is visible. */
  readonly log?: Logger
}

/** Raised when a call arrives at a full queue and the mode is `drop`. */
export class ThrottledError extends YuigramError {
  override readonly name = 'ThrottledError'

  /** The method that was dropped. */
  readonly method: string
  /** Which bucket was full: `global`, `chat:<id>` or `group:<id>`. */
  readonly bucket: string

  constructor(method: string, bucket: string, depth: number) {
    super(
      `${method} was dropped: ${depth} calls are already queued on '${bucket}'. ` +
        `Raise maxQueue, or use mode: 'queue' to wait instead.`,
    )
    this.method = method
    this.bucket = bucket
  }
}

/** What the throttle exposes for instrumentation. */
export interface ThrottleHandle {
  /** Callers parked across every bucket. */
  readonly pending: number
  /** Distinct chat windows currently tracked. */
  readonly chatWindows: number
  /** Distinct group windows currently tracked. */
  readonly groupWindows: number
  /**
   * Buckets holding a FIFO chain.
   *
   * Exposed because it is the state that once outlived its window: a count
   * that keeps climbing while `chatWindows` returns to zero is the leak, and
   * a byte measurement cannot say that.
   */
  readonly trackedQueues: number
  /** Drop windows nothing is using. Happens on acquire; exposed for tests. */
  sweep(): void
}

/** A throttle hook, plus the handle that observes it. */
export interface Throttle {
  /** Install with `bot.hook(...)`. */
  readonly hook: ApiHook
  /** Observe queue depth and tracked windows. */
  readonly handle: ThrottleHandle
}

/**
 * How often idle windows are dropped.
 *
 * Long enough that the scan is never on the hot path, short enough that a
 * broadcast to a million chats does not hold a million windows for long.
 */
const SWEEP_INTERVAL_MS = 30_000

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

    timer.unref?.()

    function onAbort(): void {
      clearTimeout(timer)
      reject(signal?.reason as Error)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Read the chat a call targets from its parameters. */
function defaultChatOf(
  _method: string,
  params: Record<string, unknown>,
): number | string | undefined {
  const value = params['chat_id']
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

/** Telegram's convention: negative ids are groups, supergroups and channels. */
function defaultIsGroup(chat: number | string): boolean {
  return typeof chat === 'number' ? chat < 0 : chat.startsWith('-')
}

/**
 * Build a throttle.
 *
 * ```ts
 * const paced = throttle({ globalPerSecond: 25 })
 * bot.hook(paced.hook)
 *
 * setInterval(() => log.info('queued', { pending: paced.handle.pending }), 5_000)
 * ```
 */
export function throttle(options: ThrottleOptions = {}): Throttle {
  const {
    globalPerSecond = DEFAULT_GLOBAL_PER_SECOND,
    chatPerSecond = DEFAULT_CHAT_PER_SECOND,
    groupPerMinute = DEFAULT_GROUP_PER_MINUTE,
    perMethod = {},
    exclude = DEFAULT_EXCLUDED_METHODS,
    chatOf = defaultChatOf,
    isGroup = defaultIsGroup,
    maxQueue = Number.POSITIVE_INFINITY,
    mode = 'queue',
    log,
  } = options

  const excluded = new Set(exclude)
  const global = createWindow(globalPerSecond, 1_000)
  const windows = new Map<string, SlidingWindow>()
  /** Tail of each bucket's FIFO, so callers wake in the order they arrived. */
  const queues = new Map<string, Promise<void>>()

  /**
   * When the idle windows were last dropped.
   *
   * Sweeping walks every tracked window, so doing it on every call is O(chats)
   * per request — invisible for a bot with ten conversations and a real cost
   * for one with a hundred thousand. Periodic keeps memory bounded without
   * putting a scan on the hot path.
   */
  let lastSweep = 0

  /** The window for a bucket, created on first use. */
  const windowFor = (bucket: string, limit: number, windowMs: number): SlidingWindow => {
    if (bucket === 'global') return global

    let window = windows.get(bucket)
    if (window === undefined) {
      window = createWindow(limit, windowMs)
      windows.set(bucket, window)
    }
    return window
  }

  /**
   * Wait for a slot in one bucket.
   *
   * The FIFO is a promise chain: each caller waits for the one before it, so
   * arrival order is preserved and nothing wakes as a herd.
   */
  const acquire = async (
    bucket: string,
    window: SlidingWindow,
    method: string,
    signal: AbortSignal | undefined,
  ): Promise<void> => {
    // `>` rather than `>=`: the caller currently holding the slot is in flight
    // rather than queued, so a limit of one means one may wait behind it.
    if (mode === 'drop' && window.waiting > maxQueue) {
      throw new ThrottledError(method, bucket, window.waiting)
    }

    const previous = queues.get(bucket) ?? Promise.resolve()

    window.waiting += 1

    const turn = previous.then(async () => {
      for (;;) {
        const now = Date.now()
        const delay = window.delay(now)

        if (delay === 0) {
          window.record(now)
          return
        }

        log?.debug('throttled', { method, bucket, waitMs: delay })
        await sleep(delay, signal)
      }
    })

    // Swallow this caller's failure in the chain so the next one still runs:
    // an aborted request must not wedge the bucket behind it.
    queues.set(
      bucket,
      turn.then(
        () => undefined,
        () => undefined,
      ),
    )

    try {
      await turn
    } finally {
      window.waiting -= 1
    }
  }

  const handle: ThrottleHandle = {
    get pending() {
      let total = global.waiting
      for (const window of windows.values()) total += window.waiting
      return total
    },
    get chatWindows() {
      return [...windows.keys()].filter((key) => key.startsWith('chat:')).length
    },
    get groupWindows() {
      return [...windows.keys()].filter((key) => key.startsWith('group:')).length
    },
    get trackedQueues() {
      return queues.size
    },
    sweep() {
      const now = Date.now()

      for (const [bucket, window] of windows) {
        // A window with nothing in it and nobody waiting is a chat the bot has
        // stopped talking to. Keeping one per chat forever is how a broadcast
        // bot leaks memory.
        if (window.prune(now) || window.waiting > 0) continue

        windows.delete(bucket)

        // The FIFO tail goes with it. Dropping the window while keeping the
        // chain left one settled promise per chat retained for the life of the
        // process — the same leak, one map over. Safe because nothing is
        // waiting on this bucket: a caller that arrived would have been counted
        // in `waiting` above, and one arriving afterwards starts a fresh chain.
        queues.delete(bucket)
      }
    },
  }

  const hook: ApiHook = async (call, next) => {
    if (excluded.has(call.method)) return next()

    const signal = call.options?.signal
    const limits = perMethod[call.method]
    const prefix = limits === undefined ? '' : `${call.method}:`

    await acquire('global', global, call.method, signal)

    const chat = chatOf(call.method, call.params)

    if (chat !== undefined) {
      const group = isGroup(chat)
      const bucket = group ? `group:${prefix}${chat}` : `chat:${prefix}${chat}`

      const window = group
        ? windowFor(bucket, limits?.groupPerMinute ?? groupPerMinute, 60_000)
        : windowFor(bucket, limits?.chatPerSecond ?? chatPerSecond, 1_000)

      await acquire(bucket, window, call.method, signal)
    }

    const now = Date.now()
    if (now - lastSweep > SWEEP_INTERVAL_MS) {
      lastSweep = now
      handle.sweep()
    }

    return next()
  }

  return { hook, handle }
}
