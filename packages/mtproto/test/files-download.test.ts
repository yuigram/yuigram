/**
 * Fetching a file, judged against the bytes the datacenter actually holds.
 *
 * The package's own file datacenter generates its content from an identifier
 * and an offset, so every case can compare what arrived with what should have
 * arrived, byte for byte. That is the only thing that separates a correct range
 * plan from one that merely returns something of the right length.
 *
 * The interesting failures are quiet ones: a range that starts a kilobyte off,
 * a boundary crossed, ranges delivered out of order, an early answer read as
 * the end. Each has a case here.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { download, downloadIterable, downloadTo } from '../src/files/download.js'
import { isUsableRange } from '../src/files/geometry.js'
import { MigrationError } from '../src/session/dispatcher.js'
import type { TlValue } from '../src/tl/index.js'
import { contentOf, FileServer } from './server/files.js'

const FILE = 0x1234_5678n
const KB = 1024
const MB = 1024 * 1024

/** A location naming the file with the reference it is served with. */
function locate(reference: Uint8Array): TlValue {
  return {
    _: 'inputDocumentFileLocation',
    id: FILE,
    access_hash: 5n,
    file_reference: reference,
    thumb_size: '',
  }
}

/** One datacenter holding a file of the given length. */
function holding(size: number, dcId = 2) {
  const server = new FileServer(dcId)
  const { reference } = server.add(FILE, { size, dcId })

  return {
    server,
    location: locate(reference),
    reach: () => ({ invoke: async (query: TlValue) => server.invoke(query) }),
  }
}

/** Two datacenters, so a redirection has somewhere to go. */
function split(size: number) {
  const home = new FileServer(2)
  const media = new FileServer(4)
  home.add(FILE, { size, dcId: 4 })
  const { reference } = media.add(FILE, { size, dcId: 4 })
  const servers = new Map([
    [2, home],
    [4, media],
  ])

  return {
    home,
    media,
    location: locate(reference),
    reach: (dcId: number) => ({
      invoke: async (query: TlValue) => {
        const server = servers.get(dcId)
        if (server === undefined) throw new Error(`no datacenter ${dcId}`)

        return server.invoke(query)
      },
    }),
  }
}

/**
 * Compare two runs of bytes.
 *
 * Element-wise deep equality over megabytes is far slower than the download it
 * is checking, so the comparison is done the way the platform does it.
 */
function expectSameBytes(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length)
  expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected))).toBe(0)
}

/**
 * The same answer with its bytes cut short.
 *
 * Which is all a datacenter does to say a file stops before the length it was
 * said to have — the answer is well formed, there is simply less of it.
 */
const cutShort = (answer: TlValue, length: number): TlValue => ({
  ...answer,
  bytes: (answer['bytes'] as Uint8Array).subarray(0, length),
})

/** Every range the datacenter was asked for. */
const ranges = (server: FileServer) =>
  server.asked.map((query) => ({
    offset: Number(query['offset'] as bigint),
    limit: query['limit'] as number,
  }))

