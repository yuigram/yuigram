// SPDX-License-Identifier: MPL-2.0

/**
 * What a refused request is raised as.
 *
 * Kept apart from the session dispatcher that produces these, so that naming
 * one — `error instanceof RpcError` in an application — loads a few classes
 * rather than the session layer, which is loaded only once an account speaks
 * to a datacenter.
 */

import { type ErrorOptions, FloodError, SessionError, TelegramError } from '../core.js'
import type { DocumentedErrorPattern, DocumentedErrorText } from '../generated/errors.js'
import type { TlValue } from '../tl/index.js'

/**
 * A name to match a refusal against: exact, or with `%d` where it carries a
 * number.
 *
 * The names Telegram's method pages list are offered as completions, and any
 * other string is accepted — the pages are not a complete list, and a name
 * that is not on them is still a name Telegram sends.
 */
export type RpcErrorPattern = DocumentedErrorPattern | (string & Record<never, never>)

/**
 * What a refusal's `text` can be: a documented name with its number in place,
 * or any other.
 */
export type RpcErrorText = DocumentedErrorText | (string & Record<never, never>)

/**
 * The text a pattern stands for: `` `FLOOD_WAIT_${number}` `` for
 * `'FLOOD_WAIT_%d'`, and the name itself for one with no `%d`.
 */
export type RpcErrorTextOf<Pattern extends string> = Pattern extends `${infer Head}%d${infer Tail}`
  ? `${Head}${number}${RpcErrorTextOf<Tail>}`
  : Pattern

/**
 * An error naming how many seconds to wait before trying again.
 *
 * The Bot API decides this by whether a retry delay was supplied at all rather
 * than by which error carried it, and reports slow mode the same way it reports
 * a flood. Matching the shape rather than one name is what keeps the two
 * transports agreeing: `FLOOD_WAIT_30` and `SLOWMODE_WAIT_30` mean the same
 * thing to a caller as a `429` with `retry_after` does.
 */
const WAIT_ERROR = /^[A-Z0-9]+(?:_[A-Z0-9]+)*_WAIT_(\d+)$/

/**
 * The refusals that name a datacenter instead of a problem.
 *
 * Five errors say the same thing in different words: what was asked for lives
 * somewhere else. The number is the datacenter it lives at, and it is the whole
 * content of the answer — a caller that cannot read it has been told nothing it
 * can act on.
 */
const MIGRATE_ERROR = /^(PHONE|NETWORK|USER|FILE|STATS)_MIGRATE_(\d+)$/

/**
 * Which of the five redirections a datacenter asked for.
 *
 * An account follows `user` and `network` by itself, and a transfer follows
 * `file`; `phone` belongs to signing in, and `stats` — a channel whose
 * statistics are kept at another datacenter — reaches only a raw call, which
 * reads `dcId` and decides.
 */
export type MigrationKind = 'phone' | 'network' | 'user' | 'file' | 'stats'

/**
 * The datacenter refused a request because it belongs somewhere else.
 *
 * Not a failure of the request so much as an address for it. The four kinds
 * differ in what has moved rather than in what the client is told: an account
 * that lives elsewhere, a network that suggests elsewhere, an account that has
 * been moved, a file that is stored elsewhere. Each names the datacenter to use
 * instead, and that number is kept as a number — a redirection a caller has to
 * read out of a message is one it cannot act on without matching text.
 *
 * What to do about it is deliberately not decided here. Following a redirection
 * means reaching another datacenter, and for an account it means carrying the
 * authorization across; both belong to layers that know why the call was being
 * made.
 */
/**
 * A request Telegram refused, with what it said.
 *
 * `text` is Telegram's own name for the failure — `CHANNEL_PRIVATE`,
 * `PASSWORD_TOO_FRESH_3600` — and `code` the number beside it. A name that ends
 * in a number carries it as `parameter`, so that number is read once here
 * rather than parsed again by every caller. The `rpc_error` as it arrived is the
 * cause.
 *
 * ```ts
 * try {
 *   await account.sendText(chat, text)
 * } catch (error) {
 *   if (error instanceof RpcError && error.is('CHAT_WRITE_FORBIDDEN')) forget(chat)
 *   else if (error instanceof RpcError && error.is('PASSWORD_TOO_FRESH_%d')) later(error.parameter)
 *   else throw error
 * }
 * ```
 *
 * One class rather than one per name: the names are Telegram's vocabulary and
 * grow with it, and a class per name would be a release per word. Two kinds of
 * refusal become something more specific: any `*_WAIT_N` becomes `FloodError`,
 * the type both transports share, keeping its name on its cause; and a
 * redirection becomes {@link MigrationError}, which is one of these.
 */
export class RpcError extends TelegramError {
  override readonly name: string = 'RpcError'

  /** Telegram's error code: 400, 403, 420 and so on. */
  readonly code: number

  /**
   * Telegram's name for the failure, exactly as sent.
   *
   * Typed so that the documented names complete; narrowed by {@link RpcError.is}
   * to the name matched.
   */
  readonly text: RpcErrorText

  /**
   * The number a name carries: `3600` in `PASSWORD_TOO_FRESH_3600`, `2` in
   * `INTERDC_2_CALL_ERROR`, `5` in `FILE_REFERENCE_5_EXPIRED`.
   *
   * The one part of the name, between underscores or at an end, that is all
   * digits. `undefined` for a name with none, and for a name with more than one,
   * which cannot say which it means; {@link RpcError.argument} reads a number
   * written into a name any other way.
   */
  readonly parameter: number | undefined

