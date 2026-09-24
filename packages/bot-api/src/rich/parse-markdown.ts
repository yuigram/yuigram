/**
 * Rich Markdown, read into blocks.
 *
 * The dialect is GitHub Flavored Markdown where Telegram's documentation says
 * it is — headings, lists, task lists, quotes, fenced code, tables, footnotes —
 * with Telegram's own additions: `==marked==`, `||spoiler||`, `$math$` and
 * `$$math$$`, media written as images on a line of their own, and the HTML tags
 * of the rich HTML dialect wherever Markdown has no syntax. Inside an inline tag
 * Markdown is still read; inside a block tag it is not, except in `<details>`,
 * `<tg-collage>` and `<tg-slideshow>`.
 *
 * As with the HTML reader, sending the markup is the faithful way to send it;
 * this is for checking it first, converting it, and building on it. Choices the
 * documentation leaves open are written down where they are made:
 *
 * - Lines of a paragraph run on as one line, as the documentation's examples
 *   show. A line ending in two spaces or a backslash breaks the line.
 * - A heading is written with `#`. A line of `---` is a divider, never the
 *   underline of a heading above it.
 * - Footnotes are numbered in the order they are defined. A reference becomes
 *   a link to the footnote showing its number, and the definitions follow the
 *   message's last block, each opening with its number.
 */

import type { InputRichBlock, InputRichBlockListItem, RichText } from '../generated/types/index.js'
import {
  type Align,
  anchorBlock,
  blockquote,
  codeBlock,
  collage,
  details,
  divider,
  heading,
  mathBlock,
  paragraph,
  slideshow,
  type TableCell,
  table,
} from './blocks.js'
import { RichParseError } from './errors.js'
import { measureRich, overLimit } from './limits.js'
import {
  BLOCK,
  type Element,
  INLINE,
  type Node,
  RichHtmlReader,
  type RichParseOptions,
  readRichHtmlTree,
  type Text,
  tagAt,
} from './parse-html.js'
import {
  bold,
  code,
  isEmptyRichText,
  italic,
  marked,
  math,
  type RichContent,
  reference,
  referenceLink,
  richText,
  spoiler,
  strikethrough,
  superscript,
  time,
} from './text.js'

/* -------------------------------------------------------------------------- */
/* Inline                                                                      */
/* -------------------------------------------------------------------------- */

type Token =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'node'; readonly value: RichContent }
  | {
      readonly kind: 'delimiter'
      readonly character: '*' | '_'
      count: number
      readonly open: boolean
      readonly close: boolean
      readonly length: number
    }

