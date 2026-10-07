/**
 * Dividing a transfer the way the datacenter will accept it.
 *
 * None of these rules is obvious and all of them are enforced by the server, so
 * every one that is got wrong is discovered as a refusal describing the request
 * rather than the arithmetic behind it. The cases below are the rules
 * themselves: what a part may be, what a range may be, and the boundary a range
 * may not cross however well aligned both its ends are.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  BIG_FILE_THRESHOLD,
  checkPartSize,
  checkRange,
  fitsOneRange,
  isUsablePartSize,
  isUsableRange,
  MAX_PART_SIZE,
  partAt,
  partsFor,
  planDownload,
  planUpload,
} from '../src/files/geometry.js'

const KB = 1024
const MB = 1024 * 1024

/** Every start worth planning from: the grid, the boundary, and either side. */
const OFFSETS = [0, 4 * KB, 8 * KB, 12 * KB, 512 * KB, MB - 4 * KB, MB + 4 * KB]

/** Lengths that sit on, just short of, and just past the interesting edges. */
const SIZES = [
  1,
  4 * KB + 1,
  8 * KB + 100,
  8292,
  64 * KB,
  MB - 1,
  MB,
  MB + 1,
  2 * MB - 1,
  3 * MB + 7 * KB,
]

describe('how a file may be cut up', () => {
  it('accepts every size that divides half a megabyte', () => {
    for (const size of [1 * KB, 2 * KB, 4 * KB, 32 * KB, 128 * KB, 256 * KB, 512 * KB]) {
      expect(isUsablePartSize(size), `${size}`).toBe(true)
    }
  })

  it('refuses a whole number of kilobytes that does not divide it', () => {
    // The rule that catches sizes which look perfectly reasonable.
    for (const size of [3 * KB, 100 * KB, 300 * KB, 511 * KB]) {
      expect(isUsablePartSize(size), `${size}`).toBe(false)
    }
  })

  it('refuses anything that is not a whole number of kilobytes', () => {
    for (const size of [1, 1000, KB + 1, 1.5 * KB]) {
      expect(isUsablePartSize(size), `${size}`).toBe(false)
    }
  })

  it('refuses a part larger than the largest the protocol allows', () => {
    expect(isUsablePartSize(MAX_PART_SIZE)).toBe(true)
    expect(isUsablePartSize(MAX_PART_SIZE * 2)).toBe(false)
  })

  it('refuses nothing at all', () => {
    expect(isUsablePartSize(0)).toBe(false)
    expect(isUsablePartSize(-KB)).toBe(false)
  })

  it('says which rule was broken rather than only that one was', () => {
    expect(() => checkPartSize(300 * KB)).toThrow(ValidationError)
    expect(() => checkPartSize(300 * KB)).toThrow(/divide 524288 exactly/)
  })
})

describe('planning a file up', () => {
  it('takes the largest usable part, because round trips cost more than bytes', () => {
    expect(planUpload({ size: 4 * MB }).partSize).toBe(MAX_PART_SIZE)
  })

  it('counts the parts a file comes to', () => {
    expect(planUpload({ size: MAX_PART_SIZE * 3 }).parts).toBe(3)
    expect(planUpload({ size: MAX_PART_SIZE * 3 + 1 }).parts).toBe(4)
  })

  it('sends a small file by the path meant for one', () => {
    expect(planUpload({ size: BIG_FILE_THRESHOLD - 1 }).path).toBe('small')
  })

  it('sends a file of exactly the threshold as a small one, and one byte more as big', () => {
    // The threshold is the protocol's, so the boundary itself is worth
    // pinning: the big-file method is for a file of *more than* 10 MB.
    expect(planUpload({ size: BIG_FILE_THRESHOLD }).path).toBe('small')
    expect(planUpload({ size: BIG_FILE_THRESHOLD + 1 }).path).toBe('big')
  })

  it('sends a file of unknown length the only way it can be sent', () => {
    const plan = planUpload({})

    // Nothing is known about the length, so nothing can be said about the
    // number of parts — and only one of the two paths carries a total at all.
    expect(plan.path).toBe('big')
    expect(plan.parts).toBeUndefined()
  })

  it('treats an empty file as one part rather than none', () => {
    // The server is told about a file, not about nothing.
    expect(planUpload({ size: 0 }).parts).toBe(1)
  })

  it('honours a part size a caller had a reason to choose', () => {
    expect(planUpload({ size: MB, partSize: 128 * KB }).partSize).toBe(128 * KB)
  })

  it('refuses one it had no reason to choose', () => {
    expect(() => planUpload({ size: MB, partSize: 300 * KB })).toThrow(ValidationError)
  })

  it('refuses a length that could not be one', () => {
    expect(() => planUpload({ size: -1 })).toThrow(/is not a file/)
    expect(() => planUpload({ size: 1.5 })).toThrow(/is not a file/)
  })
})

