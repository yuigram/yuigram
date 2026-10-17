// SPDX-License-Identifier: MIT

/**
 * Cutting a stream of markup into messages that each fit.
 *
 * A message has a limit, and a stream does not. When the text outgrows one
 * message, what fits is sent and the rest starts the next — but *where* it is
 * cut decides whether both halves are still valid:
 *
 * - **Text and entities** — plain text, Telegram HTML, MarkdownV2 — are parsed
 *   here, so the limit is measured on the text a reader sees, in UTF-16 code
 *   units, the unit Telegram's ranges count in. The cut is made in that text,
 *   preferably at a line break or a space, never inside a character, a
 *   grapheme, a custom emoji or a moment; and the ranges open there continue
 *   in the next message, so a bold phrase cut in two is bold on both sides.
 *   Nothing unparsed is ever sent, so no half of a tag ever reaches Telegram.
 * - **Rich messages** go to Telegram as markup it parses itself, so the limit
 *   is measured on the markup, in code points — never shorter than the text it
 *   renders to, which is what Telegram's 32,768 counts. The cut is made between
 *   blocks where possible; a code block cut in two is closed in the first
 *   message and reopened in the second, and HTML tags open at the cut are
 *   closed and reopened the same way.
 */

import { codePoints, isHighSurrogate, splitsCharacter } from '../format/entities.js'
import { Formatted } from '../format/formatted.js'
import { type HtmlState, scanHtml } from '../format/html.js'
import { type MarkdownState, scanMarkdown } from '../format/markdown.js'
import { MarkupParseError, type ParseMode, type ParseResult } from '../format/parse.js'

/** How the streamed text is written. */
export type StreamFormat =
  | { readonly kind: 'plain' }
  | { readonly kind: 'html' }
  | { readonly kind: 'markdown' }
  | { readonly kind: 'rich'; readonly dialect: 'markdown' | 'html' }

/** What a draft or a message carries. */
export type StreamPayload =
  | { readonly kind: 'text'; readonly formatted: Formatted }
  | { readonly kind: 'rich'; readonly dialect: 'markdown' | 'html'; readonly source: string }

/** A window finished before the stream ended, with any problem reading it. */
export interface Finished {
  readonly payload: StreamPayload
  /** A strict parse's refusal, when the lenient reading was used instead. */
  readonly problem?: unknown
}

/** The text of one message in the making. */
export interface Window {
  /** Take in more of the stream. */
  append(text: string): void
  /** Windows that no longer fit, finished, in order; what remains is the new current one. */
  overflow(): Finished[]
  /** The current window as a draft shows it. */
  preview(): StreamPayload
  /** Whether a draft of it would show anything. */
  readonly visible: boolean
  /**
   * Finish the current window. `complete` when the stream has ended, so the
   * whole remaining text is read as it stands; otherwise a token still arriving
   * is carried into the next window.
   */
  finish(complete: boolean): Finished
  /** How much of the stream is held, in UTF-16 code units, for backpressure. */
  readonly held: number
}

/** The limits a window keeps to. */
export interface WindowLimits {
  /** For text and entities: UTF-16 code units of text. */
  readonly text: number
  /** For rich messages: code points of markup. */
  readonly rich: number
  /** For rich messages: blocks, counted generously. */
  readonly blocks: number
}

/** Telegram's limits: 4,096 for a text message, 32,768 and 500 blocks for a rich one. */
export const DEFAULT_LIMITS: WindowLimits = { text: 4096, rich: 32768, blocks: 500 }

/** Make the window for a format. */
export function createWindow(format: StreamFormat, limits: WindowLimits = DEFAULT_LIMITS): Window {
  switch (format.kind) {
    case 'plain':
      return new TextWindow(scanPlain, limits.text)
    case 'html':
      return new TextWindow<HtmlState>(scanHtml, limits.text)
    case 'markdown':
      return new TextWindow<MarkdownState>(scanMarkdown, limits.text)
    case 'rich':
      return new RichWindow(format.dialect, limits)
  }
}

