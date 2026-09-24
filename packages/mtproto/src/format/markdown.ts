/**
 * Markdown markup, into and out of message entities.
 *
 * The second dialect, and the harder of the two to read: the markers are
 * punctuation rather than tags, so the same character can open a range, close
 * one, or be part of a word. `_` opens italic and `__` opens underline, which
 * means how far to look ahead decides which of the two a writer meant.
 *
 * ```
 *   *bold* _italic_ __underline__ ~strike~ ||spoiler||
 *   `code`  ```lang\ncode block```  [text](url)  >quote
 * ```
 *
 * **Which Markdown.** Telegram describes two. The API documentation for message
 * entities shows a CommonMark-flavoured one — `**bold**`, `*italic*`,
 * `~~strike~~` — and the Bot API documents MarkdownV2, where the same three are
 * `*bold*`, `_italic_` and `~strike~`. This implements MarkdownV2, for one
 * reason: Yuigram is one framework, and a developer writing a bot and an
 * account in the same application would otherwise have `md` mean one thing on
 * one client and something else on the other. Text escaped for the Bot API side
 * is therefore safe here, and the reverse.
 *
 * A backslash escapes the character after it, anywhere. That is what every
 * interpolated value goes through, and the reason the template-tag form of
 * {@link fromMarkdown} exists.
 *
 * **What comes from the dialect, and what is this parser's own choice.** The
 * two are worth keeping apart, because only the first is something Telegram
 * will agree with.
 *
 * From the dialect:
 *
 * - `__` is one token, read greedily from left to right as the beginning or end
 *   of an underline. It is never two italic markers, which is why `a__b` is a
 *   word with two underscores in it rather than an empty italic.
 * - An empty bold entity, written `**`, separates two things that would
 *   otherwise run together — two adjacent blockquotes, or the two closers of
 *   `___italic underline_**__`. A genuine pair of markers with nothing between
 *   them is consumed; that is what makes the separator work, and it does not
 *   extend to `__`, which is not a pair.
 * - Every reserved character may be escaped anywhere, and is then ordinary.
 *
 * This parser's own choices, which Telegram neither requires nor forbids:
 *
 * - `~~strike~~` is accepted as well as `~strike~`, because it is the spelling
 *   most people reach for. It is written back in the dialect's own spelling.
 * - A marker that opens nothing which ever closes stays in the text as written.
 *   A message saying `2 * 3 = 6` should arrive saying that, and eating the
 *   asterisk or refusing the message are both worse than reading it literally.
 * - Two blockquotes with no line between them cannot be written in this dialect
 *   at all. {@link toMarkdown} writes what it can and the shape is disclosed
 *   rather than silently altered; {@link toHtml} expresses it exactly.
 */

import type { TypeMessageEntity } from '../generated/api/types/index.js'
import { assemble, type FormattedText, type Markup, markerRuns, withinText } from './text.js'

/** Characters MarkdownV2 reserves anywhere in the text. */
const SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g

/**
 * The paired markers, longest first.
 *
 * Longest-first is how these should be read, but it is not what makes `__` an
 * underline rather than two italics — {@link takePair} refuses `_` outright at
 * a position beginning `__`, because the dialect makes that one greedy token.
 * Order alone would not be enough: an underline whose closer never arrives has
 * to stay in the text, and falling through to `_` would collapse it instead.
 */
const PAIRS: readonly (readonly [string, TypeMessageEntity['_']])[] = [
  ['||', 'messageEntitySpoiler'],
  ['__', 'messageEntityUnderline'],
  ['~~', 'messageEntityStrike'],
  ['*', 'messageEntityBold'],
  ['_', 'messageEntityItalic'],
  ['~', 'messageEntityStrike'],
]

/** Escape text so it survives {@link fromMarkdown} unchanged. */
function escapeMarkdown(text: string): string {
  return text.replace(SPECIAL, (character) => `\\${character}`)
}

/**
 * Escape what the dialect reserves inside code and inside a link's target:
 * the backslash, and whatever would end the span — a backtick or `)`.
 */