describe('where each part sits', () => {
  it('starts each one where the last ended', () => {
    expect(partAt({ index: 0, partSize: 512 * KB })).toEqual({ offset: 0, length: 512 * KB })
    expect(partAt({ index: 2, partSize: 512 * KB })).toEqual({
      offset: MB,
      length: 512 * KB,
    })
  })

  it('cuts the last part to what is left of the file', () => {
    const last = partAt({ index: 2, partSize: 512 * KB, size: MB + 100 })

    expect(last).toEqual({ offset: MB, length: 100 })
  })

  it('is a full part when the file divides exactly', () => {
    expect(partAt({ index: 1, partSize: 512 * KB, size: MB }).length).toBe(512 * KB)
  })

  it('refuses a part past the end of the file', () => {
    expect(() => partAt({ index: 5, partSize: 512 * KB, size: MB })).toThrow(/past the end/)
  })

  it('refuses a part number that could not be one', () => {
    expect(() => partAt({ index: -1, partSize: KB })).toThrow(/is not a part number/)
  })

  it('counts the parts the same way the plan does', () => {
    expect(partsFor(MB, 512 * KB)).toBe(2)
    expect(partsFor(MB + 1, 512 * KB)).toBe(3)
    expect(partsFor(0, 512 * KB)).toBe(1)
  })
})

describe('which download ranges the datacenter will answer', () => {
  it('accepts an aligned range that divides a megabyte', () => {
    expect(isUsableRange({ offset: 0, limit: 4 * KB })).toBe(true)
    expect(isUsableRange({ offset: 4 * KB, limit: 128 * KB })).toBe(true)
    expect(isUsableRange({ offset: 0, limit: MB })).toBe(true)
  })

  it('refuses an offset off the grid', () => {
    expect(isUsableRange({ offset: KB, limit: 4 * KB })).toBe(false)
  })

  it('refuses a length off the grid', () => {
    expect(isUsableRange({ offset: 0, limit: KB })).toBe(false)
  })

  it('refuses a length that does not divide a megabyte', () => {
    // Aligned at both ends and still refused: the length has to divide the
    // piece the server serves.
    expect(isUsableRange({ offset: 0, limit: 12 * KB })).toBe(false)
  })

  it('refuses a range that crosses a megabyte, however well aligned', () => {
    // The rule that surprises. The server serves a file in megabyte pieces and
    // will not answer across two of them.
    expect(isUsableRange({ offset: MB - 4 * KB, limit: 8 * KB })).toBe(false)
    expect(isUsableRange({ offset: MB - 4 * KB, limit: 4 * KB })).toBe(true)
  })

  it('accepts a range that ends exactly on the boundary', () => {
    expect(isUsableRange({ offset: MB - 128 * KB, limit: 128 * KB })).toBe(true)
  })

  it('accepts a finer grid when the range is precise', () => {
    expect(isUsableRange({ offset: KB, limit: KB, mode: 'precise' })).toBe(true)
    expect(isUsableRange({ offset: 512, limit: KB, mode: 'precise' })).toBe(false)
  })

  it('lets a precise length be anything up to a megabyte', () => {
    // A precise length need not divide a megabyte — only stay within one.
    expect(isUsableRange({ offset: 0, limit: 12 * KB, mode: 'precise' })).toBe(true)
    expect(isUsableRange({ offset: 0, limit: MB, mode: 'precise' })).toBe(true)
    expect(isUsableRange({ offset: 0, limit: MB + KB, mode: 'precise' })).toBe(false)
  })

  it('holds the boundary rule for precise ranges too', () => {
    expect(isUsableRange({ offset: MB - KB, limit: 2 * KB, mode: 'precise' })).toBe(false)
  })

  it('names the rule that was broken', () => {
    expect(() => checkRange({ offset: KB, limit: 4 * KB })).toThrow(/multiple of 4096/)
    expect(() => checkRange({ offset: 0, limit: 12 * KB })).toThrow(/divide 1048576 exactly/)
    expect(() => checkRange({ offset: MB - 4 * KB, limit: 8 * KB })).toThrow(/crosses a/)
    expect(() => checkRange({ offset: 0, limit: MB + KB, mode: 'precise' })).toThrow(/at most/)
  })

  it('says nothing when the range is fine', () => {
    expect(() => checkRange({ offset: 0, limit: 4 * KB })).not.toThrow()
  })
})

