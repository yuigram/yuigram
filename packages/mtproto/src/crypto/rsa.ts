// SPDX-License-Identifier: MIT

/**
 * RSA as the handshake uses it.
 *
 * Telegram does not use PKCS#1 or OAEP. It defines its own padding — two
 * schemes, selected by which server key fingerprint matched — and then applies
 * the raw modular exponentiation. `node:crypto` exposes no unpadded RSA
 * operation, so the exponentiation is done over `BigInt` and the padding is
 * built here.
 *
 * Only the public operation exists. The client never holds a server private
 * key, so there is no decryption path and nothing here handles a secret
 * exponent.
 */

import { ValidationError } from '@yuigram/core'
import { modPow } from './bigint.js'
import { bigIntToBytesBE, bytesToBigIntBE, concatBytes, xorBytes } from './bytes.js'
import { sha1, sha256 } from './hash.js'
import { igeEncrypt } from './ige.js'
import { randomBytes } from './random.js'

/** RSA-2048 output width, in bytes. */
const KEY_BYTES = 256
/** `rsa_pad` pads the payload to this width before reversing it. */
const PADDED_SIZE = 192
/** Largest payload `rsa_pad` can carry. */
const MAX_PAD_DATA = 144
/** Legacy padding fills to this width, leaving one byte of headroom. */
const LEGACY_SIZE = 255
/** Largest payload the legacy scheme can carry, after its SHA-1 prefix. */
const MAX_LEGACY_DATA = LEGACY_SIZE - 20
/** Attempts before `rsa_pad` gives up finding a value below the modulus. */
const MAX_ATTEMPTS = 32

/** A Telegram server RSA key, as published in the protocol documentation. */
export interface RsaPublicKey {
  /** Modulus. */
  readonly n: bigint
  /** Public exponent. */
  readonly e: bigint
}

/** Source of the random material the padding needs. Replaced only by tests. */
export type RandomSource = (length: number) => Uint8Array

function checkKey(key: RsaPublicKey): void {
  if (key.n <= 0n) throw new ValidationError('rsa modulus must be positive')
  if (key.e <= 0n) throw new ValidationError('rsa exponent must be positive')
}

/**
 * The bare public operation, `m^e mod n`.
 *
 * Exposed because both padding schemes end with it and because it is the one
 * piece a test can check against the platform's own RSA implementation.
 */
export function rsaRaw(data: Uint8Array, key: RsaPublicKey): Uint8Array {
  checkKey(key)

  const value = bytesToBigIntBE(data)
  if (value >= key.n) throw new ValidationError('rsa input is not less than the modulus')

  return bigIntToBytesBE(modPow(value, key.e, key.n), KEY_BYTES)
}

/**
 * `rsa_pad`, used with the current server keys.
 *
 * The construction hides the payload behind a temporary AES key that is itself
 * masked by a hash of the ciphertext, so the 256-byte block carries no
 * recoverable structure to an observer without the private key.
 *
 * The retry loop is required, not defensive: the padded block is interpreted as
 * an integer, and an integer that is not below the modulus is not a valid RSA
 * input. Fresh randomness is the documented remedy.
 */
export function rsaEncryptPadded(
  data: Uint8Array,
  key: RsaPublicKey,
  random: RandomSource = randomBytes,
): Uint8Array {
  checkKey(key)

  if (data.length > MAX_PAD_DATA) {
    throw new ValidationError(
      `rsa_pad data must be at most ${MAX_PAD_DATA} bytes, received ${data.length}`,
    )
  }

  const dataWithPadding = concatBytes(data, random(PADDED_SIZE - data.length))
  const reversed = Uint8Array.from(dataWithPadding).reverse()

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const tempKey = random(32)
    const dataWithHash = concatBytes(reversed, sha256(tempKey, dataWithPadding))
    const encrypted = igeEncrypt(dataWithHash, tempKey, new Uint8Array(32))
    const maskedKey = xorBytes(tempKey, sha256(encrypted))
    const block = concatBytes(maskedKey, encrypted)

    if (bytesToBigIntBE(block) < key.n) return rsaRaw(block, key)
  }

  throw new ValidationError('rsa_pad could not produce a value below the modulus')
}

/**
 * The legacy scheme, used with older server keys.
 *
 * Kept because the key fingerprint the server offers decides which scheme
 * applies, and a client that only implements the current one cannot talk to a
 * server that offers only an old key.
 */
export function rsaEncryptLegacy(
  data: Uint8Array,
  key: RsaPublicKey,
  random: RandomSource = randomBytes,
): Uint8Array {
  checkKey(key)

  if (data.length > MAX_LEGACY_DATA) {
    throw new ValidationError(
      `legacy rsa data must be at most ${MAX_LEGACY_DATA} bytes, received ${data.length}`,
    )
  }

  const prefixed = concatBytes(sha1(data), data)
  const block = concatBytes(prefixed, random(LEGACY_SIZE - prefixed.length))

  return rsaRaw(block, key)
}
