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
 * Anything not in the set is left in the text as written. A message containing
 * `2 < 3` should arrive saying `2 < 3`, and treating an unrecognised `<` as a
 * broken tag would either drop it or refuse the message. This is markup a
 * developer typed, not a document from the network, so recovering is better
 * than rejecting.
 */

import type { TypeMessageEntity } from '../generated/api/types/index.js'
import { assemble, type FormattedText, type Markup, markerRuns, withinText } from './text.js'

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

/** Named character references Telegram's own markup uses. */
const REFERENCES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** The tags that open a range, and what each one means. */
const SIMPLE: Readonly<Record<string, TypeMessageEntity['_']>> = {
  b: 'messageEntityBold',
  strong: 'messageEntityBold',
  i: 'messageEntityItalic',
  em: 'messageEntityItalic',
  u: 'messageEntityUnderline',
  ins: 'messageEntityUnderline',
  s: 'messageEntityStrike',
  strike: 'messageEntityStrike',
  del: 'messageEntityStrike',
  'tg-spoiler': 'messageEntitySpoiler',
  code: 'messageEntityCode',
}

interface OpenTag {
  readonly name: string
  readonly at: number
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

/** The character a numeric reference names, or the reference as written if it names none. */
function characterOf(code: number, written: string): string {
  return Number.isNaN(code) || code > 0x10ffff ? written : String.fromCodePoint(code)
}

/** Resolve `&amp;`, `&#39;` and `&#x27;` back to the character each stands for. */
function decodeReferences(text: string): string {
  if (!text.includes('&')) return text

  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const lower = body.toLowerCase()

    if (lower.startsWith('#x')) return characterOf(Number.parseInt(lower.slice(2), 16), whole)
    if (lower.startsWith('#')) return characterOf(Number.parseInt(lower.slice(1), 10), whole)

    return REFERENCES[lower] ?? whole
  })
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

/**
 * The entity a closing tag completes, or `undefined` where the tag marks no
 * range.
 *
 * A `<pre>` wrapping a `<code class="language-x">` is one entity carrying the
 * language, not two nested ones, so the inner `code` reports nothing and the
 * outer `pre` reads the language off it.
 */
function entityFor(
  open: OpenTag,
  length: number,
  language: string | undefined,
): TypeMessageEntity | undefined {
  const offset = open.at
  const simple = SIMPLE[open.name]

  if (simple !== undefined) {
    return { _: simple, offset, length } as TypeMessageEntity
  }

  switch (open.name) {
    case 'pre':
      return {
        _: 'messageEntityPre',
        offset,
        length,
        language: language ?? open.attributes.get('language') ?? '',
      }

    case 'blockquote': {
      const collapsed = open.attributes.has('expandable') || open.attributes.has('collapsed')

      return collapsed
        ? { _: 'messageEntityBlockquote', offset, length, collapsed: true }
        : { _: 'messageEntityBlockquote', offset, length }
    }

    case 'span':
      return open.attributes.get('class')?.includes('tg-spoiler') === true
        ? { _: 'messageEntitySpoiler', offset, length }
        : undefined

    case 'tg-emoji': {
      const id = open.attributes.get('emoji-id') ?? open.attributes.get('document-id')
      // An identifier is a number. Anything else names no emoji, and the text
      // stays as it was rather than the whole message failing to parse.
      if (id === undefined || !/^\d+$/.test(id)) return undefined

      return { _: 'messageEntityCustomEmoji', offset, length, document_id: BigInt(id) }
    }

    case 'a': {
      const href = open.attributes.get('href')
      if (href === undefined) return undefined

      const mentioned = /^tg:\/\/user\?id=(\d+)$/.exec(href)

      // A mention carries the person's number rather than the link. Sending one
      // needs the input form, which needs an access hash this cannot know —
      // getting that is a call, not something markup can say.
      if (mentioned !== null) {
        return {
          _: 'messageEntityMentionName',
          offset,
          length,
          user_id: BigInt(mentioned[1] as string),
        }
      }

      return { _: 'messageEntityTextUrl', offset, length, url: href }
    }

    default:
      return undefined
  }
}

/**
 * Read HTML markup into text and the ranges formatted within it.
 *
 * ```ts
 * const body = fromHtml`Hello, <b>${name}</b>`
 *
 * await account.call(sendMessage({ peer, ...body }))
 * ```
 *
 * Called as a template tag, interpolated values are escaped and the literal
 * parts are not. Called with a plain string, nothing is escaped — that form is
 * for markup written in full by the developer.
 *
 * Recognised: `b`/`strong`, `i`/`em`, `u`/`ins`, `s`/`strike`/`del`, `code`,
 * `pre` (with `<code class="language-…">` inside for the language),
 * `blockquote` (`expandable` for a collapsed one), `tg-spoiler` and
 * `<span class="tg-spoiler">`, `<tg-emoji emoji-id="…">`, and `a` — where an
 * `href` of `tg://user?id=N` becomes a mention and anything else a link.
 *
 * Unrecognised tags are left in the text. An unclosed tag runs to the end,
 * which is what the writer meant often enough to be worth doing rather than
 * refusing.
 */
/** What the scanner has read so far. */
interface Scan {
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

    const entity = entityFor(one, scan.text.length - one.at, scan.language)