const PUNCTUATION = /[\p{P}\p{S}]/u
const WHITESPACE = /\s/u
const ESCAPABLE = /[!-/:-@[-`{-~]/

/** Whether a run of `*` or `_` may open or close emphasis, by what is on either side. */
function flanking(
  character: '*' | '_',
  before: string,
  after: string,
): { readonly open: boolean; readonly close: boolean } {
  const beforeSpace = before === '' || WHITESPACE.test(before)
  const afterSpace = after === '' || WHITESPACE.test(after)
  const beforePunct = PUNCTUATION.test(before)
  const afterPunct = PUNCTUATION.test(after)
  const left = !afterSpace && (!afterPunct || beforeSpace || beforePunct)
  const right = !beforeSpace && (!beforePunct || afterSpace || afterPunct)

  if (character === '*') return { open: left, close: right }

  // An underscore inside a word is part of the word.
  return { open: left && (!right || beforePunct), close: right && (!left || afterPunct) }
}

/** Pairs of markers read as one kind of formatting each. */
const PAIRED: readonly (readonly [string, (content: RichContent) => RichText])[] = [
  ['~~', strikethrough],
  ['==', marked],
  ['||', spoiler],
  ['~', strikethrough],
]

/** The Markdown reader: rich HTML's tags, with Markdown in every run of text between them. */
class MarkdownReader extends RichHtmlReader {
  readonly #footnotes: ReadonlyMap<string, number>

  constructor(
    source: string,
    options: RichParseOptions,
    references: Iterable<string>,
    footnotes: ReadonlyMap<string, number>,
  ) {
    super(source, options, [], references)
    this.#footnotes = footnotes
  }

  override text(node: Text): RichContent {
    return this.markdown(node.text)
  }

  /** A run of inline Markdown as rich text. */
  markdown(source: string): RichText {
    return richText(this.#emphasis(this.#tokens(source)))
  }

  #tokens(source: string): Token[] {
    const tokens: Token[] = []
    let text = ''
    const push = (token: Token): void => {
      if (text !== '') tokens.push({ kind: 'text', text })
      text = ''
      tokens.push(token)
    }

    let at = 0
    while (at < source.length) {
      const taken = this.#take(source, at)
      if (taken === undefined) {
        text += source[at]
        at += 1
        continue
      }
      if (taken.token.kind === 'text') text += taken.token.text
      else push(taken.token)
      at = taken.end
    }
    if (text !== '') tokens.push({ kind: 'text', text })

    return tokens
  }

  /** One token starting at `at`, or `undefined` for an ordinary character. */
  #take(source: string, at: number): { readonly token: Token; readonly end: number } | undefined {
    const character = source[at] as string

    switch (character) {
      case '\\':
        return this.#escape(source, at)
      case '`':
        return this.#codeSpan(source, at)
      case '<':
        return this.#tag(source, at)
      case '!':
      case '[':
        return this.#bracket(source, at)
      case '$':
        return this.#math(source, at)
      case '*':
      case '_':
        return this.#delimiter(source, at, character)
      default:
        return this.#paired(source, at)
    }
  }

  #escape(source: string, at: number): { token: Token; end: number } | undefined {
    const next = source[at + 1]
    if (next !== undefined && ESCAPABLE.test(next)) {
      return { token: { kind: 'text', text: next }, end: at + 2 }
    }

    return undefined
  }

  #codeSpan(source: string, at: number): { token: Token; end: number } | undefined {
    let run = 0
    while (source[at + run] === '`') run += 1
    const fence = '`'.repeat(run)

    let search = at + run
    for (;;) {
      const close = source.indexOf(fence, search)
      if (close === -1) return { token: { kind: 'text', text: fence }, end: at + run }
      if (source[close + run] === '`') {
        search = close + run + 1
        continue
      }

      let content = source.slice(at + run, close)
      if (content.length > 1 && content.startsWith(' ') && content.endsWith(' ')) {
        content = content.slice(1, -1)
      }

      return { token: { kind: 'node', value: code(content) }, end: close + run }
    }
  }

  /** An inline tag of the HTML dialect, with Markdown read in its content. */
  #tag(source: string, at: number): { token: Token; end: number } | undefined {
    const tag = tagAt(source, at)
    if (tag === undefined || tag.closing) return undefined
    const emojiImage =
      tag.name === 'img' && (tag.attributes.get('src') ?? '').startsWith('tg://emoji?')
    if (!INLINE.has(tag.name) && !emojiImage) return undefined

    const element = (children: Node[]): Element => ({
      kind: 'element',
      name: tag.name,
      attributes: tag.attributes,
      children,
      at,
    })
    if (tag.selfClosing || tag.name === 'br' || tag.name === 'img') {
      return { token: { kind: 'node', value: this.inlineElement(element([])) }, end: tag.end }
    }

    const close = closingTag(source, tag.end, tag.name)
    if (close === undefined) return undefined
    const inner: Text = { kind: 'text', text: source.slice(tag.end, close.start), at: tag.end }

    return { token: { kind: 'node', value: this.inlineElement(element([inner])) }, end: close.end }
  }

  /** `[label](target)`, `[^footnote]`, `![alt](tg://emoji…)` and `![label](tg://time…)`. */
  #bracket(source: string, at: number): { token: Token; end: number } | undefined {
    const image = source[at] === '!'
    const open = image ? at + 1 : at
    if (source[open] !== '[') return undefined

    const footnote = /^\[\^([^\]\s]+)\]/.exec(source.slice(open))
    if (!image && footnote !== null && source[open + footnote[0].length] !== ':') {
      const number = this.#footnotes.get(footnote[1] as string)
      if (number !== undefined) {
        return {
          token: {
            kind: 'node',
            value: referenceLink(superscript(String(number)), footnote[1] as string),
          },
          end: open + footnote[0].length,
        }
      }
    }

    const close = closingBracket(source, open)
    if (close === -1 || source[close + 1] !== '(') return undefined
    const target = readTarget(source, close + 2)
    if (target === undefined) return undefined

    const label = source.slice(open + 1, close)
    const value = image
      ? this.#inlineImage(label, target.url, at)
      : this.link(this.markdown(label), target.url)
    if (value === undefined) return undefined

    return { token: { kind: 'node', value }, end: target.end }
  }

  #inlineImage(label: string, url: string, at: number): RichContent | undefined {
    const emoji = /^tg:\/\/emoji\?id=(\d+)$/.exec(url)
    if (emoji !== null) {
      return this.inlineElement({
        kind: 'element',
        name: 'tg-emoji',
        attributes: new Map([['emoji-id', emoji[1] as string]]),
        children: [{ kind: 'text', text: label, at }],
        at,
      })
    }

    if (url.startsWith('tg://time?')) {
      const query = new URLSearchParams(url.slice('tg://time?'.length))
      const unix = Number(query.get('unix'))
      if (!Number.isInteger(unix)) this.fail('a moment names its time as unix=<seconds>', at)

      return time(this.markdown(label), unix, query.get('format') ?? '')
    }

    if (!this.lenient) this.fail('media is a block of its own, on a line by itself', at)

    return undefined
  }

  /** `$x^2$`: a formula, when the dollars are not a price or a cashtag. */
  #math(source: string, at: number): { token: Token; end: number } | undefined {
    if (
      source[at + 1] === '$' ||
      source[at + 1] === undefined ||
      WHITESPACE.test(source[at + 1] as string)
    ) {
      return undefined
    }

    for (
      let close = source.indexOf('$', at + 1);
      close !== -1;
      close = source.indexOf('$', close + 1)
    ) {
      if (source[close - 1] === '\\') continue
      if (WHITESPACE.test(source[close - 1] as string)) continue
      if (/\d/.test(source[close + 1] ?? '')) continue

      return { token: { kind: 'node', value: math(source.slice(at + 1, close)) }, end: close + 1 }
    }

    return undefined
  }

  #delimiter(source: string, at: number, character: '*' | '_'): { token: Token; end: number } {
    let end = at
    while (source[end] === character) end += 1
    const { open, close } = flanking(character, source[at - 1] ?? '', source[end] ?? '')

    return {
      token: { kind: 'delimiter', character, count: end - at, open, close, length: end - at },
      end,
    }
  }

  /** `~~strike~~`, `==marked==`, `||spoiler||` and `~strike~`. */
  #paired(source: string, at: number): { token: Token; end: number } | undefined {
    for (const [marker, style] of PAIRED) {
      if (!source.startsWith(marker, at)) continue
      if (WHITESPACE.test(source[at + marker.length] ?? ' ')) return undefined

      const close = findMarker(source, at + marker.length, marker)
      if (close === undefined) return undefined

      return {
        token: {
          kind: 'node',
          value: style(this.markdown(source.slice(at + marker.length, close))),
        },
        end: close + marker.length,
      }
    }

    return undefined
  }

  /**
   * Match emphasis delimiters, CommonMark's way: each closer looks back for the
   * nearest opener of its character, two of each make bold and one italic.
   */
  #emphasis(tokens: Token[]): RichContent[] {
    let at = 0
    while (at < tokens.length) {
      const closer = tokens[at] as Token
      if (closer.kind !== 'delimiter' || !closer.close || closer.count === 0) {
        at += 1
        continue
      }

      const opening = this.#opener(tokens, at, closer)
      if (opening === -1) {
        at += 1
        continue
      }

      at = this.#wrap(tokens, opening, at)
    }

    return tokens.map((token) =>
      token.kind === 'text'
        ? token.text
        : token.kind === 'node'
          ? token.value
          : token.character.repeat(token.count),
    )
  }

  #opener(
    tokens: readonly Token[],
    closing: number,
    closer: Token & { kind: 'delimiter' },
  ): number {
    for (let index = closing - 1; index >= 0; index -= 1) {
      const opener = tokens[index] as Token
      if (opener.kind !== 'delimiter' || opener.character !== closer.character) continue
      if (!opener.open || opener.count === 0) continue
      // The rule of three: a run that can both open and close does not pair
      // with one whose length would make the sum a multiple of three.
      const either = opener.close || closer.open
      if (
        either &&
        (opener.length + closer.length) % 3 === 0 &&
        !(opener.length % 3 === 0 && closer.length % 3 === 0)
      ) {
        continue
      }

      return index
    }

    return -1
  }

  /** Wrap what lies between an opener and a closer; returns where to look next. */
  #wrap(tokens: Token[], opening: number, closing: number): number {
    const opener = tokens[opening] as Token & { kind: 'delimiter' }
    const closer = tokens[closing] as Token & { kind: 'delimiter' }
    const use = opener.count >= 2 && closer.count >= 2 ? 2 : 1
    const inner = tokens.splice(opening + 1, closing - opening - 1)
    const content = this.#emphasis(inner)
    tokens.splice(opening + 1, 0, {
      kind: 'node',
      value: use === 2 ? bold(content) : italic(content),
    })
    opener.count -= use
    closer.count -= use

    let next = opening + 2
    if (opener.count === 0) {
      tokens.splice(opening, 1)
      next -= 1
    }
    if (closer.count === 0) tokens.splice(next, 1)

    return next
  }
}

