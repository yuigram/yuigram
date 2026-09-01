/**
 * Turning one decrypted message into the messages it actually carries.
 *
 * A single encrypted message is not necessarily a single protocol message. The
 * server batches into containers to save round trips and compresses large
 * results, so what arrives is a small tree: a container of elements, any of
 * which may be compressed, each carrying its own identifier and sequence number
 * rather than the envelope's.
 *
 * Flattening that tree is the whole of this module. It decides nothing about
 * what the messages mean — that is the dispatcher's work — but it is the point
 * at which attacker-shaped structure becomes a list, so every bound that stops
 * the structure from being a weapon lives here.
 */

import { gunzipSync } from 'node:zlib'
import { YuigramError } from '@yuigram/core'
import { readObject, TlReader, type TlScope, type TlValue } from '../tl/index.js'

/** `gzip_packed#3072cfa1 packed_data:bytes = Object` */
const GZIP_PACKED_ID = 0x3072_cfa1
/** `msg_container#73f1f8dc messages:vector<%Message> = MessageContainer` */
const MSG_CONTAINER_ID = 0x73f1_f8dc

/**
 * Nesting this module will follow.
 *
 * A container holds elements and an element may be compressed, so a legitimate
 * message is at most a container, an element, and its compression wrapper. A
 * container inside a container is refused outright rather than counted, so this
 * bound exists for the shape the protocol does not name: a chain of compression
 * wrappers, which costs a decompression each.
 */
const MAX_DEPTH = 3

/**
 * Bytes a compressed payload may expand to.
 *
 * The same limit the transport places on a frame. Compression is a ratio, so
 * without a ceiling a small message decides how much memory a large one costs.
 */
const MAX_INFLATED = 16 * 1024 * 1024

/** Fixed part of a container element: identifier, sequence number, length. */
const ELEMENT_HEADER_SIZE = 16

/** One protocol message, with the identifier and sequence number it carries. */
export interface InboundMessage {
  /** The identifier this message was sent under. */
  readonly msgId: bigint
  /** The sequence number this message was sent under. */
  readonly seqNo: number
  /** The decoded value. */
  readonly value: TlValue
}

/** A message whose structure could not be followed. */
export class InboundError extends YuigramError {
  override readonly name = 'InboundError'
}

/**
 * Flatten one decrypted message body into the messages it carries.
 *
 * The envelope's identifier and sequence number apply to the outermost value.
 * A container's elements each carry their own and replace it, which is why an
 * acknowledgement names an element rather than the container that delivered it.
 */
export function unpackMessages(
  body: Uint8Array,
  scope: TlScope,
  msgId: bigint,
  seqNo: number,
): InboundMessage[] {
  const out: InboundMessage[] = []
  unpack(body, scope, msgId, seqNo, 0, false, out)

  return out
}

function unpack(
  body: Uint8Array,
  scope: TlScope,
  msgId: bigint,
  seqNo: number,
  depth: number,
  nested: boolean,
  out: InboundMessage[],
): void {
  if (depth > MAX_DEPTH) {
    throw new InboundError(`message nests deeper than ${MAX_DEPTH}`)
  }
  if (body.length < 4) {
    throw new InboundError(`a message body of ${body.length} bytes carries no constructor`)
  }

  const id = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true)

  if (id === GZIP_PACKED_ID) {
    unpack(inflate(body, scope), scope, msgId, seqNo, depth + 1, nested, out)
    return
  }

  if (id === MSG_CONTAINER_ID) {
    // The protocol allows exactly one level. A container carrying another is
    // refused for what it is rather than counted toward a depth, because there
    // is no legitimate message of that shape to distinguish it from.
    if (nested) {
      throw new InboundError('a container cannot carry another container')
    }

    unpackContainer(body, scope, depth, out)
    return
  }

  out.push({ msgId, seqNo, value: readObject(body, scope) })
}

/**
 * Read a container's elements.
 *
 * The elements are bare: no constructor identifier precedes them, so the layout
 * is read directly rather than through the codec. Each declares its own length,
 * and that length is checked against what remains before it is used — a
 * container is the one place where the sender chooses how a buffer is divided.
 */
function unpackContainer(
  body: Uint8Array,
  scope: TlScope,
  depth: number,
  out: InboundMessage[],
): void {
  const reader = new TlReader(body, scope)
  reader.uint()

  const count = reader.uint()
  // Every element costs at least its header, so a count beyond that bound is
  // refused before anything is allocated for it.
  if (count > reader.remaining / ELEMENT_HEADER_SIZE) {
    throw new InboundError(`a container of ${count} cannot fit in ${reader.remaining} bytes`)
  }

  for (let index = 0; index < count; index += 1) {
    const elementMsgId = reader.long()
    const elementSeqNo = reader.int()
    const length = reader.int()

    if (length < 0 || length > reader.remaining) {
      throw new InboundError(`a container element declares ${length} bytes`)
    }

    unpack(reader.raw(length), scope, elementMsgId, elementSeqNo, depth + 1, true, out)
  }
}

/**
 * Decompress a `gzip_packed` payload.
 *
 * The ceiling is enforced by the decompressor rather than checked afterwards,
 * so a payload that would exceed it costs the limit rather than the ratio.
 */
function inflate(body: Uint8Array, scope: TlScope): Uint8Array {
  const reader = new TlReader(body, scope)
  reader.uint()

  return inflatePacked(reader.bytes())
}

/**
 * Decompress the bytes a `gzip_packed` carries.
 *
 * Compression appears in two places: around a whole message, which this module
 * undoes while flattening, and inside a field, which only the layer that
 * understands that field can undo. Both go through here so that one ceiling
 * governs both — a second decompressor would be a second place for the bound to
 * be forgotten.
 */
export function inflatePacked(packed: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(gunzipSync(packed, { maxOutputLength: MAX_INFLATED }))
  } catch (error) {
    throw new InboundError(`a compressed payload could not be read: ${describe(error)}`)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