describe('fetching a whole file', () => {
  it('gives back exactly what the datacenter holds', async () => {
    const size = 3 * MB + 7 * KB
    const { location, reach } = holding(size)

    const bytes = await download({ location, reach, dcId: 2, size })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('fetches a file that fits in one range in one request', async () => {
    const { server, location, reach } = holding(4 * KB)

    const bytes = await download({ location, reach, dcId: 2, size: 4 * KB })

    expect(server.asked).toHaveLength(1)
    expect(bytes).toEqual(contentOf(FILE, 0, 4 * KB))
  })

  it('asks for nothing at all for a file with nothing in it', async () => {
    const { server, location, reach } = holding(0)

    const bytes = await download({ location, reach, dcId: 2, size: 0 })

    expect(server.asked).toEqual([])
    expect(bytes).toEqual(new Uint8Array(0))
  })

  it('never asks for a range that crosses a megabyte', async () => {
    const { server, location, reach } = holding(3 * MB)

    await download({ location, reach, dcId: 2, size: 3 * MB })

    for (const range of ranges(server)) {
      expect(Math.floor(range.offset / MB), `${range.offset}+${range.limit}`).toBe(
        Math.floor((range.offset + range.limit - 1) / MB),
      )
    }
  })

  it('fetches a file that ends exactly on a megabyte', async () => {
    const { location, reach } = holding(2 * MB)

    expectSameBytes(
      await download({ location, reach, dcId: 2, size: 2 * MB }),
      contentOf(FILE, 0, 2 * MB),
    )
  })

  it('fetches a file ending just after a megabyte', async () => {
    const size = MB + 4 * KB
    const { location, reach } = holding(size)

    expectSameBytes(await download({ location, reach, dcId: 2, size }), contentOf(FILE, 0, size))
  })

  it('cuts the final range back to the end of the file', async () => {
    const size = 8 * KB + 100
    const { location, reach } = holding(size)

    const bytes = await download({ location, reach, dcId: 2, size })

    // The last request sits on the grid and reaches past the end; what comes
    // back is what the file has.
    expect(bytes.length).toBe(size)
    expect(bytes).toEqual(contentOf(FILE, 0, size))
  })
})

describe('fetching from far into a file', () => {
  it('asks at an offset beyond what a thirty-two-bit number holds', async () => {
    const start = 5 * 1024 * 1024 * 1024
    const { server, location, reach } = holding(start + 8 * KB)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size: start + 8 * KB,
      offset: start,
      length: 8 * KB,
    })

    expect(ranges(server)[0]?.offset).toBe(start)
    expect(bytes).toEqual(contentOf(FILE, start, 8 * KB))
  })

  it('starts where it was told to', async () => {
    const { location, reach } = holding(64 * KB)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size: 64 * KB,
      offset: 8 * KB,
      length: 4 * KB,
    })

    expect(bytes).toEqual(contentOf(FILE, 8 * KB, 4 * KB))
  })
})

