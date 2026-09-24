/**
 * HTML markup, into and out of message entities.
 *
 * Telegram's HTML is a small fixed set of tags rather than a document format —
 * there is no tree to build, because every tag it recognises marks a range of
 * text and nothing nests structurally. So this is a scanner with a stack of
 * open ranges, not a parser with a document model.
 *
 * ```
 *   <b>Hello <i>there</i></b>
 *      └─ opens at 0                  bold      @0 length 11
 *             └─ opens at 6           italic    @6 length 5
 * ```
 *
 * By default anything not in the set is left in the text as written. A message
 * containing `2 < 3` should arrive saying `2 < 3`, and treating an unrecognised
 * `<` as a broken tag would either drop it or refuse the message. This is
 * markup a developer typed, not a document from the network, so recovering is
 * better than rejecting — and a caller who wants the refusal asks for the
 * `strict` mode, which names where the markup went wrong.
 */

import type { TypeMessageEntity } from '../generated/api/types/index.js'
import { dateFlags, dateFormat } from './neutral.js'
import {
  type Assembled,
  assemble,
  checkMode,
  type Dialect,
  dedent,
  type FormattedText,
  type Markup,
  type MarkupMode,
  markerRuns,
  type ParseSettings,
  refuse,
  restore,
  sortEntities,
  withinText,
} from './text.js'

/**
 * Characters that would otherwise start a tag or a character reference, or
 * end an attribute's value.
 */
const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Named character references this reads. */
const REFERENCES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
}

/**
 * The tags this reads, each under the one name its closing tag may use.
 *
 * Aliases share a name, so `<b>…</strong>` closes: both mean bold, and a
 * writer switching spellings halfway meant one range, not an unclosed one.
 */
const CANONICAL: Readonly<Record<string, string>> = {
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  u: 'u',
  ins: 'u',
  s: 's',
  strike: 's',
  del: 's',
  'tg-spoiler': 'spoiler',
  spoiler: 'spoiler',
  code: 'code',
  pre: 'pre',
  blockquote: 'blockquote',
  span: 'span',
  'tg-emoji': 'emoji',
  emoji: 'emoji',
  'tg-time': 'tg-time',
  time: 'time',
  a: 'a',
  br: 'br',
}

/** The tags that open a range and carry nothing else, by their canonical name. */
const SIMPLE: Readonly<Record<string, TypeMessageEntity['_']>> = {
  b: 'messageEntityBold',
  i: 'messageEntityItalic',
  u: 'messageEntityUnderline',
  s: 'messageEntityStrike',
  spoiler: 'messageEntitySpoiler',
  code: 'messageEntityCode',
}

/** A date's format: relative, or a day of the week, a date and a time in any order. */
const TIME_FORMAT = /^(?:[rR]|[wWdDtT]*)$/

/** A mention: the person's number, and the hash that addresses them where it is given. */
const MENTION = /^tg:\/\/user\?id=(\d+)(?:&hash=(-?[0-9a-fA-F]+))?(?:&.*)?$/

/** What reading HTML can be told. */
export interface HtmlParseOptions {
  /** What happens to markup that is not well formed. `lenient` unless given. */
  readonly mode?: MarkupMode
  /**
   * What happens to whitespace in the markup. `keep` unless given.
   *
   * - `keep`: every space and line break is text, as Telegram's own HTML reads
   *   it.
   * - `collapse`: as a browser reads it — a run of whitespace is one space,
   *   none at the start of a line or before a `<br>`, and `<br>` is the line
   *   break. `&nbsp;` is a space that stays. Code keeps its whitespace, and so
   *   does an interpolated value.
   * - `dedent`: kept, less the indentation every line of the template shares,
   *   and the empty first and last lines a template written inside indented
   *   code has.
   */
  readonly whitespace?: 'keep' | 'collapse' | 'dedent'
}

/** What writing HTML can be told. */
export interface HtmlWriteOptions {
  /**
   * Write whitespace so that the `collapse` reading gives it back: line breaks
   * as `<br>`, and a space that would collapse as `&nbsp;`.
   */
  readonly whitespace?: 'keep' | 'collapse'
  /**
   * Write the code of a block that names its language.
   *
   * Given the code as text and the language, and returns HTML for the inside
   * of the block, which is written as returned — so it is trusted to escape
   * what it does not mark up.
   */
  readonly highlight?: (code: string, language: string) => string
}