function escapeWithin(text: string, closer: string): string {
  return text.replace(closer === '`' ? /[`\\]/g : /[)\\]/g, (character) => `\\${character}`)
}

/**
 * Read up to an unescaped `closer`, resolving escapes on the way.
 *
 * Inside code and a link's target the dialect reserves only the backslash and
 * the closer itself, and both are written escaped. Returns what was read and
 * where scanning resumes, or `undefined` when nothing closes it.
 */
function readUntil(
  markup: string,
  from: number,
  closer: string,
): { readonly read: string; readonly end: number } | undefined {
  let read = ''

  for (let index = from; index < markup.length; index += 1) {
    const character = markup[index] as string

    if (character === '\\' && index + 1 < markup.length) {
      read += markup[index + 1]
      index += 1
      continue
    }

    if (markup.startsWith(closer, index)) return { read, end: index + closer.length }

    read += character
  }

  return undefined
}

interface Scan {
  text: string
  readonly entities: TypeMessageEntity[]
}

/** Append a parsed fragment at the current end, shifting its ranges to suit. */
function absorb(scan: Scan, inner: FormattedText): number {
  const offset = scan.text.length

  scan.text += inner.text

  for (const entity of inner.entities) {
    scan.entities.push({ ...entity, offset: entity.offset + offset })
  }

  return offset
}

/** Read `` `code` `` and ```` ```lang\ncode``` ````, which take no markup inside. */
function takeCode(scan: Scan, markup: string, at: number): number | undefined {
  if (markup[at] !== '`') return undefined

  if (markup.startsWith('```', at)) {
    const block = readUntil(markup, at + 3, '```')
    if (block === undefined) return undefined

    const body = block.read
    const newline = body.indexOf('\n')
    // A first line with no whitespace in it names the language; anything else
    // is the first line of the code.
    const named = newline !== -1 && newline > 0 && !/\s/.test(body.slice(0, newline))
    const language = named ? body.slice(0, newline) : ''
    const code = named ? body.slice(newline + 1) : body.replace(/^\n/, '')

    scan.entities.push({
      _: 'messageEntityPre',
      offset: scan.text.length,
      length: code.length,
      language,
    })
    scan.text += code

    return block.end
  }

  const span = readUntil(markup, at + 1, '`')
  if (span === undefined) return undefined

  scan.entities.push({ _: 'messageEntityCode', offset: scan.text.length, length: span.read.length })
  scan.text += span.read

  return span.end
}

/** Find the `]` that closes a `[` at `at`, counting nested brackets. */
function closingBracket(markup: string, at: number): number {
  let depth = 0

  for (let index = at; index < markup.length; index += 1) {
    const character = markup[index]

    if (character === '\\') {
      index += 1
      continue
    }

    if (character === '[') depth += 1
    else if (character === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

/** The entity a `[label](target)` names, given where the label landed. */
function linkEntity(target: string, offset: number, length: number): TypeMessageEntity {
  const mentioned = /^tg:\/\/user\?id=(\d+)$/.exec(target)

  if (mentioned !== null) {
    return {
      _: 'messageEntityMentionName',
      offset,
      length,
      user_id: BigInt(mentioned[1] as string),
    }
  }

  const emoji = /^tg:\/\/emoji\?id=(\d+)$/.exec(target)

  if (emoji !== null) {
    return {
      _: 'messageEntityCustomEmoji',
      offset,
      length,
      document_id: BigInt(emoji[1] as string),
    }
  }

  return { _: 'messageEntityTextUrl', offset, length, url: target }
}

/** Read `[label](target)` and `![label](target)`, where the label may be formatted. */
function takeLink(scan: Scan, markup: string, at: number): number | undefined {
  const bracket = markup[at] === '!' ? at + 1 : at
  if (markup[bracket] !== '[') return undefined

  const close = closingBracket(markup, bracket)
  if (close === -1 || markup[close + 1] !== '(') return undefined

  // A `)` or a backslash in the address is written escaped, as every
  // interpolated address is; the escapes are markup, not part of the address.
  const target = readUntil(markup, close + 2, ')')
  if (target === undefined) return undefined

  // The label is markup in its own right, so a bold link is one call inside
  // another rather than a special case here.
  const label = fromMarkdown(markup.slice(bracket + 1, close))
  const offset = absorb(scan, label)

  scan.entities.push(linkEntity(target.read, offset, label.text.length))

  return target.end
}

/**
 * Read a blockquote: a run of consecutive lines each opening with `>`.
 *
 * The run is one quote rather than one per line, which is how it reads and how
 * Telegram shows it. The collapsed variant has no marker here — see
 * {@link toMarkdown}.
 */
function takeQuote(scan: Scan, markup: string, at: number): number | undefined {
  if (markup[at] !== '>') return undefined

  // At the start of a line of the *message*, not of the markup. A `>` mid
  // sentence is a greater-than sign; one that follows only markup contributing
  // no text still opens a quote, which is what lets `**>` work — the `**` is an
  // empty bold entity separating this quote from the one above it, and by the
  // time it is read it has added nothing to the text.
  if (scan.text !== '' && !scan.text.endsWith('\n')) return undefined

  const lines: string[] = []
  let index = at
  // Where the run stops. The newline ending its last line separates the quote
  // from what follows rather than belonging to it, so scanning resumes on it.
  let stop = at

  while (index < markup.length && markup[index] === '>') {
    const lineEnd = markup.indexOf('\n', index)
    const end = lineEnd === -1 ? markup.length : lineEnd

    lines.push(markup.slice(index + 1, end))
    stop = end

    if (lineEnd === -1) break

    index = lineEnd + 1
  }

  // A run ending with `||` is the collapsed form. The mark is not part of what
  // the quote says, so it comes off the text rather than staying in it.
  const { read: inner, marked } = readQuoteBody(lines.join('\n'))
  const offset = absorb(scan, inner)

  scan.entities.push(
    marked
      ? { _: 'messageEntityBlockquote', offset, length: inner.text.length, collapsed: true }
      : { _: 'messageEntityBlockquote', offset, length: inner.text.length },
  )

  return stop
}

/**
 * Read a quote's body, and say whether the run was marked expandable.
 *
 * `||` also closes a spoiler, so a trailing pair is ambiguous by inspection:
 * `>ends with ||shh||` closes a spoiler and `>hidden||` is a mark, and both end
 * in exactly two pipes. Counting them cannot tell the two apart.
 *
 * What tells them apart is what the pair does. Reading the body twice — once
 * whole, once without the final pair — answers it exactly: if dropping those
 * two characters drops exactly `||` from the message and changes nothing else,
 * they were text rather than markup, and text at the end of a quote is the
 * mark. An escaped pipe never reaches this, because a body ending in an escape
 * does not end in a pair to begin with.
 */
function readQuoteBody(body: string): { readonly read: FormattedText; readonly marked: boolean } {
  const whole = fromMarkdown(body)

  if (!body.endsWith('||')) return { read: whole, marked: false }

  const shorter = fromMarkdown(body.slice(0, -2))

  return `${shorter.text}||` === whole.text
    ? { read: shorter, marked: true }
    : { read: whole, marked: false }
}

/** Read a paired marker such as `*bold*`, where the content is markup too. */
function takePair(scan: Scan, markup: string, at: number): number | undefined {
  for (const [marker, kind] of PAIRS) {
    if (!markup.startsWith(marker, at)) continue

    // `__` is one token, always. The dialect states that it is read greedily
    // from left to right as the beginning or end of an underline, so it is
    // never two italic markers — and where it opens an underline that never
    // closes, the two characters stay in the text rather than collapsing into
    // an empty italic. Falling through to `_` here is what made `a__b` arrive
    // as `ab`.
    if (marker === '_' && markup.startsWith('__', at)) return undefined

    const close = findClose(markup, at + marker.length, marker)
    if (close === -1) continue

    const inner = fromMarkdown(markup.slice(at + marker.length, close))
    const offset = absorb(scan, inner)

    // A pair with nothing between it formats nothing, and the zero-length range
    // is dropped later — but the markers are still consumed rather than left in
    // the text. The dialect separates two adjacent blockquotes with an empty
    // bold entity, written `**`, and a reader that kept those two characters
    // would put them in the message. This applies to a genuine pair of markers;
    // it is not a general rule that any two delimiter characters vanish, which
    // is why `__` is excluded above.
    scan.entities.push({ _: kind, offset, length: inner.text.length } as TypeMessageEntity)

    return close + marker.length
  }

  return undefined
}

/**
 * Find where a marker closes, skipping escapes and anything inside code.
 *
 * Code spans are skipped because a marker inside one is code, not markup, and
 * closing an outer range on it would slice the span in half.
 */
function findClose(markup: string, from: number, marker: string): number {
  for (let index = from; index < markup.length; index += 1) {
    const character = markup[index]

    if (character === '\\') {
      index += 1
      continue
    }

    if (character === '`') {
      const fence = markup.startsWith('```', index) ? '```' : '`'
      const code = readUntil(markup, index + fence.length, fence)

      if (code === undefined) return -1

      index = code.end - 1
      continue
    }

    // A `_` inside `__` would close the underline one character early.
    if (marker === '_' && markup.startsWith('__', index)) {
      index += 1
      continue
    }

    if (markup.startsWith(marker, index)) return index
  }

  return -1
}

/**
 * Read Markdown markup into text and the ranges formatted within it.
 *
 * ```ts
 * const body = fromMarkdown`Hello, *${name}*`
 *
 * await account.call(sendMessage({ peer, ...body }))
 * ```
 *
 * Called as a template tag, interpolated values are escaped and the literal
 * parts are not. Called with a plain string, nothing is escaped.
 *
 * Recognised: `*bold*`, `_italic_`, `__underline__`, `~strike~`, `||spoiler||`,
 * `` `code` ``, ```` ```language\ncode``` ````, `[text](url)` and a run of `>`
 * lines as a quote. A link target of `tg://user?id=N` becomes a mention and one
 * of `tg://emoji?id=N` a custom emoji. A backslash escapes what follows it.
 *
 * A marker that never closes stays in the text as written.
 */
export function fromMarkdown(input: Markup, ...values: readonly unknown[]): FormattedText {
  const markup = assemble(input, values, escapeMarkdown)
  const scan: Scan = { text: '', entities: [] }

  let at = 0

  while (at < markup.length) {
    const character = markup[at] as string

    if (character === '\\') {
      // The escape is not part of the message; what follows is, whatever it is.
      if (at + 1 < markup.length) scan.text += markup[at + 1]
      at += 2
      continue
    }

    const taken =
      takeCode(scan, markup, at) ??
      takeQuote(scan, markup, at) ??
      takeLink(scan, markup, at) ??
      takePair(scan, markup, at)

    if (taken !== undefined) {
      at = taken
      continue
    }

    scan.text += character
    at += 1
  }

  scan.entities.sort(
    (left, right) => left.offset - right.offset || right.length - left.length || order(left, right),
  )

  return withinText({ text: scan.text, entities: scan.entities })
}

/** Order two entities covering the same range, so the order is not arbitrary. */
function order(left: TypeMessageEntity, right: TypeMessageEntity): number {
  if (left._ === right._) return 0

  return left._ < right._ ? -1 : 1
}

/** The markers that open and close an entity, or `undefined` for one with none. */
function markersFor(entity: TypeMessageEntity): readonly [string, string] | undefined {
  switch (entity._) {
    case 'messageEntityBold':
      return ['*', '*']
    case 'messageEntityItalic':
      return ['_', '_']
    case 'messageEntityUnderline':
      return ['__', '__']
    case 'messageEntityStrike':
      return ['~', '~']
    case 'messageEntitySpoiler':
      return ['||', '||']
    case 'messageEntityCode':
      return ['`', '`']
    case 'messageEntityPre':
      return [`\`\`\`${entity.language}\n`, '```']
    case 'messageEntityTextUrl':
      return ['[', `](${escapeWithin(entity.url, ')')})`]
    case 'messageEntityMentionName':
      return ['[', `](tg://user?id=${entity.user_id})`]
    case 'messageEntityCustomEmoji':
      return ['![', `](tg://emoji?id=${entity.document_id})`]
    default:
      // A blockquote is a prefix on every line rather than a pair, and is laid
      // out separately. Mentions, hashtags, bare links and the rest are found
      // by the server in the text itself, so marking them up would change
      // nothing about the message.
      return undefined
  }
}

/** Whether an entity describes a range of this text. */
function usable(entity: TypeMessageEntity, length: number): boolean {
  return entity.offset >= 0 && entity.length > 0 && entity.offset + entity.length <= length
}

/** Which positions are inside a code span, where the text is written as it is. */
function verbatimAt(value: FormattedText): readonly boolean[] {
  const flags = new Array<boolean>(value.text.length).fill(false)

  for (const entity of value.entities) {
    if (entity._ !== 'messageEntityCode' && entity._ !== 'messageEntityPre') continue
    if (!usable(entity, value.text.length)) continue

    for (let at = entity.offset; at < entity.offset + entity.length; at += 1) flags[at] = true
  }

  return flags
}

/** Where a quote puts a marker, and which one. */
interface QuoteMarks {
  /** Position of every line a quote covers, to the `>` (or `**>`) it opens with. */
  readonly opens: ReadonlyMap<number, string>
  /** Position where a collapsed quote ends, to its expandability mark. */
  readonly marks: ReadonlyMap<number, string>
}

/**
 * The markers every quote in this text needs.
 *
 * Three things, and only the first is obvious. Every line a quote covers opens
 * with `>`. A collapsed quote ends with `||`. And a quote beginning where
 * another just ended opens with `**>` instead — an empty bold entity, which
 * contributes nothing to the message and exists only so the two do not read
 * back as one quote.
 */
function quoteMarks(value: FormattedText): QuoteMarks {
  const opens = new Map<number, string>()
  const marks = new Map<number, string>()
  const quotes = value.entities.filter(
    (entity) => entity._ === 'messageEntityBlockquote' && usable(entity, value.text.length),
  )
  const ends = new Set(quotes.map((entity) => entity.offset + entity.length))

  for (const entity of quotes) {
    for (let at = entity.offset; at < entity.offset + entity.length; at += 1) {
      if (at === entity.offset || value.text[at - 1] === '\n') opens.set(at, '>')
    }

    // Adjacent either way round: ending exactly where this begins, or one
    // character earlier with the newline that separates the lines between.
    const abuts = ends.has(entity.offset) || ends.has(entity.offset - 1)

    if (abuts) opens.set(entity.offset, '**>')
    if (entity._ === 'messageEntityBlockquote' && entity.collapsed === true) {
      marks.set(entity.offset + entity.length, '||')
    }
  }

  return { opens, marks }
}

/**
 * Write text and its entities back as Markdown markup.
 *
 * The inverse of {@link fromMarkdown} for everything this dialect can express.
 * Text is escaped; inside code only a backtick and a backslash are, as the
 * dialect has it, and a link's address escapes `)` and a backslash. That is
 * what makes the result safe to pass back through {@link fromMarkdown}, and
 * through Telegram's own reading of MarkdownV2.
 *
 * Ranges that cross are closed and reopened where they cross, as
 * {@link markerRuns} describes.
 *
 * One thing does not survive the trip, by choice rather than oversight. The
 * entities the server finds on its own — mentions, hashtags, bare links, phone
 * numbers, bank cards — are written as plain text, because marking them up
 * would change nothing about the message.
 */
export function toMarkdown(value: FormattedText): string {
  const runs = markerRuns(value, markersFor)
  const verbatim = verbatimAt(value)
  const quotes = quoteMarks(value)

  let out = ''

  for (let at = 0; at <= value.text.length; at += 1) {
    const run = runs.get(at)
    out += run?.close ?? ''
    // After the closing markers, so a spoiler ending the last quoted line
    // closes before the mark that makes the quote expandable.
    out += quotes.marks.get(at) ?? ''
    out += quotes.opens.get(at) ?? ''
    out += run?.open ?? ''

    if (at === value.text.length) break

    const character = value.text[at] as string

    out += verbatim[at] === true ? escapeWithin(character, '`') : escapeMarkdown(character)
  }

  return out
}
