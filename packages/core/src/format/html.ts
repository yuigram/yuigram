/**
 * Telegram HTML, into formatted text.
 *
 * The dialect is small and fixed: the tags Telegram's documentation lists,
 * four named character references and every numeric one. Nothing else is
 * markup. A strict parse refuses what Telegram would refuse — an unknown tag,
 * a bare `<`, a tag left open — and names where. A lenient parse keeps every
 * well-formed range and shows the rest as the characters it was written with.
 *
 * ```ts
 * html`<b>${name}</b> ordered <i>${count}</i> items`
 * ```
 *
 * In a template, an interpolated value is text, whatever it contains: `<b>` in
 * a user's name arrives as `<b>`. A formatted value interpolated keeps its own
 * ranges. Only the literal parts are read as markup.
 */

import type { EntityType } from './entities.js'
import { type Content, Formatted } from './formatted.js'
import {
  Builder,
  characterAt,
  type EntityDetails,
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

/** What an HTML parse leaves open for a later one to continue. */
export interface HtmlState {
  readonly open: readonly OpenRange[]
}

/** Where a custom tag stands in the markup it was found in. */
export interface TagInfo {
  readonly tag: string
  readonly attributes: Readonly<Record<string, string>>
  /** The tag it is directly inside, or `null` at the top. */
  readonly parent: string | null
  /** Every tag it is inside, outermost first. */
  readonly ancestors: readonly string[]
  /** Its position among the tags beside it, from zero. */
  readonly index: number
  /** How many tags are beside it, itself included. */
  readonly siblingCount: number
}

/** What a custom tag becomes: its content in, formatted text out. */
export type TagHandler = (content: Formatted, info: TagInfo) => Formatted

/** Custom tags by name. */
export type TagDefinitions = Readonly<Record<string, TagHandler>>

/** Options for one HTML parse. */
export interface HtmlOptions extends ParseOptions<HtmlState> {
  /**
   * Read whitespace the way a browser does: runs of it collapse to one space,
   * and `<br>` is the line break. Code keeps its whitespace.
   */
  readonly breaks?: boolean
  /** Values a template interpolated, in order. */
  readonly slots?: readonly unknown[]
  /** Custom tags, by name. */
  readonly tags?: ReadonlyMap<string, TagHandler>
}

/** The simple tags, and the range each opens. */
const SIMPLE: Readonly<Record<string, EntityType>> = Object.assign(Object.create(null), {
  b: 'bold',
  strong: 'bold',
  i: 'italic',
  em: 'italic',
  u: 'underline',
  ins: 'underline',
  s: 'strikethrough',
  strike: 'strikethrough',
  del: 'strikethrough',
  'tg-spoiler': 'spoiler',
})

/** Every tag Telegram's HTML knows. */
const BUILT_IN = new Set([
  ...Object.keys(SIMPLE),
  'span',
  'a',
  'code',
  'pre',
  'blockquote',
  'tg-emoji',
  'tg-time',
  'br',
])

/** The named references the Bot API accepts. */
const NAMED: Readonly<Record<string, string>> = Object.assign(Object.create(null), {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
})

const TAG =
  /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/y
const REFERENCE = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]*);/y
const ATTRIBUTE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
/** What an unfinished tag can look like, at the very end of the input. */
const TAG_PREFIX = /^<\/?(?:[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?)?$/
const REFERENCE_PREFIX = /^&(?:#[xX]?[0-9a-fA-F]{0,6}|[a-zA-Z][a-zA-Z0-9]*)?$/
const TIME_FORMAT = /^(?:r|w?[dD]?[tT]?)$/

/** The nesting depth custom tag handlers may reach, counting calls back into the parser. */
export const MAX_TAG_DEPTH = 32
let tagDepth = 0

function decodeReference(body: string): string | undefined {
  if (body.startsWith('#x') || body.startsWith('#X'))
    return codePointOf(Number.parseInt(body.slice(2), 16))
  if (body.startsWith('#')) return codePointOf(Number.parseInt(body.slice(1), 10))

  return NAMED[body.toLowerCase()]
}

function codePointOf(code: number): string | undefined {
  if (
    !Number.isInteger(code) ||
    code <= 0 ||
    code > 0x10ffff ||
    (code >= 0xd800 && code <= 0xdfff)
  ) {
    return undefined
  }

  return String.fromCodePoint(code)
}

function decodeAll(value: string): string {
  return value.replace(
    /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, body: string) => decodeReference(body) ?? whole,
  )
}

function readAttributes(
  source: string,
  slots: readonly unknown[] | undefined,
): Record<string, string> {
  const found: Record<string, string> = Object.create(null)

  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = (match[1] as string).toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    found[name] = resolveSlots(decodeAll(value), slots)
  }

  return found
}

