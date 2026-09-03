/**
 * Keeping a file addressable for longer than its reference lasts.
 *
 * A file reference expires on the server's schedule and says nothing when it
 * does: a location stored yesterday is refused today for a reason that has
 * nothing to do with the file. The only way back is the origin — whatever the
 * file arrived in — refetched, which is why the origin is recorded rather than
 * a replacement being asked for.
 *
 * The failures worth having cases for are the quiet ones. A refresh that never
 * happens looks like a broken file. A refresh per failed range looks like a
 * working client until a large file expires mid-transfer and goes back to the
 * origin once per range at the same instant. A retry that is not bounded turns
 * one expired reference into a loop.
 */

import { CancelledError, TelegramError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { download } from '../src/files/download.js'
import { FileReferences, isStaleReference } from '../src/files/references.js'
import type { TlValue } from '../src/tl/index.js'
import { contentOf, FileServer } from './server/files.js'

const FILE = 0x1234_5678n
const KB = 1024
const MB = 1024 * 1024

function locate(reference: Uint8Array): TlValue {
  return {
    _: 'inputDocumentFileLocation',
    id: FILE,
    access_hash: 5n,
    file_reference: reference,
    thumb_size: '',
  }
}

function expectSameBytes(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length)
  expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected))).toBe(0)
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('recognising a refusal about the reference', () => {
  it('knows the two names for it', () => {
    expect(isStaleReference(new TelegramError('FILE_REFERENCE_EXPIRED (400)'))).toBe(true)
    expect(isStaleReference(new TelegramError('FILE_REFERENCE_INVALID (400)'))).toBe(true)
  })

  it('does not mistake another refusal for it', () => {
    // Every one of these is about the file rather than about the token naming
    // it, and refetching an origin would answer none of them.
    expect(isStaleReference(new TelegramError('FILE_ID_INVALID (400)'))).toBe(false)
    expect(isStaleReference(new TelegramError('LIMIT_INVALID (400)'))).toBe(false)
    expect(isStaleReference(new TelegramError('FLOOD_WAIT_30 (420)'))).toBe(false)
    expect(isStaleReference(new CancelledError('stopped'))).toBe(false)
    expect(isStaleReference('FILE_REFERENCE_EXPIRED')).toBe(false)
  })
})

describe('what is known about a reference', () => {
  it('gives back what was recorded, reference and origin together', () => {
    const origin = { kind: 'message', peerId: 7n, id: 42 }
    const references = new FileReferences(async () => new TextEncoder().encode('later'))
    references.remember(FILE, new TextEncoder().encode('now'), origin)

    expect(text(references.reference(FILE) as Uint8Array)).toBe('now')
    expect(references.origin(FILE)).toBe(origin)
  })

  it('puts the current reference into a location, leaving the rest alone', () => {
    const references = new FileReferences(async () => new Uint8Array(0))
    references.remember(FILE, new TextEncoder().encode('fresh'), { kind: 'message' })

    const managed = references.manage(FILE, locate(new TextEncoder().encode('stale')))
    const current = managed.current()

    expect(text(current['file_reference'] as Uint8Array)).toBe('fresh')
    expect(current['id']).toBe(FILE)
    expect(current['access_hash']).toBe(5n)
    expect(current._).toBe('inputDocumentFileLocation')
  })

  it('takes the reference the location carried when nothing was recorded', () => {
    const references = new FileReferences(async () => new Uint8Array(0))
    const managed = references.manage(FILE, locate(new TextEncoder().encode('carried')))

    expect(text(managed.current()['file_reference'] as Uint8Array)).toBe('carried')
  })

  it('refuses to refresh a file it knows no origin for', async () => {
    // Refetching needs somewhere to go back to. Making one up produces a
    // request that is well formed and asks about the wrong thing.
    const references = new FileReferences(async () => new Uint8Array(0))

    await expect(references.refresh(FILE)).rejects.toBeInstanceOf(ValidationError)
  })

  it('forgets a file completely', () => {
    const references = new FileReferences(async () => new Uint8Array(0))
    references.remember(FILE, new Uint8Array(1), { kind: 'message' })
    references.forget(FILE)

    expect(references.reference(FILE)).toBeUndefined()
    expect(references.origin(FILE)).toBeUndefined()
  })
})

