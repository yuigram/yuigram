/**
 * Rich message blocks: headings, paragraphs, lists, tables, media and the rest.
 *
 * Every builder returns the Bot API's own `InputRichBlock` — plain data, what
 * `sendRichMessage` takes in `rich_message.blocks`. Content that is text goes
 * through {@link richText}, so strings are plain text and rich text builders
 * nest inside; content that is blocks goes through {@link blocksOf}, so a run
 * of text among blocks becomes a paragraph.
 *
 * ```ts
 * [
 *   heading(1, 'Weekly report'),
 *   paragraph(['Revenue is ', bold('up 12%'), '.']),
 *   table([['Region', 'Revenue'], ['EU', '1.2M']], { align: ['left', 'right'] }),
 *   photo('https://example.com/chart.png', { caption: 'Revenue by week' }),
 * ]
 * ```
 */

import { ValidationError } from '@yuigram/core'
import type {
  InputMediaAnimation,
  InputMediaAudio,
  InputMediaDocument,
  InputMediaPhoto,
  InputMediaVideo,
  InputMediaVoiceNote,
  InputRichBlock,
  InputRichBlockListItem,
  RichBlockCaption,
  RichBlockTableCell,
  RichMessageButton,
  RichText,
} from '../generated/types/index.js'
import { attach, type PayloadFile } from '../payloads.js'
import {
  type ButtonAction,
  type ButtonStyle,
  buttonOf,
  isEmptyRichText,
  type RichContent,
  reference,
  referenceLink,
  richText,
  superscript,
} from './text.js'

/** What a block builder accepts where blocks go: blocks, text, or both. */
export type BlockContent = RichContent | InputRichBlock | readonly BlockContent[]

/** The block kinds, by the `type` each carries. */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'pre',
  'footer',
  'divider',
  'mathematical_expression',
  'anchor',
  'list',
  'blockquote',
  'expandable_blockquote',
  'pullquote',
  'collage',
  'slideshow',
  'table',
  'details',
  'map',
  'buttons',
  'animation',
  'audio',
  'document',
  'photo',
  'video',
  'voice_note',
  'thinking',
])

/** Whether a value is a block rather than rich text. */
export function isBlock(value: unknown): value is InputRichBlock {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    BLOCK_TYPES.has((value as { type?: string }).type ?? '') &&
    // A rich text anchor and a block anchor share a type; only the block has no text.
    !(
      (value as { type?: string }).type === 'anchor' && 'text' in (value as Record<string, unknown>)
    )
  )
}

/**
 * Content as a list of blocks: blocks pass through, and each run of text
 * between them becomes one paragraph.
 */
export function blocksOf(content: BlockContent): InputRichBlock[] {
  const out: InputRichBlock[] = []
  let run: RichContent[] = []

  const flush = (): void => {
    const text = richText(run)
    if (!isEmptyRichText(text)) out.push({ type: 'paragraph', text } as InputRichBlock)
    run = []
  }

  const visit = (value: BlockContent): void => {
    if (value === null || value === undefined || value === false) return
    if (Array.isArray(value)) {
      for (const item of value as readonly BlockContent[]) visit(item)
      return
    }
    if (isBlock(value)) {
      flush()
      out.push(value)
      return
    }
    run.push(value as RichContent)
  }

  visit(content)
  flush()

  return out
}

/* -------------------------------------------------------------------------- */
/* Text blocks                                                                 */
/* -------------------------------------------------------------------------- */

export function paragraph(content: RichContent): InputRichBlock {
  return { type: 'paragraph', text: richText(content) } as InputRichBlock
}

/** A heading, level 1 to 6. */
export function heading(level: 1 | 2 | 3 | 4 | 5 | 6, content: RichContent): InputRichBlock {
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new ValidationError(`a heading is level 1 to 6, not ${level}`)
  }

  return { type: 'heading', text: richText(content), size: level } as InputRichBlock
}

