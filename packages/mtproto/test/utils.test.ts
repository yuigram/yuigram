// SPDX-License-Identifier: MIT

/**
 * Utilities that need no account, and the ones sending relies on.
 *
 * Every binary fixture here is worked out by hand from the format's definition
 * — the bit layout, the signature, the path grammar — rather than produced by
 * the code under test and read back by the same code.
 */

import { createHash } from 'node:crypto'
import { PeerError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  FileIdError,
  type FileIdentity,
  inputDocumentOf,
  inputPhotoOf,
  mediaOf,
  writeFileId,
} from '../src/files/identifier.js'
import { thumbnail, uploadedDocument } from '../src/files/media.js'
import {
  detectMimeType,
  fileNameOf,
  inferMimeType,
  isProbablyText,
  mimeTypeOfName,
} from '../src/files/types.js'
import { type UploadSource, upload } from '../src/files/upload.js'
import { fromHtml } from '../src/format/html.js'
import type { TypePage, TypePageBlock, TypeRichText } from '../src/generated/api/types/index.js'
import { peerOfInput, toInputChannel, toInputUser } from '../src/network/peers.js'
import { normalizePhone } from '../src/phone.js'
import {
  embeddedThumbnail,
  formattedToRichText,
  inflatePath,
  outlineSvg,
  pageMedia,
  richTextToFormatted,
  strippedToJpeg,
  walkPageBlocks,
} from '../src/utils/index.js'
import { decodeWaveform, encodeWaveform } from '../src/utils/waveform.js'
import { FileServer } from './server/files.js'

describe('voice waveforms', () => {
  it('packs five-bit samples from the lowest bit of the first byte upwards', () => {
    // 31 fills bits 0–4; 0 bits 5–9; 31 bits 10–14; 0 bits 15–19.
    // Byte 0 is bits 0–7: 0b00011111. Byte 1 is bits 8–15: bits 10–14 set,
    // 0b01111100. Byte 2 is bits 16–23, all clear.
    expect([...encodeWaveform([31, 0, 31, 0])]).toEqual([0x1f, 0x7c, 0x00])
    expect(decodeWaveform(new Uint8Array([0x1f, 0x7c, 0x00]))).toEqual([31, 0, 31, 0])
  })

  it('reads a sample that sits across two bytes, and one at the very end', () => {
    // The eighth sample is bits 35–39: bits 3–7 of byte 4.
    expect([...encodeWaveform([0, 0, 0, 0, 0, 0, 0, 31])]).toEqual([0, 0, 0, 0, 0xf8])
    // The second sample, bits 5–9, straddles the first two bytes: 0b111 from
    // byte 0's top and 0b11 from byte 1's bottom.
    expect(decodeWaveform(new Uint8Array([0xe0, 0x03]))).toEqual([0, 31, 0])
    expect([...encodeWaveform([0, 31, 0])]).toEqual([0xe0, 0x03])
    expect(decodeWaveform(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]))).toEqual(
      new Array<number>(8).fill(31),
    )
  })

  it('makes nothing of bits too few for a sample, and refuses a sample out of range', () => {
    expect(decodeWaveform(new Uint8Array(0))).toEqual([])
    // Eight bits hold one whole sample and three left over.
    expect(decodeWaveform(new Uint8Array([0b1110_0101]))).toEqual([0b00101])
    expect(() => encodeWaveform([32])).toThrow(ValidationError)
    expect(() => encodeWaveform([1.5])).toThrow(/whole numbers from 0 to 31/)
    expect(() => encodeWaveform([-1])).toThrow(ValidationError)
  })
})