/** Find `marker` from `from`, skipping escapes and code spans. */
function findMarker(source: string, from: number, marker: string): number | undefined {
  for (let index = from; index < source.length; index += 1) {
    const character = source[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === '`') {
      const close = source.indexOf('`', index + 1)
      if (close === -1) return undefined
      index = close
      continue
    }
    if (source.startsWith(marker, index) && !WHITESPACE.test(source[index - 1] ?? ' ')) return index
  }

  return undefined
}

/** The `]` closing a `[`, counting nested brackets and skipping escapes. */
function closingBracket(source: string, open: number): number {
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    const character = source[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === '[') depth += 1
    if (character === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

/** A link's target, `(url)` or `(url "title")`, with escapes resolved. */
function readTarget(
  source: string,
  from: number,
): { readonly url: string; readonly title?: string; readonly end: number } | undefined {
  let url = ''
  let depth = 0
  let index = from
  while (index < source.length && source[index] === ' ') index += 1

  for (; index < source.length; index += 1) {
    const character = source[index] as string
    if (character === '\\' && index + 1 < source.length) {
      url += source[index + 1]
      index += 1
      continue
    }
    if (character === '(') depth += 1
    if (character === ')') {
      if (depth === 0) return { url, end: index + 1 }
      depth -= 1
    }
    if (character === ' ') break
    url += character
  }

  const title = /^\s+"((?:[^"\\]|\\.)*)"\s*\)/.exec(source.slice(index))
  if (title === null) return undefined

  return { url, title: (title[1] as string).replace(/\\(.)/g, '$1'), end: index + title[0].length }
}