export const h1 = (content: RichContent): InputRichBlock => heading(1, content)
export const h2 = (content: RichContent): InputRichBlock => heading(2, content)
export const h3 = (content: RichContent): InputRichBlock => heading(3, content)
export const h4 = (content: RichContent): InputRichBlock => heading(4, content)
export const h5 = (content: RichContent): InputRichBlock => heading(5, content)
export const h6 = (content: RichContent): InputRichBlock => heading(6, content)

/** A code block, shown exactly as written. */
export function codeBlock(text: string, language?: string): InputRichBlock {
  return {
    type: 'pre',
    text,
    ...(language === undefined || language === '' ? {} : { language }),
  } as InputRichBlock
}

export function footer(content: RichContent): InputRichBlock {
  return { type: 'footer', text: richText(content) } as InputRichBlock
}

export function divider(): InputRichBlock {
  return { type: 'divider' } as InputRichBlock
}

/** A formula on its own line, as LaTeX. */
export function mathBlock(latex: string): InputRichBlock {
  if (latex.length === 0) throw new ValidationError('a formula must not be empty')

  return { type: 'mathematical_expression', expression: latex } as InputRichBlock
}

/** A place in the message an anchor link can point to. */
export function anchorBlock(name: string): InputRichBlock {
  if (name.length === 0) throw new ValidationError('an anchor needs a name')

  return { type: 'anchor', name } as InputRichBlock
}

/** A quotation, of blocks, optionally credited. */
export function blockquote(content: BlockContent, credit?: RichContent): InputRichBlock {
  return {
    type: 'blockquote',
    blocks: blocksOf(content),
    ...(credit === undefined ? {} : { credit: richText(credit) }),
  } as InputRichBlock
}

/** A quotation shown collapsed until it is tapped. */
export function expandableBlockquote(content: RichContent, credit?: RichContent): InputRichBlock {
  return {
    type: 'expandable_blockquote',
    text: richText(content),
    ...(credit === undefined ? {} : { credit: richText(credit) }),
  } as InputRichBlock
}

/** A pull quote, optionally credited. */
export function pullQuote(content: RichContent, credit?: RichContent): InputRichBlock {
  return {
    type: 'pullquote',
    text: richText(content),
    ...(credit === undefined ? {} : { credit: richText(credit) }),
  } as InputRichBlock
}

/** A collapsible section: a summary, and blocks shown when it is opened. */
export function details(
  summary: RichContent,
  body: BlockContent,
  options: { readonly open?: boolean } = {},
): InputRichBlock {
  return {
    type: 'details',
    summary: richText(summary),
    blocks: blocksOf(body),
    ...(options.open === true ? { is_open: true } : {}),
  } as InputRichBlock
}

/** A placeholder shown in a draft while an answer is being written. Drafts only. */
export function thinking(content: RichContent): InputRichBlock {
  return { type: 'thinking', text: richText(content) } as InputRichBlock
}

/* -------------------------------------------------------------------------- */
/* Lists                                                                       */
/* -------------------------------------------------------------------------- */

function item(
  content: BlockContent,
  extra: Partial<InputRichBlockListItem> = {},
): InputRichBlockListItem {
  return { blocks: blocksOf(content), ...extra }
}

/** A bulleted list. */
export function list(items: readonly BlockContent[]): InputRichBlock {
  return { type: 'list', items: items.map((entry) => item(entry)) } as InputRichBlock
}

/** How an ordered list's items are labelled. */
export type ListLabel = 'a' | 'A' | 'i' | 'I' | '1'

/** A numbered list, from `start`, labelled as `label` says. */
export function orderedList(
  items: readonly BlockContent[],
  options: { readonly start?: number; readonly label?: ListLabel } = {},
): InputRichBlock {
  const start = options.start ?? 1
  if (!Number.isInteger(start)) throw new ValidationError('a list starts at a whole number')

  return {
    type: 'list',
    items: items.map((entry, index) =>
      item(entry, { value: start + index, type: options.label ?? '1' }),
    ),
  } as InputRichBlock
}

