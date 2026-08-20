/**
 * File downloads.
 *
 * The token-leak cases are the security-critical half: Telegram's file endpoint
 * requires the bot token in the path, so any error mentioning the URL is an
 * error carrying a credential. puregram's equivalent interpolates the full URL
 * into its failure messages, which is the specific mistake these pin shut.
 */

import { NetworkError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api.js'
import { download, downloadStream, getFileUrl, resolveTarget } from '../src/download.js'
import type { PhotoSize } from '../src/generated/types/index.js'
import type { HttpClient } from '../src/http/client.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

/** A transport that serves files from an in-memory map. */
function fileTransport(bytes = new Uint8Array([1, 2, 3]), status = 200) {
  const transport = mockTransport()
  transport.on('getFile', ok({ file_id: 'abc', file_path: 'photos/file_1.jpg' }))

  const client: HttpClient = {
    call: transport.call.bind(transport),
    fileUrl: (filePath) => `https://api.telegram.org/file/bot${TOKEN}/${filePath}`,
    fetchFile: async () => ({
      status,
      body:
        status >= 400
          ? null
          : new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes)
                controller.close()
              },
            }),
    }),
  }

  return { client, transport, deps: { api: createApi({ client }), client } }
}

describe('target resolution', () => {
  it('accepts a bare file id', () => {
    expect(resolveTarget('abc')).toEqual({ fileId: 'abc', filePath: undefined })
  })

  it('accepts an object carrying a file id', () => {
    // A Document or Video passes straight through.
    expect(resolveTarget({ file_id: 'doc' })).toEqual({ fileId: 'doc', filePath: undefined })
  })

  it('keeps a file path the caller already had', () => {
    // Saves a getFile round trip when the caller already called it.
    expect(resolveTarget({ file_id: 'a', file_path: 'p/x.jpg' })).toEqual({
      fileId: 'a',
      filePath: 'p/x.jpg',
    })
  })

  it('picks the largest photo size by file size', () => {
    const sizes = [
      { file_id: 'small', file_unique_id: 's', width: 90, height: 90, file_size: 100 },
      { file_id: 'large', file_unique_id: 'l', width: 800, height: 800, file_size: 9000 },
    ] as PhotoSize[]

    expect(resolveTarget(sizes).fileId).toBe('large')
  })

  it('falls back to pixel area when file size is absent', () => {
    // `file_size` is optional; area orders the same way for any real photo.
    const sizes = [
      { file_id: 'small', file_unique_id: 's', width: 90, height: 90 },
      { file_id: 'large', file_unique_id: 'l', width: 1280, height: 720 },
    ] as PhotoSize[]

    expect(resolveTarget(sizes).fileId).toBe('large')
  })

  it('rejects an empty photo array', () => {
    expect(() => resolveTarget([] as PhotoSize[])).toThrow(ValidationError)
  })

  it('rejects an object with no file id, explaining what is accepted', () => {
    expect(() => resolveTarget({ width: 10 } as never)).toThrow(/file_id/)
  })
})

describe('url resolution', () => {
  it('calls getFile when the path is unknown', async () => {
    const { deps, transport } = fileTransport()

    const url = await getFileUrl(deps, 'abc')

    expect(transport.count('getFile')).toBe(1)
    expect(url).toContain('photos/file_1.jpg')
  })

  it('skips getFile when the path is already known', async () => {
    const { deps, transport } = fileTransport()

    await getFileUrl(deps, { file_id: 'abc', file_path: 'known/path.jpg' })

    expect(transport.count('getFile')).toBe(0)
  })

  it('fails clearly when Telegram returns no path', async () => {
    const transport = mockTransport()
    transport.on('getFile', ok({ file_id: 'abc' }))

    const client: HttpClient = {
      call: transport.call.bind(transport),
      fileUrl: (p) => p,
    }

    await expect(getFileUrl({ api: createApi({ client }), client }, 'abc')).rejects.toThrow(
      /no file_path/,
    )
  })
})

