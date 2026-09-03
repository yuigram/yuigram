/**
 * Fetching a file from a machine Telegram does not operate.
 *
 * A delivery node is the one place in file transfer where wrong bytes are the
 * expected failure rather than an error. The node holds the file encrypted,
 * knows nothing about the account, and is not run by Telegram — so everything
 * it sends is decrypted under a counter that has to continue from the right
 * place and checked against hashes published over the plaintext. Get the
 * counter wrong and the result is plausible rubbish; skip the check and the
 * node decides what the file says.
 *
 * Every case here is judged against the bytes the datacenter holds, so a range
 * that decrypts to something of the right length is not mistaken for a range
 * that decrypts to the right content.
 */

import { CancelledError, NetworkError, TelegramError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { sha256 } from '../src/crypto/hash.js'
import { download, downloadTo } from '../src/files/download.js'
import type { TlValue } from '../src/tl/index.js'
import { contentOf, type FileFaults, FileServer } from './server/files.js'

const FILE = 0x1234_5678n
const KB = 1024
const MB = 1024 * 1024
const HASH_BLOCK = 128 * KB

function locate(reference: Uint8Array): TlValue {
  return {
    _: 'inputDocumentFileLocation',
    id: FILE,
    access_hash: 5n,
    file_reference: reference,
    thumb_size: '',
  }
}

/**
 * A datacenter that hands every download to a delivery node.
 *
 * The node is the same instance answering under the number the datacenter
 * publishes for it, so a case can watch which datacenter each call went to
 * without standing up a second server.
 */
function viaCdn(size: number, faults: Partial<FileFaults> = {}) {
  const server = new FileServer(2)
  const { reference } = server.add(FILE, { size })
  server.faults = { viaCdn: true, ...faults }
  const reached: number[] = []

  return {
    server,
    reached,
    location: locate(reference),
    reach: (dcId: number) => {
      reached.push(dcId)

      return { invoke: async (query: TlValue) => server.invoke(query) }
    },
  }
}

/** Which methods the datacenter was asked for, in order. */
const calls = (server: FileServer) => server.asked.map((query) => query._)

function expectSameBytes(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length)
  expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected))).toBe(0)
}

