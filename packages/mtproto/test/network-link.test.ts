/**
 * Moving whole messages over a stream that carries none.
 *
 * TCP splits wherever it likes, so the cases here drive the same exchanges at
 * every fragmentation the stream could produce — a byte at a time, several
 * frames in one chunk, and a boundary in the middle of a length prefix. A link
 * that only works on whole frames works in a test and desynchronises on a
 * connection.
 *
 * The peer is the package's own decoder read in the opposite direction: what
 * the link writes is decoded with the framing the far end would use, rather
 * than compared against what the link itself produced.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Link } from '../src/network/link.js'
import {
  AbridgedFraming,
  FrameBuffer,
  FullFraming,
  IntermediateFraming,
  PaddedIntermediateFraming,
} from '../src/transport/framing.js'
import { createObfuscation } from '../src/transport/obfuscation.js'

/** Randomness a case can predict. */
function scripted(seed: number): (length: number) => Uint8Array {
  let draw = 0
  return (length) => {
    const value = draw
    draw += 1
    return Uint8Array.from(
      { length },
      (_, index) => (seed * 13 + value * 31 + index * 17 + 1) & 0xff,
    )
  }
}

/** A link with everything it wrote and everything it reported. */
function link(options: { obfuscated?: boolean; framing?: ConstructorParameters<never> } = {}) {
  const framing = new IntermediateFraming()
  const obfuscation =
    options.obfuscated === true ? createObfuscation(framing, { random: scripted(3) }) : undefined

  const wire: Uint8Array[] = []
  const payloads: Uint8Array[] = []
  const errors: number[] = []

  const subject = new Link({
    framing,
    ...(obfuscation === undefined ? {} : { obfuscation }),
    write: (bytes) => wire.push(bytes),
    onPayload: (payload) => payloads.push(payload),
    onTransportError: (code) => errors.push(code),
  })

  return { subject, framing, obfuscation, wire, payloads, errors }
}

/** Everything written, as one run of bytes. */
function written(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }

  return out
}

describe('opening a connection', () => {
  it('writes the framing tag before anything else', () => {
    const { subject, framing, wire } = link()
    subject.open()

    expect(wire).toHaveLength(1)
    expect(wire[0]).toEqual(framing.tag())
  })

  it('writes the obfuscation packet in place of the tag', () => {
    const { subject, obfuscation, wire } = link({ obfuscated: true })
    subject.open()

    // The tag travels inside the packet, so nothing about the envelope is
    // observable on the wire.
    expect(wire[0]).toEqual(obfuscation?.init)
    expect(wire[0]).toHaveLength(64)
  })

  it('leaves the wire untouched for a framing that announces nothing', () => {
    const wire: Uint8Array[] = []
    const subject = new Link({
      framing: new FullFraming(),
      write: (bytes) => wire.push(bytes),
      onPayload: () => {},
      onTransportError: () => {},
    })
    subject.open()

    expect(wire).toEqual([])
    expect(subject.state).toBe('open')
  })

  it('refuses to open twice', () => {
    const { subject } = link()
    subject.open()

    expect(() => subject.open()).toThrow(ValidationError)
  })

  it('refuses to open again once closed', () => {
    const { subject } = link()
    subject.open()
    subject.close()

    expect(() => subject.open()).toThrow(/closed cannot be opened/)
  })

  it('refuses to send or receive before it is opened', () => {
    const { subject } = link()

    expect(() => subject.send(new Uint8Array([1, 2, 3, 4]))).toThrow(/unopened/)
    expect(() => subject.receive(new Uint8Array([1]))).toThrow(/unopened/)
  })

  it('refuses to send or receive once closed', () => {
    const { subject } = link()
    subject.open()
    subject.close()

    expect(() => subject.send(new Uint8Array([1, 2, 3, 4]))).toThrow(/closed/)
    expect(() => subject.receive(new Uint8Array([1]))).toThrow(/closed/)
  })
})

