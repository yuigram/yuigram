// SPDX-License-Identifier: MIT

/**
 * A download as a stream.
 *
 * {@link downloadIterable} already fetches a file as a sequence the consumer
 * pulls, with the backpressure that comes from the transfer awaiting its sink.
 * These are that sequence wearing the two shapes the platforms expect — a
 * WHATWG `ReadableStream`, and a Node `Readable` — so a file can be piped into
 * whatever is already written to take one.
 *
 * ```
 *   downloadIterable  ──┬──> ReadableStream   (fetch, Response, pipeTo)
 *                       └──> Readable         (pipe, fs.createWriteStream)
 * ```
 *
 * Both are adapters rather than second implementations, and both preserve the
 * property that matters: nothing further is asked of Telegram until the
 * consumer has taken what it was given. Cancelling either one returns the
 * generator, which abandons the transfer.
 *
 * The Node shape lives behind a dynamic import of a module the `browser` field
 * substitutes, so a browser bundle never reaches `node:stream` and a program
 * that never asks for a Node stream never loads it.
 */

import type { DownloadOptions } from './download.js'
import { downloadIterable } from './download.js'

/**
 * How much may wait in the stream's queue before the download pauses.
 *
 * Counted in bytes, because the chunks are byte arrays and a count of chunks
 * would mean different amounts of memory for different part sizes. One part is
 * the useful floor: below it the queue can never fill and the stream would
 * stall.
 */
export interface StreamOptions {
  /** Bytes buffered before the transfer is asked to wait. Defaults to one part. */
  readonly highWaterMark?: number
}

/**
 * Fetch a file as a `ReadableStream`.
 *
 * The stream pulls: a chunk is fetched when the consumer asks for one and the
 * queue is below the watermark. Cancelling the stream — `cancel()`, a
 * `pipeTo` that fails, a `Response` the runtime discards — returns the
 * generator, which stops the transfer rather than leaving ranges being fetched
 * for a file nobody is reading.
 *
 * ```ts
 * const stream = downloadAsStream({ ...request })
 * await stream.pipeTo(somewhere)
 * ```
 */
export function downloadAsStream(
  options: DownloadOptions & StreamOptions,
): ReadableStream<Uint8Array> {
  return streamOf(downloadIterable(options), options.highWaterMark ?? options.limit)
}

/**
 * A `ReadableStream` over chunks something else produces.
 *
 * The transfer here, or the one a worker host is running on the other side of
 * a port: either way the stream pulls, so nothing further is asked of the
 * producer until the consumer has room, and cancelling returns the generator —
 * which is what stops the producer.
 */
export function streamOf(
  chunks: AsyncGenerator<Uint8Array, void, undefined>,
  highWaterMark?: number,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>(
    {
      // `pull` is called only when the queue is under the watermark, so this is
      // where the backpressure comes from: no call, no chunk asked for.
      pull: async (controller) => {
        try {
          const next = await chunks.next()

          if (next.done === true) {
            controller.close()

            return
          }

          controller.enqueue(next.value)
        } catch (error) {
          // The producer failed. Telling the controller is what surfaces it to
          // the consumer; the generator has already unwound.
          controller.error(error)
        }
      },
      cancel: async (reason) => {
        // Returning the generator runs its `finally`, which abandons the
        // producer. Awaited so it is stopped before `cancel`'s promise settles.
        await chunks.return(undefined)
        void reason
      },
    },
    {
      highWaterMark: highWaterMark ?? DEFAULT_WATERMARK,
      size: (chunk) => chunk.byteLength,
    },
  )
}

/** One part, when nothing says otherwise: the download's own default. */
const DEFAULT_WATERMARK = 512 * 1024

/**
 * The Node stream this hands back, named without importing `node:stream`.
 *
 * Declaring the shape rather than importing the type keeps `node:stream` out of
 * this module's type graph as well as its runtime one, so a browser build has
 * nothing to resolve. A caller in Node assigns it to a `Readable` without a
 * cast, because it is one.
 */
export interface NodeReadable {
  pipe<T>(destination: T, options?: { end?: boolean }): T
  destroy(error?: Error): unknown
  on(event: string, listener: (...args: never[]) => void): unknown
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>
}

/**
 * Fetch a file as a Node `Readable`.
 *
 * The same transfer, and the same backpressure: `Readable.from` over an async
 * generator asks for the next value only when the stream is drained, and
 * destroying the stream returns the generator.
 *
 * Only in a runtime that has `node:stream`. In a browser this rejects, saying
 * so at the call rather than as a bundler failing to resolve a built-in module.
 */
export async function downloadAsNodeStream(
  options: DownloadOptions & StreamOptions,
): Promise<NodeReadable> {
  const { readableFrom } = await import('./node-stream.js')

  return readableFrom(downloadIterable(options), options.highWaterMark ?? options.limit)
}
