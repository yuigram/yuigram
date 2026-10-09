// SPDX-License-Identifier: MPL-2.0

/**
 * The protocol's key schedules.
 *
 * Every expectation is recomputed here by direct slicing over `node:crypto`
 * hashes, rather than by calling the implementation twice. That catches a
 * coding error; it would not catch a misreading of the specification, which is
 * checked at a different level when the handshake runs against a real server.
 *
 * The structural properties are the ones a byte-level oracle cannot state on
 * its own: exact widths, sensitivity to every input, and the fact that the two
 * message directions are genuinely different schedules.
 */

import { createHash } from 'node:crypto'
import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { igeDecrypt, igeEncrypt } from '../src/crypto/ige.js'
import {
  assertNonceVariant,
  authKeyAuxHash,
  authKeyId,
  deriveHandshakeKeys,
  deriveMessageKeys,
  initialServerSalt,
  messageKey,
  newNonceHash,
} from '../src/crypto/kdf.js'

const authKey = Uint8Array.from({ length: 256 }, (_, index) => (index * 7 + 3) & 0xff)
const newNonce = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const serverNonce = Uint8Array.from({ length: 16 }, (_, index) => 200 - index)

function digest(algorithm: 'sha1' | 'sha256', ...parts: Uint8Array[]): Uint8Array {
  const hash = createHash(algorithm)
  for (const part of parts) hash.update(part)

  return new Uint8Array(hash.digest())
}

function join(...parts: Uint8Array[]): number[] {
  return parts.flatMap((part) => [...part])
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'hex'))
}

function toHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex').toUpperCase()
}

describe('deriveHandshakeKeys', () => {
  it('reproduces the published worked example', () => {
    // The protocol documentation carries a complete worked handshake with the
    // temporary key and IV it arrives at. Every other expectation in this file
    // restates the schedule under test, so a misread offset would be repeated
    // in both; these two values were produced by Telegram, and are the only
    // check here that a misreading cannot satisfy.
    const nonce = fromHex('BF8CB5BD9C5B4FE7CF24D64D281F89311576D53C0DA65A83267E57315414C9A6')
    const server = fromHex('63248F6748214EAB8A2F4CC876E11974')

    const { key, iv } = deriveHandshakeKeys(nonce, server)

    expect(toHex(key)).toBe('16F548177058E8D39C41CBAD4D419446BEB12EB9B8F5AD28EA824B8015F17D81')
    expect(toHex(iv)).toBe('C4D14166C1378E35C698460047DBB6075441BE9984611C28837357EBBF8CB5BD')
  })

  it('matches the published schedule', () => {
    const newServer = digest('sha1', newNonce, serverNonce)
    const serverNew = digest('sha1', serverNonce, newNonce)
    const newNew = digest('sha1', newNonce, newNonce)

    const { key, iv } = deriveHandshakeKeys(newNonce, serverNonce)

    expect([...key]).toEqual(join(newServer, serverNew.subarray(0, 12)))
    expect([...iv]).toEqual(join(serverNew.subarray(12, 20), newNew, newNonce.subarray(0, 4)))
  })

  it('produces an AES-256 key and an IGE iv', () => {
    const { key, iv } = deriveHandshakeKeys(newNonce, serverNonce)

    expect(key.length).toBe(32)
    expect(iv.length).toBe(32)
  })

  it('changes with either nonce', () => {
    const base = deriveHandshakeKeys(newNonce, serverNonce)

    const otherNew = Uint8Array.from(newNonce)
    otherNew[0] = (otherNew[0] ?? 0) ^ 1
    const otherServer = Uint8Array.from(serverNonce)
    otherServer[0] = (otherServer[0] ?? 0) ^ 1

    expect([...deriveHandshakeKeys(otherNew, serverNonce).key]).not.toEqual([...base.key])
    expect([...deriveHandshakeKeys(newNonce, otherServer).key]).not.toEqual([...base.key])
    expect([...deriveHandshakeKeys(otherNew, serverNonce).iv]).not.toEqual([...base.iv])
  })

  it('rejects nonces of the wrong width', () => {
    expect(() => deriveHandshakeKeys(new Uint8Array(16), serverNonce)).toThrow(
      /new_nonce must be 32 bytes/,
    )
    expect(() => deriveHandshakeKeys(newNonce, new Uint8Array(32))).toThrow(
      /server_nonce must be 16 bytes/,
    )
  })
})

