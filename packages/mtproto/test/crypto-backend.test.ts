// SPDX-License-Identifier: MIT

/**
 * Two backends, one contract.
 *
 * A build targeting a browser gets a different module than a build targeting a
 * server, chosen by the `browser` field rather than by anything either backend
 * can see. That substitution is only safe if the two are interchangeable, and
 * "interchangeable" is not something a type can establish: both satisfy
 * `CryptoBackend` by construction, and would continue to while producing
 * different ciphertext.
 *
 * So every case here runs against both, and the ones that matter most compare
 * their outputs directly. A session started under one and resumed under the
 * other has to work — which is not hypothetical, because a session string is
 * portable and a developer testing in Node ships to a browser.
 */

import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { backend as browser } from '../src/crypto/backend.browser.js'
import { backend as platform } from '../src/crypto/backend.js'
import type { CryptoBackend } from '../src/crypto/backend-types.js'

const BACKENDS: readonly (readonly [string, CryptoBackend])[] = [
  ['platform', platform],
  ['browser', browser],
]

const hex = (data: Uint8Array): string =>
  [...data].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const bytes = (value: string): Uint8Array =>
  Uint8Array.from((value.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))

describe('both backends name themselves', () => {
  it('says which one answered', () => {
    // A program that is unexpectedly slow on a server is usually one that
    // resolved to the portable backend, and nothing else makes that visible.
    expect(platform.name).toBe('node:crypto')
    expect(browser.name).toBe('portable')
    expect(platform.name).not.toBe(browser.name)
  })
})

describe('the digests', () => {
  for (const [name, backend] of BACKENDS) {
    it(`${name}: hashes the values published with the standards`, () => {
      const abc = new TextEncoder().encode('abc')

      expect(hex(backend.sha1(abc))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
      expect(hex(backend.sha256(abc))).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      )
      expect(hex(backend.md5(abc))).toBe('900150983cd24fb0d6963f7d28e17f72')
    })

    it(`${name}: treats several parts as one input`, () => {
      const whole = new Uint8Array(randomBytes(100))

      expect(hex(backend.sha256(whole))).toBe(
        hex(backend.sha256(whole.subarray(0, 37), whole.subarray(37))),
      )
    })
  }

  it('agree with each other at every length around a block boundary', () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 1000]) {
      const data = new Uint8Array(randomBytes(length))

      expect(hex(browser.sha1(data)), `sha1 ${length}`).toBe(hex(platform.sha1(data)))
      expect(hex(browser.sha256(data)), `sha256 ${length}`).toBe(hex(platform.sha256(data)))
      expect(hex(browser.md5(data)), `md5 ${length}`).toBe(hex(platform.md5(data)))
    }
  })
})