/**
 * Sibling positions for every tag in the source, for custom tag handlers.
 *
 * Counted before parsing because a handler runs when its tag closes, and by
 * then the tags after it have not been read.
 */
function siblingPositions(source: string): Map<number, { index: number; count: number }> {
  const positions = new Map<number, { index: number; count: number }>()
  const frames: { name: string; children: number[] }[] = [{ name: '', children: [] }]
  const pattern = new RegExp(TAG.source, 'g')

  const closeFrame = (frame: { children: number[] }): void => {
    frame.children.forEach((at, index) => {
      positions.set(at, { index, count: frame.children.length })
    })
  }

  for (const match of source.matchAll(pattern)) {
    const [, slash, rawName, , selfClosing] = match
    const name = (rawName as string).toLowerCase()
    const at = match.index as number

    if (slash === '/') {
      for (let depth = frames.length - 1; depth > 0; depth -= 1) {
        if ((frames[depth] as { name: string }).name === name) {
          for (const frame of frames.splice(depth).reverse()) closeFrame(frame)
          break
        }
      }
      continue
    }

    ;(frames[frames.length - 1] as { children: number[] }).children.push(at)
    if (selfClosing !== '/' && name !== 'br') frames.push({ name, children: [] })
  }

  for (const frame of frames.reverse()) closeFrame(frame)

  return positions
}

/** What an opening tag means: a range to open, or why it cannot be one. */
type TagMeaning =
  | { readonly type: EntityType; readonly details: EntityDetails }
  | { readonly problem: string }

function linkMeaning(attributes: Readonly<Record<string, string>>): TagMeaning {
  const href = attributes['href']
  if (href === undefined || href.length === 0) return { problem: '<a> needs an href' }

  const mention = /^tg:\/\/user\?id=(\d+)$/i.exec(href)
  if (mention !== null) {
    return {
      type: 'text_mention',
      details: { user: { id: Number(mention[1]), is_bot: false, first_name: '' } },
    }
  }

  return { type: 'text_link', details: { url: href } }
}

function timeMeaning(attributes: Readonly<Record<string, string>>): TagMeaning {
  const unix = attributes['unix']
  const format = attributes['format']
  if (unix === undefined || !/^-?\d+$/.test(unix))
    return { problem: '<tg-time> needs a whole-second unix' }
  if (format !== undefined && !TIME_FORMAT.test(format)) {
    return { problem: `'${format}' is not a date-time format` }
  }

  return {
    type: 'date_time',
    details: {
      unix_time: Number(unix),
      ...(format === undefined || format === '' ? {} : { date_time_format: format }),
    },
  }
}

