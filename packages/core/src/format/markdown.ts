// SPDX-License-Identifier: MPL-2.0

/**
 * Telegram MarkdownV2, into formatted text.
 *
 * The rules are Telegram's, as its documentation states them:
 *
 * - `*bold*`, `_italic_`, `__underline__`, `~strikethrough~`, `||spoiler||`;
 *   `__` is always read greedily, left to right, as underline.
 * - `[text](url)`, `[text](tg://user?id=…)` for a mention by id,
 *   `![emoji](tg://emoji?id=…)` and `![text](tg://time?unix=…&format=…)`.
 * - `` `code` `` and ```` ```language ```` blocks, inside which only
 *   `` ` `` and `\` are escaped.
 * - `>` starting a line quotes it; a quotation whose last line ends with `||`
 *   is collapsed; `**` between two quotations keeps them apart.
 * - Everywhere else, `_*[]()~` `` ` `` `>#+-=|{}.!` must be escaped with `\`,
 *   and any character from code 1 to 126 may be.
 *
 * A strict parse refuses what Telegram would refuse. A lenient one keeps what
 * is well formed and shows the rest as written — so the `.` a model forgot to
 * escape stays a full stop and the bold around it stays bold.
 */

import type { EntityType } from './entities.js'
import { type Content, Formatted } from './formatted.js'
import {
  Builder,
  characterAt,
  isTemplate,
  joinTemplate,
  MarkupParseError,
  type OpenRange,
  type ParseMode,
  type ParseOptions,
  type ParseResult,
  readSlot,
  resolveSlots,
} from './parse.js'

/** What a MarkdownV2 parse leaves open for a later one to continue. */
export interface MarkdownState {
  readonly open: readonly OpenRange[]
  /** Whether the next character begins a line. */
  readonly lineStart: boolean
}

/** Options for one MarkdownV2 parse. */
export interface MarkdownOptions extends ParseOptions<MarkdownState> {
  /** Values a template interpolated, in order. */
  readonly slots?: readonly unknown[]
}

/** The markers that open and close a style, and the style each means. */
const TOGGLES: Readonly<Record<string, EntityType>> = Object.assign(Object.create(null), {
  '*': 'bold',
  _: 'italic',
  __: 'underline',
  '~': 'strikethrough',
  '||': 'spoiler',
})

/** Characters that mean nothing on their own and must be escaped. */
const RESERVED = new Set(['#', '+', '-', '=', '{', '}', '.', '!', '(', ')', ']', '>', '|'])

const QUOTE = '>'
const TIME_FORMAT = /^(?:r|w?[dD]?[tT]?)$/

/** One parse of MarkdownV2. Each `read…` method returns false to stop the scan. */
class MarkdownScanner {
  readonly mode: ParseMode
  readonly slots: readonly unknown[] | undefined
  readonly builder: Builder
  lineStart: boolean
  index = 0
  heldBack = false

  constructor(
    readonly source: string,
    options: MarkdownOptions,
  ) {
    this.mode = options.mode ?? 'strict'
    this.slots = options.slots
    this.builder = new Builder(options.stopAt, options.resume?.open)
    this.lineStart = options.resume?.lineStart ?? true
  }

  fail(message: string, at: number): never {
    throw new MarkupParseError(message, at, this.source)
  }

  /** Stop, holding back an unfinished token. Always false. */
  hold(): boolean {
    this.heldBack = true

    return false
  }

  /** Whether fewer than `length` characters remain from the scan position. */
  endsWithin(length: number): boolean {
    return this.index + length > this.source.length
  }

  get quoteIndex(): number {
    return this.builder.find(QUOTE)
  }

  get code(): OpenRange | undefined {
    const top = this.builder.top

    return top !== undefined && (top.type === 'code' || top.type === 'pre') ? top : undefined
  }

  /** Add text, which also ends a line's chance to start with a marker. */
  add(text: string, at: number): boolean {
    if (!this.builder.add(text, at)) return false
    this.lineStart = text.endsWith('\n')

    return true
  }

  /** Add the character at the scan position and move past it. */
  addCharacter(): boolean {
    const whole = characterAt(this.source, this.index)
    if (!this.add(whole, this.index)) return false
    this.index += whole.length

    return true
  }

  /** End the open quotation, leaving the line break that ended it outside. */
  closeQuote(): void {
    const at = this.quoteIndex
    if (at === -1) return

    const builder = this.builder
    const quote = builder.stack[at] as OpenRange
    const end = builder.text.endsWith('\n') ? builder.text.length - 1 : builder.text.length
    builder.stack.splice(at, 1)
    if (end > quote.start) {
      builder.entities.push({
        ...quote.details,
        type: quote.type,
        offset: quote.start,
        length: end - quote.start,
      })
    }
  }

