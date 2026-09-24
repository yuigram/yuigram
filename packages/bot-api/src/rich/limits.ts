/**
 * What a rich message holds, counted the way Telegram's limits count it.
 *
 * The documentation states the limits and what they include: characters of
 * text — custom emoji alternative text and formula source among them — blocks,
 * counting nested blocks, list items, table rows, quotations and details, levels
 * of nesting, media, and table columns. Counting here lets a message be refused
 * before it is sent rather than after.
 */

import type { InputRichBlock, RichText } from '../generated/types/index.js'

/** Telegram's limits on one rich message. */
export const RICH_LIMITS = {
  /** Characters of text, counted as Unicode code points. */
  characters: 32_768,
  blocks: 500,
  /** Levels of nested formatting and blocks. */
  depth: 16,
  media: 50,
  columns: 20,
} as const

/** What a message holds, by each limit. */
export interface RichMeasure {
  readonly characters: number
  readonly blocks: number
  readonly depth: number
  readonly media: number
}

const MEDIA = new Set(['photo', 'video', 'animation', 'audio', 'voice_note', 'document'])

/** Characters of text and levels of formatting in a run of rich text. */
function measureText(text: RichText | undefined): { characters: number; depth: number } {
  if (text === undefined) return { characters: 0, depth: 0 }
  if (typeof text === 'string') return { characters: [...text].length, depth: 0 }
  if (Array.isArray(text)) {
    return (text as readonly RichText[]).reduce(
      (sum, part) => {
        const one = measureText(part)

        return {
          characters: sum.characters + one.characters,
          depth: Math.max(sum.depth, one.depth),
        }
      },
      { characters: 0, depth: 0 },
    )
  }

  const value = text as unknown as Record<string, unknown>
  const inner = measureText(value['text'] as RichText | undefined)
  const own = [value['alternative_text'], value['expression']]
    .filter((field): field is string => typeof field === 'string')
    .reduce((sum, field) => sum + [...field].length, 0)

  return { characters: inner.characters + own, depth: inner.depth + 1 }
}

/** Every piece of rich text a block carries directly. */
function textsOf(block: Record<string, unknown>): RichText[] {
  const out: RichText[] = []
  for (const key of ['text', 'summary', 'credit']) {
    const value = block[key]
    if (value !== undefined && typeof value !== 'boolean') out.push(value as RichText)
  }
  const caption = block['caption'] as { text?: RichText; credit?: RichText } | RichText | undefined
  if (caption !== undefined) {
    if (
      typeof caption === 'object' &&
      caption !== null &&
      !Array.isArray(caption) &&
      'text' in caption &&
      !('type' in caption)
    ) {
      out.push(caption.text as RichText)
      if (caption.credit !== undefined) out.push(caption.credit)
    } else {
      out.push(caption as RichText)
    }
  }

  return out
}

/** The blocks a block holds, and the other things the block count includes. */
function childrenOf(block: Record<string, unknown>): {
  blocks: InputRichBlock[]
  extra: number
  cells: RichText[]
} {
  const blocks = [...((block['blocks'] as InputRichBlock[] | undefined) ?? [])]
  let extra = 0
  const cells: RichText[] = []

  for (const item of (block['items'] as { blocks: InputRichBlock[] }[] | undefined) ?? []) {
    extra += 1
    blocks.push(...item.blocks)
  }
  for (const row of (block['cells'] as { text?: RichText }[][] | undefined) ?? []) {
    extra += 1
    for (const cell of row) if (cell.text !== undefined) cells.push(cell.text)
  }

  return { blocks, extra, cells }
}

/** Measure blocks against Telegram's limits. */
export function measureRich(blocks: readonly InputRichBlock[]): RichMeasure {
  let characters = 0
  let count = 0
  let depth = 0
  let media = 0

  const visit = (list: readonly InputRichBlock[], level: number): void => {
    for (const block of list) {
      const value = block as unknown as Record<string, unknown>
      count += 1
      if (MEDIA.has(value['type'] as string)) media += 1
      if (typeof value['text'] === 'string' && value['type'] === 'pre') {
        characters += [...(value['text'] as string)].length
      }

      const { blocks: children, extra, cells } = childrenOf(value)
      count += extra
      for (const text of [...textsOf(value), ...cells]) {
        if (value['type'] === 'pre') continue
        const measured = measureText(text)
        characters += measured.characters
        depth = Math.max(depth, level + measured.depth)
      }
      if (typeof value['expression'] === 'string')
        characters += [...(value['expression'] as string)].length
      depth = Math.max(depth, level)
      visit(children, level + 1)
    }
  }

  visit(blocks, 1)

  return { characters, blocks: count, depth, media }
}

/** What is over a limit, as a sentence; `undefined` when nothing is. */
export function overLimit(measure: RichMeasure): string | undefined {
  if (measure.characters > RICH_LIMITS.characters) {
    return `a rich message holds at most ${RICH_LIMITS.characters} characters of text, not ${measure.characters}`
  }
  if (measure.blocks > RICH_LIMITS.blocks) {
    return `a rich message holds at most ${RICH_LIMITS.blocks} blocks, counting list items and table rows, not ${measure.blocks}`
  }
  if (measure.depth > RICH_LIMITS.depth) {
    return `a rich message nests at most ${RICH_LIMITS.depth} levels deep, not ${measure.depth}`
  }
  if (measure.media > RICH_LIMITS.media) {
    return `a rich message holds at most ${RICH_LIMITS.media} media, not ${measure.media}`
  }

  return undefined
}
