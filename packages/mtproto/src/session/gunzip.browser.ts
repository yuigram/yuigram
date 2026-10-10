// SPDX-License-Identifier: MIT

/**
 * How a runtime without `node:zlib` decompresses.
 *
 * Substituted for `gunzip.ts` by the `browser` field. `DecompressionStream` is
 * present in every browser this would run in and is native, but it is
 * asynchronous, and a compressed answer is unwrapped in the middle of
 * flattening a container — several frames below anything that could await. So
 * the decompressor is in `inflate.ts`, and this is the seam it is reached
 * through.
 */

import { gunzipPortable } from './inflate.js'

/** Decompress a gzip member, refusing to produce more than `limit` bytes. */
export function gunzip(packed: Uint8Array, limit: number): Uint8Array {
  return gunzipPortable(packed, limit)
}
