/**
 * RSA with Telegram's padding.
 *
 * Verified against the platform's own RSA rather than against itself: a keypair
 * is generated here, the public operation is performed by the implementation,
 * and the result is decrypted by `node:crypto` with padding disabled. If the
 * exponentiation or the byte order were wrong, the recovered block would not
 * match.
 *
 * On top of that, each padding construction is undone in the test — step by
 * step, from the published description — so the recovered payload proves the
 * whole scheme and not merely the exponentiation.
 */

import type { KeyObject } from 'node:crypto'
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { ValidationError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { bytesToBigIntBE, concatBytes } from '../src/crypto/bytes.js'
import { sha1, sha256 } from '../src/crypto/hash.js'
import { igeEncrypt } from '../src/crypto/ige.js'
import { type RsaPublicKey, rsaEncryptLegacy, rsaEncryptPadded, rsaRaw } from '../src/crypto/rsa.js'

let key: RsaPublicKey
let privateKey: KeyObject

beforeAll(() => {
  // Generated rather than committed: a PEM private key in the repository is a
  // secret-scanner finding even when it protects nothing.
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = pair.publicKey.export({ format: 'jwk' })

  const fromBase64Url = (value: string): bigint =>
    bytesToBigIntBE(new Uint8Array(Buffer.from(value, 'base64url')))

  key = { n: fromBase64Url(jwk.n ?? ''), e: fromBase64Url(jwk.e ?? '') }
  privateKey = pair.privateKey
})

/** Undo the public operation with the platform's private key. */
function decryptRaw(block: Uint8Array): Uint8Array {
  return new Uint8Array(
    privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(block)),
  )
}

/** A deterministic stand-in for the CSPRNG, so a construction can be replayed. */
function fixedRandom(fill: number): (length: number) => Uint8Array {
  return (length: number) => new Uint8Array(length).fill(fill)
}

/**
 * A deterministic source whose draws differ.
 *
 * `rsa_pad` draws the payload padding once and a temporary key per attempt, so
 * a source that repeats itself can never satisfy the modulus check if its first
 * block does not. This yields a distinct, reproducible block each time.
 */
function scriptedRandom(seed: number): (length: number) => Uint8Array {
  let draw = 0
  return (length: number) => {
    const value = draw
    draw += 1
    return Uint8Array.from({ length }, (_, index) => (seed + value * 97 + index * 31) & 0xff)
  }
}

/** AES-256-IGE decryption, written here so `rsa_pad` is undone independently. */
function igeDecryptReference(data: Uint8Array, aesKey: Uint8Array, iv: Uint8Array): Uint8Array {
  const decipher = createDecipheriv('aes-256-ecb', aesKey, null)
  decipher.setAutoPadding(false)

  const out = new Uint8Array(data.length)
  let previousCipher = iv.subarray(0, 16)
  let previousPlain = iv.subarray(16, 32)

  for (let offset = 0; offset < data.length; offset += 16) {
    const encrypted = data.subarray(offset, offset + 16)
    const input = Uint8Array.from(encrypted, (value, index) => value ^ (previousPlain[index] ?? 0))
    const block = new Uint8Array(decipher.update(input))
    const plain = Uint8Array.from(block, (value, index) => value ^ (previousCipher[index] ?? 0))

    out.set(plain, offset)
    previousCipher = encrypted
    previousPlain = plain
  }

  return out
}

describe('rsaRaw against the platform', () => {
  it('performs m^e mod n so the private key recovers m', () => {
    const message = new Uint8Array(256)
    message[1] = 0x42
    message[128] = 0xa7
    message[255] = 0x99

    expect([...decryptRaw(rsaRaw(message, key))]).toEqual([...message])
  })

  it('always produces the full modulus width', () => {
    // A small value must still come back 256 bytes, or every downstream length
    // check shifts.
    expect(rsaRaw(Uint8Array.of(2), key).length).toBe(256)
  })

  it('refuses an input that is not below the modulus', () => {
    expect(() => rsaRaw(new Uint8Array(256).fill(0xff), key)).toThrow(/not less than the modulus/)
  })

  it('refuses a degenerate key', () => {
    expect(() => rsaRaw(Uint8Array.of(1), { n: 0n, e: 65_537n })).toThrow(ValidationError)
    expect(() => rsaRaw(Uint8Array.of(1), { n: key.n, e: 0n })).toThrow(ValidationError)
  })
})

