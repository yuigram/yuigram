// SPDX-License-Identifier: MIT

/**
 * Turning what a message carried into what a transfer can fetch, and back.
 *
 * The mapping is mechanical and that is exactly why it is worth pinning: every
 * field is copied from the document, and one left out produces a request the
 * datacenter refuses for a reason that says nothing about the file. The file
 * reference is the one most easily lost, because a request without it is well
 * formed and still refused.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  documentFile,
  documentMedia,
  photoFile,
  photoMedia,
  thumbnail,
  thumbnailFile,
  thumbnails,
  uploadedDocument,
  uploadedPhoto,
} from '../src/files/media.js'
import type { UploadedFile } from '../src/files/upload.js'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import type {
  Document,
  Photo,
  TypeDocument,
  TypeDocumentAttribute,
} from '../src/generated/api/types/index.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { readObject, TlScope, type TlValue, writeObject } from '../src/tl/index.js'

const REFERENCE = Uint8Array.of(9, 8, 7)

const DOCUMENT: Document = {
  _: 'document',
  id: 0x1234n,
  access_hash: 0x5678n,
  file_reference: REFERENCE,
  date: 1_700_000_000,
  mime_type: 'application/pdf',
  size: 4_194_304n,
  dc_id: 4,
  attributes: [{ _: 'documentAttributeFilename', file_name: 'report.pdf' }],
}

describe('a document a message carried', () => {
  it('names the file by everything the datacenter checks', () => {
    expect(documentFile(DOCUMENT)).toEqual({
      dcId: 4,
      size: 4_194_304,
      location: {
        _: 'inputDocumentFileLocation',
        id: 0x1234n,
        access_hash: 0x5678n,
        file_reference: REFERENCE,
        thumb_size: '',
      },
    })
  })

  it('carries the reference the message arrived with, unchanged', () => {
    // A request without it is well formed and refused, and the refusal names
    // the reference rather than the file — so losing it here is diagnosed a
    // long way from the cause.
    const request = documentFile(DOCUMENT)

    expect(request.location['file_reference']).toBe(REFERENCE)
  })

  it('asks the datacenter that holds it rather than the account s own', () => {
    expect(documentFile({ ...DOCUMENT, dc_id: 2 }).dcId).toBe(2)
  })

  it('states the length, which is what lets ranges go out together', () => {
    // Without it the transfer cannot know where the file ends except by
    // reaching it, so the parts go one after another.
    expect(documentFile({ ...DOCUMENT, size: 10n }).size).toBe(10)
  })

  it('names no thumbnail, because a document is one file', () => {
    expect(documentFile(DOCUMENT).location['thumb_size']).toBe('')
  })

  it('refuses an empty document rather than naming a file that is not there', () => {
    // `documentEmpty` is a hole where a document the account cannot see used to
    // be. Building a location from it would produce a request for nothing.
    const empty: TypeDocument = { _: 'documentEmpty', id: 0x1234n }

    expect(() => documentFile(empty)).toThrow(ValidationError)
  })
})

const PHOTO: Photo = {
  _: 'photo',
  id: 0x9abcn,
  access_hash: 0xdef0n,
  file_reference: REFERENCE,
  date: 1_700_000_000,
  dc_id: 5,
  sizes: [
    { _: 'photoStrippedSize', type: 'i', bytes: Uint8Array.of(1, 2) },
    { _: 'photoSize', type: 'm', w: 320, h: 320, size: 10_000 },
    { _: 'photoSize', type: 'x', w: 800, h: 800, size: 90_000 },
  ],
}

describe('a photo a message carried', () => {
  it('names the largest size that has to be fetched', () => {
    expect(photoFile(PHOTO)).toEqual({
      dcId: 5,
      size: 90_000,
      location: {
        _: 'inputPhotoFileLocation',
        id: 0x9abcn,
        access_hash: 0xdef0n,
        file_reference: REFERENCE,
        thumb_size: 'x',
      },
    })
  })

  it('takes a progressive size at its whole length', () => {
    // The vector states the length at each stage of a progressively encoded
    // image, so the file is the largest of them rather than the first.
    const progressive = photoFile({
      ...PHOTO,
      sizes: [
        { _: 'photoSizeProgressive', type: 'y', w: 1280, h: 1280, sizes: [1_000, 50_000, 200_000] },
      ],
    })

    expect(progressive.size).toBe(200_000)
    expect(progressive.location['thumb_size']).toBe('y')
  })

  it('passes over every size that arrived with the message', () => {
    // Stripped, cached and path sizes carry their bytes inline, and an empty
    // one describes nothing. Asking a datacenter for any of them would be
    // asking for a file that is not there.
    const inline = {
      ...PHOTO,
      sizes: [
        { _: 'photoSizeEmpty', type: 'a' },
        { _: 'photoStrippedSize', type: 'i', bytes: Uint8Array.of(1) },
        { _: 'photoCachedSize', type: 's', w: 90, h: 90, bytes: Uint8Array.of(1) },
        { _: 'photoPathSize', type: 'j', bytes: Uint8Array.of(1) },
        { _: 'photoSize', type: 'm', w: 320, h: 320, size: 10_000 },
      ],
    } as Photo

    expect(photoFile(inline).location['thumb_size']).toBe('m')
  })

  it('falls back to area when a size states no length', () => {
    const byArea = photoFile({
      ...PHOTO,
      sizes: [
        { _: 'photoSize', type: 'm', w: 320, h: 320, size: 0 },
        { _: 'photoSize', type: 'x', w: 800, h: 800, size: 0 },
      ],
    })

    expect(byArea.location['thumb_size']).toBe('x')
  })

  it('refuses a photo with nothing to fetch', () => {
    const inlineOnly = {
      ...PHOTO,
      sizes: [{ _: 'photoStrippedSize', type: 'i', bytes: Uint8Array.of(1) }],
    } as Photo

    expect(() => photoFile(inlineOnly)).toThrow(/carries no size that has to be fetched/)
  })

  it('refuses an empty photo', () => {
    expect(() => photoFile({ _: 'photoEmpty', id: 1n })).toThrow(ValidationError)
  })

  it('carries the reference the message arrived with, unchanged', () => {
    expect(photoFile(PHOTO).location['file_reference']).toBe(REFERENCE)
  })
})

/**
 * The same three fields, addressed the other way.
 *
 * A message that already carries a file carries everything needed to send it
 * again, and these cases pin that nothing is added, dropped or chosen on the
 * way. The reference is again the field most easily lost: a send without it is
 * well formed and refused for a reason that says nothing about the file.
 */
