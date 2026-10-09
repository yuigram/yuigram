// SPDX-License-Identifier: MPL-2.0

/**
 * The datacenter that stores and serves files, tested before anything trusts it.
 *
 * A server that quietly behaves well however it is driven proves nothing about
 * a client: the cases that matter in file transfer are the ones nothing
 * announces — a part under the wrong number, a range that stops short, a
 * reference that expired, a chunk from a machine Telegram does not operate. So
 * the misbehaviour is verified first, and the state behind it with it.
 */

import { TelegramError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { sha256 } from '../src/crypto/hash.js'
import { MigrationError } from '../src/session/dispatcher.js'
import type { TlValue } from '../src/tl/index.js'
import { contentOf, encrypt, FileServer } from './server/files.js'

const FILE = 0x1234_5678n

/** A location naming a file with the reference it is currently served with. */
function locate(reference: Uint8Array, id = FILE): TlValue {
  return {
    _: 'inputDocumentFileLocation',
    id,
    access_hash: 5n,
    file_reference: reference,
    thumb_size: '',
  }
}

/** Ask for a range of a file. */
function get(reference: Uint8Array, offset: number, limit: number, extra: TlValue = { _: 'x' }) {
  return {
    _: 'upload.getFile',
    location: locate(reference),
    offset: BigInt(offset),
    limit,
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== '_')),
  } as TlValue
}

describe('what the server makes up', () => {
  it('gives the same bytes for the same range every time', () => {
    // Two runs of the same case have to see the same file, or nothing about a
    // transfer can be asserted byte for byte.
    expect(contentOf(FILE, 0, 64)).toEqual(contentOf(FILE, 0, 64))
  })

  it('gives different bytes at different offsets', () => {
    expect(contentOf(FILE, 0, 64)).not.toEqual(contentOf(FILE, 64, 64))
  })

  it('gives different bytes for different files', () => {
    expect(contentOf(FILE, 0, 64)).not.toEqual(contentOf(FILE + 1n, 0, 64))
  })

  it('gives a range that continues the one before it', () => {
    const whole = contentOf(FILE, 0, 128)

    // A range is a window onto one file rather than a fresh stream, so a client
    // that stitches ranges together gets the file back.
    expect(contentOf(FILE, 64, 64)).toEqual(whole.slice(64))
  })
})

describe('receiving a small file', () => {
  it('keeps the parts and assembles them in order', () => {
    const server = new FileServer()

    server.invoke({
      _: 'upload.saveFilePart',
      file_id: FILE,
      file_part: 0,
      bytes: Uint8Array.of(1, 2),
    })
    server.invoke({
      _: 'upload.saveFilePart',
      file_id: FILE,
      file_part: 1,
      bytes: Uint8Array.of(3, 4),
    })

    expect(server.assembled(FILE)).toEqual(Uint8Array.of(1, 2, 3, 4))
  })

  it('assembles by part number rather than by arrival', () => {
    const server = new FileServer()

    server.invoke({
      _: 'upload.saveFilePart',
      file_id: FILE,
      file_part: 1,
      bytes: Uint8Array.of(3, 4),
    })
    server.invoke({
      _: 'upload.saveFilePart',
      file_id: FILE,
      file_part: 0,
      bytes: Uint8Array.of(1, 2),
    })

    // Parts may be sent in parallel and arrive in any order. What decides the
    // file is the number each was sent under.
    expect(server.assembled(FILE)).toEqual(Uint8Array.of(1, 2, 3, 4))
  })

  it('lets a part be sent again, and keeps the last', () => {
    const server = new FileServer()

    server.invoke({
      _: 'upload.saveFilePart',
      file_id: FILE,
      file_part: 0,
      bytes: Uint8Array.of(1),
    })
    server.invoke({
      _: 'upload.saveFilePart',
      file_id: FILE,
      file_part: 0,
      bytes: Uint8Array.of(9),
    })

    expect(server.received(FILE)).toBe(1)
    expect(server.assembled(FILE)).toEqual(Uint8Array.of(9))
  })

  it('refuses a part number that could not be one', () => {
    const server = new FileServer()

    expect(() =>
      server.invoke({
        _: 'upload.saveFilePart',
        file_id: FILE,
        file_part: -1,
        bytes: new Uint8Array(1),
      }),
    ).toThrow(/FILE_PART_INVALID/)
  })
})