describe('downloading', () => {
  it('returns the bytes', async () => {
    const { deps } = fileTransport(new Uint8Array([7, 8, 9]))
    expect(await download(deps, 'abc')).toEqual(new Uint8Array([7, 8, 9]))
  })

  it('concatenates several chunks in order', async () => {
    const transport = mockTransport()
    transport.on('getFile', ok({ file_id: 'a', file_path: 'p.bin' }))

    const client: HttpClient = {
      call: transport.call.bind(transport),
      fileUrl: (p) => p,
      fetchFile: async () => ({
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]))
            controller.enqueue(new Uint8Array([3]))
            controller.enqueue(new Uint8Array([4, 5]))
            controller.close()
          },
        }),
      }),
    }

    const bytes = await download({ api: createApi({ client }), client }, 'a')
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  it('exposes a stream for large files', async () => {
    const { deps } = fileTransport()
    const stream = await downloadStream(deps, 'abc')

    expect(stream).toBeInstanceOf(ReadableStream)
  })

  it('accepts a photo array end to end', async () => {
    const { deps, transport } = fileTransport()
    const sizes = [
      { file_id: 'small', file_unique_id: 's', width: 10, height: 10, file_size: 5 },
      { file_id: 'big', file_unique_id: 'b', width: 100, height: 100, file_size: 500 },
    ] as PhotoSize[]

    await download(deps, sizes)

    expect(transport.last('getFile')?.params['file_id']).toBe('big')
  })
})

describe('token safety', () => {
  it('does not name the URL when a download fails', async () => {
    // The URL contains the token. puregram interpolates it into exactly this
    // message, so a failed download there throws a credential.
    const { deps } = fileTransport(new Uint8Array(), 404)

    await expect(download(deps, 'abc')).rejects.toBeInstanceOf(NetworkError)

    try {
      await download(deps, 'abc')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as Error).message).not.toContain('TEST_TOKEN')
      expect((error as Error).message).toContain('404')
    }
  })

  it('does not name the URL when the body is empty', async () => {
    const transport = mockTransport()
    transport.on('getFile', ok({ file_id: 'a', file_path: 'p.bin' }))

    const client: HttpClient = {
      call: transport.call.bind(transport),
      fileUrl: () => `https://api.telegram.org/file/bot${TOKEN}/p.bin`,
      fetchFile: async () => ({ status: 200, body: null }),
    }

    try {
      await download({ api: createApi({ client }), client }, 'a')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as Error).message).not.toContain('TEST_TOKEN')
    }
  })

  it('does not name the file path when Telegram omits it', async () => {
    const transport = mockTransport()
    transport.on('getFile', ok({ file_id: 'secret-looking-id' }))

    const client: HttpClient = { call: transport.call.bind(transport), fileUrl: (p) => p }

    try {
      await getFileUrl({ api: createApi({ client }), client }, 'secret-looking-id')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as Error).message).not.toContain('TEST_TOKEN')
    }
  })
})

describe('transport capability', () => {
  it('reports clearly when a transport cannot build file URLs', async () => {
    const transport = mockTransport()
    transport.on('getFile', ok({ file_id: 'a', file_path: 'p.bin' }))

    const client: HttpClient = { call: transport.call.bind(transport) }

    await expect(getFileUrl({ api: createApi({ client }), client }, 'a')).rejects.toThrow(
      /cannot build file URLs/,
    )
  })

  it('reports clearly when a transport cannot fetch files', async () => {
    const transport = mockTransport()
    transport.on('getFile', ok({ file_id: 'a', file_path: 'p.bin' }))

    const client: HttpClient = { call: transport.call.bind(transport), fileUrl: (p) => p }

    await expect(downloadStream({ api: createApi({ client }), client }, 'a')).rejects.toThrow(
      /cannot fetch files/,
    )
  })
})
