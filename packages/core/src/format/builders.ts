// SPDX-License-Identifier: MIT

/**
 * Building formatted text out of parts, with no markup in between.
 *
 * ```ts
 * format`${bold('Order #42')} is ready. ${link('https://example.com/42')('Track it')}`
 * bold.italic`both at once`
 * join(names.map((name) => mentionUser(name.first, name.id)), ', ')
 * ```
 *
 * Nothing here parses. The literal parts of a template are text, interpolated
 * strings are text, and the only formatting is what a builder added — so a
 * value a user supplied can never turn into formatting, whatever characters it
 * holds.
 */

import { ValidationError } from '../errors/errors.js'
import { type Entity, type EntityType, type EntityUser, QUOTES, VERBATIM } from './entities.js'
import { type Content, Formatted } from './formatted.js'

/** Whether an argument list is a tagged-template call. */
function isTemplate(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw)
}

/**
 * Compose a template: literal parts are text, values are content.
 *
 * ```ts
 * format`Hello, ${bold(name)}!`
 * ```
 */
export function format(strings: TemplateStringsArray, ...values: readonly Content[]): Formatted {
  const parts: Content[] = []

  strings.forEach((literal, index) => {
    parts.push(literal)
    if (index < values.length) parts.push(values[index])
  })

  return Formatted.concat(...parts)
}

/**
 * The same, with the template's common indentation removed.
 *
 * For a message written as an indented block in code: the first and last
 * lines, when blank, are dropped, and the indentation every other line shares
 * is taken off. Only the literal parts are touched; an interpolated value keeps
 * its own whitespace.
 */
export function formatDedent(
  strings: TemplateStringsArray,
  ...values: readonly Content[]
): Formatted {
  const literals = [...strings]
  const joined = literals.join('\u0000')
  const lines = joined.split('\n')

  let indent = Number.POSITIVE_INFINITY
  for (const line of lines.slice(1)) {
    if (line.trim().length === 0) continue
    const leading = /^[ \t]*/.exec(line)?.[0].length ?? 0
    indent = Math.min(indent, leading)
  }
  if (!Number.isFinite(indent)) indent = 0

  let dedented = lines
    .map((line, index) => (index === 0 ? line : line.slice(Math.min(indent, leadingOf(line)))))
    .join('\n')
  dedented = dedented.replace(/^[ \t]*\n/, '').replace(/\n[ \t]*$/, '')

  return format(
    Object.assign(dedented.split('\u0000'), { raw: dedented.split('\u0000') }),
    ...values,
  )
}

function leadingOf(line: string): number {
  return /^[ \t]*/.exec(line)?.[0].length ?? 0
}

/** Parts one after another, with a separator between, and empty parts left out. */
export function join(parts: readonly Content[], separator: Content = ''): Formatted {
  const kept = parts.filter((part) => part !== null && part !== undefined && part !== false)
  const out: Content[] = []

  kept.forEach((part, index) => {
    if (index > 0) out.push(separator)
    out.push(part)
  })

  return Formatted.concat(...out)
}

/** What a builder's content arguments are, as one value. */
function contentOf(args: readonly unknown[]): Formatted {
  const [first, ...rest] = args
  if (isTemplate(first)) return format(first, ...(rest as Content[]))

  return Formatted.from(first as Content)
}

/**
 * The inner ranges a new range may not hold.
 *
 * Telegram refuses formatting inside code, and a quotation inside a
 * quotation. Rather than build something the server rejects, the inner ranges
 * are dropped and the text stays.
 */
function containable(inner: Formatted, outer: EntityType): Formatted {
  if (VERBATIM.has(outer)) return new Formatted(inner.text)
  if (QUOTES.has(outer)) {
    return new Formatted(
      inner.text,
      inner.entities.filter((entity) => !QUOTES.has(entity.type)),
    )
  }

  return inner
}

/** Put one range over all of some content. */
function wrapped(
  inner: Formatted,
  type: EntityType,
  details: Omit<Entity, 'type' | 'offset' | 'length'> = {},
): Formatted {
  return containable(inner, type).wrap(type, details)
}

/** A builder taking content: a string, a value, or a template. */
export interface Wrap {
  (content: Content): Formatted
  (strings: TemplateStringsArray, ...values: readonly Content[]): Formatted
}

