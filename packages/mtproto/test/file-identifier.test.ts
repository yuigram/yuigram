// SPDX-License-Identifier: MPL-2.0

/**
 * The opaque string that names a file across Telegram clients.
 *
 * A round trip through this module proves only that it agrees with itself, and
 * a format whose whole purpose is interoperation has to be judged against
 * something else. So the strings below are **fixtures**: they were produced by
 * an independent implementation of the same format and are checked in, so every
 * run compares this encoder against bytes it did not produce. An encoder that
 * drifts — a padding byte, a field order, a flag — stops matching them, which a
 * round trip would never notice.
 *
 * None of them names a real file. The identifiers, access hashes and URLs are
 * invented, and an access hash for a file that does not exist is not a
 * credential for anything.
 *
 * What is judged:
 *
 * - **the exact string**, in both directions, for every layout the format has;
 * - **the refusals**, because an identifier is public input and one that is
 *   truncated, corrupt, of an unknown version or internally inconsistent must
 *   be refused rather than turned into a download request for something else;
 * - **the two identifiers staying apart**, because one goes stale and one does
 *   not, and confusing them is the mistake the format invites.
 */

import { describe, expect, it } from 'vitest'
import {
  FileIdError,
  type FileIdentity,
  fileIdOfThumbnail,
  locationOf,
  looksLikeFileId,
  readFileId,
  uniqueFileId,
  webLocationOf,
  writeFileId,
} from '../src/files/identifier.js'

/**
 * Identifiers produced by an independent implementation of the same format.
 *
 * Fixed here rather than computed, which is the point: these bytes did not come
 * from the code being tested.
 */
const FIXTURES = {
  document: {
    fileId: 'BQACAgIAAwUBAgMEBQACywT7cR8BAAI2DDcLGv___zoE',
    uniqueId: 'AgADywT7cR8BAAI',
  },
  documentNoReference: {
    fileId: 'BAADBAADBQAHBgAHOgQ',
    uniqueId: 'AgADBQAH',
  },
  photoThumbnail: {
    fileId: 'AgACAgEAAwIJCQABbwAH3gAHAQADAgADeAADOgQ',
    uniqueId: 'AQADbwAHfQ',
  },
  profilePhotoBig: {
    fileId: 'AQADAgADTQAHWAAHAwADkhAABmMABzoE',
    uniqueId: 'AQADTQAHAQ',
  },
  stickerSetVersion: {
    fileId: 'AAQCAAMBAAcCAAcJAAMrAgAGmgIABgMAAzoE',
    uniqueId: 'AQADAisCAAYDAAM',
  },
  web: {
    fileId: 'BwACAQQAAx1odHRwczovL2V4YW1wbGUuaW52YWxpZC9hLmpwZwACOTAABjoE',
    uniqueId: 'AAQdaHR0cHM6Ly9leGFtcGxlLmludmFsaWQvYS5qcGcAAg',
  },
  sticker: {
    fileId: 'CAACAgIAAwQAAwcAA____________________386BA',
    uniqueId: 'AgAD__________8',
  },
  stickerSetPlain: {
    fileId: 'AAQCAAMDAAcEAAcEAAMKAAcUAAc6BA',
    uniqueId: 'AQADlgADCgAHFAAH',
  },
  wallpaper: {
    fileId: 'DAADAQADCAAHCQAL0gQABjoE',
    uniqueId: 'AQADZAAD0gQABg',
  },
} as const