/** Where the tag closing `name`, opened just before `from`, is, counting nested ones. */
function closingTag(
  source: string,
  from: number,
  name: string,
): { readonly start: number; readonly end: number } | undefined {
  const pattern = new RegExp(`<(/?)${name}(?=[\\s/>])[^>]*>`, 'gi')
  pattern.lastIndex = from
  let depth = 1

  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    if (match[1] === '/') depth -= 1
    else if (!match[0].endsWith('/>')) depth += 1
    if (depth === 0) return { start: match.index, end: match.index + match[0].length }
  }

  return undefined
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^ {0,3}>/
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/
const FOOTNOTE = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]?(.*)$/
const MEDIA_LINE = /^ {0,3}!\[([^\]]*)\]\((.+)\)[ \t]*$/
const TABLE_DIVIDER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const MATH_FENCE = /^ {0,3}\$\$/

/** Block tags that may start a block of HTML inside Markdown. */
const HTML_BLOCKS = new Set(
  [...BLOCK].filter(
    (name) =>
      ![
        'li',
        'input',
        'cite',
        'figcaption',
        'caption',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'summary',
      ].includes(name),
  ),
)

/** Tags whose content is Markdown again, not HTML. */
const MARKDOWN_INSIDE = new Set(['details', 'tg-collage', 'tg-slideshow'])

/** The part of a line after `width` columns of indentation, or `undefined` if it is not indented that far. */
function dedent(line: string, width: number): string | undefined {
  let columns = 0
  let index = 0
  while (index < line.length && columns < width) {
    if (line[index] === ' ') columns += 1
    else if (line[index] === '\t') columns += 4 - (columns % 4)
    else break
    index += 1
  }

  return columns >= width ? line.slice(index) : undefined
}

const isBlankLine = (line: string): boolean => line.trim() === ''

/** A line holding only media. A custom emoji or a moment written the same way is text. */
function isMediaLine(line: string): boolean {
  const match = MEDIA_LINE.exec(line)

  return match !== null && !/^tg:\/\/(emoji|time)\?/.test(match[2] as string)
}