describe('fetching an exact span', () => {
  it('reaches back to the grid and drops what was not wanted', async () => {
    const { server, location, reach } = holding(64 * KB)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size: 64 * KB,
      offset: 5 * KB,
      length: 2 * KB,
      mode: 'precise',
    })

    // What the caller wants and what may be asked for are different things.
    expect(ranges(server)[0]?.offset).toBe(5 * KB)
    expect(bytes).toEqual(contentOf(FILE, 5 * KB, 2 * KB))
  })

  it('drops the front when the caller starts off the grid', async () => {
    const { server, location, reach } = holding(64 * KB)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size: 64 * KB,
      offset: 6 * KB,
      length: KB,
      mode: 'normal',
    })

    // An ordinary range sits on a four-kilobyte grid, so the request starts
    // before the caller did and the bytes in front are dropped on arrival.
    expect(ranges(server)[0]?.offset).toBe(4 * KB)
    expect(bytes).toEqual(contentOf(FILE, 6 * KB, KB))
  })

  it('asks on the finer grid when the span is precise', async () => {
    const { server, location, reach } = holding(64 * KB)

    await download({
      location,
      reach,
      dcId: 2,
      size: 64 * KB,
      offset: 3 * KB,
      length: KB,
      mode: 'precise',
    })

    expect(ranges(server).every((range) => range.offset % KB === 0)).toBe(true)
  })

  it('asks for the largest precise range the protocol allows', async () => {
    const { server, location, reach } = holding(2 * MB)

    await download({
      location,
      reach,
      dcId: 2,
      size: 2 * MB,
      limit: MB,
      mode: 'precise',
    })

    expect(ranges(server).every((range) => range.limit <= MB)).toBe(true)
  })

  it('refuses a request size the datacenter would refuse', async () => {
    const { location, reach } = holding(MB)

    await expect(
      download({ location, reach, dcId: 2, size: MB, limit: 3 * KB }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('gives back nothing when nothing was asked for', async () => {
    const { server, location, reach } = holding(64 * KB)

    const bytes = await download({ location, reach, dcId: 2, size: 64 * KB, length: 0 })

    expect(bytes).toEqual(new Uint8Array(0))
    expect(server.asked).toEqual([])
  })
})

describe('handing the ranges over', () => {
  it('delivers them in the order they belong in, however they arrive', async () => {
    const size = 3 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const held: Array<() => void> = []
    const runs: Array<{ bytes: Uint8Array; offset: number }> = []

    await downloadTo({
      location: locate(reference),
      reach: () => ({
        invoke: async (query: TlValue) => {
          // No answer is given until all three ranges have been asked for, and
          // then they are released last-asked first. The reversal is certain
          // rather than likely, because no clock takes part in arranging it.
          await new Promise<void>((resolve) => {
            held.push(resolve)
            if (held.length === 3) for (const release of held.splice(0).reverse()) release()
          })

          return server.invoke(query)
        },
      }),
      dcId: 2,
      size,
      concurrency: 3,
      write: (bytes, offset) => {
        runs.push({ bytes, offset })
      },
    })

    // The bytes are what proves the order. The offset given to the sink is
    // worked out from a running total, so it climbs whatever arrived when —
    // only the content underneath it says which range was put there.
    const assembled = new Uint8Array(size)
    for (const run of runs) assembled.set(run.bytes, run.offset)

    expect(runs.map((run) => run.offset)).toEqual([0, MB, 2 * MB])
    expectSameBytes(assembled, contentOf(FILE, 0, size))
  })

  it('writes to the sink one range at a time', async () => {
    const size = 3 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const held: Array<() => void> = []
    let inside = 0
    let overlapped = false

    await downloadTo({
      location: locate(reference),
      reach: () => ({
        invoke: async (query: TlValue) => {
          await new Promise<void>((resolve) => {
            held.push(resolve)
            if (held.length === 3) for (const release of held.splice(0).reverse()) release()
          })

          return server.invoke(query)
        },
      }),
      dcId: 2,
      size,
      concurrency: 3,
      write: async () => {
        inside += 1
        if (inside > 1) overlapped = true
        // A sink that yields is where two of them would interleave.
        await Promise.resolve()
        inside -= 1
      },
    })

    expect(overlapped).toBe(false)
  })

  it('holds the ranges in flight rather than the file behind a slow one', async () => {
    const size = 8 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const asked: number[] = []
    const written: number[] = []
    let release: (() => void) | undefined

    const transfer = downloadTo({
      location: locate(reference),
      reach: () => ({
        invoke: async (query: TlValue) => {
          const offset = Number(query['offset'] as bigint)
          asked.push(offset)
          // The range at the front is held, so every range behind it finishes
          // ahead of its turn and has to be kept somewhere until that turn.
          if (offset === 0) await new Promise<void>((resolve) => (release = resolve))

          return server.invoke(query)
        },
      }),
      dcId: 2,
      size,
      concurrency: 3,
      write: (_bytes, offset) => {
        written.push(offset)
      },
    })

    // Give the transfer every chance to ask for more. Yielding to the event
    // loop rather than waiting on a clock is what keeps this independent of
    // how loaded the machine is.
    for (let turn = 0; turn < 20; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    // Three may be in flight, so at most three may have been claimed. Without a
    // bound the workers behind the held range walk the whole file into memory.
    expect(asked).toEqual([0, MB, 2 * MB])
    expect(written).toEqual([])

    release?.()
    const outcome = await transfer

    expect(outcome.size).toBe(size)
    expect(asked).toHaveLength(8)
  })

  it('tells the sink where each run of bytes belongs', async () => {
    const size = 3 * MB
    const { location, reach } = holding(size)
    const written: Array<{ offset: number; length: number }> = []

    await downloadTo({
      location,
      reach,
      dcId: 2,
      size,
      write: (bytes, offset) => {
        written.push({ offset, length: bytes.length })
      },
    })

    let at = 0
    for (const run of written) {
      expect(run.offset).toBe(at)
      at += run.length
    }
    expect(at).toBe(size)
  })

  it('loses nothing and repeats nothing under concurrency', async () => {
    const size = 3 * MB + 3 * KB
    const { location, reach } = holding(size)

    const bytes = await download({ location, reach, dcId: 2, size, concurrency: 4 })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('asks for each range exactly once', async () => {
    const size = 3 * MB
    const { server, location, reach } = holding(size)

    await download({ location, reach, dcId: 2, size, concurrency: 3 })

    const asked = ranges(server).map((range) => range.offset)
    expect(new Set(asked).size).toBe(asked.length)
  })

  it('never has more in flight than it was allowed', async () => {
    const size = 8 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    let running = 0
    let peak = 0

    await download({
      location: locate(reference),
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
      size,
      concurrency: 3,
    })

    // Both halves matter: three is the ceiling, and three is actually reached.
    expect(peak).toBe(3)
  })

  it('fails the download when any one range fails', async () => {
    const size = 3 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })

    await expect(
      download({
        location: locate(reference),
        reach: () => ({
          invoke: async (query: TlValue) => {
            if (Number(query['offset'] as bigint) === MB) {
              throw new ValidationError('this range is refused')
            }

            return server.invoke(query)
          },
        }),
        dcId: 2,
        size,
        concurrency: 3,
      }),
    ).rejects.toThrow(/this range is refused/)
  })
})

describe('reaching the end of a file whose length is not known', () => {
  it('stops when an answer comes back short', async () => {
    const size = 6 * KB
    const { server, location, reach } = holding(size)

    const bytes = await download({ location, reach, dcId: 2, limit: 4 * KB })

    expect(bytes).toEqual(contentOf(FILE, 0, size))
    expect(server.asked).toHaveLength(2)
  })

  it('stops when an answer comes back empty', async () => {
    const size = 8 * KB
    const { server, location, reach } = holding(size)

    // The file ends exactly on a range, so the only way to learn that is to ask
    // once more and be given nothing.
    const bytes = await download({ location, reach, dcId: 2, limit: 4 * KB })

    expect(bytes).toEqual(contentOf(FILE, 0, size))
    expect(server.asked).toHaveLength(3)
  })

  it('asks only for ranges the datacenter will answer, wherever it starts', async () => {
    // Nothing is known about the length, so each range is asked for on its own
    // — and a start that is not on a megabyte leaves less room in front of it
    // than a whole one. Taking that remainder as the length is the mistake: it
    // sits on the grid and still does not divide the megabyte it lies in.
    for (const offset of [4 * KB, 8 * KB, 12 * KB, 512 * KB, MB - 4 * KB, MB + 4 * KB]) {
      const size = offset + 5 * KB
      const { server, location, reach } = holding(size)

      const bytes = await download({ location, reach, dcId: 2, offset })

      expectSameBytes(bytes, contentOf(FILE, offset, size - offset))
      for (const range of ranges(server)) {
        expect(isUsableRange(range), `from ${offset}: ${range.offset}+${range.limit}`).toBe(true)
      }
    }
  })

  it('gives back nothing for a file with nothing in it', async () => {
    const { location, reach } = holding(0)

    expect(await download({ location, reach, dcId: 2, limit: 4 * KB })).toEqual(new Uint8Array(0))
  })

  it('stops at the length the caller asked for', async () => {
    const { server, location, reach } = holding(64 * KB)

    const bytes = await download({ location, reach, dcId: 2, limit: 4 * KB, length: 6 * KB })

    expect(bytes).toEqual(contentOf(FILE, 0, 6 * KB))
    expect(server.asked).toHaveLength(2)
  })

  it('does not read for ever when the datacenter keeps answering', async () => {
    let asked = 0
    const bytes = contentOf(FILE, 0, 4 * KB)

    const got = await download({
      location: locate(new Uint8Array(1)),
      reach: () => ({
        invoke: async () => {
          asked += 1
          // The case bounds itself rather than trusting the download to stop.
          if (asked > 50) throw new ValidationError('the download never stopped')

          return { _: 'upload.file', type: { _: 'x' }, mtime: 0, bytes } as TlValue
        },
      }),
      dcId: 2,
      limit: 4 * KB,
      length: 12 * KB,
    })

    expect(got.length).toBe(12 * KB)
    expect(asked).toBe(3)
  })
})

describe('an answer that is short where more was expected', () => {
  it('is taken as the file ending rather than as a failure', async () => {
    const size = 5 * KB
    const { location, reach } = holding(size)

    // The length was stated as larger than the file really is. What comes back
    // is what there is.
    const bytes = await download({ location, reach, dcId: 2, size: 64 * KB, limit: 4 * KB })

    expect(bytes.length).toBeLessThanOrEqual(64 * KB)
    expect(bytes.subarray(0, size)).toEqual(contentOf(FILE, 0, size))
  })

  it('ends the file rather than writing what follows in the wrong place', async () => {
    const size = 3 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const asked: number[] = []
    const runs: Array<{ offset: number; length: number }> = []

    const outcome = await downloadTo({
      location: locate(reference),
      reach: () => ({
        invoke: async (query: TlValue) => {
          const offset = Number(query['offset'] as bigint)
          asked.push(offset)
          const answer = (await server.invoke(query)) as TlValue
          // The first of three ranges comes back half the length asked for,
          // which is the datacenter saying the file stops there.
          if (offset !== 0) return answer

          return cutShort(answer, 512 * KB)
        },
      }),
      dcId: 2,
      size,
      concurrency: 1,
      write: (bytes, offset) => {
        runs.push({ offset, length: bytes.length })
      },
    })

    // Nothing beyond the short range is asked for, nothing is handed over at an
    // offset the missing bytes should have filled, and the size is the truth
    // rather than the length the file was said to have.
    expect(asked).toEqual([0])
    expect(runs).toEqual([{ offset: 0, length: 512 * KB }])
    expect(outcome.size).toBe(512 * KB)
  })

  it('is refused when it is not part of a file at all', async () => {
    const failure = await download({
      location: locate(new Uint8Array(1)),
      reach: () => ({ invoke: async () => ({ _: 'upload.fileCdnRedirect' }) as TlValue }),
      dcId: 2,
      size: 4 * KB,
    }).catch((error: unknown) => error)

    // Which answer arrived is the point. A delivery-node redirection is a
    // protocol answer with a meaning; an answer missing its bytes is broken.
    // Both are refused, and saying only that one was refused is not enough.
    expect(failure).toBeInstanceOf(NetworkError)
    expect((failure as Error).message).toContain('upload.fileCdnRedirect')
  })

  it('does not hand over ranges fetched past where the file turned out to end', async () => {
    const size = 3 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const runs: Array<{ offset: number; length: number }> = []

    const outcome = await downloadTo({
      location: locate(reference),
      reach: () => ({
        invoke: async (query: TlValue) => {
          const answer = (await server.invoke(query)) as TlValue
          if (Number(query['offset'] as bigint) !== 0) return answer

          return cutShort(answer, 512 * KB)
        },
      }),
      dcId: 2,
      size,
      // Three at once, so the ranges behind the short one have been fetched and
      // are waiting their turn by the time the file turns out to have ended.
      concurrency: 3,
      write: (bytes, offset) => {
        runs.push({ offset, length: bytes.length })
      },
    })

    expect(runs).toEqual([{ offset: 0, length: 512 * KB }])
    expect(outcome.size).toBe(512 * KB)
  })
})

describe('a range that did not get through', () => {
  it('is asked for again, unchanged', async () => {
    const size = 8 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    let failed = false

    const bytes = await download({
      location: locate(reference),
      reach: () => ({
        invoke: async (query: TlValue) => {
          if (Number(query['offset'] as bigint) === 4 * KB && !failed) {
            failed = true
            throw new NetworkError('the connection dropped')
          }

          return server.invoke(query)
        },
      }),
      dcId: 2,
      size,
      limit: 4 * KB,
      concurrency: 1,
    })

    // Asking for the same range twice returns the same bytes, which is what
    // makes repeating one safe where repeating a download would not be.
    expect(bytes).toEqual(contentOf(FILE, 0, size))
    expect(ranges(server).filter((range) => range.offset === 4 * KB)).toHaveLength(1)
  })

  it('asks again only for the range that failed', async () => {
    const size = 12 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const asked: number[] = []
    let failed = false

    await download({
      location: locate(reference),
      reach: () => ({
        invoke: async (query: TlValue) => {
          const offset = Number(query['offset'] as bigint)
          asked.push(offset)
          if (offset === 4 * KB && !failed) {
            failed = true
            throw new NetworkError('dropped')
          }

          return server.invoke(query)
        },
      }),
      dcId: 2,
      size,
      limit: 4 * KB,
      concurrency: 1,
    })

    expect(asked).toEqual([0, 4 * KB, 4 * KB, 8 * KB])
  })

  it('survives several failures within its budget', async () => {
    const size = 4 * KB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    let failures = 0

    const bytes = await download({
      location: locate(reference),
      reach: () => ({
        invoke: async (query: TlValue) => {
          if (failures < 2) {
            failures += 1
            throw new NetworkError('dropped')
          }

          return server.invoke(query)
        },
      }),
      dcId: 2,
      size,
      attempts: 3,
    })

    expect(bytes).toEqual(contentOf(FILE, 0, size))
  })

  it('gives up once it has asked as often as it was allowed', async () => {
    let tries = 0

    await expect(
      download({
        location: locate(new Uint8Array(1)),
        reach: () => ({
          invoke: async () => {
            tries += 1
            throw new NetworkError('always dropped')
          },
        }),
        dcId: 2,
        size: 4 * KB,
        attempts: 2,
      }),
    ).rejects.toThrow(/always dropped/)

    expect(tries).toBe(2)
  })

  it('does not ask again for a call that was withdrawn', async () => {
    let calls = 0

    await expect(
      download({
        location: locate(new Uint8Array(1)),
        reach: () => ({
          invoke: async () => {
            calls += 1
            throw new CancelledError('the connection was closed')
          },
        }),
        dcId: 2,
        size: 4 * KB,
        attempts: 5,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    expect(calls).toBe(1)
  })
})

describe('stopping a download', () => {
  it('asks for nothing when it was already stopped', async () => {
    const { server, location, reach } = holding(3 * MB)
    const stopping = new AbortController()
    stopping.abort()

    await expect(
      download({ location, reach, dcId: 2, size: 3 * MB, signal: stopping.signal }),
    ).rejects.toBeInstanceOf(CancelledError)
    expect(server.asked).toEqual([])
  })

  it('asks for nothing further once it has been stopped', async () => {
    const size = 8 * MB
    const server = new FileServer(2)
    const { reference } = server.add(FILE, { size })
    const stopping = new AbortController()

    await expect(
      download({
        location: locate(reference),
        reach: () => ({
          invoke: async (query: TlValue) => {
            if (Number(query['offset'] as bigint) === MB) stopping.abort()

            return server.invoke(query)
          },
        }),
        dcId: 2,
        size,
        concurrency: 1,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    expect(server.asked.length).toBeLessThan(8)
  })

  it('stops a range that was about to be asked for again', async () => {
    const stopping = new AbortController()

    await expect(
      download({
        location: locate(new Uint8Array(1)),
        reach: () => ({
          invoke: async () => {
            stopping.abort()
            throw new NetworkError('dropped')
          },
        }),
        dcId: 2,
        size: 4 * KB,
        attempts: 5,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)
  })

  it('asks for nothing when it was stopped and there was nothing to ask for', async () => {
    const { server, location, reach } = holding(64 * KB)
    const stopping = new AbortController()
    stopping.abort()

    // No range needs fetching here, so there is nothing along the way to notice
    // that the download was withdrawn — it has to be noticed at the start.
    await expect(
      download({ location, reach, dcId: 2, size: 64 * KB, length: 0, signal: stopping.signal }),
    ).rejects.toBeInstanceOf(CancelledError)
    expect(server.asked).toEqual([])
  })

  it('stops a download whose length is not known', async () => {
    const { location, reach } = holding(64 * KB)
    const stopping = new AbortController()
    stopping.abort()

    await expect(
      download({ location, reach, dcId: 2, limit: 4 * KB, signal: stopping.signal }),
    ).rejects.toBeInstanceOf(CancelledError)
  })
})

describe('a datacenter that says the file lives elsewhere', () => {
  it('asks the one it named instead', async () => {
    const size = 8 * KB
    const { home, media, location, reach } = split(size)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size,
      limit: 4 * KB,
      concurrency: 1,
    })

    expect(home.asked).toHaveLength(1)
    expect(media.asked.length).toBeGreaterThan(0)
    expect(bytes).toEqual(contentOf(FILE, 0, size))
  })

  it('reports which datacenter it ended up asking', async () => {
    const { location, reach } = split(4 * KB)

    const outcome = await downloadTo({
      location,
      reach,
      dcId: 2,
      size: 4 * KB,
      write: () => {},
    })

    expect(outcome.dcId).toBe(4)
  })

  it('carries on from where it had got to', async () => {
    const size = 12 * KB
    const home = new FileServer(2)
    const media = new FileServer(4)
    home.add(FILE, { size, dcId: 2 })
    const { reference } = media.add(FILE, { size, dcId: 4 })
    let served = 0

    const bytes = await download({
      location: locate(reference),
      reach: (dcId) => ({
        invoke: async (query: TlValue) => {
          if (dcId === 2) {
            served += 1
            // The first range is served here; then the file moves.
            if (served > 1) {
              throw new MigrationError('FILE_MIGRATE_4 (303)', { kind: 'file', dcId: 4 })
            }

            return home.invoke(query)
          }

          return media.invoke(query)
        },
      }),
      dcId: 2,
      size,
      limit: 4 * KB,
      concurrency: 1,
    })

    // Everything already fetched stays fetched; the rest comes from the other
    // datacenter, and the file is whole.
    expect(bytes).toEqual(contentOf(FILE, 0, size))
  })

  it('counts the transfer moving, not each range being told to move', async () => {
    // Every range in flight is refused at once when a file lives elsewhere. If
    // each refusal counted against the allowance for being sent onward, the
    // allowance would be spent on a single move — and the largest file that
    // could be fetched would be decided by how many ranges are in flight.
    const size = 4 * MB
    const home = new FileServer(2)
    const media = new FileServer(4)
    home.add(FILE, { size, dcId: 4 })
    const { reference } = media.add(FILE, { size, dcId: 4 })
    const servers = new Map([
      [2, home],
      [4, media],
    ])

    const bytes = await download({
      location: locate(reference),
      reach: (dcId: number) => ({
        invoke: async (query: TlValue) => {
          const server = servers.get(dcId)
          if (server === undefined) throw new Error(`no datacenter ${dcId}`)

          return server.invoke(query)
        },
      }),
      dcId: 2,
      size,
      concurrency: 4,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('still gives up on datacenters that pass a file between them', async () => {
    // The bound has to survive counting moves rather than refusals.
    let at = 2
    let calls = 0

    await expect(
      download({
        location: locate(new Uint8Array(1)),
        reach: () => ({
          invoke: async () => {
            calls += 1
            if (calls > 20) throw new ValidationError('the download never stopped')
            at = at === 2 ? 4 : 2

            throw new MigrationError(`FILE_MIGRATE_${at} (303)`, { kind: 'file', dcId: at })
          },
        }),
        dcId: 2,
        size: 4 * KB,
        concurrency: 1,
      }),
    ).rejects.toThrow(/redirected more than/)

    expect(calls).toBeLessThan(20)
  })

  it('does not spend an attempt on being redirected', async () => {
    const { location, reach } = split(4 * KB)

    // A redirection is not a failed range: it was asked of the wrong
    // datacenter and has not been tried yet.
    await expect(
      download({ location, reach, dcId: 2, size: 4 * KB, attempts: 1 }),
    ).resolves.toEqual(contentOf(FILE, 0, 4 * KB))
  })

  it('gives up on datacenters that redirect to each other', async () => {
    let asked = 0

    await expect(
      download({
        location: locate(new Uint8Array(1)),
        reach: (dcId) => ({
          invoke: async () => {
            asked += 1
            if (asked > 20) throw new ValidationError('the download never gave up')

            throw new MigrationError('FILE_MIGRATE (303)', {
              kind: 'file',
              dcId: dcId === 2 ? 4 : 2,
            })
          },
        }),
        dcId: 2,
        size: 4 * KB,
      }),
    ).rejects.toThrow(/redirected more than/)

    expect(asked).toBeLessThanOrEqual(20)
  })
})

/**
 * Pulling a file rather than being pushed one.
 *
 * `downloadTo` hands each range to a sink, which covers a consumer that always
 * wants the whole file. What it cannot express is a consumer that stops: a sink
 * is called, and declining the next call means throwing, which turns an
 * ordinary early exit into a failure. These are the properties that difference
 * is about, so every case here judges what the datacenter was *asked for* as
 * well as what arrived — a bridge that fetched ahead would yield the right
 * bytes and still spend the requests a caller had decided against.
 */
describe('fetching a file as chunks the caller pulls', () => {
  it('yields the whole file, in order', async () => {
    const { location, reach } = holding(3 * MB)
    const chunks: Uint8Array[] = []

    for await (const chunk of downloadIterable({ location, reach, dcId: 2, size: 3 * MB })) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThan(1)
    expectSameBytes(Buffer.concat(chunks), contentOf(FILE, 0, 3 * MB))
  })

  it('stops asking for ranges once the caller stops reading', async () => {
    // The reason this exists. A consumer that has seen enough writes `break`,
    // and the transfer behind it has to stop — not finish quietly into a queue
    // nobody drains.
    const { server, location, reach } = holding(8 * MB)

    for await (const chunk of downloadIterable({
      location,
      reach,
      dcId: 2,
      size: 8 * MB,
      concurrency: 1,
    })) {
      void chunk
      break
    }

    // Settle, so a transfer that kept going has time to prove it.
    await new Promise((resolve) => setTimeout(resolve, 50))

    // A file this size is many ranges. Only the ones needed to produce the
    // chunk that was read may have been asked for.
    expect(ranges(server).length).toBeLessThanOrEqual(2)
  })

  it('does not run ahead of a caller that is slow', async () => {
    // Backpressure, which is the other half of the same property: the transfer
    // awaits its sink, and the sink does not resolve until the chunk is taken.
    const { server, location, reach } = holding(8 * MB)
    const seen: number[] = []

    for await (const chunk of downloadIterable({
      location,
      reach,
      dcId: 2,
      size: 8 * MB,
      concurrency: 1,
    })) {
      seen.push(chunk.length)
      // How far the datacenter has been asked, measured while the consumer is
      // deliberately not asking for more.
      await new Promise((resolve) => setTimeout(resolve, 5))

      if (seen.length === 2) {
        expect(ranges(server).length).toBeLessThanOrEqual(seen.length + 1)
        break
      }
    }
  })

  it('reaches the end of a file whose length nobody stated', async () => {
    const { location, reach } = holding(300 * KB)
    const chunks: Uint8Array[] = []

    for await (const chunk of downloadIterable({ location, reach, dcId: 2 })) chunks.push(chunk)

    expectSameBytes(Buffer.concat(chunks), contentOf(FILE, 0, 300 * KB))
  })

  it('yields only the span that was asked for', async () => {
    const { location, reach } = holding(2 * MB)
    const chunks: Uint8Array[] = []

    for await (const chunk of downloadIterable({
      location,
      reach,
      dcId: 2,
      size: 2 * MB,
      offset: 512 * KB,
      length: 256 * KB,
    })) {
      chunks.push(chunk)
    }

    expectSameBytes(Buffer.concat(chunks), contentOf(FILE, 512 * KB, 256 * KB))
  })

  it('lets a failure out of the loop rather than ending it quietly', async () => {
    // A sequence that ended on an error would look like the end of the file,
    // and a caller concatenating chunks would write a truncated one.
    const { location } = holding(2 * MB)
    let asked = 0

    await expect(
      (async () => {
        for await (const chunk of downloadIterable({
          location,
          dcId: 2,
          size: 2 * MB,
          concurrency: 1,
          reach: () => ({
            invoke: (query: TlValue) => {
              asked += 1
              // The first range arrives whole, so the sequence has started and
              // a caller concatenating chunks has something. The next is
              // refused, which must reach the loop rather than end it.
              if (asked > 1) throw new ValidationError('this range is refused')

              return Promise.resolve({
                _: 'upload.file',
                type: { _: 'storage.filePartial' },
                mtime: 0,
                bytes: contentOf(FILE, Number(query['offset'] as bigint), query['limit'] as number),
              })
            },
          }),
        })) {
          void chunk
        }
      })(),
    ).rejects.toThrow(/this range is refused/)
  })

  it('stops when the signal it was given is aborted', async () => {
    const { location, reach } = holding(8 * MB)
    const stopping = new AbortController()

    await expect(
      (async () => {
        for await (const chunk of downloadIterable({
          location,
          reach,
          dcId: 2,
          size: 8 * MB,
          signal: stopping.signal,
          concurrency: 1,
        })) {
          void chunk
          stopping.abort()
        }
      })(),
    ).rejects.toThrow(CancelledError)
  })

  it('follows a redirection the way the pushed form does', async () => {
    // The transfer is the same one, so this is a check that nothing about the
    // handover bypassed it rather than a second test of migration.
    const { location, reach, media } = split(MB)
    const chunks: Uint8Array[] = []

    for await (const chunk of downloadIterable({ location, reach, dcId: 2, size: MB })) {
      chunks.push(chunk)
    }

    expectSameBytes(Buffer.concat(chunks), contentOf(FILE, 0, MB))
    expect(media.asked.length).toBeGreaterThan(0)
  })
})