/** The identity each fixture describes, in this package's own terms. */
const IDENTITIES: Record<keyof typeof FIXTURES, FileIdentity> = {
  document: {
    dc: 2,
    kind: 'document',
    reference: new Uint8Array([1, 2, 3, 4, 5]),
    where: { at: 'document', id: 1_234_567_890_123n, accessHash: -987_654_321_098n },
  },
  documentNoReference: {
    dc: 4,
    kind: 'video',
    reference: undefined,
    where: { at: 'document', id: 5n, accessHash: 6n },
  },
  photoThumbnail: {
    dc: 1,
    kind: 'photo',
    reference: new Uint8Array([9, 9]),
    where: {
      at: 'photo',
      id: 111n,
      accessHash: 222n,
      source: { of: 'thumbnail', kind: 'photo', size: 'x' },
    },
  },
  profilePhotoBig: {
    dc: 2,
    kind: 'profilePhoto',
    reference: undefined,
    where: {
      at: 'photo',
      id: 77n,
      accessHash: 88n,
      source: { of: 'profilePhoto', big: true, peerId: 4242, accessHash: 99n },
    },
  },
  stickerSetVersion: {
    dc: 2,
    kind: 'thumbnail',
    reference: undefined,
    where: {
      at: 'photo',
      id: 1n,
      accessHash: 2n,
      source: { of: 'stickerSetVersion', setId: 555n, accessHash: 666n, version: 3 },
    },
  },
  web: {
    dc: 4,
    kind: 'temp',
    reference: undefined,
    where: { at: 'web', url: 'https://example.invalid/a.jpg', accessHash: 12_345n },
  },
  sticker: {
    dc: 2,
    kind: 'sticker',
    reference: new Uint8Array([0, 0, 0, 7]),
    where: { at: 'document', id: -1n, accessHash: 9_223_372_036_854_775_807n },
  },
  stickerSetPlain: {
    dc: 2,
    kind: 'thumbnail',
    reference: undefined,
    where: {
      at: 'photo',
      id: 3n,
      accessHash: 4n,
      source: { of: 'stickerSet', setId: 10n, accessHash: 20n },
    },
  },
  wallpaper: {
    dc: 1,
    kind: 'wallpaper',
    reference: undefined,
    where: {
      at: 'photo',
      id: 8n,
      accessHash: 9n,
      source: { of: 'legacy', secret: 1234n },
    },
  },
}

const names = Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]

describe.each(names)('%s', (name) => {
  const fixture = FIXTURES[name]
  const identity = IDENTITIES[name]

  it('writes the same string another implementation does', () => {
    expect(writeFileId(identity)).toBe(fixture.fileId)
  })

  it('reads a string another implementation wrote', () => {
    expect(readFileId(fixture.fileId)).toEqual(identity)
  })

  it('computes the same stable identifier another implementation does', () => {
    expect(uniqueFileId(identity)).toBe(fixture.uniqueId)
  })

  it('is recognised as an identifier', () => {
    expect(looksLikeFileId(fixture.fileId)).toBe(true)
  })
})

describe('the two identifiers', () => {
  it('are different strings for the same file', () => {
    // The mistake the format invites. One can be downloaded from and goes
    // stale; the other cannot and does not.
    expect(FIXTURES.document.fileId).not.toBe(FIXTURES.document.uniqueId)
  })

  it('give the same stable identifier for the same file seen twice', () => {
    // Two identifiers for one file differ in their reference and their access
    // hash, and are the same file. That is what the stable one is for.
    const first: FileIdentity = {
      dc: 2,
      kind: 'document',
      reference: new Uint8Array([1, 1, 1]),
      where: { at: 'document', id: 42n, accessHash: 100n },
    }
    const later: FileIdentity = {
      ...first,
      reference: new Uint8Array([2, 2, 2, 2]),
      where: { at: 'document', id: 42n, accessHash: 200n },
    }

    expect(writeFileId(first)).not.toBe(writeFileId(later))
    expect(uniqueFileId(first)).toBe(uniqueFileId(later))
  })

  it('give different stable identifiers for different files', () => {
    const one: FileIdentity = {
      dc: 2,
      kind: 'document',
      reference: undefined,
      where: { at: 'document', id: 42n, accessHash: 1n },
    }
    const other: FileIdentity = { ...one, where: { at: 'document', id: 43n, accessHash: 1n } }

    expect(uniqueFileId(one)).not.toBe(uniqueFileId(other))
  })

  it('keep a thumbnail apart from the photo it belongs to', () => {
    // Same photo, different picture of it. A stable identifier that collapsed
    // them would make a cache hand back the wrong image.
    const small = uniqueFileId(IDENTITIES.photoThumbnail)
    const large = uniqueFileId({
      ...IDENTITIES.photoThumbnail,
      where: {
        at: 'photo',
        id: 111n,
        accessHash: 222n,
        source: { of: 'thumbnail', kind: 'photo', size: 'y' },
      },
    })

    expect(small).not.toBe(large)
  })
})

