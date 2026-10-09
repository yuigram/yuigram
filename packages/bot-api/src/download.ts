// SPDX-License-Identifier: MPL-2.0

/**
 * File downloads.
 *
 * Target resolution is polymorphic, because the shapes a caller already has are
 * the shapes they want to pass: `ctx.message.photo` is a `PhotoSize[]`,
 * `ctx.message.document` is an object with a `file_id`, and a stored
 * `file_id` is a bare string. Making the caller unwrap those by hand would be
 * busywork the framework exists to remove.
 *
 * The bot's methods and a message's `download` use only what reaches the file
 * over the transport — `getFileUrl`, `fetchFileStream`, `collect` — and never
 * the forms that read or write a disk, so a bundle holding a bot drops those
 * and needs nothing a worker or a page lacks (`docs/runtimes.md` §3,
 * `tools/bench/test/portability.test.ts`).
 *
 * **No error here carries the URL.** Telegram's file endpoint requires the bot
 * token in the path, so an error mentioning the URL is an error carrying a
 * credential — and error objects are the most common way one reaches a log
 * aggregator.
 */

import type { RawApi } from './api.js'
import { ConfigError, NetworkError, ValidationError } from './core.js'
import { readFileStream, writeFileStream } from './files-node.js'
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

/**
 * Open a file as bytes arriving over the transport.
 *
 * Refuses a local Bot API server's file, which is a path on that server's disk
 * rather than something to fetch; the forms that read a disk take it.
 */
export async function fetchFileStream(
  deps: DownloadDeps,
  target: DownloadTarget,
): Promise<ReadableStream<Uint8Array>> {
  const url = await getFileUrl(deps, target)

  if (deps.local === true) {
    throw new ConfigError(
      "a local Bot API server's files are paths on its disk; read them with download(bot.files, target) or downloadToFile(bot.files, path, target)",
    )
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

/** Read a stream to its end, into one array. */
export async function collect(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
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
 * Open a byte stream for a target.
 *
 * Against a local Bot API server the file is a path on that server's disk and
 * is read from there; otherwise it arrives over the transport.
 */
export async function downloadStream(
  deps: DownloadDeps,
  target: DownloadTarget,
): Promise<ReadableStream<Uint8Array>> {
  if (deps.local === true) return await readFileStream(await getFileUrl(deps, target))
  return await fetchFileStream(deps, target)
}

/** Download a file into memory. */
export async function download(deps: DownloadDeps, target: DownloadTarget): Promise<Uint8Array> {
  return await collect(await downloadStream(deps, target))
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
  await writeFileStream(path, await downloadStream(deps, target))
}

/** Fetch a file's metadata without downloading it. */
export async function getFile(deps: DownloadDeps, target: DownloadTarget): Promise<File> {
  return deps.api.getFile({ file_id: resolveTarget(target).fileId })
}
