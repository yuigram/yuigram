/**
 * Command parsing and routing.
 *
 * Telegram commands look simple and are not. In a group, `/start` is addressed
 * to every bot present, while `/start@otherbot` is addressed to exactly one —
 * so a bot that ignores the suffix answers messages meant for someone else,
 * which is the single most common bug in hand-rolled command handling.
 *
 * The rule this implements:
 *
 * - `/start` — matches, whichever bot is running.
 * - `/start@thisbot` — matches only when the suffix names us.
 * - `/start@otherbot` — never matches.
 * - Unknown username (before `getMe` resolves) — a suffixed command cannot be
 *   confirmed as ours, so it does not match. Answering a command possibly meant
 *   for another bot is worse than missing one.
 */

/**
 * A parsed command.
 *
 * `/give 10 gold` yields name `give`, args `['10', 'gold']`, and the raw
 * argument text `10 gold`.
 */
export interface ParsedCommand {
  /** Command name, without the slash or the `@bot` suffix. */
  readonly name: string
  /** The `@bot` suffix, when present. */
  readonly mention: string | undefined
  /** Everything after the command, unsplit. */
  readonly rest: string
  /** `rest` split on whitespace, empty when there is none. */
  readonly args: readonly string[]
}

/**
 * Matches a leading command.
 *
 * A newline terminates the name just as a space does, since Telegram allows
 * `/start` on its own line followed by a body.
 */
const COMMAND = /^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:[\s]+([\s\S]*))?$/

/** Parse a leading command from message text, or `undefined` if there is none. */
export function parseCommand(text: string | undefined): ParsedCommand | undefined {
  if (text === undefined) return undefined

  const match = COMMAND.exec(text.trim())
  if (match === null) return undefined

  const [, name, mention, rest = ''] = match
  if (name === undefined) return undefined

  return {
    name,
    mention,
    rest: rest.trim(),
    args: rest.trim() === '' ? [] : rest.trim().split(/\s+/),
  }
}

/**
 * Whether a parsed command is addressed to this bot.
 *
 * An unsuffixed command is addressed to everyone. A suffixed one is addressed
 * to exactly one bot, and is only ours if the names match — compared
 * case-insensitively, since Telegram usernames are.
 */
export function addressedToUs(parsed: ParsedCommand, username: string | undefined): boolean {
  if (parsed.mention === undefined) return true
  if (username === undefined) return false

  return parsed.mention.toLowerCase() === username.toLowerCase()
}

/** Whether a parsed command matches a name or pattern. */
export function commandMatches(parsed: ParsedCommand, match: string | RegExp): boolean {
  if (typeof match === 'string') {
    // Accept the name with or without a leading slash, since both read
    // naturally at a call site.
    const wanted = match.startsWith('/') ? match.slice(1) : match
    return parsed.name.toLowerCase() === wanted.toLowerCase()
  }

  return match.test(parsed.name)
}