describe('going back to the origin', () => {
  it('asks whatever issued the reference, and keeps what it says', async () => {
    const origin = { kind: 'story', peerId: 9n, id: 3 }
    const seen: unknown[] = []
    const references = new FileReferences(async (asked) => {
      seen.push(asked)

      return new TextEncoder().encode('reissued')
    })
    references.remember(FILE, new TextEncoder().encode('old'), origin)

    expect(text(await references.refresh(FILE))).toBe('reissued')
    expect(seen).toEqual([origin])
    expect(text(references.reference(FILE) as Uint8Array)).toBe('reissued')
  })

  it('goes back once however many callers are asking', async () => {
    // Every range of a file fails at the same moment when its reference
    // expires. One refetch answers all of them; one refetch each is a storm
    // aimed at the origin.
    let refetches = 0
    let release: ((value: Uint8Array) => void) | undefined
    const references = new FileReferences(async () => {
      refetches += 1

      return new Promise<Uint8Array>((resolve) => (release = resolve))
    })
    references.remember(FILE, new TextEncoder().encode('old'), { kind: 'message' })

    const waiting = [references.refresh(FILE), references.refresh(FILE), references.refresh(FILE)]
    release?.(new TextEncoder().encode('one'))

    expect((await Promise.all(waiting)).map(text)).toEqual(['one', 'one', 'one'])
    expect(refetches).toBe(1)
  })

  it('hands a caller that lost a race the newer reference rather than refetching', async () => {
    let refetches = 0
    const references = new FileReferences(async () => {
      refetches += 1

      return new TextEncoder().encode('newer')
    })
    references.remember(FILE, new TextEncoder().encode('older'), { kind: 'message' })

    await references.refresh(FILE, new TextEncoder().encode('older'))
    // A second caller still holding the reference that was already replaced.
    const answer = await references.refresh(FILE, new TextEncoder().encode('older'))

    expect(text(answer)).toBe('newer')
    expect(refetches).toBe(1)
  })

  it('never replaces a newer reference with an older one', async () => {
    const references = new FileReferences(async () => new TextEncoder().encode('newest'))
    references.remember(FILE, new TextEncoder().encode('first'), { kind: 'message' })

    await references.refresh(FILE, new TextEncoder().encode('first'))
    await references.refresh(FILE, new TextEncoder().encode('first'))

    expect(text(references.reference(FILE) as Uint8Array)).toBe('newest')
  })

  it('lets the next caller try again after a refetch failed', async () => {
    // A failed refetch must not become the answer everyone else is given.
    let attempts = 0
    const references = new FileReferences(async () => {
      attempts += 1
      if (attempts === 1) throw new TelegramError('MESSAGE_ID_INVALID (400)')

      return new TextEncoder().encode('second')
    })
    references.remember(FILE, new TextEncoder().encode('old'), { kind: 'message' })

    await expect(references.refresh(FILE)).rejects.toBeInstanceOf(TelegramError)

    expect(text(await references.refresh(FILE))).toBe('second')
  })

  it('reports a refetch that failed rather than carrying on with the old one', async () => {
    const references = new FileReferences(async () => {
      throw new TelegramError('MESSAGE_ID_INVALID (400)')
    })
    references.remember(FILE, new TextEncoder().encode('old'), { kind: 'message' })

    await expect(references.refresh(FILE)).rejects.toThrow(/MESSAGE_ID_INVALID/)
  })
})