describe('receiving a large file', () => {
  const part = (index: number, total: number, bytes: Uint8Array): TlValue => ({
    _: 'upload.saveBigFilePart',
    file_id: FILE,
    file_part: index,
    file_total_parts: total,
    bytes,
  })

  it('holds the total it was told, and assembles against it', () => {
    const server = new FileServer()

    server.invoke(part(0, 2, Uint8Array.of(1)))
    server.invoke(part(1, 2, Uint8Array.of(2)))

    expect(server.assembled(FILE)).toEqual(Uint8Array.of(1, 2))
  })

  it('has no file while a part is missing', () => {
    const server = new FileServer()

    server.invoke(part(0, 3, Uint8Array.of(1)))
    server.invoke(part(2, 3, Uint8Array.of(3)))

    // Two of three parts is not two thirds of a file; it is a hole.
    expect(server.received(FILE)).toBe(2)
    expect(server.assembled(FILE)).toBeUndefined()
  })

  it('has no file when the parts run out before the total does', () => {
    const server = new FileServer()

    server.invoke(part(0, 3, Uint8Array.of(1)))
    server.invoke(part(1, 3, Uint8Array.of(2)))

    // The parts that arrived are contiguous from the start, so counting them
    // would make an unfinished upload look finished — and hand back a file
    // missing its end.
    expect(server.received(FILE)).toBe(2)
    expect(server.assembled(FILE)).toBeUndefined()
  })

  it('refuses a part beyond the total it was told', () => {
    const server = new FileServer()

    expect(() => server.invoke(part(5, 3, Uint8Array.of(1)))).toThrow(/FILE_PART_INVALID/)
  })

  it('refuses a total that changes under it', () => {
    const server = new FileServer()
    server.invoke(part(0, 3, Uint8Array.of(1)))

    expect(() => server.invoke(part(1, 4, Uint8Array.of(2)))).toThrow(/FILE_PART_SIZE_CHANGED/)
  })

  it('accepts parts from a stream that does not know its length yet', () => {
    const server = new FileServer()

    // A stream says it does not know by sending a negative total, and says so
    // for real once it does.
    server.invoke(part(0, -1, Uint8Array.of(1)))
    server.invoke(part(1, -1, Uint8Array.of(2)))
    server.invoke(part(2, 3, Uint8Array.of(3)))

    expect(server.assembled(FILE)).toEqual(Uint8Array.of(1, 2, 3))
  })
})

describe('serving a file', () => {
  it('answers a range with the bytes of that range', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 8192 })

    const answer = server.invoke(get(reference, 4096, 4096))

    expect(answer['bytes']).toEqual(contentOf(FILE, 4096, 4096))
  })

  it('answers an offset beyond the range of a 32-bit number', () => {
    const server = new FileServer()
    const big = 5 * 1024 * 1024 * 1024
    const { reference } = server.add(FILE, { size: big + 4096 })

    // Offsets are sixty-four bits, and a file this size is ordinary.
    const answer = server.invoke(get(reference, big, 4096))

    expect(answer['bytes']).toEqual(contentOf(FILE, big, 4096))
  })

  it('stops at the end of the file rather than making more up', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 5000 })

    const answer = server.invoke(get(reference, 4096, 4096)) as TlValue

    expect((answer['bytes'] as Uint8Array).length).toBe(904)
  })

  it('answers nothing at all past the end', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 4096 })

    expect((server.invoke(get(reference, 8192, 4096))['bytes'] as Uint8Array).length).toBe(0)
  })

  it('can be made to stop short of what was asked for', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 65_536 })
    server.faults = { shortRead: true }

    const answer = server.invoke(get(reference, 0, 8192))

    expect((answer['bytes'] as Uint8Array).length).toBeLessThan(8192)
  })

  it('refuses an offset off the grid', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 8192 })

    expect(() => server.invoke(get(reference, 100, 4096))).toThrow(/OFFSET_INVALID/)
  })

  it('refuses a file it is not holding', () => {
    const server = new FileServer()

    expect(() => server.invoke(get(new Uint8Array(1), 0, 4096))).toThrow(/FILE_ID_INVALID/)
  })
})