describe('messageKey', () => {
  it('is the middle 128 bits of the hash the specification names', () => {
    const plaintext = Uint8Array.from({ length: 64 }, (_, index) => index)

    expect([...messageKey(authKey, plaintext, 'client')]).toEqual([
      ...digest('sha256', authKey.subarray(88, 120), plaintext).subarray(8, 24),
    ])
    expect([...messageKey(authKey, plaintext, 'server')]).toEqual([
      ...digest('sha256', authKey.subarray(96, 128), plaintext).subarray(8, 24),
    ])
  })

  it('is 16 bytes and depends on the whole plaintext', () => {
    const a = Uint8Array.from({ length: 48 }, (_, index) => index)
    const b = Uint8Array.from(a)
    b[47] = (b[47] ?? 0) ^ 1

    expect(messageKey(authKey, a, 'client').length).toBe(16)
    expect([...messageKey(authKey, a, 'client')]).not.toEqual([...messageKey(authKey, b, 'client')])
  })

  it('rejects an auth key of the wrong width', () => {
    expect(() => messageKey(new Uint8Array(128), new Uint8Array(16), 'client')).toThrow(
      /auth key must be 256 bytes, received 128/,
    )
  })
})

describe('deriveMessageKeys', () => {
  const msgKey = Uint8Array.from({ length: 16 }, (_, index) => index * 11)

  it('matches the published interleaving', () => {
    for (const [direction, x] of [
      ['client', 0],
      ['server', 8],
    ] as const) {
      const a = digest('sha256', msgKey, authKey.subarray(x, x + 36))
      const b = digest('sha256', authKey.subarray(40 + x, 76 + x), msgKey)

      const { key, iv } = deriveMessageKeys(authKey, msgKey, direction)

      expect([...key]).toEqual(join(a.subarray(0, 8), b.subarray(8, 24), a.subarray(24, 32)))
      expect([...iv]).toEqual(join(b.subarray(0, 8), a.subarray(8, 24), b.subarray(24, 32)))
    }
  })

  it('gives the two directions different keys', () => {
    // A client that derived with the server's offset would produce messages the
    // server discards, with no error to read.
    const client = deriveMessageKeys(authKey, msgKey, 'client')
    const server = deriveMessageKeys(authKey, msgKey, 'server')

    expect([...client.key]).not.toEqual([...server.key])
    expect([...client.iv]).not.toEqual([...server.iv])
  })

  it('produces a key and iv AES-IGE accepts, and round-trips through it', () => {
    // Sender and receiver of one client-to-server message derive with the same
    // offset, so the pair has to be usable in both directions.
    const { key, iv } = deriveMessageKeys(authKey, msgKey, 'client')
    const plaintext = Uint8Array.from({ length: 64 }, (_, index) => (index * 5) & 0xff)

    expect(key.length).toBe(32)
    expect(iv.length).toBe(32)
    expect([...igeDecrypt(igeEncrypt(plaintext, key, iv), key, iv)]).toEqual([...plaintext])
  })

  it('rejects a msg_key of the wrong width', () => {
    expect(() => deriveMessageKeys(authKey, new Uint8Array(32), 'client')).toThrow(
      /msg_key must be 16 bytes/,
    )
  })
})

