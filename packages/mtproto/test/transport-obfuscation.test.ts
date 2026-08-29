/**
 * Stream obfuscation.
 *
 * The strongest check available offline is the other end of the connection.
 * These tests build a peer from the init packet the way a server would —
 * deriving its keys from the packet's plaintext prefix, by its own slicing —
 * and exchange traffic in both directions. Two independently derived key
 * schedules agreeing on every byte is evidence the construction is right,
 * where an encrypt-then-decrypt round trip through one object would not be.
 *
 * The init packet's constraints are checked by driving the draw with controlled
 * bytes, so each rejection rule is exercised on its own.
 */

import { createCipheriv } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  AbridgedFraming,
  IntermediateFraming,
  PaddedIntermediateFraming,
  TransportError,
} from '../src/transport/framing.js'
import { createObfuscation } from '../src/transport/obfuscation.js'

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A deterministic, non-repeating source that satisfies the packet rules. */
function scripted(seed: number): (length: number) => Uint8Array {
  let draw = 0
  return (length) => {
    const value = draw
    draw += 1
    return Uint8Array.from({ length }, (_, index) => (seed + value * 31 + index * 17 + 1) & 0xff)
  }
}

/**
 * The far end of the connection, built from the init packet alone.
 *
 * A server sees bytes 0..56 in the clear and derives both keys from them. Its
 * decrypt key is the client's encrypt key and vice versa, so this is the same
 * schedule computed from the other side — written out here rather than taken
 * from the implementation.
 */
function peer(init: Uint8Array, plaintextPrefix: Uint8Array) {
  const forward = plaintextPrefix.slice(8, 56)
  const backward = plaintextPrefix.slice(8, 56).reverse()

  // What the client encrypts with, the peer decrypts with.
  const decryptor = createCipheriv('aes-256-ctr', forward.slice(0, 32), forward.slice(32, 48))
  const encryptor = createCipheriv('aes-256-ctr', backward.slice(0, 32), backward.slice(32, 48))

  // The client advanced its send counter over the 64-byte init packet, so the
  // peer advances its receive counter over the same bytes.
  const revealed = new Uint8Array(decryptor.update(init))

  return {
    /** The framing tag the peer recovers from the packet. */
    tag: revealed.subarray(56, 60),
    receive: (data: Uint8Array) => new Uint8Array(decryptor.update(data)),
    send: (data: Uint8Array) => new Uint8Array(encryptor.update(data)),
  }
}

describe('the init packet', () => {
  it('is 64 bytes', () => {
    expect(createObfuscation(new IntermediateFraming(), { random: scripted(1) }).init).toHaveLength(
      64,
    )
  })

  it('carries the framing tag at offset 56', () => {
    const random = scripted(1)
    const plaintext = scripted(1)(64)
    const { init } = createObfuscation(new IntermediateFraming(), { random })

    expect(hex(peer(init, plaintext).tag)).toBe('eeeeeeee')
  })

  it('repeats a one-byte tag to fill the field', () => {
    // Abridged announces itself with a single 0xef, but the packet field is
    // four bytes wide.
    const plaintext = scripted(2)(64)
    const { init } = createObfuscation(new AbridgedFraming(), { random: scripted(2) })

    expect(hex(peer(init, plaintext).tag)).toBe('efefefef')
  })

  it('carries the padded-intermediate tag', () => {
    const plaintext = scripted(3)(64)
    const framing = new PaddedIntermediateFraming(scripted(9))
    const { init } = createObfuscation(framing, { random: scripted(3) })

    expect(hex(peer(init, plaintext).tag)).toBe('dddddddd')
  })

  it('leaves the first 56 bytes readable and encrypts only the tail', () => {
    const plaintext = scripted(4)(64)
    const { init } = createObfuscation(new IntermediateFraming(), { random: scripted(4) })

    // The prefix is the draw untouched, apart from nothing — the tag and dc id
    // live past byte 56.
    expect(hex(init.subarray(0, 56))).toBe(hex(plaintext.subarray(0, 56)))
    // The tail is not the plaintext, because it was replaced by ciphertext.
    expect(hex(init.subarray(56))).not.toBe(hex(plaintext.subarray(56)))
  })

  it('writes the datacenter id as a signed 16-bit value at offset 60', () => {
    for (const dcId of [1, 2, -1, -2, 32767, -32768]) {
      const plaintext = scripted(5)(64)
      const { init } = createObfuscation(new IntermediateFraming(), { random: scripted(5), dcId })

      const revealed = new Uint8Array(
        createCipheriv('aes-256-ctr', plaintext.slice(8, 40), plaintext.slice(40, 56)).update(init),
      )

      expect(new DataView(revealed.buffer).getInt16(60, true)).toBe(dcId)
    }
  })
})