describe('refusing what is not an identifier', () => {
  it('refuses a version it does not know', () => {
    // Version 9 does not exist. Guessing at the layout would build a download
    // request for whatever the bytes happened to line up as.
    const bytes = Uint8Array.from([1, 2, 3, 58, 9])
    const text = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    expect(() => readFileId(text.replace(/=+$/, ''))).toThrow(FileIdError)
    expect(() => readFileId(text.replace(/=+$/, ''))).toThrow(/version 9/)
  })

  it('refuses a subversion newer than it understands', () => {
    const bytes = Uint8Array.from([5, 0, 1, 0, 2, 200, 4])
    const text = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    expect(() => readFileId(text)).toThrow(/newer Telegram/)
  })

  it('refuses one that ends in the middle of a field', () => {
    // Truncated by a copy-and-paste. The fields that did arrive are readable
    // and the ones that did not are not, which a lenient reader would fill in
    // with whatever followed.
    const whole = FIXTURES.document.fileId

    expect(() => readFileId(whole.slice(0, 12))).toThrow(FileIdError)
  })

  it('refuses one that is not base64 at all', () => {
    expect(() => readFileId('not an identifier!!')).toThrow(FileIdError)
  })

  it('refuses one too short to carry a version', () => {
    expect(() => readFileId('AQ')).toThrow(/too short/)
  })

  it('refuses a kind of file that does not exist', () => {
    // Kind 30 is past the end of the list. Reading it would index off the end
    // and produce an identifier naming nothing.
    const bytes = Uint8Array.from([30, 0, 0, 0, 2, 0, 0, 0, 58, 4])
    const text = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    expect(() => readFileId(text)).toThrow(/not one/)
  })

  it('refuses a thumbnail whose kind disagrees with the file it is in', () => {
    // The check Telegram's own readers make. A photo carrying a video
    // thumbnail is corrupt, not merely unusual, and would download something
    // else entirely.
    expect(() =>
      writeFileId({
        dc: 1,
        kind: 'photo',
        reference: undefined,
        where: {
          at: 'photo',
          id: 1n,
          accessHash: 2n,
          source: { of: 'thumbnail', kind: 'video', size: 'x' },
        },
      }),
    ).not.toThrow()

    // Written happily — but not read back, because reading is where the
    // agreement between the fields is checked.
    const written = writeFileId({
      dc: 1,
      kind: 'photo',
      reference: undefined,
      where: {
        at: 'photo',
        id: 1n,
        accessHash: 2n,
        source: { of: 'thumbnail', kind: 'video', size: 'x' },
      },
    })

    expect(() => readFileId(written)).toThrow(/carrying a 'video' thumbnail/)
  })

  it('refuses a thumbnail size that is not one letter', () => {
    expect(() =>
      writeFileId({
        dc: 1,
        kind: 'photo',
        reference: undefined,
        where: {
          at: 'photo',
          id: 1n,
          accessHash: 2n,
          source: { of: 'thumbnail', kind: 'photo', size: 'xyz' },
        },
      }),
    ).toThrow(/one letter/)
  })

  it('refuses a kind that is not a kind', () => {
    expect(() =>
      writeFileId({
        dc: 1,
        kind: 'nonsense' as never,
        reference: undefined,
        where: { at: 'document', id: 1n, accessHash: 2n },
      }),
    ).toThrow(/is not a kind of file/)
  })

  it('says whether something is worth reading, cheaply', () => {
    expect(looksLikeFileId('')).toBe(false)
    expect(looksLikeFileId('hello world')).toBe(false)
    expect(looksLikeFileId('AAAAAAAAAA')).toBe(false)
    expect(looksLikeFileId(FIXTURES.sticker.fileId)).toBe(true)
  })
})

