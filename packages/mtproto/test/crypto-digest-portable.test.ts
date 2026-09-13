/**
 * The digests, without the platform.
 *
 * Hashes are checked against the values published with the standards that
 * define them — FIPS-180 for SHA-1 and SHA-256, RFC 1321 for MD5, RFC 2202 and
 * RFC 4231 for HMAC — before they are compared with the platform at all. A
 * digest that agrees only with `node:crypto` would still be wrong if the two
 * were wrong together, and a digest that agrees only with itself proves
 * nothing whatever.
 *
 * None of the expected values here were produced by the code under test.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hmacPortable, md5Portable, sha1Portable, sha256Portable } from '../src/crypto/digest.js'

const hex = (data: Uint8Array): string =>
  [...data].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

const bytes = (value: string): Uint8Array =>
  Uint8Array.from((value.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))

describe('SHA-1, against the values published with the standard', () => {
  // FIPS-180 appendix A: the two worked examples, plus the million-character
  // case, which is the one that exercises the block loop and the length field.
  const PUBLISHED: readonly (readonly [string, string])[] = [
    ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    ],
  ]

  it('hashes the published inputs to the published digests', () => {
    for (const [input, expected] of PUBLISHED) {
      expect(hex(sha1Portable(utf8(input))), input).toBe(expected)
    }
  })

  it('hashes the empty input to the published digest', () => {
    // Nothing at all is still a block of padding, and an implementation that
    // skipped the loop for it would return the initial state instead.
    expect(hex(sha1Portable())).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    expect(hex(sha1Portable(new Uint8Array(0)))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it('hashes a million characters to the published digest', () => {
    expect(hex(sha1Portable(utf8('a'.repeat(1_000_000))))).toBe(
      '34aa973cd4c4daa4f61eeb2bdbad27316534016f',
    )
  })
})

describe('SHA-256, against the values published with the standard', () => {
  const PUBLISHED: readonly (readonly [string, string])[] = [
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ]

  it('hashes the published inputs to the published digests', () => {
    for (const [input, expected] of PUBLISHED) {
      expect(hex(sha256Portable(utf8(input))), input).toBe(expected)
    }
  })

  it('hashes the empty input to the published digest', () => {
    expect(hex(sha256Portable())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('hashes a million characters to the published digest', () => {
    expect(hex(sha256Portable(utf8('a'.repeat(1_000_000))))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    )
  })
})

describe('MD5, against the values published with the standard', () => {
  // RFC 1321 appendix A.5, the suite the document itself prints.
  const PUBLISHED: readonly (readonly [string, string])[] = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      'd174ab98d277d9f5a5611c2c9f419d9f',
    ],
    [
      '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
      '57edf4a22be3c955ac49da2e2107b67a',
    ],
  ]

  it('hashes every published input to its published digest', () => {
    for (const [input, expected] of PUBLISHED) {
      expect(hex(md5Portable(utf8(input))), JSON.stringify(input)).toBe(expected)
    }
  })
})

describe('the digests, against the platform', () => {
  it('agree on random input at every length around a block boundary', () => {
    // A hash goes wrong at the seams: the last partial block, the block that is
    // exactly full, and the one where the length no longer fits beside the
    // terminator and a whole extra block of padding is needed.
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000]) {
      const data = new Uint8Array(randomBytes(length))

      expect(hex(sha1Portable(data)), `sha1 ${length}`).toBe(
        createHash('sha1').update(data).digest('hex'),
      )
      expect(hex(sha256Portable(data)), `sha256 ${length}`).toBe(
        createHash('sha256').update(data).digest('hex'),
      )
      expect(hex(md5Portable(data)), `md5 ${length}`).toBe(
        createHash('md5').update(data).digest('hex'),
      )
    }
  })

  it('agree that several parts are one input', () => {
    // Every call site passes the pieces separately rather than joining them, so
    // a hash that reset between parts would be wrong everywhere at once.
    const first = new Uint8Array(randomBytes(37))
    const second = new Uint8Array(randomBytes(64))
    const third = new Uint8Array(randomBytes(3))
    const joined = new Uint8Array([...first, ...second, ...third])

    expect(hex(sha1Portable(first, second, third))).toBe(
      createHash('sha1').update(joined).digest('hex'),
    )
    expect(hex(sha256Portable(first, second, third))).toBe(
      createHash('sha256').update(joined).digest('hex'),
    )
    expect(hex(md5Portable(first, second, third))).toBe(
      createHash('md5').update(joined).digest('hex'),
    )
  })

  it('agree with the shipping implementations they stand in for', () => {
    // Two accounts on one session file may be served by different providers,
    // so the two paths have to be interchangeable rather than merely correct.
    for (let round = 0; round < 32; round += 1) {
      const data = new Uint8Array(randomBytes(1 + round * 7))

      expect(hex(sha1Portable(data))).toBe(createHash('sha1').update(data).digest('hex'))
      expect(hex(sha256Portable(data))).toBe(createHash('sha256').update(data).digest('hex'))
    }
  })
})

describe('HMAC, against the values published with the standards', () => {
  it('matches RFC 2202 for SHA-1', () => {
    // Test case 1 and test case 2 from the document.
    expect(hex(hmacPortable(sha1Portable, 64, bytes('0b'.repeat(20)), utf8('Hi There')))).toBe(
      'b617318655057264e28bc0b6fb378c8ef146be00',
    )
    expect(
      hex(hmacPortable(sha1Portable, 64, utf8('Jefe'), utf8('what do ya want for nothing?'))),
    ).toBe('effcdf6ae5eb2fa2d27416d5f184df9c259a7c79')
  })

  it('matches RFC 4231 for SHA-256', () => {
    expect(hex(hmacPortable(sha256Portable, 64, bytes('0b'.repeat(20)), utf8('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    )
    expect(
      hex(hmacPortable(sha256Portable, 64, utf8('Jefe'), utf8('what do ya want for nothing?'))),
    ).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })

  it('hashes a key longer than the block, as the definition requires', () => {
    // RFC 4231 test case 6: a 131-byte key, which has to be hashed down before
    // it is padded. An implementation that truncated instead would pass every
    // shorter case and fail only here.
    const key = bytes('aa'.repeat(131))
    const data = utf8('Test Using Larger Than Block-Size Key - Hash Key First')

    expect(hex(hmacPortable(sha256Portable, 64, key, data))).toBe(
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
    )
  })

  it('agrees with the platform over random keys and messages', () => {
    for (let round = 0; round < 16; round += 1) {
      const key = new Uint8Array(randomBytes(1 + round * 9))
      const data = new Uint8Array(randomBytes(1 + round * 17))

      expect(hex(hmacPortable(sha256Portable, 64, key, data))).toBe(
        createHmac('sha256', key).update(data).digest('hex'),
      )
    }
  })

  it('rejects a block size that cannot hold a key', () => {
    expect(() => hmacPortable(sha256Portable, 0, new Uint8Array(1))).toThrow()
  })
})