/* -------------------------------------------------------------------------- */
/* Text and entities                                                           */
/* -------------------------------------------------------------------------- */

type Scan<State> = (
  source: string,
  options: { mode: ParseMode; stopAt?: number; resume?: State },
) => ParseResult<State>

/** Plain text read the way the markup scanners read markup. */
function scanPlain(
  source: string,
  options: { mode: ParseMode; stopAt?: number },
): ParseResult<undefined> {
  let end = source.length
  if (options.stopAt !== undefined && options.stopAt < end) {
    end = options.stopAt
    if (splitsCharacter(source, end)) end -= 1
  }

  return {
    formatted: new Formatted(source.slice(0, end)),
    consumed: end,
    stopped: end < source.length,
    heldBack: false,
    state: undefined,
  }
}

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined

/**
 * The last place at or before `index` that falls between two graphemes —
 * so a flag, a family emoji or a letter with its accent is never cut apart.
 */
function graphemeBoundary(text: string, index: number): number {
  if (index <= 0 || index >= text.length) return index

  if (segmenter !== undefined) {
    const from = Math.max(0, index - 64)
    let boundary = from
    for (const { index: at } of segmenter.segment(
      text.slice(from, Math.min(text.length, index + 64)),
    )) {
      if (from + at > index) break
      boundary = from + at
    }

    return boundary
  }

  return splitsCharacter(text, index) ? index - 1 : index
}

/**
 * Where to cut rendered text that is longer than `limit`.
 *
 * Prefers the last line break, then the last space, in the second half of the
 * window, so a message does not end mid-word when it need not. A custom emoji
 * or a moment is one symbol and is never cut.
 */
export function cutPoint(value: Formatted, limit: number): number {
  let max = Math.min(limit, value.length)

  for (const entity of value.entities) {
    if (
      (entity.type === 'custom_emoji' || entity.type === 'date_time') &&
      entity.offset < max &&
      entity.offset + entity.length > max &&
      entity.offset > 0
    ) {
      max = entity.offset
    }
  }

  max = graphemeBoundary(value.text, max)
  const floor = Math.floor(limit / 2)

  const line = value.text.lastIndexOf('\n', max - 1)
  if (line >= 0 && line + 1 > floor) return line + 1

  const space = value.text.lastIndexOf(' ', max - 1)
  if (space >= 0 && space + 1 > floor) return space + 1

  return max > 0 ? max : Math.min(limit, value.length)
}

class TextWindow<State = unknown> implements Window {
  private source = ''
  private resume: State | undefined

  constructor(
    private readonly scan: Scan<State>,
    private readonly limit: number,
  ) {}

  get held(): number {
    return this.source.length
  }

  append(text: string): void {
    this.source += text
  }

  /** The source a partial parse may read: a lone first half of a character waits for its second. */
  private get settled(): string {
    const last = this.source.charCodeAt(this.source.length - 1)

    return this.source.length > 0 && isHighSurrogate(last) ? this.source.slice(0, -1) : this.source
  }

  private read(mode: ParseMode, stopAt?: number): ParseResult<State> {
    return this.scan(mode === 'partial' ? this.settled : this.source, {
      mode,
      ...(stopAt === undefined ? {} : { stopAt }),
      ...(this.resume === undefined ? {} : { resume: this.resume }),
    })
  }

  overflow(): Finished[] {
    const finished: Finished[] = []

    for (;;) {
      const whole = this.read('partial')
      if (whole.formatted.length <= this.limit) break

      let cut = this.read('partial', cutPoint(whole.formatted, this.limit))
      if (cut.consumed === 0 || cut.formatted.length === 0) cut = this.read('partial', this.limit)
      if (cut.consumed === 0) break

      finished.push({ payload: { kind: 'text', formatted: cut.formatted } })
      this.source = this.source.slice(cut.consumed)
      this.resume = cut.state
    }

    return finished
  }

