/**
 * Sending a file, judged by what the datacenter ended up holding.
 *
 * Every case here drives the package's own file datacenter, which keeps the
 * parts it was sent under the numbers they were sent under and refuses to
 * assemble a file with a hole in it. So an upload is not judged by how many
 * calls were made but by whether the bytes on the other side are the bytes that
 * went in — which is the only thing that distinguishes a correct scheduler from
 * one that happens to look busy.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { md5 } from '../src/crypto/hash.js'
import { type UploadSource, upload } from '../src/files/upload.js'
import { MigrationError } from '../src/session/dispatcher.js'
import type { TlValue } from '../src/tl/index.js'
import { FileServer } from './server/files.js'

const FILE = 0x0abc_def0_1234_5678n
const PART = 1024

/** Bytes a case can recognise, and the server can be compared against. */
function content(length: number, seed = 3): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 7 + seed) & 0xff)
}

/** A source that knows its length and can be read anywhere. */
function known(bytes: Uint8Array): UploadSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.slice(offset, offset + length),
  }
}

/** A source that only discovers its end by reaching it. */
function unknown(bytes: Uint8Array): UploadSource {
  return { read: async (offset, length) => bytes.slice(offset, offset + length) }
}

/** One datacenter, and a way to reach it. */
function one(dcId = 2) {
  const server = new FileServer(dcId)

  return { server, reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }) }
}

/** Two datacenters, so a redirection has somewhere to go. */
function two() {
  const home = new FileServer(2)
  const media = new FileServer(4)
  const servers = new Map([
    [2, home],
    [4, media],
  ])

  return {
    home,
    media,
    reach: (dcId: number) => ({
      invoke: async (query: TlValue) => {
        const server = servers.get(dcId)
        if (server === undefined) throw new Error(`no datacenter ${dcId}`)

        return server.invoke(query)
      },
    }),
  }
}

/** A source of a stated length that never holds the whole file. */
function synthetic(size: number): UploadSource {
  return {
    size,
    read: async (offset, length) =>
      Uint8Array.from(
        { length: Math.max(0, Math.min(length, size - offset)) },
        (_, index) => (offset + index) & 0xff,
      ),
  }
}

/** Every method the datacenter was asked, in order. */
const methods = (server: FileServer) => server.asked.map((query) => query._)

