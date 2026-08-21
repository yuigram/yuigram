/**
 * The registrations that match as well as select.
 *
 * `onText`, `onCommand` and `onCallbackQuery` are the three that cannot be
 * generated: each inspects the update it was handed and declines it unless the
 * content matches, which is also what earns the narrower context — `text` is a
 * `string` inside `onText` because the registration proved it.
 *
 * They live here rather than on the client because a `Router` offers the same
 * three, and the command rule in particular is one that must exist exactly
 * once. In a group `/start` is addressed to every bot present while
 * `/start@otherbot` is addressed to exactly one, so a second implementation
 * that forgot the suffix check would answer messages meant for someone else —
 * quietly, and only in groups.
 */

import type { AnyFilter } from '@yuigram/core'
import { addressedToUs, commandMatches, parseCommand } from './command.js'
import type { CallbackQueryContext, CommandContext, TextMessageContext } from './events/index.js'
import { MESSAGE_KINDS } from './generated/events.js'

/** A handler as the registration layer sees it, before the caller's types. */
type RawHandler = (context: never) => unknown

/**
 * What a registration needs from whatever it is registering onto.
 *
 * A `Bot` and a `Router` differ in everything except this: somewhere to put a
 * handler, and a way to find out which bot is running. The username is read
 * through a function because it arrives from `getMe` after registration —
 * a router installed on a client that has not identified itself yet still has
 * to get the mention check right once it has.
 */
export interface RegistrationTarget {
  /** Register a handler against a kind, a list of kinds, or a filter. */
  register(match: string | readonly string[] | AnyFilter, handler: RawHandler): void
  /** The running bot's username, once known. */
  username(): string | undefined
}

/** Register a text handler, optionally matching the text itself. */
export function registerText(
  target: RegistrationTarget,
  match: string | RegExp | undefined,
  handler: (context: TextMessageContext) => unknown,
): void {
  target.register(MESSAGE_KINDS, ((context: TextMessageContext) => {
    const text = (context as { text?: unknown }).text
    if (typeof text !== 'string') return

    if (match !== undefined) {
      const matched = typeof match === 'string' ? text === match : match.test(text)
      if (!matched) return
    }

    return handler(context)
  }) as RawHandler)
}

/** Register a command handler. */
export function registerCommand(
  target: RegistrationTarget,
  match: string | RegExp,
  handler: (context: CommandContext) => unknown,
): void {
  target.register(MESSAGE_KINDS, ((context: CommandContext) => {
    const text = (context as { text?: unknown }).text
    if (typeof text !== 'string') return

    const parsed = parseCommand(text)
    if (parsed === undefined) return
    if (!commandMatches(parsed, match)) return
    if (!addressedToUs(parsed, target.username())) return

    // Derived rather than assigned: writing onto the shared context would leave
    // `command` visible to every later handler for this update, including ones
    // that have nothing to do with commands.
    const withCommand = Object.create(context as object, {
      command: { value: parsed, enumerable: true },
    }) as CommandContext

    return handler(withCommand)
  }) as RawHandler)
}

/** Register a callback-query handler, optionally matching the data. */
export function registerCallbackQuery(
  target: RegistrationTarget,
  match: string | RegExp | undefined,
  handler: (context: CallbackQueryContext) => unknown,
): void {
  target.register('callback_query', ((context: CallbackQueryContext) => {
    if (match === undefined) return handler(context)

    const data = context.data
    if (typeof data !== 'string') return

    const matched = typeof match === 'string' ? data === match : match.test(data)
    if (!matched) return

    return handler(context)
  }) as RawHandler)
}
