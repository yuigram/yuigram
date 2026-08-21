/**
 * Streaming uploads.
 *
 * The property is not that a file arrives — the buffered path did that too —
 * but that it arrives *without being held in memory first*. So what is checked
 * is the shape of the traffic: bytes are produced only as they are pulled, a
 * cancelled request stops the source, and an error in the middle surfaces
 * rather than silently truncating the upload.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encodeRequest } from '../src/http/multipart.js'
import {
  createBoundary,
  hasStreamingUpload,
  isStreamingSource,
  writeMultipart,
} from '../src/http/stream-multipart.js'
import { media } from '../src/media.js'

/** Collect a stream into text. */
async function text(body: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(body).text()
}

describe('choosing a path', () => {
  it('streams a source that cannot be read without reading it', () => {
    async function* bytes(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1])
    }

    expect(isStreamingSource(bytes())).toBe(true)
    expect(isStreamingSource(new ReadableStream())).toBe(true)
    expect(isStreamingSource(media.path('./a.txt'))).toBe(true)
  })

  it('buffers what is already resident, where FormData is simpler', () => {
    // Streaming these buys nothing and costs the runtime its own length
    // computation.
    expect(isStreamingSource(new Uint8Array([1]))).toBe(false)
    expect(isStreamingSource(new ArrayBuffer(1))).toBe(false)
    expect(isStreamingSource(new Blob(['x']))).toBe(false)
    expect(isStreamingSource(media.buffer(new Uint8Array([1]), 'a.bin'))).toBe(false)
  })

  it('finds a stream nested inside media', () => {
    // `sendMediaGroup` carries its files inside a list of objects.
    expect(hasStreamingUpload({ media: [{ type: 'photo', media: media.path('./a.jpg') }] })).toBe(
      true,
    )
    expect(
      hasStreamingUpload({
        media: [{ type: 'photo', media: media.buffer(new Uint8Array(), 'a') }],
      }),
    ).toBe(false)
  })
})

describe('the envelope', () => {
  it('writes headers, body and terminator in multipart order', async () => {
    const boundary = createBoundary()
    const body = ReadableStream.from(
      writeMultipart(
        [
          { name: 'chat_id', value: '42' },
          { name: 'document', value: media.text('hello', 'note.txt') },
        ],
        boundary,
      ),
    )

    const written = await text(body)

    expect(written).toContain(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"`)
    expect(written).toContain('name="document"; filename="note.txt"')
    expect(written).toContain('Content-Type: text/plain; charset=utf-8')
    expect(written).toContain('hello')
    expect(written.endsWith(`--${boundary}--\r\n`)).toBe(true)
  })

  it('uses a boundary a payload will not contain', () => {
    const first = createBoundary()
    const second = createBoundary()

    expect(first).not.toBe(second)
    expect(first).toMatch(/^----YuigramFormBoundary[0-9a-f]{32}$/)
  })

  it('escapes a filename that would end the header early', async () => {
    const boundary = createBoundary()
    const written = await text(
      ReadableStream.from(
        writeMultipart(
          [{ name: 'document', value: media.buffer(new Uint8Array([1]), 'a"b\r\nc.txt') }],
          boundary,
        ),
      ),
    )

    expect(written).toContain('filename="a%22bc.txt"')
  })

  it('defaults the content type when the source did not name one', async () => {
    async function* bytes(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1])
    }

    const written = await text(
      ReadableStream.from(writeMultipart([{ name: 'a', value: bytes() }], createBoundary())),
    )

    expect(written).toContain('Content-Type: application/octet-stream')
  })
})

describe('pulling, not pushing', () => {
  it('produces nothing until the consumer asks', async () => {
    let produced = 0

    async function* counted(): AsyncGenerator<Uint8Array> {
      for (let index = 0; index < 100; index += 1) {
        produced += 1
        yield new Uint8Array([index])
      }
    }

    const body = ReadableStream.from(
      writeMultipart([{ name: 'document', value: counted() }], createBoundary()),
    )

    const reader = body.getReader()
    await reader.read() // the header
    await reader.read() // one chunk of the file

    // A slow socket slows the read from disk rather than filling memory with
    // what it has not sent yet.
    expect(produced).toBeLessThan(5)

    await reader.cancel()
  })

  it('stops the source when the request is cancelled', async () => {
    let closed = false

    async function* watched(): AsyncGenerator<Uint8Array> {
      try {
        for (;;) yield new Uint8Array([0])
      } finally {
        // What closes the file handle on an aborted upload.
        closed = true
      }
    }

    const body = ReadableStream.from(
      writeMultipart([{ name: 'document', value: watched() }], createBoundary()),
    )

    const reader = body.getReader()
    await reader.read()
    await reader.read()
    await reader.cancel()

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(closed).toBe(true)
  })

  it('surfaces a failure mid-stream rather than truncating', async () => {
    async function* failing(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1])
      throw new Error('disk went away')
    }

    const body = ReadableStream.from(
      writeMultipart([{ name: 'document', value: failing() }], createBoundary()),
    )

    await expect(text(body)).rejects.toThrow('disk went away')
  })
})

describe('through the encoder', () => {
  let directory = ''
  let file = ''

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'yuigram-stream-'))
    file = join(directory, 'big.txt')
    await writeFile(file, 'x'.repeat(1_000_000))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('sends a file from disk as a stream, with the boundary announced', async () => {
    const encoded = await encodeRequest({ chat_id: 1, document: media.path(file) })

    expect(encoded.body).toBeInstanceOf(ReadableStream)
    expect(encoded.contentType).toMatch(/^multipart\/form-data; boundary=----YuigramFormBoundary/)
  })

  it('carries the bytes intact', async () => {
    const small = join(directory, 'small.txt')
    await writeFile(small, 'hello from disk')

    const encoded = await encodeRequest({ chat_id: 1, document: media.path(small) })
    const written = await text(encoded.body as ReadableStream<Uint8Array>)

    expect(written).toContain('hello from disk')
    expect(written).toContain('filename="small.txt"')
    expect(written).toContain('name="chat_id"\r\n\r\n1')
  })

  it('does not hold a large file in memory', async () => {
    // The whole point. A megabyte is small enough to keep the test quick and
    // large enough that buffering it would show.
    const encoded = await encodeRequest({ chat_id: 1, document: media.path(file) })
    const reader = (encoded.body as ReadableStream<Uint8Array>).getReader()

    const before = process.memoryUsage().heapUsed
    await reader.read()
    await reader.read()
    const after = process.memoryUsage().heapUsed

    expect(after - before).toBeLessThan(600_000)
    await reader.cancel()
  })

  it('keeps a buffered upload on the FormData path', async () => {
    const encoded = await encodeRequest({
      chat_id: 1,
      photo: media.buffer(new Uint8Array([1, 2, 3]), 'cat.jpg'),
    })

    expect(encoded.body).toBeInstanceOf(FormData)
    expect(encoded.contentType).toBeUndefined()
  })

  it('rewrites a nested stream to attach:// and adds it as a part', async () => {
    const encoded = await encodeRequest({
      chat_id: 1,
      media: [{ type: 'document', media: media.path(file) }],
    })

    expect(encoded.body).toBeInstanceOf(ReadableStream)

    const written = await text(encoded.body as ReadableStream<Uint8Array>)
    expect(written).toContain('attach://')
    expect(written).toContain('filename="big.txt"')
  })
})
