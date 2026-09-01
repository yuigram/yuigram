/**
 * Scheduling Bot API updates.
 *
 * The mechanism is transport-neutral and lives in the core package; what stays
 * here is the one thing that is not — how an update names the conversation it
 * belongs to.
 */

import { createScheduler as build, type Scheduler, type SchedulerOptions } from '@yuigram/core'
import type { Update } from './generated/types/index.js'

export type { DrainOptions, Scheduler } from '@yuigram/core'

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

/** Options for {@link createScheduler}, whose key defaults to the chat. */
export type UpdateSchedulerOptions = Omit<SchedulerOptions<Update>, 'keyOf'> & {
  /** How an update names what it must stay ordered behind. Defaults to the chat. */
  readonly keyOf?: (update: Update) => string | undefined
}

/**
 * Build a scheduler for Bot API updates.
 *
 * Supplies {@link chatKeyOf} so a caller that wants the ordinary behaviour does
 * not have to know how an update names its conversation.
 */
export function createScheduler(options: UpdateSchedulerOptions): Scheduler<Update> {
  return build<Update>({ ...options, keyOf: options.keyOf ?? chatKeyOf })
}