describe('turning one back into a download', () => {
  it('builds a document location, with the reference it was written with', () => {
    const location = locationOf(IDENTITIES.document)

    expect(location).toMatchObject({
      _: 'inputDocumentFileLocation',
      id: 1_234_567_890_123n,
      access_hash: -987_654_321_098n,
      file_reference: new Uint8Array([1, 2, 3, 4, 5]),
    })
  })

  it('builds an empty reference where the identifier had none', () => {
    // Which is a request Telegram will refuse for a file that needs one. That
    // is the honest shape: the identifier did not carry it, and inventing one
    // is not possible.
    expect(locationOf(IDENTITIES.documentNoReference)).toMatchObject({
      file_reference: new Uint8Array(0),
    })
  })

  it('builds a photo location for a photo thumbnail', () => {
    expect(locationOf(IDENTITIES.photoThumbnail)).toMatchObject({
      _: 'inputPhotoFileLocation',
      thumb_size: 'x',
    })
  })

  it('builds a peer-photo location for a profile photo', () => {
    expect(locationOf(IDENTITIES.profilePhotoBig)).toMatchObject({
      _: 'inputPeerPhotoFileLocation',
      big: true,
      photo_id: 77n,
    })
  })

  it('names the owner of a profile photo by the kind of dialog its number is', () => {
    const owned = (peerId: number) =>
      (
        locationOf({
          ...IDENTITIES.profilePhotoBig,
          where: {
            ...IDENTITIES.profilePhotoBig.where,
            source: { of: 'profilePhoto', big: true, peerId, accessHash: 99n },
          },
        } as never) as { peer: unknown }
      ).peer

    expect(owned(4242)).toEqual({ _: 'inputPeerUser', user_id: 4242n, access_hash: 99n })
    expect(owned(-12345)).toEqual({ _: 'inputPeerChat', chat_id: 12345n })
    expect(owned(-1001234567890)).toEqual({
      _: 'inputPeerChannel',
      channel_id: 1234567890n,
      access_hash: 99n,
    })
  })

  it('builds a sticker-set location, with the version where there is one', () => {
    expect(locationOf(IDENTITIES.stickerSetVersion)).toMatchObject({
      _: 'inputStickerSetThumb',
      thumb_version: 3,
    })
    expect(locationOf(IDENTITIES.stickerSetPlain)).toMatchObject({
      _: 'inputStickerSetThumb',
      thumb_version: 0,
    })
  })

  it('keeps a web file’s location separate, because it is a different request', () => {
    expect(() => locationOf(IDENTITIES.web)).toThrow(/webLocationOf/)
    expect(webLocationOf(IDENTITIES.web)).toMatchObject({
      _: 'inputWebFileLocation',
      url: 'https://example.invalid/a.jpg',
    })
    expect(() => webLocationOf(IDENTITIES.document)).toThrow(/not on somebody else/)
  })

  it('refuses a layout Telegram no longer accepts a request for', () => {
    // Saying so is better than building a request the server will not answer
    // and reporting whatever it says about the request instead of the file.
    expect(() => locationOf(IDENTITIES.wallpaper)).toThrow(/no longer accepts/)
  })
})

