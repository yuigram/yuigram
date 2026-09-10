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
import { documentFile } from '../src/files/media.js'
import type { Document, TypeDocument } from '../src/generated/api/types/index.js'

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
