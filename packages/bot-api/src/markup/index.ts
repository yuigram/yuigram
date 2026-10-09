// SPDX-License-Identifier: MPL-2.0

/**
 * Formatted text for the Bot API: build it, read markup into it, send it.
 *
 * ```ts
 * import { bold, format, link } from 'yuigram/markup'
 *
 * const line = format`${bold(order.title)} is ready — ${link(order.url)('track it')}`
 * await bot.api.sendMessage({ chat_id, ...line.as('text') })
 * await bot.api.sendPhoto({ chat_id, photo, ...line.as('caption') })
 * ```
 *
 * A separate entry point, so a bot that never formats anything never loads it.
 * Everything but the plugin is the transport-neutral layer in
 * `@yuigram/core/format`; what this adds is knowing where the Bot API takes
 * formatted text.
 */

import { ValidationError } from '@yuigram/core'
import { Formatted, type FormattedLike, isFormattedLike } from '@yuigram/core/format'
import type { ApiHook } from '../api.js'
import { FORMATTABLE, type FormattableSlot } from '../generated/formattable.js'

export * from '@yuigram/core/format'
export { FORMATTABLE, type FormattableSlot }

/** The field a pair's parse mode sits in, when it has one. */
function parseModeOf(field: string): string {
  return field === 'text' || field === 'caption' || field === 'message_text'
    ? 'parse_mode'
    : `${field}_parse_mode`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Replace a formatted value at one slot with its two fields, copying on the way down. */
function rewrite(
  container: unknown,
  path: readonly string[],
  slot: FormattableSlot,
  method: string,
): unknown {
  if (path.length === 0) {
    if (!isRecord(container)) return container
    const value = container[slot.text]
    if (typeof value === 'string' || !isFormattedLike(value)) return container

    if (container[slot.entities] !== undefined) {
      throw new ValidationError(
        `${method}: '${slot.text}' is formatted and '${slot.entities}' is also given; pass one`,
      )
    }
    if (container[parseModeOf(slot.text)] !== undefined) {
      throw new ValidationError(
        `${method}: '${slot.text}' is formatted, so '${parseModeOf(slot.text)}' has nothing to parse`,
      )
    }

    const formatted = Formatted.from(value as FormattedLike)

    return {
      ...container,
      [slot.text]: formatted.text,
      [slot.entities]: formatted.entities.map((entity) => ({ ...entity })),
    }
  }

  const [step, ...rest] = path as [string, ...string[]]

  if (step === '*') {
    if (!Array.isArray(container)) return container
    let changed = false
    const next = container.map((item) => {
      const updated = rewrite(item, rest, slot, method)
      if (updated !== item) changed = true

      return updated
    })

    return changed ? next : container
  }

  if (!isRecord(container) || !(step in container)) return container
  const inner = container[step]
  const updated = rewrite(inner, rest, slot, method)

  return updated === inner ? container : { ...container, [step]: updated }
}

/**
 * The parameters of a call with every formatted value turned into its pair of
 * fields. The caller's objects are copied where they change, never mutated.
 */
export function unwrapFormatted(
  method: string,
  params: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  let out = params as Record<string, unknown>
  for (const slot of FORMATTABLE[method] ?? []) {
    out = rewrite(out, slot.path, slot, method) as Record<string, unknown>
  }

  return out
}

/**
 * A hook that lets any call carry a formatted value where Telegram takes text
 * and its ranges as two fields — a message's text, a caption, a poll's
 * question and options, an inline result, a reply's quote.
 *
 * ```ts
 * bot.hook(formattedParams())
 * await bot.api.sendPoll({ chat_id, question: bold('Lunch?') as never, options })
 * ```
 *
 * The generated types name these fields `string`, so passing a formatted value
 * in them needs a cast; {@link Formatted.as} gives both fields with their types
 * and needs none. The hook is for payloads assembled dynamically.
 */
export function formattedParams(): ApiHook {
  return async (call, next) => {
    if (FORMATTABLE[call.method] !== undefined)
      call.params = unwrapFormatted(call.method, call.params)

    return await next()
  }
}

/** The same hook, as a plugin: `bot.extend(markup())`. */
export function markup(): {
  readonly name: 'markup'
  install(target: { hook(hook: ApiHook): unknown }): void
} {
  return {
    name: 'markup',
    install(target) {
      target.hook(formattedParams())
    },
  }
}
