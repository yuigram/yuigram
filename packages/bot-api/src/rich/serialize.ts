// SPDX-License-Identifier: MIT

/**
 * Rich message blocks, written as rich Markdown or rich HTML.
 *
 * Telegram parses both dialects itself, so a rich message may be sent as
 * blocks or as either kind of markup. Writing blocks out is for the cases
 * markup suits better — a message assembled from a template, a draft streamed
 * as text, a message kept as readable source — and for looking at what a set
 * of blocks will show.
 *
 * Text is escaped for where it lands: every ASCII punctuation character in
 * Markdown prose, the characters that start markup in HTML. A file that is not
 * a public URL — an upload, or one Telegram already has — cannot be written
 * into markup, so it is listed in the message's `media` and named by the
 * `tg://` link the dialect reads.
 *
 * Where Markdown has no syntax for something — a credit, a spoiler, a table
 * cell spanning columns — the Markdown written uses the HTML tag Telegram
 * accepts inside rich Markdown for it.
 */

import type {
  InputMediaAnimation,
  InputMediaPhoto,
  InputRichBlock,
  InputRichBlockListItem,
  InputRichMessageMedia,
  RichBlockCaption,
  RichBlockTableCell,
  RichMessageButton,
  RichText,
} from '../generated/types/index.js'

/** Markup and the media it names. */
export interface Written {
  readonly source: string
  readonly media: InputRichMessageMedia[]
}

/** The link form each kind of media is named by in markup. */
const LINK_KIND: Readonly<Record<string, string>> = {
  photo: 'photo',
  video: 'video',
  animation: 'video',
  audio: 'audio',
  voice_note: 'audio',
  document: 'document',
}

/** Collects the media a piece of markup names, under ids of its own. */
class MediaList {
  readonly entries: InputRichMessageMedia[] = []

  /** The `src` to write for a file: its URL, or a link to an entry made for it. */
  srcOf(media: { readonly type: string; readonly media: unknown }): string {
    if (typeof media.media === 'string' && /^https?:\/\//i.test(media.media)) return media.media

    const id = `m${this.entries.length + 1}`
    this.entries.push({ id, media: media as InputRichMessageMedia['media'] })

    return `tg://${LINK_KIND[media.type] ?? 'document'}?id=${id}`
  }
}

/* -------------------------------------------------------------------------- */
/* Escaping                                                                    */
/* -------------------------------------------------------------------------- */

/** Escape text for rich Markdown prose: every ASCII punctuation character that can mean something. */
export function escapeRichMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|~=<>$^&]/g, (character) => `\\${character}`)
}

/**
 * Escape text for rich HTML: the characters that start markup, as numeric
 * references, which Telegram accepts everywhere.
 */
