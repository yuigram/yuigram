// SPDX-License-Identifier: MIT

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

import { YuigramError } from '@yuigram/core'
import { readObject, TlReader, type TlScope, type TlValue } from '../tl/index.js'
import { gunzip } from './gunzip.js'
import { startsWithVector, type UnreadVector } from './vector-result.js'

/** `gzip_packed#3072cfa1 packed_data:bytes = Object` */
const GZIP_PACKED_ID = 0x3072_cfa1
/** `msg_container#73f1f8dc messages:vector<%Message> = MessageContainer` */
const MSG_CONTAINER_ID = 0x73f1_f8dc
/** `rpc_result#f35c6d01 req_msg_id:long result:Object = RpcResult` */
const RPC_RESULT_ID = 0xf35c_6d01

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

/** What one decrypted message body carries. */
export interface Envelope {
  /** The messages, each under the identifier it was sent with. */
  readonly messages: InboundMessage[]
  /**
   * Whether they arrived in a container.
   *
   * The envelope's identifier is then the container's own, which none of the
   * messages carries, so whoever checks identifiers has one more to check.
   */
  readonly container: boolean
}

/**
 * Flatten one decrypted message body into the messages it carries.
 *
 * The envelope's identifier and sequence number apply to the outermost value.
 * A container's elements each carry their own and replace it, which is why an
 * acknowledgement names an element rather than the container that delivered it.
 */
export function unpackEnvelope(
  body: Uint8Array,
  scope: TlScope,
  msgId: bigint,
  seqNo: number,
): Envelope {
  const out: InboundMessage[] = []
  const container = unpack(body, scope, msgId, seqNo, 0, false, out)

  return { messages: out, container }
}

/** The messages one decrypted message body carries; `unpackEnvelope` without the shape. */
export function unpackMessages(
  body: Uint8Array,
  scope: TlScope,
  msgId: bigint,
  seqNo: number,
): InboundMessage[] {
  return unpackEnvelope(body, scope, msgId, seqNo).messages
}

/** Flatten one value into `out`, returning whether it was a container. */
function unpack(
  body: Uint8Array,
  scope: TlScope,
  msgId: bigint,
  seqNo: number,
  depth: number,
  nested: boolean,
  out: InboundMessage[],
): boolean {
  if (depth > MAX_DEPTH) {
    throw new InboundError(`message nests deeper than ${MAX_DEPTH}`)
  }
  if (body.length < 4) {
    throw new InboundError(`a message body of ${body.length} bytes carries no constructor`)
  }

  const id = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true)

  if (id === GZIP_PACKED_ID) {
    return unpack(inflate(body, scope), scope, msgId, seqNo, depth + 1, nested, out)
  }

  if (id === MSG_CONTAINER_ID) {
    // The protocol allows exactly one level. A container carrying another is
    // refused for what it is rather than counted toward a depth, because there
    // is no legitimate message of that shape to distinguish it from.
    if (nested) {
      throw new InboundError('a container cannot carry another container')
    }

    unpackContainer(body, scope, msgId, depth, out)
    return true
  }

  out.push({ msgId, seqNo, value: readMessage(body, scope) })
  return false
}

/**
 * Read one message, leaving a vector result unread.
 *
 * `rpc_result` is the one message whose result may be a vector, and a vector
 * cannot be read without knowing what it holds (`vector-result.ts` says why).
 * The result is the last field, so it is the rest of the body, kept as it is.
 */
function readMessage(body: Uint8Array, scope: TlScope): TlValue {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  if (
    body.length >= 16 &&
    view.getUint32(0, true) === RPC_RESULT_ID &&
    startsWithVector(body, 12)
  ) {
    const result: UnreadVector = { _: 'vector', raw: body.slice(12) }

    return { _: 'rpc_result', req_msg_id: view.getBigInt64(4, true), result }
  }

  return readObject(body, scope)
}

/**
 * Read a container's elements.
 *
 * The elements are bare: no constructor identifier precedes them, so the layout
 * is read directly rather than through the codec. Each declares its own length,
 * and that length is checked against what remains before it is used — a
 * container is the one place where the sender chooses how a buffer is divided.
 *
 * A container is made after everything in it, so the protocol has each element's
 * identifier lower than the container's own. An element that is not was not put
 * there that way, and the container is refused whole — the only way the
 * protocol lets one be refused.
 */
function unpackContainer(
  body: Uint8Array,
  scope: TlScope,
  containerMsgId: bigint,
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

    // Compared unsigned: an identifier is a time in its high half, and from 2038
    // that half no longer fits a signed reading.
    if (BigInt.asUintN(64, elementMsgId) >= BigInt.asUintN(64, containerMsgId)) {
      throw new InboundError('a container element is not older than the container that carries it')
    }

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
    return gunzip(packed, MAX_INFLATED)
  } catch (error) {
    throw new InboundError(`a compressed payload could not be read: ${describe(error)}`)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
