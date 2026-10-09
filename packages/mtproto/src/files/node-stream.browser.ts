// SPDX-License-Identifier: MPL-2.0

/**
 * What a Node stream is, where there is no Node.
 *
 * Substituted for `node-stream.ts` by the `browser` field. A browser has no
 * `node:stream`, so asking for a Node `Readable` is an error — stated at the
 * call, rather than as a bundler failing to resolve a built-in module in a
 * package the program never asked for a Node stream from.
 *
 * The rest of a download is unaffected: {@link downloadAsStream} hands back a
 * `ReadableStream`, which a browser does have.
 */

import { ConfigError } from '@yuigram/core'
import type { NodeReadable } from './streams.js'

/** A Node stream, which this runtime has none of. */
export async function readableFrom(
  chunks: AsyncGenerator<Uint8Array, void, undefined>,
  highWaterMark?: number,
): Promise<NodeReadable> {
  void highWaterMark

  // The transfer has already started. Abandoning it is what keeps a refused
  // call from leaving ranges being fetched for a file nobody will read.
  await chunks.return(undefined)

  throw new ConfigError(
    'this runtime has no `node:stream` — download to a `ReadableStream` or iterate the chunks instead',
  )
}
