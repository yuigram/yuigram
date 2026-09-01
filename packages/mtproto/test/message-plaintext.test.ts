/**
 * The unencrypted message envelope.
 *
 * Expected bytes are written out from the published layout rather than produced
 * by the encoder, because an encoder and decoder that share a wrong offset
 * round-trip perfectly.
 *
 * The identifier generator is checked against the rules the server enforces:
 * the value tracks the clock, the low two bits say which end produced it, and
 * the sequence never repeats. A server discards a duplicate silently, so a
 * generator that repeats produces a bot that loses messages with no error.
 */

import { describe, expect, it } from 'vitest'
import {
  createMessageIdGenerator,
  decodePlaintextMessage,
  encodePlaintextMessage,
  MessageError,
} from '../src/message/plaintext.js'

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('encoding', () => {
  it('writes the header the specification describes', () => {
    const framed = encodePlaintextMessage(0x0123_4567_89ab_cdefn, Uint8Array.of(1, 2, 3, 4))

    expect(hex(framed)).toBe(
      // auth_key_id = 0     msg_id, little-endian   length      body
      `${'00'.repeat(8)}${'efcdab8967452301'}${'04000000'}${'01020304'}`,
    )
  })

  it('carries an empty body', () => {
    expect(hex(encodePlaintextMessage(0n, new Uint8Array(0)))).toBe('00'.repeat(20))
  })

  it('writes a negative identifier without reinterpreting it', () => {
    // Identifiers are read as signed 64-bit values. One with the high bit set
    // is legal on the wire and must survive the round trip unchanged.
    const msgId = -2n
    const framed = encodePlaintextMessage(msgId, new Uint8Array(0))

    expect(hex(framed.subarray(8, 16))).toBe('feffffffffffffff')
    expect(decodePlaintextMessage(framed).msgId).toBe(msgId)
  })
})

describe('decoding', () => {
  it('recovers what was encoded', () => {
    const body = Uint8Array.from({ length: 64 }, (_, index) => (index * 5 + 3) & 0xff)
    const decoded = decodePlaintextMessage(encodePlaintextMessage(123n, body))

    expect(decoded.msgId).toBe(123n)
    expect(hex(decoded.body)).toBe(hex(body))
  })

  it('ignores bytes past the declared length', () => {
    // Padded framing delivers the payload with its padding still attached, and
    // the length field is the only thing that says where the body ends.
    const body = Uint8Array.of(9, 9, 9, 9)
    const padded = new Uint8Array(20 + 4 + 11)
    padded.set(encodePlaintextMessage(7n, body))

    expect(hex(decodePlaintextMessage(padded).body)).toBe('09090909')
  })

  it('refuses a buffer too short to hold a header', () => {
    expect(() => decodePlaintextMessage(new Uint8Array(19))).toThrow(MessageError)
    expect(() => decodePlaintextMessage(new Uint8Array(19))).toThrow(/needs 20 bytes/)
  })

  it('refuses a message that is not unencrypted', () => {
    // An auth key identifier here means the message belongs to a session, and
    // handing its body to a plaintext decoder would read ciphertext as TL.
    const framed = encodePlaintextMessage(1n, Uint8Array.of(1, 2, 3, 4))
    framed[0] = 0x77

    expect(() => decodePlaintextMessage(framed)).toThrow(/expected an unencrypted message/)
  })

  it('refuses a declared length that overruns the buffer', () => {
    const framed = encodePlaintextMessage(1n, Uint8Array.of(1, 2, 3, 4))
    new DataView(framed.buffer).setInt32(16, 1000, true)

    expect(() => decodePlaintextMessage(framed)).toThrow(/declares 1000 bytes/)
  })

  it('refuses a negative declared length', () => {
    // Read as unsigned this would be an enormous body; read as signed it is a
    // slice that silently returns nothing.
    const framed = encodePlaintextMessage(1n, Uint8Array.of(1, 2, 3, 4))
    new DataView(framed.buffer).setInt32(16, -4, true)

    expect(() => decodePlaintextMessage(framed)).toThrow(/negative message length/)
  })

  it('reads a message that does not start at the beginning of its buffer', () => {
    // A frame arrives as a view into the receive buffer, not as its own
    // allocation, so the decoder must respect the view's offset.
    const body = Uint8Array.of(4, 3, 2, 1)
    const backing = new Uint8Array(64)
    backing.set(encodePlaintextMessage(55n, body), 13)

    const decoded = decodePlaintextMessage(backing.subarray(13, 13 + 24))

    expect(decoded.msgId).toBe(55n)
    expect(hex(decoded.body)).toBe('04030201')
  })
})