export function escapeRichHtml(text: string): string {
  return text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`)
}

/** Escape a link target in Markdown: its parentheses, backslashes and spaces. */
function escapeTarget(url: string): string {
  return url.replace(/[\\()]/g, (character) => `\\${character}`).replace(/ /g, '%20')
}

/** The text of rich text alone, formatting dropped. */
export function plainOf(text: RichText): string {
  if (typeof text === 'string') return text
  if (Array.isArray(text)) return text.map(plainOf).join('')

  const value = text as unknown as Record<string, unknown>
  if (value['type'] === 'custom_emoji') return String(value['alternative_text'] ?? '')
  if (value['type'] === 'mathematical_expression') return String(value['expression'] ?? '')
  if (value['text'] !== undefined) return plainOf(value['text'] as RichText)

  return ''
}

/* -------------------------------------------------------------------------- */
/* HTML                                                                        */
/* -------------------------------------------------------------------------- */

const HTML_STYLE: Readonly<Record<string, string>> = {
  bold: 'b',
  italic: 'i',
  underline: 'u',
  strikethrough: 's',
  spoiler: 'tg-spoiler',
  code: 'code',
  marked: 'mark',
  subscript: 'sub',
  superscript: 'sup',
}

function attribute(name: string, value: string | number | undefined): string {
  return value === undefined || value === '' ? '' : ` ${name}="${escapeRichHtml(String(value))}"`
}

/** A button as rich HTML. */
function buttonHtml(button: RichMessageButton): string {
  const label = inlineHtml(button.text)
  const style = attribute('style', button.style)

  if (button.url !== undefined)
    return `<tg-button type="url"${style}${attribute('url', button.url)}>${label}</tg-button>`
  if (button.callback_data !== undefined) {
    return `<tg-button type="callback_data"${style}${attribute('data', button.callback_data)}>${label}</tg-button>`
  }
  if (button.web_app !== undefined) {
    return `<tg-button type="web_app"${style}${attribute('url', button.web_app.url)}>${label}</tg-button>`
  }
  if (button.login_url !== undefined) {
    const login = button.login_url

    return `<tg-button type="login_url"${style}${attribute('url', login.url)}${attribute('forward-text', login.forward_text)}${attribute('bot-username', login.bot_username)}${login.request_write_access === true ? ' request-write-access' : ''}>${label}</tg-button>`
  }
  if (button.switch_inline_query !== undefined) {
    return `<tg-button type="switch_inline_query"${style}${attribute('query', button.switch_inline_query)}>${label}</tg-button>`
  }
  if (button.switch_inline_query_current_chat !== undefined) {
    return `<tg-button type="switch_inline_query_current_chat"${style}${attribute('query', button.switch_inline_query_current_chat)}>${label}</tg-button>`
  }
  if (button.switch_inline_query_chosen_chat !== undefined) {
    const chosen = button.switch_inline_query_chosen_chat
    const flags = [
      chosen.allow_user_chats === true ? ' allow-user-chats' : '',
      chosen.allow_bot_chats === true ? ' allow-bot-chats' : '',
      chosen.allow_group_chats === true ? ' allow-group-chats' : '',
      chosen.allow_channel_chats === true ? ' allow-channel-chats' : '',
    ].join('')

    return `<tg-button type="switch_inline_query_chosen_chat"${style}${attribute('query', chosen.query)}${flags}>${label}</tg-button>`
  }
  if (button.copy_text !== undefined) {
    return `<tg-button type="copy_text"${style}${attribute('text', button.copy_text.text)}>${label}</tg-button>`
  }

  return `<tg-button type="disabled"${style}>${label}</tg-button>`
}

/** Rich text as rich HTML. */
export function inlineHtml(text: RichText): string {
  if (typeof text === 'string') return escapeRichHtml(text)
  if (Array.isArray(text)) return text.map(inlineHtml).join('')

  const value = text as unknown as Record<string, unknown>
  const type = value['type'] as string
  const inner = (): string => inlineHtml(value['text'] as RichText)
  const tag = HTML_STYLE[type]
  if (tag !== undefined) return `<${tag}>${inner()}</${tag}>`

  switch (type) {
    case 'url':
      return `<a${attribute('href', value['url'] as string)}>${inner()}</a>`
    case 'email_address':
      return `<a${attribute('href', `mailto:${value['email_address']}`)}>${inner()}</a>`
    case 'phone_number':
      return `<a${attribute('href', `tel:${value['phone_number']}`)}>${inner()}</a>`
    case 'text_mention':
      return `<a${attribute('href', `tg://user?id=${(value['user'] as { id: number }).id}`)}>${inner()}</a>`
    case 'custom_emoji':
      return `<tg-emoji${attribute('emoji-id', value['custom_emoji_id'] as string)}>${escapeRichHtml(String(value['alternative_text'] ?? ''))}</tg-emoji>`
    case 'date_time':
      return `<tg-time${attribute('unix', value['unix_time'] as number)}${attribute('format', value['date_time_format'] as string)}>${inner()}</tg-time>`
    case 'mathematical_expression':
      return `<tg-math>${escapeRichHtml(String(value['expression']))}</tg-math>`
    case 'anchor':
      return `<a${attribute('name', value['name'] as string)}></a>`
    case 'anchor_link':
      return `<a${attribute('href', `#${value['anchor_name']}`)}>${inner()}</a>`
    case 'reference':
      return `<tg-reference${attribute('name', value['name'] as string)}>${inner()}</tg-reference>`
    case 'reference_link':
      return `<a${attribute('href', `#${value['reference_name']}`)}>${inner()}</a>`
    case 'button':
      return buttonHtml(value['button'] as RichMessageButton)
    default:
      // Mentions, hashtags and the like are found in text by Telegram itself.
      return value['text'] === undefined ? '' : inner()
  }
}

function captionHtml(caption: RichBlockCaption | undefined): string {
  if (caption === undefined) return ''
  const credit = caption.credit === undefined ? '' : `<cite>${inlineHtml(caption.credit)}</cite>`

  return `<figcaption>${inlineHtml(caption.text)}${credit}</figcaption>`
}

function mediaHtml(block: Record<string, unknown>, media: MediaList): string {
  const type = block['type'] as string
  const file = block[type] as { type: string; media: unknown; has_spoiler?: boolean }
  const src = attribute('src', media.srcOf(file))
  const spoiler =
    (file as InputMediaPhoto | InputMediaAnimation).has_spoiler === true ? ' tg-spoiler' : ''
  const element =
    type === 'photo'
      ? `<img${src}${spoiler}/>`
      : type === 'video' || type === 'animation'
        ? `<video${src}${spoiler}></video>`
        : type === 'audio' || type === 'voice_note'
          ? `<audio${src}></audio>`
          : `<tg-document${src}></tg-document>`
  const caption = block['caption'] as RichBlockCaption | undefined

  return caption === undefined ? element : `<figure>${element}${captionHtml(caption)}</figure>`
}

function listHtml(items: readonly InputRichBlockListItem[], media: MediaList): string {
  const ordered = items.some((entry) => entry.value !== undefined)
  const first = items[0]
  const start =
    ordered && first?.value !== undefined && first.value !== 1
      ? attribute('start', first.value)
      : ''
  const label =
    ordered && first?.type !== undefined && first.type !== '1' ? attribute('type', first.type) : ''
  const body = items
    .map((entry) => {
      const box =
        entry.has_checkbox === true
          ? `<input type="checkbox"${entry.is_checked === true ? ' checked' : ''}>`
          : ''

      return `<li>${box}${entry.blocks.map((block) => blockHtml(block, media)).join('')}</li>`
    })
    .join('')

  return ordered ? `<ol${start}${label}>${body}</ol>` : `<ul>${body}</ul>`
}

function tableHtml(block: Record<string, unknown>): string {
  const flags = [
    block['is_bordered'] === true ? ' bordered' : '',
    block['is_striped'] === true ? ' striped' : '',
    block['is_compact'] === true ? ' compact' : '',
  ].join('')
  const caption =
    block['caption'] === undefined
      ? ''
      : `<caption>${inlineHtml(block['caption'] as RichText)}</caption>`
  const rows = (block['cells'] as RichBlockTableCell[][])
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => {
            const tag = cell.is_header === true ? 'th' : 'td'
            const attributes = [
              attribute('colspan', cell.colspan),
              attribute('rowspan', cell.rowspan),
              cell.align === 'left' ? '' : attribute('align', cell.align),
              cell.valign === 'middle' ? '' : attribute('valign', cell.valign),
            ].join('')

            return `<${tag}${attributes}>${cell.text === undefined ? '' : inlineHtml(cell.text)}</${tag}>`
          })
          .join('')}</tr>`,
    )
    .join('')

  return `<table${flags}>${caption}${rows}</table>`
}