/** Whether a list marker numbers its items, and the character that tells lists apart. */
function markerKind(marker: string): { readonly ordered: boolean; readonly mark: string } {
  const ordered = /\d/.test(marker)

  return { ordered, mark: ordered ? marker.slice(-1) : marker }
}

/** Split a table row into its cells, respecting escaped pipes and code spans. */
function cellsOf(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)

  const cells: string[] = []
  let cell = ''
  let inCode = false
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index] as string
    if (character === '\\' && body[index + 1] === '|') {
      cell += '|'
      index += 1
      continue
    }
    if (character === '`') inCode = !inCode
    if (character === '|' && !inCode) {
      cells.push(cell.trim())
      cell = ''
      continue
    }
    cell += character
  }
  cells.push(cell.trim())

  return cells
}

function alignOf(divider: string): Align {
  const cell = divider.trim()
  if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
  if (cell.endsWith(':')) return 'right'

  return 'left'
}

/** Reads lines of Markdown into blocks. */
class BlockParser {
  constructor(
    readonly reader: MarkdownReader,
    readonly source: string,
    readonly options: RichParseOptions,
    readonly references: readonly string[],
  ) {}

  fail(message: string, line: number): never {
    const offset = this.source.split('\n').slice(0, line).join('\n').length

    throw new RichParseError(message, offset, this.source)
  }

  parse(lines: readonly string[]): InputRichBlock[] {
    const out: InputRichBlock[] = []
    let index = 0

    while (index < lines.length) {
      const line = lines[index] as string
      if (isBlankLine(line)) {
        index += 1
        continue
      }

      const read = this.#block(lines, index)
      out.push(...read.blocks)
      index = read.next
    }

    return out
  }

  #block(lines: readonly string[], index: number): { blocks: InputRichBlock[]; next: number } {
    const line = lines[index] as string