  constructor(
    message: string,
    options: ErrorOptions & { method?: string; code: number; text: string },
  ) {
    super(message, {
      ...(options.method === undefined ? {} : { method: options.method }),
      ...(options.cause === undefined ? {} : { cause: options.cause }),
    })
    this.code = options.code
    this.text = options.text
    const numbers = options.text.split('_').filter((part) => /^\d+$/.test(part))
    this.parameter = numbers.length === 1 ? Number(numbers[0]) : undefined
  }

  /** Telegram's codes, as its error reference names them. */
  static readonly SEE_OTHER = 303
  static readonly BAD_REQUEST = 400
  static readonly UNAUTHORIZED = 401
  static readonly FORBIDDEN = 403
  static readonly NOT_FOUND = 404
  static readonly NOT_ACCEPTABLE = 406
  static readonly FLOOD = 420
  static readonly INTERNAL = 500

  /**
   * The number where `pattern` has `%d`, if the name fits it.
   *
   * For a number the name writes into a word — `5` in
   * `PREVIOUS_CHAT_IMPORT_ACTIVE_WAIT_5MIN` read with
   * `'PREVIOUS_CHAT_IMPORT_ACTIVE_WAIT_%dMIN'` — as well as one of its own.
   */
  argument(pattern: RpcErrorPattern): number | undefined {
    const found = patternOf(pattern).exec(this.text)
    return found?.[1] === undefined ? undefined : Number(found[1])
  }

  /**
   * Whether Telegram named this failure `pattern`.
   *
   * Exact, or with `%d` standing for the number a name ends in:
   * `'FILE_MIGRATE_%d'`, `'SLOWMODE_WAIT_%d'`. Where it did, `text` is known to
   * be that name from then on.
   */
  is<const Pattern extends RpcErrorPattern>(
    pattern: Pattern,
  ): this is this & { readonly text: RpcErrorTextOf<Pattern> } {
    return matchesName(this.text, pattern)
  }
}

/** A name pattern, `%d` standing for one number, as a regular expression that captures it. */
function patternOf(pattern: string): RegExp {
  const source = pattern
    .split('%d')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('(\\d+)')
  return new RegExp(`^${source}$`)
}

/** Whether an error name fits a pattern where `%d` stands for a number. */
function matchesName(text: string, pattern: string): boolean {
  if (!pattern.includes('%d')) return text === pattern
  return patternOf(pattern).test(text)
}

/**
 * Whether an error is a refusal Telegram named `pattern` — exactly, or with
 * `%d` for the number a name ends in.
 *
 * Reads waits too, which are raised as the shared `FloodError` and keep
 * Telegram's name on their cause, so `isRpcError(error, 'SLOWMODE_WAIT_%d')` and
 * `isRpcError(error, 'FLOOD_WAIT_%d')` tell a slow chat from a flood.
 */
export function isRpcError(error: unknown, pattern: RpcErrorPattern): error is TelegramError {
  if (error instanceof RpcError) return error.is(pattern)
  const cause = (error as { readonly cause?: unknown } | undefined)?.cause as
    | { readonly _?: unknown; readonly error_message?: unknown }
    | undefined
  return (
    error instanceof TelegramError &&
    cause?._ === 'rpc_error' &&
    typeof cause.error_message === 'string' &&
    matchesName(cause.error_message, pattern)
  )
}

export class MigrationError extends RpcError {
  override readonly name = 'MigrationError'

  /** What the datacenter said has moved. */
  readonly kind: MigrationKind

  /** The datacenter to use instead. */
  readonly dcId: number

  constructor(
    message: string,
    options: ErrorOptions & {
      method?: string
      kind: MigrationKind
      dcId: number
      code?: number
      text?: string
    },
  ) {
    super(message, {
      ...(options.method === undefined ? {} : { method: options.method }),
      ...(options.cause === undefined ? {} : { cause: options.cause }),
      code: options.code ?? 303,
      text: options.text ?? `${options.kind.toUpperCase()}_MIGRATE_${options.dcId}`,
    })
    this.kind = options.kind
    this.dcId = options.dcId
  }
}

/**
 * The error a failed request should raise.
 *
 * A wait is the one failure both transports report and both callers handle the
 * same way, so it becomes the type they share. Everything else keeps the name
 * Telegram gave it: a caller matching on `CHANNEL_PRIVATE` needs to see
 * `CHANNEL_PRIVATE`.
 */
export function rpcErrorToException(value: TlValue, method?: string): TelegramError {
  const code = errorCode(value)
  const text = value['error_message']
  const description = typeof text === 'string' ? text : ''
  const message = `${description || 'request failed'} (${code})`

  const migrate = MIGRATE_ERROR.exec(description)
  if (migrate !== null) {
    return new MigrationError(message, {
      kind: (migrate[1] ?? '').toLowerCase() as MigrationKind,
      dcId: Number(migrate[2]),
      code,
      text: description,
      cause: value,
      ...(method === undefined ? {} : { method }),
    })
  }

  const flood = WAIT_ERROR.exec(description)
  if (flood !== null) {
    return new FloodError(message, {
      retryAfter: Number(flood[1]),
      cause: value,
      ...(method === undefined ? {} : { method }),
    })
  }

  return new RpcError(message, {
    code,
    text: description,
    cause: value,
    ...(method === undefined ? {} : { method }),
  })
}

/** The error code of an `rpc_error`, which must be a 32-bit integer. */
function errorCode(value: TlValue): number {
  const raw = value['error_code']
  if (typeof raw !== 'number') {
    throw new SessionError(`'${value._}.error_code' must be a 32-bit integer`)
  }
  return raw
}
