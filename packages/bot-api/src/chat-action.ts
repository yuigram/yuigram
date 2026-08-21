/**
 * Keeping "typing…" visible while work happens.
 *
 * Telegram clears a chat action after five seconds, so anything slower than
 * that needs the action re-sent — which turns a one-line courtesy into a timer,
 * a cleanup path and an error case that must not take the handler down with it.
 *
 * ```ts
 * bot.onCommand('report', async (message) => {
 *   await withChatAction(message, 'typing', async () => {
 *     const report = await buildReport()      // takes twelve seconds
 *     await message.reply(report)
 *   })
 * })
 * ```
 *
 * The action stops when the work settles, including when it throws.
 */

import type { RawApi } from './api.js'

/** Telegram clears an action after five seconds; re-send comfortably inside that. */
const REFRESH_MS = 4_000

/** What sending a chat action needs. */
export interface ChatActionTarget {
  readonly api: RawApi
  readonly chat: { readonly id: number | string }
  readonly message_thread_id?: number | undefined
  readonly business_connection_id?: string | undefined
}

/** Options for {@link chatAction}. */
export interface ChatActionOptions {
  /** How often to re-send, in milliseconds. Rarely worth changing. */
  readonly intervalMs?: number
  /** Called when a refresh fails, instead of letting it reach the handler. */
  readonly onError?: (error: unknown) => void
}

/** A running chat action. */
export interface RunningChatAction {
  /** Stop re-sending. Safe to call more than once. */
  stop(): void
  /** Whether it is still refreshing. */
  readonly active: boolean
}

/**
 * Start sending a chat action, and keep sending it.
 *
 * Prefer {@link withChatAction} where the work is a single expression: it
 * cannot be left running by an early return or a thrown error.
 */
export function chatAction(
  target: ChatActionTarget,
  action: string,
  options: ChatActionOptions = {},
): RunningChatAction {
  const { intervalMs = REFRESH_MS, onError } = options
  let stopped = false

  const params = {
    chat_id: target.chat.id,
    action,
    ...(target.message_thread_id === undefined
      ? {}
      : { message_thread_id: target.message_thread_id }),
    ...(target.business_connection_id === undefined
      ? {}
      : { business_connection_id: target.business_connection_id }),
  }

  const send = (): void => {
    if (stopped) return

    // A failed refresh must not reach the handler: the action is a courtesy,
    // and losing it is not a reason to fail the work it was decorating.
    void (target.api.sendChatAction(params as never) as Promise<unknown>).catch(
      (error: unknown) => {
        onError?.(error)
      },
    )
  }

  send()

  const timer = setInterval(send, intervalMs)
  // A repeating courtesy must not hold the process open on its own.
  timer.unref?.()

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
    get active() {
      return !stopped
    },
  }
}

/**
 * Show a chat action for as long as the work runs.
 *
 * The action stops when `work` settles, whether it returns or throws, so there
 * is no path that leaves a bot typing forever.
 */
export async function withChatAction<T>(
  target: ChatActionTarget,
  action: string,
  work: () => Promise<T>,
  options: ChatActionOptions = {},
): Promise<T> {
  const running = chatAction(target, action, options)

  try {
    return await work()
  } finally {
    running.stop()
  }
}