  preview(): StreamPayload {
    return { kind: 'text', formatted: this.read('partial').formatted }
  }

  get visible(): boolean {
    return this.read('partial').formatted.length > 0
  }

  finish(complete: boolean): Finished {
    if (!complete) {
      // Everything shown so far; a token still arriving waits for the next window.
      const shown = this.read('partial')
      this.source = this.source.slice(shown.consumed)
      this.resume = shown.state

      return { payload: { kind: 'text', formatted: shown.formatted } }
    }

    let problem: unknown
    let result: ParseResult<State>
    try {
      result = this.read('strict')
    } catch (error) {
      if (!(error instanceof MarkupParseError)) throw error
      // Malformed markup keeps what is well formed; only the broken part shows as written.
      problem = error
      result = this.read('lenient')
    }

    this.source = ''
    this.resume = undefined

    return {
      payload: { kind: 'text', formatted: result.formatted },
      ...(problem === undefined ? {} : { problem }),
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Rich messages                                                               */
/* -------------------------------------------------------------------------- */

/** A fenced code block's opening line: its backticks and its language. */
const FENCE = /^(`{3,})([^\n`]*)$/

/** The fenced code block open at the end of `source`, if one is. */
function openFence(source: string): string | undefined {
  let open: string | undefined

  for (const line of source.split('\n')) {
    const fence = FENCE.exec(line.trimEnd())
    if (fence === null) continue
    open = open === undefined ? `${fence[1] as string}${(fence[2] as string).trim()}` : undefined
  }

  return open
}

/** Block-level HTML tags, each of which counts as a block. */
const BLOCK_TAGS =
  /<(p|h[1-6]|li|tr|blockquote|pre|table|ul|ol|details|figure|hr|aside|footer|img|video|audio)\b/gi

/**
 * How many blocks the markup holds, counted generously: every non-empty line
 * of Markdown outside a code block, and every block-level tag of HTML. Never
 * fewer than Telegram would count.
 */
function blocksIn(dialect: 'markdown' | 'html', source: string): number {
  if (dialect === 'html') return (source.match(BLOCK_TAGS)?.length ?? 0) + 1

  let count = 0
  let fenced = false
  for (const line of source.split('\n')) {
    if (FENCE.test(line.trimEnd())) {
      if (!fenced) count += 1
      fenced = !fenced
      continue
    }
    if (!fenced && line.trim().length > 0) count += 1
  }

  return count
}

/** Tags open at the end of HTML markup, outermost first, as written. */
function openTags(source: string): { name: string; tag: string }[] {
  const stack: { name: string; tag: string }[] = []

  for (const match of source.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^<>]*?(\/?)>/g)) {
    const [whole, slash, rawName, selfClosing] = match
    const name = (rawName as string).toLowerCase()
    if (selfClosing === '/' || name === 'br' || name === 'hr' || name === 'img') continue
    if (slash === '/') {
      const at = stack.map((entry) => entry.name).lastIndexOf(name)
      if (at !== -1) stack.splice(at)
      continue
    }
    stack.push({ name, tag: whole })
  }

  return stack
}