describe('being handed to a delivery node', () => {
  it('fetches the file through it and gives back what the datacenter holds', async () => {
    const size = 300 * KB
    const { location, reach } = viaCdn(size)

    const bytes = await download({ location, reach, dcId: 2, size, cdn: true })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('does not offer to use one unless the caller allows it', async () => {
    const size = 200 * KB
    const { server, location, reach } = viaCdn(size)

    // The datacenter only redirects a client that said it could follow, so a
    // caller that did not say so is served the ordinary way.
    const bytes = await download({ location, reach, dcId: 2, size })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
    expect(calls(server)).not.toContain('upload.getCdnFile')
  })

  it('asks the datacenter the redirection named', async () => {
    const { reached, location, reach } = viaCdn(200 * KB)

    await download({ location, reach, dcId: 2, size: 200 * KB, cdn: true })

    // The node lives at the number the datacenter published for it, which is
    // not the one the transfer started at.
    expect(reached[0]).toBe(2)
    expect(reached).toContain(102)
  })

  it('carries the token the datacenter issued', async () => {
    const { server, location, reach } = viaCdn(200 * KB)

    await download({ location, reach, dcId: 2, size: 200 * KB, cdn: true })

    const asked = server.asked.find((query) => query._ === 'upload.getCdnFile')

    expect(asked?.['file_token']).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(asked?.['file_token'] as Uint8Array)).toBe(`token-${FILE}`)
  })

  it('does not spend an attempt on being handed over', async () => {
    const { location, reach } = viaCdn(200 * KB)

    // One attempt is all a range gets. Being redirected is an answer about
    // where the file is, so it must not use that up.
    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size: 200 * KB,
      cdn: true,
      attempts: 1,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, 200 * KB))
  })

  it('follows one handover however many ranges are in flight', async () => {
    // Each range in flight is handed over separately. Counting each as a
    // separate handover would spend the allowance on one file.
    const size = 4 * MB
    const { location, reach } = viaCdn(size)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size,
      cdn: true,
      concurrency: 4,
      attempts: 1,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('keeps what it learned under the handover it already followed', async () => {
    // A range still in flight when the transfer is handed over is told the same
    // thing a moment later. Following that second telling would build the
    // handover again from scratch and throw away the verification data
    // gathered under the first — so the file would be checked against data
    // fetched twice, and the single handover would have happened twice.
    const size = 4 * MB
    const { server, location, reach } = viaCdn(size, { withoutCdnHashes: true })
    const held: Array<() => void> = []
    let published = 0

    const bytes = await download({
      location,
      reach: (dcId: number) => ({
        invoke: async (query: TlValue) => {
          // Every range but the first waits until the first has been handed
          // over and has asked for the verification data it needs. No clock
          // takes part, so the order is certain.
          if (query._ === 'upload.getFile' && server.asked.length > 0) {
            await new Promise<void>((resolve) => held.push(resolve))
          }

          const answer = await reach(dcId).invoke(query)
          if (query._ === 'upload.getCdnFileHashes') {
            published += 1
            for (const release of held.splice(0)) release()
          }

          return answer
        },
      }),
      dcId: 2,
      size,
      cdn: true,
      concurrency: 4,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
    expect(published).toBe(1)
  })

  it('cannot be handed from node to node, however hard it is pushed', async () => {
    let asked = 0

    // Once a transfer has been handed over it never asks a datacenter again, so
    // a node answering with yet another address is refused rather than
    // followed. Nothing here can loop, and that is a property of the shape
    // rather than of a count.
    await expect(
      download({
        location: locate(new Uint8Array(1)),
        reach: () => ({
          invoke: async () => {
            asked += 1
            if (asked > 20) throw new NetworkError('the download never stopped')

            return {
              _: 'upload.fileCdnRedirect',
              dc_id: 100 + asked,
              file_token: new Uint8Array(2),
              encryption_key: new Uint8Array(32),
              encryption_iv: new Uint8Array(16),
              file_hashes: [],
            } as TlValue
          },
        }),
        dcId: 2,
        size: 4 * KB,
        cdn: true,
      }),
    ).rejects.toThrow(/delivery node/)

    expect(asked).toBeLessThan(20)
  })

  it('follows a datacenter migration and then a delivery node', async () => {
    const size = 200 * KB
    const home = new FileServer(2)
    const media = new FileServer(4)
    home.add(FILE, { size, dcId: 4 })
    const { reference } = media.add(FILE, { size, dcId: 4 })
    media.faults = { viaCdn: true }
    const servers = new Map([
      [2, home],
      [4, media],
      [104, media],
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
      cdn: true,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('does not follow a redirection the caller never allowed', async () => {
    const { location, reach } = viaCdn(200 * KB)

    // The datacenter names a node to a client that did not say it could use
    // one. Following it anyway would send the file through a machine the
    // caller chose not to trust.
    const failure = await download({
      location,
      reach: (dcId: number) => ({
        invoke: async (query: TlValue) =>
          query._ === 'upload.getFile'
            ? await reach(dcId).invoke({ ...query, cdn_supported: true })
            : await reach(dcId).invoke(query),
      }),
      dcId: 2,
      size: 200 * KB,
      attempts: 1,
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(NetworkError)
    expect((failure as Error).message).toContain('upload.fileCdnRedirect')
  })

  it('refuses an answer from a node that is not part of a file', async () => {
    const { location, reach } = viaCdn(200 * KB)

    const failure = await download({
      location,
      reach: (dcId: number) =>
        dcId === 102
          ? { invoke: async () => ({ _: 'upload.file', bytes: new Uint8Array(4) }) as TlValue }
          : reach(dcId),
      dcId: 2,
      size: 200 * KB,
      cdn: true,
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(NetworkError)
    expect((failure as Error).message).toContain('upload.file')
  })
})

describe('decrypting what a delivery node sends', () => {
  it('gives back the plaintext for a file that fits in one block', async () => {
    const size = 100 * KB
    const { location, reach } = viaCdn(size)

    expectSameBytes(
      await download({ location, reach, dcId: 2, size, cdn: true }),
      contentOf(FILE, 0, size),
    )
  })

  it('continues the counter across blocks rather than restarting it', async () => {
    // Several blocks is where a restarted counter shows: the first block would
    // be right and every one after it wrong.
    const size = 5 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    expectSameBytes(
      await download({ location, reach, dcId: 2, size, cdn: true }),
      contentOf(FILE, 0, size),
    )
  })

  it('decrypts a range that does not start at the beginning of the file', async () => {
    const size = 4 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size,
      cdn: true,
      offset: 2 * HASH_BLOCK,
      length: HASH_BLOCK,
    })

    expectSameBytes(bytes, contentOf(FILE, 2 * HASH_BLOCK, HASH_BLOCK))
  })

  it('decrypts a range that starts inside a block', async () => {
    const size = 2 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    // The counter advances by blocks, so a range starting between two of them
    // is fetched from the block boundary and cut down afterwards.
    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size,
      cdn: true,
      offset: 8 * KB,
      length: 5 * KB,
    })

    expectSameBytes(bytes, contentOf(FILE, 8 * KB, 5 * KB))
  })

  it('decrypts a file that does not end on a block', async () => {
    const size = HASH_BLOCK + 7 * KB + 137
    const { location, reach } = viaCdn(size)

    expectSameBytes(
      await download({ location, reach, dcId: 2, size, cdn: true }),
      contentOf(FILE, 0, size),
    )
  })

  it('hands back exactly the range asked for when the length is not known', async () => {
    // Nothing trims the answer on this path, so a range widened to whole blocks
    // has to be cut back here. Starting off a block is what makes the
    // difference show: the block after the range would otherwise come too.
    const size = 3 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      cdn: true,
      offset: 4 * KB,
      limit: 256 * KB,
    })

    expectSameBytes(bytes, contentOf(FILE, 4 * KB, size - 4 * KB))
  })

  it('decrypts a file spanning more than a megabyte', async () => {
    const size = 2 * MB + 3 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    expectSameBytes(
      await download({ location, reach, dcId: 2, size, cdn: true }),
      contentOf(FILE, 0, size),
    )
  })
})

describe('checking what a delivery node sends', () => {
  it('accepts content that matches what was published for it', async () => {
    const size = 3 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    expectSameBytes(
      await download({ location, reach, dcId: 2, size, cdn: true }),
      contentOf(FILE, 0, size),
    )
  })

  it('refuses content the node altered', async () => {
    const { location, reach } = viaCdn(200 * KB, { corruptCdn: true })

    // The node encrypts correctly and sends the wrong file. Nothing but the
    // published hashes can tell.
    await expect(
      download({ location, reach, dcId: 2, size: 200 * KB, cdn: true, attempts: 1 }),
    ).rejects.toBeInstanceOf(NetworkError)
  })

  it('refuses ciphertext that was damaged in transit', async () => {
    const { location, reach } = viaCdn(200 * KB)

    await expect(
      download({
        location,
        reach: (dcId: number) => ({
          invoke: async (query: TlValue) => {
            const answer = await reach(dcId).invoke(query)
            if (answer._ !== 'upload.cdnFile') return answer

            const bytes = new Uint8Array(answer['bytes'] as Uint8Array)
            bytes[0] = (bytes[0] ?? 0) ^ 0xff

            return { ...answer, bytes }
          },
        }),
        dcId: 2,
        size: 200 * KB,
        cdn: true,
        attempts: 1,
      }),
    ).rejects.toBeInstanceOf(NetworkError)
  })

  it('refuses content described by hashes that do not describe it', async () => {
    const { location, reach } = viaCdn(200 * KB, { wrongCdnHashes: true })

    await expect(
      download({ location, reach, dcId: 2, size: 200 * KB, cdn: true, attempts: 1 }),
    ).rejects.toBeInstanceOf(NetworkError)
  })

  it('refuses content nothing was published for', async () => {
    const { location, reach } = viaCdn(200 * KB)

    // Verification data withheld everywhere it could come from. Accepting the
    // range because nothing described it is exactly the hole worth having a
    // test for.
    const failure = await download({
      location,
      reach: (dcId: number) => ({
        invoke: async (query: TlValue) => {
          const answer = await reach(dcId).invoke(query)
          if (answer._ === 'upload.fileCdnRedirect') return { ...answer, file_hashes: [] }
          if (answer._ === 'vector') return { ...answer, items: [] }

          return answer
        },
      }),
      dcId: 2,
      size: 200 * KB,
      cdn: true,
      attempts: 1,
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(NetworkError)
    expect((failure as Error).message).toContain('nothing was published')
  })

  it('asks for verification data the redirection did not carry', async () => {
    const size = 200 * KB
    const { server, location, reach } = viaCdn(size, { withoutCdnHashes: true })

    const bytes = await download({ location, reach, dcId: 2, size, cdn: true })

    // The redirection published nothing, so the data had to be asked for
    // before any of the file could be accepted.
    expect(calls(server)).toContain('upload.getCdnFileHashes')
    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('checks every block, not only the first', async () => {
    const size = 3 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    // Only the third block is damaged, so a check that stopped after the first
    // would hand the file over.
    await expect(
      download({
        location,
        reach: (dcId: number) => ({
          invoke: async (query: TlValue) => {
            const answer = await reach(dcId).invoke(query)
            if (answer._ !== 'upload.cdnFile') return answer
            if (Number(query['offset'] as bigint) + (query['limit'] as number) <= 2 * HASH_BLOCK) {
              return answer
            }

            const bytes = new Uint8Array(answer['bytes'] as Uint8Array)
            bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff

            return { ...answer, bytes }
          },
        }),
        dcId: 2,
        size,
        cdn: true,
        attempts: 1,
      }),
    ).rejects.toBeInstanceOf(NetworkError)
  })

  it('hands nothing to the sink before it has been checked', async () => {
    const { location, reach } = viaCdn(200 * KB, { corruptCdn: true })
    const written: number[] = []

    await expect(
      downloadTo({
        location,
        reach,
        dcId: 2,
        size: 200 * KB,
        cdn: true,
        attempts: 1,
        write: (bytes) => {
          written.push(bytes.length)
        },
      }),
    ).rejects.toBeInstanceOf(NetworkError)

    // Not one byte of a file that failed its check.
    expect(written).toEqual([])
  })

  it('checks a range that begins and ends inside one block', async () => {
    const size = 2 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size,
      cdn: true,
      offset: 4 * KB,
      length: 4 * KB,
    })

    expectSameBytes(bytes, contentOf(FILE, 4 * KB, 4 * KB))
  })

  it('checks a range that crosses a block boundary', async () => {
    const size = 3 * HASH_BLOCK
    const { location, reach } = viaCdn(size)

    const bytes = await download({
      location,
      reach,
      dcId: 2,
      size,
      cdn: true,
      offset: HASH_BLOCK - 8 * KB,
      length: 16 * KB,
    })

    expectSameBytes(bytes, contentOf(FILE, HASH_BLOCK - 8 * KB, 16 * KB))
  })
})

describe('a delivery node that has not been given the range', () => {
  it('has it sent there and then serves it', async () => {
    const size = 200 * KB
    const { server, location, reach } = viaCdn(size, { cdnReuploadFirst: true })

    const bytes = await download({ location, reach, dcId: 2, size, cdn: true })

    expect(calls(server)).toContain('upload.reuploadCdnFile')
    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('asks the datacenter that issued the redirection, not the node', async () => {
    const size = 200 * KB
    const { location, reach, reached } = viaCdn(size, { cdnReuploadFirst: true })
    const at: number[] = []

    await download({
      location,
      reach: (dcId: number) => ({
        invoke: async (query: TlValue) => {
          if (query._ === 'upload.reuploadCdnFile') at.push(dcId)

          return reach(dcId).invoke(query)
        },
      }),
      dcId: 2,
      size,
      cdn: true,
    })

    // Only the datacenter holding the file can send it to a node.
    expect(at.every((dcId) => dcId === 2)).toBe(true)
    expect(reached).toContain(102)
  })

  it('does not spend an attempt on being told to wait', async () => {
    const size = 200 * KB
    const { location, reach } = viaCdn(size, { cdnReuploadFirst: true })

    const bytes = await download({ location, reach, dcId: 2, size, cdn: true, attempts: 1 })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
  })

  it('gives up on a node that never becomes ready', async () => {
    const { location, reach } = viaCdn(200 * KB)
    let asked = 0

    const failure = await download({
      location,
      reach: (dcId: number) => ({
        invoke: async (query: TlValue) => {
          if (query._ !== 'upload.getCdnFile') return reach(dcId).invoke(query)

          asked += 1
          // The case bounds itself rather than trusting the download to stop.
          if (asked > 20) throw new NetworkError('the download never stopped')

          return { _: 'upload.cdnFileReuploadNeeded', request_token: new Uint8Array(2) }
        },
      }),
      dcId: 2,
      size: 200 * KB,
      cdn: true,
      attempts: 1,
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(NetworkError)
    expect(asked).toBeLessThan(20)
  })

  it('reports a reissue the datacenter refused', async () => {
    const { location, reach } = viaCdn(200 * KB, { cdnReuploadFirst: true })

    await expect(
      download({
        location,
        reach: (dcId: number) => ({
          invoke: async (query: TlValue) => {
            if (query._ === 'upload.reuploadCdnFile') {
              throw new TelegramError('FILE_TOKEN_INVALID (400)')
            }

            return reach(dcId).invoke(query)
          },
        }),
        dcId: 2,
        size: 200 * KB,
        cdn: true,
        attempts: 1,
      }),
    ).rejects.toBeInstanceOf(TelegramError)
  })

  it('keeps the verification data the reissue came back with', async () => {
    const size = 200 * KB
    const { server, location, reach } = viaCdn(size, {
      cdnReuploadFirst: true,
      withoutCdnHashes: true,
    })

    // The datacenter publishes nothing up front and answers the reissue with
    // the hashes for what it sent. Throwing those away means asking for them
    // again, which is a round trip for something already in hand.
    const bytes = await download({
      location,
      reach: (dcId: number) => ({
        invoke: async (query: TlValue) => {
          const answer = await reach(dcId).invoke(query)
          if (query._ !== 'upload.reuploadCdnFile') return answer

          const items = []
          for (let offset = 0; offset < size; offset += HASH_BLOCK) {
            const limit = Math.min(HASH_BLOCK, size - offset)
            items.push({
              _: 'fileHash',
              offset: BigInt(offset),
              limit,
              hash: sha256(contentOf(FILE, offset, limit)),
            })
          }

          return { _: 'vector', items } as TlValue
        },
      }),
      dcId: 2,
      size,
      cdn: true,
    })

    expectSameBytes(bytes, contentOf(FILE, 0, size))
    expect(calls(server)).not.toContain('upload.getCdnFileHashes')
  })

  it('returns the token the node asked to be quoted', async () => {
    const size = 200 * KB
    const { location, reach } = viaCdn(size, { cdnReuploadFirst: true })
    const asked: string[] = []
    const quoted: string[] = []

    await download({
      location,
      reach: (dcId: number) => ({
        invoke: async (query: TlValue) => {
          if (query._ === 'upload.reuploadCdnFile') {
            quoted.push(new TextDecoder().decode(query['request_token'] as Uint8Array))
          }

          const answer = await reach(dcId).invoke(query)
          if (answer._ === 'upload.cdnFileReuploadNeeded') {
            asked.push(new TextDecoder().decode(answer['request_token'] as Uint8Array))
          }

          return answer
        },
      }),
      dcId: 2,
      size,
      cdn: true,
    })

    // The token stands for the range the node is missing. Any other token names
    // a different range, or nothing.
    expect(quoted).toEqual(asked)
    expect(quoted.length).toBeGreaterThan(0)
  })

  it('does not fetch a range again that was already handed over', async () => {
    const size = 3 * HASH_BLOCK
    const { server, location, reach } = viaCdn(size, { cdnReuploadFirst: true })

    await download({ location, reach, dcId: 2, size, cdn: true })

    const served = server.asked
      .filter((query) => query._ === 'upload.getCdnFile')
      .map((query) => `${Number(query['offset'] as bigint)}+${query['limit'] as number}`)
    const once = served.filter((range, index) => served.indexOf(range) === index)

    // Each range is asked for twice at most — once refused, once served — and
    // never a third time.
    expect(served.length).toBeLessThanOrEqual(once.length * 2)
  })
})

describe('stopping a download served by a delivery node', () => {
  it('stops before it asks the node for anything', async () => {
    const { server, location, reach } = viaCdn(200 * KB)
    const stopping = new AbortController()

    await expect(
      download({
        location,
        reach: (dcId: number) => ({
          invoke: async (query: TlValue) => {
            if (query._ === 'upload.getFile') stopping.abort()

            return reach(dcId).invoke(query)
          },
        }),
        dcId: 2,
        size: 200 * KB,
        cdn: true,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    expect(calls(server)).not.toContain('upload.getCdnFile')
  })

  it('stops while the node is serving ranges', async () => {
    const { location, reach } = viaCdn(2 * MB)
    const stopping = new AbortController()

    await expect(
      download({
        location,
        reach: (dcId: number) => ({
          invoke: async (query: TlValue) => {
            if (query._ === 'upload.getCdnFile') stopping.abort()

            return reach(dcId).invoke(query)
          },
        }),
        dcId: 2,
        size: 2 * MB,
        cdn: true,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)
  })

  it('stops while a range is being sent to the node', async () => {
    const { location, reach } = viaCdn(200 * KB, { cdnReuploadFirst: true })
    const stopping = new AbortController()

    await expect(
      download({
        location,
        reach: (dcId: number) => ({
          invoke: async (query: TlValue) => {
            if (query._ === 'upload.reuploadCdnFile') stopping.abort()

            return reach(dcId).invoke(query)
          },
        }),
        dcId: 2,
        size: 200 * KB,
        cdn: true,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)
  })

  it('stops between the node asking and the datacenter being asked', async () => {
    const { server, location, reach } = viaCdn(200 * KB, { cdnReuploadFirst: true })
    const stopping = new AbortController()

    await expect(
      download({
        location,
        reach: (dcId: number) => ({
          invoke: async (query: TlValue) => {
            const answer = await reach(dcId).invoke(query)
            // Withdrawn in the moment between learning the node has nothing and
            // asking the datacenter to send it something.
            if (answer._ === 'upload.cdnFileReuploadNeeded') stopping.abort()

            return answer
          },
        }),
        dcId: 2,
        size: 200 * KB,
        cdn: true,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    expect(calls(server)).not.toContain('upload.reuploadCdnFile')
  })

  it('is stopped rather than retried', async () => {
    const { location, reach } = viaCdn(3 * MB)
    const stopping = new AbortController()
    let asked = 0

    await expect(
      download({
        location,
        reach: (dcId: number) => ({
          invoke: async (query: TlValue) => {
            if (query._ === 'upload.getCdnFile') {
              asked += 1
              stopping.abort()
            }

            return reach(dcId).invoke(query)
          },
        }),
        dcId: 2,
        size: 3 * MB,
        cdn: true,
        concurrency: 1,
        attempts: 5,
        signal: stopping.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)

    // Five attempts were allowed for each of three ranges. A withdrawal spends
    // none of them: the first range is fetched and nothing else is asked for.
    expect(asked).toBe(1)
  })
})
