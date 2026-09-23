/**
 * The one thing a Node stream needs that a browser has no answer for.
 *
 * Separated so that `node:stream` is reached through a dynamic import of a
 * module the `browser` field substitutes — the same arrangement the crypto
 * backend and the socket use. Nothing else about a download differs between the
 * runtimes.
 */

import type { NodeReadable } from './streams.js'

/**
 * Wrap an async generator as a Node `Readable`.
 *
 * `Readable.from` pulls: it calls `next()` when the stream is drained and not
 * before, which is the same backpressure the generator already provides.
 * Destroying the stream — explicitly, or because a pipeline downstream failed —
 * returns the generator, so the transfer behind it is abandoned.
 */
export async function readableFrom(
  chunks: AsyncGenerator<Uint8Array, void, undefined>,
  highWaterMark?: number,
): Promise<NodeReadable> {
  const { Readable } = await import('node:stream')

  return Readable.from(chunks, {
    objectMode: false,
    ...(highWaterMark === undefined ? {} : { highWaterMark }),
  }) as unknown as NodeReadable
}