describe('the constraints on the drawn prefix', () => {
  /** A source that offers `bad` once, then a usable packet. */
  function offerThenRecover(bad: Uint8Array): (length: number) => Uint8Array {
    let first = true
    return (length) => {
      if (first && length === 64) {
        first = false
        return bad
      }
      return scripted(7)(length)
    }
  }

  function withFirstBytes(...leading: number[]): Uint8Array {
    const packet = scripted(11)(64)
    packet.set(leading, 0)
    // Keep the second word non-zero so only the leading bytes are at issue.
    if (packet[4] === 0 && packet[5] === 0 && packet[6] === 0 && packet[7] === 0) packet[4] = 1
    return packet
  }

  it('rejects a packet beginning with the abridged tag byte', () => {
    const bad = withFirstBytes(0xef)
    const { init } = createObfuscation(new IntermediateFraming(), {
      random: offerThenRecover(bad),
    })

    expect(hex(init.subarray(0, 8))).not.toBe(hex(bad.subarray(0, 8)))
  })

  it('rejects every reserved first word', () => {
    // Four HTTP verbs a server would route away, two framing tags that would
    // read as an unobfuscated connection, and one Telegram reserves.
    const reserved: ReadonlyArray<[string, number[]]> = [
      ['HEAD', [0x48, 0x45, 0x41, 0x44]],
      ['POST', [0x50, 0x4f, 0x53, 0x54]],
      ['GET ', [0x47, 0x45, 0x54, 0x20]],
      ['OPTI', [0x4f, 0x50, 0x54, 0x49]],
      ['dddddddd', [0xdd, 0xdd, 0xdd, 0xdd]],
      ['eeeeeeee', [0xee, 0xee, 0xee, 0xee]],
      ['reserved', [0x16, 0x03, 0x01, 0x02]],
    ]

    for (const [label, leading] of reserved) {
      const bad = withFirstBytes(...leading)
      const { init } = createObfuscation(new IntermediateFraming(), {
        random: offerThenRecover(bad),
      })

      expect(hex(init.subarray(0, 4)), label).not.toBe(hex(bad.subarray(0, 4)))
    }
  })

  it('rejects a packet whose second word is zero', () => {
    const bad = scripted(13)(64)
    bad.set([0, 0, 0, 0], 4)
    bad[0] = 1

    const { init } = createObfuscation(new IntermediateFraming(), {
      random: offerThenRecover(bad),
    })

    expect(hex(init.subarray(4, 8))).not.toBe('00000000')
  })

  it('gives up rather than looping when no draw is usable', () => {
    const always = () => {
      const packet = new Uint8Array(64)
      packet.set([0xee, 0xee, 0xee, 0xee], 0)
      return packet
    }

    expect(() => createObfuscation(new IntermediateFraming(), { random: always })).toThrow(
      /failed to draw a usable/,
    )
  })

  it('refuses a source that returns the wrong length', () => {
    expect(() =>
      createObfuscation(new IntermediateFraming(), { random: () => new Uint8Array(32) }),
    ).toThrow(TransportError)
  })
})

