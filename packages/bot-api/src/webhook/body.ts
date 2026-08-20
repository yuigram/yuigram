/**
 * Reading a request body safely.
 *
 * The size limit is the point. A webhook endpoint is public by necessity, so
 * an unbounded read lets anyone who learns the URL exhaust the process's memory
 * with a single request that never ends. Telegram's own updates are small; the
 * default leaves several orders of magnitude of headroom and still refuses a
 * body that is obviously not one.
 */

import { ValidationError } from '@yuigram/core'

/** Default cap on a webhook request body, in bytes. */
export const DEFAULT_BODY_LIMIT = 1_048_576

/** Anything that yields chunks, which is what every Node request object is. */
export type ByteStream = AsyncIterable<Uint8Array | string>

/**
 * Read a stream into a string, refusing anything over `limit` bytes.
 *
 * The check runs per chunk rather than at the end, so an oversized body is
 * rejected while it arrives instead of after it has already been buffered.
 */
export async function readBody(stream: ByteStream, limit = DEFAULT_BODY_LIMIT): Promise<string> {
  const decoder = new TextDecoder()
  let size = 0
  let text = ''

  for await (const chunk of stream) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    size += bytes.byteLength

    if (size > limit) {
      // The size is deliberately not reported: it tells whoever is probing the
      // endpoint exactly where the cap sits.
      throw new ValidationError(`request body exceeds the ${limit} byte limit`)
    }

    text += decoder.decode(bytes, { stream: true })
  }

  return text + decoder.decode()
}

/**
 * Parse a JSON body, returning `undefined` rather than throwing.
 *
 * A malformed body is a client error, not an exceptional one: the handler
 * answers `400` for it, and a request that is not valid JSON should not produce
 * a stack trace in the log of a public endpoint.
 */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