/** A checklist. */
export function taskList(
  items: readonly { readonly text: BlockContent; readonly done?: boolean }[],
): InputRichBlock {
  return {
    type: 'list',
    items: items.map((entry) =>
      item(entry.text, {
        has_checkbox: true,
        ...(entry.done === true ? { is_checked: true } : {}),
      }),
    ),
  } as InputRichBlock
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

/** How a table cell's content is aligned across. */
export type Align = 'left' | 'center' | 'right'

/** A cell with more to say than its text. */
export interface TableCell {
  readonly text?: RichContent
  readonly header?: boolean
  readonly colspan?: number
  readonly rowspan?: number
  readonly align?: Align
  readonly valign?: 'top' | 'middle' | 'bottom'
}

/** How a table is drawn. */
export interface TableOptions {
  /** The first row is headings. True by default. */
  readonly header?: boolean
  /** Each column's alignment. Left by default. */
  readonly align?: readonly Align[]
  readonly bordered?: boolean
  readonly striped?: boolean
  readonly compact?: boolean
  readonly caption?: RichContent
}

/** Telegram's most columns in one table. */
export const MAX_TABLE_COLUMNS = 20

function isCellObject(value: unknown): value is TableCell {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('type' in value) &&
    ('text' in value || 'colspan' in value || 'rowspan' in value || 'header' in value)
  )
}

/** One cell, with the heading and alignment its row and column give it unless it says otherwise. */
function tableCell(
  cell: RichContent | TableCell,
  heading: boolean,
  align: Align,
): RichBlockTableCell {
  const given: TableCell = isCellObject(cell) ? cell : { text: cell as RichContent }
  const spans = {
    ...(given.colspan !== undefined && given.colspan > 1 ? { colspan: given.colspan } : {}),
    ...(given.rowspan !== undefined && given.rowspan > 1 ? { rowspan: given.rowspan } : {}),
  }

  return {
    ...(given.text === undefined ? {} : { text: richText(given.text) }),
    ...((given.header ?? heading) ? { is_header: true } : {}),
    ...spans,
    align: given.align ?? align,
    valign: given.valign ?? 'middle',
  } as RichBlockTableCell
}

/** A table. Cells hold rich text only; the first row is headings unless told otherwise. */
export function table(
  rows: readonly (readonly (RichContent | TableCell)[])[],
  options: TableOptions = {},
): InputRichBlock {
  const width = Math.max(0, ...rows.map((row) => row.length))
  if (width > MAX_TABLE_COLUMNS) {
    throw new ValidationError(`a table has at most ${MAX_TABLE_COLUMNS} columns, not ${width}`)
  }

  const header = options.header !== false
  const cells: RichBlockTableCell[][] = rows.map((row, rowIndex) =>
    row.map((cell, column) =>
      tableCell(cell, header && rowIndex === 0, options.align?.[column] ?? 'left'),
    ),
  )

  return {
    type: 'table',
    cells,
    ...(options.bordered === true ? { is_bordered: true } : {}),
    ...(options.striped === true ? { is_striped: true } : {}),
    ...(options.compact === true ? { is_compact: true } : {}),
    ...(options.caption === undefined ? {} : { caption: richText(options.caption) }),
  } as InputRichBlock
}

/* -------------------------------------------------------------------------- */
/* Media, maps and buttons                                                     */
/* -------------------------------------------------------------------------- */

/** What a media block's caption says, and who it credits. */
export interface MediaOptions {
  readonly caption?: RichContent
  readonly credit?: RichContent
  /** Hide it behind a spoiler, where the kind allows. */
  readonly spoiler?: boolean
}

function captionOf(options: MediaOptions): { caption?: RichBlockCaption } {
  if (options.caption === undefined) {
    if (options.credit !== undefined)
      throw new ValidationError('a credit needs a caption to go with')

    return {}
  }

  return {
    caption: {
      text: richText(options.caption),
      ...(options.credit === undefined ? {} : { credit: richText(options.credit) }),
    },
  }
}