describe('inline previews', () => {
  const stripped = new Uint8Array([1, 40, 30, 0xaa, 0xbb, 0xcc])

  it('rebuilds a stripped thumbnail as a JPEG with its size in the frame header', () => {
    const jpeg = strippedToJpeg(stripped)

    expect([...jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8])
    expect([...jpeg.subarray(-2)]).toEqual([0xff, 0xd9])
    expect(jpeg.length).toBe(623 + 3 + 2)
    expect([...jpeg.subarray(623, 626)]).toEqual([0xaa, 0xbb, 0xcc])
    // The frame header: marker, length 17, precision 8, height 40, width 30.
    expect([...jpeg.subarray(158, 167)]).toEqual([0xff, 0xc0, 0, 17, 8, 0, 40, 0, 30])
    // The first luminance quantisation values: 16, 11, 12 of the standard's
    // table at quality 20, which scales them by 2.5 — 40, 28, 30.
    expect([...jpeg.subarray(25, 28)]).toEqual([40, 28, 30])
    // The header every stripped thumbnail shares, as Telegram's clients have
    // it, by its digest with the size cleared.
    const header = Buffer.from(jpeg.subarray(0, 623))
    header[164] = 0
    header[166] = 0
    expect(createHash('sha256').update(header).digest('hex')).toBe(
      'c2d6c960e35c3d94de4a0d85a39e0d9def693ee107fa374354960f2df47d82d4',
    )
  })

  it('refuses bytes that are not a stripped thumbnail', () => {
    expect(() => strippedToJpeg(new Uint8Array([1, 2]))).toThrow(ValidationError)
    expect(() => strippedToJpeg(new Uint8Array([2, 10, 10, 0]))).toThrow(ValidationError)
  })

  it('unpacks a path, with numbers marked as following a comma or negative', () => {
    // 5 is a number; 128+7 a comma then 7; 64+3 a minus then 3; 192+11 the
    // character 'L'; 10 a number.
    expect(inflatePath(new Uint8Array([5, 128 + 7, 64 + 3, 192 + 11, 10]))).toBe('M5,7-3L10z')
  })

  it('wraps a path in an SVG document, refusing a fill that could end its attribute', () => {
    const svg = outlineSvg('M5,7z', { fill: '#123456' })

    expect(svg).toContain('viewBox="0 0 512 512"')
    expect(svg).toContain('<path fill="#123456" d="M5,7z"/>')
    expect(() => outlineSvg('M5z', { fill: 'red" onload="x' })).toThrow(ValidationError)
    expect(() => outlineSvg('M5z"/><script>')).toThrow(ValidationError)
  })
})

/** The opening of a WebP image: a RIFF container naming its format. */
const WEBP_HEAD = new Uint8Array([
  ...new TextEncoder().encode('RIFF'),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode('WEBP'),
])

describe('reading a thumbnail the message carried', () => {
  const document = {
    _: 'document' as const,
    id: 9n,
    access_hash: 1n,
    file_reference: Uint8Array.of(1),
    date: 1_700_000_000,
    mime_type: 'application/x-tgsticker',
    size: 10_000n,
    dc_id: 2,
    attributes: [{ _: 'documentAttributeImageSize' as const, w: 256, h: 128 }],
    thumbs: [
      { _: 'photoStrippedSize' as const, type: 'i', bytes: Uint8Array.of(1, 40, 30, 0xaa) },
      { _: 'photoPathSize' as const, type: 'j', bytes: Uint8Array.of(5, 128 + 7, 192 + 11, 10) },
      { _: 'photoCachedSize' as const, type: 'a', w: 8, h: 8, bytes: WEBP_HEAD },
      { _: 'photoSize' as const, type: 'm', w: 320, h: 320, size: 9_000 },
      { _: 'photoSizeEmpty' as const, type: 'x' },
    ],
  }
  const size = (type: string) => {
    const found = thumbnail(document, type)
    if (found === undefined) throw new Error(`no size ${type}`)
    return found
  }

  it('expands a stripped preview into the JPEG it was stripped from', () => {
    const read = embeddedThumbnail(size('i'))

    expect(read.mimeType).toBe('image/jpeg')
    expect(read.bytes).toEqual(strippedToJpeg(Uint8Array.of(1, 40, 30, 0xaa)))
  })

  it('draws an outline on the canvas the document states', () => {
    const read = embeddedThumbnail(size('j'), { fill: '#000' })
    const svg = new TextDecoder().decode(read.bytes)

    expect(read.mimeType).toBe('image/svg+xml')
    expect(svg).toContain('viewBox="0 0 256 128"')
    expect(svg).toContain('<path fill="#000" d="M5,7L10z"/>')
  })

  it('answers a cached copy as it arrived, typed by its own signature', () => {
    const read = embeddedThumbnail(size('a'))

    expect(read.bytes).toBe(WEBP_HEAD)
    expect(read.mimeType).toBe('image/webp')
  })

  it('refuses a size that is fetched, and one with nothing in it', () => {
    expect(() => embeddedThumbnail(size('m'))).toThrow(/fetched rather than carried/)
    expect(() => embeddedThumbnail(size('x'))).toThrow(/photoSizeEmpty carries no content/)
  })
})

