// SPDX-License-Identifier: MPL-2.0

/**
 * Formatted text, written back as markup.
 *
 * Ranges may overlap in any way — bold over `[0, 10)` and italic over
 * `[5, 15)` is a valid message — but markup has to nest. So the ranges are laid
 * out first as a sequence of opens, closes and text, splitting a range where it
 * crosses another, and keeping the outer kinds — quotations, code blocks,
 * links — whole where there is a choice. Each dialect then only spells tokens.
 *
 * Every character of text is escaped for the place it lands in, so what comes
 * out parses back into exactly the value that went in.
 */

import { DETECTED, type Entity, type EntityType, sortEntities, VERBATIM } from './entities.js'
import type { FormattedLike } from './formatted.js'

/** One step of a layout. */
type Token =
  | { readonly kind: 'open'; readonly entity: Entity }
  | { readonly kind: 'close'; readonly entity: Entity }
  | { readonly kind: 'text'; readonly text: string; readonly verbatim: boolean }

/** How far out a kind sits when two must nest. Lower is further out. */
const DEPTH: Readonly<Partial<Record<EntityType, number>>> = {
  blockquote: 0,
  expandable_blockquote: 0,
  pre: 1,
  text_link: 2,
  text_mention: 2,
  bold: 3,
  italic: 3,
  underline: 3,
  strikethrough: 3,
  spoiler: 3,
  code: 4,
  custom_emoji: 5,
  date_time: 5,
}

const depthOf = (entity: Entity): number => DEPTH[entity.type] ?? 3
const endOf = (entity: Entity): number => entity.offset + entity.length

/** Lay ranges out as properly nested opens and closes around text. */
export function layout(value: FormattedLike): Token[] {
  const text = value.text
  const entities = sortEntities(
    (value.entities ?? []).filter(
      (entity) =>
        !DETECTED.has(entity.type) &&
        entity.length > 0 &&
        entity.offset >= 0 &&
        endOf(entity) <= text.length,
    ),
  )

  const boundaries = new Set<number>([0, text.length])
  for (const entity of entities) {
    boundaries.add(entity.offset)
    boundaries.add(endOf(entity))
  }
  const points = [...boundaries].sort((a, b) => a - b)

  const tokens: Token[] = []
  const stack: Entity[] = []
  let next = 0

  const reopen = (entries: readonly Entity[]): void => {
    for (const entity of entries) {
      stack.push(entity)
      tokens.push({ kind: 'open', entity })
    }
  }

  const closeFrom = (index: number): Entity[] => {
    const popped = stack.splice(index)
    for (let at = popped.length - 1; at >= 0; at -= 1) {
      tokens.push({ kind: 'close', entity: popped[at] as Entity })
    }

    return popped
  }

  points.forEach((point, index) => {
    // Close whatever ends here, and whatever sits above it, reopening the rest.
    const ending = stack.findIndex((entity) => endOf(entity) === point)
    if (ending !== -1) {
      const popped = closeFrom(ending)
      reopen(popped.filter((entity) => endOf(entity) > point))
    }

    // Open what starts here, outer kinds beneath inner ones.
    while (next < entities.length && (entities[next] as Entity).offset === point) {
      const entity = entities[next] as Entity
      next += 1

      // Nothing opens inside code; its text is shown as written.
      if (stack.some((open) => VERBATIM.has(open.type))) continue

      const inner = stack.findIndex((open) => depthOf(open) > depthOf(entity))
      if (inner === -1) {
        stack.push(entity)
        tokens.push({ kind: 'open', entity })
        continue
      }

      const popped = closeFrom(inner)
      stack.push(entity)
      tokens.push({ kind: 'open', entity })
      reopen(popped)
    }

    const until = points[index + 1]
    if (until !== undefined && until > point) {
      tokens.push({
        kind: 'text',
        text: text.slice(point, until),
        verbatim: stack.some((open) => VERBATIM.has(open.type)),
      })
    }
  })

  closeFrom(0)

  return tokens
}

/* -------------------------------------------------------------------------- */
/* HTML                                                                        */
/* -------------------------------------------------------------------------- */

const HTML_TEXT: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const HTML_ATTRIBUTE: Readonly<Record<string, string>> = { ...HTML_TEXT, '"': '&quot;' }

/** Escape text for Telegram HTML: the three characters that start markup. */
export function escapeHtmlText(text: string): string {
  return text.replace(/[&<>]/g, (character) => HTML_TEXT[character] as string)
}