describe('rsa_pad', () => {
  it('produces a 256-byte block below the modulus', () => {
    const encrypted = rsaEncryptPadded(new Uint8Array(144).fill(0x11), key)

    expect(encrypted.length).toBe(256)
    expect(bytesToBigIntBE(encrypted)).toBeLessThan(key.n)
  })

  it('recovers the payload when the construction is undone step by step', () => {
    const data = Uint8Array.from({ length: 100 }, (_, index) => (index * 13 + 5) & 0xff)
    const random = scriptedRandom(0)
    const expectedPadding = scriptedRandom(0)(192 - data.length)

    const block = decryptRaw(rsaEncryptPadded(data, key, random))

    // Split, unmask the temporary key, decrypt, un-reverse.
    const maskedKey = block.subarray(0, 32)
    const encrypted = block.subarray(32)
    const tempKey = Uint8Array.from(
      maskedKey,
      (value, index) => value ^ (sha256(encrypted)[index] ?? 0),
    )
    const withHash = igeDecryptReference(encrypted, tempKey, new Uint8Array(32))
    const padded = Uint8Array.from(withHash.subarray(0, 192)).reverse()

    expect([...padded.subarray(0, data.length)]).toEqual([...data])
    // The trailing padding is whatever the source supplied, in the order it
    // supplied it — the payload is padded before it is reversed.
    expect([...padded.subarray(data.length)]).toEqual([...expectedPadding])
    // And the hash binds the temporary key to the padded payload.
    expect([...withHash.subarray(192)]).toEqual([...sha256(tempKey, padded)])
  })

  it('differs between calls, because the padding is fresh', () => {
    const data = new Uint8Array(16).fill(3)

    expect([...rsaEncryptPadded(data, key)]).not.toEqual([...rsaEncryptPadded(data, key)])
  })

  it('skips draws that are not below the modulus', () => {
    // A modulus of exactly 2^2047 accepts a block only when its top bit is
    // clear, which rejects about half of them. Replaying the construction here
    // says which draw the implementation must have settled on, so the retry is
    // observed rather than assumed.
    const modulus: RsaPublicKey = { n: 1n << 2047n, e: 3n }
    const data = new Uint8Array(8).fill(0x0f)

    const replay = scriptedRandom(7)
    const padded = concatBytes(data, replay(192 - data.length))
    const reversed = Uint8Array.from(padded).reverse()

    let accepted = -1
    let acceptedBlock: Uint8Array = new Uint8Array()
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const tempKey = replay(32)
      const encrypted = igeEncrypt(
        concatBytes(reversed, sha256(tempKey, padded)),
        tempKey,
        new Uint8Array(32),
      )
      const candidate = concatBytes(
        Uint8Array.from(tempKey, (value, index) => value ^ (sha256(encrypted)[index] ?? 0)),
        encrypted,
      )

      if (bytesToBigIntBE(candidate) < modulus.n) {
        accepted = attempt
        acceptedBlock = candidate
        break
      }
    }

    // The seed is chosen so the first draw is refused; without that this test
    // would pass without the loop ever running twice.
    expect(accepted).toBeGreaterThan(0)

    const encrypted = rsaEncryptPadded(data, modulus, scriptedRandom(7))
    expect([...encrypted]).toEqual([...rsaRaw(acceptedBlock, modulus)])
  })

  it('gives up rather than looping when no draw succeeds', () => {
    // A modulus of 1 makes every block too large, so the bounded loop is the
    // only thing standing between this call and a hang.
    expect(() => rsaEncryptPadded(new Uint8Array(8), { n: 1n, e: 3n })).toThrow(
      /could not produce a value below the modulus/,
    )
  })

  it('refuses a payload over 144 bytes', () => {
    expect(() => rsaEncryptPadded(new Uint8Array(145), key)).toThrow(/at most 144 bytes/)
  })
})

describe('legacy padding', () => {
  it('prefixes the payload with its SHA-1 and pads to 255 bytes', () => {
    const data = Uint8Array.from({ length: 60 }, (_, index) => index)
    const block = decryptRaw(rsaEncryptLegacy(data, key, fixedRandom(0x7f)))

    // The block is 256 bytes with one leading zero, because the construction
    // fills 255.
    expect(block.length).toBe(256)
    expect(block[0]).toBe(0)

    const body = block.subarray(1)
    expect([...body.subarray(0, 20)]).toEqual([...sha1(data)])
    expect([...body.subarray(20, 20 + data.length)]).toEqual([...data])
    expect([...body.subarray(20 + data.length)]).toEqual(Array(255 - 20 - data.length).fill(0x7f))
  })

  it('refuses a payload that leaves no room for the hash', () => {
    expect(() => rsaEncryptLegacy(new Uint8Array(236), key)).toThrow(/at most 235 bytes/)
  })
})

describe('secret material', () => {
  it('keeps payload bytes out of every rejection message', () => {
    const secret = new Uint8Array(200).fill(0xde)
    let message = ''

    try {
      rsaEncryptPadded(secret, key)
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toBe('rsa_pad data must be at most 144 bytes, received 200')
    expect(message).not.toContain('de')
  })
})