/** What a built-in tag other than the simple styles means, given what is open. */
function tagMeaning(
  name: string,
  attributes: Readonly<Record<string, string>>,
  stack: readonly OpenRange[],
): TagMeaning {
  switch (name) {
    case 'span':
      return attributes['class'] === 'tg-spoiler'
        ? { type: 'spoiler', details: {} }
        : { problem: '<span> needs class="tg-spoiler"' }
    case 'code':
    case 'pre':
      return { type: name, details: {} }
    case 'blockquote':
      if (
        stack.some((open) => open.type === 'blockquote' || open.type === 'expandable_blockquote')
      ) {
        return { problem: 'quotations cannot be nested' }
      }

      return {
        type: 'expandable' in attributes ? 'expandable_blockquote' : 'blockquote',
        details: {},
      }
    case 'a':
      return linkMeaning(attributes)
    case 'tg-emoji': {
      const id = attributes['emoji-id']

      return id === undefined || !/^\d+$/.test(id)
        ? { problem: '<tg-emoji> needs a numeric emoji-id' }
        : { type: 'custom_emoji', details: { custom_emoji_id: id } }
    }
    case 'tg-time':
      return timeMeaning(attributes)
    default:
      return { problem: `<${name}> is not a tag Telegram's HTML knows` }
  }
}

/** A custom tag, from where it opened. */
interface CustomStart {
  readonly name: string
  readonly attributes: Record<string, string>
  readonly at: number
}

/** One parse of Telegram HTML. */
class HtmlScanner {
  readonly mode: ParseMode
  readonly slots: readonly unknown[] | undefined
  readonly tags: ReadonlyMap<string, TagHandler> | undefined
  readonly breaks: boolean
  readonly builder: Builder
  readonly positions: Map<number, { index: number; count: number }> | undefined
  readonly customStarts = new WeakMap<OpenRange, CustomStart>()
  index = 0
  heldBack = false

  constructor(
    readonly source: string,
    options: HtmlOptions,
  ) {
    this.mode = options.mode ?? 'strict'
    this.slots = options.slots
    this.tags = options.tags
    this.breaks = options.breaks === true
    this.builder = new Builder(options.stopAt, options.resume?.open)
    this.positions =
      this.tags !== undefined && this.tags.size > 0 ? siblingPositions(source) : undefined
  }

  fail(message: string, at: number): never {
    throw new MarkupParseError(message, at, this.source)
  }

  /** In strict mode refuse; otherwise show the markup as the characters it was written with. */
  refuse(message: string, at: number, end: number): boolean {
    if (this.mode === 'strict') this.fail(message, at)

    return this.builder.add(this.source.slice(at, end), at)
  }

  get verbatim(): boolean {
    return this.builder.stack.some((open) => open.type === 'code' || open.type === 'pre')
  }

  markerOf(name: string): string {
    return this.tags?.has(name) === true ? `custom:${name}` : name
  }

  /** Add text, reading whitespace the way the breaks mode says. */
  addText(text: string, at: number): boolean {
    if (!this.breaks || this.verbatim || !/\s/.test(text)) return this.builder.add(text, at)
    if (this.builder.text.length === 0 || /\s$/.test(this.builder.text)) return true

    return this.builder.add(' ', at)
  }

  /** The one tag allowed inside code: `<code class="language-…">` straight after `<pre>`. */
  openInCode(name: string, attributes: Record<string, string>, at: number, end: number): boolean {
    const top = this.builder.top
    if (
      name === 'code' &&
      top?.type === 'pre' &&
      top.marker === 'pre' &&
      top.start === this.builder.text.length
    ) {
      const language = /^language-(.+)$/.exec(attributes['class'] ?? '')?.[1]
      this.builder.stack[this.builder.stack.length - 1] = {
        ...top,
        details: language === undefined ? top.details : { ...top.details, language },
      }
      this.builder.open('code', 'code', {}, false)

      return true
    }

    return this.refuse(`<${name}> cannot appear inside code`, at, end)
  }

