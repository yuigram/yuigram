// SPDX-License-Identifier: MPL-2.0

/**
 * AES in counter mode.
 *
 * The cipher is used as a keystream generator: the counter block is encrypted
 * and the result is combined with the data, so encrypting and decrypting are
 * the same operation and the length is never rounded up to a block.
 *
 * The counter block is supplied rather than derived. Counter mode says nothing
 * about where a counter starts or how it advances between uses, and the two
 * places MTProto uses it disagree — a transport stream carries one counter for
 * its whole life, while a delivery node expects the counter to say which block
 * of the file a range begins at. Deriving it here would mean picking one of
 * those and being wrong about the other.
 */

import { ValidationError } from '@yuigram/core'
import { backend } from './backend.js'
import type { CtrCipher } from './backend-types.js'

/** Bytes to an AES block. */
export const AES_BLOCK = 16

/** The only key length MTProto uses counter mode with. */
const KEY_LENGTH = 32

/** Reject a key or counter the mode cannot use, before any key material is touched. */
function check(key: Uint8Array, counter: Uint8Array): void {
  if (key.length !== KEY_LENGTH) {
    throw new ValidationError(
      `a counter-mode key must be ${KEY_LENGTH} bytes, received ${key.length}`,
    )
  }
  if (counter.length !== AES_BLOCK) {
    throw new ValidationError(
      `a counter block must be ${AES_BLOCK} bytes, received ${counter.length}`,
    )
  }
}

/**
 * Combine data with the keystream that starts at a counter block.
 *
 * Reusing a counter block under the same key with different data destroys the
 * secrecy of both, which is why callers derive the block from a position rather
 * than choosing one.
 */
export function ctrCrypt(data: Uint8Array, key: Uint8Array, counter: Uint8Array): Uint8Array {
  check(key, counter)

  return backend.ctr(key, counter).process(data)
}

/**
 * A keystream that keeps its place across calls.
 *
 * What the transport obfuscation layer needs: one of these per direction for
 * the life of a connection, fed whatever arrived from the socket rather than
 * whole blocks.
 */
export function ctrStream(key: Uint8Array, counter: Uint8Array): CtrCipher {
  check(key, counter)

  return backend.ctr(key, counter)
}

/**
 * The counter block a delivery node expects for a range.
 *
 * The initialization vector names the file and the last four bytes name the
 * block the range starts at, big-endian — so a range fetched from the middle of
 * a file decrypts to the same bytes it would have if the whole file had been
 * fetched from the start. A client that restarted the counter for every range
 * would produce plausible rubbish rather than an error.
 */
export function counterAt(iv: Uint8Array, offset: number): Uint8Array {
  if (iv.length !== AES_BLOCK) {
    throw new ValidationError(
      `an initialization vector must be ${AES_BLOCK} bytes, received ${iv.length}`,
    )
  }
  if (!Number.isInteger(offset) || offset < 0 || offset % AES_BLOCK !== 0) {
    throw new ValidationError(`a range must start on a ${AES_BLOCK}-byte block, received ${offset}`)
  }

  const counter = new Uint8Array(iv)
  new DataView(counter.buffer, counter.byteOffset).setUint32(12, offset / AES_BLOCK, false)

  return counter
}
