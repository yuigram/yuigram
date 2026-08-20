/**
 * File downloads.
 *
 * Target resolution is polymorphic, because the shapes a caller already has are
 * the shapes they want to pass: `ctx.message.photo` is a `PhotoSize[]`,
 * `ctx.message.document` is an object with a `file_id`, and a stored
 * `file_id` is a bare string. Making the caller unwrap those by hand would be
 * busywork the framework exists to remove.
 *
 * **No error here carries the URL.** Telegram's file endpoint requires the bot
 * token in the path, so an error mentioning the URL is an error carrying a
 * credential — and error objects are the most common way one reaches a log
 * aggregator.
 */

import { ConfigError, NetworkError, ValidationError } from '@yuigram/core'
import type { RawApi } from './api.js'
import type { File, PhotoSize } from './generated/types/index.js'
import type { HttpClient } from './http/client.js'

/** Anything a download can be addressed by. */
export type DownloadTarget =
  /** A bare `file_id`. */
  | string
  /** Any object carrying a `file_id`, such as a `Document` or a `File`. */
  | { readonly file_id: string; readonly file_path?: string | undefined }
  /** A photo's size list; the largest is chosen. */
  | readonly PhotoSize[]

/** A target reduced to what a download needs. */
interface ResolvedTarget {
  readonly fileId: string
  /** Present when the caller already had it, saving a `getFile` round trip. */
  readonly filePath: string | undefined
}

/**
 * Rank a photo size.
 *
 * `file_size` is optional, so pixel area is the fallback — it orders the same
 * way for any real photo.
 */
function sizeRank(size: PhotoSize): number {
  return size.file_size ?? size.width * size.height
}

/** Pick the largest of a photo's sizes. */
function largest(sizes: readonly PhotoSize[]): PhotoSize {
  const [first, ...rest] = sizes

  if (first === undefined) {
    throw new ValidationError('cannot download from an empty photo size array')
  }

  return rest.reduce((best, size) => (sizeRank(size) > sizeRank(best) ? size : best), first)
}

/** Reduce any accepted target to a file id and, when known, a path. */
export function resolveTarget(target: DownloadTarget): ResolvedTarget {
  if (typeof target === 'string') {
    return { fileId: target, filePath: undefined }
  }

  if (Array.isArray(target)) {
    return resolveTarget(largest(target as readonly PhotoSize[]))
  }

  const record = target as { file_id?: unknown; file_path?: unknown }

  if (typeof record.file_id !== 'string') {
    throw new ValidationError(
      'download target has no file_id; pass a file_id, a photo size array, or an object carrying one',
    )
  }

  return {
    fileId: record.file_id,
    filePath: typeof record.file_path === 'string' ? record.file_path : undefined,
  }
}

/** What the download helpers need. */
export interface DownloadDeps {
  readonly api: RawApi
  readonly client: HttpClient
  /** True when pointed at a local Bot API server, which serves paths on disk. */
  readonly local?: boolean
}

/**
 * Reject a `file_path` that would escape where it belongs.
 *
 * `file_path` comes from the API server, which is trusted only as far as the
 * deployment makes it so. Pointed at a third-party proxy — or at a server that
 * has been compromised — it is attacker-controlled, and it is used two ways:
 * interpolated into the download URL, and, against a local Bot API server, as a
 * path handed to `createReadStream`. A `..` segment therefore reads an
 * arbitrary local file, and a scheme turns the download into a request
 * somewhere else.
 *
 * Telegram's own paths look like `photos/file_1.jpg`; a local server returns an
 * absolute path, which stays allowed because that is its documented behaviour.
 */
function assertSafeFilePath(filePath: string): void {
  // Both separators: a local Bot API server on Windows reports backslashes.
  const segments = filePath.split(/[\\/]+/)

  if (segments.includes('..')) {
    // The path is not quoted: on a local server it names a real file, and a
    // rejected path is exactly the thing not to copy into a log.
    throw new ValidationError('Telegram returned a file_path containing a parent-directory segment')
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(filePath)) {
    throw new ValidationError('Telegram returned a file_path that looks like a URL')
  }

  if (filePath.includes('\0')) {
    throw new ValidationError('Telegram returned a file_path containing a null byte')
  }
}

/**
 * Resolve the download URL for a target.
 *
 * The result **contains the bot token**, because Telegram's file endpoint
 * requires it. Treat it as a credential: do not log it, and do not hand it to
 * a third party.
 */
export async function getFileUrl(deps: DownloadDeps, target: DownloadTarget): Promise<string> {
  const resolved = resolveTarget(target)

  // A caller who already has `file_path` — from a previous `getFile` — skips
  // the round trip entirely.
  const filePath =
    resolved.filePath ?? (await deps.api.getFile({ file_id: resolved.fileId })).file_path

  if (filePath === undefined) {
    throw new ValidationError(`Telegram returned no file_path for this file`)
  }

  assertSafeFilePath(filePath)

  if (deps.client.fileUrl === undefined) {
    throw new ConfigError('this transport cannot build file URLs')
  }

  return deps.client.fileUrl(filePath)
}

/** Open a byte stream for a target. */
export async function downloadStream(
  deps: DownloadDeps,
  target: DownloadTarget,
): Promise<ReadableStream<Uint8Array>> {
  const url = await getFileUrl(deps, target)

  if (deps.local === true) {
    const { createReadStream } = await import('node:fs')
    const { Readable } = await import('node:stream')
    return Readable.toWeb(createReadStream(url)) as ReadableStream<Uint8Array>
  }

  if (deps.client.fetchFile === undefined) {
    throw new ConfigError('this transport cannot fetch files')
  }

  const response = await deps.client.fetchFile(url)

  // The URL is deliberately absent from both messages: it carries the token.
  if (response.status >= 400) {
    throw new NetworkError(`file download failed with status ${response.status}`)
  }

  if (response.body === null) {
    throw new NetworkError('file download returned an empty body')
  }

  return response.body
}

/** Download a file into memory. */
export async function download(deps: DownloadDeps, target: DownloadTarget): Promise<Uint8Array> {
  const stream = await downloadStream(deps, target)
  const chunks: Uint8Array[] = []
  let total = 0

  for await (const chunk of stream) {
    chunks.push(chunk)
    total += chunk.byteLength
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }

  return out
}

/**
 * Download straight to disk.
 *
 * Streams rather than buffering, so a large file does not have to fit in
 * memory — the case a local Bot API server exists to enable.
 */
export async function downloadToFile(
  deps: DownloadDeps,
  path: string,
  target: DownloadTarget,
): Promise<void> {
  const stream = await downloadStream(deps, target)
  const { createWriteStream } = await import('node:fs')
  const { Readable } = await import('node:stream')
  const { pipeline } = await import('node:stream/promises')

  await pipeline(Readable.fromWeb(stream), createWriteStream(path))
}

/** Fetch a file's metadata without downloading it. */
export async function getFile(deps: DownloadDeps, target: DownloadTarget): Promise<File> {
  return deps.api.getFile({ file_id: resolveTarget(target).fileId })
}