/**
 * Whether a file argument is already an \`InputMedia\` of this kind.
 *
 * Told apart by its \`media\` field together with its \`type\`: an upload can be a
 * \`Blob\`, which has a \`type\` of its own — a MIME type.
 */
function isMediaOf<T>(file: unknown, kind: string): file is T {
  return (
    typeof file === 'object' &&
    file !== null &&
    'media' in file &&
    (file as { readonly type?: unknown }).type === kind
  )
}

/** A photo: an upload, a URL, or a file Telegram already has. */
export function photo(
  file: PayloadFile | InputMediaPhoto,
  options: MediaOptions = {},
): InputRichBlock {
  const media = isMediaOf(file, 'photo')
    ? file
    : attach.photo(file, options.spoiler === true ? { has_spoiler: true } : {})

  return { type: 'photo', photo: media, ...captionOf(options) } as InputRichBlock
}

export function video(
  file: PayloadFile | InputMediaVideo,
  options: MediaOptions = {},
): InputRichBlock {
  const media = isMediaOf(file, 'video')
    ? file
    : attach.video(file, options.spoiler === true ? { has_spoiler: true } : {})

  return { type: 'video', video: media, ...captionOf(options) } as InputRichBlock
}

export function animation(
  file: PayloadFile | InputMediaAnimation,
  options: MediaOptions = {},
): InputRichBlock {
  const media = isMediaOf(file, 'animation')
    ? file
    : attach.animation(file, options.spoiler === true ? { has_spoiler: true } : {})

  return { type: 'animation', animation: media, ...captionOf(options) } as InputRichBlock
}

export function audio(
  file: PayloadFile | InputMediaAudio,
  options: Omit<MediaOptions, 'spoiler'> = {},
): InputRichBlock {
  const media = isMediaOf(file, 'audio') ? file : attach.audio(file)

  return { type: 'audio', audio: media, ...captionOf(options) } as InputRichBlock
}

export function voiceNote(
  file: PayloadFile | InputMediaVoiceNote,
  options: Omit<MediaOptions, 'spoiler'> = {},
): InputRichBlock {
  const media = isMediaOf(file, 'voice_note') ? file : attach.voiceNote(file)

  return { type: 'voice_note', voice_note: media, ...captionOf(options) } as InputRichBlock
}

export function document(
  file: PayloadFile | InputMediaDocument,
  options: Omit<MediaOptions, 'spoiler'> = {},
): InputRichBlock {
  const media = isMediaOf(file, 'document') ? file : attach.document(file)

  return { type: 'document', document: media, ...captionOf(options) } as InputRichBlock
}

/** What kind of media a block holds. */
export type MediaKind = 'photo' | 'video' | 'animation' | 'audio' | 'voice_note' | 'document'

/**
 * The kind of media an address holds, by what it ends in, as the
 * documentation's examples have it: a `.gif` is an animation and an `.ogg` a
 * voice note. Anything not recognisably a picture, a video or a sound is a
 * document.
 */
export function mediaKindOf(address: string): MediaKind {
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(address)?.[1]?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'heic'].includes(extension)) return 'photo'
  if (extension === 'gif') return 'animation'
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(extension)) return 'video'
  if (['ogg', 'oga', 'opus'].includes(extension)) return 'voice_note'
  if (['mp3', 'm4a', 'aac', 'flac', 'wav'].includes(extension)) return 'audio'

  return 'document'
}

/**
 * A media block of the kind asked for, or — for an address given without one —
 * of the kind the address ends in.
 */
export function media(
  file: PayloadFile,
  options: MediaOptions & { readonly kind?: MediaKind } = {},
): InputRichBlock {
  const { kind: asked, ...rest } = options
  const kind = asked ?? (typeof file === 'string' ? mediaKindOf(file) : 'document')
  const plain = {
    ...(rest.caption === undefined ? {} : { caption: rest.caption }),
    ...(rest.credit === undefined ? {} : { credit: rest.credit }),
  }

  switch (kind) {
    case 'photo':
      return photo(file, rest)
    case 'video':
      return video(file, rest)
    case 'animation':
      return animation(file, rest)
    case 'audio':
      return audio(file, plain)
    case 'voice_note':
      return voiceNote(file, plain)
    default:
      return document(file, plain)
  }
}