describe('a file that is already on Telegram', () => {
  it('names a document by the three fields that address it', () => {
    expect(documentMedia(DOCUMENT)).toEqual({
      _: 'inputMediaDocument',
      id: {
        _: 'inputDocument',
        id: 0x1234n,
        access_hash: 0x5678n,
        file_reference: REFERENCE,
      },
    })
  })

  it('names a photo by the three fields that address it', () => {
    // No size is chosen. A photo is one object with several renderings, and a
    // send sends the object.
    expect(photoMedia(PHOTO)).toEqual({
      _: 'inputMediaPhoto',
      id: {
        _: 'inputPhoto',
        id: 0x9abcn,
        access_hash: 0xdef0n,
        file_reference: REFERENCE,
      },
    })
  })

  it('carries each reference the message arrived with, unchanged', () => {
    const document = documentMedia(DOCUMENT) as { id: { file_reference: Uint8Array } }
    const photo = photoMedia(PHOTO) as { id: { file_reference: Uint8Array } }

    expect(document.id.file_reference).toBe(REFERENCE)
    expect(photo.id.file_reference).toBe(REFERENCE)
  })

  it('sets nothing the caller did not ask for', () => {
    // A spoiler, a self-destruct timer and a video cover are choices about the
    // send rather than facts about the file.
    expect(Object.keys(documentMedia(DOCUMENT))).toEqual(['_', 'id'])
    expect(Object.keys(photoMedia(PHOTO))).toEqual(['_', 'id'])
  })

  it('refuses what is not there', () => {
    expect(() => documentMedia({ _: 'documentEmpty', id: 1n })).toThrow(ValidationError)
    expect(() => photoMedia({ _: 'photoEmpty', id: 1n })).toThrow(ValidationError)
  })
})

