// SPDX-License-Identifier: MPL-2.0

/**
 * Formatted text: building it, reading markup into it, writing markup out.
 *
 * A separate entry point, `@yuigram/core/format`, so a program that never
 * formats anything never loads it. Both transports build on it: the Bot API
 * sends these ranges as they are, and MTProto maps each to its constructor.
 */

export {
  blockquote,
  bold,
  code,
  composeTimeFormat,
  customEmoji,
  expandableBlockquote,
  format,
  formatDedent,
  italic,
  join,
  link,
  type Modifier,
  type ModifierName,
  mentionBot,
  mentionUser,
  pre,
  spoiler,
  strikethrough,
  type TimeFormat,
  textMention,
  time,
  underline,
  type Wrap,
} from './builders.js'
export {
  codePoints,
  DETECTED,
  type Entity,
  type EntityType,
  type EntityUser,
  normalizeEntities,
  sortEntities,
  splitsCharacter,
} from './entities.js'
export {
  type Content,
  type FieldsOf,
  Formatted,
  type FormattedLike,
  type FormattedPayload,
  isFormattedLike,
  type MessageLike,
} from './formatted.js'
export {
  type HtmlOptions,
  type HtmlState,
  type HtmlTag,
  html,
  htmlb,
  MAX_TAG_DEPTH,
  parseHtml,
  scanHtml,
  type TagDefinitions,
  type TagHandler,
  type TagInfo,
} from './html.js'
export {
  type MarkdownOptions,
  type MarkdownState,
  type MarkdownTag,
  markdown,
  md,
  parseMarkdown,
  scanMarkdown,
} from './markdown.js'
export {
  MarkupParseError,
  type OpenRange,
  type ParseMode,
  type ParseOptions,
  type ParseResult,
} from './parse.js'
export {
  escapeHtmlAttribute,
  escapeHtmlText,
  escapeMarkdownCode,
  escapeMarkdownText,
  escapeMarkdownUrl,
  layout,
  toHtml,
  toMarkdown,
} from './serialize.js'
