/**
 * Multipart that streams.
 *
 * `FormData` is the right encoder for bytes already in memory: the runtime
 * builds the envelope, computes the length and sets the boundary. It is the
 * wrong one for a file on disk, because `Blob` cannot wrap a stream — the whole
 * file has to be read before the first byte goes out.
 *
 * So the envelope is written here instead, as a stream of chunks: field
 * headers, then the file's own bytes as they arrive, then the terminator. A
 * 2 GB upload against a local Bot API server costs one buffer at a time rather
 * than 2 GB of resident memory.
 *
 * ## Backpressure
 *
 * The body is a `ReadableStream` built from an async generator, so nothing is
 * produced until the transport pulls. A slow socket therefore slows the read
 * from disk rather than filling memory with what it has not sent yet.
 *
 * ## Cancellation
 *
 * Cancelling the stream — an aborted request, a failed connection — returns
 * from the generator, which runs the `finally` inside each source iterator and
 * closes the file handle. Nothing is left open by a request that did not
 * finish.
 */

import { ValidationError } from '@yuigram/core'
import type { InputFile, NamedFile } from '../input-file.js'
import { isInputFile } from '../input-file.js'

/** Bytes as the encoder moves them. */
const encoder = new TextEncoder()

/** Line ending multipart requires, and which is not the platform's. */
const CRLF = '\r\n'

/** Default content type for a part whose source did not name one. */
const OCTET_STREAM = 'application/octet-stream'

/**
 * Whether a value must be streamed rather than buffered.
 *
 * Only a source that cannot become a `Blob` without being read: a Node or Web
 * stream, or an async iterable. Bytes, `ArrayBuffer` and `Blob` are already
 * resident, so streaming them buys nothing and costs the runtime's own
 * length computation.
 */
export function isStreamingSource(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false

  if (value instanceof ReadableStream) return true
  if (value instanceof Blob) return false
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return false

  if (Symbol.asyncIterator in value) return true

  // A named file streams when what it names does.
  if ('data' in value && 'filename' in value) {
    return isStreamingSource((value as NamedFile).data)
  }

  return false
}

/** Whether any upload anywhere in the parameters has to be streamed. */
export function hasStreamingUpload(value: unknown, depth = 0): boolean {
  if (depth > 8) return false
  if (isInputFile(value) && isStreamingSource(value)) return true

  if (Array.isArray(value)) {
    return value.some((item) => hasStreamingUpload(item, depth + 1))
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((item) => hasStreamingUpload(item, depth + 1))
  }

  return false
}

/** One part of the envelope. */
export interface Part {
  readonly name: string
  readonly value: InputFile | string
}

/**
 * A boundary no payload can contain.
 *
 * Random rather than derived: a boundary that appears in the body corrupts the
 * envelope, and Telegram's answer to a corrupt envelope names a parameter
 * rather than the boundary.
 */
export function createBoundary(): string {
  const random = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0'),
  ).join('')

  return `----YuigramFormBoundary${random}`
}

/** Escape a filename for a header, since a quote there ends the value early. */
function escapeHeaderValue(value: string): string {
  return value.replace(/"/g, '%22').replace(/[\r\n]/g, '')
}

/** Read a named file's filename and type, if it declares them. */
function describe(file: InputFile): { filename?: string; contentType?: string } {
  if (typeof file === 'object' && file !== null && 'data' in file && 'filename' in file) {
    const named = file as NamedFile
    return {
      filename: named.filename,
      ...(named.contentType === undefined ? {} : { contentType: named.contentType }),
    }
  }

  return {}
}

/** Yield a source's bytes, whatever kind of source it is. */
async function* bytesOf(file: InputFile): AsyncGenerator<Uint8Array> {
  if (typeof file === 'object' && file !== null && 'data' in file && 'filename' in file) {
    yield* bytesOf((file as NamedFile).data as InputFile)
    return
  }

  if (file instanceof Uint8Array) {
    yield file
    return
  }

  if (file instanceof ArrayBuffer) {
    yield new Uint8Array(file)
    return
  }

  if (file instanceof Blob) {
    // A `Blob`'s own stream, so a large one is still read in pieces.
    yield* readWebStream(file.stream())
    return
  }

  if (file instanceof ReadableStream) {
    yield* readWebStream(file as ReadableStream<Uint8Array>)
    return
  }

  if (typeof file === 'object' && file !== null && Symbol.asyncIterator in file) {
    for await (const chunk of file as AsyncIterable<Uint8Array | string>) {
      yield typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    }
    return
  }

  throw new ValidationError('unsupported upload; expected bytes, a Blob, a stream or a named file')
}

/**
 * Read a Web stream as an async iterable.
 *
 * `ReadableStream` is only async-iterable on some runtimes, so the reader is
 * driven directly. The reader is released in `finally`, which is what lets a
 * cancelled request stop the source rather than leaving it locked.
 */
async function* readWebStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      if (value !== undefined) yield value
    }
  } finally {
    reader.releaseLock()
  }
}

/** Build the header block for one part. */
function headerFor(part: Part, boundary: string): Uint8Array {
  const lines = [`--${boundary}`]

  if (typeof part.value === 'string') {
    lines.push(`Content-Disposition: form-data; name="${escapeHeaderValue(part.name)}"`)
  } else {
    const { filename, contentType } = describe(part.value)
    const nameAttribute = `name="${escapeHeaderValue(part.name)}"`
    const fileAttribute =
      filename === undefined ? '' : `; filename="${escapeHeaderValue(filename)}"`

    lines.push(`Content-Disposition: form-data; ${nameAttribute}${fileAttribute}`)
    lines.push(`Content-Type: ${contentType ?? OCTET_STREAM}`)
  }

  return encoder.encode(`${lines.join(CRLF)}${CRLF}${CRLF}`)
}

/**
 * Write the whole envelope as a stream of chunks.
 *
 * Exported as a generator rather than a stream so the encoder can hand it
 * straight to `ReadableStream.from`, and so tests can consume it without a
 * transport.
 */
export async function* writeMultipart(
  parts: readonly Part[],
  boundary: string,
): AsyncGenerator<Uint8Array> {
  for (const part of parts) {
    yield headerFor(part, boundary)

    if (typeof part.value === 'string') {
      yield encoder.encode(part.value)
    } else {
      yield* bytesOf(part.value)
    }

    yield encoder.encode(CRLF)
  }

  yield encoder.encode(`--${boundary}--${CRLF}`)
}

/**
 * A streaming multipart body, and the content type that describes it.
 *
 * The content type must be set explicitly here, unlike the `FormData` path
 * where the runtime derives it: a hand-built envelope needs its boundary
 * announced, and a missing one is a `400` that names a parameter instead.
 */
export function streamMultipart(parts: readonly Part[]): {
  body: ReadableStream<Uint8Array>
  contentType: string
} {
  const boundary = createBoundary()

  return {
    body: ReadableStream.from(writeMultipart(parts, boundary)),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}