/**
 * Naming bytes this account has just sent.
 *
 * The upload result is what addresses them, and the question each case here
 * settles is what has to be stated beside it: nothing at all for a photo,
 * because the datacenter decodes the image itself, and at least a content type
 * for a document, because nothing on this side can discover one.
 */
describe('a file this account has just uploaded', () => {
  const UPLOADED: UploadedFile = {
    file: { _: 'inputFile', id: 0x1111n, parts: 3, name: 'report.pdf', md5_checksum: 'abcd' },
    fileId: 0x1111n,
    parts: 3,
    size: 1_500_000,
    dcId: 2,
  }

  const BIG: UploadedFile = {
    file: { _: 'inputFileBig', id: 0x2222n, parts: 40, name: 'clip.mp4' },
    fileId: 0x2222n,
    parts: 40,
    size: 20_000_000,
    dcId: 2,
  }

  it('sends a photo by naming the file and nothing else', () => {
    expect(uploadedPhoto(UPLOADED)).toEqual({
      _: 'inputMediaUploadedPhoto',
      file: UPLOADED.file,
    })
  })

  it('names a photo the same way whichever path the parts took', () => {
    // Which of the two references an upload produced is about how the bytes
    // travelled, not about what they are.
    expect(uploadedPhoto(BIG)).toEqual({ _: 'inputMediaUploadedPhoto', file: BIG.file })
  })

  it('states what a document is, because nothing here could work it out', () => {
    expect(uploadedDocument(UPLOADED, { mimeType: 'application/pdf' })).toEqual({
      _: 'inputMediaUploadedDocument',
      file: UPLOADED.file,
      mime_type: 'application/pdf',
      attributes: [],
    })
  })

  it('records a name as the attribute a recipient reads it from', () => {
    expect(uploadedDocument(UPLOADED, { mimeType: 'application/pdf', name: 'report.pdf' })).toEqual(
      {
        _: 'inputMediaUploadedDocument',
        file: UPLOADED.file,
        mime_type: 'application/pdf',
        attributes: [{ _: 'documentAttributeFilename', file_name: 'report.pdf' }],
      },
    )
  })

  it('does not take the name the parts travelled under', () => {
    // The two are recorded in different places and mean different things, and
    // a caller sending the same bytes under another name is doing something
    // reasonable.
    const media = uploadedDocument(UPLOADED, { mimeType: 'application/pdf' }) as {
      attributes: readonly unknown[]
    }

    expect(media.attributes).toEqual([])
  })

  it('passes through what the caller knows and this does not', () => {
    // Duration and dimensions are facts about the content. Reading them out of
    // the bytes means decoding the format, so a caller that knows states them.
    const media = uploadedDocument(BIG, {
      mimeType: 'video/mp4',
      name: 'clip.mp4',
      attributes: [{ _: 'documentAttributeVideo', duration: 12, w: 640, h: 480 }],
    }) as { attributes: readonly TypeDocumentAttribute[] }

    expect(media.attributes).toEqual([
      { _: 'documentAttributeFilename', file_name: 'clip.mp4' },
      { _: 'documentAttributeVideo', duration: 12, w: 640, h: 480 },
    ])
  })

  it("lets the caller's own filename win over the convenience", () => {
    const media = uploadedDocument(UPLOADED, {
      mimeType: 'application/pdf',
      name: 'shorthand.pdf',
      attributes: [{ _: 'documentAttributeFilename', file_name: 'deliberate.pdf' }],
    }) as { attributes: readonly TypeDocumentAttribute[] }

    expect(media.attributes.at(-1)).toEqual({
      _: 'documentAttributeFilename',
      file_name: 'deliberate.pdf',
    })
  })
})

/**
 * Whether a descriptor can be written at all.
 *
 * Reading a constructor and writing one are not the same question. A name two
 * tables both carry can be read — the table is known from where the value came
 * from — but writing one has to choose, and the codec refuses rather than
 * guessing. A descriptor that only ever reaches a mock is never put to that
 * test, so these cases put each one through the codec both ways.
 */
