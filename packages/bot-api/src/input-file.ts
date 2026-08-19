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