  openTag(name: string, attributes: Record<string, string>, at: number, end: number): boolean {
    if (this.verbatim) return this.openInCode(name, attributes, at, end)

    if (this.tags?.has(name) === true) {
      this.builder.open('bold', `custom:${name}`, {}, false)
      this.customStarts.set(this.builder.top as OpenRange, { name, attributes, at })

      return true
    }

    if (name === 'br') {
      return this.breaks
        ? this.builder.add('\n', at)
        : this.refuse('<br> is not Telegram HTML; use a line break', at, end)
    }

    const simple = SIMPLE[name]
    if (simple !== undefined) {
      this.builder.open(simple, name)

      return true
    }

    const meaning = tagMeaning(name, attributes, this.builder.stack)
    if ('type' in meaning) {
      this.builder.open(meaning.type, name, meaning.details)

      return true
    }

    if (this.mode === 'strict') this.fail(meaning.problem, at)
    if (!BUILT_IN.has(name)) return this.builder.add(this.source.slice(at, end), at)

    // Recognised but unusable: kept on the stack so its closing tag is matched,
    // and the text inside shows unformatted.
    this.builder.open('bold', name, {}, false)

    return true
  }

  closeTag(name: string, at: number, end: number): boolean {
    const matching = this.builder.find(this.markerOf(name))
    if (matching === -1) return this.refuse(`</${name}> closes nothing that is open`, at, end)

    // Between them may sit only the marker naming a code block's language.
    const above = this.builder.stack.slice(matching + 1)
    if (
      this.mode === 'strict' &&
      !above.every((open) => !open.produces && open.marker === 'code')
    ) {
      this.fail(`</${name}> closes <${this.builder.top?.marker ?? ''}> out of order`, at)
    }

    this.closeCustomAbove(matching)

    // A mention's name is the text it covers.
    const opened = this.builder.stack[matching] as OpenRange
    if (opened.type === 'text_mention' && opened.details.user !== undefined) {
      this.builder.stack[matching] = {
        ...opened,
        details: {
          user: { ...opened.details.user, first_name: this.builder.text.slice(opened.start) },
        },
      }
    }

    this.builder.closeFrom(matching)
    // A custom tag's handler replaces what it held.
    if (opened.marker.startsWith('custom:')) this.runCustom(opened)

    return true
  }

  /** Run the handlers of custom tags above `index`, innermost first. */
  closeCustomAbove(index: number): void {
    for (let depth = this.builder.stack.length - 1; depth > index; depth -= 1) {
      const open = this.builder.stack[depth] as OpenRange
      if (open.marker.startsWith('custom:')) {
        this.builder.closeFrom(depth)
        this.runCustom(open)
      }
    }
  }

  runCustom(opened: OpenRange): void {
    const started = this.customStarts.get(opened)
    const handler = started === undefined ? undefined : this.tags?.get(started.name)
    if (started === undefined || handler === undefined) return

    const builder = this.builder
    const inner = new Formatted(
      builder.text.slice(opened.start),
      builder.entities
        .filter((entity) => entity.offset >= opened.start)
        .map((entity) => ({ ...entity, offset: entity.offset - opened.start })),
    )
    const ancestors = builder.stack.map((open) => open.marker.replace(/^custom:/, ''))
    const position = this.positions?.get(started.at) ?? { index: 0, count: 1 }

    if (tagDepth >= MAX_TAG_DEPTH) {
      throw new MarkupParseError(
        `custom tags nest deeper than ${MAX_TAG_DEPTH}`,
        started.at,
        this.source,
      )
    }
    tagDepth += 1
    let result: Formatted
    try {
      result = Formatted.from(
        handler(inner, {
          tag: started.name,
          attributes: started.attributes,
          parent: ancestors[ancestors.length - 1] ?? null,
          ancestors,
          index: position.index,
          siblingCount: position.count,
        }),
      )
    } finally {
      tagDepth -= 1
    }

    const kept = builder.entities.filter((entity) => entity.offset < opened.start)
    builder.entities.length = 0
    builder.entities.push(...kept)
    for (const entity of result.entities) {
      builder.entities.push({ ...entity, offset: entity.offset + opened.start })
    }
    builder.text = builder.text.slice(0, opened.start) + result.text
  }