    if (FENCE.test(line)) return this.#fence(lines, index)
    if (MATH_FENCE.test(line)) return this.#mathFence(lines, index)
    const heading_ = HEADING.exec(line)
    if (heading_ !== null) {
      const level = (heading_[1] as string).length as 1
      return { blocks: [heading(level, this.reader.markdown(heading_[2] ?? ''))], next: index + 1 }
    }
    if (RULE.test(line)) return { blocks: [divider()], next: index + 1 }
    if (QUOTE.test(line)) return this.#quote(lines, index)
    if (ITEM.test(line)) return this.#list(lines, index)
    if (FOOTNOTE.test(line)) return this.#skipFootnote(lines, index)
    if (this.#htmlStart(line) !== undefined) return this.#html(lines, index)
    if (this.#isTableStart(lines, index)) return this.#table(lines, index)
    if (isMediaLine(line)) {
      return {
        blocks: [this.#mediaLine(MEDIA_LINE.exec(line) as RegExpExecArray, index)],
        next: index + 1,
      }
    }

    return this.#paragraph(lines, index)
  }

  /** Whether a line starts something that ends the paragraph before it. */
  #interrupts(lines: readonly string[], index: number): boolean {
    const line = lines[index] as string

    return (
      isBlankLine(line) ||
      FENCE.test(line) ||
      MATH_FENCE.test(line) ||
      HEADING.test(line) ||
      RULE.test(line) ||
      QUOTE.test(line) ||
      ITEM.test(line) ||
      FOOTNOTE.test(line) ||
      this.#htmlStart(line) !== undefined ||
      this.#isTableStart(lines, index) ||
      isMediaLine(line)
    )
  }

  #paragraph(lines: readonly string[], index: number): { blocks: InputRichBlock[]; next: number } {
    const taken: string[] = [lines[index] as string]
    let next = index + 1
    while (next < lines.length && !this.#interrupts(lines, next)) {
      taken.push(lines[next] as string)
      next += 1
    }

    // A line ending in two spaces or a backslash breaks; any other runs on.
    let text = ''
    taken.forEach((line, at) => {
      const last = at === taken.length - 1
      const hard = /( {2,}|\\)$/.test(line)
      const content = line
        .replace(/^[ \t]+/, '')
        .replace(last ? /[ \t]+$/ : /( {2,}|\\|[ \t]+)$/, '')
      text += content + (last ? '' : hard ? '\n' : ' ')
    })

    const anchor = /^<a\s+name\s*=\s*"([^"]+)"\s*>\s*<\/a>$/i.exec(text)
    if (anchor !== null) return { blocks: [anchorBlock(anchor[1] as string)], next }

    const rich = this.reader.markdown(text)

    return { blocks: isEmptyRichText(rich) ? [] : [paragraph(rich)], next }
  }

  #fence(lines: readonly string[], index: number): { blocks: InputRichBlock[]; next: number } {
    const opening = FENCE.exec(lines[index] as string) as RegExpExecArray
    const indent = (opening[1] as string).length
    const fence = opening[2] as string
    const language = opening[3] ?? ''
    const body: string[] = []
    let next = index + 1

    while (next < lines.length) {
      const line = lines[next] as string
      const closing = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`)
      if (closing.test(line)) {
        next += 1
        break
      }
      body.push(dedent(line, indent) ?? line.trimStart())
      next += 1
      if (next === lines.length && !this.options.lenient)
        this.fail('a code block is never closed', index)
    }

    const text = body.join('\n')
    if (language === 'math') return { blocks: [mathBlock(text.trim())], next }

    return { blocks: [codeBlock(text, language === '' ? undefined : language)], next }
  }

  #mathFence(lines: readonly string[], index: number): { blocks: InputRichBlock[]; next: number } {
    const first = (lines[index] as string).trim().slice(2)
    if (first.endsWith('$$') && first.length > 2) {
      return { blocks: [mathBlock(first.slice(0, -2).trim())], next: index + 1 }
    }

    const body: string[] = [first]
    let next = index + 1
    while (next < lines.length) {
      const line = (lines[next] as string).trimEnd()
      next += 1
      if (line.endsWith('$$')) {
        body.push(line.slice(0, -2))
        return { blocks: [mathBlock(body.join('\n').trim())], next }
      }
      body.push(line)
    }

    if (!this.options.lenient) this.fail('a formula opened with $$ is never closed', index)

    return { blocks: [mathBlock(body.join('\n').trim())], next }
  }

  #quote(lines: readonly string[], index: number): { blocks: InputRichBlock[]; next: number } {
    const inner: string[] = []
    let next = index
    while (next < lines.length) {
      const line = lines[next] as string
      if (QUOTE.test(line)) {
        inner.push(line.replace(/^ {0,3}> ?/, ''))
        next += 1
        continue
      }
      // A line running on from a quoted paragraph belongs to it.
      const previous = inner.at(-1)
      if (previous !== undefined && !isBlankLine(previous) && !this.#interrupts(lines, next)) {
        inner.push(line)
        next += 1
        continue
      }
      break
    }

    return { blocks: [blockquote(this.parse(inner))], next }
  }

  #list(lines: readonly string[], index: number): { blocks: InputRichBlock[]; next: number } {
    const first = ITEM.exec(lines[index] as string) as RegExpExecArray
    const kind = markerKind(first[2] as string)
    const start = kind.ordered ? Number.parseInt(first[2] as string, 10) : 1
    const items: InputRichBlockListItem[] = []
    let next = index

    for (
      let match = this.#sibling(lines, next, kind);
      match !== undefined;
      match = this.#sibling(lines, next, kind)
    ) {
      const marker = match[2] as string
      const content =
        (match[1] as string).length +
        marker.length +
        Math.min(Math.max((match[3] as string).length, 1), 4)
      const read = this.#itemBody(lines, next + 1, content, match[4] ?? '')
      items.push(this.#item(read.body, kind.ordered ? start + items.length : undefined))
      next = read.next

      // Blank lines between two items belong to the list.
      while (isBlankLine(lines[next] ?? 'end') && ITEM.test(lines[next + 1] ?? '')) next += 1
    }

    return { blocks: [{ type: 'list', items } as InputRichBlock], next }
  }

  /** The item a line opens, if it is another item of the same list. */
  #sibling(
    lines: readonly string[],
    index: number,
    kind: { readonly ordered: boolean; readonly mark: string },
  ): RegExpExecArray | undefined {
    const line = lines[index]
    if (line === undefined || RULE.test(line)) return undefined
    const match = ITEM.exec(line)
    if (match === null) return undefined
    const other = markerKind(match[2] as string)

    return other.ordered === kind.ordered && other.mark === kind.mark ? match : undefined
  }

  /**
   * The lines of one list item: its first line, those indented to its content,
   * a line running on from its last paragraph, and a blank line only where the
   * item goes on after it.
   */
  #itemBody(
    lines: readonly string[],
    from: number,
    content: number,
    first: string,
  ): { readonly body: string[]; readonly next: number } {
    const body = [first]
    let next = from

    while (next < lines.length) {
      const line = lines[next] as string
      const inside = dedent(line, content)
      if (isBlankLine(line)) {
        const after = lines[next + 1]
        if (after === undefined || dedent(after, content) === undefined || isBlankLine(after)) break
        body.push('')
      } else if (inside !== undefined) {
        body.push(inside)
      } else if (!isBlankLine(body.at(-1) ?? '') && !this.#interrupts(lines, next)) {
        body.push(line.trimStart())
      } else {
        break
      }
      next += 1
    }

    return { body, next }
  }

  #item(body: string[], value: number | undefined): InputRichBlockListItem {
    const task = /^\[([ xX])\](?:[ \t]+|$)(.*)$/.exec(body[0] ?? '')
    const lines = task === null ? body : [task[2] ?? '', ...body.slice(1)]

    return {
      blocks: this.parse(lines),
      ...(task === null ? {} : { has_checkbox: true as const }),
      ...(task !== null && task[1] !== ' ' ? { is_checked: true as const } : {}),
      ...(value === undefined ? {} : { value, type: '1' }),
    }
  }

  /** Footnote definitions were read before; here they are passed over. */
  #skipFootnote(
    lines: readonly string[],
    index: number,
  ): { blocks: InputRichBlock[]; next: number } {
    let next = index + 1
    while (
      next < lines.length &&
      dedent(lines[next] as string, 4) !== undefined &&
      !isBlankLine(lines[next] as string)
    ) {
      next += 1
    }

    return { blocks: [], next }
  }

  #isTableStart(lines: readonly string[], index: number): boolean {
    const header = lines[index] as string
    const divider = lines[index + 1]

    return (
      divider !== undefined &&
      header.includes('|') &&
      TABLE_DIVIDER.test(divider) &&
      divider.includes('-')
    )
  }

  #table(lines: readonly string[], index: number): { blocks: InputRichBlock[]; next: number } {
    const header = cellsOf(lines[index] as string)
    const aligns = cellsOf(lines[index + 1] as string).map(alignOf)
    const rows: string[][] = [header]
    let next = index + 2
    while (
      next < lines.length &&
      !isBlankLine(lines[next] as string) &&
      (lines[next] as string).includes('|')
    ) {
      rows.push(cellsOf(lines[next] as string))
      next += 1
    }

    const cells = rows.map((row, rowIndex) =>
      header.map(
        (_, column): TableCell => ({
          text: this.reader.markdown(row[column] ?? ''),
          header: rowIndex === 0,
          align: aligns[column] ?? 'left',
        }),
      ),
    )

    return { blocks: [table(cells, { header: false })], next }
  }

  #mediaLine(match: RegExpExecArray, index: number): InputRichBlock {
    const target = readTarget(`${match[2] as string})`, 0)
    if (target === undefined) this.fail('a media line is ![](address "caption")', index)

    return this.reader.mediaBlock(
      target.url,
      undefined,
      target.title === undefined || target.title === ''
        ? {}
        : { caption: this.reader.markdown(target.title) },
      0,
    )
  }

  /** The block tag a line opens, if it opens one. */
  #htmlStart(line: string): string | undefined {
    const match = /^ {0,3}<([a-z][a-z0-9-]*)(?=[\s/>])/i.exec(line)
    const name = match?.[1]?.toLowerCase()
    if (name === undefined || !HTML_BLOCKS.has(name)) return undefined
    // An emoji written as an image is text, not a block.
    if (name === 'img' && /src\s*=\s*["']?tg:\/\/emoji\?/i.test(line)) return undefined

    return name
  }

  #html(lines: readonly string[], index: number): { blocks: InputRichBlock[]; next: number } {
    const name = this.#htmlStart(lines[index] as string) as string
    const rest = lines.slice(index).join('\n')
    const start = rest.indexOf('<')
    const tag = tagAt(rest, start)
    if (tag === undefined) this.fail(`<${name}> is not a tag this reads`, index)

    const selfContained = tag.selfClosing || ['hr', 'img', 'tg-map', 'input'].includes(name)
    const close = selfContained ? { start: tag.end, end: tag.end } : closingTag(rest, tag.end, name)
    if (close === undefined) {
      if (!this.options.lenient) this.fail(`<${name}> is never closed`, index)

      return this.#paragraph(lines, index)
    }

    // The block runs to the end of the line its closing tag is on.
    const lineEnd = rest.indexOf('\n', close.end)
    const end = lineEnd === -1 ? rest.length : lineEnd
    const next = index + rest.slice(0, end).split('\n').length

    // A collage or slideshow written in HTML — its media as tags, a caption in
    // <figcaption> — is read as HTML; one written as Markdown media lines is not.
    const inner = rest.slice(tag.end, close.start)
    const writtenAsHtml = name !== 'details' && /<(img|video|figcaption)\b/i.test(inner)
    if (MARKDOWN_INSIDE.has(name) && !writtenAsHtml) {
      return {
        blocks: [
          this.#markdownInside(name, tag.attributes, rest.slice(tag.end, close.start), index),
        ],
        next,
      }
    }

    const segment = rest.slice(start, close.end)
    const nodes = readRichHtmlTree(segment, this.options.lenient === true)
    const html = new RichHtmlReader(segment, this.options, nodes, this.references)
    const trailing = rest.slice(close.end, end)
    const blocks = html.blocks(nodes)
    if (trailing.trim() !== '') blocks.push(paragraph(this.reader.markdown(trailing.trim())))

    return { blocks, next }
  }

  /** `<details>`, `<tg-collage>` and `<tg-slideshow>`, whose content is Markdown. */
  #markdownInside(
    name: string,
    attributes: ReadonlyMap<string, string>,
    inner: string,
    index: number,
  ): InputRichBlock {
    if (name === 'details') {
      const summary = /^\s*<summary>([\s\S]*?)<\/summary>/i.exec(inner)
      const body = summary === null ? inner : inner.slice(summary[0].length)

      return details(
        summary === null ? '' : this.reader.markdown((summary[1] as string).trim()),
        this.parse(body.split('\n')),
        { open: attributes.has('open') },
      )
    }

    const items = this.parse(inner.split('\n'))
    const media = items.filter((block) =>
      ['photo', 'video', 'animation'].includes((block as { type: string }).type),
    )
    if (media.length !== items.length && !this.options.lenient) {
      this.fail(`<${name}> holds photos and videos only`, index)
    }

    return name === 'tg-collage' ? collage(media) : slideshow(media)
  }
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                                */
/* -------------------------------------------------------------------------- */

/** Footnote definitions, in the order they are written, with the text of each. */
function footnotesOf(lines: readonly string[]): Map<string, string> {
  const found = new Map<string, string>()
  lines.forEach((line, index) => {
    const match = FOOTNOTE.exec(line)
    if (match === null || found.has(match[1] as string)) return

    const text = [match[2] ?? '']
    for (let next = index + 1; next < lines.length; next += 1) {
      const indented = dedent(lines[next] as string, 4)
      if (indented === undefined || isBlankLine(lines[next] as string)) break
      text.push(indented)
    }
    found.set(match[1] as string, text.join(' '))
  })

  return found
}

/**
 * Read rich Markdown into the blocks it describes.
 *
 * ```ts
 * const blocks = parseRichMarkdown('# Report\n\nRevenue is **up 12%**.')
 * ```
 *
 * Media named by `tg://photo?id=…` and its kin are found in `options.media`.
 * Read strictly, a message over Telegram's limits is refused too.
 */
export function parseRichMarkdown(
  source: string,
  options: RichParseOptions = {},
): InputRichBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const footnotes = footnotesOf(lines)
  const numbers = new Map([...footnotes.keys()].map((id, index) => [id, index + 1]))
  const references = [
    ...[...source.matchAll(/<tg-reference\s+name\s*=\s*"([^"]+)"/gi)].map(
      (match) => match[1] as string,
    ),
    ...footnotes.keys(),
  ]

  const reader = new MarkdownReader(source, options, references, numbers)
  const blocks = new BlockParser(reader, source, options, references).parse(lines)

  for (const [id, text] of footnotes) {
    blocks.push(
      paragraph([reference(superscript(String(numbers.get(id))), id), ' ', reader.markdown(text)]),
    )
  }

  if (options.lenient !== true) {
    const over = overLimit(measureRich(blocks))
    if (over !== undefined) throw new RichParseError(over, 0, source)
  }

  return blocks
}

/** Inline rich Markdown, read into rich text: the content of one paragraph. */
export function parseRichMarkdownText(source: string, options: RichParseOptions = {}): RichText {
  return new MarkdownReader(source, options, [], new Map()).markdown(source)
}
