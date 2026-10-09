// SPDX-License-Identifier: MPL-2.0

/**
 * Instant View pages and the rich text inside them.
 *
 * A page is a tree of blocks — paragraphs, headings, lists, galleries,
 * details that open — and its text is `RichText`, a tree of its own where bold
 * is a node wrapping what it makes bold. A message's text is the other shape:
 * a string and ranges over it. These convert between the two so a page's text
 * can be sent, searched or rendered with the formatters, walk a page's blocks
 * in reading order, and find the photo or document a block refers to by
 * identifier among those the page carries.
 */

import { dateFlags, dateFormat } from '../format/neutral.js'
import { type FormattedText, sortEntities, withinText } from '../format/text.js'
import type {
  TypeDocument,
  TypeMessageEntity,
  TypePage,
  TypePageBlock,
  TypePhoto,
  TypeRichText,
} from '../generated/api/types/index.js'

/** The rich text kinds that mark a range with one entity and carry nothing else. */
const MARKS: Readonly<Record<string, TypeMessageEntity['_']>> = {
  textBold: 'messageEntityBold',
  textItalic: 'messageEntityItalic',
  textUnderline: 'messageEntityUnderline',
  textStrike: 'messageEntityStrike',
  textSpoiler: 'messageEntitySpoiler',
  textFixed: 'messageEntityCode',
  textAutoUrl: 'messageEntityUrl',
  textAutoEmail: 'messageEntityEmail',
  textAutoPhone: 'messageEntityPhone',
  textBankCard: 'messageEntityBankCard',
  textBotCommand: 'messageEntityBotCommand',
  textCashtag: 'messageEntityCashtag',
  textHashtag: 'messageEntityHashtag',
  textMention: 'messageEntityMention',
}

/** The same, the other way. */
const MARKS_BACK: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MARKS).map(([rich, entity]) => [entity, rich]),
)

/**
 * Rich text as text and ranges.
 *
 * Everything a message can say survives: formatting, links — an email or a
 * phone number as a `mailto:` or `tel:` link — mentions, custom emoji and
 * dates. What only a page can say is kept as its text alone: subscript,
 * superscript, highlighting, an anchor, a button's label, the newer side of a
 * change and a formula's source. An inline image has no text and contributes
 * nothing.
 */
export function richTextToFormatted(rich: TypeRichText): FormattedText {
  const out = { text: '', entities: [] as TypeMessageEntity[] }
  flatten(rich, out)

  return withinText({ text: out.text, entities: sortEntities(out.entities) })
}

function flatten(rich: TypeRichText, out: { text: string; entities: TypeMessageEntity[] }): void {
  const offset = out.text.length
  const mark = (entity: Record<string, unknown>): void => {
    const length = out.text.length - offset
    if (length > 0) out.entities.push({ ...entity, offset, length } as TypeMessageEntity)
  }
  const inner = rich as unknown as { readonly text?: TypeRichText }

  switch (rich._) {
    case 'textEmpty':
    case 'textImage':
      return
    case 'textPlain':
      out.text += rich.text
      return
    case 'textConcat':
      for (const part of rich.texts) flatten(part, out)
      return
    case 'textMath':
      out.text += rich.source
      mark({ _: 'messageEntityCode' })
      return
    case 'textCustomEmoji':
      out.text += rich.alt
      mark({ _: 'messageEntityCustomEmoji', document_id: rich.document_id })
      return
    default:
      break
  }

  if (inner.text !== undefined) flatten(inner.text, out)

  const simple = MARKS[rich._]
  if (simple !== undefined) {
    mark({ _: simple })
    return
  }

  switch (rich._) {
    case 'textUrl':
      mark({ _: 'messageEntityTextUrl', url: rich.url })
      return
    case 'textEmail':
      mark({ _: 'messageEntityTextUrl', url: `mailto:${rich.email}` })
      return
    case 'textPhone':
      mark({ _: 'messageEntityTextUrl', url: `tel:${rich.phone}` })
      return
    case 'textMentionName':
      mark({ _: 'messageEntityMentionName', user_id: rich.user_id })
      return
    case 'textDate':
      mark({
        _: 'messageEntityFormattedDate',
        date: rich.date,
        ...dateFlags(dateFormat(rich as unknown as Record<string, unknown>)),
      })
      return
    default:
      // A page's own marks — subscript, superscript, highlighting, anchors,
      // buttons, changes — have no message form, and their text is kept.
      return
  }
}

/** One entity as the rich text node that wraps its range, or `undefined` for one with no such node. */
function wrap(
  entity: TypeMessageEntity,
  text: TypeRichText,
  covered: string,
): TypeRichText | undefined {
  const simple = MARKS_BACK[entity._]
  if (simple !== undefined) return { _: simple, text } as TypeRichText

  switch (entity._) {
    case 'messageEntityPre':
      return { _: 'textFixed', text }
    case 'messageEntityTextUrl':
      return { _: 'textUrl', text, url: entity.url, webpage_id: 0n }
    case 'messageEntityMentionName':
      return { _: 'textMentionName', text, user_id: entity.user_id }
    case 'inputMessageEntityMentionName':
      return entity.user_id._ === 'inputUser'
        ? { _: 'textMentionName', text, user_id: entity.user_id.user_id }
        : undefined
    case 'messageEntityCustomEmoji':
      return { _: 'textCustomEmoji', document_id: entity.document_id, alt: covered }
    case 'messageEntityFormattedDate':
      return {
        _: 'textDate',
        text,
        date: entity.date,
        ...dateFlags(dateFormat(entity as unknown as Record<string, unknown>)),
      } as TypeRichText
    default:
      // A quotation is a block on a page rather than a mark in its text.
      return undefined
  }
}