/** Escape a value for a double-quoted HTML attribute. */
export function escapeHtmlAttribute(text: string): string {
  return text.replace(/[&<>"]/g, (character) => HTML_ATTRIBUTE[character] as string)
}

function htmlOpen(entity: Entity): string {
  switch (entity.type) {
    case 'bold':
      return '<b>'
    case 'italic':
      return '<i>'
    case 'underline':
      return '<u>'
    case 'strikethrough':
      return '<s>'
    case 'spoiler':
      return '<tg-spoiler>'
    case 'code':
      return '<code>'
    case 'pre':
      return entity.language === undefined || entity.language === ''
        ? '<pre>'
        : `<pre><code class="language-${escapeHtmlAttribute(entity.language)}">`
    case 'text_link':
      return `<a href="${escapeHtmlAttribute(entity.url ?? '')}">`
    case 'text_mention':
      return `<a href="tg://user?id=${entity.user?.id ?? 0}">`
    case 'custom_emoji':
      return `<tg-emoji emoji-id="${escapeHtmlAttribute(entity.custom_emoji_id ?? '')}">`
    case 'date_time':
      return entity.date_time_format === undefined || entity.date_time_format === ''
        ? `<tg-time unix="${entity.unix_time ?? 0}">`
        : `<tg-time unix="${entity.unix_time ?? 0}" format="${escapeHtmlAttribute(entity.date_time_format)}">`
    case 'blockquote':
      return '<blockquote>'
    case 'expandable_blockquote':
      return '<blockquote expandable>'
    default:
      return ''
  }
}

function htmlClose(entity: Entity): string {
  switch (entity.type) {
    case 'bold':
      return '</b>'
    case 'italic':
      return '</i>'
    case 'underline':
      return '</u>'
    case 'strikethrough':
      return '</s>'
    case 'spoiler':
      return '</tg-spoiler>'
    case 'code':
      return '</code>'
    case 'pre':
      return entity.language === undefined || entity.language === '' ? '</pre>' : '</code></pre>'
    case 'text_link':
    case 'text_mention':
      return '</a>'
    case 'custom_emoji':
      return '</tg-emoji>'
    case 'date_time':
      return '</tg-time>'
    case 'blockquote':
    case 'expandable_blockquote':
      return '</blockquote>'
    default:
      return ''
  }
}

/** Telegram HTML for a formatted value. */
export function toHtml(value: FormattedLike): string {
  let out = ''

  for (const token of layout(value)) {
    if (token.kind === 'text') out += escapeHtmlText(token.text)
    else if (token.kind === 'open') out += htmlOpen(token.entity)
    else out += htmlClose(token.entity)
  }

  return out
}

/* -------------------------------------------------------------------------- */
/* MarkdownV2                                                                  */
/* -------------------------------------------------------------------------- */

/** Characters MarkdownV2 reserves outside code and link targets. */
const MARKDOWN_RESERVED = /[_*[\]()~`>#+\-=|{}.!\\]/g

/** Escape text for MarkdownV2 prose. */
export function escapeMarkdownText(text: string): string {
  return text.replace(MARKDOWN_RESERVED, (character) => `\\${character}`)
}

/** Escape text inside inline code or a code block: only `` ` `` and `\`. */
export function escapeMarkdownCode(text: string): string {
  return text.replace(/[`\\]/g, (character) => `\\${character}`)
}

/** Escape the target of a link: only `)` and `\`. */
export function escapeMarkdownUrl(text: string): string {
  return text.replace(/[)\\]/g, (character) => `\\${character}`)
}

function markdownOpen(entity: Entity): string {
  switch (entity.type) {
    case 'bold':
      return '*'
    case 'italic':
      return '_'
    case 'underline':
      return '__'
    case 'strikethrough':
      return '~'
    case 'spoiler':
      return '||'
    case 'code':
      return '`'
    case 'pre':
      return `\`\`\`${entity.language ?? ''}\n`
    case 'text_link':
    case 'text_mention':
      return '['
    case 'custom_emoji':
    case 'date_time':
      return '!['
    default:
      return ''
  }
}

