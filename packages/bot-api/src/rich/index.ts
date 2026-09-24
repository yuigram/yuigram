/**
 * Rich messages: blocks, rich text, and the two markup dialects.
 *
 * ```ts
 * import { rich } from 'yuigram/rich'
 *
 * const report = rich(
 *   rich.h1('Weekly report'),
 *   ['Revenue is ', rich.bold('up 12%'), '.'],
 *   rich.table([['Region', 'Revenue'], ['EU', '1.2M']], { align: ['left', 'right'] }),
 * )
 * await bot.api.sendRichMessage({ chat_id, rich_message: report.toInputRichMessage() })
 * ```
 *
 * A separate entry point, so a bot that sends no rich messages never loads it.
 * Every builder returns the Bot API's own plain data; `rich` gathers them
 * under one name, and is itself the way to compose blocks into a message.
 */

import type { BlockContent } from './blocks.js'
import * as blocks from './blocks.js'
import { measureRich } from './limits.js'
import { parseRichHtml } from './parse-html.js'
import { parseRichMarkdown } from './parse-markdown.js'
import { compose, html, markdown, Rich } from './rich.js'
import * as text from './text.js'

export * from './blocks.js'
export { RichParseError } from './errors.js'
export { measureRich, overLimit, RICH_LIMITS, type RichMeasure } from './limits.js'
export { parseRichHtml, parseRichHtmlText, type RichParseOptions } from './parse-html.js'
export { parseRichMarkdown, parseRichMarkdownText } from './parse-markdown.js'
export { compose, html, markdown, Rich, RichError, type RichForm, type RichTag } from './rich.js'
export {
  blockHtml,
  blockMarkdown,
  escapeRichHtml,
  escapeRichMarkdown,
  inlineHtml,
  inlineMarkdown,
  plainOf,
  toRichHtml,
  toRichMarkdown,
  type Written,
} from './serialize.js'
export * from './text.js'

/**
 * Every rich message builder under one name, callable to compose blocks into
 * a message.
 *
 * `rich(...)` builds from blocks; `rich.markdown` and `rich.html` build from
 * markup. Everything else is a block or rich text builder by its own name.
 */
export const rich: typeof compose &
  typeof blocks &
  typeof text & {
    readonly markdown: typeof markdown
    readonly md: typeof markdown
    readonly html: typeof html
    readonly Rich: typeof Rich
    readonly parseMarkdown: typeof parseRichMarkdown
    readonly parseHtml: typeof parseRichHtml
    readonly measure: typeof measureRich
  } = Object.assign((...content: BlockContent[]) => compose(...content), {
  ...blocks,
  ...text,
  markdown,
  md: markdown,
  html,
  Rich,
  parseMarkdown: parseRichMarkdown,
  parseHtml: parseRichHtml,
  measure: measureRich,
})