/** Photos and videos shown together. */
export function collage(
  items: readonly InputRichBlock[],
  options: Omit<MediaOptions, 'spoiler'> = {},
): InputRichBlock {
  return { type: 'collage', blocks: [...items], ...captionOf(options) } as InputRichBlock
}

/** Photos and videos shown one at a time. */
export function slideshow(
  items: readonly InputRichBlock[],
  options: Omit<MediaOptions, 'spoiler'> = {},
): InputRichBlock {
  return { type: 'slideshow', blocks: [...items], ...captionOf(options) } as InputRichBlock
}

/** A map's size: each side 0 to 10000, together at most 10000, neither more than 20 times the other. */
function checkMapSize(width: number | undefined, height: number | undefined): void {
  for (const side of [width, height]) {
    if (side !== undefined && (!Number.isInteger(side) || side < 0 || side > 10_000)) {
      throw new ValidationError('a map is 0 to 10000 wide and high')
    }
  }
  if (width === undefined || height === undefined) return
  if (width + height > 10_000)
    throw new ValidationError('a map is at most 10000 wide and high together')
  if (Math.max(width, height) > 20 * Math.max(1, Math.min(width, height))) {
    throw new ValidationError(
      'a map is at most 20 times as wide as it is high, or the other way round',
    )
  }
}

/** A map of a place. */
export function map(
  latitude: number,
  longitude: number,
  options: { readonly zoom?: number; readonly width?: number; readonly height?: number } & Omit<
    MediaOptions,
    'spoiler'
  > = {},
): InputRichBlock {
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ValidationError(
      'a place is a latitude from -90 to 90 and a longitude from -180 to 180',
    )
  }
  if (
    options.zoom !== undefined &&
    (!Number.isInteger(options.zoom) || options.zoom < 0 || options.zoom > 24)
  ) {
    throw new ValidationError('a map is zoomed from 0 to 24')
  }
  checkMapSize(options.width, options.height)

  return {
    type: 'map',
    location: { latitude, longitude },
    ...(options.zoom === undefined ? {} : { zoom: options.zoom }),
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
    ...captionOf(options),
  } as InputRichBlock
}

/** The most buttons one row holds. */
export const MAX_BUTTONS_PER_ROW = 8

/** A row of buttons of its own, aligned as asked. */
export function buttons(
  row: readonly (
    | RichMessageButton
    | {
        readonly label: RichContent
        readonly action: ButtonAction & { readonly style?: ButtonStyle }
      }
  )[],
  options: { readonly align?: Align } = {},
): InputRichBlock {
  if (row.length === 0 || row.length > MAX_BUTTONS_PER_ROW) {
    throw new ValidationError(`a row holds 1 to ${MAX_BUTTONS_PER_ROW} buttons, not ${row.length}`)
  }

  return {
    type: 'buttons',
    buttons: row.map((entry) => ('label' in entry ? buttonOf(entry.label, entry.action) : entry)),
    ...(options.align === undefined ? {} : { align: options.align }),
  } as InputRichBlock
}

/* -------------------------------------------------------------------------- */
/* Footnotes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A reference to a footnote, shown as its label in superscript. `label` is the
 * id unless given; rich Markdown's `[^id]` numbers them in order instead.
 */
export function footnoteRef(id: string, label: RichContent = id): RichText {
  return referenceLink(superscript(label), id)
}

/** A footnote: a paragraph opening with its label, which its references link to. */
export function footnote(
  id: string,
  definition: RichContent,
  label: RichContent = id,
): InputRichBlock {
  return paragraph([reference(superscript(label), id), ' ', definition])
}

/** Aliases, for the names other tools use. */
export const pre = codeBlock
export const hr = divider
export const quote = blockquote

export type { RichText }
