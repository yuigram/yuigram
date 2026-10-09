// SPDX-License-Identifier: MIT

/**
 * Flattening what one encrypted message carries.
 *
 * This is where a sender chooses how a buffer is divided, so the cases that
 * matter are the ones where the structure is the attack: a count that cannot
 * fit, an element that claims more than arrived, a nesting that never bottoms
 * out, and a payload that costs far more to read than to send.
 */

import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { InboundError, unpackMessages } from '../src/session/inbound.js'
import { TlScope, type TlValue, TlWriter, writeObject } from '../src/tl/index.js'

const SCOPE = new TlScope('session', [CORE, MTPROTO])

const GZIP_PACKED = 0x3072_cfa1
const MSG_CONTAINER = 0x73f1_f8dc

function body(value: TlValue): Uint8Array {
  return writeObject(value, SCOPE)
}

const PONG: TlValue = { _: 'pong', msg_id: 4n, ping_id: 1n }

/** Wrap a payload the way the server compresses a large result. */
function compressed(payload: Uint8Array): Uint8Array {
  const writer = new TlWriter(SCOPE)
  writer.uint(GZIP_PACKED)
  writer.bytes(gzipSync(payload))
  return writer.finish()
}

/** Build a container from element payloads that are already encoded. */
function container(
  elements: ReadonlyArray<{ msgId: bigint; seqNo: number; payload: Uint8Array }>,
  declaredCount = elements.length,
): Uint8Array {
  const parts: Uint8Array[] = []

  const head = new Uint8Array(8)
  const headView = new DataView(head.buffer)
  headView.setUint32(0, MSG_CONTAINER, true)
  headView.setUint32(4, declaredCount, true)
  parts.push(head)

  for (const element of elements) {
    const header = new Uint8Array(16)
    const view = new DataView(header.buffer)
    view.setBigInt64(0, element.msgId, true)
    view.setInt32(8, element.seqNo, true)
    view.setInt32(12, element.payload.length, true)
    parts.push(header, element.payload)
  }

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

describe('a plain message', () => {
  it('is one message, under the envelope identifier', () => {
    const messages = unpackMessages(body(PONG), SCOPE, 5n, 3)

    expect(messages).toHaveLength(1)
    expect(messages[0]?.msgId).toBe(5n)
    expect(messages[0]?.seqNo).toBe(3)
    expect(messages[0]?.value._).toBe('pong')
  })
})

describe('a container', () => {
  it('yields each element under its own identifier', () => {
    // The envelope's identifier belongs to the container. An acknowledgement
    // names an element, so the elements' own identifiers are what come out.
    const messages = unpackMessages(
      container([
        { msgId: 11n, seqNo: 1, payload: body(PONG) },
        { msgId: 13n, seqNo: 3, payload: body({ _: 'msgs_ack', msg_ids: [8n] }) },
      ]),
      SCOPE,
      99n,
      0,
    )

    expect(messages.map((message) => message.msgId)).toEqual([11n, 13n])
    expect(messages.map((message) => message.seqNo)).toEqual([1, 3])
    expect(messages.map((message) => message.value._)).toEqual(['pong', 'msgs_ack'])
  })

  it('carries an element that is itself compressed', () => {
    const messages = unpackMessages(
      container([{ msgId: 11n, seqNo: 1, payload: compressed(body(PONG)) }]),
      SCOPE,
      99n,
      0,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]?.value._).toBe('pong')
    expect(messages[0]?.msgId).toBe(11n)
  })

  it('refuses a container inside a container', () => {
    // The protocol allows exactly one level, so this is refused for what it is
    // rather than counted toward a depth.
    const nested = container([
      {
        msgId: 13n,
        seqNo: 1,
        payload: container([{ msgId: 15n, seqNo: 1, payload: body(PONG) }]),
      },
    ])

    expect(() => unpackMessages(nested, SCOPE, 99n, 0)).toThrow(/cannot carry another container/)
  })

  it('refuses a container reached through a compression wrapper inside one', () => {
    // Wrapping the inner container does not make it a different shape.
    const nested = container([
      {
        msgId: 13n,
        seqNo: 1,
        payload: compressed(container([{ msgId: 15n, seqNo: 1, payload: body(PONG) }])),
      },
    ])

    expect(() => unpackMessages(nested, SCOPE, 99n, 0)).toThrow(/cannot carry another container/)
  })

  it('refuses a chain of compression wrappers', () => {
    let payload = body(PONG)
    for (let index = 0; index < 6; index += 1) payload = compressed(payload)

    expect(() => unpackMessages(payload, SCOPE, 5n, 1)).toThrow(/nests deeper than/)
  })

  it('refuses a count that could not fit in what arrived', () => {
    // Four bytes decide how many headers are read. Without a bound they decide
    // how much work the receiver does.
    const claimed = container([{ msgId: 11n, seqNo: 1, payload: body(PONG) }], 0x7fff_ffff)

    expect(() => unpackMessages(claimed, SCOPE, 99n, 0)).toThrow(InboundError)
    expect(() => unpackMessages(claimed, SCOPE, 99n, 0)).toThrow(/cannot fit in/)
  })

  it('refuses an element that claims more than arrived', () => {
    const built = container([{ msgId: 11n, seqNo: 1, payload: body(PONG) }])
    new DataView(built.buffer).setInt32(20, 0x0010_0000, true)

    expect(() => unpackMessages(built, SCOPE, 99n, 0)).toThrow(/declares 1048576 bytes/)
  })

  it('refuses an element with a negative length', () => {
    const built = container([{ msgId: 11n, seqNo: 1, payload: body(PONG) }])
    new DataView(built.buffer).setInt32(20, -4, true)

    expect(() => unpackMessages(built, SCOPE, 99n, 0)).toThrow(/declares -4 bytes/)
  })

  it('reads an empty container as no messages', () => {
    expect(unpackMessages(container([]), SCOPE, 99n, 0)).toEqual([])
  })
})

