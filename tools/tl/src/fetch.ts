// SPDX-License-Identifier: MIT

/**
 * Ingestion of the canonical schemas.
 *
 * Telegram publishes both documents as TL text inside an HTML page. This step
 * downloads them, recovers the text verbatim, and writes it to `schemas/tl/`.
 * It runs when a person asks it to; nothing at runtime, and nothing in the
 * build, reaches the network.
 *
 * The extraction is deliberately narrow. It looks for one `<pre>` block and
 * fails if the page does not contain exactly one, rather than concatenating
 * whatever it finds — a documentation restructure should stop the update, not
 * quietly produce a truncated schema that regenerates into a broken codec.
 */

/** Where a schema document comes from and what it is called on disk. */
export interface SchemaSource {
  readonly url: string
  /** Base name under `schemas/tl/`, without an extension. */
  readonly basename: string
  /**
   * How the document arrives: TL text inside an HTML page, which is how the
   * documentation publishes it. A schema carried as a file is read by
   * `tdlib.ts`, at a pinned revision.
   */
  readonly form: 'page'
}

/**
 * The documentation pages, in the order the pipeline reads them.
 *
 * The documentation page is the API schema's preferred source: it is the
 * published contract, it carries the layer index the pipeline reads the number
 * from, and it has a JSON rendering the crosscheck compares against. A layer
 * the page does not describe yet is read from TDLib, Telegram's own library, at
 * a pinned revision (`tdlib.ts`); the page still supplies the constructors the
 * TL language owns.
 *
 * Both are Telegram's. Nothing here reads a schema assembled by anybody else.
 */
export const SOURCES = {
  mtproto: { url: 'https://core.telegram.org/schema/mtproto', basename: 'mtproto', form: 'page' },
  api: { url: 'https://core.telegram.org/schema', basename: 'api', form: 'page' },
} as const satisfies Record<string, SchemaSource>

/** A page that could not be turned into schema text. */
export class TlFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TlFetchError'
  }
}

/** HTML entities the schema pages use. */
const ENTITIES: ReadonlyMap<string, string> = new Map([
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&amp;', '&'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&nbsp;', ' '],
])

/**
 * Recover TL text from a schema page.
 *
 * Both pages wrap the schema in a single `<pre>`; the API page decorates every
 * name with an anchor, which is stripped along with any other markup.
 */
export function extractSchemaText(html: string, url: string): string {
  const blocks = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)]

  if (blocks.length !== 1) {
    throw new TlFetchError(
      `expected exactly one <pre> block at ${url}, found ${blocks.length}; the page layout changed`,
    )
  }

  const markup = blocks[0]?.[1] ?? ''
  const withoutTags = markup.replace(/<[^>]+>/g, '')
  const text = decodeEntities(withoutTags)

  if (!text.includes('=') || !text.includes(';')) {
    throw new TlFetchError(`no TL definitions found at ${url}`)
  }

  // Normalised to LF and a single trailing newline so the committed file is
  // byte-identical whatever fetched it.
  return `${text.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '')}\n`
}

function decodeEntities(text: string): string {
  return text.replace(/&(?:lt|gt|amp|quot|nbsp|#39);/g, (entity) => ENTITIES.get(entity) ?? entity)
}

/**
 * Read the layer number the API schema page advertises.
 *
 * The number decides the snapshot's filename, so a page that no longer states
 * it fails the fetch rather than producing an unlabelled schema.
 */
export function extractLayer(html: string): number {
  // The page links every layer it has ever published, so the current one is the
  // highest. Reading the first link instead returns layer 1, which is the
  // oldest entry in that list rather than the newest.
  const listed = [...html.matchAll(/\?layer=(\d+)/g)].map((match) =>
    Number.parseInt(match[1] ?? '', 10),
  )
  const highest = Math.max(...listed.filter((value) => Number.isInteger(value)))

  if (!Number.isFinite(highest) || highest <= 0) {
    throw new TlFetchError('could not determine the layer number from the schema page')
  }

  return highest
}

/** Download a page. */
export async function download(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: 'text/html' } })
  if (!response.ok) {
    throw new TlFetchError(`${url} responded ${response.status}`)
  }

  return response.text()
}