/** One block as rich HTML. */
export function blockHtml(block: InputRichBlock, media: MediaList): string {
  const value = block as unknown as Record<string, unknown>
  const text = (): string => inlineHtml(value['text'] as RichText)
  const credit = (): string =>
    value['credit'] === undefined ? '' : `<cite>${inlineHtml(value['credit'] as RichText)}</cite>`

  switch (value['type']) {
    case 'paragraph':
      return `<p>${text()}</p>`
    case 'heading':
      return `<h${value['size']}>${text()}</h${value['size']}>`
    case 'pre': {
      const code = escapeRichHtml(plainOf(value['text'] as RichText))
      const language = value['language'] as string | undefined

      return language === undefined
        ? `<pre>${code}</pre>`
        : `<pre><code class="language-${escapeRichHtml(language)}">${code}</code></pre>`
    }
    case 'footer':
      return `<footer>${text()}</footer>`
    case 'divider':
      return '<hr/>'
    case 'mathematical_expression':
      return `<tg-math-block>${escapeRichHtml(String(value['expression']))}</tg-math-block>`
    case 'anchor':
      return `<a${attribute('name', value['name'] as string)}></a>`
    case 'list':
      return listHtml(value['items'] as InputRichBlockListItem[], media)
    case 'blockquote':
      return `<blockquote>${(value['blocks'] as InputRichBlock[]).map((inner) => blockHtml(inner, media)).join('')}${credit()}</blockquote>`
    case 'expandable_blockquote':
      return `<blockquote expandable>${text()}${credit()}</blockquote>`
    case 'pullquote':
      return `<aside>${text()}${credit()}</aside>`
    case 'collage':
    case 'slideshow': {
      const tag = value['type'] === 'collage' ? 'tg-collage' : 'tg-slideshow'
      const items = (value['blocks'] as InputRichBlock[])
        .map((inner) => mediaHtml(inner as unknown as Record<string, unknown>, media))
        .join('')

      return `<${tag}>${items}${captionHtml(value['caption'] as RichBlockCaption | undefined)}</${tag}>`
    }
    case 'table':
      return tableHtml(value)
    case 'details':
      return `<details${value['is_open'] === true ? ' open' : ''}><summary>${inlineHtml(value['summary'] as RichText)}</summary>${(value['blocks'] as InputRichBlock[]).map((inner) => blockHtml(inner, media)).join('')}</details>`
    case 'map': {
      const location = value['location'] as { latitude: number; longitude: number }
      const element = `<tg-map${attribute('lat', location.latitude)}${attribute('long', location.longitude)}${attribute('zoom', value['zoom'] as number | undefined)}/>`
      const caption = value['caption'] as RichBlockCaption | undefined

      return caption === undefined ? element : `<figure>${element}${captionHtml(caption)}</figure>`
    }
    case 'buttons':
      return `<tg-button-row${attribute('align', value['align'] as string | undefined)}>${(value['buttons'] as RichMessageButton[]).map(buttonHtml).join('')}</tg-button-row>`
    case 'thinking':
      return `<tg-thinking>${text()}</tg-thinking>`
    default:
      return mediaHtml(value, media)
  }
}