describe('planning a file down', () => {
  it('covers the whole file and nothing beyond it', () => {
    const ranges = planDownload({ size: 3 * MB })

    expect(ranges).toEqual([
      { offset: 0, limit: MB },
      { offset: MB, limit: MB },
      { offset: 2 * MB, limit: MB },
    ])
  })

  it('produces only ranges the datacenter will answer', () => {
    for (const size of [1, 5 * KB, MB - 1, MB + 1, 3 * MB + 7 * KB]) {
      for (const range of planDownload({ size })) {
        expect(isUsableRange(range), `${size} @ ${range.offset}+${range.limit}`).toBe(true)
      }
    }
  })

  it('rounds a short file up to a length the datacenter accepts', () => {
    // Sitting on the grid is not enough: the length also has to divide the
    // megabyte the file is served in. Rounding to the grid alone gives twelve
    // kilobytes here, which is three whole grid steps and is still refused.
    const [only] = planDownload({ size: 8 * KB + 100 })

    expect(only).toEqual({ offset: 0, limit: 16 * KB })
    expect(isUsableRange({ offset: 0, limit: only?.limit ?? 0 })).toBe(true)
  })

  it('produces an acceptable length for every short file', () => {
    for (let size = 1; size <= 64 * KB; size += 97) {
      for (const range of planDownload({ size })) {
        expect(isUsableRange(range), `size ${size}`).toBe(true)
      }
    }
  })

  it('never lets the boundary spoil a length, wherever the caller starts', () => {
    // Cutting a range back to the megabyte in front of it leaves that
    // megabyte's remainder, which is exactly the length that does not divide
    // one. Starting a single grid step in is enough to produce it.
    for (const offset of OFFSETS) {
      for (const range of planDownload({ size: offset + 3 * MB, offset })) {
        expect(isUsableRange(range), `from ${offset}: ${range.offset}+${range.limit}`).toBe(true)
      }
    }
  })

  it.each(['normal', 'precise'] as const)(
    'covers every start and every length with ranges the datacenter answers (%s)',
    (mode) => {
      for (const offset of OFFSETS) {
        for (const size of SIZES) {
          if (size <= offset) continue

          const ranges = planDownload({ size, offset, mode })

          // Contiguous from where the caller started, no gaps and no overlaps,
          // reaching the end of the file — and every one of them askable.
          let at = offset
          for (const range of ranges) {
            expect(range.offset, `${mode} ${offset}/${size}`).toBe(at)
            expect(isUsableRange({ ...range, mode }), `${mode} ${offset}/${size}`).toBe(true)
            at += range.limit
          }

          expect(at, `${mode} ${offset}/${size} reaches the end`).toBeGreaterThanOrEqual(size)
          expect(ranges.length, `${mode} ${offset}/${size} makes progress`).toBeGreaterThan(0)
        }
      }
    },
  )

  it('never crosses a boundary even when asked for a length that would', () => {
    const ranges = planDownload({ size: 2 * MB, limit: MB, offset: 512 * KB })

    // The first range is cut back to the boundary in front of it rather than
    // being allowed to straddle it.
    expect(ranges[0]).toEqual({ offset: 512 * KB, limit: 512 * KB })
    expect(ranges.every((range) => isUsableRange(range))).toBe(true)
  })

  it('reaches the end of a file that does not end on the grid', () => {
    const size = MB + 100
    const ranges = planDownload({ size })
    const last = ranges.at(-1)

    // The final range is rounded up to the grid, because a range must sit on it
    // whether or not the file happens to end there.
    expect(last?.offset).toBe(MB)
    expect((last?.offset ?? 0) + (last?.limit ?? 0)).toBeGreaterThanOrEqual(size)
  })

  it('asks for nothing when there is nothing to ask for', () => {
    expect(planDownload({ size: 0 })).toEqual([])
  })

  it('starts where it was told to', () => {
    const ranges = planDownload({ size: 2 * MB, offset: MB })

    expect(ranges[0]?.offset).toBe(MB)
    expect(ranges).toHaveLength(1)
  })

  it('honours a smaller request size', () => {
    const ranges = planDownload({ size: 512 * KB, limit: 128 * KB })

    expect(ranges).toHaveLength(4)
    expect(ranges.every((range) => range.limit === 128 * KB)).toBe(true)
  })

  it('plans a precise download on the finer grid', () => {
    const ranges = planDownload({ size: 3 * KB, limit: KB, mode: 'precise' })

    expect(ranges).toEqual([
      { offset: 0, limit: KB },
      { offset: KB, limit: KB },
      { offset: 2 * KB, limit: KB },
    ])
  })

  it('refuses to start off the grid', () => {
    expect(() => planDownload({ size: MB, offset: 100 })).toThrow(/multiple of 4096/)
  })

  it('refuses a length that could not be one', () => {
    expect(() => planDownload({ size: -1 })).toThrow(/is not a file/)
  })
})

describe('whether a file is served in a single piece', () => {
  it('says so for a length that fits in one range', () => {
    // A datacenter serves a file a megabyte at a time and a range may not
    // cross that boundary, so anything up to one is one request.
    expect(fitsOneRange(0)).toBe(true)
    expect(fitsOneRange(1)).toBe(true)
    expect(fitsOneRange(1024 * 1024)).toBe(true)
  })

  it('says no for a length that does not', () => {
    expect(fitsOneRange(1024 * 1024 + 1)).toBe(false)
    expect(fitsOneRange(50 * 1024 * 1024)).toBe(false)
  })

  it('says no for a length nobody knows', () => {
    // Such a transfer is read in order until it ends, which is one connection
    // but may be any size at all.
    expect(fitsOneRange(undefined)).toBe(false)
  })

  it('says no for a length that is not one', () => {
    expect(fitsOneRange(-1)).toBe(false)
  })
})