/** A trailing tag or character reference that has not finished arriving. */
function trailingPartial(source: string): number {
  const tag = source.lastIndexOf('<')
  if (tag !== -1 && !source.includes('>', tag)) return tag

  const reference = source.lastIndexOf('&')
  if (reference !== -1 && /^&[#a-zA-Z0-9]*$/.test(source.slice(reference))) return reference

  return source.length
}

class RichWindow implements Window {
  private source = ''

  constructor(
    private readonly dialect: 'markdown' | 'html',
    private readonly limits: WindowLimits,
  ) {}

  get held(): number {
    return this.source.length
  }

  append(text: string): void {
    this.source += text
  }

  private fits(source: string): boolean {
    return (
      codePoints(source) <= this.limits.rich && blocksIn(this.dialect, source) <= this.limits.blocks
    )
  }

  /** The longest prefix that fits, cut between blocks where it can be. */
  private cutIndex(): number {
    // The largest prefix within the code point limit, never inside a character.
    let max = 0
    let points = 0
    while (max < this.source.length && points < this.limits.rich) {
      max += splitsCharacter(this.source, max + 1) ? 2 : 1
      points += 1
    }
    // And within the block limit.
    while (max > 0 && blocksIn(this.dialect, this.source.slice(0, max)) > this.limits.blocks) {
      max = this.source.lastIndexOf('\n', max - 1)
      if (max <= 0) break
    }

    const head = this.source.slice(0, max)
    const floor = Math.floor(max / 2)

    for (const separator of this.dialect === 'markdown'
      ? ['\n\n', '\n', ' ']
      : ['\n\n', '\n', '>', ' ']) {
      const at = head.lastIndexOf(separator)
      if (at >= 0 && at + separator.length > floor) {
        const cut = at + separator.length
        // Never inside a tag.
        const lastOpen = head.lastIndexOf('<', cut - 1)
        const lastClose = head.lastIndexOf('>', cut - 1)
        if (this.dialect === 'html' && lastOpen > lastClose) continue

        return cut
      }
    }

    return max
  }

  /** Close in the first part what is open at the cut, and reopen it in the second. */
  private split(at: number): [string, string] {
    const head = this.source.slice(0, at)
    const tail = this.source.slice(at)

    if (this.dialect === 'markdown') {
      const fence = openFence(head)
      if (fence === undefined) return [head, tail]
      const backticks = /^`+/.exec(fence)?.[0] ?? '```'

      return [`${head.replace(/\n?$/, '\n')}${backticks}`, `${fence}\n${tail}`]
    }

    const open = openTags(head)

    return [
      `${head}${[...open]
        .reverse()
        .map((entry) => `</${entry.name}>`)
        .join('')}`,
      `${open.map((entry) => entry.tag).join('')}${tail}`,
    ]
  }

  overflow(): Finished[] {
    const finished: Finished[] = []

    while (!this.fits(this.source)) {
      const at = this.cutIndex()
      if (at <= 0) break
      const [head, tail] = this.split(at)
      finished.push({ payload: { kind: 'rich', dialect: this.dialect, source: head } })
      this.source = tail
    }

    return finished
  }

  /** The markup as it can be shown now: what is open closed, what is unfinished left out. */
  private shown(source: string): string {
    if (this.dialect === 'markdown') {
      const fence = openFence(source)
      if (fence === undefined) return source.replace(/`{1,2}$/, '')

      return `${source.replace(/\n?$/, '\n')}${/^`+/.exec(fence)?.[0] ?? '```'}`
    }

    const settled = source.slice(0, trailingPartial(source))

    return `${settled}${openTags(settled)
      .reverse()
      .map((entry) => `</${entry.name}>`)
      .join('')}`
  }

  preview(): StreamPayload {
    return { kind: 'rich', dialect: this.dialect, source: this.shown(this.source) }
  }

  get visible(): boolean {
    return this.shown(this.source).trim().length > 0
  }

  finish(complete: boolean): Finished {
    const source = complete ? this.shown(this.source) : this.shown(this.source)
    this.source = complete ? '' : this.carried()

    return { payload: { kind: 'rich', dialect: this.dialect, source } }
  }

  /** What continues into the next window when this one is finished early. */
  private carried(): string {
    if (this.dialect === 'markdown') {
      const fence = openFence(this.source)

      return fence === undefined ? (/`{1,2}$/.exec(this.source)?.[0] ?? '') : `${fence}\n`
    }

    const partial = trailingPartial(this.source)
    const settled = this.source.slice(0, partial)

    return `${openTags(settled)
      .map((entry) => entry.tag)
      .join('')}${this.source.slice(partial)}`
  }
}