describe('sending', () => {
  it('wraps a message in the envelope the far end decodes', () => {
    const { subject, framing, wire } = link()
    subject.open()
    subject.send(Uint8Array.from({ length: 12 }, (_, index) => index))

    const buffer = new FrameBuffer()
    buffer.push(written(wire.slice(1)))

    expect(framing.decode(buffer)).toEqual({
      kind: 'payload',
      bytes: Uint8Array.from({ length: 12 }, (_, index) => index),
    })
  })

  it('obfuscates everything after the opening packet', () => {
    const { subject, wire } = link({ obfuscated: true })
    const payload = Uint8Array.from({ length: 16 }, () => 0x41)
    subject.open()
    subject.send(payload)

    // The payload is recognisable in the clear and must not be on the wire.
    const body = written(wire.slice(1))
    expect(body).not.toContain(0x41)
  })

  it('produces a stream a far end reads back as the message that was sent', () => {
    const { subject, wire } = link({ obfuscated: true })
    subject.open()
    const payload = Uint8Array.from({ length: 20 }, (_, index) => index * 3)
    subject.send(payload)

    // A far end holding the same packet derives the same pair of keystreams,
    // so a fresh cipher over the same material undoes what the link wrote. It
    // must be fresh: a keystream that has already been advanced is not the one
    // the bytes were written under.
    const peer = createObfuscation(new IntermediateFraming(), { random: scripted(3) })
    expect(wire[0]).toEqual(peer.init)

    const buffer = new FrameBuffer()
    buffer.push(peer.encrypt(written(wire.slice(1))))

    expect(new IntermediateFraming().decode(buffer)).toEqual({ kind: 'payload', bytes: payload })
  })
})

describe('receiving', () => {
  /** Frame payloads the way a far end would, ready to be fed in. */
  function inbound(payloads: readonly Uint8Array[]): Uint8Array {
    const framing = new IntermediateFraming()
    return written(payloads.map((payload) => framing.encode(payload)))
  }

  it('reports a whole message that arrived whole', () => {
    const { subject, payloads } = link()
    subject.open()
    subject.receive(inbound([Uint8Array.from([1, 2, 3, 4])]))

    expect(payloads).toEqual([Uint8Array.from([1, 2, 3, 4])])
  })

  it('reports every message in a chunk that carried several', () => {
    const { subject, payloads } = link()
    subject.open()
    subject.receive(
      inbound([
        Uint8Array.from([1, 1, 1, 1]),
        Uint8Array.from([2, 2, 2, 2]),
        Uint8Array.from([3, 3, 3, 3]),
      ]),
    )

    expect(payloads).toHaveLength(3)
    expect(payloads[2]).toEqual(Uint8Array.from([3, 3, 3, 3]))
  })

  it('reassembles a message delivered one byte at a time', () => {
    const { subject, payloads } = link()
    subject.open()

    const stream = inbound([Uint8Array.from({ length: 40 }, (_, index) => index)])
    for (const byte of stream) subject.receive(Uint8Array.of(byte))

    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toHaveLength(40)
  })

  it('reassembles across a boundary inside the length prefix', () => {
    const { subject, payloads } = link()
    subject.open()

    // The prefix is four bytes; splitting inside it is the case that breaks a
    // decoder that consumes a length before it holds what the length describes.
    const stream = inbound([Uint8Array.from({ length: 8 }, () => 0xaa)])
    subject.receive(stream.subarray(0, 2))
    expect(payloads).toEqual([])
    subject.receive(stream.subarray(2))

    expect(payloads).toHaveLength(1)
  })

  it('holds an incomplete message until the rest arrives', () => {
    const { subject, payloads } = link()
    subject.open()

    const stream = inbound([Uint8Array.from({ length: 16 }, () => 7)])
    subject.receive(stream.subarray(0, stream.length - 1))
    expect(payloads).toEqual([])

    subject.receive(stream.subarray(stream.length - 1))
    expect(payloads).toHaveLength(1)
  })

  it('ignores an empty chunk', () => {
    const { subject, payloads } = link()
    subject.open()
    subject.receive(new Uint8Array(0))

    expect(payloads).toEqual([])
  })

  it('reads an obfuscated stream back across a chunk boundary', () => {
    const { subject, payloads } = link({ obfuscated: true })
    subject.open()

    // Written by a far end with its own fresh cipher over the same material.
    // A keystream must consume every byte once and in order, so a chunk split
    // in two has to decrypt to what one chunk would.
    const peer = createObfuscation(new IntermediateFraming(), { random: scripted(3) })
    const framed = new IntermediateFraming().encode(Uint8Array.from({ length: 12 }, () => 9))
    const encrypted = peer.decrypt(framed)

    subject.receive(encrypted.subarray(0, 5))
    subject.receive(encrypted.subarray(5))

    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toEqual(Uint8Array.from({ length: 12 }, () => 9))
  })
})

