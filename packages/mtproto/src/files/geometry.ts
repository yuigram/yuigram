/**
 * How a transfer is divided, and which divisions Telegram will accept.
 *
 * A file does not travel in one piece. It is cut into parts on the way up and
 * asked for in ranges on the way down, and both are constrained — not by
 * convention but by rules the server enforces, refusing anything outside them
 * with an error about the request rather than about the arithmetic behind it.
 *
 * ```
 *   upload    ──> parts of one size, numbered from zero
 *   download  ──> ranges aligned to a grid, never straddling a megabyte
 * ```
 *
 * The rules are arithmetic and none of them is obvious, which is why they live
 * here rather than inline at the call sites: a range that straddles a megabyte
 * boundary is refused, a part size that does not divide half a megabyte is
 * refused, and a client that discovers either by being refused has spent a
 * round trip learning something it could have known.
 *
 * Nothing here transfers anything. It answers questions about sizes and offsets
 * so the layers that do can be about the transfer rather than the arithmetic.
 */

import { ValidationError } from '@yuigram/core'

/** The unit every alignment rule is expressed in. */
const KILOBYTE = 1024

/** The boundary a download range may never cross. */
const MEGABYTE = 1024 * 1024

/**
 * The largest part a file may be cut into, and the recommended one.
 *
 * Half a megabyte: the largest size satisfying both rules a part size has to
 * satisfy, so it is the fewest parts a file can be sent in.
 */
export const MAX_PART_SIZE = 512 * KILOBYTE

/**
 * Where a file stops being small.
 *
 * Up to and including this the parts go one way, and above it another. The two
 * paths differ in what the server is told rather than in what is sent, so the
 * threshold is the protocol's rather than a tuning choice: Telegram's file
 * documentation sends a file by `upload.saveBigFilePart` when it is *more than*
 * 10 MB.
 */
export const BIG_FILE_THRESHOLD = 10 * 1024 * 1024

/** The grid an ordinary download range sits on. */
const DOWNLOAD_ALIGNMENT = 4 * KILOBYTE

/** The finer grid a precise download range sits on. */
const PRECISE_ALIGNMENT = KILOBYTE

/** How a file is going to be sent. */
export type UploadPath = 'small' | 'big'

/** How a file will be cut up, and how it will be sent. */
export interface UploadGeometry {
  /** How many bytes each part carries, except possibly the last. */
  readonly partSize: number
  /**
   * How many parts the file comes to.
   *
   * A file of unknown length has none to state until the last part is being
   * sent, which the protocol expects to be said rather than guessed at.
   */
  readonly parts: number | undefined
  readonly path: UploadPath
}

/**
 * Whether a part size is one the server will accept.
 *
 * Two rules, both the protocol's: a part is a whole number of kilobytes, and a
 * whole number of parts makes up half a megabyte. The second is the one that
 * catches sizes which look reasonable — three hundred kilobytes is a whole
 * number of kilobytes and is refused.
 */
export function isUsablePartSize(partSize: number): boolean {
  return (
    Number.isInteger(partSize) &&
    partSize > 0 &&
    partSize <= MAX_PART_SIZE &&
    partSize % KILOBYTE === 0 &&
    MAX_PART_SIZE % partSize === 0
  )
}

/** Refuse a part size the server would refuse, before spending a round trip on it. */
export function checkPartSize(partSize: number): number {
  if (!isUsablePartSize(partSize)) {
    throw new ValidationError(
      `a part of ${partSize} bytes is not a size the datacenter accepts: it must be a whole number of kilobytes, at most ${MAX_PART_SIZE}, and divide ${MAX_PART_SIZE} exactly`,
    )
  }

  return partSize
}

/**
 * Work out how to send a file.
 *
 * The largest usable part is chosen, because the cost of a transfer is
 * dominated by the number of round trips it takes rather than by the size of
 * each. A caller that has a reason to choose otherwise supplies one, and it is
 * checked the same way.
 */
