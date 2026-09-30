/**
 * The small previews that arrive inside a message rather than as files.
 *
 * Two of them. A stripped thumbnail is a tiny JPEG with every part that is the
 * same for all of them taken out — the headers, the tables and the end marker —
 * leaving its dimensions and the compressed image. A path thumbnail is the
 * outline of a sticker as an SVG path, packed into bytes. Both are shown while
 * the real file loads, so both have to be turned back into something a browser
 * or an image library reads, without a request.
 */

import { ValidationError } from '@yuigram/core'
import type { Thumbnail } from '../files/media.js'
import { detectMimeType } from '../files/types.js'

/*
 * The parts a stripped thumbnail leaves out.
 *
 * Its encoder uses baseline JPEG with the example tables of the JPEG standard
 * (ITU-T T.81, Annex K): the quantisation tables of K.1 and K.2 scaled to
 * quality 20, and the Huffman tables of K.3 to K.6. So the header is built from
 * those tables here rather than carried as bytes nobody can read.
 */

/** Table K.1, luminance quantisation, in row order. */
const LUMINANCE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]

/**
 * Table K.2, chrominance quantisation, in row order: the first four rows begin
 * with these values, and 99 fills everything else.
 */
const CHROMINANCE = [
  [17, 18, 24, 47],
  [18, 21, 26, 66],
  [24, 26, 56],
  [47, 66],
  [],
  [],
  [],
  [],
].flatMap((row) => [...row, ...new Array<number>(8 - row.length).fill(99)])

/** Where each coefficient goes in the order a table is written: the zigzag. */
function zigzag(): number[] {
  const order: number[] = []

  for (let sum = 0; sum < 15; sum += 1) {
    const cells: number[] = []
    for (let row = 0; row < 8; row += 1) {
      const column = sum - row
      if (column >= 0 && column < 8) cells.push(row * 8 + column)
    }
    // Diagonals alternate direction: up and right on even ones.
    order.push(...(sum % 2 === 0 ? cells.reverse() : cells))
  }

  return order
}

/** A table scaled to a quality, as the standard's reference encoder scales it. */
function scaled(table: readonly number[], quality: number): number[] {
  const factor = quality < 50 ? 5000 / quality : 200 - quality * 2

  return zigzag().map((at) =>
    Math.min(255, Math.max(1, Math.floor(((table[at] as number) * factor + 50) / 100))),
  )
}

/** A Huffman table: how many codes of each length, then the values in order. */
interface Huffman {
  readonly counts: readonly number[]
  readonly values: readonly number[]
}

/** The run and size pairs an AC table codes, grouped as its counts lay them out. */
function acValues(written: string): number[] {
  return written
    .trim()
    .split(/\s+/)
    .map((pair) => Number.parseInt(pair, 16))
}

