// SPDX-License-Identifier: MPL-2.0

/**
 * The cipher, without the platform.
 *
 * A cipher that only agrees with itself proves nothing: an encrypt/decrypt
 * round trip passes just as happily when both directions share a mistake. So
 * the block cipher is checked against the vectors published with the standard,
 * the modes are checked against expectations computed from their definitions
 * using the platform's own block cipher as the oracle, and only then is the
 * whole thing compared against the shipping implementation over random input.
 *
 * None of the expected values here were produced by the code under test.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CtrStream,
  decryptBlock,
  encryptBlock,
  expandKey,
  igeDecryptPortable,
  igeEncryptPortable,
} from '../src/crypto/aes.js'
import { igeDecrypt, igeEncrypt } from '../src/crypto/ige.js'

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))

const hex = (data: Uint8Array): string =>
  [...data].map((byte) => byte.toString(16).padStart(2, '0')).join('')

describe('the block cipher, against the vectors published with the standard', () => {
  // FIPS-197, appendix C.3 — the worked AES-256 example. Key, plaintext and
  // ciphertext are the document's, not this implementation's.
  const KEY = bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
  const PLAIN = bytes('00112233445566778899aabbccddeeff')
  const CIPHER = '8ea2b7ca516745bfeafc49904b496089'

  it('encrypts the published block to the published ciphertext', () => {
    const out = new Uint8Array(16)

    encryptBlock(expandKey(KEY), PLAIN, 0, out, 0)

    expect(hex(out)).toBe(CIPHER)
  })

  it('decrypts the published ciphertext back to the published block', () => {
    // The other direction, against the same document. A decryption checked only
    // against this implementation's own encryption would hide a shared fault in
    // the key schedule.
    const out = new Uint8Array(16)

    decryptBlock(expandKey(KEY), bytes(CIPHER), 0, out, 0)

    expect(hex(out)).toBe(hex(PLAIN))
  })

  it('rejects a key that is not 256 bits', () => {
    expect(() => expandKey(new Uint8Array(16))).toThrow()
  })
})

describe('the block cipher, against the platform', () => {
  it('agrees on random blocks in both directions', () => {
    for (let round = 0; round < 64; round += 1) {
      const key = new Uint8Array(randomBytes(32))
      const block = new Uint8Array(randomBytes(16))
      const expanded = expandKey(key)

      const reference = createCipheriv('aes-256-ecb', key, null)
      reference.setAutoPadding(false)
      const expected = new Uint8Array(Buffer.concat([reference.update(block), reference.final()]))

      const encrypted = new Uint8Array(16)
      encryptBlock(expanded, block, 0, encrypted, 0)

      expect(hex(encrypted)).toBe(hex(expected))

      const back = createDecipheriv('aes-256-ecb', key, null)
      back.setAutoPadding(false)
      const plain = new Uint8Array(Buffer.concat([back.update(expected), back.final()]))

      const decrypted = new Uint8Array(16)
      decryptBlock(expanded, expected, 0, decrypted, 0)

      expect(hex(decrypted)).toBe(hex(plain))
    }
  })
})

/**
 * IGE computed from its definition, using the platform for the block cipher.
 *
 * No standard publishes IGE vectors, so the expectation is built here from the
 * mode's own equations with an oracle this code has no part in. That is what
 * makes it independent of the implementation under test.
 */
function igeReference(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const cipher = createCipheriv('aes-256-ecb', key, null)
  cipher.setAutoPadding(false)

  const out = new Uint8Array(data.length)
  let previousCipher = iv.subarray(0, 16)
  let previousPlain = iv.subarray(16, 32)

  for (let offset = 0; offset < data.length; offset += 16) {
    const plain = data.subarray(offset, offset + 16)
    const masked = new Uint8Array(16)

    for (let index = 0; index < 16; index += 1) {
      masked[index] = (plain[index] as number) ^ (previousCipher[index] as number)
    }

    const block = new Uint8Array(cipher.update(masked))
    const encrypted = new Uint8Array(16)

    for (let index = 0; index < 16; index += 1) {
      encrypted[index] = (block[index] as number) ^ (previousPlain[index] as number)
    }

    out.set(encrypted, offset)
    previousCipher = encrypted
    previousPlain = plain
  }

  cipher.final()

  return out
}

