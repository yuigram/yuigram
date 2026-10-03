/**
 * Where a failing bot handler is reported.
 *
 * `app.onError` hears about a client that failed to start or to keep running.
 * A handler that throws while answering an update is the bot's to report, and
 * without a handler of its own the bot logs it with a warning that nobody
 * chose what happens. This chooses: one line per failure, naming the kind of
 * update and the error, and nothing a person wrote — an error's message can
 * quote the text that caused it, and the update is somebody's message.
 */

import type { Bot } from 'yuigram'

/** A failure, by what it is rather than by what it says. */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return typeof error

  const code = (error as { code?: unknown }).code

  return typeof code === 'number' || typeof code === 'string'
    ? `${error.name} (${code})`
    : error.name
}

/** Report each failing bot handler once, through `write`. */
export function reportBotErrors(bot: Bot, write: (line: string) => void): void {
  bot.onError((error, context) => {
    const kind = typeof context.kind === 'string' ? context.kind : 'an update'
    const update = typeof context.updateId === 'number' ? ` ${context.updateId}` : ''
    write(`[bot] a handler failed on ${kind}${update}: ${describeFailure(error)}`)
  })
}