function markdownClose(entity: Entity): string {
  switch (entity.type) {
    case 'bold':
      return '*'
    case 'italic':
      return '_'
    case 'underline':
      return '__'
    case 'strikethrough':
      return '~'
    case 'spoiler':
      return '||'
    case 'code':
      return '`'
    case 'pre':
      return '```'
    case 'text_link':
      return `](${escapeMarkdownUrl(entity.url ?? '')})`
    case 'text_mention':
      return `](tg://user?id=${entity.user?.id ?? 0})`
    case 'custom_emoji':
      return `](tg://emoji?id=${escapeMarkdownUrl(entity.custom_emoji_id ?? '')})`
    case 'date_time': {
      const formatted =
        entity.date_time_format === undefined || entity.date_time_format === ''
          ? ''
          : `&format=${escapeMarkdownUrl(entity.date_time_format)}`

      return `](tg://time?unix=${entity.unix_time ?? 0}${formatted})`
    }
    default:
      return ''
  }
}

/**
 * Telegram MarkdownV2 for a formatted value.
 *
 * Quotations are line-based in this dialect: every line inside one starts with
 * `>`, and a collapsed one ends with `||`. Two quotations in a row are kept
 * apart with an empty pair of markers — an empty bold, as Telegram's own
 * documentation writes it, or another kind when bold is open. Where an italic
 * marker is followed by an underline one, which `__`'s greedy reading would
 * take the wrong way round, the same separator goes between them.
 */
export function toMarkdown(value: FormattedLike): string {
  const writer = new MarkdownWriter()
  for (const token of layout(value)) writer.write(token)

  return writer.out
}

function isQuote(entity: Entity): boolean {
  return entity.type === 'blockquote' || entity.type === 'expandable_blockquote'
}

/** MarkdownV2 written one layout token at a time. */
class MarkdownWriter {
  out = ''
  quote: Entity | undefined
  lastQuoteEnd = -1
  atLineStart = true
  lastMarkup = -1
  lastToken = ''
  readonly open: Entity[] = []

  write(token: Token): void {
    if (token.kind === 'text') {
      this.text(token.text, token.verbatim)

      return
    }
    if (isQuote(token.entity)) {
      if (token.kind === 'open') this.openQuote(token.entity)
      else this.closeQuote(token.entity)

      return
    }
    if (token.kind === 'open') {
      this.markup(markdownOpen(token.entity))
      this.open.push(token.entity)

      return
    }

    const at = this.open.lastIndexOf(token.entity)
    if (at !== -1) this.open.splice(at, 1)
    this.markup(markdownClose(token.entity))
  }

  /**
   * An empty pair of markers, of a kind not open here, to keep two tokens
   * apart. Telegram's documentation separates with `**`; when bold is open that
   * would close it, so another kind is used.
   */
  separator(): string {
    for (const [type, pair] of [
      ['bold', '**'],
      ['strikethrough', '~~'],
      ['spoiler', '||||'],
    ] as const) {
      if (!this.open.some((entity) => entity.type === type)) return pair
    }

    return '**'
  }

  markup(markup: string): void {
    if (markup.length === 0) return
    // `_` followed by `__` reads as `__` then `_`, the wrong way round.
    if (markup.startsWith('__') && this.lastMarkup === this.out.length && this.lastToken === '_') {
      this.out += this.separator()
    }
    this.out += markup
    this.lastMarkup = this.out.length
    this.lastToken = markup
    this.atLineStart = false
  }

  openQuote(entity: Entity): void {
    if (!this.atLineStart && !this.out.endsWith('\n')) this.out += '\n'
    // A quotation on the line after another would join it.
    if (this.lastQuoteEnd >= 0 && /^\n?$/.test(this.out.slice(this.lastQuoteEnd))) {
      this.out += this.separator()
    }
    this.quote = entity
    this.out += '>'
    this.atLineStart = false
  }

  closeQuote(entity: Entity): void {
    // A quotation ending in a line break leaves no marker on the next line:
    // that line is not quoted.
    const endsLine = this.out.endsWith('\n>')
    if (endsLine) this.out = this.out.slice(0, -1)
    if (entity.type === 'expandable_blockquote') {
      this.out = endsLine ? `${this.out.slice(0, -1)}||\n` : `${this.out}||`
    }
    this.quote = undefined
    this.lastQuoteEnd = endsLine ? this.out.length - 1 : this.out.length
    this.atLineStart = this.out.endsWith('\n') || this.out.length === 0
  }

  text(text: string, verbatim: boolean): void {
    const escaped = verbatim ? escapeMarkdownCode(text) : escapeMarkdownText(text)
    // Every line of a quotation carries the marker.
    this.out += this.quote === undefined ? escaped : escaped.replace(/\n/g, '\n>')
    if (escaped.length > 0) this.atLineStart = escaped.endsWith('\n')
  }
}