/** Blocks as rich HTML, with the media the markup names. */
export function toRichHtml(blocks: readonly InputRichBlock[]): Written {
  const media = new MediaList()
  const source = blocks.map((block) => blockHtml(block, media)).join('\n')

  return { source, media: media.entries }
}

/* -------------------------------------------------------------------------- */
/* Markdown                                                                    */
/* -------------------------------------------------------------------------- */

const MARKDOWN_STYLE: Readonly<Record<string, string>> = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
  spoiler: '||',
  marked: '==',
}

/** Whether content can sit between emphasis markers and still read as emphasis. */
function flankable(inner: string): boolean {
  return inner.length > 0 && !/^\s/.test(inner) && !/\s$/.test(inner)
}

/** Inline code with enough backticks around it that none inside can end it. */
function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''

  return `${fence}${pad}${text}${pad}${fence}`
}

/** Rich text as rich Markdown. */
export function inlineMarkdown(text: RichText): string {
  if (typeof text === 'string') return escapeRichMarkdown(text).replace(/\n/g, '  \n')
  if (Array.isArray(text)) return text.map(inlineMarkdown).join('')

  const value = text as unknown as Record<string, unknown>
  const type = value['type'] as string
  const inner = (): string => inlineMarkdown(value['text'] as RichText)

  const marker = MARKDOWN_STYLE[type]
  if (marker !== undefined) {
    const body = inner()

    return flankable(body) ? `${marker}${body}${marker}` : inlineHtml(text)
  }

  switch (type) {
    case 'code':
      return codeSpan(plainOf(value['text'] as RichText))
    case 'url':
      return `[${inner()}](${escapeTarget(value['url'] as string)})`
    case 'email_address':
      return `[${inner()}](mailto:${escapeTarget(value['email_address'] as string)})`
    case 'phone_number':
      return `[${inner()}](tel:${escapeTarget(value['phone_number'] as string)})`
    case 'text_mention':
      return `[${inner()}](tg://user?id=${(value['user'] as { id: number }).id})`
    case 'custom_emoji':
      return `![${escapeRichMarkdown(String(value['alternative_text'] ?? ''))}](tg://emoji?id=${value['custom_emoji_id']})`
    case 'date_time': {
      const format = value['date_time_format'] === '' ? '' : `&format=${value['date_time_format']}`

      return `![${escapeRichMarkdown(plainOf(value['text'] as RichText))}](tg://time?unix=${value['unix_time']}${format})`
    }
    case 'mathematical_expression': {
      const expression = String(value['expression'])

      return expression.includes('$') ? inlineHtml(text) : `$${expression}$`
    }
    case 'anchor_link':
      return `[${inner()}](#${escapeTarget(value['anchor_name'] as string)})`
    case 'reference_link':
      return `[${inner()}](#${escapeTarget(value['reference_name'] as string)})`
    case 'underline':
    case 'subscript':
    case 'superscript':
    case 'anchor':
    case 'reference':
    case 'button':
      // No Markdown syntax: the HTML tag, which rich Markdown accepts inline.
      return inlineHtml(text)
    default:
      return value['text'] === undefined ? '' : inner()
  }
}