describe('a descriptor on the wire', () => {
  const SCOPE = new TlScope('media', [CORE, MTPROTO, API])

  const roundTrip = (value: unknown) => readObject(writeObject(value, SCOPE), SCOPE)

  const UPLOADED: UploadedFile = {
    file: { _: 'inputFile', id: 0x1111n, parts: 3, name: 'report.pdf', md5_checksum: 'abcd' },
    fileId: 0x1111n,
    parts: 3,
    size: 1_500_000,
    dcId: 2,
  }

  it('carries a document that is already on Telegram', () => {
    expect(roundTrip(documentMedia(DOCUMENT))).toEqual(documentMedia(DOCUMENT))
  })

  it('carries a photo that is already on Telegram', () => {
    expect(roundTrip(photoMedia(PHOTO))).toEqual(photoMedia(PHOTO))
  })

  it('carries an uploaded photo', () => {
    expect(roundTrip(uploadedPhoto(UPLOADED))).toEqual(uploadedPhoto(UPLOADED))
  })

  it('carries an uploaded document with everything the caller stated', () => {
    const media = uploadedDocument(UPLOADED, {
      mimeType: 'video/mp4',
      name: 'clip.mp4',
      attributes: [{ _: 'documentAttributeVideo', duration: 12, w: 640, h: 480 }],
    })

    expect(roundTrip(media)).toEqual(media)
  })

  it('keeps the reference through a round trip, byte for byte', () => {
    // The field the datacenter checks and the one a hand-built descriptor
    // most often loses.
    const back = roundTrip(documentMedia(DOCUMENT))['id'] as TlValue

    expect([...(back['file_reference'] as Uint8Array)]).toEqual([...REFERENCE])
  })
})

/**
 * Choosing which rendering of a photo to fetch.
 *
 * `photoFile` takes the largest, which is what a caller wanting the picture
 * means. What it cannot express is a caller wanting a *particular* size — a
 * list thumbnail, a preview beside a name — and fetching the full-size image to
 * scale it down is bytes nobody asked for.
 *
 * The distinction that matters is which sizes name a file at all. Some arrive
 * inside the message and describe their own content; asking a datacenter for
 * one is asking for something it was never given.
 */
describe('choosing a size of a photo', () => {
  /** A photo offering the mix a real one does. */
  const photo = {
    _: 'photo' as const,
    id: 42n,
    access_hash: 5n,
    file_reference: Uint8Array.of(9),
    date: 1_700_000_000,
    dc_id: 2,
    sizes: [
      { _: 'photoStrippedSize' as const, type: 'i', bytes: Uint8Array.of(1, 2, 3) },
      { _: 'photoSize' as const, type: 's', w: 90, h: 67, size: 1_200 },
      { _: 'photoSize' as const, type: 'y', w: 1280, h: 960, size: 120_000 },
      { _: 'photoSize' as const, type: 'm', w: 320, h: 240, size: 12_000 },
    ],
  }

  it('lists what is worth fetching first, largest first', async () => {
    const sizes = thumbnails(photo)

    expect(sizes.map((one) => one.type)).toEqual(['y', 'm', 's', 'i'])
    expect(sizes.map((one) => one.fetchable)).toEqual([true, true, true, false])
  })

  it('reports the measurements a size states, and nothing it does not', () => {
    const [largest] = thumbnails(photo)

    expect(largest).toMatchObject({ type: 'y', width: 1280, height: 960, bytes: 120_000 })

    const stripped = thumbnail(photo, 'i')
    expect(stripped?.fetchable).toBe(false)
    // A stripped preview states no measurements and no length: it is bytes in
    // the message rather than a rendering with a size.
    expect(stripped?.bytes).toBeUndefined()
  })

  it('builds a location naming the size, which is what the datacenter reads', () => {
    const request = thumbnailFile(photo, 's')

    expect(request.dcId).toBe(2)
    expect(request.size).toBe(1_200)
    expect(request.location).toMatchObject({
      _: 'inputPhotoFileLocation',
      id: 42n,
      access_hash: 5n,
      thumb_size: 's',
    })
  })

  it('fetches the small one rather than the whole picture', () => {
    // The point of naming a size: the request is two orders of magnitude
    // smaller than the one `photoFile` would make.
    const small = thumbnailFile(photo, 's')
    const whole = photoFile(photo)

    expect(small.size).toBeLessThan(whole.size ?? Number.POSITIVE_INFINITY)
    expect((whole.location as unknown as { thumb_size: string }).thumb_size).toBe('y')
  })

  it('refuses a size that arrived with the message', () => {
    expect(() => thumbnailFile(photo, 'i')).toThrow(/arrived with the message/)
  })

  it('says which sizes there are when asked for one there is not', () => {
    expect(() => thumbnailFile(photo, 'z')).toThrow(/has no size 'z'/)
    expect(() => thumbnailFile(photo, 'z')).toThrow(/y, m, s, i/)
  })

  it('answers nothing rather than throwing when merely asked whether a size exists', () => {
    // Telegram decides which sizes a photo has and the set differs, so a
    // caller checking is not making a mistake.
    expect(thumbnail(photo, 'z')).toBeUndefined()
    expect(thumbnails({ _: 'photoEmpty', id: 1n })).toEqual([])
  })

  it('refuses an empty photo by name', () => {
    expect(() => thumbnailFile({ _: 'photoEmpty', id: 1n }, 's')).toThrow(/empty photo/)
  })
})

