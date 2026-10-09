// SPDX-License-Identifier: MPL-2.0

/**
 * A rich message, whichever way it was written.
 *
 * Telegram takes a rich message in exactly one of three forms — blocks, rich
 * Markdown, rich HTML — and `Rich` is one of them with the options every form
 * shares. Build one from blocks with {@link rich}, or from markup with
 * {@link rich.markdown} and {@link rich.html}; hand it to a send with
 * `toInputRichMessage()`, or let `JSON.stringify` do it.
 *
 * ```ts
 * await bot.api.sendRichMessage({
 *   chat_id,
 *   rich_message: rich.markdown`# ${title}\n\nHello, ${bold(name)}.`.toInputRichMessage(),
 * })
 * ```
 */

import type {
  InputRichBlock,
  InputRichMessage,
  InputRichMessageMedia,
  RichText,
} from '../generated/types/index.js'
import { richMessage } from '../payloads.js'
import { type BlockContent, blocksOf, isBlock } from './blocks.js'
import { RichError } from './errors.js'
import { parseRichHtml, type RichParseOptions } from './parse-html.js'
import { parseRichMarkdown } from './parse-markdown.js'
import {
  blockHtml,
  blockMarkdown,
  escapeRichHtml,
  escapeRichMarkdown,
  inlineHtml,
  inlineMarkdown,
  MediaList,
  toRichHtml,
  toRichMarkdown,
} from './serialize.js'
import { type RichContent, richText } from './text.js'

/** The three forms a rich message takes. */
export type RichForm = 'blocks' | 'markdown' | 'html'

export { RichError } from './errors.js'

/** A rich message in one form, with the options every form shares. */
export class Rich {
  readonly #rtl: boolean
  readonly #skipDetection: boolean

  constructor(
    readonly form: RichForm,
    readonly content: string | readonly InputRichBlock[],
    readonly media: readonly InputRichMessageMedia[] = [],
    options: { readonly rtl?: boolean; readonly skipEntityDetection?: boolean } = {},
  ) {
    if (form === 'blocks' && (typeof content === 'string' || content.length === 0)) {
      throw new RichError('a rich message needs at least one block')
    }
    this.#rtl = options.rtl === true
    this.#skipDetection = options.skipEntityDetection === true
  }

  /** The blocks, for a message built from them. */
  get blocks(): readonly InputRichBlock[] | undefined {
    return this.form === 'blocks' ? (this.content as readonly InputRichBlock[]) : undefined
  }

  /** The same message shown right to left. */
  rtl(value = true): Rich {
    return new Rich(this.form, this.content, this.media, {
      rtl: value,
      skipEntityDetection: this.#skipDetection,
    })
  }

  /** The same message with URLs, mentions and the like left as plain text. */
  noEntityDetection(value = true): Rich {
    return new Rich(this.form, this.content, this.media, {
      rtl: this.#rtl,
      skipEntityDetection: value,
    })
  }