/** A code block with a fence longer than any run of backticks inside it. */
function fenced(text: string, language: string): string {
  const longest = Math.max(0, ...(text.match(/`{3,}/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))

  return `${fence}${language}\n${text}\n${fence}`
}

/** Indent every line after the first, for a block nested in a list item. */
function indented(text: string, by: number): string {
  const pad = ' '.repeat(by)

  return text
    .split('\n')
    .map((line, index) => (index === 0 || line.length === 0 ? line : `${pad}${line}`))
    .join('\n')
}

function listMarkdown(items: readonly InputRichBlockListItem[], media: MediaList): string {
  const ordered = items.some((entry) => entry.value !== undefined)
  // Letters and Roman numerals have no Markdown syntax.
  if (ordered && items.some((entry) => entry.type !== undefined && entry.type !== '1')) {
    return listHtml(items, media)
  }

  return items
    .map((entry, index) => {
      const marker = ordered ? `${entry.value ?? index + 1}. ` : '- '
      const box = entry.has_checkbox === true ? (entry.is_checked === true ? '[x] ' : '[ ] ') : ''
      const body = entry.blocks.map((block) => blockMarkdown(block, media)).join('\n\n')

      return `${marker}${box}${indented(body, marker.length)}`
    })
    .join('\n')
}

/** Whether a table is plain enough for a Markdown table: a header row, and no spans or flags. */
function isPlainTable(block: Record<string, unknown>): boolean {
  const cells = block['cells'] as RichBlockTableCell[][]
  const [head, ...rest] = cells
  if (head === undefined) return false

  return (
    head.every((cell) => cell.is_header === true) &&
    rest.every((row) => row.every((cell) => cell.is_header !== true)) &&
    cells.every((row) =>
      row.every(
        (cell) =>
          cell.colspan === undefined && cell.rowspan === undefined && cell.valign === 'middle',
      ),
    ) &&
    block['is_bordered'] === undefined &&
    block['is_striped'] === undefined &&
    block['is_compact'] === undefined &&
    block['caption'] === undefined
  )
}

function tableMarkdown(block: Record<string, unknown>): string {
  const [head = [], ...rest] = block['cells'] as RichBlockTableCell[][]
  const cell = (entry: RichBlockTableCell): string =>
    entry.text === undefined ? '' : inlineMarkdown(entry.text).replace(/ {2}\n/g, ' ')
  const rule = head.map((entry) =>
    entry.align === 'center' ? ':---:' : entry.align === 'right' ? '---:' : ':---',
  )

  return [
    `| ${head.map(cell).join(' | ')} |`,
    `|${rule.join('|')}|`,
    ...rest.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n')
}

function mediaMarkdown(block: Record<string, unknown>, media: MediaList): string {
  const type = block['type'] as string
  const file = block[type] as { type: string; media: unknown; has_spoiler?: boolean }
  const caption = block['caption'] as RichBlockCaption | undefined

  if (file.has_spoiler === true || caption?.credit !== undefined) return mediaHtml(block, media)

  const src = escapeTarget(media.srcOf(file))
  const title =
    caption === undefined
      ? ''
      : ` "${plainOf(caption.text).replace(/["\\]/g, (character) => `\\${character}`)}"`

  return `![](${src}${title})`
}

