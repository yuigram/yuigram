// SPDX-License-Identifier: MIT

/**
 * Bytes as text, and back.
 *
 * Small enough to look obviously right and used in four places where being
 * subtly wrong is expensive: the key a prime is cached under, a session string
 * a person carries between machines, stored key material, and a proxy secret.
 * A byte that loses its leading zero makes two different inputs share a cache
 * entry; a round trip that drops a bit makes a stored key silently useless.
 */

import { randomBytes } from 'node:crypto'
import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { fromBase64, toBase64, toHex } from '../src/crypto/encoding.js'

describe('hexadecimal', () => {
  it('gives every byte two digits', () => {
    // The case that matters: a byte below sixteen. Without the padding, `0f`
    // and `f` are the same string, so two different inputs collide.
    expect(toHex(Uint8Array.from([0x00, 0x0f, 0xa0, 0xff]))).toBe('000fa0ff')
    expect(toHex(Uint8Array.from([0x01, 0x02]))).toBe('0102')
  })

  it('gives distinct inputs distinct text', () => {
    const first = toHex(Uint8Array.from([0x0a, 0xbc]))
    const second = toHex(Uint8Array.from([0xab, 0x0c]))

    expect(first).not.toBe(second)
  })

  it('agrees with the platform over random input', () => {
    for (let round = 0; round < 32; round += 1) {
      const data = new Uint8Array(randomBytes(1 + round))

      expect(toHex(data)).toBe(Buffer.from(data).toString('hex'))
    }
  })

  it('gives nothing for nothing', () => {
    expect(toHex(new Uint8Array(0))).toBe('')
  })
})

describe('base64', () => {
  it('agrees with the platform in both directions', () => {
    for (let round = 0; round < 64; round += 1) {
      const data = new Uint8Array(randomBytes(round))
      const encoded = toBase64(data)

      expect(encoded, `length ${round}`).toBe(Buffer.from(data).toString('base64'))
      expect([...fromBase64(encoded)], `length ${round}`).toEqual([...data])
    }
  })

  it('carries every byte value through unchanged', () => {
    // A byte above 127 is where a naive conversion through a string goes wrong.
    const every = Uint8Array.from({ length: 256 }, (_, index) => index)

    expect([...fromBase64(toBase64(every))]).toEqual([...every])
  })

  it('handles an input past a single conversion chunk', () => {
    // Built a chunk at a time, because spreading every byte as an argument
    // overflows the call stack on a large enough input.
    const large = new Uint8Array(randomBytes(200_000))

    expect(toBase64(large)).toBe(Buffer.from(large).toString('base64'))
    expect(fromBase64(toBase64(large)).length).toBe(large.length)
  })

  it('reports something that is not base64 rather than decoding it to less', () => {
    // What reaches this is a stored value or something a person pasted. A
    // silent partial decode would be a key shorter than it should be.
    expect(() => fromBase64('not base64 at all!!')).toThrow(ValidationError)
  })
})