describe('identifiers', () => {
  it('takes the auth key id from the low half of the SHA-1', () => {
    expect([...authKeyId(authKey)]).toEqual([...digest('sha1', authKey).subarray(12, 20)])
    expect(authKeyId(authKey).length).toBe(8)
  })

  it('takes the auxiliary hash from the high half', () => {
    expect([...authKeyAuxHash(authKey)]).toEqual([...digest('sha1', authKey).subarray(0, 8)])
    expect(authKeyAuxHash(authKey).length).toBe(8)
  })

  it('does not confuse the two halves', () => {
    expect([...authKeyId(authKey)]).not.toEqual([...authKeyAuxHash(authKey)])
  })

  it('reproduces the published worked example', () => {
    // The acknowledgement that ends the handshake. It covers the auth key
    // through `authKeyAuxHash`, so this value fixes three readings at once: the
    // order of the concatenation, which half of SHA1(auth_key) the auxiliary
    // hash takes, and which 128 bits of the outer hash are kept.
    const nonce = fromHex('BF8CB5BD9C5B4FE7CF24D64D281F89311576D53C0DA65A83267E57315414C9A6')
    const key = fromHex(
      '8E1081A1B5CA1B399A9A9D7E08BB9A9182AB634F8C03F2A49F944E2F944A9C71' +
        'EDBA61A32A70D3DADEB33752AE515B16B2D8E75039C40EBE18136775C3727372' +
        'A8DF486606D671FD63842DF0A44ACC31E68B7B1EC6A731A1DC5C748F0CB46AC0' +
        '0FDE363F0520B51D9B59EAE519EA511A8E8591FC7010DF0B07CDBAB04013DD85' +
        '172CB54555DC5C982EA0A5DCF4411E798D338B823161FD8C93100B7A426186B4' +
        'C16F9113521081C8D2075872F4A0CF238034843DC01F2C26828721A2E2FFD93A' +
        '9B0142B8DF6355C43D9AEF5B448F1CC0D84E0E72A7FF494D4CC3B1650050DDEC' +
        '5DC321ADA68E420F45098280CEAB58A1CBFAA60FFF3218E56B4741143AC5A6F0',
    )

    expect(toHex(newNonceHash(nonce, 1, key))).toBe('AA404B58DF404D8F363772B14CE5A56F')
  })

  it('builds new_nonce_hash from the variant', () => {
    for (const variant of [1, 2, 3] as const) {
      const expected = digest(
        'sha1',
        newNonce,
        Uint8Array.of(variant),
        digest('sha1', authKey).subarray(0, 8),
      ).subarray(4, 20)

      expect([...newNonceHash(newNonce, variant, authKey)]).toEqual([...expected])
      expect(newNonceHash(newNonce, variant, authKey).length).toBe(16)
    }
  })

  it('gives the three variants different hashes', () => {
    const one = [...newNonceHash(newNonce, 1, authKey)]
    const two = [...newNonceHash(newNonce, 2, authKey)]
    const three = [...newNonceHash(newNonce, 3, authKey)]

    expect(one).not.toEqual(two)
    expect(two).not.toEqual(three)
    expect(one).not.toEqual(three)
  })

  it('rejects a variant outside the three the protocol defines', () => {
    expect(() => assertNonceVariant(0)).toThrow(ValidationError)
    expect(() => assertNonceVariant(4)).toThrow(/must be 1, 2 or 3, received 4/)
    expect(() => assertNonceVariant(2)).not.toThrow()
  })
})

describe('initialServerSalt', () => {
  it('is the XOR of the leading halves of the two nonces', () => {
    const expected = Uint8Array.from(
      newNonce.subarray(0, 8),
      (value, index) => value ^ (serverNonce[index] ?? 0),
    )

    expect([...initialServerSalt(newNonce, serverNonce)]).toEqual([...expected])
    expect(initialServerSalt(newNonce, serverNonce).length).toBe(8)
  })

  it('rejects nonces of the wrong width', () => {
    expect(() => initialServerSalt(new Uint8Array(8), serverNonce)).toThrow(ValidationError)
  })
})

describe('secret material', () => {
  it('keeps auth key bytes out of rejection messages', () => {
    let message = ''
    try {
      messageKey(new Uint8Array(64).fill(0xd7), new Uint8Array(16), 'client')
    } catch (error) {
      message = (error as Error).message
    }

    // The exact message is the assertion: it names the parameter and the two
    // lengths, and carries nothing derived from the key in any encoding.
    expect(message).toBe('auth key must be 256 bytes, received 64')
    expect(message).not.toContain('d7')
    expect(message).not.toContain('215')
  })
})