  /** A `<` at the scan position. Returns false to stop. */
  readTag(): boolean {
    const at = this.index
    TAG.lastIndex = at
    const match = TAG.exec(this.source)

    if (match === null) {
      if (this.mode === 'partial' && TAG_PREFIX.test(this.source.slice(at))) {
        this.heldBack = true

        return false
      }
      if (!this.refuse("a '<' that starts no tag must be written &lt;", at, at + 1)) return false
      this.index = at + 1

      return true
    }

    const [whole, slash, rawName, rawAttributes, selfClosing] = match
    const name = (rawName as string).toLowerCase()
    const end = at + whole.length

    if (slash === '/') {
      if (!this.closeTag(name, at, end)) return false
    } else {
      if (!this.openTag(name, readAttributes(rawAttributes ?? '', this.slots), at, end))
        return false
      // A self-closing tag closes at once, if it opened anything.
      const opened = this.builder.find(this.markerOf(name))
      if (
        selfClosing === '/' &&
        name !== 'br' &&
        opened !== -1 &&
        opened === this.builder.stack.length - 1
      ) {
        if (!this.closeTag(name, at, end)) return false
      }
    }
    this.index = end

    return true
  }

  /** A `&` at the scan position. Returns false to stop. */
  readReference(): boolean {
    const at = this.index
    REFERENCE.lastIndex = at
    const match = REFERENCE.exec(this.source)
    const decoded = match === null ? undefined : decodeReference(match[1] as string)

    if (match !== null && decoded !== undefined) {
      if (!this.addText(decoded, at)) return false
      this.index = at + (match[0] as string).length

      return true
    }

    if (this.mode === 'partial' && match === null && REFERENCE_PREFIX.test(this.source.slice(at))) {
      this.heldBack = true

      return false
    }
    const message =
      match === null
        ? "a '&' that starts no reference must be written &amp;"
        : `'${match[0]}' is not a reference Telegram accepts`
    if (!this.refuse(message, at, at + 1)) return false
    this.index = at + 1

    return true
  }

  /** An interpolated value at the scan position, if one is there. */
  readSlotAt(): boolean | undefined {
    const slot = this.slots === undefined ? undefined : readSlot(this.source, this.index)
    if (slot === undefined) return undefined

    const inserted = Formatted.from((this.slots as readonly unknown[])[slot.slot] as Content)
    const ok = this.verbatim
      ? this.builder.add(inserted.text, this.index)
      : this.builder.addFormatted(inserted, this.index)
    if (ok) this.index = slot.end

    return ok
  }

  /** One step of the scan. Returns false to stop. */
  step(): boolean {
    const at = this.index
    const character = this.source[at] as string

    if (character === '<') return this.readTag()
    if (character === '&') return this.readReference()
    if (character === '>') {
      if (!this.refuse("a '>' must be written &gt;", at, at + 1)) return false
      this.index = at + 1

      return true
    }

    const slot = this.readSlotAt()
    if (slot !== undefined) return slot

    const whole = characterAt(this.source, at)
    if (!this.addText(whole, at)) return false
    this.index = at + whole.length

    return true
  }

  /** Finish: refuse what strict mode refuses, run what custom tags remain, trim. */
  finish(stopped: boolean): void {
    const builder = this.builder

    if (this.mode === 'strict' && !stopped && builder.stack.length > 0) {
      const open = builder.top as OpenRange
      this.fail(`<${open.marker.replace(/^custom:/, '')}> is never closed`, this.source.length)
    }

    // Unclosed custom tags still run their handlers, over what they hold.
    if (!stopped && this.mode !== 'partial') this.closeCustomAbove(-1)

    if (this.breaks && !stopped) {
      const trimmed = builder.text.replace(/ +$/, '')
      for (const [at, entity] of builder.entities.entries()) {
        const over = entity.offset + entity.length - trimmed.length
        if (over > 0)
          builder.entities[at] = { ...entity, length: Math.max(0, entity.length - over) }
      }
      builder.text = trimmed
    }
  }