describe('message identifiers', () => {
  const at = (milliseconds: number) => () => milliseconds
  const low = (msgId: bigint) => msgId & 0xffff_ffffn

  it('places the whole seconds in the high 32 bits', () => {
    const next = createMessageIdGenerator({ origin: 'client', now: at(1_700_000_000_500) })

    expect(next() >> 32n).toBe(1_700_000_000n)
  })

  it('never leaves the low 32 bits of a client identifier empty', () => {
    // The server ignores such a message, and a caller waits for a reply that
    // never arrives. A message created exactly on a second boundary is the
    // case that produces one, and it is not rare.
    const msgId = createMessageIdGenerator({ origin: 'client', now: at(1_700_000_000_000) })()

    expect(low(msgId)).not.toBe(0n)
    expect(msgId).toBe(7_301_444_403_200_000_004n)
  })

  it('keeps the low word non-empty across every millisecond of a second', () => {
    for (let ms = 0; ms < 1000; ms += 1) {
      const value = createMessageIdGenerator({
        origin: 'client',
        now: at(1_700_000_000_000 + ms),
      })()

      expect(low(value), `at ${ms}ms`).not.toBe(0n)
      expect(value % 4n, `at ${ms}ms`).toBe(0n)
    }
  })

  it('gives each end its own low two bits', () => {
    const now = at(1_700_000_000_500)

    expect(createMessageIdGenerator({ origin: 'client', now })() % 4n).toBe(0n)
    expect(createMessageIdGenerator({ origin: 'server-response', now })() % 4n).toBe(1n)
    expect(createMessageIdGenerator({ origin: 'server-initiated', now })() % 4n).toBe(3n)
  })

  it('scales the fraction across the whole low word', () => {
    // Half a second is half of 2^32. Scaling the milliseconds by anything else
    // would still order correctly within a second while drifting from the
    // "approximately unixtime times 2^32" the server compares against.
    const value = createMessageIdGenerator({ origin: 'client', now: at(1_700_000_000_500) })()

    expect(low(value)).toBe(0x8000_0000n)
  })

  it('orders identifiers within the same second', () => {
    const early = createMessageIdGenerator({ origin: 'client', now: at(1_700_000_000_001) })()
    const late = createMessageIdGenerator({ origin: 'client', now: at(1_700_000_000_999) })()

    expect(early >> 32n).toBe(late >> 32n)
    expect(late).toBeGreaterThan(early)
  })

  it('advances even when the clock does not', () => {
    const next = createMessageIdGenerator({ origin: 'client', now: at(1_700_000_000_000) })
    const values = [next(), next(), next(), next()]

    expect(new Set(values).size).toBe(4)
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1] ?? 0n)
    }
  })

  it('keeps the origin bits while advancing past a collision', () => {
    const next = createMessageIdGenerator({
      origin: 'server-response',
      now: at(1_700_000_000_000),
    })

    for (let index = 0; index < 8; index += 1) {
      expect(next() % 4n).toBe(1n)
    }
  })

  it('never goes backwards when the clock does', () => {
    // Clocks are adjusted while a process runs. A generator that followed one
    // backwards would emit an identifier the server has already seen.
    let clock = 1_700_000_000_000
    const next = createMessageIdGenerator({ origin: 'client', now: () => clock })

    const first = next()
    clock -= 60_000
    const second = next()

    expect(second).toBeGreaterThan(first)
  })

  it('applies the correction between the local clock and the server', () => {
    const withoutOffset = createMessageIdGenerator({
      origin: 'client',
      now: at(1_700_000_000_500),
    })()
    const withOffset = createMessageIdGenerator({
      origin: 'client',
      now: at(1_700_000_000_500),
      timeOffset: 120,
    })()

    expect(withOffset >> 32n).toBe((withoutOffset >> 32n) + 120n)
  })

  it('returns the identifier in the form a decoder reads back', () => {
    // Identifiers are `long`, and one generated past January 2038 exceeds the
    // signed range. Returning the unsigned value would mean a caller matching a
    // reply against a pending request compared two different numbers.
    const next = createMessageIdGenerator({ origin: 'client', now: at(3_000_000_000_500) })
    const msgId = next()

    expect(msgId).toBeLessThan(0n)
    expect(decodePlaintextMessage(encodePlaintextMessage(msgId, new Uint8Array(0))).msgId).toBe(
      msgId,
    )
  })
})

describe("the protocol documentation's worked handshake", () => {
  /**
   * Messages from the published example of a complete key exchange.
   *
   * Every other expectation in this file was produced by the code under test or
   * written from the same reading of the layout that produced it. These bytes
   * were produced by Telegram, so an encoder and decoder that agree with each
   * other about a wrong layout cannot satisfy them.
   */
  const messages: ReadonlyArray<[string, string, bigint, number]> = [
    [
      'req_pq_multi',
      `0000000000000000 78F4040061704 66A 14000000
       F18E7EBE 51A1143FC7A3666BE4BE54D6890A02DC`,
      0n,
      20,
    ],
    [
      'resPQ',
      `0000000000000000 01F4CCC261704 66A 50000000
       63241605 51A1143FC7A3666BE4BE54D6890A02DC
       63248F6748214EAB8A2F4CC876E11974
       082E9CDB98C80CDA4B000000
       15C4B51C 03000000
       85FD64DE851D9DD0 A5B7F709355FC30B 216BE86C022BB4C3`,
      1n,
      80,
    ],
    [
      'dh_gen_ok',
      `0000000000000000 01A44AEF62704 66A 34000000
       34F7CB3B 51A1143FC7A3666BE4BE54D6890A02DC
       63248F6748214EAB8A2F4CC876E11974
       AA404B58DF404D8F363772B14CE5A56F`,
      1n,
      52,
    ],
  ]

  for (const [name, dump, parity, bodySize] of messages) {
    it(`reads the envelope around ${name}`, () => {
      const bytes = Uint8Array.from(Buffer.from(dump.replace(/\s+/g, ''), 'hex'))
      const decoded = decodePlaintextMessage(bytes)

      expect(decoded.msgId % 4n).toBe(parity)
      expect(decoded.body).toHaveLength(bodySize)
      expect(decoded.msgId >> 32n).toBe(0x6a46_7061n + (name === 'dh_gen_ok' ? 1n : 0n))
    })

    it(`rebuilds the envelope around ${name} byte for byte`, () => {
      const bytes = Uint8Array.from(Buffer.from(dump.replace(/\s+/g, ''), 'hex'))
      const { msgId, body } = decodePlaintextMessage(bytes)

      expect(hex(encodePlaintextMessage(msgId, body))).toBe(hex(bytes))
    })
  }
})