describe('Instant View rich text', () => {
  const plain = (text: string): TypeRichText => ({ _: 'textPlain', text })

  it('reads rich text into text and ranges, counted in UTF-16 units', () => {
    const rich: TypeRichText = {
      _: 'textConcat',
      texts: [
        plain('Hi '),
        { _: 'textBold', text: { _: 'textItalic', text: plain('there') } },
        plain(' '),
        { _: 'textCustomEmoji', document_id: -5n, alt: '😀' },
        { _: 'textEmail', text: plain('mail'), email: 'a@b.c' },
        { _: 'textSubscript', text: plain('2') },
        { _: 'textDate', text: plain('now'), date: 1_700_000_000, short_time: true },
        { _: 'textImage', document_id: 1n, w: 1, h: 1 },
      ],
    }

    expect(richTextToFormatted(rich)).toEqual({
      text: 'Hi there 😀mail2now',
      entities: [
        { _: 'messageEntityBold', offset: 3, length: 5 },
        { _: 'messageEntityItalic', offset: 3, length: 5 },
        { _: 'messageEntityCustomEmoji', offset: 9, length: 2, document_id: -5n },
        { _: 'messageEntityTextUrl', offset: 11, length: 4, url: 'mailto:a@b.c' },
        {
          _: 'messageEntityFormattedDate',
          offset: 16,
          length: 3,
          date: 1_700_000_000,
          short_time: true,
        },
      ],
    })
  })

  it('writes text and ranges as rich text, the outermost range outside', () => {
    expect(formattedToRichText(fromHtml('a<b>b<i>c</i></b><a href="https://e.com">d</a>'))).toEqual(
      {
        _: 'textConcat',
        texts: [
          plain('a'),
          { _: 'textBold', text: plain('b') },
          { _: 'textBold', text: { _: 'textItalic', text: plain('c') } },
          { _: 'textUrl', text: plain('d'), url: 'https://e.com', webpage_id: 0n },
        ],
      },
    )
    expect(formattedToRichText({ text: '', entities: [] })).toEqual({ _: 'textEmpty' })
  })
})

