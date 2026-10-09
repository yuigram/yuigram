// SPDX-License-Identifier: MPL-2.0

/**
 * The two things a download does that need a filesystem.
 *
 * Reading a file a local Bot API server left on disk, and writing one straight
 * to disk rather than through memory. Everything else about a download — the
 * URL, the path validation, the fetch — is the same wherever it runs, so only
 * these two are here, and only these two are substituted by `files-node.browser.ts`
 * where there is no filesystem.
 *
 * Both are reached through a dynamic import so that a program which never
 * downloads to disk never loads them.
 */

/** A file on disk, as a byte stream. */
export async function readFileStream(path: string): Promise<ReadableStream<Uint8Array>> {
  const { createReadStream } = await import('node:fs')
  const { Readable } = await import('node:stream')

  return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>
}

/** A byte stream, written to a file on disk without passing through memory. */
export async function writeFileStream(
  path: string,
  stream: ReadableStream<Uint8Array>,
): Promise<void> {
  const { createWriteStream } = await import('node:fs')
  const { Readable } = await import('node:stream')
  const { pipeline } = await import('node:stream/promises')

  await pipeline(Readable.fromWeb(stream), createWriteStream(path))
}

/** A file on disk, as chunks, opened on the first read. */
export async function* readFileChunks(path: string): AsyncGenerator<Uint8Array> {
  const { createReadStream } = await import('node:fs')

  for await (const chunk of createReadStream(path)) {
    yield chunk as Uint8Array
  }
}