  /** What a send takes as `rich_message`. The media the markup names are checked against it. */
  toInputRichMessage(): InputRichMessage {
    const shown = {
      ...(this.#rtl ? { is_rtl: true } : {}),
      ...(this.#skipDetection ? { skip_entity_detection: true } : {}),
    }

    if (this.form === 'blocks')
      return richMessage.blocks(this.content as readonly InputRichBlock[], shown)

    return richMessage[this.form](this.content as string, {
      ...shown,
      ...(this.media.length === 0 ? {} : { media: this.media }),
    })
  }

  toJSON(): InputRichMessage {
    return this.toInputRichMessage()
  }

  /**
   * The same message as blocks, read out of its markup with the media it names.
   *
   * Telegram reads markup itself, and sending it as written is the faithful
   * way to send it. Reading it here is for checking it before it is sent — a
   * strict read refuses what the grammar does not have, and what is over a
   * limit — and for building on it or converting it. `lenient` keeps what
   * cannot be read as text instead.
   */
  toBlocks(options: Pick<RichParseOptions, 'lenient'> = {}): Rich {
    if (this.form === 'blocks') return this

    const read = { media: this.media, ...options }
    const blocks =
      this.form === 'markdown'
        ? parseRichMarkdown(this.content as string, read)
        : parseRichHtml(this.content as string, read)

    return new Rich('blocks', blocks, [], {
      rtl: this.#rtl,
      skipEntityDetection: this.#skipDetection,
    })
  }

  /**
   * The message as rich Markdown.
   *
   * A message already in Markdown is itself; blocks are written out, and HTML
   * is read into blocks first. What Markdown has no syntax for is written as
   * the HTML tags rich Markdown accepts.
   */
  toMarkdown(): string {
    if (this.form === 'markdown') return this.content as string

    return toRichMarkdown(this.toBlocks().content as readonly InputRichBlock[]).source
  }

  /** The message as rich HTML, on the same terms as {@link Rich.toMarkdown}. */
  toHtml(): string {
    if (this.form === 'html') return this.content as string

    return toRichHtml(this.toBlocks().content as readonly InputRichBlock[]).source
  }
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

function isTemplate(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw)
}

/** One interpolated value, written into a dialect. */
function written(dialect: 'markdown' | 'html', value: unknown, media: MediaList): string {
  if (value === null || value === undefined || value === false) return ''
  if (value instanceof Rich) return writtenRich(dialect, value, media)
  if (Array.isArray(value) && value.some(isBlock))
    return writtenBlocks(dialect, value as BlockContent, media)
  if (isBlock(value)) return writtenBlocks(dialect, value, media)
  if (typeof value === 'string' || typeof value === 'number') {
    return dialect === 'markdown'
      ? escapeRichMarkdown(String(value))
      : escapeRichHtml(String(value))
  }

  return inline(dialect, richText(value as RichContent))
}

/** A whole message interpolated into another: only one in the same dialect, or built from blocks. */
function writtenRich(dialect: 'markdown' | 'html', value: Rich, media: MediaList): string {
  if (value.form === 'blocks') return written(dialect, value.content, media)
  if (value.form !== dialect)
    throw new RichError(`a message written in ${value.form} cannot go into ${dialect}`)
  if (value.media.length > 0) {
    throw new RichError(
      'a rich message carrying its own media cannot be interpolated; build it from blocks',
    )
  }

  return value.content as string
}

function writtenBlocks(
  dialect: 'markdown' | 'html',
  value: BlockContent,
  media: MediaList,
): string {
  const separator = dialect === 'markdown' ? '\n\n' : '\n'

  return blocksOf(value)
    .map((block) =>
      dialect === 'markdown' ? blockMarkdown(block, media) : blockHtml(block, media),
    )
    .join(separator)
}

function inline(dialect: 'markdown' | 'html', text: RichText): string {
  return dialect === 'markdown' ? inlineMarkdown(text) : inlineHtml(text)
}

/** A dialect tag: markup as written, or a template whose values are text. */
export interface RichTag {
  /** Markup a developer wrote, as it is, with the media its links name. */
  (source: string, options?: { readonly media?: readonly InputRichMessageMedia[] }): Rich
  /**
   * A template: the literal parts are markup; an interpolated string is text,
   * escaped; an interpolated builder or block is written into the dialect.
   */
  (strings: TemplateStringsArray, ...values: readonly unknown[]): Rich
}

function dialectTag(dialect: 'markdown' | 'html'): RichTag {
  return ((first: unknown, ...rest: unknown[]) => {
    if (!isTemplate(first)) {
      const options = (rest[0] ?? {}) as { readonly media?: readonly InputRichMessageMedia[] }

      return new Rich(dialect, String(first), options.media ?? [])
    }

    const media = new MediaList()
    let source = ''
    first.forEach((literal, index) => {
      source += literal
      if (index < rest.length) source += written(dialect, rest[index], media)
    })

    return new Rich(dialect, source, media.entries)
  }) as RichTag
}

/** Rich Markdown: markup as written, or a template whose values are text. */
export const markdown: RichTag = dialectTag('markdown')

/** Rich HTML: markup as written, or a template whose values are text. */
export const html: RichTag = dialectTag('html')

/** A rich message built from blocks, text among them becoming paragraphs. */
export function compose(...content: readonly BlockContent[]): Rich {
  return new Rich('blocks', blocksOf(content))
}