  openQuote(): void {
    // Beneath everything else, so inline ranges close without closing it.
    this.builder.stack.unshift({
      type: 'blockquote',
      start: this.builder.text.length,
      details: {},
      marker: QUOTE,
      produces: true,
    })
  }

  /** Toggle a style: close it if it is open, open it if not. */
  toggle(marker: string): void {
    const open = this.builder.find(marker)
    if (open === -1) {
      this.builder.open(TOGGLES[marker] as EntityType, marker)

      return
    }

    if (open !== this.builder.stack.length - 1 && this.mode === 'strict') {
      this.fail(
        `'${marker}' closes ${this.builder.top?.marker ?? 'nothing'} out of order`,
        this.index,
      )
    }
    this.builder.closeFrom(open)
  }

  /** A line's first characters, which may open or continue a quotation. */
  readLineStart(): boolean {
    const rest = this.source.slice(this.index)
    if (
      this.mode === 'partial' &&
      this.endsWithin(3) &&
      rest.startsWith('*') &&
      '**>'.startsWith(rest)
    ) {
      return this.hold()
    }

    this.lineStart = false
    if (rest.startsWith('**>')) {
      this.closeQuote()
      this.openQuote()
      this.index += 3
    } else if (rest.startsWith('>')) {
      if (this.quoteIndex === -1) this.openQuote()
      this.index += 1
    } else {
      this.closeQuote()
    }

    return true
  }

  readEscape(): boolean {
    const at = this.index
    if (this.endsWithin(2)) {
      if (this.mode === 'partial') return this.hold()
      if (this.mode === 'strict') this.fail("a '\\' at the end escapes nothing", at)
      if (!this.add('\\', at)) return false
      this.index += 1

      return true
    }

    const escaped = characterAt(this.source, at + 1)
    const value = escaped.codePointAt(0) as number
    if (value >= 1 && value <= 126) {
      if (!this.add(escaped, at)) return false
      this.index += 2

      return true
    }

    if (this.mode === 'strict') this.fail('only characters from code 1 to 126 can be escaped', at)
    if (!this.add('\\', at)) return false
    this.index += 1

    return true
  }

  /** Inside code: only `` ` `` ends it, and values go in as bare text. */
  readInCode(code: OpenRange): boolean {
    if (this.source[this.index] === '`') {
      if (code.type === 'pre' && this.source.startsWith('```', this.index)) {
        this.builder.closeFrom(this.builder.stack.length - 1)
        this.index += 3

        return true
      }
      if (code.type === 'code') {
        this.builder.closeFrom(this.builder.stack.length - 1)
        this.index += 1

        return true
      }
      if (
        this.mode === 'partial' &&
        this.endsWithin(3) &&
        '```'.startsWith(this.source.slice(this.index))
      ) {
        return this.hold()
      }
      if (this.mode === 'strict') this.fail("a '`' inside a code block must be escaped", this.index)
    }

    const slot = this.slots === undefined ? undefined : readSlot(this.source, this.index)
    if (slot === undefined) return this.addCharacter()

    const value = Formatted.from((this.slots as readonly unknown[])[slot.slot] as Content)
    if (!this.add(value.text, this.index)) return false
    this.index = slot.end

    return true
  }

  /** An interpolated value, if one is at the scan position. */
  readSlotAt(): boolean | undefined {
    const slot = this.slots === undefined ? undefined : readSlot(this.source, this.index)
    if (slot === undefined) return undefined

    const value = Formatted.from((this.slots as readonly unknown[])[slot.slot] as Content)
    if (!this.builder.addFormatted(value, this.index)) return false
    if (value.text.length > 0) this.lineStart = value.text.endsWith('\n')
    this.index = slot.end

    return true
  }