    if (entity !== undefined) scan.entities.push(entity)
    if (one.name === 'pre') scan.language = undefined
  }

  scan.open.length = Math.max(depth, 0)
}

/** Take a closing tag. Returns the text to keep where nothing was open for it. */
function takeClose(scan: Scan, raw: string): string {
  const name = raw.slice(1).trim().toLowerCase()
  const depth = scan.open.findLastIndex((one) => one.name === name)

  // A closing tag nothing opened is text, not an error, and it is kept exactly
  // as it was written rather than as this read it.
  if (depth === -1) return `<${raw}>`

  closeThrough(scan, depth)

  return ''
}

/** Take an opening tag. Returns the text to keep where the tag is not one of ours. */
function takeOpen(scan: Scan, raw: string): string {
  const inside = raw.trim()
  const selfClosing = inside.endsWith('/')
  const body = selfClosing ? inside.slice(0, -1).trim() : inside
  const space = body.search(/\s/)
  const name = (space === -1 ? body : body.slice(0, space)).toLowerCase()

  // `2 < 3 and 4 > 3` reaches here as a tag named `3`. It is not one, and what
  // goes back into the text is what the writer typed, spacing included.
  if (!isKnown(name)) return `<${raw}>`

  // A tag that marks no range cannot format anything.
  if (selfClosing) return ''

  scan.open.push({
    name,
    at: scan.text.length,
    attributes: readAttributes(space === -1 ? '' : body.slice(space)),
  })

  return ''
}

/**
 * Read HTML markup into text and the ranges formatted within it.
 *
 * ```ts
 * const body = fromHtml`Hello, <b>${name}</b>`
 *
 * await account.call(sendMessage({ peer, ...body }))
 * ```
 *
 * Called as a template tag, interpolated values are escaped and the literal
 * parts are not. Called with a plain string, nothing is escaped — that form is
 * for markup written in full by the developer.
 *
 * Recognised: `b`/`strong`, `i`/`em`, `u`/`ins`, `s`/`strike`/`del`, `code`,
 * `pre` (with `<code class="language-…">` inside for the language),
 * `blockquote` (`expandable` for a collapsed one), `tg-spoiler` and
 * `<span class="tg-spoiler">`, `<tg-emoji emoji-id="…">`, and `a` — where an
 * `href` of `tg://user?id=N` becomes a mention and anything else a link.
 *
 * Unrecognised tags are left in the text. An unclosed tag runs to the end,
 * which is what the writer meant often enough to be worth doing rather than
 * refusing.
 */
export function fromHtml(input: Markup, ...values: readonly unknown[]): FormattedText {
  const markup = assemble(input, values, escapeAttribute)
  const scan: Scan = { text: '', entities: [], open: [], language: undefined }

  let at = 0

  while (at < markup.length) {
    const next = markup.indexOf('<', at)

    if (next === -1) {
      scan.text += decodeReferences(markup.slice(at))
      break
    }

    scan.text += decodeReferences(markup.slice(at, next))

    const end = markup.indexOf('>', next)

    // A `<` with no `>` after it is not a tag at all.
    if (end === -1) {
      scan.text += decodeReferences(markup.slice(next))
      break
    }

    const raw = markup.slice(next + 1, end)
    at = end + 1

    if (raw.trim() === '') {
      scan.text += `<${raw}>`
      continue
    }

    scan.text += raw.trimStart().startsWith('/') ? takeClose(scan, raw.trim()) : takeOpen(scan, raw)
  }

  // Whatever is still open at the end runs to the end.
  closeThrough(scan, 0)

  scan.entities.sort(
    (left, right) =>
      left.offset - right.offset || right.length - left.length || compareKind(left, right),
  )

  return withinText({ text: scan.text, entities: scan.entities })
}

/** Order two entities that cover the same range, so the order is not arbitrary. */
function compareKind(left: TypeMessageEntity, right: TypeMessageEntity): number {
  if (left._ === right._) return 0

  return left._ < right._ ? -1 : 1
}

/** Whether a tag name marks a range this understands. */
function isKnown(name: string): boolean {
  return (
    SIMPLE[name] !== undefined ||
    name === 'pre' ||
    name === 'blockquote' ||
    name === 'span' ||
    name === 'tg-emoji' ||
    name === 'a'
  )
}

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
    case 'messageEntityCustomEmoji':
      return [`<tg-emoji emoji-id="${entity.document_id}">`, '</tg-emoji>']
    default:
      // Mentions, hashtags, bare links and the rest are found by the server in
      // the text itself. Writing markup around them would change nothing about
      // the message and would show tags to a reader that re-parsed it.
      return undefined
  }
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
 */
export function toHtml(value: FormattedText): string {
  return render(value, tagsFor, escapeHtml)
}

/**
 * Lay entities over text as opening and closing markers.
 *
 * Private to this dialect. The Markdown side looked like it could share this
 * and cannot: a code span there is written as it stands rather than escaped,
 * and a quote is a prefix on every line rather than a pair of markers.
 */
function render(
  value: FormattedText,
  markersFor: (entity: TypeMessageEntity) => readonly [string, string] | undefined,
  escapeText: (text: string) => string,
): string {
  let out = ''
  let from = 0

  for (const [at, run] of markerRuns(value, markersFor)) {
    out += escapeText(value.text.slice(from, at)) + run.close + run.open
    from = at
  }

  return out + escapeText(value.text.slice(from))
}
