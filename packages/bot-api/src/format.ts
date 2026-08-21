/**
 * Formatting text safely.
 *
 * Every bot eventually interpolates something a user wrote into a formatted
 * message, and every bot that does it without escaping eventually meets a user
 * called `<b>` or `*`. The failure is not cosmetic: Telegram rejects the whole
 * call with `can't parse entities`, so one malformed name breaks a reply that
 * has nothing to do with formatting.
 *
 * ```ts
 * await message.reply(html`Hello, <b>${message.sender.first_name}</b>!`, {
 *   parse_mode: 'HTML',
 * })
 * ```
 *
 * The tag escapes what is interpolated and leaves the literal parts alone,
 * which is the right way round: the markup is written by the developer and the
 * values come from strangers.
 */

/** Characters HTML parse mode treats specially. */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

/**
 * Escape text for `parse_mode: 'HTML'`.
 *
 * Telegram's HTML mode needs only these three, and escaping more would show
 * entities to the reader.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (character) => HTML_ESCAPES[character] as string)
}

/**
 * Characters MarkdownV2 reserves.
 *
 * Telegram documents that all of them must be escaped anywhere in the text,
 * including inside what looks like ordinary prose — which is why hand-escaping
 * this mode is a losing game.
 */
const MARKDOWN_V2_SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g

/** Escape text for `parse_mode: 'MarkdownV2'`. */
export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_SPECIAL, (character) => `\\${character}`)
}

/**
 * Escape text for the original `parse_mode: 'Markdown'`.
 *
 * Telegram calls this mode legacy and keeps it only for backward
 * compatibility; new code should use `MarkdownV2` or `HTML`.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*`[]/g, (character) => `\\${character}`)
}

/** Marks text that is already formatted and must not be escaped again. */
const RAW = Symbol('yuigram.raw')

/** Text a template should splice in untouched. */
export interface RawText {
  readonly [RAW]: true
  toString(): string
}

/** Whether a value was marked as already formatted. */
function isRaw(value: unknown): value is RawText {
  return typeof value === 'object' && value !== null && RAW in value
}

/** Turn an interpolated value into text. */
function stringify(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

/** Build a tagged template that escapes its interpolations. */
function tag(
  escapeValue: (text: string) => string,
): (strings: TemplateStringsArray, ...values: unknown[]) => string {
  return (strings, ...values) => {
    let out = strings[0] ?? ''

    for (const [index, value] of values.entries()) {
      out += isRaw(value) ? String(value) : escapeValue(stringify(value))
      out += strings[index + 1] ?? ''
    }

    return out
  }
}

/**
 * A template whose interpolations are escaped for HTML parse mode.
 *
 * ```ts
 * html`<b>${name}</b> joined` // markup stays, the name is escaped
 * ```
 */
export const html = tag(escapeHtml)

/** A template whose interpolations are escaped for MarkdownV2. */
export const md = tag(escapeMarkdownV2)

/**
 * Mark text as already formatted, so a template leaves it alone.
 *
 * For composing one formatted string out of another:
 *
 * ```ts
 * const link = html`<a href="${url}">${title}</a>`
 * const body = html`Read ${raw(link)} now`
 * ```
 *
 * Escaping is skipped for whatever this wraps, so it must never wrap something
 * a user wrote.
 */
export function raw(text: string): RawText {
  return { [RAW]: true, toString: () => text }
}

/**
 * Every formatting helper, under one name.
 *
 * Exported individually as well: `html` and `md` read better bare at a call
 * site, and the namespace is for discovering the rest.
 */
export const format = Object.freeze({
  html,
  md,
  raw,
  escapeHtml,
  escapeMarkdownV2,
  escapeMarkdown,
})