  readBacktick(): boolean {
    const source = this.source
    if (!source.startsWith('```', this.index)) {
      if (this.mode === 'partial' && this.endsWithin(3)) return this.hold()
      this.builder.open('code', '`')
      this.index += 1

      return true
    }

    let at = this.index + 3
    let end = at
    while (end < source.length && !/[\s`]/.test(source[end] as string)) end += 1
    if (this.mode === 'partial' && end >= source.length) return this.hold()

    const language = end > at && source[end] !== '`' ? source.slice(at, end) : undefined
    if (language !== undefined) at = end
    if (source[at] === '\r' && source[at + 1] === '\n') at += 2
    else if (source[at] === '\n') at += 1

    this.builder.open('pre', '```', language === undefined ? {} : { language })
    this.index = at

    return true
  }

  readUnderscore(): boolean {
    if (this.mode === 'partial' && this.endsWithin(2)) return this.hold()
    const marker = this.source[this.index + 1] === '_' ? '__' : '_'
    this.toggle(marker)
    this.index += marker.length

    return true
  }

  /** `||`: a spoiler, or the mark that collapses a quotation. `undefined` for a lone `|`. */
  readPipe(): boolean | undefined {
    const at = this.index
    if (this.source[at + 1] !== '|')
      return this.mode === 'partial' && this.endsWithin(2) ? this.hold() : undefined

    // Closing a spoiler takes precedence; otherwise `||` ending a quoted line
    // marks the quotation collapsed.
    const lineEnds = this.source[at + 2] === '\n' || this.endsWithin(3)
    if (this.builder.find('||') === -1 && this.quoteIndex !== -1 && lineEnds) {
      if (this.mode === 'partial' && this.endsWithin(3)) return this.hold()
      const quoteAt = this.quoteIndex
      const quote = this.builder.stack[quoteAt] as OpenRange
      this.builder.stack[quoteAt] = { ...quote, type: 'expandable_blockquote' }
      this.closeQuote()
      this.index += 2

      return true
    }

    this.toggle('||')
    this.index += 2

    return true
  }

  get inLink(): boolean {
    return this.builder.find('[') !== -1 || this.builder.find('![') !== -1
  }

  /** `[` or `![`. `undefined` when the character is only a character here. */
  readLinkOpen(marker: '[' | '!['): boolean | undefined {
    if (this.inLink) {
      if (this.mode === 'strict' && marker === '[')
        this.fail('a link cannot hold another link', this.index)

      return undefined
    }
    this.builder.open(marker === '[' ? 'text_link' : 'custom_emoji', marker, {}, false)
    this.index += marker.length

    return true
  }

  /** Read the `(…)` after a link's text, from `start` (just past `(`). */
  readTarget(start: number): { target: string; end: number } | undefined {
    let target = ''
    let at = start

    while (at < this.source.length) {
      const character = this.source[at] as string
      if (character === '\\' && at + 1 < this.source.length) {
        target += this.source[at + 1]
        at += 2
        continue
      }
      if (character === ')') return { target: resolveSlots(target, this.slots), end: at + 1 }
      target += character
      at += 1
    }

    return undefined
  }

  /** A `]` that does not close a link it can use: refused, or shown as it is. */
  notALink(open: number, message: string): boolean {
    if (this.mode === 'strict') this.fail(message, this.index)
    // The text stays; it was never a link.
    if (open !== -1) this.builder.stack.splice(open, 1)
    if (!this.add(']', this.index)) return false
    this.index += 1

    return true
  }

  /** Finish a link, mention, custom emoji or moment whose `]` is at the scan position. */
  readLinkClose(): boolean {
    const at = this.index
    const open = Math.max(this.builder.find('['), this.builder.find('!['))
    if (open === -1) return this.notALink(-1, "a ']' that closes no link must be escaped")

    if (this.source[at + 1] !== '(') {
      if (this.mode === 'partial' && this.endsWithin(2)) return this.hold()

      return this.notALink(open, "a link's text must be followed by '(' and its address")
    }

    const read = this.readTarget(at + 2)
    if (read === undefined) {
      if (this.mode === 'partial') return this.hold()

      return this.notALink(open, "a link's address is never closed with ')'")
    }

    const opened = this.builder.stack[open] as OpenRange
    const resolved =
      opened.marker === '['
        ? linkOf(read.target, this.builder.text.slice(opened.start))
        : inlineOf(read.target)

    if (resolved === undefined) {
      if (this.mode === 'strict')
        this.fail(`'${read.target}' is not an address this link can have`, at)
      this.builder.stack.splice(open, 1)
    } else {
      this.builder.stack[open] = {
        ...opened,
        type: resolved.type,
        details: resolved.details,
        produces: true,
      }
      if (open !== this.builder.stack.length - 1 && this.mode === 'strict') {
        this.fail("a link's text closes a style out of order", at)
      }
      this.builder.closeFrom(open)
    }
    this.index = read.end

    return true
  }

  /** A markup character. `undefined` when it is only a character here. */
  readMarkup(character: string): boolean | undefined {
    switch (character) {
      case '`':
        return this.readBacktick()
      case '*':
      case '~':
        this.toggle(character)
        this.index += 1

        return true
      case '_':
        return this.readUnderscore()
      case '|':
        return this.readPipe()
      case '[':
        return this.readLinkOpen('[')
      case '!':
        if (this.source[this.index + 1] === '[') return this.readLinkOpen('![')

        return this.mode === 'partial' && this.endsWithin(2) ? this.hold() : undefined
      case ']':
        return this.readLinkClose()
      default:
        return undefined
    }
  }

  /** One step of the scan. Returns false to stop. */
  step(): boolean {
    if (this.lineStart && this.code === undefined) {
      if (!this.readLineStart()) return false
      if (this.index >= this.source.length) return true
    }

    const character = this.source[this.index] as string
    if (character === '\\') return this.readEscape()

    const code = this.code
    if (code !== undefined) return this.readInCode(code)

    const slot = this.readSlotAt()
    if (slot !== undefined) return slot

    const markup = this.readMarkup(character)
    if (markup !== undefined) return markup

    if (RESERVED.has(character) && this.mode === 'strict') {
      this.fail(`'${character}' is reserved and must be escaped`, this.index)
    }

    return this.addCharacter()
  }

  run(): ParseResult<MarkdownState> {
    while (this.index < this.source.length && this.step()) {
      // Each step advances the scan or stops it.
    }

    const builder = this.builder
    const stopped = builder.stoppedAt !== undefined
    const complete = !stopped && this.mode !== 'partial'

    if (this.mode === 'strict' && !stopped) {
      const open = builder.stack.find((entry) => entry.marker !== QUOTE)
      if (open !== undefined) this.fail(`'${open.marker}' is never closed`, this.source.length)
    }

    if (complete) {
      // A link whose address never arrived is not a link; its text stays.
      for (let at = builder.stack.length - 1; at >= 0; at -= 1) {
        const open = builder.stack[at] as OpenRange
        if ((open.marker === '[' || open.marker === '![') && !open.produces)
          builder.stack.splice(at, 1)
      }
      this.closeQuote()
    }

    const { formatted, open } = builder.snapshot()

    return {
      formatted,
      consumed: stopped ? (builder.stoppedAt as number) : this.index,
      stopped,
      heldBack: this.heldBack,
      state: { open, lineStart: this.lineStart },
    }
  }
}

/**
 * Parse MarkdownV2, reporting where the parse stopped and what was open.
 *
 * The primitive the rest of the module and the stream engine build on.
 */
export function scanMarkdown(
  source: string,
  options: MarkdownOptions = {},
): ParseResult<MarkdownState> {
  return new MarkdownScanner(source, options).run()
}

/** What a `[text](…)` names. */
function linkOf(
  target: string,
  text: string,
): { type: EntityType; details: OpenRange['details'] } | undefined {
  if (target.length === 0) return undefined

  const mention = /^tg:\/\/user\?id=(\d+)$/i.exec(target)
  if (mention !== null) {
    return {
      type: 'text_mention',
      details: { user: { id: Number(mention[1]), is_bot: false, first_name: text } },
    }
  }

  return { type: 'text_link', details: { url: target } }
}

/** What a `![text](…)` names: a custom emoji or a moment. */
function inlineOf(target: string): { type: EntityType; details: OpenRange['details'] } | undefined {
  const emoji = /^tg:\/\/emoji\?id=(\d+)$/i.exec(target)
  if (emoji !== null)
    return { type: 'custom_emoji', details: { custom_emoji_id: emoji[1] as string } }

  const moment = /^tg:\/\/time\?(.*)$/i.exec(target)
  if (moment === null) return undefined

  const query = new URLSearchParams(moment[1] as string)
  const unix = query.get('unix')
  const format = query.get('format')
  if (unix === null || !/^-?\d+$/.test(unix)) return undefined
  if (format !== null && !TIME_FORMAT.test(format)) return undefined

  return {
    type: 'date_time',
    details: {
      unix_time: Number(unix),
      ...(format === null || format === '' ? {} : { date_time_format: format }),
    },
  }
}

/** Parse MarkdownV2, strictly by default. */
export function parseMarkdown(
  source: string,
  options: Omit<MarkdownOptions, 'stopAt' | 'resume'> = {},
): Formatted {
  return scanMarkdown(source, options).formatted
}

/** The `md` tag: a function of a source string, or a template tag. */
export interface MarkdownTag {
  (source: string): Formatted
  (strings: TemplateStringsArray, ...values: readonly unknown[]): Formatted
  /** The same, keeping what is well formed and showing the rest as written. */
  readonly lenient: {
    (source: string): Formatted
    (strings: TemplateStringsArray, ...values: readonly unknown[]): Formatted
  }
}

function run(mode: 'strict' | 'lenient', args: readonly unknown[]): Formatted {
  const [first, ...values] = args
  if (isTemplate(first)) {
    const { source, slots } = joinTemplate(first, values)

    return scanMarkdown(source, { mode, slots }).formatted
  }

  return scanMarkdown(String(first), { mode }).formatted
}

/** Parse MarkdownV2 into formatted text. */
export const md: MarkdownTag = Object.assign((...args: unknown[]) => run('strict', args), {
  lenient: (...args: unknown[]) => run('lenient', args),
}) as MarkdownTag

/** The same as {@link md}. */
export const markdown: MarkdownTag = md
