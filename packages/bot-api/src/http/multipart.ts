/**
 * Request encoding.
 *
 * Whether a call is JSON or multipart is decided from the **argument values**,
 * not from the schema. Telegram types `InputMedia.media` as `String` and
 * describes `attach://` uploads only in prose, so a method can carry an upload
 * while declaring no `InputFile` anywhere in its parameter graph. Inspecting
 * what the caller actually passed is correct for both cases.
 *
 * Nested uploads are rewritten to `attach://<name>` and appended as their own
 * parts, which is the mechanism Telegram documents for `sendMediaGroup` and the
 * `InputMedia` family.
 */

import { type InputFile, isInputFile, type NamedFile } from '../input-file.js'

/** A request ready to send. */
export interface EncodedRequest {
  readonly body: string | FormData
  /** Omitted for multipart, where the runtime sets the boundary itself. */
  readonly contentType: string | undefined
}

/** Whether any value in the parameters is an upload, at any depth. */
export function hasUpload(value: unknown, depth = 0): boolean {
  if (depth > 8) return false
  if (isInputFile(value)) return true

  if (Array.isArray(value)) {
    return value.some((item) => hasUpload(item, depth + 1))
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((item) => hasUpload(item, depth + 1))
  }

  return false
}

/** Convert an upload into something `FormData` accepts. */
function toBlobPart(file: InputFile): { value: Blob | string; filename: string | undefined } {
  if (file instanceof Blob) return { value: file, filename: undefined }

  if (file instanceof Uint8Array) {
    // The view is passed whole rather than its `.buffer`, which would ignore
    // byteOffset and byteLength and send the entire backing store for a
    // subarray. The assertion narrows away `SharedArrayBuffer`, which `Blob`
    // rejects at runtime anyway and which no upload realistically uses.
    return { value: new Blob([file as Uint8Array<ArrayBuffer>]), filename: undefined }
  }

  if (file instanceof ArrayBuffer) {
    return { value: new Blob([file]), filename: undefined }
  }

  if (isNamedFile(file)) {
    const inner = toBlobPart(file.data as InputFile)
    const blob =
      file.contentType === undefined || !(inner.value instanceof Blob)
        ? inner.value
        : new Blob([inner.value], { type: file.contentType })

    return { value: blob, filename: file.filename }
  }

  // A stream: `Blob` cannot take one directly, so it is the caller's job to
  // buffer. Surfacing that as an explicit failure beats silently sending
  // "[object Object]".
  throw new TypeError(
    'streaming uploads are not supported by this encoder; buffer the stream first',
  )
}

/** Whether a value carries an explicit filename. */
function isNamedFile(value: unknown): value is NamedFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'filename' in value &&
    typeof (value as NamedFile).filename === 'string'
  )
}

/** Collected attachments, keyed by the generated `attach://` name. */
interface Attachments {
  readonly parts: Map<string, InputFile>
  next: number
}

/**
 * Replace nested uploads with `attach://` references.
 *
 * Top-level uploads stay in place — they become their own form field — but one
 * inside an object or array cannot, because that value is serialized as JSON.
 */
function extractNested(value: unknown, attachments: Attachments, depth = 0): unknown {
  if (depth > 8) return value

  if (isInputFile(value)) {
    const name = `file_${attachments.next++}`
    attachments.parts.set(name, value)
    return `attach://${name}`
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractNested(item, attachments, depth + 1))
  }

  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = extractNested(item, attachments, depth + 1)
    }
    return out
  }

  return value
}

/** Serialize one parameter value for a form field. */
function toFieldValue(value: unknown): string {
  // The Bot API expects nested structures as JSON strings inside multipart.
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Encode call parameters, choosing JSON or multipart from the values given. */
export function encodeRequest(params: Record<string, unknown>): EncodedRequest {
  const omitted = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  )

  if (!hasUpload(omitted)) {
    return { body: JSON.stringify(omitted), contentType: 'application/json' }
  }

  const form = new FormData()
  const attachments: Attachments = { parts: new Map(), next: 0 }

  for (const [key, value] of Object.entries(omitted)) {
    if (isInputFile(value)) {
      const part = toBlobPart(value)
      if (part.filename === undefined) form.append(key, part.value)
      else form.append(key, part.value, part.filename)
      continue
    }

    const rewritten = extractNested(value, attachments)
    form.append(key, toFieldValue(rewritten))
  }

  for (const [name, file] of attachments.parts) {
    const part = toBlobPart(file)
    if (part.filename === undefined) form.append(name, part.value)
    else form.append(name, part.value, part.filename)
  }

  // Content type is left unset so the runtime generates the boundary.
  return { body: form, contentType: undefined }
}