describe('IGE, against the mode as defined', () => {
  const KEY = bytes('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4')
  const IV = bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')

  it('encrypts to what the equations give, at several lengths', () => {
    // One block exercises only the IV; several exercise the chaining, which is
    // where a mode goes wrong without a round trip noticing.
    for (const blocks of [1, 2, 3, 8, 64]) {
      const data = new Uint8Array(randomBytes(blocks * 16))

      expect(hex(igeEncryptPortable(data, KEY, IV))).toBe(hex(igeReference(data, KEY, IV)))
    }
  })

  it('decrypts what the equations encrypted', () => {
    for (const blocks of [1, 2, 3, 8, 64]) {
      const data = new Uint8Array(randomBytes(blocks * 16))
      const encrypted = igeReference(data, KEY, IV)

      expect(hex(igeDecryptPortable(encrypted, KEY, IV))).toBe(hex(data))
    }
  })

  it('agrees with the implementation the platform backs', () => {
    // The shipping path and this one must be interchangeable, or a session
    // opened on one runtime could not be resumed on another.
    for (let round = 0; round < 16; round += 1) {
      const key = new Uint8Array(randomBytes(32))
      const iv = new Uint8Array(randomBytes(32))
      const data = new Uint8Array(randomBytes(16 * (1 + (round % 5))))

      expect(hex(igeEncryptPortable(data, key, iv))).toBe(hex(igeEncrypt(data, key, iv)))
      expect(hex(igeDecryptPortable(data, key, iv))).toBe(hex(igeDecrypt(data, key, iv)))
    }
  })

  it('refuses what the mode cannot express', () => {
    const key = new Uint8Array(32)
    const iv = new Uint8Array(32)

    expect(() => igeEncryptPortable(new Uint8Array(0), key, iv)).toThrow()
    expect(() => igeEncryptPortable(new Uint8Array(17), key, iv)).toThrow()
    expect(() => igeEncryptPortable(new Uint8Array(16), new Uint8Array(16), iv)).toThrow()
    expect(() => igeEncryptPortable(new Uint8Array(16), key, new Uint8Array(16))).toThrow()
  })
})

describe('the counter stream', () => {
  it('matches the platform over one long run', () => {
    const key = new Uint8Array(randomBytes(32))
    const iv = new Uint8Array(randomBytes(16))
    const data = new Uint8Array(randomBytes(4096))

    const reference = createCipheriv('aes-256-ctr', key, iv)
    const expected = new Uint8Array(reference.update(data))

    expect(hex(new CtrStream(key, iv).process(data))).toBe(hex(expected))
  })

  it('keeps the keystream continuous across arbitrary splits', () => {
    // The transport feeds this whatever a socket handed over, which has nothing
    // to do with block boundaries. A stream that restarted its keystream per
    // call would produce the right first packet and garbage after it.
    const key = new Uint8Array(randomBytes(32))
    const iv = new Uint8Array(randomBytes(16))
    const data = new Uint8Array(randomBytes(1000))

    const reference = createCipheriv('aes-256-ctr', key, iv)
    const expected = new Uint8Array(reference.update(data))

    for (const splits of [
      [1, 999],
      [15, 1, 16, 968],
      [7, 7, 7, 979],
      [500, 500],
    ]) {
      const stream = new CtrStream(key, iv)
      const pieces: Uint8Array[] = []
      let at = 0

      for (const size of splits) {
        pieces.push(stream.process(data.subarray(at, at + size)))
        at += size
      }

      const joined = new Uint8Array(data.length)
      let cursor = 0

      for (const piece of pieces) {
        joined.set(piece, cursor)
        cursor += piece.length
      }

      expect(hex(joined)).toBe(hex(expected))
    }
  })

  it('is its own inverse, as counter mode is', () => {
    const key = new Uint8Array(randomBytes(32))
    const iv = new Uint8Array(randomBytes(16))
    const data = new Uint8Array(randomBytes(333))

    const encrypted = new CtrStream(key, iv).process(data)

    expect(hex(new CtrStream(key, iv).process(encrypted))).toBe(hex(data))
  })

  it('carries the counter through a byte boundary', () => {
    // A counter incremented only in its low byte repeats keystream after 256
    // blocks. Starting one short of a carry makes that visible immediately.
    const key = new Uint8Array(randomBytes(32))
    const iv = new Uint8Array(16)

    iv[15] = 0xff

    const data = new Uint8Array(randomBytes(64))
    const reference = createCipheriv('aes-256-ctr', key, iv)

    expect(hex(new CtrStream(key, iv).process(data))).toBe(
      hex(new Uint8Array(reference.update(data))),
    )
  })

  it('carries the counter through a full-block rollover', () => {
    // Every byte set means the next block wraps the whole counter. The platform
    // and this have to agree on what comes after.
    const key = new Uint8Array(randomBytes(32))
    const iv = new Uint8Array(16).fill(0xff)
    const data = new Uint8Array(randomBytes(48))
    const reference = createCipheriv('aes-256-ctr', key, iv)

    expect(hex(new CtrStream(key, iv).process(data))).toBe(
      hex(new Uint8Array(reference.update(data))),
    )
  })

  it('keeps two streams apart', () => {
    // Inbound and outbound are separate streams on one connection, and a shared
    // counter would corrupt both.
    const key = new Uint8Array(randomBytes(32))
    const iv = new Uint8Array(randomBytes(16))
    const data = new Uint8Array(randomBytes(64))

    const first = new CtrStream(key, iv)
    const second = new CtrStream(key, iv)

    first.process(data)

    expect(hex(second.process(data))).toBe(hex(new CtrStream(key, iv).process(data)))
  })

  it('rejects a key or counter of the wrong width', () => {
    expect(() => new CtrStream(new Uint8Array(16), new Uint8Array(16))).toThrow()
    expect(() => new CtrStream(new Uint8Array(32), new Uint8Array(8))).toThrow()
  })
})
