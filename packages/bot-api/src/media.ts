/**
 * Where a file comes from.
 *
 * Telegram accepts three things in a media parameter, and the difference
 * matters: a `file_id` reuses something already on their servers, a URL asks
 * them to fetch it, and bytes are a multipart upload. All three are "a string
 * or an upload" to the type system, which is why saying which one you meant is
 * worth a word:
 *
 * ```ts
 * await message.sendPhoto({ photo: media.path('./cat.jpg') })
 * await message.sendPhoto({ photo: media.url('https://example.com/cat.jpg') })
 * await message.sendPhoto({ photo: media.id(previous.photo[0].file_id) })
 * ```
 *
 * ## Nothing is read until it is sent
 *
 * `media.path` does not open the file. It returns a description of an upload
 * whose bytes are produced when the request is encoded, so building a keyboard
 * of ten attachments and sending one of them opens one file. A handler that
 * returns early, or a call that fails validation before it reaches the network,
 * never touches the disk.
 *
 * ## Why `url` and `id` return strings
 *
 * Because that is what they are. Telegram's own parameter takes the string
 * directly, and wrapping it would mean unwrapping it again on the way out for
 * no gain. The functions exist to say which kind of string it is at the call
 * site, where a bare one is ambiguous.
 */

import { ValidationError } from '@yuigram/core'
import { markSingleUse, type NamedFile } from './input-file.js'

/** A stream of bytes, in either form the platform produces. */
export type StreamSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>

/** Options shared by the byte-carrying sources. */
export interface MediaOptions {
  /** MIME type, when it is known and worth stating. */
  readonly contentType?: string
}

/** Guess a filename from a path, for the multipart part name. */
function basename(path: string): string {
  const cleaned = path.split(/[\\/]/).pop() ?? path
  return cleaned === '' ? 'file' : cleaned
}

/**
 * A file on disk.
 *
 * The bytes are streamed when the request is encoded, so a large file never
 * has to fit in memory and an unused source never opens a handle.
 */
export function path(
  filePath: string,
  options: MediaOptions & { filename?: string } = {},
): NamedFile {
  if (filePath === '') throw new ValidationError('a file path cannot be empty')

  return {
    // An async generator function returns its iterator without running the
    // body, so the file opens on the first read rather than here.
    get data(): AsyncIterable<Uint8Array> {
      return readFile(filePath)
    },
    filename: options.filename ?? basename(filePath),
    ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
  }
}

/** Stream a file's bytes, opening it on first read. */
async function* readFile(filePath: string): AsyncGenerator<Uint8Array> {
  const { createReadStream } = await import('node:fs')

  for await (const chunk of createReadStream(filePath)) {
    yield chunk as Uint8Array
  }
}

/**
 * A file Telegram should fetch itself.
 *
 * Telegram downloads it, which means the size limits and the timeouts are
 * theirs rather than yours — usually what you want for anything already
 * published on the web.
 */
export function url(target: string | URL): string {
  const value = typeof target === 'string' ? target : target.href

  if (!/^https?:\/\//i.test(value)) {
    throw new ValidationError(
      `media.url expects an http(s) URL, got '${value}'. Use media.path for a local file.`,
    )
  }

  return value
}

/**
 * A file already on Telegram's servers.
 *
 * Reusing a `file_id` is free and instant, and it is the reason to keep the id
 * of anything a bot sends more than once.
 */
export function id(fileId: string): string {
  if (fileId === '') throw new ValidationError('a file_id cannot be empty')
  return fileId
}

/** Bytes already in memory. */
export function buffer(
  data: Uint8Array | ArrayBuffer,
  filename: string,
  options: MediaOptions = {},
): NamedFile {
  return {
    data,
    filename,
    ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
  }
}

/** A stream of bytes from anywhere. */
export function stream(
  source: StreamSource | (() => StreamSource),
  filename: string,
  options: MediaOptions = {},
): NamedFile {
  const contentType = options.contentType === undefined ? {} : { contentType: options.contentType }

  // A factory can be asked twice, so it is replayable and needs no guard: a
  // retry simply opens a second stream.
  if (typeof source === 'function') {
    return {
      get data(): StreamSource {
        return source()
      },
      filename,
      ...contentType,
    }
  }

  // A stream is read once and is then empty. Encoding happens per attempt, so
  // a retried request would re-encode this one and send nothing — an upload
  // that silently succeeds with no bytes. Marking it single-use lets the
  // encoder refuse the second attempt with an error naming the cause.
  return markSingleUse({ data: source, filename, ...contentType }, filename)
}

/** Text, encoded as UTF-8. */
export function text(content: string, filename = 'file.txt'): NamedFile {
  return {
    data: new TextEncoder().encode(content),
    filename,
    contentType: 'text/plain; charset=utf-8',
  }
}

/** A value, serialized as JSON. */
export function json(value: unknown, filename = 'file.json'): NamedFile {
  return {
    data: new TextEncoder().encode(JSON.stringify(value, null, 2)),
    filename,
    contentType: 'application/json',
  }
}

/** A `Blob` or `File`, as the platform produces them. */
export function blob(data: Blob, filename?: string): NamedFile | Blob {
  if (filename === undefined) return data
  return { data, filename }
}

/**
 * Every media source, under one name.
 *
 * A namespace rather than eight exports, so the choice between them is made by
 * typing `media.` and reading three words rather than by remembering which of
 * `fromPath`, `fromUrl` and `fromFileId` this framework calls them.
 */
export const media = Object.freeze({ path, url, id, buffer, stream, text, json, blob })