/**
 * Text and ranges as rich text.
 *
 * The text is cut wherever a range begins or ends, and each piece is wrapped
 * in what covers it, outermost first. A range with no rich form — a quotation,
 * which is a block on a page rather than a mark in its text — leaves its text
 * as it is.
 */
export function formattedToRichText(value: FormattedText): TypeRichText {
  const kept = withinText(value)
  if (kept.text === '') return { _: 'textEmpty' }

  const cuts = new Set([0, kept.text.length])
  for (const entity of kept.entities) {
    cuts.add(entity.offset)
    cuts.add(entity.offset + entity.length)
  }
  const points = [...cuts].sort((left, right) => left - right)

  const pieces: TypeRichText[] = []
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index] as number
    const to = points[index + 1] as number
    const covered = kept.text.slice(from, to)
    // Outermost first, which is the longest; the innermost wraps the text.
    const covering = kept.entities
      .filter((entity) => entity.offset <= from && entity.offset + entity.length >= to)
      .sort((left, right) => left.length - right.length)

    let piece: TypeRichText = { _: 'textPlain', text: covered }
    for (const entity of covering) piece = wrap(entity, piece, covered) ?? piece
    pieces.push(piece)
  }

  return pieces.length === 1 ? (pieces[0] as TypeRichText) : { _: 'textConcat', texts: pieces }
}

/**
 * What a visitor may say about the block it was shown. Anything else it
 * returns, nothing included, carries on.
 */
export type PageVisit = 'skip' | 'stop'

/**
 * Visit every block of a page, in reading order.
 *
 * ```ts
 * walkPageBlocks(page.blocks, (block) => {
 *   if (block._ === 'pageBlockPhoto') photos.push(block.photo_id)
 * })
 * ```
 *
 * A block inside another — a list item's paragraphs, a gallery's photos, the
 * contents of a section that opens — is visited after the block holding it,
 * with the blocks it is inside. Returning `'skip'` leaves out what is inside
 * the block just visited, and `'stop'` ends the walk. Returns whether it ran to
 * the end.
 */
export function walkPageBlocks(
  blocks: readonly TypePageBlock[],
  visit: (block: TypePageBlock, within: readonly TypePageBlock[]) => unknown,
): boolean {
  return walk(blocks, visit, [])
}

function walk(
  blocks: readonly TypePageBlock[],
  visit: (block: TypePageBlock, within: readonly TypePageBlock[]) => unknown,
  within: readonly TypePageBlock[],
): boolean {
  for (const block of blocks) {
    const said = visit(block, within)
    if (said === 'stop') return false
    if (said === 'skip') continue

    if (!walk(childrenOf(block), visit, [...within, block])) return false
  }

  return true
}

/** Whether a value is a block. */
function isBlock(value: unknown): value is TypePageBlock {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { readonly _?: unknown })._ === 'string' &&
    (value as { readonly _: string })._.startsWith('pageBlock')
  )
}

/**
 * The blocks directly inside one, wherever its constructor keeps them.
 *
 * Found by shape rather than listed by constructor, so a kind of block a newer
 * layer adds is walked into on the day the schema is regenerated: a cover's
 * block, a gallery's items, a section's blocks, and the blocks of a list item.
 */
function childrenOf(block: TypePageBlock): TypePageBlock[] {
  const found: TypePageBlock[] = []

  for (const field of Object.values(block)) {
    if (isBlock(field)) {
      found.push(field)
      continue
    }
    if (!Array.isArray(field)) continue

    for (const item of field) {
      if (isBlock(item)) found.push(item)
      else if (
        typeof item === 'object' &&
        item !== null &&
        Array.isArray((item as { readonly blocks?: unknown }).blocks)
      ) {
        found.push(
          ...((item as { readonly blocks: unknown[] }).blocks.filter(isBlock) as TypePageBlock[]),
        )
      }
    }
  }

  return found
}

/** What a block's identifier refers to, among what the page carries. */
export type PageMedia =
  | { readonly kind: 'photo'; readonly photo: TypePhoto }
  | { readonly kind: 'document'; readonly document: TypeDocument }

/**
 * The photo or document a block shows.
 *
 * A page carries its photos and documents once, beside its blocks, and a block
 * names one by identifier; this finds it, so it can be downloaded like any
 * other. A photo block, a video, an audio or a document block, an embed's
 * poster and an embedded post's author picture all name one. `undefined` where
 * the block names nothing or the page does not carry what it names.
 */
export function pageMedia(page: TypePage, block: TypePageBlock): PageMedia | undefined {
  const fields = block as unknown as Record<string, unknown>
  const photoId = (fields['photo_id'] ?? fields['poster_photo_id'] ?? fields['author_photo_id']) as
    | bigint
    | undefined
  const documentId = (fields['video_id'] ?? fields['audio_id'] ?? fields['document_id']) as
    | bigint
    | undefined

  if (photoId !== undefined) {
    const photo = page.photos.find((one) => one._ === 'photo' && one.id === photoId)
    if (photo !== undefined) return { kind: 'photo', photo }
  }

  if (documentId !== undefined) {
    const document = page.documents.find((one) => one._ === 'document' && one.id === documentId)
    if (document !== undefined) return { kind: 'document', document }
  }

  return undefined
}