describe('a file that lives somewhere else', () => {
  it('says which datacenter to ask instead', () => {
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size: 4096, dcId: 4 })

    let raised: unknown
    try {
      server.invoke(get(reference, 0, 4096))
    } catch (error) {
      raised = error
    }

    // Answered the way Telegram answers it, so a client recognises it by the
    // number rather than by the text.
    expect(raised).toBeInstanceOf(MigrationError)
    expect((raised as MigrationError).kind).toBe('file')
    expect((raised as MigrationError).dcId).toBe(4)
  })

  it('serves it once the right datacenter is asked', () => {
    const media = new FileServer(4)
    const { reference } = media.add(FILE, { size: 4096, dcId: 4 })

    expect(media.invoke(get(reference, 0, 4096))['bytes']).toEqual(contentOf(FILE, 0, 4096))
  })
})

describe('a reference that stops working', () => {
  it('is refused once it has expired', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 4096 })
    server.expire(FILE)

    expect(() => server.invoke(get(reference, 0, 4096))).toThrow(/FILE_REFERENCE_EXPIRED/)
  })

  it('is refused when it was never the one issued', () => {
    const server = new FileServer()
    server.add(FILE, { size: 4096 })

    expect(() => server.invoke(get(new TextEncoder().encode('made up'), 0, 4096))).toThrow(
      /FILE_REFERENCE_INVALID/,
    )
  })

  it('works again once the origin has issued a new one', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 4096 })
    server.expire(FILE)

    const refreshed = server.refresh(FILE)

    expect(refreshed).not.toEqual(reference)
    expect(server.invoke(get(refreshed, 0, 4096))['bytes']).toEqual(contentOf(FILE, 0, 4096))
  })

  it('does not accept the old one after a refresh', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 4096 })
    server.refresh(FILE)

    expect(() => server.invoke(get(reference, 0, 4096))).toThrow(/FILE_REFERENCE_INVALID/)
  })

  it('remembers what issued it, so a refresh can be proved to go there', () => {
    const server = new FileServer()
    server.add(FILE, {
      size: 4096,
      origin: { kind: 'message', peerId: 77n, id: 12 },
    })

    // A client that could ask for a fresh reference directly would never have
    // to get the origin right, so the origin is what a case asserts on.
    expect(server.originOf(FILE)).toEqual({ kind: 'message', peerId: 77n, id: 12 })
  })
})