/**
 * A document's own thumbnails.
 *
 * A document is one file, and beside it travel renderings of it: pictures in
 * `thumbs`, moving ones in `video_thumbs`. They are addressed by the document —
 * its identifier, hash, reference and datacenter — with the size's name added,
 * so everything the document names has to survive into the location, and the
 * size has to be one a datacenter holds rather than one the message carried.
 */
describe('the thumbnails of a document', () => {
  /** A sticker-like document offering every kind of rendering there is. */
  const document: Document = {
    ...DOCUMENT,
    id: 0x7777n,
    access_hash: -0x1111n,
    dc_id: 5,
    mime_type: 'video/webm',
    attributes: [{ _: 'documentAttributeImageSize', w: 400, h: 300 }],
    thumbs: [
      { _: 'photoStrippedSize', type: 'i', bytes: Uint8Array.of(1, 40, 40, 0) },
      { _: 'photoPathSize', type: 'j', bytes: Uint8Array.of(0xc0, 0x05, 0x86) },
      { _: 'photoSize', type: 's', w: 90, h: 90, size: 900 },
      { _: 'photoCachedSize', type: 'a', w: 20, h: 20, bytes: Uint8Array.of(0xff, 0xd8, 0xff) },
      { _: 'photoSizeProgressive', type: 'm', w: 320, h: 320, sizes: [1_000, 4_000, 9_000] },
      { _: 'photoSizeEmpty', type: 'x' },
    ],
    video_thumbs: [
      { _: 'videoSize', type: 'v', w: 100, h: 100, size: 20_000, video_start_ts: 1.5 },
      {
        _: 'videoSizeEmojiMarkup',
        emoji_id: 5n,
        background_colors: [0xffffff],
      },
    ],
  }

  it('says of each whether it is fetched, carried, drawn, or empty', () => {
    const listed = thumbnails(document).map((one) => [one.type, one.availability, one.video])

    expect(listed).toEqual([
      ['m', 'download', false],
      ['s', 'download', false],
      ['v', 'download', true],
      ['j', 'embedded', false],
      ['a', 'embedded', false],
      ['i', 'embedded', false],
      ['x', 'unavailable', false],
      ['', 'unsupported', true],
    ])
    expect(thumbnails(document).map((one) => one.fetchable)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ])
  })

  it('measures each by what it states, and an outline by the canvas the document states', () => {
    expect(thumbnail(document, 'm')).toMatchObject({ width: 320, height: 320, bytes: 9_000 })
    expect(thumbnail(document, 'v')).toMatchObject({ width: 100, height: 100, bytes: 20_000 })
    expect(thumbnail(document, 'a')).toMatchObject({ width: 20, height: 20, bytes: undefined })
    expect(thumbnail(document, 'j')).toMatchObject({ width: 400, height: 300 })
    expect(thumbnail(document, 'i')).toMatchObject({ width: undefined, height: undefined })

    // With nothing stated, the outline is drawn where Telegram draws them.
    expect(thumbnail({ ...document, attributes: [] }, 'j')).toMatchObject({
      width: 512,
      height: 512,
    })
  })

  it('keeps the raw constructor, so a field this does not name is still there', () => {
    const moving = thumbnail(document, 'v')?.raw

    expect(moving?._).toBe('videoSize')
    expect((moving as { video_start_ts?: number }).video_start_ts).toBe(1.5)
  })

  it('addresses a picture thumbnail by the document and the size', () => {
    expect(thumbnailFile(document, 's')).toEqual({
      dcId: 5,
      size: 900,
      location: {
        _: 'inputDocumentFileLocation',
        id: 0x7777n,
        access_hash: -0x1111n,
        file_reference: REFERENCE,
        thumb_size: 's',
      },
    })
  })

  it('addresses a moving thumbnail the same way, sized by its whole length', () => {
    expect(thumbnailFile(document, 'v')).toMatchObject({
      dcId: 5,
      size: 20_000,
      location: { _: 'inputDocumentFileLocation', id: 0x7777n, thumb_size: 'v' },
    })
    // A progressive picture is as long as its last stage.
    expect(thumbnailFile(document, 'm').size).toBe(9_000)
  })

  it('carries the reference the document arrived with, unchanged', () => {
    expect(thumbnailFile(document, 's').location['file_reference']).toBe(REFERENCE)
  })

  it('refuses a carried thumbnail, and says where it is read instead', () => {
    for (const type of ['i', 'j', 'a']) {
      expect(() => thumbnailFile(document, type)).toThrow(/arrived with the message/)
      expect(() => thumbnailFile(document, type)).toThrow(/embeddedThumbnail/)
    }
  })

  it('refuses an empty size and a composition by what they are', () => {
    expect(() => thumbnailFile(document, 'x')).toThrow(/listed with no content/)
    expect(() => thumbnailFile(document, '')).toThrow(
      /videoSizeEmojiMarkup of document 30583 is an animation to draw/,
    )
  })

  it('says which sizes there are when asked for one there is not', () => {
    expect(() => thumbnailFile(document, 'w')).toThrow(ValidationError)
    expect(() => thumbnailFile(document, 'w')).toThrow(
      "document 30583 has no size 'w'; it offers m, s, v, j, a, i, x, (videoSizeEmojiMarkup)",
    )
    expect(() => thumbnailFile(DOCUMENT, 's')).toThrow(/offers none/)
  })

  it('lists nothing for a document with no thumbnails, or for an empty one', () => {
    expect(thumbnails(DOCUMENT)).toEqual([])
    expect(thumbnails({ _: 'documentEmpty', id: 1n })).toEqual([])
    expect(() => thumbnailFile({ _: 'documentEmpty', id: 1n }, 's')).toThrow(/empty document/)
  })

  it('leaves the document itself to documentFile, which names no size', () => {
    // The whole file and its renderings share every field but the size, so the
    // two requests differ only there.
    const whole = documentFile(document).location
    const small = thumbnailFile(document, 's').location

    expect(whole['thumb_size']).toBe('')
    expect({ ...small, thumb_size: '' }).toEqual(whole)
  })
})

