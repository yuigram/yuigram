// SPDX-License-Identifier: MIT

/**
 * The cryptography a runtime without `node:crypto` leaves to be supplied.
 *
 * The package substitutes this module for `backend.ts` when a bundler targets a
 * browser or a worker, through the `browser` field in `package.json`. Nothing
 * here imports anything: the block cipher is in `aes.ts`, the digests are in
 * `digest.ts`, and the only thing taken from the platform is randomness, which
 * every one of these runtimes provides synchronously as `crypto.getRandomValues`.
 *
 * **Why not WebCrypto.** `crypto.subtle` is present in all of them and is
 * native, but everything it does is asynchronous, and it offers neither of the
 * two modes the protocol needs: it has no IGE at all, and its counter mode has
 * no object that keeps its place between calls. Counter mode could be rebuilt
 * over an explicit counter — that part is a matter of owning the state rather
 * than of what the platform exposes — but IGE could not, because IGE needs the
 * raw block cipher and `subtle` exposes no way to encrypt a single block. So
 * the block cipher has to be here regardless, and once it is, deriving a
 * message key through an awaited digest buys nothing and costs an await on
 * every message. `docs/runtimes.md` §4 has the comparison in full.
 *
 * This is measurably slower than the platform — roughly fifteen times on both
 * the cipher and the digests — which for messaging is a fraction of a
 * millisecond per message and for a large file transfer is the limiting factor.
 * `docs/runtimes.md` records the figures rather than leaving the difference to
 * be discovered.
 */

import { ValidationError } from '@yuigram/core'
import { CtrStream, igeDecryptPortable, igeEncryptPortable } from './aes.js'
import { type CryptoBackend, type CtrCipher, checkByteCount } from './backend-types.js'
import { md5Portable, sha1Portable, sha256Portable } from './digest.js'

/**
 * The randomness source, read once per call rather than captured.
 *
 * Read through `globalThis` so that a runtime providing it late, or a test
 * replacing it, is seen — and so that the failure where it is absent names what
 * is missing instead of throwing on a property of `undefined` at load time.
 */
function fill(out: Uint8Array): Uint8Array {
  const source = globalThis.crypto

  if (source?.getRandomValues === undefined) {
    throw new ValidationError(
      'this runtime provides no cryptographic randomness: `crypto.getRandomValues` is missing',
    )
  }

  // The interface caps one call at 65 536 bytes. Nothing the protocol asks for
  // comes close, but a caller can ask for anything, and a silent short read
  // would be a key made of zeros.
  const LIMIT = 65_536
  for (let at = 0; at < out.length; at += LIMIT) {
    // A fresh view rather than a subarray of `out`: the interface is typed for
    // a view over a plain `ArrayBuffer`, and a `Uint8Array` handed in from
    // elsewhere may be over something else.
    const chunk = new Uint8Array(Math.min(LIMIT, out.length - at))
    source.getRandomValues(chunk)
    out.set(chunk, at)
  }

  return out
}

/** The cryptography the protocol needs, without a platform to take it from. */
export const backend: CryptoBackend = {
  name: 'portable',

  sha1: (...parts) => sha1Portable(...parts),
  sha256: (...parts) => sha256Portable(...parts),
  md5: (...parts) => md5Portable(...parts),

  randomBytes: (length) => {
    checkByteCount(length)

    return fill(new Uint8Array(length))
  },

  // The in-place form rather than the shared mode module: with no platform
  // cipher returning a fresh block each time, the chaining can be written
  // straight into the output and the copy per block avoided.
  igeEncrypt: (data, key, iv) => igeEncryptPortable(data, key, iv),
  igeDecrypt: (data, key, iv) => igeDecryptPortable(data, key, iv),

  ctr: (key, counter): CtrCipher => new CtrStream(key, counter),

  constantTimeEqual: (a, b) => {
    if (a.length !== b.length) return false

    // Every byte is read and the differences are accumulated, so the work does
    // not depend on where — or whether — the two first differ. `|` rather than
    // a short-circuiting comparison is the whole point.
    let difference = 0
    for (let index = 0; index < a.length; index += 1) {
      difference |= (a[index] as number) ^ (b[index] as number)
    }

    return difference === 0
  },

  pbkdf2: async (password, salt, iterations, length) => {
    const subtle = globalThis.crypto?.subtle

    if (subtle === undefined) {
      throw new ValidationError(
        'this runtime provides no `crypto.subtle`, which is needed to stretch a password',
      )
    }

    // Imported as raw key material rather than as a key: what goes in is a
    // password, and `deriveBits` is the only operation it is allowed.
    const material = await subtle.importKey('raw', password.slice().buffer, 'PBKDF2', false, [
      'deriveBits',
    ])

    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-512', salt: salt.slice().buffer, iterations },
      material,
      length * 8,
    )

    return new Uint8Array(bits)
  },
}