describe('a file served from somewhere Telegram does not operate', () => {
  const redirected = () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 256 * 1024 })
    server.faults = { viaCdn: true }
    const redirect = server.invoke(get(reference, 0, 4096, { _: 'x', cdn_supported: true }))

    return { server, reference, redirect }
  }

  it('hands back somewhere else to ask, with the means to read it', () => {
    const { redirect } = redirected()

    expect(redirect._).toBe('upload.fileCdnRedirect')
    expect((redirect['encryption_key'] as Uint8Array).length).toBe(32)
    expect((redirect['encryption_iv'] as Uint8Array).length).toBe(16)
    expect((redirect['file_hashes'] as unknown[]).length).toBeGreaterThan(0)
  })

  it('serves chunks that decrypt to the file', () => {
    const { server, redirect } = redirected()

    const chunk = server.invoke({
      _: 'upload.getCdnFile',
      file_token: redirect['file_token'],
      offset: 0n,
      limit: 4096,
    })

    const plain = encrypt(
      chunk['bytes'] as Uint8Array,
      redirect['encryption_key'] as Uint8Array,
      redirect['encryption_iv'] as Uint8Array,
      0,
    )
    expect(plain).toEqual(contentOf(FILE, 0, 4096))
  })

  it('continues the counter across ranges rather than restarting it', () => {
    const { server, redirect } = redirected()

    const chunk = server.invoke({
      _: 'upload.getCdnFile',
      file_token: redirect['file_token'],
      offset: 4096n,
      limit: 4096,
    })

    // A client that decrypted a later range as though it were the first would
    // produce plausible-looking rubbish, which is exactly what verification is
    // there to catch.
    const wrong = encrypt(
      chunk['bytes'] as Uint8Array,
      redirect['encryption_key'] as Uint8Array,
      redirect['encryption_iv'] as Uint8Array,
      0,
    )
    expect(wrong).not.toEqual(contentOf(FILE, 4096, 4096))

    const right = encrypt(
      chunk['bytes'] as Uint8Array,
      redirect['encryption_key'] as Uint8Array,
      redirect['encryption_iv'] as Uint8Array,
      4096,
    )
    expect(right).toEqual(contentOf(FILE, 4096, 4096))
  })

  it('publishes hashes over the file rather than over what it sent', () => {
    const { redirect } = redirected()
    const first = (redirect['file_hashes'] as TlValue[])[0] as TlValue

    // A hash over the encrypted bytes would prove only that the node repeated
    // what it was given.
    expect(first['hash']).toEqual(sha256(contentOf(FILE, 0, Number(first['limit'] as number))))
  })

  it('can be made to publish nothing to check against', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 4096 })
    server.faults = { viaCdn: true, withoutCdnHashes: true }

    const redirect = server.invoke(get(reference, 0, 4096, { _: 'x', cdn_supported: true }))

    expect(redirect['file_hashes']).toEqual([])
  })

  it('can be made to publish hashes that describe nothing', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 4096 })
    server.faults = { viaCdn: true, wrongCdnHashes: true }

    const redirect = server.invoke(get(reference, 0, 4096, { _: 'x', cdn_supported: true }))
    const first = (redirect['file_hashes'] as TlValue[])[0] as TlValue

    expect(first['hash']).not.toEqual(sha256(contentOf(FILE, 0, first['limit'] as number)))
  })

  it('can be made to serve chunks that do not match its own hashes', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 4096 })
    server.faults = { viaCdn: true }
    const redirect = server.invoke(get(reference, 0, 4096, { _: 'x', cdn_supported: true }))
    server.faults = { viaCdn: true, corruptCdn: true }

    const chunk = server.invoke({
      _: 'upload.getCdnFile',
      file_token: redirect['file_token'],
      offset: 0n,
      limit: 4096,
    })
    const plain = encrypt(
      chunk['bytes'] as Uint8Array,
      redirect['encryption_key'] as Uint8Array,
      redirect['encryption_iv'] as Uint8Array,
      0,
    )

    // The transport succeeded and the bytes are wrong. That is the whole reason
    // verification is not optional.
    expect(plain).not.toEqual(contentOf(FILE, 0, 4096))
  })

  it('can ask for the range to be sent to it first', () => {
    const server = new FileServer()
    const { reference } = server.add(FILE, { size: 4096 })
    server.faults = { viaCdn: true, cdnReuploadFirst: true }
    const redirect = server.invoke(get(reference, 0, 4096, { _: 'x', cdn_supported: true }))

    const first = server.invoke({
      _: 'upload.getCdnFile',
      file_token: redirect['file_token'],
      offset: 0n,
      limit: 4096,
    })
    const second = server.invoke({
      _: 'upload.getCdnFile',
      file_token: redirect['file_token'],
      offset: 0n,
      limit: 4096,
    })

    expect(first._).toBe('upload.cdnFileReuploadNeeded')
    expect(first['request_token']).toBeInstanceOf(Uint8Array)
    expect(second._).toBe('upload.cdnFile')
  })

  it('answers hashes for a range that was asked about later', () => {
    const { server, redirect } = redirected()

    const answer = server.invoke({
      _: 'upload.getCdnFileHashes',
      file_token: redirect['file_token'],
      offset: 131_072n,
    })

    const first = (answer['items'] as TlValue[])[0] as TlValue
    expect(first['offset']).toBe(131_072n)
    expect(first['hash']).toEqual(sha256(contentOf(FILE, 131_072, first['limit'] as number)))
  })

  it('refuses a token it never issued', () => {
    const server = new FileServer()

    expect(() =>
      server.invoke({
        _: 'upload.getCdnFile',
        file_token: new TextEncoder().encode('made up'),
        offset: 0n,
        limit: 4096,
      }),
    ).toThrow(TelegramError)
  })
})
