/**
 * The upload boundary.
 *
 * Telegram documents `InputFile` as an opaque "file to upload", leaving its
 * concrete shape to the client. This is that decision: the set of things
 * Yuigram will accept and stream to the API.
 *
 * Keeping it hand-written rather than generated is deliberate — the
 * documentation says nothing about it, so there is nothing to generate from,
 * and its shape is a framework choice that should be reviewed like any other.
 */

import { YuigramError } from '@yuigram/core'

/** A file being uploaded, in any form Yuigram can stream. */
export type InputFile =
  | Uint8Array
  | ArrayBuffer
  | Blob
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array>
  | NamedFile

/** An upload carrying an explicit filename and content type. */
export interface NamedFile {
  /** The bytes to send. */
  readonly data:
    | Uint8Array
    | ArrayBuffer
    | Blob
    | ReadableStream<Uint8Array>
    | AsyncIterable<Uint8Array>
  /** Filename Telegram should record. */
  readonly filename: string
  /** MIME type, when known. */
  readonly contentType?: string | undefined
}

/** Whether a value is something this client can upload. */
export function isInputFile(value: unknown): value is InputFile {
  if (value instanceof Uint8Array) return true
  if (value instanceof ArrayBuffer) return true
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return true

  if (typeof value !== 'object' || value === null) return false

  if (Symbol.asyncIterator in value) return true

  return 'data' in value && 'filename' in value && typeof (value as NamedFile).filename === 'string'
}

/**
 * Marks an upload whose bytes can only be read once.
 *
 * A `Symbol.for` key, so a file built by one copy of the package is still
 * recognised by another — a duplicated dependency should not turn a loud
 * failure into a silent empty upload.
 */
const SINGLE_USE = Symbol.for('yuigram.singleUse')

/** What the marker carries. */
interface SingleUseMark {
  /** Set when the bytes have actually been read, not merely inspected. */
  consumed: boolean
  readonly filename: string
}

/**
 * Mark an upload as readable once.
 *
 * The marker is a hidden property rather than a getter that counts reads,
 * because deciding *how* to encode a request inspects `data` before anything
 * is sent — a guard that fired on inspection would reject the first attempt.
 * Consumption is recorded by the encoder, at the point bytes are actually
 * committed to a request.
 */
export function markSingleUse<T extends object>(file: T, filename: string): T {
  Object.defineProperty(file, SINGLE_USE, {
    value: { consumed: false, filename } satisfies SingleUseMark,
    enumerable: false,
    configurable: true,
  })

  return file
}

/** Read the marker, if the value carries one. */
export function singleUseMark(value: unknown): SingleUseMark | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return (value as Record<symbol, SingleUseMark | undefined>)[SINGLE_USE]
}

/**
 * Raised when a single-use upload is asked for a second time.
 *
 * Always a retry: the first attempt read the stream, and something — a flood
 * wait, a transport failure — asked for the request again. Sending the drained
 * stream would upload an empty file and report success, so the request fails
 * instead, at the point the second attempt is encoded, where the cause is
 * still visible.
 */
export class NonReplayableUploadError extends YuigramError {
  override readonly name = 'NonReplayableUploadError'

  /** The upload that could not be replayed. */
  readonly filename: string

  constructor(filename: string) {
    super(
      `cannot retry the upload of '${filename}': the request is being sent again, and the ` +
        `stream it carried was consumed by the first attempt. Sending it now would upload an ` +
        `empty file. Pass a factory — media.stream(() => createReadStream(path), '${filename}') ` +
        `— or use media.path() or media.buffer(), so each attempt gets its own bytes.`,
    )
    this.filename = filename
  }
}

/**
 * Record that an upload's bytes are being committed to a request.
 *
 * Throws when the same single-use source is committed twice, which only
 * happens on a retry.
 */
export function claimUpload(file: unknown): void {
  const mark = singleUseMark(file)
  if (mark === undefined) return
  if (mark.consumed) throw new NonReplayableUploadError(mark.filename)

  mark.consumed = true
}