interface OpenTag {
  /** The name as written, for a closing tag's message. */
  readonly written: string
  /** The name a closing tag is matched on. */
  readonly name: string
  readonly at: number
  /** Where in the markup it opened, for a strict parse's message. */
  readonly source: number
  readonly attributes: ReadonlyMap<string, string>
}

/**
 * Escape text so it survives {@link fromHtml} unchanged.
 *
 * Only the three that would otherwise be read as markup, for text written back
 * by {@link toHtml}.
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (character) => ESCAPES[character] as string)
}

/**
 * Escape a value that may land inside an attribute.
 *
 * An interpolated value is text wherever it lands, and it can land between an
 * attribute's quotes: `<a href="https://example.com/${path}">`. Unescaped, a
 * quote in it would end the value and let what follows add attributes of its
 * own — a second `href`, which is the one a reader would follow.
 */
function escapeAttribute(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] as string)
}

/** The character a numeric reference names, or `undefined` if it names none. */
function characterOf(code: number): string | undefined {
  return Number.isNaN(code) || code > 0x10ffff ? undefined : String.fromCodePoint(code)
}

/** What one `&…;` stands for, or `undefined` for a reference that names nothing. */
function referenceOf(body: string): string | undefined {
  const lower = body.toLowerCase()

  if (lower.startsWith('#x')) return characterOf(Number.parseInt(lower.slice(2), 16))
  if (lower.startsWith('#')) return characterOf(Number.parseInt(lower.slice(1), 10))

  return REFERENCES[lower]
}

/** Resolve `&amp;`, `&#39;` and `&#x27;` back to the character each stands for. */
function decodeReferences(text: string): string {
  if (!text.includes('&')) return text

  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, body: string) => referenceOf(body) ?? whole,
  )
}