/** Build a {@link Wrap} for one kind of range. */
function wrapWith(
  type: EntityType,
  details: Omit<Entity, 'type' | 'offset' | 'length'> = {},
): Wrap {
  return (...args: unknown[]) => wrapped(contentOf(args), type, details)
}

/* -------------------------------------------------------------------------- */
/* Modifiers, which chain                                                      */
/* -------------------------------------------------------------------------- */

/** The simple styles, which take nothing but content and combine by chaining. */
const MODIFIERS = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strikethrough',
  spoiler: 'spoiler',
  blockquote: 'blockquote',
  expandableBlockquote: 'expandable_blockquote',
  code: 'code',
} as const satisfies Record<string, EntityType>

/** The names a modifier chains through. */
export type ModifierName = keyof typeof MODIFIERS

/** A style, callable on content and chainable into another: `bold.italic('x')`. */
export type Modifier = Wrap & { readonly [K in ModifierName]: Modifier }

function modifier(chain: readonly EntityType[]): Modifier {
  const apply: Wrap = (...args: unknown[]) => {
    let value = contentOf(args)
    // Innermost first, so each outer range is checked against what it holds.
    for (const type of [...chain].reverse()) value = wrapped(value, type)

    return value
  }

  const cache = new Map<ModifierName, Modifier>()
  for (const name of Object.keys(MODIFIERS) as ModifierName[]) {
    Object.defineProperty(apply, name, {
      enumerable: false,
      get: () => {
        let next = cache.get(name)
        if (next === undefined) {
          next = modifier([...chain, MODIFIERS[name]])
          cache.set(name, next)
        }

        return next
      },
    })
  }

  return apply as Modifier
}

export const bold: Modifier = modifier(['bold'])
export const italic: Modifier = modifier(['italic'])
export const underline: Modifier = modifier(['underline'])
export const strikethrough: Modifier = modifier(['strikethrough'])
export const spoiler: Modifier = modifier(['spoiler'])
/** A quotation. Telegram does not nest quotations, so an inner one is dropped. */
export const blockquote: Modifier = modifier(['blockquote'])
/** A quotation shown collapsed until it is tapped. */
export const expandableBlockquote: Modifier = modifier(['expandable_blockquote'])
/** Inline code. Formatting inside code is dropped, since Telegram refuses it. */
export const code: Modifier = modifier(['code'])

/* -------------------------------------------------------------------------- */
/* Ranges that carry details                                                   */
/* -------------------------------------------------------------------------- */