describe('AES-256 in IGE', () => {
  const KEY = bytes('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4')
  const IV = bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')

  for (const [name, backend] of BACKENDS) {
    it(`${name}: is its own inverse under one IV`, () => {
      const data = new Uint8Array(randomBytes(64))

      expect(hex(backend.igeDecrypt(backend.igeEncrypt(data, KEY, IV), KEY, IV))).toBe(hex(data))
    })

    it(`${name}: reports a malformed key rather than letting the cipher do it`, () => {
      // Validation comes before any key material is touched, so a short key is
      // a `ValidationError` naming the field and not whatever the platform says
      // when it is handed sixteen bytes where it wanted thirty-two.
      const data = new Uint8Array(16)

      expect(() => backend.igeEncrypt(data, new Uint8Array(16), IV)).toThrow(/key must be 32 bytes/)
      expect(() => backend.igeDecrypt(data, new Uint8Array(16), IV)).toThrow(/key must be 32 bytes/)
      expect(() => backend.igeEncrypt(data, KEY, new Uint8Array(16))).toThrow(/iv must be 32 bytes/)
      expect(() => backend.igeEncrypt(new Uint8Array(17), KEY, IV)).toThrow(/multiple of 16/)
      expect(() => backend.igeEncrypt(new Uint8Array(0), KEY, IV)).toThrow(/must not be empty/)
    })
  }

  it('produce the same ciphertext, at lengths that exercise the chaining', () => {
    // One block exercises only the IV. Several exercise the chaining, which is
    // where a mode goes wrong in a way a round trip cannot see — both
    // directions share the mistake and still agree with each other.
    for (const blocks of [1, 2, 3, 8, 64]) {
      const data = new Uint8Array(randomBytes(blocks * 16))

      expect(hex(browser.igeEncrypt(data, KEY, IV)), `${blocks} blocks`).toBe(
        hex(platform.igeEncrypt(data, KEY, IV)),
      )
      expect(hex(browser.igeDecrypt(data, KEY, IV)), `${blocks} blocks`).toBe(
        hex(platform.igeDecrypt(data, KEY, IV)),
      )
    }
  })

  it('each decrypts what the other encrypted', () => {
    // The claim the substitution actually rests on: a message written by a
    // process using one backend is readable by a process using the other.
    for (let round = 0; round < 16; round += 1) {
      const key = new Uint8Array(randomBytes(32))
      const iv = new Uint8Array(randomBytes(32))
      const data = new Uint8Array(randomBytes(16 * (1 + (round % 5))))

      expect(hex(browser.igeDecrypt(platform.igeEncrypt(data, key, iv), key, iv))).toBe(hex(data))
      expect(hex(platform.igeDecrypt(browser.igeEncrypt(data, key, iv), key, iv))).toBe(hex(data))
    }
  })
})

describe('AES-256 in counter mode', () => {
  for (const [name, backend] of BACKENDS) {
    it(`${name}: matches the platform over one long run`, () => {
      const key = new Uint8Array(randomBytes(32))
      const counter = new Uint8Array(randomBytes(16))
      const data = new Uint8Array(randomBytes(4096))
      const reference = createCipheriv('aes-256-ctr', key, counter)

      expect(hex(backend.ctr(key, counter).process(data))).toBe(
        hex(new Uint8Array(reference.update(data))),
      )
    })

    it(`${name}: keeps its place across arbitrary splits`, () => {
      // The transport feeds this whatever a socket handed over, which has
      // nothing to do with block boundaries. A stream that restarted per call
      // would produce the right first packet and rubbish after it.
      const key = new Uint8Array(randomBytes(32))
      const counter = new Uint8Array(randomBytes(16))
      const data = new Uint8Array(randomBytes(1000))
      const whole = backend.ctr(key, counter).process(data)

      const stream = backend.ctr(key, counter)
      const pieces: Uint8Array[] = []
      let at = 0
      for (const size of [1, 14, 1, 16, 968]) {
        pieces.push(stream.process(data.subarray(at, at + size)))
        at += size
      }

      const joined = new Uint8Array(data.length)
      let cursor = 0
      for (const piece of pieces) {
        joined.set(piece, cursor)
        cursor += piece.length
      }

      expect(hex(joined)).toBe(hex(whole))
    })

    it(`${name}: keeps two streams apart`, () => {
      // Inbound and outbound are separate streams on one connection.
      const key = new Uint8Array(randomBytes(32))
      const counter = new Uint8Array(randomBytes(16))
      const data = new Uint8Array(randomBytes(64))

      const first = backend.ctr(key, counter)
      const second = backend.ctr(key, counter)
      first.process(data)

      expect(hex(second.process(data))).toBe(hex(backend.ctr(key, counter).process(data)))
    })
  }

  it('produce the same keystream, carry included', () => {
    const key = new Uint8Array(randomBytes(32))
    const data = new Uint8Array(randomBytes(64))

    for (const counter of [
      new Uint8Array(16),
      (() => {
        const value = new Uint8Array(16)
        value[15] = 0xff

        return value
      })(),
      new Uint8Array(16).fill(0xff),
    ]) {
      expect(hex(browser.ctr(key, counter).process(data))).toBe(
        hex(platform.ctr(key, counter).process(data)),
      )
    }
  })
})