describe('the moving renderings of a photo', () => {
  /** A profile photo with an animated version beside its pictures. */
  const animated: Photo = {
    ...PHOTO,
    sizes: [
      { _: 'photoSize', type: 'a', w: 160, h: 160, size: 8_000 },
      { _: 'photoSize', type: 'c', w: 640, h: 640, size: 60_000 },
    ],
    video_sizes: [
      { _: 'videoSize', type: 'u', w: 640, h: 640, size: 300_000 },
      {
        _: 'videoSizeStickerMarkup',
        stickerset: { _: 'inputStickerSetEmpty' },
        sticker_id: 3n,
        background_colors: [],
      },
    ],
  }

  it('lists them after the pictures, so the first is still the one photoFile takes', () => {
    const [first] = thumbnails(animated)

    expect(thumbnails(animated).map((one) => one.type)).toEqual(['c', 'a', 'u', ''])
    expect(first?.type).toBe((photoFile(animated).location as { thumb_size?: string }).thumb_size)
  })

  it('fetches one through the photo, naming its size', () => {
    expect(thumbnailFile(animated, 'u')).toMatchObject({
      dcId: PHOTO.dc_id,
      size: 300_000,
      location: { _: 'inputPhotoFileLocation', id: PHOTO.id, thumb_size: 'u' },
    })
  })

  it('refuses the composition, which names a sticker rather than a file', () => {
    expect(() => thumbnailFile(animated, '')).toThrow(/videoSizeStickerMarkup/)
  })
})