describe('what an identifier does not promise', () => {
  it('carries a reference without making it valid', () => {
    // The distinction that matters most here. The reference in an identifier
    // is a record of one, and a download built from an old identifier is
    // refused exactly as one built from an old reference held any other way.
    const identity = readFileId(FIXTURES.document.fileId)

    expect(identity.reference).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    expect(locationOf(identity)).toMatchObject({
      file_reference: new Uint8Array([1, 2, 3, 4, 5]),
    })
  })

  it('reads an identifier written without one as having none', () => {
    expect(readFileId(FIXTURES.documentNoReference.fileId).reference).toBeUndefined()
  })
})

/**
 * Naming one thumbnail of a photo or a document.
 *
 * The expected strings were written by an independent implementation of the
 * format from the same fields, so agreement here is agreement with other
 * clients rather than with this code's own reading of itself.
 */
describe('the identifier of a thumbnail', () => {
  const reference = Uint8Array.of(1, 2, 3, 4, 5)
  const document = {
    _: 'document' as const,
    id: 1_234_567_890_123n,
    access_hash: -987_654_321_098n,
    file_reference: reference,
    date: 1_700_000_000,
    mime_type: 'video/mp4',
    size: 1_000_000n,
    dc_id: 2,
    attributes: [],
    thumbs: [
      { _: 'photoStrippedSize' as const, type: 'i', bytes: Uint8Array.of(1, 8, 8) },
      { _: 'photoSize' as const, type: 'm', w: 320, h: 180, size: 9_000 },
    ],
    video_thumbs: [{ _: 'videoSize' as const, type: 'v', w: 320, h: 180, size: 40_000 }],
  }
  const photo = {
    _: 'photo' as const,
    id: 55_555n,
    access_hash: -7n,
    file_reference: reference,
    date: 1_700_000_000,
    dc_id: 1,
    sizes: [
      { _: 'photoSize' as const, type: 's', w: 90, h: 90, size: 900 },
      { _: 'photoSize' as const, type: 'x', w: 800, h: 800, size: 60_000 },
    ],
  }

  it('writes a document thumbnail as other clients do', () => {
    const text = fileIdOfThumbnail(document, 'm')

    expect(text).toBe('AAMCAgADBQECAwQFAALLBPtxHwEAAjYMNwsa____AQAHbQADOgQ')
    expect(uniqueFileId(readFileId(text))).toBe('AQADywT7cR8BAAJy')
  })

  it('writes a moving document thumbnail the same way', () => {
    const text = fileIdOfThumbnail({ ...document, dc_id: 4 }, 'v')

    expect(text).toBe('AAMCBAADBQECAwQFAALLBPtxHwEAAjYMNwsa____AQAHdgADOgQ')
    expect(uniqueFileId(readFileId(text))).toBe('AQADywT7cR8BAAJ7')
  })

  it('writes a photo size as the photo, with that size named', () => {
    const text = fileIdOfThumbnail(photo, 's')

    expect(text).toBe('AgACAgEAAwUBAgMEBQACA9kABvn_________AQADAgADcwADOgQ')
    expect(uniqueFileId(readFileId(text))).toBe('AQADA9kABng')
  })

  it('reads back to the location the thumbnail is fetched from', () => {
    const identity = readFileId(fileIdOfThumbnail(document, 'm'))

    expect(identity.dc).toBe(2)
    expect(identity.kind).toBe('thumbnail')
    expect(locationOf(identity)).toEqual({
      _: 'inputDocumentFileLocation',
      id: 1_234_567_890_123n,
      access_hash: -987_654_321_098n,
      file_reference: reference,
      thumb_size: 'm',
    })
  })

  it('refuses a size carried in the message, one not offered, and an empty media', () => {
    expect(() => fileIdOfThumbnail(document, 'i')).toThrow(/arrived with the message/)
    expect(() => fileIdOfThumbnail(document, 'w')).toThrow(/has no size 'w'/)
    expect(() => fileIdOfThumbnail({ _: 'documentEmpty', id: 1n }, 'm')).toThrow(FileIdError)
    expect(() => fileIdOfThumbnail({ _: 'photoEmpty', id: 1n }, 's')).toThrow(/empty photo/)
  })
})