export function planUpload(options: {
  /** The length in bytes, when it is known. */
  readonly size?: number
  /** A part size to use instead of the largest usable one. */
  readonly partSize?: number
}): UploadGeometry {
  const partSize = options.partSize === undefined ? MAX_PART_SIZE : checkPartSize(options.partSize)

  if (options.size === undefined) {
    // Nothing is known about the length, so nothing can be said about the
    // number of parts. The protocol has a path for exactly this, and it is the
    // one that carries a total at all.
    return { partSize, parts: undefined, path: 'big' }
  }

  const size = options.size
  if (!Number.isInteger(size) || size < 0) {
    throw new ValidationError(`a file of ${size} bytes is not a file`)
  }

  return {
    partSize,
    // An empty file is still one part: the server is told about a file, not
    // about nothing.
    parts: size === 0 ? 1 : Math.ceil(size / partSize),
    path: size > BIG_FILE_THRESHOLD ? 'big' : 'small',
  }
}

/** How many parts a file of this length comes to, cut this way. */
export function partsFor(size: number, partSize: number): number {
  checkPartSize(partSize)
  if (!Number.isInteger(size) || size < 0) {
    throw new ValidationError(`a file of ${size} bytes is not a file`)
  }

  return size === 0 ? 1 : Math.ceil(size / partSize)
}

/** Where one part starts and how long it is. */
export function partAt(options: {
  readonly index: number
  readonly partSize: number
  /** The length, when it is known, so the last part can be the right size. */
  readonly size?: number
}): { readonly offset: number; readonly length: number } {
  const { index, partSize } = options
  if (!Number.isInteger(index) || index < 0) {
    throw new ValidationError(`${index} is not a part number`)
  }
  checkPartSize(partSize)

  const offset = index * partSize
  if (options.size === undefined) return { offset, length: partSize }

  if (offset > options.size) {
    throw new ValidationError(`part ${index} starts past the end of a ${options.size}-byte file`)
  }

  return { offset, length: Math.min(partSize, options.size - offset) }
}

/** How a download range is aligned. */
/**
 * Whether a file of this length is served in a single piece.
 *
 * A datacenter serves a file a megabyte at a time and a range may not cross
 * that boundary, so a file no larger than one is one range — which is one
 * request, which is one connection however many a transfer is allowed. A length
 * nobody knows is not: it is read in order until it ends, and that may be any
 * size at all.
 */
export function fitsOneRange(size: number | undefined): boolean {
  return size !== undefined && size >= 0 && size <= MEGABYTE
}

export type DownloadMode = 'normal' | 'precise'

/**
 * Whether a download range is one the server will answer.
 *
 * Three rules, and the third is the one that surprises: a range may sit on the
 * grid at both ends and still be refused for crossing a megabyte boundary,
 * because the server serves a file in megabyte-sized pieces and will not answer
 * across two of them.
 */
export function isUsableRange(options: {
  readonly offset: number
  readonly limit: number
  readonly mode?: DownloadMode
}): boolean {
  const { offset, limit } = options
  const alignment = options.mode === 'precise' ? PRECISE_ALIGNMENT : DOWNLOAD_ALIGNMENT

  if (!Number.isInteger(offset) || offset < 0) return false
  if (!Number.isInteger(limit) || limit <= 0) return false
  if (offset % alignment !== 0) return false
  if (limit % alignment !== 0) return false

  if (options.mode === 'precise') {
    if (limit > MEGABYTE) return false
  } else if (MEGABYTE % limit !== 0) return false

  // The whole range has to fall inside one megabyte-sized piece of the file.
  return Math.floor(offset / MEGABYTE) === Math.floor((offset + limit - 1) / MEGABYTE)
}