describe('a failure the transport reports', () => {
  it('is surfaced rather than passed on as a message', () => {
    const { subject, payloads, errors } = link()
    subject.open()

    // Four bytes carrying a negative code, framed like a payload. A layer that
    // received it would try to decrypt it.
    const framing = new IntermediateFraming()
    const body = new Uint8Array(4)
    new DataView(body.buffer).setInt32(0, -404, true)
    subject.receive(framing.encode(body))

    expect(errors).toEqual([404])
    expect(payloads).toEqual([])
  })

  it('does not stop the messages that followed it in the same chunk', () => {
    const { subject, payloads, errors } = link()
    subject.open()

    const framing = new IntermediateFraming()
    const body = new Uint8Array(4)
    new DataView(body.buffer).setInt32(0, -429, true)
    subject.receive(written([framing.encode(body), framing.encode(Uint8Array.from([5, 5, 5, 5]))]))

    expect(errors).toEqual([429])
    expect(payloads).toHaveLength(1)
  })
})

describe('closing while messages are being drained', () => {
  it('stops delivering the rest of the chunk', () => {
    const framing = new IntermediateFraming()
    const payloads: Uint8Array[] = []

    const subject: Link = new Link({
      framing,
      write: () => {},
      onPayload: (payload) => {
        payloads.push(payload)
        subject.close()
      },
      onTransportError: () => {},
    })

    subject.open()
    subject.receive(
      written([
        framing.encode(Uint8Array.from([1, 1, 1, 1])),
        framing.encode(Uint8Array.from([2, 2, 2, 2])),
      ]),
    )

    // A handler may close the link. Continuing to drain would deliver messages
    // to a connection that is gone.
    expect(payloads).toHaveLength(1)
    expect(subject.state).toBe('closed')
  })
})

describe('every framing', () => {
  const framings = [
    ['abridged', () => new AbridgedFraming()],
    ['intermediate', () => new IntermediateFraming()],
    ['padded intermediate', () => new PaddedIntermediateFraming(scripted(5))],
    ['full', () => new FullFraming()],
  ] as const

  for (const [name, build] of framings) {
    it(`carries a message over ${name}`, () => {
      const outgoing = build()
      const incoming = build()
      const payloads: Uint8Array[] = []
      const wire: Uint8Array[] = []

      const subject = new Link({
        framing: outgoing,
        write: (bytes) => wire.push(bytes),
        onPayload: (payload) => payloads.push(payload),
        onTransportError: () => {},
      })

      subject.open()
      const payload = Uint8Array.from({ length: 24 }, (_, index) => index)
      subject.send(payload)

      // Fed back in through a decoder of the same framing, a byte at a time.
      const body = written(wire.slice(outgoing.tag().length > 0 ? 1 : 0))
      const reader = new Link({
        framing: incoming,
        write: () => {},
        onPayload: (received) => payloads.push(received),
        onTransportError: () => {},
      })
      reader.open()
      for (const byte of body) reader.receive(Uint8Array.of(byte))

      expect(payloads).toHaveLength(1)
      const received = payloads[0] as Uint8Array
      // The padded framing delivers its padding: the length covers payload and
      // padding together and nothing in the envelope says where the payload
      // ends, so the message layer trims using its own header.
      expect(received.subarray(0, payload.length)).toEqual(payload)
      expect(received.length).toBeLessThanOrEqual(payload.length + 15)
    })
  }
})
