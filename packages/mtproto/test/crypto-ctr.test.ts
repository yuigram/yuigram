/**
 * Counter mode, against the vectors that define it.
 *
 * The keystream is checked against NIST SP 800-38A F.5.5, so the primitive is
 * known to be right before anything is built on it. The counter derivation is
 * checked separately, because that is Telegram's rule rather than the mode's:
 * the last four bytes of the initialization vector name the block a range
 * starts at, and getting that wrong produces bytes rather than an error.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { AES_BLOCK, counterAt, ctrCrypt } from '../src/crypto/ctr.js'

const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))
const hex = (data: Uint8Array) => Buffer.from(data).toString('hex')

/** NIST SP 800-38A F.5.5, CTR-AES256. */
const KEY = bytes('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4')
const COUNTER = bytes('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff')
const PLAIN = bytes(
  '6bc1bee22e409f96e93d7e117393172a' +
    'ae2d8a571e03ac9c9eb76fac45af8e51' +
    '30c81c46a35ce411e5fbc1191a0a52ef' +
    'f69f2445df4f9b17ad2b417be66c3710',
)
const CIPHER =
  '601ec313775789a5b7a7f504bbf3d228' +
  'f443e3ca4d62b59aca84e990cacaf5c5' +
  '2b0930daa23de94ce87017ba2d84988d' +
  'dfc9c58db67aada613c2dd08457941a6'

describe('the counter-mode keystream', () => {
  it('matches the published vector', () => {
    expect(hex(ctrCrypt(PLAIN, KEY, COUNTER))).toBe(CIPHER)
  })

  it('undoes itself, because the two directions are one operation', () => {
    expect(hex(ctrCrypt(ctrCrypt(PLAIN, KEY, COUNTER), KEY, COUNTER))).toBe(hex(PLAIN))
  })

  it('advances the counter across blocks rather than repeating it', () => {
    // Four identical blocks that come back different is the whole point of the
    // mode; a keystream that repeated would make the plaintext recoverable.
    const repeated = new Uint8Array(4 * AES_BLOCK)
    const out = ctrCrypt(repeated, KEY, COUNTER)
    const blocks = [0, 1, 2, 3].map((n) => hex(out.subarray(n * AES_BLOCK, (n + 1) * AES_BLOCK)))

    expect(new Set(blocks).size).toBe(4)
  })

  it('leaves a partial final block partial', () => {
    // Counter mode is a stream, so nothing is padded up to a block.
    expect(ctrCrypt(PLAIN.subarray(0, 23), KEY, COUNTER)).toHaveLength(23)
    expect(hex(ctrCrypt(PLAIN.subarray(0, 23), KEY, COUNTER))).toBe(CIPHER.slice(0, 46))
  })

  it('gives different bytes under a different key', () => {
    const other = new Uint8Array(KEY)
    other[0] = (other[0] ?? 0) ^ 0x01

    expect(hex(ctrCrypt(PLAIN, other, COUNTER))).not.toBe(CIPHER)
  })

  it('gives different bytes under a different counter', () => {
    const other = new Uint8Array(COUNTER)
    other[0] = (other[0] ?? 0) ^ 0x01

    expect(hex(ctrCrypt(PLAIN, KEY, other))).not.toBe(CIPHER)
  })

  it('refuses a key or counter of the wrong length', () => {
    expect(() => ctrCrypt(PLAIN, KEY.subarray(0, 16), COUNTER)).toThrow(ValidationError)
    expect(() => ctrCrypt(PLAIN, KEY, COUNTER.subarray(0, 8))).toThrow(ValidationError)
  })
})

describe('where a range begins in the keystream', () => {
  it('leaves the front of the vector alone and writes the block into the back', () => {
    const iv = bytes('000102030405060708090a0b0c0d0e0f')

    expect(hex(counterAt(iv, 0))).toBe('000102030405060708090a0b00000000')
    expect(hex(counterAt(iv, 16))).toBe('000102030405060708090a0b00000001')
    expect(hex(counterAt(iv, 4096))).toBe('000102030405060708090a0b00000100')
  })

  it('writes the block big-endian', () => {
    // The byte order is the one place this is silently wrong rather than
    // visibly wrong: a little-endian counter is a valid counter for some other
    // block, so it decrypts to rubbish instead of failing.
    const iv = new Uint8Array(AES_BLOCK)

    expect(hex(counterAt(iv, 256 * AES_BLOCK))).toBe('00000000000000000000000000000100')
  })

  it('reaches blocks past what a smaller counter would hold', () => {
    const iv = new Uint8Array(AES_BLOCK)

    expect(hex(counterAt(iv, 0x0100_0000 * AES_BLOCK))).toBe('00000000000000000000000001000000')
  })

  it('decrypts a range from the middle exactly as the whole file would', () => {
    const iv = bytes('0f0e0d0c0b0a09080706050403020100')
    const whole = new Uint8Array(1024).map((_, index) => index & 0xff)
    const encrypted = ctrCrypt(whole, KEY, counterAt(iv, 0))

    // A range taken from the middle of the encrypted file, decrypted under the
    // counter for where it starts, is the same as that part of the original.
    const from = 256
    const piece = encrypted.subarray(from, from + 128)

    expect(hex(ctrCrypt(piece, KEY, counterAt(iv, from)))).toBe(
      hex(whole.subarray(from, from + 128)),
    )
  })

  it('produces rubbish rather than an error when the counter restarts', () => {
    // The failure this guards against. Nothing detects it but the hashes.
    const iv = new Uint8Array(AES_BLOCK).fill(3)
    const whole = new Uint8Array(64).fill(0xab)
    const encrypted = ctrCrypt(whole, KEY, counterAt(iv, 0))
    const tail = encrypted.subarray(32)

    expect(hex(ctrCrypt(tail, KEY, counterAt(iv, 0)))).not.toBe(hex(whole.subarray(32)))
    expect(hex(ctrCrypt(tail, KEY, counterAt(iv, 32)))).toBe(hex(whole.subarray(32)))
  })

  it('refuses an offset that is not a whole number of blocks', () => {
    expect(() => counterAt(new Uint8Array(AES_BLOCK), 5)).toThrow(ValidationError)
    expect(() => counterAt(new Uint8Array(AES_BLOCK), -16)).toThrow(ValidationError)
  })

  it('refuses a vector of the wrong length', () => {
    expect(() => counterAt(new Uint8Array(8), 0)).toThrow(ValidationError)
  })
})