describe('Instant View pages', () => {
  const paragraph = (text: string): TypePageBlock => ({
    _: 'pageBlockParagraph',
    text: { _: 'textPlain', text },
  })
  const caption = {
    _: 'pageCaption',
    text: { _: 'textEmpty' },
    credit: { _: 'textEmpty' },
  } as const
  const blocks: TypePageBlock[] = [
    { _: 'pageBlockTitle', text: { _: 'textPlain', text: 'Title' } },
    {
      _: 'pageBlockDetails',
      title: { _: 'textPlain', text: 'More' },
      blocks: [
        paragraph('inside'),
        {
          _: 'pageBlockList',
          items: [
            { _: 'pageListItemBlocks', blocks: [paragraph('item')] },
            { _: 'pageListItemText', text: { _: 'textPlain', text: 'plain item' } },
          ],
        },
      ],
    },
    { _: 'pageBlockCollage', items: [{ _: 'pageBlockPhoto', photo_id: 10n, caption }], caption },
    { _: 'pageBlockVideo', video_id: 20n, caption },
  ]

  const names = (block: TypePageBlock): string =>
    block._ === 'pageBlockParagraph' && block.text._ === 'textPlain' ? block.text.text : block._

  it('visits every block in reading order, with the blocks it is inside', () => {
    const seen: string[] = []
    walkPageBlocks(blocks, (block, within) => {
      seen.push(`${within.length}:${names(block)}`)
    })

    expect(seen).toEqual([
      '0:pageBlockTitle',
      '0:pageBlockDetails',
      '1:inside',
      '1:pageBlockList',
      '2:item',
      '0:pageBlockCollage',
      '1:pageBlockPhoto',
      '0:pageBlockVideo',
    ])
  })

  it('leaves out what is inside a skipped block, and stops when told', () => {
    const skipped: string[] = []
    walkPageBlocks(blocks, (block) => {
      skipped.push(names(block))
      return block._ === 'pageBlockDetails' ? 'skip' : undefined
    })
    expect(skipped).toEqual([
      'pageBlockTitle',
      'pageBlockDetails',
      'pageBlockCollage',
      'pageBlockPhoto',
      'pageBlockVideo',
    ])

    const stopped: string[] = []
    const finished = walkPageBlocks(blocks, (block) => {
      stopped.push(names(block))
      return names(block) === 'inside' ? 'stop' : undefined
    })
    expect(stopped).toEqual(['pageBlockTitle', 'pageBlockDetails', 'inside'])
    expect(finished).toBe(false)
  })

  it('finds the photo or document a block shows among what the page carries', () => {
    const photo = { _: 'photo', id: 10n, access_hash: 1n } as never
    const video = { _: 'document', id: 20n, access_hash: 2n } as never
    const page = {
      _: 'page',
      url: 'https://e.com',
      blocks,
      photos: [photo],
      documents: [video],
    } as TypePage

    const found: unknown[] = []
    walkPageBlocks(blocks, (block) => void found.push(pageMedia(page, block)))

    expect(found.filter((one) => one !== undefined)).toEqual([
      { kind: 'photo', photo },
      { kind: 'document', document: video },
    ])
  })
})

describe('media from a file identifier', () => {
  const document: FileIdentity = {
    dc: 2,
    kind: 'sticker',
    reference: new Uint8Array([1, 2, 3]),
    where: { at: 'document', id: 0x7fff_ffff_ffff_ffffn, accessHash: -0x7fff_ffff_ffff_fff0n },
  }
  const photo: FileIdentity = {
    dc: 2,
    kind: 'photo',
    reference: undefined,
    where: {
      at: 'photo',
      id: 111n,
      accessHash: 222n,
      source: { of: 'thumbnail', kind: 'photo', size: 'x' },
    },
  }

  it('keeps both 64-bit numbers and the reference exactly as the identifier had them', () => {
    expect(inputDocumentOf(writeFileId(document))).toEqual({
      _: 'inputDocument',
      id: 0x7fff_ffff_ffff_ffffn,
      access_hash: -0x7fff_ffff_ffff_fff0n,
      file_reference: new Uint8Array([1, 2, 3]),
    })
    expect(inputPhotoOf(photo)).toEqual({
      _: 'inputPhoto',
      id: 111n,
      access_hash: 222n,
      file_reference: new Uint8Array(0),
    })
    expect(mediaOf(photo)).toEqual({ _: 'inputMediaPhoto', id: inputPhotoOf(photo) })
    expect(mediaOf(document)._).toBe('inputMediaDocument')
  })

  it('refuses what cannot be sent as the media it names', () => {
    const profile: FileIdentity = {
      ...photo,
      kind: 'profilePhoto',
      where: {
        at: 'photo',
        id: 1n,
        accessHash: 2n,
        source: { of: 'profilePhoto', big: true, peerId: 5, accessHash: 3n },
      },
    }

    expect(() => inputPhotoOf(profile)).toThrow(FileIdError)
    expect(() => inputDocumentOf(photo)).toThrow(/does not name a document/)
    expect(() => inputDocumentOf({ ...document, kind: 'encrypted' })).toThrow(FileIdError)
    expect(() =>
      inputDocumentOf({
        ...document,
        where: { at: 'web', url: 'https://e.com/a', accessHash: 1n },
      }),
    ).toThrow(FileIdError)
  })
})

