/**
 * Turning what a message carried into what a transfer can fetch.
 *
 * The mapping is mechanical and that is exactly why it is worth pinning: every
 * field is copied from the document, and one left out produces a request the
 * datacenter refuses for a reason that says nothing about the file. The file
 * reference is the one most easily lost, because a request without it is well
 * formed and still refused.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { documentFile, photoFile } from '../src/files/media.js'
import type { Document, Photo, TypeDocument } from '../src/generated/api/types/index.js'

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