/** Refuse a range the server would refuse, naming which rule it broke. */
export function checkRange(options: {
  readonly offset: number
  readonly limit: number
  readonly mode?: DownloadMode
}): void {
  if (isUsableRange(options)) return

  const alignment = options.mode === 'precise' ? PRECISE_ALIGNMENT : DOWNLOAD_ALIGNMENT
  const { offset, limit } = options

  if (!Number.isInteger(offset) || offset < 0) {
    throw new ValidationError(`${offset} is not an offset`)
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ValidationError(`${limit} is not a length`)
  }
  if (offset % alignment !== 0) {
    throw new ValidationError(`an offset must be a multiple of ${alignment}, received ${offset}`)
  }
  if (limit % alignment !== 0) {
    throw new ValidationError(`a length must be a multiple of ${alignment}, received ${limit}`)
  }
  if (options.mode === 'precise') {
    throw new ValidationError(`a precise length may be at most ${MEGABYTE}, received ${limit}`)
  }
  if (MEGABYTE % limit !== 0) {
    throw new ValidationError(`a length must divide ${MEGABYTE} exactly, received ${limit}`)
  }

  throw new ValidationError(
    `a range of ${limit} bytes at ${offset} crosses a ${MEGABYTE}-byte boundary, which is served in one piece`,
  )
}

/**
 * The length to ask for, given what is wanted and what will fit.
 *
 * Two rules pull in opposite directions. Sitting on the grid is not enough for
 * an ordinary range — the length must also divide the megabyte the file is
 * served in, so the lengths that qualify are the grid step doubled over and
 * over — and a range must not cross into the next megabyte.
 *
 * So a length is rounded **up** to a qualifying one, because asking past the
 * end of a file is allowed and the server simply answers with less. But when
 * rounding up would cross the boundary, it is rounded **down** instead, because
 * crossing is refused outright. Rounding only one way produces lengths the
 * server will not answer: down alone under-fetches a short file into an
 * off-grid remainder, up alone hands back the megabyte's leftover, which is
 * exactly the length that does not divide it.
 *
 * A precise range has only the grid and the ceiling to satisfy, so what fits is
 * always usable and only the rounding up matters.
 */
function lengthToAsk(wanted: number, room: number, alignment: number): number {
  const up = Math.ceil(wanted / alignment) * alignment

  if (alignment === PRECISE_ALIGNMENT) return Math.min(up, room, MEGABYTE)

  let length = alignment
  while (length < up && length < MEGABYTE) length *= 2

  if (length <= room) return length

  // Rounding up would cross the boundary, so take the largest that does not.
  let fits = alignment
  while (fits * 2 <= room && fits < MEGABYTE) fits *= 2

  return fits
}

/**
 * Divide a download into ranges the server will answer.
 *
 * Each range is cut back to the megabyte boundary in front of it rather than
 * being allowed to cross one, which is why the ranges are not all the same
 * length even when the requested length is.
 */
export function planDownload(options: {
  /** The length in bytes, when it is known. */
  readonly size: number
  /** How much to ask for at a time. Defaults to the largest ordinary range. */
  readonly limit?: number
  readonly mode?: DownloadMode
  /** Where to start. Defaults to the beginning. */
  readonly offset?: number
}): Array<{ readonly offset: number; readonly limit: number }> {
  const { size } = options
  if (!Number.isInteger(size) || size < 0) {
    throw new ValidationError(`a file of ${size} bytes is not a file`)
  }

  const alignment = options.mode === 'precise' ? PRECISE_ALIGNMENT : DOWNLOAD_ALIGNMENT
  const limit = options.limit ?? MEGABYTE
  const start = options.offset ?? 0

  if (start % alignment !== 0) {
    throw new ValidationError(`an offset must be a multiple of ${alignment}, received ${start}`)
  }

  const ranges: Array<{ offset: number; limit: number }> = []
  for (let offset = start; offset < size; ) {
    // Never past the boundary in front, and never past the end of the file —
    // then rounded up to the grid, because a range must sit on it whether or
    // not the file happens to end there.
    const toBoundary = MEGABYTE - (offset % MEGABYTE)
    const wanted = Math.min(limit, toBoundary, Math.max(size - offset, 1))
    const taken = lengthToAsk(wanted, toBoundary, alignment)

    checkRange({
      offset,
      limit: taken,
      ...(options.mode === undefined ? {} : { mode: options.mode }),
    })
    ranges.push({ offset, limit: taken })
    offset += taken
  }

  return ranges
}
