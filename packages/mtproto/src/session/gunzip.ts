/**
 * How this runtime decompresses.
 *
 * `node:zlib` where there is one, which is Node, Bun and Deno. The `browser`
 * field substitutes `gunzip.browser.ts` for this module elsewhere, the same way
 * it chooses the cryptography and the connector.
 *
 * The bound is passed in rather than fixed here so that one ceiling governs
 * both places compression appears — around a whole message, and inside a field
 * — and a second decompressor is not a second place for it to be forgotten.
 */

import { gunzipSync } from 'node:zlib'

/** Decompress a gzip member, refusing to produce more than `limit` bytes. */
export function gunzip(packed: Uint8Array, limit: number): Uint8Array {
  return new Uint8Array(gunzipSync(packed, { maxOutputLength: limit }))
}