describe('downloading a file whose reference has expired', () => {
  it('refreshes and finishes without the caller knowing', async () => {
    const size = 64 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const references = new FileReferences(async () => server.refresh(FILE))
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)

    const bytes = await download({
      location: locate(reference),
      references: references.manage(FILE, locate(reference)),
      reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
      dcId: 2,
      size,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('goes back to the origin the file was recorded with', async () => {
    const size = 8 * KB
    const server = new FileServer(2)
    const origin = { kind: 'message' as const, peerId: 77n, id: 5 }
    const { reference } = server.add(FILE, { size, origin })
    const asked: unknown[] = []
    const references = new FileReferences(async (which) => {
      asked.push(which)

      return server.refresh(FILE)
    })
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)

    await download({
      location: locate(reference),
      references: references.manage(FILE, locate(reference)),
      reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
      dcId: 2,
      size,
    })

    expect(asked).toEqual([origin])
  })

  it('sends the refreshed reference, not the one that was refused', async () => {
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const references = new FileReferences(async () => server.refresh(FILE))
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)

    await download({
      location: locate(reference),
      references: references.manage(FILE, locate(reference)),
      reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
      dcId: 2,
      size,
    })

    const sent = server.asked
      .filter((query) => query._ === 'upload.getFile')
      .map((query) => text((query['location'] as TlValue)['file_reference'] as Uint8Array))

    expect(sent[0]).toBe(`ref-${FILE}-1`)
    expect(sent.at(-1)).toBe(`ref-${FILE}-2`)
  })

  it('tries again exactly once', async () => {
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    let refetches = 0
    const references = new FileReferences(async () => {
      refetches += 1

      // An origin that keeps handing back a reference the datacenter refuses.
      return new TextEncoder().encode('never-accepted')
    })
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)

    await expect(
      download({
        location: locate(reference),
        references: references.manage(FILE, locate(reference)),
        reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
        dcId: 2,
        size,
        attempts: 3,
      }),
    ).rejects.toThrow(/FILE_REFERENCE/)

    // One refusal, one refetch, one retry, then the failure stands. Three
    // attempts were allowed and the refresh did not multiply them.
    expect(refetches).toBe(1)
  })

  it('refreshes even when the range has only one attempt', async () => {
    // A refused reference is not a failed attempt at the file — the file was
    // never looked for. A caller that allows one attempt still gets its
    // reference refreshed and its range fetched.
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const references = new FileReferences(async () => server.refresh(FILE))
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)

    const bytes = await download({
      location: locate(reference),
      references: references.manage(FILE, locate(reference)),
      reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
      dcId: 2,
      size,
      attempts: 1,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('does not loop when the origin keeps issuing refused references', async () => {
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    let asked = 0
    const references = new FileReferences(async () => new TextEncoder().encode('no-good'))
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)

    await expect(
      download({
        location: locate(reference),
        references: references.manage(FILE, locate(reference)),
        reach: () => ({
          invoke: async (query: TlValue) => {
            asked += 1
            // The case bounds itself rather than trusting the download to stop.
            if (asked > 20) throw new ValidationError('the download never stopped')

            return server.invoke(query)
          },
        }),
        dcId: 2,
        size,
      }),
    ).rejects.toThrow(/FILE_REFERENCE/)

    expect(asked).toBeLessThan(20)
  })

  it('goes back to the origin once when every range fails together', async () => {
    const size = 4 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    let refetches = 0
    const references = new FileReferences(async () => {
      refetches += 1

      return server.refresh(FILE)
    })
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)

    // Four ranges in flight, all refused at once for the same reason.
    const bytes = await download({
      location: locate(reference),
      references: references.manage(FILE, locate(reference)),
      reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
      dcId: 2,
      size,
      concurrency: 4,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
    expect(refetches).toBe(1)
  })

  it('reports a refresh that failed', async () => {
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const references = new FileReferences(async () => {
      throw new TelegramError('MESSAGE_ID_INVALID (400)')
    })
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)

    await expect(
      download({
        location: locate(reference),
        references: references.manage(FILE, locate(reference)),
        reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
        dcId: 2,
        size,
      }),
    ).rejects.toThrow(/MESSAGE_ID_INVALID/)
  })

  it('leaves a refusal alone when the caller manages no references', async () => {
    // Without somewhere to go back to, an expired reference is simply a
    // failure — which is what a caller that never stored the location wants.
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    server.expire(FILE)

    await expect(
      download({
        location: locate(reference),
        reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
        dcId: 2,
        size,
        attempts: 1,
      }),
    ).rejects.toThrow(/FILE_REFERENCE/)
  })

  it('does not refresh for a refusal that is about something else', async () => {
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    let refetches = 0
    const references = new FileReferences(async () => {
      refetches += 1

      return server.refresh(FILE)
    })
    references.remember(FILE, reference, server.originOf(FILE))

    await expect(
      download({
        location: locate(reference),
        references: references.manage(FILE, locate(reference)),
        reach: () => ({
          invoke: async () => {
            throw new TelegramError('LIMIT_INVALID (400)')
          },
        }),
        dcId: 2,
        size,
        attempts: 1,
      }),
    ).rejects.toThrow(/LIMIT_INVALID/)

    expect(refetches).toBe(0)
  })

  it('is stopped rather than refreshed once it has been withdrawn', async () => {
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const stopping = new AbortController()
    let refetches = 0
    const references = new FileReferences(async () => {
      refetches += 1

      return server.refresh(FILE)
    })
    references.remember(FILE, reference, server.originOf(FILE))
    server.expire(FILE)
    stopping.abort()

    await expect(
      download({
        location: locate(reference),
        references: references.manage(FILE, locate(reference)),
        reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
        dcId: 2,
        size,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    expect(refetches).toBe(0)
  })
})