describe('a file small enough to go the ordinary way', () => {
  it('arrives byte for byte', async () => {
    const bytes = content(PART * 3 + 100)
    const { server, reach } = one()

    await upload({ source: known(bytes), reach, dcId: 2, partSize: PART, fileId: FILE })

    expect(server.assembled(FILE)).toEqual(bytes)
  })

  it('goes by the method meant for a small file', async () => {
    const { server, reach } = one()

    await upload({ source: known(content(PART)), reach, dcId: 2, partSize: PART, fileId: FILE })

    expect(methods(server)).toEqual(['upload.saveFilePart'])
  })

  it('names a file the datacenter can assemble', async () => {
    const bytes = content(PART * 2)
    const { reach } = one()

    const sent = await upload({
      source: known(bytes),
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
      name: 'photo.jpg',
    })

    expect(sent.file).toMatchObject({ _: 'inputFile', id: FILE, parts: 2, name: 'photo.jpg' })
  })

  it('carries a checksum over the file it actually sent', async () => {
    const bytes = content(PART * 2 + 7)
    const { reach } = one()

    const sent = await upload({
      source: known(bytes),
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    // The datacenter checks what it was told against what arrived, so a
    // checksum over anything but the file is worse than none.
    expect(sent.file._ === 'inputFile' ? sent.file.md5_checksum : undefined).toBe(
      [...md5(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    )
  })

  it('sends one part for a file with nothing in it', async () => {
    const { server, reach } = one()

    const sent = await upload({
      source: known(new Uint8Array(0)),
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    expect(sent.parts).toBe(1)
    expect(server.assembled(FILE)).toEqual(new Uint8Array(0))
  })

  it('sends a file that fits in one part as one part', async () => {
    const bytes = content(PART)
    const { server, reach } = one()

    const sent = await upload({
      source: known(bytes),
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    expect(sent.parts).toBe(1)
    expect(server.asked).toHaveLength(1)
    expect(server.assembled(FILE)).toEqual(bytes)
  })

  it('cuts the last part to what is left rather than padding it', async () => {
    const bytes = content(PART + 5)
    const { server, reach } = one()

    await upload({ source: known(bytes), reach, dcId: 2, partSize: PART, fileId: FILE })

    expect(server.assembled(FILE)?.length).toBe(PART + 5)
  })
})

describe('a file large enough to go the other way', () => {
  const big = () => content(11 * 1024 * 1024)

  it('goes by the method meant for a large file', async () => {
    const { server, reach } = one()

    await upload({
      source: known(big()),
      reach,
      dcId: 2,
      partSize: 512 * 1024,
      fileId: FILE,
    })

    expect(new Set(methods(server))).toEqual(new Set(['upload.saveBigFilePart']))
  })

  it('tells the datacenter how many parts there are', async () => {
    const { server, reach } = one()

    await upload({
      source: known(big()),
      reach,
      dcId: 2,
      partSize: 512 * 1024,
      fileId: FILE,
    })

    const totals = new Set(server.asked.map((query) => query['file_total_parts']))
    expect(totals).toEqual(new Set([22]))
    expect(server.assembled(FILE)?.length).toBe(11 * 1024 * 1024)
  })

  it('names it without a checksum, because that reference carries none', async () => {
    const { reach } = one()

    const sent = await upload({
      source: known(big()),
      reach,
      dcId: 2,
      partSize: 512 * 1024,
      fileId: FILE,
    })

    expect(sent.file._).toBe('inputFileBig')
    // The big path cannot carry one: the whole file is never in one place to
    // be hashed, and a reference with a field for it would invite a caller to
    // believe the datacenter checked something.
    expect('md5_checksum' in sent.file).toBe(false)
  })
})

describe('the line between the two ways of sending', () => {
  const THRESHOLD = 10 * 1024 * 1024
  const PARTS = 512 * 1024

  /** Which method a file of this length goes by. */
  const methodFor = async (size: number) => {
    const { server, reach } = one()
    await upload({ source: synthetic(size), reach, dcId: 2, partSize: PARTS, fileId: FILE })

    return new Set(methods(server))
  }

  it('sends a file one byte below the threshold the ordinary way', async () => {
    expect(await methodFor(THRESHOLD - 1)).toEqual(new Set(['upload.saveFilePart']))
  })

  it('sends a file exactly at the threshold the other way', async () => {
    // The threshold is the protocol's, so the boundary itself is the case.
    expect(await methodFor(THRESHOLD)).toEqual(new Set(['upload.saveBigFilePart']))
  })

  it('sends a file one byte above the threshold the other way', async () => {
    expect(await methodFor(THRESHOLD + 1)).toEqual(new Set(['upload.saveBigFilePart']))
  })
})

describe('a file whose length is only known once it ends', () => {
  it('goes by the large-file method whatever its length turns out to be', async () => {
    const { server, reach } = one()

    await upload({ source: unknown(content(100)), reach, dcId: 2, partSize: PART, fileId: FILE })

    expect(new Set(methods(server))).toEqual(new Set(['upload.saveBigFilePart']))
  })

  it('says the total is not known until the part that settles it', async () => {
    const { server, reach } = one()

    await upload({
      source: unknown(content(PART * 2 + 10)),
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    // Every part but the last says the total is unknown; the last one is what
    // tells the datacenter the file is whole.
    expect(server.asked.map((query) => query['file_total_parts'])).toEqual([-1, -1, 3])
  })

  it('states the real total when the file ends exactly on a part boundary', async () => {
    const bytes = content(PART * 2)
    const { server, reach } = one()

    // The case that is easy to get wrong: nothing short is ever read, so a
    // client that waits for a short read never states the total at all.
    await upload({ source: unknown(bytes), reach, dcId: 2, partSize: PART, fileId: FILE })

    expect(server.asked.map((query) => query['file_total_parts'])).toEqual([-1, 2])
    expect(server.assembled(FILE)).toEqual(bytes)
  })

  it('arrives byte for byte', async () => {
    const bytes = content(PART * 3 + 511)
    const { server, reach } = one()

    await upload({ source: unknown(bytes), reach, dcId: 2, partSize: PART, fileId: FILE })

    expect(server.assembled(FILE)).toEqual(bytes)
  })

  it('sends one part for a source that was empty all along', async () => {
    const { server, reach } = one()

    const sent = await upload({
      source: unknown(new Uint8Array(0)),
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    expect(sent.parts).toBe(1)
    expect(server.assembled(FILE)).toEqual(new Uint8Array(0))
  })

  it('stops reading once a part comes back short', async () => {
    const reads: number[] = []
    const bytes = content(PART + 100)
    const { reach } = one()

    await upload({
      source: {
        read: async (offset, length) => {
          reads.push(offset)
          return bytes.slice(offset, offset + length)
        },
      },
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    // A short part is the end of the file. Reading past it asks a stream for
    // something it has already said is not there.
    expect(reads).toEqual([0, PART])
  })

  it('reads once past the end when the file stops on a part boundary', async () => {
    const reads: number[] = []
    const bytes = content(PART * 2)
    const { reach } = one()

    await upload({
      source: {
        read: async (offset, length) => {
          reads.push(offset)
          return bytes.slice(offset, offset + length)
        },
      },
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    // Nothing short is ever read, so the only way to discover the end is to ask
    // once more and be given nothing.
    expect(reads).toEqual([0, PART, PART * 2])
  })

  it('reads in order, because it cannot ask for what it has not reached', async () => {
    const offsets: number[] = []
    const bytes = content(PART * 3)
    const { reach } = one()

    await upload({
      source: {
        read: async (offset, length) => {
          offsets.push(offset)
          return bytes.slice(offset, offset + length)
        },
      },
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
  })
})

describe('sending several parts at once', () => {
  it('sends each part exactly once', async () => {
    const bytes = content(PART * 8)
    const { server, reach } = one()

    await upload({
      source: known(bytes),
      reach,
      dcId: 2,
      partSize: PART,
      fileId: FILE,
      concurrency: 4,
    })

    const numbers = server.asked.map((query) => query['file_part'])
    expect([...numbers].sort((a, b) => (a as number) - (b as number))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
    expect(server.assembled(FILE)).toEqual(bytes)
  })

  it('never has more in flight than it was allowed', async () => {
    let running = 0
    let peak = 0
    const bytes = content(PART * 12)
    const server = new FileServer(2)

    await upload({
      source: known(bytes),
      reach: () => ({
        invoke: async (query: TlValue) => {
          running += 1
          peak = Math.max(peak, running)
          await new Promise((resolve) => setTimeout(resolve, 0))
          running -= 1

          return server.invoke(query)
        },
      }),
      dcId: 2,
      partSize: PART,
      fileId: FILE,
      concurrency: 3,
    })

    expect(peak).toBeLessThanOrEqual(3)
    expect(server.assembled(FILE)).toEqual(bytes)
  })

  it('does not finish before every part has been accounted for', async () => {
    const bytes = content(PART * 6)
    const server = new FileServer(2)
    let answered = 0

    await upload({
      source: known(bytes),
      reach: () => ({
        invoke: async (query: TlValue) => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          answered += 1

          return server.invoke(query)
        },
      }),
      dcId: 2,
      partSize: PART,
      fileId: FILE,
      concurrency: 4,
    })

    expect(answered).toBe(6)
    expect(server.assembled(FILE)).toEqual(bytes)
  })

  it('fails the upload when any one part fails, however many succeeded', async () => {
    const server = new FileServer(2)

    await expect(
      upload({
        source: known(content(PART * 6)),
        reach: () => ({
          invoke: async (query: TlValue) => {
            if (query['file_part'] === 4) throw new ValidationError('this part is refused')

            return server.invoke(query)
          },
        }),
        dcId: 2,
        partSize: PART,
        fileId: FILE,
        concurrency: 3,
      }),
    ).rejects.toThrow(/this part is refused/)

    // No file object escaped, and the datacenter has a hole where part four is.
    expect(server.assembled(FILE)).toBeUndefined()
  })
})

describe('a part that did not get through', () => {
  it('is sent again, under the same number', async () => {
    const server = new FileServer(2)
    let failures = 0

    await upload({
      source: known(content(PART * 2)),
      reach: () => ({
        invoke: async (query: TlValue) => {
          if (query['file_part'] === 1 && failures === 0) {
            failures += 1
            throw new NetworkError('the connection dropped')
          }

          return server.invoke(query)
        },
      }),
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    // Sending a part twice under the same number leaves the same file, which is
    // what makes repeating one safe and repeating an upload not.
    expect(server.received(FILE)).toBe(2)
    expect(server.assembled(FILE)?.length).toBe(PART * 2)
  })

  it('retries only the part that failed', async () => {
    const server = new FileServer(2)
    const attempts: number[] = []
    let failed = false

    await upload({
      source: known(content(PART * 3)),
      reach: () => ({
        invoke: async (query: TlValue) => {
          attempts.push(query['file_part'] as number)
          if (query['file_part'] === 2 && !failed) {
            failed = true
            throw new NetworkError('dropped')
          }

          return server.invoke(query)
        },
      }),
      dcId: 2,
      partSize: PART,
      fileId: FILE,
      concurrency: 1,
    })

    expect(attempts).toEqual([0, 1, 2, 2])
  })

  it('gives up once it has tried as often as it was allowed', async () => {
    let tries = 0

    await expect(
      upload({
        source: known(content(PART)),
        reach: () => ({
          invoke: async () => {
            tries += 1
            throw new NetworkError('always dropped')
          },
        }),
        dcId: 2,
        partSize: PART,
        fileId: FILE,
        attempts: 2,
      }),
    ).rejects.toThrow(/always dropped/)

    expect(tries).toBe(2)
  })
})

describe('stopping an upload', () => {
  it('sends nothing and reads nothing when it was already stopped', async () => {
    const { server, reach } = one()
    const stopping = new AbortController()
    stopping.abort()
    const reads: number[] = []

    await expect(
      upload({
        source: {
          size: PART,
          read: async (offset, length) => {
            reads.push(offset)
            return content(length)
          },
        },
        reach,
        dcId: 2,
        partSize: PART,
        fileId: FILE,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    // The source may be a stream, and touching one has a cost. An upload that
    // was stopped before it began does not touch it at all.
    expect(server.asked).toEqual([])
    expect(reads).toEqual([])
  })

  it('does not retry a call that was withdrawn', async () => {
    let calls = 0

    await expect(
      upload({
        source: known(content(PART)),
        reach: () => ({
          invoke: async () => {
            calls += 1
            // Withdrawn for a reason of its own, with nothing said about this
            // upload's signal.
            throw new CancelledError('the connection was closed')
          },
        }),
        dcId: 2,
        partSize: PART,
        fileId: FILE,
        attempts: 5,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    // A withdrawn call is not a failed one. Repeating it would be asking again
    // for something that was deliberately abandoned.
    expect(calls).toBe(1)
  })

  it('schedules nothing further once it has been stopped', async () => {
    const server = new FileServer(2)
    const stopping = new AbortController()

    await expect(
      upload({
        source: known(content(PART * 8)),
        reach: () => ({
          invoke: async (query: TlValue) => {
            if (query['file_part'] === 1) stopping.abort()

            return server.invoke(query)
          },
        }),
        dcId: 2,
        partSize: PART,
        fileId: FILE,
        concurrency: 1,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    // What was already sent stays sent; nothing new is started. A small upload
    // never states a total, so the datacenter cannot tell on its own that the
    // file is unfinished — what proves it is that the bytes stop short.
    expect(server.received(FILE)).toBeLessThan(8)
    expect(server.assembled(FILE)?.length).toBeLessThan(PART * 8)
  })

  it('stops a part that was about to be retried', async () => {
    const stopping = new AbortController()

    await expect(
      upload({
        source: known(content(PART)),
        reach: () => ({
          invoke: async () => {
            stopping.abort()
            throw new NetworkError('dropped')
          },
        }),
        dcId: 2,
        partSize: PART,
        fileId: FILE,
        attempts: 5,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)
  })
})

describe('a datacenter that says the file belongs elsewhere', () => {
  it('sends the parts where it was told to', async () => {
    const { home, media, reach } = two()
    let redirected = false

    await upload({
      source: known(content(PART * 2)),
      reach: (dcId) => ({
        invoke: async (query: TlValue) => {
          if (dcId === 2 && !redirected) {
            redirected = true
            throw new MigrationError('FILE_MIGRATE_4 (303)', { kind: 'file', dcId: 4 })
          }

          return reach(dcId).invoke(query)
        },
      }),
      dcId: 2,
      partSize: PART,
      fileId: FILE,
      concurrency: 1,
    })

    // Parts accepted before the redirection stayed where they were sent, so the
    // file is only whole at the datacenter that claimed it.
    expect(media.assembled(FILE)?.length).toBe(PART * 2)
    expect(home.assembled(FILE)).toBeUndefined()
  })

  it('reports which datacenter the file ended up on', async () => {
    const { reach } = two()
    let redirected = false

    const sent = await upload({
      source: known(content(PART)),
      reach: (dcId) => ({
        invoke: async (query: TlValue) => {
          if (dcId === 2 && !redirected) {
            redirected = true
            throw new MigrationError('FILE_MIGRATE_4 (303)', { kind: 'file', dcId: 4 })
          }

          return reach(dcId).invoke(query)
        },
      }),
      dcId: 2,
      partSize: PART,
      fileId: FILE,
    })

    expect(sent.dcId).toBe(4)
  })

  it('does not spend an attempt on being redirected', async () => {
    const { reach } = two()
    let redirected = false

    // A redirection is not a failed part: the part was sent to the wrong place
    // and has not been tried yet.
    await expect(
      upload({
        source: known(content(PART)),
        reach: (dcId) => ({
          invoke: async (query: TlValue) => {
            if (dcId === 2 && !redirected) {
              redirected = true
              throw new MigrationError('FILE_MIGRATE_4 (303)', { kind: 'file', dcId: 4 })
            }

            return reach(dcId).invoke(query)
          },
        }),
        dcId: 2,
        partSize: PART,
        fileId: FILE,
        attempts: 1,
      }),
    ).resolves.toMatchObject({ dcId: 4 })
  })

  it('gives up on datacenters that redirect to each other', async () => {
    let sent = 0

    await expect(
      upload({
        source: known(content(PART)),
        reach: (dcId) => ({
          invoke: async () => {
            sent += 1
            // The case counts for itself rather than trusting the upload to
            // stop: an upload that never gave up would otherwise run for ever
            // instead of failing, and a case that hangs reports nothing.
            if (sent > 20) throw new ValidationError('the upload never gave up')

            throw new MigrationError('FILE_MIGRATE (303)', {
              kind: 'file',
              dcId: dcId === 2 ? 4 : 2,
            })
          },
        }),
        dcId: 2,
        partSize: PART,
        fileId: FILE,
      }),
    ).rejects.toThrow(/redirected more than/)

    expect(sent).toBeLessThanOrEqual(20)
  })
})

describe('a source that does not give what it promised', () => {
  it('is refused rather than sent as a short part', async () => {
    const { server, reach } = one()

    await expect(
      upload({
        source: { size: PART * 2, read: async () => content(10) },
        reach,
        dcId: 2,
        partSize: PART,
        fileId: FILE,
      }),
    ).rejects.toThrow(/which needs/)

    expect(server.assembled(FILE)).toBeUndefined()
  })
})
