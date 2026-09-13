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
 * Where a marker opens nothing that ever closes, it stays in the text as
 * written. A message saying `2 * 3 = 6` should arrive saying that, and eating
 * the asterisk or refusing the message are both worse than reading it
 * literally.
 */

import type { TypeMessageEntity } from '../generated/api/types/index.js'
import { assemble, type FormattedText, type Markup, withinText } from './text.js'

/** Characters MarkdownV2 reserves anywhere in the text. */
const SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g

/**
 * The paired markers, longest first.
 *
 * The order is defence in depth rather than the thing that makes `__under__`
 * read as an underline. What decides that is {@link takePair} refusing a pair
 * with nothing between it: `_` matched first would close immediately on the
 * second underscore, find an empty span, and fall through to `__` anyway.
 * Longest-first is still how this should be read, and costs nothing.
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
    const close = markup.indexOf('```', at + 3)
    if (close === -1) return undefined

    const body = markup.slice(at + 3, close)
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

    return close + 3
  }

  const close = markup.indexOf('`', at + 1)
  if (close === -1) return undefined

  const code = markup.slice(at + 1, close)

  scan.entities.push({ _: 'messageEntityCode', offset: scan.text.length, length: code.length })
  scan.text += code

  return close + 1
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

  const target = markup.indexOf(')', close + 2)
  if (target === -1) return undefined

  // The label is markup in its own right, so a bold link is one call inside
  // another rather than a special case here.
  const label = fromMarkdown(markup.slice(bracket + 1, close))
  const offset = absorb(scan, label)

  scan.entities.push(linkEntity(markup.slice(close + 2, target), offset, label.text.length))

  return target + 1
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
  // Only at the start of a line: a `>` mid-sentence is a greater-than sign.
  if (at !== 0 && markup[at - 1] !== '\n') return undefined

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

  const inner = fromMarkdown(lines.join('\n'))
  const offset = absorb(scan, inner)

  scan.entities.push({ _: 'messageEntityBlockquote', offset, length: inner.text.length })

  return stop
}

/** Read a paired marker such as `*bold*`, where the content is markup too. */
function takePair(scan: Scan, markup: string, at: number): number | undefined {
  for (const [marker, kind] of PAIRS) {
    if (!markup.startsWith(marker, at)) continue

    const close = findClose(markup, at + marker.length, marker)
    if (close === -1) continue

    const inner = fromMarkdown(markup.slice(at + marker.length, close))

    // A pair with nothing between it formats nothing, and consuming it would
    // delete both markers from a message that meant to say them: `a__b` is a
    // word with two underscores in it, not an empty underline.
    if (inner.text === '') continue

    const offset = absorb(scan, inner)

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
      const close = markup.indexOf(fence, index + fence.length)

      if (close === -1) return -1

      index = close + fence.length - 1
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
      return ['[', `](${entity.url})`]
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

/** Which positions open a line that a quote covers, and so need a `>` in front. */
function quotedLineStarts(value: FormattedText): ReadonlySet<number> {
  const starts = new Set<number>()

  for (const entity of value.entities) {
    if (entity._ !== 'messageEntityBlockquote') continue
    if (!usable(entity, value.text.length)) continue

    for (let at = entity.offset; at < entity.offset + entity.length; at += 1) {
      if (at === entity.offset || value.text[at - 1] === '\n') starts.add(at)
    }
  }

  return starts
}

/**
 * Write text and its entities back as Markdown markup.
 *
 * The inverse of {@link fromMarkdown} for everything this dialect can express.
 * Text is escaped except inside a code span, where a backslash is a backslash,
 * which is what makes the result safe to pass back through
 * {@link fromMarkdown}.
 *
 * Two things do not survive the trip, both by choice rather than oversight.
 * Entities the server finds on its own — mentions, hashtags, bare links, phone
 * numbers, bank cards — are written as plain text, because marking them up
 * would change nothing about the message. And a collapsed blockquote is written
 * as an ordinary one: this dialect's marker for the collapsed form is not
 * something the implementation could confirm against Telegram's own
 * documentation, and guessing at a marker would produce messages that look
 * right here and wrong on a phone. {@link toHtml} keeps the flag.
 */
export function toMarkdown(value: FormattedText): string {
  const opens = new Map<number, string[]>()
  const closes = new Map<number, string[]>()

  for (const entity of value.entities) {
    if (!usable(entity, value.text.length)) continue

    const markers = markersFor(entity)
    if (markers === undefined) continue

    const opening = opens.get(entity.offset) ?? []
    const closing = closes.get(entity.offset + entity.length) ?? []

    opening.push(markers[0])
    // Closing markers run innermost first, and the innermost opened last.
    closing.unshift(markers[1])
    opens.set(entity.offset, opening)
    closes.set(entity.offset + entity.length, closing)
  }

  const verbatim = verbatimAt(value)
  const quoted = quotedLineStarts(value)

  let out = ''

  for (let at = 0; at <= value.text.length; at += 1) {
    out += (closes.get(at) ?? []).join('')
    if (quoted.has(at)) out += '>'
    out += (opens.get(at) ?? []).join('')

    if (at === value.text.length) break

    const character = value.text[at] as string

    out += verbatim[at] === true ? character : escapeMarkdown(character)
  }

  return out
}