describe('the two keystreams', () => {
  it('lets a peer read everything the client sends', () => {
    const plaintext = scripted(21)(64)
    const obfuscation = createObfuscation(new IntermediateFraming(), { random: scripted(21) })
    const far = peer(obfuscation.init, plaintext)

    for (const message of [
      Uint8Array.of(1, 2, 3, 4),
      Uint8Array.from({ length: 1000 }, (_, index) => index & 0xff),
      new Uint8Array(0),
      Uint8Array.of(0xff),
    ]) {
      expect(hex(far.receive(obfuscation.encrypt(message)))).toBe(hex(message))
    }
  })

  it('lets the client read everything the peer sends', () => {
    const plaintext = scripted(22)(64)
    const obfuscation = createObfuscation(new IntermediateFraming(), { random: scripted(22) })
    const far = peer(obfuscation.init, plaintext)

    for (const message of [
      Uint8Array.of(9, 8, 7, 6, 5),
      Uint8Array.from({ length: 777 }, (_, index) => (index * 3) & 0xff),
    ]) {
      expect(hex(obfuscation.decrypt(far.send(message)))).toBe(hex(message))
    }
  })

  it('survives traffic split across arbitrary boundaries', () => {
    // CTR is a stream cipher, so the split must not matter — but only if the
    // counter advances by bytes consumed rather than by call.
    const plaintext = scripted(23)(64)
    const obfuscation = createObfuscation(new IntermediateFraming(), { random: scripted(23) })
    const far = peer(obfuscation.init, plaintext)

    const message = Uint8Array.from({ length: 300 }, (_, index) => (index * 11) & 0xff)
    const encrypted = obfuscation.encrypt(message)

    const received: number[] = []
    for (let offset = 0; offset < encrypted.length; offset += 7) {
      received.push(...far.receive(encrypted.subarray(offset, offset + 7)))
    }

    expect(hex(Uint8Array.from(received))).toBe(hex(message))
  })

  it('never produces the same keystream in both directions', () => {
    const plaintext = scripted(24)(64)
    const obfuscation = createObfuscation(new IntermediateFraming(), { random: scripted(24) })
    const far = peer(obfuscation.init, plaintext)

    const probe = new Uint8Array(64)

    expect(hex(obfuscation.encrypt(probe))).not.toBe(hex(far.send(probe)))
  })

  it('changes both keystreams when a proxy secret is supplied', () => {
    const withoutSecret = createObfuscation(new IntermediateFraming(), { random: scripted(25) })
    const withSecret = createObfuscation(new IntermediateFraming(), {
      random: scripted(25),
      secret: new Uint8Array(16).fill(0xab),
    })

    const probe = new Uint8Array(32)

    // Same drawn packet, so the prefix matches; the keys do not.
    expect(hex(withoutSecret.init.subarray(0, 56))).toBe(hex(withSecret.init.subarray(0, 56)))
    expect(hex(withoutSecret.encrypt(probe))).not.toBe(hex(withSecret.encrypt(probe)))
  })
})

describe('an obfuscated connection end to end', () => {
  it('carries framed payloads through the cipher intact', () => {
    // The layer the transport actually presents: frames in, obfuscated bytes
    // out, and the peer recovering exactly the frames that went in.
    const plaintext = scripted(31)(64)
    const framing = new IntermediateFraming()
    const obfuscation = createObfuscation(framing, { random: scripted(31) })
    const far = peer(obfuscation.init, plaintext)

    const payloads = [
      Uint8Array.of(1, 2, 3, 4),
      Uint8Array.from({ length: 200 }, (_, index) => index & 0xff),
    ]

    const wire = payloads.map((value) => obfuscation.encrypt(framing.encode(value)))
    const recovered = wire.map((chunk) => far.receive(chunk))

    for (let index = 0; index < payloads.length; index += 1) {
      const frame = recovered[index] ?? new Uint8Array(0)
      const length = new DataView(frame.buffer, frame.byteOffset).getUint32(0, true)

      expect(length).toBe(payloads[index]?.length)
      expect(hex(frame.subarray(4))).toBe(hex(payloads[index] ?? new Uint8Array(0)))
    }
  })
})