describe('randomness', () => {
  for (const [name, backend] of BACKENDS) {
    it(`${name}: returns the length asked for`, () => {
      for (const length of [0, 1, 16, 32, 256, 1024]) {
        expect(backend.randomBytes(length).length, String(length)).toBe(length)
      }
    })

    it(`${name}: does not return the same bytes twice`, () => {
      // Not a test of the generator — a test that one is reached at all. A stub
      // returning zeros would satisfy every other case here.
      const seen = new Set<string>()
      for (let round = 0; round < 32; round += 1) seen.add(hex(backend.randomBytes(32)))

      expect(seen.size).toBe(32)
    })

    it(`${name}: refuses a length that is not a count`, () => {
      expect(() => backend.randomBytes(-1)).toThrow()
      expect(() => backend.randomBytes(1.5)).toThrow()
    })
  }

  it('fills past the single-call limit the browser interface imposes', () => {
    // `getRandomValues` caps one call at 65 536 bytes. A silent short read
    // would be a tail of zeros, which nothing else here would notice.
    const large = browser.randomBytes(200_000)
    const tail = large.subarray(131_072)

    expect(large.length).toBe(200_000)
    expect(tail.some((byte) => byte !== 0)).toBe(true)
    expect(hex(createHash('sha256').update(large.subarray(0, 65_536)).digest())).not.toBe(
      hex(createHash('sha256').update(large.subarray(65_536, 131_072)).digest()),
    )
  })
})

describe('stretching a password', () => {
  for (const [name, backend] of BACKENDS) {
    it(`${name}: matches the value published for the parameters`, async () => {
      // RFC 6070's first PBKDF2 case, taken over SHA-512 rather than SHA-1 —
      // the digest Telegram's password algorithm names. The expectation is not
      // this code's output: it is what any correct PBKDF2-HMAC-SHA512 produces
      // for `password`, `salt` and one iteration, and both backends have to
      // reach it because a proof computed under one is checked by a server that
      // knows nothing about either.
      const derived = await backend.pbkdf2(
        new TextEncoder().encode('password'),
        new TextEncoder().encode('salt'),
        1,
        64,
      )

      expect(derived.length).toBe(64)
      expect(hex(derived)).toBe(
        '867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252' +
          'c02d470a285a0501bad999bfe943c08f050235d7d68b1da55e63f73b60a57fce',
      )
    })
  }

  it('produces the same key on both, over random inputs', () => {
    // A sign-in computed on a server and a sign-in computed in a browser have
    // to agree, or a password that works in one place fails in the other.
    return Promise.all(
      Array.from({ length: 4 }, async (_, round) => {
        const password = new Uint8Array(randomBytes(8 + round))
        const salt = new Uint8Array(randomBytes(16))

        expect(hex(await browser.pbkdf2(password, salt, 64, 64))).toBe(
          hex(await platform.pbkdf2(password, salt, 64, 64)),
        )
      }),
    )
  })
})

describe('comparing without a timing oracle', () => {
  for (const [name, backend] of BACKENDS) {
    it(`${name}: answers rather than throwing on a length mismatch`, () => {
      // Used on a path where an exception would itself be an oracle.
      expect(backend.constantTimeEqual(new Uint8Array(4), new Uint8Array(8))).toBe(false)
      expect(backend.constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true)
    })

    it(`${name}: agrees with an ordinary comparison on what is equal`, () => {
      for (let round = 0; round < 32; round += 1) {
        const a = new Uint8Array(randomBytes(16))
        const b = new Uint8Array(a)

        expect(backend.constantTimeEqual(a, b)).toBe(true)

        b[round % 16] = ((b[round % 16] as number) + 1) & 0xff

        expect(backend.constantTimeEqual(a, b)).toBe(false)
      }
    })

    it(`${name}: notices a difference in the last byte as readily as the first`, () => {
      const a = new Uint8Array(32).fill(7)
      const first = new Uint8Array(a)
      const last = new Uint8Array(a)
      first[0] = 8
      last[31] = 8

      expect(backend.constantTimeEqual(a, first)).toBe(false)
      expect(backend.constantTimeEqual(a, last)).toBe(false)
    })
  }
})