describe('what a file is', () => {
  const bytes = (...values: (number | string)[]): Uint8Array =>
    new Uint8Array(
      values.flatMap((value) =>
        typeof value === 'string' ? [...value].map((c) => c.charCodeAt(0)) : [value],
      ),
    )

  it('tells formats apart by the signatures they begin with', () => {
    expect(detectMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(detectMimeType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(detectMimeType(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image/webp')
    expect(detectMimeType(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBe('audio/wav')
    expect(detectMimeType(bytes(0, 0, 0, 0x18, 'ftypisom'))).toBe('video/mp4')
    expect(detectMimeType(bytes(0, 0, 0, 0x18, 'ftypqt  '))).toBe('video/quicktime')
    expect(detectMimeType(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, 'webm'))).toBe(
      'video/webm',
    )
    expect(detectMimeType(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88, 'matroska'))).toBe(
      'video/x-matroska',
    )
    expect(detectMimeType(bytes('OggS', 0))).toBe('audio/ogg')
    expect(detectMimeType(bytes(0xff, 0xfb, 0x90))).toBe('audio/mpeg')
    expect(detectMimeType(bytes('%PDF-1.7'))).toBe('application/pdf')
    expect(detectMimeType(bytes('hello'))).toBeUndefined()
    expect(detectMimeType(new Uint8Array(0))).toBeUndefined()
  })

  it('reads text as text, including a character cut off at the end, and nothing else', () => {
    expect(isProbablyText(new TextEncoder().encode('Plain text\n\twith tabs'))).toBe(true)
    // "é" is two bytes; a sample ending after the first is still text.
    expect(isProbablyText(new Uint8Array([0x61, 0xc3]))).toBe(true)
    expect(isProbablyText(new Uint8Array([0x61, 0x00, 0x62]))).toBe(false)
    expect(isProbablyText(new Uint8Array([0xff, 0xfe]))).toBe(false)
    expect(isProbablyText(new Uint8Array(0))).toBe(false)
  })

  it('reads the name at the end of a path or an address, never the host', () => {
    expect(fileNameOf('/home/me/Report Q3.pdf')).toBe('Report Q3.pdf')
    expect(fileNameOf('C:\\Users\\me\\a.png')).toBe('a.png')
    expect(fileNameOf('https://example.com/a/b%20c.png?x=1#y')).toBe('b c.png')
    expect(fileNameOf('https://example.com')).toBeUndefined()
    expect(fileNameOf('https://example.com/dir/')).toBeUndefined()
    expect(mimeTypeOfName('Photo.JPG')).toBe('image/jpeg')
    expect(mimeTypeOfName('.bashrc')).toBeUndefined()
  })

  it('prefers what was said, then the content, then the name, then text', () => {
    const png = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)
    const gzip = bytes(0x1f, 0x8b, 8)

    expect(inferMimeType({ stated: 'image/x-mine', head: png, name: 'a.pdf' })).toBe('image/x-mine')
    expect(inferMimeType({ head: png, name: 'a.pdf' })).toBe('image/png')
    expect(inferMimeType({ head: bytes('%%'), name: 'a.pdf' })).toBe('application/pdf')
    expect(inferMimeType({ head: bytes('just words') })).toBe('text/plain')
    expect(inferMimeType({ head: bytes(0, 1, 2) })).toBe('application/octet-stream')
    // An animated sticker is gzip by content and a sticker only by name.
    expect(inferMimeType({ head: gzip, name: 'hello.tgs' })).toBe('application/x-tgsticker')
    expect(inferMimeType({ head: gzip, name: 'hello.gz' })).toBe('application/gzip')
  })
})

describe('an upload, told what it is from what was sent', () => {
  const server = new FileServer(2)
  const reach = () => ({ invoke: async (query: never) => server.invoke(query) })
  const png = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...new Array(3000).fill(7),
  ])

  it('keeps the first bytes it sent and names the type from them, without reading twice', async () => {
    const reads: number[] = []
    // A source that can be read once, in order: a second read of an offset
    // it has passed would fail.
    let next = 0
    const once: UploadSource = {
      read: async (offset, length) => {
        if (offset !== next) throw new Error(`read ${offset} after ${next}`)
        reads.push(offset)
        next = offset + length

        return png.slice(offset, offset + length)
      },
    }

    const sent = await upload({ source: once, reach, dcId: 2, partSize: 1024, fileId: 1n })

    // The third read comes back short, which is the end: every offset once.
    expect(reads).toEqual([0, 1024, 2048])
    expect([...(sent.head ?? new Uint8Array(0)).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(sent.head?.length).toBe(512)
    expect(uploadedDocument(sent)).toMatchObject({ mime_type: 'image/png', attributes: [] })
    expect(uploadedDocument(sent, { mimeType: 'application/x-said', name: 'a.png' })).toMatchObject(
      {
        mime_type: 'application/x-said',
        attributes: [{ _: 'documentAttributeFilename', file_name: 'a.png' }],
      },
    )
  })
})

describe('phone numbers', () => {
  it('keeps the digits and takes out what people write between them', () => {
    expect(normalizePhone(' +44 (20) 7946-0000 ')).toBe('442079460000')
    // No country is assumed: a local number stays local.
    expect(normalizePhone('020 7946 0000')).toBe('02079460000')
    expect(() => normalizePhone('+44 20 CALL ME')).toThrow(ValidationError)
    expect(() => normalizePhone(' + ')).toThrow(ValidationError)
  })
})

describe('peer conversions', () => {
  it('turns an input peer into the user or channel form, refusing the wrong kind', () => {
    expect(toInputUser({ _: 'inputPeerUser', user_id: 5n, access_hash: -9n })).toEqual({
      _: 'inputUser',
      user_id: 5n,
      access_hash: -9n,
    })
    expect(toInputUser({ _: 'inputPeerSelf' })).toEqual({ _: 'inputUserSelf' })
    expect(toInputChannel({ _: 'inputPeerChannel', channel_id: 7n, access_hash: 8n })).toEqual({
      _: 'inputChannel',
      channel_id: 7n,
      access_hash: 8n,
    })
    expect(() => toInputChannel({ _: 'inputPeerUser', user_id: 5n, access_hash: 1n })).toThrow(
      PeerError,
    )
    expect(() => toInputUser({ _: 'inputPeerChat', chat_id: 5n })).toThrow(/does not name a user/)
  })

  it('says which peer an input peer names, keeping the kind and every digit', () => {
    expect(
      peerOfInput({ _: 'inputPeerChannel', channel_id: 9_007_199_254_740_993n, access_hash: 1n }),
    ).toEqual({
      kind: 'channel',
      id: 9_007_199_254_740_993n,
    })
    expect(peerOfInput({ _: 'inputPeerChat', chat_id: 5n })).toEqual({ kind: 'chat', id: 5n })
    expect(peerOfInput({ _: 'inputPeerSelf' }, 42n)).toEqual({ kind: 'user', id: 42n })
    expect(() => peerOfInput({ _: 'inputPeerSelf' })).toThrow(PeerError)
    expect(() => peerOfInput({ _: 'inputPeerEmpty' })).toThrow(PeerError)
  })
})
