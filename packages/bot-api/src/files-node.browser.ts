/**
 * What reading and writing a file on disk is, where there is no disk.
 *
 * Substituted for `files-node.ts` by the `browser` field. A browser has no
 * filesystem and no local Bot API server to read one from, so both of these are
 * errors — stated at the call, rather than as a bundler failing to resolve
 * `node:fs` in a package the program never asked to download with.
 *
 * The rest of a download is unaffected: fetching a file over the network and
 * handing it back as a stream or a `Blob` needs nothing but `fetch`.
 */

import { ConfigError } from '@yuigram/core'

/** A file on disk, which this runtime has none of. */
export function readFileStream(path: string): Promise<ReadableStream<Uint8Array>> {
  void path

  throw new ConfigError('this runtime has no filesystem, so a local file cannot be read')
}

/** A file on disk, which this runtime has none of. */
export function writeFileStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
  void path
  void stream

  throw new ConfigError('this runtime has no filesystem — download to a stream or a `Blob` instead')
}

/** A file on disk, which this runtime has none of. */
// biome-ignore lint/correctness/useYield: there is nothing to read from
export async function* readFileChunks(path: string): AsyncGenerator<Uint8Array> {
  void path

  throw new ConfigError('this runtime has no filesystem, so a local file cannot be sent')
}