/** One block as rich Markdown. */
export function blockMarkdown(block: InputRichBlock, media: MediaList): string {
  const value = block as unknown as Record<string, unknown>

  switch (value['type']) {
    case 'paragraph':
      return inlineMarkdown(value['text'] as RichText)
    case 'heading':
      return `${'#'.repeat(value['size'] as number)} ${inlineMarkdown(value['text'] as RichText)}`
    case 'pre':
      return fenced(
        plainOf(value['text'] as RichText),
        (value['language'] as string | undefined) ?? '',
      )
    case 'divider':
      return '---'
    case 'mathematical_expression': {
      const expression = String(value['expression'])

      return expression.includes('$$') ? fenced(expression, 'math') : `$$${expression}$$`
    }
    case 'list':
      return listMarkdown(value['items'] as InputRichBlockListItem[], media)
    case 'blockquote':
      if (value['credit'] !== undefined) return blockHtml(block, media)

      return (value['blocks'] as InputRichBlock[])
        .map((inner) => blockMarkdown(inner, media))
        .join('\n\n')
        .split('\n')
        .map((line) => `>${line}`)
        .join('\n')
    case 'details':
      return `<details${value['is_open'] === true ? ' open' : ''}><summary>${inlineMarkdown(value['summary'] as RichText)}</summary>\n\n${(value['blocks'] as InputRichBlock[]).map((inner) => blockMarkdown(inner, media)).join('\n\n')}\n\n</details>`
    case 'collage':
    case 'slideshow':
      if (value['caption'] !== undefined) return blockHtml(block, media)

      return `<tg-${value['type']}>\n${(value['blocks'] as InputRichBlock[])
        .map((inner) => mediaMarkdown(inner as unknown as Record<string, unknown>, media))
        .join('\n')}\n</tg-${value['type']}>`
    case 'table':
      return isPlainTable(value) ? tableMarkdown(value) : tableHtml(value)
    case 'photo':
    case 'video':
    case 'animation':
    case 'audio':
    case 'voice_note':
    case 'document':
      return mediaMarkdown(value, media)
    default:
      // Footers, anchors, collapsed and pull quotations, maps, buttons and the
      // thinking block have no Markdown syntax: rich Markdown takes their HTML.
      return blockHtml(block, media)
  }
}

/** Blocks as rich Markdown, with the media the markup names. */
export function toRichMarkdown(blocks: readonly InputRichBlock[]): Written {
  const media = new MediaList()
  const source = blocks.map((block) => blockMarkdown(block, media)).join('\n\n')

  return { source, media: media.entries }
}

export { MediaList }