  run(): ParseResult<HtmlState> {
    while (this.index < this.source.length && this.step()) {
      // Each step advances the scan or stops it.
    }

    const stopped = this.builder.stoppedAt !== undefined
    this.finish(stopped)
    const { formatted, open } = this.builder.snapshot()

    return {
      formatted,
      consumed: stopped ? (this.builder.stoppedAt as number) : this.index,
      stopped,
      heldBack: this.heldBack,
      state: { open },
    }
  }
}

/**
 * Parse Telegram HTML, reporting where the parse stopped and what was open.
 *
 * The primitive the rest of the module and the stream engine build on.
 */
export function scanHtml(source: string, options: HtmlOptions = {}): ParseResult<HtmlState> {
  return new HtmlScanner(source, options).run()
}

/** Parse Telegram HTML, strictly by default. */
export function parseHtml(
  source: string,
  options: Omit<HtmlOptions, 'stopAt' | 'resume'> = {},
): Formatted {
  return scanHtml(source, options).formatted
}

/** The `html` tag: a function of a source string, or a template tag. */
export interface HtmlTag {
  (source: string): Formatted
  (strings: TemplateStringsArray, ...values: readonly unknown[]): Formatted
  /** The same, keeping what is well formed and showing the rest as written. */
  readonly lenient: {
    (source: string): Formatted
    (strings: TemplateStringsArray, ...values: readonly unknown[]): Formatted
  }
  /** Add custom tags to this tag, in place. Returns it. */
  define(tags: TagDefinitions): HtmlTag
  /** A new tag with this one's custom tags and more. */
  with(tags: TagDefinitions): HtmlTag
}

const CUSTOM_NAME = /^[a-z][a-z0-9-]*$/

function checkedTags(registry: Map<string, TagHandler>, tags: TagDefinitions): void {
  for (const [name, handler] of Object.entries(tags)) {
    if (!CUSTOM_NAME.test(name)) {
      throw new MarkupParseError(
        `'${name}' is not a tag name: lowercase letters, digits and dashes`,
        0,
        name,
      )
    }
    if (BUILT_IN.has(name)) {
      throw new MarkupParseError(`<${name}> is one of Telegram's own tags`, 0, name)
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`the handler for <${name}> is not a function`)
    }
    registry.set(name, handler)
  }
}

function makeHtml(registry: Map<string, TagHandler>, breaks: boolean): HtmlTag {
  const run = (mode: 'strict' | 'lenient', args: readonly unknown[]): Formatted => {
    const [first, ...values] = args
    const options = { mode, breaks, tags: registry }
    if (isTemplate(first)) {
      const { source, slots } = joinTemplate(first, values)

      return scanHtml(source, { ...options, slots }).formatted
    }

    return scanHtml(String(first), options).formatted
  }

  const tag = ((...args: unknown[]) => run('strict', args)) as HtmlTag
  Object.defineProperties(tag, {
    lenient: { value: (...args: unknown[]) => run('lenient', args), enumerable: true },
    define: {
      value: (tags: TagDefinitions) => {
        checkedTags(registry, tags)

        return tag
      },
    },
    with: {
      value: (tags: TagDefinitions) => {
        const next = new Map(registry)
        checkedTags(next, tags)

        return makeHtml(next, breaks)
      },
    },
  })

  return tag
}

/**
 * Parse Telegram HTML into formatted text. Whitespace is kept as written,
 * which is how Telegram itself reads it.
 */
export const html: HtmlTag = makeHtml(new Map(), false)

/**
 * The same, with whitespace read the way a browser reads it: runs collapse to
 * one space and `<br>` breaks the line. For markup written as indented HTML.
 */
export const htmlb: HtmlTag = makeHtml(new Map(), true)