describe('a compressed payload', () => {
  it('is read as though it arrived whole', () => {
    const messages = unpackMessages(compressed(body(PONG)), SCOPE, 5n, 1)

    expect(messages).toHaveLength(1)
    expect(messages[0]?.value._).toBe('pong')
    expect(messages[0]?.msgId).toBe(5n)
  })

  it('refuses one that would expand past the ceiling', () => {
    // Compression is a ratio, so without a ceiling a small message decides how
    // much memory a large one costs. Twenty megabytes of zeros compress to a
    // few kilobytes.
    const bomb = compressed(new Uint8Array(20 * 1024 * 1024))

    expect(bomb.length).toBeLessThan(64 * 1024)
    expect(() => unpackMessages(bomb, SCOPE, 5n, 1)).toThrow(InboundError)
    expect(() => unpackMessages(bomb, SCOPE, 5n, 1)).toThrow(/could not be read/)
  })

  it('refuses one that is not actually compressed', () => {
    const writer = new TlWriter(SCOPE)
    writer.uint(GZIP_PACKED)
    writer.bytes(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8))

    expect(() => unpackMessages(writer.finish(), SCOPE, 5n, 1)).toThrow(/could not be read/)
  })
})

describe('a compressed result inside rpc_result', () => {
  it('is left for the layer that knows the field is a result', () => {
    // Compression around a whole message is undone here. Compression of the
    // *result* is inside a field this layer does not interpret, so it passes
    // through and the dispatcher undoes it — through the same ceiling, so there
    // is one bound rather than two.
    const writer = new TlWriter(SCOPE)
    writer.uint(0xf35c_6d01)
    writer.long(0x1234n)
    writer.raw(compressed(body(PONG)))

    const messages = unpackMessages(writer.finish(), SCOPE, 5n, 1)
    expect(messages).toHaveLength(1)

    const value = messages[0]?.value ?? { _: '' }
    expect(value._).toBe('rpc_result')
    expect(value['req_msg_id']).toBe(0x1234n)
    expect((value['result'] as { _: string })._).toBe('gzip_packed')
  })
})

describe('a malformed body', () => {
  it('is refused when it is too short to carry a constructor', () => {
    for (const size of [0, 1, 3]) {
      expect(() => unpackMessages(new Uint8Array(size), SCOPE, 5n, 1), `${size} bytes`).toThrow(
        /carries no constructor/,
      )
    }
  })

  it('is refused when the constructor is not one this channel carries', () => {
    const unknown = new Uint8Array(4)
    new DataView(unknown.buffer).setUint32(0, 0xdead_beef, true)

    expect(() => unpackMessages(unknown, SCOPE, 5n, 1)).toThrow(/is not in the session table/)
  })
})