/** Table K.3: luminance DC. */
const DC_LUMINANCE: Huffman = {
  counts: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

/** Table K.4: chrominance DC. */
const DC_CHROMINANCE: Huffman = {
  counts: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

/** Table K.5: luminance AC. */
const AC_LUMINANCE: Huffman = {
  counts: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
  values: acValues(`
    01 02 03 00 04 11 05 12 21 31 41 06 13 51 61 07 22 71 14 32 81 91 a1 08 23 42 b1 c1 15 52 d1 f0
    24 33 62 72 82 09 0a 16 17 18 19 1a 25 26 27 28 29 2a 34 35 36 37 38 39 3a 43 44 45 46 47 48 49
    4a 53 54 55 56 57 58 59 5a 63 64 65 66 67 68 69 6a 73 74 75 76 77 78 79 7a 83 84 85 86 87 88 89
    8a 92 93 94 95 96 97 98 99 9a a2 a3 a4 a5 a6 a7 a8 a9 aa b2 b3 b4 b5 b6 b7 b8 b9 ba c2 c3 c4 c5
    c6 c7 c8 c9 ca d2 d3 d4 d5 d6 d7 d8 d9 da e1 e2 e3 e4 e5 e6 e7 e8 e9 ea f1 f2 f3 f4 f5 f6 f7 f8
    f9 fa`),
}

/** Table K.6: chrominance AC. */
const AC_CHROMINANCE: Huffman = {
  counts: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
  values: acValues(`
    00 01 02 03 11 04 05 21 31 06 12 41 51 07 61 71 13 22 32 81 08 14 42 91 a1 b1 c1 09 23 33 52 f0
    15 62 72 d1 0a 16 24 34 e1 25 f1 17 18 19 1a 26 27 28 29 2a 35 36 37 38 39 3a 43 44 45 46 47 48
    49 4a 53 54 55 56 57 58 59 5a 63 64 65 66 67 68 69 6a 73 74 75 76 77 78 79 7a 82 83 84 85 86 87
    88 89 8a 92 93 94 95 96 97 98 99 9a a2 a3 a4 a5 a6 a7 a8 a9 aa b2 b3 b4 b5 b6 b7 b8 b9 ba c2 c3
    c4 c5 c6 c7 c8 c9 ca d2 d3 d4 d5 d6 d7 d8 d9 da e2 e3 e4 e5 e6 e7 e8 e9 ea f2 f3 f4 f5 f6 f7 f8
    f9 fa`),
}

/** One marker segment: the marker, its length counting itself, and its body. */
function segment(marker: number, body: readonly number[]): number[] {
  const length = body.length + 2

  return [0xff, marker, length >> 8, length & 0xff, ...body]
}

/** Where the frame header keeps the height's low byte, and the width's. */
const HEIGHT_AT = 164
const WIDTH_AT = 166

/** The header every stripped thumbnail shares, built once on first use. */
let header: Uint8Array | undefined

function strippedHeader(): Uint8Array {
  if (header !== undefined) return header

  const quality = 20
  const huffman = (tableClass: number, id: number, table: Huffman): number[] =>
    segment(0xc4, [(tableClass << 4) | id, ...table.counts, ...table.values])

  header = new Uint8Array([
    0xff,
    0xd8,
    // JFIF 1.1, no units, a pixel aspect of 1:1 and no thumbnail of its own.
    ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xdb, [0, ...scaled(LUMINANCE, quality)]),
    ...segment(0xdb, [1, ...scaled(CHROMINANCE, quality)]),
    // Baseline, eight bits, the size filled in per thumbnail, and three
    // components: luminance at twice the resolution of the two colours.
    ...segment(0xc0, [8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...huffman(0, 0, DC_LUMINANCE),
    ...huffman(1, 0, AC_LUMINANCE),
    ...huffman(0, 1, DC_CHROMINANCE),
    ...huffman(1, 1, AC_CHROMINANCE),
    // One scan over all three components, with every coefficient in it.
    ...segment(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]),
  ])

  return header
}

/**
 * A stripped thumbnail as a JPEG any decoder reads.
 *
 * ```ts
 * const size = photo.sizes.find((one) => one._ === 'photoStrippedSize')
 * const jpeg = strippedToJpeg(size.bytes)
 * ```
 *
 * The first byte says which layout the rest has, and only the one Telegram
 * uses is known; anything else is refused rather than decoded as garbage. The
 * second and third are the height and the width.
 */
export function strippedToJpeg(stripped: Uint8Array): Uint8Array {
  if (stripped.length < 3 || stripped[0] !== 1) {
    throw new ValidationError(
      'these bytes are not a stripped thumbnail in the layout Telegram uses',
    )
  }

  const head = strippedHeader()
  const out = new Uint8Array(head.length + stripped.length - 3 + 2)
  out.set(head)
  out.set(stripped.subarray(3), head.length)
  out[out.length - 2] = 0xff
  out[out.length - 1] = 0xd9
  out[HEIGHT_AT] = stripped[1] as number
  out[WIDTH_AT] = stripped[2] as number

  return out
}

/** What a byte of a packed path can stand for, above the range of numbers. */
const PATH_CHARACTERS = 'AACAAAAHAAALMAAAQASTAVAAAZaacaaaahaaalmaaaqastava.az0123456789-,'

/**
 * A path thumbnail's bytes as the SVG path they pack.
 *
 * Each byte is either a character of the path — a command, a digit, a point,
 * a minus or a comma — or a number from 0 to 63, which a byte may also mark as
 * following a comma or as negative. The path always starts at a move and ends
 * closed. Drawn on a 512 by 512 canvas, as Telegram lays sticker outlines out.
 */
export function inflatePath(encoded: Uint8Array): string {
  let path = 'M'

  for (const byte of encoded) {
    if (byte >= 128 + 64) {
      path += PATH_CHARACTERS[byte - 128 - 64]
      continue
    }

    if (byte >= 128) path += ','
    else if (byte >= 64) path += '-'
    path += String(byte & 63)
  }

  return `${path}z`
}

/** How an outline is drawn. */
export interface OutlineOptions {
  /** The canvas's size. 512 on both sides unless given, which is what the path is drawn for. */
  readonly width?: number
  readonly height?: number
  /** How to fill it. A light grey unless given. */
  readonly fill?: string
}

/**
 * A path as a complete SVG document, for somewhere that takes a file.
 *
 * The fill is written as an attribute value, so it is refused if it could end
 * the attribute: a colour is not the place for markup.
 */
export function outlineSvg(path: string, options: OutlineOptions = {}): string {
  const width = options.width ?? 512
  const height = options.height ?? 512
  const fill = options.fill ?? '#e0e0e0'

  if (!/^[#a-zA-Z0-9(),.%\s-]*$/.test(fill)) {
    throw new ValidationError(`'${fill}' is not a colour an outline can be filled with`)
  }
  if (!/^[MLCQSTAHVZmlcqstahvz0-9.,\s-]*$/.test(path)) {
    throw new ValidationError('an outline path holds only path commands and numbers')
  }

  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<path fill="${fill}" d="${path}"/></svg>`
  )
}

/** The content of a thumbnail that arrived with the message. */
export interface EmbeddedThumbnail {
  /** What the bytes are, as a file served with them would say. */
  readonly mimeType: string
  /** The image, complete: something a browser or an image library reads. */
  readonly bytes: Uint8Array
}

/**
 * Read a thumbnail that arrived inside the message, with no request.
 *
 * ```ts
 * const preview = thumbnails(document).find((size) => size.availability === 'embedded')
 * if (preview !== undefined) {
 *   const { mimeType, bytes } = embeddedThumbnail(preview)
 * }
 * ```
 *
 * A stripped preview is expanded back into a JPEG. A cached copy is already an
 * image and is answered as it arrived, typed by its own signature. A vector
 * outline becomes an SVG document on the canvas the thumbnail states, filled as
 * `fill` says.
 *
 * Refuses, by name, a size that has to be fetched — `thumbnailFile` names the
 * location for that — and one that holds no content to read.
 */
export function embeddedThumbnail(
  size: Thumbnail,
  options: Pick<OutlineOptions, 'fill'> = {},
): EmbeddedThumbnail {
  const raw = size.raw

  switch (raw._) {
    case 'photoStrippedSize':
      return { mimeType: 'image/jpeg', bytes: strippedToJpeg(raw.bytes) }

    case 'photoCachedSize':
      return { mimeType: detectMimeType(raw.bytes) ?? 'image/jpeg', bytes: raw.bytes }

    case 'photoPathSize': {
      const svg = outlineSvg(inflatePath(raw.bytes), {
        ...options,
        ...(size.width === undefined ? {} : { width: size.width }),
        ...(size.height === undefined ? {} : { height: size.height }),
      })

      return { mimeType: 'image/svg+xml', bytes: new TextEncoder().encode(svg) }
    }

    default:
      throw new ValidationError(
        size.availability === 'download'
          ? `the '${size.type}' size is fetched rather than carried in the message; ` +
              '`thumbnailFile` names where from'
          : `a ${raw._} carries no content to read`,
      )
  }
}