/** Read `href="…" class='…' expandable` into a map, from just past the tag name. */
function readAttributes(source: string): Map<string, string> {
  const found = new Map<string, string>()
  const pattern = /([a-z0-9-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi

  for (const match of source.matchAll(pattern)) {
    const name = (match[1] as string).toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''

    found.set(name, decodeReferences(value))
  }

  return found
}

/** What the scanner has read so far. */
interface Scan {
  readonly settings: ParseSettings
  readonly collapse: boolean
  readonly markup: string
  text: string
  readonly entities: TypeMessageEntity[]
  readonly open: OpenTag[]
  /**
   * The language from a `<code>` sitting directly inside a `<pre>`.
   *
   * The two together are one entity: the range belongs to the outer tag and the
   * language is on the inner one, so it has to survive the inner tag closing.
   */
  language: string | undefined
  /**
   * A space collapsed out of the markup and not yet written.
   *
   * Written only when something follows it on the same line, so a run of
   * whitespace at the start of a line, before a `<br>` or at the end is no
   * space at all, which is how a browser lays the same markup out.
   */
  space: boolean
}

/** Whether text read now is code, which keeps its whitespace whatever the mode. */
function inCode(scan: Scan): boolean {
  return scan.open.some((one) => one.name === 'pre' || one.name === 'code')
}

/** Write the space a collapsed run left, if anything is written after it. */
function flushSpace(scan: Scan): void {
  if (!scan.space) return
  scan.space = false
  if (scan.text !== '' && !scan.text.endsWith('\n')) scan.text += ' '
}

/** Add text read from the markup, whitespace read the way the mode says. */
function addText(scan: Scan, raw: string): void {
  if (raw === '') return

  if (!scan.collapse || inCode(scan)) {
    flushSpace(scan)
    scan.text += decodeReferences(raw)

    return
  }

  // Whitespace other than a no-break space is a separator, however much of it
  // there is. What a reference spells is text, so the references are resolved
  // after the runs are found: `&nbsp;` survives as the space it stands for.
  for (const piece of raw.split(/([^\S ]+)/)) {
    if (piece === '') continue
    if (/^[^\S ]+$/.test(piece)) {
      scan.space = true
      continue
    }

    flushSpace(scan)
    scan.text += decodeReferences(piece).replace(/ /g, ' ')
  }
}

/** Add an interpolated value's token, which keeps its whitespace in every mode. */
function addToken(scan: Scan, token: string): void {
  flushSpace(scan)
  scan.text += token
}

/**
 * The entity a closing tag completes, or `undefined` where the tag marks no
 * range.
 *
 * A `<pre>` wrapping a `<code class="language-x">` is one entity carrying the
 * language, not two nested ones, so the inner `code` reports nothing and the
 * outer `pre` reads the language off it.
 */
function entityFor(
  scan: Scan,
  open: OpenTag,
  length: number,
  language: string | undefined,
): TypeMessageEntity | undefined {
  const offset = open.at
  const simple = SIMPLE[open.name]

  if (simple !== undefined) {
    return { _: simple, offset, length } as TypeMessageEntity
  }

  const attributes = open.attributes
  const problem = (message: string): undefined => {
    refuse(scan.settings, message, open.source, scan.markup)

    return undefined
  }

  switch (open.name) {
    case 'pre':
      return {
        _: 'messageEntityPre',
        offset,
        length,
        language: language ?? attributes.get('language') ?? '',
      }

    case 'blockquote': {
      // `expandable` is Telegram's own spelling; `collapsible` and `collapsed`
      // are read as the same thing, since markup written for other clients
      // uses them.
      const collapsed =
        attributes.has('expandable') || attributes.has('collapsible') || attributes.has('collapsed')

      return collapsed
        ? { _: 'messageEntityBlockquote', offset, length, collapsed: true }
        : { _: 'messageEntityBlockquote', offset, length }
    }

    case 'span':
      return attributes.get('class')?.split(/\s+/).includes('tg-spoiler') === true
        ? { _: 'messageEntitySpoiler', offset, length }
        : problem('a <span> formats nothing unless its class is tg-spoiler')

    case 'emoji': {
      const id = attributes.get('emoji-id') ?? attributes.get('id')
      // An identifier is a number, and a signed one: document identifiers are
      // 64-bit and may be written negative. Anything else names no emoji.
      if (id === undefined || !/^-?\d+$/.test(id)) {
        return problem(`<${open.written}> needs a numeric emoji-id`)
      }

      return { _: 'messageEntityCustomEmoji', offset, length, document_id: BigInt(id) }
    }

    case 'tg-time':
    case 'time':
      return dateEntity(scan, open, offset, length)

    case 'a': {
      const href = attributes.get('href')
      if (href === undefined || href === '') return problem('an <a> needs an href')

      return linkEntity(href, offset, length)
    }

    default:
      return undefined
  }
}

/** A `<tg-time unix format>` or `<time datetime format>`, as a formatted date. */
function dateEntity(
  scan: Scan,
  open: OpenTag,
  offset: number,
  length: number,
): TypeMessageEntity | undefined {
  const attributes = open.attributes
  const format = attributes.get('format')
  let date: number | undefined

  if (open.name === 'tg-time') {
    const unix = attributes.get('unix') ?? ''
    date = /^\d+$/.test(unix) ? Number(unix) : undefined
  } else {
    // A `<time>` names its moment the way HTML does: a date and time a reader
    // can parse, or a bare number of seconds.
    const written = attributes.get('datetime') ?? ''
    const parsed = /^\d+$/.test(written) ? Number(written) * 1000 : Date.parse(written)
    date = Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000)
  }

  if (date === undefined || !Number.isSafeInteger(date)) {
    refuse(scan.settings, `<${open.written}> names no moment in seconds`, open.source, scan.markup)

    return undefined
  }

  if (format !== undefined && !TIME_FORMAT.test(format)) {
    refuse(
      scan.settings,
      `'${format}' is not a date format: r, or w, d or D, and t or T`,
      open.source,
      scan.markup,
    )

    return undefined
  }

  return {
    _: 'messageEntityFormattedDate',
    offset,
    length,
    date,
    ...dateFlags(format),
  } as TypeMessageEntity
}

/**
 * What an address becomes.
 *
 * `tg://user?id=N` is a mention, which carries the person's number rather than
 * the link. Sending one needs the person's access hash; with `&hash=H` — the
 * hash in hexadecimal — the markup carries it and the mention is already in
 * the form a send takes. Without it the account supplies the hash from the
 * peers it knows when the message is sent. An address beginning `//` names no
 * scheme and is read as `http:`, as a browser would.
 */
function linkEntity(href: string, offset: number, length: number): TypeMessageEntity {
  const mentioned = MENTION.exec(href)

  if (mentioned !== null) {
    const userId = BigInt(mentioned[1] as string)
    const hash = mentioned[2]

    if (hash !== undefined) {
      return {
        _: 'inputMessageEntityMentionName',
        offset,
        length,
        user_id: { _: 'inputUser', user_id: userId, access_hash: signedHex(hash) },
      } as TypeMessageEntity
    }

    return { _: 'messageEntityMentionName', offset, length, user_id: userId }
  }

  return {
    _: 'messageEntityTextUrl',
    offset,
    length,
    url: href.startsWith('//') ? `http:${href}` : href,
  }
}

/** A hash written in hexadecimal, as the signed 64-bit number it stands for. */
export function signedHex(written: string): bigint {
  const negative = written.startsWith('-')
  const magnitude = BigInt(`0x${negative ? written.slice(1) : written}`)

  return BigInt.asIntN(64, negative ? -magnitude : magnitude)
}

/** Whether this open tag is the `<code>` that gives a `<pre>` its language. */
function isPreLanguage(scan: Scan, depth: number): boolean {
  return scan.open[depth]?.name === 'code' && scan.open[depth - 1]?.name === 'pre'
}

/**
 * Close every tag still open at or above `depth`, innermost first.
 *
 * Anything left open inside a tag being closed is closed by it, which is what a
 * reader of the markup would expect and what the alternative — discarding it —
 * would silently lose.
 */
function closeThrough(scan: Scan, depth: number): void {
  for (let index = scan.open.length - 1; index >= depth; index -= 1) {
    const one = scan.open[index] as OpenTag

    if (isPreLanguage(scan, index)) {
      scan.language = one.attributes.get('class')?.replace(/^language-/, '') ?? ''
      continue
    }

    const entity = entityFor(scan, one, scan.text.length - one.at, scan.language)

    if (entity !== undefined) scan.entities.push(entity)
    if (one.name === 'pre') scan.language = undefined
  }

  scan.open.length = Math.max(depth, 0)
}

/** Take a closing tag. Returns the text to keep where nothing was open for it. */
function takeClose(scan: Scan, raw: string, at: number): string {
  const written = raw.slice(1).trim().toLowerCase()
  const name = CANONICAL[written] ?? written
  const depth = scan.open.findLastIndex((one) => one.name === name)

  // A closing tag nothing opened is text, not an error, and it is kept exactly
  // as it was written rather than as this read it.
  if (depth === -1) {
    refuse(scan.settings, `</${written}> closes nothing that is open`, at, scan.markup)

    return `<${raw}>`
  }

  // A tag left open inside this one is closed with it — in a strict parse
  // that is a tag the writer forgot, and said so.
  if (depth < scan.open.length - 1) {
    const inner = scan.open[scan.open.length - 1] as OpenTag
    refuse(scan.settings, `<${inner.written}> is still open`, inner.source, scan.markup)
  }

  closeThrough(scan, depth)

  return ''
}

/** Take an opening tag. Returns the text to keep where the tag is not one of ours. */
function takeOpen(scan: Scan, raw: string, at: number): string {
  const inside = raw.trim()
  const selfClosing = inside.endsWith('/')
  const body = selfClosing ? inside.slice(0, -1).trim() : inside
  const space = body.search(/\s/)
  const written = (space === -1 ? body : body.slice(0, space)).toLowerCase()
  const name = CANONICAL[written]

  // `2 < 3 and 4 > 3` reaches here as a tag named `3`. It is not one, and what
  // goes back into the text is what the writer typed, spacing included.
  if (name === undefined) {
    refuse(scan.settings, `<${written}> is not a tag this reads`, at, scan.markup)

    return `<${raw}>`
  }

  if (name === 'br') {
    // A line break, in every whitespace mode. What was collapsed before it
    // ends the line rather than being written as a space.
    scan.space = false
    scan.text += '\n'

    return ''
  }

  // A tag that marks no range cannot format anything.
  if (selfClosing) return ''

  // Whatever space is waiting was before this tag, so it goes outside it.
  flushSpace(scan)

  scan.open.push({
    written,
    name,
    at: scan.text.length,
    source: at,
    attributes: readAttributes(space === -1 ? '' : body.slice(space)),
  })

  return ''
}

/** Where a template value placed after this much HTML would land. */
const DIALECT: Dialect = {
  // Inside a tag — between its `<` and its `>` — a value is an attribute's.
  placement: (markup) => (markup.lastIndexOf('<') > markup.lastIndexOf('>') ? 'address' : 'text'),
  escapeAddress: escapeAttribute,
}

/** Read one piece of assembled markup. */
function parse(assembled: Assembled, options: HtmlParseOptions): FormattedText {
  const markup = assembled.markup
  const settings: ParseSettings = { mode: checkMode(options.mode) }
  const scan: Scan = {
    settings,
    collapse: options.whitespace === 'collapse',
    markup,
    text: '',
    entities: [],
    open: [],
    language: undefined,
    space: false,
  }
  let at = 0

  while (at < markup.length) {
    const next = markup.indexOf('<', at)
    const upTo = next === -1 ? markup.length : next

    readText(scan, markup.slice(at, upTo), at, assembled.token)
    if (next === -1) break

    // A tag's name follows its `<` at once, as in HTML itself. `2 < 3` is a
    // comparison, and reading on to the next `>` would swallow whatever real
    // tag came after it.
    const after = markup[next + 1]
    if (after !== undefined && !/[a-z/]/i.test(after)) {
      refuse(settings, "a '<' that starts no tag", next, markup)
      addText(scan, '<')
      at = next + 1
      continue
    }

    const end = markup.indexOf('>', next)

    // A `<` with no `>` after it is not a tag at all.
    if (end === -1) {
      if (
        settings.mode === 'partial' &&
        /^<\/?(?:[a-z][a-z0-9-]*(?:\s[^<]*)?)?$/i.test(markup.slice(next))
      ) {
        // A tag still arriving: held back rather than shown as text.
        break
      }
      refuse(settings, "a '<' that starts no tag", next, markup)
      readText(scan, markup.slice(next), next, assembled.token)
      break
    }

    const raw = markup.slice(next + 1, end)
    at = end + 1

    if (raw.trim() === '') {
      refuse(settings, "a '<' that starts no tag", next, markup)
      addText(scan, `<${raw}>`)
      continue
    }

    const kept = raw.trimStart().startsWith('/')
      ? takeClose(scan, raw.trim(), next)
      : takeOpen(scan, raw, next)
    if (kept !== '') addText(scan, kept)
  }

  // Whatever is still open at the end runs to the end.
  const unclosed = scan.open[0]
  if (unclosed !== undefined && settings.mode === 'strict') {
    refuse(settings, `<${unclosed.written}> is never closed`, unclosed.source, markup)
  }
  closeThrough(scan, 0)

  return restore(withinText({ text: scan.text, entities: sortEntities(scan.entities) }), assembled)
}

/**
 * Read text between tags: characters, references, and the tokens that stand
 * for interpolated values.
 */
function readText(
  scan: Scan,
  written: string,
  at: number,
  token: { readonly open: string; readonly close: string },
): void {
  let text = written
  if (text === '') return

  if (scan.settings.mode !== 'lenient') checkReferences(scan, text, at)

  // A reference still arriving is held back rather than shown half written.
  if (scan.settings.mode === 'partial' && at + text.length === scan.markup.length) {
    text = text.replace(/&#?[a-z0-9]*$/i, '')
  }

  if (token.open === '' || !text.includes(token.open)) {
    addText(scan, text)

    return
  }

  // A token is text that keeps its whitespace, so it is added apart from the
  // markup around it.
  for (const piece of text.split(new RegExp(`(${token.open}\\d+${token.close})`))) {
    if (piece.startsWith(token.open)) addToken(scan, piece)
    else addText(scan, piece)
  }
}

/**
 * Refuse an `&` that is not a reference, in a strict parse, and hold back one
 * cut off at the end, in a partial one.
 */
function checkReferences(scan: Scan, text: string, at: number): void {
  for (const found of text.matchAll(/&([^;&\s<]*)(;?)/g)) {
    const complete = found[2] === ';'
    const offset = at + found.index

    if (complete && referenceOf(found[1] as string) !== undefined) continue
    if (
      scan.settings.mode === 'partial' &&
      !complete &&
      offset + found[0].length === scan.markup.length
    ) {
      continue
    }

    refuse(
      scan.settings,
      `'&${found[1]}${found[2]}' is not a character reference`,
      offset,
      scan.markup,
    )
  }
}

/** A function that reads HTML, called as a template tag or with a string. */
export interface HtmlReader {
  (markup: string): FormattedText
  (parts: TemplateStringsArray, ...values: readonly unknown[]): FormattedText
  /** The same, told how to read. */
  with(options: HtmlParseOptions): HtmlReader
}

function reader(options: HtmlParseOptions): HtmlReader {
  checkMode(options.mode)

  const read = (input: Markup, ...values: readonly unknown[]): FormattedText => {
    const literal = typeof input === 'string' ? [input] : [...input]
    const parts = options.whitespace === 'dedent' ? dedent(literal) : literal

    // A string is markup written in full; a template's values are text.
    const assembled: Assembled =
      typeof input === 'string'
        ? { markup: parts[0] ?? '', slots: [], token: { open: '', close: '' } }
        : assemble(parts, values, DIALECT)

    return parse(assembled, options)
  }

  return Object.assign(read as HtmlReader, {
    with: (more: HtmlParseOptions) => reader({ ...options, ...more }),
  })
}

/**
 * Read HTML markup into text and the ranges formatted within it.
 *
 * ```ts
 * const body = fromHtml`Hello, <b>${name}</b>`
 *
 * await account.sendText(peer, body)
 * ```
 *
 * Called as a template tag, an interpolated value is text wherever it lands: a
 * `<b>` in a user's name arrives as `<b>`, a quote cannot end an attribute, and
 * a value that is itself formatted — what this returns, or what
 * `@yuigram/core/format` builds — keeps its ranges inside whatever the markup
 * puts around it. `null`, `undefined`, `true` and `false` contribute nothing.
 * Called with a plain string, the whole string is markup.
 *
 * Recognised: `b`/`strong`, `i`/`em`, `u`/`ins`, `s`/`strike`/`del`,
 * `tg-spoiler`/`spoiler` and `<span class="tg-spoiler">`, `code`, `pre` (with
 * `language="…"` or `<code class="language-…">` inside for the language),
 * `blockquote` (`expandable`, or `collapsible`, for a collapsed one),
 * `tg-emoji emoji-id="…"`/`emoji id="…"`, `tg-time unix="…" format="…"` and
 * `time datetime="…" format="…"` for a formatted date, `br` for a line break,
 * and `a` — where an `href` of `tg://user?id=N` is a mention and anything else
 * a link. A closing tag may use any spelling of the tag it closes.
 *
 * How markup that is not well formed and whitespace are read is chosen with
 * {@link HtmlReader.with}:
 *
 * ```ts
 * const strict = fromHtml.with({ mode: 'strict' })
 * strict('<b>unclosed') // MarkupParseError: <b> is never closed at offset 0
 * ```
 *
 * By default an unrecognised tag is left in the text, an unclosed tag runs to
 * the end, and whitespace is kept as written.
 */
export const fromHtml: HtmlReader = reader({})

/** The markup that opens and closes an entity, or `undefined` for one with none. */
function tagsFor(entity: TypeMessageEntity): readonly [string, string] | undefined {
  switch (entity._) {
    case 'messageEntityBold':
      return ['<b>', '</b>']
    case 'messageEntityItalic':
      return ['<i>', '</i>']
    case 'messageEntityUnderline':
      return ['<u>', '</u>']
    case 'messageEntityStrike':
      return ['<s>', '</s>']
    case 'messageEntitySpoiler':
      return ['<tg-spoiler>', '</tg-spoiler>']
    case 'messageEntityCode':
      return ['<code>', '</code>']
    case 'messageEntityPre':
      return entity.language === ''
        ? ['<pre>', '</pre>']
        : [`<pre><code class="language-${escapeAttribute(entity.language)}">`, '</code></pre>']
    case 'messageEntityBlockquote':
      return entity.collapsed === true
        ? ['<blockquote expandable>', '</blockquote>']
        : ['<blockquote>', '</blockquote>']
    case 'messageEntityTextUrl':
      return [`<a href="${escapeAttribute(entity.url)}">`, '</a>']
    case 'messageEntityMentionName':
      return [`<a href="tg://user?id=${entity.user_id}">`, '</a>']
    case 'inputMessageEntityMentionName': {
      const user = entity.user_id
      // The hash goes with the number where the mention carries one, so the
      // markup reads back to a mention that can be sent as it is.
      return user._ === 'inputUser'
        ? [`<a href="tg://user?id=${user.user_id}&amp;hash=${hexOf(user.access_hash)}">`, '</a>']
        : undefined
    }
    case 'messageEntityCustomEmoji':
      return [`<tg-emoji emoji-id="${entity.document_id}">`, '</tg-emoji>']
    case 'messageEntityFormattedDate': {
      const format = dateFormat(entity as unknown as Record<string, unknown>)

      return [
        `<tg-time unix="${entity.date}"${format === '' ? '' : ` format="${format}"`}>`,
        '</tg-time>',
      ]
    }
    default:
      // Mentions, hashtags, bare links and the rest are found by the server in
      // the text itself. Writing markup around them would change nothing about
      // the message and would show tags to a reader that re-parsed it.
      return undefined
  }
}

/** A signed 64-bit hash in the hexadecimal a mention's address writes it in. */
function hexOf(value: bigint): string {
  return value < 0n ? `-${(-value).toString(16)}` : value.toString(16)
}

/**
 * Write text and its entities back as HTML markup.
 *
 * The inverse of {@link fromHtml} for everything markup can express. Entities
 * the server detects on its own — mentions, hashtags, bare links, phone
 * numbers, bank cards — are left as plain text, because marking them up would
 * change nothing about the message.
 *
 * Overlapping ranges are closed and reopened where they cross, so every
 * character parses back with the formatting it had even where Telegram's
 * entities were not nested to begin with; a range that crossed another comes
 * back as two ranges side by side.
 *
 * With `highlight`, the code of a block that names its language is written as
 * the highlighter returns it. With `whitespace: 'collapse'`, what is written
 * reads back the same through `fromHtml.with({ whitespace: 'collapse' })`.
 */
export function toHtml(value: FormattedText, options: HtmlWriteOptions = {}): string {
  const code = codeRanges(value)
  const highlighted = options.highlight === undefined ? [] : highlightedBlocks(value)
  const runs = markerRuns(value, tagsFor)

  let out = ''
  let at = 0

  while (at <= value.text.length) {
    const run = runs.get(at)
    out += run?.close ?? ''
    out += run?.open ?? ''
    if (at === value.text.length) break

    const block = highlighted.find((one) => one.offset === at)
    if (block !== undefined && options.highlight !== undefined) {
      out += options.highlight(value.text.slice(at, at + block.length), block.language)
      at += block.length
      continue
    }

    out += writeCharacter(value.text, at, options.whitespace === 'collapse' && !code[at])
    at += 1
  }

  return out
}

/** Which positions are inside code, where whitespace is kept whatever the reading. */
function codeRanges(value: FormattedText): readonly boolean[] {
  const flags = new Array<boolean>(value.text.length).fill(false)

  for (const entity of value.entities) {
    if (entity._ !== 'messageEntityCode' && entity._ !== 'messageEntityPre') continue
    for (let at = entity.offset; at < entity.offset + entity.length; at += 1) flags[at] = true
  }

  return flags
}

/**
 * The blocks a highlighter writes: those naming a language, with nothing else
 * opening or closing inside them.
 */
function highlightedBlocks(
  value: FormattedText,
): readonly { readonly offset: number; readonly length: number; readonly language: string }[] {
  const blocks: { offset: number; length: number; language: string }[] = []

  for (const entity of withinText(value).entities) {
    if (entity._ !== 'messageEntityPre' || entity.language === '') continue
    const end = entity.offset + entity.length
    const crossed = value.entities.some(
      (other) =>
        other !== entity &&
        ((other.offset > entity.offset && other.offset < end) ||
          (other.offset + other.length > entity.offset && other.offset + other.length < end)),
    )
    if (!crossed)
      blocks.push({ offset: entity.offset, length: entity.length, language: entity.language })
  }

  return blocks
}

/** One character of text, escaped, and spelled so that a collapsing reader keeps it. */
function writeCharacter(text: string, at: number, collapsing: boolean): string {
  const character = text[at] as string

  if (!collapsing) return escapeHtml(character)
  if (character === '\n') return '<br>'
  if (character !== ' ') return escapeHtml(character)

  // A space a collapsing reader would drop or merge is written as one it keeps.
  const before = text[at - 1]
  const after = text[at + 1]
  const lone =
    before !== undefined &&
    before !== ' ' &&
    before !== '\n' &&
    after !== undefined &&
    after !== ' ' &&
    after !== '\n'

  return lone ? ' ' : '&nbsp;'
}