function requireText(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${what} must be a non-empty string`)
  }

  return value
}

function requireUserId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError('a user id is a positive integer')
  }

  return value
}

/**
 * A link. `link(url)` is a builder; `link(content, url)` builds at once.
 *
 * ```ts
 * link('https://example.com')`the site`
 * link('the site', 'https://example.com')
 * ```
 */
export function link(url: string): Wrap
export function link(content: Content, url: string): Formatted
export function link(first: unknown, second?: unknown): Wrap | Formatted {
  if (second === undefined) return wrapWith('text_link', { url: requireText(first, 'a link') })

  return wrapped(Formatted.from(first as Content), 'text_link', {
    url: requireText(second, 'a link'),
  })
}

/** A mention of a person by who they are, which works without a username. */
export function textMention(user: EntityUser): Wrap
export function textMention(content: Content, user: EntityUser): Formatted
export function textMention(first: unknown, second?: unknown): Wrap | Formatted {
  if (second === undefined) {
    const user = first as EntityUser
    requireUserId(user?.id)

    return wrapWith('text_mention', { user })
  }

  requireUserId((second as EntityUser)?.id)

  return wrapped(Formatted.from(first as Content), 'text_mention', { user: second as EntityUser })
}

/** A mention of a person by id alone; the text shown doubles as their name. */
export function mentionUser(id: number): Wrap
export function mentionUser(content: Content, id: number): Formatted
export function mentionUser(first: unknown, second?: unknown): Wrap | Formatted {
  return mentionOf(first, second, false)
}

/** A mention of a bot by id. */
export function mentionBot(id: number): Wrap
export function mentionBot(content: Content, id: number): Formatted
export function mentionBot(first: unknown, second?: unknown): Wrap | Formatted {
  return mentionOf(first, second, true)
}

function mentionOf(first: unknown, second: unknown, isBot: boolean): Wrap | Formatted {
  const build = (inner: Formatted, id: number): Formatted =>
    wrapped(inner, 'text_mention', {
      user: { id: requireUserId(id), is_bot: isBot, first_name: inner.text },
    })

  if (second === undefined) {
    const id = requireUserId(first)

    return ((...args: unknown[]) => build(contentOf(args), id)) as Wrap
  }

  return build(Formatted.from(first as Content), second as number)
}

/** A custom emoji. The text is what shows where the emoji cannot. */
export function customEmoji(id: string): Wrap
export function customEmoji(content: Content, id: string): Formatted
export function customEmoji(first: unknown, second?: unknown): Wrap | Formatted {
  const idOf = (value: unknown): string => {
    const id = requireText(value, 'a custom emoji id')
    if (!/^\d+$/.test(id)) throw new ValidationError('a custom emoji id is a string of digits')

    return id
  }

  if (second === undefined) return wrapWith('custom_emoji', { custom_emoji_id: idOf(first) })

  return wrapped(Formatted.from(first as Content), 'custom_emoji', {
    custom_emoji_id: idOf(second),
  })
}

/**
 * A code block. `pre()` is a builder; `pre(text, language)` builds at once.
 *
 * Formatting inside is dropped, since Telegram shows a code block verbatim.
 */
export function pre(): Wrap
export function pre(content: Content, language?: string): Formatted
export function pre(strings: TemplateStringsArray, ...values: readonly Content[]): Formatted
export function pre(...args: unknown[]): Wrap | Formatted {
  if (args.length === 0) return wrapWith('pre')

  const [first, second] = args
  if (isTemplate(first)) return wrapped(contentOf(args), 'pre')

  const language = second === undefined ? {} : { language: requireText(second, 'a language') }

  return wrapped(Formatted.from(first as Content), 'pre', language)
}

/** How a moment is shown, by name. */
export interface TimeFormat {
  /** "in 5 minutes", "2 days ago". Combines with nothing else. */
  readonly relative?: boolean
  /** The day of the week. */
  readonly weekday?: boolean
  /** The date: `short` like 17.03.22, `long` like March 17, 2022. */
  readonly dateStyle?: 'short' | 'long'
  /** The time: `short` like 22:45, `long` like 22:45:00. */
  readonly timeStyle?: 'short' | 'long'
}

/**
 * The format string Telegram reads: `r`, or `w`, `d`/`D` and `t`/`T` in that
 * order. Refuses a relative moment combined with anything else.
 */
export function composeTimeFormat(options: TimeFormat): string {
  if (options.relative === true) {
    if (
      options.weekday === true ||
      options.dateStyle !== undefined ||
      options.timeStyle !== undefined
    ) {
      throw new ValidationError('a relative time cannot also show a weekday, a date or a time')
    }

    return 'r'
  }

  return (
    (options.weekday === true ? 'w' : '') +
    (options.dateStyle === 'short' ? 'd' : options.dateStyle === 'long' ? 'D' : '') +
    (options.timeStyle === 'short' ? 't' : options.timeStyle === 'long' ? 'T' : '')
  )
}

function unixOf(when: unknown): number {
  const seconds = when instanceof Date ? Math.floor(when.getTime() / 1000) : when
  if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds)) {
    throw new ValidationError('a moment is a Date or whole seconds since the epoch')
  }

  return seconds
}

function timeDetails(when: unknown, options: TimeFormat | undefined) {
  const formatted = options === undefined ? '' : composeTimeFormat(options)

  return {
    unix_time: unixOf(when),
    ...(formatted === '' ? {} : { date_time_format: formatted }),
  }
}

/**
 * A moment each reader sees in their own time zone and language.
 *
 * `time(when, format)` is a builder; `time(content, when, format)` builds at
 * once. The text is what shows where the moment cannot be rendered.
 */
export function time(when: number | Date, options?: TimeFormat): Wrap
export function time(content: Content, when: number | Date, options?: TimeFormat): Formatted
export function time(first: unknown, second?: unknown, third?: unknown): Wrap | Formatted {
  if (typeof first === 'number' || first instanceof Date) {
    return wrapWith('date_time', timeDetails(first, second as TimeFormat | undefined))
  }

  return wrapped(
    Formatted.from(first as Content),
    'date_time',
    timeDetails(second, third as TimeFormat | undefined),
  )
}
